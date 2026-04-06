/**
 * Agent context / prompt domain types.
 *
 * Phase 44: Context-informed agent prompting.
 *
 * Typed, explicit models for assembling deterministic, inspectable context
 * packets for agent roles. This is context preparation — NOT autonomous agent
 * execution, NOT free-form prompt engineering, NOT a conversational loop.
 *
 * Design rules:
 * - Every context slice has an explicit source and reason
 * - Assembly is deterministic for the same inputs
 * - Budget/trimming is explicit and inspectable
 * - Unavailable data remains explicitly unavailable
 */

import type { AgentKind, AgentRoleHint } from "../agents/types.js";
import type { LanguageProfileId } from "../fingerprint/types.js";

/* ------------------------------------------------------------------ */
/*  Priority                                                           */
/* ------------------------------------------------------------------ */

/**
 * Priority level for a context slice.
 *
 * Higher priority slices are included first when budget is limited.
 */
export type AgentPromptPriority =
  | "critical"    // must be included if available (e.g. profile identity)
  | "high"        // strongly recommended (e.g. entrypoints, severe diagnostics)
  | "medium"      // useful but trimmable (e.g. module listing, optional tools)
  | "low"         // nice-to-have (e.g. detailed symbol lists, informational diagnostics)
  | "excluded";   // explicitly excluded from this assembly

/* ------------------------------------------------------------------ */
/*  Reason / evidence                                                  */
/* ------------------------------------------------------------------ */

/** Why a context slice was included or excluded. */
export type AgentPromptReasonKind =
  | "role_match"               // slice is relevant to the agent's role
  | "profile_match"            // slice matches the workspace profile
  | "priority_cutoff"          // excluded because below priority budget
  | "budget_exceeded"          // excluded because token/char budget was exhausted
  | "source_unavailable"       // the data source was not available
  | "explicitly_excluded"      // excluded by configuration or rule
  | "always_included"          // always included for all agents
  | "severity_threshold"       // included/excluded based on diagnostic severity
  | "relevance_score";         // included/excluded based on computed relevance

/**
 * A single reason explaining why a context slice was included or excluded.
 */
export interface AgentPromptReason {
  /** What kind of reason this is. */
  readonly kind: AgentPromptReasonKind;
  /** Human-readable explanation. */
  readonly explanation: string;
  /** Whether this reason caused inclusion or exclusion. */
  readonly effect: "included" | "excluded";
}

/**
 * Evidence supporting a context slice's inclusion.
 */
export interface AgentPromptEvidence {
  /** Source of the evidence (e.g. "fingerprint", "diagnostics", "toolchain"). */
  readonly source: string;
  /** Brief description of what was found. */
  readonly description: string;
  /** Optional reference (file path, tool id, etc.). */
  readonly reference?: string;
}

/* ------------------------------------------------------------------ */
/*  Slice source                                                       */
/* ------------------------------------------------------------------ */

/** Known sources that can contribute context slices. */
export type AgentPromptSliceSource =
  | "session"
  | "workspace"
  | "fingerprint"
  | "toolchain"
  | "diagnostics"
  | "language_context"
  | "mcp"
  | "agents"
  | "github_mcp";

/* ------------------------------------------------------------------ */
/*  Context slice                                                      */
/* ------------------------------------------------------------------ */

/**
 * A single typed slice of context prepared for an agent.
 *
 * Each slice carries its source, priority, reasons, and content.
 * Slices are the atomic unit of context assembly.
 */
export interface AgentPromptContextSlice {
  /** Unique identifier for this slice (e.g. "session_summary", "diagnostics_errors"). */
  readonly sliceId: string;
  /** Which source produced this slice. */
  readonly source: AgentPromptSliceSource;
  /** Display label for the slice. */
  readonly label: string;
  /** Priority of this slice within the assembly. */
  readonly priority: AgentPromptPriority;
  /** Structured content of this slice (key-value pairs for deterministic rendering). */
  readonly content: Readonly<Record<string, unknown>>;
  /** Compact text representation of this slice (for prompt rendering). */
  readonly textContent: string;
  /** Character count of the text content. */
  readonly charCount: number;
  /** Why this slice was included. */
  readonly reasons: readonly AgentPromptReason[];
  /** Supporting evidence. */
  readonly evidence: readonly AgentPromptEvidence[];
  /** Whether this slice was trimmed to fit budget. */
  readonly trimmed: boolean;
  /** Original char count before trimming (null if not trimmed). */
  readonly originalCharCount: number | null;
}

/* ------------------------------------------------------------------ */
/*  Budget / limits                                                    */
/* ------------------------------------------------------------------ */

/**
 * Budget constraints for context assembly.
 *
 * The system never dumps everything — it respects explicit limits.
 */
export interface AgentPromptBudget {
  /** Maximum total character count for all slices combined. */
  readonly maxTotalChars: number;
  /** Maximum number of slices to include. */
  readonly maxSlices: number;
  /** Maximum characters per individual slice. */
  readonly maxSliceChars: number;
  /** Minimum priority level to include. */
  readonly minPriority: AgentPromptPriority;
  /** Maximum number of files/modules to list. */
  readonly maxFiles: number;
  /** Maximum number of symbols to list. */
  readonly maxSymbols: number;
  /** Maximum number of diagnostics to include. */
  readonly maxDiagnostics: number;
}

