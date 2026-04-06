/**
 * Session and Workspace domain types.
 *
 * First-class session/workspace model enabling the product to evolve from a
 * local workflow tool into a session-oriented local agent platform.
 */

/* ------------------------------------------------------------------ */
/*  Session                                                           */
/* ------------------------------------------------------------------ */

/** Unique identifier for a session (opaque string). */
export type SessionId = string;

/** Lifecycle status of a session. */
export type SessionStatus =
  | "active"
  | "completed"
  | "completed_requires_approval"
  | "blocked"
  | "failed"
  | "idle";

/** High-level stage of a session. */
export type SessionStage =
  | "initializing"
  | "workspace_binding"
  | "host_detection"
  | "workflow_running"
  | "review"
  | "done";

/** Core session entity. */
export interface Session {
  readonly id: SessionId;
  readonly createdAt: string;          // ISO-8601
  updatedAt: string;                   // ISO-8601
  stage: SessionStage;
  status: SessionStatus;
  workspace: Workspace | null;
  events: SessionEvent[];
  runContext: SessionRunContext | null;
  attachedResources: AttachedResource[];
}

/* ------------------------------------------------------------------ */
/*  Workspace                                                         */
/* ------------------------------------------------------------------ */

/** How the workspace was sourced. */
export type WorkspaceSource = "local_existing" | "cloned" | "generic_directory";

/** Lifecycle status of a workspace. */
export type WorkspaceStatus = "pending" | "ready" | "invalid" | "closed" | "bootstrapping";

/** Workspace model — local-first, repository-agnostic. */
export interface Workspace {
  readonly path: string;
  readonly source: WorkspaceSource;
  status: WorkspaceStatus;
  branch: string | null;
  ref: string | null;
  /** Optional clone origin, populated when source is 'cloned'. */
  cloneUrl: string | null;
  /** Repository metadata, populated during open/clone lifecycle. */
  repoMeta: RepositoryMeta | null;
}

/* ------------------------------------------------------------------ */
/*  Repository metadata                                               */
/* ------------------------------------------------------------------ */

/** Minimal repository metadata attached to a workspace. */
export interface RepositoryMeta {
  /** Whether this workspace appears to be a git repository. */
  readonly isGitRepo: boolean;
  /** Absolute path to the repository root. */
  readonly repoPath: string;
  /** Remote origin URL, if detectable. */
  readonly remoteUrl: string | null;
  /** Current branch name, if detectable. */
  readonly branch: string | null;
  /** Current HEAD ref, if detectable. */
  readonly headRef: string | null;
  /** ISO-8601 timestamp when the workspace was opened or cloned. */
  readonly openedAt: string;
  /** Readiness state of the repository. */
  readonly readiness: WorkspaceReadiness;
  /** Optional notes or warnings about workspace state. */
  readonly notes: string[];
}

/** Readiness state for workspace bootstrap. */
export type WorkspaceReadiness =
  | "ready"
  | "pending"
  | "bootstrapping"
  | "invalid"
  | "unavailable";

/* ------------------------------------------------------------------ */
/*  Events / Timeline                                                 */
/* ------------------------------------------------------------------ */

/** Typed event kinds for session timeline. */
export type SessionEventKind =
  | "session_created"
  | "workspace_bound"
  | "host_detected"
  | "catalogs_loaded"
  | "workflow_started"
  | "stage_completed"
  | "requires_approval"
  | "blocked"
  | "failed"
  | "completed"
  | "note"
  | "info"
  | "warning"
  /* MCP lifecycle events (Phase 20) */
  | "mcp_attach_requested"
  | "mcp_attached"
  | "mcp_starting"
  | "mcp_started"
  | "mcp_failed"
  | "mcp_stopped"
  | "mcp_discovered_tools"
  | "mcp_discovered_resources"
  | "mcp_discovered_prompts"
  /* MCP health/discovery events (Phase 26) */
  | "mcp_health_refreshed"
  | "mcp_health_degraded"
  | "mcp_discovery_refreshed"
  | "mcp_stale"
  /* Workspace / repository lifecycle events (Phase 21) */
  | "workspace_open_requested"
  | "workspace_opened"
  | "workspace_invalid"
  | "clone_requested"
  | "clone_started"
  | "clone_completed"
  | "clone_failed"
  | "workspace_ready"
  /* Agent lifecycle events (Phase 23) */
  | "agent_attach_requested"
  | "agent_attached"
  | "agent_detached"
  | "agent_enabled"
  | "agent_disabled"
  | "agent_failed"
  | "agent_capabilities_updated";

/** Structured session event. */
export interface SessionEvent {
  readonly kind: SessionEventKind;
  readonly timestamp: string;          // ISO-8601
  readonly message: string;
  readonly detail?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Run Context                                                       */
/* ------------------------------------------------------------------ */

/** Metadata about the current or most recent workflow run within a session. */
export interface SessionRunContext {
  /** Stage the workflow was on (or completed). */
  workflowStage: string | null;
  /** Terminal workflow status if finished. */
  workflowStatus: string | null;
  /** Opaque reference to the workflow result object. */
  workflowResultRef: unknown | null;
  /** Whether approval is currently required. */
  approvalRequired: boolean;
  /** Whether the session is currently blocked. */
  isBlocked: boolean;
  /** Optional error description from the last run. */
  lastError: string | null;
}

/* ------------------------------------------------------------------ */
/*  Attached Resources (future MCP / agent attachment)                */
/* ------------------------------------------------------------------ */

/** Type of external resource that can be attached to a session. */
export type AttachedResourceKind =
  | "mcp_server"
  | "agent"
  | "environment";

/** Placeholder reference for future MCP/agent attachment. */
export interface AttachedResource {
  readonly kind: AttachedResourceKind;
  readonly id: string;
  readonly label: string;
  ready: boolean;
}
