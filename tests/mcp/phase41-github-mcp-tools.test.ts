/**
 * Phase 41 — GitHub MCP integration and tool invocation layer tests.
 *
 * Covers:
 * - Tool invocation domain types and validation
 * - Tool registry (registration, discovery, state management)
 * - GitHub MCP integration (config, auth, known tools, status)
 * - Tool session integration (events)
 * - Invocation execution flow (success, failure, validation)
 * - Command integration (new commands)
 * - Session summary extensions
 * - Honesty boundaries (auth missing, discovery incomplete)
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports from tool-invocation                                       */
/* ------------------------------------------------------------------ */

import {
  validateInvocationInput,
  executeToolInvocation,
  buildSessionToolActionSummary,
} from "../../src/mcp/tool-invocation.js";
import type {
  McpToolId,
  McpToolDefinition,
  McpToolInputSchemaSummary,
  McpToolInvocationRequest,
  McpToolInvocationStatus,
  McpToolInvocationResultSummary,
  McpToolInvocationError,
  SessionToolActionSummary,
} from "../../src/mcp/tool-invocation.js";

/* ------------------------------------------------------------------ */
/*  Imports from tool-registry                                         */
/* ------------------------------------------------------------------ */

import {
  McpToolRegistry,
  extractInputSchemaSummary,
} from "../../src/mcp/tool-registry.js";
import type {
  McpToolState,
  McpToolRegistryEntry,
} from "../../src/mcp/tool-registry.js";

/* ------------------------------------------------------------------ */
/*  Imports from github-mcp                                            */
/* ------------------------------------------------------------------ */

import {
  GITHUB_MCP_SERVER_ID,
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_DEFAULT_COMMAND,
  GITHUB_MCP_DEFAULT_ARGS,
  GITHUB_TOKEN_ENV_VAR,
  isGitHubAuthConfigured,
  getGitHubAuthStatus,
  createGitHubMcpConfig,
  getKnownGitHubToolDefinitions,
  KNOWN_GITHUB_TOOL_IDS,
  assessGitHubMcpStatus,
} from "../../src/mcp/github-mcp.js";
import type { GitHubMcpIntegrationStatus } from "../../src/mcp/github-mcp.js";

/* ------------------------------------------------------------------ */
/*  Imports from tool-session-integration                              */
/* ------------------------------------------------------------------ */

import {
  mcpToolInvocationStarted,
  mcpToolInvocationCompleted,
  mcpToolInvocationFailed,
  mcpToolListRefreshed,
  mcpGitHubAttached,
  mcpGitHubAuthMissing,
  MCP_TOOL_EVENT_KINDS,
  isMcpToolEvent,
  invocationResultToEvents,
} from "../../src/mcp/tool-session-integration.js";

/* ------------------------------------------------------------------ */
/*  Imports from commands                                               */
/* ------------------------------------------------------------------ */

import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  getCommandDefinition,
  groupByCategory,
  validateCommand,
  executeCommand,
} from "../../src/commands/index.js";
import type {
  CommandPayload,
  ListMcpToolsPayload,
  InspectMcpToolPayload,
  InvokeMcpToolPayload,
  AttachGitHubMcpPayload,
  CommandExecutorDeps,
} from "../../src/commands/index.js";
import {
  validateInspectMcpTool,
  validateInvokeMcpTool,
} from "../../src/commands/validation.js";

/* ------------------------------------------------------------------ */
/*  Imports from session                                                */
/* ------------------------------------------------------------------ */

import { SessionManager } from "../../src/session/session-manager.js";
import type { SessionSummary } from "../../src/session/session-manager.js";

/* ------------------------------------------------------------------ */
/*  Imports from mcp barrel                                            */
/* ------------------------------------------------------------------ */

import { McpToolRegistry as BarrelRegistry } from "../../src/mcp/index.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeToolDef(overrides?: Partial<McpToolDefinition>): McpToolDefinition {
  return {
    toolId: "test_tool",
    serverId: "test-server",
    label: "Test Tool",
    description: "A test tool",
    category: "test",
    inputSchema: {
      required: ["owner", "repo"],
      parameters: ["owner", "repo", "path"],
      parameterTypes: { owner: "string", repo: "string", path: "string" },
      parameterDescriptions: { owner: "Repo owner", repo: "Repo name", path: "File path" },
    },
    readOnly: true,
    enabled: true,
    discoveredAtRuntime: false,
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<McpToolInvocationRequest>): McpToolInvocationRequest {
  return {
    toolId: "test_tool",
    serverId: "test-server",
    sessionId: "session-1",
    input: { owner: "octocat", repo: "hello-world" },
    ...overrides,
  };
}

function makeResult(
  overrides?: Partial<McpToolInvocationResultSummary>,
): McpToolInvocationResultSummary {
  return {
    toolId: "test_tool",
    serverId: "test-server",
    sessionId: "session-1",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    result: { content: "hello" },
    isPartial: false,
    error: null,
    ...overrides,
  };
}

/* ================================================================== */
/*  TOOL INVOCATION DOMAIN                                             */
/* ================================================================== */

