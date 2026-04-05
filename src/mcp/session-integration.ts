/**
 * MCP ↔ Session event bridge.
 *
 * Pure helpers that produce MCP-related session events.
 * These are analogous to the existing session event factories
 * in src/session/events.ts but specific to MCP lifecycle.
 */

import type { SessionEvent } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { McpServerId } from "./types.js";

/* ------------------------------------------------------------------ */
/*  MCP Event Kinds                                                   */
/* ------------------------------------------------------------------ */

/**
 * MCP-specific session event kinds.
 *
 * These extend the session timeline with MCP lifecycle visibility.
 */
export type McpSessionEventKind =
  | "mcp_attach_requested"
  | "mcp_attached"
  | "mcp_starting"
  | "mcp_started"
  | "mcp_failed"
  | "mcp_stopped"
  | "mcp_discovered_tools"
  | "mcp_discovered_resources"
  | "mcp_discovered_prompts";

/* ------------------------------------------------------------------ */
/*  Event factories                                                   */
/* ------------------------------------------------------------------ */

export const mcpAttachRequested = (
  serverId: McpServerId,
  name: string,
): SessionEvent =>
  createEvent(
    "mcp_attach_requested" as SessionEvent["kind"],
    `MCP attach requested: ${name}`,
    { serverId, name },
  );

export const mcpAttached = (
  serverId: McpServerId,
  name: string,
): SessionEvent =>
  createEvent("mcp_attached" as SessionEvent["kind"], `MCP server attached: ${name}`, {
    serverId,
    name,
  });

export const mcpStarting = (
  serverId: McpServerId,
  name: string,
): SessionEvent =>
  createEvent(
    "mcp_starting" as SessionEvent["kind"],
    `MCP server starting: ${name}`,
    { serverId, name },
  );

export const mcpStarted = (
  serverId: McpServerId,
  name: string,
  pid: number | null,
): SessionEvent =>
  createEvent(
    "mcp_started" as SessionEvent["kind"],
    `MCP server started: ${name}${pid ? ` (PID ${pid})` : ""}`,
    { serverId, name, pid },
  );

export const mcpFailed = (
  serverId: McpServerId,
  name: string,
  error: string,
): SessionEvent =>
  createEvent(
    "mcp_failed" as SessionEvent["kind"],
    `MCP server failed: ${name} — ${error}`,
    { serverId, name, error },
  );

export const mcpStopped = (
  serverId: McpServerId,
  name: string,
): SessionEvent =>
  createEvent(
    "mcp_stopped" as SessionEvent["kind"],
    `MCP server stopped: ${name}`,
    { serverId, name },
  );

export const mcpDiscoveredTools = (
  serverId: McpServerId,
  toolNames: string[],
): SessionEvent =>
  createEvent(
    "mcp_discovered_tools" as SessionEvent["kind"],
    `Discovered ${toolNames.length} tool(s) from ${serverId}`,
    { serverId, tools: toolNames },
  );

export const mcpDiscoveredResources = (
  serverId: McpServerId,
  resourceUris: string[],
): SessionEvent =>
  createEvent(
    "mcp_discovered_resources" as SessionEvent["kind"],
    `Discovered ${resourceUris.length} resource(s) from ${serverId}`,
    { serverId, resources: resourceUris },
  );

export const mcpDiscoveredPrompts = (
  serverId: McpServerId,
  promptNames: string[],
): SessionEvent =>
  createEvent(
    "mcp_discovered_prompts" as SessionEvent["kind"],
    `Discovered ${promptNames.length} prompt(s) from ${serverId}`,
    { serverId, prompts: promptNames },
  );

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** All known MCP session event kinds. */
export const MCP_EVENT_KINDS: readonly McpSessionEventKind[] = [
  "mcp_attach_requested",
  "mcp_attached",
  "mcp_starting",
  "mcp_started",
  "mcp_failed",
  "mcp_stopped",
  "mcp_discovered_tools",
  "mcp_discovered_resources",
  "mcp_discovered_prompts",
] as const;

/** Check if a session event kind is an MCP event. */
export function isMcpEvent(kind: string): kind is McpSessionEventKind {
  return (MCP_EVENT_KINDS as readonly string[]).includes(kind);
}

/** Filter session events to only MCP-related events. */
export function filterMcpEvents(events: SessionEvent[]): SessionEvent[] {
  return events.filter((e) => isMcpEvent(e.kind));
}

/** Build an MCP attachment summary from session events. */
export function buildMcpEventSummary(
  events: SessionEvent[],
): {
  attached: string[];
  started: string[];
  failed: string[];
  stopped: string[];
} {
  const attached: string[] = [];
  const started: string[] = [];
  const failed: string[] = [];
  const stopped: string[] = [];

  for (const e of events) {
    const sid = (e.detail?.serverId as string) ?? "";
    switch (e.kind) {
      case "mcp_attached":
        attached.push(sid);
        break;
      case "mcp_started":
        started.push(sid);
        break;
      case "mcp_failed":
        failed.push(sid);
        break;
      case "mcp_stopped":
        stopped.push(sid);
        break;
    }
  }

  return { attached, started, failed, stopped };
}
