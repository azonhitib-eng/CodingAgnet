/**
 * codingagent-backend — public API surface.
 *
 * Re-exports all types, schemas, catalog layer, detection layer,
 * and compatibility layer so consumers can:
 *   import { ModelCatalog, detectHost, checkCompatibility, type HostProfile } from "codingagent-backend";
 */

export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./catalog/index.js";
export * from "./detection/index.js";
export * from "./compatibility/index.js";
export * from "./install-plan/index.js";
