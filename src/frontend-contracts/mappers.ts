/**
 * Transformation layer: backend outputs → frontend view-models.
 *
 * Each mapper is a thin, deterministic, pure function.  No side-effects,
 * no business logic duplication — just shape conversion + label injection.
 */

import type {
  CompatibilityResult,
  HostProfile,
  InstallPlan,
  ModelArtifact,
  ModelFamily,
  ModelRecommendation,
  ModelVariant,
  SafetyReport,
} from "../types/index.js";

import type { WorkflowResult } from "../workflow/types.js";
import { STAGE_ORDER } from "../workflow/types.js";

import type {
  ArtifactListItem,
  CompatibilityViewModel,
  FinalReviewState,
  HostSummaryViewModel,
  PlanReviewViewModel,
  PlanStepView,
  RecommendationItem,
  SafetyStatus,
  SafetyStatusView,
  SafetyViolationView,
  WorkflowStageView,
  WorkflowViewModel,
} from "./types.js";

import {
  COMPATIBILITY_LABELS,
  RISK_SEVERITY,
  SAFETY_STATUS_LABELS,
  STAGE_LABELS,
  WORKFLOW_STATUS_LABELS,
} from "./status-labels.js";

// ─── Host profile → HostSummaryViewModel ────────────────────────────────

export function toHostSummary(host: HostProfile): HostSummaryViewModel {
  const os = host.os.platform.value ?? "Unknown OS";
  const arch = host.os.arch.value ?? "unknown";
  const cpuModel = host.cpu.model.value ?? "Unknown CPU";
  const cpuCores = host.cpu.cores.value ?? null;
  const totalRamGb = host.memory.totalGb.value ?? null;
  const gpuPresent = host.gpu?.present.value === true;
  const gpuModel = host.gpu?.model.value ?? null;
  const gpuVramGb = host.gpu?.vramGb.value ?? null;
  const installedRuntimes = host.installedRuntimes.map((r) => r.runtimeId);

  const parts: string[] = [];
  parts.push(`${os} ${arch}`);
  if (totalRamGb !== null) parts.push(`${totalRamGb} GB RAM`);
  if (gpuPresent && gpuModel) {
    const vramPart = gpuVramGb !== null ? ` ${gpuVramGb} GB` : "";
    parts.push(`${gpuModel}${vramPart}`);
  } else {
    parts.push("No GPU");
  }

  return {
    summary: parts.join(" · "),
    os,
    arch,
    cpuModel,
    cpuCores,
    totalRamGb,
    gpuPresent,
    gpuModel,
    gpuVramGb,
    installedRuntimes,
    missingDependencies: [...host.missingDependencies],
    _raw: host,
  };
}

// ─── ModelArtifact + metadata → ArtifactListItem ────────────────────────

export function toArtifactListItem(
  artifact: ModelArtifact,
  variant: ModelVariant,
  family: ModelFamily,
): ArtifactListItem {
  return {
    artifactId: artifact.id,
    variantId: variant.id,
    familyId: family.id,
    displayName: `${family.displayName} ${variant.displayName}`,
    parameterLabel: variant.parameterLabel,
    quantization: artifact.quantization,
    sizeClass: variant.sizeClass,
    fileSizeGb: artifact.fileSizeGb ?? null,
    minimumRamGb: artifact.minimumRamGb,
    minimumVramGb: artifact.minimumVramGb,
  };
}

// ─── CompatibilityResult → CompatibilityViewModel ───────────────────────

export function toCompatibilityView(
  result: CompatibilityResult,
): CompatibilityViewModel {
  const label = COMPATIBILITY_LABELS[result.classification];
  return {
    status: result.classification,
    label: label.label,
    severity: label.severity,
    summaryMessage: label.summary,
    bottlenecks: [...result.bottlenecks],
    reasons: [...result.reasons],
    warnings: [...result.warnings],
    gpuOffloadPossible: result.limits.gpuOffloadPossible,
    estimatedGpuLayers: result.limits.estimatedGpuLayers ?? null,
    requiresDiskSwap: result.limits.requiresDiskSwap,
    effectiveContextWindow: result.limits.effectiveContextWindow ?? null,
    settingsAdjustments: result.settingsAdjustments.map((a) => ({
      parameter: a.parameter,
      suggestedValue: a.suggestedValue,
      reason: a.reason,
    })),
    _raw: result,
  };
}

// ─── ModelRecommendation → RecommendationItem ───────────────────────────

