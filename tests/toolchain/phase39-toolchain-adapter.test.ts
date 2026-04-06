/**
 * Phase 39 — Profile-aware toolchain adapter layer and workspace checks tests.
 *
 * Comprehensive tests for:
 * - Toolchain types and constants
 * - Profile-to-toolchain mapping for TS/JS, Python, PHP, Rust, Go, generic
 * - Mixed repo behavior
 * - Workspace check planning (available/recommended/unavailable)
 * - Availability assessment with and without host info
 * - Execution support (mock runner)
 * - Session/workspace summary exposure
 * - Command integration
 * - Toolchain kind resolution
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports under test                                                */
/* ------------------------------------------------------------------ */

import {
  // types & constants
  ALL_COMMAND_TYPES,
  // mapping
  buildAdapterId,
  mapProfileToCommands,
  resolveToolchainKind,
  // check planning
  assessCommandAvailability,
  buildWorkspaceToolchainSummary,
  buildToolchainSummaryFromFingerprint,
  // execution
  executeCheck,
  executeChecks,
  buildCheckResultSummary,
  // session integration
  TOOLCHAIN_EVENT_KINDS,
  isToolchainEvent,
  toolchainSummaryGenerated,
  toolchainCheckStarted,
  toolchainCheckCompleted,
  toolchainChecksSummaryEvents,
  filterToolchainEvents,
  buildToolchainSessionSummary,
  // types
  type ToolchainAdapterId,
  type ToolchainKind,
  type ToolchainCommandType,
  type ToolchainCommandDefinition,
  type ToolchainAvailability,
  type ToolchainCheckResult,
  type ToolchainCheckResultSummary,
  type WorkspaceToolchainSummary,
  type ToolchainSessionSummary,
  type ShellRunner,
} from "../../src/toolchain/index.js";

import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/index.js";

import type {
  SessionSummary,
  SessionEvent,
} from "../../src/session/index.js";

import type {
  RepoFingerprint,
  ProfileSelection,
  LanguageProfileId,
} from "../../src/fingerprint/index.js";

import {
  LANGUAGE_PROFILES,
  selectProfiles,
  fingerprintRepo,
} from "../../src/fingerprint/index.js";

import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
  getCommandAvailability,
  getAllCommandAvailability,
  getAvailableCommandIds,
  validateCommand,
} from "../../src/commands/index.js";

import type { CommandContextState } from "../../src/commands/index.js";

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Deterministic file inventory for a TypeScript/Node project. */
const TS_NODE_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "src/index.ts",
  "src/app.ts",
  "vitest.config.ts",
  "eslint.config.js",
  ".prettierrc",
];

/** Deterministic file inventory for a JavaScript/Node project. */
const JS_NODE_FILES = [
  "package.json",
  "package-lock.json",
  "src/index.js",
  "jest.config.js",
  "eslint.config.js",
  ".prettierrc",
];

/** Deterministic file inventory for a Python backend project. */
const PYTHON_FILES = [
  "pyproject.toml",
  "requirements.txt",
  "tests/test_main.py",
  "src/main.py",
  "mypy.ini",
  "ruff.toml",
];

/** Deterministic file inventory for a PHP general project. */
const PHP_FILES = [
  "composer.json",
  "composer.lock",
  "phpunit.xml",
  "phpcs.xml",
  "phpstan.neon",
  "src/App.php",
  ".php-cs-fixer.dist.php",
];

/** Deterministic file inventory for a PHP WordPress project. */
const PHP_WP_FILES = [
  "composer.json",
  "composer.lock",
  "wp-content/plugins/my-plugin/plugin.php",
  "phpunit.xml.dist",
  "style.css",
  "functions.php",
];

/** Deterministic file inventory for a Rust CLI project. */
const RUST_FILES = [
  "Cargo.toml",
  "Cargo.lock",
  "src/main.rs",
  "src/lib.rs",
];

/** Deterministic file inventory for a Go module project. */
const GO_FILES = [
  "go.mod",
  "go.sum",
  "main.go",
  "internal/handler.go",
];

/** Deterministic file inventory for a mixed TS + Python project. */
const MIXED_FILES = [
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "eslint.config.js",
  "pyproject.toml",
  "tests/test_api.py",
  "requirements.txt",
];

/** Empty / generic unknown files. */
const GENERIC_FILES = [
  "README.md",
  "LICENSE",
];

/** Mock shell runner that always succeeds. */
function makeSuccessRunner(): ShellRunner {
  return {
    run: async (_cmd: string, _cwd: string) => ({
      exitCode: 0,
      stdout: "All checks passed.\n",
      stderr: "",
    }),
  };
}

/** Mock shell runner that always fails. */
function makeFailRunner(): ShellRunner {
  return {
    run: async (_cmd: string, _cwd: string) => ({
      exitCode: 1,
      stdout: "",
      stderr: "Error: 5 issues found.\n",
    }),
  };
}

/** Mock shell runner that throws. */
function makeErrorRunner(): ShellRunner {
  return {
    run: async () => {
      throw new Error("Command not found: tsc");
    },
  };
}

/* ================================================================== */
/*  1. Toolchain types and constants                                   */
/* ================================================================== */

describe("Toolchain types and constants", () => {
  it("ALL_COMMAND_TYPES has 6 entries", () => {
    expect(ALL_COMMAND_TYPES).toHaveLength(6);
  });

  it("ALL_COMMAND_TYPES contains expected entries", () => {
    expect(ALL_COMMAND_TYPES).toEqual([
      "lint", "test", "build", "typecheck", "format", "dependency_check",
    ]);
  });

  it("TOOLCHAIN_EVENT_KINDS has 3 entries", () => {
    expect(TOOLCHAIN_EVENT_KINDS).toHaveLength(3);
  });

  it("TOOLCHAIN_EVENT_KINDS contains expected values", () => {
    expect(TOOLCHAIN_EVENT_KINDS).toContain("toolchain_summary_generated");
    expect(TOOLCHAIN_EVENT_KINDS).toContain("toolchain_check_started");
    expect(TOOLCHAIN_EVENT_KINDS).toContain("toolchain_check_completed");
  });
});

/* ================================================================== */
/*  2. buildAdapterId                                                  */
/* ================================================================== */

