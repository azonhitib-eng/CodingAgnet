/**
 * Phase 24 — Chat-like Session Console tests.
 *
 * Covers:
 * - Console helper functions (actor, card, grouping, presence, feed)
 * - Mixed event feed rendering in views.ts HTML output
 * - Actor/source styling distinctions
 * - Approval/blocked/failure cards
 * - Agent and MCP event visibility
 * - Workspace open/clone event visibility
 * - Demo and real mode coherence
 * - Detail view accessibility from console structure
 * - Console feed API endpoint
 * - Filter functionality
 */

import { describe, it, expect } from "vitest";
import {
  classifyActor,
  actorLabel,
  actorIcon,
  actorCssClass,
  classifyCard,
  cardCssClass,
  toConsoleMessage,
  groupMessages,
  buildPresence,
  buildConsoleFeed,
  buildDemoConsoleFeed,
  filterByActor,
  CONSOLE_FILTERS,
  type ConsoleActor,
  type ConsoleCardType,
  type ConsoleMessage,
  type ConsoleMessageGroup as _ConsoleMessageGroup,
  type ConsoleFeed as _ConsoleFeed,
} from "../../src/app-shell/console-helpers.js";

import { classifyEvent } from "../../src/app-shell/timeline-helpers.js";
import { renderShellHtml } from "../../src/app-shell/views.js";
import { handleRequest, getWorkspaceSessionManager } from "../../src/app-shell/server.js";
import type { IncomingMessage, ServerResponse } from "node:http";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                      */
/* ------------------------------------------------------------------ */

function makeEvent(
  kind: string,
  message: string,
  offsetMs: number,
  detail?: Record<string, unknown>,
) {
  const base = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    kind,
    timestamp: new Date(base + offsetMs).toISOString(),
    message,
    category: classifyEvent(kind),
    ...(detail !== undefined ? { detail } : {}),
  };
}

function makeConsoleMsg(
  kind: string,
  message: string,
  offsetMs: number,
  detail?: Record<string, unknown>,
): ConsoleMessage {
  return toConsoleMessage(makeEvent(kind, message, offsetMs, detail));
}

