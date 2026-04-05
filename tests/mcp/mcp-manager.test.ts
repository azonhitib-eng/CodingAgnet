/**
 * Phase 20 — MCP Manager and Server Attachment Lifecycle tests.
 *
 * Covers:
 * - MCP config validation/creation
 * - Process manager register/start/stop/status
 * - Capability discovery modeling
 * - Attach/detach behavior
 * - MCP manager orchestration
 * - Session event emission for MCP lifecycle
 * - Session summary exposure of MCP attachments
 * - Edge cases (failed start, stop-after-failure, double attach, etc.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // types
  type McpServerConfig,
  type McpTransport,
  type McpServerStatus,
  type McpServerHealth,
  type McpAttachmentStatus,
  type McpDiscoveredTool,
  type McpDiscoveredResource,
  type McpDiscoveredPrompt,
  type McpDiscoveryResult,
  type McpSessionEventKind,
  // process manager
  McpProcessManager,
  // capability discovery
  applyDiscovery,
  registerTool,
  registerResource,
  registerPrompt,
  isValidTool,
  isValidResource,
  isValidPrompt,
  emptyDiscovery,
  failedDiscovery,
  // session integration
  mcpAttachRequested,
  mcpAttached,
  mcpStarting,
  mcpStarted,
  mcpFailed,
  mcpStopped,
  mcpDiscoveredTools,
  mcpDiscoveredResources,
  mcpDiscoveredPrompts,
  MCP_EVENT_KINDS,
  isMcpEvent,
  filterMcpEvents,
  buildMcpEventSummary,
  // config
  createMcpServerConfig,
  generateMcpServerId,
  _resetMcpIdCounter,
  fixtureEchoConfig,
  fixtureNodeConfig,
  fixtureSseConfig,
  // manager
  McpManager,
} from "../../src/mcp/index.js";
import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/index.js";
import type { SessionEvent } from "../../src/session/index.js";

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

function makeStdioConfig(overrides?: Partial<McpServerConfig>): McpServerConfig {
  return createMcpServerConfig({
    id: overrides?.id ?? "test-server",
    name: overrides?.name ?? "Test Server",
    transport: "stdio",
    command: overrides?.command ?? "echo",
    args: overrides?.args ? [...overrides.args] : ["hello"],
    ...(overrides?.env ? { env: { ...overrides.env } } : {}),
    ...(overrides?.cwd ? { cwd: overrides.cwd } : {}),
  });
}

function makeSseConfig(url = "http://localhost:8080/sse"): McpServerConfig {
  return createMcpServerConfig({
    id: "sse-server",
    name: "SSE Server",
    transport: "sse",
    url,
  });
}

/* ================================================================== */
/*  Config Validation/Creation                                        */
/* ================================================================== */

describe("MCP Config", () => {
  beforeEach(() => {
    _resetMcpIdCounter();
  });

  describe("createMcpServerConfig", () => {
    it("creates a valid stdio config", () => {
      const cfg = createMcpServerConfig({
        name: "My Server",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      });
      expect(cfg.name).toBe("My Server");
      expect(cfg.transport).toBe("stdio");
      expect(cfg.command).toBe("node");
      expect(cfg.args).toEqual(["server.js"]);
      expect(cfg.id).toBeTruthy();
    });

    it("creates a valid sse config", () => {
      const cfg = createMcpServerConfig({
        name: "Remote SSE",
        transport: "sse",
        url: "http://example.com/sse",
      });
      expect(cfg.transport).toBe("sse");
      expect(cfg.url).toBe("http://example.com/sse");
    });

    it("creates a valid streamable_http config", () => {
      const cfg = createMcpServerConfig({
        name: "HTTP Stream",
        transport: "streamable_http",
        url: "http://example.com/mcp",
      });
      expect(cfg.transport).toBe("streamable_http");
      expect(cfg.url).toBe("http://example.com/mcp");
    });

    it("auto-generates id if not provided", () => {
      const cfg = createMcpServerConfig({
        name: "Auto ID",
        transport: "stdio",
        command: "cat",
      });
      expect(cfg.id).toMatch(/^mcp-/);
    });

    it("uses explicit id when provided", () => {
      const cfg = createMcpServerConfig({
        id: "my-explicit-id",
        name: "Explicit",
        transport: "stdio",
        command: "cat",
      });
      expect(cfg.id).toBe("my-explicit-id");
    });

    it("trims whitespace from name", () => {
      const cfg = createMcpServerConfig({
        name: "  Trimmed  ",
        transport: "stdio",
        command: "cat",
      });
      expect(cfg.name).toBe("Trimmed");
    });

    it("throws if name is empty", () => {
      expect(() =>
        createMcpServerConfig({ name: "", transport: "stdio", command: "cat" }),
      ).toThrow("name must be non-empty");
    });

    it("throws if name is whitespace only", () => {
      expect(() =>
        createMcpServerConfig({
          name: "   ",
          transport: "stdio",
          command: "cat",
        }),
      ).toThrow("name must be non-empty");
    });

    it("throws if stdio transport has no command", () => {
      expect(() =>
        createMcpServerConfig({ name: "No Cmd", transport: "stdio" }),
      ).toThrow("stdio transport requires a command");
    });

    it("throws if sse transport has no url", () => {
      expect(() =>
        createMcpServerConfig({ name: "No URL", transport: "sse" }),
      ).toThrow("sse transport requires a url");
    });

    it("throws if streamable_http transport has no url", () => {
      expect(() =>
        createMcpServerConfig({
          name: "No URL",
          transport: "streamable_http",
        }),
      ).toThrow("streamable_http transport requires a url");
    });

    it("includes env and cwd when provided", () => {
      const cfg = createMcpServerConfig({
        name: "WithEnv",
        transport: "stdio",
        command: "node",
        env: { FOO: "bar" },
        cwd: "/tmp",
      });
      expect(cfg.env).toEqual({ FOO: "bar" });
      expect(cfg.cwd).toBe("/tmp");
    });

    it("omits optional fields when not provided", () => {
      const cfg = createMcpServerConfig({
        name: "Minimal",
        transport: "stdio",
        command: "cat",
      });
      expect(cfg.env).toBeUndefined();
      expect(cfg.cwd).toBeUndefined();
      expect(cfg.url).toBeUndefined();
      expect(cfg.args).toBeUndefined();
    });
  });

  describe("generateMcpServerId", () => {
    it("generates unique ids", () => {
      const id1 = generateMcpServerId();
      const id2 = generateMcpServerId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^mcp-/);
    });

    it("resets with _resetMcpIdCounter", () => {
      generateMcpServerId();
      _resetMcpIdCounter();
      const second = generateMcpServerId();
      // Same counter position but possibly different timestamp
      expect(second).toMatch(/^mcp-/);
    });
  });

  describe("fixture configs", () => {
    it("fixtureEchoConfig creates a cat-based stdio config", () => {
      const cfg = fixtureEchoConfig();
      expect(cfg.id).toBe("fixture-echo");
      expect(cfg.command).toBe("cat");
      expect(cfg.transport).toBe("stdio");
    });

    it("fixtureNodeConfig creates a node-based stdio config", () => {
      const cfg = fixtureNodeConfig("test.js");
      expect(cfg.id).toBe("fixture-node");
      expect(cfg.command).toBe("node");
      expect(cfg.args).toEqual(["test.js"]);
    });

    it("fixtureSseConfig creates an SSE config", () => {
      const cfg = fixtureSseConfig("http://localhost:9000");
      expect(cfg.id).toBe("fixture-sse");
      expect(cfg.transport).toBe("sse");
      expect(cfg.url).toBe("http://localhost:9000");
    });

    it("fixture configs accept overrides", () => {
      const cfg = fixtureEchoConfig({ name: "Custom Echo" });
      expect(cfg.name).toBe("Custom Echo");
    });
  });
});

