/**
 * Thin bridge between the app shell and the real backend workflow.
 *
 * This module:
 *   - Loads catalog data from a data directory
 *   - Loads and validates host profiles from JSON files
 *   - Invokes the workflow runner with real inputs
 *   - Maps workflow results to frontend-contract view-models
 *   - Normalizes errors using the frontend-contract error layer
 *
 * It does NOT duplicate any backend logic — it composes existing modules.
 * It does NOT execute any install plans.
 */

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadCatalogBundleSync, type CatalogPaths } from "../catalog/bundle.js";
import type { CatalogBundle } from "../catalog/bundle.js";
import { runWorkflow } from "../workflow/workflow-runner.js";
import type { WorkflowInput, WorkflowStageName, WorkflowResult } from "../workflow/types.js";
import { STAGE_ORDER } from "../workflow/types.js";
import { validateHostProfile } from "../cli/host-loader.js";
import { normalizeFrontendError, type FrontendError } from "../frontend-contracts/errors.js";
import {
  toHostSummary,
  toRecommendationItem,
  toCompatibilityView,
  toPlanReviewView,
  toWorkflowView,
} from "../frontend-contracts/index.js";
import type { ScenarioViewModel } from "./data-provider.js";
import type { HostSource } from "./data-provider.js";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** Input for a real workflow run through the shell. */
export interface RealWorkflowInput {
  /** Path to the data directory containing models/, runtimes/, agent-tools/. */
  dataDir: string;
  /**
   * Path to a host profile JSON file.
   * Required unless `hostProfile` is provided.
   */
  hostFile?: string;
  /**
   * Inline host profile object (e.g. from live detection).
   * If provided, `hostFile` is not required.
   */
  hostProfile?: import("../types/host.js").HostProfile;
  /** Optional: specific artifact to target. */
  artifactId?: string;
  /** Optional: stop workflow after this stage. */
  stopAfter?: string;
}

/** Successful result of a real workflow run. */
export interface RealWorkflowResult {
  ok: true;
  /** The mapped view-model suitable for rendering. */
  viewModel: ScenarioViewModel;
  /** Raw workflow result for advanced consumers. */
  rawResult: WorkflowResult;
}

/** Failed result of a real workflow run. */
export interface RealWorkflowError {
  ok: false;
  error: FrontendError;
}

/** Union result type. */
export type RealWorkflowResponse = RealWorkflowResult | RealWorkflowError;

/** Validation result for individual inputs. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a data directory exists and contains the expected
 * subdirectories (models/, runtimes/, agent-tools/).
 */
export function validateDataDir(dataDir: string): ValidationResult {
  const resolved = resolve(dataDir);
  if (!existsSync(resolved)) {
    return { valid: false, error: `Data directory does not exist: ${resolved}` };
  }
  if (!statSync(resolved).isDirectory()) {
    return { valid: false, error: `Path is not a directory: ${resolved}` };
  }
  const required = ["models", "runtimes", "agent-tools"];
  const missing = required.filter((sub) => {
    const p = join(resolved, sub);
    return !existsSync(p) || !statSync(p).isDirectory();
  });
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Data directory missing required subdirectories: ${missing.join(", ")} (in ${resolved})`,
    };
  }
  return { valid: true };
}

/**
 * Validate that a host file exists and is valid JSON conforming to
 * the HostProfile schema.
 */
export function validateHostFile(hostFile: string): ValidationResult {
  const resolved = resolve(hostFile);
  if (!existsSync(resolved)) {
    return { valid: false, error: `Host file does not exist: ${resolved}` };
  }
  try {
    const raw = readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw);
    validateHostProfile(parsed);
    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid host file: ${msg}` };
  }
}

/**
 * Validate that a stopAfter stage name is valid.
 */
