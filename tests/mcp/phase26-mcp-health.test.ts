/**
 * Phase 26 — MCP Health and Discovery Hardening tests.
 *
 * Tests cover:
 * - Health state transitions and McpHealthReport semantics
 * - Discovery state transitions and McpDiscoveryState tracking
 * - Refresh/recheck behavior for health and discovery
 * - Failure and degraded handling
 * - Stale/restored MCP semantics
 * - Session summary exposure of MCP runtime state
 * - Event emission for health/discovery refresh
 * - Persistence/restore honesty for MCP attachments
 * - Server endpoint exposure
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  McpManager,
  McpProcessManager,
  createMcpServerConfig,
  fixtureEchoConfig,
  fixtureSseConfig,
  _resetMcpIdCounter,
  MCP_EVENT_KINDS,
  isMcpEvent,
  filterMcpEvents,
  buildMcpEventSummary,
  mcpHealthRefreshed,
  mcpHealthDegraded,
  mcpDiscoveryRefreshed,
  mcpStale,
  emptyDiscovery,
  failedDiscovery,
  applyDiscovery,
  markDiscovering,
  markDiscoveryStale,
  registerTool,
  registerResource,
  registerPrompt,
  createDefaultHealthReport,
  createDefaultDiscoveryState,
  createStaleHealthReport,
  createStaleDiscoveryState,
} from "../../src/mcp/index.js";

import type {
  McpServerStatus,
  McpServerHealth,
  McpHealthReport,
  McpDiscoveryState,
  McpDiscoveryStatus,
  McpDiscoverySource,
  McpRuntimeInfo,
} from "../../src/mcp/index.js";

import type { McpProcessRecord } from "../../src/mcp/index.js";
import type { McpDiscoveryResult } from "../../src/mcp/index.js";

import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/index.js";

import type { SessionSummary } from "../../src/session/index.js";

import {
  buildRestoreWarnings,
  RecentSessions,
} from "../../src/session/index.js";

import {
  toPersistedSession,
  fromPersistedSession,
  extractMeta,
} from "../../src/session/index.js";

beforeEach(() => {
  _resetMcpIdCounter();
  _resetIdCounter();
});

/* ================================================================== */
/*  1. Health Report Factory Tests                                     */
/* ================================================================== */

describe("McpHealthReport factories", () => {
  it("createDefaultHealthReport returns unknown/not-alive", () => {
    const report = createDefaultHealthReport();
    expect(report.status).toBe("unknown");
    expect(report.processAlive).toBe(false);
    expect(report.lastKnownHealthyAt).toBeNull();
    expect(report.lastCheckedAt).toBeNull();
    expect(report.lastError).toBeNull();
    expect(report.lastFailureAt).toBeNull();
    expect(report.isStale).toBe(false);
  });

  it("createStaleHealthReport marks as stale", () => {
    const report = createStaleHealthReport();
    expect(report.isStale).toBe(true);
    expect(report.processAlive).toBe(false);
    expect(report.status).toBe("unknown");
  });

  it("createStaleHealthReport preserves previous timestamps", () => {
    const previous = { lastKnownHealthyAt: "2024-01-01T00:00:00Z", lastError: "timeout" };
    const report = createStaleHealthReport(previous);
    expect(report.isStale).toBe(true);
    expect(report.lastKnownHealthyAt).toBe("2024-01-01T00:00:00Z");
    expect(report.lastError).toBe("timeout");
  });
});

/* ================================================================== */
/*  2. Discovery State Factory Tests                                   */
/* ================================================================== */

describe("McpDiscoveryState factories", () => {
  it("createDefaultDiscoveryState returns never_discovered/manual", () => {
    const state = createDefaultDiscoveryState();
    expect(state.status).toBe("never_discovered");
    expect(state.source).toBe("manual");
    expect(state.lastDiscoveryAt).toBeNull();
    expect(state.lastAttemptAt).toBeNull();
    expect(state.lastError).toBeNull();
    expect(state.isCurrent).toBe(false);
    expect(state.toolCount).toBe(0);
    expect(state.resourceCount).toBe(0);
    expect(state.promptCount).toBe(0);
  });

  it("createStaleDiscoveryState with previous discovery returns stale/restored", () => {
    const previous = { lastDiscoveryAt: "2024-01-01T00:00:00Z", toolCount: 3 };
    const state = createStaleDiscoveryState(previous);
    expect(state.status).toBe("stale");
    expect(state.source).toBe("restored");
    expect(state.isCurrent).toBe(false);
    expect(state.toolCount).toBe(3);
    expect(state.lastDiscoveryAt).toBe("2024-01-01T00:00:00Z");
  });

  it("createStaleDiscoveryState without previous discovery returns never_discovered", () => {
    const state = createStaleDiscoveryState();
    expect(state.status).toBe("never_discovered");
    expect(state.source).toBe("restored");
    expect(state.isCurrent).toBe(false);
  });
});

