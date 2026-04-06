/**
 * Agent ↔ Session event bridge.
 *
 * Pure helpers that produce agent-related session events.
 * Follows the same pattern as src/mcp/session-integration.ts.
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { AgentId, AgentCapability, AgentStageAffinity } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Agent Event Kinds                                                 */
/* ------------------------------------------------------------------ */

/**
 * Agent-specific session event kinds.
 *
 * These extend the session timeline with agent lifecycle visibility.
 */
export type AgentSessionEventKind =
  | "agent_attach_requested"
  | "agent_attached"
  | "agent_detached"
  | "agent_enabled"
  | "agent_disabled"
  | "agent_failed"
  | "agent_capabilities_updated"
  /* Phase 27 — routing / participation events */
  | "agent_routing_evaluated"
  | "agent_stage_participation_updated"
  | "agent_skipped_for_stage"
  | "agent_selected_for_stage";

/* ------------------------------------------------------------------ */
/*  Event factories                                                   */
/* ------------------------------------------------------------------ */

export const agentAttachRequested = (
  agentId: AgentId,
  name: string,
): SessionEvent =>
  createEvent(
    "agent_attach_requested" as SessionEvent["kind"],
    `Agent attach requested: ${name}`,
    { agentId, name },
  );

export const agentAttached = (
  agentId: AgentId,
  name: string,
): SessionEvent =>
  createEvent(
    "agent_attached" as SessionEvent["kind"],
    `Agent attached: ${name}`,
    { agentId, name },
  );

export const agentDetached = (
  agentId: AgentId,
  name: string,
): SessionEvent =>
  createEvent(
    "agent_detached" as SessionEvent["kind"],
    `Agent detached: ${name}`,
    { agentId, name },
  );

export const agentEnabled = (
  agentId: AgentId,
  name: string,
): SessionEvent =>
  createEvent(
    "agent_enabled" as SessionEvent["kind"],
    `Agent enabled: ${name}`,
    { agentId, name },
  );

export const agentDisabled = (
  agentId: AgentId,
  name: string,
  reason?: string,
): SessionEvent =>
  createEvent(
    "agent_disabled" as SessionEvent["kind"],
    `Agent disabled: ${name}${reason ? ` — ${reason}` : ""}`,
    { agentId, name, ...(reason !== undefined ? { reason } : {}) },
  );

export const agentFailed = (
  agentId: AgentId,
  name: string,
  error: string,
): SessionEvent =>
  createEvent(
    "agent_failed" as SessionEvent["kind"],
    `Agent failed: ${name} — ${error}`,
    { agentId, name, error },
  );

export const agentCapabilitiesUpdated = (
  agentId: AgentId,
  name: string,
  capabilities: readonly AgentCapability[],
): SessionEvent =>
  createEvent(
    "agent_capabilities_updated" as SessionEvent["kind"],
    `Agent capabilities updated: ${name} (${capabilities.length} capabilities)`,
    { agentId, name, capabilities: [...capabilities] },
  );

/* ------------------------------------------------------------------ */
/*  Phase 27 — Routing / participation event factories                */
/* ------------------------------------------------------------------ */

export const agentRoutingEvaluated = (
  stage: AgentStageAffinity,
  eligibleCount: number,
  preferredCount: number,
  skippedCount: number,
): SessionEvent =>
  createEvent(
    "agent_routing_evaluated" as SessionEvent["kind"],
    `Agent routing evaluated for stage '${stage}': ${eligibleCount} eligible, ${preferredCount} preferred, ${skippedCount} skipped`,
    { stage, eligibleCount, preferredCount, skippedCount },
  );

export const agentStageParticipationUpdated = (
  agentId: AgentId,
  name: string,
  stage: AgentStageAffinity,
  eligible: boolean,
  preferred: boolean,
): SessionEvent =>
  createEvent(
    "agent_stage_participation_updated" as SessionEvent["kind"],
    `Agent '${name}' participation updated for stage '${stage}': eligible=${eligible}, preferred=${preferred}`,
    { agentId, name, stage, eligible, preferred },
  );

export const agentSkippedForStage = (
  agentId: AgentId,
  name: string,
  stage: AgentStageAffinity,
  reasons: readonly string[],
): SessionEvent =>
  createEvent(
    "agent_skipped_for_stage" as SessionEvent["kind"],
    `Agent '${name}' skipped for stage '${stage}': ${reasons.join(", ")}`,
    { agentId, name, stage, reasons: [...reasons] },
  );

export const agentSelectedForStage = (
  agentId: AgentId,
  name: string,
  stage: AgentStageAffinity,
  priority: number,
): SessionEvent =>
  createEvent(
    "agent_selected_for_stage" as SessionEvent["kind"],
    `Agent '${name}' selected for stage '${stage}' (priority: ${priority})`,
    { agentId, name, stage, priority },
  );

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** All known agent session event kinds. */
export const AGENT_EVENT_KINDS: readonly AgentSessionEventKind[] = [
  "agent_attach_requested",
  "agent_attached",
  "agent_detached",
  "agent_enabled",
  "agent_disabled",
  "agent_failed",
  "agent_capabilities_updated",
  "agent_routing_evaluated",
  "agent_stage_participation_updated",
  "agent_skipped_for_stage",
  "agent_selected_for_stage",
] as const;

/** Check if a session event kind is an agent event. */
export function isAgentEvent(kind: string): kind is AgentSessionEventKind {
  return (AGENT_EVENT_KINDS as readonly string[]).includes(kind);
}

/** Filter session events to only agent-related events. */
export function filterAgentEvents(events: SessionEvent[]): SessionEvent[] {
  return events.filter((e) => isAgentEvent(e.kind));
}

/** Build an agent event summary from session events. */
export function buildAgentEventSummary(
  events: SessionEvent[],
): {
  attached: string[];
  detached: string[];
  enabled: string[];
  disabled: string[];
  failed: string[];
  routingEvaluations: number;
  stageSelections: string[];
  stageSkips: string[];
} {
  const attached: string[] = [];
  const detached: string[] = [];
  const enabled: string[] = [];
  const disabled: string[] = [];
  const failed: string[] = [];
  let routingEvaluations = 0;
  const stageSelections: string[] = [];
  const stageSkips: string[] = [];

  for (const e of events) {
    const aid = (e.detail?.agentId as string) ?? "";
    switch (e.kind) {
      case "agent_attached":
        attached.push(aid);
        break;
      case "agent_detached":
        detached.push(aid);
        break;
      case "agent_enabled":
        enabled.push(aid);
        break;
      case "agent_disabled":
        disabled.push(aid);
        break;
      case "agent_failed":
        failed.push(aid);
        break;
      case "agent_routing_evaluated":
        routingEvaluations++;
        break;
      case "agent_selected_for_stage":
        stageSelections.push(aid);
        break;
      case "agent_skipped_for_stage":
        stageSkips.push(aid);
        break;
    }
  }

  return {
    attached,
    detached,
    enabled,
    disabled,
    failed,
    routingEvaluations,
    stageSelections,
    stageSkips,
  };
}
