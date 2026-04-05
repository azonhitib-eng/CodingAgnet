/**
 * CLI tests — check-compatibility command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { runCheckCompatibility } from "../../src/cli/commands/check-compatibility.js";
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
  // Pick the first artifact from the catalog
  const artifacts = bundle.models.listArtifacts();
  validArtifactId = artifacts[0].id;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("check-compatibility command", () => {
  it("checks compatibility in pretty format", () => {
    const lines: string[] = [];
    const result = runCheckCompatibility({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    expect(result).toBeDefined();
    expect(result.classification).toBeTruthy();
    const output = lines.join("\n");
    expect(output).toContain("=== Compatibility Result ===");
    expect(output).toContain("Classification:");
    expect(output).toContain(validArtifactId);
  });

  it("checks compatibility in JSON format", () => {
    const lines: string[] = [];
    const result = runCheckCompatibility({
      bundle,
      host,
      artifactId: validArtifactId,
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.classification).toBe(result.classification);
    expect(parsed).toHaveProperty("bottlenecks");
    expect(parsed).toHaveProperty("limits");
    expect(parsed).toHaveProperty("reasons");
    expect(parsed).toHaveProperty("warnings");
  });

  it("result has all required fields", () => {
    const result = runCheckCompatibility({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: () => {},
    });

    expect(result.classification).toBeTruthy();
    expect(Array.isArray(result.bottlenecks)).toBe(true);
    expect(result.limits).toBeDefined();
    expect(typeof result.limits.gpuOffloadPossible).toBe("boolean");
    expect(typeof result.limits.requiresDiskSwap).toBe("boolean");
    expect(Array.isArray(result.settingsAdjustments)).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("throws CliError for unknown artifact", () => {
    expect(() =>
      runCheckCompatibility({
        bundle,
        host,
        artifactId: "nonexistent-artifact-id",
        json: false,
        writer: () => {},
      }),
    ).toThrow(CliError);
  });

  it("error message mentions the invalid artifact ID", () => {
    try {
      runCheckCompatibility({
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

  it("works with different artifact IDs", () => {
    const artifacts = bundle.models.listArtifacts();
    // Test at least 2 different artifacts
    for (const artifact of artifacts.slice(0, 2)) {
      const result = runCheckCompatibility({
        bundle,
        host,
        artifactId: artifact.id,
        json: false,
        writer: () => {},
      });
      expect(result.classification).toBeTruthy();
    }
  });

  it("shows bottlenecks for resource-constrained host", () => {
    const weakHost: HostProfile = {
      ...host,
      memory: {
        totalGb: certain(2),
        availableGb: certain(1),
      },
      gpu: null,
      installedRuntimes: [],
    };

    // Find a large model
    const largeArtifact = bundle.models.listArtifacts().find((a) => a.minimumRamGb > 4);
    if (!largeArtifact) return; // Skip if no large models

    const result = runCheckCompatibility({
      bundle,
      host: weakHost,
      artifactId: largeArtifact.id,
      json: false,
      writer: () => {},
    });

    // Should have issues
    expect(
      result.classification === "unsupported" ||
      result.classification === "cpu_only_slow" ||
      result.bottlenecks.length > 0 ||
      result.warnings.length > 0,
    ).toBe(true);
  });
});