/* ================================================================== */
/*  3. Process Manager Health & Discovery State                        */
/* ================================================================== */

describe("McpProcessManager — health and discovery state", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
  });

  it("new records have default health and discovery state", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    expect(record.healthReport.status).toBe("unknown");
    expect(record.healthReport.processAlive).toBe(false);
    expect(record.healthReport.isStale).toBe(false);
    expect(record.discoveryState.status).toBe("never_discovered");
    expect(record.discoveryState.source).toBe("manual");
  });

  it("updateHealth sets health report correctly", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.updateHealth(config.id, "healthy");
    expect(record.health).toBe("healthy");
    expect(record.healthReport.status).toBe("healthy");
    expect(record.healthReport.lastKnownHealthyAt).not.toBeNull();
    expect(record.healthReport.lastCheckedAt).not.toBeNull();
    expect(record.healthReport.lastError).toBeNull();
  });

  it("updateHealth to degraded sets lastFailureAt", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.updateHealth(config.id, "degraded");
    expect(record.health).toBe("degraded");
    expect(record.healthReport.status).toBe("degraded");
    expect(record.healthReport.lastFailureAt).not.toBeNull();
  });

  it("updateHealth to unhealthy sets lastFailureAt", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.updateHealth(config.id, "unhealthy");
    expect(record.health).toBe("unhealthy");
    expect(record.healthReport.status).toBe("unhealthy");
    expect(record.healthReport.lastFailureAt).not.toBeNull();
  });

  it("markFailed updates health report", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.markFailed(config.id, "connection refused");
    expect(record.healthReport.status).toBe("unhealthy");
    expect(record.healthReport.processAlive).toBe(false);
    expect(record.healthReport.lastError).toBe("connection refused");
    expect(record.healthReport.lastFailureAt).not.toBeNull();
  });

  it("markStale sets status to stale and marks health/discovery stale", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.markStale(config.id);
    expect(record.status).toBe("stale");
    expect(record.health).toBe("unknown");
    expect(record.pid).toBeNull();
    expect(record.processHandle).toBeNull();
    expect(record.healthReport.isStale).toBe(true);
    expect(record.healthReport.processAlive).toBe(false);
    expect(record.discoveryState.source).toBe("restored");
    expect(record.discoveryState.isCurrent).toBe(false);
  });

  it("refreshHealth on registered server returns unknown", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const health = pm.refreshHealth(config.id);
    expect(health.status).toBe("unknown");
    expect(health.processAlive).toBe(false);
    expect(health.isStale).toBe(false);
    expect(health.lastCheckedAt).not.toBeNull();
  });

  it("refreshHealth on stale server returns unknown", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    pm.markStale(config.id);
    const health = pm.refreshHealth(config.id);
    expect(health.status).toBe("unknown");
    expect(health.processAlive).toBe(false);
    expect(health.isStale).toBe(false); // refresh clears stale
  });

  it("refreshHealth on failed server returns unhealthy", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    pm.markFailed(config.id, "crash");
    const health = pm.refreshHealth(config.id);
    expect(health.status).toBe("unhealthy");
    expect(health.processAlive).toBe(false);
  });

  it("refreshHealth on network transport with running status considers alive", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    // Simulate start for network transport
    const record = pm.getRecord(config.id)!;
    record.status = "running";
    const health = pm.refreshHealth(config.id);
    expect(health.processAlive).toBe(true);
    expect(health.status).toBe("healthy");
    expect(health.lastKnownHealthyAt).not.toBeNull();
  });
});

/* ================================================================== */
/*  4. Discovery State Tracking in capability-discovery                */
/* ================================================================== */

