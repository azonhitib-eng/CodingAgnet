import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import {
  loadCatalogBundle,
  loadCatalogBundleSync,
} from "../../src/catalog/bundle.js";
import { CatalogError } from "../../src/catalog/errors.js";
import type { CatalogPaths } from "../../src/catalog/bundle.js";

// ---------------------------------------------------------------------------
// Paths to real example data
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");

const EXAMPLE_PATHS: CatalogPaths = {
  models: join(DATA_DIR, "models"),
  runtimes: join(DATA_DIR, "runtimes"),
  agentTools: join(DATA_DIR, "agent-tools"),
};

// ---------------------------------------------------------------------------
// Temp directory helpers for broken-data tests
// ---------------------------------------------------------------------------

const TMP_ROOT = join(import.meta.dirname, "../../.tmp-bundle-tests");

function tmpPaths(): CatalogPaths {
  return {
    models: join(TMP_ROOT, "models"),
    runtimes: join(TMP_ROOT, "runtimes"),
    agentTools: join(TMP_ROOT, "agent-tools"),
  };
}

function setupTmpDirs(): void {
  const p = tmpPaths();
  mkdirSync(p.models, { recursive: true });
  mkdirSync(p.runtimes, { recursive: true });
  mkdirSync(p.agentTools, { recursive: true });
}

function teardownTmpDirs(): void {
  rmSync(TMP_ROOT, { recursive: true, force: true });
}

/** Write a minimal valid runtime manifest. */
function writeRuntime(id: string): void {
  const p = tmpPaths();
  writeFileSync(
    join(p.runtimes, `${id}.json`),
    JSON.stringify({
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      runtime: {
        id,
        displayName: id,
        type: "cli_tool",
        detectionCommand: `${id} --version`,
        versionCommand: `${id} --version`,
        supportedPlatforms: ["linux"],
        installInstructions: { linux: [`install ${id}`] },
        status: "supported",
      },
    }),
  );
}

/** Write a minimal valid model manifest. */
function writeModel(familyId: string, runtimeId: string): void {
  const p = tmpPaths();
  writeFileSync(
    join(p.models, `${familyId}.json`),
    JSON.stringify({
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      family: {
        id: familyId,
        displayName: familyId,
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
          id: `${familyId}-7b`,
          familyId,
          displayName: `${familyId} 7B`,
          parameterLabel: "7B",
          sizeClass: "small",
          status: "supported",
        },
      ],
      artifacts: [
        {
          id: `${familyId}-7b-q4-${runtimeId}`,
          variantId: `${familyId}-7b`,
          runtimeId,
          quantization: "q4_k_m",
          minimumRamGb: 6,
          recommendedRamGb: 8,
          minimumVramGb: 4,
          recommendedVramGb: 6,
          status: "supported",
        },
      ],
    }),
  );
}

/** Write a minimal valid agent-tool manifest. */
function writeTool(toolId: string, requiredRuntimes: string[]): void {
  const p = tmpPaths();
  writeFileSync(
    join(p.agentTools, `${toolId}.json`),
    JSON.stringify({
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      tool: {
        id: toolId,
        displayName: toolId,
        purpose: "testing",
        requiredRuntimes,
        hostAssumptions: [],
        suitableUseCases: ["test"],
        warnings: [],
        installInstructions: { linux: ["echo ok"] },
        supportedPlatforms: ["linux"],
        status: "supported",
      },
    }),
  );
}

// ===========================================================================
// Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// Valid bundle — example data (async)
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — valid example data (async)", () => {
  it("loads successfully and returns all catalogs", async () => {
    const bundle = await loadCatalogBundle(EXAMPLE_PATHS);
    expect(bundle.runtimes.count).toBe(2);
    expect(bundle.models.familyCount).toBe(4);
    expect(bundle.agentTools.count).toBe(2);
  });

  it("populates model variants and artifacts", async () => {
    const bundle = await loadCatalogBundle(EXAMPLE_PATHS);
    expect(bundle.models.variantCount).toBeGreaterThanOrEqual(1);
    expect(bundle.models.artifactCount).toBeGreaterThanOrEqual(1);
  });

  it("makes catalogs queryable after load", async () => {
    const bundle = await loadCatalogBundle(EXAMPLE_PATHS);
    expect(bundle.runtimes.get("ollama")?.displayName).toBe("Ollama");
    expect(bundle.models.getFamily("codellama")?.provider).toBe("Meta");
    expect(bundle.agentTools.get("aider")?.purpose).toContain("pair programming");
  });
});

