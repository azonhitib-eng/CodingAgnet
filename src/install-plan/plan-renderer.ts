/**
 * Human-readable plan renderer.
 *
 * Renders an InstallPlan and optional SafetyReport into a structured
 * text document suitable for human review before any future execution.
 */

import type {
  InstallPlan,
  SafetyReport,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Include the safety report section (default: true if report is provided). */
  includeSafety?: boolean;
  /** Line width for separators (default: 72). */
  lineWidth?: number;
}

/**
 * Render an InstallPlan (and optional SafetyReport) as a human-readable
 * multi-line string.
 */
export function renderPlan(
  plan: InstallPlan,
  safetyReport?: SafetyReport,
  options?: RenderOptions,
): string {
  const width = options?.lineWidth ?? 72;
  const includeSafety = options?.includeSafety ?? (safetyReport !== undefined);
  const lines: string[] = [];

  // Header
  lines.push(separator("=", width));
  lines.push(`INSTALL PLAN: ${plan.artifactId}`);
  lines.push(separator("=", width));
  lines.push("");

  // Summary
  lines.push(`Summary: ${plan.humanSummary}`);
  lines.push(`Runtime: ${plan.runtimeId}`);
  lines.push(`Platform: ${plan.targetPlatform}`);
  lines.push("");

  // Prerequisites
  lines.push(separator("-", width));
  lines.push("PREREQUISITES");
  lines.push(separator("-", width));
  if (plan.prerequisites.length === 0) {
    lines.push("  (none)");
  } else {
    for (const p of plan.prerequisites) {
      lines.push(`  [${p.name}]`);
      lines.push(`    Check: ${p.checkCommand}`);
      lines.push(`    Install hint: ${p.installHint}`);
    }
  }
  lines.push("");

  // Steps
  lines.push(separator("-", width));
  lines.push("INSTALL STEPS");
  lines.push(separator("-", width));
  if (plan.steps.length === 0) {
    lines.push("  (no steps)");
  } else {
    for (const step of plan.steps) {
      const approval = step.requiresApproval ? " [APPROVAL REQUIRED]" : "";
      const reversible = step.reversible ? "reversible" : "IRREVERSIBLE";
      lines.push(`  Step ${step.order}: ${step.description}`);
      lines.push(`    Command: ${step.command}`);
      lines.push(`    Risk: ${step.riskLevel} | ${reversible}${approval}`);
      if (step.platforms) {
        lines.push(`    Platforms: ${step.platforms.join(", ")}`);
      }
      if (step.estimatedDurationSec !== undefined) {
        lines.push(`    Est. duration: ~${step.estimatedDurationSec}s`);
      }
    }
  }
  lines.push("");

  // Post-install verification
  lines.push(separator("-", width));
  lines.push("POST-INSTALL VERIFICATION");
  lines.push(separator("-", width));
  if (plan.postInstallVerification.length === 0) {
    lines.push("  (none)");
  } else {
    for (let i = 0; i < plan.postInstallVerification.length; i++) {
      const v = plan.postInstallVerification[i];
      lines.push(`  ${i + 1}. ${v.description}`);
      lines.push(`     Command: ${v.command}`);
      if (v.expectedOutput) {
        lines.push(`     Expected: ${v.expectedOutput}`);
      }
    }
  }
  lines.push("");

  // Resource estimates
  lines.push(separator("-", width));
  lines.push("RESOURCE ESTIMATES");
  lines.push(separator("-", width));
  const re = plan.resourceEstimate;
  lines.push(`  Disk space: ${re.diskSpaceGb} GB`);
  if (re.peakRamGb !== undefined) {
    lines.push(`  Peak RAM: ${re.peakRamGb} GB`);
  }
  lines.push(`  Network required: ${re.requiresNetwork ? "yes" : "no"}`);
  if (re.estimatedDownloadGb !== undefined) {
    lines.push(`  Download size: ~${re.estimatedDownloadGb} GB`);
  }
  lines.push("");

  // Risks
  if (plan.risks.length > 0) {
    lines.push(separator("-", width));
    lines.push("RISKS & WARNINGS");
    lines.push(separator("-", width));
    for (const risk of plan.risks) {
      lines.push(`  • ${risk}`);
    }
    lines.push("");
  }

  // Safety report
  if (includeSafety && safetyReport) {
    lines.push(separator("=", width));
    lines.push("SAFETY REPORT");
    lines.push(separator("=", width));
    lines.push(`  Plan ID: ${safetyReport.planId}`);
    lines.push(`  Approved: ${safetyReport.approved ? "YES" : "NO"}`);
    lines.push(`  Violations: ${safetyReport.violations.length}`);
    lines.push(`  Warnings: ${safetyReport.warnings.length}`);
    lines.push("");

    if (safetyReport.violations.length > 0) {
      lines.push("  VIOLATIONS:");
      for (const v of safetyReport.violations) {
        lines.push(`    [Step ${v.stepIndex}] (${v.severity}) ${v.description}`);
      }
      lines.push("");
    }

    if (safetyReport.warnings.length > 0) {
      lines.push("  WARNINGS:");
      for (const w of safetyReport.warnings) {
        lines.push(`    • ${w}`);
      }
      lines.push("");
    }
  }

  lines.push(separator("=", width));
  lines.push("END OF PLAN");
  lines.push(separator("=", width));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(char: string, width: number): string {
  return char.repeat(width);
}
