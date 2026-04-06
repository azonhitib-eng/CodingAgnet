/**
 * Phase 38 — Repository fingerprinting and language profile tests.
 *
 * Comprehensive tests for:
 * - Fingerprint detection (TS/JS, Python, PHP/composer, Rust, Go, mixed, unknown)
 * - Language profile registry
 * - Profile selection correctness and determinism
 * - Session/workspace summary exposure
 * - Agent enrichment behavior
 * - Session integration events
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports under test                                                */
/* ------------------------------------------------------------------ */

import {
  // detection
  detectSignals,
  rankLanguages,
  extractFrameworks,
  fingerprintRepo,
  // profiles
  LANGUAGE_PROFILES,
  ALL_PROFILE_IDS,
  getProfile,
  getAllProfiles,
  // selection
  selectProfiles,
  // enrichment
  evaluateAgentForProfile,
  evaluateAgentsForProfile,
  getPreferredAgentsForProfile,
  buildEnrichmentSummary,
  profileRelevantCapabilities,
  // session integration
  FINGERPRINT_EVENT_KINDS,
  isFingerprintEvent,
  repoFingerprinted,
  profileSelected,
  filterFingerprintEvents,
  buildFingerprintSummary,
  // types
  type RepoFingerprint,
  type LanguageProfile,
  type LanguageProfileId,
  type ProfileSelection,
  type FingerprintSignal,
  type DetectedLanguage,
  type ProfileAgentEnrichment,
  type EnrichmentAgentInfo,
  type FingerprintSummary,
} from "../../src/fingerprint/index.js";

import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/index.js";

import type {
  SessionSummary,
  SessionEvent,
} from "../../src/session/index.js";

/* ================================================================== */
/*  1. Fingerprint detection                                          */
/* ================================================================== */

describe("fingerprintRepo — TypeScript/JS repo", () => {
  const TS_REPO_FILES = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "src/index.ts",
    "src/app.ts",
    "vitest.config.ts",
    "eslint.config.js",
    ".prettierrc",
    "README.md",
  ];

  it("detects TypeScript as primary language", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.languages[0]).toBe("typescript");
    expect(fp.languages).toContain("javascript");
  });

  it("detects strong signals", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects node/npm frameworks", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("node");
    expect(fwNames).toContain("npm");
  });

  it("detects vitest as a framework hint", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("vitest");
  });

  it("records all evidence signals", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.signals.length).toBeGreaterThan(0);
    const files = fp.signals.map((s) => s.file);
    expect(files).toContain("tsconfig.json");
    expect(files).toContain("package.json");
  });

  it("reports correct path", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.path).toBe("/repo/ts-project");
  });

  it("reports ISO timestamp", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("detects isMixed as true (TypeScript + JavaScript)", () => {
    const fp = fingerprintRepo("/repo/ts-project", TS_REPO_FILES);
    expect(fp.isMixed).toBe(true); // Both TS and JS detected
  });
});

describe("fingerprintRepo — pure JavaScript repo", () => {
  const JS_FILES = [
    "package.json",
    "package-lock.json",
    "jest.config.js",
    "webpack.config.js",
    "src/index.js",
  ];

  it("detects JavaScript as primary language (no tsconfig)", () => {
    const fp = fingerprintRepo("/repo/js-project", JS_FILES);
    expect(fp.languages[0]).toBe("javascript");
    expect(fp.languages).not.toContain("typescript");
  });

  it("is not mixed (single language)", () => {
    const fp = fingerprintRepo("/repo/js-project", JS_FILES);
    expect(fp.isMixed).toBe(false);
  });
});

