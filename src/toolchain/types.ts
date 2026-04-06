/**
 * Toolchain adapter domain types.
 *
 * Typed, explicit models for understanding what toolchain commands and checks
 * are relevant for a repository/workspace, based on its language profile.
 *
 * Phase 39: Profile-aware toolchain adapter layer and workspace checks.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";

/* ------------------------------------------------------------------ */
/*  Toolchain identity                                                */
/* ------------------------------------------------------------------ */

/** Unique identifier for a toolchain adapter (profile-bound). */
export type ToolchainAdapterId = `${LanguageProfileId}-toolchain`;

/** Broad toolchain family. */
export type ToolchainKind =
  | "npm"
  | "pnpm"
  | "yarn"
  | "pip"
  | "poetry"
  | "composer"
  | "cargo"
  | "go"
  | "generic";

/* ------------------------------------------------------------------ */
/*  Command / check categories                                        */
/* ------------------------------------------------------------------ */

/** Categories of toolchain commands/checks. */
export type ToolchainCommandType =
  | "lint"
  | "test"
  | "build"
  | "typecheck"
  | "format"
  | "dependency_check";

/** All command types in a stable order. */
export const ALL_COMMAND_TYPES: readonly ToolchainCommandType[] = [
  "lint",
  "test",
  "build",
  "typecheck",
  "format",
  "dependency_check",
] as const;

/* ------------------------------------------------------------------ */
/*  Command definition                                                */
/* ------------------------------------------------------------------ */

/**
 * A single toolchain command/check definition.
 *
 * This describes what command could be run and what evidence supports it,
 * but does NOT imply it should run automatically.
 */
export interface ToolchainCommandDefinition {
  /** Which command type this represents. */
  readonly type: ToolchainCommandType;
  /** Human-readable label (e.g. "ESLint"). */
  readonly label: string;
  /** The shell command that would be invoked. */
  readonly command: string;
  /** Which tool this maps to (e.g. "eslint", "tsc", "cargo clippy"). */
  readonly tool: string;
  /** File/config evidence that triggered this mapping. */
  readonly evidence: readonly string[];
  /** Whether the tool binary is expected to be locally available. */
  readonly expectedLocal: boolean;
  /** How strongly recommended this check is. */
  readonly priority: "recommended" | "optional" | "informational";
}

/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/* ------------------------------------------------------------------ */

/** Availability status of a toolchain command. */
export type ToolchainAvailabilityStatus =
  | "available"
  | "likely_available"
  | "unavailable"
  | "unknown";

/**
 * Availability assessment of a single toolchain command/check.
 */
export interface ToolchainAvailability {
  /** The command this assessment is for. */
  readonly command: ToolchainCommandDefinition;
  /** Current availability status. */
  readonly status: ToolchainAvailabilityStatus;
  /** Human-readable explanation of why this status was determined. */
  readonly reason: string;
  /** Whether this check is recommended for this workspace. */
  readonly recommended: boolean;
}

/* ------------------------------------------------------------------ */
/*  Check results                                                      */
/* ------------------------------------------------------------------ */

/** Exit status of a toolchain check execution. */
export type ToolchainCheckStatus =
  | "passed"
  | "failed"
  | "error"
  | "skipped";

/**
 * Result summary from running a single toolchain check.
 */
export interface ToolchainCheckResult {
  /** The command that was executed. */
  readonly commandType: ToolchainCommandType;
  /** The label of the tool. */
  readonly label: string;
  /** The shell command that was run. */
  readonly commandRun: string;
  /** Exit status. */
  readonly status: ToolchainCheckStatus;
  /** Process exit code (null if not executed). */
  readonly exitCode: number | null;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Truncated stdout summary. */
  readonly stdoutSummary: string;
  /** Truncated stderr summary. */
  readonly stderrSummary: string;
  /** ISO-8601 timestamp of execution. */
  readonly executedAt: string;
}

/** Summary of all check results for a workspace. */
export interface ToolchainCheckResultSummary {
  /** Total checks run. */
  readonly totalRun: number;
  /** Checks that passed. */
  readonly passed: number;
  /** Checks that failed. */
  readonly failed: number;
  /** Checks that errored. */
  readonly errored: number;
  /** Checks that were skipped. */
  readonly skipped: number;
  /** Individual results. */
  readonly results: readonly ToolchainCheckResult[];
  /** ISO-8601 timestamp when the summary was built. */
  readonly completedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Workspace toolchain summary                                       */
/* ------------------------------------------------------------------ */

/**
 * Complete toolchain summary for a workspace.
 *
 * This is the main output — what checks are available, recommended,
 * unavailable, and why.
 */
export interface WorkspaceToolchainSummary {
  /** The toolchain adapter that produced this summary. */
  readonly adapterId: ToolchainAdapterId;
  /** The profile this was mapped from. */
  readonly profileId: LanguageProfileId;
  /** Broad toolchain family. */
  readonly toolchainKind: ToolchainKind;
  /** All commands that were mapped for this profile. */
  readonly commands: readonly ToolchainCommandDefinition[];
  /** Availability assessments for each command. */
  readonly availability: readonly ToolchainAvailability[];
  /** Commands that are available and recommended. */
  readonly recommended: readonly ToolchainCommandDefinition[];
  /** Commands that are available but optional. */
  readonly optional: readonly ToolchainCommandDefinition[];
  /** Commands that are unavailable (tools/config missing). */
  readonly unavailable: readonly ToolchainCommandDefinition[];
  /** Human-readable notes about the summary. */
  readonly notes: readonly string[];
  /** ISO-8601 timestamp. */
  readonly generatedAt: string;
}
