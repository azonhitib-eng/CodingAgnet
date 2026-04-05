/**
 * Phase 25 — Session Persistence and Recent Sessions tests.
 *
 * Covers:
 *  - save session to disk
 *  - load session from disk
 *  - list recent sessions
 *  - recency ordering
 *  - restored session state semantics
 *  - persisted timeline integrity
 *  - historical session does not falsely imply live MCP/agent/runtime state
 *  - shell/server persistence bridge behavior
 *  - edge cases (missing sessions, corrupt files, empty index)
 *  - round-trip serialisation fidelity
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SessionPersistence,
  extractMeta,
  toPersistedSession,
  fromPersistedSession,
  type PersistedSession,
  type PersistedSessionMeta,
  type PersistedResource,
} from "../../src/session/persistence.js";

import {
  RecentSessions,
  buildRestoreWarnings,
  type RestoredSession,
} from "../../src/session/recent-sessions.js";

import {
  SessionManager,
  _resetIdCounter,
  createEvent,
  sessionCreated,
  workspaceBound,
  hostDetected,
  workflowStarted,
  stageCompleted,
  completedEvent,
  openLocalWorkspace,
  prepareCloneWorkspace,
  type Session,
  type SessionEvent,
  type AttachedResource,
  type Workspace,
} from "../../src/session/index.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let tempDir: string;

function makeSession(overrides?: Partial<Session>): Session {
  const now = new Date().toISOString();
  return {
    id: `test-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    stage: "initializing",
    status: "idle",
    workspace: null,
    events: [createEvent("session_created", "Session created")],
    runContext: null,
    attachedResources: [],
    ...overrides,
  };
}

function makeRichSession(): Session {
  const now = new Date().toISOString();
  const workspace = openLocalWorkspace("/home/user/project", { branch: "main" });
  const events: SessionEvent[] = [
    createEvent("session_created", "Session created"),
    createEvent("workspace_bound", "Workspace bound: /home/user/project"),
    createEvent("host_detected", "Detected host: Linux x86_64"),
    createEvent("catalogs_loaded", "3 catalog entries loaded"),
    createEvent("workflow_started", "Workflow execution started"),
    createEvent("stage_completed", "Stage completed: detect"),
    createEvent("stage_completed", "Stage completed: compatibility"),
    createEvent("stage_completed", "Stage completed: recommend"),
    createEvent("completed", "Session completed successfully"),
  ];
  const mcpResource: AttachedResource = {
    kind: "mcp_server",
    id: "mcp-code-search",
    label: "Code Search MCP",
    ready: true,
  };
  const agentResource: AttachedResource = {
    kind: "agent",
    id: "agent-reviewer",
    label: "Code Reviewer Agent",
    ready: true,
  };
  return {
    id: `rich-session-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    stage: "done",
    status: "completed",
    workspace,
    events,
    runContext: {
      workflowStage: "recommend",
      workflowStatus: "completed",
      workflowResultRef: { someData: "should-not-persist" },
      approvalRequired: false,
      isBlocked: false,
      lastError: null,
    },
    attachedResources: [mcpResource, agentResource],
  };
}

/* ================================================================== */
/*  extractMeta                                                       */
/* ================================================================== */

describe("extractMeta", () => {
  it("extracts basic metadata from a minimal session", () => {
    const session = makeSession();
    const meta = extractMeta(session);

    expect(meta.id).toBe(session.id);
    expect(meta.createdAt).toBe(session.createdAt);
    expect(meta.updatedAt).toBe(session.updatedAt);
    expect(meta.status).toBe("idle");
    expect(meta.stage).toBe("initializing");
    expect(meta.workspacePath).toBeNull();
    expect(meta.workspaceSource).toBeNull();
    expect(meta.lastStage).toBeNull();
    expect(meta.agentCount).toBe(0);
    expect(meta.mcpCount).toBe(0);
    expect(meta.eventCount).toBe(1);
  });

  it("extracts workspace path and source", () => {
    const ws = openLocalWorkspace("/tmp/project");
    const session = makeSession({ workspace: ws });
    const meta = extractMeta(session);

    expect(meta.workspacePath).toBe("/tmp/project");
    expect(meta.workspaceSource).toBe("local_existing");
  });

  it("counts MCP servers and agents separately", () => {
    const session = makeSession({
      attachedResources: [
        { kind: "mcp_server", id: "m1", label: "MCP 1", ready: true },
        { kind: "mcp_server", id: "m2", label: "MCP 2", ready: false },
        { kind: "agent", id: "a1", label: "Agent 1", ready: true },
        { kind: "environment", id: "e1", label: "Env 1", ready: true },
      ],
    });
    const meta = extractMeta(session);

    expect(meta.mcpCount).toBe(2);
    expect(meta.agentCount).toBe(1);
  });

  it("extracts last workflow stage from run context", () => {
    const session = makeSession({
      runContext: {
        workflowStage: "recommend",
        workflowStatus: "completed",
        workflowResultRef: null,
        approvalRequired: false,
        isBlocked: false,
        lastError: null,
      },
    });
    const meta = extractMeta(session);

    expect(meta.lastStage).toBe("recommend");
  });
});