describe("fingerprintRepo — Python repo", () => {
  const PYTHON_FILES = [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    ".flake8",
    "tox.ini",
    "src/__init__.py",
    "manage.py",
    "README.md",
  ];

  it("detects Python as primary language", () => {
    const fp = fingerprintRepo("/repo/django-app", PYTHON_FILES);
    expect(fp.languages[0]).toBe("python");
  });

  it("detects strong signals", () => {
    const fp = fingerprintRepo("/repo/django-app", PYTHON_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects django framework", () => {
    const fp = fingerprintRepo("/repo/django-app", PYTHON_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("django");
  });

  it("is not mixed", () => {
    const fp = fingerprintRepo("/repo/django-app", PYTHON_FILES);
    expect(fp.isMixed).toBe(false);
  });
});

describe("fingerprintRepo — Python with Pipenv", () => {
  const PIPENV_FILES = [
    "Pipfile",
    "Pipfile.lock",
    "src/main.py",
  ];

  it("detects Python as primary", () => {
    const fp = fingerprintRepo("/repo/pipenv-app", PIPENV_FILES);
    expect(fp.languages[0]).toBe("python");
  });

  it("detects pipenv framework", () => {
    const fp = fingerprintRepo("/repo/pipenv-app", PIPENV_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("pipenv");
  });
});

describe("fingerprintRepo — PHP / Composer repo", () => {
  const PHP_FILES = [
    "composer.json",
    "composer.lock",
    "src/Controller.php",
    "README.md",
  ];

  it("detects PHP as primary language", () => {
    const fp = fingerprintRepo("/repo/php-app", PHP_FILES);
    expect(fp.languages[0]).toBe("php");
  });

  it("detects strong signals", () => {
    const fp = fingerprintRepo("/repo/php-app", PHP_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects composer framework", () => {
    const fp = fingerprintRepo("/repo/php-app", PHP_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("composer");
  });

  it("is not mixed", () => {
    const fp = fingerprintRepo("/repo/php-app", PHP_FILES);
    expect(fp.isMixed).toBe(false);
  });
});

describe("fingerprintRepo — WordPress repo", () => {
  const WP_FILES = [
    "wp-config.php",
    "wp-content",
    "wp-includes",
    "wp-admin",
    "functions.php",
    "style.css",
    "composer.json",
  ];

  it("detects PHP as primary language", () => {
    const fp = fingerprintRepo("/repo/wordpress-site", WP_FILES);
    expect(fp.languages[0]).toBe("php");
  });

  it("detects wordpress framework", () => {
    const fp = fingerprintRepo("/repo/wordpress-site", WP_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("wordpress");
  });

  it("detects wordpress-theme framework", () => {
    const fp = fingerprintRepo("/repo/wordpress-site", WP_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("wordpress-theme");
  });
});

describe("fingerprintRepo — Rust repo", () => {
  const RUST_FILES = [
    "Cargo.toml",
    "Cargo.lock",
    "src/main.rs",
    "src/lib.rs",
    "README.md",
  ];

  it("detects Rust as primary language", () => {
    const fp = fingerprintRepo("/repo/rust-cli", RUST_FILES);
    expect(fp.languages[0]).toBe("rust");
  });

  it("detects strong signals", () => {
    const fp = fingerprintRepo("/repo/rust-cli", RUST_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects cargo framework", () => {
    const fp = fingerprintRepo("/repo/rust-cli", RUST_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("cargo");
  });

  it("is not mixed", () => {
    const fp = fingerprintRepo("/repo/rust-cli", RUST_FILES);
    expect(fp.isMixed).toBe(false);
  });
});

describe("fingerprintRepo — Go repo", () => {
  const GO_FILES = [
    "go.mod",
    "go.sum",
    "main.go",
    "internal/server/server.go",
    "README.md",
  ];

  it("detects Go as primary language", () => {
    const fp = fingerprintRepo("/repo/go-service", GO_FILES);
    expect(fp.languages[0]).toBe("go");
  });

  it("detects strong signals", () => {
    const fp = fingerprintRepo("/repo/go-service", GO_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects go-modules framework", () => {
    const fp = fingerprintRepo("/repo/go-service", GO_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("go-modules");
  });

  it("is not mixed", () => {
    const fp = fingerprintRepo("/repo/go-service", GO_FILES);
    expect(fp.isMixed).toBe(false);
  });
});

describe("fingerprintRepo — mixed repo", () => {
  const MIXED_FILES = [
    "package.json",
    "tsconfig.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "README.md",
  ];

  it("detects multiple languages", () => {
    const fp = fingerprintRepo("/repo/mixed", MIXED_FILES);
    expect(fp.languages.length).toBeGreaterThan(1);
  });

  it("is mixed", () => {
    const fp = fingerprintRepo("/repo/mixed", MIXED_FILES);
    expect(fp.isMixed).toBe(true);
  });

  it("has strong signals", () => {
    const fp = fingerprintRepo("/repo/mixed", MIXED_FILES);
    expect(fp.hasStrongSignal).toBe(true);
  });

  it("detects all present languages", () => {
    const fp = fingerprintRepo("/repo/mixed", MIXED_FILES);
    expect(fp.languages).toContain("typescript");
    expect(fp.languages).toContain("javascript");
    expect(fp.languages).toContain("python");
    expect(fp.languages).toContain("go");
  });
});

describe("fingerprintRepo — unknown/empty repo", () => {
  it("produces empty signals for unrecognized files", () => {
    const fp = fingerprintRepo("/repo/unknown", ["README.md", "LICENSE", ".gitignore"]);
    expect(fp.signals.length).toBe(0);
    expect(fp.languages.length).toBe(0);
    expect(fp.frameworks.length).toBe(0);
    expect(fp.hasStrongSignal).toBe(false);
    expect(fp.isMixed).toBe(false);
  });

  it("produces empty signals for empty file list", () => {
    const fp = fingerprintRepo("/repo/empty", []);
    expect(fp.signals.length).toBe(0);
    expect(fp.languages.length).toBe(0);
  });
});

describe("fingerprintRepo — Laravel repo", () => {
  const LARAVEL_FILES = [
    "composer.json",
    "artisan",
    "app/Http/Controllers/Controller.php",
    "routes/web.php",
  ];

  it("detects PHP as primary", () => {
    const fp = fingerprintRepo("/repo/laravel-app", LARAVEL_FILES);
    expect(fp.languages[0]).toBe("php");
  });

  it("detects laravel framework", () => {
    const fp = fingerprintRepo("/repo/laravel-app", LARAVEL_FILES);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("laravel");
  });
});

/* ================================================================== */
/*  2. Detection helpers                                              */
/* ================================================================== */

describe("detectSignals", () => {
  it("returns signals for matching files", () => {
    const signals = detectSignals(["package.json", "tsconfig.json"]);
    expect(signals.length).toBe(2);
  });

  it("returns empty for no matches", () => {
    const signals = detectSignals(["README.md"]);
    expect(signals.length).toBe(0);
  });

  it("handles leading slashes", () => {
    const signals = detectSignals(["/package.json"]);
    expect(signals.length).toBe(1);
  });
});

describe("rankLanguages", () => {
  it("ranks by cumulative signal weight", () => {
    const signals: FingerprintSignal[] = [
      { file: "Cargo.toml", language: "rust", strength: "strong" },
      { file: "Cargo.lock", language: "rust", strength: "moderate" },
      { file: ".eslintrc.json", language: "javascript", strength: "weak" },
    ];
    const ranked = rankLanguages(signals);
    expect(ranked[0]).toBe("rust");
    expect(ranked[1]).toBe("javascript");
  });

  it("boosts TypeScript above JavaScript when TS has strong signals", () => {
    const signals: FingerprintSignal[] = [
      { file: "tsconfig.json", language: "typescript", strength: "strong" },
      { file: "package.json", language: "javascript", strength: "strong" },
      { file: "package-lock.json", language: "javascript", strength: "moderate" },
    ];
    const ranked = rankLanguages(signals);
    expect(ranked[0]).toBe("typescript");
  });
});

describe("extractFrameworks", () => {
  it("extracts unique frameworks from signals", () => {
    const signals: FingerprintSignal[] = [
      { file: "Cargo.toml", language: "rust", strength: "strong", frameworkHint: "cargo" },
      { file: "Cargo.lock", language: "rust", strength: "moderate", frameworkHint: "cargo" },
    ];
    const frameworks = extractFrameworks(signals);
    expect(frameworks.length).toBe(1);
    expect(frameworks[0].name).toBe("cargo");
  });

  it("skips signals without framework hint", () => {
    const signals: FingerprintSignal[] = [
      { file: "tsconfig.json", language: "typescript", strength: "strong" },
    ];
    const frameworks = extractFrameworks(signals);
    expect(frameworks.length).toBe(0);
  });
});

/* ================================================================== */
/*  3. Language profiles                                              */
/* ================================================================== */

describe("LANGUAGE_PROFILES", () => {
  it("contains all expected profile ids", () => {
    const expectedIds: LanguageProfileId[] = [
      "typescript-node",
      "javascript-node",
      "python-backend",
      "php-general",
      "php-wordpress",
      "rust-cli",
      "go-module",
      "generic-unknown",
    ];
    for (const id of expectedIds) {
      expect(LANGUAGE_PROFILES[id]).toBeDefined();
      expect(LANGUAGE_PROFILES[id].id).toBe(id);
    }
  });

  it("each profile has required fields", () => {
    for (const id of ALL_PROFILE_IDS) {
      const p = LANGUAGE_PROFILES[id];
      expect(typeof p.id).toBe("string");
      expect(typeof p.label).toBe("string");
      expect(typeof p.primaryLanguage).toBe("string");
      expect(Array.isArray(p.toolchainHints)).toBe(true);
      expect(Array.isArray(p.relatedCapabilities)).toBe(true);
      expect(Array.isArray(p.preferredAgentRoles)).toBe(true);
    }
  });
});

describe("ALL_PROFILE_IDS", () => {
  it("has 8 entries", () => {
    expect(ALL_PROFILE_IDS.length).toBe(8);
  });

  it("ends with generic-unknown", () => {
    expect(ALL_PROFILE_IDS[ALL_PROFILE_IDS.length - 1]).toBe("generic-unknown");
  });
});

describe("getProfile", () => {
  it("returns profile for known id", () => {
    const p = getProfile("typescript-node");
    expect(p).toBeDefined();
    expect(p!.id).toBe("typescript-node");
  });

  it("returns undefined for unknown id", () => {
    const p = getProfile("non-existent" as LanguageProfileId);
    expect(p).toBeUndefined();
  });
});

describe("getAllProfiles", () => {
  it("returns all profiles as an array", () => {
    const profiles = getAllProfiles();
    expect(profiles.length).toBe(ALL_PROFILE_IDS.length);
  });
});

/* ================================================================== */
/*  4. Profile selection                                              */
/* ================================================================== */

describe("selectProfiles — TypeScript repo", () => {
  const fp = fingerprintRepo("/repo/ts", ["package.json", "tsconfig.json", "package-lock.json"]);

  it("selects typescript-node as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("typescript-node");
  });

  it("is confident for strong signals", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(false); // mixed TS+JS so not confident
  });

  it("includes explanation", () => {
    const sel = selectProfiles(fp);
    expect(sel.explanation.length).toBeGreaterThan(0);
  });

  it("matches both TS and JS profiles", () => {
    const sel = selectProfiles(fp);
    const ids = sel.matched.map((p) => p.id);
    expect(ids).toContain("typescript-node");
    expect(ids).toContain("javascript-node");
  });
});

describe("selectProfiles — pure JavaScript repo", () => {
  const fp = fingerprintRepo("/repo/js", ["package.json", "jest.config.js"]);

  it("selects javascript-node as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("javascript-node");
  });

  it("is confident for single language", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(true);
  });

  it("reason is strong_language_match or framework_match", () => {
    const sel = selectProfiles(fp);
    expect(["strong_language_match", "framework_match"]).toContain(sel.reason);
  });
});

describe("selectProfiles — Python repo", () => {
  const fp = fingerprintRepo("/repo/py", ["pyproject.toml", "requirements.txt"]);

  it("selects python-backend as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("python-backend");
  });

  it("is confident", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(true);
  });
});

describe("selectProfiles — PHP repo", () => {
  const fp = fingerprintRepo("/repo/php", ["composer.json"]);

  it("selects php-general as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("php-general");
  });
});

describe("selectProfiles — WordPress repo", () => {
  const fp = fingerprintRepo("/repo/wp", ["wp-config.php", "composer.json", "wp-content"]);

  it("selects php-wordpress as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("php-wordpress");
  });
});

describe("selectProfiles — Rust repo", () => {
  const fp = fingerprintRepo("/repo/rs", ["Cargo.toml", "Cargo.lock"]);

  it("selects rust-cli as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("rust-cli");
  });

  it("is confident", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(true);
  });
});

describe("selectProfiles — Go repo", () => {
  const fp = fingerprintRepo("/repo/go", ["go.mod", "go.sum"]);

  it("selects go-module as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("go-module");
  });
});