describe("buildAdapterId", () => {
  it("builds adapter id for typescript-node", () => {
    expect(buildAdapterId("typescript-node")).toBe("typescript-node-toolchain");
  });

  it("builds adapter id for generic-unknown", () => {
    expect(buildAdapterId("generic-unknown")).toBe("generic-unknown-toolchain");
  });

  it("builds adapter id for rust-cli", () => {
    expect(buildAdapterId("rust-cli")).toBe("rust-cli-toolchain");
  });
});

/* ================================================================== */
/*  3. Profile-to-toolchain mapping — TypeScript/Node                  */
/* ================================================================== */

describe("mapProfileToCommands — typescript-node", () => {
  it("maps typecheck (tsc) when tsconfig.json present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const tsc = cmds.find((c) => c.tool === "tsc");
    expect(tsc).toBeDefined();
    expect(tsc!.type).toBe("typecheck");
    expect(tsc!.command).toBe("npx tsc --noEmit");
    expect(tsc!.priority).toBe("recommended");
  });

  it("maps lint (eslint) when eslint config present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const eslint = cmds.find((c) => c.tool === "eslint");
    expect(eslint).toBeDefined();
    expect(eslint!.type).toBe("lint");
    expect(eslint!.priority).toBe("recommended");
  });

  it("maps test (vitest) when vitest config present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const vitest = cmds.find((c) => c.tool === "vitest");
    expect(vitest).toBeDefined();
    expect(vitest!.type).toBe("test");
    expect(vitest!.priority).toBe("recommended");
  });

  it("maps build (npm) when package.json present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const build = cmds.find((c) => c.type === "build");
    expect(build).toBeDefined();
    expect(build!.tool).toBe("npm");
  });

  it("maps format (prettier) when .prettierrc present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const prettier = cmds.find((c) => c.tool === "prettier");
    expect(prettier).toBeDefined();
    expect(prettier!.type).toBe("format");
    expect(prettier!.priority).toBe("optional");
  });

  it("maps dependency_check when package-lock.json present", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
    expect(dep!.priority).toBe("informational");
  });

  it("returns multiple commands for a full project", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    expect(cmds.length).toBeGreaterThanOrEqual(4);
  });

  it("falls back to jest when jest config is present and vitest is not", () => {
    const files = ["package.json", "tsconfig.json", "jest.config.js"];
    const cmds = mapProfileToCommands("typescript-node", files);
    const jest = cmds.find((c) => c.tool === "jest");
    expect(jest).toBeDefined();
    expect(jest!.type).toBe("test");
  });

  it("falls back to npm test when no test config found", () => {
    const files = ["package.json", "tsconfig.json"];
    const cmds = mapProfileToCommands("typescript-node", files);
    const test = cmds.find((c) => c.type === "test");
    expect(test).toBeDefined();
    expect(test!.tool).toBe("npm");
    expect(test!.priority).toBe("optional");
  });

  it("does not map eslint when no eslint config", () => {
    const files = ["package.json", "tsconfig.json"];
    const cmds = mapProfileToCommands("typescript-node", files);
    const eslint = cmds.find((c) => c.tool === "eslint");
    expect(eslint).toBeUndefined();
  });

  it("evidence includes detected config files", () => {
    const cmds = mapProfileToCommands("typescript-node", TS_NODE_FILES);
    const tsc = cmds.find((c) => c.tool === "tsc");
    expect(tsc!.evidence).toContain("tsconfig.json");
  });
});

/* ================================================================== */
/*  4. Profile-to-toolchain mapping — JavaScript/Node                  */
/* ================================================================== */

describe("mapProfileToCommands — javascript-node", () => {
  it("maps lint (eslint) when eslint config present", () => {
    const cmds = mapProfileToCommands("javascript-node", JS_NODE_FILES);
    const eslint = cmds.find((c) => c.tool === "eslint");
    expect(eslint).toBeDefined();
    expect(eslint!.type).toBe("lint");
  });

  it("maps test (jest) when jest config present", () => {
    const cmds = mapProfileToCommands("javascript-node", JS_NODE_FILES);
    const jest = cmds.find((c) => c.tool === "jest");
    expect(jest).toBeDefined();
    expect(jest!.type).toBe("test");
  });

  it("maps build and format correctly", () => {
    const cmds = mapProfileToCommands("javascript-node", JS_NODE_FILES);
    expect(cmds.find((c) => c.type === "build")).toBeDefined();
    expect(cmds.find((c) => c.type === "format")).toBeDefined();
  });

  it("maps dependency_check", () => {
    const cmds = mapProfileToCommands("javascript-node", JS_NODE_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
  });

  it("does not map typecheck (no TS in JS profile)", () => {
    const cmds = mapProfileToCommands("javascript-node", JS_NODE_FILES);
    const tc = cmds.find((c) => c.type === "typecheck");
    expect(tc).toBeUndefined();
  });
});

/* ================================================================== */
/*  5. Profile-to-toolchain mapping — Python                           */
/* ================================================================== */

describe("mapProfileToCommands — python-backend", () => {
  it("maps lint (ruff) when ruff.toml present", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    const ruff = cmds.find((c) => c.tool === "ruff" && c.type === "lint");
    expect(ruff).toBeDefined();
    expect(ruff!.priority).toBe("recommended");
  });

  it("maps test (pytest) when tests/ dir present", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    const pytest = cmds.find((c) => c.tool === "pytest");
    expect(pytest).toBeDefined();
    expect(pytest!.type).toBe("test");
  });

  it("maps typecheck (mypy) when mypy.ini present", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    const mypy = cmds.find((c) => c.tool === "mypy");
    expect(mypy).toBeDefined();
    expect(mypy!.type).toBe("typecheck");
    expect(mypy!.priority).toBe("optional");
  });

  it("maps format (ruff format) when pyproject.toml present", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    const fmt = cmds.find((c) => c.type === "format");
    expect(fmt).toBeDefined();
    expect(fmt!.tool).toBe("ruff");
  });

  it("maps dependency_check when requirements.txt present", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
    expect(dep!.tool).toBe("pip");
  });

  it("falls back to flake8 when ruff.toml not present", () => {
    const files = [".flake8", "tests/test_main.py"];
    const cmds = mapProfileToCommands("python-backend", files);
    const lint = cmds.find((c) => c.type === "lint");
    expect(lint).toBeDefined();
    expect(lint!.tool).toBe("flake8");
  });

  it("expectedLocal is false for system-level Python tools", () => {
    const cmds = mapProfileToCommands("python-backend", PYTHON_FILES);
    for (const cmd of cmds) {
      expect(cmd.expectedLocal).toBe(false);
    }
  });
});

