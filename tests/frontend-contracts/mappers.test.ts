/**
 * Frontend contract mapping layer — comprehensive tests.
 *
 * Covers:
 *   - host profile → HostSummaryViewModel
 *   - compatibility → CompatibilityViewModel
 *   - recommendation → RecommendationItem
 *   - install plan + safety → PlanReviewViewModel
 *   - workflow result → WorkflowViewModel
 *   - blocked vs approval vs completed semantics
 *   - deterministic output ordering
 *   - normalized error contract behavior
 */

import { describe, it, expect } from "vitest";

import {
  toHostSummary,
  toArtifactListItem,
  toCompatibilityView,
  toRecommendationItem,
  toRecommendationList,
  toSafetyStatusView,
  toPlanReviewView,
  toWorkflowView,
  toFinalReviewState,
  COMPATIBILITY_LABELS,
  WORKFLOW_STATUS_LABELS,
  SAFETY_STATUS_LABELS,
  RISK_SEVERITY,
  STAGE_LABELS,
  createFrontendError,
  normalizeFrontendError,
} from "../../src/frontend-contracts/index.js";

import type {
  CompatibilityStatus,
  WorkflowViewStatus,
  SafetyStatus,
} from "../../src/frontend-contracts/index.js";

import {
  lowEndCpuOnly,
  midRangeGpu,
  highEndGpu,
  missingRuntime,
  partiallyUnknown,
  unsupportedWeak,
  ALL_FIXTURE_PROFILES,
} from "../fixtures/host-profiles.js";

import {
  lowEndCpuOnlyExample,
  midRangeGpuExample,
  unsupportedExample,
  blockedWorkflowExample,
  approvalWorkflowExample,
  partialWorkflowExample,
  ALL_FRONTEND_EXAMPLES,
} from "../fixtures/frontend-contract-examples.js";

import type { WorkflowResult } from "../../src/workflow/types.js";
import { STAGE_ORDER } from "../../src/workflow/types.js";

// =========================================================================
// 1. Host profile → HostSummaryViewModel
// =========================================================================

describe("toHostSummary", () => {
  it("maps low-end CPU-only host", () => {
    const vm = toHostSummary(lowEndCpuOnly);
    expect(vm.os).toBe("linux");
    expect(vm.arch).toBe("x64");
    expect(vm.cpuModel).toContain("Celeron");
    expect(vm.cpuCores).toBe(2);
    expect(vm.totalRamGb).toBe(8);
    expect(vm.gpuPresent).toBe(false);
    expect(vm.gpuModel).toBeNull();
    expect(vm.gpuVramGb).toBeNull();
    expect(vm.installedRuntimes).toEqual(["ollama"]);
    expect(vm.missingDependencies).toEqual(["llama-cpp"]);
    expect(vm.summary).toContain("linux");
    expect(vm.summary).toContain("8 GB RAM");
    expect(vm.summary).toContain("No GPU");
    expect(vm._raw).toBe(lowEndCpuOnly);
  });

  it("maps mid-range GPU host", () => {
    const vm = toHostSummary(midRangeGpu);
    expect(vm.gpuPresent).toBe(true);
    expect(vm.gpuModel).toContain("RTX 3060");
    expect(vm.gpuVramGb).toBe(12);
    expect(vm.totalRamGb).toBe(32);
    expect(vm.summary).toContain("RTX 3060");
    expect(vm.summary).toContain("12 GB");
    expect(vm.installedRuntimes).toEqual(["ollama", "llama-cpp"]);
    expect(vm.missingDependencies).toEqual([]);
  });

  it("maps high-end GPU host", () => {
    const vm = toHostSummary(highEndGpu);
    expect(vm.gpuPresent).toBe(true);
    expect(vm.gpuModel).toContain("RTX 4090");
    expect(vm.gpuVramGb).toBe(24);
    expect(vm.totalRamGb).toBe(64);
    expect(vm.summary).toContain("RTX 4090");
  });

  it("maps missing-runtime host (macOS)", () => {
    const vm = toHostSummary(missingRuntime);
    expect(vm.os).toBe("darwin");
    expect(vm.arch).toBe("arm64");
    expect(vm.gpuPresent).toBe(true);
    expect(vm.installedRuntimes).toEqual([]);
    expect(vm.missingDependencies).toEqual(["ollama", "llama-cpp"]);
  });

  it("maps partially-unknown host", () => {
    const vm = toHostSummary(partiallyUnknown);
    expect(vm.arch).toBe("unknown");
    expect(vm.gpuPresent).toBe(true);
    expect(vm.gpuModel).toBeNull(); // model unknown
    expect(vm.gpuVramGb).toBeNull(); // VRAM unknown
    // GPU present but model unknown — should fall back to "No GPU" in summary
    expect(vm.summary).toContain("No GPU");
  });

  it("maps unsupported-weak host", () => {
    const vm = toHostSummary(unsupportedWeak);
    expect(vm.totalRamGb).toBe(2);
    expect(vm.gpuPresent).toBe(false);
    expect(vm.summary).toContain("2 GB RAM");
    expect(vm.summary).toContain("No GPU");
  });

  it("preserves _raw reference for all profiles", () => {
    for (const [, profile] of Object.entries(ALL_FIXTURE_PROFILES)) {
      const vm = toHostSummary(profile);
      expect(vm._raw).toBe(profile);
    }
  });
});

