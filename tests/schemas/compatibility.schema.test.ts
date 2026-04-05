import { describe, it, expect } from "vitest";
import {
  CompatibilityResultSchema,
  CompatibilityClassSchema,
  BottleneckCategorySchema,
  OperatingLimitsSchema,
  SettingsAdjustmentSchema,
} from "../../src/schemas/compatibility.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validResult = {
  classification: "supported_with_limits" as const,
  bottlenecks: ["vram"] as const,
  limits: {
    effectiveContextWindow: 32768,
    gpuOffloadPossible: true,
    estimatedGpuLayers: 28,
    requiresDiskSwap: false,
  },
  settingsAdjustments: [
    {
      parameter: "num_gpu_layers",
      suggestedValue: "28",
      reason: "VRAM can hold 28 of 32 layers",
    },
  ],
  reasons: [
    "VRAM (8 GB) is below recommended 12 GB for this artifact",
    "Partial GPU offload will be used",
  ],
  warnings: ["Performance may degrade under heavy context"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompatibilityClassSchema", () => {
  it.each([
    "supported",
    "supported_with_limits",
    "cpu_only_slow",
    "unsupported",
  ])("accepts '%s'", (v) => {
    expect(CompatibilityClassSchema.safeParse(v).success).toBe(true);
  });

  it("rejects unknown class", () => {
    expect(CompatibilityClassSchema.safeParse("maybe").success).toBe(false);
  });
});

describe("BottleneckCategorySchema", () => {
  it.each([
    "ram",
    "vram",
    "cpu",
    "disk",
    "driver",
    "runtime_missing",
    "os_incompatible",
    "unknown",
  ])("accepts '%s'", (v) => {
    expect(BottleneckCategorySchema.safeParse(v).success).toBe(true);
  });
});

describe("OperatingLimitsSchema", () => {
  it("accepts full limits", () => {
    expect(OperatingLimitsSchema.safeParse(validResult.limits).success).toBe(
      true,
    );
  });

  it("accepts minimal limits", () => {
    expect(
      OperatingLimitsSchema.safeParse({
        gpuOffloadPossible: false,
        requiresDiskSwap: true,
      }).success,
    ).toBe(true);
  });
});

describe("SettingsAdjustmentSchema", () => {
  it("accepts valid adjustment", () => {
    expect(
      SettingsAdjustmentSchema.safeParse(validResult.settingsAdjustments[0])
        .success,
    ).toBe(true);
  });

  it("rejects empty parameter", () => {
    expect(
      SettingsAdjustmentSchema.safeParse({
        parameter: "",
        suggestedValue: "28",
        reason: "test",
      }).success,
    ).toBe(false);
  });
});

describe("CompatibilityResultSchema", () => {
  it("accepts a valid result", () => {
    expect(CompatibilityResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("accepts fully supported result with empty bottlenecks", () => {
    const full = {
      classification: "supported",
      bottlenecks: [],
      limits: {
        gpuOffloadPossible: true,
        requiresDiskSwap: false,
      },
      settingsAdjustments: [],
      reasons: ["All requirements met"],
      warnings: [],
    };
    expect(CompatibilityResultSchema.safeParse(full).success).toBe(true);
  });

  it("accepts unsupported result with multiple bottlenecks", () => {
    const unsup = {
      classification: "unsupported",
      bottlenecks: ["ram", "vram", "runtime_missing"],
      limits: {
        gpuOffloadPossible: false,
        requiresDiskSwap: false,
      },
      settingsAdjustments: [],
      reasons: ["Insufficient RAM", "No GPU", "Ollama not installed"],
      warnings: [],
    };
    expect(CompatibilityResultSchema.safeParse(unsup).success).toBe(true);
  });

  it("round-trips through JSON", () => {
    const first = CompatibilityResultSchema.parse(validResult);
    const second = CompatibilityResultSchema.safeParse(
      JSON.parse(JSON.stringify(first)),
    );
    expect(second.success).toBe(true);
  });
});