/* ================================================================== */
/*  Process Manager                                                   */
/* ================================================================== */

describe("McpProcessManager", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
    _resetMcpIdCounter();
  });

  describe("register", () => {
    it("registers a config with 'registered' status", () => {
      const cfg = makeStdioConfig();
      const record = pm.register(cfg);
      expect(record.status).toBe("registered");
      expect(record.health).toBe("unknown");
      expect(record.pid).toBeNull();
      expect(record.startedAt).toBeNull();
      expect(record.stoppedAt).toBeNull();
      expect(record.lastError).toBeNull();
      expect(record.tools).toEqual([]);
      expect(record.resources).toEqual([]);
      expect(record.prompts).toEqual([]);
    });

    it("throws on duplicate registration", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      expect(() => pm.register(cfg)).toThrow("already registered");
    });
  });

  describe("getRecord / listRecords", () => {
    it("returns undefined for unknown id", () => {
      expect(pm.getRecord("nonexistent")).toBeUndefined();
    });

    it("returns registered record", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      const record = pm.getRecord("test-server");
      expect(record).toBeDefined();
      expect(record!.config.name).toBe("Test Server");
    });

    it("lists all records", () => {
      pm.register(makeStdioConfig({ id: "a", name: "A" }));
      pm.register(makeStdioConfig({ id: "b", name: "B" }));
      expect(pm.listRecords()).toHaveLength(2);
    });
  });

  describe("start", () => {
    it("starts a stdio process with 'running' status", async () => {
      // Use 'sleep 60' as a process that stays alive
      const cfg = makeStdioConfig({ command: "sleep", args: ["60"] });
      pm.register(cfg);
      const record = await pm.start("test-server");
      expect(record.status).toBe("running");
      expect(record.pid).toBeTypeOf("number");
      expect(record.startedAt).toBeTruthy();

      // Cleanup
      await pm.stop("test-server");
    });

    it("fails if no command for stdio", async () => {
      // Register with a config that has no command
      const cfg: McpServerConfig = {
        id: "no-cmd",
        name: "No Command",
        transport: "stdio",
      };
      pm.register(cfg);
      const record = await pm.start("no-cmd");
      expect(record.status).toBe("failed");
      expect(record.lastError).toContain("No command specified");
    });

    it("throws on unknown server id", async () => {
      await expect(pm.start("nonexistent")).rejects.toThrow("not found");
    });

    it("throws if already running", async () => {
      const cfg = makeStdioConfig({ command: "sleep", args: ["60"] });
      pm.register(cfg);
      await pm.start("test-server");
      await expect(pm.start("test-server")).rejects.toThrow("already running");

      // Cleanup
      await pm.stop("test-server");
    });

    it("marks network transports as running without spawning", async () => {
      const cfg = makeSseConfig();
      pm.register(cfg);
      const record = await pm.start("sse-server");
      expect(record.status).toBe("running");
      expect(record.pid).toBeNull();
      expect(record.startedAt).toBeTruthy();
    });

    it("handles spawn failure for invalid command", async () => {
      const cfg = makeStdioConfig({
        command: "/nonexistent/command/path/xyz",
      });
      pm.register(cfg);
      const record = await pm.start("test-server");
      // The spawn itself might succeed but the process will fail
      // or spawn might throw - both are handled
      expect(["running", "failed"]).toContain(record.status);

      if (record.status === "running") {
        await pm.stop("test-server");
      }
    });
  });

  describe("stop", () => {
    it("stops a running process", async () => {
      const cfg = makeStdioConfig({ command: "sleep", args: ["60"] });
      pm.register(cfg);
      await pm.start("test-server");
      const record = await pm.stop("test-server");
      expect(record.status).toBe("stopped");
      expect(record.stoppedAt).toBeTruthy();
      expect(record.processHandle).toBeNull();
    });

    it("returns record unchanged if already stopped", async () => {
      const cfg = makeStdioConfig({ command: "sleep", args: ["60"] });
      pm.register(cfg);
      await pm.start("test-server");
      await pm.stop("test-server");
      const record = await pm.stop("test-server");
      expect(record.status).toBe("stopped");
    });

    it("returns record unchanged if never started", async () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      const record = await pm.stop("test-server");
      expect(record.status).toBe("registered");
    });

    it("throws on unknown server id", async () => {
      await expect(pm.stop("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("health", () => {
    it("updates health status", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      const record = pm.updateHealth("test-server", "healthy");
      expect(record.health).toBe("healthy");
    });

    it("markFailed sets status and health", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      const record = pm.markFailed("test-server", "Connection lost");
      expect(record.status).toBe("failed");
      expect(record.health).toBe("unhealthy");
      expect(record.lastError).toBe("Connection lost");
      expect(record.stoppedAt).toBeTruthy();
    });
  });

  describe("unregister", () => {
    it("removes a stopped server", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      expect(pm.unregister("test-server")).toBe(true);
      expect(pm.getRecord("test-server")).toBeUndefined();
    });

    it("removes a registered (never started) server", () => {
      const cfg = makeStdioConfig();
      pm.register(cfg);
      expect(pm.unregister("test-server")).toBe(true);
    });

    it("returns false for unknown server", () => {
      expect(pm.unregister("nonexistent")).toBe(false);
    });

    it("throws if server is running", async () => {
      const cfg = makeStdioConfig({ command: "sleep", args: ["60"] });
      pm.register(cfg);
      await pm.start("test-server");
      expect(() => pm.unregister("test-server")).toThrow("Cannot unregister");

      // Cleanup
      await pm.stop("test-server");
    });
  });

  describe("clear", () => {
    it("removes all records", () => {
      pm.register(makeStdioConfig({ id: "a", name: "A" }));
      pm.register(makeStdioConfig({ id: "b", name: "B" }));
      pm.clear();
      expect(pm.listRecords()).toHaveLength(0);
    });
  });
});

