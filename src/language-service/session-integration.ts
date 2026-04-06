/**
 * Language-service → session event bridge.
 *
 * Phase 40: Creates session events for language-service lifecycle and
 * diagnostics, and builds session summary extensions.
 */

import type { SessionEvent, SessionEventKind } from "../session/types.js";
import type {
  LanguageServiceAvailability,
  WorkspaceDiagnosticSummary,
  LanguageServiceResultSummary,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                        */
/* ------------------------------------------------------------------ */

/** Event kinds introduced by the language-service layer (Phase 40). */
export type LanguageServiceEventKind =
  | "language_service_assessed"
  | "diagnostics_collected"
  | "diagnostics_collection_failed";

/** All language-service event kinds (for filtering). */
export const LANGUAGE_SERVICE_EVENT_KINDS: readonly LanguageServiceEventKind[] = [
  "language_service_assessed",
  "diagnostics_collected",
  "diagnostics_collection_failed",
];

/** Type guard for language-service events. */
export function isLanguageServiceEvent(event: SessionEvent): boolean {
  return (LANGUAGE_SERVICE_EVENT_KINDS as readonly string[]).includes(event.kind);
}

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

function makeEvent(
  kind: SessionEventKind,
  message: string,
  detail?: Record<string, unknown>,
): SessionEvent {
  return {
    kind,
    timestamp: new Date().toISOString(),
    message,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Create an event when language-service availability is assessed.
 */
export function languageServiceAssessed(
  availability: LanguageServiceAvailability,
): SessionEvent {
  return makeEvent(
    "language_service_assessed" as SessionEventKind,
    `Language service assessed: ${availability.serviceKind} — ${availability.status}`,
    {
      profileId: availability.profileId,
      serviceKind: availability.serviceKind,
      status: availability.status,
      explanation: availability.explanation,
      evidence: [...availability.evidence],
    },
  );
}

/**
 * Create an event when diagnostics are successfully collected.
 */
export function diagnosticsCollected(
  summary: WorkspaceDiagnosticSummary,
): SessionEvent {
  const severity = summary.errorCount > 0
    ? "note"
    : summary.warningCount > 0
      ? "info"
      : "info";

  return makeEvent(
    "diagnostics_collected" as SessionEventKind,
    `Diagnostics collected: ${summary.totalCount} issues ` +
    `(${summary.errorCount} errors, ${summary.warningCount} warnings) ` +
    `across ${summary.filesAffected} files`,
    {
      profileId: summary.profileId,
      serviceKind: summary.serviceKind,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      informationCount: summary.informationCount,
      hintCount: summary.hintCount,
      totalCount: summary.totalCount,
      filesAffected: summary.filesAffected,
      sampleMessages: [...summary.sampleMessages],
    },
  );
}

/**
 * Create an event when diagnostics collection fails.
 */
export function diagnosticsCollectionFailed(
  error: string,
  profileId: string,
): SessionEvent {
  return makeEvent(
    "diagnostics_collection_failed" as SessionEventKind,
    `Diagnostics collection failed: ${error}`,
    { profileId, error },
  );
}

/**
 * Create events from a full result summary.
 */
export function resultSummaryEvents(
  result: LanguageServiceResultSummary,
): SessionEvent[] {
  const events: SessionEvent[] = [];

  // Always emit the assessment event
  events.push(languageServiceAssessed(result.availability));

  // Emit collection events if attempted
  if (result.collectionAttempted) {
    if (result.collectionError) {
      events.push(
        diagnosticsCollectionFailed(result.collectionError, result.availability.profileId),
      );
    } else if (result.diagnosticsSummary?.collected) {
      events.push(diagnosticsCollected(result.diagnosticsSummary));
    }
  }

  return events;
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                    */
/* ------------------------------------------------------------------ */

/** Filter session events to language-service events only. */
export function filterLanguageServiceEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter(isLanguageServiceEvent);
}

/* ------------------------------------------------------------------ */
/*  Session summary extension                                          */
/* ------------------------------------------------------------------ */

/**
 * Language-service data to merge into SessionSummary.
 *
 * The SessionManager accepts this as an optional parameter when
 * building summaries.
 */
export interface LanguageServiceSessionSummary {
  /** Language service kind. */
  readonly serviceKind: string;
  /** Language service status. */
  readonly serviceStatus: string;
  /** Short label (e.g. "TypeScript Language Service"). */
  readonly serviceLabel: string;
  /** Whether diagnostics are available. */
  readonly diagnosticsAvailable: boolean;
  /** Unavailable reason (null if available). */
  readonly unavailableReason: string | null;
  /** Last diagnostics summary if collected. */
  readonly lastDiagnosticsErrorCount: number | null;
  readonly lastDiagnosticsWarningCount: number | null;
  readonly lastDiagnosticsTotalCount: number | null;
  readonly lastDiagnosticsFilesAffected: number | null;
}

/**
 * Build the session summary extension from availability + optional diagnostics.
 */
export function buildLanguageServiceSessionSummary(
  availability: LanguageServiceAvailability,
  diagnosticsSummary?: WorkspaceDiagnosticSummary | null,
): LanguageServiceSessionSummary {
  const isAvailable = availability.status === "available" || availability.status === "likely_available";

  const SERVICE_LABELS: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    php: "PHP",
    rust: "Rust",
    go: "Go",
    none: "No",
  };

  return {
    serviceKind: availability.serviceKind,
    serviceStatus: availability.status,
    serviceLabel: `${SERVICE_LABELS[availability.serviceKind] ?? availability.serviceKind} Language Service`,
    diagnosticsAvailable: isAvailable,
    unavailableReason: availability.unavailableReason,
    lastDiagnosticsErrorCount: diagnosticsSummary?.collected ? diagnosticsSummary.errorCount : null,
    lastDiagnosticsWarningCount: diagnosticsSummary?.collected ? diagnosticsSummary.warningCount : null,
    lastDiagnosticsTotalCount: diagnosticsSummary?.collected ? diagnosticsSummary.totalCount : null,
    lastDiagnosticsFilesAffected: diagnosticsSummary?.collected ? diagnosticsSummary.filesAffected : null,
  };
}
