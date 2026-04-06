/**
 * Context assembly — profile-aware, role-based assembly of agent context.
 *
 * Phase 44: Deterministic context assembly for agent kinds/roles.
 *
 * This is the main entry point for building agent context. It:
 * 1. Collects all candidate slices from available data sources
 * 2. Adjusts priorities based on agent kind/role
 * 3. Applies budget constraints (trimming, prioritization)
 * 4. Produces a fully inspectable assembly result
 *
 * This is context preparation — NOT autonomous agent execution.
 * Context is assembled deterministically. The system does not claim
 * optimal prompt engineering.
 */

import type {
  AgentPromptAssemblyInput,
  AgentPromptAssemblyResult,
  AgentPromptBudget,
  AgentPromptContext,
  AgentPromptSummary,
  AgentPromptSliceSource,
} from "./types.js";
import { DEFAULT_AGENT_PROMPT_BUDGET } from "./types.js";
import { buildAllCandidateSlices } from "./slice-builders.js";
import { adjustPrioritiesForRole, applyBudget } from "./prioritization.js";
import type { LanguageProfileId } from "../fingerprint/types.js";
import type { AgentRoleHint } from "../agents/types.js";

/* ------------------------------------------------------------------ */
/*  Budget resolution                                                  */
/* ------------------------------------------------------------------ */

/** Resolve a partial budget to a full budget with defaults. */
export function resolveBudget(partial?: Partial<AgentPromptBudget>): AgentPromptBudget {
  if (!partial) return DEFAULT_AGENT_PROMPT_BUDGET;
  return {
    maxTotalChars: partial.maxTotalChars ?? DEFAULT_AGENT_PROMPT_BUDGET.maxTotalChars,
    maxSlices: partial.maxSlices ?? DEFAULT_AGENT_PROMPT_BUDGET.maxSlices,
    maxSliceChars: partial.maxSliceChars ?? DEFAULT_AGENT_PROMPT_BUDGET.maxSliceChars,
    minPriority: partial.minPriority ?? DEFAULT_AGENT_PROMPT_BUDGET.minPriority,
    maxFiles: partial.maxFiles ?? DEFAULT_AGENT_PROMPT_BUDGET.maxFiles,
    maxSymbols: partial.maxSymbols ?? DEFAULT_AGENT_PROMPT_BUDGET.maxSymbols,
    maxDiagnostics: partial.maxDiagnostics ?? DEFAULT_AGENT_PROMPT_BUDGET.maxDiagnostics,
  };
}

/* ------------------------------------------------------------------ */
/*  Profile ID extraction                                              */
/* ------------------------------------------------------------------ */

