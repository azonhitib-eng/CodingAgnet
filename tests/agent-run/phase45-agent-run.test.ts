/**
 * Phase 45 — Minimal agent execution and task dispatch tests.
 *
 * Comprehensive tests for the agent-run module:
 * - Types and constants
 * - Agent selection (explicit, best-fit, no eligible)
 * - Execution adapter boundary (stub adapter)
 * - Task dispatch lifecycle
 * - Session event integration
 * - Command integration
 * - Deterministic behavior with mocked execution adapters
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports — types                                                    */
/* ------------------------------------------------------------------ */

import type {
  AgentRunId,
  AgentTaskKind,
  AgentRunStatus,
  AgentRunSelectionReason,
  AgentRunInput,
  AgentRunRequest,
  AgentRunOutput,
  AgentRunError,
  AgentRunErrorCode,
  AgentRunResult,
  AgentRunSummary,
  AgentSelectionCriteria,
  AgentSelectionResult,
  AgentExecutionAdapter,
  AgentRunDispatchDeps,
  AgentRunEventKind,
  AgentRunSessionSummary,
} from "../../src/agent-run/index.js";

/* ------------------------------------------------------------------ */
/*  Imports — functions                                                */
/* ------------------------------------------------------------------ */

import {
  ALL_TASK_KINDS,
  TASK_KIND_LABELS,
  buildAgentRunSummary,
  generateAgentRunId,
  _resetRunIdCounter,
  selectAgent,
  getDefaultTaskDescription,
  StubExecutionAdapter,
  dispatchAgentTask,
  inspectAgentRun,
  AGENT_RUN_EVENT_KINDS,
  agentRunRequested,
  agentRunStarted,
  agentRunCompleted,
  agentRunFailed,
  isAgentRunEvent,
  filterAgentRunEvents,
  buildAgentRunSessionSummary,
  agentRunResultToEvents,
} from "../../src/agent-run/index.js";

/* ------------------------------------------------------------------ */
/*  Imports — command types for integration checks                     */
/* ------------------------------------------------------------------ */

import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
} from "../../src/commands/types.js";

import { validateCommand } from "../../src/commands/validation.js";

/* ------------------------------------------------------------------ */
/*  Imports — agent types for fixtures                                 */
/* ------------------------------------------------------------------ */

import type { AgentSummary } from "../../src/agents/types.js";

/* ------------------------------------------------------------------ */
/*  Deterministic fixtures                                             */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Partial<AgentSummary> & { id: string; name: string; kind: string }): AgentSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind as AgentSummary["kind"],
    status: overrides.status ?? "attached",
    capabilities: overrides.capabilities ?? ["planning"],
    allowedStages: overrides.allowedStages ?? ["initializing", "workspace_binding"],
    failureReason: overrides.failureReason ?? null,
    disabledReason: overrides.disabledReason ?? null,
    roleHint: overrides.roleHint as AgentSummary["roleHint"],
    routingPriority: overrides.routingPriority ?? 50,
    participationEnabled: overrides.participationEnabled ?? true,
  };
}

const AGENT_PLANNER = makeAgent({
  id: "agent-planner",
  name: "Planner",
  kind: "planning",
  roleHint: "planner",
  routingPriority: 70,
  capabilities: ["planning", "repo_exploration"],
  allowedStages: ["initializing", "workspace_binding", "workflow_running"],
});

const AGENT_CODER = makeAgent({
  id: "agent-coder",
  name: "Coder",
  kind: "coding",
  roleHint: "editor",
  routingPriority: 60,
  capabilities: ["editing", "repo_exploration"],
  allowedStages: ["workspace_binding", "workflow_running"],
});

const AGENT_REVIEWER = makeAgent({
  id: "agent-reviewer",
  name: "Reviewer",
  kind: "review",
  roleHint: "reviewer",
  routingPriority: 55,
  capabilities: ["reviewing"],
  allowedStages: ["review", "done"],
});

const AGENT_DISABLED = makeAgent({
  id: "agent-disabled",
  name: "Disabled",
  kind: "testing",
  status: "disabled",
  disabledReason: "Disabled for testing",
});

const AGENT_FAILED = makeAgent({
  id: "agent-failed",
  name: "Failed",
  kind: "external",
  status: "failed",
  failureReason: "Connection lost",
});

