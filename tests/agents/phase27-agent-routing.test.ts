/**
 * Phase 27 — Agent routing and stage participation model tests.
 *
 * Tests cover:
 * - Capability-to-stage mapping
 * - Stage eligibility evaluation
 * - Preferred agent selection
 * - Disabled/unavailable exclusion
 * - Deterministic routing decisions
 * - Session summary exposure of stage participation
 * - Routing event emission
 * - Edge cases (no eligible agents, all disabled, etc.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SessionManager,
  _resetIdCounter,
} from "../../src/session/session-manager.js";
import { AgentRegistry } from "../../src/agents/agent-registry.js";
import type {
  AgentDefinition,
  AgentSummary,
  AgentStageAffinity,
  AgentCapability,
  StageParticipation,
  StageParticipationSummary,
} from "../../src/agents/types.js";
import {
  CAPABILITY_STAGE_MAP,
  ALL_STAGES,
  DEFAULT_ROUTING_PRIORITY,
  stagesForCapability,
  capabilitiesForStage,
  isCapabilityRelevant,
} from "../../src/agents/stage-routing.js";
import {
  evaluateAgentForStage,
  evaluateStageParticipation,
  evaluateAllStages,
  getEligibleAgents,
  getPreferredAgents,
  getSkippedAgents,
  getTopAgent,
  buildPreferredStagesMap,
} from "../../src/agents/participation.js";
import {
  agentRoutingEvaluated,
  agentStageParticipationUpdated,
  agentSkippedForStage,
  agentSelectedForStage,
  AGENT_EVENT_KINDS,
  isAgentEvent,
  buildAgentEventSummary,
} from "../../src/agents/session-integration.js";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                     */
/* ------------------------------------------------------------------ */

