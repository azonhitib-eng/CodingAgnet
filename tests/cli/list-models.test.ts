/**
 * CLI tests — list-models command.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { runListModels } from "../../src/cli/commands/list-models.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";
import { CliError } from "../../src/cli/errors.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATA_DIR = join(import.meta.dirname, "../../data");
const catalogPaths: CatalogPaths = {
  models: join(DATA_DIR, "models"),
  runtimes: join(DATA_DIR, "runtimes"),
  agentTools: join(DATA_DIR, "agent-tools"),
};

let bundle: CatalogBundle;

beforeAll(() => {
  bundle = loadCatalogBundleSync(catalogPaths);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("list-models command", () => {
  it("lists all artifacts in pretty format", () => {
    const lines: string[] = [];
    const rows = runListModels({ bundle, json: false, writer: (msg) => lines.push(msg) });

    expect(rows.length).toBeGreaterThan(0);
    const output = lines.join("\n");
    expect(output).toContain("artifact(s)");
  });

  it("lists all artifacts in JSON format", () => {
    const lines: string[] = [];
    const rows = runListModels({ bundle, json: true, writer: (msg) => lines.push(msg) });

    const parsed = JSON.parse(lines.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(rows.length);
    expect(parsed[0]).toHaveProperty("artifactId");
    expect(parsed[0]).toHaveProperty("family");
    expect(parsed[0]).toHaveProperty("runtime");
    expect(parsed[0]).toHaveProperty("quantization");
  });

  it("filters by status=supported", () => {
    const rows = runListModels({
      bundle,
      json: false,
      status: "supported",
      writer: () => {},
    });

    for (const row of rows) {
      expect(row.status).toBe("supported");
    }
  });

  it("filters by runtime", () => {
    const rows = runListModels({
      bundle,
      json: false,
      runtime: "ollama",
      writer: () => {},
    });

    for (const row of rows) {
      expect(row.runtime).toBe("ollama");
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  it("filters by capability=coding", () => {
    const rows = runListModels({
      bundle,
      json: false,
      capability: "coding",
      writer: () => {},
    });

    expect(rows.length).toBeGreaterThan(0);
  });

  it("filters by multiple criteria simultaneously", () => {
    const rows = runListModels({
      bundle,
      json: false,
      status: "supported",
      runtime: "ollama",
      writer: () => {},
    });

    for (const row of rows) {
      expect(row.status).toBe("supported");
      expect(row.runtime).toBe("ollama");
    }
  });

  it("returns empty when no matches", () => {
    const lines: string[] = [];
    const rows = runListModels({
      bundle,
      json: false,
      runtime: "nonexistent-runtime",
      writer: (msg) => lines.push(msg),
    });

    expect(rows.length).toBe(0);
    expect(lines.join("\n")).toContain("No models found");
  });

  it("throws CliError on invalid status", () => {
    expect(() =>
      runListModels({
        bundle,
        json: false,
        status: "invalid",
        writer: () => {},
      }),
    ).toThrow(CliError);
  });

  it("throws CliError on invalid capability", () => {
    expect(() =>
      runListModels({
        bundle,
        json: false,
        capability: "invalid",
        writer: () => {},
      }),
    ).toThrow(CliError);
  });

  it("JSON output has consistent schema for each row", () => {
    const lines: string[] = [];
    runListModels({ bundle, json: true, writer: (msg) => lines.push(msg) });

    const parsed = JSON.parse(lines.join("\n"));
    for (const row of parsed) {
      expect(row).toHaveProperty("artifactId");
      expect(row).toHaveProperty("variantId");
      expect(row).toHaveProperty("familyId");
      expect(row).toHaveProperty("family");
      expect(row).toHaveProperty("variant");
      expect(row).toHaveProperty("runtime");
      expect(row).toHaveProperty("quantization");
      expect(row).toHaveProperty("status");
      expect(row).toHaveProperty("ramGb");
      expect(row).toHaveProperty("vramGb");
    }
  });
});
