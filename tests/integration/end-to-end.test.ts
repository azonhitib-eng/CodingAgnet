/**
 * End-to-end integration tests.
 *
 * Proves the full flow works from catalog loading through safety
 * evaluation and rendering, covering the three safety states:
 *   - approved (happy path)
 *   - requiresHumanApproval
 *   - blocked
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";

import {
  loadCatalogBundleSync,
  type CatalogBundle,
  type CatalogPaths,
} from "../../src/catalog/bundle.js";
import { recommend } from "../../src/compatibility/recommendation-engine.js";
import { checkCompatibility } from "../../src/compatibility/compatibility-engine.js";
import {
  generateInstallPlan,
} from "../../src/install-plan/install-planner.js";
import {
  evaluatePlanSafety,
  defaultExecutionPolicy,
} from "../../src/install-plan/safety-evaluator.js";
import { renderPlan } from "../../src/install-plan/plan-renderer.js";
import {
  renderPlanWithSafety,
  runFullFlow,
} from "../../src/api.js";

import type {
  HostProfile,
  ModelArtifact,
  ModelVariant,
  RuntimeEntry,
  GpuInfo,
  Detected,
  ExecutionPolicy,
  InstallPlan,
  SafetyReport,
} from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T): Detected<T> {
  return { value, confidence: "certain" };
}

function unknown<T>(): Detected<T> {
  return { value: null, confidence: "unknown" };
}

function makeGpu(overrides?: Partial<GpuInfo>): GpuInfo {
  return {
    present: certain(true),
    model: certain("NVIDIA RTX 4090"),
    vramGb: certain(24),
    cudaVersion: certain("12.2"),
    rocmVersion: unknown(),
    driverVersion: certain("535.86.05"),
    ...overrides,
  };
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
    gpu: makeGpu(),
    installedRuntimes: [
      { runtimeId: "ollama", version: certain("0.3.0") },
    ],
    missingDependencies: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Catalog loading (shared fixture)
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");
const CATALOG_PATHS: CatalogPaths = {
  models: join(DATA_DIR, "models"),
  runtimes: join(DATA_DIR, "runtimes"),
  agentTools: join(DATA_DIR, "agent-tools"),
};

let bundle: CatalogBundle;

beforeAll(() => {
  bundle = loadCatalogBundleSync(CATALOG_PATHS);
});

// ---------------------------------------------------------------------------
// Happy path — approved
// ---------------------------------------------------------------------------

describe("end-to-end: approved (happy path)", () => {
  const host = makeHost();
  let plan: InstallPlan;
  let safety: SafetyReport;
  let rendered: string;

  beforeAll(() => {
    // Use a synthetic safe runtime (no curl | sh, no dangerous commands)
    // so that the plan is fully approved.
    const artifact: ModelArtifact = {
      id: "safe-model-7b-q4_k_m-saferuntime",
      variantId: "safe-model-7b",
      runtimeId: "saferuntime",
      quantization: "q4_k_m",
      fileSizeGb: 4.0,
      minimumRamGb: 8,
      recommendedRamGb: 12,
      minimumVramGb: 4,
      recommendedVramGb: 8,
      pullCommand: "saferuntime pull safe-model:7b",
      status: "supported",
    };
    const variant: ModelVariant = {
      id: "safe-model-7b",
      familyId: "safe-model",
      displayName: "Safe Model 7B",
      parameterLabel: "7B",
      sizeClass: "small",
      contextWindow: 32768,
      status: "supported",
    };
    const runtime: RuntimeEntry = {
      id: "saferuntime",
      displayName: "SafeRuntime",
      type: "cli_tool",
      detectionCommand: "saferuntime --version",
      versionCommand: "saferuntime --version",
      supportedPlatforms: ["linux", "darwin", "win32"],
      // No install instructions → no install steps → no approval required
      installInstructions: {},
      postInstallVerification: {
        linux: ["saferuntime --version"],
      },
      status: "supported",
    };

    // 1. Compatibility
    const compat = checkCompatibility(host, artifact, {
      variant,
      family: {
        id: "safe-model",
        displayName: "Safe Model",
        provider: "test",
        capabilities: { coding: true, agenticToolUse: false, autocomplete: false, longContext: false },
        status: "supported",
      },
      runtime,
      runtimeInstalled: true,
    });
    expect(compat.classification).toBe("supported");

    // 2. Plan
    plan = generateInstallPlan({
      host,
      artifact,
      variant,
      runtime,
      compatibility: compat,
    });

    // 3. Safety — permissive policy, no approval for caution
    const permissivePolicy: ExecutionPolicy = {
      mode: "plan_only",
      requireApprovalFor: ["blocked"],
      blockedPathPatterns: ["/etc/shadow"],
      sensitivePathPatterns: [],
    };
    safety = evaluatePlanSafety(plan, permissivePolicy);

    // 4. Render
    rendered = renderPlan(plan, safety);
  });

  it("produces a plan with steps", () => {
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.artifactId).toBeTruthy();
    expect(plan.runtimeId).toBeTruthy();
  });

  it("safety report is approved", () => {
    expect(safety.approved).toBe(true);
    expect(safety.blocked).toBe(false);
    expect(safety.requiresHumanApproval).toBe(false);
  });

  it("no blocked violations", () => {
    const blockedViolations = safety.violations.filter(
      (v) => v.severity === "blocked",
    );
    expect(blockedViolations).toHaveLength(0);
  });

  it("rendered output contains expected sections", () => {
    expect(rendered).toContain("INSTALL PLAN:");
    expect(rendered).toContain("INSTALL STEPS");
    expect(rendered).toContain("SAFETY REPORT");
    expect(rendered).toContain("Approved: YES");
    expect(rendered).toContain("Blocked: NO");
    expect(rendered).toContain("END OF PLAN");
  });

  it("rendered output is deterministic", () => {
    const rendered2 = renderPlan(plan, safety);
    expect(rendered2).toBe(rendered);
  });
});

// ---------------------------------------------------------------------------
// requiresHumanApproval path
// ---------------------------------------------------------------------------

describe("end-to-end: requiresHumanApproval", () => {
  const host = makeHost();
  let safety: SafetyReport;
  let rendered: string;

  beforeAll(() => {
    const recs = recommend(host, bundle);
    expect(recs.length).toBeGreaterThan(0);

    const top = recs[0];
    const artifact = bundle.models.getArtifact(top.artifactId)!;
    const variant = bundle.models.getVariant(top.variantId)!;
    const runtime = bundle.runtimes.get(artifact.runtimeId)!;

    const compat = checkCompatibility(host, artifact, {
      variant,
      family: bundle.models.getFamily(top.familyId)!,
      runtime,
      runtimeInstalled: true,
    });

    const plan = generateInstallPlan({
      host,
      artifact,
      variant,
      runtime,
      compatibility: compat,
    });

    // Default policy requires approval for caution/dangerous/blocked levels.
    // The Ollama plan includes "curl ... | sh" which is dangerous.
    const policy = defaultExecutionPolicy();
    safety = evaluatePlanSafety(plan, policy);
    rendered = renderPlan(plan, safety);
  });

  it("safety report requires human approval", () => {
    expect(safety.requiresHumanApproval).toBe(true);
    expect(safety.blocked).toBe(false);
    expect(safety.approved).toBe(false);
  });

  it("has violations or warnings explaining the need for approval", () => {
    const hasViolations = safety.violations.length > 0;
    const hasWarnings = safety.warnings.length > 0;
    expect(hasViolations || hasWarnings).toBe(true);
  });

  it("rendered output shows Requires Human Approval: YES", () => {
    expect(rendered).toContain("Requires Human Approval: YES");
    expect(rendered).toContain("Approved: NO");
    expect(rendered).toContain("Blocked: NO");
  });
});

// ---------------------------------------------------------------------------
// Blocked path
// ---------------------------------------------------------------------------

describe("end-to-end: blocked", () => {
  let safety: SafetyReport;
  let rendered: string;

  beforeAll(() => {
    // Construct a synthetic plan with a blocked command
    const host = makeHost();
    const artifact: ModelArtifact = {
      id: "test-blocked-artifact",
      variantId: "test-variant",
      runtimeId: "ollama",
      quantization: "q4_k_m",
      fileSizeGb: 4.0,
      minimumRamGb: 8,
      recommendedRamGb: 12,
      minimumVramGb: 4,
      recommendedVramGb: 8,
      pullCommand: "ollama pull test-model:7b",
      status: "supported",
    };
    const variant: ModelVariant = {
      id: "test-variant",
      familyId: "test-family",
      displayName: "Test Model 7B",
      parameterLabel: "7B",
      sizeClass: "small",
      contextWindow: 32768,
      status: "supported",
    };
    const runtime: RuntimeEntry = {
      id: "ollama",
      displayName: "Ollama",
      type: "local_server",
      detectionCommand: "ollama --version",
      versionCommand: "ollama --version",
      supportedPlatforms: ["linux", "darwin", "win32"],
      installInstructions: {
        // Inject a blocked command (rm -rf /) to trigger blocked state
        linux: ["rm -rf / --no-preserve-root"],
      },
      postInstallVerification: {
        linux: ["ollama list"],
      },
      status: "supported",
    };

    const plan = generateInstallPlan({ host, artifact, variant, runtime });

    const policy = defaultExecutionPolicy();
    safety = evaluatePlanSafety(plan, policy);
    rendered = renderPlan(plan, safety);
  });

  it("safety report is blocked", () => {
    expect(safety.blocked).toBe(true);
    expect(safety.approved).toBe(false);
    // When blocked, requiresHumanApproval should be false (blocked takes precedence)
    expect(safety.requiresHumanApproval).toBe(false);
  });

  it("has at least one blocked violation", () => {
    const blockedViolations = safety.violations.filter(
      (v) => v.severity === "blocked",
    );
    expect(blockedViolations.length).toBeGreaterThan(0);
  });

  it("violations preserve underlying reasons", () => {
    // Every violation should have a description
    for (const v of safety.violations) {
      expect(v.description).toBeTruthy();
      expect(v.stepIndex).toBeGreaterThanOrEqual(0);
      expect(["command", "path", "execution"]).toContain(v.type);
    }
  });

  it("rendered output shows Blocked: YES", () => {
    expect(rendered).toContain("Blocked: YES");
    expect(rendered).toContain("Approved: NO");
    expect(rendered).toContain("VIOLATIONS:");
  });
});

// ---------------------------------------------------------------------------
// Blocked + dangerous coexistence
// ---------------------------------------------------------------------------

describe("end-to-end: blocked + dangerous coexistence", () => {
  it("blocked takes precedence but both violation reasons are preserved", () => {
    const host = makeHost();
    const artifact: ModelArtifact = {
      id: "test-dual-risk",
      variantId: "test-variant",
      runtimeId: "ollama",
      quantization: "q4_k_m",
      fileSizeGb: 4.0,
      minimumRamGb: 8,
      recommendedRamGb: 12,
      minimumVramGb: 4,
      recommendedVramGb: 8,
      pullCommand: "ollama pull test:7b",
      status: "supported",
    };
    const variant: ModelVariant = {
      id: "test-variant",
      familyId: "test-family",
      displayName: "Test 7B",
      parameterLabel: "7B",
      sizeClass: "small",
      status: "supported",
    };
    const runtime: RuntimeEntry = {
      id: "ollama",
      displayName: "Ollama",
      type: "local_server",
      detectionCommand: "ollama --version",
      versionCommand: "ollama --version",
      supportedPlatforms: ["linux", "darwin", "win32"],
      installInstructions: {
        // First command: blocked (rm -rf /)
        // Second command: dangerous (curl | sudo sh)
        linux: [
          "rm -rf / --no-preserve-root",
          "curl -fsSL https://example.com/install.sh | sudo sh",
        ],
      },
      postInstallVerification: {},
      status: "supported",
    };

    const plan = generateInstallPlan({ host, artifact, variant, runtime });
    const safety = evaluatePlanSafety(plan, defaultExecutionPolicy());

    // Blocked takes precedence
    expect(safety.blocked).toBe(true);
    expect(safety.approved).toBe(false);
    expect(safety.requiresHumanApproval).toBe(false);

    // Both blocked and dangerous violations are preserved
    const blocked = safety.violations.filter((v) => v.severity === "blocked");
    const dangerous = safety.violations.filter((v) => v.severity === "dangerous");
    expect(blocked.length).toBeGreaterThan(0);
    expect(dangerous.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runFullFlow convenience helper
// ---------------------------------------------------------------------------

describe("runFullFlow integration", () => {
  it("returns complete result for a capable host", () => {
    const host = makeHost();
    const result = runFullFlow({ bundle, host });

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.selected.artifact).toBeTruthy();
    expect(result.selected.variant).toBeTruthy();
    expect(result.selected.family).toBeTruthy();
    expect(result.selected.runtime).toBeTruthy();
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(typeof result.safetyReport.approved).toBe("boolean");
    expect(typeof result.safetyReport.blocked).toBe("boolean");
    expect(typeof result.safetyReport.requiresHumanApproval).toBe("boolean");
    expect(result.rendered).toContain("INSTALL PLAN:");
    expect(result.rendered).toContain("SAFETY REPORT");
    expect(result.rendered).toContain("END OF PLAN");
  });

  it("accepts a specific artifactId", () => {
    const host = makeHost();
    const artifacts = bundle.models.listArtifacts();
    const targetId = artifacts[0].id;

    const result = runFullFlow({ bundle, host, artifactId: targetId });
    expect(result.selected.artifact.id).toBe(targetId);
  });

  it("throws for non-existent artifactId", () => {
    const host = makeHost();
    expect(() =>
      runFullFlow({ bundle, host, artifactId: "nonexistent-artifact-id" }),
    ).toThrow("not found in catalog");
  });

  it("throws when no compatible artifacts exist", () => {
    // Host with no runtimes installed and unsupported platform
    const poorHost = makeHost({
      os: {
        platform: certain("freebsd"),
        release: certain("13.0"),
        arch: certain("x64"),
      },
      installedRuntimes: [],
      missingDependencies: ["ollama", "llamacpp"],
    });

    expect(() => runFullFlow({ bundle, host: poorHost })).toThrow(
      "No compatible artifacts",
    );
  });

  it("result is deterministic for identical inputs", () => {
    const host = makeHost();
    const result1 = runFullFlow({ bundle, host });
    const result2 = runFullFlow({ bundle, host });

    expect(result1.rendered).toBe(result2.rendered);
    expect(result1.safetyReport).toEqual(result2.safetyReport);
    expect(result1.recommendations.length).toBe(result2.recommendations.length);
    for (let i = 0; i < result1.recommendations.length; i++) {
      expect(result1.recommendations[i].score).toBe(
        result2.recommendations[i].score,
      );
      expect(result1.recommendations[i].artifactId).toBe(
        result2.recommendations[i].artifactId,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// renderPlanWithSafety convenience helper
// ---------------------------------------------------------------------------

describe("renderPlanWithSafety integration", () => {
  it("produces safety report and rendered text in one call", () => {
    const host = makeHost();
    const recs = recommend(host, bundle);
    const top = recs[0];
    const artifact = bundle.models.getArtifact(top.artifactId)!;
    const variant = bundle.models.getVariant(top.variantId)!;
    const runtime = bundle.runtimes.get(artifact.runtimeId)!;

    const plan = generateInstallPlan({
      host,
      artifact,
      variant,
      runtime,
    });

    const { safetyReport, rendered } = renderPlanWithSafety(plan);

    expect(safetyReport.planId).toBe(plan.artifactId);
    expect(typeof safetyReport.approved).toBe("boolean");
    expect(typeof safetyReport.blocked).toBe("boolean");
    expect(typeof safetyReport.requiresHumanApproval).toBe("boolean");
    expect(rendered).toContain("SAFETY REPORT");
    expect(rendered).toContain("INSTALL PLAN:");
  });

  it("accepts custom policy", () => {
    const host = makeHost();
    const recs = recommend(host, bundle);
    const artifact = bundle.models.getArtifact(recs[0].artifactId)!;
    const variant = bundle.models.getVariant(recs[0].variantId)!;
    const runtime = bundle.runtimes.get(artifact.runtimeId)!;

    const plan = generateInstallPlan({ host, artifact, variant, runtime });

    const strictPolicy: ExecutionPolicy = {
      mode: "plan_only",
      requireApprovalFor: ["safe", "caution", "dangerous", "blocked"],
      blockedPathPatterns: ["/etc/shadow"],
      sensitivePathPatterns: ["/etc/*"],
    };

    const { safetyReport } = renderPlanWithSafety(plan, strictPolicy);
    // With strict policy all steps require approval
    expect(safetyReport.requiresHumanApproval || safetyReport.blocked).toBe(true);
    expect(safetyReport.approved).toBe(false);
  });
});
