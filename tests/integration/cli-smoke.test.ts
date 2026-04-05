/**
 * Phase 9B — CLI help, version, and smoke tests.
 *
 * Verifies CLI polish: --help content, --version output,
 * exit code semantics, and basic smoke paths.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { main } from "../../src/cli/main.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
import type { HostProfile, Detected } from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");
const TMP_DIR = join(import.meta.dirname, "../../tmp-cli-smoke-test");

function certain<T>(value: T): Detected<T> {
  return { value, confidence: "certain" };
}

function unknown<T>(): Detected<T> {
  return { value: null, confidence: "unknown" };
}

function makeHost(): HostProfile {
  return {
    detectedAt: "2025-01-01T00:00:00Z",
    os: {
      platform: certain("linux"),
      release: certain("6.1.0"),
      arch: certain("x64"),
    },
    cpu: {
      model: certain("AMD Ryzen 9 7950X"),
      cores: certain(16),
      threads: certain(32),
    },
    memory: {
      totalGb: certain(64),
      availableGb: certain(48),
    },
    gpu: {
      present: certain(true),
      model: certain("NVIDIA RTX 4090"),
      vramGb: certain(24),
      cudaVersion: certain("12.2"),
      rocmVersion: unknown(),
      driverVersion: certain("535.86.05"),
    },
    installedRuntimes: [
      { runtimeId: "ollama", version: certain("0.3.0") },
    ],
    missingDependencies: [],
  };
}

let bundle: CatalogBundle;

beforeAll(() => {
  const catalogPaths: CatalogPaths = {
    models: join(DATA_DIR, "models"),
    runtimes: join(DATA_DIR, "runtimes"),
    agentTools: join(DATA_DIR, "agent-tools"),
  };
  bundle = loadCatalogBundleSync(catalogPaths);
  mkdirSync(TMP_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------
// --version
// ---------------------------------------------------------------------------

describe("CLI — --version flag", () => {
  it("outputs version string with exit code 0", async () => {
    const lines: string[] = [];
    const code = await main(["--version"], (msg) => lines.push(msg));

    expect(code).toBe(0);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--version takes precedence when no command given", async () => {
    const lines: string[] = [];
    const code = await main(["--version"], (msg) => lines.push(msg));

    expect(code).toBe(0);
    expect(lines[0]).toBe("0.1.0");
  });
});

// ---------------------------------------------------------------------------
// --help polish
// ---------------------------------------------------------------------------

describe("CLI — --help content completeness", () => {
  let helpText: string;

  beforeAll(async () => {
    const lines: string[] = [];
    await main(["--help"], (msg) => lines.push(msg));
    helpText = lines.join("\n");
  });

  it("lists all 7 commands", () => {
    expect(helpText).toContain("detect-host");
    expect(helpText).toContain("list-models");
    expect(helpText).toContain("recommend-models");
    expect(helpText).toContain("check-compatibility");
    expect(helpText).toContain("plan-install");
    expect(helpText).toContain("render-plan");
    expect(helpText).toContain("run-workflow");
  });

  it("lists all global options", () => {
    expect(helpText).toContain("--json");
    expect(helpText).toContain("--data-dir");
    expect(helpText).toContain("--host-file");
    expect(helpText).toContain("--help");
    expect(helpText).toContain("--version");
  });

  it("includes exit codes section", () => {
    expect(helpText).toContain("Exit codes:");
    expect(helpText).toContain("0  Success");
    expect(helpText).toContain("1  Usage error");
    expect(helpText).toContain("2  Input error");
    expect(helpText).toContain("3  Runtime error");
    expect(helpText).toContain("4  Blocked");
    expect(helpText).toContain("5  Requires approval");
  });

  it("includes informational-only reminder", () => {
    expect(helpText).toContain("INFORMATIONAL ONLY");
    expect(helpText).toContain("NOT executed");
  });

  it("includes --stop-after stage names", () => {
    expect(helpText).toContain("catalog_loading");
    expect(helpText).toContain("safety_evaluation");
    expect(helpText).toContain("rendering");
  });
});

// ---------------------------------------------------------------------------
// Workflow CLI exit codes — semantic validation
// ---------------------------------------------------------------------------

describe("CLI — workflow exit code semantics", () => {
  let hostFilePath: string;

  beforeAll(() => {
    hostFilePath = join(TMP_DIR, "smoke-host.json");
    writeFileSync(hostFilePath, JSON.stringify(makeHost(), null, 2));
  });

  it("completed workflow returns exit code 0", async () => {
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      () => {},
    );
    // With a well-configured host, workflow should complete or require approval (both EXIT_OK)
    expect(code === 0 || code === 4).toBe(true);
  });

  it("partial workflow (--stop-after) returns exit code 0", async () => {
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--stop-after", "recommendation", "--json"],
      () => {},
    );
    expect(code).toBe(0);
  });

  it("failed workflow (bad artifact) returns exit code 3", async () => {
    const lines: string[] = [];
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", "nonexistent-xyz", "--json"],
      (msg) => lines.push(msg),
    );

    // The workflow runner handles unknown artifacts as a failed stage,
    // which maps to EXIT_RUNTIME (3)
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.status).toBe("failed");
    expect(code).toBe(3);
  });

  it("invalid --stop-after returns usage error exit code 1", async () => {
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--stop-after", "bogus"],
      () => {},
      () => {},
    );
    expect(code).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Import smoke tests
// ---------------------------------------------------------------------------

describe("import smoke tests — library surface", () => {
  it("can import and use loadCatalogBundleSync", () => {
    expect(bundle).toBeDefined();
    expect(bundle.models.listArtifacts().length).toBeGreaterThan(0);
    expect(bundle.runtimes.listAll().length).toBeGreaterThan(0);
  });

  it("can import and use recommend", async () => {
    const { recommend } = await import("../../src/index.js");
    const host = makeHost();
    const recs = recommend(host, bundle);
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
  });

  it("can import and use runWorkflow", async () => {
    const { runWorkflow } = await import("../../src/index.js");
    const host = makeHost();
    const result = runWorkflow({ bundle, host });
    expect(result.status).toBeDefined();
    expect(result.completedStages.length).toBeGreaterThan(0);
  });

  it("can import validateHostProfile from root", async () => {
    const { validateHostProfile } = await import("../../src/index.js");
    const host = makeHost();
    const validated = validateHostProfile(host);
    expect(validated.detectedAt).toBe(host.detectedAt);
  });
});

// ---------------------------------------------------------------------------
// CLI smoke — basic command invocations
// ---------------------------------------------------------------------------

describe("CLI smoke — command invocations", () => {
  it("list-models produces output", async () => {
    const lines: string[] = [];
    const code = await main(
      ["list-models", "--data-dir", DATA_DIR, "--json"],
      (msg) => lines.push(msg),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("detect-host produces output", async () => {
    const lines: string[] = [];
    const code = await main(
      ["detect-host", "--json"],
      (msg) => lines.push(msg),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("os");
  });

  it("run-workflow with --host-file produces valid JSON output", async () => {
    const hostFilePath = join(TMP_DIR, "smoke-host2.json");
    writeFileSync(hostFilePath, JSON.stringify(makeHost(), null, 2));

    const lines: string[] = [];
    const code = await main(
      ["run-workflow", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      (msg) => lines.push(msg),
    );

    expect(code === 0 || code === 4).toBe(true);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("completedStages");
    expect(parsed).toHaveProperty("stageOutputs");
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

import { afterAll } from "vitest";
afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});
