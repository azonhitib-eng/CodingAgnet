import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { RuntimeRegistry } from "../../src/catalog/runtime-registry.js";
import { CatalogError } from "../../src/catalog/errors.js";
import { loadManifestSync } from "../../src/catalog/loader.js";
import { RuntimeManifestSchema } from "../../src/schemas/runtime.schema.js";
import type { RuntimeManifest } from "../../src/types/runtime.js";

const DATA_DIR = join(import.meta.dirname, "../../data");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeRuntimeManifest(id = "test-rt"): RuntimeManifest {
  return {
    schemaVersion: "1.0.0",
    manifestVersion: "1",
    runtime: {
      id,
      displayName: "Test",
      type: "cli_tool",
      detectionCommand: "test --version",
      versionCommand: "test --version",
      supportedPlatforms: ["linux"],
      installInstructions: { linux: ["apt install test"] },
      status: "supported",
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe("RuntimeRegistry — loading example data", () => {
  let reg: RuntimeRegistry;

  beforeEach(() => {
    reg = loadAllRuntimes();
  });

  it("loads both runtimes", () => {
    expect(reg.count).toBe(2);
  });

  it("has ollama and llamacpp", () => {
    expect(reg.has("ollama")).toBe(true);
    expect(reg.has("llamacpp")).toBe(true);
  });

  it("preserves manifest version", () => {
    expect(reg.getManifestVersion("ollama")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe("RuntimeRegistry — queries", () => {
  let reg: RuntimeRegistry;

  beforeEach(() => {
    reg = loadAllRuntimes();
  });

  it("gets by id", () => {
    expect(reg.get("ollama")?.displayName).toBe("Ollama");
  });

  it("returns undefined for unknown id", () => {
    expect(reg.get("nope")).toBeUndefined();
  });

  it("lists all", () => {
    expect(reg.listAll().length).toBe(2);
  });

  it("filters by status", () => {
    expect(reg.filterByStatus("supported").length).toBe(2);
    expect(reg.filterByStatus("experimental").length).toBe(0);
  });

  it("filters by capability", () => {
    const gpuOffload = reg.filterByCapability("gpu_offload");
    expect(gpuOffload.length).toBe(2);
    const modelMgmt = reg.filterByCapability("model_management");
    expect(modelMgmt.length).toBe(1);
    expect(modelMgmt[0].id).toBe("ollama");
  });

  it("exposes knownIds", () => {
    expect(reg.knownIds).toEqual(new Set(["ollama", "llamacpp"]));
  });
});

// ---------------------------------------------------------------------------
// Duplicate rejection
// ---------------------------------------------------------------------------

describe("RuntimeRegistry — duplicate rejection", () => {
  it("rejects duplicate runtime id", () => {
    const reg = new RuntimeRegistry();
    reg.addManifest(makeRuntimeManifest("dup"));
    expect(() => reg.addManifest(makeRuntimeManifest("dup"))).toThrow(
      CatalogError,
    );
    expect(() => reg.addManifest(makeRuntimeManifest("dup"))).toThrow(
      /Duplicate runtime/,
    );
  });
});

// ---------------------------------------------------------------------------
// Empty registry
// ---------------------------------------------------------------------------

describe("RuntimeRegistry — empty", () => {
  it("has zero count", () => {
    expect(new RuntimeRegistry().count).toBe(0);
  });

  it("returns empty list", () => {
    expect(new RuntimeRegistry().listAll()).toEqual([]);
  });

  it("returns undefined for get", () => {
    expect(new RuntimeRegistry().get("x")).toBeUndefined();
  });

  it("has empty knownIds", () => {
    expect(new RuntimeRegistry().knownIds.size).toBe(0);
  });
});
