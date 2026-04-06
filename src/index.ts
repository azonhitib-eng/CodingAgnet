/**
 * codingagent-backend — public API surface.
 *
 * Re-exports all types, schemas, catalog layer, detection layer,
 * compatibility layer, install-plan layer, and high-level API so
 * consumers can:
 *   import {
 *     loadCatalogBundle, detectHost, recommend, checkCompatibility,
 *     generateInstallPlan, evaluatePlanSafety, renderPlan,
 *     renderPlanWithSafety, runFullFlow,
 *     type HostProfile, type FullFlowResult,
 *   } from "codingagent-backend";
 */

export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./catalog/index.js";
export * from "./detection/index.js";
export * from "./compatibility/index.js";
export * from "./install-plan/index.js";
export { renderPlanWithSafety, runFullFlow, type FullFlowInput, type FullFlowResult } from "./api.js";
export * from "./workflow/index.js";
export { main as cliMain } from "./cli/index.js";
export { validateHostProfile } from "./cli/host-loader.js";
export * from "./frontend-contracts/index.js";
export * from "./session/index.js";
export * from "./mcp/index.js";
export * from "./agents/index.js";
export * from "./commands/index.js";
export * from "./fingerprint/index.js";
export * from "./toolchain/index.js";
export * from "./language-service/index.js";
