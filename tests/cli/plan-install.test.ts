/**
 * CLI tests — plan-install command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { runPlanInstall } from "../../src/cli/commands/plan-install.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
import { CliError } from "../../src/cli/errors.js";
import type { HostProfile, Detected } from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");
const catalogPaths: CatalogPaths = {
  models: join(DATA_DIR, "models"),
  runtimes: join(DATA_DIR, "runtimes"),
  agentTools: join(DATA_DIR, "agent-tools"),
};

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
let host: HostProfile;
let validArtifactId: string;

beforeAll(() => {
  bundle = loadCatalogBundleSync(catalogPaths);
  host = makeHost();
  const artifacts = bundle.models.listArtifacts();
  validArtifactId = artifacts[0].id;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plan-install command", () => {
  it("generates an install plan in pretty format", () => {
    const lines: string[] = [];
    const result = runPlanInstall({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    expect(result.plan).toBeDefined();
    expect(result.safetyReport).toBeDefined();
    expect(result.rendered).toBeTruthy();

    const output = lines.join("\n");
    expect(output).toContain("INFORMATIONAL ONLY");
    expect(output).toContain("NOT EXECUTED");
  });

  it("generates an install plan in JSON format", () => {
    const lines: string[] = [];
    runPlanInstall({
      bundle,
      host,
      artifactId: validArtifactId,
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("plan");
    expect(parsed).toHaveProperty("safetyReport");
    expect(parsed.plan.artifactId).toBe(validArtifactId);
    expect(parsed.safetyReport).toHaveProperty("approved");
    expect(parsed.safetyReport).toHaveProperty("blocked");
    expect(parsed.safetyReport).toHaveProperty("requiresHumanApproval");
  });

  it("plan has required structural fields", () => {
    const result = runPlanInstall({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: () => {},
    });

    const plan = result.plan;
    expect(plan.artifactId).toBe(validArtifactId);
    expect(plan.runtimeId).toBeTruthy();
    expect(plan.targetPlatform).toBeTruthy();
    expect(Array.isArray(plan.prerequisites)).toBe(true);
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(Array.isArray(plan.postInstallVerification)).toBe(true);
    expect(plan.resourceEstimate).toBeDefined();
    expect(plan.humanSummary).toBeTruthy();
  });

  it("safety report has valid 3-state approval", () => {
    const result = runPlanInstall({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: () => {},
    });

    const safety = result.safetyReport;
    expect(typeof safety.approved).toBe("boolean");
    expect(typeof safety.blocked).toBe("boolean");
    expect(typeof safety.requiresHumanApproval).toBe("boolean");

    // Verify precedence: if blocked, approved must be false
    if (safety.blocked) {
      expect(safety.approved).toBe(false);
    }
    // If requiresHumanApproval, approved must be false
    if (safety.requiresHumanApproval) {
      expect(safety.approved).toBe(false);
    }
    // If approved, no blocked and no human approval
    if (safety.approved) {
      expect(safety.blocked).toBe(false);
      expect(safety.requiresHumanApproval).toBe(false);
    }
  });

  it("throws CliError for unknown artifact", () => {
    expect(() =>
      runPlanInstall({
        bundle,
        host,
        artifactId: "nonexistent-artifact-id",
        json: false,
        writer: () => {},
      }),
    ).toThrow(CliError);
  });

  it("error mentions the invalid artifact ID", () => {
    try {
      runPlanInstall({
        bundle,
        host,
        artifactId: "nonexistent-artifact-id",
        json: false,
        writer: () => {},
      });
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as CliError).message).toContain("nonexistent-artifact-id");
    }
  });

  it("pretty output includes safety status header", () => {
    const lines: string[] = [];
    runPlanInstall({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    const output = lines.join("\n");
    expect(
      output.includes("APPROVED") ||
      output.includes("REQUIRES HUMAN APPROVAL") ||
      output.includes("BLOCKED"),
    ).toBe(true);
  });

  it("works with different artifacts from catalog", () => {
    const artifacts = bundle.models.listArtifacts();
    for (const artifact of artifacts.slice(0, 3)) {
      const result = runPlanInstall({
        bundle,
        host,
        artifactId: artifact.id,
        json: false,
        writer: () => {},
      });
      expect(result.plan.artifactId).toBe(artifact.id);
    }
  });
});
