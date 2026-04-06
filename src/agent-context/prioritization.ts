/**
 * Context prioritization and budget control.
 *
 * Phase 44: Deterministic prioritization, scoring, and trimming for
 * agent context slices.
 *
 * Rules:
 * - Priority ordering is deterministic and explicit
 * - Trimming is honest — original char count is preserved
 * - Budget is never exceeded
 * - Excluded slices retain their reasons
 */

import type {
  AgentPromptContextSlice,
  AgentPromptPriority,
  AgentPromptBudget,
  AgentPromptReason,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Priority ordering                                                  */
/* ------------------------------------------------------------------ */

/** Numeric score for each priority level (higher = more important). */
const PRIORITY_SCORE: Record<AgentPromptPriority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  excluded: 0,
};

/** Get the numeric score for a priority level. */
export function priorityScore(priority: AgentPromptPriority): number {
  return PRIORITY_SCORE[priority];
}

/** Compare two priorities (for sorting — higher priority first). */
export function comparePriority(a: AgentPromptPriority, b: AgentPromptPriority): number {
  return PRIORITY_SCORE[b] - PRIORITY_SCORE[a];
}

/** Check if a priority meets the minimum threshold. */
export function meetsPriorityThreshold(
  priority: AgentPromptPriority,
  minPriority: AgentPromptPriority,
): boolean {
  return PRIORITY_SCORE[priority] >= PRIORITY_SCORE[minPriority];
}

/* ------------------------------------------------------------------ */
/*  Trimming                                                           */
/* ------------------------------------------------------------------ */

/**
 * Trim a slice's text content to fit within a character limit.
 * Returns a new slice (original is immutable).
 */
export function trimSlice(
  slice: AgentPromptContextSlice,
  maxChars: number,
): AgentPromptContextSlice {
  if (slice.charCount <= maxChars) return slice;

  const trimmedText = slice.textContent.substring(0, maxChars - 20) + "\n... (trimmed)";
  return {
    ...slice,
    textContent: trimmedText,
    charCount: trimmedText.length,
    trimmed: true,
    originalCharCount: slice.charCount,
  };
}

/* ------------------------------------------------------------------ */
/*  Budget application                                                 */
/* ------------------------------------------------------------------ */

/**
 * Apply budget constraints to a list of candidate slices.
 *
 * Returns { included, excluded } with full traceability.
 *
 * Algorithm:
 * 1. Filter out explicitly excluded slices
 * 2. Filter by minimum priority
 * 3. Sort by priority (deterministic)
 * 4. Trim individual slices to maxSliceChars
 * 5. Include slices until budget is exhausted
 * 6. Remaining slices go to excluded with reason
 */
