/**
 * Phase 9B — Package export surface hardening tests.
 *
 * Verifies that the package exports are deliberate, complete,
 * and that internal-only helpers do not leak to the public surface.
 */

import { describe, it, expect } from "vitest";

// Import from root surface
import * as root from "../../src/index.js";

// Import from subpath surfaces
import * as cli from "../../src/cli/index.js";
import * as workflow from "../../src/workflow/index.js";
import * as schemas from "../../src/schemas/index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

type Fn = (...args: unknown[]) => unknown;

function isFn(v: unknown): v is Fn {
  return typeof v === "function";
}

// ---------------------------------------------------------------------------
// Root surface — workflow exports
// ---------------------------------------------------------------------------

describe("root export surface — workflow layer", () => {
  it("exports runWorkflow function", () => {
    expect(isFn(root.runWorkflow)).toBe(true);
  });

  it("exports STAGE_ORDER constant", () => {
    expect(Array.isArray(root.STAGE_ORDER)).toBe(true);
    expect(root.STAGE_ORDER.length).toBe(8);
    expect(root.STAGE_ORDER[0]).toBe("catalog_loading");
    expect(root.STAGE_ORDER[7]).toBe("rendering");
  });

  it("exports cliMain function", () => {
    expect(isFn(root.cliMain)).toBe(true);
  });

  it("exports validateHostProfile function", () => {
    expect(isFn(root.validateHostProfile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Root surface — no accidental internal leakage
// ---------------------------------------------------------------------------

describe("root export surface — boundary checks", () => {
  const rootApi = root as Record<string, unknown>;

  it("does not export loadHostProfile (file I/O stays in CLI)", () => {
    expect(rootApi.loadHostProfile).toBeUndefined();
  });

  it("does not export CLI errors directly", () => {
    expect(rootApi.CliError).toBeUndefined();
    expect(rootApi.usageError).toBeUndefined();
    expect(rootApi.inputError).toBeUndefined();
  });

  it("does not export internal format helpers", () => {
    expect(rootApi.printOutput).toBeUndefined();
    expect(rootApi.printError).toBeUndefined();
    expect(rootApi.formatKeyValue).toBeUndefined();
  });

  it("does not export CLI command runners directly", () => {
    expect(rootApi.runDetectHost).toBeUndefined();
    expect(rootApi.runListModels).toBeUndefined();
    expect(rootApi.runRunWorkflow).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CLI subpath surface
// ---------------------------------------------------------------------------

describe("CLI subpath export surface", () => {
  const cliApi = cli as Record<string, unknown>;

  it("exports main function", () => {
    expect(isFn(cliApi.main)).toBe(true);
  });

  it("exports CliError class", () => {
    expect(typeof cliApi.CliError).toBe("function");
  });

  it("exports exit code constants", () => {
    expect(cliApi.EXIT_OK).toBe(0);
    expect(cliApi.EXIT_USAGE).toBe(1);
    expect(cliApi.EXIT_INPUT).toBe(2);
    expect(cliApi.EXIT_RUNTIME).toBe(3);
    expect(cliApi.EXIT_BLOCKED).toBe(4);
    expect(cliApi.EXIT_APPROVAL).toBe(5);
  });

  it("exports usageError and inputError helpers", () => {
    expect(isFn(cliApi.usageError)).toBe(true);
    expect(isFn(cliApi.inputError)).toBe(true);
  });

  it("exports format helpers", () => {
    expect(isFn(cliApi.printOutput)).toBe(true);
    expect(isFn(cliApi.printError)).toBe(true);
    expect(isFn(cliApi.formatKeyValue)).toBe(true);
  });

  it("exports loadHostProfile and validateHostProfile", () => {
    expect(isFn(cliApi.loadHostProfile)).toBe(true);
    expect(isFn(cliApi.validateHostProfile)).toBe(true);
  });

  it("exports command runners", () => {
    expect(isFn(cliApi.runDetectHost)).toBe(true);
    expect(isFn(cliApi.runListModels)).toBe(true);
    expect(isFn(cliApi.runRecommendModels)).toBe(true);
    expect(isFn(cliApi.runCheckCompatibility)).toBe(true);
    expect(isFn(cliApi.runPlanInstall)).toBe(true);
    expect(isFn(cliApi.runRenderPlan)).toBe(true);
    expect(isFn(cliApi.runRunWorkflow)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Workflow subpath surface
// ---------------------------------------------------------------------------

describe("workflow subpath export surface", () => {
  const wfApi = workflow as Record<string, unknown>;

  it("exports runWorkflow function", () => {
    expect(isFn(wfApi.runWorkflow)).toBe(true);
  });

  it("exports STAGE_ORDER constant", () => {
    expect(Array.isArray(wfApi.STAGE_ORDER)).toBe(true);
    expect((wfApi.STAGE_ORDER as string[]).length).toBe(8);
  });

  it("does not export internal handler functions", () => {
    expect(wfApi.runCatalogLoading).toBeUndefined();
    expect(wfApi.runHostAcquisition).toBeUndefined();
    expect(wfApi.STAGE_HANDLERS).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Schemas subpath surface
// ---------------------------------------------------------------------------

describe("schemas subpath export surface", () => {
  const schApi = schemas as Record<string, unknown>;

  const expectedSchemas = [
    "ModelManifestSchema",
    "RuntimeManifestSchema",
    "AgentToolManifestSchema",
    "HostProfileSchema",
    "CompatibilityResultSchema",
    "InstallPlanSchema",
    "SafetyReportSchema",
    "ExecutionPolicySchema",
    "ModelFamilySchema",
    "ModelVariantSchema",
    "ModelArtifactSchema",
    "RuntimeEntrySchema",
  ];

  for (const name of expectedSchemas) {
    it(`exports schema: ${name}`, () => {
      const val = schApi[name];
      expect(val).toBeDefined();
      expect(typeof (val as { parse?: unknown }).parse).toBe("function");
    });
  }
});

// ---------------------------------------------------------------------------
// Root surface — all expected core exports present
// ---------------------------------------------------------------------------

describe("root export surface — completeness check", () => {
  const rootApi = root as Record<string, unknown>;

  const expectedFunctions = [
    // Catalog
    "loadCatalogBundle",
    "loadCatalogBundleSync",
    // Detection
    "detectHost",
    // Compatibility
    "checkCompatibility",
    "recommend",
    // Install planning
    "generateInstallPlan",
    "evaluatePlanSafety",
    "defaultExecutionPolicy",
    "renderPlan",
    // Phase 6 facade
    "renderPlanWithSafety",
    "runFullFlow",
    // Phase 7B
    "validateHostProfile",
    // Phase 8A
    "runWorkflow",
    // Phase 8B
    "cliMain",
  ];

  for (const name of expectedFunctions) {
    it(`root surface includes: ${name}`, () => {
      expect(rootApi[name]).toBeDefined();
      expect(isFn(rootApi[name])).toBe(true);
    });
  }
});
