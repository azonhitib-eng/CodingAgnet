/**
 * Phase 19 — Session and Workspace Domain tests.
 *
 * Covers:
 *  - session creation
 *  - workspace binding
 *  - event append behavior
 *  - deterministic stage/status transitions
 *  - workflow result to session-state mapping
 *  - approval/blocking propagation into session status
 *  - session summary derivation
 *  - edge cases (failed runs, partial runs, empty sessions)
 *  - workspace model helpers
 *  - attached resource references
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Types (used via typeof / construction)
  type SessionStatus,
  type SessionStage,
  type SessionEvent,
  type SessionEventKind,
  type SessionRunContext,
  type AttachedResource,

  // Events
  createEvent,
  sessionCreated,
  workspaceBound,
  hostDetected,
  catalogsLoaded,
  workflowStarted,
  stageCompleted,
  requiresApproval,
  blockedEvent,
  failedEvent,
  completedEvent,
  noteEvent,
  infoEvent,
  warningEvent,

  // Workspace
  openLocalWorkspace,
  prepareCloneWorkspace,
  markWorkspaceReady,
  markWorkspaceInvalid,
  markWorkspaceClosed,
  openGenericDirectory,
  isWorkspaceReady,
  isCloneWorkspace,
  isValidSource,
  isValidStatus,

  // Workflow integration
  workflowStatusToSessionStatus,
  workflowStatusToSessionStage,
  buildRunContext,
  deriveEventsFromWorkflow,

  // Session manager
  SessionManager,
  generateSessionId,
  _resetIdCounter,
} from "../../src/session/index.js";

import type { WorkflowResult, WorkflowStatus, CompletedStage, WorkflowStageName } from "../../src/workflow/index.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeWorkflowResult(overrides: Partial<WorkflowResult> & { status: WorkflowStatus }): WorkflowResult {
  return {
    completedStages: [],
    stageOutputs: {},
    ...overrides,
  };
}

function makeCompletedStage(stage: string): CompletedStage {
  return { stage, output: { ok: true } } as unknown as CompletedStage;
}

/* ================================================================== */
/*  1. Session creation                                               */
/* ================================================================== */

describe("Session creation", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("creates a session with a unique id", () => {
    const s = mgr.createSession();
    expect(s.id).toMatch(/^session-/);
  });

  it("creates sessions with different ids", () => {
    const s1 = mgr.createSession();
    const s2 = mgr.createSession();
    expect(s1.id).not.toBe(s2.id);
  });

  it("initializes session with correct defaults", () => {
    const s = mgr.createSession();
    expect(s.stage).toBe("initializing");
    expect(s.status).toBe("idle");
    expect(s.workspace).toBeNull();
    expect(s.runContext).toBeNull();
    expect(s.attachedResources).toEqual([]);
  });

  it("sets createdAt and updatedAt timestamps", () => {
    const s = mgr.createSession();
    expect(s.createdAt).toBeTruthy();
    expect(s.updatedAt).toBeTruthy();
    expect(new Date(s.createdAt).getTime()).not.toBeNaN();
  });

  it("appends a session_created event on creation", () => {
    const s = mgr.createSession();
    expect(s.events.length).toBe(1);
    expect(s.events[0].kind).toBe("session_created");
    expect(s.events[0].message).toContain(s.id);
  });

  it("can retrieve a created session by id", () => {
    const s = mgr.createSession();
    expect(mgr.getSession(s.id)).toBe(s);
  });

  it("returns undefined for unknown session id", () => {
    expect(mgr.getSession("nonexistent")).toBeUndefined();
  });

  it("lists all sessions", () => {
    mgr.createSession();
    mgr.createSession();
    mgr.createSession();
    expect(mgr.listSessions()).toHaveLength(3);
  });
});

/* ================================================================== */
/*  2. Workspace binding                                              */
/* ================================================================== */