// ---------------------------------------------------------------------------
// Valid bundle — example data (sync)
// ---------------------------------------------------------------------------

describe("loadCatalogBundleSync — valid example data", () => {
  it("loads successfully and returns all catalogs", () => {
    const bundle = loadCatalogBundleSync(EXAMPLE_PATHS);
    expect(bundle.runtimes.count).toBe(2);
    expect(bundle.models.familyCount).toBe(4);
    expect(bundle.agentTools.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Valid bundle — synthetic minimal data
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — synthetic valid data", () => {
  beforeEach(() => {
    setupTmpDirs();
    writeRuntime("test-rt");
    writeModel("test-model", "test-rt");
    writeTool("test-tool", ["test-rt"]);
  });

  afterEach(teardownTmpDirs);

  it("loads a minimal valid bundle (async)", async () => {
    const bundle = await loadCatalogBundle(tmpPaths());
    expect(bundle.runtimes.count).toBe(1);
    expect(bundle.models.familyCount).toBe(1);
    expect(bundle.agentTools.count).toBe(1);
  });

  it("loads a minimal valid bundle (sync)", () => {
    const bundle = loadCatalogBundleSync(tmpPaths());
    expect(bundle.runtimes.count).toBe(1);
    expect(bundle.models.familyCount).toBe(1);
    expect(bundle.agentTools.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Broken runtime reference — model artifact → runtime
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — broken model→runtime reference", () => {
  beforeEach(() => {
    setupTmpDirs();
    writeRuntime("rt-a");
    writeModel("model-x", "nonexistent-runtime"); // bad ref
  });

  afterEach(teardownTmpDirs);

  it("rejects with REFERENCE_INTEGRITY_ERROR (async)", async () => {
    await expect(loadCatalogBundle(tmpPaths())).rejects.toThrow(CatalogError);
    await expect(loadCatalogBundle(tmpPaths())).rejects.toMatchObject({
      code: "REFERENCE_INTEGRITY_ERROR",
    });
  });

  it("error message mentions the bad runtime id", async () => {
    try {
      await loadCatalogBundle(tmpPaths());
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as CatalogError).message).toContain("nonexistent-runtime");
    }
  });

  it("rejects with REFERENCE_INTEGRITY_ERROR (sync)", () => {
    expect(() => loadCatalogBundleSync(tmpPaths())).toThrow(CatalogError);
    try {
      loadCatalogBundleSync(tmpPaths());
    } catch (err) {
      expect((err as CatalogError).code).toBe("REFERENCE_INTEGRITY_ERROR");
      expect((err as CatalogError).message).toContain("nonexistent-runtime");
    }
  });
});

// ---------------------------------------------------------------------------
// Broken runtime reference — agent-tool → runtime
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — broken tool→runtime reference", () => {
  beforeEach(() => {
    setupTmpDirs();
    writeRuntime("rt-ok");
    writeTool("bad-tool", ["missing-rt"]); // bad ref
  });

  afterEach(teardownTmpDirs);

  it("rejects with REFERENCE_INTEGRITY_ERROR (async)", async () => {
    await expect(loadCatalogBundle(tmpPaths())).rejects.toThrow(CatalogError);
    await expect(loadCatalogBundle(tmpPaths())).rejects.toMatchObject({
      code: "REFERENCE_INTEGRITY_ERROR",
    });
  });

  it("error message mentions the tool and missing runtime", async () => {
    try {
      await loadCatalogBundle(tmpPaths());
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as CatalogError;
      expect(e.message).toContain("bad-tool");
      expect(e.message).toContain("missing-rt");
    }
  });
});

// ---------------------------------------------------------------------------
// Unsupported schema version
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — unsupported schemaVersion", () => {
  beforeEach(() => {
    setupTmpDirs();
    // Write a runtime with a bad schemaVersion.
    const p = tmpPaths();
    writeFileSync(
      join(p.runtimes, "bad-version.json"),
      JSON.stringify({
        schemaVersion: "99.0.0",
        manifestVersion: "1",
        runtime: {
          id: "v99-rt",
          displayName: "v99",
          type: "cli_tool",
          detectionCommand: "x",
          versionCommand: "x",
          supportedPlatforms: ["linux"],
          installInstructions: { linux: ["x"] },
          status: "supported",
        },
      }),
    );
  });

  afterEach(teardownTmpDirs);

  it("rejects with SCHEMA_VERSION_UNSUPPORTED (async)", async () => {
    await expect(loadCatalogBundle(tmpPaths())).rejects.toThrow(CatalogError);
    await expect(loadCatalogBundle(tmpPaths())).rejects.toMatchObject({
      code: "SCHEMA_VERSION_UNSUPPORTED",
    });
  });

  it("error mentions the bad version", async () => {
    try {
      await loadCatalogBundle(tmpPaths());
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as CatalogError).message).toContain("99.0.0");
    }
  });

  it("rejects with SCHEMA_VERSION_UNSUPPORTED (sync)", () => {
    expect(() => loadCatalogBundleSync(tmpPaths())).toThrow(CatalogError);
    try {
      loadCatalogBundleSync(tmpPaths());
    } catch (err) {
      expect((err as CatalogError).code).toBe("SCHEMA_VERSION_UNSUPPORTED");
    }
  });
});

