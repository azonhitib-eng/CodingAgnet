/**
 * Repository fingerprinting and language profile types.
 *
 * Typed, explicit models for understanding what kind of repository/workspace
 * the product is operating on, and which language/toolchain profiles are relevant.
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

/* ------------------------------------------------------------------ */
/*  Detected language identifiers                                     */
/* ------------------------------------------------------------------ */

/** Well-known primary languages that can be detected. */
export type DetectedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "php"
  | "rust"
  | "go"
  | "unknown";

/* ------------------------------------------------------------------ */
/*  Signal / evidence                                                 */
/* ------------------------------------------------------------------ */

/** Confidence level for a fingerprint signal. */
export type SignalStrength = "strong" | "moderate" | "weak";

/**
 * A single evidence file or pattern detected in the repository.
 *
 * This is the atomic unit of fingerprinting — each signal is an explicit
 * record of what was found and what it implies.
 */
export interface FingerprintSignal {
  /** The evidence file or pattern that was detected. */
  readonly file: string;
  /** Which language this signal implies. */
  readonly language: DetectedLanguage;
  /** How strongly this signal implies the language. */
  readonly strength: SignalStrength;
  /** Optional framework or toolchain hint derived from this signal. */
  readonly frameworkHint?: string;
}

/* ------------------------------------------------------------------ */
/*  Detected framework / toolchain                                    */
/* ------------------------------------------------------------------ */

/** A framework or toolchain detected in the repository. */
export interface DetectedFramework {
  /** Framework/toolchain name (e.g. "node", "wordpress", "django"). */
  readonly name: string;
  /** Primary language this framework is associated with. */
  readonly language: DetectedLanguage;
  /** Confidence of this detection. */
  readonly confidence: SignalStrength;
}

/* ------------------------------------------------------------------ */
/*  RepoFingerprint                                                   */
/* ------------------------------------------------------------------ */

/**
 * The result of fingerprinting a repository / workspace.
 *
 * This is the complete, explicit, typed output of the detection process.
 * Nothing is hidden in heuristics — every conclusion is traceable to signals.
 */
export interface RepoFingerprint {
  /** The path that was fingerprinted. */
  readonly path: string;
  /** ISO-8601 timestamp of when the fingerprint was taken. */
  readonly detectedAt: string;
  /** All detected languages, ordered by signal strength (strongest first). */
  readonly languages: readonly DetectedLanguage[];
  /** All detected frameworks / toolchains. */
  readonly frameworks: readonly DetectedFramework[];
  /** The raw evidence signals found in the repository. */
  readonly signals: readonly FingerprintSignal[];
  /** Whether the repository appears to be a mixed/multi-language project. */
  readonly isMixed: boolean;
  /** Whether detection produced any strong signals at all. */
  readonly hasStrongSignal: boolean;
}

/* ------------------------------------------------------------------ */
/*  Language profile identifiers                                      */
/* ------------------------------------------------------------------ */

/** Well-known language/toolchain profile identifiers. */
export type LanguageProfileId =
  | "typescript-node"
  | "javascript-node"
  | "python-backend"
  | "php-general"
  | "php-wordpress"
  | "rust-cli"
  | "go-module"
  | "generic-unknown";

/* ------------------------------------------------------------------ */
/*  Language profile                                                  */
/* ------------------------------------------------------------------ */

/**
 * A language/toolchain profile describing how the product should
 * understand and interact with a particular kind of repository.
 *
 * Each profile is explicit, typed, and deterministic.
 */
export interface LanguageProfile {
  /** Unique profile identifier. */
  readonly id: LanguageProfileId;
  /** Human-readable display label. */
  readonly label: string;
  /** Primary language for this profile. */
  readonly primaryLanguage: DetectedLanguage;
  /** Common toolchain hints (e.g. "npm", "pip", "cargo"). */
  readonly toolchainHints: readonly string[];
  /** Related agent capabilities / workflow stages this profile is most relevant to. */
  readonly relatedCapabilities: readonly string[];
  /** Optional preferred agent role hints for this profile. */
  readonly preferredAgentRoles: readonly string[];
}

/* ------------------------------------------------------------------ */
/*  Profile selection                                                 */
/* ------------------------------------------------------------------ */

/** Reason why a profile was selected (or not). */
export type ProfileSelectionReason =
  | "strong_language_match"
  | "moderate_language_match"
  | "framework_match"
  | "weak_signal_only"
  | "no_signals"
  | "fallback";

/**
 * The result of mapping a RepoFingerprint to one or more language profiles.
 *
 * Deterministic and honest about uncertainty.
 */
export interface ProfileSelection {
  /** The primary (best-fit) profile. Always present — falls back to generic-unknown. */
  readonly primary: LanguageProfile;
  /** All profiles that matched, ordered by fit (best first). */
  readonly matched: readonly LanguageProfile[];
  /** Why the primary profile was selected. */
  readonly reason: ProfileSelectionReason;
  /** Human-readable explanation of the selection. */
  readonly explanation: string;
  /** Whether the selection is confident or uncertain. */
  readonly confident: boolean;
}

/* ------------------------------------------------------------------ */
/*  Profile-aware agent enrichment                                    */
/* ------------------------------------------------------------------ */

/**
 * Enrichment hint derived from a language profile for agent participation.
 *
 * Does NOT make autonomous execution decisions — this is routing enrichment only.
 */
export interface ProfileAgentEnrichment {
  /** The profile this enrichment is based on. */
  readonly profileId: LanguageProfileId;
  /** Agent ID this enrichment applies to. */
  readonly agentId: string;
  /** Whether this profile makes the agent more or less relevant. */
  readonly relevance: "preferred" | "neutral" | "discouraged";
  /** Human-readable explanation of why. */
  readonly reason: string;
}