/* ================================================================== */
/*  6. Profile-to-toolchain mapping — PHP general                      */
/* ================================================================== */

describe("mapProfileToCommands — php-general", () => {
  it("maps lint (phpcs) when phpcs.xml present", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    const phpcs = cmds.find((c) => c.tool === "phpcs");
    expect(phpcs).toBeDefined();
    expect(phpcs!.type).toBe("lint");
    expect(phpcs!.priority).toBe("recommended");
  });

  it("maps typecheck (phpstan) when phpstan.neon present", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    const phpstan = cmds.find((c) => c.tool === "phpstan");
    expect(phpstan).toBeDefined();
    expect(phpstan!.type).toBe("typecheck");
    expect(phpstan!.priority).toBe("recommended");
  });

  it("maps test (phpunit) when phpunit.xml present", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    const phpunit = cmds.find((c) => c.tool === "phpunit");
    expect(phpunit).toBeDefined();
    expect(phpunit!.type).toBe("test");
  });

  it("maps dependency_check (composer audit) when composer.lock present", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
    expect(dep!.tool).toBe("composer");
  });

  it("maps format (php-cs-fixer) when config present", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    const fixer = cmds.find((c) => c.tool === "php-cs-fixer");
    expect(fixer).toBeDefined();
    expect(fixer!.type).toBe("format");
  });

  it("returns at least 4 commands for a fully configured PHP project", () => {
    const cmds = mapProfileToCommands("php-general", PHP_FILES);
    expect(cmds.length).toBeGreaterThanOrEqual(4);
  });
});

/* ================================================================== */
/*  7. Profile-to-toolchain mapping — PHP WordPress                    */
/* ================================================================== */

describe("mapProfileToCommands — php-wordpress", () => {
  it("maps test (phpunit) when phpunit.xml.dist present", () => {
    const cmds = mapProfileToCommands("php-wordpress", PHP_WP_FILES);
    const phpunit = cmds.find((c) => c.tool === "phpunit");
    expect(phpunit).toBeDefined();
    expect(phpunit!.type).toBe("test");
  });

  it("suggests WPCS when no phpcs.xml present", () => {
    const cmds = mapProfileToCommands("php-wordpress", PHP_WP_FILES);
    const wpcs = cmds.find((c) => c.label.includes("WPCS"));
    expect(wpcs).toBeDefined();
    expect(wpcs!.type).toBe("lint");
  });

  it("maps dependency check", () => {
    const cmds = mapProfileToCommands("php-wordpress", PHP_WP_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
  });
});

/* ================================================================== */
/*  8. Profile-to-toolchain mapping — Rust                             */
/* ================================================================== */

describe("mapProfileToCommands — rust-cli", () => {
  it("maps build (cargo check) when Cargo.toml present", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    const build = cmds.find((c) => c.type === "build");
    expect(build).toBeDefined();
    expect(build!.tool).toBe("cargo");
    expect(build!.command).toBe("cargo check");
  });

  it("maps test (cargo test)", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    const test = cmds.find((c) => c.type === "test");
    expect(test).toBeDefined();
    expect(test!.command).toBe("cargo test");
  });

  it("maps lint (clippy)", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    const lint = cmds.find((c) => c.type === "lint");
    expect(lint).toBeDefined();
    expect(lint!.tool).toBe("clippy");
    expect(lint!.priority).toBe("recommended");
  });

  it("maps format (rustfmt)", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    const fmt = cmds.find((c) => c.type === "format");
    expect(fmt).toBeDefined();
    expect(fmt!.tool).toBe("rustfmt");
  });

  it("maps dependency_check (cargo audit) when Cargo.lock present", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
    expect(dep!.tool).toBe("cargo-audit");
  });

  it("returns no commands without Cargo.toml", () => {
    const cmds = mapProfileToCommands("rust-cli", ["src/main.rs"]);
    expect(cmds).toHaveLength(0);
  });

  it("expectedLocal is false for system-level Rust tools", () => {
    const cmds = mapProfileToCommands("rust-cli", RUST_FILES);
    for (const cmd of cmds) {
      expect(cmd.expectedLocal).toBe(false);
    }
  });
});

/* ================================================================== */
/*  9. Profile-to-toolchain mapping — Go                               */
/* ================================================================== */

describe("mapProfileToCommands — go-module", () => {
  it("maps build (go build) when go.mod present", () => {
    const cmds = mapProfileToCommands("go-module", GO_FILES);
    const build = cmds.find((c) => c.type === "build");
    expect(build).toBeDefined();
    expect(build!.tool).toBe("go");
    expect(build!.command).toBe("go build ./...");
  });

  it("maps test (go test)", () => {
    const cmds = mapProfileToCommands("go-module", GO_FILES);
    const test = cmds.find((c) => c.type === "test");
    expect(test).toBeDefined();
    expect(test!.command).toBe("go test ./...");
  });

  it("maps format (gofmt)", () => {
    const cmds = mapProfileToCommands("go-module", GO_FILES);
    const fmt = cmds.find((c) => c.type === "format");
    expect(fmt).toBeDefined();
    expect(fmt!.tool).toBe("gofmt");
  });

  it("maps lint (go vet)", () => {
    const cmds = mapProfileToCommands("go-module", GO_FILES);
    const lint = cmds.find((c) => c.type === "lint");
    expect(lint).toBeDefined();
    expect(lint!.command).toBe("go vet ./...");
  });

  it("maps dependency_check when go.sum present", () => {
    const cmds = mapProfileToCommands("go-module", GO_FILES);
    const dep = cmds.find((c) => c.type === "dependency_check");
    expect(dep).toBeDefined();
    expect(dep!.command).toBe("go mod verify");
  });

  it("returns no commands without go.mod", () => {
    const cmds = mapProfileToCommands("go-module", ["main.go"]);
    expect(cmds).toHaveLength(0);
  });
});

/* ================================================================== */
/*  10. Generic/unknown fallback                                       */
/* ================================================================== */

describe("mapProfileToCommands — generic-unknown", () => {
  it("returns no commands", () => {
    const cmds = mapProfileToCommands("generic-unknown", GENERIC_FILES);
    expect(cmds).toHaveLength(0);
  });

  it("returns no commands even with random files", () => {
    const cmds = mapProfileToCommands("generic-unknown", [
      "README.md", "LICENSE", "docs/guide.md",
    ]);
    expect(cmds).toHaveLength(0);
  });
});