// ---------------------------------------------------------------------------
// Missing directory
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — missing directory", () => {
  it("rejects with FILE_READ_ERROR (async)", async () => {
    await expect(
      loadCatalogBundle({
        models: "/tmp/nonexistent-dir",
        runtimes: "/tmp/nonexistent-dir",
        agentTools: "/tmp/nonexistent-dir",
      }),
    ).rejects.toThrow(CatalogError);
    await expect(
      loadCatalogBundle({
        models: "/tmp/nonexistent-dir",
        runtimes: "/tmp/nonexistent-dir",
        agentTools: "/tmp/nonexistent-dir",
      }),
    ).rejects.toMatchObject({ code: "FILE_READ_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// Empty directories (valid — just produces empty catalogs)
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — empty directories", () => {
  beforeEach(setupTmpDirs);
  afterEach(teardownTmpDirs);

  it("returns empty catalogs (async)", async () => {
    const bundle = await loadCatalogBundle(tmpPaths());
    expect(bundle.runtimes.count).toBe(0);
    expect(bundle.models.familyCount).toBe(0);
    expect(bundle.agentTools.count).toBe(0);
  });

  it("returns empty catalogs (sync)", () => {
    const bundle = loadCatalogBundleSync(tmpPaths());
    expect(bundle.runtimes.count).toBe(0);
    expect(bundle.models.familyCount).toBe(0);
    expect(bundle.agentTools.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error context enrichment
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — error context", () => {
  beforeEach(() => {
    setupTmpDirs();
    writeRuntime("rt-ok");
    writeModel("model-bad", "phantom-runtime"); // will fail cross-catalog
  });

  afterEach(teardownTmpDirs);

  it("REFERENCE_INTEGRITY_ERROR has manifestType and entityId in details", async () => {
    try {
      await loadCatalogBundle(tmpPaths());
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as CatalogError;
      expect(e.code).toBe("REFERENCE_INTEGRITY_ERROR");
      expect(e.details?.manifestType).toBe("model");
      expect(e.details?.entityId).toBe("model-bad-7b-q4-phantom-runtime");
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicate ID through bundle loading
// ---------------------------------------------------------------------------

describe("loadCatalogBundle — duplicate id through bundle", () => {
  beforeEach(() => {
    setupTmpDirs();
    writeRuntime("dup-rt");
    // Write two model manifests with the same family id
    const p = tmpPaths();
    const manifest = {
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      family: {
        id: "same-family",
        displayName: "Same",
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
          id: "same-family-7b",
          familyId: "same-family",
          displayName: "Same 7B",
          parameterLabel: "7B",
          sizeClass: "small",
          status: "supported",
        },
      ],
      artifacts: [
        {
          id: "same-family-7b-q4",
          variantId: "same-family-7b",
          runtimeId: "dup-rt",
          quantization: "q4_k_m",
          minimumRamGb: 6,
          recommendedRamGb: 8,
          minimumVramGb: 4,
          recommendedVramGb: 6,
          status: "supported",
        },
      ],
    };
    writeFileSync(join(p.models, "a.json"), JSON.stringify(manifest));
    writeFileSync(join(p.models, "b.json"), JSON.stringify(manifest));
  });

  afterEach(teardownTmpDirs);

  it("rejects with DUPLICATE_ID", async () => {
    await expect(loadCatalogBundle(tmpPaths())).rejects.toThrow(CatalogError);
    await expect(loadCatalogBundle(tmpPaths())).rejects.toMatchObject({
      code: "DUPLICATE_ID",
    });
  });
});
