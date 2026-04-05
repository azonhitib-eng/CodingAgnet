import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { ModelCatalog } from "../../src/catalog/model-catalog.js";
import { RuntimeRegistry } from "../../src/catalog/runtime-registry.js";
import { CatalogError } from "../../src/catalog/errors.js";
import { loadManifestSync } from "../../src/catalog/loader.js";
import { ModelManifestSchema } from "../../src/schemas/model.schema.js";
import { RuntimeManifestSchema } from "../../src/schemas/runtime.schema.js";
import type { ModelManifest } from "../../src/types/model.js";

const DATA_DIR = join(import.meta.dirname, "../../data");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadAllModels(): ModelCatalog {
  const catalog = new ModelCatalog();
  for (const name of [
    "deepseek-coder-v2",
    "qwen-2.5-coder",
    "codellama",
    "starcoder2",
  ]) {
    const m = loadManifestSync(
      join(DATA_DIR, `models/${name}.json`),
      ModelManifestSchema,
    );
    catalog.addManifest(m);
  }
  return catalog;
}

function loadAllRuntimes(): RuntimeRegistry {
  const reg = new RuntimeRegistry();
  for (const name of ["ollama", "llamacpp"]) {
    const m = loadManifestSync(
      join(DATA_DIR, `runtimes/${name}.json`),
      RuntimeManifestSchema,
    );
    reg.addManifest(m);
  }
  return reg;
}