/* ------------------------------------------------------------------ */
/*  1. Actor classification                                           */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Actor classification", () => {
  it("classifies system events", () => {
    expect(classifyActor("session_created")).toBe("system");
    expect(classifyActor("note")).toBe("system");
    expect(classifyActor("info")).toBe("system");
    expect(classifyActor("warning")).toBe("system");
  });

  it("classifies workspace events", () => {
    expect(classifyActor("workspace_bound")).toBe("workspace");
    expect(classifyActor("workspace_opened")).toBe("workspace");
    expect(classifyActor("workspace_invalid")).toBe("workspace");
    expect(classifyActor("clone_requested")).toBe("workspace");
    expect(classifyActor("clone_started")).toBe("workspace");
    expect(classifyActor("clone_completed")).toBe("workspace");
    expect(classifyActor("clone_failed")).toBe("workspace");
    expect(classifyActor("workspace_ready")).toBe("workspace");
  });

  it("classifies MCP events", () => {
    expect(classifyActor("mcp_attach_requested")).toBe("mcp");
    expect(classifyActor("mcp_attached")).toBe("mcp");
    expect(classifyActor("mcp_starting")).toBe("mcp");
    expect(classifyActor("mcp_started")).toBe("mcp");
    expect(classifyActor("mcp_failed")).toBe("mcp");
    expect(classifyActor("mcp_stopped")).toBe("mcp");
    expect(classifyActor("mcp_discovered_tools")).toBe("mcp");
    expect(classifyActor("mcp_discovered_resources")).toBe("mcp");
    expect(classifyActor("mcp_discovered_prompts")).toBe("mcp");
  });

  it("classifies agent events", () => {
    expect(classifyActor("agent_attach_requested")).toBe("agent");
    expect(classifyActor("agent_attached")).toBe("agent");
    expect(classifyActor("agent_detached")).toBe("agent");
    expect(classifyActor("agent_enabled")).toBe("agent");
    expect(classifyActor("agent_disabled")).toBe("agent");
    expect(classifyActor("agent_failed")).toBe("agent");
    expect(classifyActor("agent_capabilities_updated")).toBe("agent");
  });

  it("classifies workflow events", () => {
    expect(classifyActor("catalogs_loaded")).toBe("workflow");
    expect(classifyActor("host_detected")).toBe("workflow");
    expect(classifyActor("workflow_started")).toBe("workflow");
    expect(classifyActor("stage_completed")).toBe("workflow");
    expect(classifyActor("requires_approval")).toBe("workflow");
    expect(classifyActor("blocked")).toBe("workflow");
    expect(classifyActor("failed")).toBe("workflow");
    expect(classifyActor("completed")).toBe("workflow");
  });

  it("defaults unknown kinds to system", () => {
    expect(classifyActor("unknown_event")).toBe("system");
    expect(classifyActor("")).toBe("system");
  });

  it("provides labels for all actors", () => {
    const actors: ConsoleActor[] = ["system", "workspace", "mcp", "agent", "workflow"];
    for (const actor of actors) {
      expect(actorLabel(actor)).toBeTruthy();
      expect(typeof actorLabel(actor)).toBe("string");
    }
  });

  it("provides icons for all actors", () => {
    const actors: ConsoleActor[] = ["system", "workspace", "mcp", "agent", "workflow"];
    for (const actor of actors) {
      expect(actorIcon(actor)).toBeTruthy();
    }
  });

  it("provides CSS classes for all actors", () => {
    const actors: ConsoleActor[] = ["system", "workspace", "mcp", "agent", "workflow"];
    for (const actor of actors) {
      expect(actorCssClass(actor)).toMatch(/^actor-/);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  2. Card type classification                                       */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Card type classification", () => {
  it("classifies approval cards", () => {
    expect(classifyCard("requires_approval")).toBe("approval_card");
  });

  it("classifies blocked cards", () => {
    expect(classifyCard("blocked")).toBe("blocked_card");
  });

  it("classifies failure cards", () => {
    expect(classifyCard("failed")).toBe("failure_card");
    expect(classifyCard("workspace_invalid")).toBe("failure_card");
    expect(classifyCard("clone_failed")).toBe("failure_card");
    expect(classifyCard("mcp_failed")).toBe("failure_card");
    expect(classifyCard("agent_failed")).toBe("failure_card");
  });

  it("classifies success cards", () => {
    expect(classifyCard("completed")).toBe("success_card");
    expect(classifyCard("clone_completed")).toBe("success_card");
    expect(classifyCard("workspace_ready")).toBe("success_card");
  });

  it("classifies lifecycle cards", () => {
    expect(classifyCard("workspace_opened")).toBe("lifecycle_card");
    expect(classifyCard("mcp_attached")).toBe("lifecycle_card");
    expect(classifyCard("mcp_started")).toBe("lifecycle_card");
    expect(classifyCard("mcp_stopped")).toBe("lifecycle_card");
    expect(classifyCard("agent_attached")).toBe("lifecycle_card");
    expect(classifyCard("agent_enabled")).toBe("lifecycle_card");
  });

  it("classifies discovery cards", () => {
    expect(classifyCard("mcp_discovered_tools")).toBe("discovery_card");
    expect(classifyCard("mcp_discovered_resources")).toBe("discovery_card");
    expect(classifyCard("mcp_discovered_prompts")).toBe("discovery_card");
    expect(classifyCard("agent_capabilities_updated")).toBe("discovery_card");
  });

  it("defaults to message for normal events", () => {
    expect(classifyCard("session_created")).toBe("message");
    expect(classifyCard("stage_completed")).toBe("message");
    expect(classifyCard("info")).toBe("message");
  });

  it("provides CSS classes for all card types", () => {
    const types: ConsoleCardType[] = [
      "message",
      "approval_card",
      "blocked_card",
      "failure_card",
      "success_card",
      "lifecycle_card",
      "discovery_card",
    ];
    for (const t of types) {
      expect(cardCssClass(t)).toMatch(/^console-/);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  3. Console message enrichment                                     */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Console message enrichment", () => {
  it("enriches a classified event into a console message", () => {
    const event = makeEvent("session_created", "Session created", 0);
    const msg = toConsoleMessage(event);
    expect(msg.kind).toBe("session_created");
    expect(msg.message).toBe("Session created");
    expect(msg.category).toBe("info");
    expect(msg.actor).toBe("system");
    expect(msg.cardType).toBe("message");
  });

  it("preserves detail when present", () => {
    const event = makeEvent("mcp_started", "MCP started", 0, { pid: 1234 });
    const msg = toConsoleMessage(event);
    expect(msg.detail).toEqual({ pid: 1234 });
  });

  it("omits detail when not present", () => {
    const event = makeEvent("note", "Hello", 0);
    const msg = toConsoleMessage(event);
    expect(msg.detail).toBeUndefined();
  });

  it("assigns correct actor and card type for MCP failure", () => {
    const event = makeEvent("mcp_failed", "MCP crashed", 0, { error: "timeout" });
    const msg = toConsoleMessage(event);
    expect(msg.actor).toBe("mcp");
    expect(msg.cardType).toBe("failure_card");
    expect(msg.category).toBe("failure");
  });

  it("assigns correct actor and card type for approval", () => {
    const event = makeEvent("requires_approval", "Needs approval", 0);
    const msg = toConsoleMessage(event);
    expect(msg.actor).toBe("workflow");
    expect(msg.cardType).toBe("approval_card");
    expect(msg.category).toBe("warning");
  });
});

/* ------------------------------------------------------------------ */
/*  4. Message grouping                                               */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Message grouping", () => {
  it("returns empty array for empty input", () => {
    expect(groupMessages([])).toEqual([]);
  });

  it("groups single message into one group", () => {
    const msgs = [makeConsoleMsg("session_created", "Created", 0)];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].actor).toBe("system");
    expect(groups[0].messages).toHaveLength(1);
  });

  it("groups consecutive same-actor messages within time window", () => {
    const msgs = [
      makeConsoleMsg("workspace_bound", "Bound", 0),
      makeConsoleMsg("workspace_opened", "Opened", 100),
      makeConsoleMsg("workspace_ready", "Ready", 200),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].actor).toBe("workspace");
    expect(groups[0].messages).toHaveLength(3);
  });

  it("splits groups when actor changes", () => {
    const msgs = [
      makeConsoleMsg("session_created", "Created", 0),
      makeConsoleMsg("workspace_bound", "Bound", 100),
      makeConsoleMsg("catalogs_loaded", "Loaded", 200),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(3);
    expect(groups[0].actor).toBe("system");
    expect(groups[1].actor).toBe("workspace");
    expect(groups[2].actor).toBe("workflow");
  });

  it("splits groups when time gap exceeds window", () => {
    const msgs = [
      makeConsoleMsg("session_created", "Created", 0),
      makeConsoleMsg("note", "Later note", 60_000), // 60s gap, exceeds 30s default
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
  });

  it("respects custom window size", () => {
    const msgs = [
      makeConsoleMsg("session_created", "Created", 0),
      makeConsoleMsg("note", "Soon after", 5_000),
    ];
    // With very small window (1ms), should split
    const groups = groupMessages(msgs, 1);
    expect(groups).toHaveLength(2);
  });

  it("groups MCP events together", () => {
    const msgs = [
      makeConsoleMsg("mcp_attach_requested", "Attach req", 0),
      makeConsoleMsg("mcp_attached", "Attached", 50),
      makeConsoleMsg("mcp_started", "Started", 100),
      makeConsoleMsg("mcp_discovered_tools", "Tools", 150),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].actor).toBe("mcp");
    expect(groups[0].messages).toHaveLength(4);
  });

  it("groups agent events together", () => {
    const msgs = [
      makeConsoleMsg("agent_attach_requested", "Attach req", 0),
      makeConsoleMsg("agent_attached", "Attached", 50),
      makeConsoleMsg("agent_enabled", "Enabled", 100),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].actor).toBe("agent");
    expect(groups[0].messages).toHaveLength(3);
  });

  it("produces correct start/end timestamps", () => {
    const msgs = [
      makeConsoleMsg("session_created", "Created", 0),
      makeConsoleMsg("note", "Note 1", 1_000),
      makeConsoleMsg("info", "Info 1", 2_000),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0].startTimestamp).toBe(msgs[0].timestamp);
    expect(groups[0].endTimestamp).toBe(msgs[2].timestamp);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Presence summary                                               */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Presence summary", () => {
  it("builds presence from minimal summary", () => {
    const presence = buildPresence({});
    expect(presence.sessionStage).toBe("initializing");
    expect(presence.sessionStatus).toBe("idle");
    expect(presence.workspaceStatus).toBeNull();
    expect(presence.mcpServers).toEqual([]);
    expect(presence.agents).toEqual([]);
    expect(presence.approvalRequired).toBe(false);
    expect(presence.isBlocked).toBe(false);
    expect(presence.lastSignificantAction).toBeNull();
  });

  it("builds presence from rich summary", () => {
    const presence = buildPresence({
      stage: "review",
      status: "completed_requires_approval",
      workspaceStatus: "ready",
      workspacePath: "/my/project",
      mcpServers: [{ id: "srv1", label: "Server One", ready: true }],
      agents: [{ id: "agt1", label: "Agent One", ready: false }],
      approvalRequired: true,
      isBlocked: false,
      lastEventMessage: "Needs approval",
    });
    expect(presence.sessionStage).toBe("review");
    expect(presence.sessionStatus).toBe("completed_requires_approval");
    expect(presence.workspaceStatus).toBe("ready");
    expect(presence.workspacePath).toBe("/my/project");
    expect(presence.mcpServers).toHaveLength(1);
    expect(presence.mcpServers[0].label).toBe("Server One");
    expect(presence.agents).toHaveLength(1);
    expect(presence.agents[0].ready).toBe(false);
    expect(presence.approvalRequired).toBe(true);
    expect(presence.lastSignificantAction).toBe("Needs approval");
  });

  it("maps MCP servers with correct kind", () => {
    const presence = buildPresence({
      mcpServers: [{ id: "s1", label: "S1", ready: true }],
    });
    expect(presence.mcpServers[0].kind).toBe("mcp_server");
  });

  it("maps agents with correct kind", () => {
    const presence = buildPresence({
      agents: [{ id: "a1", label: "A1", ready: true }],
    });
    expect(presence.agents[0].kind).toBe("agent");
  });
});