/** Attempt to extract profile ID from available data. */
function extractProfileId(input: AgentPromptAssemblyInput): LanguageProfileId | null {
  if (input.profileSelection) {
    const primary = (input.profileSelection as Record<string, unknown>).primary;
    if (typeof primary === "object" && primary !== null && "id" in primary) {
      return (primary as Record<string, unknown>).id as LanguageProfileId;
    }
  }
  if (input.fingerprintSummary) {
    const profileId = (input.fingerprintSummary as Record<string, unknown>).profileId;
    if (typeof profileId === "string") return profileId as LanguageProfileId;
  }
  if (input.toolchainSummary) {
    const profileId = (input.toolchainSummary as Record<string, unknown>).profileId;
    if (typeof profileId === "string") return profileId as LanguageProfileId;
  }
  if (input.languageContextSummary) {
    const profileId = (input.languageContextSummary as Record<string, unknown>).profileId;
    if (typeof profileId === "string") return profileId as LanguageProfileId;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Summary builder                                                    */
/* ------------------------------------------------------------------ */

/** Build a compact summary from an assembly result. */
export function buildPromptSummary(result: AgentPromptAssemblyResult): AgentPromptSummary {
  const sources = new Set<AgentPromptSliceSource>();
  for (const slice of result.includedSlices) {
    sources.add(slice.source);
  }

  const anyTrimmed = result.includedSlices.some((s) => s.trimmed);

  const sourceList = [...sources].sort();
  const explanation = [
    `Context for ${result.agentKind}${result.roleHint ? `/${result.roleHint}` : ""}:`,
    `${result.includedSlices.length} slice(s) included from ${sourceList.length} source(s)`,
    `(${result.totalIncludedChars} chars)`,
    result.excludedSlices.length > 0
      ? `${result.excludedSlices.length} slice(s) excluded`
      : "",
    anyTrimmed ? "some slices trimmed" : "",
    result.profileId ? `profile: ${result.profileId}` : "no profile",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    agentKind: result.agentKind,
    roleHint: result.roleHint,
    profileId: result.profileId,
    includedSliceCount: result.includedSlices.length,
    excludedSliceCount: result.excludedSlices.length,
    totalChars: result.totalIncludedChars,
    contributingSources: sourceList,
    anyTrimmed,
    explanation,
    assembledAt: result.assembledAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Main assembly function                                             */
/* ------------------------------------------------------------------ */

/**
 * Assemble agent prompt context from available data sources.
 *
 * Deterministic: same inputs → same outputs.
 * Traceable: every inclusion/exclusion has a reason.
 * Budget-aware: never exceeds the configured limits.
 */
export function assembleAgentContext(
  input: AgentPromptAssemblyInput,
): AgentPromptContext {
  const budget = resolveBudget(input.budget);
  const profileId = extractProfileId(input);
  const roleHint: AgentRoleHint | null = input.roleHint ?? null;

  // Step 1: Build all candidate slices
  const candidates = buildAllCandidateSlices(
    {
      sessionSummary: input.sessionSummary ?? null,
      workspaceSummary: input.workspaceSummary ?? null,
      fingerprintSummary: input.fingerprintSummary ?? null,
      profileSelection: input.profileSelection ?? null,
      toolchainSummary: input.toolchainSummary ?? null,
      diagnosticsSummary: input.diagnosticsSummary ?? null,
      languageContextSummary: input.languageContextSummary ?? null,
      mcpSummary: input.mcpSummary ?? null,
      agentsSummary: input.agentsSummary ?? null,
      githubMcpSummary: input.githubMcpSummary ?? null,
    },
    budget,
  );

  // Step 2: Adjust priorities for agent role
  const adjusted = adjustPrioritiesForRole(candidates, input.agentKind, roleHint ?? undefined);

  // Step 3: Apply budget constraints
  const { included, excluded } = applyBudget(adjusted, budget);

  // Step 4: Build result
  const totalIncludedChars = included.reduce((sum, s) => sum + s.charCount, 0);
  const assembledAt = new Date().toISOString();

  const notes: string[] = [];
  if (!profileId) notes.push("No language profile available — context is generic.");
  if (included.length === 0) notes.push("No context slices available — all sources were unavailable or excluded.");
  if (included.some((s) => s.trimmed)) notes.push("Some slices were trimmed to fit budget constraints.");
  notes.push("Context is assembled deterministically. This is context preparation, not autonomous agent execution.");

  const assemblyResult: AgentPromptAssemblyResult = {
    agentKind: input.agentKind,
    roleHint,
    profileId,
    budget,
    includedSlices: included,
    excludedSlices: excluded,
    totalIncludedChars: totalIncludedChars,
    totalSlicesConsidered: candidates.length,
    assembledAt,
    notes,
  };

  // Step 5: Build summary and text
  const summary = buildPromptSummary(assemblyResult);
  const assembledText = included
    .map((s) => `--- ${s.label} ---\n${s.textContent}`)
    .join("\n\n");

  return {
    assembly: assemblyResult,
    summary,
    assembledText,
  };
}

/* ------------------------------------------------------------------ */
/*  Convenience: inspect assembly (for commands)                       */
/* ------------------------------------------------------------------ */

/**
 * Build a human-readable inspection of a context assembly result.
 *
 * Designed for the inspect_agent_context command output.
 */
export function inspectAssembly(result: AgentPromptAssemblyResult): string {
  const lines: string[] = [];

  lines.push(`Agent Context Assembly Report`);
  lines.push(`============================`);
  lines.push(`Agent kind: ${result.agentKind}`);
  lines.push(`Role hint: ${result.roleHint ?? "(none)"}`);
  lines.push(`Profile: ${result.profileId ?? "(none)"}`);
  lines.push(`Assembled at: ${result.assembledAt}`);
  lines.push(``);

  lines.push(`Budget:`);
  lines.push(`  Max total chars: ${result.budget.maxTotalChars}`);
  lines.push(`  Max slices: ${result.budget.maxSlices}`);
  lines.push(`  Max slice chars: ${result.budget.maxSliceChars}`);
  lines.push(`  Min priority: ${result.budget.minPriority}`);
  lines.push(``);

  lines.push(`Included slices (${result.includedSlices.length}):`);
  for (const slice of result.includedSlices) {
    lines.push(`  [${slice.priority}] ${slice.label} (${slice.source}) — ${slice.charCount} chars${slice.trimmed ? " [trimmed]" : ""}`);
    for (const reason of slice.reasons) {
      lines.push(`    ${reason.effect}: ${reason.explanation}`);
    }
  }
  lines.push(``);

  lines.push(`Excluded slices (${result.excludedSlices.length}):`);
  for (const slice of result.excludedSlices) {
    lines.push(`  [${slice.priority}] ${slice.label} (${slice.source})`);
    for (const reason of slice.reasons) {
      lines.push(`    ${reason.effect}: ${reason.explanation}`);
    }
  }
  lines.push(``);

  lines.push(`Summary:`);
  lines.push(`  Total chars included: ${result.totalIncludedChars}`);
  lines.push(`  Total slices considered: ${result.totalSlicesConsidered}`);
  lines.push(``);

  if (result.notes.length > 0) {
    lines.push(`Notes:`);
    for (const note of result.notes) {
      lines.push(`  - ${note}`);
    }
  }

  return lines.join("\n");
}
