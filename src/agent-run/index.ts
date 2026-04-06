/**
 * Agent run module — barrel exports.
 *
 * Phase 45: Minimal agent execution and task dispatch layer.
 */

/* types */
export type {
  AgentRunId,
  AgentTaskKind,
  AgentRunStatus,
  AgentRunSelectionReason,
  AgentRunInput,
  AgentRunRequest,
  AgentRunOutput,
  AgentRunError,
  AgentRunErrorCode,
  AgentRunResult,
  AgentRunSummary,
} from "./types.js";

export {
  ALL_TASK_KINDS,
  TASK_KIND_LABELS,
  buildAgentRunSummary,
  generateAgentRunId,
  _resetRunIdCounter,
} from "./types.js";

/* selection */
export type {
  AgentSelectionCriteria,
  AgentSelectionResult,
} from "./selection.js";

export {
  selectAgent,
  getDefaultTaskDescription,
} from "./selection.js";

/* adapter */
export type {
  AgentExecutionAdapter,
} from "./adapter.js";

export {
  StubExecutionAdapter,
} from "./adapter.js";

/* dispatch */
export type {
  AgentRunDispatchDeps,
} from "./dispatch.js";

export {
  dispatchAgentTask,
  inspectAgentRun,
} from "./dispatch.js";

/* session integration */
export type {
  AgentRunEventKind,
  AgentRunSessionSummary,
} from "./session-integration.js";

export {
  AGENT_RUN_EVENT_KINDS,
  agentRunRequested,
  agentRunStarted,
  agentRunCompleted,
  agentRunFailed,
  isAgentRunEvent,
  filterAgentRunEvents,
  buildAgentRunSessionSummary,
  agentRunResultToEvents,
} from "./session-integration.js";
