/**
 * Tests for the Agent Registry, attachment lifecycle, session integration,
 * and agent domain types introduced in Phase 23.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  AgentRegistry,
  type AgentRecord,
  type AgentId,
  type AgentKind,
  type AgentStatus,
  type AgentCapability,
  type AgentStageAffinity,
  type AgentDefinition,
  type AgentAttachment,
  type AgentAttachmentStatus,
  type AgentSummary,
  agentAttachRequested,
  agentAttached,
  agentDetached,
  agentEnabled,
  agentDisabled,
  agentFailed,
  agentCapabilitiesUpdated,
  AGENT_EVENT_KINDS,
  isAgentEvent,
  filterAgentEvents,
  buildAgentEventSummary,
  type AgentSessionEventKind,
} from "../../src/agents/index.js";
import {
  SessionManager,
  _resetIdCounter,
  type SessionSummary,
} from "../../src/session/session-manager.js";
import type { SessionEvent, SessionEventKind } from "../../src/session/types.js";
import {
  classifyEvent,
  type TimelineEventCategory,
} from "../../src/app-shell/timeline-helpers.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

function codingAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-coding-1",
    name: "Local Coding Agent",
    kind: "coding",
    description: "A local coding/editing agent",
    capabilities: ["editing", "repo_exploration"],
    allowedStages: ["workspace_binding", "workflow_running", "review"],
    ...overrides,
  };
}

function reviewAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-review-1",
    name: "Review Agent",
    kind: "review",
    description: "Automated code review agent",
    capabilities: ["reviewing", "planning"],
    allowedStages: ["review"],
    ...overrides,
  };
}

function testingAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-testing-1",
    name: "Test Runner Agent",
    kind: "testing",
    capabilities: ["testing"],
    allowedStages: ["workflow_running"],
    ...overrides,
  };
}

function systemAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-system-1",
    name: "System Agent",
    kind: "system",
    capabilities: ["session_narration", "shell_assistance"],
    allowedStages: ["initializing", "workspace_binding", "host_detection", "workflow_running", "review", "done"],
    ...overrides,
  };
}

function externalAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-external-1",
    name: "External Agent",
    kind: "external",
    capabilities: ["mcp_interaction"],
    allowedStages: ["workflow_running"],
    mcpDependency: "mcp-server-xyz",
    ...overrides,
  };
}

function planningAgentDef(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "agent-planning-1",
    name: "Planning Agent",
    kind: "planning",
    capabilities: ["planning"],
    allowedStages: ["initializing", "workspace_binding"],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Type coverage                                                     */
/* ------------------------------------------------------------------ */