/** Default budget values. */
export const DEFAULT_AGENT_PROMPT_BUDGET: AgentPromptBudget = {
  maxTotalChars: 8000,
  maxSlices: 15,
  maxSliceChars: 2000,
  minPriority: "low",
  maxFiles: 20,
  maxSymbols: 30,
  maxDiagnostics: 10,
} as const;

/* ------------------------------------------------------------------ */
/*  Assembly input                                                     */
/* ------------------------------------------------------------------ */

/**
 * Input for context assembly.
 *
 * Provides all the structured data sources that could contribute
 * to an agent's context. Any field may be null/undefined if the
 * data is not available — the assembly is honest about gaps.
 */
export interface AgentPromptAssemblyInput {
  /** Agent kind requesting context. */
  readonly agentKind: AgentKind;
  /** Optional role hint for more specific assembly. */
  readonly roleHint?: AgentRoleHint;
  /** Session summary data (session stage, status, events, etc.). */
  readonly sessionSummary?: Readonly<Record<string, unknown>> | null;
  /** Workspace summary data (path, branch, repo meta, etc.). */
  readonly workspaceSummary?: Readonly<Record<string, unknown>> | null;
  /** Repo fingerprint/profile data. */
  readonly fingerprintSummary?: Readonly<Record<string, unknown>> | null;
  /** Profile selection data. */
  readonly profileSelection?: Readonly<Record<string, unknown>> | null;
  /** Toolchain summary data. */
  readonly toolchainSummary?: Readonly<Record<string, unknown>> | null;
  /** Diagnostics summary data. */
  readonly diagnosticsSummary?: Readonly<Record<string, unknown>> | null;
  /** Language context summary data. */
  readonly languageContextSummary?: Readonly<Record<string, unknown>> | null;
  /** MCP attachment/tool summary data. */
  readonly mcpSummary?: Readonly<Record<string, unknown>> | null;
  /** Attached agent/routing summary data. */
  readonly agentsSummary?: Readonly<Record<string, unknown>> | null;
  /** GitHub MCP summary data. */
  readonly githubMcpSummary?: Readonly<Record<string, unknown>> | null;
  /** Budget constraints (defaults applied if not provided). */
  readonly budget?: Partial<AgentPromptBudget>;
}

/* ------------------------------------------------------------------ */
/*  Assembly result                                                    */
/* ------------------------------------------------------------------ */

/**
 * Result of a context assembly operation.
 *
 * Fully inspectable — every included and excluded slice is tracked.
 */
export interface AgentPromptAssemblyResult {
  /** Agent kind this was assembled for. */
  readonly agentKind: AgentKind;
  /** Role hint used (if any). */
  readonly roleHint: AgentRoleHint | null;
  /** Profile used for assembly (if available). */
  readonly profileId: LanguageProfileId | null;
  /** Budget that was applied. */
  readonly budget: AgentPromptBudget;
  /** Slices that were included in the final context. */
  readonly includedSlices: readonly AgentPromptContextSlice[];
  /** Slices that were excluded (with reasons). */
  readonly excludedSlices: readonly AgentPromptContextSlice[];
  /** Total character count of included slices. */
  readonly totalIncludedChars: number;
  /** Total number of slices considered. */
  readonly totalSlicesConsidered: number;
  /** ISO-8601 timestamp when this assembly was generated. */
  readonly assembledAt: string;
  /** Human-readable assembly notes. */
  readonly notes: readonly string[];
}

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compact summary of a context assembly result.
 *
 * Designed for session timeline display or quick inspection.
 */
export interface AgentPromptSummary {
  /** Agent kind this was assembled for. */
  readonly agentKind: AgentKind;
  /** Role hint used. */
  readonly roleHint: AgentRoleHint | null;
  /** Profile used. */
  readonly profileId: LanguageProfileId | null;
  /** Number of included slices. */
  readonly includedSliceCount: number;
  /** Number of excluded slices. */
  readonly excludedSliceCount: number;
  /** Total characters included. */
  readonly totalChars: number;
  /** Sources that contributed slices. */
  readonly contributingSources: readonly AgentPromptSliceSource[];
  /** Whether any slices were trimmed. */
  readonly anyTrimmed: boolean;
  /** Compact human-readable explanation. */
  readonly explanation: string;
  /** ISO-8601 timestamp. */
  readonly assembledAt: string;
}

/* ------------------------------------------------------------------ */
/*  Context (top-level wrapper)                                        */
/* ------------------------------------------------------------------ */

/**
 * Top-level agent prompt context.
 *
 * Wraps the assembly result with the full assembled text
 * and a compact summary for inspection.
 */
export interface AgentPromptContext {
  /** The full assembly result (inspectable). */
  readonly assembly: AgentPromptAssemblyResult;
  /** Compact summary for quick review. */
  readonly summary: AgentPromptSummary;
  /** The assembled context text (concatenation of included slices). */
  readonly assembledText: string;
}
