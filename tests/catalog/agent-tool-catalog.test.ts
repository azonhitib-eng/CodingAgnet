import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { AgentToolCatalog } from "../../src/catalog/agent-tool-catalog.js";
import { RuntimeRegistry } from "../../src/catalog/runtime-registry.js";
import { CatalogError } from "../../src/catalog/errors.js";
import { loadManifestSync } from "../../src/catalog/loader.js";
import { AgentToolManifestSchema } from "../../src/schemas/agent-tool.schema.js";
import { RuntimeManifestSchema } from "../../src/schemas/runtime.schema.js";
import type { AgentToolManifest } from "../../src/types/agent-tool.js";

const DATA_DIR = join(import.meta.dirname, "../../data");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadAllTools(): AgentToolCatalog {
  const catalog = new AgentToolCatalog();
  for (const name of ["aider", "continue-dev"]) {
    const m = loadManifestSync(
      join(DATA_DIR, `agent-tools/${name}.json`),
      AgentToolManifestSchema,
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

function makeToolManifest(id = "test-tool"): AgentToolManifest {
  return {
    schemaVersion: "1.0.0",
    manifestVersion: "1",
    tool: {
      id,
      displayName: "Test Tool",
      purpose: "Testing",
      requiredRuntimes: ["ollama"],
      hostAssumptions: [],
      suitableUseCases: ["testing"],
      warnings: [],
      installInstructions: { linux: ["echo test"] },
      supportedPlatforms: ["linux"],
      status: "supported",
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe("AgentToolCatalog — loading example data", () => {
  let catalog: AgentToolCatalog;

  beforeEach(() => {
    catalog = loadAllTools();
  });

  it("loads both tools", () => {
    expect(catalog.count).toBe(2);
  });

  it("preserves manifest version", () => {
    expect(catalog.getManifestVersion("aider")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

describe("AgentToolCatalog — queries", () => {
  let catalog: AgentToolCatalog;

  beforeEach(() => {
    catalog = loadAllTools();
  });

  it("gets by id", () => {
    expect(catalog.get("aider")?.displayName).toBe("Aider");
  });

  it("returns undefined for unknown id", () => {
    expect(catalog.get("nope")).toBeUndefined();
  });

  it("lists all", () => {
    expect(catalog.listAll().length).toBe(2);
  });

  it("filters by status", () => {
    expect(catalog.filterByStatus("supported").length).toBe(2);
    expect(catalog.filterByStatus("experimental").length).toBe(0);
  });

  it("filters by required runtime", () => {
    const ollamaTools = catalog.filterByRequiredRuntime("ollama");
    expect(ollamaTools.length).toBe(2);
    const llamacppTools = catalog.filterByRequiredRuntime("llamacpp");
    expect(llamacppTools.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate rejection
// ---------------------------------------------------------------------------

describe("AgentToolCatalog — duplicate rejection", () => {
  it("rejects duplicate tool id", () => {
    const catalog = new AgentToolCatalog();
    catalog.addManifest(makeToolManifest("dup"));
    expect(() => catalog.addManifest(makeToolManifest("dup"))).toThrow(
      CatalogError,
    );
    expect(() => catalog.addManifest(makeToolManifest("dup"))).toThrow(
      /Duplicate agent tool/,
    );
  });
});

// ---------------------------------------------------------------------------
// Runtime reference validation
// ---------------------------------------------------------------------------

describe("AgentToolCatalog — runtime reference validation", () => {
  it("passes when all required runtimes exist", () => {
    const catalog = loadAllTools();
    const runtimes = loadAllRuntimes();
    expect(() =>
      catalog.validateRuntimeReferences(runtimes.knownIds),
    ).not.toThrow();
  });

  it("fails when required runtime is missing", () => {
    const catalog = new AgentToolCatalog();
    const manifest = makeToolManifest("tool-with-bad-rt");
    manifest.tool.requiredRuntimes = ["nonexistent-rt"];
    catalog.addManifest(manifest);
    expect(() =>
      catalog.validateRuntimeReferences(new Set(["ollama"])),
    ).toThrow(CatalogError);
    expect(() =>
      catalog.validateRuntimeReferences(new Set(["ollama"])),
    ).toThrow(/nonexistent-rt/);
  });
});

// ---------------------------------------------------------------------------
// Empty catalog
// ---------------------------------------------------------------------------

describe("AgentToolCatalog — empty", () => {
  it("has zero count", () => {
    expect(new AgentToolCatalog().count).toBe(0);
  });

  it("returns empty list", () => {
    expect(new AgentToolCatalog().listAll()).toEqual([]);
  });

  it("returns undefined for get", () => {
    expect(new AgentToolCatalog().get("x")).toBeUndefined();
  });

  it("validateRuntimeReferences on empty is fine", () => {
    expect(() =>
      new AgentToolCatalog().validateRuntimeReferences(new Set()),
    ).not.toThrow();
  });
});