function makeDef(overrides: Partial<AgentDefinition> & { id: string; name: string }): AgentDefinition {
  return {
    kind: "coding",
    capabilities: [],
    allowedStages: [],
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<AgentSummary> & { id: string; name: string },
): AgentSummary {
  return {
    kind: "coding",
    status: "attached",
    capabilities: [],
    allowedStages: [],
    failureReason: null,
    disabledReason: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Capability-to-stage mapping                                       */
/* ------------------------------------------------------------------ */

describe("capability-to-stage mapping", () => {
  it("CAPABILITY_STAGE_MAP has entries for all 8 capabilities", () => {
    const allCapabilities: AgentCapability[] = [
      "planning", "reviewing", "testing", "editing",
      "repo_exploration", "mcp_interaction", "shell_assistance", "session_narration",
    ];
    for (const cap of allCapabilities) {
      expect(CAPABILITY_STAGE_MAP[cap]).toBeDefined();
      expect(CAPABILITY_STAGE_MAP[cap].length).toBeGreaterThan(0);
    }
  });

  it("ALL_STAGES has 6 stages in lifecycle order", () => {
    expect(ALL_STAGES).toEqual([
      "initializing",
      "workspace_binding",
      "host_detection",
      "workflow_running",
      "review",
      "done",
    ]);
  });

  it("DEFAULT_ROUTING_PRIORITY is 50", () => {
    expect(DEFAULT_ROUTING_PRIORITY).toBe(50);
  });

  it("stagesForCapability returns correct stages for 'planning'", () => {
    const stages = stagesForCapability("planning");
    expect(stages).toContain("initializing");
    expect(stages).toContain("workflow_running");
    expect(stages).not.toContain("done");
  });

  it("stagesForCapability returns correct stages for 'reviewing'", () => {
    const stages = stagesForCapability("reviewing");
    expect(stages).toContain("review");
    expect(stages).toContain("done");
    expect(stages).not.toContain("initializing");
  });

  it("stagesForCapability returns correct stages for 'repo_exploration'", () => {
    const stages = stagesForCapability("repo_exploration");
    expect(stages).toContain("initializing");
    expect(stages).toContain("workspace_binding");
    expect(stages).not.toContain("done");
  });

  it("stagesForCapability returns correct stages for 'session_narration'", () => {
    const stages = stagesForCapability("session_narration");
    expect(stages).toHaveLength(6); // all stages
  });

  it("stagesForCapability returns correct stages for 'shell_assistance'", () => {
    const stages = stagesForCapability("shell_assistance");
    expect(stages).toHaveLength(6); // all stages
  });

  it("stagesForCapability returns correct stages for 'mcp_interaction'", () => {
    const stages = stagesForCapability("mcp_interaction");
    expect(stages).toHaveLength(5); // not 'done'
    expect(stages).not.toContain("done");
  });

  it("stagesForCapability returns correct stages for 'editing'", () => {
    const stages = stagesForCapability("editing");
    expect(stages).toContain("workspace_binding");
    expect(stages).toContain("workflow_running");
  });

  it("stagesForCapability returns correct stages for 'testing'", () => {
    const stages = stagesForCapability("testing");
    expect(stages).toContain("workflow_running");
    expect(stages).toContain("review");
  });

  it("capabilitiesForStage returns capabilities for 'initializing'", () => {
    const caps = capabilitiesForStage("initializing");
    expect(caps).toContain("planning");
    expect(caps).toContain("repo_exploration");
    expect(caps).toContain("mcp_interaction");
    expect(caps).toContain("shell_assistance");
    expect(caps).toContain("session_narration");
    expect(caps).not.toContain("reviewing");
  });

  it("capabilitiesForStage returns capabilities for 'review'", () => {
    const caps = capabilitiesForStage("review");
    expect(caps).toContain("reviewing");
    expect(caps).toContain("testing");
    expect(caps).toContain("mcp_interaction");
    expect(caps).not.toContain("planning");
  });

  it("capabilitiesForStage returns capabilities for 'done'", () => {
    const caps = capabilitiesForStage("done");
    expect(caps).toContain("reviewing");
    expect(caps).toContain("shell_assistance");
    expect(caps).toContain("session_narration");
    expect(caps).not.toContain("planning");
    expect(caps).not.toContain("editing");
  });

  it("isCapabilityRelevant correctly tests relevance", () => {
    expect(isCapabilityRelevant("planning", "initializing")).toBe(true);
    expect(isCapabilityRelevant("planning", "done")).toBe(false);
    expect(isCapabilityRelevant("reviewing", "review")).toBe(true);
    expect(isCapabilityRelevant("reviewing", "host_detection")).toBe(false);
    expect(isCapabilityRelevant("session_narration", "done")).toBe(true);
  });

  it("every stage has at least one capability mapped to it", () => {
    for (const stage of ALL_STAGES) {
      const caps = capabilitiesForStage(stage);
      expect(caps.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Single agent evaluation                                           */
/* ------------------------------------------------------------------ */

describe("evaluateAgentForStage — single agent", () => {
  it("eligible agent for allowed stage", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding", "workflow_running"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("allowed_stage");
    expect(result.matchingCapabilities).toContain("editing");
    expect(result.reasons).toContain("capability_match");
    expect(result.priority).toBe(DEFAULT_ROUTING_PRIORITY);
  });

  it("ineligible for stage not in allowedStages", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "review");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("not_allowed");
  });

  it("disabled agent is ineligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "disabled",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("disabled");
  });

  it("failed agent is ineligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "failed",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("failed");
  });

  it("detached agent is ineligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "detached",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("detached");
  });

  it("detaching agent is ineligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "detaching",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("detached");
  });

  it("pending agent is ineligible (not active)", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "pending",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("unavailable");
  });

  it("enabled agent is eligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      status: "enabled",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(true);
  });

  it("participation_disabled agent is ineligible", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Coder",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
      participationEnabled: false,
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("participation_disabled");
  });

  it("agent with custom routingPriority uses it", () => {
    const agent = makeSummary({
      id: "a1",
      name: "HighPri",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
      routingPriority: 90,
    });
    const result = evaluateAgentForStage(agent, "workspace_binding");
    expect(result.priority).toBe(90);
  });

  it("agent with no matching capability still eligible by allowedStages", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Manual",
      capabilities: ["reviewing"], // reviewing not mapped to initializing
      allowedStages: ["initializing"],
    });
    const result = evaluateAgentForStage(agent, "initializing");
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("allowed_stage");
    expect(result.matchingCapabilities).toHaveLength(0);
    expect(result.reasons).not.toContain("capability_match");
  });

  it("multiple matching capabilities are all listed", () => {
    const agent = makeSummary({
      id: "a1",
      name: "Multi",
      capabilities: ["planning", "repo_exploration", "mcp_interaction"],
      allowedStages: ["initializing"],
    });
    const result = evaluateAgentForStage(agent, "initializing");
    expect(result.matchingCapabilities).toContain("planning");
    expect(result.matchingCapabilities).toContain("repo_exploration");
    expect(result.matchingCapabilities).toContain("mcp_interaction");
    expect(result.matchingCapabilities).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Multi-agent stage evaluation                                      */
/* ------------------------------------------------------------------ */

describe("evaluateStageParticipation — multi-agent", () => {
  const agents: AgentSummary[] = [
    makeSummary({
      id: "planner",
      name: "Planner",
      kind: "planning",
      capabilities: ["planning"],
      allowedStages: ["initializing", "workflow_running"],
      routingPriority: 80,
    }),
    makeSummary({
      id: "reviewer",
      name: "Reviewer",
      kind: "review",
      capabilities: ["reviewing", "testing"],
      allowedStages: ["review", "done"],
      routingPriority: 70,
    }),
    makeSummary({
      id: "coder",
      name: "Coder",
      kind: "coding",
      capabilities: ["editing", "repo_exploration"],
      allowedStages: ["workspace_binding", "workflow_running"],
    }),
    makeSummary({
      id: "narrator",
      name: "Narrator",
      kind: "system",
      capabilities: ["session_narration", "shell_assistance"],
      allowedStages: [
        "initializing", "workspace_binding", "host_detection",
        "workflow_running", "review", "done",
      ],
      routingPriority: 30,
    }),
  ];

  it("initializing stage: planner and narrator eligible", () => {
    const result = evaluateStageParticipation(agents, "initializing");
    expect(result.eligible).toHaveLength(2);
    const ids = result.eligible.map((e) => e.agentId);
    expect(ids).toContain("planner");
    expect(ids).toContain("narrator");
    expect(result.skipped).toHaveLength(2);
  });

  it("review stage: reviewer and narrator eligible", () => {
    const result = evaluateStageParticipation(agents, "review");
    expect(result.eligible).toHaveLength(2);
    const ids = result.eligible.map((e) => e.agentId);
    expect(ids).toContain("reviewer");
    expect(ids).toContain("narrator");
  });

  it("workflow_running: planner, coder, narrator eligible", () => {
    const result = evaluateStageParticipation(agents, "workflow_running");
    expect(result.eligible).toHaveLength(3);
    const ids = result.eligible.map((e) => e.agentId);
    expect(ids).toContain("planner");
    expect(ids).toContain("coder");
    expect(ids).toContain("narrator");
  });

  it("eligible list sorted by priority descending", () => {
    const result = evaluateStageParticipation(agents, "workflow_running");
    const priorities = result.eligible.map((e) => e.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1]);
    }
  });

  it("done stage: reviewer and narrator eligible", () => {
    const result = evaluateStageParticipation(agents, "done");
    expect(result.eligible).toHaveLength(2);
    const ids = result.eligible.map((e) => e.agentId);
    expect(ids).toContain("reviewer");
    expect(ids).toContain("narrator");
  });

  it("host_detection stage: only narrator eligible", () => {
    const result = evaluateStageParticipation(agents, "host_detection");
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].agentId).toBe("narrator");
  });

  it("preferred stages map marks agents as preferred", () => {
    const prefMap = new Map<string, readonly AgentStageAffinity[]>([
      ["planner", ["initializing"]],
    ]);
    const result = evaluateStageParticipation(agents, "initializing", prefMap);
    expect(result.preferred).toHaveLength(1);
    expect(result.preferred[0].agentId).toBe("planner");
    expect(result.preferred[0].preferred).toBe(true);
    expect(result.preferred[0].reasons).toContain("preferred_stage");
  });

  it("preferred list is a subset of eligible", () => {
    const prefMap = new Map<string, readonly AgentStageAffinity[]>([
      ["planner", ["initializing"]],
      ["narrator", ["initializing"]],
    ]);
    const result = evaluateStageParticipation(agents, "initializing", prefMap);
    expect(result.preferred).toHaveLength(2);
    for (const p of result.preferred) {
      const inEligible = result.eligible.some((e) => e.agentId === p.agentId);
      expect(inEligible).toBe(true);
    }
  });

  it("skipped contains all ineligible agents", () => {
    const result = evaluateStageParticipation(agents, "host_detection");
    expect(result.skipped).toHaveLength(3);
    const skippedIds = result.skipped.map((s) => s.agentId);
    expect(skippedIds).toContain("planner");
    expect(skippedIds).toContain("reviewer");
    expect(skippedIds).toContain("coder");
  });
});