describe("agent domain types", () => {
  it("AgentKind covers all expected kinds", () => {
    const kinds: AgentKind[] = [
      "system",
      "coding",
      "review",
      "planning",
      "testing",
      "external",
    ];
    expect(kinds).toHaveLength(6);
    for (const k of kinds) {
      expect(typeof k).toBe("string");
    }
  });

  it("AgentStatus covers all expected statuses", () => {
    const statuses: AgentStatus[] = [
      "registered",
      "available",
      "disabled",
      "failed",
    ];
    expect(statuses).toHaveLength(4);
  });

  it("AgentCapability covers all expected capabilities", () => {
    const caps: AgentCapability[] = [
      "planning",
      "reviewing",
      "testing",
      "editing",
      "repo_exploration",
      "mcp_interaction",
      "shell_assistance",
      "session_narration",
    ];
    expect(caps).toHaveLength(8);
  });

  it("AgentStageAffinity matches session stages", () => {
    const stages: AgentStageAffinity[] = [
      "initializing",
      "workspace_binding",
      "host_detection",
      "workflow_running",
      "review",
      "done",
    ];
    expect(stages).toHaveLength(6);
  });

  it("AgentAttachmentStatus covers all expected statuses", () => {
    const statuses: AgentAttachmentStatus[] = [
      "pending",
      "attached",
      "enabled",
      "disabled",
      "detaching",
      "detached",
      "failed",
    ];
    expect(statuses).toHaveLength(7);
  });

  it("AgentDefinition has required fields", () => {
    const def = codingAgentDef();
    expect(def.id).toBe("agent-coding-1");
    expect(def.name).toBe("Local Coding Agent");
    expect(def.kind).toBe("coding");
    expect(def.capabilities).toContain("editing");
    expect(def.allowedStages).toContain("review");
  });

  it("AgentDefinition supports optional mcpDependency", () => {
    const ext = externalAgentDef();
    expect(ext.mcpDependency).toBe("mcp-server-xyz");
    const coding = codingAgentDef();
    expect(coding.mcpDependency).toBeUndefined();
  });

  it("AgentDefinition supports optional description", () => {
    const withDesc = codingAgentDef();
    expect(withDesc.description).toBe("A local coding/editing agent");
    const without = testingAgentDef();
    expect(without.description).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Agent Registration                                                */
/* ------------------------------------------------------------------ */

describe("agent registration", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
  });

  it("registers an agent and returns a record", () => {
    const record = registry.registerAgent(codingAgentDef());
    expect(record.definition.id).toBe("agent-coding-1");
    expect(record.status).toBe("registered");
    expect(record.failureReason).toBeNull();
    expect(record.disabledReason).toBeNull();
    expect(record.registeredAt).toBeTruthy();
  });

  it("rejects duplicate agent registration", () => {
    registry.registerAgent(codingAgentDef());
    expect(() => registry.registerAgent(codingAgentDef())).toThrow(
      "Agent already registered: agent-coding-1",
    );
  });

  it("registers multiple distinct agents", () => {
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
    registry.registerAgent(testingAgentDef());
    expect(registry.listAgents()).toHaveLength(3);
  });

  it("getAgent returns agent record or undefined", () => {
    registry.registerAgent(codingAgentDef());
    expect(registry.getAgent("agent-coding-1")).toBeDefined();
    expect(registry.getAgent("nonexistent")).toBeUndefined();
  });

  it("listAgents returns all registered agents", () => {
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
    const agents = registry.listAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.definition.id)).toContain("agent-coding-1");
    expect(agents.map((a) => a.definition.id)).toContain("agent-review-1");
  });

  it("updateAgentStatus changes status", () => {
    registry.registerAgent(codingAgentDef());
    const updated = registry.updateAgentStatus("agent-coding-1", "available");
    expect(updated.status).toBe("available");
  });

  it("updateAgentStatus to failed records reason", () => {
    registry.registerAgent(codingAgentDef());
    const updated = registry.updateAgentStatus(
      "agent-coding-1",
      "failed",
      "Init error",
    );
    expect(updated.status).toBe("failed");
    expect(updated.failureReason).toBe("Init error");
  });

  it("updateAgentStatus to disabled records reason", () => {
    registry.registerAgent(codingAgentDef());
    const updated = registry.updateAgentStatus(
      "agent-coding-1",
      "disabled",
      "User disabled",
    );
    expect(updated.status).toBe("disabled");
    expect(updated.disabledReason).toBe("User disabled");
  });

  it("updateAgentStatus throws for unknown agent", () => {
    expect(() => registry.updateAgentStatus("nope", "available")).toThrow(
      "Agent not found: nope",
    );
  });

  it("registers agents of every kind", () => {
    registry.registerAgent(systemAgentDef());
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
    registry.registerAgent(planningAgentDef());
    registry.registerAgent(testingAgentDef());
    registry.registerAgent(externalAgentDef());
    expect(registry.listAgents()).toHaveLength(6);
    const kinds = registry.listAgents().map((a) => a.definition.kind);
    expect(kinds).toContain("system");
    expect(kinds).toContain("coding");
    expect(kinds).toContain("review");
    expect(kinds).toContain("planning");
    expect(kinds).toContain("testing");
    expect(kinds).toContain("external");
  });
});

/* ------------------------------------------------------------------ */
/*  Attach / Detach                                                   */
/* ------------------------------------------------------------------ */