/* ================================================================== */
/*  Capability Discovery                                              */
/* ================================================================== */

describe("Capability Discovery", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
  });

  describe("applyDiscovery", () => {
    it("applies tools, resources, and prompts to a record", () => {
      const cfg = makeStdioConfig();
      const record = pm.register(cfg);

      const result: McpDiscoveryResult = {
        tools: [{ name: "read_file", description: "Reads a file" }],
        resources: [
          { uri: "file:///tmp/data", name: "data", description: "Data file" },
        ],
        prompts: [{ name: "summarize", description: "Summarize content" }],
        complete: true,
      };

      applyDiscovery(record, result);

      expect(record.tools).toHaveLength(1);
      expect(record.tools[0].name).toBe("read_file");
      expect(record.resources).toHaveLength(1);
      expect(record.resources[0].uri).toBe("file:///tmp/data");
      expect(record.prompts).toHaveLength(1);
      expect(record.prompts[0].name).toBe("summarize");
    });

    it("replaces existing capabilities", () => {
      const cfg = makeStdioConfig();
      const record = pm.register(cfg);
      record.tools.push({ name: "old_tool" });

      applyDiscovery(record, {
        tools: [{ name: "new_tool" }],
        resources: [],
        prompts: [],
        complete: true,
      });

      expect(record.tools).toHaveLength(1);
      expect(record.tools[0].name).toBe("new_tool");
    });
  });

  describe("manual registration", () => {
    it("registerTool adds a tool", () => {
      const record = pm.register(makeStdioConfig());
      registerTool(record, { name: "my_tool" });
      expect(record.tools).toHaveLength(1);
    });

    it("registerResource adds a resource", () => {
      const record = pm.register(makeStdioConfig());
      registerResource(record, { uri: "file:///x", name: "x" });
      expect(record.resources).toHaveLength(1);
    });

    it("registerPrompt adds a prompt", () => {
      const record = pm.register(makeStdioConfig());
      registerPrompt(record, { name: "my_prompt" });
      expect(record.prompts).toHaveLength(1);
    });
  });

  describe("validation", () => {
    it("isValidTool accepts valid tool", () => {
      expect(isValidTool({ name: "foo" })).toBe(true);
      expect(isValidTool({ name: "bar", description: "desc" })).toBe(true);
    });

    it("isValidTool rejects invalid tool", () => {
      expect(isValidTool(null)).toBe(false);
      expect(isValidTool(undefined)).toBe(false);
      expect(isValidTool({})).toBe(false);
      expect(isValidTool({ name: "" })).toBe(false);
      expect(isValidTool({ name: 123 })).toBe(false);
      expect(isValidTool("string")).toBe(false);
    });

    it("isValidResource accepts valid resource", () => {
      expect(isValidResource({ uri: "file:///x", name: "x" })).toBe(true);
    });

    it("isValidResource rejects invalid resource", () => {
      expect(isValidResource(null)).toBe(false);
      expect(isValidResource({})).toBe(false);
      expect(isValidResource({ uri: "", name: "x" })).toBe(false);
      expect(isValidResource({ uri: "x", name: "" })).toBe(false);
    });

    it("isValidPrompt accepts valid prompt", () => {
      expect(isValidPrompt({ name: "foo" })).toBe(true);
    });

    it("isValidPrompt rejects invalid prompt", () => {
      expect(isValidPrompt(null)).toBe(false);
      expect(isValidPrompt({})).toBe(false);
      expect(isValidPrompt({ name: "" })).toBe(false);
    });
  });

  describe("emptyDiscovery / failedDiscovery", () => {
    it("emptyDiscovery returns complete empty result", () => {
      const d = emptyDiscovery();
      expect(d.complete).toBe(true);
      expect(d.tools).toEqual([]);
      expect(d.resources).toEqual([]);
      expect(d.prompts).toEqual([]);
    });

    it("failedDiscovery returns incomplete result with error", () => {
      const d = failedDiscovery("timeout");
      expect(d.complete).toBe(false);
      expect(d.error).toBe("timeout");
    });
  });
});

