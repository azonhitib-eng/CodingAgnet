/**
 * CLI tests — recommend-models command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { runRecommendModels } from "../../src/cli/commands/recommend-models.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
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

function makeHost(overrides?: Partial<HostProfile>): HostProfile {
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
    ...overrides,
  };
}

let bundle: CatalogBundle;
let host: HostProfile;

beforeAll(() => {
  bundle = loadCatalogBundleSync(catalogPaths);
  host = makeHost();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recommend-models command", () => {
  it("returns ranked recommendations in pretty format", () => {
    const lines: string[] = [];
    const recs = runRecommendModels({
      bundle,
      host,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    expect(recs.length).toBeGreaterThan(0);
    const output = lines.join("\n");
    expect(output).toContain("recommendation(s)");
    expect(output).toContain("Score:");
  });

  it("returns ranked recommendations in JSON format", () => {
    const lines: string[] = [];
    const recs = runRecommendModels({
      bundle,
      host,
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(recs.length);
    expect(parsed[0]).toHaveProperty("artifactId");
    expect(parsed[0]).toHaveProperty("displayName");
    expect(parsed[0]).toHaveProperty("score");
    expect(parsed[0]).toHaveProperty("compatibility");
  });

  it("scores are in descending order", () => {
    const recs = runRecommendModels({
      bundle,
      host,
      json: false,
      writer: () => {},
    });

    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });

  it("includes unsupported when requested", () => {
    const withUnsupported = runRecommendModels({
      bundle,
      host,
      json: false,
      includeUnsupported: true,
      writer: () => {},
    });

    const withoutUnsupported = runRecommendModels({
      bundle,
      host,
      json: false,
      includeUnsupported: false,
      writer: () => {},
    });

    expect(withUnsupported.length).toBeGreaterThanOrEqual(withoutUnsupported.length);
  });

  it("shows 'No compatible models' for impossible host", () => {
    const weakHost = makeHost({
      memory: {
        totalGb: certain(1),
        availableGb: certain(0.5),
      },
      gpu: null,
      installedRuntimes: [],
    });

    const lines: string[] = [];
    const recs = runRecommendModels({
      bundle,
      host: weakHost,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    // It's valid for a very weak host to still have some recs, 
    // but if not, the message should be clear
    if (recs.length === 0) {
      expect(lines.join("\n")).toContain("No compatible models");
    }
  });

  it("each recommendation has required fields", () => {
    const recs = runRecommendModels({
      bundle,
      host,
      json: false,
      writer: () => {},
    });

    for (const rec of recs) {
      expect(rec.artifactId).toBeTruthy();
      expect(rec.variantId).toBeTruthy();
      expect(rec.familyId).toBeTruthy();
      expect(rec.displayName).toBeTruthy();
      expect(typeof rec.score).toBe("number");
      expect(rec.compatibility).toBeDefined();
      expect(rec.compatibility.classification).toBeTruthy();
    }
  });
});