/* ================================================================== */
/*  11. Toolchain kind resolution                                      */
/* ================================================================== */

describe("resolveToolchainKind", () => {
  it("returns npm for typescript-node with package-lock", () => {
    expect(resolveToolchainKind("typescript-node", TS_NODE_FILES)).toBe("npm");
  });

  it("returns pnpm when pnpm-lock.yaml present", () => {
    expect(resolveToolchainKind("typescript-node", ["pnpm-lock.yaml"])).toBe("pnpm");
  });

  it("returns yarn when yarn.lock present", () => {
    expect(resolveToolchainKind("typescript-node", ["yarn.lock"])).toBe("yarn");
  });

  it("returns pip for python-backend by default", () => {
    expect(resolveToolchainKind("python-backend", ["requirements.txt"])).toBe("pip");
  });

  it("returns poetry for python-backend with pyproject.toml", () => {
    expect(resolveToolchainKind("python-backend", PYTHON_FILES)).toBe("poetry");
  });

  it("returns composer for php-general", () => {
    expect(resolveToolchainKind("php-general", PHP_FILES)).toBe("composer");
  });

  it("returns cargo for rust-cli", () => {
    expect(resolveToolchainKind("rust-cli", RUST_FILES)).toBe("cargo");
  });

  it("returns go for go-module", () => {
    expect(resolveToolchainKind("go-module", GO_FILES)).toBe("go");
  });

  it("returns generic for generic-unknown", () => {
    expect(resolveToolchainKind("generic-unknown", GENERIC_FILES)).toBe("generic");
  });
});

/* ================================================================== */
/*  12. Availability assessment                                        */
/* ================================================================== */

describe("assessCommandAvailability", () => {
  const tscCommand: ToolchainCommandDefinition = {
    type: "typecheck",
    label: "TypeScript Compiler",
    command: "npx tsc --noEmit",
    tool: "tsc",
    evidence: ["tsconfig.json"],
    expectedLocal: true,
    priority: "recommended",
  };

  const cargoCommand: ToolchainCommandDefinition = {
    type: "build",
    label: "Cargo check",
    command: "cargo check",
    tool: "cargo",
    evidence: ["Cargo.toml"],
    expectedLocal: false,
    priority: "recommended",
  };

  it("marks local tool as likely_available when evidence exists", () => {
    const fileSet = new Set(["tsconfig.json", "package.json"]);
    const avail = assessCommandAvailability(tscCommand, fileSet);
    expect(avail.status).toBe("likely_available");
    expect(avail.recommended).toBe(true);
  });

  it("marks local tool as unknown when evidence missing", () => {
    const fileSet = new Set(["package.json"]);
    const avail = assessCommandAvailability(tscCommand, fileSet);
    expect(avail.status).toBe("unknown");
    expect(avail.recommended).toBe(false);
  });

  it("marks system tool as unknown without host info", () => {
    const fileSet = new Set(["Cargo.toml"]);
    const avail = assessCommandAvailability(cargoCommand, fileSet);
    expect(avail.status).toBe("unknown");
    expect(avail.recommended).toBe(true);
  });

  it("marks system tool as available with host info", () => {
    const fileSet = new Set(["Cargo.toml"]);
    const avail = assessCommandAvailability(cargoCommand, fileSet, ["cargo", "rustc"]);
    expect(avail.status).toBe("available");
    expect(avail.recommended).toBe(true);
  });

  it("marks system tool as unavailable when not on host", () => {
    const fileSet = new Set(["Cargo.toml"]);
    const avail = assessCommandAvailability(cargoCommand, fileSet, ["go", "node"]);
    expect(avail.status).toBe("unavailable");
    expect(avail.recommended).toBe(false);
  });

  it("marks local tool as likely_available even when not on host", () => {
    const fileSet = new Set(["tsconfig.json"]);
    const avail = assessCommandAvailability(tscCommand, fileSet, ["node"]);
    expect(avail.status).toBe("likely_available");
  });

  it("reason explains the status", () => {
    const fileSet = new Set(["tsconfig.json"]);
    const avail = assessCommandAvailability(tscCommand, fileSet);
    expect(avail.reason).toContain("tsc");
  });
});

/* ================================================================== */
/*  13. Workspace check planning — full summary                        */
/* ================================================================== */

describe("buildWorkspaceToolchainSummary", () => {
  it("builds a complete summary for typescript-node", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    expect(summary.adapterId).toBe("typescript-node-toolchain");
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.toolchainKind).toBe("npm");
    expect(summary.commands.length).toBeGreaterThan(0);
    expect(summary.generatedAt).toBeTruthy();
  });

  it("recommended includes commands with recommended priority", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    expect(summary.recommended.length).toBeGreaterThan(0);
    for (const cmd of summary.recommended) {
      expect(cmd.priority).toBe("recommended");
    }
  });

  it("optional includes non-recommended commands", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    for (const cmd of summary.optional) {
      expect(cmd.priority).not.toBe("recommended");
    }
  });

  it("unavailable is empty when host tools confirm availability", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES, {
      hostToolsAvailable: ["tsc", "eslint", "vitest", "npm", "prettier"],
    });
    expect(summary.unavailable).toHaveLength(0);
  });

  it("unavailable includes items when host tools missing", () => {
    const summary = buildWorkspaceToolchainSummary("rust-cli", RUST_FILES, {
      hostToolsAvailable: ["node"],
    });
    expect(summary.unavailable.length).toBeGreaterThan(0);
  });

  it("notes describe the summary", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    expect(summary.notes.length).toBeGreaterThan(0);
    expect(summary.notes[0]).toContain("typescript-node");
  });

  it("generic-unknown produces empty commands", () => {
    const summary = buildWorkspaceToolchainSummary("generic-unknown", GENERIC_FILES);
    expect(summary.commands).toHaveLength(0);
    expect(summary.recommended).toHaveLength(0);
    expect(summary.unavailable).toHaveLength(0);
    expect(summary.notes).toContain('No toolchain commands mapped for profile "generic-unknown".');
  });

  it("availability array matches commands length", () => {
    const summary = buildWorkspaceToolchainSummary("python-backend", PYTHON_FILES);
    expect(summary.availability).toHaveLength(summary.commands.length);
  });
});

/* ================================================================== */
/*  14. buildToolchainSummaryFromFingerprint                           */
/* ================================================================== */