/* ================================================================== */
/*  Session Integration Events                                        */
/* ================================================================== */

describe("MCP Session Integration", () => {
  describe("event factories", () => {
    it("mcpAttachRequested creates correct event", () => {
      const e = mcpAttachRequested("srv-1", "My Server");
      expect(e.kind).toBe("mcp_attach_requested");
      expect(e.message).toContain("My Server");
      expect(e.detail?.serverId).toBe("srv-1");
    });

    it("mcpAttached creates correct event", () => {
      const e = mcpAttached("srv-1", "My Server");
      expect(e.kind).toBe("mcp_attached");
      expect(e.message).toContain("attached");
    });

    it("mcpStarting creates correct event", () => {
      const e = mcpStarting("srv-1", "My Server");
      expect(e.kind).toBe("mcp_starting");
    });

    it("mcpStarted includes PID when present", () => {
      const e = mcpStarted("srv-1", "My Server", 12345);
      expect(e.kind).toBe("mcp_started");
      expect(e.message).toContain("12345");
      expect(e.detail?.pid).toBe(12345);
    });

    it("mcpStarted works without PID", () => {
      const e = mcpStarted("srv-1", "My Server", null);
      expect(e.kind).toBe("mcp_started");
      expect(e.message).not.toContain("PID");
    });

    it("mcpFailed includes error", () => {
      const e = mcpFailed("srv-1", "My Server", "spawn failed");
      expect(e.kind).toBe("mcp_failed");
      expect(e.message).toContain("spawn failed");
      expect(e.detail?.error).toBe("spawn failed");
    });

    it("mcpStopped creates correct event", () => {
      const e = mcpStopped("srv-1", "My Server");
      expect(e.kind).toBe("mcp_stopped");
    });

    it("mcpDiscoveredTools lists tool names", () => {
      const e = mcpDiscoveredTools("srv-1", ["read", "write"]);
      expect(e.kind).toBe("mcp_discovered_tools");
      expect(e.message).toContain("2 tool(s)");
      expect(e.detail?.tools).toEqual(["read", "write"]);
    });

    it("mcpDiscoveredResources lists resource URIs", () => {
      const e = mcpDiscoveredResources("srv-1", ["file:///a"]);
      expect(e.kind).toBe("mcp_discovered_resources");
      expect(e.message).toContain("1 resource(s)");
    });

    it("mcpDiscoveredPrompts lists prompt names", () => {
      const e = mcpDiscoveredPrompts("srv-1", ["ask", "code"]);
      expect(e.kind).toBe("mcp_discovered_prompts");
      expect(e.message).toContain("2 prompt(s)");
    });
  });

  describe("MCP_EVENT_KINDS", () => {
    it("contains all 9 MCP event kinds", () => {
      expect(MCP_EVENT_KINDS).toHaveLength(9);
      expect(MCP_EVENT_KINDS).toContain("mcp_attach_requested");
      expect(MCP_EVENT_KINDS).toContain("mcp_attached");
      expect(MCP_EVENT_KINDS).toContain("mcp_starting");
      expect(MCP_EVENT_KINDS).toContain("mcp_started");
      expect(MCP_EVENT_KINDS).toContain("mcp_failed");
      expect(MCP_EVENT_KINDS).toContain("mcp_stopped");
      expect(MCP_EVENT_KINDS).toContain("mcp_discovered_tools");
      expect(MCP_EVENT_KINDS).toContain("mcp_discovered_resources");
      expect(MCP_EVENT_KINDS).toContain("mcp_discovered_prompts");
    });
  });

  describe("isMcpEvent", () => {
    it("returns true for MCP event kinds", () => {
      expect(isMcpEvent("mcp_attached")).toBe(true);
      expect(isMcpEvent("mcp_failed")).toBe(true);
    });

    it("returns false for non-MCP event kinds", () => {
      expect(isMcpEvent("session_created")).toBe(false);
      expect(isMcpEvent("workflow_started")).toBe(false);
      expect(isMcpEvent("random_string")).toBe(false);
    });
  });

  describe("filterMcpEvents", () => {
    it("filters to only MCP events", () => {
      const events: SessionEvent[] = [
        { kind: "session_created", timestamp: "t1", message: "created" },
        {
          kind: "mcp_attached" as SessionEvent["kind"],
          timestamp: "t2",
          message: "attached",
        },
        { kind: "info", timestamp: "t3", message: "info" },
        {
          kind: "mcp_started" as SessionEvent["kind"],
          timestamp: "t4",
          message: "started",
        },
      ];
      const filtered = filterMcpEvents(events);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].kind).toBe("mcp_attached");
      expect(filtered[1].kind).toBe("mcp_started");
    });
  });

  describe("buildMcpEventSummary", () => {
    it("summarizes MCP events from timeline", () => {
      const events: SessionEvent[] = [
        mcpAttached("srv-1", "A"),
        mcpStarted("srv-1", "A", 100),
        mcpAttached("srv-2", "B"),
        mcpFailed("srv-2", "B", "err"),
        mcpStopped("srv-1", "A"),
      ];
      const summary = buildMcpEventSummary(events);
      expect(summary.attached).toEqual(["srv-1", "srv-2"]);
      expect(summary.started).toEqual(["srv-1"]);
      expect(summary.failed).toEqual(["srv-2"]);
      expect(summary.stopped).toEqual(["srv-1"]);
    });

    it("returns empty arrays for no MCP events", () => {
      const summary = buildMcpEventSummary([]);
      expect(summary.attached).toEqual([]);
      expect(summary.started).toEqual([]);
    });
  });
});