describe("attach/detach behavior", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
  });

  it("attaches an agent to a session", () => {
    const attachment = registry.attachToSession("agent-coding-1", sessionId);
    expect(attachment.agentId).toBe("agent-coding-1");
    expect(attachment.sessionId).toBe(sessionId);
    expect(attachment.status).toBe("attached");
    expect(attachment.attachedAt).toBeTruthy();
    expect(attachment.detachedAt).toBeNull();
    expect(attachment.failureReason).toBeNull();
  });

  it("attaching adds an attached resource to the session", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const agentRes = session.attachedResources.find(
      (r) => r.kind === "agent" && r.id === "agent-coding-1",
    );
    expect(agentRes).toBeDefined();
    expect(agentRes!.label).toBe("Local Coding Agent");
    expect(agentRes!.ready).toBe(true);
  });

  it("attaching updates agent status to available", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    expect(registry.getAgent("agent-coding-1")!.status).toBe("available");
  });

  it("attaching emits attach_requested and attached events", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const agentEvents = session.events.filter((e) =>
      e.kind.startsWith("agent_"),
    );
    expect(agentEvents).toHaveLength(2);
    expect(agentEvents[0].kind).toBe("agent_attach_requested");
    expect(agentEvents[1].kind).toBe("agent_attached");
  });

  it("rejects duplicate active attachment", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    expect(() =>
      registry.attachToSession("agent-coding-1", sessionId),
    ).toThrow("Agent agent-coding-1 is already attached to session");
  });

  it("allows re-attachment after detach", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);
    const reattach = registry.attachToSession("agent-coding-1", sessionId);
    expect(reattach.status).toBe("attached");
  });

  it("detaches an agent from a session", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    const detachment = registry.detachFromSession(
      "agent-coding-1",
      sessionId,
    );
    expect(detachment.status).toBe("detached");
    expect(detachment.detachedAt).toBeTruthy();
  });

  it("detaching emits detached event", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const detachedEvents = session.events.filter(
      (e) => e.kind === "agent_detached",
    );
    expect(detachedEvents).toHaveLength(1);
    expect(detachedEvents[0].message).toContain("Local Coding Agent");
  });

  it("detaching marks resource as not ready", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const agentRes = session.attachedResources.find(
      (r) => r.kind === "agent" && r.id === "agent-coding-1",
    );
    expect(agentRes!.ready).toBe(false);
  });

  it("throws for detaching non-existent attachment", () => {
    expect(() =>
      registry.detachFromSession("agent-coding-1", sessionId),
    ).toThrow("No attachment found");
  });

  it("throws for attaching to non-existent session", () => {
    expect(() =>
      registry.attachToSession("agent-coding-1", "no-session"),
    ).toThrow("Session not found: no-session");
  });

  it("throws for attaching unknown agent", () => {
    expect(() =>
      registry.attachToSession("nonexistent", sessionId),
    ).toThrow("Agent not found: nonexistent");
  });

  it("rejects attaching disabled agent", () => {
    registry.updateAgentStatus("agent-coding-1", "disabled", "User disabled");
    expect(() =>
      registry.attachToSession("agent-coding-1", sessionId),
    ).toThrow("Cannot attach disabled agent");
  });

  it("rejects attaching failed agent", () => {
    registry.updateAgentStatus("agent-coding-1", "failed", "Init failed");
    expect(() =>
      registry.attachToSession("agent-coding-1", sessionId),
    ).toThrow("Cannot attach failed agent");
  });

  it("attaches multiple agents to same session", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.attachToSession("agent-review-1", sessionId);
    const attachments = registry.listSessionAttachments(sessionId);
    expect(attachments).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Status transitions (enable / disable / fail)                      */
/* ------------------------------------------------------------------ */

describe("status transitions", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
  });

  it("enables an attached agent", () => {
    const a = registry.enableAgent("agent-coding-1", sessionId);
    expect(a.status).toBe("enabled");
  });

  it("enable emits agent_enabled event", () => {
    registry.enableAgent("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const enabledEvents = session.events.filter(
      (e) => e.kind === "agent_enabled",
    );
    expect(enabledEvents).toHaveLength(1);
  });

  it("disables an attached agent", () => {
    const a = registry.disableAgent("agent-coding-1", sessionId, "Too slow");
    expect(a.status).toBe("disabled");
    expect(a.disabledReason).toBe("Too slow");
  });

  it("disable emits agent_disabled event with reason", () => {
    registry.disableAgent("agent-coding-1", sessionId, "Too slow");
    const session = sm.getSession(sessionId)!;
    const disabledEvents = session.events.filter(
      (e) => e.kind === "agent_disabled",
    );
    expect(disabledEvents).toHaveLength(1);
    expect(disabledEvents[0].message).toContain("Too slow");
  });

  it("disabled → enabled transition works", () => {
    registry.disableAgent("agent-coding-1", sessionId, "Temp");
    const a = registry.enableAgent("agent-coding-1", sessionId);
    expect(a.status).toBe("enabled");
    expect(a.disabledReason).toBeNull();
  });

  it("enabled → disabled transition works", () => {
    registry.enableAgent("agent-coding-1", sessionId);
    const a = registry.disableAgent("agent-coding-1", sessionId);
    expect(a.status).toBe("disabled");
  });

  it("cannot enable a detached agent", () => {
    registry.detachFromSession("agent-coding-1", sessionId);
    expect(() =>
      registry.enableAgent("agent-coding-1", sessionId),
    ).toThrow("Cannot enable agent in status 'detached'");
  });

  it("cannot disable a detached agent", () => {
    registry.detachFromSession("agent-coding-1", sessionId);
    expect(() =>
      registry.disableAgent("agent-coding-1", sessionId),
    ).toThrow("Cannot disable agent in status 'detached'");
  });

  it("cannot enable a failed agent", () => {
    registry.markAttachmentFailed("agent-coding-1", sessionId, "Crash");
    expect(() =>
      registry.enableAgent("agent-coding-1", sessionId),
    ).toThrow("Cannot enable agent in status 'failed'");
  });

  it("markAttachmentFailed sets status and reason", () => {
    const a = registry.markAttachmentFailed(
      "agent-coding-1",
      sessionId,
      "Out of memory",
    );
    expect(a.status).toBe("failed");
    expect(a.failureReason).toBe("Out of memory");
  });

  it("markAttachmentFailed emits agent_failed event", () => {
    registry.markAttachmentFailed("agent-coding-1", sessionId, "Crash");
    const session = sm.getSession(sessionId)!;
    const failedEvents = session.events.filter(
      (e) => e.kind === "agent_failed",
    );
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].message).toContain("Crash");
  });

  it("markAttachmentFailed sets resource to not-ready", () => {
    registry.markAttachmentFailed("agent-coding-1", sessionId, "Crash");
    const session = sm.getSession(sessionId)!;
    const res = session.attachedResources.find(
      (r) => r.kind === "agent" && r.id === "agent-coding-1",
    );
    expect(res!.ready).toBe(false);
  });

  it("markAttachmentFailed throws for non-existent attachment", () => {
    expect(() =>
      registry.markAttachmentFailed("agent-coding-1", "bad-session", "X"),
    ).toThrow("No attachment found");
  });
});