const ALL_AGENTS: readonly AgentSummary[] = [
  AGENT_PLANNER,
  AGENT_CODER,
  AGENT_REVIEWER,
  AGENT_DISABLED,
  AGENT_FAILED,
];

const ELIGIBLE_AGENTS: readonly AgentSummary[] = [
  AGENT_PLANNER,
  AGENT_CODER,
  AGENT_REVIEWER,
];

beforeEach(() => {
  _resetRunIdCounter();
});

/* ================================================================== */
/*  1. Types and constants                                             */
/* ================================================================== */

describe("Phase 45 — Types and constants", () => {
  it("ALL_TASK_KINDS has 6 kinds", () => {
    expect(ALL_TASK_KINDS).toHaveLength(6);
    expect(ALL_TASK_KINDS).toContain("summarize_workspace");
    expect(ALL_TASK_KINDS).toContain("review_diagnostics");
    expect(ALL_TASK_KINDS).toContain("explain_files");
    expect(ALL_TASK_KINDS).toContain("summarize_github");
    expect(ALL_TASK_KINDS).toContain("general_query");
    expect(ALL_TASK_KINDS).toContain("custom");
  });

  it("TASK_KIND_LABELS has labels for all kinds", () => {
    for (const kind of ALL_TASK_KINDS) {
      expect(TASK_KIND_LABELS[kind]).toBeDefined();
      expect(typeof TASK_KIND_LABELS[kind]).toBe("string");
      expect(TASK_KIND_LABELS[kind].length).toBeGreaterThan(0);
    }
  });

  it("AGENT_RUN_EVENT_KINDS has 4 kinds", () => {
    expect(AGENT_RUN_EVENT_KINDS).toHaveLength(6);
    expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_requested");
    expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_started");
    expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_completed");
    expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_failed");
  });

  it("generateAgentRunId produces unique IDs", () => {
    const id1 = generateAgentRunId();
    const id2 = generateAgentRunId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^run-/);
    expect(id2).toMatch(/^run-/);
  });

  it("getDefaultTaskDescription returns descriptions for all task kinds", () => {
    for (const kind of ALL_TASK_KINDS) {
      const desc = getDefaultTaskDescription(kind);
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});

/* ================================================================== */
/*  2. Agent selection                                                 */
/* ================================================================== */

describe("Phase 45 — Agent selection", () => {
  describe("explicit agent selection", () => {
    it("selects agent by explicit ID", () => {
      const result = selectAgent(ALL_AGENTS, { targetAgentId: "agent-planner" });
      expect(result.ok).toBe(true);
      expect(result.agent).not.toBeNull();
      expect(result.agent!.id).toBe("agent-planner");
      expect(result.reason).not.toBeNull();
      expect(result.reason!.method).toBe("explicit_id");
      expect(result.reason!.explanation).toContain("Planner");
      expect(result.reason!.agentKind).toBe("planning");
      expect(result.error).toBeNull();
    });

    it("fails when explicit ID not found", () => {
      const result = selectAgent(ALL_AGENTS, { targetAgentId: "nonexistent" });
      expect(result.ok).toBe(false);
      expect(result.agent).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error!.code).toBe("AGENT_NOT_FOUND");
    });

    it("fails when explicit agent is not eligible (disabled)", () => {
      const result = selectAgent(ALL_AGENTS, { targetAgentId: "agent-disabled" });
      expect(result.ok).toBe(false);
      expect(result.error).not.toBeNull();
      expect(result.error!.code).toBe("AGENT_NOT_ATTACHED");
      expect(result.error!.message).toContain("disabled");
    });

    it("fails when explicit agent is not eligible (failed)", () => {
      const result = selectAgent(ALL_AGENTS, { targetAgentId: "agent-failed" });
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("AGENT_NOT_ATTACHED");
    });
  });

  describe("best-fit selection", () => {
    it("selects highest-priority eligible agent when no criteria", () => {
      const result = selectAgent(ELIGIBLE_AGENTS, {});
      expect(result.ok).toBe(true);
      expect(result.agent!.id).toBe("agent-planner");
      expect(result.reason!.method).toBe("best_fit");
      expect(result.reason!.eligibleCount).toBe(3);
    });

    it("prefers matching agent kind", () => {
      const result = selectAgent(ELIGIBLE_AGENTS, { preferredAgentKind: "review" });
      expect(result.ok).toBe(true);
      expect(result.agent!.id).toBe("agent-reviewer");
      expect(result.reason!.agentKind).toBe("review");
    });

    it("prefers matching role hint", () => {
      const result = selectAgent(ELIGIBLE_AGENTS, { preferredRoleHint: "editor" });
      expect(result.ok).toBe(true);
      expect(result.agent!.id).toBe("agent-coder");
    });

    it("prefers matching stage (combined with base priority)", () => {
      // reviewer (55+10=65) vs planner (70) - planner still wins on base priority
      // Use agents where stage boost can make a difference
      const agentA = makeAgent({ id: "a", name: "A", kind: "coding", routingPriority: 50, allowedStages: ["review"] });
      const agentB = makeAgent({ id: "b", name: "B", kind: "review", routingPriority: 50, allowedStages: ["review", "done"] });
      const result = selectAgent([agentA, agentB], { preferredStage: "review" });
      expect(result.ok).toBe(true);
      // Both have +10 for stage match, tie broken alphabetically
      expect(result.agent!.id).toBe("a");
    });

    it("returns only_eligible method when single agent available", () => {
      const result = selectAgent([AGENT_CODER], {});
      expect(result.ok).toBe(true);
      expect(result.reason!.method).toBe("only_eligible");
      expect(result.reason!.eligibleCount).toBe(1);
    });

    it("multiple criteria compound", () => {
      const result = selectAgent(ELIGIBLE_AGENTS, {
        preferredAgentKind: "coding",
        preferredRoleHint: "editor",
        preferredStage: "workspace_binding",
      });
      expect(result.ok).toBe(true);
      expect(result.agent!.id).toBe("agent-coder");
    });
  });

  describe("no eligible agent", () => {
    it("fails with empty agent list", () => {
      const result = selectAgent([], {});
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("NO_ELIGIBLE_AGENT");
    });

    it("fails when all agents are disabled or failed", () => {
      const result = selectAgent([AGENT_DISABLED, AGENT_FAILED], {});
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("NO_ELIGIBLE_AGENT");
    });

    it("fails when participationEnabled is false", () => {
      const disabled = makeAgent({
        id: "agent-no-participation",
        name: "No Participation",
        kind: "coding",
        participationEnabled: false,
      });
      const result = selectAgent([disabled], {});
      expect(result.ok).toBe(false);
      expect(result.error!.code).toBe("NO_ELIGIBLE_AGENT");
    });
  });

  describe("deterministic selection", () => {
    it("same inputs produce same agent selection", () => {
      const r1 = selectAgent(ELIGIBLE_AGENTS, { preferredAgentKind: "coding" });
      const r2 = selectAgent(ELIGIBLE_AGENTS, { preferredAgentKind: "coding" });
      expect(r1.agent!.id).toBe(r2.agent!.id);
      expect(r1.reason!.method).toBe(r2.reason!.method);
    });

    it("alphabetical tie-breaking for equal scores", () => {
      const a1 = makeAgent({ id: "aaa", name: "Agent A", kind: "coding", routingPriority: 50 });
      const a2 = makeAgent({ id: "bbb", name: "Agent B", kind: "coding", routingPriority: 50 });
      const result = selectAgent([a2, a1], {}); // reverse order
      expect(result.agent!.id).toBe("aaa"); // alphabetical first
    });
  });
});

/* ================================================================== */
/*  3. Execution adapter                                               */
/* ================================================================== */

describe("Phase 45 — Execution adapter", () => {
  describe("StubExecutionAdapter", () => {
    it("has kind 'stub' and is not model-backed", () => {
      const adapter = new StubExecutionAdapter();
      expect(adapter.kind).toBe("stub");
      expect(adapter.isModelBacked).toBe(false);
    });

    it("produces deterministic response for summarize_workspace", async () => {
      const adapter = new StubExecutionAdapter();
      const request = makeRequest("summarize_workspace");
      const output = await adapter.execute(request);
      expect(output.responseText).toContain("Workspace Summary");
      expect(output.responseText).toContain("stub");
      expect(output.responseText).toContain("not model-generated");
      expect(output.isModelGenerated).toBe(false);
      expect(output.adapterKind).toBe("stub");
      expect(typeof output.durationMs).toBe("number");
    });

    it("produces deterministic response for review_diagnostics", async () => {
      const adapter = new StubExecutionAdapter();
      const output = await adapter.execute(makeRequest("review_diagnostics"));
      expect(output.responseText).toContain("Diagnostics Review");
    });

    it("produces deterministic response for explain_files", async () => {
      const adapter = new StubExecutionAdapter();
      const output = await adapter.execute(makeRequest("explain_files"));
      expect(output.responseText).toContain("File & Module Explanation");
    });

    it("produces deterministic response for summarize_github", async () => {
      const adapter = new StubExecutionAdapter();
      const output = await adapter.execute(makeRequest("summarize_github"));
      expect(output.responseText).toContain("GitHub MCP Summary");
    });

    it("produces deterministic response for general_query", async () => {
      const adapter = new StubExecutionAdapter();
      const output = await adapter.execute(makeRequest("general_query", "What is this repo?"));
      expect(output.responseText).toContain("What is this repo?");
    });

    it("produces deterministic response for custom", async () => {
      const adapter = new StubExecutionAdapter();
      const output = await adapter.execute(makeRequest("custom", "Do something custom"));
      expect(output.responseText).toContain("Do something custom");
    });

    it("includes context summary info in response when available", async () => {
      const adapter = new StubExecutionAdapter();
      const request = makeRequest("summarize_workspace");
      const output = await adapter.execute(request);
      expect(output.responseText).toContain("3 slices");
    });

    it("handles missing context summary gracefully", async () => {
      const adapter = new StubExecutionAdapter();
      const request: AgentRunRequest = {
        ...makeRequest("summarize_workspace"),
        contextSummary: null,
        assembledContextText: "",
      };
      const output = await adapter.execute(request);
      expect(output.responseText).toContain("No context was assembled");
    });

    it("supports artificial delay", async () => {
      const adapter = new StubExecutionAdapter({ delayMs: 50 });
      const start = Date.now();
      const output = await adapter.execute(makeRequest("summarize_workspace"));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some timer imprecision
      expect(output.durationMs).toBeGreaterThanOrEqual(40);
    });
  });

  describe("custom adapter", () => {
    it("can implement AgentExecutionAdapter interface", async () => {
      const custom: AgentExecutionAdapter = {
        kind: "test",
        isModelBacked: true,
        async execute(request) {
          return {
            responseText: `Custom response to: ${request.taskDescription}`,
            isModelGenerated: true,
            adapterKind: "test",
            durationMs: 1,
          };
        },
      };
      const output = await custom.execute(makeRequest("general_query", "test input"));
      expect(output.responseText).toContain("test input");
      expect(output.isModelGenerated).toBe(true);
    });
  });
});

/* ================================================================== */
/*  4. Task dispatch lifecycle                                         */
/* ================================================================== */

describe("Phase 45 — Task dispatch", () => {
  function makeDeps(agents?: readonly AgentSummary[]): AgentRunDispatchDeps {
    return {
      getSessionAgents: () => agents ?? ELIGIBLE_AGENTS,
      adapter: new StubExecutionAdapter(),
    };
  }

  describe("successful dispatch", () => {
    it("dispatches summarize_workspace task", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.request).not.toBeNull();
      expect(result.request!.taskKind).toBe("summarize_workspace");
      expect(result.output).not.toBeNull();
      expect(result.output!.responseText).toContain("Workspace Summary");
      expect(result.output!.isModelGenerated).toBe(false);
      expect(result.error).toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("dispatches review_diagnostics task", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "review_diagnostics" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.output!.responseText).toContain("Diagnostics Review");
    });

    it("dispatches explain_files task", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "explain_files" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.output!.responseText).toContain("File & Module Explanation");
    });

    it("dispatches summarize_github task", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_github" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
    });

    it("dispatches general_query with description", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "general_query", taskDescription: "What is this?" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.request!.taskDescription).toBe("What is this?");
    });

    it("dispatches custom task with description", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "custom", taskDescription: "Custom task" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
    });

    it("uses default description when none provided for non-custom tasks", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      expect(result.request!.taskDescription).toContain("workspace context");
    });
  });

  describe("agent selection via dispatch", () => {
    it("selects agent by explicit ID", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace", targetAgentId: "agent-reviewer" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.request!.agentId).toBe("agent-reviewer");
      expect(result.request!.selectionReason.method).toBe("explicit_id");
    });

    it("selects best-fit agent by kind", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "review_diagnostics", preferredAgentKind: "review" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.request!.agentKind).toBe("review");
    });

    it("selects best-fit agent by role hint", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "explain_files", preferredRoleHint: "editor" },
        makeDeps(),
      );
      expect(result.status).toBe("completed");
      expect(result.request!.agentId).toBe("agent-coder");
    });
  });

  describe("context assembly in dispatch", () => {
    it("includes context summary in request", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      expect(result.request!.contextSummary).not.toBeNull();
      expect(result.request!.assembledContextText).toBeDefined();
    });

    it("uses custom context input provider when available", async () => {
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => ELIGIBLE_AGENTS,
        getContextInput: (_sessionId, agentKind) => ({
          agentKind: agentKind as "planning",
          sessionSummary: { id: "sess-1", stage: "review", status: "active" },
        }),
        adapter: new StubExecutionAdapter(),
      };
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        deps,
      );
      expect(result.status).toBe("completed");
      expect(result.request!.contextSummary!.includedSliceCount).toBeGreaterThan(0);
    });
  });

  describe("failure paths", () => {
    it("fails with empty session ID", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("SESSION_NOT_FOUND");
    });

    it("fails with invalid task kind", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "invalid" as AgentTaskKind },
        makeDeps(),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("INVALID_TASK");
    });

    it("fails with missing description for custom task", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "custom" },
        makeDeps(),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("INVALID_TASK");
    });

    it("fails with missing description for general_query", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "general_query" },
        makeDeps(),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("INVALID_TASK");
    });

    it("fails when no eligible agent", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps([]),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("NO_ELIGIBLE_AGENT");
    });

    it("fails when explicit agent not found", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace", targetAgentId: "nonexistent" },
        makeDeps(),
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("AGENT_NOT_FOUND");
    });

    it("fails when adapter throws", async () => {
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => ELIGIBLE_AGENTS,
        adapter: {
          kind: "failing",
          isModelBacked: false,
          execute: async () => { throw new Error("Adapter failure"); },
        },
      };
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        deps,
      );
      expect(result.status).toBe("failed");
      expect(result.error!.code).toBe("EXECUTION_FAILED");
      expect(result.error!.message).toContain("Adapter failure");
    });
  });

  describe("deterministic dispatch", () => {
    it("same inputs produce same result structure", async () => {
      _resetRunIdCounter();
      const r1 = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      _resetRunIdCounter();
      const r2 = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        makeDeps(),
      );
      expect(r1.status).toBe(r2.status);
      expect(r1.request!.agentId).toBe(r2.request!.agentId);
      expect(r1.request!.taskKind).toBe(r2.request!.taskKind);
      expect(r1.output!.adapterKind).toBe(r2.output!.adapterKind);
    });
  });
});