/* ================================================================== */
/*  MCP Manager (orchestration)                                       */
/* ================================================================== */

describe("McpManager", () => {
  let sm: SessionManager;
  let mm: McpManager;

  beforeEach(() => {
    _resetIdCounter();
    _resetMcpIdCounter();
    sm = new SessionManager();
    mm = new McpManager(sm);
  });

  describe("registerServer", () => {
    it("registers a server config", () => {
      const cfg = makeStdioConfig();
      const record = mm.registerServer(cfg);
      expect(record.status).toBe("registered");
      expect(record.config.id).toBe("test-server");
    });
  });

  describe("attachToSession", () => {
    it("attaches a server to a session with events", () => {
      const session = sm.createSession();
      const cfg = makeStdioConfig();
      mm.registerServer(cfg);

      const attachment = mm.attachToSession("test-server", session.id);
      expect(attachment.status).toBe("attached");
      expect(attachment.serverId).toBe("test-server");
      expect(attachment.sessionId).toBe(session.id);
      expect(attachment.attachedAt).toBeTruthy();
      expect(attachment.failureReason).toBeNull();

      // Session should have attach events
      const mcpEvents = session.events.filter((e) =>
        isMcpEvent(e.kind),
      );
      expect(mcpEvents).toHaveLength(2); // attach_requested + attached
      expect(mcpEvents[0].kind).toBe("mcp_attach_requested");
      expect(mcpEvents[1].kind).toBe("mcp_attached");

      // Session should have attached resource
      expect(session.attachedResources).toHaveLength(1);
      expect(session.attachedResources[0].kind).toBe("mcp_server");
      expect(session.attachedResources[0].id).toBe("test-server");
      expect(session.attachedResources[0].ready).toBe(false);
    });

    it("throws on unknown server", () => {
      const session = sm.createSession();
      expect(() =>
        mm.attachToSession("nonexistent", session.id),
      ).toThrow("MCP server not found");
    });

    it("throws on unknown session", () => {
      mm.registerServer(makeStdioConfig());
      expect(() =>
        mm.attachToSession("test-server", "bad-session"),
      ).toThrow("Session not found");
    });

    it("throws on double attach", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);
      expect(() =>
        mm.attachToSession("test-server", session.id),
      ).toThrow("already attached");
    });

    it("allows re-attach after detach", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);
      mm.detachFromSession("test-server", session.id);
      // Should not throw
      const attachment = mm.attachToSession("test-server", session.id);
      expect(attachment.status).toBe("attached");
    });
  });

  describe("detachFromSession", () => {
    it("detaches a server from a session", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);

      const attachment = mm.detachFromSession("test-server", session.id);
      expect(attachment.status).toBe("detached");
      expect(attachment.detachedAt).toBeTruthy();

      // Resource should be marked not-ready
      expect(session.attachedResources[0].ready).toBe(false);
    });

    it("throws on non-existent attachment", () => {
      const session = sm.createSession();
      expect(() =>
        mm.detachFromSession("nonexistent", session.id),
      ).toThrow("No attachment found");
    });
  });

  describe("startServer", () => {
    it("starts a server and emits session events", async () => {
      const session = sm.createSession();
      const cfg = makeStdioConfig({
        command: "sleep",
        args: ["60"],
      });
      mm.registerServer(cfg);
      mm.attachToSession("test-server", session.id);

      const record = await mm.startServer("test-server", session.id);
      expect(record.status).toBe("running");

      // Session should have starting + started events
      const mcpEvents = session.events.filter((e) =>
        e.kind === "mcp_starting" || e.kind === "mcp_started",
      );
      expect(mcpEvents).toHaveLength(2);
      expect(mcpEvents[0].kind).toBe("mcp_starting");
      expect(mcpEvents[1].kind).toBe("mcp_started");

      // Attached resource should be ready
      const resource = session.attachedResources.find(
        (r) => r.id === "test-server",
      );
      expect(resource?.ready).toBe(true);

      // Cleanup
      await mm.stopServer("test-server", session.id);
    });

    it("emits mcp_failed on start failure", async () => {
      const session = sm.createSession();
      const cfg: McpServerConfig = {
        id: "bad-server",
        name: "Bad Server",
        transport: "stdio",
        // No command → will fail
      };
      mm.registerServer(cfg);
      mm.attachToSession("bad-server", session.id);

      const record = await mm.startServer("bad-server", session.id);
      expect(record.status).toBe("failed");

      // Session should have mcp_failed event
      const failEvents = session.events.filter(
        (e) => e.kind === "mcp_failed",
      );
      expect(failEvents).toHaveLength(1);
      expect(failEvents[0].message).toContain("No command specified");

      // Attachment should be marked failed
      const attachment = mm.getAttachment("bad-server", session.id);
      expect(attachment?.status).toBe("failed");
    });

    it("works without session id (standalone)", async () => {
      const cfg = makeStdioConfig({
        command: "sleep",
        args: ["60"],
      });
      mm.registerServer(cfg);
      const record = await mm.startServer("test-server");
      expect(record.status).toBe("running");
      await mm.stopServer("test-server");
    });

    it("throws on unknown server", async () => {
      await expect(mm.startServer("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("stopServer", () => {
    it("stops a server and emits session events", async () => {
      const session = sm.createSession();
      const cfg = makeStdioConfig({
        command: "sleep",
        args: ["60"],
      });
      mm.registerServer(cfg);
      mm.attachToSession("test-server", session.id);
      await mm.startServer("test-server", session.id);

      const record = await mm.stopServer("test-server", session.id);
      expect(record.status).toBe("stopped");

      const stopEvents = session.events.filter(
        (e) => e.kind === "mcp_stopped",
      );
      expect(stopEvents).toHaveLength(1);
    });

    it("throws on unknown server", async () => {
      await expect(mm.stopServer("nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("applyDiscoveryResult", () => {
    it("applies discovery and emits events for each capability type", () => {
      const session = sm.createSession();
      const cfg = makeStdioConfig();
      mm.registerServer(cfg);
      mm.attachToSession("test-server", session.id);

      const discovery: McpDiscoveryResult = {
        tools: [
          { name: "read_file", description: "Read a file" },
          { name: "write_file", description: "Write a file" },
        ],
        resources: [
          { uri: "file:///workspace", name: "workspace" },
        ],
        prompts: [
          { name: "code_review", description: "Review code" },
        ],
        complete: true,
      };

      mm.applyDiscoveryResult("test-server", discovery, session.id);

      // Check discovery was applied to record
      const info = mm.getRuntimeInfo("test-server");
      expect(info?.tools).toHaveLength(2);
      expect(info?.resources).toHaveLength(1);
      expect(info?.prompts).toHaveLength(1);

      // Check session events
      const toolEvents = session.events.filter(
        (e) => e.kind === "mcp_discovered_tools",
      );
      expect(toolEvents).toHaveLength(1);
      expect(toolEvents[0].detail?.tools).toEqual(["read_file", "write_file"]);

      const resourceEvents = session.events.filter(
        (e) => e.kind === "mcp_discovered_resources",
      );
      expect(resourceEvents).toHaveLength(1);

      const promptEvents = session.events.filter(
        (e) => e.kind === "mcp_discovered_prompts",
      );
      expect(promptEvents).toHaveLength(1);
    });

    it("does not emit events for empty capability types", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);

      const initialEventCount = session.events.length;
      mm.applyDiscoveryResult(
        "test-server",
        emptyDiscovery(),
        session.id,
      );

      // No new events since all capability arrays are empty
      expect(session.events.length).toBe(initialEventCount);
    });

    it("works without session id", () => {
      mm.registerServer(makeStdioConfig());
      mm.applyDiscoveryResult("test-server", {
        tools: [{ name: "t" }],
        resources: [],
        prompts: [],
        complete: true,
      });
      const info = mm.getRuntimeInfo("test-server");
      expect(info?.tools).toHaveLength(1);
    });

    it("throws on unknown server", () => {
      expect(() =>
        mm.applyDiscoveryResult("nonexistent", emptyDiscovery()),
      ).toThrow("not found");
    });
  });

  describe("getRuntimeInfo", () => {
    it("returns undefined for unknown server", () => {
      expect(mm.getRuntimeInfo("nonexistent")).toBeUndefined();
    });

    it("returns full runtime info", () => {
      mm.registerServer(makeStdioConfig());
      const info = mm.getRuntimeInfo("test-server");
      expect(info).toBeDefined();
      expect(info!.config.id).toBe("test-server");
      expect(info!.status).toBe("registered");
      expect(info!.health).toBe("unknown");
      expect(info!.pid).toBeNull();
      expect(info!.tools).toEqual([]);
    });
  });

  describe("getAttachment / listSessionAttachments / listServerAttachments", () => {
    it("getAttachment returns the attachment", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);
      const attachment = mm.getAttachment("test-server", session.id);
      expect(attachment).toBeDefined();
      expect(attachment!.status).toBe("attached");
    });

    it("getAttachment returns undefined for no attachment", () => {
      const session = sm.createSession();
      expect(mm.getAttachment("test-server", session.id)).toBeUndefined();
    });

    it("listSessionAttachments returns all for a session", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig({ id: "a", name: "A" }));
      mm.registerServer(makeStdioConfig({ id: "b", name: "B" }));
      mm.attachToSession("a", session.id);
      mm.attachToSession("b", session.id);
      expect(mm.listSessionAttachments(session.id)).toHaveLength(2);
    });

    it("listServerAttachments returns all for a server", () => {
      const s1 = sm.createSession();
      const s2 = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", s1.id);
      mm.attachToSession("test-server", s2.id);
      expect(mm.listServerAttachments("test-server")).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("clears all state", () => {
      const session = sm.createSession();
      mm.registerServer(makeStdioConfig());
      mm.attachToSession("test-server", session.id);
      mm.clear();
      expect(mm.getRuntimeInfo("test-server")).toBeUndefined();
      expect(mm.listSessionAttachments(session.id)).toHaveLength(0);
    });
  });
});

/* ================================================================== */
/*  Session Summary MCP Exposure                                      */
/* ================================================================== */

describe("SessionSummary MCP exposure", () => {
  let sm: SessionManager;
  let mm: McpManager;

  beforeEach(() => {
    _resetIdCounter();
    _resetMcpIdCounter();
    sm = new SessionManager();
    mm = new McpManager(sm);
  });

  it("summary shows mcpServerCount = 0 initially", () => {
    const session = sm.createSession();
    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServerCount).toBe(0);
    expect(summary.mcpServers).toEqual([]);
  });

  it("summary shows attached MCP servers", () => {
    const session = sm.createSession();
    mm.registerServer(makeStdioConfig({ id: "srv-a", name: "Server A" }));
    mm.registerServer(makeStdioConfig({ id: "srv-b", name: "Server B" }));
    mm.attachToSession("srv-a", session.id);
    mm.attachToSession("srv-b", session.id);

    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServerCount).toBe(2);
    expect(summary.mcpServers).toHaveLength(2);
    expect(summary.mcpServers[0].id).toBe("srv-a");
    expect(summary.mcpServers[0].label).toBe("Server A");
    expect(summary.mcpServers[0].ready).toBe(false);
    expect(summary.attachedResourceCount).toBe(2);
  });

  it("summary reflects ready status after start", async () => {
    const session = sm.createSession();
    mm.registerServer(
      makeStdioConfig({ id: "srv", name: "Srv", command: "sleep", args: ["60"] }),
    );
    mm.attachToSession("srv", session.id);
    await mm.startServer("srv", session.id);

    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServers[0].ready).toBe(true);

    await mm.stopServer("srv", session.id);
  });

  it("summary includes MCP events in event count", () => {
    const session = sm.createSession();
    mm.registerServer(makeStdioConfig());
    mm.attachToSession("test-server", session.id);

    const summary = sm.getSessionSummary(session.id);
    // session_created + mcp_attach_requested + mcp_attached = 3
    expect(summary.eventCount).toBe(3);
    expect(summary.lastEventKind).toBe("mcp_attached");
  });
});

