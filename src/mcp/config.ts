/**
 * Minimal MCP server configuration helpers.
 *
 * Provides factory functions for creating valid McpServerConfig objects.
 * This is the minimal local configuration path — not a global config system.
 */

import type { McpServerConfig, McpServerId, McpTransport } from "./types.js";

/* ------------------------------------------------------------------ */
/*  ID generation                                                     */
/* ------------------------------------------------------------------ */

let _mcpCounter = 0;

/** Generate a unique MCP server id. */
export function generateMcpServerId(): McpServerId {
  _mcpCounter += 1;
  return `mcp-${Date.now()}-${_mcpCounter}`;
}

/** Reset the internal counter (for deterministic tests only). */
export function _resetMcpIdCounter(): void {
  _mcpCounter = 0;
}

/* ------------------------------------------------------------------ */
/*  Config factory                                                    */
/* ------------------------------------------------------------------ */

/** Options for creating an MCP server config. */
export interface CreateMcpServerConfigOptions {
  /** Explicit id. If omitted, one is auto-generated. */
  id?: McpServerId;
  /** Human-readable name. */
  name: string;
  /** Transport type. */
  transport: McpTransport;
  /** Launch command (stdio). */
  command?: string;
  /** Command arguments (stdio). */
  args?: string[];
  /** Environment variables (stdio). */
  env?: Record<string, string>;
  /** Working directory (stdio). */
  cwd?: string;
  /** Server URL (sse / streamable_http). */
  url?: string;
}

/**
 * Create a validated MCP server config.
 *
 * Performs basic validation:
 * - stdio transport requires a command
 * - sse/streamable_http transport requires a url
 * - name must be non-empty
 */
export function createMcpServerConfig(
  opts: CreateMcpServerConfigOptions,
): McpServerConfig {
  if (!opts.name || opts.name.trim().length === 0) {
    throw new Error("MCP server name must be non-empty");
  }

  if (opts.transport === "stdio" && !opts.command) {
    throw new Error(
      "stdio transport requires a command",
    );
  }

  if (
    (opts.transport === "sse" || opts.transport === "streamable_http") &&
    !opts.url
  ) {
    throw new Error(
      `${opts.transport} transport requires a url`,
    );
  }

  const id = opts.id ?? generateMcpServerId();

  return {
    id,
    name: opts.name.trim(),
    transport: opts.transport,
    ...(opts.command !== undefined ? { command: opts.command } : {}),
    ...(opts.args !== undefined ? { args: opts.args } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.url !== undefined ? { url: opts.url } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Predefined test/demo configs                                      */
/* ------------------------------------------------------------------ */

/**
 * Create a fixture config for a simple echo-like MCP server (for tests).
 *
 * Uses `cat` as a minimal stdio process that reads stdin and echoes stdout.
 */
export function fixtureEchoConfig(
  overrides?: Partial<CreateMcpServerConfigOptions>,
): McpServerConfig {
  return createMcpServerConfig({
    id: "fixture-echo",
    name: "Echo MCP Server",
    transport: "stdio",
    command: "cat",
    ...overrides,
  });
}

/**
 * Create a fixture config for a node-based MCP server (for tests).
 */
export function fixtureNodeConfig(
  script: string,
  overrides?: Partial<CreateMcpServerConfigOptions>,
): McpServerConfig {
  return createMcpServerConfig({
    id: "fixture-node",
    name: "Node MCP Server",
    transport: "stdio",
    command: "node",
    args: [script],
    ...overrides,
  });
}

/**
 * Create a fixture config for an externally-managed SSE server.
 */
export function fixtureSseConfig(
  url: string,
  overrides?: Partial<CreateMcpServerConfigOptions>,
): McpServerConfig {
  return createMcpServerConfig({
    id: "fixture-sse",
    name: "SSE MCP Server",
    transport: "sse",
    url,
    ...overrides,
  });
}
