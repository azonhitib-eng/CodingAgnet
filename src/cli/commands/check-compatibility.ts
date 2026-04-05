/**
 * check-compatibility CLI command.
 *
 * Checks compatibility of a specific model artifact against a host.
 * Wraps `checkCompatibility` from the compatibility layer.
 */

import type { CatalogBundle } from "../../catalog/bundle.js";
import type { HostProfile, CompatibilityResult } from "../../types/index.js";
import { checkCompatibility } from "../../compatibility/compatibility-engine.js";
import { printOutput } from "../format.js";
import { inputError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckCompatibilityArgs {
  bundle: CatalogBundle;
  host: HostProfile;
  artifactId: string;
  json: boolean;
  writer?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

function formatCompatibilityPretty(
  artifactId: string,
  result: CompatibilityResult,
): string {
  const lines: string[] = [];

  lines.push("=== Compatibility Result ===");
  lines.push(`Artifact:       ${artifactId}`);
  lines.push(`Classification: ${result.classification}`);
  lines.push("");

  if (result.bottlenecks.length > 0) {
    lines.push("Bottlenecks:");
    for (const b of result.bottlenecks) {
      lines.push(`  - ${b}`);
    }
    lines.push("");
  }

  lines.push("Operating Limits:");
  lines.push(`  GPU Offload Possible: ${result.limits.gpuOffloadPossible}`);
  if (result.limits.estimatedGpuLayers !== undefined) {
    lines.push(`  Estimated GPU Layers: ${result.limits.estimatedGpuLayers}`);
  }
  if (result.limits.effectiveContextWindow !== undefined) {
    lines.push(`  Effective Context Window: ${result.limits.effectiveContextWindow}`);
  }
  lines.push(`  Requires Disk Swap: ${result.limits.requiresDiskSwap}`);
  lines.push("");

  if (result.settingsAdjustments.length > 0) {
    lines.push("Suggested Adjustments:");
    for (const adj of result.settingsAdjustments) {
      lines.push(`  ${adj.parameter} → ${adj.suggestedValue}`);
      lines.push(`    Reason: ${adj.reason}`);
    }
    lines.push("");
  }

  if (result.reasons.length > 0) {
    lines.push("Reasons:");
    for (const r of result.reasons) {
      lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runCheckCompatibility(args: CheckCompatibilityArgs): CompatibilityResult {
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

  const result = checkCompatibility(host, artifact, {
    variant,
    family,
    runtime,
    runtimeInstalled,
  });

  if (args.json) {
    printOutput(result, true, args.writer);
  } else {
    printOutput(formatCompatibilityPretty(artifactId, result), false, args.writer);
  }

  return result;
}
