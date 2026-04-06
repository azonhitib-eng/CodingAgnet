/**
 * Context traceability helpers.
 *
 * Phase 44: Utilities for inspecting and explaining context assembly
 * decisions. Every context slice has reasons — these helpers make
 * those reasons accessible.
 */

import type {
  AgentPromptAssemblyResult,
  AgentPromptContextSlice,
  AgentPromptReason,
  AgentPromptEvidence,
  AgentPromptSliceSource,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Slice inspection                                                   */
/* ------------------------------------------------------------------ */

/** Get all reasons for a specific slice by ID. */
export function getSliceReasons(
  result: AgentPromptAssemblyResult,
  sliceId: string,
): readonly AgentPromptReason[] {
  const all = [...result.includedSlices, ...result.excludedSlices];
  const slice = all.find((s) => s.sliceId === sliceId);
  return slice?.reasons ?? [];
}

/** Get all evidence for a specific slice by ID. */
export function getSliceEvidence(
  result: AgentPromptAssemblyResult,
  sliceId: string,
): readonly AgentPromptEvidence[] {
  const all = [...result.includedSlices, ...result.excludedSlices];
  const slice = all.find((s) => s.sliceId === sliceId);
  return slice?.evidence ?? [];
}

/** Find a slice by ID (included or excluded). */
export function findSlice(
  result: AgentPromptAssemblyResult,
  sliceId: string,
): AgentPromptContextSlice | null {
  const all = [...result.includedSlices, ...result.excludedSlices];
  return all.find((s) => s.sliceId === sliceId) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Source inspection                                                  */
/* ------------------------------------------------------------------ */

/** Get all slices from a specific source. */
export function getSlicesBySource(
  result: AgentPromptAssemblyResult,
  source: AgentPromptSliceSource,
): { included: readonly AgentPromptContextSlice[]; excluded: readonly AgentPromptContextSlice[] } {
  return {
    included: result.includedSlices.filter((s) => s.source === source),
    excluded: result.excludedSlices.filter((s) => s.source === source),
  };
}

/** Get all contributing sources (sources with at least one included slice). */
export function getContributingSources(
  result: AgentPromptAssemblyResult,
): readonly AgentPromptSliceSource[] {
  const sources = new Set<AgentPromptSliceSource>();
  for (const slice of result.includedSlices) {
    sources.add(slice.source);
  }
  return [...sources].sort();
}

/* ------------------------------------------------------------------ */
/*  Inclusion / exclusion reasoning                                    */
/* ------------------------------------------------------------------ */

/** Get all inclusion reasons across all slices. */
export function getAllInclusionReasons(
  result: AgentPromptAssemblyResult,
): readonly { sliceId: string; label: string; reason: AgentPromptReason }[] {
  const reasons: { sliceId: string; label: string; reason: AgentPromptReason }[] = [];
  for (const slice of result.includedSlices) {
    for (const reason of slice.reasons) {
      if (reason.effect === "included") {
        reasons.push({ sliceId: slice.sliceId, label: slice.label, reason });
      }
    }
  }
  return reasons;
}

/** Get all exclusion reasons across all slices. */
export function getAllExclusionReasons(
  result: AgentPromptAssemblyResult,
): readonly { sliceId: string; label: string; reason: AgentPromptReason }[] {
  const reasons: { sliceId: string; label: string; reason: AgentPromptReason }[] = [];
  for (const slice of result.excludedSlices) {
    for (const reason of slice.reasons) {
      if (reason.effect === "excluded") {
        reasons.push({ sliceId: slice.sliceId, label: slice.label, reason });
      }
    }
  }
  return reasons;
}

/* ------------------------------------------------------------------ */
/*  Compact explanation                                                */
/* ------------------------------------------------------------------ */

/**
 * Build a compact, human-readable explanation of the assembly.
 *
 * Returns a multi-line string suitable for display in session timeline
 * or quick inspection.
 */
export function buildCompactExplanation(
  result: AgentPromptAssemblyResult,
): string {
  const lines: string[] = [];

  lines.push(`Context for ${result.agentKind}${result.roleHint ? ` (${result.roleHint})` : ""}:`);

  if (result.profileId) {
    lines.push(`  Profile: ${result.profileId}`);
  }

  if (result.includedSlices.length > 0) {
    lines.push(`  Included (${result.includedSlices.length}):`);
    for (const slice of result.includedSlices) {
      const trimNote = slice.trimmed ? " [trimmed]" : "";
      lines.push(`    • ${slice.label} [${slice.priority}]${trimNote}`);
    }
  }

  if (result.excludedSlices.length > 0) {
    const unavailable = result.excludedSlices.filter((s) =>
      s.reasons.some((r) => r.kind === "source_unavailable"),
    );
    const budgetExcluded = result.excludedSlices.filter((s) =>
      s.reasons.some((r) => r.kind === "budget_exceeded" || r.kind === "priority_cutoff"),
    );

    if (unavailable.length > 0) {
      lines.push(`  Unavailable (${unavailable.length}): ${unavailable.map((s) => s.label).join(", ")}`);
    }
    if (budgetExcluded.length > 0) {
      lines.push(`  Budget-excluded (${budgetExcluded.length}): ${budgetExcluded.map((s) => s.label).join(", ")}`);
    }
  }

  lines.push(`  Total: ${result.totalIncludedChars} chars, ${result.totalSlicesConsidered} considered`);

  return lines.join("\n");
}

/**
 * Build a one-line summary of the assembly.
 */
export function buildOneLinerSummary(
  result: AgentPromptAssemblyResult,
): string {
  return `${result.agentKind}${result.roleHint ? `/${result.roleHint}` : ""}: ${result.includedSlices.length} slices, ${result.totalIncludedChars} chars (${result.profileId ?? "no profile"})`;
}
