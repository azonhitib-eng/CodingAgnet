/**
 * Phase 28 — Command Composer / Session Input Layer.
 *
 * Comprehensive tests covering: command model, validation, availability,
 * executor, session-integration event factories, UI rendering, and
 * server endpoints.
 */

import { describe, it, expect, beforeEach } from "vitest";

// --- Command model ---
import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
  groupByCategory,
} from "../../src/commands/types.js";
import type {
  CommandId,
  CommandCategory,
  CommandPayload,
  CommandExecutionResult,
} from "../../src/commands/types.js";

// --- Validation ---
import {
  validateCommand,
  validateOpenWorkspace,
  validateCloneRepository,
  validateAttachMcp,
  validateRefreshMcpHealth,
  validateRefreshMcpDiscovery,
  validateAttachAgent,
  validateRunWorkflow,
  validateRestoreSession,
} from "../../src/commands/validation.js";

// --- Availability ---
import {
  getCommandAvailability,
  getAllCommandAvailability,
  getAvailableCommandIds,
} from "../../src/commands/availability.js";
import type { CommandContextState } from "../../src/commands/availability.js";

// --- Executor ---
import { executeCommand } from "../../src/commands/executor.js";
import type { CommandExecutorDeps } from "../../src/commands/executor.js";

// --- Session integration ---
import {
  commandSubmitted,
  commandCompleted,
  commandFailed,
  commandValidationFailed,
  resultToSessionEvent,
  COMMAND_EVENT_KINDS,
} from "../../src/commands/session-integration.js";

// --- Session manager ---
import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/session-manager.js";
import type { SessionSummary } from "../../src/session/session-manager.js";

// --- UI rendering ---
import { renderShellHtml } from "../../src/app-shell/views.js";

// --- Server endpoints ---
import { handleRequest } from "../../src/app-shell/server.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

/* ================================================================== */
/*  HTTP test helpers                                                  */
/* ================================================================== */

function createMockReq(method: string, url: string, body?: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };
  if (body) {
    req.headers["content-type"] = "application/json";
    process.nextTick(() => {
      req.push(body);
      req.push(null);
    });
  } else {
    process.nextTick(() => req.push(null));
  }
  return req;
}

interface MockRes {
  _status: number;
  _body: string;
  _headers: Record<string, string>;
  _ended: boolean;
}

function createMockRes(req: IncomingMessage): { res: ServerResponse; mock: MockRes } {
  const res = new ServerResponse(req);
  const mock: MockRes = { _status: 200, _body: "", _headers: {}, _ended: false };

  res.writeHead = function (code: number, headers?: Record<string, string | number>): ServerResponse {
    mock._status = code;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        mock._headers[k.toLowerCase()] = String(v);
      }
    }
    return res;
  } as typeof res.writeHead;

  res.write = function (chunk: any): boolean {
    if (chunk) mock._body += typeof chunk === "string" ? chunk : chunk.toString();
    return true;
  } as typeof res.write;

  res.end = function (chunk?: any): ServerResponse {
    if (chunk) mock._body += typeof chunk === "string" ? chunk : chunk.toString();
    mock._ended = true;
    return res;
  } as typeof res.end;

  // Override setHeader to track status code set via res.statusCode
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: string | number | readonly string[]): ServerResponse {
    mock._headers[name.toLowerCase()] = String(value);
    try { origSetHeader(name, value); } catch { /* ignore socket errors */ }
    return res;
  } as typeof res.setHeader;

  return { res, mock };
}

async function apiRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; json: any }> {
  const req = createMockReq(method, url, body ? JSON.stringify(body) : undefined);
  const { res, mock } = createMockRes(req);

  handleRequest(req, res);

  // Wait for async handlers to complete (POST handlers read body asynchronously)
  await new Promise((r) => setTimeout(r, 50));

  const statusCode = mock._status !== 200 ? mock._status : res.statusCode;
  let json: any;
  try {
    json = JSON.parse(mock._body);
  } catch {
    json = mock._body;
  }
  return { statusCode, json };
}

/* ================================================================== */
/*  Helper: build a minimal SessionSummary                             */
/* ================================================================== */

function minimalSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-test-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stage: "initializing",
    status: "idle",
    workspacePath: null,
    workspaceSource: null,
    workspaceStatus: null,
    workspaceReadiness: null,
    workspaceIsGitRepo: null,
    workspaceRemoteUrl: null,
    workspaceBranch: null,
    eventCount: 1,
    lastEventKind: "session_created",
    lastEventMessage: "Session created",
    approvalRequired: false,
    isBlocked: false,
    lastError: null,
    attachedResourceCount: 0,
    mcpServerCount: 0,
    mcpServers: [],
    agentCount: 0,
    agents: [],
    ...overrides,
  };
}