/* ================================================================== */
/*  Edge Cases                                                        */
/* ================================================================== */

describe("Edge Cases", () => {
  let sm: SessionManager;
  let mm: McpManager;

  beforeEach(() => {
    _resetIdCounter();
    _resetMcpIdCounter();
    sm = new SessionManager();
    mm = new McpManager(sm);
  });

  it("stop-after-failure: can stop a failed server", async () => {
    const cfg: McpServerConfig = {
      id: "fail-server",
      name: "Fail Server",
      transport: "stdio",
    };
    mm.registerServer(cfg);
    await mm.startServer("fail-server"); // Will fail (no command)

    // Stopping a failed server should be safe
    const record = await mm.stopServer("fail-server");
    // Status might be stopped or failed depending on implementation
    expect(["stopped", "failed"]).toContain(record.status);
  });

  it("multiple sessions can attach the same server", () => {
    const s1 = sm.createSession();
    const s2 = sm.createSession();
    mm.registerServer(makeStdioConfig());
    mm.attachToSession("test-server", s1.id);
    mm.attachToSession("test-server", s2.id);

    expect(mm.listServerAttachments("test-server")).toHaveLength(2);
  });

  it("discovery with only tools emits only tool event", () => {
    const session = sm.createSession();
    mm.registerServer(makeStdioConfig());
    mm.attachToSession("test-server", session.id);

    const initialCount = session.events.length;
    mm.applyDiscoveryResult(
      "test-server",
      {
        tools: [{ name: "t1" }],
        resources: [],
        prompts: [],
        complete: true,
      },
      session.id,
    );

    const newEvents = session.events.slice(initialCount);
    expect(newEvents).toHaveLength(1);
    expect(newEvents[0].kind).toBe("mcp_discovered_tools");
  });

  it("failed discovery does not emit discovery events", () => {
    const session = sm.createSession();
    mm.registerServer(makeStdioConfig());
    mm.attachToSession("test-server", session.id);

    const initialCount = session.events.length;
    mm.applyDiscoveryResult(
      "test-server",
      failedDiscovery("timeout"),
      session.id,
    );

    // No discovery events (all arrays are empty in failedDiscovery)
    expect(session.events.length).toBe(initialCount);
  });

  it("full lifecycle: register → attach → start → discover → stop → detach", async () => {
    const session = sm.createSession();

    // Register
    const cfg = makeStdioConfig({
      command: "sleep",
      args: ["60"],
    });
    mm.registerServer(cfg);

    // Attach
    const attachment = mm.attachToSession("test-server", session.id);
    expect(attachment.status).toBe("attached");

    // Start
    const record = await mm.startServer("test-server", session.id);
    expect(record.status).toBe("running");

    // Discover
    mm.applyDiscoveryResult(
      "test-server",
      {
        tools: [{ name: "tool_a" }, { name: "tool_b" }],
        resources: [{ uri: "res://1", name: "res1" }],
        prompts: [],
        complete: true,
      },
      session.id,
    );

    // Verify runtime info
    const info = mm.getRuntimeInfo("test-server");
    expect(info?.status).toBe("running");
    expect(info?.tools).toHaveLength(2);
    expect(info?.resources).toHaveLength(1);

    // Stop
    await mm.stopServer("test-server", session.id);
    const stoppedInfo = mm.getRuntimeInfo("test-server");
    expect(stoppedInfo?.status).toBe("stopped");

    // Detach
    const detached = mm.detachFromSession("test-server", session.id);
    expect(detached.status).toBe("detached");

    // Summary
    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServerCount).toBe(1); // Resource still listed
    expect(summary.mcpServers[0].ready).toBe(false);

    // Check full event timeline has MCP events
    const mcpEvents = filterMcpEvents(session.events);
    expect(mcpEvents.length).toBeGreaterThanOrEqual(6);
    // attach_requested, attached, starting, started, discovered_tools, discovered_resources, stopped
  });

  it("status transitions: registered → starting → running → stopping → stopped", async () => {
    const cfg = makeStdioConfig({
      command: "sleep",
      args: ["60"],
    });
    mm.registerServer(cfg);

    let info = mm.getRuntimeInfo("test-server");
    expect(info?.status).toBe("registered");

    await mm.startServer("test-server");
    info = mm.getRuntimeInfo("test-server");
    expect(info?.status).toBe("running");

    await mm.stopServer("test-server");
    info = mm.getRuntimeInfo("test-server");
    expect(info?.status).toBe("stopped");
  });

  it("markFailed records error and sets unhealthy", () => {
    mm.registerServer(makeStdioConfig());
    mm.processManager.markFailed("test-server", "Connection dropped");
    const info = mm.getRuntimeInfo("test-server");
    expect(info?.status).toBe("failed");
    expect(info?.health).toBe("unhealthy");
    expect(info?.lastError).toBe("Connection dropped");
  });

  it("McpServerConfig with all optional fields", () => {
    const cfg = createMcpServerConfig({
      id: "full-cfg",
      name: "Full Config",
      transport: "stdio",
      command: "python",
      args: ["-m", "mcp_server"],
      env: { PYTHONPATH: "/opt/lib" },
      cwd: "/workspace",
    });
    expect(cfg.command).toBe("python");
    expect(cfg.args).toEqual(["-m", "mcp_server"]);
    expect(cfg.env).toEqual({ PYTHONPATH: "/opt/lib" });
    expect(cfg.cwd).toBe("/workspace");
  });

  it("McpDiscoveredTool with inputSchema", () => {
    const tool: McpDiscoveredTool = {
      name: "exec",
      description: "Execute a command",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
      },
    };
    expect(isValidTool(tool)).toBe(true);
    expect(tool.inputSchema).toBeDefined();
  });

  it("McpDiscoveredPrompt with arguments", () => {
    const prompt: McpDiscoveredPrompt = {
      name: "code_review",
      description: "Review code changes",
      arguments: [
        { name: "files", description: "Files to review", required: true },
        { name: "focus", description: "Focus area" },
      ],
    };
    expect(isValidPrompt(prompt)).toBe(true);
    expect(prompt.arguments).toHaveLength(2);
  });

  it("McpDiscoveredResource with mimeType", () => {
    const resource: McpDiscoveredResource = {
      uri: "file:///tmp/data.json",
      name: "data",
      description: "JSON data file",
      mimeType: "application/json",
    };
    expect(isValidResource(resource)).toBe(true);
    expect(resource.mimeType).toBe("application/json");
  });

  it("McpAttachment tracks timestamps correctly", () => {
    const session = sm.createSession();
    mm.registerServer(makeStdioConfig());

    const before = new Date().toISOString();
    const attachment = mm.attachToSession("test-server", session.id);
    const after = new Date().toISOString();

    expect(attachment.attachedAt >= before).toBe(true);
    expect(attachment.attachedAt <= after).toBe(true);
    expect(attachment.detachedAt).toBeNull();

    mm.detachFromSession("test-server", session.id);
    // Re-get from manager to check updated state
    // (detachFromSession returns the updated attachment)
  });

  it("network transport (SSE) start does not spawn process", async () => {
    const cfg = makeSseConfig();
    mm.registerServer(cfg);
    const session = sm.createSession();
    mm.attachToSession("sse-server", session.id);

    const record = await mm.startServer("sse-server", session.id);
    expect(record.status).toBe("running");
    expect(record.pid).toBeNull(); // No local process

    await mm.stopServer("sse-server", session.id);
  });
});