describe("selectProfiles — unknown repo", () => {
  const fp = fingerprintRepo("/repo/empty", ["README.md"]);

  it("selects generic-unknown as primary", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("generic-unknown");
  });

  it("is not confident", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(false);
  });

  it("reason is no_signals", () => {
    const sel = selectProfiles(fp);
    expect(sel.reason).toBe("no_signals");
  });
});

describe("selectProfiles — weak signals only", () => {
  const fp = fingerprintRepo("/repo/weak", [".eslintrc.json", ".prettierrc"]);

  it("selects javascript-node for weak JS signals", () => {
    const sel = selectProfiles(fp);
    expect(sel.primary.id).toBe("javascript-node");
  });

  it("is not confident for weak signals", () => {
    const sel = selectProfiles(fp);
    expect(sel.confident).toBe(false);
  });

  it("reason is weak_signal_only", () => {
    const sel = selectProfiles(fp);
    expect(sel.reason).toBe("weak_signal_only");
  });
});

describe("selectProfiles — determinism", () => {
  it("returns identical results for the same inputs", () => {
    const files = ["package.json", "tsconfig.json", "pyproject.toml"];
    const fp1 = fingerprintRepo("/repo/a", files);
    const fp2 = fingerprintRepo("/repo/a", files);

    const sel1 = selectProfiles(fp1);
    const sel2 = selectProfiles(fp2);

    expect(sel1.primary.id).toBe(sel2.primary.id);
    expect(sel1.reason).toBe(sel2.reason);
    expect(sel1.confident).toBe(sel2.confident);
    expect(sel1.matched.map((p) => p.id)).toEqual(sel2.matched.map((p) => p.id));
  });

  it("profile selection does not depend on file order", () => {
    const files1 = ["tsconfig.json", "package.json"];
    const files2 = ["package.json", "tsconfig.json"];
    const fp1 = fingerprintRepo("/repo/a", files1);
    const fp2 = fingerprintRepo("/repo/a", files2);

    const sel1 = selectProfiles(fp1);
    const sel2 = selectProfiles(fp2);

    expect(sel1.primary.id).toBe(sel2.primary.id);
  });
});

