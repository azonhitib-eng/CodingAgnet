/**
 * plan-install CLI command.
 *
 * Generates an install plan for a model artifact on a host.
 * Wraps `generateInstallPlan`, `evaluatePlanSafety`, and `renderPlan`.
 *
 * Install plans are INFORMATIONAL ONLY — they are NOT executed.
 */

import type { CatalogBundle } from "../../catalog/bundle.js";
import type { HostProfile } from "../../types/host.js";
import type { InstallPlan, SafetyReport } from "../../types/index.js";
import { checkCompatibility } from "../../compatibility/compatibility-engine.js";
import { generateInstallPlan } from "../../install-plan/install-planner.js";
import { evaluatePlanSafety, defaultExecutionPolicy } from "../../install-plan/safety-evaluator.js";
import { renderPlan } from "../../install-plan/plan-renderer.js";
import { printOutput } from "../format.js";
import { inputError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanInstallArgs {
  bundle: CatalogBundle;
  host: HostProfile;
  artifactId: string;
  json: boolean;
  writer?: (msg: string) => void;
}

export interface PlanInstallResult {
  plan: InstallPlan;
  safetyReport: SafetyReport;
  rendered: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runPlanInstall(args: PlanInstallArgs): PlanInstallResult {
  const { bundle, host, artifactId } = args;

  // Resolve catalog entities
  const artifact = bundle.models.getArtifact(artifactId);
  if (!artifact) {
    throw inputError(`Artifact "${artifactId}" not found in catalog.`);
  }

  const variant = bundle.models.getVariant(artifact.variantId);
  if (!variant) {
    throw inputError(`Variant "${artifact.variantId}" not found in catalog.`);
  }

  const family = bundle.models.getFamily(variant.familyId);
  if (!family) {
    throw inputError(`Family "${variant.familyId}" not found in catalog.`);
  }

  const runtime = bundle.runtimes.get(artifact.runtimeId);
  if (!runtime) {
    throw inputError(`Runtime "${artifact.runtimeId}" not found in catalog.`);
  }

  const runtimeInstalled = host.installedRuntimes.some(
    (r) => r.runtimeId === artifact.runtimeId,
  );

  // Compatibility
  const compatibility = checkCompatibility(host, artifact, {
    variant,
    family,
    runtime,
    runtimeInstalled,
  });

  // Plan
  const plan = generateInstallPlan({
    host,
    artifact,
    variant,
    runtime,
    compatibility,
  });

  // Safety
  const policy = defaultExecutionPolicy();
  const safetyReport = evaluatePlanSafety(plan, policy);

  // Render
  const rendered = renderPlan(plan, safetyReport);

  // Output
  if (args.json) {
    printOutput({ plan, safetyReport }, true, args.writer);
  } else {
    const header = [
      "=== Install Plan (INFORMATIONAL ONLY — NOT EXECUTED) ===",
      "",
      `Safety Status: ${safetyReport.blocked ? "BLOCKED" : safetyReport.requiresHumanApproval ? "REQUIRES HUMAN APPROVAL" : "APPROVED"}`,
      "",
    ].join("\n");
    printOutput(header + rendered, false, args.writer);
  }

  return { plan, safetyReport, rendered };
}