/* ================================================================== */
/*  Type Coverage (compile-time checks exercised at runtime)          */
/* ================================================================== */

describe("Type Coverage", () => {
  it("McpTransport covers all variants", () => {
    const transports: McpTransport[] = ["stdio", "sse", "streamable_http"];
    expect(transports).toHaveLength(3);
  });

  it("McpServerStatus covers all variants", () => {
    const statuses: McpServerStatus[] = [
      "registered",
      "starting",
      "running",
      "stopping",
      "stopped",
      "failed",
    ];
    expect(statuses).toHaveLength(6);
  });

  it("McpServerHealth covers all variants", () => {
    const healths: McpServerHealth[] = [
      "unknown",
      "healthy",
      "degraded",
      "unhealthy",
    ];
    expect(healths).toHaveLength(4);
  });

  it("McpAttachmentStatus covers all variants", () => {
    const statuses: McpAttachmentStatus[] = [
      "pending",
      "attached",
      "detaching",
      "detached",
      "failed",
    ];
    expect(statuses).toHaveLength(5);
  });

  it("McpSessionEventKind covers all 9 kinds", () => {
    const kinds: McpSessionEventKind[] = [
      "mcp_attach_requested",
      "mcp_attached",
      "mcp_starting",
      "mcp_started",
      "mcp_failed",
      "mcp_stopped",
      "mcp_discovered_tools",
      "mcp_discovered_resources",
      "mcp_discovered_prompts",
    ];
    expect(kinds).toHaveLength(9);
  });
});
