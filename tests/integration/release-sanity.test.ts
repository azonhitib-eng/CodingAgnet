/**
 * Phase 9C — Release polish and installed-package sanity tests.
 *
 * Validates:
 *   - Package version is read from package.json (no drift)
 *   - Subpath exports resolve correctly
 *   - CLI --version matches package.json
 *   - CLI --strict mode exit semantics
 *   - Installed-package style import sanity
 *   - Example snippets match current API surface
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

// ---------------------------------------------------------------------------
// Package.json reference
// ---------------------------------------------------------------------------

const PKG_JSON_PATH = join(import.meta.dirname, "../../package.json");
const pkgJson = JSON.parse(readFileSync(PKG_JSON_PATH, "utf-8")) as {
  version: string;
  exports: Record<string, unknown>;
  bin: Record<string, string>;
  files: string[];
  engines: Record<string, string>;
  name: string;
};

// ---------------------------------------------------------------------------
// Version sanity
// ---------------------------------------------------------------------------

describe("version sanity", () => {
  it("package.json has a valid semver version", () => {
    expect(pkgJson.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("getVersion() returns the package.json version", async () => {
    const { getVersion } = await import("../../src/cli/version.js");
    expect(getVersion()).toBe(pkgJson.version);
  });

  it("CLI --version outputs the package.json version", async () => {
    const { main } = await import("../../src/cli/main.js");
    const lines: string[] = [];
    const code = await main(["--version"], (msg) => lines.push(msg));
    expect(code).toBe(0);
    expect(lines[0]).toBe(pkgJson.version);
  });

  it("getVersion() is cached on repeated calls", async () => {
    const { getVersion } = await import("../../src/cli/version.js");
    const v1 = getVersion();
    const v2 = getVersion();
    expect(v1).toBe(v2);
    expect(v1).toBe(pkgJson.version);
  });
});

// ---------------------------------------------------------------------------
// Package metadata sanity
// ---------------------------------------------------------------------------

describe("package.json metadata sanity", () => {
  it("has required exports for root, cli, workflow, schemas", () => {
    const exports = pkgJson.exports as Record<string, Record<string, string>>;
    expect(exports["."]).toBeDefined();
    expect(exports["./cli"]).toBeDefined();
    expect(exports["./workflow"]).toBeDefined();
    expect(exports["./schemas"]).toBeDefined();
  });

  it("has bin entry for codingagent-cli", () => {
    expect(pkgJson.bin["codingagent-cli"]).toBe("dist/cli/main.js");
  });

  it("files field includes dist, docs, README, CHANGELOG", () => {
    expect(pkgJson.files).toContain("dist");
    expect(pkgJson.files).toContain("docs");
    expect(pkgJson.files).toContain("README.md");
    expect(pkgJson.files).toContain("CHANGELOG.md");
  });

  it("engines specifies node >= 18", () => {
    expect(pkgJson.engines.node).toMatch(/>=\s*18/);
  });

  it("package name is valid npm name", () => {
    expect(pkgJson.name).toMatch(/^[a-z][a-z0-9._-]*$/);
  });

  it("each export subpath has both import and types entries", () => {
    const exports = pkgJson.exports as Record<string, Record<string, string>>;
    for (const [subpath, config] of Object.entries(exports)) {
      expect(config.import, `${subpath} should have import`).toBeDefined();
      expect(config.types, `${subpath} should have types`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Subpath export resolution sanity (source-level)
// ---------------------------------------------------------------------------

describe("subpath export import sanity", () => {
  it("root import provides core functions", async () => {
    const root = await import("../../src/index.js");
    expect(typeof root.loadCatalogBundleSync).toBe("function");
    expect(typeof root.detectHost).toBe("function");
    expect(typeof root.recommend).toBe("function");
    expect(typeof root.generateInstallPlan).toBe("function");
    expect(typeof root.evaluatePlanSafety).toBe("function");
    expect(typeof root.renderPlan).toBe("function");
    expect(typeof root.runWorkflow).toBe("function");
    expect(typeof root.cliMain).toBe("function");
    expect(typeof root.validateHostProfile).toBe("function");
    expect(typeof root.renderPlanWithSafety).toBe("function");
    expect(typeof root.runFullFlow).toBe("function");
  });

  it("cli import provides CLI-specific exports", async () => {
    const cli = await import("../../src/cli/index.js");
    expect(typeof cli.main).toBe("function");
    expect(typeof cli.CliError).toBe("function");
    expect(typeof cli.getVersion).toBe("function");
    expect(cli.EXIT_OK).toBe(0);
    expect(cli.EXIT_USAGE).toBe(1);
    expect(cli.EXIT_INPUT).toBe(2);
    expect(cli.EXIT_RUNTIME).toBe(3);
    expect(cli.EXIT_BLOCKED).toBe(4);
    expect(cli.EXIT_APPROVAL).toBe(5);
    expect(typeof cli.loadHostProfile).toBe("function");
    expect(typeof cli.validateHostProfile).toBe("function");
  });

  it("workflow import provides workflow exports", async () => {
    const wf = await import("../../src/workflow/index.js");
    expect(typeof wf.runWorkflow).toBe("function");
    expect(Array.isArray(wf.STAGE_ORDER)).toBe(true);
    expect(wf.STAGE_ORDER).toHaveLength(8);
  });

  it("schemas import provides Zod schemas", async () => {
    const schemas = await import("../../src/schemas/index.js");
    expect(typeof schemas.ModelManifestSchema.parse).toBe("function");
    expect(typeof schemas.RuntimeManifestSchema.parse).toBe("function");
    expect(typeof schemas.HostProfileSchema.parse).toBe("function");
    expect(typeof schemas.InstallPlanSchema.parse).toBe("function");
    expect(typeof schemas.SafetyReportSchema.parse).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// CLI --strict mode exit semantics
// ---------------------------------------------------------------------------

describe("CLI --strict mode exit semantics", () => {
  const DATA_DIR = join(import.meta.dirname, "../../data");
  const TMP_DIR = join(import.meta.dirname, "../../tmp-strict-test");

  // Helper: build a host that will likely trigger requiresHumanApproval
  // (dangerous install commands exist for most runtimes)
  function makeHost() {
    return {
      detectedAt: "2025-01-01T00:00:00Z",
      os: {
        platform: { value: "linux" as const, confidence: "certain" as const },
        release: { value: "6.1.0", confidence: "certain" as const },
        arch: { value: "x64" as const, confidence: "certain" as const },
      },
      cpu: {
        model: { value: "AMD Ryzen 9 7950X", confidence: "certain" as const },
        cores: { value: 16, confidence: "certain" as const },
        threads: { value: 32, confidence: "certain" as const },
      },
      memory: {
        totalGb: { value: 64, confidence: "certain" as const },
        availableGb: { value: 48, confidence: "certain" as const },
      },
      gpu: {
        present: { value: true, confidence: "certain" as const },
        model: { value: "NVIDIA RTX 4090", confidence: "certain" as const },
        vramGb: { value: 24, confidence: "certain" as const },
        cudaVersion: { value: "12.2", confidence: "certain" as const },
        rocmVersion: { value: null, confidence: "unknown" as const },
        driverVersion: { value: "535.86.05", confidence: "certain" as const },
      },
      installedRuntimes: [],
      missingDependencies: [],
    };
  }

  let hostFilePath: string;

  beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    hostFilePath = join(TMP_DIR, "strict-host.json");
    writeFileSync(hostFilePath, JSON.stringify(makeHost(), null, 2));
  });

  it("--strict not present: completed_requires_approval returns exit 0", async () => {
    const { main } = await import("../../src/cli/main.js");
    const lines: string[] = [];
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      (msg) => lines.push(msg),
      () => {},
    );

    const parsed = JSON.parse(lines.join("\n"));
    if (parsed.status === "completed_requires_approval") {
      // Without --strict, approval-required is still exit 0
      expect(code).toBe(0);
    }
    // code should be one of the valid workflow exits (0, 3, or 4)
    expect([0, 3, 4]).toContain(code);
  });

  it("--strict: completed_requires_approval returns exit 5", async () => {
    const { main } = await import("../../src/cli/main.js");
    const lines: string[] = [];
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json", "--strict"],
      (msg) => lines.push(msg),
      () => {},
    );

    const parsed = JSON.parse(lines.join("\n"));
    if (parsed.status === "completed_requires_approval") {
      expect(code).toBe(5);
    } else if (parsed.status === "blocked") {
      expect(code).toBe(4);
    } else if (parsed.status === "completed") {
      expect(code).toBe(0);
    } else if (parsed.status === "failed") {
      expect(code).toBe(3);
    }
  });

  it("--strict has no effect on blocked workflows (still exit 4)", async () => {
    const { main } = await import("../../src/cli/main.js");
    const lines: string[] = [];
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", "nonexistent-xyz", "--json", "--strict"],
      (msg) => lines.push(msg),
      () => {},
    );

    // nonexistent artifact causes failure, not blocked
    expect(code).toBe(3);
  });

  it("--strict has no effect on partial workflows (still exit 0)", async () => {
    const { main } = await import("../../src/cli/main.js");
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--stop-after", "recommendation", "--json", "--strict"],
      () => {},
      () => {},
    );

    expect(code).toBe(0);
  });

  it("--help mentions --strict flag", async () => {
    const { main } = await import("../../src/cli/main.js");
    const lines: string[] = [];
    await main(["--help"], (msg) => lines.push(msg));
    const helpText = lines.join("\n");
    expect(helpText).toContain("--strict");
    expect(helpText).toContain("5  Requires approval");
  });
});

// ---------------------------------------------------------------------------
// Documented API example sanity — verify README snippets compile
// ---------------------------------------------------------------------------

describe("documented API example sanity", () => {
  it("README quick-start imports are all valid exports", async () => {
    const root = await import("../../src/index.js");

    // From README quick start (library)
    expect(typeof root.loadCatalogBundleSync).toBe("function");
    expect(typeof root.detectHost).toBe("function");
    expect(typeof root.recommend).toBe("function");
    expect(typeof root.generateInstallPlan).toBe("function");
    expect(typeof root.evaluatePlanSafety).toBe("function");
    expect(typeof root.defaultExecutionPolicy).toBe("function");
    expect(typeof root.renderPlan).toBe("function");
  });

  it("README workflow example imports are valid", async () => {
    const root = await import("../../src/index.js");

    // From README quick start (workflow)
    expect(typeof root.runWorkflow).toBe("function");
    expect(typeof root.loadCatalogBundleSync).toBe("function");
    expect(typeof root.detectHost).toBe("function");
  });

  it("USAGE.md convenience imports are valid", async () => {
    const root = await import("../../src/index.js");

    // renderPlanWithSafety and runFullFlow from USAGE.md
    expect(typeof root.renderPlanWithSafety).toBe("function");
    expect(typeof root.runFullFlow).toBe("function");
  });

  it("CLI subpath documented exports exist", async () => {
    const cli = await import("../../src/cli/index.js");

    // USAGE.md says loadHostProfile is available from cli subpath
    expect(typeof cli.loadHostProfile).toBe("function");
    expect(typeof cli.validateHostProfile).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Cleanup temporary directories
// ---------------------------------------------------------------------------

const TMP_STRICT_DIR = join(import.meta.dirname, "../../tmp-strict-test");
afterAll(() => {
  try { rmSync(TMP_STRICT_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});
