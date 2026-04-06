/**
 * Agent participation model.
 *
 * Pure, deterministic functions that evaluate which agents are eligible,
 * preferred, or skipped for a given session stage.
 *
 * Design principles:
 * - No hidden heuristics — all decisions are traceable
 * - No autonomous orchestration — this is read-only evaluation
 * - Deterministic — same inputs → same outputs
 * - Based on explicit capabilities, stage affinity, and enabled state
 *
 * Phase 27: Agent routing and stage participation model.
 */

import type {
  AgentStageAffinity,
  AgentSummary,
  StageParticipation,
  StageParticipationSummary,
  ParticipationReason,
  AgentCapability,
} from "./types.js";
import {
  CAPABILITY_STAGE_MAP,
  ALL_STAGES,
  DEFAULT_ROUTING_PRIORITY,
} from "./stage-routing.js";

/* ------------------------------------------------------------------ */
/*  Active attachment statuses                                        */
/* ------------------------------------------------------------------ */

/** Attachment statuses that are considered active for routing. */
const ACTIVE_STATUSES = new Set(["attached", "enabled"]);

/* ------------------------------------------------------------------ */
/*  Single-agent evaluation                                           */
/* ------------------------------------------------------------------ */

/**
 * Evaluate one agent's participation for a single stage.
 *
 * Returns a StageParticipation object with:
 * - eligible: whether the agent CAN participate
 * - preferred: whether the agent is explicitly preferred
 * - reasons: why the decision was made
 * - matchingCapabilities: which capabilities contributed
 * - priority: resolved routing priority
 */
