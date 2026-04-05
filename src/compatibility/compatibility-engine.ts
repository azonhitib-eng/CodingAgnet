/**
 * Compatibility engine.
 *
 * Pure function that evaluates whether a model artifact can run on a
 * given host, returning a structured CompatibilityResult with
 * classification, bottleneck analysis, operating limits, and
 * human-readable explanations.
 *
 * Handles uncertainty gracefully — when host detection values are
 * unknown or estimated, the engine adds warnings instead of blocking.
 */

import type {
  HostProfile,
  ModelArtifact,
  CompatibilityContext,
  CompatibilityClass,
  BottleneckCategory,
  CompatibilityResult,
  OperatingLimits,
  SettingsAdjustment,
  Detected,
  Platform,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default context window when variant does not specify one. */
const DEFAULT_CONTEXT_WINDOW = 4096;

/** Minimum context window the engine will recommend. */
const MIN_CONTEXT_WINDOW = 2048;

/**
 * Rough multiplier: if total RAM is less than fileSizeGb × this,
 * the model may need disk-swap paging.
 */
const DISK_SWAP_RAM_RATIO = 1.2;

/**
 * Typical number of transformer layers for GPU-offload estimation.
 * This is a rough heuristic — actual layer counts vary by model.
 */
const ESTIMATED_TOTAL_LAYERS = 32;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate compatibility of a model artifact against a host profile.
 *
 * @param host      - Detected host capabilities (may contain uncertain values).
 * @param artifact  - The concrete model artifact to evaluate.
 * @param context   - Additional context: variant, family, runtime, install status.
 * @returns A fully populated CompatibilityResult.
 */
export function checkCompatibility(
  host: HostProfile,
  artifact: ModelArtifact,
  context: CompatibilityContext,
): CompatibilityResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const bottlenecks: BottleneckCategory[] = [];
  const adjustments: SettingsAdjustment[] = [];

  let blocked = false;
  let cpuOnly = false;
  let limited = false;

  // --- OS / platform compatibility ---
  checkPlatform(host, context, reasons, warnings, bottlenecks, () => { blocked = true; });

  // --- Runtime availability ---
  checkRuntime(context, reasons, bottlenecks, () => { blocked = true; });

  // --- RAM ---
  checkRam(host, artifact, context, reasons, warnings, bottlenecks, adjustments,
    () => { blocked = true; }, () => { limited = true; });

  // --- GPU / VRAM ---
  const gpuResult = checkGpu(host, artifact, reasons, warnings, bottlenecks,
    () => { cpuOnly = true; }, () => { limited = true; });

  // --- Disk swap ---
  const requiresDiskSwap = checkDiskSwap(host, artifact, warnings);

  // --- Effective context window ---
  const effectiveContextWindow = computeEffectiveContext(
    host, artifact, context,
  );

  // --- Classification ---
  const classification = classify(blocked, cpuOnly, limited, reasons);

  // --- Build limits ---
  const limits: OperatingLimits = {
    effectiveContextWindow,
    gpuOffloadPossible: gpuResult.gpuOffloadPossible,
    estimatedGpuLayers: gpuResult.estimatedGpuLayers,
    requiresDiskSwap,
  };

  return {
    classification,
    bottlenecks,
    limits,
    settingsAdjustments: adjustments,
    reasons,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Internal check functions
// ---------------------------------------------------------------------------

function checkPlatform(
  host: HostProfile,
  context: CompatibilityContext,
  reasons: string[],
  warnings: string[],
  bottlenecks: BottleneckCategory[],
  setBlocked: () => void,
): void {
  const platform = val(host.os.platform);
  if (platform === null) {
    warnings.push(
      "Host platform is unknown; cannot verify OS compatibility.",
    );
    return;
  }
  if (!context.runtime.supportedPlatforms.includes(platform as Platform)) {
    setBlocked();
    addUnique(bottlenecks, "os_incompatible");
    reasons.push(
      `Runtime "${context.runtime.displayName}" does not support platform "${platform}".`,
    );
  }
}

function checkRuntime(
  context: CompatibilityContext,
  reasons: string[],
  bottlenecks: BottleneckCategory[],
  setBlocked: () => void,
): void {
  if (!context.runtimeInstalled) {
    setBlocked();
    addUnique(bottlenecks, "runtime_missing");
    reasons.push(
      `Required runtime "${context.runtime.displayName}" is not installed.`,
    );
  }
}

function checkRam(
  host: HostProfile,
  artifact: ModelArtifact,
  context: CompatibilityContext,
  reasons: string[],
  warnings: string[],
  bottlenecks: BottleneckCategory[],
  adjustments: SettingsAdjustment[],
  setBlocked: () => void,
  setLimited: () => void,
): void {
  const totalRam = val(host.memory.totalGb);

  if (totalRam === null) {
    warnings.push("System RAM is unknown; cannot verify memory requirements.");
    addUnique(bottlenecks, "unknown");
    return;
  }

  if (host.memory.totalGb.confidence === "estimated") {
    warnings.push("System RAM is estimated; actual value may differ.");
  }

  if (totalRam < artifact.minimumRamGb) {
    setBlocked();
    addUnique(bottlenecks, "ram");
    reasons.push(
      `System RAM (${totalRam} GB) is below minimum requirement (${artifact.minimumRamGb} GB).`,
    );
  } else if (totalRam < artifact.recommendedRamGb) {
    setLimited();
    addUnique(bottlenecks, "ram");
    reasons.push(
      `System RAM (${totalRam} GB) is below recommended (${artifact.recommendedRamGb} GB).`,
    );
    const maxCtx = context.variant.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    adjustments.push({
      parameter: "num_ctx",
      suggestedValue: String(Math.min(maxCtx, DEFAULT_CONTEXT_WINDOW)),
      reason: "Reduce context window to fit in available RAM.",
    });
  }
}

interface GpuCheckResult {
  gpuOffloadPossible: boolean;
  estimatedGpuLayers: number | undefined;
}

function checkGpu(
  host: HostProfile,
  artifact: ModelArtifact,
  reasons: string[],
  warnings: string[],
  bottlenecks: BottleneckCategory[],
  setCpuOnly: () => void,
  setLimited: () => void,
): GpuCheckResult {
  let gpuOffloadPossible = false;
  let estimatedGpuLayers: number | undefined;

  // No GPU at all
  if (host.gpu === null || val(host.gpu.present) !== true) {
    if (artifact.minimumVramGb > 0) {
      setCpuOnly();
      reasons.push("No GPU detected; model will run on CPU only.");
    }
    // minimumVramGb === 0 means model is designed for CPU — no degradation
    return { gpuOffloadPossible, estimatedGpuLayers };
  }

  // GPU present but VRAM unknown
  const vram = val(host.gpu.vramGb);
  if (vram === null) {
    warnings.push(
      "GPU VRAM is unknown; cannot determine GPU offload capability.",
    );
    // Optimistic: assume some offload if GPU is present
    gpuOffloadPossible = true;
    return { gpuOffloadPossible, estimatedGpuLayers };
  }

  if (host.gpu.vramGb.confidence === "estimated") {
    warnings.push("GPU VRAM is estimated; actual value may differ.");
  }

  if (artifact.minimumVramGb === 0) {
    // Model designed for CPU; GPU is bonus acceleration
    gpuOffloadPossible = true;
  } else if (vram < artifact.minimumVramGb) {
    // VRAM below minimum — fall back to CPU
    setCpuOnly();
    addUnique(bottlenecks, "vram");
    reasons.push(
      `GPU VRAM (${vram} GB) is below minimum (${artifact.minimumVramGb} GB); falling back to CPU.`,
    );
  } else if (vram < artifact.recommendedVramGb) {
    // Partial GPU offload
    gpuOffloadPossible = true;
    setLimited();
    addUnique(bottlenecks, "vram");
    reasons.push(
      `GPU VRAM (${vram} GB) is below recommended (${artifact.recommendedVramGb} GB); partial GPU offload.`,
    );
    estimatedGpuLayers = Math.floor(
      ESTIMATED_TOTAL_LAYERS * (vram / artifact.recommendedVramGb),
    );
  } else {
    // Full GPU offload
    gpuOffloadPossible = true;
  }

  return { gpuOffloadPossible, estimatedGpuLayers };
}

function checkDiskSwap(
  host: HostProfile,
  artifact: ModelArtifact,
  warnings: string[],
): boolean {
  const totalRam = val(host.memory.totalGb);
  if (totalRam !== null && artifact.fileSizeGb !== undefined) {
    if (totalRam < artifact.fileSizeGb * DISK_SWAP_RAM_RATIO) {
      warnings.push("Model may require disk swap due to tight memory.");
      return true;
    }
  }
  return false;
}

function computeEffectiveContext(
  host: HostProfile,
  artifact: ModelArtifact,
  context: CompatibilityContext,
): number {
  const maxCtx = context.variant.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const totalRam = val(host.memory.totalGb);

  if (totalRam !== null && totalRam < artifact.recommendedRamGb) {
    const ratio = totalRam / artifact.recommendedRamGb;
    return Math.max(MIN_CONTEXT_WINDOW, Math.floor(maxCtx * ratio));
  }
  return maxCtx;
}

function classify(
  blocked: boolean,
  cpuOnly: boolean,
  limited: boolean,
  reasons: string[],
): CompatibilityClass {
  if (blocked) return "unsupported";

  if (cpuOnly) {
    return "cpu_only_slow";
  }

  if (limited) return "supported_with_limits";

  if (reasons.length === 0) {
    reasons.push("Host meets all recommended requirements.");
  }
  return "supported";
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract the value from a Detected wrapper. */
function val<T>(d: Detected<T>): T | null {
  return d.value;
}

/** Push a value into an array only if not already present. */
function addUnique<T>(arr: T[], item: T): void {
  if (!arr.includes(item)) arr.push(item);
}
