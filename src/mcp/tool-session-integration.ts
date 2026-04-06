/**
 * MCP tool invocation ↔ Session event bridge.
 *
 * Phase 41: Session events for tool invocation lifecycle.
 *
 * Produces typed session events for:
 * - Tool invocation start
 * - Tool invocation completion
 * - Tool invocation failure
 * - Tool list/discovery events
 * - GitHub MCP-specific events
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { McpServerId } from "./types.js";
import type { McpToolId, McpToolInvocationResultSummary } from "./tool-invocation.js";

/* ------------------------------------------------------------------ */
/*  Tool invocation event kinds                                        */
/* ------------------------------------------------------------------ */

/**
 * Tool-invocation-specific session event kinds.
 */
export type McpToolEventKind =
  | "mcp_tool_invocation_started"
  | "mcp_tool_invocation_completed"
  | "mcp_tool_invocation_failed"
  | "mcp_tool_list_refreshed"
  | "mcp_github_attached"
  | "mcp_github_auth_missing";

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

export const mcpToolInvocationStarted = (
  serverId: McpServerId,
  toolId: McpToolId,
  reason?: string,
): SessionEvent =>
  createEvent(
    "mcp_tool_invocation_started" as SessionEvent["kind"],
    `Tool invocation started: ${toolId} on ${serverId}${reason ? ` — ${reason}` : ""}`,
    { serverId, toolId, reason: reason ?? null },
  );

export const mcpToolInvocationCompleted = (
  serverId: McpServerId,
  toolId: McpToolId,
  durationMs: number | null,
  isPartial: boolean,
): SessionEvent =>
  createEvent(
    "mcp_tool_invocation_completed" as SessionEvent["kind"],
    `Tool invocation completed: ${toolId}${durationMs !== null ? ` (${durationMs}ms)` : ""}${isPartial ? " [partial]" : ""}`,
    { serverId, toolId, durationMs, isPartial },
  );

export const mcpToolInvocationFailed = (
  serverId: McpServerId,
  toolId: McpToolId,
  errorCode: string,
  errorMessage: string,
): SessionEvent =>
  createEvent(
    "mcp_tool_invocation_failed" as SessionEvent["kind"],
    `Tool invocation failed: ${toolId} — ${errorMessage}`,
    { serverId, toolId, errorCode, errorMessage },
  );

export const mcpToolListRefreshed = (
  serverId: McpServerId,
  toolCount: number,
): SessionEvent =>
  createEvent(
    "mcp_tool_list_refreshed" as SessionEvent["kind"],
    `Tool list refreshed for ${serverId}: ${toolCount} tool(s)`,
    { serverId, toolCount },
  );

export const mcpGitHubAttached = (
  serverId: McpServerId,
  authConfigured: boolean,
  toolCount: number,
): SessionEvent =>
  createEvent(
    "mcp_github_attached" as SessionEvent["kind"],
    `GitHub MCP attached: ${authConfigured ? "auth configured" : "auth NOT configured"}, ${toolCount} known tool(s)`,
    { serverId, authConfigured, toolCount },
  );

export const mcpGitHubAuthMissing = (
  serverId: McpServerId,
): SessionEvent =>
  createEvent(
    "mcp_github_auth_missing" as SessionEvent["kind"],
    `GitHub MCP: auth not configured. Set GITHUB_TOKEN to enable GitHub tools.`,
    { serverId },
  );

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** All known tool invocation event kinds. */
export const MCP_TOOL_EVENT_KINDS: readonly McpToolEventKind[] = [
  "mcp_tool_invocation_started",
  "mcp_tool_invocation_completed",
  "mcp_tool_invocation_failed",
  "mcp_tool_list_refreshed",
  "mcp_github_attached",
  "mcp_github_auth_missing",
] as const;

/** Check if a session event kind is a tool invocation event. */
export function isMcpToolEvent(kind: string): kind is McpToolEventKind {
  return (MCP_TOOL_EVENT_KINDS as readonly string[]).includes(kind);
}

/** Convert an invocation result to session events. */
export function invocationResultToEvents(
  result: McpToolInvocationResultSummary,
): SessionEvent[] {
  const events: SessionEvent[] = [];

  if (result.status === "completed") {
    events.push(
      mcpToolInvocationCompleted(
        result.serverId,
        result.toolId,
        result.durationMs,
        result.isPartial,
      ),
    );
  } else if (result.status === "failed" || result.status === "validation_failed") {
    events.push(
      mcpToolInvocationFailed(
        result.serverId,
        result.toolId,
        result.error?.code ?? "UNKNOWN",
        result.error?.message ?? "Unknown error",
      ),
    );
  }

  return events;
}