describe("Tool invocation domain (tool-invocation.ts)", () => {
  describe("validateInvocationInput", () => {
    it("returns empty array for valid input", () => {
      const def = makeToolDef();
      const req = makeRequest();
      const errors = validateInvocationInput(req, def);
      expect(errors).toHaveLength(0);
    });

    it("catches missing toolId", () => {
      const def = makeToolDef();
      const req = makeRequest({ toolId: "" });
      const errors = validateInvocationInput(req, def);
      expect(errors.some((e) => e.includes("toolId"))).toBe(true);
    });

    it("catches missing serverId", () => {
      const def = makeToolDef();
      const req = makeRequest({ serverId: "" });
      const errors = validateInvocationInput(req, def);
      expect(errors.some((e) => e.includes("serverId"))).toBe(true);
    });

    it("catches missing sessionId", () => {
      const def = makeToolDef();
      const req = makeRequest({ sessionId: "" });
      const errors = validateInvocationInput(req, def);
      expect(errors.some((e) => e.includes("sessionId"))).toBe(true);
    });

    it("catches missing required input field", () => {
      const def = makeToolDef();
      const req = makeRequest({ input: { owner: "octocat" } }); // missing 'repo'
      const errors = validateInvocationInput(req, def);
      expect(errors.some((e) => e.includes("repo"))).toBe(true);
    });

    it("catches empty required input field", () => {
      const def = makeToolDef();
      const req = makeRequest({ input: { owner: "octocat", repo: "" } });
      const errors = validateInvocationInput(req, def);
      expect(errors.some((e) => e.includes("repo"))).toBe(true);
    });

    it("passes with optional fields missing", () => {
      const def = makeToolDef();
      const req = makeRequest({ input: { owner: "octocat", repo: "hello" } }); // 'path' optional
      const errors = validateInvocationInput(req, def);
      expect(errors).toHaveLength(0);
    });

    it("catches all missing fields at once", () => {
      const def = makeToolDef();
      const req = makeRequest({ toolId: "", serverId: "", sessionId: "", input: {} });
      const errors = validateInvocationInput(req, def);
      expect(errors.length).toBeGreaterThanOrEqual(5); // toolId, serverId, sessionId, owner, repo
    });
  });

  describe("executeToolInvocation", () => {
    it("returns completed result on success", async () => {
      const def = makeToolDef();
      const req = makeRequest();
      const executor = async () => ({ result: { files: ["README.md"] } });
      const result = await executeToolInvocation(req, def, executor);

      expect(result.status).toBe("completed");
      expect(result.error).toBeNull();
      expect(result.result).toEqual({ files: ["README.md"] });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.isPartial).toBe(false);
      expect(result.toolId).toBe("test_tool");
      expect(result.serverId).toBe("test-server");
      expect(result.sessionId).toBe("session-1");
    });

    it("returns partial result when executor flags partial", async () => {
      const def = makeToolDef();
      const req = makeRequest();
      const executor = async () => ({ result: { items: [] }, isPartial: true });
      const result = await executeToolInvocation(req, def, executor);

      expect(result.status).toBe("completed");
      expect(result.isPartial).toBe(true);
    });

    it("returns validation_failed when input is invalid", async () => {
      const def = makeToolDef();
      const req = makeRequest({ input: {} }); // missing required fields
      const executor = async () => ({ result: null });
      const result = await executeToolInvocation(req, def, executor);

      expect(result.status).toBe("validation_failed");
      expect(result.error).not.toBeNull();
      expect(result.error!.code).toBe("VALIDATION_FAILED");
      expect(result.error!.recoverable).toBe(true);
    });

    it("returns failed when tool is disabled", async () => {
      const def = makeToolDef({ enabled: false });
      const req = makeRequest();
      const executor = async () => ({ result: null });
      const result = await executeToolInvocation(req, def, executor);

      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("TOOL_DISABLED");
      expect(result.error!.recoverable).toBe(false);
    });

    it("returns failed when executor throws", async () => {
      const def = makeToolDef();
      const req = makeRequest();
      const executor = async () => {
        throw new Error("Network timeout");
      };
      const result = await executeToolInvocation(req, def, executor);

      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("INVOCATION_ERROR");
      expect(result.error!.message).toBe("Network timeout");
      expect(result.error!.recoverable).toBe(false);
    });

    it("does not call executor when validation fails", async () => {
      const def = makeToolDef();
      const req = makeRequest({ input: {} });
      let called = false;
      const executor = async () => {
        called = true;
        return { result: null };
      };
      await executeToolInvocation(req, def, executor);
      expect(called).toBe(false);
    });

    it("does not call executor when tool is disabled", async () => {
      const def = makeToolDef({ enabled: false });
      const req = makeRequest();
      let called = false;
      const executor = async () => {
        called = true;
        return { result: null };
      };
      await executeToolInvocation(req, def, executor);
      expect(called).toBe(false);
    });
  });

  describe("buildSessionToolActionSummary", () => {
    it("returns empty summary for no results", () => {
      const summary = buildSessionToolActionSummary([]);
      expect(summary.totalInvocations).toBe(0);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(0);
      expect(summary.pendingCount).toBe(0);
      expect(summary.lastInvocation).toBeNull();
      expect(summary.toolsUsed).toHaveLength(0);
      expect(summary.serversUsed).toHaveLength(0);
    });

    it("counts successes and failures correctly", () => {
      const results = [
        makeResult({ status: "completed" }),
        makeResult({ status: "failed", toolId: "tool_b" }),
        makeResult({ status: "completed", toolId: "tool_c", serverId: "server-2" }),
        makeResult({ status: "validation_failed", toolId: "tool_d" }),
      ];
      const summary = buildSessionToolActionSummary(results);
      expect(summary.totalInvocations).toBe(4);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(2);
      expect(summary.pendingCount).toBe(0);
    });

    it("tracks unique tools and servers used", () => {
      const results = [
        makeResult({ toolId: "t1", serverId: "s1" }),
        makeResult({ toolId: "t1", serverId: "s2" }),
        makeResult({ toolId: "t2", serverId: "s1" }),
      ];
      const summary = buildSessionToolActionSummary(results);
      expect(summary.toolsUsed).toEqual(["t1", "t2"]);
      expect(summary.serversUsed).toEqual(["s1", "s2"]);
    });

    it("lastInvocation is the most recent", () => {
      const results = [
        makeResult({ toolId: "t1" }),
        makeResult({ toolId: "t2" }),
      ];
      const summary = buildSessionToolActionSummary(results);
      expect(summary.lastInvocation!.toolId).toBe("t2");
    });
  });

  describe("type coverage", () => {
    it("McpToolInvocationStatus has expected values", () => {
      const statuses: McpToolInvocationStatus[] = [
        "pending", "validating", "invoking", "completed", "failed", "validation_failed",
      ];
      expect(statuses).toHaveLength(6);
    });

    it("McpToolInvocationError has expected shape", () => {
      const err: McpToolInvocationError = {
        code: "TEST",
        message: "test error",
        recoverable: true,
        detail: { foo: "bar" },
      };
      expect(err.code).toBe("TEST");
      expect(err.recoverable).toBe(true);
    });
  });
});

/* ================================================================== */
/*  TOOL REGISTRY                                                      */
/* ================================================================== */

