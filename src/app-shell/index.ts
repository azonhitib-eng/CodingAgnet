/**
 * App shell — public exports.
 *
 * Re-exports the data provider, demo scenarios, server, and view
 * renderer for external consumption.
 */

// Data provider / service layer
export {
  mapScenario,
  mapToFinalReview,
  listDemoScenarios,
  loadDemoScenario,
  loadAllDemoScenarios,
} from "./data-provider.js";

export type {
  ScenarioViewModel,
  ScenarioListItem,
} from "./data-provider.js";

// Demo scenarios
export { DEMO_SCENARIOS, DEMO_SCENARIO_NAMES } from "./demo-scenarios.js";
export type { DemoScenario, DemoScenarioName } from "./demo-scenarios.js";

// Server
export { handleRequest, startServer } from "./server.js";

// View renderer
export { renderShellHtml } from "./views.js";
