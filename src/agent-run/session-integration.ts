/**
 * Agent run ↔ Session integration.
 *
 * Phase 45: Session events, event kinds, and summary builders for
 * the agent execution / task dispatch layer.
 * Phase 46: Extended with adapter metadata in events and summaries.
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { AgentRunResult, AgentRunSummary } from "./types.js";
import { buildAgentRunSummary } from "./types.js";
import type { AdapterStatus } from "./adapter-config.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                        */
/* ------------------------------------------------------------------ */

/** Event kinds emitted by the agent run layer. */
export type AgentRunEventKind =
  | "agent_run_requested"
  | "agent_run_started"
  | "agent_run_completed"
  | "agent_run_failed"
  | "agent_adapter_resolved"
  | "agent_adapter_status_refreshed";

/** All agent run event kinds. */
export const AGENT_RUN_EVENT_KINDS: readonly AgentRunEventKind[] = [
  "agent_run_requested",
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
  "agent_adapter_resolved",
  "agent_adapter_status_refreshed",
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

/** Create an "agent adapter resolved" event. */
export function agentAdapterResolved(
  status: AdapterStatus,
): SessionEvent {
  return createEvent(
    "agent_adapter_resolved",
    `Execution adapter resolved: ${status.kind} — ${status.availabilityMessage}`,
    {
      adapterKind: status.kind,
      isModelBacked: status.isModelBacked,
      availability: status.availability,
      modelName: status.modelName,
      label: status.label,
    },
  );
}

/** Create an "agent adapter status refreshed" event. */
export function agentAdapterStatusRefreshed(
  status: AdapterStatus,
): SessionEvent {
  return createEvent(
    "agent_adapter_status_refreshed",
    `Adapter status refreshed: ${status.kind} — ${status.availabilityMessage}`,
    {
      adapterKind: status.kind,
      isModelBacked: status.isModelBacked,
      availability: status.availability,
      modelName: status.modelName,
      lastCheckedAt: status.lastCheckedAt,
      lastError: status.lastError,
    },
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
  /** Current adapter kind (Phase 46). */
  readonly activeAdapterKind: string | null;
  /** Current adapter availability (Phase 46). */
  readonly activeAdapterAvailability: string | null;
  /** Whether the active adapter is model-backed (Phase 46). */
  readonly activeAdapterIsModelBacked: boolean | null;
  /** Active adapter model name (Phase 46). */
  readonly activeAdapterModelName: string | null;
}

/** Build agent run session summary from a result and running count. */
export function buildAgentRunSessionSummary(
  result: AgentRunResult | null,
  totalRuns: number,
  adapterStatus?: AdapterStatus | null,
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
      activeAdapterKind: adapterStatus?.kind ?? null,
      activeAdapterAvailability: adapterStatus?.availability ?? null,
      activeAdapterIsModelBacked: adapterStatus?.isModelBacked ?? null,
      activeAdapterModelName: adapterStatus?.modelName ?? null,
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
    activeAdapterKind: adapterStatus?.kind ?? summary.adapterKind ?? null,
    activeAdapterAvailability: adapterStatus?.availability ?? null,
    activeAdapterIsModelBacked: adapterStatus?.isModelBacked ?? null,
    activeAdapterModelName: adapterStatus?.modelName ?? null,
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
