/**
 * Frontend contract / view-model layer.
 *
 * These types are derived from backend outputs and provide stable,
 * UI-friendly shapes for frontend consumption.  They never replace
 * the underlying backend types — they wrap and normalize them.
 */

import type {
  CompatibilityClass,
  CompatibilityResult,
  BottleneckCategory,
  HostProfile,
  InstallPlan,
  ModelArtifact,
  ModelFamily,
  ModelVariant,
  SafetyReport,
} from "../types/index.js";

import type {
  WorkflowResult,
  WorkflowStageName,
  WorkflowStatus,
} from "../workflow/types.js";

// ─── Normalized status enums ────────────────────────────────────────────

/** Compatibility statuses as surfaced to the UI. */
export type CompatibilityStatus =
  | "supported"
  | "supported_with_limits"
  | "cpu_only_slow"
  | "unsupported";

/** Workflow terminal statuses as surfaced to the UI. */
export type WorkflowViewStatus =
  | "completed"
  | "completed_requires_approval"
  | "blocked"
  | "failed"
  | "partial";

/** Safety approval statuses as surfaced to the UI. */
export type SafetyStatus =
  | "approved"
  | "requiresHumanApproval"
  | "blocked";

// ─── Severity ───────────────────────────────────────────────────────────

export type Severity = "info" | "warning" | "error" | "critical";

// ─── Host summary ───────────────────────────────────────────────────────

export interface HostSummaryViewModel {
  /** One-line description of the machine, e.g. "Linux x64 · 32 GB RAM · RTX 3060 12 GB". */
  summary: string;
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number | null;
  totalRamGb: number | null;
  gpuPresent: boolean;
  gpuModel: string | null;
  gpuVramGb: number | null;
  installedRuntimes: string[];
  missingDependencies: string[];
  /** The original backend profile for advanced use. */
  _raw: Readonly<HostProfile>;
}

// ─── Model / artifact list items ────────────────────────────────────────

export interface ArtifactListItem {
  artifactId: string;
  variantId: string;
  familyId: string;
  displayName: string;
  parameterLabel: string;
  quantization: string;
  sizeClass: string;
  fileSizeGb: number | null;
  minimumRamGb: number;
  minimumVramGb: number;
}

// ─── Recommendation items ───────────────────────────────────────────────

export interface RecommendationItem {
  artifactId: string;
  displayName: string;
  score: number;
  compatibility: CompatibilityStatus;
  compatibilityLabel: string;
  compatibilitySeverity: Severity;
  explanations: string[];
  bottlenecks: BottleneckCategory[];
  warnings: string[];
}

// ─── Compatibility view ─────────────────────────────────────────────────

export interface CompatibilityViewModel {
  status: CompatibilityStatus;
  label: string;
  severity: Severity;
  summaryMessage: string;
  bottlenecks: BottleneckCategory[];
  reasons: string[];
  warnings: string[];
  gpuOffloadPossible: boolean;
  estimatedGpuLayers: number | null;
  requiresDiskSwap: boolean;
  effectiveContextWindow: number | null;
  settingsAdjustments: Array<{
    parameter: string;
    suggestedValue: string;
    reason: string;
  }>;
  /** Original backend result. */
  _raw: Readonly<CompatibilityResult>;
}

// ─── Install plan review view ───────────────────────────────────────────

export interface PlanStepView {
  order: number;
  command: string;
  description: string;
  riskLevel: string;
  riskSeverity: Severity;
  requiresApproval: boolean;
  reversible: boolean;
}

export interface PlanReviewViewModel {
  artifactId: string;
  runtimeId: string;
  targetPlatform: string;
  humanSummary: string;
  steps: PlanStepView[];
  prerequisites: Array<{
    name: string;
    checkCommand: string;
    installHint: string;
  }>;
  resourceEstimate: {
    diskSpaceGb: number;
    peakRamGb: number | null;
    requiresNetwork: boolean;
    estimatedDownloadGb: number | null;
  };
  risks: string[];
  safety: SafetyStatusView;
  /** Original backend install plan. */
  _rawPlan: Readonly<InstallPlan>;
  /** Original backend safety report. */
  _rawSafety: Readonly<SafetyReport>;
}

// ─── Safety status view ─────────────────────────────────────────────────

export interface SafetyViolationView {
  stepIndex: number;
  type: string;
  description: string;
  severity: Severity;
}

export interface SafetyStatusView {
  status: SafetyStatus;
  label: string;
  severity: Severity;
  summaryMessage: string;
  violations: SafetyViolationView[];
  warnings: string[];
  /** Original backend safety report. */
  _raw: Readonly<SafetyReport>;
}

// ─── Workflow run summary ───────────────────────────────────────────────

export interface WorkflowStageView {
  stage: WorkflowStageName;
  label: string;
  completed: boolean;
}

export interface WorkflowViewModel {
  status: WorkflowViewStatus;
  statusLabel: string;
  statusSeverity: Severity;
  statusSummary: string;
  completedStageNames: WorkflowStageName[];
  stages: WorkflowStageView[];
  failedStage: WorkflowStageName | null;
  error: string | null;
  stoppedAfter: WorkflowStageName | null;
  /** Original backend workflow result. */
  _raw: Readonly<WorkflowResult>;
}

// ─── Final review state ─────────────────────────────────────────────────

export interface FinalReviewState {
  host: HostSummaryViewModel;
  recommendation: RecommendationItem | null;
  compatibility: CompatibilityViewModel | null;
  planReview: PlanReviewViewModel | null;
  workflow: WorkflowViewModel;
}

// ─── Re-export status types used by the label layer ─────────────────────

export type { CompatibilityClass, WorkflowStatus, BottleneckCategory };
export type { WorkflowStageName };
export type { ModelArtifact, ModelVariant, ModelFamily };