describe("buildToolchainSummaryFromFingerprint", () => {
  it("builds summary from fingerprint and selection", () => {
    const fingerprint: RepoFingerprint = {
      path: "/test",
      detectedAt: new Date().toISOString(),
      languages: ["typescript"],
      frameworks: [{ name: "node", language: "typescript", confidence: "strong" }],
      signals: [{ file: "tsconfig.json", language: "typescript", strength: "strong" }],
      isMixed: false,
      hasStrongSignal: true,
    };
    const selection: ProfileSelection = {
      primary: LANGUAGE_PROFILES["typescript-node"],
      matched: [LANGUAGE_PROFILES["typescript-node"]],
      reason: "strong_language_match",
      explanation: "TypeScript detected with strong signals.",
      confident: true,
    };
    const summary = buildToolchainSummaryFromFingerprint(fingerprint, selection, TS_NODE_FILES);
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.commands.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  15. Mixed repo behavior                                            */
/* ================================================================== */

describe("Mixed repo behavior", () => {
  it("primary profile determines toolchain commands", () => {
    // If primary is typescript-node, we get TS toolchain
    const summary = buildWorkspaceToolchainSummary("typescript-node", MIXED_FILES);
    expect(summary.profileId).toBe("typescript-node");
    const tsc = summary.commands.find((c) => c.tool === "tsc");
    expect(tsc).toBeDefined();
  });

  it("does not mix toolchains across profiles", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", MIXED_FILES);
    const pytest = summary.commands.find((c) => c.tool === "pytest");
    expect(pytest).toBeUndefined();
  });

  it("python profile on mixed files maps Python tools only", () => {
    const summary = buildWorkspaceToolchainSummary("python-backend", MIXED_FILES);
    const eslint = summary.commands.find((c) => c.tool === "eslint");
    expect(eslint).toBeUndefined();
    const ruff = summary.commands.find((c) => c.tool === "ruff");
    expect(ruff).toBeDefined();
  });
});

/* ================================================================== */
/*  16. Execution — mock runner                                        */
/* ================================================================== */

describe("executeCheck", () => {
  const cmd: ToolchainCommandDefinition = {
    type: "test",
    label: "Vitest",
    command: "npx vitest run",
    tool: "vitest",
    evidence: ["vitest.config.ts"],
    expectedLocal: true,
    priority: "recommended",
  };

  it("returns passed when exit code is 0", async () => {
    const result = await executeCheck(cmd, "/test", makeSuccessRunner());
    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);
    expect(result.commandType).toBe("test");
    expect(result.label).toBe("Vitest");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.executedAt).toBeTruthy();
  });

  it("returns failed when exit code is non-zero", async () => {
    const result = await executeCheck(cmd, "/test", makeFailRunner());
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
    expect(result.stderrSummary).toContain("issues found");
  });

  it("returns error when runner throws", async () => {
    const result = await executeCheck(cmd, "/test", makeErrorRunner());
    expect(result.status).toBe("error");
    expect(result.exitCode).toBeNull();
    expect(result.stderrSummary).toContain("Command not found");
  });

  it("captures stdout summary", async () => {
    const result = await executeCheck(cmd, "/test", makeSuccessRunner());
    expect(result.stdoutSummary).toContain("All checks passed");
  });
});

/* ================================================================== */
/*  17. executeChecks — batch execution                                */
/* ================================================================== */

describe("executeChecks", () => {
  const cmds: ToolchainCommandDefinition[] = [
    {
      type: "lint",
      label: "ESLint",
      command: "npx eslint .",
      tool: "eslint",
      evidence: ["eslint.config.js"],
      expectedLocal: true,
      priority: "recommended",
    },
    {
      type: "test",
      label: "Vitest",
      command: "npx vitest run",
      tool: "vitest",
      evidence: ["vitest.config.ts"],
      expectedLocal: true,
      priority: "recommended",
    },
  ];

  it("returns summary with correct counts for all passed", async () => {
    const summary = await executeChecks(cmds, "/test", makeSuccessRunner());
    expect(summary.totalRun).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.errored).toBe(0);
    expect(summary.completedAt).toBeTruthy();
  });

  it("returns summary with correct counts for all failed", async () => {
    const summary = await executeChecks(cmds, "/test", makeFailRunner());
    expect(summary.totalRun).toBe(2);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(2);
  });

  it("returns summary with correct counts for all errored", async () => {
    const summary = await executeChecks(cmds, "/test", makeErrorRunner());
    expect(summary.totalRun).toBe(2);
    expect(summary.errored).toBe(2);
    expect(summary.passed).toBe(0);
  });

  it("results array matches commands count", async () => {
    const summary = await executeChecks(cmds, "/test", makeSuccessRunner());
    expect(summary.results).toHaveLength(2);
  });
});

/* ================================================================== */
/*  18. buildCheckResultSummary                                        */
/* ================================================================== */

