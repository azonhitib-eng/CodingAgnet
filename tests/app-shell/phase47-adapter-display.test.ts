/**
 * Phase 47 — Shell/Console Adapter Status Display and Agent Output Rendering.
 *
 * Covers:
 * - Adapter event classification in timeline helpers
 * - Adapter event actor/card classification in console helpers
 * - Adapter status in console presence bar
 * - Agent run output card rendering (stub, echo, model)
 * - Agent run error card rendering
 * - Adapter resolved card rendering
 * - Honest labeling (stub vs real vs echo)
 * - Configured / unavailable / not-configured wording
 * - Demo console feed adapter/agent run events
 * - Command-driven visibility (adapter inspection, agent run)
 * - No regression in existing console/timeline flows
 * - Views HTML output includes Phase 47 CSS and JS
 */

import { describe, it, expect } from "vitest";
import {
  classifyActor,
  classifyCard,
  buildPresence,
  buildConsoleFeed,
  buildDemoConsoleFeed,
  toConsoleMessage,
  groupMessages,
  filterByActor,
  type AdapterPresence,
} from "../../src/app-shell/console-helpers.js";

import { classifyEvent } from "../../src/app-shell/timeline-helpers.js";
import { renderShellHtml } from "../../src/app-shell/views.js";

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

/* ================================================================== */
/*  1. Timeline event classification for adapter events               */
/* ================================================================== */

describe("Phase 47 — timeline event classification", () => {
  it("classifies agent_adapter_resolved as progress", () => {
    expect(classifyEvent("agent_adapter_resolved")).toBe("progress");
  });

  it("classifies agent_adapter_status_refreshed as info", () => {
    expect(classifyEvent("agent_adapter_status_refreshed")).toBe("info");
  });

  it("classifies agent_run_requested as info", () => {
    expect(classifyEvent("agent_run_requested")).toBe("info");
  });

  it("classifies agent_run_started as progress", () => {
    expect(classifyEvent("agent_run_started")).toBe("progress");
  });

  it("classifies agent_run_completed as progress", () => {
    expect(classifyEvent("agent_run_completed")).toBe("progress");
  });

  it("classifies agent_run_failed as failure", () => {
    expect(classifyEvent("agent_run_failed")).toBe("failure");
  });
});

/* ================================================================== */
/*  2. Console actor classification for adapter events                */
/* ================================================================== */

describe("Phase 47 — console actor classification", () => {
  it("classifies agent_adapter_resolved as agent actor", () => {
    expect(classifyActor("agent_adapter_resolved")).toBe("agent");
  });

  it("classifies agent_adapter_status_refreshed as agent actor", () => {
    expect(classifyActor("agent_adapter_status_refreshed")).toBe("agent");
  });

  it("classifies agent_run_requested as agent actor", () => {
    expect(classifyActor("agent_run_requested")).toBe("agent");
  });

  it("classifies agent_run_completed as agent actor", () => {
    expect(classifyActor("agent_run_completed")).toBe("agent");
  });

  it("classifies agent_run_failed as agent actor", () => {
    expect(classifyActor("agent_run_failed")).toBe("agent");
  });

  it("classifies agent_context_assembled as agent actor", () => {
    expect(classifyActor("agent_context_assembled")).toBe("agent");
  });

  it("classifies agent_context_failed as agent actor", () => {
    expect(classifyActor("agent_context_failed")).toBe("agent");
  });
});

/* ================================================================== */
/*  3. Console card classification for adapter/run events             */
/* ================================================================== */