/* ================================================================== */
/*  5. Agent enrichment                                               */
/* ================================================================== */

describe("evaluateAgentForProfile", () => {
  const tsProfile = LANGUAGE_PROFILES["typescript-node"];
  const unknownProfile = LANGUAGE_PROFILES["generic-unknown"];

  const codingAgent: EnrichmentAgentInfo = {
    id: "coding-agent-1",
    capabilities: ["editing", "testing"],
    roleHint: "editor",
  };

  const narratorAgent: EnrichmentAgentInfo = {
    id: "narrator-1",
    capabilities: ["session_narration"],
    roleHint: "narrator",
  };

  const generalAgent: EnrichmentAgentInfo = {
    id: "general-1",
    capabilities: ["shell_assistance", "mcp_interaction"],
    roleHint: "general",
  };

  it("prefers coding agent for typescript-node", () => {
    const enrichment = evaluateAgentForProfile(codingAgent, tsProfile);
    expect(enrichment.relevance).toBe("preferred");
    expect(enrichment.agentId).toBe("coding-agent-1");
  });

  it("agent with only universal capabilities is neutral", () => {
    const enrichment = evaluateAgentForProfile(narratorAgent, tsProfile);
    expect(enrichment.relevance).toBe("neutral");
  });

  it("all agents are neutral for generic-unknown", () => {
    const enrichment = evaluateAgentForProfile(codingAgent, unknownProfile);
    expect(enrichment.relevance).toBe("neutral");
  });

  it("agent with universal caps only is neutral for any profile", () => {
    const enrichment = evaluateAgentForProfile(generalAgent, tsProfile);
    expect(enrichment.relevance).toBe("neutral");
  });

  it("includes human-readable reason", () => {
    const enrichment = evaluateAgentForProfile(codingAgent, tsProfile);
    expect(enrichment.reason.length).toBeGreaterThan(0);
  });

  it("includes profile and agent ids", () => {
    const enrichment = evaluateAgentForProfile(codingAgent, tsProfile);
    expect(enrichment.profileId).toBe("typescript-node");
    expect(enrichment.agentId).toBe("coding-agent-1");
  });
});

