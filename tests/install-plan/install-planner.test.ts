/**
 * Tests for the install planner.
 *
 * Covers:
 *   - supported host + supported runtime → normal plan
 *   - supported_with_limits case → plan contains limits/warnings
 *   - missing runtime prerequisites
 *   - platform-specific plan branching
 *   - uncertain host data reflected in plan warnings
 *   - deterministic planning for the same inputs
 *   - resource estimates
 *   - GPU layer estimate marked as approximate
 */

import { describe, it, expect } from "vitest";
import { generateInstallPlan } from "../../src/install-plan/install-planner.js";
import type { PlannerInput } from "../../src/install-plan/install-planner.js";
import type {
  HostProfile,
  ModelArtifact,
  ModelVariant,
  RuntimeEntry,
  CompatibilityResult,
  Detected,
  GpuInfo,
} from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
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
    detectedAt: "2025-01-01T00:00:00Z",
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
    pullCommand: "ollama pull test-model:7b-q4_k_m",
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

function makeRuntime(overrides?: Partial<RuntimeEntry>): RuntimeEntry {
  return {
    id: "ollama",
    displayName: "Ollama",
    type: "local_server",
    detectionCommand: "ollama --version",
    versionCommand: "ollama --version",
    supportedPlatforms: ["linux", "darwin", "win32"],
    installInstructions: {
      linux: ["curl -fsSL https://ollama.ai/install.sh | sh"],
      darwin: ["brew install ollama"],
    },
    postInstallVerification: {
      linux: ["ollama list"],
    },
    status: "supported",
    ...overrides,
  };
}

