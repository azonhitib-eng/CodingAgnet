/**
 * Minimal local HTTP server for the app shell.
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 *
 * Routes:
 *   GET  /                          — HTML shell (single-page app)
 *   GET  /api/scenarios             — list of available demo scenarios
 *   GET  /api/scenarios/:id         — full view-model data for a scenario
 *   GET  /api/scenarios/:id/host    — host summary only
 *   GET  /api/scenarios/:id/workflow — workflow summary only
 *   GET  /api/stages                — list valid workflow stage names
 *   POST /api/host/detect           — detect host profile live
 *   POST /api/host/validate         — validate a host profile object
 *   POST /api/workflow/run          — run real workflow (JSON body)
 *   POST /api/workflow/validate     — validate inputs without running
 *   GET  /api/session/current       — latest session summary + events
 *   GET  /api/session/:id/summary   — session summary for a given session
 *   GET  /api/session/:id/timeline  — session events with classification
 *   GET  /api/session/:id/console   — console feed with grouping/presence
 *   GET  /api/sessions/recent       — list recent persisted sessions
 *   POST /api/sessions/save         — save current session to disk
 *   GET  /api/sessions/:id/restore  — restore a persisted session
 *   DELETE /api/sessions/:id        — delete a persisted session
 *   GET  /api/session/:id/mcp/status — MCP server statuses for a session
 *   GET  /api/mcp/:id/info          — runtime info for a specific MCP server
 *   POST /api/mcp/:id/refresh-health — refresh health for an MCP server
 *   POST /api/mcp/:id/refresh-discovery — refresh discovery for an MCP server
 *   GET  /api/commands              — list all command definitions
 *   GET  /api/commands/availability — get command availability for current state
 *   POST /api/commands/validate     — validate a command payload
 *   POST /api/commands/execute      — execute a command
 *
 * Usage:
 *   npx tsx src/app-shell/server.ts [--port 3000]
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { URL } from "node:url";

import {
  listDemoScenarios,
  loadDemoScenario,
  type ScenarioViewModel,
} from "./data-provider.js";

import { renderShellHtml } from "./views.js";

import {
  executeRealWorkflow,
  validateDataDir,
  validateHostFile,
  validateStopAfter,
  getStageNames,
  type RealWorkflowInput,
} from "./workflow-bridge.js";

import { detectHost } from "../detection/host-detector.js";
import { validateHostProfile } from "../cli/host-loader.js";
import { toHostSummary } from "../frontend-contracts/index.js";

import {
  SessionManager,
  openWorkspace,
  cloneWorkspace,
  validateLocalPath,
  validateCloneUrl,
  SessionPersistence,
  RecentSessions,
  DEFAULT_PERSISTENCE_DIR,
} from "../session/index.js";
import type { GitExecutor } from "../session/index.js";
import { McpManager } from "../mcp/index.js";
import { classifyEvent } from "./timeline-helpers.js";
import { buildConsoleFeed } from "./console-helpers.js";
import {
  COMMAND_DEFINITIONS,
  validateCommand,
  getAllCommandAvailability,
  executeCommand,
} from "../commands/index.js";
import type {
  CommandPayload,
  CommandContextState,
} from "../commands/index.js";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res: ServerResponse, message = "Not found"): void {
  json(res, { error: message }, 404);
}

function badRequest(res: ServerResponse, message: string): void {
  json(res, { error: message }, 400);
}

/**
 * Read the full request body as a string (for POST requests).
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Parse JSON body from a POST request.
 * Returns null and sends a 400 response if parsing fails.
 */
async function parseJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
  try {
    const body = await readBody(req);
    if (!body.trim()) {
      badRequest(res, "Request body is empty");
      return null;
    }
    return JSON.parse(body);
  } catch {
    badRequest(res, "Invalid JSON in request body");
    return null;
  }
}

/**
 * Extract a sub-view from a scenario if a view suffix is provided.
 */
