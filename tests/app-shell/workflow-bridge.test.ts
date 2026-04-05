/**
 * Tests for the app-shell workflow bridge.
 *
 * Covers:
 *   - Input validation (data dir, host file, stop-after)
 *   - Real workflow execution against the repository data dir
 *   - Stop-after behavior
 *   - Error handling (invalid inputs)
 *   - View-model mapping from real results
 */

import { describe, it, expect } from "vitest";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  validateDataDir,
  validateHostFile,
  validateStopAfter,
  executeRealWorkflow,
  getStageNames,
} from "../../src/app-shell/workflow-bridge.js";

import { STAGE_ORDER } from "../../src/workflow/types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../..");
const DATA_DIR = join(REPO_ROOT, "data");

// A minimal valid host profile for testing
function createTempHostFile(): string {
  const dir = join(tmpdir(), "codingagent-test-" + Date.now());
  mkdirSync(dir, { recursive: true });
  const hostFile = join(dir, "host.json");
  const host = {
    detectedAt: "2025-01-15T10:00:00Z",
    os: {
      platform: { value: "linux", confidence: "certain" },
      release: { value: "6.5.0", confidence: "certain" },
      arch: { value: "x64", confidence: "certain" },
    },
    cpu: {
      model: { value: "AMD Ryzen 7 5800X", confidence: "certain" },
      cores: { value: 8, confidence: "certain" },
      threads: { value: 16, confidence: "certain" },
    },
    memory: {
      totalGb: { value: 32, confidence: "certain" },
      availableGb: { value: 24, confidence: "certain" },
    },
    gpu: {
      present: { value: true, confidence: "certain" },
      model: { value: "NVIDIA GeForce RTX 3060", confidence: "certain" },
      vramGb: { value: 12, confidence: "certain" },
      cudaVersion: { value: null, confidence: "unknown" },
      rocmVersion: { value: null, confidence: "unknown" },
      driverVersion: { value: "535.0", confidence: "certain" },
    },
    installedRuntimes: [
      { runtimeId: "ollama", version: { value: "0.4.1", confidence: "certain" } },
    ],
    missingDependencies: [],
  };
  writeFileSync(hostFile, JSON.stringify(host, null, 2));
  return hostFile;
}

function createTempWeakHostFile(): string {
  const dir = join(tmpdir(), "codingagent-test-weak-" + Date.now());
  mkdirSync(dir, { recursive: true });
  const hostFile = join(dir, "host.json");
  const host = {
    detectedAt: "2025-01-15T10:00:00Z",
    os: {
      platform: { value: "linux", confidence: "certain" },
      release: { value: "5.4.0", confidence: "certain" },
      arch: { value: "x64", confidence: "certain" },
    },
    cpu: {
      model: { value: "Atom x5-Z8350", confidence: "certain" },
      cores: { value: 2, confidence: "certain" },
      threads: { value: 2, confidence: "certain" },
    },
    memory: {
      totalGb: { value: 2, confidence: "certain" },
      availableGb: { value: 0.8, confidence: "certain" },
    },
    gpu: null,
    installedRuntimes: [],
    missingDependencies: [],
  };
  writeFileSync(hostFile, JSON.stringify(host, null, 2));
  return hostFile;
}

// ---------------------------------------------------------------------------
// validateDataDir
// ---------------------------------------------------------------------------