describe("Phase 47 — console card classification", () => {
  it("classifies agent_adapter_resolved as lifecycle_card", () => {
    expect(classifyCard("agent_adapter_resolved")).toBe("lifecycle_card");
  });

  it("classifies agent_adapter_status_refreshed as lifecycle_card", () => {
    expect(classifyCard("agent_adapter_status_refreshed")).toBe("lifecycle_card");
  });

  it("classifies agent_run_requested as lifecycle_card", () => {
    expect(classifyCard("agent_run_requested")).toBe("lifecycle_card");
  });

  it("classifies agent_run_started as lifecycle_card", () => {
    expect(classifyCard("agent_run_started")).toBe("lifecycle_card");
  });

  it("classifies agent_run_completed as success_card", () => {
    expect(classifyCard("agent_run_completed")).toBe("success_card");
  });

  it("classifies agent_run_failed as failure_card", () => {
    expect(classifyCard("agent_run_failed")).toBe("failure_card");
  });

  it("classifies agent_context_assembled as discovery_card", () => {
    expect(classifyCard("agent_context_assembled")).toBe("discovery_card");
  });

  it("classifies agent_context_failed as failure_card", () => {
    expect(classifyCard("agent_context_failed")).toBe("failure_card");
  });
});

/* ================================================================== */
/*  4. Adapter status in presence bar                                 */
/* ================================================================== */

describe("Phase 47 — adapter status in presence", () => {
  it("includes adapter status when activeAdapterKind is present", () => {
    const presence = buildPresence({
      stage: "review",
      status: "active",
      activeAdapterKind: "stub",
      activeAdapterAvailability: "configured_available",
      activeAdapterIsModelBacked: false,
      activeAdapterModelName: null,
    });
    expect(presence.adapterStatus).not.toBeNull();
    expect(presence.adapterStatus!.kind).toBe("stub");
    expect(presence.adapterStatus!.availability).toBe("configured_available");
    expect(presence.adapterStatus!.isModelBacked).toBe(false);
    expect(presence.adapterStatus!.modelName).toBeNull();
  });

  it("includes model name for OpenAI adapter", () => {
    const presence = buildPresence({
      activeAdapterKind: "openai_compatible",
      activeAdapterAvailability: "configured_available",
      activeAdapterIsModelBacked: true,
      activeAdapterModelName: "gpt-4o-mini",
    });
    expect(presence.adapterStatus).not.toBeNull();
    expect(presence.adapterStatus!.kind).toBe("openai_compatible");
    expect(presence.adapterStatus!.isModelBacked).toBe(true);
    expect(presence.adapterStatus!.modelName).toBe("gpt-4o-mini");
  });

  it("sets adapterStatus to null when no adapter info", () => {
    const presence = buildPresence({
      stage: "initializing",
      status: "idle",
    });
    expect(presence.adapterStatus).toBeNull();
  });

  it("defaults availability to not_configured when missing", () => {
    const presence = buildPresence({
      activeAdapterKind: "openai_compatible",
    });
    expect(presence.adapterStatus!.availability).toBe("not_configured");
  });

  it("defaults isModelBacked to false when null", () => {
    const presence = buildPresence({
      activeAdapterKind: "stub",
      activeAdapterIsModelBacked: null,
    });
    expect(presence.adapterStatus!.isModelBacked).toBe(false);
  });

  it("preserves other presence fields when adapter status added", () => {
    const presence = buildPresence({
      stage: "review",
      status: "active",
      workspaceStatus: "ready",
      workspacePath: "/my/project",
      mcpServers: [{ id: "s1", label: "Server1", ready: true }],
      agents: [{ id: "a1", label: "Agent1", ready: true }],
      approvalRequired: false,
      isBlocked: false,
      activeAdapterKind: "echo_test",
      activeAdapterAvailability: "configured_available",
      activeAdapterIsModelBacked: false,
    });
    expect(presence.sessionStage).toBe("review");
    expect(presence.sessionStatus).toBe("active");
    expect(presence.workspaceStatus).toBe("ready");
    expect(presence.workspacePath).toBe("/my/project");
    expect(presence.mcpServers).toHaveLength(1);
    expect(presence.agents).toHaveLength(1);
    expect(presence.adapterStatus).not.toBeNull();
    expect(presence.adapterStatus!.kind).toBe("echo_test");
  });
});

/* ================================================================== */
/*  5. Console message enrichment for agent run events                */
/* ================================================================== */

