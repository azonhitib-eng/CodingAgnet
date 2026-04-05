/**
 * codingagent-backend — public API surface.
 *
 * Re-exports all types, schemas, catalog layer, and detection layer
 * so consumers can:
 *   import { ModelCatalog, detectHost, type HostProfile } from "codingagent-backend";
 */

export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./catalog/index.js";
export * from "./detection/index.js";
