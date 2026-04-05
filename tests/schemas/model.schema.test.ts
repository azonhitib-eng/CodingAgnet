import { describe, it, expect } from "vitest";
import {
  ModelFamilySchema,
  ModelVariantSchema,
  ModelArtifactSchema,
  ModelManifestSchema,
  CatalogStatusSchema,
  SizeClassSchema,
  ModelCapabilitiesSchema,
} from "../../src/schemas/model.schema.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validCapabilities = {
  coding: true,
  agenticToolUse: true,
  autocomplete: false,
  longContext: true,
};

const validFamily = {
  id: "deepseek-coder-v2",
  displayName: "DeepSeek Coder V2",
  provider: "deepseek-ai",
  url: "https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Instruct",
  description: "Strong open-source coding model",
  capabilities: validCapabilities,
  status: "supported" as const,
};

const validVariant = {
  id: "deepseek-coder-v2-16b",
  familyId: "deepseek-coder-v2",
  displayName: "DeepSeek Coder V2 16B",
  parameterLabel: "16B",
  sizeClass: "medium" as const,
  contextWindow: 128000,
  status: "supported" as const,
};

const validArtifact = {
  id: "deepseek-coder-v2-16b-q4_k_m-ollama",
  variantId: "deepseek-coder-v2-16b",
  runtimeId: "ollama",
  quantization: "q4_k_m",
  fileSizeGb: 9.1,
  minimumRamGb: 12,
  recommendedRamGb: 16,
  minimumVramGb: 8,
  recommendedVramGb: 12,
  pullCommand: "ollama pull deepseek-coder-v2:16b-instruct-q4_K_M",
  status: "supported" as const,
};

const validManifest = {
  schemaVersion: "1.0.0",
  manifestVersion: "1",
  family: validFamily,
  variants: [validVariant],
  artifacts: [validArtifact],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CatalogStatusSchema", () => {
  it.each(["supported", "experimental", "deprecated"])(
    "accepts '%s'",
    (v) => {
      expect(CatalogStatusSchema.safeParse(v).success).toBe(true);
    },
  );

  it("rejects unknown status", () => {
    expect(CatalogStatusSchema.safeParse("beta").success).toBe(false);
  });
});

describe("SizeClassSchema", () => {
  it.each(["tiny", "small", "medium", "large", "xlarge"])(
    "accepts '%s'",
    (v) => {
      expect(SizeClassSchema.safeParse(v).success).toBe(true);
    },
  );

  it("rejects unknown size", () => {
    expect(SizeClassSchema.safeParse("mega").success).toBe(false);
  });
});

describe("ModelCapabilitiesSchema", () => {
  it("accepts valid capabilities", () => {
    expect(ModelCapabilitiesSchema.safeParse(validCapabilities).success).toBe(
      true,
    );
  });

  it("rejects missing field", () => {
    const { coding: _, ...partial } = validCapabilities;
    expect(ModelCapabilitiesSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects non-boolean", () => {
    expect(
      ModelCapabilitiesSchema.safeParse({ ...validCapabilities, coding: 1 })
        .success,
    ).toBe(false);
  });
});

describe("ModelFamilySchema", () => {
  it("accepts a valid family", () => {
    expect(ModelFamilySchema.safeParse(validFamily).success).toBe(true);
  });

  it("rejects empty id", () => {
    expect(
      ModelFamilySchema.safeParse({ ...validFamily, id: "" }).success,
    ).toBe(false);
  });

  it("rejects invalid URL", () => {
    expect(
      ModelFamilySchema.safeParse({ ...validFamily, url: "not-a-url" }).success,
    ).toBe(false);
  });

  it("accepts without optional fields", () => {
    const { url: _, description: _d, ...minimal } = validFamily;
    expect(ModelFamilySchema.safeParse(minimal).success).toBe(true);
  });
});

describe("ModelVariantSchema", () => {
  it("accepts a valid variant", () => {
    expect(ModelVariantSchema.safeParse(validVariant).success).toBe(true);
  });

  it("rejects invalid sizeClass", () => {
    expect(
      ModelVariantSchema.safeParse({ ...validVariant, sizeClass: "huge" })
        .success,
    ).toBe(false);
  });

  it("rejects negative contextWindow", () => {
    expect(
      ModelVariantSchema.safeParse({ ...validVariant, contextWindow: -1 })
        .success,
    ).toBe(false);
  });

  it("accepts partial capabilityOverrides", () => {
    const v = {
      ...validVariant,
      capabilityOverrides: { longContext: false },
    };
    expect(ModelVariantSchema.safeParse(v).success).toBe(true);
  });
});

describe("ModelArtifactSchema", () => {
  it("accepts a valid artifact", () => {
    expect(ModelArtifactSchema.safeParse(validArtifact).success).toBe(true);
  });

  it("rejects negative RAM values", () => {
    expect(
      ModelArtifactSchema.safeParse({ ...validArtifact, minimumRamGb: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { runtimeId: _, ...partial } = validArtifact;
    expect(ModelArtifactSchema.safeParse(partial).success).toBe(false);
  });

  it("accepts a custom quantization string", () => {
    expect(
      ModelArtifactSchema.safeParse({
        ...validArtifact,
        quantization: "custom_quant_v1",
      }).success,
    ).toBe(true);
  });

  it("rejects empty quantization string", () => {
    expect(
      ModelArtifactSchema.safeParse({
        ...validArtifact,
        quantization: "",
      }).success,
    ).toBe(false);
  });
});

describe("ModelManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(ModelManifestSchema.safeParse(validManifest).success).toBe(true);
  });

  it("requires schemaVersion", () => {
    const { schemaVersion: _, ...noVer } = validManifest;
    expect(ModelManifestSchema.safeParse(noVer).success).toBe(false);
  });

  it("requires manifestVersion", () => {
    const { manifestVersion: _, ...noVer } = validManifest;
    expect(ModelManifestSchema.safeParse(noVer).success).toBe(false);
  });

  it("requires at least one variant", () => {
    expect(
      ModelManifestSchema.safeParse({ ...validManifest, variants: [] }).success,
    ).toBe(false);
  });

  it("requires at least one artifact", () => {
    expect(
      ModelManifestSchema.safeParse({ ...validManifest, artifacts: [] })
        .success,
    ).toBe(false);
  });

  it("round-trips: parse → data → reparse", () => {
    const first = ModelManifestSchema.parse(validManifest);
    const second = ModelManifestSchema.safeParse(JSON.parse(JSON.stringify(first)));
    expect(second.success).toBe(true);
  });
});