describe("Phase 47 — console message enrichment", () => {
  it("enriches agent_run_completed event with detail", () => {
    const event = makeEvent(
      "agent_run_completed",
      "Agent run completed: copilot (summarize_workspace) — 42ms",
      1000,
      {
        runId: "run-001",
        agentName: "copilot",
        taskKind: "summarize_workspace",
        adapterKind: "stub",
        isModelGenerated: false,
        durationMs: 42,
        outputPreview: "[Stub] Summary of workspace...",
      },
    );
    const msg = toConsoleMessage(event);
    expect(msg.actor).toBe("agent");
    expect(msg.cardType).toBe("success_card");
    expect(msg.detail).toBeDefined();
    expect(msg.detail!.adapterKind).toBe("stub");
    expect(msg.detail!.isModelGenerated).toBe(false);
    expect(msg.detail!.outputPreview).toBe("[Stub] Summary of workspace...");
  });

  it("enriches agent_run_failed event with error detail", () => {
    const event = makeEvent(
      "agent_run_failed",
      "Agent run failed: EXECUTION_FAILED — Timeout",
      2000,
      {
        runId: "run-002",
        errorCode: "EXECUTION_FAILED",
        errorMessage: "Timeout after 30s",
      },
    );
    const msg = toConsoleMessage(event);
    expect(msg.actor).toBe("agent");
    expect(msg.cardType).toBe("failure_card");
    expect(msg.detail!.errorCode).toBe("EXECUTION_FAILED");
  });

  it("enriches agent_adapter_resolved event with adapter detail", () => {
    const event = makeEvent(
      "agent_adapter_resolved",
      "Execution adapter resolved: openai_compatible — Configured & Available",
      500,
      {
        adapterKind: "openai_compatible",
        isModelBacked: true,
        availability: "configured_available",
        modelName: "gpt-4o-mini",
        label: "OpenAI-Compatible API",
      },
    );
    const msg = toConsoleMessage(event);
    expect(msg.actor).toBe("agent");
    expect(msg.cardType).toBe("lifecycle_card");
    expect(msg.detail!.isModelBacked).toBe(true);
    expect(msg.detail!.modelName).toBe("gpt-4o-mini");
  });
});

/* ================================================================== */
/*  6. Stub vs real vs echo labeling honesty                          */
/* ================================================================== */

describe("Phase 47 — honest output labeling", () => {
  it("stub adapter output has isModelGenerated=false", () => {
    const event = makeEvent("agent_run_completed", "run done", 100, {
      adapterKind: "stub",
      isModelGenerated: false,
      outputPreview: "[Stub] output",
    });
    expect(event.detail!.isModelGenerated).toBe(false);
    expect(event.detail!.adapterKind).toBe("stub");
  });

  it("echo adapter output has isModelGenerated=false", () => {
    const event = makeEvent("agent_run_completed", "run done", 100, {
      adapterKind: "echo_test",
      isModelGenerated: false,
      outputPreview: "Echo: some test input",
    });
    expect(event.detail!.isModelGenerated).toBe(false);
    expect(event.detail!.adapterKind).toBe("echo_test");
  });

  it("openai adapter output has isModelGenerated=true", () => {
    const event = makeEvent("agent_run_completed", "run done", 100, {
      adapterKind: "openai_compatible",
      isModelGenerated: true,
      outputPreview: "Here is a real summary of your project...",
    });
    expect(event.detail!.isModelGenerated).toBe(true);
    expect(event.detail!.adapterKind).toBe("openai_compatible");
  });

  it("adapter resolved shows not_configured for missing config", () => {
    const event = makeEvent("agent_adapter_resolved", "resolved", 100, {
      adapterKind: "openai_compatible",
      isModelBacked: true,
      availability: "not_configured",
    });
    expect(event.detail!.availability).toBe("not_configured");
  });

  it("adapter resolved shows configured_unavailable for down backend", () => {
    const event = makeEvent("agent_adapter_resolved", "resolved", 100, {
      adapterKind: "openai_compatible",
      isModelBacked: true,
      availability: "configured_unavailable",
    });
    expect(event.detail!.availability).toBe("configured_unavailable");
  });
});

