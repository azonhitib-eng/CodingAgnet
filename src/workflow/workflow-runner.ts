/**
 * Deterministic workflow runner.
 *
 * Orchestrates existing backend modules in an explicit staged pipeline.
 * The runner:
 *   - Accepts pre-loaded inputs (bundle + host)
 *   - Executes stages in order
 *   - Stops on failure, blocked state, or a requested stop-after stage
 *   - Preserves all intermediate outputs
 *   - Surfaces approval/blocked semantics explicitly
 *
 * This is NOT an execution engine.  Install plans are never executed.
 */

import type {
  ModelRecommendation,
  ExecutionPolicy,
} from "../types/index.js";
import { recommend } from "../compatibility/recommendation-engine.js";
import { checkCompatibility } from "../compatibility/compatibility-engine.js";
import { generateInstallPlan, type PlannerInput } from "../install-plan/install-planner.js";
import { evaluatePlanSafety, defaultExecutionPolicy } from "../install-plan/safety-evaluator.js";
import { renderPlan } from "../install-plan/plan-renderer.js";

import type {
  WorkflowInput,
  WorkflowResult,
  WorkflowStageName,
  StageOutputMap,
  CompletedStage,
  CatalogLoadingOutput,
  HostAcquisitionOutput,
  RecommendationOutput,
  TargetSelectionOutput,
  CompatibilityEvaluationOutput,
  InstallPlanningOutput,
  SafetyEvaluationOutput,
  RenderingOutput,
  WorkflowStatus,
} from "./types.js";
import { STAGE_ORDER } from "./types.js";

// ---------------------------------------------------------------------------
// Internal context accumulated during the run
// ---------------------------------------------------------------------------

interface RunContext {
  input: WorkflowInput;
  completedStages: CompletedStage[];
  stageOutputs: Partial<StageOutputMap>;
}

// ---------------------------------------------------------------------------
// Stage implementations
// ---------------------------------------------------------------------------

function runCatalogLoading(ctx: RunContext): CatalogLoadingOutput {
  // Bundle is pre-loaded; this stage validates and records it.
  const { bundle } = ctx.input;
  if (!bundle) {
    throw new Error("Workflow input missing required field: bundle");
  }
  return { bundle };
}

function runHostAcquisition(ctx: RunContext): HostAcquisitionOutput {
  const { host } = ctx.input;
  if (!host) {
    throw new Error("Workflow input missing required field: host");
  }
  return { host };
}

function runRecommendation(ctx: RunContext): RecommendationOutput {
  const catalogOut = ctx.stageOutputs.catalog_loading;
  const hostOut = ctx.stageOutputs.host_acquisition;
  if (!catalogOut || !hostOut) {
    throw new Error("Recommendation stage requires catalog_loading and host_acquisition outputs");
  }

  const recommendations = recommend(
    hostOut.host,
    catalogOut.bundle,
    ctx.input.recommendOptions,
  );
  return { recommendations };
}

function runTargetSelection(ctx: RunContext): TargetSelectionOutput {
  const catalogOut = ctx.stageOutputs.catalog_loading;
  const recOut = ctx.stageOutputs.recommendation;
  if (!catalogOut || !recOut) {
    throw new Error("Target selection stage requires catalog_loading and recommendation outputs");
  }

  const { bundle } = catalogOut;
  const { recommendations } = recOut;
  const { artifactId } = ctx.input;

  let selected: ModelRecommendation | undefined;
  let selectionMethod: TargetSelectionOutput["selectionMethod"];
  let selectionReason: string;

  if (artifactId) {
    // Explicit artifact selection
    selected = recommendations.find((r) => r.artifactId === artifactId);
    if (!selected) {
      // Try including unsupported
      const allRecs = recommend(
        ctx.stageOutputs.host_acquisition!.host,
        bundle,
        { includeUnsupported: true },
      );
      selected = allRecs.find((r) => r.artifactId === artifactId);
    }
    if (!selected) {
      throw new Error(`Artifact "${artifactId}" not found in catalog.`);
    }
    selectionMethod = "explicit_artifact_id";
    selectionReason = `Explicitly requested artifact "${artifactId}" (score: ${selected.score}, class: ${selected.compatibility.classification}).`;
  } else {
    // Recommendation-based default
    if (recommendations.length === 0) {
      throw new Error("No compatible artifacts found for this host.");
    }
    selected = recommendations[0];
    selectionMethod = "recommendation_default";
    selectionReason =
      `Automatically selected top recommendation "${selected.artifactId}"` +
      ` (score: ${selected.score}, class: ${selected.compatibility.classification}).` +
      ` ${recommendations.length} candidate(s) evaluated.`;
  }

  // Resolve full catalog entities
  const artifact = bundle.models.getArtifact(selected.artifactId);
  const variant = bundle.models.getVariant(selected.variantId);
  const family = bundle.models.getFamily(selected.familyId);
  const runtime = bundle.runtimes.get(artifact!.runtimeId);

  if (!artifact || !variant || !family || !runtime) {
    throw new Error(
      `Catalog data inconsistency: could not resolve all entities for artifact "${selected.artifactId}".`,
    );
  }

  return { artifact, variant, family, runtime, selectionMethod, selectionReason };
}

function runCompatibilityEvaluation(ctx: RunContext): CompatibilityEvaluationOutput {
  const hostOut = ctx.stageOutputs.host_acquisition;
  const targetOut = ctx.stageOutputs.target_selection;
  const catalogOut = ctx.stageOutputs.catalog_loading;
  if (!hostOut || !targetOut || !catalogOut) {
    throw new Error("Compatibility evaluation requires host_acquisition, target_selection, and catalog_loading outputs");
  }

  const { artifact, variant, family, runtime } = targetOut;
  const { host } = hostOut;
  const installedRuntimeIds = new Set(
    host.installedRuntimes.map((r) => r.runtimeId),
  );

  const compatibility = checkCompatibility(host, artifact, {
    variant,
    family,
    runtime,
    runtimeInstalled: installedRuntimeIds.has(artifact.runtimeId),
  });

  return { compatibility };
}

