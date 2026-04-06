/**
 * Language context session integration.
 *
 * Phase 43: Session event kinds, event factories, and summary builders
 * for the language context / intelligence layer.
 */

import type { SessionEvent } from "../session/types.js";
import type { WorkspaceContextSummary } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                        */
/* ------------------------------------------------------------------ */

/** Event kinds emitted by the language context layer. */
export type LanguageContextEventKind =
  | "workspace_context_collected"
  | "workspace_context_refreshed"
  | "workspace_context_failed";

/** All language context event kinds. */
export const LANGUAGE_CONTEXT_EVENT_KINDS: readonly LanguageContextEventKind[] = [
  "workspace_context_collected",
  "workspace_context_refreshed",
  "workspace_context_failed",
] as const;

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

/** Create a "workspace context collected" event. */
export function workspaceContextCollected(
  summary: WorkspaceContextSummary,
): SessionEvent {
  return {
    kind: "workspace_context_collected",
    timestamp: new Date().toISOString(),
    message: `Workspace context collected: ${summary.totalFilesAnalyzed} files analyzed, ${summary.notableSymbols.length} notable symbols, ${summary.entrypoints.length} entrypoints (profile: ${summary.profileId})`,
    detail: {
      profileId: summary.profileId,
      totalFilesAnalyzed: summary.totalFilesAnalyzed,
      filesWithContent: summary.filesWithContentAnalysis,
      entrypointCount: summary.entrypoints.length,
      configFileCount: summary.configFiles.length,
      testFileCount: summary.testFiles.length,
      notableSymbolCount: summary.notableSymbols.length,
      moduleCount: summary.modules.length,
      collectionStatus: summary.collectionStatus,
      confidence: summary.confidence,
    },
  };
}

/** Create a "workspace context refreshed" event. */
export function workspaceContextRefreshed(
  summary: WorkspaceContextSummary,
): SessionEvent {
  return {
    kind: "workspace_context_refreshed",
    timestamp: new Date().toISOString(),
    message: `Workspace context refreshed: ${summary.totalFilesAnalyzed} files, ${summary.notableSymbols.length} notable symbols (profile: ${summary.profileId})`,
    detail: {
      profileId: summary.profileId,
      totalFilesAnalyzed: summary.totalFilesAnalyzed,
      filesWithContent: summary.filesWithContentAnalysis,
      notableSymbolCount: summary.notableSymbols.length,
      collectionStatus: summary.collectionStatus,
      confidence: summary.confidence,
    },
  };
}

/** Create a "workspace context failed" event. */
export function workspaceContextFailed(
  error: string,
  profileId: string,
): SessionEvent {
  return {
    kind: "workspace_context_failed",
    timestamp: new Date().toISOString(),
    message: `Workspace context collection failed: ${error} (profile: ${profileId})`,
    detail: { profileId, error },
  };
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                    */
/* ------------------------------------------------------------------ */

/** Check if an event is a language context event. */
export function isLanguageContextEvent(event: SessionEvent): boolean {
  return LANGUAGE_CONTEXT_EVENT_KINDS.includes(
    event.kind as LanguageContextEventKind,
  );
}

/** Filter events to only language context events. */
export function filterLanguageContextEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter(isLanguageContextEvent);
}

/* ------------------------------------------------------------------ */
/*  Session summary extension                                          */
/* ------------------------------------------------------------------ */

/**
 * Lightweight session summary contribution from language context.
 * Designed to be consumed by SessionManager.getSessionSummary().
 */
export interface LanguageContextSessionSummary {
  /** Whether context has been collected for this workspace. */
  readonly contextCollected: boolean;
  /** Profile used for context analysis. */
  readonly contextProfileId: string | null;
  /** Collection status. */
  readonly contextCollectionStatus: string | null;
  /** Total files analyzed. */
  readonly contextTotalFiles: number | null;
  /** Number of files analyzed with content. */
  readonly contextFilesWithContent: number | null;
  /** Number of entrypoints found. */
  readonly contextEntrypointCount: number | null;
  /** Number of config files found. */
  readonly contextConfigFileCount: number | null;
  /** Number of test files found. */
  readonly contextTestFileCount: number | null;
  /** Number of notable symbols found. */
  readonly contextNotableSymbolCount: number | null;
  /** Number of modules found. */
  readonly contextModuleCount: number | null;
  /** Overall confidence. */
  readonly contextConfidence: string | null;
}

/** Build a language context session summary from a workspace context summary. */
export function buildLanguageContextSessionSummary(
  contextSummary: WorkspaceContextSummary | null,
): LanguageContextSessionSummary {
  if (!contextSummary) {
    return {
      contextCollected: false,
      contextProfileId: null,
      contextCollectionStatus: null,
      contextTotalFiles: null,
      contextFilesWithContent: null,
      contextEntrypointCount: null,
      contextConfigFileCount: null,
      contextTestFileCount: null,
      contextNotableSymbolCount: null,
      contextModuleCount: null,
      contextConfidence: null,
    };
  }

  return {
    contextCollected: true,
    contextProfileId: contextSummary.profileId,
    contextCollectionStatus: contextSummary.collectionStatus,
    contextTotalFiles: contextSummary.totalFilesAnalyzed,
    contextFilesWithContent: contextSummary.filesWithContentAnalysis,
    contextEntrypointCount: contextSummary.entrypoints.length,
    contextConfigFileCount: contextSummary.configFiles.length,
    contextTestFileCount: contextSummary.testFiles.length,
    contextNotableSymbolCount: contextSummary.notableSymbols.length,
    contextModuleCount: contextSummary.modules.length,
    contextConfidence: contextSummary.confidence,
  };
}