// =========================================================================
// 2. ArtifactListItem mapping
// =========================================================================

describe("toArtifactListItem", () => {
  it("maps artifact with metadata", () => {
    const artifact = {
      id: "codellama-7b-q4_k_m-ollama",
      variantId: "codellama-7b",
      runtimeId: "ollama",
      quantization: "q4_k_m" as const,
      fileSizeGb: 3.8,
      minimumRamGb: 6,
      recommendedRamGb: 8,
      minimumVramGb: 0,
      recommendedVramGb: 4,
      status: "supported" as const,
    };
    const variant = {
      id: "codellama-7b",
      familyId: "codellama",
      displayName: "7B",
      parameterLabel: "7B",
      sizeClass: "small" as const,
      contextWindow: 16384,
      status: "supported" as const,
    };
    const family = {
      id: "codellama",
      displayName: "CodeLlama",
      provider: "Meta",
      capabilities: { coding: true, agenticToolUse: false, autocomplete: true, longContext: false },
      status: "supported" as const,
    };

    const item = toArtifactListItem(artifact, variant, family);
    expect(item.artifactId).toBe("codellama-7b-q4_k_m-ollama");
    expect(item.displayName).toBe("CodeLlama 7B");
    expect(item.parameterLabel).toBe("7B");
    expect(item.quantization).toBe("q4_k_m");
    expect(item.sizeClass).toBe("small");
    expect(item.fileSizeGb).toBe(3.8);
    expect(item.minimumRamGb).toBe(6);
    expect(item.minimumVramGb).toBe(0);
  });

  it("handles missing fileSizeGb", () => {
    const artifact = {
      id: "test",
      variantId: "v",
      runtimeId: "r",
      quantization: "q4_0" as const,
      minimumRamGb: 4,
      recommendedRamGb: 8,
      minimumVramGb: 0,
      recommendedVramGb: 0,
      status: "supported" as const,
    };
    const variant = {
      id: "v",
      familyId: "f",
      displayName: "V",
      parameterLabel: "7B",
      sizeClass: "small" as const,
      status: "supported" as const,
    };
    const family = {
      id: "f",
      displayName: "F",
      provider: "P",
      capabilities: { coding: false, agenticToolUse: false, autocomplete: false, longContext: false },
      status: "supported" as const,
    };

    const item = toArtifactListItem(artifact, variant, family);
    expect(item.fileSizeGb).toBeNull();
  });
});

// =========================================================================
// 3. Compatibility → CompatibilityViewModel
// =========================================================================

