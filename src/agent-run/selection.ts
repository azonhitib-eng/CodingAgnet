/**
 * Agent selection for task dispatch.
 *
 * Phase 45: Deterministic agent selection by explicit ID or best-fit
 * for a requested stage/role. Uses the existing routing/participation model.
 *
 * Selection logic is explicit and explainable — no hidden heuristics.
 */

import type { AgentId, AgentKind, AgentRoleHint, AgentStageAffinity, AgentSummary } from "../agents/types.js";
import type { AgentRunSelectionReason, AgentRunError, AgentRunErrorCode } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Selection input                                                    */
/* ------------------------------------------------------------------ */

/** Criteria for selecting an agent. */
export interface AgentSelectionCriteria {
  /** Explicit agent ID (highest priority). */
  readonly targetAgentId?: AgentId;
  /** Preferred agent kind for filtering. */
  readonly preferredAgentKind?: AgentKind;
  /** Preferred role hint for scoring. */
  readonly preferredRoleHint?: AgentRoleHint;
  /** Preferred stage for eligibility. */
  readonly preferredStage?: AgentStageAffinity;
}

/* ------------------------------------------------------------------ */
/*  Selection result                                                   */
/* ------------------------------------------------------------------ */

/** Result of an agent selection attempt. */
export interface AgentSelectionResult {
  /** Whether selection succeeded. */
  readonly ok: boolean;
  /** Selected agent (null if failed). */
  readonly agent: AgentSummary | null;
  /** Why this agent was selected (null if failed). */
  readonly reason: AgentRunSelectionReason | null;
  /** Error (if selection failed). */
  readonly error: AgentRunError | null;
}

/* ------------------------------------------------------------------ */
/*  Helper: is agent eligible for runs                                 */
/* ------------------------------------------------------------------ */

/**
 * Check if an agent summary represents an agent eligible for runs.
 *
 * An agent is eligible if:
 * - status is "attached" or "enabled"
 * - participationEnabled is not explicitly false
 */
function isAgentEligible(agent: AgentSummary): boolean {
  const status = agent.status;
  if (status !== "attached" && status !== "enabled") return false;
  if (agent.participationEnabled === false) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Scoring                                                            */
/* ------------------------------------------------------------------ */

/**
 * Score an agent for a given set of criteria.
 *
 * Scoring is deterministic:
 * - Base: routing priority (0-100, default 50)
 * - +30 if agent kind matches preferred kind
 * - +20 if role hint matches preferred role hint
 * - +10 if agent has capabilities relevant to the preferred stage
 *
 * Tie-breaking: alphabetical by agent ID for determinism.
 */
function scoreAgent(
  agent: AgentSummary,
  criteria: AgentSelectionCriteria,
): number {
  let score = agent.routingPriority ?? 50;

  if (criteria.preferredAgentKind && agent.kind === criteria.preferredAgentKind) {
    score += 30;
  }

  if (criteria.preferredRoleHint && agent.roleHint === criteria.preferredRoleHint) {
    score += 20;
  }

  // Capability-to-stage relevance is already handled by the participation model.
  // We add a small bonus for agents with more capabilities.
  if (criteria.preferredStage && agent.allowedStages.includes(criteria.preferredStage)) {
    score += 10;
  }

  return score;
}

/* ------------------------------------------------------------------ */
/*  Selection logic                                                    */
/* ------------------------------------------------------------------ */

function makeError(code: AgentRunErrorCode, message: string): AgentRunError {
  return { code, message, phase: "selecting" };
}

/**
 * Select an agent from the available pool.
 *
 * Strategy:
 * 1. If `targetAgentId` is specified → find that specific agent
 * 2. Otherwise → score all eligible agents and pick the best fit
 *
 * Selection is deterministic: same inputs → same output.
 */
export function selectAgent(
  agents: readonly AgentSummary[],
  criteria: AgentSelectionCriteria,
): AgentSelectionResult {
  // Strategy 1: Explicit agent ID
  if (criteria.targetAgentId) {
    const found = agents.find((a) => a.id === criteria.targetAgentId);
    if (!found) {
      return {
        ok: false,
        agent: null,
        reason: null,
        error: makeError("AGENT_NOT_FOUND", `Agent "${criteria.targetAgentId}" not found in the session.`),
      };
    }
    if (!isAgentEligible(found)) {
      return {
        ok: false,
        agent: null,
        reason: null,
        error: makeError(
          "AGENT_NOT_ATTACHED",
          `Agent "${criteria.targetAgentId}" exists but is not eligible (status: ${found.status}).`,
        ),
      };
    }
    return {
      ok: true,
      agent: found,
      reason: {
        method: "explicit_id",
        explanation: `Agent "${found.name}" (${found.id}) was explicitly requested.`,
        agentKind: found.kind,
        roleHint: found.roleHint ?? null,
        stage: criteria.preferredStage ?? null,
        priority: found.routingPriority ?? 50,
        eligibleCount: agents.filter(isAgentEligible).length,
      },
      error: null,
    };
  }

  // Strategy 2: Best-fit selection
  const eligible = agents.filter(isAgentEligible);
  if (eligible.length === 0) {
    return {
      ok: false,
      agent: null,
      reason: null,
      error: makeError(
        "NO_ELIGIBLE_AGENT",
        "No eligible agents are attached to the session. Attach and enable an agent first.",
      ),
    };
  }

  // Score and sort (deterministic: score descending, then id ascending for ties)
  const scored = eligible.map((a) => ({ agent: a, score: scoreAgent(a, criteria) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.agent.id.localeCompare(b.agent.id);
  });

  const best = scored[0];
  const method: AgentRunSelectionReason["method"] = eligible.length === 1 ? "only_eligible" : "best_fit";
  const explanation = eligible.length === 1
    ? `Agent "${best.agent.name}" is the only eligible agent.`
    : `Agent "${best.agent.name}" was selected as best fit (score: ${best.score}) from ${eligible.length} eligible agent(s).`;

  return {
    ok: true,
    agent: best.agent,
    reason: {
      method,
      explanation,
      agentKind: best.agent.kind,
      roleHint: best.agent.roleHint ?? null,
      stage: criteria.preferredStage ?? null,
      priority: best.score,
      eligibleCount: eligible.length,
    },
    error: null,
  };
}

/**
 * Get default task description for a task kind.
 */
export function getDefaultTaskDescription(taskKind: string): string {
  switch (taskKind) {
    case "summarize_workspace":
      return "Summarize the current workspace context, including project structure, languages, and key files.";
    case "review_diagnostics":
      return "Review the current diagnostics and toolchain context, highlighting errors, warnings, and available checks.";
    case "explain_files":
      return "Explain the relevant files and modules in this repository, including entrypoints, configs, and test files.";
    case "summarize_github":
      return "Summarize available GitHub MCP tools and any results from GitHub integration.";
    case "general_query":
      return "Answer a general question about the repository.";
    case "custom":
      return "Execute a custom bounded task.";
    default:
      return `Execute task: ${taskKind}`;
  }
}