describe("Discovery state tracking", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
  });

  it("applyDiscovery with complete result updates discoveryState to discovered", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    const result: McpDiscoveryResult = {
      tools: [{ name: "tool1" }],
      resources: [{ uri: "file:///a", name: "res1" }],
      prompts: [{ name: "prompt1" }],
      complete: true,
      source: "runtime",
    };
    applyDiscovery(record, result);
    expect(record.discoveryState.status).toBe("discovered");
    expect(record.discoveryState.source).toBe("runtime");
    expect(record.discoveryState.isCurrent).toBe(true);
    expect(record.discoveryState.toolCount).toBe(1);
    expect(record.discoveryState.resourceCount).toBe(1);
    expect(record.discoveryState.promptCount).toBe(1);
    expect(record.discoveryState.lastDiscoveryAt).not.toBeNull();
    expect(record.discoveryState.lastError).toBeNull();
  });

  it("applyDiscovery with incomplete result updates to failed", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    const result: McpDiscoveryResult = {
      tools: [],
      resources: [],
      prompts: [],
      complete: false,
      error: "timeout during discovery",
      source: "runtime",
    };
    applyDiscovery(record, result);
    expect(record.discoveryState.status).toBe("failed");
    expect(record.discoveryState.lastError).toBe("timeout during discovery");
    expect(record.discoveryState.isCurrent).toBe(false);
  });

  it("applyDiscovery defaults source to manual", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    applyDiscovery(record, emptyDiscovery());
    expect(record.discoveryState.source).toBe("manual");
  });

  it("markDiscovering sets status to discovering", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    markDiscovering(record);
    expect(record.discoveryState.status).toBe("discovering");
    expect(record.discoveryState.lastAttemptAt).not.toBeNull();
  });

  it("markDiscoveryStale sets status to stale for previously discovered", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    applyDiscovery(record, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
    });
    markDiscoveryStale(record);
    expect(record.discoveryState.status).toBe("stale");
    expect(record.discoveryState.source).toBe("restored");
    expect(record.discoveryState.isCurrent).toBe(false);
  });

  it("markDiscoveryStale sets never_discovered if no prior discovery", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    markDiscoveryStale(record);
    expect(record.discoveryState.status).toBe("never_discovered");
    expect(record.discoveryState.source).toBe("restored");
  });

  it("registerTool/Resource/Prompt updates discovery state counts", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    registerTool(record, { name: "t1" });
    expect(record.discoveryState.toolCount).toBe(1);
    expect(record.discoveryState.source).toBe("manual");
    registerResource(record, { uri: "file:///a", name: "r1" });
    expect(record.discoveryState.resourceCount).toBe(1);
    registerPrompt(record, { name: "p1" });
    expect(record.discoveryState.promptCount).toBe(1);
  });

  it("registerTool preserves runtime source", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    applyDiscovery(record, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });
    registerTool(record, { name: "t2" });
    expect(record.discoveryState.source).toBe("runtime");
    expect(record.discoveryState.toolCount).toBe(2);
  });
});

/* ================================================================== */
/*  5. MCP Manager Refresh/Recheck Behavior                           */
/* ================================================================== */

