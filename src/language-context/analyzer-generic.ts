/**
 * Generic / unknown language file context analyzer.
 *
 * Phase 43: Honest fallback analyzer for unrecognized languages.
 * Only detects file roles by naming patterns — no symbol extraction.
 */

import type {
  FileContextSummary,
  ContextEvidence,
  FileRole,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  File role detection                                                */
/* ------------------------------------------------------------------ */

const TEST_PATTERNS = [
  /\/tests?\//i,
  /test/i,
  /spec/i,
];

const CONFIG_PATTERNS = [
  /\.config\b/i,
  /\.ya?ml$/,
  /\.toml$/,
  /\.ini$/,
  /\.env$/,
  /Makefile$/,
  /Dockerfile$/,
  /docker-compose/i,
  /\.editorconfig$/,
  /\.gitignore$/,
  /\.gitattributes$/,
  /\.npmrc$/,
  /\.nvmrc$/,
  /license/i,
  /changelog/i,
];

const DOC_PATTERNS = [
  /\.md$/i,
  /\.txt$/i,
  /\.rst$/i,
  /\/docs?\//i,
  /README/i,
  /CONTRIBUTING/i,
];

const DATA_PATTERNS = [
  /\.json$/,
  /\.csv$/,
  /\.xml$/,
  /\.sql$/,
];

/** Detect the role of an unknown file by its path. */
export function detectGenericFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (DOC_PATTERNS.some((p) => p.test(normalized))) return "documentation";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (DATA_PATTERNS.some((p) => p.test(normalized))) return "data";
  if (/\/(build|dist|out|target)\//i.test(normalized)) return "build";
  if (/\/(scripts?|bin)\//i.test(normalized)) return "utility";

  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a file with unknown language and produce an honest minimal summary.
 * No symbol extraction — only file role detection by path.
 */
export function analyzeGenericFile(
  filePath: string,
  _content: string | null,
): FileContextSummary {
  const role = detectGenericFileRole(filePath);
  const evidence: ContextEvidence[] = [
    {
      kind: "file_pattern",
      description: `Role detected from file path only: ${role}. No language-specific analysis available.`,
      source: filePath,
    },
  ];

  return {
    filePath,
    language: "unknown",
    role,
    symbols: [],
    imports: [],
    exports: [],
    evidence,
    analysisDepth: "path_only",
    confidence: "low",
  };
}
