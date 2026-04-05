/**
 * Public API surface consistency tests.
 *
 * Verifies that the expected symbols are exported from the package
 * root and that the high-level facade functions exist and have the
 * correct signatures.
 */

import { describe, it, expect } from "vitest";

// Import everything from the public surface
import * as api from "../../src/index.js";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type Fn = (...args: unknown[]) => unknown;

function isFn(v: unknown): v is Fn {
  return typeof v === "function";
}

function isClass(v: unknown): boolean {
  return typeof v === "function" && /^class\b/.test(Function.prototype.toString.call(v));
}

// ---------------------------------------------------------------------------
// Core function exports
// ---------------------------------------------------------------------------

describe("public API surface — core functions", () => {
  const expectedFunctions = [
    // Catalog
    "loadCatalogBundle",
    "loadCatalogBundleSync",
    "loadManifest",
    "loadManifestSync",
    "parseManifest",

    // Detection
    "detectHost",
    "detectOs",
    "detectCpu",
    "detectMemory",
    "detectGpu",
    "detectRuntimes",
    "detectSingleRuntime",
    "runCommand",

    // Compatibility
    "checkCompatibility",
    "recommend",

    // Install planning
    "generateInstallPlan",
    "evaluatePlanSafety",
    "classifyCommand",
    "classifyPaths",
    "defaultExecutionPolicy",
    "renderPlan",

    // Phase 6 facade
    "renderPlanWithSafety",
    "runFullFlow",
  ];

  for (const name of expectedFunctions) {
    it(`exports function: ${name}`, () => {
      const value = (api as Record<string, unknown>)[name];
      expect(value).toBeDefined();
      expect(isFn(value)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Class exports
// ---------------------------------------------------------------------------

describe("public API surface — classes", () => {
  const expectedClasses = [
    "ModelCatalog",
    "RuntimeRegistry",
    "AgentToolCatalog",
    "CatalogError",
  ];

  for (const name of expectedClasses) {
    it(`exports class: ${name}`, () => {
      const value = (api as Record<string, unknown>)[name];
      expect(value).toBeDefined();
      expect(isClass(value)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Constant exports
// ---------------------------------------------------------------------------

describe("public API surface — constants", () => {
  it("exports SUPPORTED_SCHEMA_VERSION", () => {
    expect(api.SUPPORTED_SCHEMA_VERSION).toBe("1.0.0");
  });
});

// ---------------------------------------------------------------------------
// Schema exports
// ---------------------------------------------------------------------------

describe("public API surface — schemas", () => {
  const expectedSchemas = [
    "ModelManifestSchema",
    "RuntimeManifestSchema",
    "AgentToolManifestSchema",
    "HostProfileSchema",
    "CompatibilityResultSchema",
    "InstallPlanSchema",
    "SafetyReportSchema",
    "ExecutionPolicySchema",
  ];

  for (const name of expectedSchemas) {
    it(`exports schema: ${name}`, () => {
      const value = (api as Record<string, unknown>)[name];
      expect(value).toBeDefined();
      // Zod schemas have a .parse method
      expect(typeof (value as { parse?: unknown }).parse).toBe("function");
    });
  }
});

// ---------------------------------------------------------------------------
// Helper utility exports
// ---------------------------------------------------------------------------

describe("public API surface — utility functions", () => {
  const expectedUtils = [
    "extractVersion",
    "bytesToGb",
    "estimateCores",
    "parseOsInfo",
    "parseCpuInfo",
    "parseMemoryInfo",
    "parseNvidiaSmiCsv",
    "parseSystemProfiler",
    "unknownGpu",
  ];

  for (const name of expectedUtils) {
    it(`exports utility: ${name}`, () => {
      const value = (api as Record<string, unknown>)[name];
      expect(value).toBeDefined();
      expect(isFn(value)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// High-level flow functions contract tests
// ---------------------------------------------------------------------------

describe("renderPlanWithSafety contract", () => {
  it("is a function that accepts (plan, policy?, options?)", () => {
    expect(isFn(api.renderPlanWithSafety)).toBe(true);
    expect(api.renderPlanWithSafety.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runFullFlow contract", () => {
  it("is a function that accepts (input)", () => {
    expect(isFn(api.runFullFlow)).toBe(true);
    expect(api.runFullFlow.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// No unexpected default export
// ---------------------------------------------------------------------------

describe("public API surface — no default export", () => {
  it("does not have a default export", () => {
    expect((api as Record<string, unknown>).default).toBeUndefined();
  });
});