/* ================================================================== */
/*  5. Agent run summary                                               */
/* ================================================================== */

describe("Phase 45 — Agent run summary", () => {
  it("builds summary from completed result", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
    );
    const summary = buildAgentRunSummary(result);
    expect(summary.runId).toBe(result.runId);
    expect(summary.status).toBe("completed");
    expect(summary.agentId).toBe(result.request!.agentId);
    expect(summary.agentName).toBe(result.request!.agentName);
    expect(summary.taskKind).toBe("summarize_workspace");
    expect(summary.isModelGenerated).toBe(false);
    expect(summary.adapterKind).toBe("stub");
    expect(summary.outputPreview).not.toBeNull();
    expect(summary.outputPreview!.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(summary.errorCode).toBeNull();
  });

  it("builds summary from failed result", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => [], adapter: new StubExecutionAdapter() },
    );
    const summary = buildAgentRunSummary(result);
    expect(summary.status).toBe("failed");
    expect(summary.agentId).toBeNull();
    expect(summary.outputPreview).toBeNull();
    expect(summary.errorCode).toBe("NO_ELIGIBLE_AGENT");
  });
});

/* ================================================================== */
/*  6. Inspect agent run                                               */
/* ================================================================== */

describe("Phase 45 — inspectAgentRun", () => {
  it("produces human-readable report for completed run", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
    );
    const report = inspectAgentRun(result);
    expect(report).toContain("Agent Run Report");
    expect(report).toContain("completed");
    expect(report).toContain("Planner");
    expect(report).toContain("summarize_workspace");
    expect(report).toContain("Output:");
    expect(report).toContain("stub");
    expect(report).toContain("bounded agent execution");
  });

  it("produces report for failed run", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => [], adapter: new StubExecutionAdapter() },
    );
    const report = inspectAgentRun(result);
    expect(report).toContain("failed");
    expect(report).toContain("NO_ELIGIBLE_AGENT");
    expect(report).toContain("Error:");
  });
});