/* ------------------------------------------------------------------ */
/*  Disabled/unavailable exclusion                                    */
/* ------------------------------------------------------------------ */

describe("disabled and unavailable exclusion", () => {
  it("disabled agent excluded from all stages", () => {
    const agents = [
      makeSummary({
        id: "a1",
        name: "Disabled",
        status: "disabled",
        capabilities: ["planning", "editing"],
        allowedStages: ["initializing", "workflow_running"],
      }),
    ];
    const results = evaluateAllStages(agents);
    for (const result of results) {
      expect(result.eligible).toHaveLength(0);
    }
  });

  it("failed agent excluded from all stages", () => {
    const agents = [
      makeSummary({
        id: "a1",
        name: "Failed",
        status: "failed",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
      }),
    ];
    const results = evaluateAllStages(agents);
    for (const result of results) {
      expect(result.eligible).toHaveLength(0);
    }
  });

  it("participation_disabled agent excluded", () => {
    const agents = [
      makeSummary({
        id: "a1",
        name: "OptedOut",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
        participationEnabled: false,
      }),
    ];
    const result = evaluateStageParticipation(agents, "initializing");
    expect(result.eligible).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reasons).toContain("participation_disabled");
  });

  it("mix of active and disabled agents", () => {
    const agents = [
      makeSummary({
        id: "active",
        name: "Active",
        status: "attached",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
      }),
      makeSummary({
        id: "disabled",
        name: "Disabled",
        status: "disabled",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
      }),
      makeSummary({
        id: "enabled",
        name: "Enabled",
        status: "enabled",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
      }),
    ];
    const result = evaluateStageParticipation(agents, "initializing");
    expect(result.eligible).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].agentId).toBe("disabled");
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateAllStages                                                 */
/* ------------------------------------------------------------------ */

describe("evaluateAllStages", () => {
  it("returns one summary per stage", () => {
    const agents = [
      makeSummary({
        id: "a1",
        name: "A",
        capabilities: ["planning"],
        allowedStages: ["initializing"],
      }),
    ];
    const results = evaluateAllStages(agents);
    expect(results).toHaveLength(ALL_STAGES.length);
    const stages = results.map((r) => r.stage);
    for (const s of ALL_STAGES) {
      expect(stages).toContain(s);
    }
  });

  it("uses preferred stages map", () => {
    const agents = [
      makeSummary({
        id: "a1",
        name: "A",
        capabilities: ["planning"],
        allowedStages: ["initializing", "workflow_running"],
      }),
    ];
    const prefMap = new Map<string, readonly AgentStageAffinity[]>([
      ["a1", ["initializing"]],
    ]);
    const results = evaluateAllStages(agents, prefMap);
    const initResult = results.find((r) => r.stage === "initializing")!;
    expect(initResult.preferred).toHaveLength(1);
    const wfResult = results.find((r) => r.stage === "workflow_running")!;
    expect(wfResult.preferred).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Convenience query functions                                       */
/* ------------------------------------------------------------------ */

describe("convenience query functions", () => {
  const agents: AgentSummary[] = [
    makeSummary({
      id: "a1",
      name: "Alpha",
      capabilities: ["planning"],
      allowedStages: ["initializing"],
      routingPriority: 80,
    }),
    makeSummary({
      id: "a2",
      name: "Beta",
      capabilities: ["editing"],
      allowedStages: ["initializing", "workspace_binding"],
      routingPriority: 60,
    }),
    makeSummary({
      id: "a3",
      name: "Gamma",
      status: "disabled",
      capabilities: ["planning"],
      allowedStages: ["initializing"],
    }),
  ];

  it("getEligibleAgents returns eligible", () => {
    const eligible = getEligibleAgents(agents, "initializing");
    expect(eligible).toHaveLength(2);
    expect(eligible[0].agentId).toBe("a1"); // higher priority
    expect(eligible[1].agentId).toBe("a2");
  });

  it("getPreferredAgents returns only preferred", () => {
    const prefMap = new Map<string, readonly AgentStageAffinity[]>([
      ["a1", ["initializing"]],
    ]);
    const preferred = getPreferredAgents(agents, "initializing", prefMap);
    expect(preferred).toHaveLength(1);
    expect(preferred[0].agentId).toBe("a1");
  });

  it("getSkippedAgents returns skipped", () => {
    const skipped = getSkippedAgents(agents, "initializing");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].agentId).toBe("a3");
  });

  it("getTopAgent returns highest priority agent", () => {
    const top = getTopAgent(agents, "initializing");
    expect(top).not.toBeNull();
    expect(top!.agentId).toBe("a1");
  });

  it("getTopAgent returns null for no eligible agents", () => {
    const top = getTopAgent(agents, "done");
    expect(top).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  buildPreferredStagesMap                                           */
/* ------------------------------------------------------------------ */

describe("buildPreferredStagesMap", () => {
  it("builds map from definitions with routing metadata", () => {
    const defs: AgentDefinition[] = [
      makeDef({
        id: "a1",
        name: "A",
        capabilities: ["planning"],
        allowedStages: ["initializing", "workflow_running"],
        routing: { preferredStages: ["initializing"] },
      }),
      makeDef({
        id: "a2",
        name: "B",
        capabilities: ["editing"],
        allowedStages: ["workspace_binding"],
      }),
    ];
    const map = buildPreferredStagesMap(defs);
    expect(map.size).toBe(1);
    expect(map.get("a1")).toEqual(["initializing"]);
    expect(map.has("a2")).toBe(false);
  });

  it("empty for definitions without routing", () => {
    const defs: AgentDefinition[] = [
      makeDef({ id: "a1", name: "A" }),
    ];
    const map = buildPreferredStagesMap(defs);
    expect(map.size).toBe(0);
  });

  it("empty preferredStages array is excluded", () => {
    const defs: AgentDefinition[] = [
      makeDef({
        id: "a1",
        name: "A",
        routing: { preferredStages: [] },
      }),
    ];
    const map = buildPreferredStagesMap(defs);
    expect(map.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                        */
/* ------------------------------------------------------------------ */

describe("edge cases", () => {
  it("empty agents array returns empty results", () => {
    const result = evaluateStageParticipation([], "initializing");
    expect(result.eligible).toHaveLength(0);
    expect(result.preferred).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.stage).toBe("initializing");
  });

  it("all agents disabled for a stage", () => {
    const agents = [
      makeSummary({ id: "a1", name: "A", status: "disabled", allowedStages: ["initializing"] }),
      makeSummary({ id: "a2", name: "B", status: "failed", allowedStages: ["initializing"] }),
    ];
    const result = evaluateStageParticipation(agents, "initializing");
    expect(result.eligible).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it("agent with all stages allowed is eligible everywhere", () => {
    const agent = makeSummary({
      id: "omni",
      name: "Omni",
      capabilities: ["session_narration"],
      allowedStages: [...ALL_STAGES],
    });
    for (const stage of ALL_STAGES) {
      const result = evaluateAgentForStage(agent, stage);
      expect(result.eligible).toBe(true);
    }
  });

  it("agent with no capabilities but allowed stages is still eligible", () => {
    const agent = makeSummary({
      id: "stub",
      name: "Stub",
      capabilities: [],
      allowedStages: ["initializing"],
    });
    const result = evaluateAgentForStage(agent, "initializing");
    expect(result.eligible).toBe(true);
    expect(result.matchingCapabilities).toHaveLength(0);
  });

  it("priority tiebreaking is stable (insertion order preserved)", () => {
    const agents = [
      makeSummary({ id: "a1", name: "A", allowedStages: ["initializing"], routingPriority: 50 }),
      makeSummary({ id: "a2", name: "B", allowedStages: ["initializing"], routingPriority: 50 }),
      makeSummary({ id: "a3", name: "C", allowedStages: ["initializing"], routingPriority: 50 }),
    ];
    const result = evaluateStageParticipation(agents, "initializing");
    const ids = result.eligible.map((e) => e.agentId);
    // Same priority → sort is stable, order preserved
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  it("getTopAgent with multiple agents returns highest priority", () => {
    const agents = [
      makeSummary({ id: "low", name: "Low", allowedStages: ["initializing"], routingPriority: 10 }),
      makeSummary({ id: "high", name: "High", allowedStages: ["initializing"], routingPriority: 90 }),
      makeSummary({ id: "mid", name: "Mid", allowedStages: ["initializing"], routingPriority: 50 }),
    ];
    const top = getTopAgent(agents, "initializing");
    expect(top!.agentId).toBe("high");
  });
});

/* ------------------------------------------------------------------ */
/*  Routing event factories                                           */
/* ------------------------------------------------------------------ */

describe("routing event factories", () => {
  it("agentRoutingEvaluated produces correct event", () => {
    const event = agentRoutingEvaluated("initializing", 3, 1, 2);
    expect(event.kind).toBe("agent_routing_evaluated");
    expect(event.message).toContain("initializing");
    expect(event.message).toContain("3 eligible");
    expect(event.message).toContain("1 preferred");
    expect(event.message).toContain("2 skipped");
    expect(event.detail).toEqual({
      stage: "initializing",
      eligibleCount: 3,
      preferredCount: 1,
      skippedCount: 2,
    });
  });

  it("agentStageParticipationUpdated produces correct event", () => {
    const event = agentStageParticipationUpdated("a1", "Coder", "review", true, false);
    expect(event.kind).toBe("agent_stage_participation_updated");
    expect(event.message).toContain("Coder");
    expect(event.message).toContain("review");
    expect(event.detail).toEqual({
      agentId: "a1",
      name: "Coder",
      stage: "review",
      eligible: true,
      preferred: false,
    });
  });

  it("agentSkippedForStage produces correct event", () => {
    const event = agentSkippedForStage("a1", "Disabled Agent", "review", ["disabled"]);
    expect(event.kind).toBe("agent_skipped_for_stage");
    expect(event.message).toContain("Disabled Agent");
    expect(event.message).toContain("review");
    expect(event.message).toContain("disabled");
    expect(event.detail).toEqual({
      agentId: "a1",
      name: "Disabled Agent",
      stage: "review",
      reasons: ["disabled"],
    });
  });

  it("agentSelectedForStage produces correct event", () => {
    const event = agentSelectedForStage("a1", "Planner", "initializing", 80);
    expect(event.kind).toBe("agent_selected_for_stage");
    expect(event.message).toContain("Planner");
    expect(event.message).toContain("initializing");
    expect(event.message).toContain("80");
    expect(event.detail).toEqual({
      agentId: "a1",
      name: "Planner",
      stage: "initializing",
      priority: 80,
    });
  });

  it("AGENT_EVENT_KINDS includes Phase 27 routing events", () => {
    expect(AGENT_EVENT_KINDS).toContain("agent_routing_evaluated");
    expect(AGENT_EVENT_KINDS).toContain("agent_stage_participation_updated");
    expect(AGENT_EVENT_KINDS).toContain("agent_skipped_for_stage");
    expect(AGENT_EVENT_KINDS).toContain("agent_selected_for_stage");
    expect(AGENT_EVENT_KINDS).toHaveLength(11);
  });

  it("isAgentEvent recognizes new event kinds", () => {
    expect(isAgentEvent("agent_routing_evaluated")).toBe(true);
    expect(isAgentEvent("agent_stage_participation_updated")).toBe(true);
    expect(isAgentEvent("agent_skipped_for_stage")).toBe(true);
    expect(isAgentEvent("agent_selected_for_stage")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  buildAgentEventSummary                                            */
/* ------------------------------------------------------------------ */

describe("buildAgentEventSummary with routing events", () => {
  it("tracks routing evaluations and stage selections", () => {
    const events = [
      agentRoutingEvaluated("initializing", 2, 1, 1),
      agentSelectedForStage("a1", "Planner", "initializing", 80),
      agentSkippedForStage("a2", "Disabled", "initializing", ["disabled"]),
      agentRoutingEvaluated("review", 1, 0, 2),
    ];
    const summary = buildAgentEventSummary(events as any);
    expect(summary.routingEvaluations).toBe(2);
    expect(summary.stageSelections).toHaveLength(1);
    expect(summary.stageSelections[0]).toBe("a1");
    expect(summary.stageSkips).toHaveLength(1);
    expect(summary.stageSkips[0]).toBe("a2");
  });

  it("still tracks legacy attach/detach/enable/disable events", async () => {
    const { agentAttached: aAttached, agentDetached: aDetached, agentEnabled: aEnabled, agentDisabled: aDisabled, agentFailed: aFailed } = await import(
      "../../src/agents/session-integration.js"
    );
    const events = [
      aAttached("a1", "Agent1"),
      aEnabled("a1", "Agent1"),
      aDisabled("a2", "Agent2"),
      aDetached("a3", "Agent3"),
      aFailed("a4", "Agent4", "error"),
    ];
    const summary = buildAgentEventSummary(events);
    expect(summary.attached).toEqual(["a1"]);
    expect(summary.enabled).toEqual(["a1"]);
    expect(summary.disabled).toEqual(["a2"]);
    expect(summary.detached).toEqual(["a3"]);
    expect(summary.failed).toEqual(["a4"]);
    expect(summary.routingEvaluations).toBe(0);
    expect(summary.stageSelections).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Session summary integration                                       */
/* ------------------------------------------------------------------ */

describe("session summary with agent routing metadata", () => {
  let sm: SessionManager;
  let registry: AgentRegistry;

  beforeEach(() => {
    _resetIdCounter();
    sm = new SessionManager();
    registry = new AgentRegistry(sm);
  });

  it("summary without agent summaries has basic agent info", () => {
    const session = sm.createSession();
    const def = makeDef({
      id: "a1",
      name: "Planner",
      kind: "planning",
      capabilities: ["planning"],
      allowedStages: ["initializing"],
      routing: { roleHint: "planner", routingPriority: 80 },
    });
    registry.registerAgent(def);
    registry.attachToSession("a1", session.id);

    const summary = sm.getSessionSummary(session.id);
    expect(summary.agentCount).toBe(1);
    expect(summary.agents[0].id).toBe("a1");
    expect(summary.agents[0].ready).toBe(true);
    // Without enrichment, optional fields should be absent
    expect(summary.agents[0].roleHint).toBeUndefined();
  });

  it("summary with agent summaries includes routing metadata", () => {
    const session = sm.createSession();
    const def = makeDef({
      id: "a1",
      name: "Planner",
      kind: "planning",
      capabilities: ["planning"],
      allowedStages: ["initializing", "workflow_running"],
      routing: {
        roleHint: "planner",
        routingPriority: 80,
        preferredStages: ["initializing"],
        participationEnabled: true,
      },
    });
    registry.registerAgent(def);
    registry.attachToSession("a1", session.id);

    const agentSummaries = registry.getSessionAgentSummaries(session.id);
    const enrichment = agentSummaries.map((a) => ({
      id: a.id,
      roleHint: a.roleHint,
      routingPriority: a.routingPriority,
      participationEnabled: a.participationEnabled,
      allowedStages: a.allowedStages as readonly string[],
    }));

    const summary = sm.getSessionSummary(session.id, enrichment);
    expect(summary.agents[0].roleHint).toBe("planner");
    expect(summary.agents[0].routingPriority).toBe(80);
    expect(summary.agents[0].participationEnabled).toBe(true);
    expect(summary.agents[0].allowedStages).toEqual(["initializing", "workflow_running"]);
  });

  it("summary with multiple agents and mixed routing", () => {
    const session = sm.createSession();
    const def1 = makeDef({
      id: "a1",
      name: "Planner",
      kind: "planning",
      capabilities: ["planning"],
      allowedStages: ["initializing"],
      routing: { roleHint: "planner", routingPriority: 80 },
    });
    const def2 = makeDef({
      id: "a2",
      name: "Coder",
      kind: "coding",
      capabilities: ["editing"],
      allowedStages: ["workspace_binding"],
    });
    registry.registerAgent(def1);
    registry.registerAgent(def2);
    registry.attachToSession("a1", session.id);
    registry.attachToSession("a2", session.id);

    const agentSummaries = registry.getSessionAgentSummaries(session.id);
    const enrichment = agentSummaries.map((a) => ({
      id: a.id,
      roleHint: a.roleHint,
      routingPriority: a.routingPriority,
      participationEnabled: a.participationEnabled,
      allowedStages: a.allowedStages as readonly string[],
    }));

    const summary = sm.getSessionSummary(session.id, enrichment);
    expect(summary.agentCount).toBe(2);
    const a1 = summary.agents.find((a) => a.id === "a1")!;
    const a2 = summary.agents.find((a) => a.id === "a2")!;
    expect(a1.roleHint).toBe("planner");
    expect(a1.routingPriority).toBe(80);
    expect(a2.roleHint).toBeUndefined();
    expect(a2.routingPriority).toBeUndefined();
  });

  it("getSessionAgentSummaries includes Phase 27 fields", () => {
    const session = sm.createSession();
    const def = makeDef({
      id: "a1",
      name: "Planner",
      kind: "planning",
      capabilities: ["planning"],
      allowedStages: ["initializing"],
      routing: { roleHint: "planner", routingPriority: 75, participationEnabled: true },
    });
    registry.registerAgent(def);
    registry.attachToSession("a1", session.id);

    const summaries = registry.getSessionAgentSummaries(session.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].roleHint).toBe("planner");
    expect(summaries[0].routingPriority).toBe(75);
    expect(summaries[0].participationEnabled).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Deterministic routing decisions                                   */
/* ------------------------------------------------------------------ */

describe("deterministic routing", () => {
  it("same input always produces same output", () => {
    const agents = [
      makeSummary({ id: "a1", name: "A", capabilities: ["planning"], allowedStages: ["initializing"], routingPriority: 80 }),
      makeSummary({ id: "a2", name: "B", capabilities: ["editing"], allowedStages: ["initializing"], routingPriority: 60 }),
    ];
    const prefMap = new Map<string, readonly AgentStageAffinity[]>([["a1", ["initializing"]]]);

    const result1 = evaluateStageParticipation(agents, "initializing", prefMap);
    const result2 = evaluateStageParticipation(agents, "initializing", prefMap);

    expect(result1.eligible).toEqual(result2.eligible);
    expect(result1.preferred).toEqual(result2.preferred);
    expect(result1.skipped).toEqual(result2.skipped);
  });

  it("order-independent: different agent order, same results by priority", () => {
    const agents1 = [
      makeSummary({ id: "a1", name: "A", allowedStages: ["initializing"], routingPriority: 80 }),
      makeSummary({ id: "a2", name: "B", allowedStages: ["initializing"], routingPriority: 60 }),
    ];
    const agents2 = [
      makeSummary({ id: "a2", name: "B", allowedStages: ["initializing"], routingPriority: 60 }),
      makeSummary({ id: "a1", name: "A", allowedStages: ["initializing"], routingPriority: 80 }),
    ];
    const result1 = evaluateStageParticipation(agents1, "initializing");
    const result2 = evaluateStageParticipation(agents2, "initializing");
    expect(result1.eligible[0].agentId).toBe("a1");
    expect(result2.eligible[0].agentId).toBe("a1");
  });
});

/* ------------------------------------------------------------------ */
/*  Console / timeline event classification                           */
/* ------------------------------------------------------------------ */

describe("console/timeline classification for Phase 27 events", () => {
  it("timeline classifies routing events correctly", async () => {
    const { classifyEvent } = await import("../../src/app-shell/timeline-helpers.js");
    expect(classifyEvent("agent_routing_evaluated")).toBe("info");
    expect(classifyEvent("agent_selected_for_stage")).toBe("progress");
    expect(classifyEvent("agent_stage_participation_updated")).toBe("info");
    expect(classifyEvent("agent_skipped_for_stage")).toBe("warning");
  });

  it("console classifies routing events as agent actor", async () => {
    const { classifyActor, classifyCard } = await import(
      "../../src/app-shell/console-helpers.js"
    );
    expect(classifyActor("agent_routing_evaluated")).toBe("agent");
    expect(classifyActor("agent_stage_participation_updated")).toBe("agent");
    expect(classifyActor("agent_skipped_for_stage")).toBe("agent");
    expect(classifyActor("agent_selected_for_stage")).toBe("agent");

    expect(classifyCard("agent_routing_evaluated")).toBe("lifecycle_card");
    expect(classifyCard("agent_selected_for_stage")).toBe("lifecycle_card");
    expect(classifyCard("agent_skipped_for_stage")).toBe("lifecycle_card");
  });
});

/* ------------------------------------------------------------------ */
/*  AgentRoutingMeta on AgentDefinition                               */
/* ------------------------------------------------------------------ */

describe("AgentRoutingMeta on definition", () => {
  it("definition can have routing metadata", () => {
    const def = makeDef({
      id: "a1",
      name: "Planner",
      routing: {
        roleHint: "planner",
        preferredStages: ["initializing"],
        routingPriority: 90,
        participationEnabled: true,
      },
    });
    expect(def.routing?.roleHint).toBe("planner");
    expect(def.routing?.preferredStages).toEqual(["initializing"]);
    expect(def.routing?.routingPriority).toBe(90);
    expect(def.routing?.participationEnabled).toBe(true);
  });

  it("definition without routing metadata still works", () => {
    const def = makeDef({ id: "a2", name: "Basic" });
    expect(def.routing).toBeUndefined();
  });
});
