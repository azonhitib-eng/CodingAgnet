/**
 * Fingerprint → session integration helpers.
 *
 * Event builders and summary helpers that connect repo fingerprinting
 * and language profiles to the session event model.
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

import type { SessionEvent, SessionEventKind } from "../session/types.js";
import type {
  ProfileSelection,
  RepoFingerprint,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Event kinds                                                       */
/* ------------------------------------------------------------------ */

/** Session event kinds introduced by fingerprinting. */
export type FingerprintEventKind =
  | "repo_fingerprinted"
  | "profile_selected";

/** All fingerprint event kinds as an array (for classification maps). */
export const FINGERPRINT_EVENT_KINDS: readonly FingerprintEventKind[] = [
  "repo_fingerprinted",
  "profile_selected",
];

/** Type guard for fingerprint events. */
export function isFingerprintEvent(kind: string): kind is FingerprintEventKind {
  return FINGERPRINT_EVENT_KINDS.includes(kind as FingerprintEventKind);
}

/* ------------------------------------------------------------------ */
/*  Event builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create a repo_fingerprinted event.
 */
export function repoFingerprinted(
  fingerprint: RepoFingerprint,
): SessionEvent {
  const langList = fingerprint.languages.join(", ") || "none";
  return {
    kind: "repo_fingerprinted" as SessionEventKind,
    timestamp: new Date().toISOString(),
    message: `Repository fingerprinted: detected languages [${langList}]${
      fingerprint.isMixed ? " (mixed)" : ""
    }.`,
    detail: {
      path: fingerprint.path,
      languages: [...fingerprint.languages],
      frameworkCount: fingerprint.frameworks.length,
      signalCount: fingerprint.signals.length,
      isMixed: fingerprint.isMixed,
      hasStrongSignal: fingerprint.hasStrongSignal,
    },
  };
}

/**
 * Create a profile_selected event.
 */
export function profileSelected(
  selection: ProfileSelection,
): SessionEvent {
  return {
    kind: "profile_selected" as SessionEventKind,
    timestamp: new Date().toISOString(),
    message: `Language profile selected: ${selection.primary.label}${
      !selection.confident ? " (uncertain)" : ""
    }. ${selection.explanation}`,
    detail: {
      profileId: selection.primary.id,
      profileLabel: selection.primary.label,
      primaryLanguage: selection.primary.primaryLanguage,
      matchedCount: selection.matched.length,
      reason: selection.reason,
      confident: selection.confident,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Event filtering                                                   */
/* ------------------------------------------------------------------ */

/**
 * Filter session events to only fingerprint-related events.
 */
export function filterFingerprintEvents(
  events: readonly SessionEvent[],
): SessionEvent[] {
  return events.filter((e) => isFingerprintEvent(e.kind));
}

/* ------------------------------------------------------------------ */
/*  Summary helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a fingerprint summary suitable for inclusion in SessionSummary.
 */
export interface FingerprintSummary {
  /** Detected languages (ordered by strength). */
  readonly detectedLanguages: readonly string[];
  /** Detected frameworks. */
  readonly detectedFrameworks: readonly string[];
  /** Whether the repo is mixed/multi-language. */
  readonly isMixed: boolean;
  /** Number of evidence signals found. */
  readonly signalCount: number;
  /** Selected profile id. */
  readonly profileId: string;
  /** Selected profile label. */
  readonly profileLabel: string;
  /** Primary language. */
  readonly primaryLanguage: string;
  /** Selection reason. */
  readonly selectionReason: string;
  /** Human-readable selection explanation. */
  readonly selectionExplanation: string;
  /** Whether the selection is confident. */
  readonly selectionConfident: boolean;
}

/**
 * Build a FingerprintSummary from a fingerprint and profile selection.
 */
export function buildFingerprintSummary(
  fingerprint: RepoFingerprint,
  selection: ProfileSelection,
): FingerprintSummary {
  return {
    detectedLanguages: [...fingerprint.languages],
    detectedFrameworks: fingerprint.frameworks.map((f) => f.name),
    isMixed: fingerprint.isMixed,
    signalCount: fingerprint.signals.length,
    profileId: selection.primary.id,
    profileLabel: selection.primary.label,
    primaryLanguage: selection.primary.primaryLanguage,
    selectionReason: selection.reason,
    selectionExplanation: selection.explanation,
    selectionConfident: selection.confident,
  };
}