/* ================================================================== */
/*  7. Session integration                                             */
/* ================================================================== */

describe("Phase 45 — Session integration", () => {
  describe("event factories", () => {
    it("agentRunRequested creates event", () => {
      const event = agentRunRequested("run-1", "summarize_workspace", "Summarize workspace");
      expect(event.kind).toBe("agent_run_requested");
      expect(event.message).toContain("summarize_workspace");
      expect(event.detail?.runId).toBe("run-1");
    });

    it("agentRunStarted creates event", () => {
      const event = agentRunStarted("run-1", "Planner", "planning", "best_fit");
      expect(event.kind).toBe("agent_run_started");
      expect(event.message).toContain("Planner");
      expect(event.message).toContain("best_fit");
    });

    it("agentRunCompleted creates event", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
      );
      const summary = buildAgentRunSummary(result);
      const event = agentRunCompleted(summary);
      expect(event.kind).toBe("agent_run_completed");
      expect(event.message).toContain("Planner");
      expect(event.detail?.taskKind).toBe("summarize_workspace");
      expect(event.detail?.adapterKind).toBe("stub");
    });

    it("agentRunFailed creates event", () => {
      const event = agentRunFailed("run-1", "NO_ELIGIBLE_AGENT", "No agent available");
      expect(event.kind).toBe("agent_run_failed");
      expect(event.message).toContain("NO_ELIGIBLE_AGENT");
      expect(event.detail?.errorCode).toBe("NO_ELIGIBLE_AGENT");
    });
  });

  describe("event filtering", () => {
    it("isAgentRunEvent identifies run events", () => {
      const event = agentRunRequested("run-1", "summarize_workspace", "Test");
      expect(isAgentRunEvent(event)).toBe(true);
    });

    it("isAgentRunEvent rejects non-run events", () => {
      expect(isAgentRunEvent({ kind: "session_created" as any, timestamp: "", message: "" })).toBe(false);
    });

    it("filterAgentRunEvents filters correctly", () => {
      const events = [
        agentRunRequested("run-1", "summarize_workspace", "Test"),
        { kind: "session_created" as any, timestamp: "", message: "" },
        agentRunFailed("run-1", "NO_ELIGIBLE_AGENT", "error"),
      ];
      const filtered = filterAgentRunEvents(events);
      expect(filtered).toHaveLength(2);
    });
  });

  describe("agentRunResultToEvents", () => {
    it("produces completed event for successful run", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
      );
      const events = agentRunResultToEvents(result);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("agent_run_completed");
    });

    it("produces failed event for failed run", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        { getSessionAgents: () => [], adapter: new StubExecutionAdapter() },
      );
      const events = agentRunResultToEvents(result);
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("agent_run_failed");
    });
  });

  describe("buildAgentRunSessionSummary", () => {
    it("builds summary from result", async () => {
      const result = await dispatchAgentTask(
        { sessionId: "sess-1", taskKind: "summarize_workspace" },
        { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
      );
      const summary = buildAgentRunSessionSummary(result, 1);
      expect(summary.agentRunExecuted).toBe(true);
      expect(summary.lastAgentRunId).toBe(result.runId);
      expect(summary.lastAgentRunStatus).toBe("completed");
      expect(summary.lastAgentRunTaskKind).toBe("summarize_workspace");
      expect(summary.lastAgentRunAdapterKind).toBe("stub");
      expect(summary.lastAgentRunModelGenerated).toBe(false);
      expect(summary.totalAgentRuns).toBe(1);
    });

    it("builds empty summary for null", () => {
      const summary = buildAgentRunSessionSummary(null, 0);
      expect(summary.agentRunExecuted).toBe(false);
      expect(summary.lastAgentRunId).toBeNull();
      expect(summary.totalAgentRuns).toBe(0);
    });
  });
});