/* ------------------------------------------------------------------ */
/*  Capability exposure                                               */
/* ------------------------------------------------------------------ */

describe("capability exposure", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
  });

  it("agent summaries include capabilities", () => {
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].capabilities).toContain("editing");
    expect(summaries[0].capabilities).toContain("repo_exploration");
  });

  it("agent summaries include allowed stages", () => {
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries[0].allowedStages).toContain("review");
    expect(summaries[0].allowedStages).toContain("workspace_binding");
  });

  it("notifyCapabilitiesUpdated emits event", () => {
    registry.notifyCapabilitiesUpdated("agent-coding-1", sessionId, [
      "editing",
      "testing",
    ]);
    const session = sm.getSession(sessionId)!;
    const capEvents = session.events.filter(
      (e) => e.kind === "agent_capabilities_updated",
    );
    expect(capEvents).toHaveLength(1);
    expect(capEvents[0].detail?.capabilities).toEqual(["editing", "testing"]);
  });

  it("notifyCapabilitiesUpdated throws for unknown agent", () => {
    expect(() =>
      registry.notifyCapabilitiesUpdated("nope", sessionId, ["editing"]),
    ).toThrow("Agent not found: nope");
  });
});

/* ------------------------------------------------------------------ */
/*  Session summary exposure of agents                                */
/* ------------------------------------------------------------------ */