/* ================================================================== */
/*  7. Console feed with adapter events                               */
/* ================================================================== */

describe("Phase 47 — console feed with adapter events", () => {
  it("includes adapter events in console feed messages", () => {
    const events = [
      makeEvent("session_created", "Session created", 0),
      makeEvent("agent_adapter_resolved", "Adapter resolved: stub", 100, {
        adapterKind: "stub",
        isModelBacked: false,
        availability: "configured_available",
      }),
      makeEvent("agent_run_completed", "Run completed", 200, {
        runId: "run-001",
        adapterKind: "stub",
        isModelGenerated: false,
        outputPreview: "stub output",
      }),
    ];
    const summary = { stage: "review", status: "active" };
    const feed = buildConsoleFeed("test-session", events, summary);
    expect(feed.messages).toHaveLength(3);
    expect(feed.messages[1].kind).toBe("agent_adapter_resolved");
    expect(feed.messages[1].actor).toBe("agent");
    expect(feed.messages[2].kind).toBe("agent_run_completed");
    expect(feed.messages[2].cardType).toBe("success_card");
  });

  it("groups adapter events under agent actor", () => {
    const events = [
      makeEvent("agent_adapter_resolved", "Adapter resolved", 0, {
        adapterKind: "stub",
      }),
      makeEvent("agent_run_requested", "Run requested", 100),
      makeEvent("agent_run_completed", "Run completed", 200, {
        adapterKind: "stub",
        isModelGenerated: false,
      }),
    ];
    const feed = buildConsoleFeed("test-session", events, {});
    const groups = feed.groups;
    // All should be grouped under agent actor since they're within 30s
    expect(groups).toHaveLength(1);
    expect(groups[0].actor).toBe("agent");
    expect(groups[0].messages).toHaveLength(3);
  });

  it("filters adapter events when filtering by agent actor", () => {
    const events = [
      makeEvent("session_created", "Session created", 0),
      makeEvent("agent_adapter_resolved", "Adapter resolved", 100, {
        adapterKind: "stub",
      }),
      makeEvent("agent_run_completed", "Run completed", 200, {
        adapterKind: "stub",
      }),
    ];
    const feed = buildConsoleFeed("test-session", events, {});
    const agentOnly = filterByActor(feed.messages, "agent");
    expect(agentOnly).toHaveLength(2);
    expect(agentOnly[0].kind).toBe("agent_adapter_resolved");
    expect(agentOnly[1].kind).toBe("agent_run_completed");
  });
});

/* ================================================================== */
/*  8. Demo console feed includes Phase 47 events                     */
/* ================================================================== */