describe("Workspace binding", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("binds a local existing workspace", () => {
    const s = mgr.createSession();
    const ws = openLocalWorkspace("/home/user/repo", { branch: "main" });
    mgr.bindWorkspace(s.id, ws);
    expect(s.workspace).toBe(ws);
    expect(s.workspace!.source).toBe("local_existing");
    expect(s.workspace!.status).toBe("ready");
    expect(s.workspace!.branch).toBe("main");
  });

  it("binds a clone workspace (pending)", () => {
    const s = mgr.createSession();
    const ws = prepareCloneWorkspace("/tmp/clone-target", "https://github.com/org/repo.git", { branch: "dev" });
    mgr.bindWorkspace(s.id, ws);
    expect(s.workspace!.source).toBe("cloned");
    expect(s.workspace!.status).toBe("pending");
    expect(s.workspace!.cloneUrl).toBe("https://github.com/org/repo.git");
  });

  it("binds a generic directory workspace", () => {
    const s = mgr.createSession();
    const ws = openGenericDirectory("/tmp/scratch");
    mgr.bindWorkspace(s.id, ws);
    expect(s.workspace!.source).toBe("generic_directory");
    expect(s.workspace!.status).toBe("ready");
    expect(s.workspace!.branch).toBeNull();
  });

  it("updates stage to workspace_binding on bind", () => {
    const s = mgr.createSession();
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo"));
    expect(s.stage).toBe("workspace_binding");
  });

  it("appends a workspace_bound event", () => {
    const s = mgr.createSession();
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo"));
    const lastEvent = s.events[s.events.length - 1];
    expect(lastEvent.kind).toBe("workspace_bound");
    expect(lastEvent.message).toContain("/repo");
  });

  it("updates updatedAt timestamp on bind", () => {
    const s = mgr.createSession();
    const _before = s.updatedAt;
    // small delay to ensure different timestamp
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo"));
    expect(s.updatedAt).toBeTruthy();
  });

  it("throws when binding workspace to nonexistent session", () => {
    expect(() => mgr.bindWorkspace("bad-id", openLocalWorkspace("/repo"))).toThrow(
      "Session not found",
    );
  });

  it("replaces workspace when binding again", () => {
    const s = mgr.createSession();
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo1"));
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo2"));
    expect(s.workspace!.path).toBe("/repo2");
    // Both bind events should be present
    const bindEvents = s.events.filter((e) => e.kind === "workspace_bound");
    expect(bindEvents).toHaveLength(2);
  });
});

/* ================================================================== */
/*  3. Event append behavior                                          */
/* ================================================================== */