describe("Tool registry (tool-registry.ts)", () => {
  let registry: McpToolRegistry;

  beforeEach(() => {
    registry = new McpToolRegistry();
  });

  describe("registerTool", () => {
    it("registers a tool definition", () => {
      const def = makeToolDef();
      const entry = registry.registerTool(def);
      expect(entry.definition).toBe(def);
      expect(entry.state).toBe("available");
      expect(entry.stateReason).toBeNull();
    });

    it("registers disabled tool with disabled state", () => {
      const def = makeToolDef({ enabled: false });
      const entry = registry.registerTool(def);
      expect(entry.state).toBe("disabled");
    });

    it("accepts explicit state override", () => {
      const def = makeToolDef();
      const entry = registry.registerTool(def, "unavailable");
      expect(entry.state).toBe("unavailable");
    });
  });

  describe("registerDiscoveredTools", () => {
    it("converts discovered tools to registry entries", () => {
      const discovered = [
        { name: "tool_a", description: "Tool A", inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] } },
        { name: "tool_b", description: "Tool B" },
      ];
      const entries = registry.registerDiscoveredTools("server-1", discovered, { category: "github", readOnly: true });
      expect(entries).toHaveLength(2);
      expect(entries[0].definition.toolId).toBe("tool_a");
      expect(entries[0].definition.category).toBe("github");
      expect(entries[0].definition.readOnly).toBe(true);
      expect(entries[0].definition.discoveredAtRuntime).toBe(true);
      expect(entries[1].definition.toolId).toBe("tool_b");
    });

    it("extracts input schema from discovered tools", () => {
      const discovered = [
        {
          name: "tool_x",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string", description: "Repo owner" },
              repo: { type: "string", description: "Repo name" },
            },
            required: ["owner"],
          },
        },
      ];
      const entries = registry.registerDiscoveredTools("server-1", discovered);
      const schema = entries[0].definition.inputSchema;
      expect(schema.required).toEqual(["owner"]);
      expect(schema.parameters).toContain("owner");
      expect(schema.parameters).toContain("repo");
      expect(schema.parameterTypes.owner).toBe("string");
      expect(schema.parameterDescriptions.owner).toBe("Repo owner");
    });
  });

  describe("query methods", () => {
    beforeEach(() => {
      registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1" }));
      registry.registerTool(makeToolDef({ toolId: "t2", serverId: "s1" }));
      registry.registerTool(makeToolDef({ toolId: "t3", serverId: "s2" }));
    });

    it("getTool returns specific tool", () => {
      const entry = registry.getTool("s1", "t1");
      expect(entry).toBeDefined();
      expect(entry!.definition.toolId).toBe("t1");
    });

    it("getTool returns undefined for unknown tool", () => {
      expect(registry.getTool("s1", "nonexistent")).toBeUndefined();
    });

    it("getToolDefinition returns definition", () => {
      const def = registry.getToolDefinition("s1", "t1");
      expect(def).toBeDefined();
      expect(def!.toolId).toBe("t1");
    });

    it("listServerTools returns tools for a server", () => {
      const tools = registry.listServerTools("s1");
      expect(tools).toHaveLength(2);
    });

    it("listServerTools returns empty for unknown server", () => {
      expect(registry.listServerTools("unknown")).toHaveLength(0);
    });

    it("listAllTools returns all tools", () => {
      expect(registry.listAllTools()).toHaveLength(3);
    });

    it("getServersWithTools returns server IDs", () => {
      const servers = registry.getServersWithTools();
      expect(servers).toContain("s1");
      expect(servers).toContain("s2");
    });

    it("countServerTools returns correct count", () => {
      expect(registry.countServerTools("s1")).toBe(2);
      expect(registry.countServerTools("s2")).toBe(1);
      expect(registry.countServerTools("unknown")).toBe(0);
    });

    it("countAllTools returns total", () => {
      expect(registry.countAllTools()).toBe(3);
    });
  });

  describe("state management", () => {
    beforeEach(() => {
      registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1" }));
    });

    it("updateToolState changes state and reason", () => {
      const entry = registry.updateToolState("s1", "t1", "unavailable", "auth missing");
      expect(entry!.state).toBe("unavailable");
      expect(entry!.stateReason).toBe("auth missing");
    });

    it("enableTool sets state to available", () => {
      registry.updateToolState("s1", "t1", "disabled");
      registry.enableTool("s1", "t1");
      const entry = registry.getTool("s1", "t1");
      expect(entry!.state).toBe("available");
    });

    it("disableTool sets state to disabled with reason", () => {
      registry.disableTool("s1", "t1", "user disabled");
      const entry = registry.getTool("s1", "t1");
      expect(entry!.state).toBe("disabled");
      expect(entry!.stateReason).toBe("user disabled");
    });

    it("markUnavailable sets state to unavailable", () => {
      registry.markUnavailable("s1", "t1", "token expired");
      const entry = registry.getTool("s1", "t1");
      expect(entry!.state).toBe("unavailable");
      expect(entry!.stateReason).toBe("token expired");
    });

    it("returns undefined for unknown tool", () => {
      expect(registry.updateToolState("s1", "unknown", "available")).toBeUndefined();
    });
  });

  describe("filter methods", () => {
    beforeEach(() => {
      registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1", readOnly: true }));
      registry.registerTool(makeToolDef({ toolId: "t2", serverId: "s1", readOnly: false, enabled: false }));
      registry.registerTool(makeToolDef({ toolId: "t3", serverId: "s1", readOnly: true }));
    });

    it("listAvailableTools filters by state and enabled", () => {
      const available = registry.listAvailableTools("s1");
      expect(available).toHaveLength(2);
      expect(available.every((e) => e.state === "available")).toBe(true);
    });

    it("listReadOnlyTools filters by readOnly", () => {
      const readOnly = registry.listReadOnlyTools("s1");
      expect(readOnly).toHaveLength(2);
      expect(readOnly.every((e) => e.definition.readOnly)).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("clearServer removes all tools for a server", () => {
      registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1" }));
      registry.registerTool(makeToolDef({ toolId: "t2", serverId: "s1" }));
      registry.clearServer("s1");
      expect(registry.listServerTools("s1")).toHaveLength(0);
    });

    it("clear removes all tools", () => {
      registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1" }));
      registry.registerTool(makeToolDef({ toolId: "t2", serverId: "s2" }));
      registry.clear();
      expect(registry.countAllTools()).toBe(0);
    });
  });

  describe("extractInputSchemaSummary", () => {
    it("handles empty/undefined schema", () => {
      expect(extractInputSchemaSummary(undefined)).toEqual({
        required: [], parameters: [], parameterTypes: {}, parameterDescriptions: {},
      });
      expect(extractInputSchemaSummary({})).toEqual({
        required: [], parameters: [], parameterTypes: {}, parameterDescriptions: {},
      });
    });

    it("extracts parameters and types from properties", () => {
      const schema = extractInputSchemaSummary({
        type: "object",
        properties: {
          name: { type: "string", description: "User name" },
          age: { type: "number", description: "User age" },
        },
        required: ["name"],
      });
      expect(schema.required).toEqual(["name"]);
      expect(schema.parameters).toContain("name");
      expect(schema.parameters).toContain("age");
      expect(schema.parameterTypes.name).toBe("string");
      expect(schema.parameterTypes.age).toBe("number");
      expect(schema.parameterDescriptions.name).toBe("User name");
    });
  });

  describe("barrel export", () => {
    it("McpToolRegistry is accessible from barrel", () => {
      expect(BarrelRegistry).toBe(McpToolRegistry);
    });
  });
});

