/**
 * Toolchain module — barrel exports.
 *
 * Profile-aware toolchain adapter layer and workspace checks.
 * Phase 39: Toolchain adapter domain.
 */

/* types */
export type {
  ToolchainAdapterId,
  ToolchainKind,
  ToolchainCommandType,
  ToolchainCommandDefinition,
  ToolchainAvailabilityStatus,
  ToolchainAvailability,
  ToolchainCheckStatus,
  ToolchainCheckResult,
  ToolchainCheckResultSummary,
  WorkspaceToolchainSummary,
} from "./types.js";

export { ALL_COMMAND_TYPES } from "./types.js";

/* mapping */
export {
  buildAdapterId,
  mapProfileToCommands,
  resolveToolchainKind,
} from "./mapping.js";

/* check planning */
export {
  assessCommandAvailability,
  buildWorkspaceToolchainSummary,
  buildToolchainSummaryFromFingerprint,
} from "./check-planning.js";

/* execution */
export {
  executeCheck,
  executeChecks,
  buildCheckResultSummary,
} from "./execution.js";
export type { ShellRunner } from "./execution.js";

/* session integration */
export {
  TOOLCHAIN_EVENT_KINDS,
  isToolchainEvent,
  toolchainSummaryGenerated,
  toolchainCheckStarted,
  toolchainCheckCompleted,
  toolchainChecksSummaryEvents,
  filterToolchainEvents,
  buildToolchainSessionSummary,
} from "./session-integration.js";

export type {
  ToolchainEventKind,
  ToolchainSessionSummary,
} from "./session-integration.js";