/* ================================================================== */
/*  toPersistedSession / fromPersistedSession                         */
/* ================================================================== */

describe("toPersistedSession", () => {
  it("persists attached resources with ready: false", () => {
    const session = makeRichSession();
    const persisted = toPersistedSession(session);

    expect(persisted.attachedResources).toHaveLength(2);
    for (const r of persisted.attachedResources) {
      expect(r.ready).toBe(false);
    }
  });

  it("preserves all events", () => {
    const session = makeRichSession();
    const persisted = toPersistedSession(session);

    expect(persisted.events).toHaveLength(session.events.length);
    for (let i = 0; i < session.events.length; i++) {
      expect(persisted.events[i].kind).toBe(session.events[i].kind);
      expect(persisted.events[i].message).toBe(session.events[i].message);
      expect(persisted.events[i].timestamp).toBe(session.events[i].timestamp);
    }
  });

  it("preserves workspace", () => {
    const session = makeRichSession();
    const persisted = toPersistedSession(session);

    expect(persisted.workspace).not.toBeNull();
    expect(persisted.workspace!.path).toBe("/home/user/project");
    expect(persisted.workspace!.source).toBe("local_existing");
    expect(persisted.workspace!.branch).toBe("main");
  });

  it("preserves run context", () => {
    const session = makeRichSession();
    const persisted = toPersistedSession(session);

    expect(persisted.runContext).not.toBeNull();
    expect(persisted.runContext!.workflowStage).toBe("recommend");
    expect(persisted.runContext!.workflowStatus).toBe("completed");
  });
});

describe("fromPersistedSession", () => {
  it("round-trips a session through serialisation", () => {
    const original = makeRichSession();
    const persisted = toPersistedSession(original);
    const restored = fromPersistedSession(persisted);

    expect(restored.id).toBe(original.id);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.updatedAt).toBe(original.updatedAt);
    expect(restored.stage).toBe(original.stage);
    expect(restored.status).toBe(original.status);
    expect(restored.events).toHaveLength(original.events.length);
  });

  it("clears workflowResultRef on restore (opaque runtime reference)", () => {
    const original = makeRichSession();
    expect(original.runContext?.workflowResultRef).not.toBeNull();

    const persisted = toPersistedSession(original);
    const restored = fromPersistedSession(persisted);

    expect(restored.runContext).not.toBeNull();
    expect(restored.runContext!.workflowResultRef).toBeNull();
  });

  it("restores attached resources with ready: false", () => {
    const original = makeRichSession();
    // Live session has ready: true
    expect(original.attachedResources[0].ready).toBe(true);

    const persisted = toPersistedSession(original);
    const restored = fromPersistedSession(persisted);

    for (const r of restored.attachedResources) {
      expect(r.ready).toBe(false);
    }
  });

  it("handles session with no workspace", () => {
    const session = makeSession({ workspace: null });
    const persisted = toPersistedSession(session);
    const restored = fromPersistedSession(persisted);

    expect(restored.workspace).toBeNull();
  });

  it("handles session with no run context", () => {
    const session = makeSession({ runContext: null });
    const persisted = toPersistedSession(session);
    const restored = fromPersistedSession(persisted);

    expect(restored.runContext).toBeNull();
  });
});