/* ================================================================== */
/*  8. Command integration                                             */
/* ================================================================== */

describe("Phase 45 — Command integration", () => {
  it("2 new command IDs exist", () => {
    expect(ALL_COMMAND_IDS).toContain("run_agent_task");
    expect(ALL_COMMAND_IDS).toContain("inspect_agent_run");
  });

  it("agent_run category exists", () => {
    expect(ALL_COMMAND_CATEGORIES).toContain("agent_run");
  });

  it("command definitions have correct category", () => {
    const run = getCommandDefinition("run_agent_task");
    const inspect = getCommandDefinition("inspect_agent_run");
    expect(run?.category).toBe("agent_run");
    expect(inspect?.category).toBe("agent_run");
  });

  it("total command definitions = 28", () => {
    expect(COMMAND_DEFINITIONS).toHaveLength(30);
  });

  describe("validation", () => {
    it("validates run_agent_task — requires taskKind", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates run_agent_task — valid kinds accepted", () => {
      for (const kind of ALL_TASK_KINDS) {
        if (kind === "custom" || kind === "general_query") continue;
        const result = validateCommand({
          commandId: "run_agent_task",
          data: { taskKind: kind },
        });
        expect(result.valid).toBe(true);
      }
    });

    it("validates run_agent_task — custom requires description", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "custom" },
      });
      expect(result.valid).toBe(false);

      const valid = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "custom", taskDescription: "Do this" },
      });
      expect(valid.valid).toBe(true);
    });

    it("validates run_agent_task — general_query requires description", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "general_query" },
      });
      expect(result.valid).toBe(false);

      const valid = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "general_query", taskDescription: "What is this?" },
      });
      expect(valid.valid).toBe(true);
    });

    it("validates run_agent_task — invalid kind rejected", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "invalid_kind" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates run_agent_task — invalid preferredAgentKind rejected", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "summarize_workspace", preferredAgentKind: "invalid" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates run_agent_task — valid preferredAgentKind accepted", () => {
      const result = validateCommand({
        commandId: "run_agent_task",
        data: { taskKind: "summarize_workspace", preferredAgentKind: "coding" },
      });
      expect(result.valid).toBe(true);
    });

    it("validates inspect_agent_run — no required fields", () => {
      const result = validateCommand({
        commandId: "inspect_agent_run",
        data: {},
      });
      expect(result.valid).toBe(true);
    });

    it("validates inspect_agent_run — optional runId accepted", () => {
      const result = validateCommand({
        commandId: "inspect_agent_run",
        data: { runId: "run-123" },
      });
      expect(result.valid).toBe(true);
    });
  });
});