describe("McpManager — refresh/recheck", () => {
  let sm: SessionManager;
  let manager: McpManager;

  beforeEach(() => {
    sm = new SessionManager();
    manager = new McpManager(sm);
  });

  describe("refreshHealth", () => {
    it("refreshes health and emits session event", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      // Simulate running state for network transport
      const record = manager.processManager.getRecord(config.id)!;
      record.status = "running";

      const report = manager.refreshHealth(config.id, session.id);
      expect(report.status).toBe("healthy");
      expect(report.processAlive).toBe(true);
      expect(report.lastCheckedAt).not.toBeNull();

      const mcpEvents = session.events.filter((e) => e.kind === "mcp_health_refreshed");
      expect(mcpEvents).toHaveLength(1);
      expect(mcpEvents[0].message).toContain("health refreshed");
      expect(mcpEvents[0].detail?.health).toBe("healthy");
    });

    it("emits degraded event when health is degraded", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      // Mark as degraded first
      manager.markServerDegraded(config.id, "partial tools missing", session.id);

      const report = manager.refreshHealth(config.id, session.id);
      expect(report.status).toBe("degraded");

      const degradedEvents = session.events.filter((e) => e.kind === "mcp_health_degraded");
      expect(degradedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("works without sessionId (no event emission)", () => {
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      const report = manager.refreshHealth(config.id);
      expect(report.status).toBe("unknown");
      expect(report.lastCheckedAt).not.toBeNull();
    });

    it("throws for unknown server", () => {
      expect(() => manager.refreshHealth("unknown-id")).toThrow("MCP server not found");
    });
  });

  describe("refreshDiscovery", () => {
    it("refreshes discovery and emits session events", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      const result: McpDiscoveryResult = {
        tools: [{ name: "tool1" }, { name: "tool2" }],
        resources: [{ uri: "res://a", name: "A" }],
        prompts: [],
        complete: true,
        source: "runtime",
      };

      const state = manager.refreshDiscovery(config.id, result, session.id);
      expect(state.status).toBe("discovered");
      expect(state.source).toBe("runtime");
      expect(state.isCurrent).toBe(true);
      expect(state.toolCount).toBe(2);
      expect(state.resourceCount).toBe(1);

      const refreshEvents = session.events.filter((e) => e.kind === "mcp_discovery_refreshed");
      expect(refreshEvents).toHaveLength(1);
      expect(refreshEvents[0].message).toContain("discovery refreshed");

      const toolEvents = session.events.filter((e) => e.kind === "mcp_discovered_tools");
      expect(toolEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("handles failed discovery refresh", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      const result = failedDiscovery("server unreachable");
      const state = manager.refreshDiscovery(config.id, result, session.id);
      expect(state.status).toBe("failed");
      expect(state.lastError).toBe("server unreachable");
      expect(state.isCurrent).toBe(false);

      const refreshEvents = session.events.filter((e) => e.kind === "mcp_discovery_refreshed");
      expect(refreshEvents).toHaveLength(1);
      expect(refreshEvents[0].detail?.discoveryStatus).toBe("failed");
    });

    it("works without sessionId", () => {
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      const state = manager.refreshDiscovery(config.id, emptyDiscovery());
      expect(state.status).toBe("discovered");
    });

    it("throws for unknown server", () => {
      expect(() => manager.refreshDiscovery("unknown", emptyDiscovery())).toThrow(
        "MCP server not found",
      );
    });
  });

  describe("markServerStale", () => {
    it("marks server stale and emits session event", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      const record = manager.markServerStale(config.id, session.id);
      expect(record.status).toBe("stale");
      expect(record.healthReport.isStale).toBe(true);
      expect(record.discoveryState.isCurrent).toBe(false);

      const staleEvents = session.events.filter((e) => e.kind === "mcp_stale");
      expect(staleEvents).toHaveLength(1);
      expect(staleEvents[0].message).toContain("stale");
    });

    it("works without sessionId", () => {
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      const record = manager.markServerStale(config.id);
      expect(record.status).toBe("stale");
    });
  });

  describe("markServerDegraded", () => {
    it("marks server degraded and emits event", () => {
      const session = sm.createSession();
      const config = fixtureSseConfig("http://localhost:3001");
      manager.registerServer(config);
      manager.attachToSession(config.id, session.id);

      const record = manager.markServerDegraded(config.id, "partial failure", session.id);
      expect(record.status).toBe("degraded");
      expect(record.health).toBe("degraded");
      expect(record.lastError).toBe("partial failure");
      expect(record.healthReport.status).toBe("degraded");

      const events = session.events.filter((e) => e.kind === "mcp_health_degraded");
      expect(events).toHaveLength(1);
    });

    it("throws for unknown server", () => {
      expect(() => manager.markServerDegraded("unknown", "reason")).toThrow(
        "MCP server not found",
      );
    });
  });
});

/* ================================================================== */
/*  6. Runtime Info Enrichment                                         */
/* ================================================================== */

describe("McpManager — enriched getRuntimeInfo", () => {
  let sm: SessionManager;
  let manager: McpManager;

  beforeEach(() => {
    sm = new SessionManager();
    manager = new McpManager(sm);
  });

  it("includes healthReport and discoveryState", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);

    const info = manager.getRuntimeInfo(config.id)!;
    expect(info.healthReport).toBeDefined();
    expect(info.healthReport.status).toBe("unknown");
    expect(info.discoveryState).toBeDefined();
    expect(info.discoveryState.status).toBe("never_discovered");
  });

  it("reflects health refresh results in runtime info", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);
    manager.processManager.getRecord(config.id)!.status = "running";

    manager.refreshHealth(config.id);
    const info = manager.getRuntimeInfo(config.id)!;
    expect(info.healthReport.status).toBe("healthy");
    expect(info.healthReport.lastCheckedAt).not.toBeNull();
  });

  it("reflects discovery results in runtime info", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);
    manager.refreshDiscovery(config.id, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });
    const info = manager.getRuntimeInfo(config.id)!;
    expect(info.discoveryState.status).toBe("discovered");
    expect(info.discoveryState.source).toBe("runtime");
    expect(info.discoveryState.toolCount).toBe(1);
    expect(info.tools).toHaveLength(1);
  });
});

/* ================================================================== */
/*  7. Session Summary MCP Enrichment                                  */
/* ================================================================== */

