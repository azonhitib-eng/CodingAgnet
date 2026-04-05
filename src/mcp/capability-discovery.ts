/**
 * MCP capability discovery modeling.
 *
 * Pure functions for managing discovered tool/resource/prompt metadata.
 *
 * Separation of concerns:
 * - This module models discovery results
 * - The process-manager starts/stops processes
 * - The mcp-manager coordinates both and integrates with sessions
 *
 * In this phase, full MCP protocol handshake is NOT implemented.
 * Discovery is modeled explicitly so capabilities can be registered
 * manually, via fixtures, or via future protocol integration.
 *
 * Phase 26: discovery state tracking (source, confidence, timestamps).
 */

import type {
  McpDiscoveredTool,
  McpDiscoveredResource,
  McpDiscoveredPrompt,
  McpDiscoverySource,
  McpDiscoveryState,
} from "./types.js";
import type { McpProcessRecord } from "./process-manager.js";

/* ------------------------------------------------------------------ */
/*  Discovery result                                                  */
/* ------------------------------------------------------------------ */

/** Aggregated discovery result from an MCP server. */
export interface McpDiscoveryResult {
  readonly tools: McpDiscoveredTool[];
  readonly resources: McpDiscoveredResource[];
  readonly prompts: McpDiscoveredPrompt[];
  /** Whether discovery was fully successful. */
  readonly complete: boolean;
  /** Error message if discovery failed partially or fully. */
  readonly error?: string;
  /** How this discovery was obtained (Phase 26). Defaults to "manual". */
  readonly source?: McpDiscoverySource;
}

/* ------------------------------------------------------------------ */
/*  Apply discovery to a process record                               */
/* ------------------------------------------------------------------ */

/**
 * Apply discovered capabilities to a process record.
 *
 * Replaces any existing capabilities on the record.
 * Phase 26: also updates the discoveryState on the record.
 */
export function applyDiscovery(
  record: McpProcessRecord,
  result: McpDiscoveryResult,
): void {
  record.tools = [...result.tools];
  record.resources = [...result.resources];
  record.prompts = [...result.prompts];

  const now = new Date().toISOString();
  const source = result.source ?? "manual";

  if (result.complete) {
    record.discoveryState = {
      status: "discovered",
      source,
      lastDiscoveryAt: now,
      lastAttemptAt: now,
      lastError: null,
      isCurrent: true,
      toolCount: result.tools.length,
      resourceCount: result.resources.length,
      promptCount: result.prompts.length,
    };
  } else {
    record.discoveryState = {
      status: "failed",
      source,
      lastDiscoveryAt: record.discoveryState.lastDiscoveryAt,
      lastAttemptAt: now,
      lastError: result.error ?? "Discovery incomplete",
      isCurrent: false,
      toolCount: result.tools.length,
      resourceCount: result.resources.length,
      promptCount: result.prompts.length,
    };
  }
}

/**
 * Mark discovery as in-progress on a process record.
 */
export function markDiscovering(record: McpProcessRecord): void {
  record.discoveryState = {
    ...record.discoveryState,
    status: "discovering",
    lastAttemptAt: new Date().toISOString(),
  };
}

/**
 * Mark existing discovery data as stale (e.g., after persistence restore).
 */
export function markDiscoveryStale(record: McpProcessRecord): void {
  record.discoveryState = {
    ...record.discoveryState,
    status: record.discoveryState.lastDiscoveryAt ? "stale" : "never_discovered",
    source: "restored",
    isCurrent: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Manual capability registration                                    */
/* ------------------------------------------------------------------ */

/** Add a tool to a process record's discovered tools. */
export function registerTool(
  record: McpProcessRecord,
  tool: McpDiscoveredTool,
): void {
  record.tools.push(tool);
  record.discoveryState = {
    ...record.discoveryState,
    toolCount: record.tools.length,
    source: record.discoveryState.source === "runtime" ? "runtime" : "manual",
  };
}

/** Add a resource to a process record's discovered resources. */
export function registerResource(
  record: McpProcessRecord,
  resource: McpDiscoveredResource,
): void {
  record.resources.push(resource);
  record.discoveryState = {
    ...record.discoveryState,
    resourceCount: record.resources.length,
    source: record.discoveryState.source === "runtime" ? "runtime" : "manual",
  };
}

/** Add a prompt to a process record's discovered prompts. */
export function registerPrompt(
  record: McpProcessRecord,
  prompt: McpDiscoveredPrompt,
): void {
  record.prompts.push(prompt);
  record.discoveryState = {
    ...record.discoveryState,
    promptCount: record.prompts.length,
    source: record.discoveryState.source === "runtime" ? "runtime" : "manual",
  };
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                */
/* ------------------------------------------------------------------ */

/** Validate that a discovered tool has the required fields. */
export function isValidTool(tool: unknown): tool is McpDiscoveredTool {
  if (typeof tool !== "object" || tool === null) return false;
  const t = tool as Record<string, unknown>;
  return typeof t.name === "string" && t.name.length > 0;
}

/** Validate that a discovered resource has the required fields. */
export function isValidResource(
  resource: unknown,
): resource is McpDiscoveredResource {
  if (typeof resource !== "object" || resource === null) return false;
  const r = resource as Record<string, unknown>;
  return (
    typeof r.uri === "string" &&
    r.uri.length > 0 &&
    typeof r.name === "string" &&
    r.name.length > 0
  );
}

/** Validate that a discovered prompt has the required fields. */
export function isValidPrompt(
  prompt: unknown,
): prompt is McpDiscoveredPrompt {
  if (typeof prompt !== "object" || prompt === null) return false;
  const p = prompt as Record<string, unknown>;
  return typeof p.name === "string" && p.name.length > 0;
}

/* ------------------------------------------------------------------ */
/*  Empty discovery result                                            */
/* ------------------------------------------------------------------ */

/** Create an empty (successful) discovery result. */
export function emptyDiscovery(): McpDiscoveryResult {
  return { tools: [], resources: [], prompts: [], complete: true };
}

/** Create a failed discovery result. */
export function failedDiscovery(error: string): McpDiscoveryResult {
  return { tools: [], resources: [], prompts: [], complete: false, error };
}