/* ================================================================== */
/*  buildRestoreWarnings                                              */
/* ================================================================== */

describe("buildRestoreWarnings", () => {
  it("returns no warnings for a minimal session", () => {
    const session = makeSession();
    const warnings = buildRestoreWarnings(session);
    expect(warnings).toHaveLength(0);
  });

  it("warns about MCP servers that are not running", () => {
    const session = makeSession({
      attachedResources: [
        { kind: "mcp_server", id: "m1", label: "MCP 1", ready: false },
      ],
    });
    const warnings = buildRestoreWarnings(session);
    expect(warnings.some((w) => w.includes("MCP server"))).toBe(true);
    expect(warnings.some((w) => w.includes("reattach or restart"))).toBe(true);
  });

  it("warns about agents that need re-establishment", () => {
    const session = makeSession({
      attachedResources: [
        { kind: "agent", id: "a1", label: "Agent 1", ready: false },
      ],
    });
    const warnings = buildRestoreWarnings(session);
    expect(warnings.some((w) => w.includes("agent"))).toBe(true);
    expect(warnings.some((w) => w.includes("runtime liveness"))).toBe(true);
  });

  it("warns about workflow result ref if present", () => {
    const session = makeSession({
      runContext: {
        workflowStage: "recommend",
        workflowStatus: "completed",
        workflowResultRef: { data: "something" },
        approvalRequired: false,
        isBlocked: false,
        lastError: null,
      },
    });
    const warnings = buildRestoreWarnings(session);
    expect(warnings.some((w) => w.includes("Workflow result reference"))).toBe(true);
  });

  it("accumulates multiple warnings", () => {
    const session = makeSession({
      attachedResources: [
        { kind: "mcp_server", id: "m1", label: "MCP 1", ready: false },
        { kind: "agent", id: "a1", label: "Agent 1", ready: false },
      ],
      runContext: {
        workflowStage: null,
        workflowStatus: null,
        workflowResultRef: { x: 1 },
        approvalRequired: false,
        isBlocked: false,
        lastError: null,
      },
    });
    const warnings = buildRestoreWarnings(session);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});

/* ================================================================== */
/*  SessionPersistence (file-system adapter)                          */
/* ================================================================== */

describe("SessionPersistence", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "session-persist-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates directory structure on first save", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeSession();
    await persistence.saveSession(session);

    const files = await readdir(join(tempDir, "sessions"));
    expect(files.length).toBe(1);
    expect(files[0]).toBe(`${session.id}.json`);
  });

  it("saves and loads a session", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeRichSession();
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.id).toBe(session.id);
    expect(loaded!.events).toHaveLength(session.events.length);
    expect(loaded!.workspace?.path).toBe(session.workspace?.path);
  });

  it("returns null for non-existent session", async () => {
    const persistence = new SessionPersistence(tempDir);
    const loaded = await persistence.loadSession("nonexistent-id");
    expect(loaded).toBeNull();
  });

  it("updates the index on save", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeSession();
    await persistence.saveSession(session);

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(session.id);
  });

  it("orders recent sessions with newest first", async () => {
    const persistence = new SessionPersistence(tempDir);

    const s1 = makeSession({ id: "session-1", createdAt: "2025-01-01T00:00:00Z" });
    const s2 = makeSession({ id: "session-2", createdAt: "2025-01-02T00:00:00Z" });
    const s3 = makeSession({ id: "session-3", createdAt: "2025-01-03T00:00:00Z" });

    // Save in order — each save prepends
    await persistence.saveSession(s1);
    await persistence.saveSession(s2);
    await persistence.saveSession(s3);

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(3);
    expect(recent[0].id).toBe("session-3"); // most recent save
    expect(recent[1].id).toBe("session-2");
    expect(recent[2].id).toBe("session-1");
  });

  it("updates existing session in index on re-save", async () => {
    const persistence = new SessionPersistence(tempDir);

    const session = makeSession({ id: "session-reuse" });
    await persistence.saveSession(session);

    // Modify and re-save
    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    await persistence.saveSession(session);

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(1);
    expect(recent[0].status).toBe("completed");
  });

  it("re-save moves session to top of index", async () => {
    const persistence = new SessionPersistence(tempDir);

    const s1 = makeSession({ id: "session-old" });
    const s2 = makeSession({ id: "session-new" });
    await persistence.saveSession(s1);
    await persistence.saveSession(s2);

    // Re-save the old one
    s1.updatedAt = new Date().toISOString();
    await persistence.saveSession(s1);

    const recent = await persistence.listRecentSessions();
    expect(recent[0].id).toBe("session-old"); // moved to top
    expect(recent[1].id).toBe("session-new");
  });

  it("deletes a session", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeSession({ id: "session-delete" });
    await persistence.saveSession(session);

    const deleted = await persistence.deleteSession("session-delete");
    expect(deleted).toBe(true);

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(0);

    const loaded = await persistence.loadSession("session-delete");
    expect(loaded).toBeNull();
  });

  it("returns false when deleting non-existent session", async () => {
    const persistence = new SessionPersistence(tempDir);
    const deleted = await persistence.deleteSession("nonexistent");
    expect(deleted).toBe(false);
  });

  it("handles corrupt index gracefully", async () => {
    const persistence = new SessionPersistence(tempDir);
    await persistence.ensureDir();

    // Write corrupt index
    await writeFile(join(tempDir, "index.json"), "not valid json", "utf-8");

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(0);
  });

  it("handles missing index file gracefully", async () => {
    const persistence = new SessionPersistence(tempDir);
    // No ensureDir, no index file
    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(0);
  });

  it("returns the configured base directory", () => {
    const persistence = new SessionPersistence("/some/path");
    expect(persistence.getBaseDir()).toBe("/some/path");
  });

  it("persists session JSON file with readable structure", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeRichSession();
    await persistence.saveSession(session);

    const raw = await readFile(join(tempDir, "sessions", `${session.id}.json`), "utf-8");
    const parsed = JSON.parse(raw);

    // Structure check
    expect(parsed).toHaveProperty("meta");
    expect(parsed).toHaveProperty("workspace");
    expect(parsed).toHaveProperty("events");
    expect(parsed).toHaveProperty("runContext");
    expect(parsed).toHaveProperty("attachedResources");

    // Pretty-printed (not minified)
    expect(raw).toContain("\n");
  });

  it("persists index JSON with version field", async () => {
    const persistence = new SessionPersistence(tempDir);
    const session = makeSession();
    await persistence.saveSession(session);

    const raw = await readFile(join(tempDir, "index.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.sessions)).toBe(true);
  });
});

