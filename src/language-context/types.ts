/**
 * Language context / intelligence types.
 *
 * Phase 43: Language intelligence expansion — symbol and context layer.
 *
 * Typed, explicit models for file-level and workspace-level context intelligence.
 * This is lightweight, heuristic-based symbol/context extraction — NOT a full LSP
 * or refactor engine. Confidence and evidence are always explicit.
 */

import type { LanguageProfileId, DetectedLanguage } from "../fingerprint/types.js";

/* ------------------------------------------------------------------ */
/*  Symbol kind                                                        */
/* ------------------------------------------------------------------ */

/** Kind of symbol extracted from a file. */
export type SymbolKind =
  | "function"
  | "class"
  | "constant"
  | "variable"
  | "interface"
  | "type_alias"
  | "enum"
  | "module"
  | "hook"
  | "export"
  | "import"
  | "entrypoint"
  | "unknown";

/* ------------------------------------------------------------------ */
/*  File-level symbol                                                   */
/* ------------------------------------------------------------------ */

/**
 * A symbol extracted from a file.
 *
 * Lightweight and heuristic — may not be perfectly accurate.
 * Always carries confidence metadata.
 */
export interface FileSymbol {
  /** Symbol name (e.g. "MyClass", "handleRequest", "DEFAULT_TIMEOUT"). */
  readonly name: string;
  /** Kind of symbol. */
  readonly kind: SymbolKind;
  /** Line number (1-based) where the symbol was detected, if known. */
  readonly line?: number;
  /** Whether this symbol is exported from the file. */
  readonly exported: boolean;
  /** Confidence level of extraction. */
  readonly confidence: "high" | "medium" | "low";
}

/* ------------------------------------------------------------------ */
/*  Context evidence                                                   */
/* ------------------------------------------------------------------ */

/** Why a piece of context was identified. */
export type ContextEvidenceKind =
  | "file_pattern"
  | "content_regex"
  | "package_json"
  | "config_file"
  | "directory_structure"
  | "import_analysis"
  | "export_analysis"
  | "naming_convention"
  | "profile_hint";

/** A single piece of evidence supporting a context conclusion. */
export interface ContextEvidence {
  /** What kind of evidence this is. */
  readonly kind: ContextEvidenceKind;
  /** Human-readable description. */
  readonly description: string;
  /** Source file or pattern (if applicable). */
  readonly source?: string;
}

/* ------------------------------------------------------------------ */
/*  File context summary                                               */
/* ------------------------------------------------------------------ */

/** Role hint for a file within the workspace. */
export type FileRole =
  | "entrypoint"
  | "config"
  | "test"
  | "library"
  | "component"
  | "utility"
  | "build"
  | "documentation"
  | "data"
  | "unknown";

/**
 * Context summary for a single file.
 *
 * Extracted via lightweight heuristics. Honest about what is guessed vs known.
 */
export interface FileContextSummary {
  /** Relative file path from workspace root. */
  readonly filePath: string;
  /** Detected language for this file. */
  readonly language: DetectedLanguage;
  /** Role of this file in the project. */
  readonly role: FileRole;
  /** Symbols extracted from this file (may be empty). */
  readonly symbols: readonly FileSymbol[];
  /** Import/dependency references found. */
  readonly imports: readonly string[];
  /** Export references found. */
  readonly exports: readonly string[];
  /** Evidence supporting the analysis. */
  readonly evidence: readonly ContextEvidence[];
  /** Whether the analysis was based on content or only file path/name. */
  readonly analysisDepth: "content" | "path_only";
  /** Overall confidence of this summary. */
  readonly confidence: "high" | "medium" | "low";
}

/* ------------------------------------------------------------------ */
/*  Module context summary                                             */
/* ------------------------------------------------------------------ */

/**
 * Context summary for a module/directory within the workspace.
 *
 * Groups file-level context at the module boundary.
 */