function extractSubView(
  scenario: ScenarioViewModel,
  view: string | undefined,
): unknown {
  switch (view) {
    case "host":
      return scenario.host;
    case "recommendation":
      return scenario.recommendation;
    case "compatibility":
      return scenario.compatibility;
    case "plan":
      return scenario.planReview;
    case "workflow":
      return scenario.workflow;
    default:
      return null;
  }
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();

  // HTML shell
  if (path === "/" || path === "/index.html") {
    return html(res, renderShellHtml());
  }

  // API: list scenarios
  if (path === "/api/scenarios" && method === "GET") {
    return json(res, listDemoScenarios());
  }

  // API: list valid stage names
  if (path === "/api/stages" && method === "GET") {
    return json(res, getStageNames());
  }

  // API: run real workflow (POST)
  if (path === "/api/workflow/run" && method === "POST") {
    handleWorkflowRun(req, res);
    return;
  }

  // API: validate inputs (POST)
  if (path === "/api/workflow/validate" && method === "POST") {
    handleWorkflowValidate(req, res);
    return;
  }

  // API: detect host live (POST)
  if (path === "/api/host/detect" && method === "POST") {
    handleHostDetect(req, res);
    return;
  }

  // API: validate host profile object (POST)
  if (path === "/api/host/validate" && method === "POST") {
    handleHostValidate(req, res);
    return;
  }

  // API: open workspace (POST)
  if (path === "/api/workspace/open" && method === "POST") {
    handleWorkspaceOpen(req, res);
    return;
  }

  // API: clone workspace (POST)
  if (path === "/api/workspace/clone" && method === "POST") {
    handleWorkspaceClone(req, res);
    return;
  }

  // API: validate workspace path (POST)
  if (path === "/api/workspace/validate-path" && method === "POST") {
    handleWorkspaceValidatePath(req, res);
    return;
  }

  // API: validate clone URL (POST)
  if (path === "/api/workspace/validate-url" && method === "POST") {
    handleWorkspaceValidateUrl(req, res);
    return;
  }

  // API: get workspace state for a session (GET)
  const wsStateMatch = path.match(/^\/api\/workspace\/state\/([^/]+)$/);
  if (wsStateMatch && method === "GET") {
    handleWorkspaceState(wsStateMatch[1], res);
    return;
  }

  // API: current session summary + events (GET)
  if (path === "/api/session/current" && method === "GET") {
    const sessions = _workspaceSessionManager.listSessions();
    if (sessions.length === 0) {
      return json(res, { sessionId: null, summary: null, events: [] });
    }
    const latest = sessions[sessions.length - 1];
    const summary = _workspaceSessionManager.getSessionSummary(latest.id);
    const events = latest.events.map((e) => ({
      ...e,
      category: classifyEvent(e.kind),
    }));
    return json(res, { sessionId: latest.id, summary, events });
  }

  // API: session summary by id (GET)
  const summaryMatch = path.match(/^\/api\/session\/([^/]+)\/summary$/);
  if (summaryMatch && method === "GET") {
    const sessionId = decodeURIComponent(summaryMatch[1]);
    const session = _workspaceSessionManager.getSession(sessionId);
    if (!session) {
      return notFound(res, `Session not found: ${sessionId}`);
    }
    return json(res, _workspaceSessionManager.getSessionSummary(sessionId));
  }

  // API: session timeline by id (GET)
  const timelineMatch = path.match(/^\/api\/session\/([^/]+)\/timeline$/);
  if (timelineMatch && method === "GET") {
    const sessionId = decodeURIComponent(timelineMatch[1]);
    const session = _workspaceSessionManager.getSession(sessionId);
    if (!session) {
      return notFound(res, `Session not found: ${sessionId}`);
    }
    const events = session.events.map((e) => ({
      ...e,
      category: classifyEvent(e.kind),
    }));
    return json(res, { sessionId, events });
  }

  // API: session console feed by id (GET) — Phase 24
  const consoleMatch = path.match(/^\/api\/session\/([^/]+)\/console$/);
  if (consoleMatch && method === "GET") {
    const sessionId = decodeURIComponent(consoleMatch[1]);
    const session = _workspaceSessionManager.getSession(sessionId);
    if (!session) {
      return notFound(res, `Session not found: ${sessionId}`);
    }
    const summary = _workspaceSessionManager.getSessionSummary(sessionId);
    const classifiedEvents = session.events.map((e) => ({
      ...e,
      category: classifyEvent(e.kind),
    }));
    const feed = buildConsoleFeed(sessionId, classifiedEvents, summary);
    return json(res, feed);
  }

  // API: single scenario (or sub-view)
  const scenarioMatch = path.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/);
  if (scenarioMatch && method === "GET") {
    const id = decodeURIComponent(scenarioMatch[1]);
    const subView = scenarioMatch[2];
    const scenario = loadDemoScenario(id);
    if (!scenario) {
      return notFound(res, `Scenario "${id}" not found`);
    }
    if (subView) {
      const data = extractSubView(scenario, subView);
      if (data === null) {
        return notFound(res, `View "${subView}" not recognized`);
      }
      return json(res, data);
    }
    return json(res, scenario);
  }

  // --- Session persistence endpoints (Phase 25) ---

  // API: list recent sessions (GET)
  if (path === "/api/sessions/recent" && method === "GET") {
    handleRecentSessions(res);
    return;
  }

  // API: save current session (POST)
  if (path === "/api/sessions/save" && method === "POST") {
    handleSaveSession(req, res);
    return;
  }

  // API: restore a persisted session (GET)
  const restoreMatch = path.match(/^\/api\/sessions\/([^/]+)\/restore$/);
  if (restoreMatch && method === "GET") {
    handleRestoreSession(decodeURIComponent(restoreMatch[1]), res);
    return;
  }

  // API: delete a persisted session (DELETE)
  const deleteSessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (deleteSessionMatch && method === "DELETE") {
    handleDeleteSession(decodeURIComponent(deleteSessionMatch[1]), res);
    return;
  }

  // --- MCP status/refresh endpoints (Phase 26) ---

  // API: list MCP server statuses for a session (GET)
  const mcpStatusMatch = path.match(/^\/api\/session\/([^/]+)\/mcp\/status$/);
  if (mcpStatusMatch && method === "GET") {
    handleMcpStatus(decodeURIComponent(mcpStatusMatch[1]), res);
    return;
  }

  // API: get runtime info for a specific MCP server (GET)
  const mcpServerInfoMatch = path.match(/^\/api\/mcp\/([^/]+)\/info$/);
  if (mcpServerInfoMatch && method === "GET") {
    handleMcpServerInfo(decodeURIComponent(mcpServerInfoMatch[1]), res);
    return;
  }

  // API: refresh health for a specific MCP server (POST)
  const mcpRefreshHealthMatch = path.match(/^\/api\/mcp\/([^/]+)\/refresh-health$/);
  if (mcpRefreshHealthMatch && method === "POST") {
    handleMcpRefreshHealth(req, decodeURIComponent(mcpRefreshHealthMatch[1]), res);
    return;
  }

  // API: refresh discovery for a specific MCP server (POST)
  const mcpRefreshDiscoveryMatch = path.match(/^\/api\/mcp\/([^/]+)\/refresh-discovery$/);
  if (mcpRefreshDiscoveryMatch && method === "POST") {
    handleMcpRefreshDiscovery(req, decodeURIComponent(mcpRefreshDiscoveryMatch[1]), res);
    return;
  }

  // --- Command Composer endpoints (Phase 28) ---

  // API: list command definitions (GET)
  if (path === "/api/commands" && method === "GET") {
    return json(res, COMMAND_DEFINITIONS);
  }

  // API: get command availability (GET)
  if (path === "/api/commands/availability" && method === "GET") {
    const ctx = buildCommandContext();
    return json(res, getAllCommandAvailability(ctx));
  }

  // API: validate a command payload (POST)
  if (path === "/api/commands/validate" && method === "POST") {
    handleCommandValidate(req, res);
    return;
  }

  // API: execute a command (POST)
  if (path === "/api/commands/execute" && method === "POST") {
    handleCommandExecute(req, res);
    return;
  }

  notFound(res);
}