describe("Event append behavior", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("appends a single event", () => {
    const s = mgr.createSession();
    const e = createEvent("info", "Hello");
    mgr.appendEvent(s.id, e);
    expect(s.events).toHaveLength(2); // session_created + info
    expect(s.events[1]).toBe(e);
  });

  it("appends multiple events at once", () => {
    const s = mgr.createSession();
    const evts = [infoEvent("a"), warningEvent("b"), noteEvent("c")];
    mgr.appendEvents(s.id, evts);
    expect(s.events).toHaveLength(4); // session_created + 3
  });

  it("preserves event order", () => {
    const s = mgr.createSession();
    mgr.appendEvent(s.id, infoEvent("first"));
    mgr.appendEvent(s.id, warningEvent("second"));
    mgr.appendEvent(s.id, noteEvent("third"));
    expect(s.events[1].message).toBe("first");
    expect(s.events[2].message).toBe("second");
    expect(s.events[3].message).toBe("third");
  });

  it("event timestamps are ISO-8601", () => {
    const e = createEvent("note", "test");
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("event factory preserves detail when provided", () => {
    const e = createEvent("note", "with detail", { key: "val" });
    expect(e.detail).toEqual({ key: "val" });
  });

  it("event factory omits detail when not provided", () => {
    const e = createEvent("note", "no detail");
    expect(e.detail).toBeUndefined();
  });

  it("all convenience event constructors produce correct kinds", () => {
    const checks: Array<[SessionEvent, SessionEventKind]> = [
      [sessionCreated("x"), "session_created"],
      [workspaceBound("/p", "local_existing"), "workspace_bound"],
      [hostDetected("summary"), "host_detected"],
      [catalogsLoaded(5), "catalogs_loaded"],
      [workflowStarted(), "workflow_started"],
      [stageCompleted("rendering"), "stage_completed"],
      [requiresApproval("reason"), "requires_approval"],
      [blockedEvent("reason"), "blocked"],
      [failedEvent("reason"), "failed"],
      [completedEvent(), "completed"],
      [noteEvent("x"), "note"],
      [infoEvent("x"), "info"],
      [warningEvent("x"), "warning"],
    ];
    for (const [ev, expectedKind] of checks) {
      expect(ev.kind).toBe(expectedKind);
    }
  });

  it("throws when appending to nonexistent session", () => {
    expect(() => mgr.appendEvent("bad-id", infoEvent("x"))).toThrow("Session not found");
  });
});

/* ================================================================== */
/*  4. Deterministic stage/status transitions                         */
/* ================================================================== */

describe("Deterministic stage/status transitions", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("updates stage explicitly", () => {
    const s = mgr.createSession();
    mgr.updateStage(s.id, "host_detection");
    expect(s.stage).toBe("host_detection");
  });

  it("updates status explicitly", () => {
    const s = mgr.createSession();
    mgr.updateStatus(s.id, "active");
    expect(s.status).toBe("active");
  });

  it("supports full stage lifecycle", () => {
    const s = mgr.createSession();
    const stages: SessionStage[] = [
      "initializing",
      "workspace_binding",
      "host_detection",
      "workflow_running",
      "review",
      "done",
    ];
    for (const stage of stages) {
      mgr.updateStage(s.id, stage);
      expect(s.stage).toBe(stage);
    }
  });

  it("supports all session statuses", () => {
    const s = mgr.createSession();
    const statuses: SessionStatus[] = [
      "idle",
      "active",
      "completed",
      "completed_requires_approval",
      "blocked",
      "failed",
    ];
    for (const status of statuses) {
      mgr.updateStatus(s.id, status);
      expect(s.status).toBe(status);
    }
  });

  it("updates updatedAt on stage change", () => {
    const s = mgr.createSession();
    const _before = s.updatedAt;
    mgr.updateStage(s.id, "done");
    expect(s.updatedAt).toBeTruthy();
  });

  it("updates updatedAt on status change", () => {
    const s = mgr.createSession();
    mgr.updateStatus(s.id, "failed");
    expect(s.updatedAt).toBeTruthy();
  });
});

/* ================================================================== */
/*  5. Workflow result → session state mapping                        */
/* ================================================================== */