export function applyBudget(
  candidates: readonly AgentPromptContextSlice[],
  budget: AgentPromptBudget,
): { included: AgentPromptContextSlice[]; excluded: AgentPromptContextSlice[] } {
  const included: AgentPromptContextSlice[] = [];
  const excluded: AgentPromptContextSlice[] = [];

  // Step 1: separate explicitly excluded
  const available: AgentPromptContextSlice[] = [];
  for (const slice of candidates) {
    if (slice.priority === "excluded") {
      excluded.push(slice);
    } else {
      available.push(slice);
    }
  }

  // Step 2: filter by minimum priority
  const meetsThreshold: AgentPromptContextSlice[] = [];
  for (const slice of available) {
    if (meetsPriorityThreshold(slice.priority, budget.minPriority)) {
      meetsThreshold.push(slice);
    } else {
      excluded.push({
        ...slice,
        priority: "excluded",
        reasons: [
          ...slice.reasons,
          {
            kind: "priority_cutoff",
            explanation: `Priority "${slice.priority}" is below minimum "${budget.minPriority}"`,
            effect: "excluded" as const,
          },
        ],
      });
    }
  }

  // Step 3: sort by priority (deterministic — higher priority first, then by sliceId for stability)
  const sorted = [...meetsThreshold].sort((a, b) => {
    const priorityDiff = comparePriority(a.priority, b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.sliceId.localeCompare(b.sliceId);
  });

  // Step 4 & 5: include slices within budget
  let totalChars = 0;
  for (const slice of sorted) {
    // Check max slices
    if (included.length >= budget.maxSlices) {
      excluded.push({
        ...slice,
        priority: "excluded",
        reasons: [
          ...slice.reasons,
          {
            kind: "budget_exceeded",
            explanation: `Maximum slice count (${budget.maxSlices}) reached`,
            effect: "excluded" as const,
          },
        ],
      });
      continue;
    }

    // Trim if needed
    let processedSlice = slice;
    if (slice.charCount > budget.maxSliceChars) {
      processedSlice = trimSlice(slice, budget.maxSliceChars);
    }

    // Check total char budget
    if (totalChars + processedSlice.charCount > budget.maxTotalChars) {
      // Try trimming further to fit
      const remaining = budget.maxTotalChars - totalChars;
      if (remaining > 100) {
        // Enough room for a meaningful trimmed slice
        processedSlice = trimSlice(processedSlice, remaining);
        totalChars += processedSlice.charCount;
        included.push(processedSlice);
      } else {
        excluded.push({
          ...slice,
          priority: "excluded",
          reasons: [
            ...slice.reasons,
            {
              kind: "budget_exceeded",
              explanation: `Total character budget (${budget.maxTotalChars}) would be exceeded`,
              effect: "excluded" as const,
            },
          ],
        });
      }
      continue;
    }

    totalChars += processedSlice.charCount;
    included.push(processedSlice);
  }

  return { included, excluded };
}

/* ------------------------------------------------------------------ */
/*  Role-based priority adjustment                                     */
/* ------------------------------------------------------------------ */

import type { AgentKind, AgentRoleHint } from "../agents/types.js";

/**
 * Priority adjustment rules for each agent kind / role.
 *
 * Maps (agentKind or roleHint) → sliceId → priority override.
 * Only overrides where the role needs a different priority than default.
 */
const ROLE_PRIORITY_OVERRIDES: Record<string, Record<string, AgentPromptPriority>> = {
  // Planning agent: needs broad overview
  planning: {
    fingerprint_profile: "critical",
    workspace_summary: "critical",
    toolchain_summary: "high",
    language_context: "high",
    diagnostics_summary: "medium",
    mcp_summary: "medium",
    agents_summary: "medium",
    github_mcp_summary: "low",
  },
  planner: {
    fingerprint_profile: "critical",
    workspace_summary: "critical",
    toolchain_summary: "high",
    language_context: "high",
  },

  // Review agent: diagnostics + toolchain + notable files
  review: {
    diagnostics_summary: "critical",
    toolchain_summary: "critical",
    language_context: "high",
    fingerprint_profile: "high",
    mcp_summary: "low",
    github_mcp_summary: "low",
  },
  reviewer: {
    diagnostics_summary: "critical",
    toolchain_summary: "critical",
    language_context: "high",
  },

  // Testing agent: tests + toolchain + config
  testing: {
    toolchain_summary: "critical",
    language_context: "critical",
    diagnostics_summary: "high",
    fingerprint_profile: "high",
    mcp_summary: "low",
    github_mcp_summary: "low",
  },
  tester: {
    toolchain_summary: "critical",
    language_context: "critical",
    diagnostics_summary: "high",
  },

  // Coding agent: workspace + language context + diagnostics
  coding: {
    language_context: "critical",
    workspace_summary: "critical",
    fingerprint_profile: "high",
    diagnostics_summary: "high",
    toolchain_summary: "high",
    mcp_summary: "medium",
  },
  editor: {
    language_context: "critical",
    workspace_summary: "critical",
    diagnostics_summary: "high",
  },

  // System / session agent: session + workspace + MCP + agents
  system: {
    session_summary: "critical",
    workspace_summary: "critical",
    mcp_summary: "critical",
    agents_summary: "critical",
    github_mcp_summary: "high",
    fingerprint_profile: "medium",
    toolchain_summary: "medium",
    diagnostics_summary: "low",
    language_context: "low",
  },
  narrator: {
    session_summary: "critical",
    mcp_summary: "critical",
    agents_summary: "critical",
  },
  mcp_bridge: {
    mcp_summary: "critical",
    github_mcp_summary: "critical",
    session_summary: "high",
  },

  // External / general: balanced defaults
  external: {},
  general: {},
  explorer: {
    language_context: "critical",
    workspace_summary: "critical",
  },
};

/**
 * Adjust slice priorities based on agent kind and role hint.
 *
 * Returns new slices with adjusted priorities. Does not modify original slices.
 */
export function adjustPrioritiesForRole(
  slices: readonly AgentPromptContextSlice[],
  agentKind: AgentKind,
  roleHint?: AgentRoleHint,
): AgentPromptContextSlice[] {
  // Merge kind overrides with role hint overrides (role hint takes precedence)
  const kindOverrides = ROLE_PRIORITY_OVERRIDES[agentKind] ?? {};
  const roleOverrides = roleHint ? (ROLE_PRIORITY_OVERRIDES[roleHint] ?? {}) : {};
  const overrides = { ...kindOverrides, ...roleOverrides };

  return slices.map((slice) => {
    const override = overrides[slice.sliceId];
    if (override && slice.priority !== "excluded") {
      return {
        ...slice,
        priority: override,
        reasons: [
          ...slice.reasons,
          {
            kind: "role_match" as const,
            explanation: `Priority adjusted to "${override}" for ${agentKind}${roleHint ? `/${roleHint}` : ""} role`,
            effect: "included" as const,
          },
        ],
      };
    }
    return slice;
  });
}
