/**
 * Tests for the compatibility engine.
 *
 * Covers:
 *   - strong host / small model → supported
 *   - low VRAM host / quantized artifact → supported_with_limits or cpu_only_slow
 *   - CPU-only host (no GPU) → cpu_only_slow
 *   - missing runtime → unsupported
 *   - unsupported platform → unsupported
 *   - insufficient RAM → unsupported
 *   - uncertain detection cases (unknown confidence)
 *   - estimated confidence warnings
 *   - disk swap detection
 *   - effective context window scaling
 */

import { describe, it, expect } from "vitest";
import { checkCompatibility } from "../../src/compatibility/compatibility-engine.js";
import type {
  HostProfile,
  ModelArtifact,
  CompatibilityContext,
  ModelVariant,
  ModelFamily,
  RuntimeEntry,
  Detected,
  GpuInfo,
} from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Test helpers — factory functions for clean test data
// ---------------------------------------------------------------------------

function certain<T>(value: T): Detected<T> {
  return { value, confidence: "certain" };
}

function estimated<T>(value: T): Detected<T> {
  return { value, confidence: "estimated" };
}

function unknown<T>(): Detected<T> {
  return { value: null, confidence: "unknown" };
}

function makeGpu(overrides?: Partial<GpuInfo>): GpuInfo {
  return {
    present: certain(true),
    model: certain("NVIDIA RTX 4090"),
    vramGb: certain(24),
    cudaVersion: certain("12.2"),
    rocmVersion: unknown(),
    driverVersion: certain("535.86.05"),
    ...overrides,
  };
}

function makeHost(overrides?: Partial<HostProfile>): HostProfile {
  return {
    detectedAt: new Date().toISOString(),
    os: {
      platform: certain("linux"),
      release: certain("6.1.0"),
      arch: certain("x64"),
    },
    cpu: {
      model: certain("AMD Ryzen 9 7950X"),
      cores: certain(16),
      threads: certain(32),
    },
    memory: {
      totalGb: certain(64),
      availableGb: certain(48),
    },
    gpu: makeGpu(),
    installedRuntimes: [{ runtimeId: "ollama", version: certain("0.1.20") }],
    missingDependencies: [],
    ...overrides,
  };
}

function makeArtifact(overrides?: Partial<ModelArtifact>): ModelArtifact {
  return {
    id: "test-model-7b-q4_k_m-ollama",
    variantId: "test-model-7b",
    runtimeId: "ollama",
    quantization: "q4_k_m",
    fileSizeGb: 4.1,
    minimumRamGb: 8,
    recommendedRamGb: 12,
    minimumVramGb: 4,
    recommendedVramGb: 8,
    status: "supported",
    ...overrides,
  };
}

function makeVariant(overrides?: Partial<ModelVariant>): ModelVariant {
  return {
    id: "test-model-7b",
    familyId: "test-model",
    displayName: "Test Model 7B",
    parameterLabel: "7B",
    sizeClass: "small",
    contextWindow: 32768,
    status: "supported",
    ...overrides,
  };
}

function makeFamily(overrides?: Partial<ModelFamily>): ModelFamily {
  return {
    id: "test-model",
    displayName: "Test Model",
    provider: "test-provider",
    capabilities: {
      coding: true,
      agenticToolUse: true,
      autocomplete: true,
      longContext: true,
    },
    status: "supported",
    ...overrides,
  };
}

function makeRuntime(overrides?: Partial<RuntimeEntry>): RuntimeEntry {
  return {
    id: "ollama",
    displayName: "Ollama",
    type: "local_server",
    detectionCommand: "ollama --version",
    versionCommand: "ollama --version",
    supportedPlatforms: ["linux", "darwin", "win32"],
    installInstructions: {},
    status: "supported",
    ...overrides,
  };
}