export function validateStopAfter(stage: string): ValidationResult {
  if (STAGE_ORDER.includes(stage as WorkflowStageName)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid stage name: "${stage}". Valid stages: ${STAGE_ORDER.join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// Workflow execution
// ---------------------------------------------------------------------------

/**
 * Run the real backend workflow with the given inputs.
 *
 * This function:
 *   1. Validates and resolves all inputs
 *   2. Loads the catalog bundle from the data directory
 *   3. Loads the host profile from the host file
 *   4. Invokes the workflow runner
 *   5. Maps the result to a ScenarioViewModel
 *
 * Returns a discriminated union — either a successful result or
 * a normalized frontend error.
 */
export function executeRealWorkflow(input: RealWorkflowInput): RealWorkflowResponse {
  try {
    // 1. Validate data directory
    const dataDirCheck = validateDataDir(input.dataDir);
    if (!dataDirCheck.valid) {
      return {
        ok: false,
        error: normalizeFrontendError(dataDirCheck.error!),
      };
    }

    // 2. Determine host source and load host profile
    let host: import("../types/host.js").HostProfile;
    let hostSource: HostSource;

    if (input.hostProfile) {
      // Inline host profile (e.g. from live detection)
      host = validateHostProfile(input.hostProfile);
      hostSource = "detected";
    } else if (input.hostFile) {
      // Load from file
      const hostFileCheck = validateHostFile(input.hostFile);
      if (!hostFileCheck.valid) {
        return {
          ok: false,
          error: normalizeFrontendError(hostFileCheck.error!),
        };
      }
      const hostRaw = readFileSync(resolve(input.hostFile), "utf-8");
      host = validateHostProfile(JSON.parse(hostRaw));
      hostSource = "file";
    } else {
      return {
        ok: false,
        error: normalizeFrontendError("Missing required input: provide either hostFile or hostProfile"),
      };
    }

    // 3. Validate optional stopAfter
    if (input.stopAfter) {
      const stopCheck = validateStopAfter(input.stopAfter);
      if (!stopCheck.valid) {
        return {
          ok: false,
          error: normalizeFrontendError(stopCheck.error!),
        };
      }
    }

    // 4. Load catalog bundle
    const resolved = resolve(input.dataDir);
    const paths: CatalogPaths = {
      models: join(resolved, "models"),
      runtimes: join(resolved, "runtimes"),
      agentTools: join(resolved, "agent-tools"),
    };
    const bundle: CatalogBundle = loadCatalogBundleSync(paths);

    // 5. Build workflow input
    const workflowInput: WorkflowInput = {
      bundle,
      host,
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      ...(input.stopAfter ? { stopAfter: input.stopAfter as WorkflowStageName } : {}),
    };

    // 6. Run workflow
    const result = runWorkflow(workflowInput);

    // 7. Map to view-model
    const viewModel = mapWorkflowResultToViewModel(result, host, hostSource);

    return { ok: true, viewModel, rawResult: result };
  } catch (err) {
    return {
      ok: false,
      error: normalizeFrontendError(err instanceof Error ? err : String(err)),
    };
  }
}

// ---------------------------------------------------------------------------
// View-model mapping from real workflow results
// ---------------------------------------------------------------------------

/**
 * Map a real WorkflowResult (with full stage outputs) to a ScenarioViewModel.
 *
 * Unlike demo scenarios, real workflow results carry actual intermediate
 * outputs in `stageOutputs`, so we extract them for the view-model.
 */
function mapWorkflowResultToViewModel(
  result: WorkflowResult,
  host: import("../types/host.js").HostProfile,
  hostSource: HostSource = "file",
): ScenarioViewModel {
  const outputs = result.stageOutputs;

  // Extract recommendation (top one if available)
  const topRec = outputs.recommendation?.recommendations?.[0] ?? null;

  // Extract compatibility
  const compat = outputs.compatibility_evaluation?.compatibility ?? null;

  // Extract plan + safety for plan review
  const plan = outputs.install_planning?.plan ?? null;
  const safety = outputs.safety_evaluation?.safetyReport ?? null;

  return {
    id: "_real_workflow",
    label: "Real Workflow Run",
    description: `Live workflow execution — status: ${result.status}`,
    host: toHostSummary(host),
    hostSource,
    recommendation: topRec ? toRecommendationItem(topRec) : null,
    compatibility: compat ? toCompatibilityView(compat) : null,
    planReview: plan && safety ? toPlanReviewView(plan, safety) : null,
    workflow: toWorkflowView(result),
  };
}

/** Available stage names for UI display. */
export function getStageNames(): readonly string[] {
  return STAGE_ORDER;
}