/* ================================================================== */
/*  GITHUB MCP INTEGRATION                                             */
/* ================================================================== */

describe("GitHub MCP integration (github-mcp.ts)", () => {
  describe("constants", () => {
    it("has well-known server ID", () => {
      expect(GITHUB_MCP_SERVER_ID).toBe("github-mcp-server");
    });

    it("has well-known server name", () => {
      expect(GITHUB_MCP_SERVER_NAME).toBe("GitHub MCP Server");
    });

    it("has default command and args", () => {
      expect(GITHUB_MCP_DEFAULT_COMMAND).toBe("npx");
      expect(GITHUB_MCP_DEFAULT_ARGS).toContain("@modelcontextprotocol/server-github");
    });

    it("KNOWN_GITHUB_TOOL_IDS has 10 tools", () => {
      expect(KNOWN_GITHUB_TOOL_IDS).toHaveLength(10);
    });

    it("all expected read tools are in KNOWN_GITHUB_TOOL_IDS", () => {
      const expected = [
        "get_file_contents", "list_pull_requests", "pull_request_read",
        "list_branches", "list_commits", "search_code",
        "search_issues", "search_pull_requests", "get_commit", "actions_list",
      ];
      for (const t of expected) {
        expect(KNOWN_GITHUB_TOOL_IDS).toContain(t);
      }
    });
  });

  describe("auth awareness", () => {
    it("isGitHubAuthConfigured returns false when no token", () => {
      expect(isGitHubAuthConfigured({})).toBe(false);
    });

    it("isGitHubAuthConfigured returns false for empty token", () => {
      expect(isGitHubAuthConfigured({ GITHUB_TOKEN: "" })).toBe(false);
      expect(isGitHubAuthConfigured({ GITHUB_TOKEN: "  " })).toBe(false);
    });

    it("isGitHubAuthConfigured returns true when token is set", () => {
      expect(isGitHubAuthConfigured({ GITHUB_TOKEN: "ghp_test123" })).toBe(true);
    });

    it("getGitHubAuthStatus returns not-configured message", () => {
      const status = getGitHubAuthStatus({});
      expect(status.configured).toBe(false);
      expect(status.message).toContain("NOT configured");
      expect(status.message).toContain("GITHUB_TOKEN");
    });

    it("getGitHubAuthStatus returns configured message", () => {
      const status = getGitHubAuthStatus({ GITHUB_TOKEN: "ghp_test" });
      expect(status.configured).toBe(true);
      expect(status.message).toContain("configured");
    });
  });

  describe("createGitHubMcpConfig", () => {
    it("creates a valid config with defaults", () => {
      const config = createGitHubMcpConfig();
      expect(config.id).toBe(GITHUB_MCP_SERVER_ID);
      expect(config.name).toBe(GITHUB_MCP_SERVER_NAME);
      expect(config.transport).toBe("stdio");
      expect(config.command).toBe("npx");
    });

    it("includes token in env when provided", () => {
      const config = createGitHubMcpConfig({ token: "ghp_mytoken" });
      expect(config.env).toBeDefined();
      expect(config.env!.GITHUB_TOKEN).toBe("ghp_mytoken");
    });

    it("allows custom server ID", () => {
      const config = createGitHubMcpConfig({ id: "custom-github" });
      expect(config.id).toBe("custom-github");
    });

    it("includes additional env vars", () => {
      const config = createGitHubMcpConfig({
        token: "ghp_test",
        additionalEnv: { EXTRA_VAR: "value" },
      });
      expect(config.env!.GITHUB_TOKEN).toBe("ghp_test");
      expect(config.env!.EXTRA_VAR).toBe("value");
    });
  });

  describe("getKnownGitHubToolDefinitions", () => {
    it("returns 10 tool definitions", () => {
      const defs = getKnownGitHubToolDefinitions();
      expect(defs).toHaveLength(10);
    });

    it("all tools belong to github category", () => {
      const defs = getKnownGitHubToolDefinitions();
      expect(defs.every((d) => d.category === "github")).toBe(true);
    });

    it("all tools are read-only", () => {
      const defs = getKnownGitHubToolDefinitions();
      expect(defs.every((d) => d.readOnly)).toBe(true);
    });

    it("all tools are enabled", () => {
      const defs = getKnownGitHubToolDefinitions();
      expect(defs.every((d) => d.enabled)).toBe(true);
    });

    it("all tools are NOT discovered at runtime (manual)", () => {
      const defs = getKnownGitHubToolDefinitions();
      expect(defs.every((d) => !d.discoveredAtRuntime)).toBe(true);
    });

    it("all tools have input schema with required fields", () => {
      const defs = getKnownGitHubToolDefinitions();
      for (const d of defs) {
        expect(d.inputSchema.required.length).toBeGreaterThan(0);
        expect(d.inputSchema.parameters.length).toBeGreaterThan(0);
      }
    });

    it("uses provided serverId", () => {
      const defs = getKnownGitHubToolDefinitions("my-server");
      expect(defs.every((d) => d.serverId === "my-server")).toBe(true);
    });

    it("get_file_contents has owner and repo required", () => {
      const defs = getKnownGitHubToolDefinitions();
      const gfc = defs.find((d) => d.toolId === "get_file_contents")!;
      expect(gfc.inputSchema.required).toContain("owner");
      expect(gfc.inputSchema.required).toContain("repo");
      expect(gfc.inputSchema.parameters).toContain("path");
      expect(gfc.inputSchema.parameters).toContain("ref");
    });

    it("search_code has query required", () => {
      const defs = getKnownGitHubToolDefinitions();
      const sc = defs.find((d) => d.toolId === "search_code")!;
      expect(sc.inputSchema.required).toContain("query");
    });

    it("pull_request_read has owner, repo, pullNumber required", () => {
      const defs = getKnownGitHubToolDefinitions();
      const pr = defs.find((d) => d.toolId === "pull_request_read")!;
      expect(pr.inputSchema.required).toContain("owner");
      expect(pr.inputSchema.required).toContain("repo");
      expect(pr.inputSchema.required).toContain("pullNumber");
    });
  });

  describe("assessGitHubMcpStatus", () => {
    it("fully ready when all configured", () => {
      const status = assessGitHubMcpStatus({
        serverRegistered: true,
        serverAttached: true,
        authConfigured: true,
        discoveredToolCount: 10,
        registeredToolCount: 10,
      });
      expect(status.ready).toBe(true);
      expect(status.availableToolCount).toBe(10);
      expect(status.unavailableTools).toHaveLength(0);
      expect(status.readinessMessage).toContain("ready");
    });

    it("not ready when auth missing", () => {
      const status = assessGitHubMcpStatus({
        serverRegistered: true,
        serverAttached: true,
        authConfigured: false,
        discoveredToolCount: 0,
        registeredToolCount: 0,
      });
      expect(status.ready).toBe(false);
      expect(status.unavailableTools).toHaveLength(10);
      expect(status.unavailableTools[0].reason).toContain("auth not configured");
      expect(status.readinessMessage).toContain("NOT ready");
    });

    it("not ready when server not registered", () => {
      const status = assessGitHubMcpStatus({
        serverRegistered: false,
        serverAttached: false,
        authConfigured: true,
        discoveredToolCount: 0,
        registeredToolCount: 0,
      });
      expect(status.ready).toBe(false);
      expect(status.unavailableTools).toHaveLength(10);
    });

    it("not ready when server not attached", () => {
      const status = assessGitHubMcpStatus({
        serverRegistered: true,
        serverAttached: false,
        authConfigured: true,
        discoveredToolCount: 0,
        registeredToolCount: 0,
      });
      expect(status.ready).toBe(false);
    });

    it("reports known tool count", () => {
      const status = assessGitHubMcpStatus({
        serverRegistered: true,
        serverAttached: true,
        authConfigured: true,
        discoveredToolCount: 5,
        registeredToolCount: 5,
      });
      expect(status.knownToolCount).toBe(10);
      expect(status.availableToolCount).toBe(5);
    });
  });
});