describe("buildCheckResultSummary", () => {
  it("summarizes a mix of results correctly", () => {
    const results: ToolchainCheckResult[] = [
      {
        commandType: "lint",
        label: "ESLint",
        commandRun: "npx eslint .",
        status: "passed",
        exitCode: 0,
        durationMs: 100,
        stdoutSummary: "",
        stderrSummary: "",
        executedAt: new Date().toISOString(),
      },
      {
        commandType: "test",
        label: "Vitest",
        commandRun: "npx vitest run",
        status: "failed",
        exitCode: 1,
        durationMs: 200,
        stdoutSummary: "",
        stderrSummary: "1 test failed",
        executedAt: new Date().toISOString(),
      },
      {
        commandType: "build",
        label: "npm build",
        commandRun: "npm run build",
        status: "error",
        exitCode: null,
        durationMs: 50,
        stdoutSummary: "",
        stderrSummary: "ENOENT",
        executedAt: new Date().toISOString(),
      },
      {
        commandType: "format",
        label: "Prettier",
        commandRun: "npx prettier --check .",
        status: "skipped",
        exitCode: null,
        durationMs: 0,
        stdoutSummary: "",
        stderrSummary: "",
        executedAt: new Date().toISOString(),
      },
    ];
    const summary = buildCheckResultSummary(results);
    expect(summary.totalRun).toBe(4);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.errored).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

/* ================================================================== */
/*  19. Session integration — events                                   */
/* ================================================================== */

describe("Session integration — events", () => {
  it("isToolchainEvent returns true for toolchain event kinds", () => {
    expect(isToolchainEvent("toolchain_summary_generated")).toBe(true);
    expect(isToolchainEvent("toolchain_check_started")).toBe(true);
    expect(isToolchainEvent("toolchain_check_completed")).toBe(true);
  });

  it("isToolchainEvent returns false for non-toolchain kinds", () => {
    expect(isToolchainEvent("session_created")).toBe(false);
    expect(isToolchainEvent("workspace_bound")).toBe(false);
  });

  it("toolchainSummaryGenerated creates an info event", () => {
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    const event = toolchainSummaryGenerated(summary);
    expect(event.kind).toBe("info");
    expect(event.message).toContain("typescript-node");
    expect(event.message).toContain("Toolchain summary generated");
    expect(event.detail).toBeDefined();
    expect(event.detail!.toolchainAction).toBe("summary_generated");
  });

  it("toolchainCheckStarted creates an info event", () => {
    const event = toolchainCheckStarted("lint", "ESLint");
    expect(event.kind).toBe("info");
    expect(event.message).toContain("ESLint");
    expect(event.detail!.toolchainAction).toBe("check_started");
  });

  it("toolchainCheckCompleted creates note for passed", () => {
    const result: ToolchainCheckResult = {
      commandType: "lint",
      label: "ESLint",
      commandRun: "npx eslint .",
      status: "passed",
      exitCode: 0,
      durationMs: 150,
      stdoutSummary: "",
      stderrSummary: "",
      executedAt: new Date().toISOString(),
    };
    const event = toolchainCheckCompleted(result);
    expect(event.kind).toBe("note");
    expect(event.message).toContain("✓");
    expect(event.message).toContain("passed");
    expect(event.detail!.toolchainAction).toBe("check_completed");
  });

  it("toolchainCheckCompleted creates warning for failed", () => {
    const result: ToolchainCheckResult = {
      commandType: "test",
      label: "Vitest",
      commandRun: "npx vitest run",
      status: "failed",
      exitCode: 1,
      durationMs: 250,
      stdoutSummary: "",
      stderrSummary: "",
      executedAt: new Date().toISOString(),
    };
    const event = toolchainCheckCompleted(result);
    expect(event.kind).toBe("warning");
    expect(event.message).toContain("✗");
    expect(event.message).toContain("failed");
  });

  it("toolchainCheckCompleted creates failed for error", () => {
    const result: ToolchainCheckResult = {
      commandType: "build",
      label: "npm build",
      commandRun: "npm run build",
      status: "error",
      exitCode: null,
      durationMs: 10,
      stdoutSummary: "",
      stderrSummary: "ENOENT",
      executedAt: new Date().toISOString(),
    };
    const event = toolchainCheckCompleted(result);
    expect(event.kind).toBe("failed");
    expect(event.message).toContain("⚠");
  });
});

/* ================================================================== */
/*  20. toolchainChecksSummaryEvents                                   */
/* ================================================================== */

describe("toolchainChecksSummaryEvents", () => {
  it("creates events for each result plus a summary", () => {
    const summary: ToolchainCheckResultSummary = {
      totalRun: 2,
      passed: 1,
      failed: 1,
      errored: 0,
      skipped: 0,
      results: [
        {
          commandType: "lint",
          label: "ESLint",
          commandRun: "npx eslint .",
          status: "passed",
          exitCode: 0,
          durationMs: 100,
          stdoutSummary: "",
          stderrSummary: "",
          executedAt: new Date().toISOString(),
        },
        {
          commandType: "test",
          label: "Vitest",
          commandRun: "npx vitest run",
          status: "failed",
          exitCode: 1,
          durationMs: 200,
          stdoutSummary: "",
          stderrSummary: "",
          executedAt: new Date().toISOString(),
        },
      ],
      completedAt: new Date().toISOString(),
    };
    const events = toolchainChecksSummaryEvents(summary);
    // 2 check events + 1 summary event
    expect(events).toHaveLength(3);
    expect(events[2].message).toContain("1/2 passed");
    expect(events[2].kind).toBe("warning"); // has failures
  });

  it("summary event is note when all passed", () => {
    const summary: ToolchainCheckResultSummary = {
      totalRun: 1,
      passed: 1,
      failed: 0,
      errored: 0,
      skipped: 0,
      results: [
        {
          commandType: "lint",
          label: "ESLint",
          commandRun: "npx eslint .",
          status: "passed",
          exitCode: 0,
          durationMs: 100,
          stdoutSummary: "",
          stderrSummary: "",
          executedAt: new Date().toISOString(),
        },
      ],
      completedAt: new Date().toISOString(),
    };
    const events = toolchainChecksSummaryEvents(summary);
    expect(events[events.length - 1].kind).toBe("note");
    expect(events[events.length - 1].message).toContain("all checks passed");
  });
});

/* ================================================================== */
/*  21. filterToolchainEvents                                          */
/* ================================================================== */

describe("filterToolchainEvents", () => {
  it("filters events with toolchainAction detail", () => {
    const events: SessionEvent[] = [
      {
        kind: "session_created",
        timestamp: new Date().toISOString(),
        message: "Session created",
      },
      {
        kind: "info",
        timestamp: new Date().toISOString(),
        message: "Toolchain summary generated",
        detail: { toolchainAction: "summary_generated" },
      },
      {
        kind: "note",
        timestamp: new Date().toISOString(),
        message: "Workspace opened",
      },
    ];
    const filtered = filterToolchainEvents(events);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].detail!.toolchainAction).toBe("summary_generated");
  });
});

/* ================================================================== */
/*  22. Session summary — toolchain fields                             */
/* ================================================================== */

describe("SessionSummary — toolchain fields (Phase 39)", () => {
  let sm: SessionManager;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
  });

  it("toolchain fields are null when no toolchain summary provided", () => {
    const session = sm.createSession();
    const summary = sm.getSessionSummary(session.id);
    expect(summary.toolchainAdapterId).toBeNull();
    expect(summary.toolchainKind).toBeNull();
    expect(summary.toolchainCommandCount).toBeNull();
    expect(summary.toolchainRecommendedCount).toBeNull();
    expect(summary.toolchainUnavailableCount).toBeNull();
  });

  it("toolchain fields are populated when toolchain summary provided", () => {
    const session = sm.createSession();
    const summary = sm.getSessionSummary(session.id, undefined, null, {
      adapterId: "typescript-node-toolchain",
      toolchainKind: "npm",
      commandCount: 5,
      recommendedCount: 3,
      unavailableCount: 0,
    });
    expect(summary.toolchainAdapterId).toBe("typescript-node-toolchain");
    expect(summary.toolchainKind).toBe("npm");
    expect(summary.toolchainCommandCount).toBe(5);
    expect(summary.toolchainRecommendedCount).toBe(3);
    expect(summary.toolchainUnavailableCount).toBe(0);
  });

  it("toolchain and fingerprint fields can coexist", () => {
    const session = sm.createSession();
    const summary = sm.getSessionSummary(
      session.id,
      undefined,
      {
        detectedLanguages: ["typescript"],
        profileId: "typescript-node",
        profileLabel: "TypeScript (Node.js)",
      },
      {
        adapterId: "typescript-node-toolchain",
        toolchainKind: "npm",
        commandCount: 4,
        recommendedCount: 2,
        unavailableCount: 1,
      },
    );
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.toolchainAdapterId).toBe("typescript-node-toolchain");
    expect(summary.toolchainCommandCount).toBe(4);
  });
});