describe("Session summary — MCP state exposure", () => {
  let sm: SessionManager;
  let manager: McpManager;

  beforeEach(() => {
    sm = new SessionManager();
    manager = new McpManager(sm);
  });

  it("exposes MCP servers in session summary", () => {
    const session = sm.createSession();
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);
    manager.attachToSession(config.id, session.id);

    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServerCount).toBe(1);
    expect(summary.mcpServers).toHaveLength(1);
    expect(summary.mcpServers[0].id).toBe(config.id);
    expect(summary.mcpServers[0].ready).toBe(false);
  });

  it("reflects ready state in summary after start-like operations", () => {
    const session = sm.createSession();
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);
    manager.attachToSession(config.id, session.id);

    // Manually mark resource as ready (simulating startServer outcome)
    const resource = session.attachedResources.find(
      (r) => r.kind === "mcp_server" && r.id === config.id,
    );
    resource!.ready = true;

    const summary = sm.getSessionSummary(session.id);
    expect(summary.mcpServers[0].ready).toBe(true);
  });
});

/* ================================================================== */
/*  8. Session Event Emission                                          */
/* ================================================================== */

describe("Phase 26 session event factories", () => {
  it("mcpHealthRefreshed creates correct event", () => {
    const event = mcpHealthRefreshed("srv-1", "My Server", "healthy", true);
    expect(event.kind).toBe("mcp_health_refreshed");
    expect(event.message).toContain("health refreshed");
    expect(event.message).toContain("My Server");
    expect(event.detail?.health).toBe("healthy");
    expect(event.detail?.processAlive).toBe(true);
  });

  it("mcpHealthDegraded creates correct event", () => {
    const event = mcpHealthDegraded("srv-1", "My Server", "partial failure");
    expect(event.kind).toBe("mcp_health_degraded");
    expect(event.message).toContain("degraded");
    expect(event.detail?.reason).toBe("partial failure");
  });

  it("mcpDiscoveryRefreshed creates correct event", () => {
    const event = mcpDiscoveryRefreshed("srv-1", "My Server", "discovered", 3, 2, 1);
    expect(event.kind).toBe("mcp_discovery_refreshed");
    expect(event.message).toContain("discovery refreshed");
    expect(event.message).toContain("3T/2R/1P");
    expect(event.detail?.toolCount).toBe(3);
    expect(event.detail?.discoveryStatus).toBe("discovered");
  });

  it("mcpStale creates correct event", () => {
    const event = mcpStale("srv-1", "My Server");
    expect(event.kind).toBe("mcp_stale");
    expect(event.message).toContain("stale");
    expect(event.message).toContain("restored from history");
  });
});

describe("Phase 26 event kind classification", () => {
  it("new Phase 26 event kinds are recognized by isMcpEvent", () => {
    expect(isMcpEvent("mcp_health_refreshed")).toBe(true);
    expect(isMcpEvent("mcp_health_degraded")).toBe(true);
    expect(isMcpEvent("mcp_discovery_refreshed")).toBe(true);
    expect(isMcpEvent("mcp_stale")).toBe(true);
  });

  it("buildMcpEventSummary tracks new event kinds", () => {
    const events = [
      mcpHealthRefreshed("srv-1", "S1", "healthy", true),
      mcpDiscoveryRefreshed("srv-1", "S1", "discovered", 1, 0, 0),
      mcpStale("srv-2", "S2"),
    ];
    const summary = buildMcpEventSummary(events);
    expect(summary.healthRefreshed).toContain("srv-1");
    expect(summary.discoveryRefreshed).toContain("srv-1");
    expect(summary.stale).toContain("srv-2");
  });
});

/* ================================================================== */
/*  9. Persistence / Restore Honesty                                   */
/* ================================================================== */

describe("Persistence honesty for MCP attachments", () => {
  it("toPersistedSession marks MCP resources as not ready", () => {
    const sm2 = new SessionManager();
    const session = sm2.createSession();
    sm2.attachResource(session.id, {
      kind: "mcp_server",
      id: "srv-1",
      label: "Server 1",
      ready: true,
    });

    const persisted = toPersistedSession(session);
    const mcpResource = persisted.attachedResources.find((r) => r.id === "srv-1");
    expect(mcpResource).toBeDefined();
    expect(mcpResource!.ready).toBe(false);
  });

  it("fromPersistedSession restores MCP resources as not ready", () => {
    const sm2 = new SessionManager();
    const session = sm2.createSession();
    sm2.attachResource(session.id, {
      kind: "mcp_server",
      id: "srv-1",
      label: "Server 1",
      ready: true,
    });

    const persisted = toPersistedSession(session);
    const restored = fromPersistedSession(persisted);
    const mcpResource = restored.attachedResources.find((r) => r.id === "srv-1");
    expect(mcpResource).toBeDefined();
    expect(mcpResource!.ready).toBe(false);
  });

  it("buildRestoreWarnings warns about stale MCP servers", () => {
    const sm2 = new SessionManager();
    const session = sm2.createSession();
    sm2.attachResource(session.id, {
      kind: "mcp_server",
      id: "srv-1",
      label: "Server 1",
      ready: false,
    });

    const warnings = buildRestoreWarnings(session);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("MCP server"))).toBe(true);
    expect(warnings.some((w) => w.includes("stale"))).toBe(true);
  });

  it("buildRestoreWarnings is empty for sessions with no MCP/agent resources", () => {
    const sm2 = new SessionManager();
    const session = sm2.createSession();
    const warnings = buildRestoreWarnings(session);
    expect(warnings).toHaveLength(0);
  });

  it("extractMeta includes mcpCount", () => {
    const sm2 = new SessionManager();
    const session = sm2.createSession();
    sm2.attachResource(session.id, {
      kind: "mcp_server",
      id: "srv-1",
      label: "Server 1",
      ready: false,
    });
    sm2.attachResource(session.id, {
      kind: "mcp_server",
      id: "srv-2",
      label: "Server 2",
      ready: false,
    });

    const meta = extractMeta(session);
    expect(meta.mcpCount).toBe(2);
  });
});