describe("toCompatibilityView", () => {
  it("maps supported classification", () => {
    const vm = toCompatibilityView(midRangeGpuExample.compatibility);
    expect(vm.status).toBe("supported");
    expect(vm.label).toBe("Fully Supported");
    expect(vm.severity).toBe("info");
    expect(vm.summaryMessage).toContain("full performance");
    expect(vm.bottlenecks).toEqual([]);
    expect(vm.gpuOffloadPossible).toBe(true);
    expect(vm.estimatedGpuLayers).toBe(32);
    expect(vm.requiresDiskSwap).toBe(false);
    expect(vm._raw).toBe(midRangeGpuExample.compatibility);
  });

  it("maps cpu_only_slow classification", () => {
    const vm = toCompatibilityView(lowEndCpuOnlyExample.compatibility);
    expect(vm.status).toBe("cpu_only_slow");
    expect(vm.label).toBe("CPU Only — Slow");
    expect(vm.severity).toBe("warning");
    expect(vm.bottlenecks).toContain("vram");
    expect(vm.gpuOffloadPossible).toBe(false);
    expect(vm.settingsAdjustments.length).toBeGreaterThan(0);
    expect(vm.settingsAdjustments[0].parameter).toBe("threads");
  });

  it("maps unsupported classification", () => {
    const vm = toCompatibilityView(unsupportedExample.compatibility);
    expect(vm.status).toBe("unsupported");
    expect(vm.label).toBe("Unsupported");
    expect(vm.severity).toBe("error");
    expect(vm.bottlenecks).toContain("ram");
    expect(vm.reasons).toContain("RAM below absolute minimum (2 GB < 4 GB required)");
  });

  it("preserves reasons and warnings", () => {
    const vm = toCompatibilityView(lowEndCpuOnlyExample.compatibility);
    expect(vm.reasons.length).toBeGreaterThan(0);
    expect(vm.warnings.length).toBeGreaterThan(0);
  });

  it("maps all four compatibility statuses to distinct labels", () => {
    const statuses: CompatibilityStatus[] = [
      "supported",
      "supported_with_limits",
      "cpu_only_slow",
      "unsupported",
    ];
    const labels = statuses.map((s) => COMPATIBILITY_LABELS[s].label);
    expect(new Set(labels).size).toBe(4);
  });
});

// =========================================================================
// 4. Recommendation → RecommendationItem
// =========================================================================

describe("toRecommendationItem / toRecommendationList", () => {
  it("maps a single recommendation", () => {
    const item = toRecommendationItem(midRangeGpuExample.recommendation);
    expect(item.artifactId).toBe("codellama-7b-q4_k_m-ollama");
    expect(item.displayName).toBe("CodeLlama 7B (Q4_K_M, Ollama)");
    expect(item.score).toBe(106);
    expect(item.compatibility).toBe("supported");
    expect(item.compatibilityLabel).toBe("Fully Supported");
    expect(item.compatibilitySeverity).toBe("info");
    expect(item.explanations.length).toBeGreaterThan(0);
  });

  it("maps recommendation list preserving order", () => {
    const rec2 = {
      ...midRangeGpuExample.recommendation,
      artifactId: "second",
      score: 50,
    };
    const list = toRecommendationList([midRangeGpuExample.recommendation, rec2]);
    expect(list).toHaveLength(2);
    expect(list[0].artifactId).toBe("codellama-7b-q4_k_m-ollama");
    expect(list[1].artifactId).toBe("second");
    // Best first — order preserved from backend
    expect(list[0].score).toBeGreaterThan(list[1].score);
  });

  it("maps CPU-only recommendation with correct severity", () => {
    const item = toRecommendationItem(lowEndCpuOnlyExample.recommendation);
    expect(item.compatibility).toBe("cpu_only_slow");
    expect(item.compatibilitySeverity).toBe("warning");
  });
});

// =========================================================================
// 5. Install plan + safety → PlanReviewViewModel
// =========================================================================

