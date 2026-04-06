/**
 * Fingerprint module — barrel exports.
 *
 * Repository fingerprinting and language profile support for the coding-agent platform.
 * Phase 38: Language support architecture and repository fingerprinting.
 */

/* types */
export type {
  DetectedLanguage,
  SignalStrength,
  FingerprintSignal,
  DetectedFramework,
  RepoFingerprint,
  LanguageProfileId,
  LanguageProfile,
  ProfileSelectionReason,
  ProfileSelection,
  ProfileAgentEnrichment,
} from "./types.js";

/* detection */
export {
  detectSignals,
  rankLanguages,
  extractFrameworks,
  fingerprintRepo,
} from "./detect.js";

/* profiles */
export {
  LANGUAGE_PROFILES,
  ALL_PROFILE_IDS,
  getProfile,
  getAllProfiles,
} from "./profiles.js";

/* selection */
export { selectProfiles } from "./select.js";

/* enrichment */
export {
  profileRelevantCapabilities,
  evaluateAgentForProfile,
  evaluateAgentsForProfile,
  getPreferredAgentsForProfile,
  buildEnrichmentSummary,
} from "./enrichment.js";
export type { EnrichmentAgentInfo } from "./enrichment.js";

/* session integration */
export {
  FINGERPRINT_EVENT_KINDS,
  isFingerprintEvent,
  repoFingerprinted,
  profileSelected,
  filterFingerprintEvents,
  buildFingerprintSummary,
} from "./session-integration.js";
export type {
  FingerprintEventKind,
  FingerprintSummary,
} from "./session-integration.js";
