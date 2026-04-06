/**
 * Phase 40 — Minimal LSP bridge and diagnostics layer.
 *
 * Tests for:
 * - Language-service types and enumerations
 * - Profile-to-language-service mapping (all 8 profiles)
 * - Config evidence checking
 * - Context hint building
 * - Diagnostics command hints
 * - Availability assessment (available, likely_available, unavailable, not_configured, unknown)
 * - Service support helpers
 * - Diagnostics output parsing
 * - Diagnostics summary building
 * - Diagnostics collection (explicit run)
 * - Session event creation
 * - Session summary extension
 * - Command integration (3 new commands)
 * - Command validation, availability, execution
 */

import { describe, it, expect, vi } from "vitest";

import {
  mapProfileToServiceKind,
  getDiagnosticsSources,
  getDiagnosticsCommandHints,
  buildContextHint,
  getConfigEvidence,
  hasConfigEvidence,
  assessLanguageServiceAvailability,
  hasLanguageServiceSupport,
  getServiceLabel,
  parseSimpleDiagnostics,
  buildDiagnosticsSummary,
  collectDiagnostics,
  LANGUAGE_SERVICE_EVENT_KINDS,
  isLanguageServiceEvent,
  languageServiceAssessed,
  diagnosticsCollected,
  diagnosticsCollectionFailed,
  resultSummaryEvents,
  filterLanguageServiceEvents,
  buildLanguageServiceSessionSummary,
} from "../../src/language-service/index.js";

import type {
  LanguageServiceKind,
  FileDiagnostic,
  LanguageServiceAvailability,
  WorkspaceDiagnosticSummary,
  LanguageServiceResultSummary,
  DiagnosticsShellRunner,
} from "../../src/language-service/index.js";

import type { LanguageProfileId } from "../../src/fingerprint/types.js";

import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
  groupByCategory,
} from "../../src/commands/types.js";
import type { CommandPayload } from "../../src/commands/types.js";

import { validateCommand } from "../../src/commands/validation.js";

import {
  getCommandAvailability,
  getAllCommandAvailability,
} from "../../src/commands/availability.js";
import type { CommandContextState } from "../../src/commands/availability.js";

import { executeCommand } from "../../src/commands/executor.js";
import type { CommandExecutorDeps } from "../../src/commands/executor.js";

import { SessionManager } from "../../src/session/session-manager.js";

/* ================================================================== */
/*  1. Types and service kind mapping                                  */
/* ================================================================== */

describe("Profile-to-service mapping (mapping.ts)", () => {
  it("typescript-node → typescript", () => {
    expect(mapProfileToServiceKind("typescript-node")).toBe("typescript");
  });

  it("javascript-node → javascript", () => {
    expect(mapProfileToServiceKind("javascript-node")).toBe("javascript");
  });

  it("python-backend → python", () => {
    expect(mapProfileToServiceKind("python-backend")).toBe("python");
  });

  it("php-general → php", () => {
    expect(mapProfileToServiceKind("php-general")).toBe("php");
  });

  it("php-wordpress → php", () => {
    expect(mapProfileToServiceKind("php-wordpress")).toBe("php");
  });

  it("rust-cli → rust", () => {
    expect(mapProfileToServiceKind("rust-cli")).toBe("rust");
  });

  it("go-module → go", () => {
    expect(mapProfileToServiceKind("go-module")).toBe("go");
  });

  it("generic-unknown → none", () => {
    expect(mapProfileToServiceKind("generic-unknown")).toBe("none");
  });

  it("all 8 profiles map deterministically", () => {
    const profiles: LanguageProfileId[] = [
      "typescript-node", "javascript-node", "python-backend",
      "php-general", "php-wordpress", "rust-cli", "go-module",
      "generic-unknown",
    ];
    const results = profiles.map(mapProfileToServiceKind);
    expect(results).toEqual([
      "typescript", "javascript", "python",
      "php", "php", "rust", "go",
      "none",
    ]);
  });
});

/* ================================================================== */
/*  2. Diagnostics sources                                             */
/* ================================================================== */

describe("Diagnostics sources", () => {
  it("typescript has tsc and eslint", () => {
    const sources = getDiagnosticsSources("typescript");
    expect(sources).toContain("tsc");
    expect(sources).toContain("eslint");
  });

  it("python has mypy and ruff and pyright", () => {
    const sources = getDiagnosticsSources("python");
    expect(sources).toContain("mypy");
    expect(sources).toContain("ruff");
    expect(sources).toContain("pyright");
  });

  it("php has phpstan and psalm", () => {
    const sources = getDiagnosticsSources("php");
    expect(sources).toContain("phpstan");
    expect(sources).toContain("psalm");
  });

  it("rust has cargo check and clippy", () => {
    const sources = getDiagnosticsSources("rust");
    expect(sources).toContain("cargo check");
    expect(sources).toContain("clippy");
  });

  it("go has go vet and gopls", () => {
    const sources = getDiagnosticsSources("go");
    expect(sources).toContain("go vet");
    expect(sources).toContain("gopls");
  });

  it("none returns empty array", () => {
    expect(getDiagnosticsSources("none")).toHaveLength(0);
  });
});