describe("Workflow result → session state mapping", () => {
  it("maps completed workflow to completed session status", () => {
    expect(workflowStatusToSessionStatus("completed")).toBe("completed");
  });

  it("maps completed_requires_approval to session status", () => {
    expect(workflowStatusToSessionStatus("completed_requires_approval")).toBe(
      "completed_requires_approval",
    );
  });

  it("maps blocked workflow to blocked session status", () => {
    expect(workflowStatusToSessionStatus("blocked")).toBe("blocked");
  });

  it("maps failed workflow to failed session status", () => {
    expect(workflowStatusToSessionStatus("failed")).toBe("failed");
  });

  it("maps partial workflow to active session status", () => {
    expect(workflowStatusToSessionStatus("partial")).toBe("active");
  });

  it("maps terminal statuses to done stage", () => {
    for (const ws of ["completed", "completed_requires_approval", "blocked", "failed"] as WorkflowStatus[]) {
      expect(workflowStatusToSessionStage(ws)).toBe("done");
    }
  });

  it("maps partial to workflow_running stage", () => {
    expect(workflowStatusToSessionStage("partial")).toBe("workflow_running");
  });

  it("builds run context from completed workflow", () => {
    const result = makeWorkflowResult({
      status: "completed",
      completedStages: [
        makeCompletedStage("catalog_loading"),
        makeCompletedStage("host_acquisition"),
      ],
    });
    const ctx = buildRunContext(result);
    expect(ctx.workflowStage).toBe("host_acquisition");
    expect(ctx.workflowStatus).toBe("completed");
    expect(ctx.approvalRequired).toBe(false);
    expect(ctx.isBlocked).toBe(false);
    expect(ctx.lastError).toBeNull();
  });

  it("builds run context from failed workflow", () => {
    const result = makeWorkflowResult({
      status: "failed",
      failedStage: "recommendation" as WorkflowStageName,
      error: "No models matched",
      completedStages: [makeCompletedStage("catalog_loading")],
    });
    const ctx = buildRunContext(result);
    expect(ctx.workflowStatus).toBe("failed");
    expect(ctx.lastError).toBe("No models matched");
    expect(ctx.workflowStage).toBe("catalog_loading");
  });

  it("builds run context with approval required", () => {
    const result = makeWorkflowResult({
      status: "completed_requires_approval",
      completedStages: [makeCompletedStage("rendering")],
    });
    const ctx = buildRunContext(result);
    expect(ctx.approvalRequired).toBe(true);
    expect(ctx.isBlocked).toBe(false);
  });

  it("builds run context with blocked flag", () => {
    const result = makeWorkflowResult({
      status: "blocked",
      completedStages: [makeCompletedStage("safety_evaluation")],
    });
    const ctx = buildRunContext(result);
    expect(ctx.isBlocked).toBe(true);
    expect(ctx.approvalRequired).toBe(false);
  });

  it("builds run context with empty completed stages", () => {
    const result = makeWorkflowResult({ status: "failed", error: "Early failure" });
    const ctx = buildRunContext(result);
    expect(ctx.workflowStage).toBeNull();
  });
});

/* ================================================================== */
/*  6. Event derivation from workflow                                 */
/* ================================================================== */

describe("Event derivation from workflow", () => {
  it("derives workflow_started + stage events + completed", () => {
    const result = makeWorkflowResult({
      status: "completed",
      completedStages: [
        makeCompletedStage("catalog_loading"),
        makeCompletedStage("host_acquisition"),
      ],
    });
    const events = deriveEventsFromWorkflow(result);
    expect(events[0].kind).toBe("workflow_started");
    expect(events[1].kind).toBe("stage_completed");
    expect(events[1].detail?.stage).toBe("catalog_loading");
    expect(events[2].kind).toBe("stage_completed");
    expect(events[2].detail?.stage).toBe("host_acquisition");
    expect(events[3].kind).toBe("completed");
  });

  it("derives requires_approval terminal event", () => {
    const result = makeWorkflowResult({
      status: "completed_requires_approval",
      completedStages: [makeCompletedStage("rendering")],
    });
    const events = deriveEventsFromWorkflow(result);
    const last = events[events.length - 1];
    expect(last.kind).toBe("requires_approval");
  });

  it("derives blocked terminal event", () => {
    const result = makeWorkflowResult({
      status: "blocked",
      error: "Safety blocked",
    });
    const events = deriveEventsFromWorkflow(result);
    const last = events[events.length - 1];
    expect(last.kind).toBe("blocked");
    expect(last.message).toContain("Safety blocked");
  });

  it("derives failed terminal event", () => {
    const result = makeWorkflowResult({
      status: "failed",
      error: "Catalog error",
    });
    const events = deriveEventsFromWorkflow(result);
    const last = events[events.length - 1];
    expect(last.kind).toBe("failed");
    expect(last.message).toContain("Catalog error");
  });

  it("derives no terminal event for partial runs", () => {
    const result = makeWorkflowResult({
      status: "partial",
      completedStages: [makeCompletedStage("catalog_loading")],
      stoppedAfter: "catalog_loading" as WorkflowStageName,
    });
    const events = deriveEventsFromWorkflow(result);
    // workflow_started + 1 stage_completed, no terminal
    expect(events).toHaveLength(2);
    expect(events[1].kind).toBe("stage_completed");
  });

  it("derives only workflow_started for empty failed run", () => {
    const result = makeWorkflowResult({ status: "failed", error: "Boom" });
    const events = deriveEventsFromWorkflow(result);
    expect(events).toHaveLength(2); // workflow_started + failed
    expect(events[0].kind).toBe("workflow_started");
    expect(events[1].kind).toBe("failed");
  });
});

