/**
 * Agent run module — barrel exports.
 *
 * Phase 45: Minimal agent execution and task dispatch layer.
 * Phase 46: Model-backed execution adapter boundary.
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

/* adapter config (Phase 46) */
export type {
  AdapterAvailability,
  AdapterKind,
  OpenAIAdapterConfig,
  AdapterStatus,
  AdapterConfigError,
  AdapterResolutionResult,
} from "./adapter-config.js";

export {
  ADAPTER_AVAILABILITY_LABELS,
  ALL_ADAPTER_KINDS,
  ADAPTER_KIND_LABELS,
  validateOpenAIConfig,
  buildAdapterStatus,
  inspectAdapterStatus,
} from "./adapter-config.js";

/* openai adapter (Phase 46) */
export type {
  FetchFn,
} from "./openai-adapter.js";

export {
  OpenAIExecutionAdapter,
  checkOpenAIAvailability,
} from "./openai-adapter.js";

/* adapter manager (Phase 46) */
export type {
  ResolveAdapterOptions,
} from "./adapter-manager.js";

export {
  EchoTestAdapter,
  resolveAdapter,
  refreshAdapterStatus,
} from "./adapter-manager.js";

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
  agentAdapterResolved,
  agentAdapterStatusRefreshed,
  isAgentRunEvent,
  filterAgentRunEvents,
  buildAgentRunSessionSummary,
  agentRunResultToEvents,
} from "./session-integration.js";