/* ------------------------------------------------------------------ */
/*  6. Console feed builder                                           */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Console feed builder", () => {
  it("builds a complete console feed", () => {
    const events = [
      makeEvent("session_created", "Created", 0),
      makeEvent("workspace_bound", "Bound", 100),
      makeEvent("workflow_started", "Started", 200),
      makeEvent("completed", "Done", 300),
    ];
    const summary = { stage: "done", status: "completed" };
    const feed = buildConsoleFeed("test-session", events, summary);

    expect(feed.sessionId).toBe("test-session");
    expect(feed.messages).toHaveLength(4);
    expect(feed.groups.length).toBeGreaterThanOrEqual(1);
    expect(feed.presence.sessionStage).toBe("done");
    expect(feed.presence.sessionStatus).toBe("completed");
  });

  it("enriches all messages with actor and card type", () => {
    const events = [
      makeEvent("mcp_failed", "Failed", 0, { error: "timeout" }),
      makeEvent("agent_enabled", "Enabled", 100),
      makeEvent("requires_approval", "Needs approval", 200),
    ];
    const feed = buildConsoleFeed("test", events, {});

    expect(feed.messages[0].actor).toBe("mcp");
    expect(feed.messages[0].cardType).toBe("failure_card");
    expect(feed.messages[1].actor).toBe("agent");
    expect(feed.messages[1].cardType).toBe("lifecycle_card");
    expect(feed.messages[2].actor).toBe("workflow");
    expect(feed.messages[2].cardType).toBe("approval_card");
  });
});