export function evaluateAgentForStage(
  agent: AgentSummary,
  stage: AgentStageAffinity,
): StageParticipation {
  const reasons: ParticipationReason[] = [];
  const matchingCapabilities: AgentCapability[] = [];
  const priority =
    agent.routingPriority ?? DEFAULT_ROUTING_PRIORITY;

  // Check if participation is explicitly disabled via routing metadata
  if (agent.participationEnabled === false) {
    reasons.push("participation_disabled");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  // Check attachment status
  if (agent.status === "disabled") {
    reasons.push("disabled");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  if (agent.status === "failed") {
    reasons.push("failed");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  if (agent.status === "detached" || agent.status === "detaching") {
    reasons.push("detached");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  if (!ACTIVE_STATUSES.has(agent.status)) {
    reasons.push("unavailable");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  // Check allowed stages
  const stageAllowed = agent.allowedStages.includes(stage);
  if (!stageAllowed) {
    reasons.push("not_allowed");
    return {
      agentId: agent.id,
      stage,
      eligible: false,
      preferred: false,
      reasons,
      priority,
      matchingCapabilities,
    };
  }

  // Agent is allowed — now determine reasons
  reasons.push("allowed_stage");

  // Check capability matches for this stage
  for (const cap of agent.capabilities) {
    const capStages = CAPABILITY_STAGE_MAP[cap];
    if (capStages && (capStages as readonly string[]).includes(stage)) {
      matchingCapabilities.push(cap);
    }
  }
  if (matchingCapabilities.length > 0) {
    reasons.push("capability_match");
  }

  // Check preferred
  // Note: preferredStages is on AgentSummary only as a convention —
  // for now we don't have it on AgentSummary directly, so we
  // always return eligible=true here and let the caller check preferences
  // via the StageParticipationSummary.

  return {
    agentId: agent.id,
    stage,
    eligible: true,
    preferred: false, // overridden in evaluateStageParticipation
    reasons,
    priority,
    matchingCapabilities,
  };
}

/* ------------------------------------------------------------------ */
/*  Multi-agent evaluation for a single stage                         */
/* ------------------------------------------------------------------ */

/**
 * Evaluate all agents for a single stage.
 *
 * Returns a StageParticipationSummary with eligible, preferred, and
 * skipped lists sorted by priority (descending).
 */
export function evaluateStageParticipation(
  agents: readonly AgentSummary[],
  stage: AgentStageAffinity,
  preferredStagesMap?: ReadonlyMap<string, readonly AgentStageAffinity[]>,
): StageParticipationSummary {
  const eligible: StageParticipation[] = [];
  const skipped: StageParticipation[] = [];
  const preferred: StageParticipation[] = [];

  for (const agent of agents) {
    const participation = evaluateAgentForStage(agent, stage);

    if (!participation.eligible) {
      skipped.push(participation);
      continue;
    }

    // Check if this agent has the stage as preferred
    const agentPreferredStages = preferredStagesMap?.get(agent.id);
    const isPreferred = agentPreferredStages
      ? agentPreferredStages.includes(stage)
      : false;

    const enriched: StageParticipation = isPreferred
      ? {
          ...participation,
          preferred: true,
          reasons: [...participation.reasons, "preferred_stage" as ParticipationReason],
        }
      : participation;

    eligible.push(enriched);
    if (isPreferred) {
      preferred.push(enriched);
    }
  }

  // Sort by priority descending
  const sortByPriority = (a: StageParticipation, b: StageParticipation) =>
    b.priority - a.priority;

  eligible.sort(sortByPriority);
  preferred.sort(sortByPriority);

  return { stage, eligible, preferred, skipped };
}

/* ------------------------------------------------------------------ */
/*  Full participation map across all stages                          */
/* ------------------------------------------------------------------ */

/**
 * Evaluate all agents across all session stages.
 *
 * Returns one StageParticipationSummary per stage.
 */
export function evaluateAllStages(
  agents: readonly AgentSummary[],
  preferredStagesMap?: ReadonlyMap<string, readonly AgentStageAffinity[]>,
): StageParticipationSummary[] {
  return ALL_STAGES.map((stage) =>
    evaluateStageParticipation(agents, stage, preferredStagesMap),
  );
}

/* ------------------------------------------------------------------ */
/*  Convenience queries                                               */
/* ------------------------------------------------------------------ */

/**
 * Get all eligible agents for a stage, sorted by priority descending.
 */
export function getEligibleAgents(
  agents: readonly AgentSummary[],
  stage: AgentStageAffinity,
  preferredStagesMap?: ReadonlyMap<string, readonly AgentStageAffinity[]>,
): readonly StageParticipation[] {
  return evaluateStageParticipation(agents, stage, preferredStagesMap).eligible;
}

/**
 * Get preferred agents for a stage, sorted by priority descending.
 */
export function getPreferredAgents(
  agents: readonly AgentSummary[],
  stage: AgentStageAffinity,
  preferredStagesMap?: ReadonlyMap<string, readonly AgentStageAffinity[]>,
): readonly StageParticipation[] {
  return evaluateStageParticipation(agents, stage, preferredStagesMap).preferred;
}

/**
 * Get skipped (ineligible) agents for a stage.
 */
export function getSkippedAgents(
  agents: readonly AgentSummary[],
  stage: AgentStageAffinity,
): readonly StageParticipation[] {
  return evaluateStageParticipation(agents, stage).skipped;
}

/**
 * Get the top-priority eligible agent for a stage, if any.
 */
export function getTopAgent(
  agents: readonly AgentSummary[],
  stage: AgentStageAffinity,
  preferredStagesMap?: ReadonlyMap<string, readonly AgentStageAffinity[]>,
): StageParticipation | null {
  const eligible = getEligibleAgents(agents, stage, preferredStagesMap);
  return eligible.length > 0 ? eligible[0] : null;
}

/**
 * Build a preferred-stages map from agent summaries and their definitions.
 *
 * This is a convenience helper: callers can pass AgentDefinition[] or
 * any array of objects with `id` and `routing.preferredStages`.
 */
export function buildPreferredStagesMap(
  definitions: ReadonlyArray<{
    readonly id: string;
    readonly routing?: { readonly preferredStages?: readonly AgentStageAffinity[] };
  }>,
): Map<string, readonly AgentStageAffinity[]> {
  const map = new Map<string, readonly AgentStageAffinity[]>();
  for (const def of definitions) {
    if (def.routing?.preferredStages && def.routing.preferredStages.length > 0) {
      map.set(def.id, def.routing.preferredStages);
    }
  }
  return map;
}