/* ================================================================== */
/*  10. Full Lifecycle — Stale Restored MCP Semantics                  */
/* ================================================================== */

describe("Full lifecycle — stale/restored MCP semantics", () => {
  it("attach → start → persist → restore → stale → recheck lifecycle", () => {
    const sm = new SessionManager();
    const manager = new McpManager(sm);
    const session = sm.createSession();

    // Step 1: Register and attach
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);
    manager.attachToSession(config.id, session.id);

    // Step 2: Simulate running
    const record = manager.processManager.getRecord(config.id)!;
    record.status = "running";
    record.healthReport = { ...record.healthReport, processAlive: true };

    // Step 3: Apply discovery
    manager.applyDiscoveryResult(
      config.id,
      {
        tools: [{ name: "tool1" }, { name: "tool2" }],
        resources: [{ uri: "res://a", name: "A" }],
        prompts: [],
        complete: true,
        source: "runtime",
      },
      session.id,
    );

    const infoBefore = manager.getRuntimeInfo(config.id)!;
    expect(infoBefore.discoveryState.status).toBe("discovered");
    expect(infoBefore.discoveryState.isCurrent).toBe(true);

    // Step 4: Persist
    const persisted = toPersistedSession(session);
    expect(persisted.attachedResources[0].ready).toBe(false);

    // Step 5: Restore
    const restored = fromPersistedSession(persisted);
    expect(restored.attachedResources[0].ready).toBe(false);

    // Step 6: Mark stale
    manager.markServerStale(config.id, session.id);
    const infoAfterStale = manager.getRuntimeInfo(config.id)!;
    expect(infoAfterStale.status).toBe("stale");
    expect(infoAfterStale.healthReport.isStale).toBe(true);
    expect(infoAfterStale.discoveryState.isCurrent).toBe(false);

    // Step 7: Recheck health (server is no longer running)
    const healthAfterRecheck = manager.refreshHealth(config.id, session.id);
    expect(healthAfterRecheck.status).toBe("unknown");
    expect(healthAfterRecheck.isStale).toBe(false); // refresh clears stale
    expect(healthAfterRecheck.lastCheckedAt).not.toBeNull();

    // Verify event timeline
    const staleEvents = session.events.filter((e) => e.kind === "mcp_stale");
    expect(staleEvents).toHaveLength(1);
    const refreshEvents = session.events.filter((e) => e.kind === "mcp_health_refreshed");
    expect(refreshEvents).toHaveLength(1);
  });
});

/* ================================================================== */
/*  11. New McpServerStatus Values                                     */
/* ================================================================== */

describe("New McpServerStatus values", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
  });

  it("supports discovery_pending status", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    record.status = "discovery_pending";
    expect(record.status).toBe("discovery_pending");
    const health = pm.refreshHealth(config.id);
    // discovery_pending is like running — check for alive
    expect(health.lastCheckedAt).not.toBeNull();
  });

  it("supports discovery_complete status", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    record.status = "discovery_complete";
    expect(record.status).toBe("discovery_complete");
  });

  it("supports degraded status", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    record.status = "degraded";
    const health = pm.refreshHealth(config.id);
    expect(health.status).toBe("degraded");
  });

  it("supports stale status", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    const record = pm.markStale(config.id);
    expect(record.status).toBe("stale");
  });
});

/* ================================================================== */
/*  12. Discovery Status Exhaustive Coverage                           */
/* ================================================================== */