/* ------------------------------------------------------------------ */
/*  7. Demo console feed                                              */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Demo console feed", () => {
  it("builds a demo console feed with all event types", () => {
    const feed = buildDemoConsoleFeed("test-scenario", "completed");

    expect(feed.sessionId).toBe("demo-test-scenario");
    expect(feed.messages.length).toBeGreaterThan(15);
    expect(feed.groups.length).toBeGreaterThanOrEqual(1);
    expect(feed.presence.sessionStage).toBe("done");
    expect(feed.presence.sessionStatus).toBe("completed");
  });

  it("includes workspace events", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const workspaceMessages = feed.messages.filter((m) => m.actor === "workspace");
    expect(workspaceMessages.length).toBeGreaterThanOrEqual(2);
  });

  it("includes MCP events", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const mcpMessages = feed.messages.filter((m) => m.actor === "mcp");
    expect(mcpMessages.length).toBeGreaterThanOrEqual(3);
  });

  it("includes agent events", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const agentMessages = feed.messages.filter((m) => m.actor === "agent");
    expect(agentMessages.length).toBeGreaterThanOrEqual(3);
  });

  it("includes workflow events", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const workflowMessages = feed.messages.filter((m) => m.actor === "workflow");
    expect(workflowMessages.length).toBeGreaterThanOrEqual(3);
  });

  it("includes MCP servers in presence", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    expect(feed.presence.mcpServers).toHaveLength(1);
    expect(feed.presence.mcpServers[0].label).toBe("code-assistant");
  });

  it("includes agents in presence", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    expect(feed.presence.agents).toHaveLength(1);
    expect(feed.presence.agents[0].label).toBe("copilot-agent");
  });

  it("reflects approval status for approval workflow", () => {
    const feed = buildDemoConsoleFeed("test", "completed_requires_approval");
    expect(feed.presence.approvalRequired).toBe(true);
    expect(feed.presence.isBlocked).toBe(false);
    const approvalMsgs = feed.messages.filter((m) => m.cardType === "approval_card");
    expect(approvalMsgs.length).toBe(1);
  });

  it("reflects blocked status for blocked workflow", () => {
    const feed = buildDemoConsoleFeed("test", "blocked");
    expect(feed.presence.isBlocked).toBe(true);
    const blockedMsgs = feed.messages.filter((m) => m.cardType === "blocked_card");
    expect(blockedMsgs.length).toBe(1);
  });

  it("reflects failed status for failed workflow", () => {
    const feed = buildDemoConsoleFeed("test", "failed");
    expect(feed.presence.sessionStatus).toBe("failed");
    const failMsgs = feed.messages.filter((m) => m.cardType === "failure_card");
    expect(failMsgs.length).toBe(1);
  });

  it("includes success card for completed workflow", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const successMsgs = feed.messages.filter((m) => m.cardType === "success_card");
    expect(successMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it("includes lifecycle cards for MCP/agent attach", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const lifecycleMsgs = feed.messages.filter((m) => m.cardType === "lifecycle_card");
    expect(lifecycleMsgs.length).toBeGreaterThanOrEqual(3);
  });

  it("includes discovery cards for MCP tools", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    const discoveryMsgs = feed.messages.filter((m) => m.cardType === "discovery_card");
    expect(discoveryMsgs.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  8. Filter support                                                 */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Filter support", () => {
  const messages = [
    makeConsoleMsg("session_created", "Created", 0),
    makeConsoleMsg("workspace_bound", "Bound", 100),
    makeConsoleMsg("mcp_attached", "MCP attached", 200),
    makeConsoleMsg("agent_enabled", "Agent enabled", 300),
    makeConsoleMsg("workflow_started", "Started", 400),
  ];

  it("returns all messages with 'all' filter", () => {
    expect(filterByActor(messages, "all")).toHaveLength(5);
  });

  it("filters by system actor", () => {
    const filtered = filterByActor(messages, "system");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("session_created");
  });

  it("filters by workspace actor", () => {
    const filtered = filterByActor(messages, "workspace");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("workspace_bound");
  });

  it("filters by mcp actor", () => {
    const filtered = filterByActor(messages, "mcp");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("mcp_attached");
  });

  it("filters by agent actor", () => {
    const filtered = filterByActor(messages, "agent");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("agent_enabled");
  });

  it("filters by workflow actor", () => {
    const filtered = filterByActor(messages, "workflow");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("workflow_started");
  });

  it("provides all filter options", () => {
    expect(CONSOLE_FILTERS).toHaveLength(6);
    const ids = CONSOLE_FILTERS.map((f) => f.id);
    expect(ids).toContain("all");
    expect(ids).toContain("system");
    expect(ids).toContain("workspace");
    expect(ids).toContain("mcp");
    expect(ids).toContain("agent");
    expect(ids).toContain("workflow");
  });
});

/* ------------------------------------------------------------------ */
/*  9. HTML output — console structure                                */
/* ------------------------------------------------------------------ */

describe("Phase 24 — HTML output structure", () => {
  const shellHtml = renderShellHtml();

  it("contains console status header container", () => {
    expect(shellHtml).toContain('id="console-status-header"');
    expect(shellHtml).toContain("console-status-header");
  });

  it("contains console presence bar container", () => {
    expect(shellHtml).toContain('id="console-presence-bar"');
    expect(shellHtml).toContain("console-presence-bar");
  });

  it("contains console filter bar container", () => {
    expect(shellHtml).toContain('id="console-filter-bar"');
    expect(shellHtml).toContain("console-filter-bar");
  });

  it("contains session console container", () => {
    expect(shellHtml).toContain('id="session-console-container"');
  });

  it("preserves session summary container", () => {
    expect(shellHtml).toContain('id="session-summary-container"');
  });

  it("preserves session timeline container", () => {
    expect(shellHtml).toContain('id="session-timeline-container"');
  });

  it("preserves main app area", () => {
    expect(shellHtml).toContain('id="app"');
  });

  it("preserves section-nav", () => {
    expect(shellHtml).toContain('id="section-nav"');
  });

  it("has Console entry in section nav logic", () => {
    expect(shellHtml).toContain("section-console");
    expect(shellHtml).toContain("Console");
  });
});

/* ------------------------------------------------------------------ */
/*  10. CSS — console styles                                          */
/* ------------------------------------------------------------------ */

describe("Phase 24 — CSS styles", () => {
  const shellHtml = renderShellHtml();

  it("includes console status header styles", () => {
    expect(shellHtml).toContain(".console-status-header");
    expect(shellHtml).toContain(".csh-stage");
    expect(shellHtml).toContain(".csh-status");
  });

  it("includes console presence bar styles", () => {
    expect(shellHtml).toContain(".console-presence-bar");
    expect(shellHtml).toContain(".cpb-group");
    expect(shellHtml).toContain(".cpb-ready");
    expect(shellHtml).toContain(".cpb-pending");
  });

  it("includes console filter bar styles", () => {
    expect(shellHtml).toContain(".console-filter-bar");
  });

  it("includes console feed styles", () => {
    expect(shellHtml).toContain(".console-feed");
    expect(shellHtml).toContain(".console-group");
    expect(shellHtml).toContain(".console-group-header");
  });

  it("includes console message styles", () => {
    expect(shellHtml).toContain(".console-msg");
    expect(shellHtml).toContain(".cm-dot");
    expect(shellHtml).toContain(".cm-kind");
    expect(shellHtml).toContain(".cm-text");
    expect(shellHtml).toContain(".cm-detail-toggle");
    expect(shellHtml).toContain(".cm-detail");
  });

  it("includes action card styles", () => {
    expect(shellHtml).toContain(".console-card-approval");
    expect(shellHtml).toContain(".console-card-blocked");
    expect(shellHtml).toContain(".console-card-failure");
    expect(shellHtml).toContain(".console-card-success");
    expect(shellHtml).toContain(".console-card-lifecycle");
    expect(shellHtml).toContain(".console-card-discovery");
  });

  it("includes actor CSS classes", () => {
    expect(shellHtml).toContain(".actor-system");
    expect(shellHtml).toContain(".actor-workspace");
    expect(shellHtml).toContain(".actor-mcp");
    expect(shellHtml).toContain(".actor-agent");
    expect(shellHtml).toContain(".actor-workflow");
  });

  it("includes console panel styles", () => {
    expect(shellHtml).toContain(".console-panel");
    expect(shellHtml).toContain(".console-toggle");
  });

  it("includes status header status variants", () => {
    expect(shellHtml).toContain(".csh-status-active");
    expect(shellHtml).toContain(".csh-status-completed");
    expect(shellHtml).toContain(".csh-status-blocked");
    expect(shellHtml).toContain(".csh-status-failed");
    expect(shellHtml).toContain(".csh-status-idle");
  });

  it("includes navigation link style", () => {
    expect(shellHtml).toContain(".console-nav-link");
  });
});

/* ------------------------------------------------------------------ */
/*  11. Client-side JS — console logic                                */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Client-side JS logic", () => {
  const shellHtml = renderShellHtml();

  it("includes actor classification in client JS", () => {
    expect(shellHtml).toContain("KIND_TO_ACTOR");
    expect(shellHtml).toContain("classifyActor");
  });

  it("includes card classification in client JS", () => {
    expect(shellHtml).toContain("KIND_TO_CARD");
    expect(shellHtml).toContain("classifyCard");
  });

  it("includes console rendering functions", () => {
    expect(shellHtml).toContain("renderConsoleStatusHeader");
    expect(shellHtml).toContain("renderConsolePresenceBar");
    expect(shellHtml).toContain("renderConsoleFilterBar");
    expect(shellHtml).toContain("renderConsoleGroups");
    expect(shellHtml).toContain("renderConsoleMessage");
    expect(shellHtml).toContain("renderConsoleFull");
  });

  it("includes message enrichment", () => {
    expect(shellHtml).toContain("enrichMessages");
  });

  it("includes message grouping logic", () => {
    expect(shellHtml).toContain("groupConsoleMessages");
  });

  it("includes filter handling", () => {
    expect(shellHtml).toContain("_currentConsoleFilter");
    expect(shellHtml).toContain("rerenderConsoleMessages");
  });

  it("includes clear console function", () => {
    expect(shellHtml).toContain("clearConsole");
  });

  it("includes MCP events in demo timeline", () => {
    expect(shellHtml).toContain("mcp_attach_requested");
    expect(shellHtml).toContain("mcp_attached");
    expect(shellHtml).toContain("mcp_started");
    expect(shellHtml).toContain("mcp_discovered_tools");
  });

  it("includes agent events in demo timeline", () => {
    expect(shellHtml).toContain("agent_attach_requested");
    expect(shellHtml).toContain("agent_attached");
    expect(shellHtml).toContain("agent_enabled");
  });

  it("includes workspace events in demo timeline", () => {
    expect(shellHtml).toContain("workspace_opened");
  });

  it("includes demo presence building", () => {
    expect(shellHtml).toContain("buildDemoPresence");
    expect(shellHtml).toContain("mcpServers");
    expect(shellHtml).toContain("agents");
  });

  it("includes agent event categories", () => {
    expect(shellHtml).toContain("agent_attached: 'progress'");
    expect(shellHtml).toContain("agent_enabled: 'progress'");
    expect(shellHtml).toContain("agent_failed: 'failure'");
    expect(shellHtml).toContain("agent_disabled: 'failure'");
  });

  it("includes navigation links in console cards", () => {
    expect(shellHtml).toContain("console-nav-link");
    expect(shellHtml).toContain("section-workflow");
    expect(shellHtml).toContain("View Workflow");
  });

  it("includes detail toggle", () => {
    expect(shellHtml).toContain("cm-detail-toggle");
    expect(shellHtml).toContain("show detail");
  });
});

