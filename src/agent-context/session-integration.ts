/**
 * Agent context ↔ Session integration.
 *
 * Phase 44: Session events, event kinds, and summary builders for
 * the agent context / prompt assembly layer.
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { AgentPromptAssemblyResult, AgentPromptSummary } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                        */
/* ------------------------------------------------------------------ */

/** Event kinds emitted by the agent context layer. */
export type AgentContextEventKind =
  | "agent_context_assembled"
  | "agent_context_refreshed"
  | "agent_context_failed";

/** All agent context event kinds. */
export const AGENT_CONTEXT_EVENT_KINDS: readonly AgentContextEventKind[] = [
  "agent_context_assembled",
  "agent_context_refreshed",
  "agent_context_failed",
] as const;

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

/** Create an "agent context assembled" event. */
export function agentContextAssembled(
  summary: AgentPromptSummary,
): SessionEvent {
  return createEvent(
    "agent_context_assembled",
    `Agent context assembled for ${summary.agentKind}${summary.roleHint ? `/${summary.roleHint}` : ""}: ${summary.includedSliceCount} slices, ${summary.totalChars} chars (${summary.profileId ?? "no profile"})`,
    {
      agentKind: summary.agentKind,
      roleHint: summary.roleHint,
      profileId: summary.profileId,
      includedSliceCount: summary.includedSliceCount,
      excludedSliceCount: summary.excludedSliceCount,
      totalChars: summary.totalChars,
      contributingSources: [...summary.contributingSources],
      anyTrimmed: summary.anyTrimmed,
    },
  );
}

/** Create an "agent context refreshed" event. */
export function agentContextRefreshed(
  summary: AgentPromptSummary,
): SessionEvent {
  return createEvent(
    "agent_context_refreshed",
    `Agent context refreshed for ${summary.agentKind}: ${summary.includedSliceCount} slices, ${summary.totalChars} chars`,
    {
      agentKind: summary.agentKind,
      roleHint: summary.roleHint,
      includedSliceCount: summary.includedSliceCount,
      totalChars: summary.totalChars,
    },
  );
}

/** Create an "agent context failed" event. */
export function agentContextFailed(
  agentKind: string,
  error: string,
): SessionEvent {
  return createEvent(
    "agent_context_failed",
    `Agent context assembly failed for ${agentKind}: ${error}`,
    { agentKind, error },
  );
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                    */
/* ------------------------------------------------------------------ */

/** Check if an event is an agent context event. */
export function isAgentContextEvent(event: SessionEvent): boolean {
  return AGENT_CONTEXT_EVENT_KINDS.includes(
    event.kind as AgentContextEventKind,
  );
}

/** Filter events to only agent context events. */
export function filterAgentContextEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter(isAgentContextEvent);
}

/* ------------------------------------------------------------------ */
/*  Session summary contribution                                       */
/* ------------------------------------------------------------------ */

/**
 * Lightweight session summary contribution from agent context.
 * Designed for consumption by session summary builders.
 */
export interface AgentContextSessionSummary {
  /** Whether agent context has been assembled at least once. */
  readonly agentContextAssembled: boolean;
  /** Agent kind the last context was assembled for. */
  readonly agentContextAgentKind: string | null;
  /** Role hint used. */
  readonly agentContextRoleHint: string | null;
  /** Profile used. */
  readonly agentContextProfileId: string | null;
  /** Number of included slices. */
  readonly agentContextIncludedSlices: number | null;
  /** Number of excluded slices. */
  readonly agentContextExcludedSlices: number | null;
  /** Total chars included. */
  readonly agentContextTotalChars: number | null;
  /** Contributing sources. */
  readonly agentContextSources: readonly string[] | null;
  /** Whether any slices were trimmed. */
  readonly agentContextAnyTrimmed: boolean | null;
}

/** Build agent context session summary from an assembly result. */
export function buildAgentContextSessionSummary(
  result: AgentPromptAssemblyResult | null,
): AgentContextSessionSummary {
  if (!result) {
    return {
      agentContextAssembled: false,
      agentContextAgentKind: null,
      agentContextRoleHint: null,
      agentContextProfileId: null,
      agentContextIncludedSlices: null,
      agentContextExcludedSlices: null,
      agentContextTotalChars: null,
      agentContextSources: null,
      agentContextAnyTrimmed: null,
    };
  }

  const sources = new Set<string>();
  for (const s of result.includedSlices) sources.add(s.source);

  return {
    agentContextAssembled: true,
    agentContextAgentKind: result.agentKind,
    agentContextRoleHint: result.roleHint,
    agentContextProfileId: result.profileId,
    agentContextIncludedSlices: result.includedSlices.length,
    agentContextExcludedSlices: result.excludedSlices.length,
    agentContextTotalChars: result.totalIncludedChars,
    agentContextSources: [...sources].sort(),
    agentContextAnyTrimmed: result.includedSlices.some((s) => s.trimmed),
  };
}
