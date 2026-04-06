/**
 * Agent execution / task dispatch domain types.
 *
 * Phase 45: Minimal agent execution and task dispatch layer.
 *
 * This provides explicit, bounded agent-run capability:
 * - Select an attached/eligible agent
 * - Assemble agent context
 * - Execute a bounded task request
 * - Capture and expose the result in session state
 *
 * This is NOT autonomous multi-agent orchestration.
 * This is NOT a free-form chat engine.
 * This is NOT install execution.
 * There are no hidden retries, background loops, or code modification.
 *
 * If the execution backend is stubbed/limited, this is stated explicitly.
 */

import type { AgentId, AgentKind, AgentRoleHint, AgentCapability, AgentStageAffinity } from "../agents/types.js";
import type { AgentPromptSummary } from "../agent-context/types.js";

/* ------------------------------------------------------------------ */
/*  Agent run identity                                                 */
/* ------------------------------------------------------------------ */

/** Unique identifier for an agent run. */
export type AgentRunId = string;

/* ------------------------------------------------------------------ */
/*  Task kinds                                                         */
/* ------------------------------------------------------------------ */

/**
 * Supported bounded task kinds.
 *
 * Each kind is a small, explicit, deterministic request.
 * No code modification or autonomous planning is included.
 */
export type AgentTaskKind =
  | "summarize_workspace"        // Summarize current workspace context
  | "review_diagnostics"         // Review current diagnostics/toolchain context
  | "explain_files"              // Explain relevant files/modules for this repo
  | "summarize_github"           // Summarize GitHub MCP results if available
  | "general_query"              // Bounded free-text question about the repo
  | "custom";                    // Custom bounded task (requires taskDescription)

/** All known task kinds. */
export const ALL_TASK_KINDS: readonly AgentTaskKind[] = [
  "summarize_workspace",
  "review_diagnostics",
  "explain_files",
  "summarize_github",
  "general_query",
  "custom",
] as const;

/** Human-readable labels for task kinds. */
export const TASK_KIND_LABELS: Readonly<Record<AgentTaskKind, string>> = {
  summarize_workspace: "Summarize Workspace Context",
  review_diagnostics: "Review Diagnostics & Toolchain",
  explain_files: "Explain Relevant Files & Modules",
  summarize_github: "Summarize GitHub MCP Results",
  general_query: "General Repository Query",
  custom: "Custom Task",
} as const;

/* ------------------------------------------------------------------ */
/*  Agent run status lifecycle                                         */
/* ------------------------------------------------------------------ */

/**
 * Lifecycle status of an agent run.
 *
 * Transitions:
 *   pending → selecting → context_assembling → executing → completed | failed
 *   pending → selecting → failed (no eligible agent)
 *   pending → selecting → context_assembling → failed (assembly error)
 */
export type AgentRunStatus =
  | "pending"               // Run requested, not yet started
  | "selecting"             // Selecting the target agent
  | "context_assembling"    // Assembling agent context
  | "executing"             // Task dispatched to execution adapter
  | "completed"             // Task completed successfully
  | "failed";               // Task failed at any stage

/* ------------------------------------------------------------------ */
/*  Selection reason                                                   */
/* ------------------------------------------------------------------ */

/** Why a particular agent was selected for this run. */
export interface AgentRunSelectionReason {
  /** Method of selection. */
  readonly method: "explicit_id" | "best_fit" | "only_eligible";
  /** Human-readable explanation. */
  readonly explanation: string;
  /** Agent kind of the selected agent. */
  readonly agentKind: AgentKind;
  /** Role hint used for selection (if any). */
  readonly roleHint: AgentRoleHint | null;
  /** Stage used for best-fit selection (if any). */
  readonly stage: AgentStageAffinity | null;
  /** Priority score of the selected agent. */
  readonly priority: number;
  /** How many agents were eligible. */
  readonly eligibleCount: number;
}

/* ------------------------------------------------------------------ */
/*  Agent run input                                                    */
/* ------------------------------------------------------------------ */

/**
 * Input for an agent run request.
 *
 * This is what the caller provides to request a bounded task.
 */
export interface AgentRunInput {
  /** Session to run within. */
  readonly sessionId: string;
  /** What kind of task to perform. */
  readonly taskKind: AgentTaskKind;
  /** Optional free-text description for custom or general tasks. */
  readonly taskDescription?: string;
  /** Explicit target agent ID (if null, best-fit selection is used). */
  readonly targetAgentId?: AgentId;
  /** Preferred agent kind for best-fit selection. */
  readonly preferredAgentKind?: AgentKind;
  /** Preferred role hint for best-fit selection. */
  readonly preferredRoleHint?: AgentRoleHint;
  /** Preferred stage for best-fit selection. */
  readonly preferredStage?: AgentStageAffinity;
}

/* ------------------------------------------------------------------ */
/*  Agent run request (internal, enriched)                             */
/* ------------------------------------------------------------------ */

/**
 * Fully resolved agent run request.
 *
 * Created from AgentRunInput after validation and agent selection.
 */