/* ================================================================== */
/*  TOOL SESSION INTEGRATION                                           */
/* ================================================================== */

describe("Tool session integration (tool-session-integration.ts)", () => {
  describe("event factories", () => {
    it("mcpToolInvocationStarted creates valid event", () => {
      const evt = mcpToolInvocationStarted("server-1", "get_file_contents", "user request");
      expect(evt.kind).toBe("mcp_tool_invocation_started");
      expect(evt.message).toContain("get_file_contents");
      expect(evt.detail?.serverId).toBe("server-1");
      expect(evt.detail?.toolId).toBe("get_file_contents");
      expect(evt.detail?.reason).toBe("user request");
    });

    it("mcpToolInvocationCompleted creates valid event", () => {
      const evt = mcpToolInvocationCompleted("server-1", "list_branches", 250, false);
      expect(evt.kind).toBe("mcp_tool_invocation_completed");
      expect(evt.message).toContain("250ms");
      expect(evt.detail?.durationMs).toBe(250);
      expect(evt.detail?.isPartial).toBe(false);
    });

    it("mcpToolInvocationCompleted marks partial", () => {
      const evt = mcpToolInvocationCompleted("s1", "t1", 100, true);
      expect(evt.message).toContain("[partial]");
      expect(evt.detail?.isPartial).toBe(true);
    });

    it("mcpToolInvocationFailed creates valid event", () => {
      const evt = mcpToolInvocationFailed("s1", "t1", "AUTH_FAIL", "Token expired");
      expect(evt.kind).toBe("mcp_tool_invocation_failed");
      expect(evt.message).toContain("Token expired");
      expect(evt.detail?.errorCode).toBe("AUTH_FAIL");
    });

    it("mcpToolListRefreshed creates valid event", () => {
      const evt = mcpToolListRefreshed("s1", 10);
      expect(evt.kind).toBe("mcp_tool_list_refreshed");
      expect(evt.detail?.toolCount).toBe(10);
    });

    it("mcpGitHubAttached creates valid event with auth status", () => {
      const evt = mcpGitHubAttached("github-mcp-server", true, 10);
      expect(evt.kind).toBe("mcp_github_attached");
      expect(evt.message).toContain("auth configured");
      expect(evt.detail?.authConfigured).toBe(true);
    });

    it("mcpGitHubAttached notes when auth NOT configured", () => {
      const evt = mcpGitHubAttached("github-mcp-server", false, 10);
      expect(evt.message).toContain("NOT configured");
    });

    it("mcpGitHubAuthMissing creates valid event", () => {
      const evt = mcpGitHubAuthMissing("github-mcp-server");
      expect(evt.kind).toBe("mcp_github_auth_missing");
      expect(evt.message).toContain("GITHUB_TOKEN");
    });
  });

  describe("MCP_TOOL_EVENT_KINDS", () => {
    it("has 6 event kinds", () => {
      expect(MCP_TOOL_EVENT_KINDS).toHaveLength(6);
    });

    it("contains all expected kinds", () => {
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_tool_invocation_started");
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_tool_invocation_completed");
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_tool_invocation_failed");
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_tool_list_refreshed");
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_github_attached");
      expect(MCP_TOOL_EVENT_KINDS).toContain("mcp_github_auth_missing");
    });
  });

  describe("isMcpToolEvent", () => {
    it("returns true for tool event kinds", () => {
      expect(isMcpToolEvent("mcp_tool_invocation_started")).toBe(true);
      expect(isMcpToolEvent("mcp_tool_invocation_completed")).toBe(true);
      expect(isMcpToolEvent("mcp_github_attached")).toBe(true);
    });

    it("returns false for non-tool event kinds", () => {
      expect(isMcpToolEvent("mcp_attached")).toBe(false);
      expect(isMcpToolEvent("session_created")).toBe(false);
      expect(isMcpToolEvent("unknown")).toBe(false);
    });
  });

  describe("invocationResultToEvents", () => {
    it("produces completed event for success", () => {
      const result = makeResult({ status: "completed", durationMs: 500, isPartial: false });
      const events = invocationResultToEvents(result);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("mcp_tool_invocation_completed");
    });

    it("produces failed event for failure", () => {
      const result = makeResult({
        status: "failed",
        error: { code: "ERR", message: "oops", recoverable: false },
      });
      const events = invocationResultToEvents(result);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("mcp_tool_invocation_failed");
    });

    it("produces failed event for validation failure", () => {
      const result = makeResult({
        status: "validation_failed",
        error: { code: "VALIDATION_FAILED", message: "missing fields", recoverable: true },
      });
      const events = invocationResultToEvents(result);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("mcp_tool_invocation_failed");
    });

    it("produces no events for pending status", () => {
      const result = makeResult({ status: "pending" });
      const events = invocationResultToEvents(result);
      expect(events).toHaveLength(0);
    });
  });
});

