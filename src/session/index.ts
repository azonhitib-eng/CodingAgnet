/**
 * Session module — barrel exports.
 */

/* types */
export type {
  SessionId,
  Session,
  SessionStatus,
  SessionStage,
  SessionEvent,
  SessionEventKind,
  SessionRunContext,
  Workspace,
  WorkspaceSource,
  WorkspaceStatus,
  AttachedResource,
  AttachedResourceKind,
} from "./types.js";

/* events */
export {
  createEvent,
  sessionCreated,
  workspaceBound,
  hostDetected,
  catalogsLoaded,
  workflowStarted,
  stageCompleted,
  requiresApproval,
  blockedEvent,
  failedEvent,
  completedEvent,
  noteEvent,
  infoEvent,
  warningEvent,
} from "./events.js";

/* workspace */
export {
  openLocalWorkspace,
  prepareCloneWorkspace,
  markWorkspaceReady,
  markWorkspaceInvalid,
  markWorkspaceClosed,
  openGenericDirectory,
  isWorkspaceReady,
  isCloneWorkspace,
  isValidSource,
  isValidStatus,
} from "./workspace.js";

/* workflow integration */
export {
  workflowStatusToSessionStatus,
  workflowStatusToSessionStage,
  buildRunContext,
  deriveEventsFromWorkflow,
} from "./workflow-integration.js";

/* session manager */
export {
  SessionManager,
  generateSessionId,
  _resetIdCounter,
} from "./session-manager.js";

export type { SessionSummary } from "./session-manager.js";