// ---------------------------------------------------------------------------
// POST /api/workflow/run
// ---------------------------------------------------------------------------

async function handleWorkflowRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return; // response already sent

  const input = body as Record<string, unknown>;

  // Require dataDir
  if (typeof input.dataDir !== "string" || !input.dataDir.trim()) {
    return badRequest(res, "Missing required field: dataDir");
  }

  // Require either hostFile or hostProfile
  const hasHostFile = typeof input.hostFile === "string" && input.hostFile.trim() !== "";
  const hasHostProfile = input.hostProfile != null && typeof input.hostProfile === "object";
  if (!hasHostFile && !hasHostProfile) {
    return badRequest(res, "Missing required field: provide either hostFile or hostProfile");
  }

  const workflowInput: RealWorkflowInput = {
    dataDir: input.dataDir as string,
  };

  if (hasHostFile) {
    workflowInput.hostFile = input.hostFile as string;
  }
  if (hasHostProfile) {
    workflowInput.hostProfile = input.hostProfile as import("../types/host.js").HostProfile;
  }

  if (typeof input.artifactId === "string" && input.artifactId.trim()) {
    workflowInput.artifactId = input.artifactId;
  }
  if (typeof input.stopAfter === "string" && input.stopAfter.trim()) {
    workflowInput.stopAfter = input.stopAfter;
  }

  const result = executeRealWorkflow(workflowInput);
  if (result.ok) {
    return json(res, {
      ok: true,
      viewModel: result.viewModel,
      status: result.rawResult.status,
      completedStages: result.rawResult.completedStages.map((s) => s.stage),
    });
  } else {
    return json(res, {
      ok: false,
      error: result.error,
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/workflow/validate
// ---------------------------------------------------------------------------

async function handleWorkflowValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  const results: Record<string, { valid: boolean; error?: string }> = {};

  if (typeof input.dataDir === "string") {
    results.dataDir = validateDataDir(input.dataDir);
  }
  if (typeof input.hostFile === "string") {
    results.hostFile = validateHostFile(input.hostFile);
  }
  if (typeof input.stopAfter === "string") {
    results.stopAfter = validateStopAfter(input.stopAfter);
  }

  return json(res, { validations: results });
}

// ---------------------------------------------------------------------------
// POST /api/host/detect
// ---------------------------------------------------------------------------

async function handleHostDetect(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const hostProfile = await detectHost();
    const summary = toHostSummary(hostProfile);
    return json(res, {
      ok: true,
      hostProfile,
      summary,
      source: "detected" as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, {
      ok: false,
      error: {
        code: "HOST_DETECTION_FAILED",
        message: `Host detection failed: ${message}`,
      },
    }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/host/validate
// ---------------------------------------------------------------------------

async function handleHostValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  try {
    const validated = validateHostProfile(body);
    const summary = toHostSummary(validated);
    return json(res, {
      valid: true,
      hostProfile: validated,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, {
      valid: false,
      error: message,
    });
  }
}

// ---------------------------------------------------------------------------
// Workspace session manager (shared instance for workspace endpoints)
// ---------------------------------------------------------------------------

const _workspaceSessionManager = new SessionManager();

/** Exposed for testing — returns the shared workspace session manager. */
export function getWorkspaceSessionManager(): SessionManager {
  return _workspaceSessionManager;
}

/** Optional git executor override for testing. */
let _gitExecutorOverride: GitExecutor | undefined;

/** Set a custom git executor (for testing). */
export function setGitExecutor(executor: GitExecutor | undefined): void {
  _gitExecutorOverride = executor;
}

// ---------------------------------------------------------------------------
// Session persistence (Phase 25)
// ---------------------------------------------------------------------------

import { join as pathJoin } from "node:path";
import { homedir } from "node:os";

let _sessionPersistence: SessionPersistence | null = null;
let _recentSessions: RecentSessions | null = null;

/** Resolve the persistence base directory. */
function defaultPersistenceDir(): string {
  return pathJoin(homedir(), DEFAULT_PERSISTENCE_DIR);
}

/** Get or lazily create the session persistence adapter. */
export function getSessionPersistence(): SessionPersistence {
  if (!_sessionPersistence) {
    _sessionPersistence = new SessionPersistence(defaultPersistenceDir());
  }
  return _sessionPersistence;
}

/** Get or lazily create the recent sessions service. */
export function getRecentSessions(): RecentSessions {
  if (!_recentSessions) {
    _recentSessions = new RecentSessions(getSessionPersistence());
  }
  return _recentSessions;
}

/** Override persistence (for testing). */
export function setSessionPersistence(persistence: SessionPersistence | null): void {
  _sessionPersistence = persistence;
  _recentSessions = persistence ? new RecentSessions(persistence) : null;
}

// ---------------------------------------------------------------------------
// MCP Manager (Phase 26)
// ---------------------------------------------------------------------------

let _mcpManager: McpManager | null = null;

/** Get or lazily create the MCP manager. */
export function getMcpManager(): McpManager {
  if (!_mcpManager) {
    _mcpManager = new McpManager(_workspaceSessionManager);
  }
  return _mcpManager;
}

/** Override MCP manager (for testing). */
export function setMcpManager(manager: McpManager | null): void {
  _mcpManager = manager;
}

// ---------------------------------------------------------------------------
// POST /api/workspace/open
// ---------------------------------------------------------------------------

async function handleWorkspaceOpen(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.path !== "string" || !input.path.trim()) {
    return badRequest(res, "Missing required field: path");
  }

  const session = _workspaceSessionManager.createSession();
  const result = await openWorkspace(input.path, _gitExecutorOverride);

  // Append lifecycle events
  _workspaceSessionManager.appendEvents(session.id, result.events);

  if (result.ok && result.workspace) {
    _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
    _workspaceSessionManager.updateStage(session.id, "workspace_binding");
    _workspaceSessionManager.updateStatus(session.id, "active");
  } else {
    if (result.workspace) {
      _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
    }
    _workspaceSessionManager.updateStatus(session.id, "failed");
  }

  const summary = _workspaceSessionManager.getSessionSummary(session.id);

  return json(res, {
    ok: result.ok,
    sessionId: session.id,
    workspace: result.workspace,
    summary,
    error: result.error,
  });
}

// ---------------------------------------------------------------------------
// POST /api/workspace/clone
// ---------------------------------------------------------------------------

async function handleWorkspaceClone(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) {
    return badRequest(res, "Missing required field: url");
  }
  if (typeof input.targetPath !== "string" || !input.targetPath.trim()) {
    return badRequest(res, "Missing required field: targetPath");
  }

  const session = _workspaceSessionManager.createSession();
  const result = await cloneWorkspace(
    {
      url: input.url,
      targetPath: input.targetPath,
      branch: typeof input.branch === "string" ? input.branch : undefined,
    },
    _gitExecutorOverride,
  );

  // Append lifecycle events
  _workspaceSessionManager.appendEvents(session.id, result.events);

  if (result.ok && result.workspace) {
    _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
    _workspaceSessionManager.updateStage(session.id, "workspace_binding");
    _workspaceSessionManager.updateStatus(session.id, "active");
  } else {
    if (result.workspace) {
      _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
    }
    _workspaceSessionManager.updateStatus(session.id, "failed");
  }

  const summary = _workspaceSessionManager.getSessionSummary(session.id);

  return json(res, {
    ok: result.ok,
    sessionId: session.id,
    workspace: result.workspace,
    summary,
    error: result.error,
  });
}

// ---------------------------------------------------------------------------
// POST /api/workspace/validate-path
// ---------------------------------------------------------------------------

async function handleWorkspaceValidatePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.path !== "string") {
    return badRequest(res, "Missing required field: path");
  }

  const result = await validateLocalPath(input.path);
  return json(res, result);
}

// ---------------------------------------------------------------------------
// POST /api/workspace/validate-url
// ---------------------------------------------------------------------------

async function handleWorkspaceValidateUrl(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.url !== "string") {
    return badRequest(res, "Missing required field: url");
  }

  const result = validateCloneUrl(input.url);
  return json(res, result);
}

