/**
 * MCP (Model Context Protocol) domain types.
 *
 * Explicit types for modeling MCP server configs, lifecycle states,
 * attachments to sessions, and discovered capabilities.
 *
 * Design rules:
 * - Small, explicit types — no giant framework
 * - Process lifecycle is separate from protocol/capability modeling
 * - Session integration is separate from both
 */

/* ------------------------------------------------------------------ */
/*  Identity                                                          */
/* ------------------------------------------------------------------ */

/** Unique identifier for an MCP server config (opaque string). */
export type McpServerId = string;

/* ------------------------------------------------------------------ */
/*  Transport                                                         */
/* ------------------------------------------------------------------ */

/**
 * Transport type for connecting to an MCP server.
 *
 * - `stdio`: local child process communicating over stdin/stdout
 * - `sse`:   server-sent events over HTTP (modeled, not yet implemented)
 * - `streamable_http`: newer HTTP-based transport (modeled, not yet implemented)
 */
export type McpTransport = "stdio" | "sse" | "streamable_http";

/* ------------------------------------------------------------------ */
/*  Server Config                                                     */
/* ------------------------------------------------------------------ */

/**
 * Static configuration describing how to launch or connect to an MCP server.
 *
 * For stdio transport: command, args, env, cwd are used.
 * For network transports: url is used (future).
 */
export interface McpServerConfig {
  /** Unique identifier for this server config. */
  readonly id: McpServerId;
  /** Human-readable label. */
  readonly name: string;
  /** Transport mechanism. */
  readonly transport: McpTransport;
  /** Launch command (stdio transport). */
  readonly command?: string;
  /** Command arguments (stdio transport). */
  readonly args?: readonly string[];
  /** Environment variables (stdio transport). */
  readonly env?: Readonly<Record<string, string>>;
  /** Working directory (stdio transport). */
  readonly cwd?: string;
  /** Server URL (sse / streamable_http transports, future). */
  readonly url?: string;
}

/* ------------------------------------------------------------------ */
/*  Server Status & Health                                            */
/* ------------------------------------------------------------------ */

/** Runtime status of an MCP server process. */
export type McpServerStatus =
  | "registered"     // config known, not yet started
  | "starting"       // process launch in progress
  | "running"        // process is alive
  | "stopping"       // shutdown requested
  | "stopped"        // cleanly stopped
  | "failed";        // crashed or failed to start

/** Health assessment of a running MCP server. */
export type McpServerHealth =
  | "unknown"        // not yet assessed
  | "healthy"        // responding normally
  | "degraded"       // partially working
  | "unhealthy";     // not responding / erroring

/* ------------------------------------------------------------------ */
/*  Attachment                                                        */
/* ------------------------------------------------------------------ */

/** Status of an MCP server attachment to a session. */
export type McpAttachmentStatus =
  | "pending"        // attach requested, not yet confirmed
  | "attached"       // successfully attached to session
  | "detaching"      // detach in progress
  | "detached"       // cleanly detached
  | "failed";        // attachment failed

/**
 * Runtime binding of an MCP server to a session.
 *
 * Tracks the attachment lifecycle independent of the server process lifecycle.
 */
export interface McpAttachment {
  /** The server config id. */
  readonly serverId: McpServerId;
  /** The session id this is attached to. */
  readonly sessionId: string;
  /** Current attachment status. */
  status: McpAttachmentStatus;
  /** When attachment was requested (ISO-8601). */
  readonly attachedAt: string;
  /** When detachment completed (ISO-8601, null if still attached). */
  detachedAt: string | null;
  /** Error description if attachment failed. */
  failureReason: string | null;
}

/* ------------------------------------------------------------------ */
/*  Discovered Capabilities                                           */
/* ------------------------------------------------------------------ */

/** A tool discovered from an MCP server. */
export interface McpDiscoveredTool {
  readonly name: string;
  readonly description?: string;
  /** JSON Schema for input parameters, if available. */
  readonly inputSchema?: Record<string, unknown>;
}

/** A resource discovered from an MCP server. */
export interface McpDiscoveredResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

/** A prompt template discovered from an MCP server. */
export interface McpDiscoveredPrompt {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly required?: boolean;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Runtime Info                                                      */
/* ------------------------------------------------------------------ */

/**
 * Aggregated runtime information for an MCP server.
 *
 * Combines config, process status, health, and discovered capabilities
 * into one summary view.
 */
export interface McpRuntimeInfo {
  readonly config: McpServerConfig;
  readonly status: McpServerStatus;
  readonly health: McpServerHealth;
  /** Process ID if the server is a local stdio process. */
  readonly pid: number | null;
  /** ISO-8601 timestamp when the server was started. */
  readonly startedAt: string | null;
  /** ISO-8601 timestamp when the server was stopped. */
  readonly stoppedAt: string | null;
  /** Last error message, if any. */
  readonly lastError: string | null;
  /** Discovered tools. */
  readonly tools: readonly McpDiscoveredTool[];
  /** Discovered resources. */
  readonly resources: readonly McpDiscoveredResource[];
  /** Discovered prompts. */
  readonly prompts: readonly McpDiscoveredPrompt[];
}
