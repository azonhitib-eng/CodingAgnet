/**
 * run-workflow CLI command.
 *
 * Exposes the existing workflow runner to the CLI as a single
 * command that runs the staged pipeline with pre-loaded inputs.
 *
 * This is NOT an execution engine.  Install plans produced by the
 * workflow are INFORMATIONAL ONLY and are NOT executed.
 */

import type { CatalogBundle } from "../../catalog/bundle.js";
import type { HostProfile } from "../../types/index.js";
import type {
  WorkflowResult,
  WorkflowStageName,
} from "../../workflow/types.js";
import { runWorkflow } from "../../workflow/workflow-runner.js";
import { STAGE_ORDER } from "../../workflow/types.js";
import { printOutput } from "../format.js";
import { usageError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunWorkflowArgs {
  bundle: CatalogBundle;
  host: HostProfile;
  json: boolean;
  artifactId?: string;
  stopAfter?: string;
  writer?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Stage name validation
// ---------------------------------------------------------------------------

function isValidStageName(name: string): name is WorkflowStageName {
  return (STAGE_ORDER as readonly string[]).includes(name);
}

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

function formatStatusLabel(result: WorkflowResult): string {
  switch (result.status) {
    case "completed":
      return "COMPLETED (approved)";
    case "completed_requires_approval":
      return "COMPLETED (requires human approval)";
    case "blocked":
      return "BLOCKED";
    case "failed":
      return "FAILED";
    case "partial":
      return `PARTIAL (stopped after ${result.stoppedAfter ?? "unknown"})`;
  }
}

function formatWorkflowPretty(result: WorkflowResult): string {
  const lines: string[] = [];

  lines.push("=== Workflow Result (INFORMATIONAL ONLY — NOT EXECUTED) ===");
  lines.push("");
  lines.push(`Status: ${formatStatusLabel(result)}`);
  lines.push("");

  // Completed stages
  lines.push(`Completed stages (${result.completedStages.length}/${STAGE_ORDER.length}):`);
  for (const cs of result.completedStages) {
    lines.push(`  ✓ ${cs.stage}`);
  }
  lines.push("");

  // Error info for failures
  if (result.status === "failed") {
    lines.push(`Failed stage: ${result.failedStage ?? "unknown"}`);
    lines.push(`Error: ${result.error ?? "unknown"}`);
    lines.push("");
  }

  // Target selection info
  const targetOut = result.stageOutputs.target_selection;
  if (targetOut) {
    lines.push("Target:");
    lines.push(`  Artifact: ${targetOut.artifact.id}`);
    lines.push(`  Selection: ${targetOut.selectionMethod}`);
    lines.push(`  Reason: ${targetOut.selectionReason}`);
    lines.push("");
  }

  // Safety info
  const safetyOut = result.stageOutputs.safety_evaluation;
  if (safetyOut) {
    const sr = safetyOut.safetyReport;
    const label = sr.blocked
      ? "BLOCKED"
      : sr.requiresHumanApproval
        ? "REQUIRES HUMAN APPROVAL"
        : "APPROVED";
    lines.push(`Safety: ${label}`);
    if (sr.violations.length > 0) {
      lines.push("  Violations:");
      for (const v of sr.violations) {
        lines.push(`    - [${v.severity}] ${v.description}`);
      }
    }
    if (sr.warnings.length > 0) {
      lines.push("  Warnings:");
      for (const w of sr.warnings) {
        lines.push(`    ⚠ ${w}`);
      }
    }
    lines.push("");
  }

  // Rendered output
  const renderOut = result.stageOutputs.rendering;
  if (renderOut) {
    lines.push("--- Rendered Plan ---");
    lines.push(renderOut.rendered);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON output builder
// ---------------------------------------------------------------------------

function buildJsonOutput(result: WorkflowResult): Record<string, unknown> {
  const output: Record<string, unknown> = {
    status: result.status,
    completedStages: result.completedStages.map((cs) => cs.stage),
  };

  if (result.failedStage !== undefined) {
    output.failedStage = result.failedStage;
  }
  if (result.error !== undefined) {
    output.error = result.error;
  }
  if (result.stoppedAfter !== undefined) {
    output.stoppedAfter = result.stoppedAfter;
  }

  // Include key stage outputs
  const stageData: Record<string, unknown> = {};

  if (result.stageOutputs.recommendation) {
    stageData.recommendation = {
      count: result.stageOutputs.recommendation.recommendations.length,
      recommendations: result.stageOutputs.recommendation.recommendations,
    };
  }

  if (result.stageOutputs.target_selection) {
    const ts = result.stageOutputs.target_selection;
    stageData.target_selection = {
      artifactId: ts.artifact.id,
      selectionMethod: ts.selectionMethod,
      selectionReason: ts.selectionReason,
    };
  }

  if (result.stageOutputs.compatibility_evaluation) {
    stageData.compatibility_evaluation =
      result.stageOutputs.compatibility_evaluation.compatibility;
  }

  if (result.stageOutputs.install_planning) {
    stageData.install_planning = result.stageOutputs.install_planning.plan;
  }

  if (result.stageOutputs.safety_evaluation) {
    stageData.safety_evaluation =
      result.stageOutputs.safety_evaluation.safetyReport;
  }

  if (result.stageOutputs.rendering) {
    stageData.rendering = result.stageOutputs.rendering.rendered;
  }

  output.stageOutputs = stageData;

  return output;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runRunWorkflow(args: RunWorkflowArgs): WorkflowResult {
  const { bundle, host, artifactId, stopAfter, json } = args;
  const write = args.writer ?? console.log;

  // Validate --stop-after value
  let validatedStopAfter: WorkflowStageName | undefined;
  if (stopAfter !== undefined) {
    if (!isValidStageName(stopAfter)) {
      throw usageError(
        `Invalid --stop-after stage: "${stopAfter}". ` +
          `Valid stages: ${STAGE_ORDER.join(", ")}`,
      );
    }
    validatedStopAfter = stopAfter;
  }

  const result = runWorkflow({
    bundle,
    host,
    artifactId,
    stopAfter: validatedStopAfter,
  });

  if (json) {
    printOutput(buildJsonOutput(result), true, write);
  } else {
    printOutput(formatWorkflowPretty(result), false, write);
  }

  return result;
}