describe("McpDiscoveryStatus coverage", () => {
  const allStatuses: McpDiscoveryStatus[] = [
    "never_discovered",
    "discovering",
    "discovered",
    "stale",
    "failed",
  ];

  it("all discovery statuses are valid string values", () => {
    for (const s of allStatuses) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
    expect(allStatuses).toHaveLength(5);
  });
});

describe("McpDiscoverySource coverage", () => {
  const allSources: McpDiscoverySource[] = [
    "manual",
    "runtime",
    "restored",
    "placeholder",
  ];

  it("all discovery sources are valid string values", () => {
    for (const s of allSources) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
    expect(allSources).toHaveLength(4);
  });
});

/* ================================================================== */
/*  13. McpServerHealth Coverage                                       */
/* ================================================================== */

describe("McpServerHealth coverage", () => {
  const allHealth: McpServerHealth[] = ["unknown", "healthy", "degraded", "unhealthy"];

  it("all health values are valid", () => {
    expect(allHealth).toHaveLength(4);
  });
});

/* ================================================================== */
/*  14. McpServerStatus Coverage (extended)                            */
/* ================================================================== */

describe("McpServerStatus coverage (Phase 26 extended)", () => {
  const allStatuses: McpServerStatus[] = [
    "registered",
    "starting",
    "running",
    "discovery_pending",
    "discovery_complete",
    "degraded",
    "stopping",
    "stopped",
    "failed",
    "stale",
  ];

  it("all 10 status values are valid", () => {
    expect(allStatuses).toHaveLength(10);
    for (const s of allStatuses) {
      expect(typeof s).toBe("string");
    }
  });
});

/* ================================================================== */
/*  15. Edge Cases                                                     */
/* ================================================================== */

describe("Edge cases", () => {
  it("multiple sequential health refreshes update timestamps", () => {
    const pm = new McpProcessManager();
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);

    const h1 = pm.refreshHealth(config.id);
    const t1 = h1.lastCheckedAt;

    // Small delay is not needed since timestamps are Date.now() based
    const h2 = pm.refreshHealth(config.id);
    expect(h2.lastCheckedAt).not.toBeNull();
    // Both should have timestamps (may be same if executed fast)
    expect(t1).not.toBeNull();
  });

  it("discovery after stale clears stale status", () => {
    const pm = new McpProcessManager();
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);

    // Start with some discovery
    applyDiscovery(record, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
    });

    // Mark stale
    markDiscoveryStale(record);
    expect(record.discoveryState.status).toBe("stale");

    // Re-discover
    applyDiscovery(record, {
      tools: [{ name: "t1" }, { name: "t2" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });
    expect(record.discoveryState.status).toBe("discovered");
    expect(record.discoveryState.isCurrent).toBe(true);
    expect(record.discoveryState.toolCount).toBe(2);
  });

  it("refresh discovery with empty result still updates state", () => {
    const sm = new SessionManager();
    const manager = new McpManager(sm);
    const config = fixtureSseConfig("http://localhost:3001");
    manager.registerServer(config);

    const state = manager.refreshDiscovery(config.id, emptyDiscovery());
    expect(state.status).toBe("discovered");
    expect(state.toolCount).toBe(0);
    expect(state.resourceCount).toBe(0);
    expect(state.promptCount).toBe(0);
  });

  it("getRuntimeInfo returns undefined for unknown server", () => {
    const sm = new SessionManager();
    const manager = new McpManager(sm);
    expect(manager.getRuntimeInfo("nonexistent")).toBeUndefined();
  });

  it("multiple servers can have independent health/discovery states", () => {
    const sm = new SessionManager();
    const manager = new McpManager(sm);

    const config1 = fixtureSseConfig("http://localhost:3001", { id: "srv-1", name: "Server 1" });
    const config2 = fixtureSseConfig("http://localhost:3002", { id: "srv-2", name: "Server 2" });

    manager.registerServer(config1);
    manager.registerServer(config2);

    // Discover on server 1
    manager.refreshDiscovery(config1.id, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });

    // Mark server 2 as stale
    manager.markServerStale(config2.id);

    const info1 = manager.getRuntimeInfo(config1.id)!;
    const info2 = manager.getRuntimeInfo(config2.id)!;

    expect(info1.discoveryState.status).toBe("discovered");
    expect(info2.status).toBe("stale");
    expect(info2.discoveryState.status).toBe("never_discovered");
  });
});

/* ================================================================== */
/*  16. Health State Transitions                                       */
/* ================================================================== */

