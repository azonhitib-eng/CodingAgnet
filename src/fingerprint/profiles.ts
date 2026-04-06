/**
 * Language/toolchain profile registry.
 *
 * Explicit, typed profiles that describe how the product understands
 * different kinds of repositories and workspaces.
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

import type { LanguageProfile, LanguageProfileId } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Profile definitions                                               */
/* ------------------------------------------------------------------ */

const TYPESCRIPT_NODE: LanguageProfile = {
  id: "typescript-node",
  label: "TypeScript (Node.js)",
  primaryLanguage: "typescript",
  toolchainHints: ["npm", "npx", "tsc", "tsx", "vitest", "jest", "eslint"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const JAVASCRIPT_NODE: LanguageProfile = {
  id: "javascript-node",
  label: "JavaScript (Node.js)",
  primaryLanguage: "javascript",
  toolchainHints: ["npm", "npx", "node", "jest", "eslint", "webpack"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const PYTHON_BACKEND: LanguageProfile = {
  id: "python-backend",
  label: "Python Backend",
  primaryLanguage: "python",
  toolchainHints: ["pip", "python", "pytest", "flake8", "mypy", "poetry", "pipenv"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const PHP_GENERAL: LanguageProfile = {
  id: "php-general",
  label: "PHP (General)",
  primaryLanguage: "php",
  toolchainHints: ["composer", "php", "phpunit", "phpstan"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const PHP_WORDPRESS: LanguageProfile = {
  id: "php-wordpress",
  label: "PHP (WordPress)",
  primaryLanguage: "php",
  toolchainHints: ["composer", "php", "wp-cli", "phpunit"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration", "shell_assistance"],
  preferredAgentRoles: ["editor", "explorer", "reviewer"],
};

const RUST_CLI: LanguageProfile = {
  id: "rust-cli",
  label: "Rust CLI",
  primaryLanguage: "rust",
  toolchainHints: ["cargo", "rustc", "rustfmt", "clippy"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const GO_MODULE: LanguageProfile = {
  id: "go-module",
  label: "Go Module",
  primaryLanguage: "go",
  toolchainHints: ["go", "go test", "golangci-lint"],
  relatedCapabilities: ["editing", "testing", "reviewing", "repo_exploration"],
  preferredAgentRoles: ["editor", "tester", "reviewer"],
};

const GENERIC_UNKNOWN: LanguageProfile = {
  id: "generic-unknown",
  label: "Unknown / Generic",
  primaryLanguage: "unknown",
  toolchainHints: [],
  relatedCapabilities: ["repo_exploration", "shell_assistance"],
  preferredAgentRoles: ["explorer", "general"],
};

/* ------------------------------------------------------------------ */
/*  Registry                                                          */
/* ------------------------------------------------------------------ */

/** All known language profiles, keyed by id. */
export const LANGUAGE_PROFILES: Readonly<
  Record<LanguageProfileId, LanguageProfile>
> = {
  "typescript-node": TYPESCRIPT_NODE,
  "javascript-node": JAVASCRIPT_NODE,
  "python-backend": PYTHON_BACKEND,
  "php-general": PHP_GENERAL,
  "php-wordpress": PHP_WORDPRESS,
  "rust-cli": RUST_CLI,
  "go-module": GO_MODULE,
  "generic-unknown": GENERIC_UNKNOWN,
};

/** All profile ids in a stable order. */
export const ALL_PROFILE_IDS: readonly LanguageProfileId[] = [
  "typescript-node",
  "javascript-node",
  "python-backend",
  "php-general",
  "php-wordpress",
  "rust-cli",
  "go-module",
  "generic-unknown",
];

/**
 * Look up a profile by id.
 * Returns undefined if the id is not a known profile.
 */
export function getProfile(id: LanguageProfileId): LanguageProfile | undefined {
  return LANGUAGE_PROFILES[id];
}

/**
 * Get all registered profiles as an array.
 */
export function getAllProfiles(): readonly LanguageProfile[] {
  return ALL_PROFILE_IDS.map((id) => LANGUAGE_PROFILES[id]);
}