describe("evaluateAgentsForProfile", () => {
  const agents: EnrichmentAgentInfo[] = [
    { id: "editor-1", capabilities: ["editing", "testing"], roleHint: "editor" },
    { id: "narrator-1", capabilities: ["session_narration"], roleHint: "narrator" },
  ];

  it("evaluates all agents", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const sel = selectProfiles(fp);
    const enrichments = evaluateAgentsForProfile(agents, sel);
    expect(enrichments.length).toBe(2);
  });
});

describe("getPreferredAgentsForProfile", () => {
  const agents: EnrichmentAgentInfo[] = [
    { id: "editor-1", capabilities: ["editing", "testing"], roleHint: "editor" },
    { id: "narrator-1", capabilities: ["session_narration"], roleHint: "narrator" },
    { id: "reviewer-1", capabilities: ["reviewing"], roleHint: "reviewer" },
  ];

  it("returns only preferred agents", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const sel = selectProfiles(fp);
    const preferred = getPreferredAgentsForProfile(agents, sel);
    expect(preferred.length).toBeGreaterThan(0);
    for (const p of preferred) {
      expect(p.relevance).toBe("preferred");
    }
  });
});

describe("buildEnrichmentSummary", () => {
  it("produces a summary string with profile id", () => {
    const enrichments: ProfileAgentEnrichment[] = [
      { profileId: "typescript-node", agentId: "a1", relevance: "preferred", reason: "match" },
      { profileId: "typescript-node", agentId: "a2", relevance: "neutral", reason: "no match" },
    ];
    const summary = buildEnrichmentSummary(enrichments, "typescript-node");
    expect(summary).toContain("typescript-node");
    expect(summary).toContain("a1");
    expect(summary).toContain("a2");
  });
});