describe("session summary exposure of agents", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
  });

  it("session summary has zero agents initially", () => {
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.agentCount).toBe(0);
    expect(summary.agents).toEqual([]);
  });

  it("session summary includes attached agents", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.agentCount).toBe(1);
    expect(summary.agents).toHaveLength(1);
    expect(summary.agents[0].id).toBe("agent-coding-1");
    expect(summary.agents[0].label).toBe("Local Coding Agent");
    expect(summary.agents[0].ready).toBe(true);
  });

  it("session summary includes multiple agents", () => {
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.attachToSession("agent-review-1", sessionId);
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.agentCount).toBe(2);
    expect(summary.agents).toHaveLength(2);
  });

  it("session summary reflects agent ready=false after detach", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.agentCount).toBe(1);
    expect(summary.agents[0].ready).toBe(false);
  });

  it("session summary reflects agent ready=false after failure", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.markAttachmentFailed("agent-coding-1", sessionId, "Crash");
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.agents[0].ready).toBe(false);
  });

  it("session summary still includes MCP server count separately", () => {
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.mcpServerCount).toBe(0);
    expect(summary.mcpServers).toEqual([]);
  });

  it("agentCount on summary matches attachedResourceCount minus MCP servers", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const summary = sm.getSessionSummary(sessionId);
    expect(summary.attachedResourceCount).toBe(1);
    expect(summary.agentCount).toBe(1);
    expect(summary.mcpServerCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Session event emission for agent lifecycle                        */
/* ------------------------------------------------------------------ */

describe("session event emission for agent lifecycle", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
    registry.registerAgent(codingAgentDef());
  });

  it("full lifecycle emits correct event sequence", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.enableAgent("agent-coding-1", sessionId);
    registry.disableAgent("agent-coding-1", sessionId, "Paused");
    registry.enableAgent("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);

    const session = sm.getSession(sessionId)!;
    const agentEvents = session.events.filter((e) =>
      e.kind.startsWith("agent_"),
    );

    expect(agentEvents.map((e) => e.kind)).toEqual([
      "agent_attach_requested",
      "agent_attached",
      "agent_enabled",
      "agent_disabled",
      "agent_enabled",
      "agent_detached",
    ]);
  });

  it("all agent events have timestamps", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.enableAgent("agent-coding-1", sessionId);
    registry.detachFromSession("agent-coding-1", sessionId);

    const session = sm.getSession(sessionId)!;
    const agentEvents = session.events.filter((e) =>
      e.kind.startsWith("agent_"),
    );
    for (const e of agentEvents) {
      expect(e.timestamp).toBeTruthy();
      expect(new Date(e.timestamp).toISOString()).toBe(e.timestamp);
    }
  });

  it("agent events include agent id in detail", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const attachedEvent = session.events.find(
      (e) => e.kind === "agent_attached",
    )!;
    expect(attachedEvent.detail?.agentId).toBe("agent-coding-1");
    expect(attachedEvent.detail?.name).toBe("Local Coding Agent");
  });

  it("failed event includes error in detail", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.markAttachmentFailed(
      "agent-coding-1",
      sessionId,
      "Connection lost",
    );
    const session = sm.getSession(sessionId)!;
    const failedEvent = session.events.find(
      (e) => e.kind === "agent_failed",
    )!;
    expect(failedEvent.detail?.error).toBe("Connection lost");
  });

  it("disabled event includes reason in message", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.disableAgent("agent-coding-1", sessionId, "Too slow");
    const session = sm.getSession(sessionId)!;
    const disabledEvent = session.events.find(
      (e) => e.kind === "agent_disabled",
    )!;
    expect(disabledEvent.message).toContain("Too slow");
  });

  it("capabilities updated event includes capabilities in detail", () => {
    registry.attachToSession("agent-coding-1", sessionId);
    registry.notifyCapabilitiesUpdated("agent-coding-1", sessionId, [
      "editing",
      "reviewing",
    ]);
    const session = sm.getSession(sessionId)!;
    const capEvent = session.events.find(
      (e) => e.kind === "agent_capabilities_updated",
    )!;
    expect(capEvent.detail?.capabilities).toEqual(["editing", "reviewing"]);
  });
});

/* ------------------------------------------------------------------ */
/*  Session event helpers                                             */
/* ------------------------------------------------------------------ */