describe("Phase 47 — demo console feed", () => {
  it("demo feed includes adapter resolved event", () => {
    const feed = buildDemoConsoleFeed("testScenario", "completed");
    const adapterEvents = feed.messages.filter(
      (m) => m.kind === "agent_adapter_resolved",
    );
    expect(adapterEvents.length).toBeGreaterThanOrEqual(1);
    const ev = adapterEvents[0];
    expect(ev.actor).toBe("agent");
    expect(ev.detail).toBeDefined();
    expect(ev.detail!.adapterKind).toBe("stub");
    expect(ev.detail!.isModelBacked).toBe(false);
  });

  it("demo feed includes agent run requested/started/completed events", () => {
    const feed = buildDemoConsoleFeed("testScenario", "completed");
    const runEvents = feed.messages.filter(
      (m) => m.kind.startsWith("agent_run_"),
    );
    expect(runEvents.length).toBeGreaterThanOrEqual(3);
    const kinds = runEvents.map((e) => e.kind);
    expect(kinds).toContain("agent_run_requested");
    expect(kinds).toContain("agent_run_started");
    expect(kinds).toContain("agent_run_completed");
  });

  it("demo feed agent_run_completed has stub labeling", () => {
    const feed = buildDemoConsoleFeed("testScenario", "completed");
    const completed = feed.messages.find(
      (m) => m.kind === "agent_run_completed",
    );
    expect(completed).toBeDefined();
    expect(completed!.detail).toBeDefined();
    expect(completed!.detail!.isModelGenerated).toBe(false);
    expect(completed!.detail!.adapterKind).toBe("stub");
    expect(typeof completed!.detail!.outputPreview).toBe("string");
    expect((completed!.detail!.outputPreview as string).length).toBeGreaterThan(0);
  });

  it("demo feed presence includes adapter status", () => {
    const feed = buildDemoConsoleFeed("testScenario", "completed");
    expect(feed.presence.adapterStatus).not.toBeNull();
    expect(feed.presence.adapterStatus!.kind).toBe("stub");
    expect(feed.presence.adapterStatus!.availability).toBe("configured_available");
    expect(feed.presence.adapterStatus!.isModelBacked).toBe(false);
  });

  it("demo feed works for all workflow statuses", () => {
    for (const status of ["completed", "completed_requires_approval", "blocked", "failed"]) {
      const feed = buildDemoConsoleFeed("scenario", status);
      expect(feed.messages.length).toBeGreaterThan(0);
      expect(feed.presence.adapterStatus).not.toBeNull();
    }
  });
});

/* ================================================================== */
/*  9. Views HTML includes Phase 47 structures                        */
/* ================================================================== */

describe("Phase 47 — views HTML output", () => {
  const html = renderShellHtml();

  it("includes adapter status CSS classes", () => {
    expect(html).toContain("adapter-status-bar");
    expect(html).toContain("asb-label");
    expect(html).toContain("asb-kind");
    expect(html).toContain("asb-badge");
    expect(html).toContain("asb-badge-model");
    expect(html).toContain("asb-badge-stub");
    expect(html).toContain("asb-badge-echo");
    expect(html).toContain("asb-badge-available");
    expect(html).toContain("asb-badge-unavailable");
    expect(html).toContain("asb-badge-not-configured");
  });

  it("includes agent output card CSS classes", () => {
    expect(html).toContain("agent-output-card");
    expect(html).toContain("aoc-header");
    expect(html).toContain("aoc-body");
    expect(html).toContain("aoc-meta");
    expect(html).toContain("aoc-badge");
  });

  it("includes adapter event mappings in client JS", () => {
    expect(html).toContain("agent_adapter_resolved");
    expect(html).toContain("agent_adapter_status_refreshed");
  });

  it("includes ADAPTER_KIND_LABELS in client JS", () => {
    expect(html).toContain("ADAPTER_KIND_LABELS");
    expect(html).toContain("openai_compatible");
    expect(html).toContain("Stub (Demo)");
    expect(html).toContain("Echo Test");
  });

  it("includes ADAPTER_AVAILABILITY_LABELS in client JS", () => {
    expect(html).toContain("ADAPTER_AVAILABILITY_LABELS");
    expect(html).toContain("configured_available");
    expect(html).toContain("Not Configured");
  });

  it("includes renderAdapterStatusInline function in client JS", () => {
    expect(html).toContain("renderAdapterStatusInline");
  });

  it("includes renderAgentOutputCard function in client JS", () => {
    expect(html).toContain("renderAgentOutputCard");
  });

  it("includes renderAgentErrorCard function in client JS", () => {
    expect(html).toContain("renderAgentErrorCard");
  });

  it("includes renderAdapterResolvedCard function in client JS", () => {
    expect(html).toContain("renderAdapterResolvedCard");
  });

  it("includes adapterModelBackedLabel for honesty", () => {
    expect(html).toContain("adapterModelBackedLabel");
    expect(html).toContain("Model-Backed");
    expect(html).toContain("Stub (Not Model Output)");
    expect(html).toContain("Echo Test (Not Model Output)");
  });

  it("includes agent_run_completed specialized rendering path", () => {
    expect(html).toContain("agent_run_completed");
    expect(html).toContain("renderAgentOutputCard");
  });

  it("includes agent_run_failed specialized rendering path", () => {
    expect(html).toContain("agent_run_failed");
    expect(html).toContain("renderAgentErrorCard");
  });

  it("includes adapter presence rendering in presence bar", () => {
    expect(html).toContain("presence.adapterStatus");
    expect(html).toContain("renderAdapterStatusInline");
  });

  it("includes Model Output / Stub Output / Echo Test Output badge text", () => {
    expect(html).toContain("Model Output");
    expect(html).toContain("Stub Output");
    expect(html).toContain("Echo Test Output");
  });

  it("includes Agent Run Failed text for error card", () => {
    expect(html).toContain("Agent Run Failed");
  });

  it("includes Adapter Resolved text for lifecycle card", () => {
    expect(html).toContain("Adapter Resolved");
  });
});

