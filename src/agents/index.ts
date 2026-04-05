/**
 * Agents module — barrel exports.
 *
 * Agent registry and attachment lifecycle for the coding-agent platform.
 * Phase 23: first-class attachable agents, session integration,
 * capability modeling, and event bridge.
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
  AGENT_EVENT_KINDS,
  isAgentEvent,
  filterAgentEvents,
  buildAgentEventSummary,
} from "./session-integration.js";
export type { AgentSessionEventKind } from "./session-integration.js";
