/**
 * App shell — public exports.
 *
 * Re-exports the data provider, demo scenarios, workflow bridge,
 * server, and view renderer for external consumption.
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
  HostSource,
} from "./data-provider.js";

// Demo scenarios
export { DEMO_SCENARIOS, DEMO_SCENARIO_NAMES } from "./demo-scenarios.js";
export type { DemoScenario, DemoScenarioName } from "./demo-scenarios.js";

// Workflow bridge (real mode)
export {
  executeRealWorkflow,
  validateDataDir,
  validateHostFile,
  validateStopAfter,
  getStageNames,
} from "./workflow-bridge.js";

export type {
  RealWorkflowInput,
  RealWorkflowResult,
  RealWorkflowError,
  RealWorkflowResponse,
  ValidationResult,
} from "./workflow-bridge.js";

// Server
export { handleRequest, startServer, resolvePort, openBrowser, attachGracefulShutdown, getWorkspaceSessionManager, setGitExecutor } from "./server.js";
export type { StartServerOptions } from "./server.js";

// View renderer
export { renderShellHtml } from "./views.js";

// Timeline helpers (Phase 22)
export {
  classifyEvent,
  categoryIcon,
  categoryCssClass,
  buildDemoTimelineEvents,
} from "./timeline-helpers.js";

export type {
  TimelineEventCategory,
  ClassifiedTimelineEvent,
} from "./timeline-helpers.js";