/* ================================================================== */
/*  3. Context hints                                                   */
/* ================================================================== */

describe("Context hints (buildContextHint)", () => {
  it("typescript supports type-check, lint, format, and could provide symbols", () => {
    const hint = buildContextHint("typescript");
    expect(hint.serviceKind).toBe("typescript");
    expect(hint.supportsTypeCheck).toBe(true);
    expect(hint.supportsLint).toBe(true);
    expect(hint.supportsFormat).toBe(true);
    expect(hint.couldProvideSymbols).toBe(true);
    expect(hint.explanation).toContain("tsc");
  });

  it("javascript supports lint and format but not type-check", () => {
    const hint = buildContextHint("javascript");
    expect(hint.supportsTypeCheck).toBe(false);
    expect(hint.supportsLint).toBe(true);
    expect(hint.supportsFormat).toBe(true);
  });

  it("python supports type-check and lint", () => {
    const hint = buildContextHint("python");
    expect(hint.supportsTypeCheck).toBe(true);
    expect(hint.supportsLint).toBe(true);
    expect(hint.explanation).toContain("mypy");
  });

  it("php supports type-check and lint", () => {
    const hint = buildContextHint("php");
    expect(hint.supportsTypeCheck).toBe(true);
    expect(hint.supportsLint).toBe(true);
    expect(hint.explanation).toContain("phpstan");
  });

  it("rust supports type-check and lint", () => {
    const hint = buildContextHint("rust");
    expect(hint.supportsTypeCheck).toBe(true);
    expect(hint.supportsLint).toBe(true);
    expect(hint.explanation).toContain("cargo check");
  });

  it("go supports type-check and lint", () => {
    const hint = buildContextHint("go");
    expect(hint.supportsTypeCheck).toBe(true);
    expect(hint.supportsLint).toBe(true);
    expect(hint.explanation).toContain("go vet");
  });

  it("none has no capabilities", () => {
    const hint = buildContextHint("none");
    expect(hint.supportsTypeCheck).toBe(false);
    expect(hint.supportsLint).toBe(false);
    expect(hint.supportsFormat).toBe(false);
    expect(hint.couldProvideSymbols).toBe(false);
    expect(hint.explanation).toContain("No language service");
  });
});

/* ================================================================== */
/*  4. Diagnostics command hints                                       */
/* ================================================================== */

describe("Diagnostics command hints", () => {
  it("typescript has tsc and eslint commands", () => {
    const hints = getDiagnosticsCommandHints("typescript");
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints[0].tool).toBe("tsc");
    expect(hints[1].tool).toBe("eslint");
  });

  it("javascript has eslint command", () => {
    const hints = getDiagnosticsCommandHints("javascript");
    expect(hints.length).toBeGreaterThanOrEqual(1);
    expect(hints[0].tool).toBe("eslint");
  });

  it("python has mypy and ruff commands", () => {
    const hints = getDiagnosticsCommandHints("python");
    expect(hints.length).toBeGreaterThanOrEqual(2);
  });

  it("rust has cargo and clippy commands", () => {
    const hints = getDiagnosticsCommandHints("rust");
    expect(hints.length).toBeGreaterThanOrEqual(2);
  });

  it("go has go vet command", () => {
    const hints = getDiagnosticsCommandHints("go");
    expect(hints.length).toBeGreaterThanOrEqual(1);
  });

  it("none has no commands", () => {
    expect(getDiagnosticsCommandHints("none")).toHaveLength(0);
  });
});

/* ================================================================== */
/*  5. Config evidence                                                 */
/* ================================================================== */

describe("Config evidence checking", () => {
  it("detects tsconfig.json for typescript", () => {
    expect(hasConfigEvidence("typescript", ["src/index.ts", "tsconfig.json"])).toBe(true);
  });

  it("detects package.json for javascript", () => {
    expect(hasConfigEvidence("javascript", ["index.js", "package.json"])).toBe(true);
  });

  it("detects pyproject.toml for python", () => {
    expect(hasConfigEvidence("python", ["main.py", "pyproject.toml"])).toBe(true);
  });

  it("detects composer.json for php", () => {
    expect(hasConfigEvidence("php", ["index.php", "composer.json"])).toBe(true);
  });

  it("detects Cargo.toml for rust", () => {
    expect(hasConfigEvidence("rust", ["src/main.rs", "Cargo.toml"])).toBe(true);
  });

  it("detects go.mod for go", () => {
    expect(hasConfigEvidence("go", ["main.go", "go.mod"])).toBe(true);
  });

  it("returns false for none", () => {
    expect(hasConfigEvidence("none", ["file.txt"])).toBe(false);
  });

  it("returns false when no config files present", () => {
    expect(hasConfigEvidence("typescript", ["src/index.ts", "readme.md"])).toBe(false);
  });

  it("handles nested paths (basename match)", () => {
    expect(hasConfigEvidence("typescript", ["project/tsconfig.json"])).toBe(true);
  });

  it("getConfigEvidence returns expected patterns for typescript", () => {
    const patterns = getConfigEvidence("typescript");
    expect(patterns).toContain("tsconfig.json");
  });
});

