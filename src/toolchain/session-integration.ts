/**
 * Toolchain → session integration helpers.
 *
 * Event builders and summary helpers that connect toolchain checks
 * to the session event model.
 *
 * Phase 39: Profile-aware toolchain adapter layer and workspace checks.
 */

import type { SessionEvent, SessionEventKind } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type {
  WorkspaceToolchainSummary,
  ToolchainCheckResult,
  ToolchainCheckResultSummary,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                       */
/* ------------------------------------------------------------------ */

/** Session event kinds introduced by toolchain integration. */
export type ToolchainEventKind =
  | "toolchain_summary_generated"
  | "toolchain_check_started"
  | "toolchain_check_completed";

/** All toolchain event kinds as an array. */
export const TOOLCHAIN_EVENT_KINDS: readonly ToolchainEventKind[] = [
  "toolchain_summary_generated",
  "toolchain_check_started",
  "toolchain_check_completed",
];

/** Type guard for toolchain events. */
export function isToolchainEvent(kind: string): kind is ToolchainEventKind {
  return TOOLCHAIN_EVENT_KINDS.includes(kind as ToolchainEventKind);
}

/* ------------------------------------------------------------------ */
/*  Event builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create an event when a toolchain summary is generated.
 */
export function toolchainSummaryGenerated(
  summary: WorkspaceToolchainSummary,
): SessionEvent {
  return createEvent(
    "info" as SessionEventKind,
    `Toolchain summary generated for profile "${summary.profileId}": ${summary.commands.length} command(s), ${summary.recommended.length} recommended.`,
    {
      toolchainAction: "summary_generated",
      adapterId: summary.adapterId,
      profileId: summary.profileId,
      toolchainKind: summary.toolchainKind,
      commandCount: summary.commands.length,
      recommendedCount: summary.recommended.length,
      unavailableCount: summary.unavailable.length,
    },
  );
}

/**
 * Create an event when a toolchain check starts.
 */
export function toolchainCheckStarted(
  commandType: string,
  label: string,
): SessionEvent {
  return createEvent(
    "info" as SessionEventKind,
    `Toolchain check started: ${label} (${commandType})`,
    {
      toolchainAction: "check_started",
      commandType,
      label,
    },
  );
}

/**
 * Create an event when a toolchain check completes.
 */
export function toolchainCheckCompleted(
  result: ToolchainCheckResult,
): SessionEvent {
  const statusIcon =
    result.status === "passed" ? "✓" :
    result.status === "failed" ? "✗" :
    result.status === "error" ? "⚠" : "⊘";

  const kind: SessionEventKind =
    result.status === "passed" ? "note" :
    result.status === "failed" ? "warning" :
    result.status === "error" ? "failed" : "info";

  return createEvent(
    kind,
    `Toolchain check ${statusIcon} ${result.label}: ${result.status} (${result.durationMs}ms)`,
    {
      toolchainAction: "check_completed",
      commandType: result.commandType,
      label: result.label,
      commandRun: result.commandRun,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    },
  );
}

/**
 * Create events for all checks in a result summary.
 */
export function toolchainChecksSummaryEvents(
  summary: ToolchainCheckResultSummary,
): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (const result of summary.results) {
    events.push(toolchainCheckCompleted(result));
  }

  // Summary event
  const overallStatus =
    summary.failed > 0 || summary.errored > 0 ? "some checks failed" : "all checks passed";
  events.push(
    createEvent(
      summary.failed > 0 || summary.errored > 0
        ? ("warning" as SessionEventKind)
        : ("note" as SessionEventKind),
      `Toolchain checks complete: ${summary.passed}/${summary.totalRun} passed (${overallStatus}).`,
      {
        toolchainAction: "checks_summary",
        totalRun: summary.totalRun,
        passed: summary.passed,
        failed: summary.failed,
        errored: summary.errored,
        skipped: summary.skipped,
      },
    ),
  );

  return events;
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                   */
/* ------------------------------------------------------------------ */

/** Filter events to only toolchain-related events. */
export function filterToolchainEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter(
    (e) =>
      e.detail !== undefined &&
      typeof e.detail === "object" &&
      "toolchainAction" in e.detail,
  );
}

/* ------------------------------------------------------------------ */
/*  Session summary extension                                         */
/* ------------------------------------------------------------------ */

/**
 * Build a toolchain section for SessionSummary.
 */
export interface ToolchainSessionSummary {
  /** Toolchain adapter id. */
  readonly adapterId: string;
  /** Toolchain kind. */
  readonly toolchainKind: string;
  /** Total mapped commands. */
  readonly commandCount: number;
  /** Recommended check count. */
  readonly recommendedCount: number;
  /** Optional check count. */
  readonly optionalCount: number;
  /** Unavailable check count. */
  readonly unavailableCount: number;
  /** Summary notes. */
  readonly notes: readonly string[];
  /** Latest check results, if any. */
  readonly lastCheckResults?: {
    readonly totalRun: number;
    readonly passed: number;
    readonly failed: number;
    readonly errored: number;
    readonly completedAt: string;
  };
}

/**
 * Build a ToolchainSessionSummary from a workspace toolchain summary.
 */
export function buildToolchainSessionSummary(
  summary: WorkspaceToolchainSummary,
  lastResults?: ToolchainCheckResultSummary | null,
): ToolchainSessionSummary {
  return {
    adapterId: summary.adapterId,
    toolchainKind: summary.toolchainKind,
    commandCount: summary.commands.length,
    recommendedCount: summary.recommended.length,
    optionalCount: summary.optional.length,
    unavailableCount: summary.unavailable.length,
    notes: [...summary.notes],
    ...(lastResults
      ? {
          lastCheckResults: {
            totalRun: lastResults.totalRun,
            passed: lastResults.passed,
            failed: lastResults.failed,
            errored: lastResults.errored,
            completedAt: lastResults.completedAt,
          },
        }
      : {}),
  };
}
