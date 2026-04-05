import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  loadManifest,
  loadManifestSync,
  parseManifest,
  SUPPORTED_SCHEMA_VERSION,
} from "../../src/catalog/loader.js";
import { CatalogError } from "../../src/catalog/errors.js";
import { ModelManifestSchema } from "../../src/schemas/model.schema.js";
import { RuntimeManifestSchema } from "../../src/schemas/runtime.schema.js";
import { AgentToolManifestSchema } from "../../src/schemas/agent-tool.schema.js";

const DATA_DIR = join(import.meta.dirname, "../../data");

// ---------------------------------------------------------------------------
// Valid manifest loading (async)
// ---------------------------------------------------------------------------

describe("loadManifest (async)", () => {
  it("loads a valid model manifest", async () => {
    const m = await loadManifest(
      join(DATA_DIR, "models/deepseek-coder-v2.json"),
      ModelManifestSchema,
    );
    expect(m.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(m.family.id).toBe("deepseek-coder-v2");
    expect(m.variants.length).toBeGreaterThanOrEqual(1);
    expect(m.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it("loads a valid runtime manifest", async () => {
    const m = await loadManifest(
      join(DATA_DIR, "runtimes/ollama.json"),
      RuntimeManifestSchema,
    );
    expect(m.runtime.id).toBe("ollama");
  });

  it("loads a valid agent-tool manifest", async () => {
    const m = await loadManifest(
      join(DATA_DIR, "agent-tools/aider.json"),
      AgentToolManifestSchema,
    );
    expect(m.tool.id).toBe("aider");
  });

  it("rejects file that does not exist", async () => {
    await expect(
      loadManifest("/tmp/nonexistent.json", ModelManifestSchema),
    ).rejects.toThrow(CatalogError);
    await expect(
      loadManifest("/tmp/nonexistent.json", ModelManifestSchema),
    ).rejects.toMatchObject({ code: "FILE_READ_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// Valid manifest loading (sync)
// ---------------------------------------------------------------------------

describe("loadManifestSync", () => {
  it("loads a valid model manifest synchronously", () => {
    const m = loadManifestSync(
      join(DATA_DIR, "models/codellama.json"),
      ModelManifestSchema,
    );
    expect(m.family.id).toBe("codellama");
    expect(m.variants.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseManifest (in-memory, no file IO)
// ---------------------------------------------------------------------------

describe("parseManifest", () => {
  it("parses a valid runtime manifest from an object", () => {
    const data = {
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      runtime: {
        id: "test-rt",
        displayName: "Test",
        type: "cli_tool",
        detectionCommand: "test --version",
        versionCommand: "test --version",
        supportedPlatforms: ["linux"],
        installInstructions: { linux: ["apt install test"] },
        status: "supported",
      },
    };
    const m = parseManifest(data, RuntimeManifestSchema);
    expect(m.runtime.id).toBe("test-rt");
  });
});

// ---------------------------------------------------------------------------
// Schema version rejection
// ---------------------------------------------------------------------------

describe("schema version validation", () => {
  it("rejects unsupported schema version", () => {
    const data = {
      schemaVersion: "2.0.0",
      manifestVersion: "1",
      runtime: {
        id: "test",
        displayName: "Test",
        type: "cli_tool",
        detectionCommand: "test --version",
        versionCommand: "test --version",
        supportedPlatforms: ["linux"],
        installInstructions: { linux: ["apt install test"] },
        status: "supported",
      },
    };
    expect(() => parseManifest(data, RuntimeManifestSchema)).toThrow(
      CatalogError,
    );
    try {
      parseManifest(data, RuntimeManifestSchema);
    } catch (e) {
      expect((e as CatalogError).code).toBe("SCHEMA_VERSION_UNSUPPORTED");
      expect((e as CatalogError).message).toContain("2.0.0");
    }
  });

  it("rejects missing schema version", () => {
    const data = {
      manifestVersion: "1",
      runtime: {
        id: "test",
        displayName: "Test",
        type: "cli_tool",
        detectionCommand: "test --version",
        versionCommand: "test --version",
        supportedPlatforms: ["linux"],
        installInstructions: {},
        status: "supported",
      },
    };
    expect(() => parseManifest(data, RuntimeManifestSchema)).toThrow(
      CatalogError,
    );
    try {
      parseManifest(data, RuntimeManifestSchema);
    } catch (e) {
      expect((e as CatalogError).code).toBe("MANIFEST_PARSE_ERROR");
    }
  });

  it("rejects non-string schema version", () => {
    const data = { schemaVersion: 1, manifestVersion: "1" };
    expect(() => parseManifest(data, RuntimeManifestSchema)).toThrow(
      CatalogError,
    );
  });
});

// ---------------------------------------------------------------------------
// Validation error reporting
// ---------------------------------------------------------------------------

describe("validation errors", () => {
  it("reports detailed validation issues", () => {
    const data = {
      schemaVersion: "1.0.0",
      manifestVersion: "1",
      runtime: {
        id: "", // empty — should fail min(1)
        displayName: "Test",
        type: "unknown_type", // invalid enum
        detectionCommand: "x",
        versionCommand: "x",
        supportedPlatforms: ["linux"],
        installInstructions: {},
        status: "supported",
      },
    };
    expect(() => parseManifest(data, RuntimeManifestSchema)).toThrow(
      CatalogError,
    );
    try {
      parseManifest(data, RuntimeManifestSchema);
    } catch (e) {
      expect((e as CatalogError).code).toBe("MANIFEST_VALIDATION_ERROR");
      expect((e as CatalogError).message).toContain("runtime.id");
    }
  });
});