/* ================================================================== */
/*  COMMAND INTEGRATION                                                */
/* ================================================================== */

describe("Command integration (Phase 41 commands)", () => {
  describe("command definitions", () => {
    it("list_mcp_tools is defined", () => {
      const def = getCommandDefinition("list_mcp_tools");
      expect(def).toBeDefined();
      expect(def!.category).toBe("mcp");
      expect(def!.label).toBe("List MCP Tools");
    });

    it("inspect_mcp_tool is defined", () => {
      const def = getCommandDefinition("inspect_mcp_tool");
      expect(def).toBeDefined();
      expect(def!.category).toBe("mcp");
    });

    it("invoke_mcp_tool is defined", () => {
      const def = getCommandDefinition("invoke_mcp_tool");
      expect(def).toBeDefined();
      expect(def!.category).toBe("mcp");
    });

    it("attach_github_mcp is defined", () => {
      const def = getCommandDefinition("attach_github_mcp");
      expect(def).toBeDefined();
      expect(def!.category).toBe("mcp");
    });

    it("ALL_COMMAND_IDS includes new commands", () => {
      expect(ALL_COMMAND_IDS).toContain("list_mcp_tools");
      expect(ALL_COMMAND_IDS).toContain("inspect_mcp_tool");
      expect(ALL_COMMAND_IDS).toContain("invoke_mcp_tool");
      expect(ALL_COMMAND_IDS).toContain("attach_github_mcp");
    });

    it("mcp category now has 7 commands", () => {
      const map = groupByCategory();
      const mcpCmds = map.get("mcp")!;
      expect(mcpCmds).toHaveLength(7);
    });
  });

  describe("command validation", () => {
    it("list_mcp_tools validates with no required fields", () => {
      const result = validateCommand({
        commandId: "list_mcp_tools",
        data: {},
      } as CommandPayload);
      expect(result.valid).toBe(true);
    });

    it("inspect_mcp_tool requires serverId and toolId", () => {
      const result = validateInspectMcpTool({ serverId: "", toolId: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("inspect_mcp_tool passes with valid input", () => {
      const result = validateInspectMcpTool({ serverId: "s1", toolId: "t1" });
      expect(result.valid).toBe(true);
    });

    it("invoke_mcp_tool requires serverId, toolId, input", () => {
      const result = validateInvokeMcpTool({
        serverId: "",
        toolId: "",
        input: undefined as unknown as Record<string, unknown>,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("invoke_mcp_tool passes with valid input", () => {
      const result = validateInvokeMcpTool({
        serverId: "s1",
        toolId: "get_file_contents",
        input: { owner: "octocat", repo: "hello" },
      });
      expect(result.valid).toBe(true);
    });

    it("attach_github_mcp validates with no required fields", () => {
      const result = validateCommand({
        commandId: "attach_github_mcp",
        data: {},
      } as CommandPayload);
      expect(result.valid).toBe(true);
    });
  });

  describe("command execution", () => {
    let sessionManager: SessionManager;
    let sessionId: string;

    beforeEach(() => {
      sessionManager = new SessionManager();
      const session = sessionManager.createSession();
      sessionId = session.id;
    });

    it("list_mcp_tools delegates to deps.listMcpTools", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        listMcpTools: async () => ({
          ok: true,
          detail: { tools: ["t1", "t2"] },
        }),
      };

      const result = await executeCommand(
        sessionId,
        { commandId: "list_mcp_tools", data: {} } as CommandPayload,
        deps,
      );
      expect(result.status).toBe("completed");
      expect(result.detail?.tools).toEqual(["t1", "t2"]);
    });

    it("inspect_mcp_tool delegates to deps.inspectMcpTool", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        inspectMcpTool: async (sid, tid) => ({
          ok: true,
          detail: { serverId: sid, toolId: tid, description: "A tool" },
        }),
      };

      const result = await executeCommand(
        sessionId,
        { commandId: "inspect_mcp_tool", data: { serverId: "s1", toolId: "t1" } },
        deps,
      );
      expect(result.status).toBe("completed");
      expect(result.detail?.toolId).toBe("t1");
    });

    it("invoke_mcp_tool delegates to deps.invokeMcpTool", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        invokeMcpTool: async (_sid, _tid, _input) => ({
          ok: true,
          detail: { content: "file contents here" },
        }),
      };

      const result = await executeCommand(
        sessionId,
        {
          commandId: "invoke_mcp_tool",
          data: { serverId: "s1", toolId: "get_file_contents", input: { owner: "a", repo: "b" } },
        },
        deps,
      );
      expect(result.status).toBe("completed");
    });

    it("invoke_mcp_tool fails with validation error on empty input", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        invokeMcpTool: async () => ({ ok: true }),
      };

      const result = await executeCommand(
        sessionId,
        {
          commandId: "invoke_mcp_tool",
          data: { serverId: "", toolId: "", input: {} },
        },
        deps,
      );
      expect(result.status).toBe("validation_failed");
    });

    it("attach_github_mcp delegates to deps.attachGitHubMcp", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        attachGitHubMcp: async () => ({
          ok: true,
          detail: { toolCount: 10 },
        }),
      };

      const result = await executeCommand(
        sessionId,
        { commandId: "attach_github_mcp", data: {} } as CommandPayload,
        deps,
      );
      expect(result.status).toBe("completed");
      expect(result.detail?.toolCount).toBe(10);
    });

    it("returns failed when dep is not provided", async () => {
      const deps: CommandExecutorDeps = { sessionManager };

      const result = await executeCommand(
        sessionId,
        { commandId: "list_mcp_tools", data: {} } as CommandPayload,
        deps,
      );
      expect(result.status).toBe("failed");
      expect(result.message).toContain("not available");
    });

    it("returns failed when dep returns error", async () => {
      const deps: CommandExecutorDeps = {
        sessionManager,
        invokeMcpTool: async () => ({
          ok: false,
          error: "Auth token expired",
        }),
      };

      const result = await executeCommand(
        sessionId,
        {
          commandId: "invoke_mcp_tool",
          data: { serverId: "s1", toolId: "t1", input: { owner: "a", repo: "b" } },
        },
        deps,
      );
      expect(result.status).toBe("failed");
      expect(result.message).toContain("Auth token expired");
    });
  });
});