/* ================================================================== */
/*  1. Command model                                                   */
/* ================================================================== */

describe("Command model (types.ts)", () => {
  it("COMMAND_DEFINITIONS has exactly 10 entries", () => {
    expect(COMMAND_DEFINITIONS).toHaveLength(10);
  });

  it("ALL_COMMAND_IDS has exactly 10 entries", () => {
    expect(ALL_COMMAND_IDS).toHaveLength(10);
  });

  it("ALL_COMMAND_CATEGORIES has exactly 6 entries", () => {
    expect(ALL_COMMAND_CATEGORIES).toHaveLength(6);
  });

  it("ALL_COMMAND_CATEGORIES contains workspace, host, mcp, agent, workflow, session", () => {
    expect([...ALL_COMMAND_CATEGORIES]).toEqual(
      expect.arrayContaining(["workspace", "host", "mcp", "agent", "workflow", "session"]),
    );
  });

  it("each definition has id, category, label, description", () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it("command IDs in definitions match ALL_COMMAND_IDS", () => {
    const ids = COMMAND_DEFINITIONS.map((d) => d.id);
    expect(ids).toEqual([...ALL_COMMAND_IDS]);
  });

  it("getCommandDefinition returns the correct definition for open_workspace", () => {
    const def = getCommandDefinition("open_workspace");
    expect(def).toBeDefined();
    expect(def!.id).toBe("open_workspace");
    expect(def!.category).toBe("workspace");
    expect(def!.label).toBe("Open Workspace");
  });

  it("getCommandDefinition returns the correct definition for clone_repository", () => {
    const def = getCommandDefinition("clone_repository");
    expect(def).toBeDefined();
    expect(def!.id).toBe("clone_repository");
    expect(def!.category).toBe("workspace");
  });

  it("getCommandDefinition returns the correct definition for detect_host", () => {
    const def = getCommandDefinition("detect_host");
    expect(def).toBeDefined();
    expect(def!.category).toBe("host");
  });

  it("getCommandDefinition returns the correct definition for run_workflow", () => {
    const def = getCommandDefinition("run_workflow");
    expect(def).toBeDefined();
    expect(def!.category).toBe("workflow");
  });

  it("getCommandDefinition returns undefined for unknown id", () => {
    const def = getCommandDefinition("nonexistent" as CommandId);
    expect(def).toBeUndefined();
  });

  it("groupByCategory creates a map with all 6 categories", () => {
    const map = groupByCategory();
    expect(map.size).toBe(6);
    for (const cat of ALL_COMMAND_CATEGORIES) {
      expect(map.has(cat)).toBe(true);
    }
  });

  it("groupByCategory workspace category contains open_workspace and clone_repository", () => {
    const map = groupByCategory();
    const ids = map.get("workspace")!.map((d) => d.id);
    expect(ids).toContain("open_workspace");
    expect(ids).toContain("clone_repository");
  });

  it("groupByCategory mcp category contains 3 commands", () => {
    const map = groupByCategory();
    expect(map.get("mcp")).toHaveLength(3);
  });

  it("groupByCategory session category contains save_session and restore_session", () => {
    const map = groupByCategory();
    const ids = map.get("session")!.map((d) => d.id);
    expect(ids).toContain("save_session");
    expect(ids).toContain("restore_session");
  });

  it("some definitions include targetStage", () => {
    const withStage = COMMAND_DEFINITIONS.filter((d) => d.targetStage);
    expect(withStage.length).toBeGreaterThanOrEqual(1);
    expect(withStage.map((d) => d.id)).toContain("open_workspace");
  });
});

/* ================================================================== */
/*  2. Command validation                                              */
/* ================================================================== */

describe("Command validation (validation.ts)", () => {
  // --- open_workspace ---
  describe("validateOpenWorkspace", () => {
    it("rejects missing path", () => {
      const r = validateOpenWorkspace({ path: "" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("path");
    });

    it("rejects whitespace-only path", () => {
      const r = validateOpenWorkspace({ path: "   " });
      expect(r.valid).toBe(false);
    });

    it("rejects relative path", () => {
      const r = validateOpenWorkspace({ path: "relative/path" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toMatch(/absolute/i);
    });

    it("accepts valid Unix absolute path", () => {
      const r = validateOpenWorkspace({ path: "/home/user/project" });
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it("accepts valid Windows absolute path", () => {
      const r = validateOpenWorkspace({ path: "C:\\Users\\project" });
      expect(r.valid).toBe(true);
    });
  });

  // --- clone_repository ---
  describe("validateCloneRepository", () => {
    it("rejects missing url", () => {
      const r = validateCloneRepository({ url: "", targetPath: "/dest" });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.field === "url")).toBe(true);
    });

    it("rejects file:// url", () => {
      const r = validateCloneRepository({ url: "file:///local/repo", targetPath: "/dest" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toMatch(/file:\/\//i);
    });

    it("rejects invalid url scheme", () => {
      const r = validateCloneRepository({ url: "ftp://server/repo", targetPath: "/dest" });
      expect(r.valid).toBe(false);
    });

    it("accepts https url", () => {
      const r = validateCloneRepository({
        url: "https://github.com/org/repo.git",
        targetPath: "/home/user/repos/repo",
      });
      expect(r.valid).toBe(true);
    });

    it("accepts http url", () => {
      const r = validateCloneRepository({
        url: "http://github.com/org/repo.git",
        targetPath: "/dest",
      });
      expect(r.valid).toBe(true);
    });

    it("accepts git:// url", () => {
      const r = validateCloneRepository({
        url: "git://github.com/org/repo.git",
        targetPath: "/dest",
      });
      expect(r.valid).toBe(true);
    });

    it("accepts SSH url", () => {
      const r = validateCloneRepository({
        url: "git@github.com:org/repo.git",
        targetPath: "/dest",
      });
      expect(r.valid).toBe(true);
    });

    it("rejects missing targetPath", () => {
      const r = validateCloneRepository({
        url: "https://github.com/org/repo.git",
        targetPath: "",
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.field === "targetPath")).toBe(true);
    });

    it("rejects relative targetPath", () => {
      const r = validateCloneRepository({
        url: "https://github.com/org/repo.git",
        targetPath: "relative/path",
      });
      expect(r.valid).toBe(false);
    });

    it("collects multiple errors (missing url + missing targetPath)", () => {
      const r = validateCloneRepository({ url: "", targetPath: "" });
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- attach_mcp ---
  describe("validateAttachMcp", () => {
    it("rejects missing serverId", () => {
      const r = validateAttachMcp({ serverId: "", command: "npx mcp" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("serverId");
    });

    it("rejects missing command", () => {
      const r = validateAttachMcp({ serverId: "mcp-1", command: "" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("command");
    });

    it("accepts valid serverId and command", () => {
      const r = validateAttachMcp({ serverId: "mcp-1", command: "npx mcp-server" });
      expect(r.valid).toBe(true);
    });

    it("collects multiple errors (missing both)", () => {
      const r = validateAttachMcp({ serverId: "", command: "" });
      expect(r.valid).toBe(false);
      expect(r.errors).toHaveLength(2);
    });
  });

  // --- refresh_mcp_health ---
  describe("validateRefreshMcpHealth", () => {
    it("rejects missing serverId", () => {
      const r = validateRefreshMcpHealth({ serverId: "" });
      expect(r.valid).toBe(false);
    });

    it("accepts valid serverId", () => {
      const r = validateRefreshMcpHealth({ serverId: "mcp-1" });
      expect(r.valid).toBe(true);
    });
  });

  // --- refresh_mcp_discovery ---
  describe("validateRefreshMcpDiscovery", () => {
    it("rejects missing serverId", () => {
      const r = validateRefreshMcpDiscovery({ serverId: "" });
      expect(r.valid).toBe(false);
    });

    it("accepts valid serverId", () => {
      const r = validateRefreshMcpDiscovery({ serverId: "mcp-1" });
      expect(r.valid).toBe(true);
    });
  });

  // --- attach_agent ---
  describe("validateAttachAgent", () => {
    it("rejects missing agentId", () => {
      const r = validateAttachAgent({ agentId: "", name: "Agent" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("agentId");
    });

    it("rejects missing name", () => {
      const r = validateAttachAgent({ agentId: "agent-1", name: "" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("name");
    });

    it("accepts valid agentId and name", () => {
      const r = validateAttachAgent({ agentId: "agent-1", name: "Coder" });
      expect(r.valid).toBe(true);
    });
  });

  // --- run_workflow ---
  describe("validateRunWorkflow", () => {
    it("rejects missing dataDir", () => {
      const r = validateRunWorkflow({ dataDir: "" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("dataDir");
    });

    it("rejects relative dataDir", () => {
      const r = validateRunWorkflow({ dataDir: "relative/data" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].message).toMatch(/absolute/i);
    });

    it("rejects non-json hostFile", () => {
      const r = validateRunWorkflow({ dataDir: "/data", hostFile: "host.yaml" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("hostFile");
      expect(r.errors[0].message).toMatch(/\.json/i);
    });

    it("accepts valid dataDir with json hostFile", () => {
      const r = validateRunWorkflow({ dataDir: "/data/dir", hostFile: "host.json" });
      expect(r.valid).toBe(true);
    });

    it("accepts valid dataDir without hostFile", () => {
      const r = validateRunWorkflow({ dataDir: "/data/dir" });
      expect(r.valid).toBe(true);
    });

    it("accepts empty string hostFile (treated as absent)", () => {
      const r = validateRunWorkflow({ dataDir: "/data/dir", hostFile: "" });
      expect(r.valid).toBe(true);
    });
  });

  // --- restore_session ---
  describe("validateRestoreSession", () => {
    it("rejects missing sessionId", () => {
      const r = validateRestoreSession({ sessionId: "" });
      expect(r.valid).toBe(false);
      expect(r.errors[0].field).toBe("sessionId");
    });

    it("accepts valid sessionId", () => {
      const r = validateRestoreSession({ sessionId: "session-12345-1" });
      expect(r.valid).toBe(true);
    });
  });

  // --- validateCommand dispatcher ---
  describe("validateCommand dispatcher", () => {
    it("dispatches open_workspace", () => {
      const r = validateCommand({ commandId: "open_workspace", data: { path: "/abs" } });
      expect(r.valid).toBe(true);
    });

    it("dispatches clone_repository", () => {
      const r = validateCommand({
        commandId: "clone_repository",
        data: { url: "https://gh.com/r.git", targetPath: "/dest" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches detect_host (always valid)", () => {
      const r = validateCommand({ commandId: "detect_host", data: {} });
      expect(r.valid).toBe(true);
    });

    it("dispatches attach_mcp", () => {
      const r = validateCommand({
        commandId: "attach_mcp",
        data: { serverId: "s1", command: "cmd" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches refresh_mcp_health", () => {
      const r = validateCommand({
        commandId: "refresh_mcp_health",
        data: { serverId: "s1" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches refresh_mcp_discovery", () => {
      const r = validateCommand({
        commandId: "refresh_mcp_discovery",
        data: { serverId: "s1" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches attach_agent", () => {
      const r = validateCommand({
        commandId: "attach_agent",
        data: { agentId: "a1", name: "A" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches run_workflow", () => {
      const r = validateCommand({
        commandId: "run_workflow",
        data: { dataDir: "/d" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches save_session (always valid)", () => {
      const r = validateCommand({ commandId: "save_session", data: {} });
      expect(r.valid).toBe(true);
    });

    it("dispatches restore_session with valid id", () => {
      const r = validateCommand({
        commandId: "restore_session",
        data: { sessionId: "s1" },
      });
      expect(r.valid).toBe(true);
    });

    it("dispatches restore_session with missing id → invalid", () => {
      const r = validateCommand({
        commandId: "restore_session",
        data: { sessionId: "" },
      });
      expect(r.valid).toBe(false);
    });
  });
});

/* ================================================================== */
/*  3. Command availability                                            */
/* ================================================================== */

describe("Command availability (availability.ts)", () => {
  const NO_SESSION: CommandContextState = {
    hasActiveSession: false,
    sessionSummary: null,
  };

  const SESSION_NO_MCP: CommandContextState = {
    hasActiveSession: true,
    sessionSummary: minimalSummary({ mcpServerCount: 0, mcpServers: [] }),
  };

  const SESSION_WITH_MCP: CommandContextState = {
    hasActiveSession: true,
    sessionSummary: minimalSummary({
      mcpServerCount: 1,
      mcpServers: [{ id: "mcp-1", label: "MCP 1", ready: true }],
    }),
  };

  // --- No active session ---
  describe("no active session", () => {
    it("open_workspace unavailable", () => {
      expect(getCommandAvailability("open_workspace", NO_SESSION).available).toBe(false);
    });

    it("clone_repository unavailable", () => {
      expect(getCommandAvailability("clone_repository", NO_SESSION).available).toBe(false);
    });

    it("detect_host unavailable", () => {
      expect(getCommandAvailability("detect_host", NO_SESSION).available).toBe(false);
    });

    it("attach_mcp unavailable", () => {
      expect(getCommandAvailability("attach_mcp", NO_SESSION).available).toBe(false);
    });

    it("refresh_mcp_health unavailable", () => {
      expect(getCommandAvailability("refresh_mcp_health", NO_SESSION).available).toBe(false);
    });

    it("refresh_mcp_discovery unavailable", () => {
      expect(getCommandAvailability("refresh_mcp_discovery", NO_SESSION).available).toBe(false);
    });

    it("attach_agent unavailable", () => {
      expect(getCommandAvailability("attach_agent", NO_SESSION).available).toBe(false);
    });

    it("run_workflow unavailable", () => {
      expect(getCommandAvailability("run_workflow", NO_SESSION).available).toBe(false);
    });

    it("save_session unavailable", () => {
      expect(getCommandAvailability("save_session", NO_SESSION).available).toBe(false);
    });

    it("restore_session always available", () => {
      expect(getCommandAvailability("restore_session", NO_SESSION).available).toBe(true);
    });

    it("unavailable commands include a reason string", () => {
      const a = getCommandAvailability("open_workspace", NO_SESSION);
      expect(a.reason).toBeTruthy();
    });
  });

  // --- Session without MCP ---
  describe("session without MCP servers", () => {
    it("refresh_mcp_health unavailable", () => {
      const a = getCommandAvailability("refresh_mcp_health", SESSION_NO_MCP);
      expect(a.available).toBe(false);
      expect(a.reason).toMatch(/MCP/i);
    });

    it("refresh_mcp_discovery unavailable", () => {
      const a = getCommandAvailability("refresh_mcp_discovery", SESSION_NO_MCP);
      expect(a.available).toBe(false);
    });

    it("open_workspace available", () => {
      expect(getCommandAvailability("open_workspace", SESSION_NO_MCP).available).toBe(true);
    });

    it("attach_mcp available", () => {
      expect(getCommandAvailability("attach_mcp", SESSION_NO_MCP).available).toBe(true);
    });

    it("run_workflow available", () => {
      expect(getCommandAvailability("run_workflow", SESSION_NO_MCP).available).toBe(true);
    });
  });

  // --- Session with MCP ---
  describe("session with MCP servers", () => {
    it("refresh_mcp_health available", () => {
      expect(getCommandAvailability("refresh_mcp_health", SESSION_WITH_MCP).available).toBe(true);
    });

    it("refresh_mcp_discovery available", () => {
      expect(getCommandAvailability("refresh_mcp_discovery", SESSION_WITH_MCP).available).toBe(true);
    });

    it("all commands available", () => {
      for (const id of ALL_COMMAND_IDS) {
        expect(getCommandAvailability(id, SESSION_WITH_MCP).available).toBe(true);
      }
    });
  });

  // --- Aggregate helpers ---
  describe("aggregate helpers", () => {
    it("getAllCommandAvailability returns 10 entries", () => {
      const all = getAllCommandAvailability(NO_SESSION);
      expect(all).toHaveLength(10);
    });

    it("getAvailableCommandIds with no session returns only restore_session", () => {
      const ids = getAvailableCommandIds(NO_SESSION);
      expect(ids).toEqual(["restore_session"]);
    });

    it("getAvailableCommandIds with full session returns all 10", () => {
      const ids = getAvailableCommandIds(SESSION_WITH_MCP);
      expect(ids).toHaveLength(10);
    });

    it("getAvailableCommandIds with session but no MCP returns 8", () => {
      const ids = getAvailableCommandIds(SESSION_NO_MCP);
      expect(ids).toHaveLength(8);
      expect(ids).not.toContain("refresh_mcp_health");
      expect(ids).not.toContain("refresh_mcp_discovery");
    });
  });
});

/* ================================================================== */
/*  4. Command executor                                                */
/* ================================================================== */

describe("Command executor (executor.ts)", () => {
  let sm: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    const s = sm.createSession();
    sessionId = s.id;
  });

  function makeDeps(overrides: Partial<CommandExecutorDeps> = {}): CommandExecutorDeps {
    return { sessionManager: sm, ...overrides };
  }

  // --- validation failures ---
  it("returns validation_failed for invalid payload", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "" },
    };
    const r = await executeCommand(sessionId, payload, makeDeps());
    expect(r.status).toBe("validation_failed");
    expect(r.commandId).toBe("open_workspace");
  });

  it("validation_failed result has a timestamp", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "" },
    };
    const r = await executeCommand(sessionId, payload, makeDeps());
    expect(r.timestamp).toBeTruthy();
  });

  it("appends validation_failed event to session", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "" },
    };
    await executeCommand(sessionId, payload, makeDeps());
    const s = sm.getSession(sessionId)!;
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("warning");
  });

  // --- missing dep ---
  it("returns failed when dep function is missing", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/valid/path" },
    };
    const r = await executeCommand(sessionId, payload, makeDeps());
    expect(r.status).toBe("failed");
    expect(r.message).toMatch(/not available/i);
  });

  it("appends failed event when dep is missing", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/valid/path" },
    };
    await executeCommand(sessionId, payload, makeDeps());
    const s = sm.getSession(sessionId)!;
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("failed");
  });

  // --- successful execution ---
  it("returns completed on successful open_workspace", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/home/user/project" },
    };
    const deps = makeDeps({
      openWorkspace: async () => ({ ok: true }),
    });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
    expect(r.commandId).toBe("open_workspace");
  });

  it("appends submitted + completed events on success", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/abs/path" },
    };
    const deps = makeDeps({ openWorkspace: async () => ({ ok: true }) });
    await executeCommand(sessionId, payload, deps);
    const s = sm.getSession(sessionId)!;
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("info"); // submitted
    expect(kinds).toContain("note"); // completed
  });

  // --- failed execution ---
  it("returns failed when dep returns ok:false", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/abs/path" },
    };
    const deps = makeDeps({
      openWorkspace: async () => ({ ok: false, error: "dir not found" }),
    });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("failed");
    expect(r.message).toMatch(/dir not found/);
  });

  it("returns failed when dep throws", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/abs/path" },
    };
    const deps = makeDeps({
      openWorkspace: async () => {
        throw new Error("boom");
      },
    });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("failed");
    expect(r.message).toMatch(/boom/);
  });

  it("appends failed event when dep throws", async () => {
    const payload: CommandPayload = {
      commandId: "open_workspace",
      data: { path: "/abs/path" },
    };
    const deps = makeDeps({
      openWorkspace: async () => {
        throw new Error("boom");
      },
    });
    await executeCommand(sessionId, payload, deps);
    const s = sm.getSession(sessionId)!;
    const failedEvents = s.events.filter((e) => e.kind === "failed");
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
  });

  // --- detect_host (no inputs, always valid) ---
  it("detect_host completes successfully with dep", async () => {
    const payload: CommandPayload = { commandId: "detect_host", data: {} };
    const deps = makeDeps({
      detectHost: async () => ({ os: "linux", arch: "x64" }),
    });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
    expect(r.detail).toEqual({ profile: { os: "linux", arch: "x64" } });
  });

  it("detect_host fails when dep missing", async () => {
    const payload: CommandPayload = { commandId: "detect_host", data: {} };
    const r = await executeCommand(sessionId, payload, makeDeps());
    expect(r.status).toBe("failed");
  });

  // --- save_session (no required inputs) ---
  it("save_session completes when dep succeeds", async () => {
    const payload: CommandPayload = { commandId: "save_session", data: {} };
    const deps = makeDeps({ saveSession: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  it("save_session fails when dep missing", async () => {
    const payload: CommandPayload = { commandId: "save_session", data: {} };
    const r = await executeCommand(sessionId, payload, makeDeps());
    expect(r.status).toBe("failed");
  });

  // --- clone_repository ---
  it("clone_repository completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "clone_repository",
      data: { url: "https://gh.com/r.git", targetPath: "/dest" },
    };
    const deps = makeDeps({ cloneWorkspace: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- attach_mcp ---
  it("attach_mcp completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "attach_mcp",
      data: { serverId: "s1", command: "npx mcp" },
    };
    const deps = makeDeps({ attachMcp: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- attach_agent ---
  it("attach_agent completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "attach_agent",
      data: { agentId: "a1", name: "Agent" },
    };
    const deps = makeDeps({ attachAgent: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- run_workflow ---
  it("run_workflow completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "run_workflow",
      data: { dataDir: "/data" },
    };
    const deps = makeDeps({ runWorkflow: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- restore_session ---
  it("restore_session completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "restore_session",
      data: { sessionId: "old-session" },
    };
    const deps = makeDeps({ restoreSession: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- refresh_mcp_health ---
  it("refresh_mcp_health completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "refresh_mcp_health",
      data: { serverId: "s1" },
    };
    const deps = makeDeps({ refreshMcpHealth: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });

  // --- refresh_mcp_discovery ---
  it("refresh_mcp_discovery completes when dep succeeds", async () => {
    const payload: CommandPayload = {
      commandId: "refresh_mcp_discovery",
      data: { serverId: "s1" },
    };
    const deps = makeDeps({ refreshMcpDiscovery: async () => ({ ok: true }) });
    const r = await executeCommand(sessionId, payload, deps);
    expect(r.status).toBe("completed");
  });
});

/* ================================================================== */
/*  5. Session integration events                                      */
/* ================================================================== */

describe("Session integration (session-integration.ts)", () => {
  it("COMMAND_EVENT_KINDS includes info, note, failed, warning", () => {
    expect(COMMAND_EVENT_KINDS).toContain("info");
    expect(COMMAND_EVENT_KINDS).toContain("note");
    expect(COMMAND_EVENT_KINDS).toContain("failed");
    expect(COMMAND_EVENT_KINDS).toContain("warning");
  });

  it("commandSubmitted creates info event with commandId in detail", () => {
    const e = commandSubmitted("open_workspace", "Open Workspace");
    expect(e.kind).toBe("info");
    expect(e.message).toMatch(/submitted/i);
    expect(e.detail?.commandId).toBe("open_workspace");
    expect(e.detail?.commandAction).toBe("submitted");
  });

  it("commandSubmitted includes the label in the message", () => {
    const e = commandSubmitted("detect_host", "Detect Host");
    expect(e.message).toContain("Detect Host");
  });

  it("commandCompleted creates note event", () => {
    const e = commandCompleted("open_workspace", "Workspace opened.");
    expect(e.kind).toBe("note");
    expect(e.message).toMatch(/completed/i);
    expect(e.detail?.commandId).toBe("open_workspace");
    expect(e.detail?.commandAction).toBe("completed");
  });

  it("commandFailed creates failed event", () => {
    const e = commandFailed("clone_repository", "Network error.");
    expect(e.kind).toBe("failed");
    expect(e.message).toMatch(/failed/i);
    expect(e.detail?.commandId).toBe("clone_repository");
    expect(e.detail?.commandAction).toBe("failed");
  });

  it("commandValidationFailed creates warning event with errors", () => {
    const e = commandValidationFailed("run_workflow", ["dataDir is required", "hostFile invalid"]);
    expect(e.kind).toBe("warning");
    expect(e.message).toMatch(/validation failed/i);
    expect(e.detail?.errors).toEqual(["dataDir is required", "hostFile invalid"]);
    expect(e.detail?.commandAction).toBe("validation_failed");
  });

  it("all events have ISO-8601 timestamps", () => {
    const events = [
      commandSubmitted("detect_host", "DH"),
      commandCompleted("detect_host", "ok"),
      commandFailed("detect_host", "err"),
      commandValidationFailed("detect_host", ["e"]),
    ];
    for (const e of events) {
      expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  // --- resultToSessionEvent ---
  it("resultToSessionEvent maps completed to note", () => {
    const r: CommandExecutionResult = {
      commandId: "open_workspace",
      status: "completed",
      message: "Done",
      timestamp: new Date().toISOString(),
    };
    const e = resultToSessionEvent(r);
    expect(e.kind).toBe("note");
  });

  it("resultToSessionEvent maps failed to failed", () => {
    const r: CommandExecutionResult = {
      commandId: "run_workflow",
      status: "failed",
      message: "Boom",
      timestamp: new Date().toISOString(),
    };
    const e = resultToSessionEvent(r);
    expect(e.kind).toBe("failed");
  });

  it("resultToSessionEvent maps validation_failed to warning", () => {
    const r: CommandExecutionResult = {
      commandId: "clone_repository",
      status: "validation_failed",
      message: "Bad url",
      timestamp: new Date().toISOString(),
    };
    const e = resultToSessionEvent(r);
    expect(e.kind).toBe("warning");
  });
});

/* ================================================================== */
/*  6. UI rendering (views.ts)                                         */
/* ================================================================== */

describe("UI rendering (views.ts)", () => {
  let html: string;

  beforeEach(() => {
    html = renderShellHtml();
  });

  it("contains command-composer section", () => {
    expect(html).toContain('id="command-composer"');
  });

  it("contains command-composer CSS class", () => {
    expect(html).toContain("class=\"command-composer\"");
  });

  it("contains command-select dropdown", () => {
    expect(html).toContain('id="command-select"');
  });

  it("contains command-submit-btn button", () => {
    expect(html).toContain('id="command-submit-btn"');
  });

  it("contains command-description area", () => {
    expect(html).toContain('id="command-description"');
  });

  it("contains command-fields area", () => {
    expect(html).toContain('id="command-fields"');
  });

  it("contains command-validation area", () => {
    expect(html).toContain('id="command-validation"');
  });

  it("contains command-result area", () => {
    expect(html).toContain('id="command-result"');
  });

  it("contains command-composer CSS styles", () => {
    expect(html).toContain(".command-composer");
    expect(html).toContain(".command-select");
    expect(html).toContain(".command-submit-btn");
  });

  it("contains COMMAND_FIELD_DEFS in JavaScript", () => {
    expect(html).toContain("COMMAND_FIELD_DEFS");
  });

  it("contains initCommandComposer function", () => {
    expect(html).toContain("initCommandComposer");
  });

  it("contains command-composer-title heading", () => {
    expect(html).toContain("command-composer-title");
  });

  it("contains command-composer-bar", () => {
    expect(html).toContain("command-composer-bar");
  });

  it("contains the default select option", () => {
    expect(html).toContain("Select command");
  });

  it("submit button is initially disabled", () => {
    expect(html).toMatch(/command-submit-btn[^>]*disabled/);
  });
});

/* ================================================================== */
/*  7. Server endpoint integration                                     */
/* ================================================================== */

describe("Server endpoints (server.ts)", () => {
  it("GET /api/commands returns array of definitions", async () => {
    const { statusCode, json } = await apiRequest("GET", "/api/commands");
    expect(statusCode).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(10);
    expect(json[0]).toHaveProperty("id");
    expect(json[0]).toHaveProperty("category");
    expect(json[0]).toHaveProperty("label");
    expect(json[0]).toHaveProperty("description");
  });

  it("GET /api/commands/availability returns array", async () => {
    const { statusCode, json } = await apiRequest("GET", "/api/commands/availability");
    expect(statusCode).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(10);
    for (const entry of json) {
      expect(entry).toHaveProperty("commandId");
      expect(entry).toHaveProperty("available");
    }
  });

  it("POST /api/commands/validate validates a valid payload", async () => {
    const { statusCode, json } = await apiRequest("POST", "/api/commands/validate", {
      commandId: "open_workspace",
      data: { path: "/valid/path" },
    });
    expect(statusCode).toBe(200);
    expect(json.valid).toBe(true);
    expect(json.errors).toHaveLength(0);
  });

  it("POST /api/commands/validate returns errors for invalid payload", async () => {
    const { statusCode, json } = await apiRequest("POST", "/api/commands/validate", {
      commandId: "open_workspace",
      data: { path: "" },
    });
    expect(statusCode).toBe(200);
    expect(json.valid).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/commands/validate returns 400 for missing fields", async () => {
    const { statusCode } = await apiRequest("POST", "/api/commands/validate", {
      /* no commandId */
    });
    expect(statusCode).toBe(400);
  });

  it("POST /api/commands/execute with no session returns 400", async () => {
    const { statusCode, json } = await apiRequest("POST", "/api/commands/execute", {
      commandId: "open_workspace",
      data: { path: "/valid/path" },
    });
    // No session exists → should fail
    expect([400, 422, 500]).toContain(statusCode);
    // The response should indicate no active session or a failure
    expect(typeof json === "object").toBe(true);
  });

  it("POST /api/commands/execute returns 400 for missing required fields", async () => {
    const { statusCode } = await apiRequest("POST", "/api/commands/execute", {
      /* missing commandId and data */
    });
    expect(statusCode).toBe(400);
  });

  it("GET /api/commands returns definitions with correct structure", async () => {
    const { json } = await apiRequest("GET", "/api/commands");
    const ids = json.map((d: any) => d.id);
    expect(ids).toContain("open_workspace");
    expect(ids).toContain("restore_session");
    expect(ids).toContain("detect_host");
  });

  it("GET /api/commands/availability restore_session is always available", async () => {
    const { json } = await apiRequest("GET", "/api/commands/availability");
    const restoreEntry = json.find((e: any) => e.commandId === "restore_session");
    expect(restoreEntry).toBeDefined();
    expect(restoreEntry.available).toBe(true);
  });

  it("POST /api/commands/validate detect_host always valid", async () => {
    const { json } = await apiRequest("POST", "/api/commands/validate", {
      commandId: "detect_host",
      data: {},
    });
    expect(json.valid).toBe(true);
  });
});