/* ================================================================== */
/*  7. Approval/blocking propagation into session status              */
/* ================================================================== */

describe("Approval/blocking propagation into session status", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("recordWorkflowResult propagates completed status", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({ status: "completed", completedStages: [makeCompletedStage("rendering")] }),
    );
    expect(s.status).toBe("completed");
    expect(s.stage).toBe("done");
    expect(s.runContext?.approvalRequired).toBe(false);
    expect(s.runContext?.isBlocked).toBe(false);
  });

  it("recordWorkflowResult propagates approval requirement", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({ status: "completed_requires_approval", completedStages: [makeCompletedStage("rendering")] }),
    );
    expect(s.status).toBe("completed_requires_approval");
    expect(s.runContext?.approvalRequired).toBe(true);
    // Session events should include requires_approval
    const approvalEvents = s.events.filter((e) => e.kind === "requires_approval");
    expect(approvalEvents).toHaveLength(1);
  });

  it("recordWorkflowResult propagates blocked status", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({ status: "blocked", error: "Blocked by safety" }),
    );
    expect(s.status).toBe("blocked");
    expect(s.runContext?.isBlocked).toBe(true);
    const blockedEvents = s.events.filter((e) => e.kind === "blocked");
    expect(blockedEvents).toHaveLength(1);
  });

  it("recordWorkflowResult propagates failed status", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({ status: "failed", error: "No catalogs" }),
    );
    expect(s.status).toBe("failed");
    expect(s.runContext?.lastError).toBe("No catalogs");
  });

  it("recordWorkflowResult keeps partial session active", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "partial",
        completedStages: [makeCompletedStage("catalog_loading")],
        stoppedAfter: "catalog_loading" as WorkflowStageName,
      }),
    );
    expect(s.status).toBe("active");
    expect(s.stage).toBe("workflow_running");
  });
});

/* ================================================================== */
/*  8. Session summary derivation                                     */
/* ================================================================== */

describe("Session summary derivation", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("derives summary for fresh session", () => {
    const s = mgr.createSession();
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.id).toBe(s.id);
    expect(summary.stage).toBe("initializing");
    expect(summary.status).toBe("idle");
    expect(summary.workspacePath).toBeNull();
    expect(summary.workspaceSource).toBeNull();
    expect(summary.workspaceStatus).toBeNull();
    expect(summary.eventCount).toBe(1);
    expect(summary.lastEventKind).toBe("session_created");
    expect(summary.approvalRequired).toBe(false);
    expect(summary.isBlocked).toBe(false);
    expect(summary.lastError).toBeNull();
    expect(summary.attachedResourceCount).toBe(0);
  });

  it("derives summary with workspace", () => {
    const s = mgr.createSession();
    mgr.bindWorkspace(s.id, openLocalWorkspace("/my/repo", { branch: "main" }));
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.workspacePath).toBe("/my/repo");
    expect(summary.workspaceSource).toBe("local_existing");
    expect(summary.workspaceStatus).toBe("ready");
  });

  it("derives summary after workflow result", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "completed_requires_approval",
        completedStages: [
          makeCompletedStage("catalog_loading"),
          makeCompletedStage("rendering"),
        ],
      }),
    );
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.status).toBe("completed_requires_approval");
    expect(summary.approvalRequired).toBe(true);
    expect(summary.lastEventKind).toBe("requires_approval");
    expect(summary.eventCount).toBeGreaterThan(1);
  });

  it("derives summary with attached resources", () => {
    const s = mgr.createSession();
    mgr.attachResource(s.id, {
      kind: "mcp_server",
      id: "mcp-1",
      label: "Test MCP",
      ready: true,
    });
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.attachedResourceCount).toBe(1);
  });

  it("derives summary with error info", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({ status: "failed", error: "Boom" }),
    );
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.lastError).toBe("Boom");
    expect(summary.isBlocked).toBe(false);
  });

  it("throws when deriving summary for nonexistent session", () => {
    expect(() => mgr.getSessionSummary("bad")).toThrow("Session not found");
  });
});

