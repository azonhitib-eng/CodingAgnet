/**
 * render-plan CLI command.
 *
 * Renders a previously saved install plan JSON with safety evaluation.
 * Wraps `evaluatePlanSafety` and `renderPlan`.
 *
 * The plan file is validated against InstallPlanSchema (Zod) for
 * structural correctness before rendering.
 *
 * Install plans are INFORMATIONAL ONLY — they are NOT executed.
 */

import { readFileSync } from "node:fs";
import type { InstallPlan } from "../../types/install-plan.js";
import type { SafetyReport } from "../../types/safety.js";
import { InstallPlanSchema } from "../../schemas/install-plan.schema.js";
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
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw inputError(`Cannot read plan file: ${args.planPath} (${detail})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw inputError(`Invalid JSON in plan file: ${args.planPath} (${detail})`);
  }

  // Validate against InstallPlanSchema
  const result = InstallPlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw inputError(
      `Plan file schema validation failed (${args.planPath}):\n${issues}`,
    );
  }
  const plan: InstallPlan = result.data as InstallPlan;

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