export interface AgentRunRequest {
  /** Unique run identifier. */
  readonly runId: AgentRunId;
  /** Session this run belongs to. */
  readonly sessionId: string;
  /** Selected agent ID. */
  readonly agentId: AgentId;
  /** Agent name (for display). */
  readonly agentName: string;
  /** Agent kind. */
  readonly agentKind: AgentKind;
  /** Task kind. */
  readonly taskKind: AgentTaskKind;
  /** Task description. */
  readonly taskDescription: string;
  /** Why this agent was selected. */
  readonly selectionReason: AgentRunSelectionReason;
  /** Context summary reference. */
  readonly contextSummary: AgentPromptSummary | null;
  /** Assembled context text (for the execution adapter). */
  readonly assembledContextText: string;
  /** ISO-8601 timestamp when the request was created. */
  readonly requestedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Agent run output                                                   */
/* ------------------------------------------------------------------ */

/**
 * Output from a completed agent run.
 */
export interface AgentRunOutput {
  /** The generated response text. */
  readonly responseText: string;
  /** Whether this response was generated by a real model backend. */
  readonly isModelGenerated: boolean;
  /** Adapter that produced the output (e.g. "stub", "local", "api"). */
  readonly adapterKind: string;
  /** Optional structured data in the response. */
  readonly structuredData?: Readonly<Record<string, unknown>>;
  /** Duration of the execution in milliseconds. */
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Agent run error                                                    */
/* ------------------------------------------------------------------ */

/**
 * Error from a failed agent run.
 */
export interface AgentRunError {
  /** Error code for programmatic handling. */
  readonly code: AgentRunErrorCode;
  /** Human-readable error message. */
  readonly message: string;
  /** Phase where the error occurred. */
  readonly phase: AgentRunStatus;
  /** Additional detail. */
  readonly detail?: string;
}

/** Known error codes for agent runs. */
export type AgentRunErrorCode =
  | "NO_ELIGIBLE_AGENT"          // No agent matched the selection criteria
  | "AGENT_NOT_FOUND"            // Explicit agent ID not found
  | "AGENT_NOT_ATTACHED"         // Agent exists but is not attached/enabled
  | "CONTEXT_ASSEMBLY_FAILED"    // Failed to assemble agent context
  | "EXECUTION_FAILED"           // Execution adapter returned an error
  | "EXECUTION_TIMEOUT"          // Execution timed out (reserved for future use)
  | "INVALID_TASK"               // Invalid task kind or description
  | "SESSION_NOT_FOUND";         // Session not found

/* ------------------------------------------------------------------ */
/*  Agent run result                                                   */
/* ------------------------------------------------------------------ */

/**
 * Full result of an agent run.
 *
 * Contains the complete lifecycle state, including selection,
 * context assembly, execution output, and error information.
 */
export interface AgentRunResult {
  /** Run identifier. */
  readonly runId: AgentRunId;
  /** Session ID. */
  readonly sessionId: string;
  /** Final status. */
  readonly status: AgentRunStatus;
  /** The resolved request (null if failed before resolution). */
  readonly request: AgentRunRequest | null;
  /** Output (null if not completed). */
  readonly output: AgentRunOutput | null;
  /** Error (null if successful). */
  readonly error: AgentRunError | null;
  /** ISO-8601 timestamp when the run started. */
  readonly startedAt: string;
  /** ISO-8601 timestamp when the run finished. */
  readonly finishedAt: string;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Agent run summary                                                  */
/* ------------------------------------------------------------------ */

/**
 * Compact summary of an agent run.
 *
 * Designed for session timeline display or quick inspection.
 */
export interface AgentRunSummary {
  /** Run identifier. */
  readonly runId: AgentRunId;
  /** Session ID. */
  readonly sessionId: string;
  /** Final status. */
  readonly status: AgentRunStatus;
  /** Agent that executed (if selected). */
  readonly agentId: AgentId | null;
  /** Agent name (if selected). */
  readonly agentName: string | null;
  /** Agent kind (if selected). */
  readonly agentKind: AgentKind | null;
  /** Task kind. */
  readonly taskKind: AgentTaskKind;
  /** Task description (may be truncated). */
  readonly taskDescription: string;
  /** Selection method. */
  readonly selectionMethod: AgentRunSelectionReason["method"] | null;
  /** Whether output is model-generated. */
  readonly isModelGenerated: boolean | null;
  /** Adapter kind that produced the output. */
  readonly adapterKind: string | null;
  /** Output preview (first 200 chars). */
  readonly outputPreview: string | null;
  /** Error code (if failed). */
  readonly errorCode: AgentRunErrorCode | null;
  /** Error message (if failed). */
  readonly errorMessage: string | null;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** ISO-8601 timestamp. */
  readonly finishedAt: string;
}

/** Build a compact summary from a full result. */
export function buildAgentRunSummary(result: AgentRunResult): AgentRunSummary {
  const outputPreview = result.output?.responseText
    ? result.output.responseText.substring(0, 200) + (result.output.responseText.length > 200 ? "…" : "")
    : null;

  return {
    runId: result.runId,
    sessionId: result.sessionId,
    status: result.status,
    agentId: result.request?.agentId ?? null,
    agentName: result.request?.agentName ?? null,
    agentKind: result.request?.agentKind ?? null,
    taskKind: result.request?.taskKind ?? "custom",
    taskDescription: result.request?.taskDescription ?? "(unknown)",
    selectionMethod: result.request?.selectionReason.method ?? null,
    isModelGenerated: result.output?.isModelGenerated ?? null,
    adapterKind: result.output?.adapterKind ?? null,
    outputPreview,
    errorCode: result.error?.code ?? null,
    errorMessage: result.error?.message ?? null,
    durationMs: result.durationMs,
    finishedAt: result.finishedAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Agent run ID generation                                            */
/* ------------------------------------------------------------------ */

let _runIdCounter = 0;

/** Generate a unique agent run ID. */
export function generateAgentRunId(): AgentRunId {
  _runIdCounter += 1;
  return `run-${Date.now()}-${_runIdCounter}`;
}

/** Reset the run ID counter (for testing). */
export function _resetRunIdCounter(): void {
  _runIdCounter = 0;
}
