/**
 * Compatibility result type contracts.
 *
 * The compatibility engine maps (HostProfile, ModelArtifact) →
 * CompatibilityResult with an actionable classification, bottleneck
 * analysis, and human-readable explanation.
 */

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
