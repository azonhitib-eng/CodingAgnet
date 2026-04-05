/**
 * Recommendation engine.
 *
 * Given a HostProfile and a loaded CatalogBundle, evaluates every
 * artifact against the host and returns a ranked list of model
 * recommendations with compatibility assessments and explanations.
 *
 * Only returns artifacts that are not "unsupported".
 */

import type {
  HostProfile,
  ModelRecommendation,
  CompatibilityClass,
  QuantizationType,
} from "../types/index.js";
import type { CatalogBundle } from "../catalog/index.js";
import { checkCompatibility } from "./compatibility-engine.js";

// ---------------------------------------------------------------------------
// Score tables (data-driven, not hardcoded business logic)
// ---------------------------------------------------------------------------

/** Base score per compatibility class. */
const CLASS_SCORE: Record<CompatibilityClass, number> = {
  supported: 100,
  supported_with_limits: 60,
  cpu_only_slow: 30,
  unsupported: 0,
};

/** Quality bonus per quantization format (higher = better fidelity). */
const QUANT_QUALITY: Record<string, number> = {
  f16: 10,
  none: 10,
  q8_0: 9,
  exl2: 8,
  q6_k: 8,
  q5_k_m: 7,
  awq: 7,
  gptq: 6,
  q4_k_m: 6,
  gguf: 5,
  q4_0: 5,
  q3_k_m: 4,
  q2_k: 3,
};

/** Fallback quality score for unknown quantization formats. */
const DEFAULT_QUANT_SCORE = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendOptions {
  /** If true, include unsupported artifacts in the results (default: false). */
  includeUnsupported?: boolean;
}

/**
 * Evaluate every artifact in the catalog bundle against the host and
 * return a ranked list of recommendations.
 *
 * @param host    - Detected host profile.
 * @param bundle  - Loaded and validated catalog bundle.
 * @param options - Optional configuration.
 * @returns Sorted array of ModelRecommendation (best first).
 */
export function recommend(
  host: HostProfile,
  bundle: CatalogBundle,
  options?: RecommendOptions,
): ModelRecommendation[] {
  const includeUnsupported = options?.includeUnsupported ?? false;
  const installedRuntimeIds = new Set(
    host.installedRuntimes.map((r) => r.runtimeId),
  );

  const results: ModelRecommendation[] = [];

  for (const artifact of bundle.models.listArtifacts()) {
    const variant = bundle.models.getVariant(artifact.variantId);
    const family = variant
      ? bundle.models.getFamily(variant.familyId)
      : undefined;
    const runtime = bundle.runtimes.get(artifact.runtimeId);

    // Skip artifacts whose catalog data is broken (should not happen
    // after bundle validation, but be defensive).
    if (variant === undefined || family === undefined || runtime === undefined) {
      continue;
    }

    const compatibility = checkCompatibility(host, artifact, {
      variant,
      family,
      runtime,
      runtimeInstalled: installedRuntimeIds.has(artifact.runtimeId),
    });

    if (!includeUnsupported && compatibility.classification === "unsupported") {
      continue;
    }

    const score = computeScore(compatibility.classification, artifact.quantization);
    const explanations = buildExplanations(
      compatibility.classification,
      family.displayName,
      variant.displayName,
      artifact.quantization,
      score,
    );

    results.push({
      artifactId: artifact.id,
      variantId: variant.id,
      familyId: family.id,
      displayName: `${variant.displayName} (${artifact.quantization})`,
      compatibility,
      score,
      explanations,
    });
  }

  // Sort by score descending, then alphabetically by displayName for stability.
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.displayName.localeCompare(b.displayName);
  });

  return results;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeScore(
  classification: CompatibilityClass,
  quantization: QuantizationType,
): number {
  const classScore = CLASS_SCORE[classification];
  const quantScore = QUANT_QUALITY[quantization] ?? DEFAULT_QUANT_SCORE;
  return classScore + quantScore;
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

function buildExplanations(
  classification: CompatibilityClass,
  familyName: string,
  variantName: string,
  quantization: QuantizationType,
  score: number,
): string[] {
  const lines: string[] = [];

  switch (classification) {
    case "supported":
      lines.push(`${variantName} is fully supported on this host.`);
      break;
    case "supported_with_limits":
      lines.push(
        `${variantName} can run but with performance limitations.`,
      );
      break;
    case "cpu_only_slow":
      lines.push(
        `${variantName} will run on CPU only — expect slower inference.`,
      );
      break;
    case "unsupported":
      lines.push(`${variantName} cannot run on this host.`);
      break;
  }

  lines.push(`Family: ${familyName}.`);
  lines.push(`Quantization: ${quantization}.`);
  lines.push(`Score: ${score}.`);

  return lines;
}