function makeInput(overrides?: Partial<PlannerInput>): PlannerInput {
  return {
    host: makeHost(),
    artifact: makeArtifact(),
    variant: makeVariant(),
    runtime: makeRuntime(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateInstallPlan", () => {

  // -------------------------------------------------------------------------
  // Normal plan
  // -------------------------------------------------------------------------

  describe("supported host + supported runtime → normal plan", () => {
    it("should produce a plan with correct artifact and runtime IDs", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.artifactId).toBe("test-model-7b-q4_k_m-ollama");
      expect(plan.runtimeId).toBe("ollama");
      expect(plan.targetPlatform).toBe("linux");
    });

    it("should include runtime as a prerequisite", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.prerequisites.length).toBeGreaterThanOrEqual(1);
      expect(plan.prerequisites[0].name).toBe("Ollama");
      expect(plan.prerequisites[0].checkCommand).toBe("ollama --version");
    });

    it("should include a model download step", () => {
      const plan = generateInstallPlan(makeInput());

      const downloadStep = plan.steps.find((s) =>
        s.command.includes("ollama pull"),
      );
      expect(downloadStep).toBeDefined();
      expect(downloadStep!.reversible).toBe(true);
    });

    it("should include runtime start step for local_server type", () => {
      const plan = generateInstallPlan(makeInput());

      const startStep = plan.steps.find((s) =>
        s.command.includes("ollama serve"),
      );
      expect(startStep).toBeDefined();
    });

    it("should include post-install verification steps", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.postInstallVerification.length).toBeGreaterThanOrEqual(1);
      expect(
        plan.postInstallVerification.some((v) =>
          v.command.includes("ollama --version"),
        ),
      ).toBe(true);
    });

    it("should include resource estimates", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.resourceEstimate.diskSpaceGb).toBe(4.1);
      expect(plan.resourceEstimate.peakRamGb).toBe(12);
      expect(plan.resourceEstimate.requiresNetwork).toBe(true);
    });

    it("should produce a human-readable summary", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.humanSummary).toContain("Test Model 7B");
      expect(plan.humanSummary).toContain("q4_k_m");
      expect(plan.humanSummary).toContain("Ollama");
      expect(plan.humanSummary).toContain("linux");
    });
  });

  // -------------------------------------------------------------------------
  // Supported with limits
  // -------------------------------------------------------------------------

  describe("supported_with_limits case → plan contains limits/warnings", () => {
    it("should add performance warning when compatibility is supported_with_limits", () => {
      const compat: CompatibilityResult = {
        classification: "supported_with_limits",
        bottlenecks: ["ram"],
        limits: {
          gpuOffloadPossible: true,
          estimatedGpuLayers: 20,
          requiresDiskSwap: false,
        },
        settingsAdjustments: [],
        reasons: ["RAM below recommended"],
        warnings: [],
      };

      const plan = generateInstallPlan(makeInput({ compatibility: compat }));

      expect(plan.risks.some((r) => r.includes("reduced performance"))).toBe(true);
    });

    it("should mark GPU layer estimate as approximate/low-confidence", () => {
      const compat: CompatibilityResult = {
        classification: "supported_with_limits",
        bottlenecks: ["vram"],
        limits: {
          gpuOffloadPossible: true,
          estimatedGpuLayers: 20,
          requiresDiskSwap: false,
        },
        settingsAdjustments: [],
        reasons: ["Partial GPU offload"],
        warnings: [],
      };

      const plan = generateInstallPlan(makeInput({ compatibility: compat }));

      const layerRisk = plan.risks.find((r) => r.includes("GPU layers"));
      expect(layerRisk).toBeDefined();
      expect(layerRisk!).toContain("APPROXIMATE");
      expect(layerRisk!).toContain("low-confidence");
    });
  });

  // -------------------------------------------------------------------------
  // Missing runtime / prerequisites
  // -------------------------------------------------------------------------

  describe("missing runtime / prerequisite cases", () => {
    it("should include install instructions for the runtime", () => {
      const plan = generateInstallPlan(makeInput());

      // The linux install instruction should appear as a step
      const installStep = plan.steps.find((s) =>
        s.command.includes("curl -fsSL https://ollama.ai/install.sh"),
      );
      expect(installStep).toBeDefined();
      expect(installStep!.requiresApproval).toBe(true);
    });

    it("should include driver requirements as prerequisites", () => {
      const runtime = makeRuntime({
        requiredDrivers: ["CUDA >= 11.8"],
      });
      const plan = generateInstallPlan(makeInput({ runtime }));

      const cudaPrereq = plan.prerequisites.find((p) =>
        p.name.includes("CUDA"),
      );
      expect(cudaPrereq).toBeDefined();
      expect(cudaPrereq!.checkCommand).toBe("nvidia-smi");
    });
  });

  // -------------------------------------------------------------------------
  // Platform-specific branching
  // -------------------------------------------------------------------------

  describe("platform-specific plan branching", () => {
    it("should produce darwin-specific plan for macOS host", () => {
      const host = makeHost({
        os: {
          platform: certain("darwin"),
          release: certain("23.0.0"),
          arch: certain("arm64"),
        },
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.targetPlatform).toBe("darwin");
      const brewStep = plan.steps.find((s) =>
        s.command.includes("brew install ollama"),
      );
      expect(brewStep).toBeDefined();
    });

    it("should produce linux-specific plan for linux host", () => {
      const plan = generateInstallPlan(makeInput());

      expect(plan.targetPlatform).toBe("linux");
      const curlStep = plan.steps.find((s) =>
        s.command.includes("curl -fsSL"),
      );
      expect(curlStep).toBeDefined();
    });

    it("should fall back to first supported platform when host platform is unknown", () => {
      const host = makeHost({
        os: {
          platform: unknown(),
          release: unknown(),
          arch: unknown(),
        },
      });
      const plan = generateInstallPlan(makeInput({ host }));

      // Falls back to first supported platform of the runtime
      expect(plan.targetPlatform).toBe("linux");
    });
  });

  // -------------------------------------------------------------------------
  // Uncertain host data
  // -------------------------------------------------------------------------

  describe("uncertain host data reflected in plan warnings", () => {
    it("should warn when platform detection is uncertain", () => {
      const host = makeHost({
        os: {
          platform: estimated("linux"),
          release: estimated("6.1.0"),
          arch: estimated("x64"),
        },
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.risks.some((r) => r.includes("platform detection is uncertain"))).toBe(true);
    });

    it("should warn when RAM is unknown", () => {
      const host = makeHost({
        memory: {
          totalGb: unknown(),
          availableGb: unknown(),
        },
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.risks.some((r) => r.includes("RAM is unknown"))).toBe(true);
    });

    it("should warn when RAM is estimated", () => {
      const host = makeHost({
        memory: {
          totalGb: estimated(64),
          availableGb: estimated(48),
        },
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.risks.some((r) => r.includes("RAM is estimated"))).toBe(true);
    });

    it("should warn when GPU VRAM is unknown", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: unknown() }),
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.risks.some((r) => r.includes("VRAM is unknown"))).toBe(true);
    });

    it("should warn when GPU VRAM is estimated", () => {
      const host = makeHost({
        gpu: makeGpu({ vramGb: estimated(24) }),
      });
      const plan = generateInstallPlan(makeInput({ host }));

      expect(plan.risks.some((r) => r.includes("VRAM is estimated"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Determinism
  // -------------------------------------------------------------------------

  describe("deterministic planning", () => {
    it("should produce identical plans for identical inputs", () => {
      const input = makeInput();
      const plan1 = generateInstallPlan(input);
      const plan2 = generateInstallPlan(input);

      expect(plan1).toEqual(plan2);
    });

    it("should produce identical plans across multiple calls", () => {
      const input = makeInput();
      const plans = Array.from({ length: 5 }, () => generateInstallPlan(input));

      for (let i = 1; i < plans.length; i++) {
        expect(plans[i]).toEqual(plans[0]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Curl pipe risk
  // -------------------------------------------------------------------------

  describe("curl pipe install script risk", () => {
    it("should add caution risk for curl-pipe runtime install", () => {
      const plan = generateInstallPlan(makeInput());

      expect(
        plan.risks.some((r) => r.includes("piped download script")),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // No pull command
  // -------------------------------------------------------------------------

  describe("artifact without pull command", () => {
    it("should produce plan without download step if no pullCommand or downloadUrl", () => {
      const artifact = makeArtifact({
        pullCommand: undefined,
        downloadUrl: undefined,
      });
      const plan = generateInstallPlan(makeInput({ artifact }));

      const downloadStep = plan.steps.find((s) =>
        s.description.includes("Download"),
      );
      expect(downloadStep).toBeUndefined();
      expect(plan.resourceEstimate.requiresNetwork).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // CLI tool runtime (no start step)
  // -------------------------------------------------------------------------

  describe("CLI tool runtime", () => {
    it("should not include a start step for cli_tool type runtimes", () => {
      const runtime = makeRuntime({
        id: "llama-cpp",
        displayName: "llama.cpp",
        type: "cli_tool",
      });
      const plan = generateInstallPlan(makeInput({ runtime }));

      const startStep = plan.steps.find((s) =>
        s.description.includes("Start"),
      );
      expect(startStep).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Disk swap risk from compatibility
  // -------------------------------------------------------------------------

  describe("disk swap risk", () => {
    it("should include disk swap risk when compatibility reports it", () => {
      const compat: CompatibilityResult = {
        classification: "supported_with_limits",
        bottlenecks: ["ram"],
        limits: {
          gpuOffloadPossible: true,
          requiresDiskSwap: true,
        },
        settingsAdjustments: [],
        reasons: [],
        warnings: [],
      };
      const plan = generateInstallPlan(makeInput({ compatibility: compat }));

      expect(plan.risks.some((r) => r.includes("disk swap"))).toBe(true);
    });
  });
});