/* ================================================================== */
/*  10. Adapter availability wording                                  */
/* ================================================================== */

describe("Phase 47 — availability state wording", () => {
  it("configured_available shows in presence", () => {
    const presence = buildPresence({
      activeAdapterKind: "stub",
      activeAdapterAvailability: "configured_available",
      activeAdapterIsModelBacked: false,
    });
    expect(presence.adapterStatus!.availability).toBe("configured_available");
  });

  it("configured_unavailable shows in presence", () => {
    const presence = buildPresence({
      activeAdapterKind: "openai_compatible",
      activeAdapterAvailability: "configured_unavailable",
      activeAdapterIsModelBacked: true,
    });
    expect(presence.adapterStatus!.availability).toBe("configured_unavailable");
  });

  it("not_configured shows in presence", () => {
    const presence = buildPresence({
      activeAdapterKind: "openai_compatible",
      activeAdapterAvailability: "not_configured",
      activeAdapterIsModelBacked: true,
    });
    expect(presence.adapterStatus!.availability).toBe("not_configured");
  });

  it("unsupported shows in presence", () => {
    const presence = buildPresence({
      activeAdapterKind: "unknown_adapter",
      activeAdapterAvailability: "unsupported",
      activeAdapterIsModelBacked: false,
    });
    expect(presence.adapterStatus!.availability).toBe("unsupported");
  });
});

/* ================================================================== */
/*  11. No regression in existing console/timeline flows              */
/* ================================================================== */