// Minimal valid manifest factory
function makeModelManifest(
  overrides: Partial<{
    familyId: string;
    variantId: string;
    variantFamilyId: string;
    artifactId: string;
    artifactVariantId: string;
    artifactRuntimeId: string;
  }> = {},
): ModelManifest {
  const familyId = overrides.familyId ?? "test-family";
  const variantId = overrides.variantId ?? "test-variant";
  return {
    schemaVersion: "1.0.0",
    manifestVersion: "1",
    family: {
      id: familyId,
      displayName: "Test Family",
      provider: "test",
      capabilities: {
        coding: true,
        agenticToolUse: false,
        autocomplete: false,
        longContext: false,
      },
      status: "supported",
    },
    variants: [
      {
        id: variantId,
        familyId: overrides.variantFamilyId ?? familyId,
        displayName: "Test Variant",
        parameterLabel: "7B",
        sizeClass: "small",
        status: "supported",
      },
    ],
    artifacts: [
      {
        id: overrides.artifactId ?? "test-artifact",
        variantId: overrides.artifactVariantId ?? variantId,
        runtimeId: overrides.artifactRuntimeId ?? "ollama",
        quantization: "q4_k_m",
        minimumRamGb: 6,
        recommendedRamGb: 8,
        minimumVramGb: 4,
        recommendedVramGb: 6,
        status: "supported",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Loading from example data
// ---------------------------------------------------------------------------

describe("ModelCatalog — loading example data", () => {
  let catalog: ModelCatalog;

  beforeEach(() => {
    catalog = loadAllModels();
  });

  it("loads all model families", () => {
    expect(catalog.familyCount).toBe(4);
  });

  it("loads all variants", () => {
    // deepseek:2, qwen:2, codellama:3, starcoder2:1 = 8
    expect(catalog.variantCount).toBe(8);
  });

  it("loads all artifacts", () => {
    // deepseek:3, qwen:3, codellama:3, starcoder2:1 = 10
    expect(catalog.artifactCount).toBe(10);
  });

  it("preserves manifest versions", () => {
    expect(catalog.getManifestVersion("deepseek-coder-v2")).toBe("1");
    expect(catalog.getManifestVersion("codellama")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Queries — by ID
// ---------------------------------------------------------------------------

describe("ModelCatalog — getById", () => {
  let catalog: ModelCatalog;

  beforeEach(() => {
    catalog = loadAllModels();
  });

  it("returns family by id", () => {
    expect(catalog.getFamily("codellama")?.displayName).toBe("Code Llama");
  });

  it("returns undefined for unknown family", () => {
    expect(catalog.getFamily("nonexistent")).toBeUndefined();
  });

  it("returns variant by id", () => {
    expect(catalog.getVariant("qwen-2.5-coder-7b")?.parameterLabel).toBe("7B");
  });

  it("returns artifact by id", () => {
    const a = catalog.getArtifact("codellama-34b-q4_k_m-ollama");
    expect(a?.quantization).toBe("q4_k_m");
    expect(a?.runtimeId).toBe("ollama");
  });
});

// ---------------------------------------------------------------------------
// Queries — filtered
// ---------------------------------------------------------------------------

describe("ModelCatalog — filtering", () => {
  let catalog: ModelCatalog;

  beforeEach(() => {
    catalog = loadAllModels();
  });

  it("filters families by status", () => {
    const supported = catalog.filterFamiliesByStatus("supported");
    expect(supported.length).toBe(3); // deepseek, qwen, codellama
    const experimental = catalog.filterFamiliesByStatus("experimental");
    expect(experimental.length).toBe(1); // starcoder2
  });

  it("filters families by capability", () => {
    const agentic = catalog.filterFamiliesByCapability("agenticToolUse");
    expect(agentic.length).toBe(1);
    expect(agentic[0].id).toBe("deepseek-coder-v2");
  });

  it("filters artifacts by runtime", () => {
    const ollama = catalog.filterArtifactsByRuntime("ollama");
    expect(ollama.length).toBe(9); // all except 1 llamacpp
    const llamacpp = catalog.filterArtifactsByRuntime("llamacpp");
    expect(llamacpp.length).toBe(1);
  });

  it("filters artifacts by status", () => {
    const exp = catalog.filterArtifactsByStatus("experimental");
    expect(exp.length).toBe(2); // deepseek 236b + starcoder2
  });
});

// ---------------------------------------------------------------------------
// Queries — relational
// ---------------------------------------------------------------------------

describe("ModelCatalog — relational queries", () => {
  let catalog: ModelCatalog;

  beforeEach(() => {
    catalog = loadAllModels();
  });

  it("lists variants for a family", () => {
    const variants = catalog.listVariantsForFamily("codellama");
    expect(variants.length).toBe(3);
    const labels = variants.map((v) => v.parameterLabel).sort();
    expect(labels).toEqual(["13B", "34B", "7B"]);
  });

  it("lists artifacts for a variant", () => {
    const arts = catalog.listArtifactsForVariant("qwen-2.5-coder-7b");
    expect(arts.length).toBe(2); // ollama + llamacpp
    const runtimes = arts.map((a) => a.runtimeId).sort();
    expect(runtimes).toEqual(["llamacpp", "ollama"]);
  });

  it("lists artifacts for a family", () => {
    const arts = catalog.listArtifactsForFamily("deepseek-coder-v2");
    expect(arts.length).toBe(3);
  });

  it("returns empty for unknown family", () => {
    expect(catalog.listVariantsForFamily("nope")).toEqual([]);
    expect(catalog.listArtifactsForFamily("nope")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Duplicate ID rejection
// ---------------------------------------------------------------------------

describe("ModelCatalog — duplicate id rejection", () => {
  it("rejects duplicate family id", () => {
    const catalog = new ModelCatalog();
    catalog.addManifest(makeModelManifest());
    expect(() => catalog.addManifest(makeModelManifest())).toThrow(
      CatalogError,
    );
    expect(() => catalog.addManifest(makeModelManifest())).toThrow(
      /Duplicate model family/,
    );
  });

  it("rejects duplicate variant id across manifests", () => {
    const catalog = new ModelCatalog();
    catalog.addManifest(makeModelManifest({ familyId: "f1", variantId: "shared-v" }));
    expect(() =>
      catalog.addManifest(
        makeModelManifest({
          familyId: "f2",
          variantId: "shared-v",
          artifactId: "a2",
        }),
      ),
    ).toThrow(/Duplicate model variant/);
  });

  it("rejects duplicate artifact id across manifests", () => {
    const catalog = new ModelCatalog();
    catalog.addManifest(
      makeModelManifest({ familyId: "f1", variantId: "v1", artifactId: "shared-a" }),
    );
    expect(() =>
      catalog.addManifest(
        makeModelManifest({ familyId: "f2", variantId: "v2", artifactId: "shared-a" }),
      ),
    ).toThrow(/Duplicate model artifact/);
  });
});

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

describe("ModelCatalog — referential integrity", () => {
  it("rejects variant whose familyId does not match manifest family", () => {
    expect(() =>
      new ModelCatalog().addManifest(
        makeModelManifest({ variantFamilyId: "wrong-family" }),
      ),
    ).toThrow(CatalogError);
    expect(() =>
      new ModelCatalog().addManifest(
        makeModelManifest({ variantFamilyId: "wrong-family" }),
      ),
    ).toThrow(/familyId/);
  });

  it("rejects artifact whose variantId is not in manifest", () => {
    expect(() =>
      new ModelCatalog().addManifest(
        makeModelManifest({ artifactVariantId: "nonexistent-variant" }),
      ),
    ).toThrow(CatalogError);
    expect(() =>
      new ModelCatalog().addManifest(
        makeModelManifest({ artifactVariantId: "nonexistent-variant" }),
      ),
    ).toThrow(/variantId/);
  });

  it("validateRuntimeReferences rejects unknown runtimeId", () => {
    const catalog = new ModelCatalog();
    catalog.addManifest(
      makeModelManifest({ artifactRuntimeId: "unknown-runtime" }),
    );
    expect(() =>
      catalog.validateRuntimeReferences(new Set(["ollama"])),
    ).toThrow(CatalogError);
    expect(() =>
      catalog.validateRuntimeReferences(new Set(["ollama"])),
    ).toThrow(/runtimeId.*unknown-runtime/);
  });

  it("validateRuntimeReferences passes with known runtime", () => {
    const catalog = new ModelCatalog();
    catalog.addManifest(makeModelManifest({ artifactRuntimeId: "ollama" }));
    expect(() =>
      catalog.validateRuntimeReferences(new Set(["ollama"])),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Empty catalog behavior
// ---------------------------------------------------------------------------

describe("ModelCatalog — empty catalog", () => {
  it("has zero counts", () => {
    const catalog = new ModelCatalog();
    expect(catalog.familyCount).toBe(0);
    expect(catalog.variantCount).toBe(0);
    expect(catalog.artifactCount).toBe(0);
  });

  it("returns empty lists", () => {
    const catalog = new ModelCatalog();
    expect(catalog.listFamilies()).toEqual([]);
    expect(catalog.listVariants()).toEqual([]);
    expect(catalog.listArtifacts()).toEqual([]);
  });

  it("returns undefined for getById", () => {
    const catalog = new ModelCatalog();
    expect(catalog.getFamily("x")).toBeUndefined();
    expect(catalog.getVariant("x")).toBeUndefined();
    expect(catalog.getArtifact("x")).toBeUndefined();
  });

  it("filters return empty", () => {
    const catalog = new ModelCatalog();
    expect(catalog.filterFamiliesByStatus("supported")).toEqual([]);
    expect(catalog.filterFamiliesByCapability("coding")).toEqual([]);
    expect(catalog.filterArtifactsByRuntime("ollama")).toEqual([]);
  });

  it("validateRuntimeReferences on empty catalog is fine", () => {
    expect(() =>
      new ModelCatalog().validateRuntimeReferences(new Set()),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-catalog integration
// ---------------------------------------------------------------------------

describe("ModelCatalog + RuntimeRegistry integration", () => {
  it("full example data passes cross-catalog validation", () => {
    const runtimes = loadAllRuntimes();
    const catalog = loadAllModels();
    expect(() =>
      catalog.validateRuntimeReferences(runtimes.knownIds),
    ).not.toThrow();
  });
});