/* ================================================================== */
/*  6. Availability assessment                                         */
/* ================================================================== */

describe("Availability assessment (availability.ts)", () => {
  describe("TypeScript / JavaScript", () => {
    it("typescript-node with tsconfig and tools → available", () => {
      const result = assessLanguageServiceAvailability(
        "typescript-node",
        ["src/index.ts", "tsconfig.json"],
        ["tsc", "eslint"],
      );
      expect(result.serviceKind).toBe("typescript");
      expect(result.status).toBe("available");
      expect(result.unavailableReason).toBeNull();
      expect(result.explanation).toContain("available");
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it("typescript-node with tsconfig but no tool check → likely_available", () => {
      const result = assessLanguageServiceAvailability(
        "typescript-node",
        ["src/index.ts", "tsconfig.json"],
      );
      expect(result.status).toBe("likely_available");
      expect(result.explanation).toContain("likely");
    });

    it("typescript-node with tsconfig but tools not found → unavailable (binary not found)", () => {
      const result = assessLanguageServiceAvailability(
        "typescript-node",
        ["src/index.ts", "tsconfig.json"],
        [],
      );
      expect(result.status).toBe("unavailable");
      expect(result.unavailableReason).toBe("service_binary_not_found");
    });

    it("typescript-node with tools but no config → not_configured", () => {
      const result = assessLanguageServiceAvailability(
        "typescript-node",
        ["src/index.ts"],
        ["tsc"],
      );
      expect(result.status).toBe("not_configured");
      expect(result.unavailableReason).toBe("workspace_not_configured");
    });
  });

  describe("Python", () => {
    it("python-backend with pyproject.toml and mypy → available", () => {
      const result = assessLanguageServiceAvailability(
        "python-backend",
        ["main.py", "pyproject.toml"],
        ["mypy"],
      );
      expect(result.serviceKind).toBe("python");
      expect(result.status).toBe("available");
    });

    it("python-backend with no config and no tools → unknown", () => {
      const result = assessLanguageServiceAvailability(
        "python-backend",
        ["main.py"],
      );
      expect(result.status).toBe("unknown");
      expect(result.unavailableReason).toBe("unknown");
    });
  });

  describe("PHP", () => {
    it("php-general with composer.json → likely_available", () => {
      const result = assessLanguageServiceAvailability(
        "php-general",
        ["index.php", "composer.json"],
      );
      expect(result.serviceKind).toBe("php");
      expect(result.status).toBe("likely_available");
    });

    it("php-wordpress with phpstan → available", () => {
      const result = assessLanguageServiceAvailability(
        "php-wordpress",
        ["wp-config.php", "composer.json"],
        ["phpstan"],
      );
      expect(result.status).toBe("available");
    });
  });

  describe("Rust", () => {
    it("rust-cli with Cargo.toml → likely_available", () => {
      const result = assessLanguageServiceAvailability(
        "rust-cli",
        ["src/main.rs", "Cargo.toml"],
      );
      expect(result.serviceKind).toBe("rust");
      expect(result.status).toBe("likely_available");
    });

    it("rust-cli with Cargo.toml and cargo → available", () => {
      const result = assessLanguageServiceAvailability(
        "rust-cli",
        ["src/main.rs", "Cargo.toml"],
        ["cargo", "clippy"],
      );
      expect(result.status).toBe("available");
    });
  });

  describe("Go", () => {
    it("go-module with go.mod → likely_available", () => {
      const result = assessLanguageServiceAvailability(
        "go-module",
        ["main.go", "go.mod"],
      );
      expect(result.serviceKind).toBe("go");
      expect(result.status).toBe("likely_available");
    });

    it("go-module with go.mod and go tool → available", () => {
      const result = assessLanguageServiceAvailability(
        "go-module",
        ["main.go", "go.mod"],
        ["go"],
      );
      expect(result.status).toBe("available");
    });
  });

  describe("Generic / unknown", () => {
    it("generic-unknown → unavailable with generic_profile reason", () => {
      const result = assessLanguageServiceAvailability(
        "generic-unknown",
        ["file.txt"],
      );
      expect(result.serviceKind).toBe("none");
      expect(result.status).toBe("unavailable");
      expect(result.unavailableReason).toBe("generic_profile");
      expect(result.explanation).toContain("generic");
    });
  });

  describe("Availability helpers", () => {
    it("hasLanguageServiceSupport returns true for typescript-node", () => {
      expect(hasLanguageServiceSupport("typescript-node")).toBe(true);
    });

    it("hasLanguageServiceSupport returns false for generic-unknown", () => {
      expect(hasLanguageServiceSupport("generic-unknown")).toBe(false);
    });

    it("getServiceLabel returns human-readable labels", () => {
      expect(getServiceLabel("typescript-node")).toBe("TypeScript Language Service");
      expect(getServiceLabel("python-backend")).toBe("Python Language Service");
      expect(getServiceLabel("generic-unknown")).toBe("No Language Service");
    });
  });

  describe("Assessment output structure", () => {
    it("always includes assessedAt timestamp", () => {
      const result = assessLanguageServiceAvailability("typescript-node", ["tsconfig.json"]);
      expect(result.assessedAt).toBeDefined();
      expect(new Date(result.assessedAt).getTime()).toBeGreaterThan(0);
    });

    it("always includes contextHint", () => {
      const result = assessLanguageServiceAvailability("typescript-node", ["tsconfig.json"]);
      expect(result.contextHint).toBeDefined();
      expect(result.contextHint.serviceKind).toBe("typescript");
    });

    it("always includes profileId", () => {
      const result = assessLanguageServiceAvailability("go-module", ["go.mod"]);
      expect(result.profileId).toBe("go-module");
    });
  });
});

/* ================================================================== */
/*  7. Diagnostics parsing                                             */
/* ================================================================== */

describe("Diagnostics parsing (collection.ts)", () => {
  it("parses tsc-style output", () => {
    const output = `src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(25,12): warning TS6133: 'x' is declared but its value is never read.`;
    const result = parseSimpleDiagnostics(output, "tsc");
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe("src/index.ts");
    expect(result[0].line).toBe(10);
    expect(result[0].column).toBe(5);
    expect(result[0].severity).toBe("error");
    expect(result[0].code).toBe("TS2322");
    expect(result[0].source).toBe("tsc");
    expect(result[1].severity).toBe("warning");
  });

  it("parses generic colon-separated output", () => {
    const output = `src/main.py:15:3: error: Incompatible types
src/util.py:20:1: warning: Unused variable 'x'`;
    const result = parseSimpleDiagnostics(output, "mypy");
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe("src/main.py");
    expect(result[0].line).toBe(15);
    expect(result[0].column).toBe(3);
    expect(result[0].severity).toBe("error");
    expect(result[1].severity).toBe("warning");
  });

  it("parses output without column", () => {
    const output = `main.go:42: error: undefined variable`;
    const result = parseSimpleDiagnostics(output, "go");
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(42);
    expect(result[0].column).toBe(0);
    expect(result[0].severity).toBe("error");
  });

  it("returns empty array for unrecognized output", () => {
    const output = "All checks passed.\nDone.";
    const result = parseSimpleDiagnostics(output, "tsc");
    expect(result).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(parseSimpleDiagnostics("", "tsc")).toHaveLength(0);
  });

  it("normalizes severity values", () => {
    const output = `file.rs:1:1: hint: consider removing this
file.rs:2:1: information: this is informational
file.rs:3:1: note: note about something`;
    const result = parseSimpleDiagnostics(output, "rustc");
    expect(result[0].severity).toBe("hint");
    expect(result[1].severity).toBe("information");
    expect(result[2].severity).toBe("hint"); // "note" maps to "hint"
  });
});

/* ================================================================== */
/*  8. Diagnostics summary                                             */
/* ================================================================== */

describe("Diagnostics summary (buildDiagnosticsSummary)", () => {
  const diagnostics: FileDiagnostic[] = [
    { file: "a.ts", line: 1, column: 1, severity: "error", message: "error 1", source: "tsc" },
    { file: "a.ts", line: 2, column: 1, severity: "warning", message: "warning 1", source: "tsc" },
    { file: "b.ts", line: 1, column: 1, severity: "error", message: "error 2", source: "tsc" },
    { file: "c.ts", line: 5, column: 3, severity: "information", message: "info 1", source: "tsc" },
    { file: "d.ts", line: 1, column: 1, severity: "hint", message: "hint 1", source: "tsc" },
  ];

  it("counts by severity correctly", () => {
    const summary = buildDiagnosticsSummary("typescript-node", diagnostics, true);
    expect(summary.errorCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.informationCount).toBe(1);
    expect(summary.hintCount).toBe(1);
    expect(summary.totalCount).toBe(5);
  });

  it("counts affected files correctly", () => {
    const summary = buildDiagnosticsSummary("typescript-node", diagnostics, true);
    expect(summary.filesAffected).toBe(4);
  });

  it("caps sample messages at 5", () => {
    const many: FileDiagnostic[] = Array.from({ length: 10 }, (_, i) => ({
      file: `file${i}.ts`, line: 1, column: 1,
      severity: "error" as const, message: `error ${i}`, source: "tsc",
    }));
    const summary = buildDiagnosticsSummary("typescript-node", many, true);
    expect(summary.sampleMessages).toHaveLength(5);
  });

  it("sets collected flag", () => {
    const collected = buildDiagnosticsSummary("typescript-node", diagnostics, true);
    expect(collected.collected).toBe(true);
    const notCollected = buildDiagnosticsSummary("typescript-node", [], false);
    expect(notCollected.collected).toBe(false);
  });

  it("includes profileId and serviceKind", () => {
    const summary = buildDiagnosticsSummary("typescript-node", diagnostics, true);
    expect(summary.profileId).toBe("typescript-node");
    expect(summary.serviceKind).toBe("typescript");
  });

  it("empty diagnostics produce zero counts", () => {
    const summary = buildDiagnosticsSummary("python-backend", [], true);
    expect(summary.totalCount).toBe(0);
    expect(summary.filesAffected).toBe(0);
    expect(summary.sampleMessages).toHaveLength(0);
  });
});

/* ================================================================== */
/*  9. Diagnostics collection (explicit run)                           */
/* ================================================================== */

describe("Diagnostics collection (collectDiagnostics)", () => {
  const mockRunner: DiagnosticsShellRunner = {
    run: vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "src/index.ts(10,5): error TS2322: Type 'string' is not assignable.\n",
      stderr: "",
    }),
  };

  it("collects diagnostics for typescript profile with config", async () => {
    const result = await collectDiagnostics(
      "typescript-node",
      "/workspace",
      ["src/index.ts", "tsconfig.json"],
      mockRunner,
    );
    expect(result.availability.serviceKind).toBe("typescript");
    expect(result.collectionAttempted).toBe(true);
    expect(result.collectionError).toBeNull();
    expect(result.diagnosticsSummary).not.toBeNull();
    expect(result.diagnosticsSummary!.collected).toBe(true);
    expect(result.diagnosticsSummary!.totalCount).toBeGreaterThanOrEqual(1);
  });

  it("does not attempt collection for generic-unknown", async () => {
    const result = await collectDiagnostics(
      "generic-unknown",
      "/workspace",
      ["file.txt"],
      mockRunner,
    );
    expect(result.availability.status).toBe("unavailable");
    expect(result.collectionAttempted).toBe(false);
    expect(result.diagnosticsSummary!.collected).toBe(false);
  });

  it("handles runner errors gracefully", async () => {
    const failRunner: DiagnosticsShellRunner = {
      run: vi.fn().mockRejectedValue(new Error("Command not found")),
    };
    const result = await collectDiagnostics(
      "typescript-node",
      "/workspace",
      ["src/index.ts", "tsconfig.json"],
      failRunner,
    );
    expect(result.collectionAttempted).toBe(true);
    expect(result.collectionError).toContain("Command not found");
  });

  it("returns structured result for python profile", async () => {
    const pyRunner: DiagnosticsShellRunner = {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: "",
        stderr: "",
      }),
    };
    const result = await collectDiagnostics(
      "python-backend",
      "/workspace",
      ["main.py", "pyproject.toml"],
      pyRunner,
    );
    expect(result.availability.serviceKind).toBe("python");
    expect(result.collectionAttempted).toBe(true);
    expect(result.diagnosticsSummary!.totalCount).toBe(0);
  });
});

