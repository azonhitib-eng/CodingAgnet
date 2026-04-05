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
 */

import type {
  McpDiscoveredTool,
  McpDiscoveredResource,
  McpDiscoveredPrompt,
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
}

/* ------------------------------------------------------------------ */
/*  Apply discovery to a process record                               */
/* ------------------------------------------------------------------ */

/**
 * Apply discovered capabilities to a process record.
 *
 * Replaces any existing capabilities on the record.
 */
export function applyDiscovery(
  record: McpProcessRecord,
  result: McpDiscoveryResult,
): void {
  record.tools = [...result.tools];
  record.resources = [...result.resources];
  record.prompts = [...result.prompts];
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
}

/** Add a resource to a process record's discovered resources. */
export function registerResource(
  record: McpProcessRecord,
  resource: McpDiscoveredResource,
): void {
  record.resources.push(resource);
}

/** Add a prompt to a process record's discovered prompts. */
export function registerPrompt(
  record: McpProcessRecord,
  prompt: McpDiscoveredPrompt,
): void {
  record.prompts.push(prompt);
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