/* ================================================================== */
/*  Timeline persistence integrity                                    */
/* ================================================================== */

describe("timeline persistence integrity", () => {
  let persistence: SessionPersistence;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "timeline-persist-test-"));
    persistence = new SessionPersistence(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("preserves event ordering through save/load", async () => {
    const session = makeRichSession();
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded).not.toBeNull();

    const originalKinds = session.events.map((e) => e.kind);
    const loadedKinds = loaded!.events.map((e) => e.kind);
    expect(loadedKinds).toEqual(originalKinds);
  });

  it("preserves event timestamps", async () => {
    const session = makeRichSession();
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    for (let i = 0; i < session.events.length; i++) {
      expect(loaded!.events[i].timestamp).toBe(session.events[i].timestamp);
    }
  });

  it("preserves event detail payloads", async () => {
    const session = makeSession({
      events: [
        createEvent("session_created", "Session created", { sessionId: "test-123" }),
        createEvent("workspace_bound", "Workspace bound", { path: "/tmp/ws", source: "local_existing" }),
        createEvent("host_detected", "Host detected", { os: "linux", arch: "x86_64" }),
      ],
    });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.events[0].detail).toEqual({ sessionId: "test-123" });
    expect(loaded!.events[1].detail).toEqual({ path: "/tmp/ws", source: "local_existing" });
    expect(loaded!.events[2].detail).toEqual({ os: "linux", arch: "x86_64" });
  });

  it("preserves event messages", async () => {
    const session = makeRichSession();
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    for (let i = 0; i < session.events.length; i++) {
      expect(loaded!.events[i].message).toBe(session.events[i].message);
    }
  });

  it("preserves event kind types", async () => {
    const session = makeSession({
      events: [
        createEvent("session_created", "Created"),
        createEvent("mcp_attached", "MCP attached", { serverId: "s1" }),
        createEvent("agent_attached", "Agent attached", { agentId: "a1" }),
        createEvent("workflow_started", "Workflow started"),
        createEvent("warning", "Something is off"),
      ],
    });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    const kinds = loaded!.events.map((e) => e.kind);
    expect(kinds).toEqual([
      "session_created",
      "mcp_attached",
      "agent_attached",
      "workflow_started",
      "warning",
    ]);
  });
});

