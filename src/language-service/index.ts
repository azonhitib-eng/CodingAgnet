/**
 * Language-service module — barrel exports.
 *
 * Minimal LSP bridge and diagnostics layer.
 * Phase 40: Language-service / diagnostics domain.
 */

/* types */
export type {
  LanguageServiceKind,
  LanguageServiceStatus,
  DiagnosticSeverity,
  FileDiagnostic,
  WorkspaceDiagnosticSummary,
  LanguageContextHint,
  LanguageServiceUnavailableReason,
  LanguageServiceAvailability,
  LanguageServiceResultSummary,
} from "./types.js";

/* mapping */
export {
  mapProfileToServiceKind,
  getDiagnosticsSources,
  getDiagnosticsCommandHints,
  buildContextHint,
  getConfigEvidence,
  hasConfigEvidence,
} from "./mapping.js";

export type { DiagnosticsCommandHint } from "./mapping.js";

/* availability */
export {
  assessLanguageServiceAvailability,
  hasLanguageServiceSupport,
  getServiceLabel,
} from "./availability.js";

/* collection */
export {
  parseSimpleDiagnostics,
  buildDiagnosticsSummary,
  collectDiagnostics,
} from "./collection.js";

export type { DiagnosticsShellRunner } from "./collection.js";

/* session integration */
export {
  LANGUAGE_SERVICE_EVENT_KINDS,
  isLanguageServiceEvent,
  languageServiceAssessed,
  diagnosticsCollected,
  diagnosticsCollectionFailed,
  resultSummaryEvents,
  filterLanguageServiceEvents,
  buildLanguageServiceSessionSummary,
} from "./session-integration.js";

export type {
  LanguageServiceEventKind,
  LanguageServiceSessionSummary,
} from "./session-integration.js";
