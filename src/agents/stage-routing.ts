/**
 * Capability → stage mapping and routing constants.
 *
 * Defines the explicit, deterministic mapping between agent capabilities
 * and session stages.  No hidden heuristics — all routing decisions
 * are traceable to this mapping plus the agent's declared metadata.
 *
 * Phase 27: Agent routing and stage participation model.
 */

import type { AgentCapability, AgentStageAffinity } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Capability → Stage mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Explicit map from each capability to the stages where it is relevant.
 *
 * This is the single source of truth for "which capabilities are useful
 * in which stages".  Routing logic references this map rather than
 * hard-coding associations.
 */
export const CAPABILITY_STAGE_MAP: Readonly<
  Record<AgentCapability, readonly AgentStageAffinity[]>
> = {
  planning: ["initializing", "workflow_running"],
  reviewing: ["review", "done"],
  testing: ["workflow_running", "review"],
  editing: ["workspace_binding", "workflow_running"],
  repo_exploration: ["initializing", "workspace_binding"],
  mcp_interaction: [
    "initializing",
    "workspace_binding",
    "host_detection",
    "workflow_running",
    "review",
  ],
  shell_assistance: [
    "initializing",
    "workspace_binding",
    "host_detection",
    "workflow_running",
    "review",
    "done",
  ],
  session_narration: [
    "initializing",
    "workspace_binding",
    "host_detection",
    "workflow_running",
    "review",
    "done",
  ],
} as const;

/* ------------------------------------------------------------------ */
/*  All session stages                                                */
/* ------------------------------------------------------------------ */

/** All defined session stages in lifecycle order. */
export const ALL_STAGES: readonly AgentStageAffinity[] = [
  "initializing",
  "workspace_binding",
  "host_detection",
  "workflow_running",
  "review",
  "done",
] as const;

/* ------------------------------------------------------------------ */
/*  Default routing priority                                          */
/* ------------------------------------------------------------------ */

/** Default routing priority when none is specified. */
export const DEFAULT_ROUTING_PRIORITY = 50;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Get the stages that a given capability maps to.
 *
 * Returns an empty array for unknown capabilities (defensive).
 */
export function stagesForCapability(
  capability: AgentCapability,
): readonly AgentStageAffinity[] {
  return CAPABILITY_STAGE_MAP[capability] ?? [];
}

/**
 * Get all capabilities that are relevant to a given stage.
 *
 * Inverse of the capability → stage mapping.
 */
export function capabilitiesForStage(
  stage: AgentStageAffinity,
): AgentCapability[] {
  const result: AgentCapability[] = [];
  for (const [cap, stages] of Object.entries(CAPABILITY_STAGE_MAP)) {
    if ((stages as readonly string[]).includes(stage)) {
      result.push(cap as AgentCapability);
    }
  }
  return result;
}

/**
 * Check if a capability is relevant to a stage.
 */
export function isCapabilityRelevant(
  capability: AgentCapability,
  stage: AgentStageAffinity,
): boolean {
  return (CAPABILITY_STAGE_MAP[capability] as readonly string[]).includes(stage);
}