/* ------------------------------------------------------------------ */
/*  12. Demo and real mode coherence                                  */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Demo and real mode coherence", () => {
  it("demo mode produces a complete console feed", () => {
    const feed = buildDemoConsoleFeed("coherence-test", "completed");
    // Should have all five actor types
    const actors = new Set(feed.messages.map((m) => m.actor));
    expect(actors.has("system")).toBe(true);
    expect(actors.has("workspace")).toBe(true);
    expect(actors.has("mcp")).toBe(true);
    expect(actors.has("agent")).toBe(true);
    expect(actors.has("workflow")).toBe(true);
  });

  it("demo mode presence includes workspace, MCP, agents", () => {
    const feed = buildDemoConsoleFeed("test", "completed");
    expect(feed.presence.workspaceStatus).toBe("ready");
    expect(feed.presence.mcpServers.length).toBeGreaterThan(0);
    expect(feed.presence.agents.length).toBeGreaterThan(0);
  });

  it("real mode feed uses same message structure", () => {
    const events = [
      makeEvent("session_created", "Created", 0),
      makeEvent("workspace_bound", "Bound", 100),
    ];
    const feed = buildConsoleFeed("real-test", events, { stage: "workspace_binding", status: "active" });
    expect(feed.messages).toHaveLength(2);
    expect(feed.messages[0].actor).toBeTruthy();
    expect(feed.messages[0].cardType).toBeTruthy();
    expect(feed.messages[0].category).toBeTruthy();
  });

  it("console feed works with MCP-only events", () => {
    const events = [
      makeEvent("mcp_attach_requested", "Attach", 0),
      makeEvent("mcp_attached", "Attached", 100),
      makeEvent("mcp_failed", "Failed", 200, { error: "timeout" }),
    ];
    const feed = buildConsoleFeed("mcp-session", events, {
      mcpServers: [{ id: "srv1", label: "srv1", ready: false }],
    });
    expect(feed.messages).toHaveLength(3);
    expect(feed.messages.every((m) => m.actor === "mcp")).toBe(true);
    expect(feed.presence.mcpServers).toHaveLength(1);
  });

  it("console feed works with agent-only events", () => {
    const events = [
      makeEvent("agent_attach_requested", "Attach", 0),
      makeEvent("agent_attached", "Attached", 100),
      makeEvent("agent_enabled", "Enabled", 200),
    ];
    const feed = buildConsoleFeed("agent-session", events, {
      agents: [{ id: "agt1", label: "agt1", ready: true }],
    });
    expect(feed.messages).toHaveLength(3);
    expect(feed.messages.every((m) => m.actor === "agent")).toBe(true);
    expect(feed.presence.agents).toHaveLength(1);
  });

  it("console feed works with workspace-only events", () => {
    const events = [
      makeEvent("workspace_open_requested", "Open req", 0),
      makeEvent("workspace_opened", "Opened", 100),
      makeEvent("workspace_ready", "Ready", 200),
    ];
    const feed = buildConsoleFeed("ws-session", events, {
      workspaceStatus: "ready",
      workspacePath: "/project",
    });
    expect(feed.messages).toHaveLength(3);
    expect(feed.presence.workspaceStatus).toBe("ready");
  });
});