function runInstallPlanning(ctx: RunContext): InstallPlanningOutput {
  const hostOut = ctx.stageOutputs.host_acquisition;
  const targetOut = ctx.stageOutputs.target_selection;
  const compatOut = ctx.stageOutputs.compatibility_evaluation;
  if (!hostOut || !targetOut || !compatOut) {
    throw new Error("Install planning requires host_acquisition, target_selection, and compatibility_evaluation outputs");
  }

  const plannerInput: PlannerInput = {
    host: hostOut.host,
    artifact: targetOut.artifact,
    variant: targetOut.variant,
    runtime: targetOut.runtime,
    compatibility: compatOut.compatibility,
  };
  const plan = generateInstallPlan(plannerInput);
  return { plan };
}

function runSafetyEvaluation(ctx: RunContext): SafetyEvaluationOutput {
  const planOut = ctx.stageOutputs.install_planning;
  if (!planOut) {
    throw new Error("Safety evaluation requires install_planning output");
  }
  const policy: ExecutionPolicy = ctx.input.policy ?? defaultExecutionPolicy();
  const safetyReport = evaluatePlanSafety(planOut.plan, policy);
  return { safetyReport };
}

function runRendering(ctx: RunContext): RenderingOutput {
  const planOut = ctx.stageOutputs.install_planning;
  const safetyOut = ctx.stageOutputs.safety_evaluation;
  if (!planOut || !safetyOut) {
    throw new Error("Rendering requires install_planning and safety_evaluation outputs");
  }
  const rendered = renderPlan(planOut.plan, safetyOut.safetyReport, ctx.input.renderOptions);
  return { rendered };
}

// ---------------------------------------------------------------------------
// Stage dispatch
// ---------------------------------------------------------------------------

type StageFn = (ctx: RunContext) => StageOutputMap[WorkflowStageName];

const STAGE_HANDLERS: Record<WorkflowStageName, StageFn> = {
  catalog_loading: runCatalogLoading as StageFn,
  host_acquisition: runHostAcquisition as StageFn,
  recommendation: runRecommendation as StageFn,
  target_selection: runTargetSelection as StageFn,
  compatibility_evaluation: runCompatibilityEvaluation as StageFn,
  install_planning: runInstallPlanning as StageFn,
  safety_evaluation: runSafetyEvaluation as StageFn,
  rendering: runRendering as StageFn,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the workflow pipeline.
 *
 * Executes stages in order from `catalog_loading` through `rendering`.
 * Stops when:
 *   - A stage fails (returns `status: "failed"`)
 *   - The `stopAfter` stage is reached (returns `status: "partial"`)
 *   - All stages complete (returns approval-aware terminal status)
 *
 * @param input - Workflow input with pre-loaded bundle and host.
 * @returns WorkflowResult with status, completed stages, and all intermediate outputs.
 */
export function runWorkflow(input: WorkflowInput): WorkflowResult {
  const ctx: RunContext = {
    input,
    completedStages: [],
    stageOutputs: {},
  };

  const stopAfterIndex = input.stopAfter
    ? STAGE_ORDER.indexOf(input.stopAfter)
    : STAGE_ORDER.length - 1;

  if (input.stopAfter && stopAfterIndex === -1) {
    return {
      status: "failed",
      completedStages: [],
      stageOutputs: {},
      failedStage: undefined,
      error: `Unknown stage name: "${input.stopAfter}"`,
    };
  }

  for (let i = 0; i <= stopAfterIndex; i++) {
    const stageName = STAGE_ORDER[i];
    const handler = STAGE_HANDLERS[stageName];

    try {
      const output = handler(ctx);

      // Record the completed stage
      const completed: CompletedStage = { stage: stageName, output };
      ctx.completedStages.push(completed);
      (ctx.stageOutputs as Record<string, unknown>)[stageName] = output;

      // Check for early termination after safety_evaluation
      if (stageName === "safety_evaluation") {
        const safetyOut = output as SafetyEvaluationOutput;
        if (safetyOut.safetyReport.blocked) {
          // If stopped at safety_evaluation due to stopAfter, still surface blocked
          return buildResult(ctx, "blocked");
        }
      }
    } catch (err) {
      return {
        status: "failed",
        completedStages: ctx.completedStages,
        stageOutputs: { ...ctx.stageOutputs },
        failedStage: stageName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Determine terminal status
  const isPartial = stopAfterIndex < STAGE_ORDER.length - 1;
  if (isPartial) {
    return buildResult(ctx, "partial", STAGE_ORDER[stopAfterIndex]);
  }

  // Full run — determine approval status from safety report
  const safetyOut = ctx.stageOutputs.safety_evaluation;
  if (safetyOut) {
    if (safetyOut.safetyReport.blocked) {
      return buildResult(ctx, "blocked");
    }
    if (safetyOut.safetyReport.requiresHumanApproval) {
      return buildResult(ctx, "completed_requires_approval");
    }
  }

  return buildResult(ctx, "completed");
}

// ---------------------------------------------------------------------------
// Result builder
// ---------------------------------------------------------------------------

function buildResult(
  ctx: RunContext,
  status: WorkflowStatus,
  stoppedAfter?: WorkflowStageName,
): WorkflowResult {
  return {
    status,
    completedStages: ctx.completedStages,
    stageOutputs: { ...ctx.stageOutputs },
    ...(stoppedAfter !== undefined ? { stoppedAfter } : {}),
  };
}
