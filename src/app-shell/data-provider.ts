/**
 * App shell data provider — service/boundary layer.
 *
 * Transforms raw backend scenario data into frontend view-models
 * using the frontend-contract mappers.  This keeps UI components
 * from importing deep backend internals directly.
 */

import type {
  HostSummaryViewModel,
  RecommendationItem,
  CompatibilityViewModel,
  PlanReviewViewModel,
  WorkflowViewModel,
  FinalReviewState,
} from "../frontend-contracts/index.js";

import {
  toHostSummary,
  toRecommendationItem,
  toCompatibilityView,
  toPlanReviewView,
  toWorkflowView,
  toFinalReviewState,
} from "../frontend-contracts/index.js";

import type { DemoScenario, DemoScenarioName } from "./demo-scenarios.js";
import { DEMO_SCENARIOS, DEMO_SCENARIO_NAMES } from "./demo-scenarios.js";

// ---------------------------------------------------------------------------
// Scenario view-model (fully mapped)
// ---------------------------------------------------------------------------

export interface ScenarioViewModel {
  id: string;
  label: string;
  description: string;
  host: HostSummaryViewModel;
  recommendation: RecommendationItem | null;
  compatibility: CompatibilityViewModel | null;
  planReview: PlanReviewViewModel | null;
  workflow: WorkflowViewModel;
}

/** Compact scenario descriptor for listing. */
export interface ScenarioListItem {
  id: string;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Map a raw DemoScenario to a fully-mapped ScenarioViewModel.
 */
export function mapScenario(id: string, scenario: DemoScenario): ScenarioViewModel {
  return {
    id,
    label: scenario.label,
    description: scenario.description,
    host: toHostSummary(scenario.host),
    recommendation: scenario.recommendation
      ? toRecommendationItem(scenario.recommendation)
      : null,
    compatibility: scenario.compatibility
      ? toCompatibilityView(scenario.compatibility)
      : null,
    planReview:
      scenario.plan && scenario.safety
        ? toPlanReviewView(scenario.plan, scenario.safety)
        : null,
    workflow: toWorkflowView(scenario.workflow),
  };
}

/**
 * Map a raw DemoScenario to FinalReviewState (composite view-model).
 */
export function mapToFinalReview(scenario: DemoScenario): FinalReviewState {
  return toFinalReviewState({
    host: scenario.host,
    workflow: scenario.workflow,
    topRecommendation: scenario.recommendation ?? undefined,
    compatibility: scenario.compatibility ?? undefined,
    plan: scenario.plan ?? undefined,
    safety: scenario.safety ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Demo data provider
// ---------------------------------------------------------------------------

/** List available demo scenarios. */
export function listDemoScenarios(): ScenarioListItem[] {
  return DEMO_SCENARIO_NAMES.map((id) => ({
    id,
    label: DEMO_SCENARIOS[id].label,
    description: DEMO_SCENARIOS[id].description,
  }));
}

/** Load a single demo scenario by name, fully mapped to view-models. */
export function loadDemoScenario(name: string): ScenarioViewModel | null {
  const scenario = DEMO_SCENARIOS[name as DemoScenarioName];
  if (!scenario) return null;
  return mapScenario(name, scenario);
}

/** Load all demo scenarios. */
export function loadAllDemoScenarios(): ScenarioViewModel[] {
  return DEMO_SCENARIO_NAMES.map((id) => mapScenario(id, DEMO_SCENARIOS[id]));
}