export interface ModuleContextSummary {
  /** Module path relative to workspace root. */
  readonly modulePath: string;
  /** Number of files analyzed in this module. */
  readonly fileCount: number;
  /** Notable exported symbols from this module. */
  readonly notableExports: readonly FileSymbol[];
  /** Detected entrypoint(s) within this module. */
  readonly entrypoints: readonly string[];
  /** Test files within this module. */
  readonly testFiles: readonly string[];
  /** Config files within this module. */
  readonly configFiles: readonly string[];
  /** Evidence supporting the analysis. */
  readonly evidence: readonly ContextEvidence[];
  /** Overall confidence of this summary. */
  readonly confidence: "high" | "medium" | "low";
}

/* ------------------------------------------------------------------ */
/*  Context collection status                                          */
/* ------------------------------------------------------------------ */

/** Status of the context collection process. */
export type ContextCollectionStatus =
  | "pending"
  | "collecting"
  | "completed"
  | "partial"
  | "failed";

/** Reason for context summary generation / selection. */
export type ContextSummaryReason =
  | "workspace_opened"
  | "profile_selected"
  | "manual_refresh"
  | "file_inventory_complete"
  | "partial_analysis";

/* ------------------------------------------------------------------ */
/*  Profile context support                                            */
/* ------------------------------------------------------------------ */

/**
 * Describes what level of context intelligence a profile supports.
 */
export interface ProfileContextSupport {
  /** Profile this support descriptor applies to. */
  readonly profileId: LanguageProfileId;
  /** Whether symbol extraction is supported. */
  readonly symbolExtraction: boolean;
  /** Whether import/export analysis is supported. */
  readonly importExportAnalysis: boolean;
  /** Whether entrypoint detection is supported. */
  readonly entrypointDetection: boolean;
  /** Whether test file detection is supported. */
  readonly testDetection: boolean;
  /** Whether config relationship detection is supported. */
  readonly configDetection: boolean;
  /** Whether framework structure detection is supported. */
  readonly frameworkHints: boolean;
  /** Known limitations of context support for this profile. */
  readonly limitations: readonly string[];
}

/* ------------------------------------------------------------------ */
/*  Workspace context summary                                          */
/* ------------------------------------------------------------------ */

/**
 * Top-level workspace context summary.
 *
 * Aggregates file and module context for the entire workspace.
 * Always honest about heuristic limitations.
 */
export interface WorkspaceContextSummary {
  /** Workspace root path. */
  readonly workspacePath: string;
  /** Profile used for analysis. */
  readonly profileId: LanguageProfileId;
  /** When this context was generated (ISO-8601). */
  readonly generatedAt: string;
  /** Status of the collection process. */
  readonly collectionStatus: ContextCollectionStatus;
  /** Why this context was generated. */
  readonly reason: ContextSummaryReason;
  /** Total files analyzed. */
  readonly totalFilesAnalyzed: number;
  /** Files that were analyzed with content (not just path). */
  readonly filesWithContentAnalysis: number;
  /** Notable entrypoints in the workspace. */
  readonly entrypoints: readonly string[];
  /** Notable config files in the workspace. */
  readonly configFiles: readonly string[];
  /** Notable test anchors in the workspace. */
  readonly testFiles: readonly string[];
  /** Notable exported symbols across the workspace. */
  readonly notableSymbols: readonly FileSymbol[];
  /** Module-level summaries (if available). */
  readonly modules: readonly ModuleContextSummary[];
  /** File-level summaries (may be a subset of all files). */
  readonly fileSummaries: readonly FileContextSummary[];
  /** Profile context support descriptor. */
  readonly profileSupport: ProfileContextSupport;
  /** Top-level evidence for the workspace analysis. */
  readonly evidence: readonly ContextEvidence[];
  /** Human-readable notes about the analysis. */
  readonly notes: readonly string[];
  /** Overall confidence of the workspace summary. */
  readonly confidence: "high" | "medium" | "low";
}