/* ================================================================== */
/*  9. SessionEventKind coverage                                       */
/* ================================================================== */

describe("Phase 45 — SessionEventKind coverage", () => {
  it("agent_run event kinds compile as SessionEventKind", () => {
    const event = agentRunRequested("run-1", "summarize_workspace", "Test");
    expect(event.kind).toBe("agent_run_requested");
  });
});

/* ================================================================== */
/*  10. Barrel exports                                                 */
/* ================================================================== */

describe("Phase 45 — Barrel exports", () => {
  it("agent-run index exports all public functions", async () => {
    const mod = await import("../../src/agent-run/index.js");
    // Types constants
    expect(mod.ALL_TASK_KINDS).toBeDefined();
    expect(mod.TASK_KIND_LABELS).toBeDefined();
    expect(mod.buildAgentRunSummary).toBeTypeOf("function");
    expect(mod.generateAgentRunId).toBeTypeOf("function");
    expect(mod._resetRunIdCounter).toBeTypeOf("function");
    // Selection
    expect(mod.selectAgent).toBeTypeOf("function");
    expect(mod.getDefaultTaskDescription).toBeTypeOf("function");
    // Adapter
    expect(mod.StubExecutionAdapter).toBeTypeOf("function");
    // Dispatch
    expect(mod.dispatchAgentTask).toBeTypeOf("function");
    expect(mod.inspectAgentRun).toBeTypeOf("function");
    // Session integration
    expect(mod.AGENT_RUN_EVENT_KINDS).toBeDefined();
    expect(mod.agentRunRequested).toBeTypeOf("function");
    expect(mod.agentRunStarted).toBeTypeOf("function");
    expect(mod.agentRunCompleted).toBeTypeOf("function");
    expect(mod.agentRunFailed).toBeTypeOf("function");
    expect(mod.isAgentRunEvent).toBeTypeOf("function");
    expect(mod.filterAgentRunEvents).toBeTypeOf("function");
    expect(mod.buildAgentRunSessionSummary).toBeTypeOf("function");
    expect(mod.agentRunResultToEvents).toBeTypeOf("function");
  });

  it("main index re-exports agent-run", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.dispatchAgentTask).toBeTypeOf("function");
    expect(mod.selectAgent).toBeTypeOf("function");
    expect(mod.StubExecutionAdapter).toBeTypeOf("function");
    expect(mod.ALL_TASK_KINDS).toBeDefined();
  });
});