/* ================================================================== */
/*  RecentSessions (service layer)                                    */
/* ================================================================== */

describe("RecentSessions", () => {
  let persistence: SessionPersistence;
  let recent: RecentSessions;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "recent-sessions-test-"));
    persistence = new SessionPersistence(tempDir);
    recent = new RecentSessions(persistence);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("save and list roundtrip", async () => {
    const session = makeSession();
    await recent.save(session);

    const list = await recent.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(session.id);
  });

  it("restore returns RestoredSession with origin='restored'", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored).not.toBeNull();
    expect(restored!.origin).toBe("restored");
    expect(restored!.restoredAt).toBeTruthy();
    expect(restored!.session.id).toBe(session.id);
  });

  it("restore includes warnings about MCP servers", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.warnings.some((w) => w.includes("MCP server"))).toBe(true);
  });

  it("restore includes warnings about agents", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.warnings.some((w) => w.includes("agent"))).toBe(true);
  });

  it("restore returns null for non-existent session", async () => {
    const restored = await recent.restore("nonexistent");
    expect(restored).toBeNull();
  });

  it("delete removes a session", async () => {
    const session = makeSession({ id: "to-delete" });
    await recent.save(session);
    expect(await recent.exists("to-delete")).toBe(true);

    await recent.delete("to-delete");
    expect(await recent.exists("to-delete")).toBe(false);

    const list = await recent.list();
    expect(list).toHaveLength(0);
  });

  it("exists returns false for missing session", async () => {
    expect(await recent.exists("missing")).toBe(false);
  });

  it("listing preserves recency order", async () => {
    for (let i = 1; i <= 5; i++) {
      await recent.save(makeSession({ id: `s-${i}` }));
    }

    const list = await recent.list();
    expect(list.map((s) => s.id)).toEqual(["s-5", "s-4", "s-3", "s-2", "s-1"]);
  });

  it("restoring does not mark session as live", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    // All attached resources should be not ready
    for (const r of restored!.session.attachedResources) {
      expect(r.ready).toBe(false);
    }
  });
});

/* ================================================================== */
/*  Historical session does not falsely imply live state               */
/* ================================================================== */

