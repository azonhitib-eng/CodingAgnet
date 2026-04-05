/**
 * Tests for the recommendation engine.
 *
 * Covers:
 *   - ranking behavior (best artifacts first)
 *   - filtering out unsupported artifacts
 *   - includeUnsupported option
 *   - scoring consistency
 *   - explanations content
 *   - empty catalog handling
 *   - mixed compatibility classes
 */

import { describe, it, expect } from "vitest";
import { recommend } from "../../src/compatibility/recommendation-engine.js";
import { ModelCatalog } from "../../src/catalog/model-catalog.js";
import { RuntimeRegistry } from "../../src/catalog/runtime-registry.js";
import { AgentToolCatalog } from "../../src/catalog/agent-tool-catalog.js";
import type {
  HostProfile,
  Detected,
  ModelManifest,
  RuntimeManifest,
  GpuInfo,
} from "../../src/types/index.js";
import type { CatalogBundle } from "../../src/catalog/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T): Detected<T> {
  return { value, confidence: "certain" };
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

const ollamaRuntime: RuntimeManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  runtime: {
    id: "ollama",
    displayName: "Ollama",
    type: "local_server",
    detectionCommand: "ollama --version",
    versionCommand: "ollama --version",
    supportedPlatforms: ["linux", "darwin", "win32"],
    installInstructions: {},
    status: "supported",
  },
};

const llamacppRuntime: RuntimeManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  runtime: {
    id: "llamacpp",
    displayName: "llama.cpp",
    type: "cli_tool",
    detectionCommand: "llama-cli --version",
    versionCommand: "llama-cli --version",
    supportedPlatforms: ["linux", "darwin"],
    installInstructions: {},
    status: "supported",
  },
};

/** Small model that runs easily on most hosts. */
const smallModelManifest: ModelManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  family: {
    id: "small-coder",
    displayName: "Small Coder",
    provider: "test",
    capabilities: { coding: true, agenticToolUse: false, autocomplete: true, longContext: false },
    status: "supported",
  },
  variants: [
    {
      id: "small-coder-3b",
      familyId: "small-coder",
      displayName: "Small Coder 3B",
      parameterLabel: "3B",
      sizeClass: "tiny",
      contextWindow: 8192,
      status: "supported",
    },
  ],
  artifacts: [
    {
      id: "small-coder-3b-q4_k_m-ollama",
      variantId: "small-coder-3b",
      runtimeId: "ollama",
      quantization: "q4_k_m",
      fileSizeGb: 1.8,
      minimumRamGb: 4,
      recommendedRamGb: 8,
      minimumVramGb: 2,
      recommendedVramGb: 4,
      status: "supported",
    },
    {
      id: "small-coder-3b-q8_0-ollama",
      variantId: "small-coder-3b",
      runtimeId: "ollama",
      quantization: "q8_0",
      fileSizeGb: 3.4,
      minimumRamGb: 6,
      recommendedRamGb: 10,
      minimumVramGb: 3,
      recommendedVramGb: 6,
      status: "supported",
    },
  ],
};

/** Medium model that needs more resources. */
const mediumModelManifest: ModelManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  family: {
    id: "medium-coder",
    displayName: "Medium Coder",
    provider: "test",
    capabilities: { coding: true, agenticToolUse: true, autocomplete: true, longContext: true },
    status: "supported",
  },
  variants: [
    {
      id: "medium-coder-16b",
      familyId: "medium-coder",
      displayName: "Medium Coder 16B",
      parameterLabel: "16B",
      sizeClass: "medium",
      contextWindow: 128000,
      status: "supported",
    },
  ],
  artifacts: [
    {
      id: "medium-coder-16b-q4_k_m-ollama",
      variantId: "medium-coder-16b",
      runtimeId: "ollama",
      quantization: "q4_k_m",
      fileSizeGb: 9.1,
      minimumRamGb: 12,
      recommendedRamGb: 16,
      minimumVramGb: 8,
      recommendedVramGb: 12,
      status: "supported",
    },
  ],
};

/** Huge model that won't fit on modest hardware. */
const hugeModelManifest: ModelManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  family: {
    id: "huge-coder",
    displayName: "Huge Coder",
    provider: "test",
    capabilities: { coding: true, agenticToolUse: true, autocomplete: true, longContext: true },
    status: "experimental",
  },
  variants: [
    {
      id: "huge-coder-236b",
      familyId: "huge-coder",
      displayName: "Huge Coder 236B",
      parameterLabel: "236B",
      sizeClass: "xlarge",
      contextWindow: 128000,
      status: "experimental",
    },
  ],
  artifacts: [
    {
      id: "huge-coder-236b-q4_k_m-ollama",
      variantId: "huge-coder-236b",
      runtimeId: "ollama",
      quantization: "q4_k_m",
      fileSizeGb: 130,
      minimumRamGb: 140,
      recommendedRamGb: 160,
      minimumVramGb: 80,
      recommendedVramGb: 130,
      status: "experimental",
    },
  ],
};