describe("validateDataDir", () => {
  it("accepts the repository data/ directory", () => {
    const result = validateDataDir(DATA_DIR);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects a non-existent path", () => {
    const result = validateDataDir("/nonexistent/path/to/data");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("rejects a path that is a file, not a directory", () => {
    const result = validateDataDir(join(REPO_ROOT, "package.json"));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not a directory");
  });

  it("rejects a directory missing required subdirectories", () => {
    const dir = join(tmpdir(), "codingagent-empty-" + Date.now());
    mkdirSync(dir, { recursive: true });
    const result = validateDataDir(dir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("missing required subdirectories");
    rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// validateHostFile
// ---------------------------------------------------------------------------

describe("validateHostFile", () => {
  it("accepts a valid host profile JSON file", () => {
    const hostFile = createTempHostFile();
    const result = validateHostFile(hostFile);
    expect(result.valid).toBe(true);
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("rejects a non-existent file", () => {
    const result = validateHostFile("/nonexistent/host.json");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("rejects invalid JSON content", () => {
    const dir = join(tmpdir(), "codingagent-badjson-" + Date.now());
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "bad.json");
    writeFileSync(file, "not json");
    const result = validateHostFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid host file");
    rmSync(dir, { recursive: true });
  });

  it("rejects valid JSON that fails schema validation", () => {
    const dir = join(tmpdir(), "codingagent-badschema-" + Date.now());
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "bad.json");
    writeFileSync(file, JSON.stringify({ foo: "bar" }));
    const result = validateHostFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid host file");
    rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// validateStopAfter
// ---------------------------------------------------------------------------

describe("validateStopAfter", () => {
  it("accepts all valid stage names", () => {
    for (const stage of STAGE_ORDER) {
      expect(validateStopAfter(stage).valid).toBe(true);
    }
  });

  it("rejects an invalid stage name", () => {
    const result = validateStopAfter("nonexistent_stage");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid stage name");
    expect(result.error).toContain("catalog_loading");
  });
});

// ---------------------------------------------------------------------------
// getStageNames
// ---------------------------------------------------------------------------

describe("getStageNames", () => {
  it("returns all stage names in order", () => {
    const names = getStageNames();
    expect(names).toEqual(STAGE_ORDER);
    expect(names.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// executeRealWorkflow — success path
// ---------------------------------------------------------------------------

describe("executeRealWorkflow — success", () => {
  it("runs a complete workflow with valid inputs", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viewModel).toBeDefined();
      expect(result.viewModel.id).toBe("_real_workflow");
      expect(result.viewModel.label).toBe("Real Workflow Run");
      expect(result.viewModel.host).toBeDefined();
      expect(result.viewModel.host.summary).toBeTruthy();
      expect(result.viewModel.workflow).toBeDefined();
      expect(result.viewModel.workflow.status).toBeTruthy();
      // Should have completed stages
      expect(result.viewModel.workflow.stages.length).toBeGreaterThan(0);
      // Raw result should carry status
      expect(["completed", "completed_requires_approval"]).toContain(result.rawResult.status);
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("supports stop-after to produce partial workflow", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
      stopAfter: "recommendation",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawResult.status).toBe("partial");
      expect(result.rawResult.stoppedAfter).toBe("recommendation");
      expect(result.viewModel.workflow.stoppedAfter).toBe("recommendation");
      // Compatibility and plan should be null (not reached)
      expect(result.viewModel.compatibility).toBeNull();
      expect(result.viewModel.planReview).toBeNull();
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("view-model includes recommendation when workflow completes enough stages", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
      stopAfter: "target_selection",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // recommendation stage completed, so recommendation should be present
      expect(result.viewModel.recommendation).not.toBeNull();
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// executeRealWorkflow — error paths
// ---------------------------------------------------------------------------

describe("executeRealWorkflow — errors", () => {
  it("returns error for invalid data directory", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: "/nonexistent/data",
      hostFile,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBeDefined();
      expect(result.error.message).toBeTruthy();
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("returns error for invalid host file", () => {
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile: "/nonexistent/host.json",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBeDefined();
    }
  });

  it("returns error for invalid stop-after stage", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
      stopAfter: "nonexistent_stage",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid stage name");
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("returns failed workflow status for invalid artifact id", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
      artifactId: "nonexistent-artifact-xyz",
    });
    // The workflow runs but the target_selection stage fails
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawResult.status).toBe("failed");
      expect(result.rawResult.failedStage).toBe("target_selection");
      expect(result.rawResult.error).toBeTruthy();
      expect(result.viewModel.workflow.status).toBe("failed");
      expect(result.viewModel.workflow.error).toBeTruthy();
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("handles workflow failure for unsupported host gracefully", () => {
    const hostFile = createTempWeakHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
    });
    // Could be ok=true (with failed status) or ok=false depending on how far it gets
    if (result.ok) {
      // Workflow ran but might have failed at target_selection
      expect(["completed", "completed_requires_approval", "failed", "blocked", "partial"])
        .toContain(result.rawResult.status);
      expect(result.viewModel.workflow).toBeDefined();
    } else {
      expect(result.error.code).toBeDefined();
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// Blocked workflow rendering
// ---------------------------------------------------------------------------

describe("executeRealWorkflow — workflow state rendering", () => {
  it("view-model clearly surfaces completed_requires_approval status", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({ dataDir: DATA_DIR, hostFile });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const wf = result.viewModel.workflow;
      if (wf.status === "completed_requires_approval") {
        expect(wf.statusLabel).toBeTruthy();
        expect(wf.statusSeverity).toBeTruthy();
        expect(wf.statusSummary).toBeTruthy();
      }
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });

  it("stop-after produces partial status with stoppedAfter field", () => {
    const hostFile = createTempHostFile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile,
      stopAfter: "host_acquisition",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viewModel.workflow.status).toBe("partial");
      expect(result.viewModel.workflow.stoppedAfter).toBe("host_acquisition");
      const completed = result.viewModel.workflow.stages.filter((s: { completed: boolean }) => s.completed);
      expect(completed.length).toBe(2); // catalog_loading + host_acquisition
    }
    rmSync(resolve(hostFile, ".."), { recursive: true });
  });
});
