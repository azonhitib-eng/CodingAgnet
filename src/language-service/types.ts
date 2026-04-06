/**
 * Language-service / diagnostics domain types.
 *
 * Phase 40: Minimal LSP bridge and diagnostics layer.
 *
 * This is a thin, explicit language-intelligence bridge — NOT a full LSP
 * orchestration layer.  It surfaces diagnostics availability and basic
 * language-aware context for supported workspace profiles.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";

/* ------------------------------------------------------------------ */
/*  Language service identity                                          */
/* ------------------------------------------------------------------ */

/**
 * Kind of language service that could provide diagnostics for a workspace.
 *
 * Each value represents a well-known diagnostics source, not a running
 * process.  The mapping from profile to service kind is deterministic.
 */
export type LanguageServiceKind =
  | "typescript"    // tsc / tsserver
  | "javascript"    // eslint / tsc (JS-mode)
  | "python"        // pyright / mypy / ruff
  | "php"           // phpstan / psalm
  | "rust"          // rust-analyzer / cargo check
  | "go"            // gopls / go vet
  | "none";         // no known service for this profile

/** Runtime status of a language service within the current workspace. */
export type LanguageServiceStatus =
  | "available"           // service binary/command detected locally
  | "likely_available"    // evidence suggests it can run but not confirmed
  | "unavailable"         // service not found or not applicable
  | "not_configured"      // service exists but workspace lacks config
  | "unknown";            // status cannot be determined

/* ------------------------------------------------------------------ */
/*  Diagnostics                                                        */
/* ------------------------------------------------------------------ */

/** Standard diagnostic severity levels (LSP-compatible values). */
export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

/** A single diagnostic attached to a file location. */
export interface FileDiagnostic {
  /** Relative file path within the workspace. */
  readonly file: string;
  /** 1-based line number (0 if unknown). */
  readonly line: number;
  /** 1-based column (0 if unknown). */
  readonly column: number;
  /** Severity level. */
  readonly severity: DiagnosticSeverity;
  /** Human-readable message. */
  readonly message: string;
  /** Diagnostics source identifier (e.g. "tsc", "eslint", "mypy"). */
  readonly source: string;
  /** Optional rule/error code. */
  readonly code?: string;
}

/** Aggregated diagnostics summary for a workspace. */
export interface WorkspaceDiagnosticSummary {
  /** Profile that generated this summary. */
  readonly profileId: LanguageProfileId;
  /** Language service that produced (or would produce) diagnostics. */
  readonly serviceKind: LanguageServiceKind;
  /** Whether diagnostics were actually collected or only inferred. */
  readonly collected: boolean;
  /** Count by severity. */
  readonly errorCount: number;
  readonly warningCount: number;
  readonly informationCount: number;
  readonly hintCount: number;
  /** Total number of diagnostics. */
  readonly totalCount: number;
  /** Number of distinct files with diagnostics. */
  readonly filesAffected: number;
  /** Sample messages (up to 5) for quick review. */
  readonly sampleMessages: readonly string[];
  /** Underlying diagnostics (may be empty when only summary is available). */
  readonly diagnostics: readonly FileDiagnostic[];
  /** ISO-8601 timestamp when summary was generated. */
  readonly generatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Language context hints                                             */
/* ------------------------------------------------------------------ */

/**
 * A minimal context hint that describes what language-level intelligence
 * is available for a workspace, without promising full editor features.
 */
export interface LanguageContextHint {
  /** The service kind this hint is about. */
  readonly serviceKind: LanguageServiceKind;
  /** Whether type-checking / compilation diagnostics are possible. */
  readonly supportsTypeCheck: boolean;
  /** Whether linting diagnostics are possible. */
  readonly supportsLint: boolean;
  /** Whether formatting diagnostics are possible. */
  readonly supportsFormat: boolean;
  /** Whether the service could provide symbol/go-to-definition (informational only, not implemented). */
  readonly couldProvideSymbols: boolean;
  /** Human-readable explanation of what is available. */
  readonly explanation: string;
}

/* ------------------------------------------------------------------ */
/*  Availability assessment                                            */
/* ------------------------------------------------------------------ */

/** Reason a language service is or is not available. */
export type LanguageServiceUnavailableReason =
  | "no_profile"                 // no language profile selected
  | "generic_profile"            // generic-unknown profile — no service known
  | "service_binary_not_found"   // expected binary not found on PATH
  | "workspace_not_configured"   // missing config files (tsconfig, pyproject, etc.)
  | "service_not_applicable"     // profile doesn't map to any service
  | "unknown";

/**
 * Full availability assessment for a workspace's language service.
 *
 * This is the primary output of the planning layer: a deterministic,
 * honest answer to "what language intelligence is available here?"
 */
export interface LanguageServiceAvailability {
  /** Profile this assessment is based on. */
  readonly profileId: LanguageProfileId;
  /** Service kind (may be "none"). */
  readonly serviceKind: LanguageServiceKind;
  /** Runtime status. */
  readonly status: LanguageServiceStatus;
  /** When unavailable, the specific reason. */
  readonly unavailableReason: LanguageServiceUnavailableReason | null;
  /** Human-readable explanation. */
  readonly explanation: string;
  /** Evidence that justifies this mapping (file patterns, signals). */
  readonly evidence: readonly string[];
  /** Context hint describing what the service can do. */
  readonly contextHint: LanguageContextHint;
  /** ISO-8601 timestamp. */
  readonly assessedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Result summary                                                     */
/* ------------------------------------------------------------------ */

/**
 * Combined result after assessing and optionally collecting diagnostics.
 *
 * Returned by the top-level "collect diagnostics" operation.
 */
export interface LanguageServiceResultSummary {
  /** Availability assessment. */
  readonly availability: LanguageServiceAvailability;
  /** Diagnostics summary (null if collection was not attempted). */
  readonly diagnosticsSummary: WorkspaceDiagnosticSummary | null;
  /** Whether collection was attempted. */
  readonly collectionAttempted: boolean;
  /** If collection was attempted but failed, error message. */
  readonly collectionError: string | null;
}