/* ================================================================== */
/*  23. buildToolchainSessionSummary                                   */
/* ================================================================== */

describe("buildToolchainSessionSummary", () => {
  it("builds session summary from workspace toolchain summary", () => {
    const wsSummary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    const sessionSummary = buildToolchainSessionSummary(wsSummary);
    expect(sessionSummary.adapterId).toBe("typescript-node-toolchain");
    expect(sessionSummary.toolchainKind).toBe("npm");
    expect(sessionSummary.commandCount).toBeGreaterThan(0);
    expect(sessionSummary.notes.length).toBeGreaterThan(0);
  });

  it("includes last check results when provided", () => {
    const wsSummary = buildWorkspaceToolchainSummary("rust-cli", RUST_FILES);
    const lastResults: ToolchainCheckResultSummary = {
      totalRun: 3,
      passed: 2,
      failed: 1,
      errored: 0,
      skipped: 0,
      results: [],
      completedAt: new Date().toISOString(),
    };
    const sessionSummary = buildToolchainSessionSummary(wsSummary, lastResults);
    expect(sessionSummary.lastCheckResults).toBeDefined();
    expect(sessionSummary.lastCheckResults!.totalRun).toBe(3);
    expect(sessionSummary.lastCheckResults!.passed).toBe(2);
  });

  it("omits lastCheckResults when null", () => {
    const wsSummary = buildWorkspaceToolchainSummary("go-module", GO_FILES);
    const sessionSummary = buildToolchainSessionSummary(wsSummary, null);
    expect(sessionSummary.lastCheckResults).toBeUndefined();
  });
});

/* ================================================================== */
/*  24. Command integration — new commands exist                       */
/* ================================================================== */

describe("Command integration — Phase 39 commands", () => {
  it("COMMAND_DEFINITIONS includes inspect_toolchain", () => {
    const def = getCommandDefinition("inspect_toolchain");
    expect(def).toBeDefined();
    expect(def!.category).toBe("toolchain");
    expect(def!.label).toBe("Inspect Toolchain");
  });

  it("COMMAND_DEFINITIONS includes run_workspace_check", () => {
    const def = getCommandDefinition("run_workspace_check");
    expect(def).toBeDefined();
    expect(def!.category).toBe("toolchain");
  });

  it("COMMAND_DEFINITIONS includes refresh_toolchain_summary", () => {
    const def = getCommandDefinition("refresh_toolchain_summary");
    expect(def).toBeDefined();
    expect(def!.category).toBe("toolchain");
  });

  it("ALL_COMMAND_CATEGORIES includes toolchain", () => {
    expect(ALL_COMMAND_CATEGORIES).toContain("toolchain");
  });

  it("ALL_COMMAND_IDS includes new command ids", () => {
    expect(ALL_COMMAND_IDS).toContain("inspect_toolchain");
    expect(ALL_COMMAND_IDS).toContain("run_workspace_check");
    expect(ALL_COMMAND_IDS).toContain("refresh_toolchain_summary");
  });
});

/* ================================================================== */
/*  25. Command availability — toolchain commands                      */
/* ================================================================== */

describe("Command availability — toolchain commands", () => {
  function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
    return {
      id: "s-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: "initializing",
      status: "idle",
      workspacePath: null,
      workspaceSource: null,
      workspaceStatus: null,
      workspaceReadiness: null,
      workspaceIsGitRepo: null,
      workspaceRemoteUrl: null,
      workspaceBranch: null,
      eventCount: 1,
      lastEventKind: "session_created",
      lastEventMessage: "Session created",
      approvalRequired: false,
      isBlocked: false,
      lastError: null,
      attachedResourceCount: 0,
      mcpServerCount: 0,
      mcpServers: [],
      agentCount: 0,
      agents: [],
      detectedLanguages: null,
      detectedFrameworks: null,
      isMixedRepo: null,
      profileId: null,
      profileLabel: null,
      primaryLanguage: null,
      profileSelectionReason: null,
      profileSelectionExplanation: null,
      profileConfident: null,
      toolchainAdapterId: null,
      toolchainKind: null,
      toolchainCommandCount: null,
      toolchainRecommendedCount: null,
      toolchainUnavailableCount: null,
      ...overrides,
    };
  }

  it("inspect_toolchain unavailable without session", () => {
    const ctx: CommandContextState = { hasActiveSession: false, sessionSummary: null };
    expect(getCommandAvailability("inspect_toolchain", ctx).available).toBe(false);
  });

  it("inspect_toolchain unavailable without workspace", () => {
    const ctx: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary({ workspacePath: null }),
    };
    expect(getCommandAvailability("inspect_toolchain", ctx).available).toBe(false);
  });

  it("inspect_toolchain available with workspace", () => {
    const ctx: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary({ workspacePath: "/workspace" }),
    };
    expect(getCommandAvailability("inspect_toolchain", ctx).available).toBe(true);
  });

  it("run_workspace_check unavailable without workspace", () => {
    const ctx: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary(),
    };
    expect(getCommandAvailability("run_workspace_check", ctx).available).toBe(false);
  });

  it("run_workspace_check available with workspace", () => {
    const ctx: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary({ workspacePath: "/workspace" }),
    };
    expect(getCommandAvailability("run_workspace_check", ctx).available).toBe(true);
  });

  it("refresh_toolchain_summary follows workspace availability", () => {
    const noWs: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary(),
    };
    const withWs: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: makeSummary({ workspacePath: "/ws" }),
    };
    expect(getCommandAvailability("refresh_toolchain_summary", noWs).available).toBe(false);
    expect(getCommandAvailability("refresh_toolchain_summary", withWs).available).toBe(true);
  });
});