/* ================================================================== */
/*  10. Session events                                                 */
/* ================================================================== */

describe("Session event integration", () => {
  it("LANGUAGE_SERVICE_EVENT_KINDS has 3 entries", () => {
    expect(LANGUAGE_SERVICE_EVENT_KINDS).toHaveLength(3);
    expect(LANGUAGE_SERVICE_EVENT_KINDS).toContain("language_service_assessed");
    expect(LANGUAGE_SERVICE_EVENT_KINDS).toContain("diagnostics_collected");
    expect(LANGUAGE_SERVICE_EVENT_KINDS).toContain("diagnostics_collection_failed");
  });

  it("isLanguageServiceEvent identifies language-service events", () => {
    const event = { kind: "language_service_assessed" as any, timestamp: new Date().toISOString(), message: "test" };
    expect(isLanguageServiceEvent(event)).toBe(true);
    const other = { kind: "info" as any, timestamp: new Date().toISOString(), message: "other" };
    expect(isLanguageServiceEvent(other)).toBe(false);
  });

  it("languageServiceAssessed creates a properly typed event", () => {
    const availability = assessLanguageServiceAvailability(
      "typescript-node",
      ["tsconfig.json"],
    );
    const event = languageServiceAssessed(availability);
    expect(event.kind).toBe("language_service_assessed");
    expect(event.message).toContain("typescript");
    expect(event.detail).toBeDefined();
    expect(event.detail!.serviceKind).toBe("typescript");
  });

  it("diagnosticsCollected creates an event with counts", () => {
    const summary = buildDiagnosticsSummary("typescript-node", [
      { file: "a.ts", line: 1, column: 1, severity: "error", message: "err", source: "tsc" },
    ], true);
    const event = diagnosticsCollected(summary);
    expect(event.kind).toBe("diagnostics_collected");
    expect(event.message).toContain("1 issues");
    expect(event.detail!.errorCount).toBe(1);
  });

  it("diagnosticsCollectionFailed creates an event with error", () => {
    const event = diagnosticsCollectionFailed("Process crashed", "typescript-node");
    expect(event.kind).toBe("diagnostics_collection_failed");
    expect(event.message).toContain("Process crashed");
    expect(event.detail!.profileId).toBe("typescript-node");
  });

  it("resultSummaryEvents creates events from a full result", () => {
    const availability = assessLanguageServiceAvailability("typescript-node", ["tsconfig.json"]);
    const summary = buildDiagnosticsSummary("typescript-node", [], true);
    const result: LanguageServiceResultSummary = {
      availability,
      diagnosticsSummary: summary,
      collectionAttempted: true,
      collectionError: null,
    };
    const events = resultSummaryEvents(result);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].kind).toBe("language_service_assessed");
    expect(events[1].kind).toBe("diagnostics_collected");
  });

  it("resultSummaryEvents handles failed collection", () => {
    const availability = assessLanguageServiceAvailability("typescript-node", ["tsconfig.json"]);
    const result: LanguageServiceResultSummary = {
      availability,
      diagnosticsSummary: null,
      collectionAttempted: true,
      collectionError: "timeout",
    };
    const events = resultSummaryEvents(result);
    expect(events).toHaveLength(2);
    expect(events[1].kind).toBe("diagnostics_collection_failed");
  });

  it("filterLanguageServiceEvents filters correctly", () => {
    const events = [
      { kind: "info" as any, timestamp: "", message: "" },
      { kind: "language_service_assessed" as any, timestamp: "", message: "" },
      { kind: "diagnostics_collected" as any, timestamp: "", message: "" },
      { kind: "note" as any, timestamp: "", message: "" },
    ];
    const filtered = filterLanguageServiceEvents(events);
    expect(filtered).toHaveLength(2);
  });
});