/* ------------------------------------------------------------------ */
/*  13. Mixed event feed rendering                                    */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Mixed event feed", () => {
  it("handles a realistic mixed event sequence", () => {
    const events = [
      makeEvent("session_created", "Session created", 0),
      makeEvent("workspace_bound", "Workspace bound", 100),
      makeEvent("workspace_opened", "Workspace opened", 150),
      makeEvent("mcp_attach_requested", "MCP attach", 200),
      makeEvent("mcp_attached", "MCP attached", 250),
      makeEvent("mcp_started", "MCP started", 300),
      makeEvent("mcp_discovered_tools", "3 tools", 350, { tools: ["a", "b", "c"] }),
      makeEvent("agent_attach_requested", "Agent attach", 400),
      makeEvent("agent_attached", "Agent attached", 450),
      makeEvent("agent_enabled", "Agent enabled", 500),
      makeEvent("catalogs_loaded", "Loaded", 600),
      makeEvent("host_detected", "Detected", 700),
      makeEvent("workflow_started", "Workflow started", 800),
      makeEvent("stage_completed", "catalog_loading", 900),
      makeEvent("stage_completed", "host_acquisition", 1100),
      makeEvent("completed", "Done", 2000),
    ];
    const feed = buildConsoleFeed("mixed", events, {
      stage: "done",
      status: "completed",
    });

    expect(feed.messages).toHaveLength(16);
    expect(feed.groups.length).toBeGreaterThanOrEqual(3);

    // Check card types are properly assigned
    const successMsgs = feed.messages.filter((m) => m.cardType === "success_card");
    expect(successMsgs.length).toBeGreaterThanOrEqual(1);

    const lifecycleMsgs = feed.messages.filter((m) => m.cardType === "lifecycle_card");
    expect(lifecycleMsgs.length).toBeGreaterThanOrEqual(3);
  });

  it("handles sequence with failure", () => {
    const events = [
      makeEvent("session_created", "Created", 0),
      makeEvent("workspace_bound", "Bound", 100),
      makeEvent("workflow_started", "Started", 200),
      makeEvent("failed", "Workflow failed", 300),
    ];
    const feed = buildConsoleFeed("fail", events, {
      stage: "workflow_running",
      status: "failed",
    });

    const failMsgs = feed.messages.filter((m) => m.cardType === "failure_card");
    expect(failMsgs).toHaveLength(1);
    expect(failMsgs[0].kind).toBe("failed");
  });

  it("handles sequence with blocked", () => {
    const events = [
      makeEvent("session_created", "Created", 0),
      makeEvent("blocked", "Blocked by safety", 100),
    ];
    const feed = buildConsoleFeed("block", events, {
      status: "blocked",
      isBlocked: true,
    });

    const blockedMsgs = feed.messages.filter((m) => m.cardType === "blocked_card");
    expect(blockedMsgs).toHaveLength(1);
    expect(feed.presence.isBlocked).toBe(true);
  });

  it("handles clone success sequence", () => {
    const events = [
      makeEvent("clone_requested", "Clone req", 0),
      makeEvent("clone_started", "Clone started", 100),
      makeEvent("clone_completed", "Clone done", 200),
      makeEvent("workspace_ready", "Ready", 300),
    ];
    const feed = buildConsoleFeed("clone", events, {});

    const successMsgs = feed.messages.filter((m) => m.cardType === "success_card");
    expect(successMsgs.length).toBeGreaterThanOrEqual(2); // clone_completed + workspace_ready
  });

  it("handles clone failure sequence", () => {
    const events = [
      makeEvent("clone_requested", "Clone req", 0),
      makeEvent("clone_started", "Clone started", 100),
      makeEvent("clone_failed", "Clone failed: auth error", 200, { reason: "auth" }),
    ];
    const feed = buildConsoleFeed("clone-fail", events, {});

    const failMsgs = feed.messages.filter((m) => m.cardType === "failure_card");
    expect(failMsgs).toHaveLength(1);
    expect(failMsgs[0].detail).toEqual({ reason: "auth" });
  });
});

