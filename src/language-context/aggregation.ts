/**
 * Workspace context aggregation.
 *
 * Phase 43: Aggregates file-level context into workspace and module summaries.
 * Answers: what are the important files, entrypoints, configs, test anchors, notable symbols?
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type {
  FileContextSummary,
  ModuleContextSummary,
  WorkspaceContextSummary,
  ContextEvidence,
  ContextCollectionStatus,
  ContextSummaryReason,
  FileSymbol,
} from "./types.js";
import { getProfileContextSupport } from "./profile-support.js";
import { analyzeTsJsFile } from "./analyzer-ts-js.js";
import { analyzePythonFile } from "./analyzer-python.js";
import { analyzePhpFile } from "./analyzer-php.js";
import { analyzeRustFile } from "./analyzer-rust.js";
import { analyzeGoFile } from "./analyzer-go.js";
import { analyzeGenericFile } from "./analyzer-generic.js";

/* ------------------------------------------------------------------ */
/*  File content provider                                              */
/* ------------------------------------------------------------------ */

/**
 * Dependency-injected file content provider.
 * Returns file content as string, or null if not readable.
 */
export type FileContentProvider = (filePath: string) => string | null;

/* ------------------------------------------------------------------ */
/*  Profile-aware file analysis dispatch                               */
/* ------------------------------------------------------------------ */

/** File extension patterns for each language. */
const TS_JS_EXTENSIONS = /\.[tj]sx?$/;
const PYTHON_EXTENSIONS = /\.py$/;
const PHP_EXTENSIONS = /\.php$/;
const RUST_EXTENSIONS = /\.rs$/;
const GO_EXTENSIONS = /\.go$/;

/**
 * Analyze a single file using the appropriate profile-aware analyzer.
 */
export function analyzeFile(
  filePath: string,
  content: string | null,
  profileId: LanguageProfileId,
): FileContextSummary {
  // Profile-specific dispatch
  switch (profileId) {
    case "typescript-node":
    case "javascript-node":
      if (TS_JS_EXTENSIONS.test(filePath)) return analyzeTsJsFile(filePath, content);
      break;
    case "python-backend":
      if (PYTHON_EXTENSIONS.test(filePath)) return analyzePythonFile(filePath, content);
      break;
    case "php-general":
      if (PHP_EXTENSIONS.test(filePath)) return analyzePhpFile(filePath, content, false);
      break;
    case "php-wordpress":
      if (PHP_EXTENSIONS.test(filePath)) return analyzePhpFile(filePath, content, true);
      break;
    case "rust-cli":
      if (RUST_EXTENSIONS.test(filePath)) return analyzeRustFile(filePath, content);
      break;
    case "go-module":
      if (GO_EXTENSIONS.test(filePath)) return analyzeGoFile(filePath, content);
      break;
    default:
      break;
  }

  // Fall back by extension regardless of profile
  if (TS_JS_EXTENSIONS.test(filePath)) return analyzeTsJsFile(filePath, content);
  if (PYTHON_EXTENSIONS.test(filePath)) return analyzePythonFile(filePath, content);
  if (PHP_EXTENSIONS.test(filePath)) return analyzePhpFile(filePath, content, profileId === "php-wordpress");
  if (RUST_EXTENSIONS.test(filePath)) return analyzeRustFile(filePath, content);
  if (GO_EXTENSIONS.test(filePath)) return analyzeGoFile(filePath, content);

  return analyzeGenericFile(filePath, content);
}

/* ------------------------------------------------------------------ */
/*  Module aggregation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Aggregate file-level summaries into module-level summaries.
 * A "module" is a directory containing analyzed files.
 */
export function aggregateModules(
  fileSummaries: readonly FileContextSummary[],
): ModuleContextSummary[] {
  const moduleMap = new Map<string, FileContextSummary[]>();

  for (const summary of fileSummaries) {
    const parts = summary.filePath.replace(/\\/g, "/").split("/");
    const modulePath = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    const list = moduleMap.get(modulePath) ?? [];
    list.push(summary);
    moduleMap.set(modulePath, list);
  }

  const modules: ModuleContextSummary[] = [];
  for (const [modulePath, files] of moduleMap) {
    const notableExports: FileSymbol[] = [];
    const entrypoints: string[] = [];
    const testFiles: string[] = [];
    const configFiles: string[] = [];
    const evidence: ContextEvidence[] = [];

    for (const f of files) {
      // Collect notable exported symbols
      for (const sym of f.symbols) {
        if (sym.exported) {
          notableExports.push(sym);
        }
      }
      if (f.role === "entrypoint") entrypoints.push(f.filePath);
      if (f.role === "test") testFiles.push(f.filePath);
      if (f.role === "config") configFiles.push(f.filePath);
    }

    if (entrypoints.length > 0) {
      evidence.push({
        kind: "directory_structure",
        description: `Module contains ${entrypoints.length} entrypoint(s)`,
        source: modulePath,
      });
    }

    const hasContent = files.some((f) => f.analysisDepth === "content");
    modules.push({
      modulePath,
      fileCount: files.length,
      notableExports,
      entrypoints,
      testFiles,
      configFiles,
      evidence,
      confidence: hasContent ? "medium" : "low",
    });
  }

  // Sort by file count descending (most important modules first)
  modules.sort((a, b) => b.fileCount - a.fileCount);

  return modules;
}

/* ------------------------------------------------------------------ */
/*  Workspace context collection                                       */
/* ------------------------------------------------------------------ */