/* ================================================================== */
/*  11. Session summary extension                                      */
/* ================================================================== */

describe("Session summary extension (buildLanguageServiceSessionSummary)", () => {
  it("builds summary for available service", () => {
    const availability = assessLanguageServiceAvailability(
      "typescript-node",
      ["tsconfig.json"],
      ["tsc"],
    );
    const summary = buildLanguageServiceSessionSummary(availability);
    expect(summary.serviceKind).toBe("typescript");
    expect(summary.diagnosticsAvailable).toBe(true);
    expect(summary.unavailableReason).toBeNull();
    expect(summary.serviceLabel).toContain("Typescript");
  });

  it("builds summary for unavailable service", () => {
    const availability = assessLanguageServiceAvailability(
      "generic-unknown",
      [],
    );
    const summary = buildLanguageServiceSessionSummary(availability);
    expect(summary.serviceKind).toBe("none");
    expect(summary.diagnosticsAvailable).toBe(false);
    expect(summary.unavailableReason).toBe("generic_profile");
  });

  it("includes diagnostics counts when collected", () => {
    const availability = assessLanguageServiceAvailability(
      "typescript-node",
      ["tsconfig.json"],
      ["tsc"],
    );
    const diagSummary = buildDiagnosticsSummary("typescript-node", [
      { file: "a.ts", line: 1, column: 1, severity: "error", message: "err", source: "tsc" },
      { file: "b.ts", line: 2, column: 1, severity: "warning", message: "warn", source: "tsc" },
    ], true);
    const summary = buildLanguageServiceSessionSummary(availability, diagSummary);
    expect(summary.lastDiagnosticsErrorCount).toBe(1);
    expect(summary.lastDiagnosticsWarningCount).toBe(1);
    expect(summary.lastDiagnosticsTotalCount).toBe(2);
    expect(summary.lastDiagnosticsFilesAffected).toBe(2);
  });

  it("returns null diagnostics counts when not collected", () => {
    const availability = assessLanguageServiceAvailability(
      "typescript-node",
      ["tsconfig.json"],
    );
    const summary = buildLanguageServiceSessionSummary(availability);
    expect(summary.lastDiagnosticsErrorCount).toBeNull();
    expect(summary.lastDiagnosticsTotalCount).toBeNull();
  });
});

