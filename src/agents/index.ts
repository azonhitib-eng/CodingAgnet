/**
 * Agents module — barrel exports.
 *
 * Agent registry and attachment lifecycle for the coding-agent platform.
 * Phase 23: first-class attachable agents, session integration,
 * capability modeling, and event bridge.
 * Phase 27: agent routing, stage participation, and capability-to-stage mapping.
 */

/* types */
export type {
  AgentId,
  AgentKind,
  AgentStatus,
  AgentCapability,
  AgentStageAffinity,
  AgentDefinition,
  AgentAttachmentStatus,
  AgentAttachment,
  AgentSummary,
  AgentRoleHint,
  AgentRoutingMeta,
  ParticipationReason,
  StageParticipation,
  StageParticipationSummary,
} from "./types.js";

/* registry */
export { AgentRegistry } from "./agent-registry.js";
export type { AgentRecord } from "./agent-registry.js";

/* session integration */
export {
  agentAttachRequested,
  agentAttached,
  agentDetached,
  agentEnabled,
  agentDisabled,
  agentFailed,
  agentCapabilitiesUpdated,
  agentRoutingEvaluated,
  agentStageParticipationUpdated,
  agentSkippedForStage,
  agentSelectedForStage,
  AGENT_EVENT_KINDS,
  isAgentEvent,
  filterAgentEvents,
  buildAgentEventSummary,
} from "./session-integration.js";
export type { AgentSessionEventKind } from "./session-integration.js";

/* stage routing (Phase 27) */
export {
  CAPABILITY_STAGE_MAP,
  ALL_STAGES,
  DEFAULT_ROUTING_PRIORITY,
  stagesForCapability,
  capabilitiesForStage,
  isCapabilityRelevant,
} from "./stage-routing.js";

/* participation model (Phase 27) */
export {
  evaluateAgentForStage,
  evaluateStageParticipation,
  evaluateAllStages,
  getEligibleAgents,
  getPreferredAgents,
  getSkippedAgents,
  getTopAgent,
  buildPreferredStagesMap,
} from "./participation.js";