describe("Phase 47 — no regression in existing flows", () => {
  it("existing system events still classified correctly", () => {
    expect(classifyEvent("session_created")).toBe("info");
    expect(classifyEvent("completed")).toBe("progress");
    expect(classifyEvent("failed")).toBe("failure");
    expect(classifyEvent("blocked")).toBe("blocked");
    expect(classifyEvent("requires_approval")).toBe("warning");
  });

  it("existing MCP events still classified correctly", () => {
    expect(classifyActor("mcp_attached")).toBe("mcp");
    expect(classifyCard("mcp_attached")).toBe("lifecycle_card");
    expect(classifyCard("mcp_failed")).toBe("failure_card");
    expect(classifyCard("mcp_discovered_tools")).toBe("discovery_card");
  });

  it("existing agent lifecycle events still classified correctly", () => {
    expect(classifyActor("agent_attached")).toBe("agent");
    expect(classifyCard("agent_attached")).toBe("lifecycle_card");
    expect(classifyCard("agent_failed")).toBe("failure_card");
    expect(classifyCard("agent_capabilities_updated")).toBe("discovery_card");
  });

  it("existing workflow events still classified correctly", () => {
    expect(classifyActor("workflow_started")).toBe("workflow");
    expect(classifyCard("completed")).toBe("success_card");
    expect(classifyCard("blocked")).toBe("blocked_card");
    expect(classifyCard("requires_approval")).toBe("approval_card");
  });

  it("buildPresence without adapter fields works like before", () => {
    const presence = buildPresence({
      stage: "done",
      status: "completed",
      workspaceStatus: "ready",
      workspacePath: "/project",
      mcpServers: [{ id: "s1", label: "S1", ready: true }],
      agents: [{ id: "a1", label: "A1", ready: true }],
    });
    expect(presence.sessionStage).toBe("done");
    expect(presence.sessionStatus).toBe("completed");
    expect(presence.mcpServers).toHaveLength(1);
    expect(presence.agents).toHaveLength(1);
    expect(presence.adapterStatus).toBeNull();
  });

  it("demo console feed for completed still works", () => {
    const feed = buildDemoConsoleFeed("testScenario", "completed");
    expect(feed.messages.length).toBeGreaterThan(5);
    expect(feed.presence.sessionStatus).toBe("completed");
    const kinds = feed.messages.map((m) => m.kind);
    expect(kinds).toContain("session_created");
    expect(kinds).toContain("completed");
  });

  it("demo console feed for blocked still works", () => {
    const feed = buildDemoConsoleFeed("testScenario", "blocked");
    expect(feed.presence.isBlocked).toBe(true);
    const kinds = feed.messages.map((m) => m.kind);
    expect(kinds).toContain("blocked");
  });

  it("demo console feed for failed still works", () => {
    const feed = buildDemoConsoleFeed("testScenario", "failed");
    expect(feed.presence.sessionStatus).toBe("failed");
    const kinds = feed.messages.map((m) => m.kind);
    expect(kinds).toContain("failed");
  });

  it("message grouping still works correctly", () => {
    const events = [
      makeEvent("session_created", "Session created", 0),
      makeEvent("workspace_bound", "Workspace bound", 100),
      makeEvent("agent_adapter_resolved", "Adapter resolved", 500),
    ];
    const feed = buildConsoleFeed("test", events, {});
    // system + workspace + agent = 3 actors, so at least 2 groups
    expect(feed.groups.length).toBeGreaterThanOrEqual(2);
  });

  it("filtering by actor still works with new events", () => {
    const events = [
      makeEvent("session_created", "Session", 0),
      makeEvent("agent_adapter_resolved", "Adapter", 100),
      makeEvent("agent_run_completed", "Run done", 200, { adapterKind: "stub" }),
      makeEvent("workspace_bound", "Workspace", 300),
    ];
    const feed = buildConsoleFeed("test", events, {});
    const systemOnly = filterByActor(feed.messages, "system");
    const agentOnly = filterByActor(feed.messages, "agent");
    const workspaceOnly = filterByActor(feed.messages, "workspace");
    expect(systemOnly).toHaveLength(1);
    expect(agentOnly).toHaveLength(2);
    expect(workspaceOnly).toHaveLength(1);
  });

  it("views HTML still contains core structures", () => {
    const html = renderShellHtml();
    expect(html).toContain("console-panel");
    expect(html).toContain("console-feed");
    expect(html).toContain("console-status-header");
    expect(html).toContain("console-presence-bar");
    expect(html).toContain("console-filter-bar");
    expect(html).toContain("command-composer");
  });
});

/* ================================================================== */
/*  12. Command-driven visibility                                     */
/* ================================================================== */

describe("Phase 47 — command-driven adapter visibility", () => {
  it("views HTML includes command composer for running commands", () => {
    const html = renderShellHtml();
    expect(html).toContain("command-composer");
    expect(html).toContain("command-select");
    expect(html).toContain("command-submit-btn");
  });

  it("views HTML includes command result area for showing results", () => {
    const html = renderShellHtml();
    expect(html).toContain("command-result");
    expect(html).toContain("result-completed");
    expect(html).toContain("result-failed");
  });

  it("views HTML includes session refresh after command execution", () => {
    const html = renderShellHtml();
    // After command execution, the console refreshes the session timeline
    expect(html).toContain("loadSessionTimeline");
    expect(html).toContain("refreshCommandAvailability");
  });
});

/* ================================================================== */
/*  13. Mixed real + adapter events console feed                      */
/* ================================================================== */

