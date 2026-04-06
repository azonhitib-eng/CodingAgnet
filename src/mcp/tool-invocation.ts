/**
 * MCP tool invocation domain types.
 *
 * Phase 41: Typed tool invocation layer for MCP-backed tools.
 *
 * Explicit, small types for modeling:
 * - Tool identity and definition
 * - Invocation requests and results
 * - Error handling
 * - Session action summaries
 *
 * Does NOT implement:
 * - Autonomous reasoning loops
 * - Full RPC framework
 * - LLM chat orchestration
 */

import type { McpServerId } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Tool identity                                                      */
/* ------------------------------------------------------------------ */

/** Unique identifier for a tool within an MCP server (tool name). */
export type McpToolId = string;

/* ------------------------------------------------------------------ */
/*  Input schema summary                                               */
/* ------------------------------------------------------------------ */

/**
 * Simplified summary of a tool's input parameters.
 *
 * Not a full JSON Schema — just enough for validation hints
 * and display without requiring a schema parser.
 */
export interface McpToolInputSchemaSummary {
  /** Parameter names that are required. */
  readonly required: readonly string[];
  /** All known parameter names (required + optional). */
  readonly parameters: readonly string[];
  /** Brief type hint per parameter (e.g. "string", "number", "object"). */
  readonly parameterTypes: Readonly<Record<string, string>>;
  /** Brief description per parameter, if available. */
  readonly parameterDescriptions: Readonly<Record<string, string>>;
}

/* ------------------------------------------------------------------ */
/*  Tool definition                                                    */
/* ------------------------------------------------------------------ */

/**
 * Full definition of an MCP tool — combines identity, metadata,
 * and schema summary.
 */
