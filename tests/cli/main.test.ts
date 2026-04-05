/**
 * CLI tests — main entrypoint and error handling.
 *
 * Tests the CLI router, --help, unknown commands, missing flags,
 * and the render-plan command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { main } from "../../src/cli/main.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
import { generateInstallPlan } from "../../src/install-plan/install-planner.js";
import { checkCompatibility } from "../../src/compatibility/compatibility-engine.js";
import type { HostProfile, Detected } from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");
const TMP_DIR = join(import.meta.dirname, "../../tmp-cli-test");

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

  // Create temp dir for test artifacts
  mkdirSync(TMP_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------
// Help and usage
// ---------------------------------------------------------------------------

describe("CLI main — help and routing", () => {
  it("shows help with --help", async () => {
    const lines: string[] = [];
    const code = await main(["--help"], (msg) => lines.push(msg));

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("detect-host");
    expect(output).toContain("list-models");
    expect(output).toContain("recommend-models");
    expect(output).toContain("check-compatibility");
    expect(output).toContain("plan-install");
    expect(output).toContain("render-plan");
  });

  it("shows help with no arguments", async () => {
    const lines: string[] = [];
    const code = await main([], (msg) => lines.push(msg));

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("Usage:");
  });

  it("returns non-zero for unknown command", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["unknown-command"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Unknown command");
  });
});

// ---------------------------------------------------------------------------
// Missing arguments
// ---------------------------------------------------------------------------

describe("CLI main — missing arguments", () => {
  it("check-compatibility without --artifact returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["check-compatibility", "--data-dir", DATA_DIR],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("--artifact");
  });

  it("plan-install without --artifact returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["plan-install", "--data-dir", DATA_DIR],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("--artifact");
  });

  it("render-plan without --plan-file returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["render-plan"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("--plan-file");
  });
});

// ---------------------------------------------------------------------------
// Invalid inputs
// ---------------------------------------------------------------------------

describe("CLI main — invalid inputs", () => {
  it("check-compatibility with invalid artifact returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["check-compatibility", "--data-dir", DATA_DIR, "--artifact", "no-such-id"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("no-such-id");
  });

  it("plan-install with invalid artifact returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["plan-install", "--data-dir", DATA_DIR, "--artifact", "no-such-id"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("no-such-id");
  });

  it("render-plan with missing file returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["render-plan", "--plan-file", "/nonexistent/path.json"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Cannot read");
  });

  it("render-plan with invalid JSON returns error", async () => {
    const badFile = join(TMP_DIR, "bad.json");
    writeFileSync(badFile, "not valid json {{{");

    const errLines: string[] = [];
    const code = await main(
      ["render-plan", "--plan-file", badFile],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Invalid JSON");
  });

  it("render-plan with incomplete plan returns error", async () => {
    const incompleteFile = join(TMP_DIR, "incomplete.json");
    writeFileSync(incompleteFile, JSON.stringify({ foo: "bar" }));

    const errLines: string[] = [];
    const code = await main(
      ["render-plan", "--plan-file", incompleteFile],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("missing required fields");
  });

  it("list-models with invalid status returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["list-models", "--data-dir", DATA_DIR, "--status", "invalid"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Invalid status");
  });
});

// ---------------------------------------------------------------------------
// render-plan with valid file
// ---------------------------------------------------------------------------

describe("CLI main — render-plan command", () => {
  it("renders a valid plan file in pretty format", async () => {
    // Generate a real plan to save
    const host = makeHost();
    const artifacts = bundle.models.listArtifacts();
    const artifact = artifacts[0];
    const variant = bundle.models.getVariant(artifact.variantId)!;
    const family = bundle.models.getFamily(variant.familyId)!;
    const runtime = bundle.runtimes.get(artifact.runtimeId)!;

    const compatibility = checkCompatibility(host, artifact, {
      variant,
      family,
      runtime,
      runtimeInstalled: true,
    });

    const plan = generateInstallPlan({
      host,
      artifact,
      variant,
      runtime,
      compatibility,
    });

    const planFile = join(TMP_DIR, "valid-plan.json");
    writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const lines: string[] = [];
    const code = await main(
      ["render-plan", "--plan-file", planFile],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("INFORMATIONAL ONLY");
    expect(output).toContain("NOT EXECUTED");
  });

  it("renders a valid plan file in JSON format", async () => {
    const host = makeHost();
    const artifacts = bundle.models.listArtifacts();
    const artifact = artifacts[0];
    const variant = bundle.models.getVariant(artifact.variantId)!;
    const runtime = bundle.runtimes.get(artifact.runtimeId)!;

    const plan = generateInstallPlan({
      host,
      artifact,
      variant,
      runtime,
    });

    const planFile = join(TMP_DIR, "valid-plan-json.json");
    writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const lines: string[] = [];
    const code = await main(
      ["render-plan", "--plan-file", planFile, "--json"],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("plan");
    expect(parsed).toHaveProperty("safetyReport");
    expect(parsed.safetyReport).toHaveProperty("approved");
  });
});

// ---------------------------------------------------------------------------
// Integration — list-models via main
// ---------------------------------------------------------------------------

describe("CLI main — integration with list-models", () => {
  it("list-models via main with --data-dir", async () => {
    const lines: string[] = [];
    const code = await main(
      ["list-models", "--data-dir", DATA_DIR],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("artifact(s)");
  });

  it("list-models with --json via main", async () => {
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

  it("list-models with --runtime filter via main", async () => {
    const lines: string[] = [];
    const code = await main(
      ["list-models", "--data-dir", DATA_DIR, "--json", "--runtime", "ollama"],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    for (const row of parsed) {
      expect(row.runtime).toBe("ollama");
    }
  });
});

// ---------------------------------------------------------------------------
// --host-file deterministic input
// ---------------------------------------------------------------------------

describe("CLI main — --host-file deterministic host input", () => {
  let hostFilePath: string;
  let validArtifactId: string;

  beforeAll(() => {
    // Write a host profile to a temp file
    hostFilePath = join(TMP_DIR, "host-profile.json");
    writeFileSync(hostFilePath, JSON.stringify(makeHost(), null, 2));

    // Get a valid artifact ID
    const artifacts = bundle.models.listArtifacts();
    validArtifactId = artifacts[0].id;
  });

  it("recommend-models with --host-file succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", hostFilePath],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("recommendation(s)");
  });

  it("recommend-models with --host-file --json succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("check-compatibility with --host-file succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["check-compatibility", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("Classification:");
  });

  it("check-compatibility with --host-file --json succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["check-compatibility", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId, "--json"],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("classification");
  });

  it("plan-install with --host-file succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["plan-install", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("INFORMATIONAL ONLY");
  });

  it("plan-install with --host-file --json succeeds", async () => {
    const lines: string[] = [];
    const code = await main(
      ["plan-install", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId, "--json"],
      (msg) => lines.push(msg),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("plan");
    expect(parsed).toHaveProperty("safetyReport");
  });

  it("--host-file with invalid file returns error", async () => {
    const errLines: string[] = [];
    const code = await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", "/nonexistent/host.json"],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Cannot read host file");
  });

  it("--host-file with invalid JSON returns error", async () => {
    const badFile = join(TMP_DIR, "bad-host.json");
    writeFileSync(badFile, "not json {{{");

    const errLines: string[] = [];
    const code = await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", badFile],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("Invalid JSON");
  });

  it("--host-file with invalid host schema returns error", async () => {
    const invalidHostFile = join(TMP_DIR, "invalid-host-schema.json");
    writeFileSync(invalidHostFile, JSON.stringify({ foo: "bar" }));

    const errLines: string[] = [];
    const code = await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", invalidHostFile],
      () => {},
      (msg) => errLines.push(msg),
    );

    expect(code).toBeGreaterThan(0);
    expect(errLines.join("\n")).toContain("validation failed");
  });

  it("deterministic: same host-file produces identical recommendations", async () => {
    const lines1: string[] = [];
    await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      (msg) => lines1.push(msg),
    );

    const lines2: string[] = [];
    await main(
      ["recommend-models", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--json"],
      (msg) => lines2.push(msg),
    );

    expect(lines1.join("\n")).toBe(lines2.join("\n"));
  });

  it("deterministic: same host-file produces identical plans", async () => {
    const lines1: string[] = [];
    await main(
      ["plan-install", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId, "--json"],
      (msg) => lines1.push(msg),
    );

    const lines2: string[] = [];
    await main(
      ["plan-install", "--data-dir", DATA_DIR, "--host-file", hostFilePath, "--artifact", validArtifactId, "--json"],
      (msg) => lines2.push(msg),
    );

    expect(lines1.join("\n")).toBe(lines2.join("\n"));
  });

  it("help text mentions --host-file", async () => {
    const lines: string[] = [];
    await main(["--help"], (msg) => lines.push(msg));
    expect(lines.join("\n")).toContain("--host-file");
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