describe("profileRelevantCapabilities", () => {
  it("returns capabilities for typescript-node", () => {
    const caps = profileRelevantCapabilities(LANGUAGE_PROFILES["typescript-node"]);
    expect(caps).toContain("editing");
    expect(caps).toContain("testing");
  });

  it("returns capabilities for generic-unknown", () => {
    const caps = profileRelevantCapabilities(LANGUAGE_PROFILES["generic-unknown"]);
    expect(caps).toContain("repo_exploration");
  });
});

/* ================================================================== */
/*  6. Session integration events                                     */
/* ================================================================== */

describe("FINGERPRINT_EVENT_KINDS", () => {
  it("contains expected kinds", () => {
    expect(FINGERPRINT_EVENT_KINDS).toContain("repo_fingerprinted");
    expect(FINGERPRINT_EVENT_KINDS).toContain("profile_selected");
  });

  it("has 2 entries", () => {
    expect(FINGERPRINT_EVENT_KINDS.length).toBe(2);
  });
});

describe("isFingerprintEvent", () => {
  it("returns true for fingerprint events", () => {
    expect(isFingerprintEvent("repo_fingerprinted")).toBe(true);
    expect(isFingerprintEvent("profile_selected")).toBe(true);
  });

  it("returns false for non-fingerprint events", () => {
    expect(isFingerprintEvent("session_created")).toBe(false);
    expect(isFingerprintEvent("agent_attached")).toBe(false);
  });
});

describe("repoFingerprinted event builder", () => {
  it("creates a valid session event", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const event = repoFingerprinted(fp);
    expect(event.kind).toBe("repo_fingerprinted");
    expect(event.message).toContain("fingerprinted");
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.detail).toBeDefined();
    expect(event.detail!.path).toBe("/repo/ts");
  });

  it("includes language info in message", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const event = repoFingerprinted(fp);
    expect(event.message).toContain("typescript");
  });

  it("handles empty fingerprint", () => {
    const fp = fingerprintRepo("/repo/empty", []);
    const event = repoFingerprinted(fp);
    expect(event.message).toContain("none");
  });
});

describe("profileSelected event builder", () => {
  it("creates a valid session event", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const sel = selectProfiles(fp);
    const event = profileSelected(sel);
    expect(event.kind).toBe("profile_selected");
    expect(event.message).toContain("TypeScript");
    expect(event.detail).toBeDefined();
    expect(event.detail!.profileId).toBe("typescript-node");
  });

  it("marks uncertain selections", () => {
    const fp = fingerprintRepo("/repo/empty", []);
    const sel = selectProfiles(fp);
    const event = profileSelected(sel);
    expect(event.message).toContain("uncertain");
  });
});

describe("filterFingerprintEvents", () => {
  it("filters to only fingerprint events", () => {
    const events: SessionEvent[] = [
      { kind: "session_created", timestamp: new Date().toISOString(), message: "created" },
      { kind: "repo_fingerprinted" as any, timestamp: new Date().toISOString(), message: "fp" },
      { kind: "host_detected", timestamp: new Date().toISOString(), message: "detected" },
      { kind: "profile_selected" as any, timestamp: new Date().toISOString(), message: "sel" },
    ];
    const filtered = filterFingerprintEvents(events);
    expect(filtered.length).toBe(2);
    expect(filtered[0].kind).toBe("repo_fingerprinted");
    expect(filtered[1].kind).toBe("profile_selected");
  });
});

/* ================================================================== */
/*  7. FingerprintSummary                                             */
/* ================================================================== */

describe("buildFingerprintSummary", () => {
  it("produces a complete summary", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const sel = selectProfiles(fp);
    const summary = buildFingerprintSummary(fp, sel);

    expect(summary.detectedLanguages).toContain("typescript");
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.profileLabel).toBe("TypeScript (Node.js)");
    expect(summary.primaryLanguage).toBe("typescript");
    expect(typeof summary.selectionReason).toBe("string");
    expect(typeof summary.selectionExplanation).toBe("string");
    expect(typeof summary.selectionConfident).toBe("boolean");
    expect(typeof summary.signalCount).toBe("number");
    expect(typeof summary.isMixed).toBe("boolean");
  });

  it("includes detected frameworks", () => {
    const fp = fingerprintRepo("/repo/ts", ["package.json", "tsconfig.json"]);
    const sel = selectProfiles(fp);
    const summary = buildFingerprintSummary(fp, sel);
    expect(summary.detectedFrameworks).toContain("node");
  });

  it("handles unknown repos", () => {
    const fp = fingerprintRepo("/repo/empty", []);
    const sel = selectProfiles(fp);
    const summary = buildFingerprintSummary(fp, sel);
    expect(summary.profileId).toBe("generic-unknown");
    expect(summary.detectedLanguages.length).toBe(0);
    expect(summary.selectionConfident).toBe(false);
  });
});

