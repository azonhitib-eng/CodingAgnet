/**
 * Compatibility result type contracts.
 *
 * The compatibility engine maps (HostProfile, ModelArtifact) →
 * CompatibilityResult with an actionable classification, bottleneck
 * analysis, and human-readable explanation.
 */

import type { ModelVariant, ModelFamily } from "./model.js";
import type { RuntimeEntry } from "./runtime.js";

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

export type CompatibilityClass =
  | "supported"
  | "supported_with_limits"
  | "cpu_only_slow"
  | "unsupported";

/** Which resource dimension is the limiting factor. */
export type BottleneckCategory =
  | "ram"
  | "vram"
  | "cpu"
  | "disk"
  | "driver"
  | "runtime_missing"
  | "os_incompatible"
  | "unknown";

// ---------------------------------------------------------------------------
// Operating limits
// ---------------------------------------------------------------------------

/** Concrete numeric limits the model will operate under on this host. */
export interface OperatingLimits {
  /** Usable context window (may be less than model max). */
  effectiveContextWindow?: number;
  /** Whether GPU offload is possible. */
  gpuOffloadPossible: boolean;
  /** Estimated layers that can be offloaded to GPU. */
  estimatedGpuLayers?: number;
  /** Whether the model must be partially swapped to disk. */
  requiresDiskSwap: boolean;
}

/** A suggested setting change that could improve the experience. */
export interface SettingsAdjustment {
  parameter: string;
  suggestedValue: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Full result
// ---------------------------------------------------------------------------

export interface CompatibilityResult {
  classification: CompatibilityClass;
  /** Primary bottleneck(s), empty when fully supported. */
  bottlenecks: BottleneckCategory[];
  /** Concrete operating limits for this combination. */
  limits: OperatingLimits;
  /** Recommended settings to improve performance. */
  settingsAdjustments: SettingsAdjustment[];
  /** Human-readable reasons supporting the classification. */
  reasons: string[];
  /** Warnings that don't change the class but are worth noting. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Compatibility engine input context
// ---------------------------------------------------------------------------

/** Contextual data needed alongside HostProfile and ModelArtifact. */
export interface CompatibilityContext {
  /** The model variant (for context window, size class). */
  variant: ModelVariant;
  /** The model family (for display name, capabilities). */
  family: ModelFamily;
  /** The runtime entry the artifact targets. */
  runtime: RuntimeEntry;
  /** Whether the targeted runtime is installed on the host. */
  runtimeInstalled: boolean;
}

// ---------------------------------------------------------------------------
// Recommendation result
// ---------------------------------------------------------------------------

/** A ranked model recommendation with compatibility assessment. */
export interface ModelRecommendation {
  artifactId: string;
  variantId: string;
  familyId: string;
  /** Human-readable display name for the recommendation. */
  displayName: string;
  /** Full compatibility result for this artifact on the host. */
  compatibility: CompatibilityResult;
  /** Numeric score for ranking (higher is better). */
  score: number;
  /** Human-readable explanations for this ranking position. */
  explanations: string[];
}