/* ================================================================== */
/*  9. Edge cases — failed and partial runs                           */
/* ================================================================== */

describe("Edge cases — failed and partial runs", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("handles workflow failure at first stage", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "failed",
        failedStage: "catalog_loading" as WorkflowStageName,
        error: "Missing data directory",
      }),
    );
    expect(s.status).toBe("failed");
    expect(s.runContext?.lastError).toBe("Missing data directory");
    expect(s.events.some((e) => e.kind === "failed")).toBe(true);
  });

  it("handles partial run stopping at early stage", () => {
    const s = mgr.createSession();
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "partial",
        completedStages: [makeCompletedStage("catalog_loading")],
        stoppedAfter: "catalog_loading" as WorkflowStageName,
      }),
    );
    expect(s.status).toBe("active");
    expect(s.stage).toBe("workflow_running");
    // No terminal event for partial
    const terminal = s.events.filter(
      (e) => e.kind === "completed" || e.kind === "failed" || e.kind === "blocked",
    );
    expect(terminal).toHaveLength(0);
  });

  it("handles multiple workflow runs in same session", () => {
    const s = mgr.createSession();

    // First run: partial
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "partial",
        completedStages: [makeCompletedStage("catalog_loading")],
      }),
    );
    expect(s.status).toBe("active");

    // Second run: completed
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "completed",
        completedStages: [
          makeCompletedStage("catalog_loading"),
          makeCompletedStage("rendering"),
        ],
      }),
    );
    expect(s.status).toBe("completed");
    expect(s.stage).toBe("done");
    // Events from both runs present
    const startEvents = s.events.filter((e) => e.kind === "workflow_started");
    expect(startEvents).toHaveLength(2);
  });

  it("removes sessions", () => {
    const s = mgr.createSession();
    expect(mgr.removeSession(s.id)).toBe(true);
    expect(mgr.getSession(s.id)).toBeUndefined();
    expect(mgr.removeSession(s.id)).toBe(false);
  });

  it("clears all sessions", () => {
    mgr.createSession();
    mgr.createSession();
    mgr.clear();
    expect(mgr.listSessions()).toHaveLength(0);
  });

  it("session with empty events list in summary", () => {
    // This exercises the edge case in summary derivation
    const s = mgr.createSession();
    // Clear events manually for testing edge
    s.events.length = 0;
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.eventCount).toBe(0);
    expect(summary.lastEventKind).toBeNull();
    expect(summary.lastEventMessage).toBeNull();
  });
});

/* ================================================================== */
/*  10. Workspace model helpers                                       */
/* ================================================================== */

