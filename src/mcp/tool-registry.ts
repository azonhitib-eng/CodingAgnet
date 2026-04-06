/**
 * MCP tool registry — tool inventory per MCP server.
 *
 * Phase 41: Discovered tool registration and inventory management.
 *
 * Supports:
 * - Tool inventory per attached MCP server
 * - Tool metadata summary
 * - Argument schema summary / parameter hints
 * - Enabled/disabled/available tool state
 * - Clear distinction between discovered vs manually registered
 *
 * Does NOT:
 * - Implement full MCP protocol tool listing
 * - Manage tool permissions or ACLs
 */

import type { McpServerId, McpDiscoveredTool } from "./types.js";
import type {
  McpToolId,
  McpToolDefinition,
  McpToolInputSchemaSummary,
} from "./tool-invocation.js";

/* ------------------------------------------------------------------ */
/*  Tool state                                                         */
/* ------------------------------------------------------------------ */

/** Availability state of a tool. */
export type McpToolState =
  | "available"     // tool is discovered and ready
  | "disabled"      // tool is known but explicitly disabled
  | "unavailable"   // tool is known but not invokable (e.g. missing auth)
  | "unknown";      // tool state not yet determined

/* ------------------------------------------------------------------ */
/*  Registry entry                                                     */
/* ------------------------------------------------------------------ */

/** Internal registry entry for a tool. */
export interface McpToolRegistryEntry {
  readonly definition: McpToolDefinition;
  state: McpToolState;
  /** Why the tool is in this state (e.g. "missing GITHUB_TOKEN"). */
  stateReason: string | null;
  /** When this entry was last updated (ISO-8601). */
  lastUpdatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Schema extraction helper                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract an input schema summary from a raw JSON Schema object.
 *
 * Best-effort extraction — not a full schema parser.
 */
export function extractInputSchemaSummary(
  rawSchema?: Record<string, unknown>,
): McpToolInputSchemaSummary {
  if (!rawSchema || typeof rawSchema !== "object") {
    return { required: [], parameters: [], parameterTypes: {}, parameterDescriptions: {} };
  }

  const properties = rawSchema.properties as Record<string, Record<string, unknown>> | undefined;
  const requiredFields = Array.isArray(rawSchema.required)
    ? (rawSchema.required as string[]).filter((r) => typeof r === "string")
    : [];

  const parameters: string[] = [];
  const parameterTypes: Record<string, string> = {};
  const parameterDescriptions: Record<string, string> = {};

  if (properties && typeof properties === "object") {
    for (const [name, prop] of Object.entries(properties)) {
      if (typeof prop === "object" && prop !== null) {
        parameters.push(name);
        if (typeof prop.type === "string") {
          parameterTypes[name] = prop.type;
        }
        if (typeof prop.description === "string") {
          parameterDescriptions[name] = prop.description;
        }
      }
    }
  }

  return {
    required: requiredFields,
    parameters,
    parameterTypes,
    parameterDescriptions,
  };
}

/* ------------------------------------------------------------------ */
/*  Tool Registry                                                      */
/* ------------------------------------------------------------------ */

/**
 * In-memory registry of MCP tools organized by server.
 *
 * Maintains an inventory of all known tools across all MCP servers,
 * supporting both runtime-discovered and manually-registered tools.
 */
export class McpToolRegistry {
  /**
   * Map of serverId → Map of toolId → entry.
   */
  private readonly entries = new Map<McpServerId, Map<McpToolId, McpToolRegistryEntry>>();

  /* ---------- register ---------- */

  /**
   * Register a tool definition (manually or from discovery).
   */
  registerTool(definition: McpToolDefinition, state?: McpToolState): McpToolRegistryEntry {
    let serverTools = this.entries.get(definition.serverId);
    if (!serverTools) {
      serverTools = new Map();
      this.entries.set(definition.serverId, serverTools);
    }

    const entry: McpToolRegistryEntry = {
      definition,
      state: state ?? (definition.enabled ? "available" : "disabled"),
      stateReason: null,
      lastUpdatedAt: new Date().toISOString(),
    };

    serverTools.set(definition.toolId, entry);
    return entry;
  }