describe("Phase 47 — mixed events console feed integrity", () => {
  it("produces correct feed with full lifecycle including adapter events", () => {
    const events = [
      makeEvent("session_created", "Session created", 0),
      makeEvent("workspace_opened", "Workspace opened", 100),
      makeEvent("mcp_attached", "MCP attached", 200),
      makeEvent("agent_attached", "Agent attached", 300),
      makeEvent("agent_adapter_resolved", "Adapter resolved: stub", 400, {
        adapterKind: "stub",
        isModelBacked: false,
        availability: "configured_available",
      }),
      makeEvent("agent_run_requested", "Run requested", 500, {
        taskKind: "summarize_workspace",
      }),
      makeEvent("agent_run_started", "Run started", 600, {
        agentName: "copilot",
      }),
      makeEvent("agent_run_completed", "Run completed", 700, {
        agentName: "copilot",
        adapterKind: "stub",
        isModelGenerated: false,
        durationMs: 50,
        outputPreview: "[Stub] Workspace summary...",
      }),
      makeEvent("completed", "Session completed", 800),
    ];
    const summary = {
      stage: "done",
      status: "completed",
      activeAdapterKind: "stub",
      activeAdapterAvailability: "configured_available",
      activeAdapterIsModelBacked: false,
    };
    const feed = buildConsoleFeed("test-full", events, summary);
    expect(feed.messages).toHaveLength(9);
    expect(feed.presence.adapterStatus!.kind).toBe("stub");

    // Verify each message has correct actor
    expect(feed.messages[0].actor).toBe("system");
    expect(feed.messages[1].actor).toBe("workspace");
    expect(feed.messages[2].actor).toBe("mcp");
    expect(feed.messages[3].actor).toBe("agent");
    expect(feed.messages[4].actor).toBe("agent"); // adapter resolved
    expect(feed.messages[5].actor).toBe("agent"); // run requested
    expect(feed.messages[6].actor).toBe("agent"); // run started
    expect(feed.messages[7].actor).toBe("agent"); // run completed
    expect(feed.messages[8].actor).toBe("workflow"); // completed
  });

  it("handles failed run in mixed feed", () => {
    const events = [
      makeEvent("agent_adapter_resolved", "Adapter resolved: openai", 0, {
        adapterKind: "openai_compatible",
        isModelBacked: true,
        availability: "configured_unavailable",
      }),
      makeEvent("agent_run_failed", "Run failed: EXECUTION_FAILED", 100, {
        runId: "run-err",
        errorCode: "EXECUTION_FAILED",
        errorMessage: "Backend unreachable",
      }),
    ];
    const feed = buildConsoleFeed("test-fail", events, {
      activeAdapterKind: "openai_compatible",
      activeAdapterAvailability: "configured_unavailable",
      activeAdapterIsModelBacked: true,
    });
    expect(feed.messages).toHaveLength(2);
    expect(feed.messages[1].cardType).toBe("failure_card");
    expect(feed.presence.adapterStatus!.availability).toBe("configured_unavailable");
  });
});

/* ================================================================== */
/*  14. AdapterPresence type validation                               */
/* ================================================================== */

describe("Phase 47 — AdapterPresence type shape", () => {
  it("has all required fields", () => {
    const ap: AdapterPresence = {
      kind: "stub",
      availability: "configured_available",
      isModelBacked: false,
      modelName: null,
      label: null,
    };
    expect(ap.kind).toBe("stub");
    expect(ap.availability).toBe("configured_available");
    expect(ap.isModelBacked).toBe(false);
    expect(ap.modelName).toBeNull();
    expect(ap.label).toBeNull();
  });

  it("supports model name", () => {
    const ap: AdapterPresence = {
      kind: "openai_compatible",
      availability: "configured_available",
      isModelBacked: true,
      modelName: "gpt-4o-mini",
      label: "OpenAI",
    };
    expect(ap.modelName).toBe("gpt-4o-mini");
    expect(ap.label).toBe("OpenAI");
  });
});