describe("toPlanReviewView", () => {
  it("maps plan + approval safety", () => {
    const vm = toPlanReviewView(
      approvalWorkflowExample.plan,
      approvalWorkflowExample.safety,
    );
    expect(vm.artifactId).toBe("codellama-7b-q4_k_m-ollama");
    expect(vm.runtimeId).toBe("ollama");
    expect(vm.targetPlatform).toBe("linux");
    expect(vm.humanSummary).toContain("CodeLlama");
    expect(vm.steps).toHaveLength(2);
    expect(vm.steps[0].order).toBe(1);
    expect(vm.steps[0].riskLevel).toBe("caution");
    expect(vm.steps[0].riskSeverity).toBe("warning");
    expect(vm.steps[0].requiresApproval).toBe(true);
    expect(vm.steps[1].riskLevel).toBe("safe");
    expect(vm.steps[1].riskSeverity).toBe("info");
    expect(vm.prerequisites).toHaveLength(1);
    expect(vm.resourceEstimate.diskSpaceGb).toBe(4.1);
    expect(vm.resourceEstimate.requiresNetwork).toBe(true);
    expect(vm.risks).toHaveLength(1);
    expect(vm.safety.status).toBe("requiresHumanApproval");
    expect(vm.safety.label).toBe("Requires Human Approval");
    expect(vm._rawPlan).toBe(approvalWorkflowExample.plan);
    expect(vm._rawSafety).toBe(approvalWorkflowExample.safety);
  });

  it("maps plan + blocked safety", () => {
    const vm = toPlanReviewView(
      blockedWorkflowExample.plan,
      blockedWorkflowExample.safety,
    );
    expect(vm.safety.status).toBe("blocked");
    expect(vm.safety.severity).toBe("critical");
    expect(vm.safety.violations).toHaveLength(1);
    expect(vm.safety.violations[0].severity).toBe("critical");
  });

  it("preserves resource estimates including nulls", () => {
    const planNoOptional = {
      ...approvalWorkflowExample.plan,
      resourceEstimate: {
        diskSpaceGb: 2,
        requiresNetwork: false,
      },
    };
    const vm = toPlanReviewView(planNoOptional, approvalWorkflowExample.safety);
    expect(vm.resourceEstimate.peakRamGb).toBeNull();
    expect(vm.resourceEstimate.estimatedDownloadGb).toBeNull();
  });
});

// =========================================================================
// 6. Safety status view
// =========================================================================