/* ================================================================== */
/*  SESSION SUMMARY EXTENSIONS                                         */
/* ================================================================== */

describe("Session summary extensions (Phase 41)", () => {
  let sessionManager: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    sessionManager = new SessionManager();
    const session = sessionManager.createSession();
    sessionId = session.id;
  });

  it("includes default null values for tool invocation fields", () => {
    const summary = sessionManager.getSessionSummary(sessionId);
    expect(summary.toolInvocationCount).toBeNull();
    expect(summary.toolInvocationSuccessCount).toBeNull();
    expect(summary.toolInvocationFailureCount).toBeNull();
    expect(summary.toolsUsed).toBeNull();
    expect(summary.githubMcpAttached).toBe(false);
    expect(summary.githubAuthConfigured).toBe(false);
    expect(summary.githubMcpReadinessMessage).toBeNull();
  });

  it("includes tool invocation data when provided", () => {
    const summary = sessionManager.getSessionSummary(
      sessionId,
      undefined, // agentSummaries
      undefined, // fingerprintSummary
      undefined, // toolchainSummary
      undefined, // languageServiceSummary
      { totalInvocations: 5, successCount: 3, failureCount: 2, toolsUsed: ["t1", "t2"] },
      { attached: true, authConfigured: true, readinessMessage: "Ready" },
    );
    expect(summary.toolInvocationCount).toBe(5);
    expect(summary.toolInvocationSuccessCount).toBe(3);
    expect(summary.toolInvocationFailureCount).toBe(2);
    expect(summary.toolsUsed).toEqual(["t1", "t2"]);
    expect(summary.githubMcpAttached).toBe(true);
    expect(summary.githubAuthConfigured).toBe(true);
    expect(summary.githubMcpReadinessMessage).toBe("Ready");
  });

  it("session event kinds include Phase 41 additions", () => {
    // Verify the event kinds are accepted by the session manager
    const session = sessionManager.getSession(sessionId)!;
    const eventsBefore = session.events.length;

    // All Phase 41 event kinds should be accepted
    const testEvents = [
      mcpToolInvocationStarted("s1", "t1"),
      mcpToolInvocationCompleted("s1", "t1", 100, false),
      mcpToolInvocationFailed("s1", "t1", "ERR", "err"),
      mcpToolListRefreshed("s1", 5),
      mcpGitHubAttached("s1", true, 10),
      mcpGitHubAuthMissing("s1"),
    ];

    for (const evt of testEvents) {
      sessionManager.appendEvent(sessionId, evt);
    }

    expect(session.events.length).toBe(eventsBefore + 6);
  });
});

/* ================================================================== */
/*  HONESTY AND AUTH BOUNDARIES                                        */
/* ================================================================== */

describe("Honesty and auth boundaries", () => {
  it("assessGitHubMcpStatus is honest about missing auth", () => {
    const status = assessGitHubMcpStatus({
      serverRegistered: true,
      serverAttached: true,
      authConfigured: false,
      discoveredToolCount: 0,
      registeredToolCount: 0,
    });
    expect(status.ready).toBe(false);
    expect(status.authConfigured).toBe(false);
    expect(status.unavailableTools.length).toBe(10);
    expect(status.unavailableTools.every((t) => t.reason.includes("auth not configured"))).toBe(true);
  });

  it("assessGitHubMcpStatus is honest about missing server", () => {
    const status = assessGitHubMcpStatus({
      serverRegistered: false,
      serverAttached: false,
      authConfigured: true,
      discoveredToolCount: 0,
      registeredToolCount: 0,
    });
    expect(status.ready).toBe(false);
    expect(status.unavailableTools.every((t) => t.reason.includes("not registered"))).toBe(true);
  });

  it("tool invocation fails with clear error when tool is disabled", async () => {
    const def = makeToolDef({ enabled: false });
    const req = makeRequest();
    const result = await executeToolInvocation(req, def, async () => ({ result: null }));
    expect(result.status).toBe("failed");
    expect(result.error!.code).toBe("TOOL_DISABLED");
    expect(result.error!.message).toContain("disabled");
  });

  it("tool registry reports unavailable state with reason", () => {
    const registry = new McpToolRegistry();
    registry.registerTool(makeToolDef({ toolId: "t1", serverId: "s1" }));
    registry.markUnavailable("s1", "t1", "GITHUB_TOKEN not set");
    const entry = registry.getTool("s1", "t1");
    expect(entry!.state).toBe("unavailable");
    expect(entry!.stateReason).toBe("GITHUB_TOKEN not set");
  });

  it("no false claims: isGitHubAuthConfigured doesn't fake auth", () => {
    // Explicitly verify: without env var, we don't claim auth
    expect(isGitHubAuthConfigured({})).toBe(false);
    expect(isGitHubAuthConfigured({ SOME_OTHER_VAR: "value" })).toBe(false);
  });

  it("GitHub tool definitions are read-only (no write operations)", () => {
    const defs = getKnownGitHubToolDefinitions();
    for (const d of defs) {
      expect(d.readOnly).toBe(true);
    }
  });
});

/* ================================================================== */
/*  GITHUB MCP READ TOOL EXAMPLES                                     */
/* ================================================================== */