describe("agent session event helpers", () => {
  it("AGENT_EVENT_KINDS has 11 entries", () => {
    expect(AGENT_EVENT_KINDS).toHaveLength(11);
  });

  it("isAgentEvent identifies agent events correctly", () => {
    expect(isAgentEvent("agent_attached")).toBe(true);
    expect(isAgentEvent("agent_detached")).toBe(true);
    expect(isAgentEvent("agent_failed")).toBe(true);
    expect(isAgentEvent("agent_enabled")).toBe(true);
    expect(isAgentEvent("agent_disabled")).toBe(true);
    expect(isAgentEvent("agent_attach_requested")).toBe(true);
    expect(isAgentEvent("agent_capabilities_updated")).toBe(true);
    expect(isAgentEvent("mcp_attached")).toBe(false);
    expect(isAgentEvent("session_created")).toBe(false);
    expect(isAgentEvent("unknown")).toBe(false);
  });

  it("filterAgentEvents filters correctly", () => {
    const events: SessionEvent[] = [
      {
        kind: "session_created",
        timestamp: new Date().toISOString(),
        message: "Session created",
      },
      {
        kind: "agent_attached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Agent attached",
        detail: { agentId: "a1" },
      },
      {
        kind: "mcp_attached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "MCP attached",
      },
      {
        kind: "agent_detached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Agent detached",
        detail: { agentId: "a1" },
      },
    ];
    const filtered = filterAgentEvents(events);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].kind).toBe("agent_attached");
    expect(filtered[1].kind).toBe("agent_detached");
  });

  it("buildAgentEventSummary summarizes events", () => {
    const events: SessionEvent[] = [
      {
        kind: "agent_attached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Attached",
        detail: { agentId: "a1" },
      },
      {
        kind: "agent_enabled" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Enabled",
        detail: { agentId: "a1" },
      },
      {
        kind: "agent_attached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Attached",
        detail: { agentId: "a2" },
      },
      {
        kind: "agent_disabled" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Disabled",
        detail: { agentId: "a1" },
      },
      {
        kind: "agent_failed" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Failed",
        detail: { agentId: "a2" },
      },
      {
        kind: "agent_detached" as SessionEventKind,
        timestamp: new Date().toISOString(),
        message: "Detached",
        detail: { agentId: "a1" },
      },
    ];
    const summary = buildAgentEventSummary(events);
    expect(summary.attached).toEqual(["a1", "a2"]);
    expect(summary.enabled).toEqual(["a1"]);
    expect(summary.disabled).toEqual(["a1"]);
    expect(summary.failed).toEqual(["a2"]);
    expect(summary.detached).toEqual(["a1"]);
  });
});

/* ------------------------------------------------------------------ */
/*  Event factory functions                                           */
/* ------------------------------------------------------------------ */

describe("agent event factory functions", () => {
  it("agentAttachRequested creates correct event", () => {
    const e = agentAttachRequested("a1", "My Agent");
    expect(e.kind).toBe("agent_attach_requested");
    expect(e.message).toContain("My Agent");
    expect(e.detail?.agentId).toBe("a1");
  });

  it("agentAttached creates correct event", () => {
    const e = agentAttached("a1", "My Agent");
    expect(e.kind).toBe("agent_attached");
    expect(e.message).toContain("My Agent");
  });

  it("agentDetached creates correct event", () => {
    const e = agentDetached("a1", "My Agent");
    expect(e.kind).toBe("agent_detached");
    expect(e.message).toContain("My Agent");
  });

  it("agentEnabled creates correct event", () => {
    const e = agentEnabled("a1", "My Agent");
    expect(e.kind).toBe("agent_enabled");
    expect(e.message).toContain("My Agent");
  });

  it("agentDisabled creates correct event without reason", () => {
    const e = agentDisabled("a1", "My Agent");
    expect(e.kind).toBe("agent_disabled");
    expect(e.message).toContain("My Agent");
    expect(e.message).not.toContain("—");
  });

  it("agentDisabled creates correct event with reason", () => {
    const e = agentDisabled("a1", "My Agent", "Rate limited");
    expect(e.kind).toBe("agent_disabled");
    expect(e.message).toContain("Rate limited");
    expect(e.detail?.reason).toBe("Rate limited");
  });

  it("agentFailed creates correct event", () => {
    const e = agentFailed("a1", "My Agent", "Timeout");
    expect(e.kind).toBe("agent_failed");
    expect(e.message).toContain("Timeout");
    expect(e.detail?.error).toBe("Timeout");
  });

  it("agentCapabilitiesUpdated creates correct event", () => {
    const e = agentCapabilitiesUpdated("a1", "My Agent", [
      "editing",
      "testing",
    ]);
    expect(e.kind).toBe("agent_capabilities_updated");
    expect(e.message).toContain("2 capabilities");
    expect(e.detail?.capabilities).toEqual(["editing", "testing"]);
  });

  it("all event factories produce valid timestamps", () => {
    const events = [
      agentAttachRequested("a1", "A"),
      agentAttached("a1", "A"),
      agentDetached("a1", "A"),
      agentEnabled("a1", "A"),
      agentDisabled("a1", "A"),
      agentFailed("a1", "A", "err"),
      agentCapabilitiesUpdated("a1", "A", ["editing"]),
    ];
    for (const e of events) {
      expect(e.timestamp).toBeTruthy();
      expect(() => new Date(e.timestamp)).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Agent summaries                                                   */
/* ------------------------------------------------------------------ */

describe("agent summaries", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
  });

  it("returns empty summaries for no agents", () => {
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries).toEqual([]);
  });

  it("returns summary with correct fields", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    expect(s.id).toBe("agent-coding-1");
    expect(s.name).toBe("Local Coding Agent");
    expect(s.kind).toBe("coding");
    expect(s.status).toBe("attached");
    expect(s.capabilities).toEqual(["editing", "repo_exploration"]);
    expect(s.allowedStages).toEqual([
      "workspace_binding",
      "workflow_running",
      "review",
    ]);
    expect(s.failureReason).toBeNull();
    expect(s.disabledReason).toBeNull();
  });

  it("summary reflects disabled status", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.disableAgent("agent-coding-1", sessionId, "Paused");
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries[0].status).toBe("disabled");
    expect(summaries[0].disabledReason).toBe("Paused");
  });

  it("summary reflects failed status", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.markAttachmentFailed("agent-coding-1", sessionId, "OOM");
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries[0].status).toBe("failed");
    expect(summaries[0].failureReason).toBe("OOM");
  });

  it("returns multiple summaries for multiple agents", () => {
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
    registry.registerAgent(testingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.attachToSession("agent-review-1", sessionId);
    registry.attachToSession("agent-testing-1", sessionId);
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries).toHaveLength(3);
    expect(summaries.map((s) => s.kind)).toContain("coding");
    expect(summaries.map((s) => s.kind)).toContain("review");
    expect(summaries.map((s) => s.kind)).toContain("testing");
  });
});