describe("restored session safety semantics", () => {
  let persistence: SessionPersistence;
  let recent: RecentSessions;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "safety-test-"));
    persistence = new SessionPersistence(tempDir);
    recent = new RecentSessions(persistence);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("MCP servers from old session are NOT treated as running", async () => {
    const session = makeSession({
      attachedResources: [
        { kind: "mcp_server", id: "m1", label: "Code Search", ready: true },
        { kind: "mcp_server", id: "m2", label: "Browser MCP", ready: true },
      ],
    });
    await recent.save(session);

    const restored = await recent.restore(session.id);
    const mcpServers = restored!.session.attachedResources.filter(
      (r) => r.kind === "mcp_server",
    );
    expect(mcpServers).toHaveLength(2);
    for (const mcp of mcpServers) {
      expect(mcp.ready).toBe(false);
    }
  });

  it("agent attachments are restored as records only", async () => {
    const session = makeSession({
      attachedResources: [
        { kind: "agent", id: "a1", label: "Reviewer", ready: true },
      ],
    });
    await recent.save(session);

    const restored = await recent.restore(session.id);
    const agents = restored!.session.attachedResources.filter(
      (r) => r.kind === "agent",
    );
    expect(agents).toHaveLength(1);
    expect(agents[0].ready).toBe(false);
    expect(agents[0].label).toBe("Reviewer");
  });

  it("workflowResultRef is cleared on restore", async () => {
    const session = makeSession({
      runContext: {
        workflowStage: "recommend",
        workflowStatus: "completed",
        workflowResultRef: { large: "object", nested: { deep: true } },
        approvalRequired: false,
        isBlocked: false,
        lastError: null,
      },
    });
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.session.runContext!.workflowResultRef).toBeNull();
    // But other run context fields are preserved
    expect(restored!.session.runContext!.workflowStage).toBe("recommend");
    expect(restored!.session.runContext!.workflowStatus).toBe("completed");
  });

  it("restore preserves session status and stage accurately", async () => {
    const session = makeSession({
      stage: "done",
      status: "completed_requires_approval",
    });
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.session.stage).toBe("done");
    expect(restored!.session.status).toBe("completed_requires_approval");
  });

  it("restored session summary data is available but not live", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.origin).toBe("restored");
    expect(restored!.session.events.length).toBeGreaterThan(0);
    expect(restored!.session.workspace).not.toBeNull();
    // But the session is clearly marked as restored, not live
    expect(restored!.warnings.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  SessionManager integration with persistence                       */
/* ================================================================== */

describe("SessionManager ↔ persistence integration", () => {
  let persistence: SessionPersistence;
  let recent: RecentSessions;
  let manager: SessionManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "manager-persist-test-"));
    persistence = new SessionPersistence(tempDir);
    recent = new RecentSessions(persistence);
    manager = new SessionManager();
    _resetIdCounter();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("saves a session created via SessionManager", async () => {
    const session = manager.createSession();
    const ws = openLocalWorkspace("/tmp/workspace");
    manager.bindWorkspace(session.id, ws);

    await recent.save(manager.getSession(session.id)!);

    const list = await recent.list();
    expect(list).toHaveLength(1);
    expect(list[0].workspacePath).toBe("/tmp/workspace");
  });

  it("restores a SessionManager session and verifies summary data", async () => {
    const session = manager.createSession();
    const ws = openLocalWorkspace("/home/user/repo", { branch: "develop" });
    manager.bindWorkspace(session.id, ws);
    manager.updateStage(session.id, "workspace_binding");
    manager.updateStatus(session.id, "active");

    await recent.save(manager.getSession(session.id)!);

    const restored = await recent.restore(session.id);
    expect(restored).not.toBeNull();
    expect(restored!.session.workspace?.path).toBe("/home/user/repo");
    expect(restored!.session.workspace?.branch).toBe("develop");
    expect(restored!.session.stage).toBe("workspace_binding");
    expect(restored!.session.status).toBe("active");
  });

  it("saves session with multiple events and restores timeline", async () => {
    const session = manager.createSession();
    manager.appendEvent(session.id, createEvent("host_detected", "Linux x86_64"));
    manager.appendEvent(session.id, createEvent("workflow_started", "Started"));
    manager.appendEvent(session.id, createEvent("stage_completed", "Stage: detect"));

    const live = manager.getSession(session.id)!;
    await recent.save(live);

    const restored = await recent.restore(session.id);
    expect(restored!.session.events).toHaveLength(live.events.length);
  });
});

/* ================================================================== */
/*  Shell/server persistence bridge                                   */
/* ================================================================== */

