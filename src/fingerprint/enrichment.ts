/**
 * Profile-aware agent participation enrichment.
 *
 * Uses the existing agent routing model without rewriting it.
 * Provides enrichment hints that can influence which agents are more
 * appropriate for a specific repository type.
 *
 * This is participation/routing enrichment only — NOT autonomous execution.
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

import type {
  LanguageProfile,
  LanguageProfileId,
  ProfileAgentEnrichment,
  ProfileSelection,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Profile → capability relevance                                    */
/* ------------------------------------------------------------------ */

/**
 * Agent capabilities that are universally relevant regardless of profile.
 */
const UNIVERSAL_CAPABILITIES = new Set([
  "session_narration",
  "shell_assistance",
  "mcp_interaction",
]);

/**
 * Given a language profile, determine which agent capabilities are
 * most relevant for that kind of repository.
 */
export function profileRelevantCapabilities(
  profile: LanguageProfile,
): readonly string[] {
  return profile.relatedCapabilities;
}

/* ------------------------------------------------------------------ */
/*  Agent enrichment                                                  */
/* ------------------------------------------------------------------ */

/**
 * Minimal agent info needed for enrichment evaluation.
 */
export interface EnrichmentAgentInfo {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly roleHint?: string;
}

/**
 * Evaluate how relevant an agent is for a given profile.
 *
 * Does NOT make execution decisions — returns enrichment hints only.
 *
 * @param agent - agent info
 * @param profile - selected language profile
 * @returns enrichment hint
 */
export function evaluateAgentForProfile(
  agent: EnrichmentAgentInfo,
  profile: LanguageProfile,
): ProfileAgentEnrichment {
  // Check if any of the agent's capabilities overlap with profile capabilities
  const profileCaps = new Set(profile.relatedCapabilities);
  const matchingCaps = agent.capabilities.filter((c) => profileCaps.has(c));
  const hasUniversalOnly = agent.capabilities.every((c) =>
    UNIVERSAL_CAPABILITIES.has(c),
  );

  // Check if agent role matches preferred roles for this profile
  const roleMatches =
    agent.roleHint !== undefined &&
    profile.preferredAgentRoles.includes(agent.roleHint);

  // Determine relevance
  if (profile.id === "generic-unknown") {
    // For unknown profiles, all agents are neutral
    return {
      profileId: profile.id,
      agentId: agent.id,
      relevance: "neutral",
      reason: "Repository profile is unknown — all agents equally relevant.",
    };
  }

  if (matchingCaps.length > 0 && roleMatches) {
    return {
      profileId: profile.id,
      agentId: agent.id,
      relevance: "preferred",
      reason: `Agent has matching capabilities (${matchingCaps.join(", ")}) and preferred role "${agent.roleHint}" for ${profile.label} repositories.`,
    };
  }

  if (matchingCaps.length > 0) {
    return {
      profileId: profile.id,
      agentId: agent.id,
      relevance: "preferred",
      reason: `Agent has matching capabilities (${matchingCaps.join(", ")}) for ${profile.label} repositories.`,
    };
  }

  if (hasUniversalOnly) {
    return {
      profileId: profile.id,
      agentId: agent.id,
      relevance: "neutral",
      reason: `Agent provides universal capabilities only — equally relevant to all profiles.`,
    };
  }

  return {
    profileId: profile.id,
    agentId: agent.id,
    relevance: "neutral",
    reason: `Agent capabilities do not specifically align with ${profile.label} repositories.`,
  };
}

/**
 * Evaluate enrichment for all agents against a profile selection.
 *
 * @param agents - list of agents to evaluate
 * @param selection - the profile selection result
 * @returns array of enrichment hints
 */
export function evaluateAgentsForProfile(
  agents: readonly EnrichmentAgentInfo[],
  selection: ProfileSelection,
): readonly ProfileAgentEnrichment[] {
  return agents.map((agent) =>
    evaluateAgentForProfile(agent, selection.primary),
  );
}

/**
 * Get agents that are preferred for the selected profile.
 */
export function getPreferredAgentsForProfile(
  agents: readonly EnrichmentAgentInfo[],
  selection: ProfileSelection,
): readonly ProfileAgentEnrichment[] {
  return evaluateAgentsForProfile(agents, selection).filter(
    (e) => e.relevance === "preferred",
  );
}

/**
 * Build a human-readable summary of why a profile suggests certain agents.
 */
export function buildEnrichmentSummary(
  enrichments: readonly ProfileAgentEnrichment[],
  profileId: LanguageProfileId,
): string {
  const preferred = enrichments.filter((e) => e.relevance === "preferred");
  const neutral = enrichments.filter((e) => e.relevance === "neutral");
  const discouraged = enrichments.filter((e) => e.relevance === "discouraged");

  const parts: string[] = [`Profile: ${profileId}`];
  if (preferred.length > 0) {
    parts.push(
      `Preferred agents (${preferred.length}): ${preferred.map((e) => e.agentId).join(", ")}`,
    );
  }
  if (neutral.length > 0) {
    parts.push(`Neutral agents (${neutral.length}): ${neutral.map((e) => e.agentId).join(", ")}`);
  }
  if (discouraged.length > 0) {
    parts.push(
      `Discouraged agents (${discouraged.length}): ${discouraged.map((e) => e.agentId).join(", ")}`,
    );
  }
  return parts.join(". ");
}