/* ------------------------------------------------------------------ */
/*  14. Detail view accessibility                                     */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Detail view accessibility", () => {
  const shellHtml = renderShellHtml();

  it("preserves host section rendering", () => {
    expect(shellHtml).toContain("section-host");
    expect(shellHtml).toContain("renderHost");
  });

  it("preserves recommendation section rendering", () => {
    expect(shellHtml).toContain("section-recommendation");
    expect(shellHtml).toContain("renderRecommendation");
  });

  it("preserves compatibility section rendering", () => {
    expect(shellHtml).toContain("section-compatibility");
    expect(shellHtml).toContain("renderCompatibility");
  });

  it("preserves plan review section rendering", () => {
    expect(shellHtml).toContain("section-plan");
    expect(shellHtml).toContain("renderPlan");
  });

  it("preserves workflow section rendering", () => {
    expect(shellHtml).toContain("section-workflow");
    expect(shellHtml).toContain("renderWorkflow");
  });

  it("console cards link to workflow section", () => {
    expect(shellHtml).toContain("View Workflow");
    expect(shellHtml).toContain("scrollIntoView");
  });

  it("console cards link to host section", () => {
    expect(shellHtml).toContain("View Host");
  });
});

/* ------------------------------------------------------------------ */
/*  15. Server API — console endpoint                                 */
/* ------------------------------------------------------------------ */

