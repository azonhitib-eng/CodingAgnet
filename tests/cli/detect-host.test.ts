/**
 * CLI tests — detect-host command.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { runDetectHost } from "../../src/cli/commands/detect-host.js";
import { loadCatalogBundleSync, type CatalogBundle, type CatalogPaths } from "../../src/catalog/bundle.js";

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

function getBundle(): CatalogBundle {
  if (!bundle) {
    bundle = loadCatalogBundleSync(catalogPaths);
  }
  return bundle;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detect-host command", () => {
  it("outputs a host profile in pretty text", async () => {
    const lines: string[] = [];
    const writer = (msg: string) => lines.push(msg);

    const host = await runDetectHost({ json: false, bundle: getBundle(), writer });

    expect(host).toBeDefined();
    expect(host.detectedAt).toBeTruthy();
    expect(host.os).toBeDefined();
    expect(host.cpu).toBeDefined();
    expect(host.memory).toBeDefined();

    const output = lines.join("\n");
    expect(output).toContain("=== Host Profile ===");
    expect(output).toContain("--- OS ---");
    expect(output).toContain("--- CPU ---");
    expect(output).toContain("--- Memory ---");
    expect(output).toContain("--- GPU ---");
  });

  it("outputs a host profile in JSON", async () => {
    const lines: string[] = [];
    const writer = (msg: string) => lines.push(msg);

    const host = await runDetectHost({ json: true, bundle: getBundle(), writer });

    const output = lines.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.detectedAt).toBe(host.detectedAt);
    expect(parsed.os).toBeDefined();
    expect(parsed.cpu).toBeDefined();
    expect(parsed.memory).toBeDefined();
  });

  it("works without a bundle (no runtime detection)", async () => {
    const lines: string[] = [];
    const writer = (msg: string) => lines.push(msg);

    await runDetectHost({ json: true, writer });

    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.detectedAt).toBeTruthy();
    expect(parsed.os).toBeDefined();
  });

  it("returns a valid HostProfile object", async () => {
    const result = await runDetectHost({ json: false, writer: () => {} });

    expect(typeof result.detectedAt).toBe("string");
    expect(result.os.platform.confidence).toBeTruthy();
    expect(result.cpu.cores.confidence).toBeTruthy();
    expect(result.memory.totalGb.confidence).toBeTruthy();
  });
});