describe("server persistence endpoints", () => {
  // Import the server functions for direct testing
  // We test the handler logic indirectly by testing persistence + session manager integration

  let persistence: SessionPersistence;
  let recent: RecentSessions;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "server-persist-test-"));
    persistence = new SessionPersistence(tempDir);
    recent = new RecentSessions(persistence);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("recent sessions endpoint returns empty list initially", async () => {
    const list = await recent.list();
    expect(list).toEqual([]);
  });

  it("save then list returns the saved session", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const list = await recent.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(session.id);
    expect(list[0].status).toBe("completed");
    expect(list[0].stage).toBe("done");
    expect(list[0].workspacePath).toBe("/home/user/project");
    expect(list[0].mcpCount).toBe(1);
    expect(list[0].agentCount).toBe(1);
    expect(list[0].eventCount).toBe(9);
  });

  it("restore endpoint returns classified events and origin", async () => {
    const session = makeRichSession();
    await recent.save(session);

    const restored = await recent.restore(session.id);
    expect(restored!.origin).toBe("restored");
    expect(restored!.session.events.length).toBeGreaterThan(0);

    // Verify each event has the expected structure
    for (const event of restored!.session.events) {
      expect(event).toHaveProperty("kind");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("message");
    }
  });

  it("delete endpoint removes session from list", async () => {
    const s1 = makeSession({ id: "keep-me" });
    const s2 = makeSession({ id: "delete-me" });
    await recent.save(s1);
    await recent.save(s2);

    await recent.delete("delete-me");

    const list = await recent.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("keep-me");
  });

  it("multiple saves and listing preserves metadata fields", async () => {
    const sessions = [
      makeSession({ id: "s1", status: "idle", stage: "initializing" }),
      makeSession({ id: "s2", status: "active", stage: "workflow_running" }),
      makeSession({ id: "s3", status: "completed", stage: "done" }),
    ];

    for (const s of sessions) {
      await recent.save(s);
    }

    const list = await recent.list();
    expect(list).toHaveLength(3);

    // Check metadata fields are present
    for (const meta of list) {
      expect(meta).toHaveProperty("id");
      expect(meta).toHaveProperty("createdAt");
      expect(meta).toHaveProperty("updatedAt");
      expect(meta).toHaveProperty("status");
      expect(meta).toHaveProperty("stage");
      expect(meta).toHaveProperty("workspacePath");
      expect(meta).toHaveProperty("workspaceSource");
      expect(meta).toHaveProperty("lastStage");
      expect(meta).toHaveProperty("agentCount");
      expect(meta).toHaveProperty("mcpCount");
      expect(meta).toHaveProperty("eventCount");
    }
  });
});

/* ================================================================== */
/*  Edge cases                                                        */
/* ================================================================== */

describe("persistence edge cases", () => {
  let persistence: SessionPersistence;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "edge-persist-test-"));
    persistence = new SessionPersistence(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles session with empty events array", async () => {
    const session = makeSession({ events: [] });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.events).toEqual([]);
    expect(loaded!.meta.eventCount).toBe(0);
  });

  it("handles session with many events", async () => {
    const events: SessionEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(createEvent("note", `Event ${i}`, { index: i }));
    }
    const session = makeSession({ events });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.events).toHaveLength(100);
    expect(loaded!.meta.eventCount).toBe(100);
  });

  it("handles workspace with clone URL", async () => {
    const ws = prepareCloneWorkspace("/tmp/clone-target", "https://github.com/user/repo.git", { branch: "main" });
    const session = makeSession({ workspace: ws });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.workspace?.cloneUrl).toBe("https://github.com/user/repo.git");
    expect(loaded!.workspace?.source).toBe("cloned");
  });

  it("handles session IDs with special characters", async () => {
    // Session IDs might contain dashes and numbers
    const session = makeSession({ id: "session-2025-01-01T00-00-00Z-1234" });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.id).toBe(session.id);
  });

  it("handles sequential saves to many sessions", async () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession({ id: `sequential-${i}` }),
    );

    for (const s of sessions) {
      await persistence.saveSession(s);
    }

    const recent = await persistence.listRecentSessions();
    expect(recent).toHaveLength(10);
  });

  it("handles save with blocked status", async () => {
    const session = makeSession({
      status: "blocked",
      stage: "done",
      runContext: {
        workflowStage: "safety",
        workflowStatus: "blocked",
        workflowResultRef: null,
        approvalRequired: false,
        isBlocked: true,
        lastError: "Blocked by safety evaluation",
      },
    });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.meta.status).toBe("blocked");
    expect(loaded!.runContext!.isBlocked).toBe(true);
    expect(loaded!.runContext!.lastError).toBe("Blocked by safety evaluation");
  });

  it("handles save with failed status and error", async () => {
    const session = makeSession({
      status: "failed",
      stage: "done",
      runContext: {
        workflowStage: "detect",
        workflowStatus: "failed",
        workflowResultRef: null,
        approvalRequired: false,
        isBlocked: false,
        lastError: "Detection failed: GPU not accessible",
      },
    });
    await persistence.saveSession(session);

    const loaded = await persistence.loadSession(session.id);
    expect(loaded!.runContext!.lastError).toBe("Detection failed: GPU not accessible");
  });
});