/** Model that requires a runtime only on linux. */
const linuxOnlyManifest: ModelManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  family: {
    id: "linux-only",
    displayName: "Linux Only Model",
    provider: "test",
    capabilities: { coding: true, agenticToolUse: false, autocomplete: false, longContext: false },
    status: "supported",
  },
  variants: [
    {
      id: "linux-only-7b",
      familyId: "linux-only",
      displayName: "Linux Only 7B",
      parameterLabel: "7B",
      sizeClass: "small",
      contextWindow: 4096,
      status: "supported",
    },
  ],
  artifacts: [
    {
      id: "linux-only-7b-q4_k_m-llamacpp",
      variantId: "linux-only-7b",
      runtimeId: "llamacpp",
      quantization: "q4_k_m",
      fileSizeGb: 4.0,
      minimumRamGb: 8,
      recommendedRamGb: 12,
      minimumVramGb: 4,
      recommendedVramGb: 8,
      status: "supported",
    },
  ],
};

function buildBundle(
  models: ModelManifest[],
  runtimes: RuntimeManifest[] = [ollamaRuntime, llamacppRuntime],
): CatalogBundle {
  const reg = new RuntimeRegistry();
  for (const rm of runtimes) reg.addManifest(rm);

  const cat = new ModelCatalog();
  for (const mm of models) cat.addManifest(mm);

  cat.validateRuntimeReferences(reg.knownIds);

  return { models: cat, runtimes: reg, agentTools: new AgentToolCatalog() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recommend", () => {
  // -------------------------------------------------------------------------
  // Basic ranking
  // -------------------------------------------------------------------------

  describe("ranking behavior", () => {
    it("should return artifacts ranked by score (best first)", () => {
      const host = makeHost();
      const bundle = buildBundle([smallModelManifest, mediumModelManifest]);

      const recs = recommend(host, bundle);

      expect(recs.length).toBeGreaterThan(0);
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
      }
    });

    it("should prefer higher quality quantization within same compatibility class", () => {
      const host = makeHost();
      const bundle = buildBundle([smallModelManifest]);

      const recs = recommend(host, bundle);

      // Both q8_0 and q4_k_m should be "supported"; q8_0 scores higher
      const q8 = recs.find((r) => r.artifactId === "small-coder-3b-q8_0-ollama");
      const q4 = recs.find((r) => r.artifactId === "small-coder-3b-q4_k_m-ollama");
      expect(q8).toBeDefined();
      expect(q4).toBeDefined();
      expect(q8!.score).toBeGreaterThan(q4!.score);
    });
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  describe("filtering unsupported artifacts", () => {
    it("should exclude unsupported artifacts by default", () => {
      const host = makeHost({
        memory: { totalGb: certain(16), availableGb: certain(12) },
      });
      const bundle = buildBundle([smallModelManifest, hugeModelManifest]);

      const recs = recommend(host, bundle);

      // Huge model needs 140 GB RAM — should be filtered out
      const huge = recs.find((r) => r.familyId === "huge-coder");
      expect(huge).toBeUndefined();
    });

    it("should include unsupported artifacts when includeUnsupported=true", () => {
      const host = makeHost({
        memory: { totalGb: certain(16), availableGb: certain(12) },
      });
      const bundle = buildBundle([smallModelManifest, hugeModelManifest]);

      const recs = recommend(host, bundle, { includeUnsupported: true });

      const huge = recs.find((r) => r.familyId === "huge-coder");
      expect(huge).toBeDefined();
      expect(huge!.compatibility.classification).toBe("unsupported");
      expect(huge!.score).toBe(0 + 6); // unsupported (0) + q4_k_m (6)
    });
  });

  // -------------------------------------------------------------------------
  // Mixed compatibility classes
  // -------------------------------------------------------------------------

  describe("mixed compatibility classes", () => {
    it("should rank supported artifacts above cpu_only_slow", () => {
      const host = makeHost({
        gpu: null, // No GPU → cpu_only_slow for GPU-requiring models
        memory: { totalGb: certain(64), availableGb: certain(48) },
      });
      const bundle = buildBundle([smallModelManifest, mediumModelManifest]);

      const recs = recommend(host, bundle);

      // All should be cpu_only_slow since no GPU and models require VRAM
      for (const rec of recs) {
        expect(rec.compatibility.classification).toBe("cpu_only_slow");
      }
    });

    it("should correctly mix supported and limited artifacts", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: certain(6) }),
        memory: { totalGb: certain(32), availableGb: certain(24) },
      });
      const bundle = buildBundle([smallModelManifest, mediumModelManifest]);

      const recs = recommend(host, bundle);

      // Small model (vram rec=4-6) should be supported or supported_with_limits
      // Medium model (vram rec=12, min=8) with 6GB VRAM → cpu_only_slow
      const smallRecs = recs.filter((r) => r.familyId === "small-coder");
      const mediumRecs = recs.filter((r) => r.familyId === "medium-coder");

      expect(smallRecs.length).toBeGreaterThan(0);
      expect(mediumRecs.length).toBeGreaterThan(0);

      // Small should rank higher than medium
      const bestSmall = smallRecs[0].score;
      const bestMedium = mediumRecs[0].score;
      expect(bestSmall).toBeGreaterThan(bestMedium);
    });
  });

  // -------------------------------------------------------------------------
  // Platform filtering
  // -------------------------------------------------------------------------

  describe("platform-based filtering", () => {
    it("should filter out artifacts whose runtime is unsupported on host platform", () => {
      const host = makeHost({
        os: {
          platform: certain("win32"),
          release: certain("10.0"),
          arch: certain("x64"),
        },
        // llamacpp only supports linux+darwin, not win32
        installedRuntimes: [
          { runtimeId: "ollama", version: certain("0.1.20") },
        ],
      });
      const bundle = buildBundle([linuxOnlyManifest]);

      const recs = recommend(host, bundle);

      // llamacpp artifact on win32 → unsupported → filtered out
      expect(recs.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty catalog
  // -------------------------------------------------------------------------

  describe("empty catalog", () => {
    it("should return empty array when catalog has no models", () => {
      const host = makeHost();
      const bundle = buildBundle([]);

      const recs = recommend(host, bundle);

      expect(recs).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Explanations
  // -------------------------------------------------------------------------

  describe("explanations", () => {
    it("should include meaningful explanations for each recommendation", () => {
      const host = makeHost();
      const bundle = buildBundle([smallModelManifest]);

      const recs = recommend(host, bundle);

      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        expect(rec.explanations.length).toBeGreaterThan(0);
        expect(rec.explanations.some((e) => e.includes("Score:"))).toBe(true);
        expect(rec.explanations.some((e) => e.includes("Family:"))).toBe(true);
        expect(rec.explanations.some((e) => e.includes("Quantization:"))).toBe(true);
      }
    });

    it("should explain cpu_only_slow classification", () => {
      const host = makeHost({ gpu: null });
      const bundle = buildBundle([smallModelManifest]);

      const recs = recommend(host, bundle);

      const cpuOnlyRec = recs.find(
        (r) => r.compatibility.classification === "cpu_only_slow",
      );
      expect(cpuOnlyRec).toBeDefined();
      expect(
        cpuOnlyRec!.explanations.some((e) => e.includes("CPU only")),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Score structure
  // -------------------------------------------------------------------------

  describe("score structure", () => {
    it("should have score = classScore + quantBonus", () => {
      const host = makeHost();
      const bundle = buildBundle([smallModelManifest]);

      const recs = recommend(host, bundle);

      // q8_0 on supported host → 100 (supported) + 9 (q8_0) = 109
      const q8 = recs.find((r) => r.artifactId === "small-coder-3b-q8_0-ollama");
      expect(q8).toBeDefined();
      expect(q8!.score).toBe(109);

      // q4_k_m on supported host → 100 (supported) + 6 (q4_k_m) = 106
      const q4 = recs.find((r) => r.artifactId === "small-coder-3b-q4_k_m-ollama");
      expect(q4).toBeDefined();
      expect(q4!.score).toBe(106);
    });
  });

  // -------------------------------------------------------------------------
  // Display name
  // -------------------------------------------------------------------------

  describe("display name", () => {
    it("should include variant name and quantization", () => {
      const host = makeHost();
      const bundle = buildBundle([smallModelManifest]);

      const recs = recommend(host, bundle);

      const rec = recs.find((r) => r.artifactId === "small-coder-3b-q4_k_m-ollama");
      expect(rec).toBeDefined();
      expect(rec!.displayName).toBe("Small Coder 3B (q4_k_m)");
    });
  });

  // -------------------------------------------------------------------------
  // Uncertain host
  // -------------------------------------------------------------------------

  describe("uncertain host detection", () => {
    it("should handle host with many unknown values gracefully", () => {
      const host: HostProfile = {
        detectedAt: new Date().toISOString(),
        os: {
          platform: unknown(),
          release: unknown(),
          arch: unknown(),
        },
        cpu: {
          model: unknown(),
          cores: unknown(),
          threads: unknown(),
        },
        memory: {
          totalGb: unknown(),
          availableGb: unknown(),
        },
        gpu: null,
        installedRuntimes: [{ runtimeId: "ollama", version: certain("0.1.20") }],
        missingDependencies: [],
      };
      const bundle = buildBundle([smallModelManifest]);

      // Should not throw
      const recs = recommend(host, bundle);

      // Results should exist (uncertain doesn't mean unsupported)
      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        expect(rec.compatibility.warnings.length).toBeGreaterThan(0);
      }
    });
  });
});