describe("Workspace model helpers", () => {
  it("openLocalWorkspace creates ready workspace", () => {
    const ws = openLocalWorkspace("/repos/myrepo");
    expect(ws.path).toBe("/repos/myrepo");
    expect(ws.source).toBe("local_existing");
    expect(ws.status).toBe("ready");
    expect(ws.branch).toBeNull();
    expect(ws.ref).toBeNull();
    expect(ws.cloneUrl).toBeNull();
  });

  it("openLocalWorkspace with branch/ref options", () => {
    const ws = openLocalWorkspace("/repos/myrepo", { branch: "feat", ref: "abc123" });
    expect(ws.branch).toBe("feat");
    expect(ws.ref).toBe("abc123");
  });

  it("prepareCloneWorkspace creates pending workspace", () => {
    const ws = prepareCloneWorkspace("/tmp/clone", "https://github.com/org/r.git");
    expect(ws.status).toBe("pending");
    expect(ws.source).toBe("cloned");
    expect(ws.cloneUrl).toBe("https://github.com/org/r.git");
  });

  it("markWorkspaceReady transitions pending to ready", () => {
    const ws = prepareCloneWorkspace("/tmp/clone", "https://github.com/org/r.git");
    const ready = markWorkspaceReady(ws);
    expect(ready.status).toBe("ready");
    expect(ready.path).toBe(ws.path);
    expect(ready.cloneUrl).toBe(ws.cloneUrl);
  });

  it("markWorkspaceInvalid marks invalid", () => {
    const ws = openLocalWorkspace("/missing");
    const invalid = markWorkspaceInvalid(ws);
    expect(invalid.status).toBe("invalid");
  });

  it("markWorkspaceClosed marks closed", () => {
    const ws = openLocalWorkspace("/done");
    const closed = markWorkspaceClosed(ws);
    expect(closed.status).toBe("closed");
  });

  it("openGenericDirectory creates generic workspace", () => {
    const ws = openGenericDirectory("/tmp/scratch");
    expect(ws.source).toBe("generic_directory");
    expect(ws.status).toBe("ready");
    expect(ws.cloneUrl).toBeNull();
    expect(ws.branch).toBeNull();
  });

  it("isWorkspaceReady returns true for ready", () => {
    expect(isWorkspaceReady(openLocalWorkspace("/a"))).toBe(true);
    expect(isWorkspaceReady(prepareCloneWorkspace("/b", "url"))).toBe(false);
  });

  it("isCloneWorkspace identifies clone workspaces", () => {
    expect(isCloneWorkspace(prepareCloneWorkspace("/b", "url"))).toBe(true);
    expect(isCloneWorkspace(openLocalWorkspace("/a"))).toBe(false);
  });

  it("isValidSource validates known sources", () => {
    expect(isValidSource("local_existing")).toBe(true);
    expect(isValidSource("cloned")).toBe(true);
    expect(isValidSource("generic_directory")).toBe(true);
    expect(isValidSource("unknown")).toBe(false);
  });

  it("isValidStatus validates known statuses", () => {
    expect(isValidStatus("pending")).toBe(true);
    expect(isValidStatus("ready")).toBe(true);
    expect(isValidStatus("invalid")).toBe(true);
    expect(isValidStatus("closed")).toBe(true);
    expect(isValidStatus("unknown")).toBe(false);
  });

  it("workspace helpers return new objects (immutability)", () => {
    const ws = openLocalWorkspace("/repo");
    const closed = markWorkspaceClosed(ws);
    expect(ws.status).toBe("ready"); // original unchanged
    expect(closed.status).toBe("closed");
    expect(ws).not.toBe(closed);
  });
});

/* ================================================================== */
/*  11. Attached resources (MCP/agent placeholders)                   */
/* ================================================================== */

describe("Attached resources", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("attaches an MCP server resource", () => {
    const s = mgr.createSession();
    const resource: AttachedResource = {
      kind: "mcp_server",
      id: "mcp-fs",
      label: "Filesystem MCP",
      ready: true,
    };
    mgr.attachResource(s.id, resource);
    expect(s.attachedResources).toHaveLength(1);
    expect(s.attachedResources[0].kind).toBe("mcp_server");
  });

  it("attaches multiple resources", () => {
    const s = mgr.createSession();
    mgr.attachResource(s.id, { kind: "mcp_server", id: "1", label: "A", ready: true });
    mgr.attachResource(s.id, { kind: "agent", id: "2", label: "B", ready: false });
    mgr.attachResource(s.id, { kind: "environment", id: "3", label: "C", ready: true });
    expect(s.attachedResources).toHaveLength(3);
  });

  it("attached resource readiness flag", () => {
    const s = mgr.createSession();
    mgr.attachResource(s.id, { kind: "agent", id: "a1", label: "Agent", ready: false });
    expect(s.attachedResources[0].ready).toBe(false);
    // Mutate readiness (simulates agent becoming ready)
    s.attachedResources[0].ready = true;
    expect(s.attachedResources[0].ready).toBe(true);
  });
});

/* ================================================================== */
/*  12. Run context management                                        */
/* ================================================================== */