// ---------------------------------------------------------------------------
// GET /api/workspace/state/:sessionId
// ---------------------------------------------------------------------------

function handleWorkspaceState(sessionId: string, res: ServerResponse): void {
  const session = _workspaceSessionManager.getSession(sessionId);
  if (!session) {
    return notFound(res, `Session not found: ${sessionId}`);
  }

  const summary = _workspaceSessionManager.getSessionSummary(sessionId);
  const workspaceEvents = session.events.filter((e) =>
    e.kind.startsWith("workspace_") || e.kind.startsWith("clone_"),
  );

  return json(res, {
    sessionId,
    workspace: session.workspace,
    workspaceEvents,
    summary,
  });
}

// ---------------------------------------------------------------------------
// Session persistence handlers (Phase 25)
// ---------------------------------------------------------------------------

async function handleRecentSessions(res: ServerResponse): Promise<void> {
  try {
    const recent = getRecentSessions();
    const sessions = await recent.list();
    return json(res, { sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { error: `Failed to list recent sessions: ${message}` }, 500);
  }
}

async function handleSaveSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : null;

  if (!sessionId) {
    return badRequest(res, "Missing required field: sessionId");
  }

  const session = _workspaceSessionManager.getSession(sessionId);
  if (!session) {
    return notFound(res, `Session not found: ${sessionId}`);
  }

  try {
    const recent = getRecentSessions();
    await recent.save(session);
    return json(res, { ok: true, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { ok: false, error: `Failed to save session: ${message}` }, 500);
  }
}

async function handleRestoreSession(id: string, res: ServerResponse): Promise<void> {
  try {
    const recent = getRecentSessions();
    const restored = await recent.restore(id);
    if (!restored) {
      return notFound(res, `Persisted session not found: ${id}`);
    }
    const session = restored.session;
    const events = session.events.map((e) => ({
      ...e,
      category: classifyEvent(e.kind),
    }));
    return json(res, {
      sessionId: session.id,
      origin: restored.origin,
      restoredAt: restored.restoredAt,
      warnings: restored.warnings,
      session: {
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        stage: session.stage,
        status: session.status,
        workspacePath: session.workspace?.path ?? null,
        workspaceSource: session.workspace?.source ?? null,
        eventCount: session.events.length,
        agentCount: session.attachedResources.filter((r) => r.kind === "agent").length,
        mcpCount: session.attachedResources.filter((r) => r.kind === "mcp_server").length,
        attachedResources: session.attachedResources,
      },
      events,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { error: `Failed to restore session: ${message}` }, 500);
  }
}

async function handleDeleteSession(id: string, res: ServerResponse): Promise<void> {
  try {
    const recent = getRecentSessions();
    const deleted = await recent.delete(id);
    if (!deleted) {
      return notFound(res, `Persisted session not found: ${id}`);
    }
    return json(res, { ok: true, sessionId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { ok: false, error: `Failed to delete session: ${message}` }, 500);
  }
}

// ---------------------------------------------------------------------------
// MCP status/refresh handlers (Phase 26)
// ---------------------------------------------------------------------------

function handleMcpStatus(sessionId: string, res: ServerResponse): void {
  const session = _workspaceSessionManager.getSession(sessionId);
  if (!session) {
    return notFound(res, `Session not found: ${sessionId}`);
  }

  const mcpManager = getMcpManager();
  const attachments = mcpManager.listSessionAttachments(sessionId);

  const servers = attachments.map((a) => {
    const info = mcpManager.getRuntimeInfo(a.serverId);
    return {
      serverId: a.serverId,
      attachmentStatus: a.status,
      attachedAt: a.attachedAt,
      failureReason: a.failureReason,
      ...(info
        ? {
            name: info.config.name,
            transport: info.config.transport,
            serverStatus: info.status,
            health: info.health,
            healthReport: info.healthReport,
            discoveryState: info.discoveryState,
            pid: info.pid,
            toolCount: info.tools.length,
            resourceCount: info.resources.length,
            promptCount: info.prompts.length,
          }
        : { name: null, serverStatus: null }),
    };
  });

  return json(res, { sessionId, mcpServerCount: servers.length, servers });
}

function handleMcpServerInfo(serverId: string, res: ServerResponse): void {
  const mcpManager = getMcpManager();
  const info = mcpManager.getRuntimeInfo(serverId);
  if (!info) {
    return notFound(res, `MCP server not found: ${serverId}`);
  }
  return json(res, info);
}

async function handleMcpRefreshHealth(
  req: IncomingMessage,
  serverId: string,
  res: ServerResponse,
): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : undefined;

  try {
    const mcpManager = getMcpManager();
    const healthReport = mcpManager.refreshHealth(serverId, sessionId);
    return json(res, { ok: true, serverId, healthReport });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { ok: false, error: message }, 400);
  }
}

async function handleMcpRefreshDiscovery(
  req: IncomingMessage,
  serverId: string,
  res: ServerResponse,
): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : undefined;

  // In this phase, discovery refresh accepts an optional mock result.
  // Real protocol-driven discovery is deferred.
  const discoveryResult = {
    tools: Array.isArray(input.tools)
      ? (input.tools as Array<{ name: string; description?: string }>)
      : [],
    resources: Array.isArray(input.resources)
      ? (input.resources as Array<{ uri: string; name: string; description?: string }>)
      : [],
    prompts: Array.isArray(input.prompts)
      ? (input.prompts as Array<{ name: string; description?: string }>)
      : [],
    complete: input.complete !== false,
    error: typeof input.error === "string" ? input.error : undefined,
    source: (typeof input.source === "string" ? input.source : "manual") as "manual" | "runtime" | "restored" | "placeholder",
  };

  try {
    const mcpManager = getMcpManager();
    const discoveryState = mcpManager.refreshDiscovery(serverId, discoveryResult, sessionId);
    return json(res, { ok: true, serverId, discoveryState });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, { ok: false, error: message }, 400);
  }
}