/* ================================================================== */
/*  12. SessionSummary integration via SessionManager                  */
/* ================================================================== */

describe("SessionManager language-service summary integration", () => {
  it("getSessionSummary includes language-service fields (null when not provided)", () => {
    const mgr = new SessionManager();
    const session = mgr.createSession();
    const summary = mgr.getSessionSummary(session.id);
    expect(summary.languageServiceKind).toBeNull();
    expect(summary.languageServiceStatus).toBeNull();
    expect(summary.languageServiceLabel).toBeNull();
    expect(summary.diagnosticsAvailable).toBeNull();
    expect(summary.diagnosticsUnavailableReason).toBeNull();
    expect(summary.lastDiagnosticsErrorCount).toBeNull();
    expect(summary.lastDiagnosticsWarningCount).toBeNull();
    expect(summary.lastDiagnosticsTotalCount).toBeNull();
    expect(summary.lastDiagnosticsFilesAffected).toBeNull();
  });

  it("getSessionSummary includes language-service fields when provided", () => {
    const mgr = new SessionManager();
    const session = mgr.createSession();
    const lsSummary = {
      serviceKind: "typescript",
      serviceStatus: "available",
      serviceLabel: "TypeScript Language Service",
      diagnosticsAvailable: true,
      unavailableReason: null,
      lastDiagnosticsErrorCount: 3,
      lastDiagnosticsWarningCount: 5,
      lastDiagnosticsTotalCount: 8,
      lastDiagnosticsFilesAffected: 2,
    };
    const summary = mgr.getSessionSummary(session.id, undefined, undefined, undefined, lsSummary);
    expect(summary.languageServiceKind).toBe("typescript");
    expect(summary.languageServiceStatus).toBe("available");
    expect(summary.languageServiceLabel).toBe("TypeScript Language Service");
    expect(summary.diagnosticsAvailable).toBe(true);
    expect(summary.diagnosticsUnavailableReason).toBeNull();
    expect(summary.lastDiagnosticsErrorCount).toBe(3);
    expect(summary.lastDiagnosticsWarningCount).toBe(5);
    expect(summary.lastDiagnosticsTotalCount).toBe(8);
    expect(summary.lastDiagnosticsFilesAffected).toBe(2);
  });
});

