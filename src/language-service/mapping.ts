/**
 * Profile-aware language-service mapping.
 *
 * Phase 40: Maps existing language profiles to minimal language-service
 * expectations.  Deterministic and explicit — no magic.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type {
  LanguageServiceKind,
  LanguageContextHint,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Profile → service kind                                             */
/* ------------------------------------------------------------------ */

/** Static, deterministic mapping from profile id to service kind. */
const PROFILE_SERVICE_MAP: Record<LanguageProfileId, LanguageServiceKind> = {
  "typescript-node": "typescript",
  "javascript-node": "javascript",
  "python-backend":  "python",
  "php-general":     "php",
  "php-wordpress":   "php",
  "rust-cli":        "rust",
  "go-module":       "go",
  "generic-unknown": "none",
};

/**
 * Resolve the expected language-service kind for a profile.
 *
 * Returns "none" when no service is known for the profile.
 */
export function mapProfileToServiceKind(
  profileId: LanguageProfileId,
): LanguageServiceKind {
  return PROFILE_SERVICE_MAP[profileId] ?? "none";
}

/* ------------------------------------------------------------------ */
/*  Service kind → diagnostics source label                            */
/* ------------------------------------------------------------------ */

/** Human-readable diagnostics source names per service kind. */
const DIAGNOSTICS_SOURCE_MAP: Record<LanguageServiceKind, readonly string[]> = {
  typescript: ["tsc", "eslint"],
  javascript: ["eslint", "tsc (JS-mode)"],
  python:     ["mypy", "ruff", "pyright"],
  php:        ["phpstan", "psalm"],
  rust:       ["cargo check", "clippy"],
  go:         ["go vet", "gopls"],
  none:       [],
};

/**
 * Get the known diagnostics source names for a service kind.
 */
export function getDiagnosticsSources(
  serviceKind: LanguageServiceKind,
): readonly string[] {
  return DIAGNOSTICS_SOURCE_MAP[serviceKind] ?? [];
}

/* ------------------------------------------------------------------ */
/*  Service kind → diagnostics command hint                            */
/* ------------------------------------------------------------------ */

/**
 * A minimal hint for what shell command could produce diagnostics.
 *
 * These are NOT executed automatically.  They inform the availability
 * and collection layers about what to look for.
 */
export interface DiagnosticsCommandHint {
  /** The primary diagnostics command (e.g. "npx tsc --noEmit"). */
  readonly command: string;
  /** Tool name for display. */
  readonly tool: string;
  /** Which diagnostics this produces. */
  readonly produces: "typecheck" | "lint" | "both";
}

const COMMAND_HINTS: Record<LanguageServiceKind, readonly DiagnosticsCommandHint[]> = {
  typescript: [
    { command: "npx tsc --noEmit", tool: "tsc", produces: "typecheck" },
    { command: "npx eslint . --format json", tool: "eslint", produces: "lint" },
  ],
  javascript: [
    { command: "npx eslint . --format json", tool: "eslint", produces: "lint" },
  ],
  python: [
    { command: "mypy .", tool: "mypy", produces: "typecheck" },
    { command: "ruff check .", tool: "ruff", produces: "lint" },
  ],
  php: [
    { command: "vendor/bin/phpstan analyse --error-format=json", tool: "phpstan", produces: "both" },
  ],
  rust: [
    { command: "cargo check --message-format=json", tool: "cargo", produces: "typecheck" },
    { command: "cargo clippy --message-format=json", tool: "clippy", produces: "lint" },
  ],
  go: [
    { command: "go vet ./...", tool: "go", produces: "both" },
  ],
  none: [],
};

/**
 * Get the diagnostics command hints for a service kind.
 */
export function getDiagnosticsCommandHints(
  serviceKind: LanguageServiceKind,
): readonly DiagnosticsCommandHint[] {
  return COMMAND_HINTS[serviceKind] ?? [];
}

/* ------------------------------------------------------------------ */
/*  Context hint builder                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a LanguageContextHint for a given service kind.
 *
 * Describes what language-level intelligence is available (or not).
 */