export function toRecommendationItem(
  rec: ModelRecommendation,
): RecommendationItem {
  const label = COMPATIBILITY_LABELS[rec.compatibility.classification];
  return {
    artifactId: rec.artifactId,
    displayName: rec.displayName,
    score: rec.score,
    compatibility: rec.compatibility.classification,
    compatibilityLabel: label.label,
    compatibilitySeverity: label.severity,
    explanations: [...rec.explanations],
    bottlenecks: [...rec.compatibility.bottlenecks],
    warnings: [...rec.compatibility.warnings],
  };
}

/**
 * Map a list of recommendations to RecommendationItems,
 * preserving the backend ordering (best-first).
 */
export function toRecommendationList(
  recs: readonly ModelRecommendation[],
): RecommendationItem[] {
  return recs.map(toRecommendationItem);
}

// ─── SafetyReport → SafetyStatusView ────────────────────────────────────

function deriveSafetyStatus(report: SafetyReport): SafetyStatus {
  if (report.blocked) return "blocked";
  if (report.requiresHumanApproval) return "requiresHumanApproval";
  return "approved";
}

export function toSafetyStatusView(report: SafetyReport): SafetyStatusView {
  const status = deriveSafetyStatus(report);
  const label = SAFETY_STATUS_LABELS[status];

  const violations: SafetyViolationView[] = report.violations.map((v) => ({
    stepIndex: v.stepIndex,
    type: v.type,
    description: v.description,
    severity: RISK_SEVERITY[v.severity],
  }));

  return {
    status,
    label: label.label,
    severity: label.severity,
    summaryMessage: label.summary,
    violations,
    warnings: [...report.warnings],
    _raw: report,
  };
}

// ─── InstallPlan + SafetyReport → PlanReviewViewModel ───────────────────

export function toPlanReviewView(
  plan: InstallPlan,
  safety: SafetyReport,
): PlanReviewViewModel {
  const steps: PlanStepView[] = plan.steps.map((s) => ({
    order: s.order,
    command: s.command,
    description: s.description,
    riskLevel: s.riskLevel,
    riskSeverity: RISK_SEVERITY[s.riskLevel],
    requiresApproval: s.requiresApproval,
    reversible: s.reversible,
  }));

  return {
    artifactId: plan.artifactId,
    runtimeId: plan.runtimeId,
    targetPlatform: plan.targetPlatform,
    humanSummary: plan.humanSummary,
    steps,
    prerequisites: plan.prerequisites.map((p) => ({
      name: p.name,
      checkCommand: p.checkCommand,
      installHint: p.installHint,
    })),
    resourceEstimate: {
      diskSpaceGb: plan.resourceEstimate.diskSpaceGb,
      peakRamGb: plan.resourceEstimate.peakRamGb ?? null,
      requiresNetwork: plan.resourceEstimate.requiresNetwork,
      estimatedDownloadGb: plan.resourceEstimate.estimatedDownloadGb ?? null,
    },
    risks: [...plan.risks],
    safety: toSafetyStatusView(safety),
    _rawPlan: plan,
    _rawSafety: safety,
  };
}

// ─── WorkflowResult → WorkflowViewModel ─────────────────────────────────

export function toWorkflowView(result: WorkflowResult): WorkflowViewModel {
  const label = WORKFLOW_STATUS_LABELS[result.status];
  const completedSet = new Set(
    result.completedStages.map((s) => s.stage),
  );

  const stages: WorkflowStageView[] = STAGE_ORDER.map((name) => ({
    stage: name,
    label: STAGE_LABELS[name],
    completed: completedSet.has(name),
  }));

  return {
    status: result.status,
    statusLabel: label.label,
    statusSeverity: label.severity,
    statusSummary: label.summary,
    completedStageNames: [...completedSet],
    stages,
    failedStage: result.failedStage ?? null,
    error: result.error ?? null,
    stoppedAfter: result.stoppedAfter ?? null,
    _raw: result,
  };
}

// ─── Composite: FinalReviewState ────────────────────────────────────────

export interface FinalReviewInput {
  host: HostProfile;
  workflow: WorkflowResult;
  topRecommendation?: ModelRecommendation;
  compatibility?: CompatibilityResult;
  plan?: InstallPlan;
  safety?: SafetyReport;
}

export function toFinalReviewState(
  input: FinalReviewInput,
): FinalReviewState {
  return {
    host: toHostSummary(input.host),
    recommendation: input.topRecommendation
      ? toRecommendationItem(input.topRecommendation)
      : null,
    compatibility: input.compatibility
      ? toCompatibilityView(input.compatibility)
      : null,
    planReview:
      input.plan && input.safety
        ? toPlanReviewView(input.plan, input.safety)
        : null,
    workflow: toWorkflowView(input.workflow),
  };
}