/* ================================================================== */
/*  26. Command validation — new commands                              */
/* ================================================================== */

describe("Command validation — Phase 39", () => {
  it("inspect_toolchain validation passes with empty data", () => {
    const result = validateCommand({
      commandId: "inspect_toolchain",
      data: {},
    });
    expect(result.valid).toBe(true);
  });

  it("run_workspace_check requires commandType", () => {
    const result = validateCommand({
      commandId: "run_workspace_check",
      data: { commandType: "" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("commandType");
  });

  it("run_workspace_check passes with valid commandType", () => {
    const result = validateCommand({
      commandId: "run_workspace_check",
      data: { commandType: "lint" },
    });
    expect(result.valid).toBe(true);
  });

  it("refresh_toolchain_summary validation passes with empty data", () => {
    const result = validateCommand({
      commandId: "refresh_toolchain_summary",
      data: {},
    });
    expect(result.valid).toBe(true);
  });
});

/* ================================================================== */
/*  27. Session event kinds — Phase 39                                 */
/* ================================================================== */

describe("Session event kinds — Phase 39", () => {
  it("SessionEventKind includes toolchain events", () => {
    // These are typed but we can verify they're usable as event kinds
    const summaryEvent = toolchainSummaryGenerated(
      buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES),
    );
    expect(summaryEvent.kind).toBeTruthy();
  });

  it("toolchain events can be appended to session timeline", () => {
    _resetIdCounter();
    const sm = new SessionManager();
    const session = sm.createSession();
    const summary = buildWorkspaceToolchainSummary("typescript-node", TS_NODE_FILES);
    const event = toolchainSummaryGenerated(summary);
    sm.appendEvent(session.id, event);
    expect(session.events.length).toBeGreaterThan(1);
    const last = session.events[session.events.length - 1];
    expect(last.detail!.toolchainAction).toBe("summary_generated");
  });
});

/* ================================================================== */
/*  28. End-to-end: fingerprint → profile → toolchain                  */
/* ================================================================== */

describe("End-to-end: fingerprint → profile → toolchain", () => {
  it("detects TypeScript repo, selects profile, builds toolchain summary", () => {
    const fingerprint = fingerprintRepo("/test", TS_NODE_FILES);
    expect(fingerprint.languages).toContain("typescript");

    const selection = selectProfiles(fingerprint);
    expect(selection.primary.id).toBe("typescript-node");

    const summary = buildWorkspaceToolchainSummary(selection.primary.id, TS_NODE_FILES);
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.recommended.length).toBeGreaterThan(0);
  });

  it("detects Rust repo, selects profile, builds toolchain summary", () => {
    const fingerprint = fingerprintRepo("/test", RUST_FILES);
    const selection = selectProfiles(fingerprint);
    expect(selection.primary.id).toBe("rust-cli");

    const summary = buildWorkspaceToolchainSummary(selection.primary.id, RUST_FILES);
    expect(summary.commands.find((c) => c.tool === "cargo")).toBeDefined();
    expect(summary.commands.find((c) => c.tool === "clippy")).toBeDefined();
  });

  it("detects Python repo, selects profile, builds toolchain summary", () => {
    const fingerprint = fingerprintRepo("/test", PYTHON_FILES);
    const selection = selectProfiles(fingerprint);
    expect(selection.primary.id).toBe("python-backend");

    const summary = buildWorkspaceToolchainSummary(selection.primary.id, PYTHON_FILES);
    expect(summary.commands.find((c) => c.tool === "pytest")).toBeDefined();
  });

  it("unknown repo gets empty toolchain summary", () => {
    const fingerprint = fingerprintRepo("/test", GENERIC_FILES);
    const selection = selectProfiles(fingerprint);
    expect(selection.primary.id).toBe("generic-unknown");

    const summary = buildWorkspaceToolchainSummary(selection.primary.id, GENERIC_FILES);
    expect(summary.commands).toHaveLength(0);
  });
});

/* ================================================================== */
/*  29. Honesty and safety                                             */
/* ================================================================== */

describe("Honesty and safety", () => {
  it("system tools are marked unknown without host detection", () => {
    const summary = buildWorkspaceToolchainSummary("rust-cli", RUST_FILES);
    for (const avail of summary.availability) {
      if (!avail.command.expectedLocal) {
        expect(avail.status).toBe("unknown");
        expect(avail.reason).toContain("host detection");
      }
    }
  });

  it("does not claim unavailable tools as supported", () => {
    const summary = buildWorkspaceToolchainSummary("rust-cli", RUST_FILES, {
      hostToolsAvailable: [],
    });
    // All system tools should be unavailable when empty host tools provided
    for (const avail of summary.availability) {
      if (!avail.command.expectedLocal) {
        expect(avail.status).toBe("unavailable");
      }
    }
  });

  it("notes explain unknown availability", () => {
    const summary = buildWorkspaceToolchainSummary("go-module", GO_FILES);
    const hasUnknownNote = summary.notes.some((n) => n.includes("unknown availability"));
    expect(hasUnknownNote).toBe(true);
  });

  it("generic-unknown profile honestly reports no commands", () => {
    const summary = buildWorkspaceToolchainSummary("generic-unknown", []);
    expect(summary.notes).toContain('No toolchain commands mapped for profile "generic-unknown".');
  });
});

/* ================================================================== */
/*  30. Output truncation                                              */
/* ================================================================== */

describe("Output truncation in execution", () => {
  it("truncates long output", async () => {
    const longOutput = "x".repeat(5000);
    const runner: ShellRunner = {
      run: async () => ({
        exitCode: 0,
        stdout: longOutput,
        stderr: "",
      }),
    };
    const cmd: ToolchainCommandDefinition = {
      type: "lint",
      label: "Test",
      command: "test",
      tool: "test",
      evidence: [],
      expectedLocal: true,
      priority: "recommended",
    };
    const result = await executeCheck(cmd, "/test", runner);
    expect(result.stdoutSummary.length).toBeLessThan(longOutput.length);
    expect(result.stdoutSummary).toContain("[truncated");
  });
});
