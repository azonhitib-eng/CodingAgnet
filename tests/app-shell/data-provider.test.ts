/**
 * App shell data provider tests.
 *
 * Validates that the service/boundary layer correctly transforms
 * demo scenarios into frontend view-models using the contract mappers.
 */

import { describe, it, expect } from "vitest";

import {
  listDemoScenarios,
  loadDemoScenario,
  loadAllDemoScenarios,
  mapScenario,
  mapToFinalReview,
  DEMO_SCENARIOS,
  DEMO_SCENARIO_NAMES,
} from "../../src/app-shell/index.js";

import type { DemoScenario } from "../../src/app-shell/index.js";

// ---------------------------------------------------------------------------
// Demo scenario listing
// ---------------------------------------------------------------------------

describe("listDemoScenarios", () => {
  it("returns all scenario descriptors", () => {
    const list = listDemoScenarios();
    expect(list.length).toBe(DEMO_SCENARIO_NAMES.length);
    expect(list.length).toBeGreaterThanOrEqual(6);
  });

  it("each item has id, label, description", () => {
    for (const item of listDemoScenarios()) {
      expect(item.id).toEqual(expect.any(String));
      expect(item.label).toEqual(expect.any(String));
      expect(item.description).toEqual(expect.any(String));
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("ids match DEMO_SCENARIO_NAMES", () => {
    const ids = listDemoScenarios().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([...DEMO_SCENARIO_NAMES]));
  });
});

// ---------------------------------------------------------------------------
// Loading individual scenarios
// ---------------------------------------------------------------------------

describe("loadDemoScenario", () => {
  it("returns null for unknown scenario", () => {
    expect(loadDemoScenario("nonexistent")).toBeNull();
  });

  it("returns a ScenarioViewModel for each known scenario", () => {
    for (const name of DEMO_SCENARIO_NAMES) {
      const vm = loadDemoScenario(name);
      expect(vm).not.toBeNull();
      expect(vm!.id).toBe(name);
      expect(vm!.label).toBe(DEMO_SCENARIOS[name].label);
    }
  });

  it("midRangeGpu scenario has host with GPU present", () => {
    const vm = loadDemoScenario("midRangeGpu")!;
    expect(vm.host.gpuPresent).toBe(true);
    expect(vm.host.gpuModel).toContain("RTX 3060");
    expect(vm.host.totalRamGb).toBe(32);
  });

  it("lowEndCpuOnly scenario has no GPU", () => {
    const vm = loadDemoScenario("lowEndCpuOnly")!;
    expect(vm.host.gpuPresent).toBe(false);
    expect(vm.host.gpuModel).toBeNull();
    expect(vm.host.totalRamGb).toBe(8);
  });

  it("unsupported scenario has no recommendation", () => {
    const vm = loadDemoScenario("unsupported")!;
    expect(vm.recommendation).toBeNull();
    expect(vm.workflow.status).toBe("failed");
    expect(vm.workflow.error).toContain("No compatible");
  });

  it("blockedWorkflow scenario has blocked safety status", () => {
    const vm = loadDemoScenario("blockedWorkflow")!;
    expect(vm.planReview).not.toBeNull();
    expect(vm.planReview!.safety.status).toBe("blocked");
    expect(vm.workflow.status).toBe("blocked");
  });

  it("partialWorkflow scenario has no plan or compatibility", () => {
    const vm = loadDemoScenario("partialWorkflow")!;
    expect(vm.compatibility).toBeNull();
    expect(vm.planReview).toBeNull();
    expect(vm.workflow.status).toBe("partial");
    expect(vm.workflow.stoppedAfter).toBe("recommendation");
  });
});

// ---------------------------------------------------------------------------
// Loading all scenarios
// ---------------------------------------------------------------------------

describe("loadAllDemoScenarios", () => {
  it("returns one entry per registered scenario", () => {
    const all = loadAllDemoScenarios();
    expect(all.length).toBe(DEMO_SCENARIO_NAMES.length);
  });

  it("every entry has a valid host summary", () => {
    for (const vm of loadAllDemoScenarios()) {
      expect(vm.host.summary).toEqual(expect.any(String));
      expect(vm.host.summary.length).toBeGreaterThan(0);
      expect(vm.host.os).toEqual(expect.any(String));
    }
  });

  it("every entry has a valid workflow view", () => {
    for (const vm of loadAllDemoScenarios()) {
      expect(vm.workflow.statusLabel).toEqual(expect.any(String));
      expect(vm.workflow.stages.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// mapScenario
// ---------------------------------------------------------------------------

describe("mapScenario", () => {
  it("maps a raw scenario to ScenarioViewModel", () => {
    const raw = DEMO_SCENARIOS.midRangeGpu;
    const vm = mapScenario("midRangeGpu", raw);
    expect(vm.id).toBe("midRangeGpu");
    expect(vm.host).toBeDefined();
    expect(vm.workflow).toBeDefined();
  });

  it("handles null recommendation/compatibility/plan", () => {
    const raw = DEMO_SCENARIOS.unsupported;
    const vm = mapScenario("unsupported", raw);
    expect(vm.recommendation).toBeNull();
    expect(vm.planReview).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapToFinalReview
// ---------------------------------------------------------------------------

describe("mapToFinalReview", () => {
  it("produces a FinalReviewState", () => {
    const raw = DEMO_SCENARIOS.midRangeGpu;
    const review = mapToFinalReview(raw);
    expect(review.host.summary).toContain("linux");
    expect(review.recommendation).not.toBeNull();
    expect(review.workflow.status).toBe("completed_requires_approval");
  });

  it("handles unsupported scenario", () => {
    const review = mapToFinalReview(DEMO_SCENARIOS.unsupported);
    expect(review.recommendation).toBeNull();
    expect(review.planReview).toBeNull();
    expect(review.workflow.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// View-model contract integrity
// ---------------------------------------------------------------------------

describe("view-model contract integrity", () => {
  const allScenarios = Object.entries(DEMO_SCENARIOS) as [string, DemoScenario][];

  it.each(allScenarios)("scenario %s has correct host summary shape", (name, raw) => {
    const vm = mapScenario(name, raw);
    expect(vm.host).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        os: expect.any(String),
        arch: expect.any(String),
        cpuModel: expect.any(String),
        installedRuntimes: expect.any(Array),
        missingDependencies: expect.any(Array),
      }),
    );
  });

  it.each(allScenarios)("scenario %s has correct workflow shape", (name, raw) => {
    const vm = mapScenario(name, raw);
    expect(vm.workflow).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        statusLabel: expect.any(String),
        statusSeverity: expect.any(String),
        stages: expect.any(Array),
      }),
    );
    expect(vm.workflow.stages.length).toBe(8);
  });

  it.each(allScenarios)(
    "scenario %s recommendation matches raw presence",
    (name, raw) => {
      const vm = mapScenario(name, raw);
      if (raw.recommendation === null) {
        expect(vm.recommendation).toBeNull();
      } else {
        expect(vm.recommendation).not.toBeNull();
        expect(vm.recommendation!.artifactId).toBe(raw.recommendation.artifactId);
      }
    },
  );

  it.each(allScenarios)(
    "scenario %s plan review matches raw presence",
    (name, raw) => {
      const vm = mapScenario(name, raw);
      if (raw.plan === null || raw.safety === null) {
        expect(vm.planReview).toBeNull();
      } else {
        expect(vm.planReview).not.toBeNull();
        expect(vm.planReview!.artifactId).toBe(raw.plan.artifactId);
      }
    },
  );
});
