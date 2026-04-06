/**
 * Agent domain types.
 *
 * First-class attachable agent types for the session model.
 * Agents are distinct from MCP servers — an agent *may* use MCP,
 * but the domains remain separate.
 *
 * Design rules:
 * - Small, explicit types — no giant agent framework
 * - No autonomous execution or delegation
 * - No chat UI or message routing
 * - Session attachment lifecycle is separate from agent definition
 */

/* ------------------------------------------------------------------ */
/*  Identity                                                          */
/* ------------------------------------------------------------------ */

/** Unique identifier for an agent definition (opaque string). */
export type AgentId = string;

/* ------------------------------------------------------------------ */
/*  Kind                                                              */
/* ------------------------------------------------------------------ */

/**
 * Classification of an agent.
 *
 * - `system`:    built-in / platform-provided agent
 * - `coding`:    local coding / editing agent
 * - `review`:    code review agent
 * - `planning`:  planning / architecture agent
 * - `testing`:   test generation / execution agent
 * - `external`:  third-party or placeholder agent
 */
export type AgentKind =
  | "system"
  | "coding"
  | "review"
  | "planning"
  | "testing"
  | "external";

/* ------------------------------------------------------------------ */
/*  Status                                                            */
/* ------------------------------------------------------------------ */

/** Lifecycle status of an agent definition (independent of attachment). */
export type AgentStatus =
  | "registered"    // definition known, not attached anywhere
  | "available"     // ready to be attached
  | "disabled"      // explicitly disabled (not usable)
  | "failed";       // definition failed validation or init

/* ------------------------------------------------------------------ */
/*  Capability                                                        */
/* ------------------------------------------------------------------ */

/**
 * Typed capability flags an agent can declare.
 *
 * Keep deterministic and typed — no free-form strings.
 */
export type AgentCapability =
  | "planning"
  | "reviewing"
  | "testing"
  | "editing"
  | "repo_exploration"
  | "mcp_interaction"
  | "shell_assistance"
  | "session_narration";

/* ------------------------------------------------------------------ */
/*  Stage Affinity                                                    */
/* ------------------------------------------------------------------ */

/**
 * Session stages an agent is allowed or designed to participate in.
 *
 * Uses the same SessionStage type values from the session domain.
 */
export type AgentStageAffinity =
  | "initializing"
  | "workspace_binding"
  | "host_detection"
  | "workflow_running"
  | "review"
  | "done";

/* ------------------------------------------------------------------ */
/*  Agent Definition                                                  */
/* ------------------------------------------------------------------ */

/**
 * Static definition of an agent — what it is and what it can do.
 *
 * This is the "config" side, analogous to McpServerConfig.
 */
export interface AgentDefinition {
  /** Unique identifier. */
  readonly id: AgentId;
  /** Human-readable name. */
  readonly name: string;
  /** Agent classification. */
  readonly kind: AgentKind;
  /** Optional description. */
  readonly description?: string;
  /** Declared capabilities. */
  readonly capabilities: readonly AgentCapability[];
  /** Stage affinity — which session stages this agent can participate in. */
  readonly allowedStages: readonly AgentStageAffinity[];
  /** Whether this agent depends on an MCP server (by MCP server id). */
  readonly mcpDependency?: string;
  /** Optional routing metadata (Phase 27). */
  readonly routing?: AgentRoutingMeta;
}

/* ------------------------------------------------------------------ */
/*  Attachment Status                                                 */
/* ------------------------------------------------------------------ */

/** Status of an agent attachment to a session. */
export type AgentAttachmentStatus =
  | "pending"       // attach requested, not yet confirmed
  | "attached"      // successfully attached to session
  | "enabled"       // actively available in session
  | "disabled"      // explicitly disabled within session
  | "detaching"     // detach in progress
  | "detached"      // cleanly detached
  | "failed";       // attachment failed

/* ------------------------------------------------------------------ */
/*  Agent Attachment                                                  */
/* ------------------------------------------------------------------ */

/**
 * Runtime binding of an agent to a session.
 *
 * Tracks the attachment lifecycle independent of the agent definition lifecycle.
 */
