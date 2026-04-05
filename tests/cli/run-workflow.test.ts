/**
 * CLI tests — run-workflow command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { runRunWorkflow } from "../../src/cli/commands/run-workflow.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
import { CliError } from "../../src/cli/errors.js";
import { STAGE_ORDER } from "../../src/workflow/types.js";
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
// Full workflow
// ---------------------------------------------------------------------------

describe("run-workflow command — full workflow", () => {
  it("runs full workflow in pretty format", () => {
    const lines: string[] = [];
    const result = runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    expect(result.status).toBeDefined();
    expect(["completed", "completed_requires_approval", "blocked"]).toContain(result.status);

    const output = lines.join("\n");
    expect(output).toContain("Workflow Result");
    expect(output).toContain("INFORMATIONAL ONLY");
    expect(output).toContain("Completed stages");
  });

  it("runs full workflow in JSON format", () => {
    const lines: string[] = [];
    const result = runRunWorkflow({
      bundle,
      host,
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("completedStages");
    expect(parsed).toHaveProperty("stageOutputs");
    expect(Array.isArray(parsed.completedStages)).toBe(true);
    expect(parsed.completedStages.length).toBeGreaterThan(0);
    expect(result.status).toBe(parsed.status);
  });

  it("completed stages list matches expected stages", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: () => {},
    });

    // Full workflow should have run all stages (unless blocked)
    if (result.status !== "blocked") {
      expect(result.completedStages.length).toBe(STAGE_ORDER.length);
    } else {
      // Blocked stops before rendering
      expect(result.completedStages.length).toBeGreaterThanOrEqual(7);
    }
  });

  it("pretty output shows target selection info", () => {
    const lines: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    const output = lines.join("\n");
    expect(output).toContain("Target:");
    expect(output).toContain("Artifact:");
    expect(output).toContain("Selection:");
    expect(output).toContain("recommendation_default");
  });

  it("pretty output shows safety info", () => {
    const lines: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    const output = lines.join("\n");
    expect(output).toContain("Safety:");
    expect(
      output.includes("APPROVED") ||
      output.includes("REQUIRES HUMAN APPROVAL") ||
      output.includes("BLOCKED"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Explicit artifact selection
// ---------------------------------------------------------------------------

describe("run-workflow command — artifact selection", () => {
  it("runs workflow with explicit artifact ID", () => {
    const lines: string[] = [];
    const result = runRunWorkflow({
      bundle,
      host,
      artifactId: validArtifactId,
      json: false,
      writer: (msg) => lines.push(msg),
    });

    expect(result.status).toBeDefined();
    const output = lines.join("\n");
    expect(output).toContain("explicit_artifact_id");
    expect(output).toContain(validArtifactId);
  });

  it("explicit artifact in JSON output includes selection info", () => {
    const lines: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      artifactId: validArtifactId,
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.stageOutputs.target_selection.selectionMethod).toBe(
      "explicit_artifact_id",
    );
    expect(parsed.stageOutputs.target_selection.artifactId).toBe(
      validArtifactId,
    );
  });

  it("fails gracefully for unknown artifact ID", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      artifactId: "nonexistent-artifact-xyz",
      json: false,
      writer: () => {},
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("nonexistent-artifact-xyz");
  });
});

// ---------------------------------------------------------------------------
// --stop-after
// ---------------------------------------------------------------------------

describe("run-workflow command — stop-after", () => {
  it("stops after recommendation", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      stopAfter: "recommendation",
      json: false,
      writer: () => {},
    });

    expect(result.status).toBe("partial");
    expect(result.stoppedAfter).toBe("recommendation");
    expect(result.stageOutputs.recommendation).toBeDefined();
    expect(result.stageOutputs.target_selection).toBeUndefined();
  });

  it("stops after catalog_loading", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      stopAfter: "catalog_loading",
      json: false,
      writer: () => {},
    });

    expect(result.status).toBe("partial");
    expect(result.stoppedAfter).toBe("catalog_loading");
    expect(result.completedStages.length).toBe(1);
  });

  it("stops after compatibility_evaluation", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      stopAfter: "compatibility_evaluation",
      json: false,
      writer: () => {},
    });

    expect(result.status).toBe("partial");
    expect(result.stoppedAfter).toBe("compatibility_evaluation");
    expect(result.stageOutputs.compatibility_evaluation).toBeDefined();
    expect(result.stageOutputs.install_planning).toBeUndefined();
  });

  it("stops after safety_evaluation", () => {
    const result = runRunWorkflow({
      bundle,
      host,
      stopAfter: "safety_evaluation",
      json: false,
      writer: () => {},
    });

    // Could be "partial" or "blocked" depending on safety result
    expect(["partial", "blocked"]).toContain(result.status);
    expect(result.stageOutputs.safety_evaluation).toBeDefined();
    expect(result.stageOutputs.rendering).toBeUndefined();
  });

  it("partial workflow JSON output includes stoppedAfter", () => {
    const lines: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      stopAfter: "recommendation",
      json: true,
      writer: (msg) => lines.push(msg),
    });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.status).toBe("partial");
    expect(parsed.stoppedAfter).toBe("recommendation");
    expect(parsed.stageOutputs.recommendation).toBeDefined();
  });

  it("pretty output mentions partial status", () => {
    const lines: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      stopAfter: "recommendation",
      json: false,
      writer: (msg) => lines.push(msg),
    });

    const output = lines.join("\n");
    expect(output).toContain("PARTIAL");
    expect(output).toContain("recommendation");
  });

  it("throws CliError for invalid --stop-after", () => {
    expect(() =>
      runRunWorkflow({
        bundle,
        host,
        stopAfter: "nonexistent_stage",
        json: false,
        writer: () => {},
      }),
    ).toThrow(CliError);
  });

  it("error message for invalid --stop-after lists valid stages", () => {
    try {
      runRunWorkflow({
        bundle,
        host,
        stopAfter: "bad_stage",
        json: false,
        writer: () => {},
      });
      expect.fail("Should have thrown");
    } catch (e) {
      const msg = (e as CliError).message;
      expect(msg).toContain("bad_stage");
      expect(msg).toContain("catalog_loading");
      expect(msg).toContain("rendering");
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("run-workflow command — determinism", () => {
  it("same inputs produce identical JSON output", () => {
    const lines1: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: true,
      writer: (msg) => lines1.push(msg),
    });

    const lines2: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: true,
      writer: (msg) => lines2.push(msg),
    });

    expect(lines1.join("\n")).toBe(lines2.join("\n"));
  });

  it("same inputs produce identical pretty output", () => {
    const lines1: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: (msg) => lines1.push(msg),
    });

    const lines2: string[] = [];
    runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: (msg) => lines2.push(msg),
    });

    expect(lines1.join("\n")).toBe(lines2.join("\n"));
  });
});

// ---------------------------------------------------------------------------
// Stop-after rendering (full run)
// ---------------------------------------------------------------------------

describe("run-workflow command — stop-after rendering (full run)", () => {
  it("stop-after rendering is the same as no stop-after", () => {
    const result1 = runRunWorkflow({
      bundle,
      host,
      stopAfter: "rendering",
      json: false,
      writer: () => {},
    });

    const result2 = runRunWorkflow({
      bundle,
      host,
      json: false,
      writer: () => {},
    });

    // Both should complete the full pipeline
    expect(result1.completedStages.length).toBe(result2.completedStages.length);
    expect(result1.status).toBe(result2.status);
  });
});
