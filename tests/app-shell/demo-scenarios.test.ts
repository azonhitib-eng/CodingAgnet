/**
 * App shell demo scenarios tests.
 *
 * Validates that the embedded demo scenarios are well-formed and
 * compatible with the frontend-contract mappers.
 */

import { describe, it, expect } from "vitest";

import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_NAMES,
} from "../../src/app-shell/demo-scenarios.js";

import {
  toHostSummary,
  toRecommendationItem,
  toCompatibilityView,
  toPlanReviewView,
  toWorkflowView,
} from "../../src/frontend-contracts/index.js";

// ---------------------------------------------------------------------------
// Scenario structure
// ---------------------------------------------------------------------------

describe("DEMO_SCENARIOS", () => {
  it("has at least 6 scenarios", () => {
    expect(DEMO_SCENARIO_NAMES.length).toBeGreaterThanOrEqual(6);
  });

  it("every scenario has required fields", () => {
    for (const name of DEMO_SCENARIO_NAMES) {
      const s = DEMO_SCENARIOS[name];
      expect(s.label).toEqual(expect.any(String));
      expect(s.description).toEqual(expect.any(String));
      expect(s.host).toBeDefined();
      expect(s.workflow).toBeDefined();
    }
  });

  it("names array matches object keys", () => {
    expect(DEMO_SCENARIO_NAMES).toEqual(
      expect.arrayContaining(Object.keys(DEMO_SCENARIOS)),
    );
  });
});

// ---------------------------------------------------------------------------
// Contract mapper integration — each scenario can be mapped
// ---------------------------------------------------------------------------

describe("demo scenarios map through frontend-contract layer", () => {
  for (const name of DEMO_SCENARIO_NAMES) {
    describe(`scenario: ${name}`, () => {
      const scenario = DEMO_SCENARIOS[name];

      it("host maps to HostSummaryViewModel", () => {
        const vm = toHostSummary(scenario.host);
        expect(vm.summary.length).toBeGreaterThan(0);
        expect(vm.os).toEqual(expect.any(String));
      });

      it("workflow maps to WorkflowViewModel", () => {
        const vm = toWorkflowView(scenario.workflow);
        expect(vm.statusLabel).toEqual(expect.any(String));
        expect(vm.stages.length).toBe(8);
      });

      if (scenario.recommendation) {
        it("recommendation maps to RecommendationItem", () => {
          const vm = toRecommendationItem(scenario.recommendation!);
          expect(vm.artifactId).toEqual(expect.any(String));
          expect(vm.score).toEqual(expect.any(Number));
        });
      }

      if (scenario.compatibility) {
        it("compatibility maps to CompatibilityViewModel", () => {
          const vm = toCompatibilityView(scenario.compatibility!);
          expect(vm.label).toEqual(expect.any(String));
          expect(vm.severity).toEqual(expect.any(String));
        });
      }

      if (scenario.plan && scenario.safety) {
        it("plan+safety maps to PlanReviewViewModel", () => {
          const vm = toPlanReviewView(scenario.plan!, scenario.safety!);
          expect(vm.artifactId).toEqual(expect.any(String));
          expect(vm.steps.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