function makeContext(overrides?: Partial<CompatibilityContext>): CompatibilityContext {
  return {
    variant: makeVariant(),
    family: makeFamily(),
    runtime: makeRuntime(),
    runtimeInstalled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkCompatibility", () => {
  // -------------------------------------------------------------------------
  // Fully supported
  // -------------------------------------------------------------------------

  describe("strong host / small model → supported", () => {
    it("should classify as supported when host exceeds all recommendations", () => {
      const host = makeHost();
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("supported");
      expect(result.bottlenecks).toEqual([]);
      expect(result.limits.gpuOffloadPossible).toBe(true);
      expect(result.limits.requiresDiskSwap).toBe(false);
      expect(result.reasons).toContain("Host meets all recommended requirements.");
    });

    it("should return full context window when RAM is sufficient", () => {
      const host = makeHost();
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.limits.effectiveContextWindow).toBe(32768);
    });
  });

  // -------------------------------------------------------------------------
  // CPU-only host
  // -------------------------------------------------------------------------

  describe("CPU-only host (no GPU)", () => {
    it("should classify as cpu_only_slow when model expects GPU but none present", () => {
      const host = makeHost({ gpu: null });
      const artifact = makeArtifact({ minimumVramGb: 4 });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("cpu_only_slow");
      expect(result.limits.gpuOffloadPossible).toBe(false);
      expect(result.reasons.some((r) => r.includes("No GPU detected"))).toBe(true);
    });

    it("should classify as supported when model has minimumVramGb=0 and no GPU", () => {
      const host = makeHost({ gpu: null });
      const artifact = makeArtifact({ minimumVramGb: 0, recommendedVramGb: 0 });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("supported");
    });

    it("should classify as cpu_only_slow when GPU present=false", () => {
      const host = makeHost({
        gpu: makeGpu({ present: certain(false) }),
      });
      const artifact = makeArtifact({ minimumVramGb: 4 });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("cpu_only_slow");
    });
  });

  // -------------------------------------------------------------------------
  // Low VRAM → supported_with_limits or cpu_only_slow
  // -------------------------------------------------------------------------

  describe("low VRAM host / quantized artifact", () => {
    it("should classify as supported_with_limits when VRAM is between min and recommended", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: certain(6) }),
      });
      const artifact = makeArtifact({
        minimumVramGb: 4,
        recommendedVramGb: 8,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("supported_with_limits");
      expect(result.bottlenecks).toContain("vram");
      expect(result.limits.gpuOffloadPossible).toBe(true);
      expect(result.limits.estimatedGpuLayers).toBeDefined();
      expect(result.limits.estimatedGpuLayers!).toBeLessThan(32);
    });

    it("should classify as cpu_only_slow when VRAM below minimum", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: certain(2) }),
      });
      const artifact = makeArtifact({
        minimumVramGb: 4,
        recommendedVramGb: 8,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("cpu_only_slow");
      expect(result.bottlenecks).toContain("vram");
      expect(result.limits.gpuOffloadPossible).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Low RAM → supported_with_limits or unsupported
  // -------------------------------------------------------------------------

  describe("RAM constraints", () => {
    it("should classify as supported_with_limits when RAM between min and recommended", () => {
      const host = makeHost({
        memory: { totalGb: certain(10), availableGb: certain(8) },
      });
      const artifact = makeArtifact({
        minimumRamGb: 8,
        recommendedRamGb: 16,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("supported_with_limits");
      expect(result.bottlenecks).toContain("ram");
      expect(result.settingsAdjustments.length).toBeGreaterThan(0);
      expect(result.settingsAdjustments[0].parameter).toBe("num_ctx");
    });

    it("should classify as unsupported when RAM below minimum", () => {
      const host = makeHost({
        memory: { totalGb: certain(4), availableGb: certain(2) },
      });
      const artifact = makeArtifact({ minimumRamGb: 8 });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("unsupported");
      expect(result.bottlenecks).toContain("ram");
    });

    it("should scale effective context window when RAM is below recommended", () => {
      const host = makeHost({
        memory: { totalGb: certain(12), availableGb: certain(8) },
      });
      const artifact = makeArtifact({
        minimumRamGb: 8,
        recommendedRamGb: 24,
      });
      const ctx = makeContext({ variant: makeVariant({ contextWindow: 32768 }) });

      const result = checkCompatibility(host, artifact, ctx);

      // 12/24 = 0.5 → 32768 * 0.5 = 16384
      expect(result.limits.effectiveContextWindow).toBe(16384);
    });

    it("should floor effective context window at minimum 2048", () => {
      const host = makeHost({
        memory: { totalGb: certain(8), availableGb: certain(4) },
      });
      const artifact = makeArtifact({
        minimumRamGb: 8,
        recommendedRamGb: 256,
      });
      const ctx = makeContext({ variant: makeVariant({ contextWindow: 4096 }) });

      const result = checkCompatibility(host, artifact, ctx);

      // 8/256 = 0.03125 → 4096 * 0.03125 = 128 → floor to 2048
      expect(result.limits.effectiveContextWindow).toBe(2048);
    });
  });

  // -------------------------------------------------------------------------
  // Missing runtime → unsupported
  // -------------------------------------------------------------------------

  describe("missing runtime", () => {
    it("should classify as unsupported when runtime is not installed", () => {
      const host = makeHost({ installedRuntimes: [] });
      const artifact = makeArtifact();
      const ctx = makeContext({ runtimeInstalled: false });

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("unsupported");
      expect(result.bottlenecks).toContain("runtime_missing");
      expect(result.reasons.some((r) => r.includes("not installed"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Unsupported platform
  // -------------------------------------------------------------------------

  describe("unsupported platform", () => {
    it("should classify as unsupported when OS is not in runtime platforms", () => {
      const host = makeHost({
        os: {
          platform: certain("win32"),
          release: certain("10.0"),
          arch: certain("x64"),
        },
      });
      const artifact = makeArtifact();
      const ctx = makeContext({
        runtime: makeRuntime({ supportedPlatforms: ["linux", "darwin"] }),
      });

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("unsupported");
      expect(result.bottlenecks).toContain("os_incompatible");
    });
  });

  // -------------------------------------------------------------------------
  // Uncertain detection cases
  // -------------------------------------------------------------------------

  describe("uncertain detection cases", () => {
    it("should add warning when platform is unknown", () => {
      const host = makeHost({
        os: {
          platform: unknown(),
          release: unknown(),
          arch: unknown(),
        },
      });
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.warnings.some((w) => w.includes("platform is unknown"))).toBe(true);
      // Should NOT be unsupported just because platform is unknown
      expect(result.classification).not.toBe("unsupported");
    });

    it("should add warning when RAM is unknown", () => {
      const host = makeHost({
        memory: { totalGb: unknown(), availableGb: unknown() },
      });
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.warnings.some((w) => w.includes("RAM is unknown"))).toBe(true);
      expect(result.bottlenecks).toContain("unknown");
    });

    it("should add warning when VRAM is unknown but GPU is present", () => {
      const host = makeHost({
        gpu: makeGpu({
          present: certain(true),
          vramGb: unknown(),
        }),
      });
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.warnings.some((w) => w.includes("VRAM is unknown"))).toBe(true);
      // Optimistic: still allows GPU offload
      expect(result.limits.gpuOffloadPossible).toBe(true);
    });

    it("should add warning when RAM is estimated", () => {
      const host = makeHost({
        memory: { totalGb: estimated(32), availableGb: estimated(24) },
      });
      const artifact = makeArtifact();
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.warnings.some((w) => w.includes("RAM is estimated"))).toBe(true);
    });

    it("should add warning when VRAM is estimated", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: estimated(6) }),
      });
      const artifact = makeArtifact({
        minimumVramGb: 4,
        recommendedVramGb: 8,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.warnings.some((w) => w.includes("VRAM is estimated"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Disk swap detection
  // -------------------------------------------------------------------------

  describe("disk swap detection", () => {
    it("should detect disk swap when RAM barely covers model file size", () => {
      const host = makeHost({
        memory: { totalGb: certain(16), availableGb: certain(12) },
      });
      const artifact = makeArtifact({
        fileSizeGb: 15,
        minimumRamGb: 12,
        recommendedRamGb: 16,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.limits.requiresDiskSwap).toBe(true);
      expect(result.warnings.some((w) => w.includes("disk swap"))).toBe(true);
    });

    it("should not require disk swap when RAM is much larger than file size", () => {
      const host = makeHost();
      const artifact = makeArtifact({ fileSizeGb: 4.1 });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.limits.requiresDiskSwap).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple bottlenecks
  // -------------------------------------------------------------------------

  describe("multiple bottlenecks", () => {
    it("should report both runtime_missing and os_incompatible", () => {
      const host = makeHost({
        os: {
          platform: certain("win32"),
          release: certain("10.0"),
          arch: certain("x64"),
        },
      });
      const artifact = makeArtifact();
      const ctx = makeContext({
        runtimeInstalled: false,
        runtime: makeRuntime({ supportedPlatforms: ["linux"] }),
      });

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("unsupported");
      expect(result.bottlenecks).toContain("os_incompatible");
      expect(result.bottlenecks).toContain("runtime_missing");
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should use default context window when variant has none", () => {
      const host = makeHost();
      const artifact = makeArtifact();
      const ctx = makeContext({
        variant: makeVariant({ contextWindow: undefined }),
      });

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.limits.effectiveContextWindow).toBe(4096);
    });

    it("should handle artifact with no fileSizeGb gracefully", () => {
      const host = makeHost();
      const artifact = makeArtifact({ fileSizeGb: undefined });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.limits.requiresDiskSwap).toBe(false);
    });

    it("should handle GPU with minimumVramGb=0 and GPU available", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: certain(4) }),
      });
      const artifact = makeArtifact({
        minimumVramGb: 0,
        recommendedVramGb: 0,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      expect(result.classification).toBe("supported");
      expect(result.limits.gpuOffloadPossible).toBe(true);
    });

    it("should estimate GPU layers proportionally with partial VRAM", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: certain(4) }),
      });
      const artifact = makeArtifact({
        minimumVramGb: 2,
        recommendedVramGb: 8,
      });
      const ctx = makeContext();

      const result = checkCompatibility(host, artifact, ctx);

      // 32 layers * (4/8) = 16
      expect(result.limits.estimatedGpuLayers).toBe(16);
    });
  });
});
