/**
 * Profile context support descriptors.
 *
 * Phase 43: Maps each language profile to its context intelligence capabilities.
 * Honest about what each profile can and cannot extract.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type { ProfileContextSupport } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Per-profile context support                                        */
/* ------------------------------------------------------------------ */

const TYPESCRIPT_NODE_SUPPORT: ProfileContextSupport = {
  profileId: "typescript-node",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: true,
  limitations: [
    "Symbol extraction uses regex heuristics, not a full TypeScript compiler",
    "Generic type parameters may cause false matches",
    "Dynamic imports are not fully tracked",
  ],
};

const JAVASCRIPT_NODE_SUPPORT: ProfileContextSupport = {
  profileId: "javascript-node",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: true,
  limitations: [
    "Symbol extraction uses regex heuristics, not a full parser",
    "CommonJS require() patterns are partially supported",
    "Dynamic require/import not tracked",
  ],
};

const PYTHON_BACKEND_SUPPORT: ProfileContextSupport = {
  profileId: "python-backend",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: true,
  limitations: [
    "Symbol extraction uses regex heuristics, not a full Python AST",
    "__all__ exports partially supported",
    "Dynamic imports not tracked",
  ],
};

const PHP_GENERAL_SUPPORT: ProfileContextSupport = {
  profileId: "php-general",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: false,
  limitations: [
    "Symbol extraction uses regex heuristics, not a full PHP parser",
    "Namespace resolution is partial",
    "Autoload mappings from composer.json partially supported",
  ],
};

const PHP_WORDPRESS_SUPPORT: ProfileContextSupport = {
  profileId: "php-wordpress",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: true,
  limitations: [
    "Symbol extraction uses regex heuristics, not a full PHP parser",
    "WordPress hook detection is pattern-based",
    "Plugin/theme header detection is heuristic",
  ],
};

const RUST_CLI_SUPPORT: ProfileContextSupport = {
  profileId: "rust-cli",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: false,
  limitations: [
    "Symbol extraction uses regex heuristics, not the Rust compiler",
    "Macro-generated symbols are not detected",
    "Module visibility (pub/pub(crate)) partially tracked",
  ],
};

const GO_MODULE_SUPPORT: ProfileContextSupport = {
  profileId: "go-module",
  symbolExtraction: true,
  importExportAnalysis: true,
  entrypointDetection: true,
  testDetection: true,
  configDetection: true,
  frameworkHints: false,
  limitations: [
    "Symbol extraction uses regex heuristics, not the Go compiler",
    "Exported symbols identified by uppercase naming convention",
    "Interface method detection is partial",
  ],
};

const GENERIC_UNKNOWN_SUPPORT: ProfileContextSupport = {
  profileId: "generic-unknown",
  symbolExtraction: false,
  importExportAnalysis: false,
  entrypointDetection: false,
  testDetection: true,
  configDetection: true,
  frameworkHints: false,
  limitations: [
    "No language-specific symbol extraction available",
    "Only generic file role detection (test, config) by naming patterns",
    "No import/export analysis possible",
  ],
};

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

/** All profile context support descriptors, keyed by profile ID. */
export const PROFILE_CONTEXT_SUPPORT: Readonly<Record<LanguageProfileId, ProfileContextSupport>> = {
  "typescript-node": TYPESCRIPT_NODE_SUPPORT,
  "javascript-node": JAVASCRIPT_NODE_SUPPORT,
  "python-backend": PYTHON_BACKEND_SUPPORT,
  "php-general": PHP_GENERAL_SUPPORT,
  "php-wordpress": PHP_WORDPRESS_SUPPORT,
  "rust-cli": RUST_CLI_SUPPORT,
  "go-module": GO_MODULE_SUPPORT,
  "generic-unknown": GENERIC_UNKNOWN_SUPPORT,
};

/** Get context support descriptor for a profile. */
export function getProfileContextSupport(profileId: LanguageProfileId): ProfileContextSupport {
  return PROFILE_CONTEXT_SUPPORT[profileId];
}