export interface McpToolDefinition {
  /** Tool name (unique within a server). */
  readonly toolId: McpToolId;
  /** MCP server this tool belongs to. */
  readonly serverId: McpServerId;
  /** Human-readable label. */
  readonly label: string;
  /** Short description of what the tool does. */
  readonly description: string;
  /** Category / grouping hint (e.g. "github", "filesystem"). */
  readonly category: string;
  /** Input schema summary. */
  readonly inputSchema: McpToolInputSchemaSummary;
  /** Whether this tool is read-only (no side effects). */
  readonly readOnly: boolean;
  /** Whether this tool is currently enabled for invocation. */
  readonly enabled: boolean;
  /** Whether this tool was discovered at runtime vs manually registered. */
  readonly discoveredAtRuntime: boolean;
  /** Raw JSON Schema for the input, if available from the MCP server. */
  readonly rawInputSchema?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Invocation request                                                 */
/* ------------------------------------------------------------------ */

/**
 * A request to invoke an MCP tool explicitly.
 *
 * Tool invocation is always user/command-triggered — never automatic.
 */
export interface McpToolInvocationRequest {
  /** Which tool to invoke. */
  readonly toolId: McpToolId;
  /** Which MCP server owns this tool. */
  readonly serverId: McpServerId;
  /** Session in which the invocation occurs. */
  readonly sessionId: string;
  /** Input arguments (key-value map matching the tool's input schema). */
  readonly input: Readonly<Record<string, unknown>>;
  /** Optional human-readable reason for the invocation. */
  readonly reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Invocation status                                                  */
/* ------------------------------------------------------------------ */

/** Lifecycle status of a tool invocation. */
export type McpToolInvocationStatus =
  | "pending"            // request created, not yet sent
  | "validating"         // validating input against schema
  | "invoking"           // sent to MCP server, awaiting response
  | "completed"          // successful response received
  | "failed"             // error during invocation
  | "validation_failed"; // input validation failed

/* ------------------------------------------------------------------ */
/*  Invocation error                                                   */
/* ------------------------------------------------------------------ */

/** Structured error from a tool invocation attempt. */
export interface McpToolInvocationError {
  /** Error code/category. */
  readonly code: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Whether the error is recoverable (e.g. auth missing vs tool not found). */
  readonly recoverable: boolean;
  /** Additional detail for debugging. */
  readonly detail?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Invocation result                                                  */
/* ------------------------------------------------------------------ */

/**
 * Summary of a completed (or failed) tool invocation.
 */
export interface McpToolInvocationResultSummary {
  /** Which tool was invoked. */
  readonly toolId: McpToolId;
  /** Which MCP server. */
  readonly serverId: McpServerId;
  /** Session where invocation occurred. */
  readonly sessionId: string;
  /** Final status. */
  readonly status: McpToolInvocationStatus;
  /** ISO-8601 timestamp when invocation started. */
  readonly startedAt: string;
  /** ISO-8601 timestamp when invocation completed (null if still pending). */
  readonly completedAt: string | null;
  /** Duration in milliseconds (null if not completed). */
  readonly durationMs: number | null;
  /** Result data from the tool (null on failure). */
  readonly result: unknown | null;
  /** Whether the result is partial (e.g. truncated, paginated). */
  readonly isPartial: boolean;
  /** Error details (null on success). */
  readonly error: McpToolInvocationError | null;
}

/* ------------------------------------------------------------------ */
/*  Session tool action summary                                        */
/* ------------------------------------------------------------------ */

/**
 * Summary of tool invocation activity within a session.
 *
 * Used for session-level reporting and UI display.
 */
export interface SessionToolActionSummary {
  /** Total number of tool invocations in this session. */
  readonly totalInvocations: number;
  /** Number of successful invocations. */
  readonly successCount: number;
  /** Number of failed invocations. */
  readonly failureCount: number;
  /** Number of pending invocations. */
  readonly pendingCount: number;
  /** Most recent invocation result (null if none). */
  readonly lastInvocation: McpToolInvocationResultSummary | null;
  /** Unique tool IDs invoked in this session. */
  readonly toolsUsed: readonly McpToolId[];
  /** Unique MCP server IDs involved. */
  readonly serversUsed: readonly McpServerId[];
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate that an invocation request has all required input fields.
 *
 * Returns a list of missing or invalid fields. Empty list = valid.
 */
export function validateInvocationInput(
  request: McpToolInvocationRequest,
  definition: McpToolDefinition,
): readonly string[] {
  const errors: string[] = [];

  if (!request.toolId || request.toolId.trim().length === 0) {
    errors.push("toolId is required");
  }
  if (!request.serverId || request.serverId.trim().length === 0) {
    errors.push("serverId is required");
  }
  if (!request.sessionId || request.sessionId.trim().length === 0) {
    errors.push("sessionId is required");
  }

  // Check required input fields
  for (const field of definition.inputSchema.required) {
    const value = request.input[field];
    if (value === undefined || value === null) {
      errors.push(`Required input field missing: ${field}`);
    } else if (typeof value === "string" && value.trim().length === 0) {
      errors.push(`Required input field is empty: ${field}`);
    }
  }

  return errors;
}

/**
 * Execute a tool invocation against a provided executor function.
 *
 * This is the core invocation flow:
 * 1. Validate input
 * 2. Call executor
 * 3. Return structured result
 *
 * The executor is injected (not hardcoded) so callers control the actual
 * MCP communication mechanism.
 */
export async function executeToolInvocation(
  request: McpToolInvocationRequest,
  definition: McpToolDefinition,
  executor: (
    toolId: McpToolId,
    serverId: McpServerId,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<{ result: unknown; isPartial?: boolean }>,
): Promise<McpToolInvocationResultSummary> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Validate
  const validationErrors = validateInvocationInput(request, definition);
  if (validationErrors.length > 0) {
    return {
      toolId: request.toolId,
      serverId: request.serverId,
      sessionId: request.sessionId,
      status: "validation_failed",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      result: null,
      isPartial: false,
      error: {
        code: "VALIDATION_FAILED",
        message: validationErrors.join("; "),
        recoverable: true,
        detail: { errors: validationErrors },
      },
    };
  }

  // Check tool is enabled
  if (!definition.enabled) {
    return {
      toolId: request.toolId,
      serverId: request.serverId,
      sessionId: request.sessionId,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      result: null,
      isPartial: false,
      error: {
        code: "TOOL_DISABLED",
        message: `Tool ${request.toolId} is currently disabled`,
        recoverable: false,
      },
    };
  }

  // Execute
  try {
    const response = await executor(
      request.toolId,
      request.serverId,
      request.input,
    );
    return {
      toolId: request.toolId,
      serverId: request.serverId,
      sessionId: request.sessionId,
      status: "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      result: response.result,
      isPartial: response.isPartial ?? false,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolId: request.toolId,
      serverId: request.serverId,
      sessionId: request.sessionId,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      result: null,
      isPartial: false,
      error: {
        code: "INVOCATION_ERROR",
        message,
        recoverable: false,
        detail: { originalError: message },
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Summary builder                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a session tool action summary from a list of invocation results.
 */
export function buildSessionToolActionSummary(
  results: readonly McpToolInvocationResultSummary[],
): SessionToolActionSummary {
  const successCount = results.filter((r) => r.status === "completed").length;
  const failureCount = results.filter(
    (r) => r.status === "failed" || r.status === "validation_failed",
  ).length;
  const pendingCount = results.filter(
    (r) => r.status === "pending" || r.status === "invoking" || r.status === "validating",
  ).length;

  const toolsUsed = [...new Set(results.map((r) => r.toolId))];
  const serversUsed = [...new Set(results.map((r) => r.serverId))];

  return {
    totalInvocations: results.length,
    successCount,
    failureCount,
    pendingCount,
    lastInvocation: results.length > 0 ? results[results.length - 1] : null,
    toolsUsed,
    serversUsed,
  };
}