export interface AgentAttachment {
  /** The agent definition id. */
  readonly agentId: AgentId;
  /** The session id this is attached to. */
  readonly sessionId: string;
  /** Current attachment status. */
  status: AgentAttachmentStatus;
  /** When attachment was requested (ISO-8601). */
  readonly attachedAt: string;
  /** When detachment completed (ISO-8601, null if still attached). */
  detachedAt: string | null;
  /** Error description if attachment failed. */
  failureReason: string | null;
  /** Reason if disabled. */
  disabledReason: string | null;
}

/* ------------------------------------------------------------------ */
/*  Role Hint                                                         */
/* ------------------------------------------------------------------ */

/**
 * High-level role hint for an agent.
 *
 * Hints which broad role the agent is best suited for.
 * A single agent may have multiple capabilities but typically
 * one dominant role.
 */
export type AgentRoleHint =
  | "planner"
  | "reviewer"
  | "tester"
  | "editor"
  | "explorer"
  | "mcp_bridge"
  | "narrator"
  | "general";

/* ------------------------------------------------------------------ */
/*  Extended Agent Definition (Phase 27)                              */
/* ------------------------------------------------------------------ */

/**
 * Optional routing metadata for an agent definition.
 *
 * Extends the base definition with routing-relevant hints.
 * All fields are optional — agents without routing metadata
 * fall back to capability-based inference.
 */
export interface AgentRoutingMeta {
  /** High-level role hint for this agent. */
  readonly roleHint?: AgentRoleHint;
  /** Preferred stages — subset of allowedStages where this agent excels. */
  readonly preferredStages?: readonly AgentStageAffinity[];
  /** Routing priority (0–100, higher = preferred). Default is 50. */
  readonly routingPriority?: number;
  /** Whether this agent participates in routing by default. */
  readonly participationEnabled?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Stage Participation (Phase 27)                                    */
/* ------------------------------------------------------------------ */

/** Why an agent was considered eligible or ineligible for a stage. */
export type ParticipationReason =
  | "allowed_stage"           // stage is in allowedStages
  | "preferred_stage"         // stage is in preferredStages
  | "capability_match"        // agent has a capability mapped to this stage
  | "not_allowed"             // stage is not in allowedStages
  | "disabled"                // attachment is disabled
  | "unavailable"             // attachment status is not active
  | "failed"                  // attachment failed
  | "detached"                // agent is detached
  | "participation_disabled"; // routing participation explicitly disabled

/** Participation evaluation for one agent at one stage. */
export interface StageParticipation {
  readonly agentId: AgentId;
  readonly stage: AgentStageAffinity;
  readonly eligible: boolean;
  readonly preferred: boolean;
  readonly reasons: readonly ParticipationReason[];
  readonly priority: number;
  /** Capabilities that contributed to eligibility. */
  readonly matchingCapabilities: readonly AgentCapability[];
}

/** Summary of all agent participation for a single stage. */
export interface StageParticipationSummary {
  readonly stage: AgentStageAffinity;
  readonly eligible: readonly StageParticipation[];
  readonly preferred: readonly StageParticipation[];
  readonly skipped: readonly StageParticipation[];
}

/* ------------------------------------------------------------------ */
/*  Runtime Summary                                                   */
/* ------------------------------------------------------------------ */

/**
 * Aggregated runtime summary for an attached agent.
 *
 * Combines definition, attachment status, and capabilities
 * into one snapshot view for frontend consumption.
 */
export interface AgentSummary {
  readonly id: AgentId;
  readonly name: string;
  readonly kind: AgentKind;
  readonly status: AgentAttachmentStatus;
  readonly capabilities: readonly AgentCapability[];
  readonly allowedStages: readonly AgentStageAffinity[];
  readonly failureReason: string | null;
  readonly disabledReason: string | null;
  /** Role hint from routing metadata (Phase 27). */
  readonly roleHint?: AgentRoleHint;
  /** Routing priority (Phase 27). */
  readonly routingPriority?: number;
  /** Whether routing participation is enabled (Phase 27). */
  readonly participationEnabled?: boolean;
}
