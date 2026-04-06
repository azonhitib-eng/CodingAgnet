/**
 * Profile selection — deterministic mapping from RepoFingerprint to LanguageProfile(s).
 *
 * Design:
 * - Explicit, deterministic, testable
 * - Honest about mixed or uncertain repos
 * - Always returns at least the generic-unknown fallback
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

import type {
  DetectedLanguage,
  LanguageProfile,
  LanguageProfileId,
  ProfileSelection,
  ProfileSelectionReason,
  RepoFingerprint,
} from "./types.js";
import { LANGUAGE_PROFILES } from "./profiles.js";

/* ------------------------------------------------------------------ */
/*  Language → profile mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Map a detected language to a default profile id.
 * This is the base mapping before framework-specific refinement.
 */
function languageToDefaultProfile(lang: DetectedLanguage): LanguageProfileId {
  switch (lang) {
    case "typescript":
      return "typescript-node";
    case "javascript":
      return "javascript-node";
    case "python":
      return "python-backend";
    case "php":
      return "php-general";
    case "rust":
      return "rust-cli";
    case "go":
      return "go-module";
    default:
      return "generic-unknown";
  }
}

/* ------------------------------------------------------------------ */
/*  Framework refinement                                              */
/* ------------------------------------------------------------------ */

/**
 * Refine a PHP profile if WordPress-specific frameworks are detected.
 */
function refinePhpProfile(fingerprint: RepoFingerprint): LanguageProfileId {
  const wpFrameworks = fingerprint.frameworks.filter(
    (f) =>
      f.name === "wordpress" ||
      f.name === "wordpress-theme",
  );
  if (wpFrameworks.length > 0) {
    return "php-wordpress";
  }
  return "php-general";
}

/* ------------------------------------------------------------------ */
/*  Selection logic                                                   */
/* ------------------------------------------------------------------ */

/**
 * Select one or more language profiles from a repo fingerprint.
 *
 * This is the primary public API for profile selection.
 *
 * @param fingerprint - the result of fingerprintRepo()
 * @returns deterministic ProfileSelection
 */
export function selectProfiles(
  fingerprint: RepoFingerprint,
): ProfileSelection {
  // No signals at all → generic fallback
  if (fingerprint.signals.length === 0 || fingerprint.languages.length === 0) {
    return {
      primary: LANGUAGE_PROFILES["generic-unknown"],
      matched: [LANGUAGE_PROFILES["generic-unknown"]],
      reason: "no_signals",
      explanation: "No recognized language or framework signals were found in the repository.",
      confident: false,
    };
  }

  // Build matched profiles from all detected languages
  const matched: LanguageProfile[] = [];
  const seen = new Set<LanguageProfileId>();

  for (const lang of fingerprint.languages) {
    let profileId = languageToDefaultProfile(lang);

    // Refine PHP if needed
    if (lang === "php") {
      profileId = refinePhpProfile(fingerprint);
    }

    if (!seen.has(profileId)) {
      seen.add(profileId);
      matched.push(LANGUAGE_PROFILES[profileId]);
    }
  }

  // If somehow nothing matched (shouldn't happen), fallback
  if (matched.length === 0) {
    return {
      primary: LANGUAGE_PROFILES["generic-unknown"],
      matched: [LANGUAGE_PROFILES["generic-unknown"]],
      reason: "fallback",
      explanation: "No profiles matched the detected signals — falling back to generic.",
      confident: false,
    };
  }

  // Pick the primary profile (first in list = strongest language)
  const primary = matched[0];

  // Determine reason and confidence
  const { reason, confident, explanation } = classifySelection(
    fingerprint,
    primary,
    matched,
  );

  return { primary, matched, reason, explanation, confident };
}

/* ------------------------------------------------------------------ */
/*  Classification helpers                                            */
/* ------------------------------------------------------------------ */

function classifySelection(
  fingerprint: RepoFingerprint,
  primary: LanguageProfile,
  matched: readonly LanguageProfile[],
): {
  reason: ProfileSelectionReason;
  confident: boolean;
  explanation: string;
} {
  // Check if there are framework-specific matches
  const hasFrameworkMatch = fingerprint.frameworks.some(
    (f) => f.language === primary.primaryLanguage && f.confidence === "strong",
  );

  if (fingerprint.hasStrongSignal && !fingerprint.isMixed) {
    return {
      reason: hasFrameworkMatch ? "framework_match" : "strong_language_match",
      confident: true,
      explanation: `Strong ${primary.primaryLanguage} signals detected${
        hasFrameworkMatch
          ? ` with ${fingerprint.frameworks
              .filter((f) => f.language === primary.primaryLanguage)
              .map((f) => f.name)
              .join(", ")} framework(s)`
          : ""
      }.`,
    };
  }

  if (fingerprint.hasStrongSignal && fingerprint.isMixed) {
    return {
      reason: "strong_language_match",
      confident: false,
      explanation: `Mixed repository with ${matched.length} detected profiles: ${matched
        .map((p) => p.label)
        .join(", ")}. Primary selected based on strongest signals.`,
    };
  }

  if (!fingerprint.hasStrongSignal) {
    return {
      reason: "weak_signal_only",
      confident: false,
      explanation: `Only weak/moderate signals found for ${primary.primaryLanguage}. Detection may be incomplete.`,
    };
  }

  return {
    reason: "moderate_language_match",
    confident: true,
    explanation: `Moderate ${primary.primaryLanguage} signals detected.`,
  };
}
