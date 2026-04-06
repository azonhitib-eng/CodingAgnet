/**
 * Commands module — barrel exports.
 *
 * Phase 28: Structured Command Composer / Session Input Layer.
 */

/* types */
export type {
  CommandId,
  CommandCategory,
  CommandDefinition,
  OpenWorkspacePayload,
  CloneRepositoryPayload,
  DetectHostPayload,
  AttachMcpPayload,
  RefreshMcpHealthPayload,
  RefreshMcpDiscoveryPayload,
  AttachAgentPayload,
  RunWorkflowPayload,
  SaveSessionPayload,
  RestoreSessionPayload,
  InspectToolchainPayload,
  RunWorkspaceCheckPayload,
  RefreshToolchainSummaryPayload,
  ListMcpToolsPayload,
  InspectMcpToolPayload,
  InvokeMcpToolPayload,
  AttachGitHubMcpPayload,
  InspectWorkspaceContextPayload,
  InspectFileContextPayload,
  RefreshContextSummaryPayload,
  CommandPayload,
  CommandFieldError,
  CommandValidationResult,
  CommandExecutionStatus,
  CommandExecutionResult,
  CommandSubmission,
  CommandAvailability,
} from "./types.js";

export {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
  groupByCategory,
} from "./types.js";

/* validation */
export {
  validateCommand,
  validateOpenWorkspace,
  validateCloneRepository,
  validateAttachMcp,
  validateRefreshMcpHealth,
  validateRefreshMcpDiscovery,
  validateAttachAgent,
  validateRunWorkflow,
  validateRestoreSession,
  validateRunWorkspaceCheck,
  validateInspectMcpTool,
  validateInvokeMcpTool,
  validateInspectFileContext,
} from "./validation.js";

/* availability */
export {
  getCommandAvailability,
  getAllCommandAvailability,
  getAvailableCommandIds,
} from "./availability.js";

export type { CommandContextState } from "./availability.js";

/* executor */
export { executeCommand } from "./executor.js";
export type { CommandExecutorDeps } from "./executor.js";

/* session integration */
export {
  COMMAND_EVENT_KINDS,
  commandSubmitted,
  commandCompleted,
  commandFailed,
  commandValidationFailed,
  resultToSessionEvent,
} from "./session-integration.js";