/** Options for workspace context collection. */
export interface WorkspaceContextOptions {
  /** Workspace root path. */
  readonly workspacePath: string;
  /** Active language profile. */
  readonly profileId: LanguageProfileId;
  /** File inventory (relative paths). */
  readonly files: readonly string[];
  /** File content provider (DI). Returns null if file is not readable. */
  readonly getFileContent: FileContentProvider;
  /** Why this context is being collected. */
  readonly reason: ContextSummaryReason;
  /** Maximum number of files to analyze with content (default: 50). */
  readonly maxContentAnalysis?: number;
}

/**
 * Collect workspace context summary.
 *
 * Analyzes files in the workspace using the appropriate profile-aware analyzer.
 * Aggregates into module and workspace summaries.
 */
export function collectWorkspaceContext(
  options: WorkspaceContextOptions,
): WorkspaceContextSummary {
  const {
    workspacePath,
    profileId,
    files,
    getFileContent,
    reason,
    maxContentAnalysis = 50,
  } = options;

  const profileSupport = getProfileContextSupport(profileId);
  const evidence: ContextEvidence[] = [];
  const notes: string[] = [];

  // Prioritize important files for content analysis
  const prioritized = prioritizeFiles(files, profileId);
  const contentLimit = Math.min(maxContentAnalysis, prioritized.length);

  const fileSummaries: FileContextSummary[] = [];
  let filesWithContent = 0;

  for (let i = 0; i < prioritized.length; i++) {
    const filePath = prioritized[i];
    const content = i < contentLimit ? getFileContent(filePath) : null;
    if (content !== null) filesWithContent++;
    const summary = analyzeFile(filePath, content, profileId);
    fileSummaries.push(summary);
  }

  // Aggregate modules
  const modules = aggregateModules(fileSummaries);

  // Collect workspace-level aggregations
  const entrypoints = fileSummaries
    .filter((f) => f.role === "entrypoint")
    .map((f) => f.filePath);
  const configFiles = fileSummaries
    .filter((f) => f.role === "config")
    .map((f) => f.filePath);
  const testFiles = fileSummaries
    .filter((f) => f.role === "test")
    .map((f) => f.filePath);

  // Collect notable symbols (exported, high/medium confidence)
  const notableSymbols: FileSymbol[] = [];
  for (const f of fileSummaries) {
    for (const sym of f.symbols) {
      if (sym.exported && (sym.confidence === "high" || sym.confidence === "medium")) {
        notableSymbols.push(sym);
      }
    }
  }
  // Limit notable symbols to most important
  const topSymbols = notableSymbols.slice(0, 100);

  // Evidence
  evidence.push({
    kind: "profile_hint",
    description: `Analysis used profile: ${profileId}`,
    source: workspacePath,
  });

  if (files.length > contentLimit) {
    notes.push(
      `Analyzed ${contentLimit} of ${files.length} files with content. Remaining files analyzed by path only.`,
    );
    evidence.push({
      kind: "file_pattern",
      description: `Content analysis limited to ${contentLimit} prioritized files out of ${files.length} total`,
      source: workspacePath,
    });
  }

  if (!profileSupport.symbolExtraction) {
    notes.push("No language-specific symbol extraction available for this profile.");
  }

  // Determine collection status
  let collectionStatus: ContextCollectionStatus = "completed";
  if (filesWithContent < files.length && files.length > contentLimit) {
    collectionStatus = "partial";
  }

  // Overall confidence
  const confidence =
    filesWithContent > 0 && fileSummaries.some((f) => f.symbols.length > 0)
      ? "medium"
      : "low";

  return {
    workspacePath,
    profileId,
    generatedAt: new Date().toISOString(),
    collectionStatus,
    reason,
    totalFilesAnalyzed: fileSummaries.length,
    filesWithContentAnalysis: filesWithContent,
    entrypoints,
    configFiles,
    testFiles,
    notableSymbols: topSymbols,
    modules,
    fileSummaries,
    profileSupport,
    evidence,
    notes,
    confidence,
  };
}

/* ------------------------------------------------------------------ */
/*  File prioritization                                                */
/* ------------------------------------------------------------------ */

/** File priority weight — lower is higher priority. */
function filePriorityWeight(filePath: string, profileId: LanguageProfileId): number {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  // Entrypoints and config first
  if (/(?:^|\/)(?:index|main|app|server)\.[^/]+$/.test(normalized)) return 1;
  if (/(?:^|\/)(?:package\.json|cargo\.toml|go\.mod|setup\.py|pyproject\.toml|composer\.json)$/.test(normalized)) return 2;
  if (/(?:^|\/)(?:tsconfig|webpack|vite|rollup|jest|vitest)/.test(normalized)) return 3;
  if (/(?:^|\/)(?:src\/lib|src\/index|lib\.rs|__init__\.py)/.test(normalized)) return 4;

  // Profile-relevant extensions
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const profileExtMap: Record<string, string[]> = {
    "typescript-node": ["ts", "tsx"],
    "javascript-node": ["js", "jsx", "mjs", "cjs"],
    "python-backend": ["py"],
    "php-general": ["php"],
    "php-wordpress": ["php"],
    "rust-cli": ["rs"],
    "go-module": ["go"],
    "generic-unknown": [],
  };
  const profileExts = profileExtMap[profileId] ?? [];
  if (profileExts.includes(ext)) return 10;

  // Tests lower priority
  if (/(?:test|spec)/.test(normalized)) return 50;

  // Everything else
  return 100;
}

/**
 * Prioritize files for analysis. Important files (entrypoints, config, profile-relevant)
 * come first. Returns a new array sorted by priority.
 */
export function prioritizeFiles(
  files: readonly string[],
  profileId: LanguageProfileId,
): string[] {
  return [...files].sort(
    (a, b) => filePriorityWeight(a, profileId) - filePriorityWeight(b, profileId),
  );
}
