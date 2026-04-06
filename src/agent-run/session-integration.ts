/**
 * Agent run ↔ Session integration.
 *
 * Phase 45: Session events, event kinds, and summary builders for
 * the agent execution / task dispatch layer.
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { AgentRunResult, AgentRunSummary } from "./types.js";
import { buildAgentRunSummary } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                        */
/* ------------------------------------------------------------------ */

/** Event kinds emitted by the agent run layer. */
export type AgentRunEventKind =
  | "agent_run_requested"
  | "agent_run_started"
  | "agent_run_completed"
  | "agent_run_failed";

/** All agent run event kinds. */
export const AGENT_RUN_EVENT_KINDS: readonly AgentRunEventKind[] = [
  "agent_run_requested",
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
] as const;

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

/** Create an "agent run requested" event. */
export function agentRunRequested(
  runId: string,
  taskKind: string,
  taskDescription: string,
): SessionEvent {
  return createEvent(
    "agent_run_requested",
    `Agent run requested: ${taskKind} — ${taskDescription.substring(0, 100)}`,
    { runId, taskKind, taskDescription },
  );
}

/** Create an "agent run started" event. */
export function agentRunStarted(
  runId: string,
  agentName: string,
  agentKind: string,
  selectionMethod: string,
): SessionEvent {
  return createEvent(
    "agent_run_started",
    `Agent run started: ${agentName} (${agentKind}) selected via ${selectionMethod}`,
    { runId, agentName, agentKind, selectionMethod },
  );
}

/** Create an "agent run completed" event. */
export function agentRunCompleted(
  summary: AgentRunSummary,
): SessionEvent {
  return createEvent(
    "agent_run_completed",
    `Agent run completed: ${summary.agentName ?? "unknown"} (${summary.taskKind}) — ${summary.durationMs}ms`,
    {
      runId: summary.runId,
      agentId: summary.agentId,
      agentName: summary.agentName,
      agentKind: summary.agentKind,
      taskKind: summary.taskKind,
      adapterKind: summary.adapterKind,
      isModelGenerated: summary.isModelGenerated,
      durationMs: summary.durationMs,
      outputPreview: summary.outputPreview,
    },
  );
}

/** Create an "agent run failed" event. */
export function agentRunFailed(
  runId: string,
  errorCode: string,
  errorMessage: string,
): SessionEvent {
  return createEvent(
    "agent_run_failed",
    `Agent run failed: ${errorCode} — ${errorMessage}`,
    { runId, errorCode, errorMessage },
  );
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                    */
/* ------------------------------------------------------------------ */

/** Check if an event is an agent run event. */
export function isAgentRunEvent(event: SessionEvent): boolean {
  return AGENT_RUN_EVENT_KINDS.includes(event.kind as AgentRunEventKind);
}

/** Filter events to only agent run events. */
export function filterAgentRunEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter(isAgentRunEvent);
}

/* ------------------------------------------------------------------ */
/*  Session summary contribution                                       */
/* ------------------------------------------------------------------ */

/**
 * Lightweight session summary contribution from agent runs.
 * Designed for consumption by session summary builders.
 */
export interface AgentRunSessionSummary {
  /** Whether at least one agent run has been executed. */
  readonly agentRunExecuted: boolean;
  /** Last run ID. */
  readonly lastAgentRunId: string | null;
  /** Last run status. */
  readonly lastAgentRunStatus: string | null;
  /** Last run agent kind. */
  readonly lastAgentRunAgentKind: string | null;
  /** Last run task kind. */
  readonly lastAgentRunTaskKind: string | null;
  /** Last run adapter kind. */
  readonly lastAgentRunAdapterKind: string | null;
  /** Whether last run was model-generated. */
  readonly lastAgentRunModelGenerated: boolean | null;
  /** Last run duration in ms. */
  readonly lastAgentRunDurationMs: number | null;
  /** Last run error code (if failed). */
  readonly lastAgentRunErrorCode: string | null;
  /** Total number of runs executed in this session. */
  readonly totalAgentRuns: number;
}

/** Build agent run session summary from a result and running count. */
export function buildAgentRunSessionSummary(
  result: AgentRunResult | null,
  totalRuns: number,
): AgentRunSessionSummary {
  if (!result) {
    return {
      agentRunExecuted: false,
      lastAgentRunId: null,
      lastAgentRunStatus: null,
      lastAgentRunAgentKind: null,
      lastAgentRunTaskKind: null,
      lastAgentRunAdapterKind: null,
      lastAgentRunModelGenerated: null,
      lastAgentRunDurationMs: null,
      lastAgentRunErrorCode: null,
      totalAgentRuns: totalRuns,
    };
  }

  const summary = buildAgentRunSummary(result);
  return {
    agentRunExecuted: true,
    lastAgentRunId: summary.runId,
    lastAgentRunStatus: summary.status,
    lastAgentRunAgentKind: summary.agentKind,
    lastAgentRunTaskKind: summary.taskKind,
    lastAgentRunAdapterKind: summary.adapterKind,
    lastAgentRunModelGenerated: summary.isModelGenerated,
    lastAgentRunDurationMs: summary.durationMs,
    lastAgentRunErrorCode: summary.errorCode,
    totalAgentRuns: totalRuns,
  };
}

/**
 * Generate session events for a completed agent run result.
 *
 * Returns the appropriate events based on the result status.
 */
export function agentRunResultToEvents(result: AgentRunResult): SessionEvent[] {
  const events: SessionEvent[] = [];

  // Always emit the completed or failed event
  if (result.status === "completed") {
    const summary = buildAgentRunSummary(result);
    events.push(agentRunCompleted(summary));
  } else if (result.status === "failed" && result.error) {
    events.push(agentRunFailed(result.runId, result.error.code, result.error.message));
  }

  return events;
}