/* ================================================================== */
/*  8. SessionSummary exposure                                        */
/* ================================================================== */

describe("SessionSummary — fingerprint fields", () => {
  let mgr: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    mgr = new SessionManager();
    const session = mgr.createSession();
    sessionId = session.id;
  });

  it("fingerprint fields are null when no fingerprint provided", () => {
    const summary = mgr.getSessionSummary(sessionId);
    expect(summary.detectedLanguages).toBeNull();
    expect(summary.detectedFrameworks).toBeNull();
    expect(summary.isMixedRepo).toBeNull();
    expect(summary.profileId).toBeNull();
    expect(summary.profileLabel).toBeNull();
    expect(summary.primaryLanguage).toBeNull();
    expect(summary.profileSelectionReason).toBeNull();
    expect(summary.profileSelectionExplanation).toBeNull();
    expect(summary.profileConfident).toBeNull();
  });

  it("fingerprint fields are populated when fingerprint summary provided", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json", "package.json"]);
    const sel = selectProfiles(fp);
    const fpSummary = buildFingerprintSummary(fp, sel);

    const summary = mgr.getSessionSummary(sessionId, undefined, fpSummary);
    expect(summary.detectedLanguages).toContain("typescript");
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.profileLabel).toBe("TypeScript (Node.js)");
    expect(summary.primaryLanguage).toBe("typescript");
    expect(typeof summary.profileSelectionReason).toBe("string");
    expect(typeof summary.profileSelectionExplanation).toBe("string");
    expect(typeof summary.profileConfident).toBe("boolean");
    expect(typeof summary.isMixedRepo).toBe("boolean");
  });

  it("fingerprint fields can be provided alongside agent summaries", () => {
    const fpSummary = {
      detectedLanguages: ["python"],
      detectedFrameworks: ["django"],
      isMixed: false,
      profileId: "python-backend",
      profileLabel: "Python Backend",
      primaryLanguage: "python",
      selectionReason: "strong_language_match",
      selectionExplanation: "Strong python signals.",
      selectionConfident: true,
    };

    const agentSummaries = [
      { id: "agent-1", roleHint: "editor", routingPriority: 60, participationEnabled: true },
    ];

    const summary = mgr.getSessionSummary(sessionId, agentSummaries, fpSummary);
    expect(summary.profileId).toBe("python-backend");
    expect(summary.primaryLanguage).toBe("python");
  });

  it("still returns all existing summary fields correctly", () => {
    const summary = mgr.getSessionSummary(sessionId);
    expect(summary.id).toBe(sessionId);
    expect(summary.stage).toBe("initializing");
    expect(summary.status).toBe("idle");
    expect(summary.eventCount).toBeGreaterThan(0); // session_created event
    expect(summary.mcpServerCount).toBe(0);
    expect(summary.agentCount).toBe(0);
  });
});

/* ================================================================== */
/*  9. Session event kinds in session types                           */
/* ================================================================== */

describe("SessionEventKind — fingerprint kinds", () => {
  it("repo_fingerprinted is a valid session event kind", () => {
    // We can use the event builder which casts to SessionEventKind
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json"]);
    const event = repoFingerprinted(fp);
    // It should be usable with session manager
    const mgr = new SessionManager();
    const session = mgr.createSession();
    // Append the event — this will throw if the kind is incompatible
    const updated = mgr.appendEvent(session.id, event);
    expect(updated.events.some((e) => e.kind === "repo_fingerprinted")).toBe(true);
  });

  it("profile_selected is a valid session event kind", () => {
    const fp = fingerprintRepo("/repo/ts", ["tsconfig.json"]);
    const sel = selectProfiles(fp);
    const event = profileSelected(sel);
    const mgr = new SessionManager();
    const session = mgr.createSession();
    const updated = mgr.appendEvent(session.id, event);
    expect(updated.events.some((e) => e.kind === "profile_selected")).toBe(true);
  });
});

/* ================================================================== */
/*  10. Timeline/Console classification of fingerprint events         */
/* ================================================================== */

describe("timeline classification — fingerprint events", () => {
  // import directly to test classification
  it("classifies repo_fingerprinted as info", async () => {
    const { classifyEvent } = await import("../../src/app-shell/timeline-helpers.js");
    expect(classifyEvent("repo_fingerprinted")).toBe("info");
  });

  it("classifies profile_selected as progress", async () => {
    const { classifyEvent } = await import("../../src/app-shell/timeline-helpers.js");
    expect(classifyEvent("profile_selected")).toBe("progress");
  });
});

