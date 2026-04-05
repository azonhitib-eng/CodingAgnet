/**
 * Workflow → Session integration bridge.
 *
 * Pure functions that derive session state from workflow execution results
 * without replacing the existing workflow runner.
 */

import type { WorkflowResult, WorkflowStatus } from "../workflow/index.js";
import type {
  SessionStatus,
  SessionStage,
  SessionRunContext,
  SessionEvent,
} from "./types.js";
import {
  stageCompleted,
  requiresApproval,
  blockedEvent,
  failedEvent,
  completedEvent,
  workflowStarted,
} from "./events.js";

/* ------------------------------------------------------------------ */
/*  Status mapping                                                    */
/* ------------------------------------------------------------------ */

/**
 * Map a terminal workflow status to the corresponding session status.
 */
export function workflowStatusToSessionStatus(
  ws: WorkflowStatus,
): SessionStatus {
  switch (ws) {
    case "completed":
      return "completed";
    case "completed_requires_approval":
      return "completed_requires_approval";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "partial":
      return "active";           // partial run ⇒ session stays active
  }
}

/* ------------------------------------------------------------------ */
/*  Stage mapping                                                     */
/* ------------------------------------------------------------------ */

/**
 * Derive a session stage from a workflow status.
 */
export function workflowStatusToSessionStage(
  ws: WorkflowStatus,
): SessionStage {
  switch (ws) {
    case "completed":
    case "completed_requires_approval":
    case "blocked":
    case "failed":
      return "done";
    case "partial":
      return "workflow_running";
  }
}

/* ------------------------------------------------------------------ */
/*  Run context                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build a {@link SessionRunContext} from a completed {@link WorkflowResult}.
 */
export function buildRunContext(result: WorkflowResult): SessionRunContext {
  const lastStage =
    result.completedStages.length > 0
      ? result.completedStages[result.completedStages.length - 1].stage
      : null;
  return {
    workflowStage: lastStage,
    workflowStatus: result.status,
    workflowResultRef: result,
    approvalRequired: result.status === "completed_requires_approval",
    isBlocked: result.status === "blocked",
    lastError: result.error ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Event derivation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate session events from a workflow result.
 *
 * Returns a `workflow_started` event, one `stage_completed` event per
 * completed stage, and an appropriate terminal event.
 */
export function deriveEventsFromWorkflow(
  result: WorkflowResult,
): SessionEvent[] {
  const events: SessionEvent[] = [workflowStarted()];

  for (const cs of result.completedStages) {
    events.push(stageCompleted(cs.stage));
  }

  // Terminal event
  switch (result.status) {
    case "completed":
      events.push(completedEvent());
      break;
    case "completed_requires_approval":
      events.push(
        requiresApproval(
          "Workflow completed but requires human approval before execution",
        ),
      );
      break;
    case "blocked":
      events.push(
        blockedEvent(result.error ?? "Workflow blocked by safety evaluation"),
      );
      break;
    case "failed":
      events.push(
        failedEvent(result.error ?? "Workflow failed"),
      );
      break;
    case "partial":
      // No terminal event for partial — session stays active
      break;
  }

  return events;
}