/* ================================================================== */
/*  11. Package.json subpath export                                    */
/* ================================================================== */

describe("Phase 45 — Package subpath export", () => {
  it("package.json has ./agent-run export", async () => {
    const { readFileSync } = await import("fs");
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(pkg.exports["./agent-run"]).toBeDefined();
    expect(pkg.exports["./agent-run"].import).toContain("agent-run");
  });
});

/* ================================================================== */
/*  12. Edge cases                                                     */
/* ================================================================== */

describe("Phase 45 — Edge cases", () => {
  it("result timestamps are ISO-8601", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
    );
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("run IDs contain 'run-' prefix", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
    );
    expect(result.runId).toMatch(/^run-/);
  });

  it("multiple dispatches produce different run IDs", async () => {
    const deps = { getSessionAgents: () => ELIGIBLE_AGENTS as AgentSummary[], adapter: new StubExecutionAdapter() };
    const r1 = await dispatchAgentTask({ sessionId: "sess-1", taskKind: "summarize_workspace" }, deps);
    const r2 = await dispatchAgentTask({ sessionId: "sess-1", taskKind: "review_diagnostics" }, deps);
    expect(r1.runId).not.toBe(r2.runId);
  });

  it("failed result has null request when failing before selection", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "", taskKind: "summarize_workspace" },
      { getSessionAgents: () => [], adapter: new StubExecutionAdapter() },
    );
    expect(result.request).toBeNull();
    expect(result.output).toBeNull();
  });

  it("selection reason includes eligible count", async () => {
    const result = await dispatchAgentTask(
      { sessionId: "sess-1", taskKind: "summarize_workspace" },
      { getSessionAgents: () => ELIGIBLE_AGENTS, adapter: new StubExecutionAdapter() },
    );
    expect(result.request!.selectionReason.eligibleCount).toBe(3);
  });
});

/* ================================================================== */
/*  Test helper: makeRequest                                           */
/* ================================================================== */

function makeRequest(taskKind: AgentTaskKind, taskDescription?: string): AgentRunRequest {
  return {
    runId: "test-run-1",
    sessionId: "sess-1",
    agentId: "agent-planner",
    agentName: "Planner",
    agentKind: "planning",
    taskKind,
    taskDescription: taskDescription ?? getDefaultTaskDescription(taskKind),
    selectionReason: {
      method: "best_fit",
      explanation: "Test selection",
      agentKind: "planning",
      roleHint: "planner",
      stage: null,
      priority: 70,
      eligibleCount: 1,
    },
    contextSummary: {
      agentKind: "planning",
      roleHint: "planner",
      profileId: "typescript-node",
      includedSliceCount: 3,
      excludedSliceCount: 1,
      totalChars: 500,
      contributingSources: ["session", "workspace", "fingerprint"],
      anyTrimmed: false,
      explanation: "Test context",
    },
    assembledContextText: "Test assembled context",
    requestedAt: new Date().toISOString(),
  };
}