// ---------------------------------------------------------------------------
// Command Composer helpers (Phase 28)
// ---------------------------------------------------------------------------

/** Build the command context state from the current session manager. */
function buildCommandContext(): CommandContextState {
  const sessions = _workspaceSessionManager.listSessions();
  if (sessions.length === 0) {
    return { hasActiveSession: false, sessionSummary: null };
  }
  const latest = sessions[sessions.length - 1];
  const summary = _workspaceSessionManager.getSessionSummary(latest.id);
  return { hasActiveSession: true, sessionSummary: summary };
}

/** POST /api/commands/validate */
async function handleCommandValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.commandId !== "string" || !input.data || typeof input.data !== "object") {
    return badRequest(res, "Missing required fields: commandId, data");
  }

  const payload: CommandPayload = {
    commandId: input.commandId,
    data: input.data,
  } as CommandPayload;

  const result = validateCommand(payload);
  return json(res, result);
}

/** POST /api/commands/execute */
async function handleCommandExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  if (typeof input.commandId !== "string" || !input.data || typeof input.data !== "object") {
    return badRequest(res, "Missing required fields: commandId, data");
  }

  // Resolve session id: explicit or from latest session
  let sessionId = typeof input.sessionId === "string" ? input.sessionId : null;
  if (!sessionId) {
    const sessions = _workspaceSessionManager.listSessions();
    if (sessions.length > 0) {
      sessionId = sessions[sessions.length - 1].id;
    }
  }

  if (!sessionId && input.commandId !== "restore_session") {
    return badRequest(res, "No active session. Create a session first or provide sessionId.");
  }

  const payload: CommandPayload = {
    commandId: input.commandId,
    data: input.data,
  } as CommandPayload;

  const deps = buildCommandExecutorDeps();
  const result = await executeCommand(sessionId ?? "", payload, deps);
  const status = result.status === "completed" ? 200 : result.status === "validation_failed" ? 422 : 500;
  return json(res, result, status);
}