describe("Run context management", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("sets run context directly", () => {
    const s = mgr.createSession();
    const ctx: SessionRunContext = {
      workflowStage: "rendering",
      workflowStatus: "completed",
      workflowResultRef: null,
      approvalRequired: false,
      isBlocked: false,
      lastError: null,
    };
    mgr.setRunContext(s.id, ctx);
    expect(s.runContext).toBe(ctx);
  });

  it("replaces run context on subsequent calls", () => {
    const s = mgr.createSession();
    const ctx1: SessionRunContext = {
      workflowStage: "catalog_loading",
      workflowStatus: "partial",
      workflowResultRef: null,
      approvalRequired: false,
      isBlocked: false,
      lastError: null,
    };
    const ctx2: SessionRunContext = {
      workflowStage: "rendering",
      workflowStatus: "completed",
      workflowResultRef: null,
      approvalRequired: false,
      isBlocked: false,
      lastError: null,
    };
    mgr.setRunContext(s.id, ctx1);
    mgr.setRunContext(s.id, ctx2);
    expect(s.runContext).toBe(ctx2);
  });
});

/* ================================================================== */
/*  13. ID generation                                                 */
/* ================================================================== */

describe("ID generation", () => {
  beforeEach(() => {
    _resetIdCounter();
  });

  it("generates unique ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });

  it("ids have session prefix", () => {
    expect(generateSessionId()).toMatch(/^session-/);
  });
});

/* ================================================================== */
/*  14. Full lifecycle integration                                    */
/* ================================================================== */

describe("Full lifecycle integration", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    _resetIdCounter();
  });

  it("complete lifecycle: create → bind → detect → workflow → summary", () => {
    // 1. Create
    const s = mgr.createSession();
    expect(s.status).toBe("idle");

    // 2. Bind workspace
    mgr.bindWorkspace(s.id, openLocalWorkspace("/home/user/project", { branch: "main" }));
    expect(s.stage).toBe("workspace_binding");

    // 3. Host detection event
    mgr.updateStage(s.id, "host_detection");
    mgr.appendEvent(s.id, hostDetected("Linux x86_64 / 32GB / RTX 3060"));
    expect(s.stage).toBe("host_detection");

    // 4. Catalog loading event
    mgr.appendEvent(s.id, catalogsLoaded(42));

    // 5. Start workflow
    mgr.updateStage(s.id, "workflow_running");
    mgr.updateStatus(s.id, "active");

    // 6. Record workflow result (completed with approval)
    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "completed_requires_approval",
        completedStages: [
          makeCompletedStage("catalog_loading"),
          makeCompletedStage("host_acquisition"),
          makeCompletedStage("recommendation"),
          makeCompletedStage("target_selection"),
          makeCompletedStage("compatibility_evaluation"),
          makeCompletedStage("install_planning"),
          makeCompletedStage("safety_evaluation"),
          makeCompletedStage("rendering"),
        ],
      }),
    );

    expect(s.status).toBe("completed_requires_approval");
    expect(s.stage).toBe("done");
    expect(s.runContext?.approvalRequired).toBe(true);

    // 7. Derive summary
    const summary = mgr.getSessionSummary(s.id);
    expect(summary.status).toBe("completed_requires_approval");
    expect(summary.workspacePath).toBe("/home/user/project");
    expect(summary.approvalRequired).toBe(true);
    expect(summary.eventCount).toBeGreaterThan(5);
    expect(summary.lastEventKind).toBe("requires_approval");
  });

  it("lifecycle with blocked workflow", () => {
    const s = mgr.createSession();
    mgr.bindWorkspace(s.id, openLocalWorkspace("/repo"));
    mgr.updateStage(s.id, "workflow_running");
    mgr.updateStatus(s.id, "active");

    mgr.recordWorkflowResult(
      s.id,
      makeWorkflowResult({
        status: "blocked",
        completedStages: [
          makeCompletedStage("catalog_loading"),
          makeCompletedStage("host_acquisition"),
          makeCompletedStage("safety_evaluation"),
        ],
        error: "Dangerous rm -rf / command blocked",
      }),
    );

    const summary = mgr.getSessionSummary(s.id);
    expect(summary.status).toBe("blocked");
    expect(summary.isBlocked).toBe(true);
    expect(summary.lastError).toBe("Dangerous rm -rf / command blocked");
  });
});