/* ================================================================== */
/*  13. Command definitions                                            */
/* ================================================================== */

describe("Language-service command definitions", () => {
  it("inspect_language_service is defined", () => {
    const def = getCommandDefinition("inspect_language_service");
    expect(def).toBeDefined();
    expect(def!.category).toBe("language_service");
    expect(def!.label).toContain("Language Service");
  });

  it("collect_diagnostics is defined", () => {
    const def = getCommandDefinition("collect_diagnostics");
    expect(def).toBeDefined();
    expect(def!.category).toBe("language_service");
    expect(def!.label).toContain("Diagnostics");
  });

  it("refresh_diagnostics_summary is defined", () => {
    const def = getCommandDefinition("refresh_diagnostics_summary");
    expect(def).toBeDefined();
    expect(def!.category).toBe("language_service");
  });

  it("language_service category exists in ALL_COMMAND_CATEGORIES", () => {
    expect(ALL_COMMAND_CATEGORIES).toContain("language_service");
  });

  it("ALL_COMMAND_IDS includes all 3 language-service commands", () => {
    expect(ALL_COMMAND_IDS).toContain("inspect_language_service");
    expect(ALL_COMMAND_IDS).toContain("collect_diagnostics");
    expect(ALL_COMMAND_IDS).toContain("refresh_diagnostics_summary");
  });

  it("groupByCategory includes language_service group", () => {
    const map = groupByCategory();
    expect(map.has("language_service")).toBe(true);
    expect(map.get("language_service")!).toHaveLength(3);
  });
});

/* ================================================================== */
/*  14. Command validation                                             */
/* ================================================================== */

describe("Language-service command validation", () => {
  it("inspect_language_service validates with no input", () => {
    const payload: CommandPayload = {
      commandId: "inspect_language_service",
      data: {},
    };
    const result = validateCommand(payload);
    expect(result.valid).toBe(true);
  });

  it("collect_diagnostics validates with no input", () => {
    const payload: CommandPayload = {
      commandId: "collect_diagnostics",
      data: {},
    };
    const result = validateCommand(payload);
    expect(result.valid).toBe(true);
  });

  it("refresh_diagnostics_summary validates with no input", () => {
    const payload: CommandPayload = {
      commandId: "refresh_diagnostics_summary",
      data: {},
    };
    const result = validateCommand(payload);
    expect(result.valid).toBe(true);
  });
});

/* ================================================================== */
/*  15. Command availability                                           */
/* ================================================================== */

describe("Language-service command availability", () => {
  const activeCtxWithWorkspace: CommandContextState = {
    hasActiveSession: true,
    sessionSummary: {
      id: "test",
      createdAt: "",
      updatedAt: "",
      stage: "initializing",
      status: "active",
      workspacePath: "/workspace",
      workspaceSource: "local_existing",
      workspaceStatus: "ready",
      workspaceReadiness: "ready",
      workspaceIsGitRepo: true,
      workspaceRemoteUrl: null,
      workspaceBranch: null,
      eventCount: 0,
      lastEventKind: null,
      lastEventMessage: null,
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
      languageServiceKind: null,
      languageServiceStatus: null,
      languageServiceLabel: null,
      diagnosticsAvailable: null,
      diagnosticsUnavailableReason: null,
      lastDiagnosticsErrorCount: null,
      lastDiagnosticsWarningCount: null,
      lastDiagnosticsTotalCount: null,
      lastDiagnosticsFilesAffected: null,
    },
  };

  it("inspect_language_service available with workspace", () => {
    const avail = getCommandAvailability("inspect_language_service", activeCtxWithWorkspace);
    expect(avail.available).toBe(true);
  });

  it("collect_diagnostics available with workspace", () => {
    const avail = getCommandAvailability("collect_diagnostics", activeCtxWithWorkspace);
    expect(avail.available).toBe(true);
  });

  it("refresh_diagnostics_summary available with workspace", () => {
    const avail = getCommandAvailability("refresh_diagnostics_summary", activeCtxWithWorkspace);
    expect(avail.available).toBe(true);
  });

  it("all 3 unavailable without session", () => {
    const noSession: CommandContextState = {
      hasActiveSession: false,
      sessionSummary: null,
    };
    for (const id of [
      "inspect_language_service",
      "collect_diagnostics",
      "refresh_diagnostics_summary",
    ] as const) {
      const avail = getCommandAvailability(id, noSession);
      expect(avail.available).toBe(false);
    }
  });

  it("all 3 unavailable without workspace", () => {
    const noWorkspace: CommandContextState = {
      hasActiveSession: true,
      sessionSummary: {
        ...activeCtxWithWorkspace.sessionSummary!,
        workspacePath: null,
      },
    };
    for (const id of [
      "inspect_language_service",
      "collect_diagnostics",
      "refresh_diagnostics_summary",
    ] as const) {
      const avail = getCommandAvailability(id, noWorkspace);
      expect(avail.available).toBe(false);
    }
  });
});