/* ------------------------------------------------------------------ */
/*  Attachment query methods                                          */
/* ------------------------------------------------------------------ */

describe("attachment query methods", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId1: string;
  let sessionId2: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    sessionId1 = sm.createSession().id;
    sessionId2 = sm.createSession().id;
    registry.registerAgent(codingAgentDef());
    registry.registerAgent(reviewAgentDef());
  });

  it("getAttachment returns the attachment", () => {
    registry.attachToSession("agent-coding-1", sessionId1);
    const a = registry.getAttachment("agent-coding-1", sessionId1);
    expect(a).toBeDefined();
    expect(a!.agentId).toBe("agent-coding-1");
    expect(a!.sessionId).toBe(sessionId1);
  });

  it("getAttachment returns undefined for no attachment", () => {
    expect(
      registry.getAttachment("agent-coding-1", sessionId1),
    ).toBeUndefined();
  });

  it("listSessionAttachments returns all attachments for a session", () => {
    registry.attachToSession("agent-coding-1", sessionId1);
    registry.attachToSession("agent-review-1", sessionId1);
    const attachments = registry.listSessionAttachments(sessionId1);
    expect(attachments).toHaveLength(2);
  });

  it("listSessionAttachments scopes to correct session", () => {
    registry.attachToSession("agent-coding-1", sessionId1);
    registry.attachToSession("agent-review-1", sessionId2);
    expect(registry.listSessionAttachments(sessionId1)).toHaveLength(1);
    expect(registry.listSessionAttachments(sessionId2)).toHaveLength(1);
  });

  it("listAgentAttachments returns all attachments for an agent", () => {
    registry.attachToSession("agent-coding-1", sessionId1);
    registry.attachToSession("agent-coding-1", sessionId2);
    const attachments = registry.listAgentAttachments("agent-coding-1");
    expect(attachments).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Timeline classification                                           */
/* ------------------------------------------------------------------ */

describe("timeline classification of agent events", () => {
  it("agent_attached is classified as progress", () => {
    expect(classifyEvent("agent_attached")).toBe("progress");
  });

  it("agent_enabled is classified as progress", () => {
    expect(classifyEvent("agent_enabled")).toBe("progress");
  });

  it("agent_capabilities_updated is classified as progress", () => {
    expect(classifyEvent("agent_capabilities_updated")).toBe("progress");
  });

  it("agent_attach_requested is classified as warning", () => {
    expect(classifyEvent("agent_attach_requested")).toBe("warning");
  });

  it("agent_failed is classified as failure", () => {
    expect(classifyEvent("agent_failed")).toBe("failure");
  });

  it("agent_disabled is classified as failure", () => {
    expect(classifyEvent("agent_disabled")).toBe("failure");
  });

  it("agent_detached is classified as failure", () => {
    expect(classifyEvent("agent_detached")).toBe("failure");
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                        */
/* ------------------------------------------------------------------ */

describe("edge cases", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;
  let sessionId: string;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
    const session = sm.createSession();
    sessionId = session.id;
  });

  it("clear removes all agents and attachments", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.clear();
    expect(registry.listAgents()).toHaveLength(0);
    expect(registry.getAgent("agent-coding-1")).toBeUndefined();
  });

  it("agent with empty capabilities", () => {
    registry.registerAgent(
      codingAgentDef({ id: "empty-cap", capabilities: [] }),
    );
    const record = registry.getAgent("empty-cap")!;
    expect(record.definition.capabilities).toEqual([]);
  });

  it("agent with empty allowedStages", () => {
    registry.registerAgent(
      codingAgentDef({ id: "empty-stages", allowedStages: [] }),
    );
    const record = registry.getAgent("empty-stages")!;
    expect(record.definition.allowedStages).toEqual([]);
  });

  it("agent summary for failed attachment includes reason", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    registry.markAttachmentFailed(
      "agent-coding-1",
      sessionId,
      "Network error",
    );
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries[0].failureReason).toBe("Network error");
  });

  it("disabled agent without reason has null disabledReason", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const a = registry.disableAgent("agent-coding-1", sessionId);
    expect(a.disabledReason).toBeNull();
  });

  it("attaching same agent to two sessions works", () => {
    const sid2 = sm.createSession().id;
    registry.registerAgent(codingAgentDef());
    const a1 = registry.attachToSession("agent-coding-1", sessionId);
    const a2 = registry.attachToSession("agent-coding-1", sid2);
    expect(a1.sessionId).toBe(sessionId);
    expect(a2.sessionId).toBe(sid2);
  });

  it("getSessionAgentSummaries returns empty array for no agents", () => {
    const summaries = registry.getSessionAgentSummaries(sessionId);
    expect(summaries).toEqual([]);
  });

  it("agent events are separate from MCP events in the session", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    // Verify agent events don't contain MCP event kinds
    const agentEvents = session.events.filter((e) =>
      e.kind.startsWith("agent_"),
    );
    for (const e of agentEvents) {
      expect(e.kind).not.toMatch(/^mcp_/);
    }
  });

  it("SessionEventKind union includes agent event kinds", () => {
    // This is a compile-time check — if it compiles, the types are correct
    const agentKinds: SessionEventKind[] = [
      "agent_attach_requested",
      "agent_attached",
      "agent_detached",
      "agent_enabled",
      "agent_disabled",
      "agent_failed",
      "agent_capabilities_updated",
    ];
    expect(agentKinds).toHaveLength(7);
  });

  it("agents in attached resources have kind='agent' (not mcp_server)", () => {
    registry.registerAgent(codingAgentDef());
    registry.attachToSession("agent-coding-1", sessionId);
    const session = sm.getSession(sessionId)!;
    const agentRes = session.attachedResources.filter(
      (r) => r.kind === "agent",
    );
    expect(agentRes).toHaveLength(1);
    const mcpRes = session.attachedResources.filter(
      (r) => r.kind === "mcp_server",
    );
    expect(mcpRes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Agents vs MCP separation                                          */
/* ------------------------------------------------------------------ */

describe("agents vs MCP separation", () => {
  it("AgentKind does not include mcp_server", () => {
    const kinds: AgentKind[] = [
      "system",
      "coding",
      "review",
      "planning",
      "testing",
      "external",
    ];
    expect(kinds).not.toContain("mcp_server");
  });

  it("agent event kinds are distinct from MCP event kinds", () => {
    for (const kind of AGENT_EVENT_KINDS) {
      expect(kind).toMatch(/^agent_/);
      expect(kind).not.toMatch(/^mcp_/);
    }
  });

  it("isAgentEvent returns false for MCP events", () => {
    expect(isAgentEvent("mcp_attached")).toBe(false);
    expect(isAgentEvent("mcp_started")).toBe(false);
    expect(isAgentEvent("mcp_failed")).toBe(false);
  });
});