describe("Phase 24 — Console API endpoint", () => {
  function mockReq(method: string, url: string): IncomingMessage {
    return { method, url, headers: { host: "localhost:3000" } } as unknown as IncomingMessage;
  }

  function mockRes(): ServerResponse & { _status: number; _body: string } {
    const res = {
      _status: 0,
      _body: "",
      _headers: {} as Record<string, string>,
      writeHead(status: number, headers: Record<string, string> = {}) {
        res._status = status;
        res._headers = headers;
        return res;
      },
      end(body: string) {
        res._body = body;
      },
    };
    return res as unknown as ServerResponse & { _status: number; _body: string };
  }

  it("returns 404 for non-existent session console", async () => {
    const req = mockReq("GET", "/api/session/nonexistent/console");
    const res = mockRes();
    await handleRequest(req, res);
    expect(res._status).toBe(404);
  });

  it("returns console feed for existing session", async () => {
    const mgr = getWorkspaceSessionManager();
    const session = mgr.createSession();
    const req = mockReq("GET", `/api/session/${session.id}/console`);
    const res = mockRes();
    await handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(data.sessionId).toBe(session.id);
    expect(data.messages).toBeDefined();
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.groups).toBeDefined();
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.presence).toBeDefined();
    expect(data.presence.sessionStage).toBeDefined();
    expect(data.presence.sessionStatus).toBeDefined();
    // Clean up
    mgr.removeSession(session.id);
  });

  it("console feed messages have actor and cardType", async () => {
    const mgr = getWorkspaceSessionManager();
    const session = mgr.createSession();
    const req = mockReq("GET", `/api/session/${session.id}/console`);
    const res = mockRes();
    await handleRequest(req, res);
    const data = JSON.parse(res._body);
    // session_created event should be present
    expect(data.messages.length).toBeGreaterThanOrEqual(1);
    expect(data.messages[0].actor).toBe("system");
    expect(data.messages[0].cardType).toBe("message");
    mgr.removeSession(session.id);
  });

  it("console feed groups are properly formed", async () => {
    const mgr = getWorkspaceSessionManager();
    const session = mgr.createSession();
    const req = mockReq("GET", `/api/session/${session.id}/console`);
    const res = mockRes();
    await handleRequest(req, res);
    const data = JSON.parse(res._body);
    expect(data.groups.length).toBeGreaterThanOrEqual(1);
    expect(data.groups[0].actor).toBe("system");
    expect(data.groups[0].messages).toBeDefined();
    mgr.removeSession(session.id);
  });
});