describe("toSafetyStatusView", () => {
  it("maps approved safety report", () => {
    const vm = toSafetyStatusView({
      planId: "test",
      violations: [],
      warnings: [],
      approved: true,
      blocked: false,
      requiresHumanApproval: false,
    });
    expect(vm.status).toBe("approved");
    expect(vm.label).toBe("Approved");
    expect(vm.severity).toBe("info");
    expect(vm.violations).toEqual([]);
  });

  it("maps requiresHumanApproval safety report", () => {
    const vm = toSafetyStatusView(approvalWorkflowExample.safety);
    expect(vm.status).toBe("requiresHumanApproval");
    expect(vm.label).toBe("Requires Human Approval");
    expect(vm.severity).toBe("warning");
    expect(vm.violations).toHaveLength(1);
  });

  it("maps blocked safety report", () => {
    const vm = toSafetyStatusView(blockedWorkflowExample.safety);
    expect(vm.status).toBe("blocked");
    expect(vm.label).toBe("Blocked");
    expect(vm.severity).toBe("critical");
    expect(vm.violations).toHaveLength(1);
  });

  it("preserves warnings", () => {
    const vm = toSafetyStatusView(approvalWorkflowExample.safety);
    expect(vm.warnings.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// 7. Workflow result → WorkflowViewModel
// =========================================================================

describe("toWorkflowView", () => {
  it("maps completed workflow", () => {
    const result: WorkflowResult = {
      status: "completed",
      completedStages: STAGE_ORDER.map((stage) => ({
        stage,
        output: {} as never,
      })),
      stageOutputs: {},
    };
    const vm = toWorkflowView(result);
    expect(vm.status).toBe("completed");
    expect(vm.statusLabel).toBe("Completed");
    expect(vm.statusSeverity).toBe("info");
    expect(vm.completedStageNames).toHaveLength(8);
    expect(vm.stages).toHaveLength(8);
    expect(vm.stages.every((s) => s.completed)).toBe(true);
    expect(vm.failedStage).toBeNull();
    expect(vm.error).toBeNull();
    expect(vm.stoppedAfter).toBeNull();
  });

  it("maps completed_requires_approval workflow", () => {
    const vm = toWorkflowView(approvalWorkflowExample.workflow);
    expect(vm.status).toBe("completed_requires_approval");
    expect(vm.statusLabel).toBe("Completed — Requires Approval");
    expect(vm.statusSeverity).toBe("warning");
  });

  it("maps blocked workflow", () => {
    const vm = toWorkflowView(blockedWorkflowExample.workflow);
    expect(vm.status).toBe("blocked");
    expect(vm.statusLabel).toBe("Blocked");
    expect(vm.statusSeverity).toBe("critical");
    // rendering stage should not be completed
    const renderStage = vm.stages.find((s) => s.stage === "rendering");
    expect(renderStage?.completed).toBe(false);
  });

  it("maps failed workflow with error", () => {
    const vm = toWorkflowView(unsupportedExample.workflow);
    expect(vm.status).toBe("failed");
    expect(vm.statusLabel).toBe("Failed");
    expect(vm.statusSeverity).toBe("error");
    expect(vm.failedStage).toBe("target_selection");
    expect(vm.error).toBe("No compatible artifacts found for this host.");
  });

  it("maps partial workflow with stoppedAfter", () => {
    const vm = toWorkflowView(partialWorkflowExample.workflow);
    expect(vm.status).toBe("partial");
    expect(vm.statusLabel).toBe("Partial");
    expect(vm.statusSeverity).toBe("info");
    expect(vm.stoppedAfter).toBe("recommendation");
    // First 3 stages completed, rest not
    expect(vm.stages[0].completed).toBe(true); // catalog_loading
    expect(vm.stages[1].completed).toBe(true); // host_acquisition
    expect(vm.stages[2].completed).toBe(true); // recommendation
    expect(vm.stages[3].completed).toBe(false); // target_selection
  });

  it("stages are always in deterministic STAGE_ORDER", () => {
    for (const example of Object.values(ALL_FRONTEND_EXAMPLES)) {
      const vm = toWorkflowView(example.workflow);
      const stageNames = vm.stages.map((s) => s.stage);
      expect(stageNames).toEqual([...STAGE_ORDER]);
    }
  });

  it("all stages have human-readable labels", () => {
    const result: WorkflowResult = {
      status: "completed",
      completedStages: [],
      stageOutputs: {},
    };
    const vm = toWorkflowView(result);
    for (const stage of vm.stages) {
      expect(stage.label).toBeTruthy();
      expect(typeof stage.label).toBe("string");
      expect(stage.label.length).toBeGreaterThan(0);
    }
  });
});

// =========================================================================
// 8. Blocked vs approval vs completed semantics
// =========================================================================

describe("status semantics", () => {
  it("blocked safety → blocked status, critical severity", () => {
    const vm = toSafetyStatusView(blockedWorkflowExample.safety);
    expect(vm.status).toBe("blocked");
    expect(vm.severity).toBe("critical");
  });

  it("approval safety → requiresHumanApproval status, warning severity", () => {
    const vm = toSafetyStatusView(approvalWorkflowExample.safety);
    expect(vm.status).toBe("requiresHumanApproval");
    expect(vm.severity).toBe("warning");
  });

  it("approved safety → approved status, info severity", () => {
    const vm = toSafetyStatusView({
      planId: "clean",
      violations: [],
      warnings: [],
      approved: true,
      blocked: false,
      requiresHumanApproval: false,
    });
    expect(vm.status).toBe("approved");
    expect(vm.severity).toBe("info");
  });

  it("blocked takes precedence over requiresHumanApproval", () => {
    const report = {
      planId: "both",
      violations: [],
      warnings: [],
      approved: false,
      blocked: true,
      requiresHumanApproval: true,
    };
    const vm = toSafetyStatusView(report);
    expect(vm.status).toBe("blocked");
  });

  it("all compatibility statuses have distinct severity levels", () => {
    const severities = Object.values(COMPATIBILITY_LABELS).map(
      (l) => l.severity,
    );
    // supported=info, limits=warning, cpu_only=warning, unsupported=error
    expect(severities).toContain("info");
    expect(severities).toContain("warning");
    expect(severities).toContain("error");
  });

  it("all workflow statuses have defined labels", () => {
    const statuses: WorkflowViewStatus[] = [
      "completed",
      "completed_requires_approval",
      "blocked",
      "failed",
      "partial",
    ];
    for (const s of statuses) {
      const label = WORKFLOW_STATUS_LABELS[s];
      expect(label.label).toBeTruthy();
      expect(label.severity).toBeTruthy();
      expect(label.summary).toBeTruthy();
    }
  });

  it("all safety statuses have defined labels", () => {
    const statuses: SafetyStatus[] = [
      "approved",
      "requiresHumanApproval",
      "blocked",
    ];
    for (const s of statuses) {
      const label = SAFETY_STATUS_LABELS[s];
      expect(label.label).toBeTruthy();
      expect(label.severity).toBeTruthy();
      expect(label.summary).toBeTruthy();
    }
  });

  it("risk severity covers all risk levels", () => {
    expect(RISK_SEVERITY.safe).toBe("info");
    expect(RISK_SEVERITY.caution).toBe("warning");
    expect(RISK_SEVERITY.dangerous).toBe("error");
    expect(RISK_SEVERITY.blocked).toBe("critical");
  });
});

// =========================================================================
// 9. Deterministic output ordering
// =========================================================================

describe("deterministic output ordering", () => {
  it("recommendation list preserves insertion order", () => {
    const recs = [
      { ...midRangeGpuExample.recommendation, artifactId: "a", score: 100 },
      { ...midRangeGpuExample.recommendation, artifactId: "b", score: 80 },
      { ...midRangeGpuExample.recommendation, artifactId: "c", score: 60 },
    ];
    const list = toRecommendationList(recs);
    expect(list.map((r) => r.artifactId)).toEqual(["a", "b", "c"]);
  });

  it("plan steps preserve order field", () => {
    const vm = toPlanReviewView(
      approvalWorkflowExample.plan,
      approvalWorkflowExample.safety,
    );
    for (let i = 0; i < vm.steps.length; i++) {
      expect(vm.steps[i].order).toBe(i + 1);
    }
  });

  it("workflow stages are always in STAGE_ORDER", () => {
    const vm = toWorkflowView(approvalWorkflowExample.workflow);
    expect(vm.stages.map((s) => s.stage)).toEqual([...STAGE_ORDER]);
  });

  it("completedStageNames match completed stages from input", () => {
    const vm = toWorkflowView(partialWorkflowExample.workflow);
    expect(vm.completedStageNames).toEqual([
      "catalog_loading",
      "host_acquisition",
      "recommendation",
    ]);
  });
});

// =========================================================================
// 10. Normalized error contract
// =========================================================================

describe("normalizeFrontendError", () => {
  it("classifies missing artifact error", () => {
    const err = normalizeFrontendError("No compatible artifact found");
    expect(err.code).toBe("MISSING_ARTIFACT");
    expect(err.message).toBe("No compatible artifact found");
    expect(err.details).toHaveProperty("originalMessage");
  });

  it("classifies artifact not found error", () => {
    const err = normalizeFrontendError(
      new Error('Artifact "xyz" not found in catalog'),
    );
    expect(err.code).toBe("MISSING_ARTIFACT");
  });

  it("classifies missing runtime error", () => {
    const err = normalizeFrontendError("Runtime not installed");
    expect(err.code).toBe("MISSING_RUNTIME");
  });

  it("classifies runtime_missing from backend", () => {
    const err = normalizeFrontendError("Bottleneck: runtime_missing");
    expect(err.code).toBe("MISSING_RUNTIME");
  });

  it("classifies blocked by policy error", () => {
    const err = normalizeFrontendError("Operation blocked by safety policy");
    expect(err.code).toBe("BLOCKED_BY_POLICY");
  });

  it("classifies validation error", () => {
    const err = normalizeFrontendError("Invalid host profile schema");
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("classifies parse error", () => {
    const err = normalizeFrontendError("Failed to parse JSON input");
    expect(err.code).toBe("INVALID_INPUT");
  });

  it("classifies unknown error as INTERNAL_FAILURE", () => {
    const err = normalizeFrontendError("Something completely unexpected");
    expect(err.code).toBe("INTERNAL_FAILURE");
  });

  it("createFrontendError produces correct shape", () => {
    const err = createFrontendError("INVALID_INPUT", "Bad data", {
      field: "host",
    });
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.message).toBe("Bad data");
    expect(err.details).toEqual({ field: "host" });
  });

  it("createFrontendError defaults details to null", () => {
    const err = createFrontendError("INTERNAL_FAILURE", "Oops");
    expect(err.details).toBeNull();
  });
});

// =========================================================================
// 11. Final review state (composite)
// =========================================================================

describe("toFinalReviewState", () => {
  it("maps complete approval scenario", () => {
    const state = toFinalReviewState({
      host: midRangeGpu,
      workflow: approvalWorkflowExample.workflow,
      topRecommendation: approvalWorkflowExample.recommendation,
      compatibility: approvalWorkflowExample.compatibility,
      plan: approvalWorkflowExample.plan,
      safety: approvalWorkflowExample.safety,
    });
    expect(state.host.gpuPresent).toBe(true);
    expect(state.recommendation).not.toBeNull();
    expect(state.recommendation?.compatibility).toBe("supported");
    expect(state.compatibility).not.toBeNull();
    expect(state.compatibility?.status).toBe("supported");
    expect(state.planReview).not.toBeNull();
    expect(state.planReview?.safety.status).toBe("requiresHumanApproval");
    expect(state.workflow.status).toBe("completed_requires_approval");
  });

  it("maps failed/unsupported scenario with nulls", () => {
    const state = toFinalReviewState({
      host: unsupportedWeak,
      workflow: unsupportedExample.workflow,
    });
    expect(state.host.totalRamGb).toBe(2);
    expect(state.recommendation).toBeNull();
    expect(state.compatibility).toBeNull();
    expect(state.planReview).toBeNull();
    expect(state.workflow.status).toBe("failed");
  });

  it("maps partial scenario", () => {
    const state = toFinalReviewState({
      host: midRangeGpu,
      workflow: partialWorkflowExample.workflow,
      topRecommendation: partialWorkflowExample.recommendation,
    });
    expect(state.recommendation).not.toBeNull();
    expect(state.compatibility).toBeNull();
    expect(state.planReview).toBeNull();
    expect(state.workflow.status).toBe("partial");
    expect(state.workflow.stoppedAfter).toBe("recommendation");
  });
});

// =========================================================================
// 12. Status label constants completeness
// =========================================================================

describe("status label constants", () => {
  it("STAGE_LABELS covers all workflow stages", () => {
    for (const stage of STAGE_ORDER) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("COMPATIBILITY_LABELS covers all four statuses", () => {
    const statuses: CompatibilityStatus[] = [
      "supported",
      "supported_with_limits",
      "cpu_only_slow",
      "unsupported",
    ];
    for (const s of statuses) {
      const label = COMPATIBILITY_LABELS[s];
      expect(label.label).toBeTruthy();
      expect(label.severity).toBeTruthy();
      expect(label.summary.length).toBeGreaterThan(10);
    }
  });

  it("WORKFLOW_STATUS_LABELS covers all five statuses", () => {
    const statuses: WorkflowViewStatus[] = [
      "completed",
      "completed_requires_approval",
      "blocked",
      "failed",
      "partial",
    ];
    for (const s of statuses) {
      const label = WORKFLOW_STATUS_LABELS[s];
      expect(label.label).toBeTruthy();
      expect(label.severity).toBeTruthy();
      expect(label.summary.length).toBeGreaterThan(10);
    }
  });

  it("SAFETY_STATUS_LABELS covers all three statuses", () => {
    const statuses: SafetyStatus[] = [
      "approved",
      "requiresHumanApproval",
      "blocked",
    ];
    for (const s of statuses) {
      const label = SAFETY_STATUS_LABELS[s];
      expect(label.label).toBeTruthy();
      expect(label.severity).toBeTruthy();
      expect(label.summary.length).toBeGreaterThan(10);
    }
  });
});

// =========================================================================
// 13. Fixture examples: all 7 scenarios produce valid view-models
// =========================================================================

describe("fixture examples produce valid view-models", () => {
  for (const [name, example] of Object.entries(ALL_FRONTEND_EXAMPLES)) {
    describe(`scenario: ${name}`, () => {
      it("produces valid host summary", () => {
        const vm = toHostSummary(example.host);
        expect(vm.summary).toBeTruthy();
        expect(vm.os).toBeTruthy();
      });

      it("produces valid workflow view", () => {
        const vm = toWorkflowView(example.workflow);
        expect(vm.statusLabel).toBeTruthy();
        expect(vm.stages).toHaveLength(8);
      });

      if (example.recommendation) {
        it("produces valid recommendation item", () => {
          const item = toRecommendationItem(example.recommendation!);
          expect(item.artifactId).toBeTruthy();
          expect(item.compatibilityLabel).toBeTruthy();
        });
      }

      if (example.compatibility) {
        it("produces valid compatibility view", () => {
          const vm = toCompatibilityView(example.compatibility!);
          expect(vm.label).toBeTruthy();
          expect(vm.summaryMessage).toBeTruthy();
        });
      }

      if (example.plan && example.safety) {
        it("produces valid plan review", () => {
          const vm = toPlanReviewView(example.plan!, example.safety!);
          expect(vm.artifactId).toBeTruthy();
          expect(vm.safety.status).toBeTruthy();
        });
      }
    });
  }
});