describe("GitHub MCP read tool invocation examples", () => {
  it("get_file_contents invocation with mock executor", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const gfcDef = defs.find((d) => d.toolId === "get_file_contents")!;
    const req: McpToolInvocationRequest = {
      toolId: "get_file_contents",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "octocat", repo: "Hello-World", path: "README.md" },
    };

    const executor = async (_toolId: string, _serverId: string, input: Record<string, unknown>) => ({
      result: {
        content: "# Hello World\nThis is a test repo.",
        path: input.path,
        sha: "abc123",
      },
    });

    const result = await executeToolInvocation(req, gfcDef, executor);
    expect(result.status).toBe("completed");
    expect(result.result).toHaveProperty("content");
    expect((result.result as Record<string, unknown>).path).toBe("README.md");
  });

  it("list_pull_requests invocation with mock executor", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const def = defs.find((d) => d.toolId === "list_pull_requests")!;
    const req: McpToolInvocationRequest = {
      toolId: "list_pull_requests",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "octocat", repo: "Hello-World", state: "open" },
    };

    const executor = async () => ({
      result: [
        { number: 1, title: "Fix typo", state: "open" },
        { number: 2, title: "Add feature", state: "open" },
      ],
    });

    const result = await executeToolInvocation(req, def, executor);
    expect(result.status).toBe("completed");
    expect(Array.isArray(result.result)).toBe(true);
    expect((result.result as unknown[]).length).toBe(2);
  });

  it("search_code invocation with mock executor", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const def = defs.find((d) => d.toolId === "search_code")!;
    const req: McpToolInvocationRequest = {
      toolId: "search_code",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { query: "language:typescript McpToolRegistry" },
    };

    const executor = async () => ({
      result: { total_count: 5, items: [] },
      isPartial: true,
    });

    const result = await executeToolInvocation(req, def, executor);
    expect(result.status).toBe("completed");
    expect(result.isPartial).toBe(true);
  });

  it("get_commit invocation requires owner, repo, sha", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const def = defs.find((d) => d.toolId === "get_commit")!;

    // Missing 'sha' — should fail validation
    const req: McpToolInvocationRequest = {
      toolId: "get_commit",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "octocat", repo: "Hello-World" }, // missing sha
    };

    const result = await executeToolInvocation(req, def, async () => ({ result: null }));
    expect(result.status).toBe("validation_failed");
    expect(result.error!.message).toContain("sha");
  });

  it("list_branches invocation with mock executor", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const def = defs.find((d) => d.toolId === "list_branches")!;
    const req: McpToolInvocationRequest = {
      toolId: "list_branches",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "octocat", repo: "Hello-World" },
    };

    const executor = async () => ({
      result: [{ name: "main" }, { name: "develop" }],
    });

    const result = await executeToolInvocation(req, def, executor);
    expect(result.status).toBe("completed");
    expect(Array.isArray(result.result)).toBe(true);
  });

  it("actions_list invocation with method required", async () => {
    const defs = getKnownGitHubToolDefinitions();
    const def = defs.find((d) => d.toolId === "actions_list")!;

    // Missing 'method' — should fail
    const req: McpToolInvocationRequest = {
      toolId: "actions_list",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "octocat", repo: "Hello-World" }, // missing method
    };

    const result = await executeToolInvocation(req, def, async () => ({ result: null }));
    expect(result.status).toBe("validation_failed");
    expect(result.error!.message).toContain("method");
  });
});

/* ================================================================== */
/*  END-TO-END: TOOL REGISTRY + GITHUB MCP + INVOCATION               */
/* ================================================================== */

describe("End-to-end: Registry + GitHub MCP + Invocation", () => {
  it("registers known GitHub tools in registry and invokes one", async () => {
    const registry = new McpToolRegistry();
    const githubDefs = getKnownGitHubToolDefinitions();

    // Register all known tools
    for (const def of githubDefs) {
      registry.registerTool(def);
    }

    expect(registry.countServerTools(GITHUB_MCP_SERVER_ID)).toBe(10);
    expect(registry.listAvailableTools(GITHUB_MCP_SERVER_ID)).toHaveLength(10);

    // Get a specific tool
    const gfcDef = registry.getToolDefinition(GITHUB_MCP_SERVER_ID, "get_file_contents")!;
    expect(gfcDef.readOnly).toBe(true);

    // Invoke it
    const req: McpToolInvocationRequest = {
      toolId: "get_file_contents",
      serverId: GITHUB_MCP_SERVER_ID,
      sessionId: "session-1",
      input: { owner: "test", repo: "example" },
    };

    const result = await executeToolInvocation(req, gfcDef, async () => ({
      result: { content: "file content", encoding: "utf-8" },
    }));

    expect(result.status).toBe("completed");
    expect(result.error).toBeNull();

    // Build summary
    const summary = buildSessionToolActionSummary([result]);
    expect(summary.totalInvocations).toBe(1);
    expect(summary.successCount).toBe(1);
    expect(summary.toolsUsed).toContain("get_file_contents");
  });

  it("marks tools unavailable when auth is missing", () => {
    const registry = new McpToolRegistry();
    const githubDefs = getKnownGitHubToolDefinitions();

    for (const def of githubDefs) {
      registry.registerTool(def);
    }

    // Simulate missing auth — mark all tools unavailable
    const authConfigured = isGitHubAuthConfigured({});
    if (!authConfigured) {
      for (const def of githubDefs) {
        registry.markUnavailable(GITHUB_MCP_SERVER_ID, def.toolId, "GITHUB_TOKEN not set");
      }
    }

    const available = registry.listAvailableTools(GITHUB_MCP_SERVER_ID);
    expect(available).toHaveLength(0);
  });

  it("event lifecycle: start → complete → summary", () => {
    const sessionManager = new SessionManager();
    const session = sessionManager.createSession();

    // Emit tool events
    sessionManager.appendEvent(
      session.id,
      mcpToolInvocationStarted(GITHUB_MCP_SERVER_ID, "get_file_contents", "user clicked"),
    );
    sessionManager.appendEvent(
      session.id,
      mcpToolInvocationCompleted(GITHUB_MCP_SERVER_ID, "get_file_contents", 120, false),
    );

    const updatedSession = sessionManager.getSession(session.id)!;
    const toolEvents = updatedSession.events.filter((e) => isMcpToolEvent(e.kind));
    expect(toolEvents).toHaveLength(2);
    expect(toolEvents[0].kind).toBe("mcp_tool_invocation_started");
    expect(toolEvents[1].kind).toBe("mcp_tool_invocation_completed");
  });

  it("event lifecycle: start → fail → summary", () => {
    const sessionManager = new SessionManager();
    const session = sessionManager.createSession();

    sessionManager.appendEvent(
      session.id,
      mcpToolInvocationStarted(GITHUB_MCP_SERVER_ID, "search_code"),
    );
    sessionManager.appendEvent(
      session.id,
      mcpToolInvocationFailed(GITHUB_MCP_SERVER_ID, "search_code", "AUTH_ERROR", "Token expired"),
    );

    const updatedSession = sessionManager.getSession(session.id)!;
    const toolEvents = updatedSession.events.filter((e) => isMcpToolEvent(e.kind));
    expect(toolEvents).toHaveLength(2);
    expect(toolEvents[1].kind).toBe("mcp_tool_invocation_failed");
  });
});
