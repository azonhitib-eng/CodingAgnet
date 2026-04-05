/**
 * High-level public API facade.
 *
 * Provides clean entrypoints for the end-to-end flow:
 *   catalog loading → host detection → recommendation →
 *   compatibility → install planning → safety evaluation → rendering
 *
 * This module adds convenience wrappers and a single-call integration
 * helper.  It does NOT add execution logic — plans are for human review.
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
} from "./types/index.js";

import type { CatalogBundle, CatalogPaths } from "./catalog/bundle.js";
import { loadCatalogBundle, loadCatalogBundleSync } from "./catalog/bundle.js";
import { detectHost, type DetectHostOptions } from "./detection/host-detector.js";
import { checkCompatibility } from "./compatibility/compatibility-engine.js";
import { recommend, type RecommendOptions } from "./compatibility/recommendation-engine.js";
import { generateInstallPlan, type PlannerInput } from "./install-plan/install-planner.js";
import { evaluatePlanSafety, defaultExecutionPolicy } from "./install-plan/safety-evaluator.js";
import { renderPlan, type RenderOptions } from "./install-plan/plan-renderer.js";

// ---------------------------------------------------------------------------
// Re-export all individual pieces for direct usage
// ---------------------------------------------------------------------------

export {
  loadCatalogBundle,
  loadCatalogBundleSync,
  detectHost,
  checkCompatibility,
  recommend,
  generateInstallPlan,
  evaluatePlanSafety,
  defaultExecutionPolicy,
  renderPlan,
};

export type {
  CatalogBundle,
  CatalogPaths,
  DetectHostOptions,
  RecommendOptions,
  PlannerInput,
  RenderOptions,
};

// ---------------------------------------------------------------------------
// Convenience: render plan with safety in one call
// ---------------------------------------------------------------------------

/**
 * Render an install plan together with its safety evaluation.
 *
 * Shorthand for calling `evaluatePlanSafety` + `renderPlan` in sequence.
 *
 * @param plan    - The install plan to render.
 * @param policy  - Execution policy (defaults to `defaultExecutionPolicy()`).
 * @param options - Render options forwarded to `renderPlan`.
 * @returns An object containing the safety report and the rendered text.
 */
export function renderPlanWithSafety(
  plan: InstallPlan,
  policy?: ExecutionPolicy,
  options?: RenderOptions,
): { safetyReport: SafetyReport; rendered: string } {
  const effectivePolicy = policy ?? defaultExecutionPolicy();
  const safetyReport = evaluatePlanSafety(plan, effectivePolicy);
  const rendered = renderPlan(plan, safetyReport, options);
  return { safetyReport, rendered };
}

// ---------------------------------------------------------------------------
// Full-flow integration helper
// ---------------------------------------------------------------------------

/** Input for the full end-to-end flow. */
export interface FullFlowInput {
  /** Loaded catalog bundle (use `loadCatalogBundle` or `loadCatalogBundleSync`). */
  bundle: CatalogBundle;
  /** Detected or mocked host profile. */
  host: HostProfile;
  /** Specific artifact to plan for.  If omitted, uses top recommendation. */
  artifactId?: string;
  /** Execution policy override (defaults to `defaultExecutionPolicy()`). */
  policy?: ExecutionPolicy;
  /** Recommend options (e.g. includeUnsupported). */
  recommendOptions?: RecommendOptions;
  /** Render options forwarded to `renderPlan`. */
  renderOptions?: RenderOptions;
}

/** Output of the full end-to-end flow. */
export interface FullFlowResult {
  recommendations: ModelRecommendation[];
  /** The selected recommendation (top-ranked or by artifactId). */
  selected: {
    artifact: ModelArtifact;
    variant: ModelVariant;
    family: ModelFamily;
    runtime: RuntimeEntry;
    compatibility: CompatibilityResult;
  };
  plan: InstallPlan;
  safetyReport: SafetyReport;
  rendered: string;
}

/**
 * Run the full end-to-end flow in a single call.
 *
 * Steps:
 *   1. Rank all catalog artifacts against the host (`recommend`).
 *   2. Select the target artifact (top-ranked or by `artifactId`).
 *   3. Compute detailed compatibility (`checkCompatibility`).
 *   4. Generate an install plan (`generateInstallPlan`).
 *   5. Evaluate safety (`evaluatePlanSafety`).
 *   6. Render the plan with safety report (`renderPlan`).
 *
 * @throws {Error} If no compatible artifact is found or the requested
 *                 artifactId does not exist in the catalog.
 */
export function runFullFlow(input: FullFlowInput): FullFlowResult {
  const { bundle, host, policy, recommendOptions, renderOptions } = input;

  // 1. Recommend
  const recommendations = recommend(host, bundle, recommendOptions);

  // 2. Select artifact
  let selectedRec: ModelRecommendation | undefined;
  if (input.artifactId) {
    selectedRec = recommendations.find((r) => r.artifactId === input.artifactId);
    if (!selectedRec) {
      // Also try to find it in the full list (including unsupported)
      const allRecs = recommend(host, bundle, { includeUnsupported: true });
      selectedRec = allRecs.find((r) => r.artifactId === input.artifactId);
    }
    if (!selectedRec) {
      throw new Error(`Artifact "${input.artifactId}" not found in catalog.`);
    }
  } else {
    if (recommendations.length === 0) {
      throw new Error("No compatible artifacts found for this host.");
    }
    selectedRec = recommendations[0];
  }

  // 3. Resolve catalog entities
  const artifact = bundle.models.getArtifact(selectedRec.artifactId);
  const variant = bundle.models.getVariant(selectedRec.variantId);
  const family = bundle.models.getFamily(selectedRec.familyId);
  const runtime = bundle.runtimes.get(artifact!.runtimeId);

  if (!artifact || !variant || !family || !runtime) {
    throw new Error(
      `Catalog data inconsistency: could not resolve all entities for artifact "${selectedRec.artifactId}".`,
    );
  }

  // 4. Detailed compatibility (re-use from recommendation)
  const compatibility = selectedRec.compatibility;

  // 5. Generate install plan
  const plannerInput: PlannerInput = {
    host,
    artifact,
    variant,
    runtime,
    compatibility,
  };
  const plan = generateInstallPlan(plannerInput);

  // 6. Safety evaluation
  const effectivePolicy = policy ?? defaultExecutionPolicy();
  const safetyReport = evaluatePlanSafety(plan, effectivePolicy);

  // 7. Render
  const rendered = renderPlan(plan, safetyReport, renderOptions);

  return {
    recommendations,
    selected: { artifact, variant, family, runtime, compatibility },
    plan,
    safetyReport,
    rendered,
  };
}