export function buildContextHint(
  serviceKind: LanguageServiceKind,
): LanguageContextHint {
  switch (serviceKind) {
    case "typescript":
      return {
        serviceKind,
        supportsTypeCheck: true,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "TypeScript workspace: tsc can type-check, eslint can lint, prettier can format. " +
          "Symbol/go-to-definition is possible via tsserver but not implemented in this layer.",
      };

    case "javascript":
      return {
        serviceKind,
        supportsTypeCheck: false,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "JavaScript workspace: eslint can lint, prettier can format. " +
          "Type-checking requires TypeScript config (not detected). " +
          "Symbol navigation possible via tsserver but not implemented.",
      };

    case "python":
      return {
        serviceKind,
        supportsTypeCheck: true,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "Python workspace: mypy/pyright can type-check, ruff/flake8 can lint, " +
          "black/ruff can format. Symbol navigation possible via pyright but not implemented.",
      };

    case "php":
      return {
        serviceKind,
        supportsTypeCheck: true,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "PHP workspace: phpstan/psalm can analyse, phpcs can lint, php-cs-fixer can format. " +
          "Symbol navigation possible via intelephense but not implemented.",
      };

    case "rust":
      return {
        serviceKind,
        supportsTypeCheck: true,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "Rust workspace: cargo check can type-check, clippy can lint, rustfmt can format. " +
          "Symbol navigation possible via rust-analyzer but not implemented.",
      };

    case "go":
      return {
        serviceKind,
        supportsTypeCheck: true,
        supportsLint: true,
        supportsFormat: true,
        couldProvideSymbols: true,
        explanation:
          "Go workspace: go vet can check, golangci-lint can lint, gofmt can format. " +
          "Symbol navigation possible via gopls but not implemented.",
      };

    case "none":
      return {
        serviceKind,
        supportsTypeCheck: false,
        supportsLint: false,
        supportsFormat: false,
        couldProvideSymbols: false,
        explanation:
          "No language service is available for this workspace profile. " +
          "Diagnostics and language intelligence are not supported.",
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Config file evidence per service kind                              */
/* ------------------------------------------------------------------ */

/**
 * File patterns that indicate a workspace is configured for a service.
 *
 * Used by the availability layer to distinguish "available" from
 * "not_configured".
 */
const CONFIG_EVIDENCE: Record<LanguageServiceKind, readonly string[]> = {
  typescript: [
    "tsconfig.json",
    "tsconfig.*.json",
    "jsconfig.json",
  ],
  javascript: [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.json",
    ".eslintrc.cjs",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "package.json",
  ],
  python: [
    "pyproject.toml",
    "mypy.ini",
    ".mypy.ini",
    "setup.py",
    "setup.cfg",
    "ruff.toml",
    ".flake8",
  ],
  php: [
    "composer.json",
    "phpstan.neon",
    "phpstan.neon.dist",
    "psalm.xml",
    "phpcs.xml",
  ],
  rust: [
    "Cargo.toml",
  ],
  go: [
    "go.mod",
  ],
  none: [],
};

/**
 * Get the config file evidence patterns for a service kind.
 */
export function getConfigEvidence(
  serviceKind: LanguageServiceKind,
): readonly string[] {
  return CONFIG_EVIDENCE[serviceKind] ?? [];
}

/**
 * Check whether any of the config evidence files exist in a file list.
 */
export function hasConfigEvidence(
  serviceKind: LanguageServiceKind,
  files: readonly string[],
): boolean {
  const patterns = getConfigEvidence(serviceKind);
  if (patterns.length === 0) return false;

  const normalized = files.map((f) => {
    const parts = f.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1];
  });

  return patterns.some((pattern) => {
    if (pattern.includes("*")) {
      // Simple glob: "tsconfig.*.json" → /^tsconfig\..*\.json$/
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      const re = new RegExp(`^${escaped}$`);
      return normalized.some((f) => re.test(f));
    }
    return normalized.includes(pattern);
  });
}