  /**
   * Register tools from MCP discovery results.
   *
   * Converts McpDiscoveredTool[] to McpToolDefinition[] and registers them.
   */
  registerDiscoveredTools(
    serverId: McpServerId,
    tools: readonly McpDiscoveredTool[],
    options?: {
      readonly category?: string;
      readonly readOnly?: boolean;
      readonly enabled?: boolean;
    },
  ): McpToolRegistryEntry[] {
    const entries: McpToolRegistryEntry[] = [];
    for (const tool of tools) {
      const definition: McpToolDefinition = {
        toolId: tool.name,
        serverId,
        label: tool.name,
        description: tool.description ?? `Tool: ${tool.name}`,
        category: options?.category ?? "general",
        inputSchema: extractInputSchemaSummary(tool.inputSchema),
        readOnly: options?.readOnly ?? false,
        enabled: options?.enabled ?? true,
        discoveredAtRuntime: true,
        rawInputSchema: tool.inputSchema,
      };
      entries.push(this.registerTool(definition));
    }
    return entries;
  }

  /* ---------- query ---------- */

  /** Get a specific tool entry. */
  getTool(serverId: McpServerId, toolId: McpToolId): McpToolRegistryEntry | undefined {
    return this.entries.get(serverId)?.get(toolId);
  }

  /** Get the tool definition (convenience). */
  getToolDefinition(serverId: McpServerId, toolId: McpToolId): McpToolDefinition | undefined {
    return this.getTool(serverId, toolId)?.definition;
  }

  /** List all tools for a specific server. */
  listServerTools(serverId: McpServerId): McpToolRegistryEntry[] {
    const serverTools = this.entries.get(serverId);
    return serverTools ? [...serverTools.values()] : [];
  }

  /** List all tools across all servers. */
  listAllTools(): McpToolRegistryEntry[] {
    const all: McpToolRegistryEntry[] = [];
    for (const serverTools of this.entries.values()) {
      all.push(...serverTools.values());
    }
    return all;
  }

  /** Get server IDs that have registered tools. */
  getServersWithTools(): McpServerId[] {
    return [...this.entries.keys()];
  }

  /** Count tools for a server. */
  countServerTools(serverId: McpServerId): number {
    return this.entries.get(serverId)?.size ?? 0;
  }

  /** Count all tools across all servers. */
  countAllTools(): number {
    let count = 0;
    for (const serverTools of this.entries.values()) {
      count += serverTools.size;
    }
    return count;
  }

  /* ---------- state management ---------- */

  /** Update the state of a tool. */
  updateToolState(
    serverId: McpServerId,
    toolId: McpToolId,
    state: McpToolState,
    reason?: string,
  ): McpToolRegistryEntry | undefined {
    const entry = this.getTool(serverId, toolId);
    if (!entry) return undefined;

    entry.state = state;
    entry.stateReason = reason ?? null;
    entry.lastUpdatedAt = new Date().toISOString();
    return entry;
  }

  /** Enable a tool. */
  enableTool(serverId: McpServerId, toolId: McpToolId): McpToolRegistryEntry | undefined {
    return this.updateToolState(serverId, toolId, "available");
  }

  /** Disable a tool. */
  disableTool(serverId: McpServerId, toolId: McpToolId, reason?: string): McpToolRegistryEntry | undefined {
    return this.updateToolState(serverId, toolId, "disabled", reason);
  }

  /** Mark a tool as unavailable (e.g. missing auth). */
  markUnavailable(serverId: McpServerId, toolId: McpToolId, reason: string): McpToolRegistryEntry | undefined {
    return this.updateToolState(serverId, toolId, "unavailable", reason);
  }

  /* ---------- filter ---------- */

  /** List available (enabled + state=available) tools for a server. */
  listAvailableTools(serverId: McpServerId): McpToolRegistryEntry[] {
    return this.listServerTools(serverId).filter(
      (e) => e.state === "available" && e.definition.enabled,
    );
  }

  /** List read-only tools for a server. */
  listReadOnlyTools(serverId: McpServerId): McpToolRegistryEntry[] {
    return this.listServerTools(serverId).filter(
      (e) => e.definition.readOnly,
    );
  }

  /* ---------- cleanup ---------- */

  /** Remove all tools for a server. */
  clearServer(serverId: McpServerId): void {
    this.entries.delete(serverId);
  }

  /** Clear all tools. */
  clear(): void {
    this.entries.clear();
  }
}