/** Build the executor dependencies from server singletons. */
function buildCommandExecutorDeps() {
  return {
    sessionManager: _workspaceSessionManager,
    openWorkspace: async (path: string) => {
      try {
        const git = _gitExecutorOverride ?? (await import("../session/index.js")).defaultGitExecutor;
        const result = await openWorkspace(path, git);
        if (result.ok && result.workspace) {
          const session = _workspaceSessionManager.listSessions().at(-1);
          if (session) {
            _workspaceSessionManager.appendEvents(session.id, result.events);
            _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
            _workspaceSessionManager.updateStage(session.id, "workspace_binding");
            _workspaceSessionManager.updateStatus(session.id, "active");
          }
        }
        return { ok: result.ok, error: result.error };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    cloneWorkspace: async (url: string, targetPath: string, branch?: string) => {
      try {
        const git = _gitExecutorOverride ?? (await import("../session/index.js")).defaultGitExecutor;
        const result = await cloneWorkspace({ url, targetPath, branch }, git);
        if (result.ok && result.workspace) {
          const session = _workspaceSessionManager.listSessions().at(-1);
          if (session) {
            _workspaceSessionManager.appendEvents(session.id, result.events);
            _workspaceSessionManager.bindWorkspace(session.id, result.workspace);
            _workspaceSessionManager.updateStage(session.id, "workspace_binding");
            _workspaceSessionManager.updateStatus(session.id, "active");
          }
        }
        return { ok: result.ok, error: result.error };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    detectHost: async () => {
      const profile = await detectHost();
      const session = _workspaceSessionManager.listSessions().at(-1);
      if (session) {
        const hostSummary = toHostSummary(profile);
        _workspaceSessionManager.appendEvent(
          session.id,
          (await import("../session/index.js")).hostDetected(
            `${hostSummary.os} / ${hostSummary.cpuModel} / ${hostSummary.totalRamGb ?? "?"}GB`,
          ),
        );
        _workspaceSessionManager.updateStage(session.id, "host_detection");
      }
      return profile as unknown as Record<string, unknown>;
    },
    saveSession: async (sessionId: string) => {
      try {
        const persistence = getSessionPersistence();
        const session = _workspaceSessionManager.getSession(sessionId);
        if (!session) {
          return { ok: false, error: `Session not found: ${sessionId}` };
        }
        await persistence.saveSession(session);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    restoreSession: async (sessionId: string) => {
      try {
        const persistence = getSessionPersistence();
        const persisted = await persistence.loadSession(sessionId);
        if (!persisted) {
          return { ok: false, error: `Session not found: ${sessionId}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Browser opener
// ---------------------------------------------------------------------------

/**
 * Open a URL in the default system browser.
 * Only allows http: and https: protocols to prevent command injection.
 * Uses execFile to avoid shell interpolation of URL characters.
 * Returns true if the command was spawned, false on validation failure.
 */
export function openBrowser(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const safeUrl = parsed.href;
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === "darwin") {
    cmd = "open";
    args = [safeUrl];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", safeUrl];
  } else {
    cmd = "xdg-open";
    args = [safeUrl];
  }
  execFile(cmd, args, (err) => {
    if (err) {
      // Silently ignore — user can still open the URL manually
    }
  });
  return true;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Attach graceful shutdown handlers to the given server.
 * On SIGINT/SIGTERM, prints a message and closes the server cleanly.
 */
export function attachGracefulShutdown(server: ReturnType<typeof createServer>): void {
  const shutdown = (signal: string) => {
    console.log();
    console.log(`  Received ${signal}. Shutting down CodingAgent App Shell…`);
    server.close(() => {
      console.log("  Server stopped. Goodbye!");
      process.exit(0);
    });
    // Force exit after 3 seconds if connections linger
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ---------------------------------------------------------------------------
// Server entrypoint
// ---------------------------------------------------------------------------

export interface StartServerOptions {
  /** Automatically open the browser after the server starts. Default: false. */
  open?: boolean;
}

export function startServer(
  port: number,
  options?: StartServerOptions,
): ReturnType<typeof createServer> {
  const server = createServer(handleRequest);
  server.listen(port, () => {
    const localUrl = `http://localhost:${port}`;
    const line = "─".repeat(56);
    console.log();
    console.log(line);
    console.log("  CodingAgent App Shell");
    console.log(line);
    console.log();
    console.log(`  ➜  Local:   ${localUrl}`);
    console.log();
    console.log("  Modes:");
    console.log("    • Demo  — pre-built scenarios, no setup required");
    console.log("    • Real  — connect your own data-dir + host profile or detect live");
    console.log();
    console.log("  Quick tips:");
    console.log("    - Open the URL above in your browser");
    console.log("    - Demo mode is selected by default");
    console.log("    - For real mode, prepare a data directory and host profile");
    console.log("    - Or use the \"Detect Host\" button to detect your host live");
    console.log("    - See docs/QUICKSTART.md for detailed instructions");
    console.log();
    console.log("  Press Ctrl+C to stop the server");
    console.log(line);
    console.log();

    if (options?.open) {
      console.log("  Opening browser…");
      const opened = openBrowser(localUrl);
      if (!opened) {
        console.log("  ⚠  Could not open browser automatically. Please open the URL above manually.");
      }
      console.log();
    }
  });
  return server;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

/**
 * Resolve the port number from CLI args or environment.
 * Priority: --port flag > PORT env var > default 3000.
 */
export function resolvePort(args: string[]): number {
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsed = parseInt(args[portIdx + 1], 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  const envPort = process.env.PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return 3000;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx src/app-shell/server.ts [options]

Options:
  --port <number>   Port to listen on (default: 3000, or PORT env var)
  --open            Automatically open the default browser on startup
  --help, -h        Show this help message

Environment variables:
  PORT              Port to listen on (overridden by --port flag)

Examples:
  npm run app-shell                           # Start on port 3000
  npm run app-shell -- --port 8080            # Start on port 8080
  npm run app-shell -- --open                 # Start and open browser
  npm run app-shell:desktop                   # Desktop mode (preflight + open)
  PORT=4000 npm run app-shell                 # Start on port 4000

See docs/QUICKSTART.md for full setup instructions.
`);
    return;
  }

  const port = resolvePort(args);
  const shouldOpen = args.includes("--open");
  const server = startServer(port, { open: shouldOpen });
  attachGracefulShutdown(server);
}

// Run if this is the entry module
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/server.ts") ||
   process.argv[1].endsWith("/server.js") ||
   process.argv[1].includes("app-shell/server"));

if (isMain) {
  main();
}
