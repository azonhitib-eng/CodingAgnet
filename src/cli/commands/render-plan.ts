/**
 * render-plan CLI command (optional / trivial).
 *
 * Renders a previously saved install plan JSON with safety evaluation.
 * Wraps `evaluatePlanSafety` and `renderPlan`.
 *
 * Install plans are INFORMATIONAL ONLY — they are NOT executed.
 */

import { readFileSync } from "node:fs";
import type { InstallPlan } from "../../types/install-plan.js";
import type { SafetyReport } from "../../types/safety.js";
import { evaluatePlanSafety, defaultExecutionPolicy } from "../../install-plan/safety-evaluator.js";
import { renderPlan } from "../../install-plan/plan-renderer.js";
import { printOutput } from "../format.js";
import { inputError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderPlanArgs {
  planPath: string;
  json: boolean;
  writer?: (msg: string) => void;
}

export interface RenderPlanResult {
  plan: InstallPlan;
  safetyReport: SafetyReport;
  rendered: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runRenderPlan(args: RenderPlanArgs): RenderPlanResult {
  // Load plan from file
  let raw: string;
  try {
    raw = readFileSync(args.planPath, "utf-8");
  } catch {
    throw inputError(`Cannot read plan file: ${args.planPath}`);
  }

  let plan: InstallPlan;
  try {
    plan = JSON.parse(raw) as InstallPlan;
  } catch {
    throw inputError(`Invalid JSON in plan file: ${args.planPath}`);
  }

  // Validate minimal shape
  if (!plan.artifactId || !plan.steps || !Array.isArray(plan.steps)) {
    throw inputError("Plan file is missing required fields (artifactId, steps).");
  }

  // Safety evaluation
  const policy = defaultExecutionPolicy();
  const safetyReport = evaluatePlanSafety(plan, policy);

  // Render
  const rendered = renderPlan(plan, safetyReport);

  // Output
  if (args.json) {
    printOutput({ plan, safetyReport }, true, args.writer);
  } else {
    const header = [
      "=== Rendered Plan (INFORMATIONAL ONLY — NOT EXECUTED) ===",
      "",
      `Safety Status: ${safetyReport.blocked ? "BLOCKED" : safetyReport.requiresHumanApproval ? "REQUIRES HUMAN APPROVAL" : "APPROVED"}`,
      "",
    ].join("\n");
    printOutput(header + rendered, false, args.writer);
  }

  return { plan, safetyReport, rendered };
}