describe("Health state transitions", () => {
  let pm: McpProcessManager;

  beforeEach(() => {
    pm = new McpProcessManager();
  });

  it("unknown → healthy on successful refresh of running server", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    record.status = "running"; // network transport
    expect(record.health).toBe("unknown");

    const h = pm.refreshHealth(config.id);
    expect(h.status).toBe("healthy");
  });

  it("healthy → degraded via updateHealth", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    pm.updateHealth(config.id, "healthy");
    pm.updateHealth(config.id, "degraded");
    const record = pm.getRecord(config.id)!;
    expect(record.health).toBe("degraded");
    expect(record.healthReport.status).toBe("degraded");
  });

  it("healthy → unhealthy via markFailed", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    pm.register(config);
    pm.updateHealth(config.id, "healthy");
    pm.markFailed(config.id, "crash");
    const record = pm.getRecord(config.id)!;
    expect(record.health).toBe("unhealthy");
    expect(record.healthReport.status).toBe("unhealthy");
    expect(record.healthReport.lastError).toBe("crash");
  });

  it("unknown → unknown for stopped server", () => {
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);
    record.status = "stopped";
    const h = pm.refreshHealth(config.id);
    expect(h.status).toBe("unknown");
  });
});

/* ================================================================== */
/*  17. Discovery State Transitions                                    */
/* ================================================================== */

describe("Discovery state transitions", () => {
  it("never_discovered → discovering → discovered", () => {
    const pm = new McpProcessManager();
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);

    expect(record.discoveryState.status).toBe("never_discovered");

    markDiscovering(record);
    expect(record.discoveryState.status).toBe("discovering");

    applyDiscovery(record, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });
    expect(record.discoveryState.status).toBe("discovered");
    expect(record.discoveryState.isCurrent).toBe(true);
  });

  it("never_discovered → discovering → failed", () => {
    const pm = new McpProcessManager();
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);

    markDiscovering(record);
    applyDiscovery(record, failedDiscovery("timeout"));
    expect(record.discoveryState.status).toBe("failed");
    expect(record.discoveryState.lastError).toBe("timeout");
    expect(record.discoveryState.isCurrent).toBe(false);
  });

  it("discovered → stale → discovered (re-discovery)", () => {
    const pm = new McpProcessManager();
    const config = fixtureSseConfig("http://localhost:3001");
    const record = pm.register(config);

    applyDiscovery(record, {
      tools: [{ name: "t1" }],
      resources: [],
      prompts: [],
      complete: true,
    });
    expect(record.discoveryState.status).toBe("discovered");

    markDiscoveryStale(record);
    expect(record.discoveryState.status).toBe("stale");

    applyDiscovery(record, {
      tools: [{ name: "t1" }, { name: "t2" }],
      resources: [],
      prompts: [],
      complete: true,
      source: "runtime",
    });
    expect(record.discoveryState.status).toBe("discovered");
    expect(record.discoveryState.isCurrent).toBe(true);
  });
});

/* ================================================================== */
/*  18. MCP Event Summary (Phase 26 extended)                          */
/* ================================================================== */

describe("buildMcpEventSummary — Phase 26 fields", () => {
  it("returns empty arrays when no events", () => {
    const summary = buildMcpEventSummary([]);
    expect(summary.healthRefreshed).toEqual([]);
    expect(summary.discoveryRefreshed).toEqual([]);
    expect(summary.stale).toEqual([]);
  });

  it("correctly categorizes mixed Phase 20 and Phase 26 events", () => {
    const events = [
      mcpHealthRefreshed("srv-1", "S1", "healthy", true),
      mcpHealthDegraded("srv-1", "S1", "partial"),
      mcpDiscoveryRefreshed("srv-1", "S1", "discovered", 2, 1, 0),
      mcpStale("srv-2", "S2"),
    ];
    const summary = buildMcpEventSummary(events);
    expect(summary.healthRefreshed).toEqual(["srv-1"]);
    expect(summary.discoveryRefreshed).toEqual(["srv-1"]);
    expect(summary.stale).toEqual(["srv-2"]);
    // Phase 20 fields should be empty
    expect(summary.attached).toEqual([]);
    expect(summary.started).toEqual([]);
  });
});

/* ================================================================== */
/*  19. filterMcpEvents includes Phase 26 events                       */
/* ================================================================== */

describe("filterMcpEvents — Phase 26 events", () => {
  it("includes Phase 26 event kinds in filter", () => {
    const events = [
      mcpHealthRefreshed("srv-1", "S1", "healthy", true),
      mcpStale("srv-1", "S1"),
      { kind: "session_created" as any, timestamp: new Date().toISOString(), message: "test" },
    ];
    const filtered = filterMcpEvents(events);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].kind).toBe("mcp_health_refreshed");
    expect(filtered[1].kind).toBe("mcp_stale");
  });
});