/* ================================================================== */
/*  16. Command execution                                              */
/* ================================================================== */

describe("Language-service command execution", () => {
  const createDeps = (overrides?: Partial<CommandExecutorDeps>): CommandExecutorDeps => ({
    sessionManager: new SessionManager(),
    ...overrides,
  });

  it("inspect_language_service fails when dep not provided", async () => {
    const deps = createDeps();
    const session = deps.sessionManager.createSession();
    const result = await executeCommand(
      session.id,
      { commandId: "inspect_language_service", data: {} },
      deps,
    );
    expect(result.status).toBe("failed");
    expect(result.message).toContain("not available");
  });

  it("inspect_language_service completes when dep provided", async () => {
    const deps = createDeps({
      inspectLanguageService: async () => ({
        ok: true,
        detail: { serviceKind: "typescript", status: "available" },
      }),
    });
    const session = deps.sessionManager.createSession();
    const result = await executeCommand(
      session.id,
      { commandId: "inspect_language_service", data: {} },
      deps,
    );
    expect(result.status).toBe("completed");
    expect(result.detail?.serviceKind).toBe("typescript");
  });

  it("collect_diagnostics completes when dep provided", async () => {
    const deps = createDeps({
      collectDiagnostics: async () => ({
        ok: true,
        detail: { totalCount: 5, errorCount: 2 },
      }),
    });
    const session = deps.sessionManager.createSession();
    const result = await executeCommand(
      session.id,
      { commandId: "collect_diagnostics", data: {} },
      deps,
    );
    expect(result.status).toBe("completed");
  });

  it("refresh_diagnostics_summary fails when dep not provided", async () => {
    const deps = createDeps();
    const session = deps.sessionManager.createSession();
    const result = await executeCommand(
      session.id,
      { commandId: "refresh_diagnostics_summary", data: {} },
      deps,
    );
    expect(result.status).toBe("failed");
  });

  it("refresh_diagnostics_summary completes when dep provided", async () => {
    const deps = createDeps({
      refreshDiagnosticsSummary: async () => ({ ok: true }),
    });
    const session = deps.sessionManager.createSession();
    const result = await executeCommand(
      session.id,
      { commandId: "refresh_diagnostics_summary", data: {} },
      deps,
    );
    expect(result.status).toBe("completed");
  });
});

/* ================================================================== */
/*  17. End-to-end scenario                                            */
/* ================================================================== */

describe("End-to-end scenario: assess → collect → summarize", () => {
  it("full flow for a TypeScript workspace", async () => {
    const files = ["src/index.ts", "tsconfig.json", "package.json"];

    // 1. Assess
    const availability = assessLanguageServiceAvailability(
      "typescript-node",
      files,
      ["tsc", "eslint"],
    );
    expect(availability.status).toBe("available");

    // 2. Collect
    const runner: DiagnosticsShellRunner = {
      run: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "src/index.ts(5,10): error TS2345: Argument of type 'string' is not assignable.\n" +
                "src/utils.ts(12,1): warning TS6133: 'unused' is declared but its value is never read.\n",
        stderr: "",
      }),
    };
    const result = await collectDiagnostics(
      "typescript-node",
      "/workspace",
      files,
      runner,
      ["tsc", "eslint"],
    );
    expect(result.collectionAttempted).toBe(true);
    expect(result.diagnosticsSummary!.errorCount).toBe(1);
    expect(result.diagnosticsSummary!.warningCount).toBe(1);
    expect(result.diagnosticsSummary!.totalCount).toBe(2);

    // 3. Build session events
    const events = resultSummaryEvents(result);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].kind).toBe("language_service_assessed");
    expect(events[1].kind).toBe("diagnostics_collected");

    // 4. Build session summary extension
    const lsSummary = buildLanguageServiceSessionSummary(
      result.availability,
      result.diagnosticsSummary,
    );
    expect(lsSummary.serviceKind).toBe("typescript");
    expect(lsSummary.diagnosticsAvailable).toBe(true);
    expect(lsSummary.lastDiagnosticsErrorCount).toBe(1);
    expect(lsSummary.lastDiagnosticsTotalCount).toBe(2);
  });

  it("full flow for an unknown workspace", async () => {
    const availability = assessLanguageServiceAvailability(
      "generic-unknown",
      ["readme.md"],
    );
    expect(availability.status).toBe("unavailable");
    expect(availability.serviceKind).toBe("none");

    const runner: DiagnosticsShellRunner = {
      run: vi.fn(),
    };
    const result = await collectDiagnostics(
      "generic-unknown",
      "/workspace",
      ["readme.md"],
      runner,
    );
    expect(result.collectionAttempted).toBe(false);
    expect(result.diagnosticsSummary!.totalCount).toBe(0);

    const lsSummary = buildLanguageServiceSessionSummary(result.availability);
    expect(lsSummary.diagnosticsAvailable).toBe(false);
    expect(lsSummary.unavailableReason).toBe("generic_profile");
  });
});
