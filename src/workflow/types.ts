/**
 * Workflow orchestration types.
 *
 * Defines the explicit staged pipeline model for orchestrating existing
 * backend modules.  This is NOT an execution engine, background job
 * system, multi-agent framework, or UI workflow builder.
 *
 * The workflow layer provides:
 *   - Explicit stages with typed inputs/outputs
 *   - Deterministic stage ordering
 *   - Approval-aware status propagation
 *   - Partial execution (stop after a given stage)
 *   - Reviewable intermediate outputs at each completed stage
 */

import type {
  HostProfile,
  ModelArtifact,
  ModelVariant,
  ModelFamily,
  RuntimeEntry,
  CompatibilityResult,
  ModelRecommendation,
  InstallPlan,
  SafetyReport,
  ExecutionPolicy,
} from "../types/index.js";
import type { CatalogBundle } from "../catalog/bundle.js";
import type { RecommendOptions } from "../compatibility/recommendation-engine.js";
import type { RenderOptions } from "../install-plan/plan-renderer.js";

// ---------------------------------------------------------------------------
// Workflow stages
// ---------------------------------------------------------------------------

/**
 * Ordered stages in the workflow pipeline.
 * Each stage corresponds to a specific backend module invocation.
 */
export type WorkflowStageName =
  | "catalog_loading"
  | "host_acquisition"
  | "recommendation"
  | "target_selection"
  | "compatibility_evaluation"
  | "install_planning"
  | "safety_evaluation"
  | "rendering";

/**
 * Stage execution order.  The runner processes stages in this order.
 */
export const STAGE_ORDER: readonly WorkflowStageName[] = [
  "catalog_loading",
  "host_acquisition",
  "recommendation",
  "target_selection",
  "compatibility_evaluation",
  "install_planning",
  "safety_evaluation",
  "rendering",
] as const;

// ---------------------------------------------------------------------------
// Workflow input
// ---------------------------------------------------------------------------

/**
 * Input to the workflow runner.
 *
 * Both `bundle` and `host` are required because catalog loading and
 * host detection involve I/O that the workflow layer does not own.
 * Pre-loaded values are passed in; the corresponding stages validate
 * and record them as stage results.
 */
export interface WorkflowInput {
  /** Pre-loaded catalog bundle. */
  bundle: CatalogBundle;
  /** Pre-acquired host profile. */
  host: HostProfile;
  /** Specific artifact to target.  Omit for recommendation-based default. */
  artifactId?: string;
  /** Execution policy override (defaults to `defaultExecutionPolicy()`). */
  policy?: ExecutionPolicy;
  /** Recommendation engine options. */
  recommendOptions?: RecommendOptions;
  /** Render options forwarded to `renderPlan`. */
  renderOptions?: RenderOptions;
  /** Stop the workflow after this stage completes (for review/debug). */
  stopAfter?: WorkflowStageName;
}

// ---------------------------------------------------------------------------
// Stage result
// ---------------------------------------------------------------------------

/**
 * Outcome of an individual stage.
 *
 * `ok: true`  — stage completed successfully, `value` holds its output.
 * `ok: false` — stage failed, `error` describes why.
 */
export type StageResult<T = unknown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

// ---------------------------------------------------------------------------
// Per-stage output types
// ---------------------------------------------------------------------------

/** Output of the catalog_loading stage. */
export interface CatalogLoadingOutput {
  bundle: CatalogBundle;
}

/** Output of the host_acquisition stage. */
export interface HostAcquisitionOutput {
  host: HostProfile;
}

/** Output of the recommendation stage. */
export interface RecommendationOutput {
  recommendations: ModelRecommendation[];
}

/** Output of the target_selection stage. */
export interface TargetSelectionOutput {
  artifact: ModelArtifact;
  variant: ModelVariant;
  family: ModelFamily;
  runtime: RuntimeEntry;
  /** How the target was chosen. */
  selectionMethod: "explicit_artifact_id" | "recommendation_default";
  /** Human-readable reasoning for the selection. */
  selectionReason: string;
}

/** Output of the compatibility_evaluation stage. */
export interface CompatibilityEvaluationOutput {
  compatibility: CompatibilityResult;
}

/** Output of the install_planning stage. */
export interface InstallPlanningOutput {
  plan: InstallPlan;
}

/** Output of the safety_evaluation stage. */
export interface SafetyEvaluationOutput {
  safetyReport: SafetyReport;
}

/** Output of the rendering stage. */
export interface RenderingOutput {
  rendered: string;
}

// ---------------------------------------------------------------------------
// Intermediate outputs map
// ---------------------------------------------------------------------------

/**
 * Type-safe map from stage name to its output type.
 */
export interface StageOutputMap {
  catalog_loading: CatalogLoadingOutput;
  host_acquisition: HostAcquisitionOutput;
  recommendation: RecommendationOutput;
  target_selection: TargetSelectionOutput;
  compatibility_evaluation: CompatibilityEvaluationOutput;
  install_planning: InstallPlanningOutput;
  safety_evaluation: SafetyEvaluationOutput;
  rendering: RenderingOutput;
}

// ---------------------------------------------------------------------------
// Workflow status
// ---------------------------------------------------------------------------

/**
 * Terminal status of the workflow.
 *
 * - `completed`                 — all requested stages ran, plan is approved
 * - `completed_requires_approval` — all stages ran but safety requires human approval
 * - `blocked`                   — safety evaluation found blocked violations
 * - `failed`                    — a stage failed due to invalid input or internal error
 * - `partial`                   — stopped early at a requested stage for review
 */
export type WorkflowStatus =
  | "completed"
  | "completed_requires_approval"
  | "blocked"
  | "failed"
  | "partial";

// ---------------------------------------------------------------------------
// Completed stage record
// ---------------------------------------------------------------------------

/**
 * Record of a successfully completed stage, for inclusion in the result.
 */
export interface CompletedStage<N extends WorkflowStageName = WorkflowStageName> {
  readonly stage: N;
  readonly output: StageOutputMap[N];
}

// ---------------------------------------------------------------------------
// Workflow result
// ---------------------------------------------------------------------------

/**
 * Final output of a workflow run.
 *
 * Always includes:
 * - `status`           — terminal workflow status
 * - `completedStages`  — ordered list of stages that completed successfully
 * - `stageOutputs`     — type-safe map of outputs per completed stage
 *
 * When `status === "failed"`:
 * - `failedStage`      — which stage failed
 * - `error`            — human-readable error description
 *
 * When `status === "partial"`:
 * - `stoppedAfter`     — the stage that was the last to run
 */
export interface WorkflowResult {
  /** Terminal status of the workflow. */
  readonly status: WorkflowStatus;
  /** Ordered list of successfully completed stages. */
  readonly completedStages: readonly CompletedStage[];
  /**
   * Type-safe access to outputs of completed stages.
   * Key is the stage name; value is the stage output.
   * Only populated for stages that completed successfully.
   */
  readonly stageOutputs: Partial<Readonly<StageOutputMap>>;
  /** Which stage failed (only set when status is "failed"). */
  readonly failedStage?: WorkflowStageName;
  /** Error description (only set when status is "failed"). */
  readonly error?: string;
  /** Last stage that ran (only set when status is "partial"). */
  readonly stoppedAfter?: WorkflowStageName;
}