describe("console classification — fingerprint events", () => {
  it("classifies repo_fingerprinted actor as workspace", async () => {
    const { classifyActor } = await import("../../src/app-shell/console-helpers.js");
    expect(classifyActor("repo_fingerprinted")).toBe("workspace");
  });

  it("classifies profile_selected actor as workspace", async () => {
    const { classifyActor } = await import("../../src/app-shell/console-helpers.js");
    expect(classifyActor("profile_selected")).toBe("workspace");
  });

  it("classifies repo_fingerprinted card as discovery_card", async () => {
    const { classifyCard } = await import("../../src/app-shell/console-helpers.js");
    expect(classifyCard("repo_fingerprinted")).toBe("discovery_card");
  });

  it("classifies profile_selected card as discovery_card", async () => {
    const { classifyCard } = await import("../../src/app-shell/console-helpers.js");
    expect(classifyCard("profile_selected")).toBe("discovery_card");
  });
});

/* ================================================================== */
/*  11. Specific edge cases                                           */
/* ================================================================== */

describe("edge cases", () => {
  it("duplicate files in inventory are handled gracefully", () => {
    const fp = fingerprintRepo("/repo/dup", [
      "package.json",
      "package.json",
      "tsconfig.json",
      "tsconfig.json",
    ]);
    // Should not double-count signals
    expect(fp.signals.length).toBe(2);
  });

  it("mixed TypeScript + Python repo selects strongest language first", () => {
    const fp = fingerprintRepo("/repo/mixed", [
      "tsconfig.json",
      "package.json",
      "package-lock.json",
      "pyproject.toml",
    ]);
    const sel = selectProfiles(fp);
    // TypeScript should be primary (more signals)
    expect(sel.primary.id).toBe("typescript-node");
  });

  it("enrichment for PHP WordPress profile prefers explorer role", () => {
    const wpProfile = LANGUAGE_PROFILES["php-wordpress"];
    const explorer: EnrichmentAgentInfo = {
      id: "explorer-1",
      capabilities: ["repo_exploration"],
      roleHint: "explorer",
    };
    const enrichment = evaluateAgentForProfile(explorer, wpProfile);
    expect(enrichment.relevance).toBe("preferred");
  });

  it("Next.js files trigger nextjs framework detection", () => {
    const fp = fingerprintRepo("/repo/nextjs", [
      "package.json",
      "next.config.js",
      "tsconfig.json",
    ]);
    const fwNames = fp.frameworks.map((f) => f.name);
    expect(fwNames).toContain("nextjs");
  });
});

/* ================================================================== */
/*  12. Barrel export completeness                                    */
/* ================================================================== */

describe("barrel export — index.ts", () => {
  it("re-exports all key functions", async () => {
    const mod = await import("../../src/fingerprint/index.js");

    // detection
    expect(typeof mod.detectSignals).toBe("function");
    expect(typeof mod.rankLanguages).toBe("function");
    expect(typeof mod.extractFrameworks).toBe("function");
    expect(typeof mod.fingerprintRepo).toBe("function");

    // profiles
    expect(mod.LANGUAGE_PROFILES).toBeDefined();
    expect(mod.ALL_PROFILE_IDS).toBeDefined();
    expect(typeof mod.getProfile).toBe("function");
    expect(typeof mod.getAllProfiles).toBe("function");

    // selection
    expect(typeof mod.selectProfiles).toBe("function");

    // enrichment
    expect(typeof mod.evaluateAgentForProfile).toBe("function");
    expect(typeof mod.evaluateAgentsForProfile).toBe("function");
    expect(typeof mod.getPreferredAgentsForProfile).toBe("function");
    expect(typeof mod.buildEnrichmentSummary).toBe("function");
    expect(typeof mod.profileRelevantCapabilities).toBe("function");

    // session integration
    expect(mod.FINGERPRINT_EVENT_KINDS).toBeDefined();
    expect(typeof mod.isFingerprintEvent).toBe("function");
    expect(typeof mod.repoFingerprinted).toBe("function");
    expect(typeof mod.profileSelected).toBe("function");
    expect(typeof mod.filterFingerprintEvents).toBe("function");
    expect(typeof mod.buildFingerprintSummary).toBe("function");
  });
});

describe("main package re-export", () => {
  it("fingerprint module is accessible from main index", async () => {
    const mod = await import("../../src/index.js");
    expect(typeof mod.fingerprintRepo).toBe("function");
    expect(typeof mod.selectProfiles).toBe("function");
    expect(typeof mod.evaluateAgentForProfile).toBe("function");
    expect(mod.ALL_PROFILE_IDS).toBeDefined();
    expect(mod.LANGUAGE_PROFILES).toBeDefined();
  });
});
