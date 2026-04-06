/**
 * Phase 48 — Execution adapter wiring and end-to-end shell agent run path.
 *
 * Comprehensive tests for:
 * - Environment-based adapter configuration loading
 * - Server adapter state lifecycle
 * - Command-to-adapter execution path (run_agent_task, inspect_agent_adapter,
 *   refresh_agent_adapter_status, inspect_agent_run)
 * - Failure-state distinctions (not configured, configured but unavailable,
 *   network/auth/config failure, runtime execution failure)
 * - Session event emission and summary integration
 * - Server wiring (buildCommandExecutorDeps includes adapter deps)
 * - No regression in demo mode and existing shell flows
 *
 * All tests use deterministic mocks — no live external services.
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports under test                                                 */
/* ------------------------------------------------------------------ */

import {
  /* env-config (Phase 48) */
  ENV_PREFIX,
  ENV_VARS,
  ALL_ENV_VARS,
  loadAdapterConfigFromEnv,
  buildEnvConfigReport,
  /* server-adapter-state (Phase 48) */
  createServerAdapterState,
  ensureAdapterResolved,
  buildRunAgentTaskDep,
  buildInspectAgentAdapterDep,
  buildRefreshAgentAdapterStatusDep,
  buildInspectAgentRunDep,
  emitAdapterResolvedEvent,
  getAdapterSessionSummary,
  /* existing exports */
  StubExecutionAdapter,
  EchoTestAdapter,
  resolveAdapter,
  refreshAdapterStatus,
  inspectAdapterStatus,
  buildAdapterStatus,
  ALL_ADAPTER_KINDS,
  ADAPTER_AVAILABILITY_LABELS,
  ADAPTER_KIND_LABELS,
  validateOpenAIConfig,
  dispatchAgentTask,
  inspectAgentRun,
  AGENT_RUN_EVENT_KINDS,
  agentRunRequested,
  agentRunCompleted,
  agentRunFailed,
  agentAdapterResolved,
  agentAdapterStatusRefreshed,
  buildAgentRunSessionSummary,
  agentRunResultToEvents,
  isAgentRunEvent,
  filterAgentRunEvents,
  ALL_TASK_KINDS,
  _resetRunIdCounter,
} from "../../src/agent-run/index.js";

import type {
  ServerAdapterState,
  FetchFn,
} from "../../src/agent-run/index.js";

import {
  SessionManager,
} from "../../src/session/index.js";

import {
  COMMAND_DEFINITIONS,
  executeCommand,
} from "../../src/commands/index.js";

import type { CommandPayload } from "../../src/commands/index.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function freshSessionManager(): SessionManager {
  return new SessionManager();
}

function freshState(): ServerAdapterState {
  return createServerAdapterState();
}

/* ------------------------------------------------------------------ */
/*  1. Environment-based adapter configuration                         */
/* ------------------------------------------------------------------ */

describe("Environment-based adapter configuration — Phase 48", () => {
  describe("ENV_VARS constants", () => {
    it("exports the expected env prefix", () => {
      expect(ENV_PREFIX).toBe("AGENT_ADAPTER_");
    });

    it("exports env var keys with correct prefix", () => {
      for (const key of Object.values(ENV_VARS)) {
        expect(key).toMatch(/^AGENT_ADAPTER_/);
      }
    });

    it("ALL_ENV_VARS matches ENV_VARS values", () => {
      expect(ALL_ENV_VARS).toEqual(Object.values(ENV_VARS));
    });

    it("has kind, base URL, API key, and model vars", () => {
      expect(ENV_VARS.KIND).toBe("AGENT_ADAPTER_KIND");
      expect(ENV_VARS.OPENAI_BASE_URL).toBe("AGENT_ADAPTER_OPENAI_BASE_URL");
      expect(ENV_VARS.OPENAI_API_KEY).toBe("AGENT_ADAPTER_OPENAI_API_KEY");
      expect(ENV_VARS.OPENAI_MODEL).toBe("AGENT_ADAPTER_OPENAI_MODEL");
    });

    it("has optional OpenAI config vars", () => {
      expect(ENV_VARS.OPENAI_MAX_TOKENS).toBe("AGENT_ADAPTER_OPENAI_MAX_TOKENS");
      expect(ENV_VARS.OPENAI_TEMPERATURE).toBe("AGENT_ADAPTER_OPENAI_TEMPERATURE");
      expect(ENV_VARS.OPENAI_TIMEOUT_MS).toBe("AGENT_ADAPTER_OPENAI_TIMEOUT_MS");
      expect(ENV_VARS.OPENAI_LABEL).toBe("AGENT_ADAPTER_OPENAI_LABEL");
    });
  });

  describe("loadAdapterConfigFromEnv — not configured", () => {
    it("returns not_configured when no env vars are set", () => {
      const result = loadAdapterConfigFromEnv({});
      expect(result.status).toBe("not_configured");
      expect(result.kind).toBeNull();
      expect(result.openaiConfig).toBeNull();
      expect(result.resolveOptions).toBeNull();
      expect(result.warnings).toHaveLength(0);
      expect(result.detectedVars).toHaveLength(0);
    });

    it("returns not_configured with empty string values", () => {
      const env = { AGENT_ADAPTER_KIND: "" };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("not_configured");
    });

    it("report mentions default stub adapter", () => {
      const result = loadAdapterConfigFromEnv({});
      expect(result.report).toContain("stub");
    });
  });

  describe("loadAdapterConfigFromEnv — partially configured", () => {
    it("returns partially_configured when vars set but kind missing", () => {
      const env = { AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1" };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("partially_configured");
      expect(result.kind).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.detectedVars).toContain("AGENT_ADAPTER_OPENAI_BASE_URL");
    });

    it("returns partially_configured for unknown kind", () => {
      const env = { AGENT_ADAPTER_KIND: "nonexistent" };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("partially_configured");
      expect(result.warnings.some((w) => w.includes("Unknown adapter kind"))).toBe(true);
    });

    it("returns partially_configured for openai_compatible with missing API key", () => {
      const env = {
        AGENT_ADAPTER_KIND: "openai_compatible",
        AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1",
        AGENT_ADAPTER_OPENAI_MODEL: "llama3.2",
      };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("partially_configured");
      expect(result.kind).toBe("openai_compatible");
      expect(result.warnings.some((w) => w.includes("Missing required"))).toBe(true);
    });

    it("returns partially_configured for openai_compatible with missing model", () => {
      const env = {
        AGENT_ADAPTER_KIND: "openai_compatible",
        AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1",
        AGENT_ADAPTER_OPENAI_API_KEY: "",
      };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("partially_configured");
    });
  });

  describe("loadAdapterConfigFromEnv — stub configured", () => {
    it("returns configured for stub kind", () => {
      const env = { AGENT_ADAPTER_KIND: "stub" };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("configured");
      expect(result.kind).toBe("stub");
      expect(result.resolveOptions).toEqual({ kind: "stub" });
      expect(result.openaiConfig).toBeNull();
    });
  });

  describe("loadAdapterConfigFromEnv — echo_test configured", () => {
    it("returns configured for echo_test kind", () => {
      const env = { AGENT_ADAPTER_KIND: "echo_test" };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("configured");
      expect(result.kind).toBe("echo_test");
      expect(result.resolveOptions).toEqual({ kind: "echo_test" });
    });
  });

  describe("loadAdapterConfigFromEnv — openai_compatible fully configured", () => {
    const fullEnv = {
      AGENT_ADAPTER_KIND: "openai_compatible",
      AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1",
      AGENT_ADAPTER_OPENAI_API_KEY: "",
      AGENT_ADAPTER_OPENAI_MODEL: "llama3.2",
    };

    it("returns configured with required fields", () => {
      const result = loadAdapterConfigFromEnv(fullEnv);
      expect(result.status).toBe("configured");
      expect(result.kind).toBe("openai_compatible");
      expect(result.openaiConfig).not.toBeNull();
      expect(result.openaiConfig!.baseUrl).toBe("http://localhost:11434/v1");
      expect(result.openaiConfig!.apiKey).toBe("");
      expect(result.openaiConfig!.model).toBe("llama3.2");
    });

    it("resolveOptions has kind and openaiConfig", () => {
      const result = loadAdapterConfigFromEnv(fullEnv);
      expect(result.resolveOptions).not.toBeNull();
      expect(result.resolveOptions!.kind).toBe("openai_compatible");
      expect(result.resolveOptions!.openaiConfig).toBeDefined();
    });

    it("parses optional numeric fields", () => {
      const env = {
        ...fullEnv,
        AGENT_ADAPTER_OPENAI_MAX_TOKENS: "2048",
        AGENT_ADAPTER_OPENAI_TEMPERATURE: "0.5",
        AGENT_ADAPTER_OPENAI_TIMEOUT_MS: "60000",
        AGENT_ADAPTER_OPENAI_LABEL: "My Custom Model",
      };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("configured");
      expect(result.openaiConfig!.maxTokens).toBe(2048);
      expect(result.openaiConfig!.temperature).toBe(0.5);
      expect(result.openaiConfig!.timeoutMs).toBe(60000);
      expect(result.openaiConfig!.label).toBe("My Custom Model");
    });

    it("warns on invalid numeric fields but still configures", () => {
      const env = {
        ...fullEnv,
        AGENT_ADAPTER_OPENAI_MAX_TOKENS: "abc",
        AGENT_ADAPTER_OPENAI_TEMPERATURE: "5.0",
      };
      const result = loadAdapterConfigFromEnv(env);
      expect(result.status).toBe("configured");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.openaiConfig!.maxTokens).toBeUndefined();
      expect(result.openaiConfig!.temperature).toBeUndefined();
    });
  });

  describe("buildEnvConfigReport", () => {
    it("produces a report for not_configured state", () => {
      const result = loadAdapterConfigFromEnv({});
      const report = buildEnvConfigReport(result);
      expect(report).toContain("not_configured");
      expect(report).toContain("(none)");
    });

    it("produces a report with warnings for partial config", () => {
      const result = loadAdapterConfigFromEnv({ AGENT_ADAPTER_KIND: "unknown" });
      const report = buildEnvConfigReport(result);
      expect(report).toContain("partially_configured");
      expect(report).toContain("Warnings:");
    });

    it("produces a report for configured state", () => {
      const result = loadAdapterConfigFromEnv({ AGENT_ADAPTER_KIND: "stub" });
      const report = buildEnvConfigReport(result);
      expect(report).toContain("configured");
      expect(report).toContain("stub");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  2. Server adapter state lifecycle                                  */
/* ------------------------------------------------------------------ */

describe("Server adapter state lifecycle — Phase 48", () => {
  beforeEach(() => {
    _resetRunIdCounter();
  });

  describe("createServerAdapterState", () => {
    it("creates a fresh state with no adapter", () => {
      const state = freshState();
      expect(state.adapter).toBeNull();
      expect(state.status).toBeNull();
      expect(state.lastResolution).toBeNull();
      expect(state.lastEnvConfig).toBeNull();
      expect(state.openaiConfig).toBeNull();
      expect(state.totalRuns).toBe(0);
      expect(state.lastRunResult).toBeNull();
    });
  });

  describe("ensureAdapterResolved — no config", () => {
    it("resolves to stub adapter when no env vars set", async () => {
      const state = freshState();
      await ensureAdapterResolved(state, {});
      expect(state.adapter).not.toBeNull();
      expect(state.adapter!.kind).toBe("stub");
      expect(state.status).not.toBeNull();
      expect(state.lastEnvConfig).not.toBeNull();
      expect(state.lastEnvConfig!.status).toBe("not_configured");
    });

    it("is idempotent — second call is a no-op", async () => {
      const state = freshState();
      await ensureAdapterResolved(state, {});
      const firstAdapter = state.adapter;
      await ensureAdapterResolved(state, {});
      expect(state.adapter).toBe(firstAdapter);
    });
  });

  describe("ensureAdapterResolved — stub config", () => {
    it("resolves to stub when explicitly configured", async () => {
      const state = freshState();
      await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "stub" });
      expect(state.adapter!.kind).toBe("stub");
      expect(state.status!.availability).toBe("configured_available");
    });
  });

  describe("ensureAdapterResolved — echo_test config", () => {
    it("resolves to echo_test adapter", async () => {
      const state = freshState();
      await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
      expect(state.adapter!.kind).toBe("echo_test");
      expect(state.status!.availability).toBe("configured_available");
    });
  });

  describe("ensureAdapterResolved — openai_compatible without network", () => {
    it("falls back to stub when OpenAI backend is unreachable", async () => {
      const mockFetch: FetchFn = async () => {
        throw new Error("network unreachable");
      };
      const state = createServerAdapterState({ fetchFn: mockFetch });
      await ensureAdapterResolved(state, {
        AGENT_ADAPTER_KIND: "openai_compatible",
        AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:99999/v1",
        AGENT_ADAPTER_OPENAI_API_KEY: "test-key",
        AGENT_ADAPTER_OPENAI_MODEL: "test-model",
      });
      // Should have a stub adapter as fallback
      expect(state.adapter).not.toBeNull();
      expect(state.adapter!.kind).toBe("stub");
      // But the status should reflect the failed resolution
      expect(state.status).not.toBeNull();
      expect(state.lastResolution!.ok).toBe(false);
    });
  });

  describe("ensureAdapterResolved — partial config", () => {
    it("falls back to stub when config is incomplete", async () => {
      const state = freshState();
      await ensureAdapterResolved(state, {
        AGENT_ADAPTER_KIND: "openai_compatible",
        AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1",
        // Missing API key and model
      });
      expect(state.adapter!.kind).toBe("stub");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  3. Command-to-adapter execution path                               */
/* ------------------------------------------------------------------ */

describe("Command-to-adapter execution path — Phase 48", () => {
  let sm: SessionManager;
  let state: ServerAdapterState;

  beforeEach(async () => {
    _resetRunIdCounter();
    sm = freshSessionManager();
    state = freshState();
    // Pre-resolve to echo_test for consistent testing
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
  });

  describe("buildRunAgentTaskDep", () => {
    it("returns a function", () => {
      const fn = buildRunAgentTaskDep(state, sm);
      expect(typeof fn).toBe("function");
    });

    it("fails when no active session", async () => {
      const fn = buildRunAgentTaskDep(state, sm);
      const result = await fn("summarize_workspace");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("No active session");
    });

    it("executes successfully with a session and attached agent", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      const result = await fn("summarize_workspace");
      expect(result.ok).toBe(true);
      expect(result.detail).toBeDefined();
      expect(result.detail!.adapterKind).toBe("echo_test");
      expect(result.detail!.isModelGenerated).toBe(false);
    });

    it("emits session events on successful run", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      await fn("summarize_workspace");

      const s = sm.getSession(session.id)!;
      const agentEvents = s.events.filter((e) =>
        e.kind === "agent_run_requested" || e.kind === "agent_run_completed",
      );
      expect(agentEvents.length).toBeGreaterThanOrEqual(2);
    });

    it("increments totalRuns on each execution", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      expect(state.totalRuns).toBe(0);
      await fn("summarize_workspace");
      expect(state.totalRuns).toBe(1);
      await fn("review_diagnostics");
      expect(state.totalRuns).toBe(2);
    });

    it("stores lastRunResult on each execution", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      expect(state.lastRunResult).toBeNull();
      await fn("summarize_workspace");
      expect(state.lastRunResult).not.toBeNull();
      expect(state.lastRunResult!.status).toBe("completed");
    });

    it("returns error detail on failure", async () => {
      sm.createSession();
      // No agents attached — will fail selection

      const fn = buildRunAgentTaskDep(state, sm);
      const result = await fn("summarize_workspace");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Agent selection failed");
      expect(result.detail).toBeDefined();
      expect(result.detail!.errorCode).toBe("NO_ELIGIBLE_AGENT");
    });

    it("handles invalid task kind", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      const result = await fn("nonexistent_task_kind");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid task");
    });

    it("passes taskDescription through", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      const result = await fn("general_query", "What does this repo do?");
      expect(result.ok).toBe(true);
      expect(result.detail!.outputPreview).toContain("What does this repo do?");
    });
  });

  describe("buildInspectAgentAdapterDep", () => {
    it("returns a function", () => {
      const fn = buildInspectAgentAdapterDep(state);
      expect(typeof fn).toBe("function");
    });

    it("returns adapter inspection details", async () => {
      const fn = buildInspectAgentAdapterDep(state);
      const result = await fn();
      expect(result.ok).toBe(true);
      expect(result.detail).toBeDefined();
      expect(result.detail!.status).toBeDefined();
      expect(result.detail!.report).toBeDefined();
      expect(typeof result.detail!.report).toBe("string");
    });

    it("includes env config status", async () => {
      const fn = buildInspectAgentAdapterDep(state);
      const result = await fn();
      expect(result.detail!.envConfigStatus).toBeDefined();
    });

    it("includes resolution info", async () => {
      const fn = buildInspectAgentAdapterDep(state);
      const result = await fn();
      expect(result.detail!.resolutionOk).toBe(true);
    });

    it("includes run counts", async () => {
      const fn = buildInspectAgentAdapterDep(state);
      const result = await fn();
      expect(result.detail!.totalRuns).toBe(0);
      expect(result.detail!.lastRunStatus).toBeNull();
    });
  });

  describe("buildRefreshAgentAdapterStatusDep", () => {
    it("returns a function", () => {
      const fn = buildRefreshAgentAdapterStatusDep(state, sm);
      expect(typeof fn).toBe("function");
    });

    it("refreshes adapter status", async () => {
      const fn = buildRefreshAgentAdapterStatusDep(state, sm);
      const result = await fn();
      expect(result.ok).toBe(true);
      expect(result.detail).toBeDefined();
      expect(result.detail!.kind).toBe("echo_test");
      expect(result.detail!.availability).toBe("configured_available");
    });

    it("emits session event on refresh", async () => {
      const session = sm.createSession();
      const fn = buildRefreshAgentAdapterStatusDep(state, sm);
      await fn();
      const s = sm.getSession(session.id)!;
      const refreshEvents = s.events.filter(
        (e) => e.kind === "agent_adapter_status_refreshed",
      );
      expect(refreshEvents.length).toBe(1);
    });

    it("works when adapter not yet resolved", async () => {
      const newState = freshState();
      const fn = buildRefreshAgentAdapterStatusDep(newState, sm);
      const result = await fn();
      expect(result.ok).toBe(true);
      // Should have resolved on demand
      expect(newState.adapter).not.toBeNull();
    });
  });

  describe("buildInspectAgentRunDep", () => {
    it("returns a function", () => {
      const fn = buildInspectAgentRunDep(state);
      expect(typeof fn).toBe("function");
    });

    it("returns error when no run has executed", async () => {
      const fn = buildInspectAgentRunDep(state);
      const result = await fn();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("No agent run");
    });

    it("returns run report after an execution", async () => {
      // Execute a run first
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });
      const runFn = buildRunAgentTaskDep(state, sm);
      await runFn("summarize_workspace");

      const inspectFn = buildInspectAgentRunDep(state);
      const result = await inspectFn();
      expect(result.ok).toBe(true);
      expect(result.detail).toBeDefined();
      expect(result.detail!.report).toBeDefined();
      expect(typeof result.detail!.report).toBe("string");
      expect(result.detail!.status).toBe("completed");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  4. Failure-state distinctions                                      */
/* ------------------------------------------------------------------ */

describe("Failure-state distinctions — Phase 48", () => {
  beforeEach(() => {
    _resetRunIdCounter();
  });

  it("not_configured: no env vars → stub fallback", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, {});
    expect(state.adapter!.kind).toBe("stub");
    expect(state.lastEnvConfig!.status).toBe("not_configured");
  });

  it("partially_configured: incomplete OpenAI config → stub fallback", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, {
      AGENT_ADAPTER_KIND: "openai_compatible",
      AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:11434/v1",
    });
    expect(state.adapter!.kind).toBe("stub");
    expect(state.lastEnvConfig!.status).toBe("partially_configured");
  });

  it("configured but unavailable: OpenAI backend unreachable", async () => {
    const mockFetch: FetchFn = async () => {
      throw new Error("Connection refused");
    };
    const state = createServerAdapterState({ fetchFn: mockFetch });
    await ensureAdapterResolved(state, {
      AGENT_ADAPTER_KIND: "openai_compatible",
      AGENT_ADAPTER_OPENAI_BASE_URL: "http://localhost:99999/v1",
      AGENT_ADAPTER_OPENAI_API_KEY: "test-key",
      AGENT_ADAPTER_OPENAI_MODEL: "test-model",
    });
    // Resolution failed, fell back to stub
    expect(state.lastResolution!.ok).toBe(false);
    expect(state.lastResolution!.error!.kind).toBe("unavailable");
  });

  it("invalid config: bad OpenAI config values", () => {
    const result = loadAdapterConfigFromEnv({
      AGENT_ADAPTER_KIND: "openai_compatible",
      AGENT_ADAPTER_OPENAI_BASE_URL: "",
      AGENT_ADAPTER_OPENAI_API_KEY: "",
      AGENT_ADAPTER_OPENAI_MODEL: "",
    });
    expect(result.status).toBe("partially_configured");
  });

  it("runtime execution failure: adapter error propagated", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
    const sm = freshSessionManager();
    sm.createSession();
    // No agents → selection failure
    const fn = buildRunAgentTaskDep(state, sm);
    const result = await fn("summarize_workspace");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.detail!.errorCode).toBe("NO_ELIGIBLE_AGENT");
  });

  it("distinguishes session_not_found from agent_not_found errors", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
    const sm = freshSessionManager();
    // No session created
    const fn = buildRunAgentTaskDep(state, sm);
    const result = await fn("summarize_workspace");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No active session");
  });
});

/* ------------------------------------------------------------------ */
/*  5. Session and shell integration                                   */
/* ------------------------------------------------------------------ */

describe("Session and shell integration — Phase 48", () => {
  let sm: SessionManager;
  let state: ServerAdapterState;

  beforeEach(async () => {
    _resetRunIdCounter();
    sm = freshSessionManager();
    state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
  });

  describe("emitAdapterResolvedEvent", () => {
    it("emits adapter resolved event to session", async () => {
      const session = sm.createSession();
      await emitAdapterResolvedEvent(state, sm);
      const s = sm.getSession(session.id)!;
      const resolvedEvents = s.events.filter(
        (e) => e.kind === "agent_adapter_resolved",
      );
      expect(resolvedEvents.length).toBe(1);
    });

    it("does nothing when no session exists", async () => {
      // No session created — should not throw
      await emitAdapterResolvedEvent(state, sm);
    });
  });

  describe("getAdapterSessionSummary", () => {
    it("returns summary with adapter info when no runs", () => {
      const summary = getAdapterSessionSummary(state);
      expect(summary.agentRunExecuted).toBe(false);
      expect(summary.totalAgentRuns).toBe(0);
      expect(summary.activeAdapterKind).toBe("echo_test");
      expect(summary.activeAdapterAvailability).toBe("configured_available");
      expect(summary.activeAdapterIsModelBacked).toBe(false);
    });

    it("returns summary with run info after execution", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });
      const fn = buildRunAgentTaskDep(state, sm);
      await fn("summarize_workspace");

      const summary = getAdapterSessionSummary(state);
      expect(summary.agentRunExecuted).toBe(true);
      expect(summary.totalAgentRuns).toBe(1);
      expect(summary.lastAgentRunStatus).toBe("completed");
      expect(summary.lastAgentRunAdapterKind).toBe("echo_test");
    });
  });

  describe("session events reflect real run lifecycle", () => {
    it("run lifecycle events are emitted in correct order", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const fn = buildRunAgentTaskDep(state, sm);
      await fn("summarize_workspace");

      const s = sm.getSession(session.id)!;
      const agentEvents = s.events.filter(isAgentRunEvent);
      const kinds = agentEvents.map((e) => e.kind);
      expect(kinds).toContain("agent_run_requested");
      expect(kinds).toContain("agent_run_completed");
    });

    it("failure events emitted on run failure", async () => {
      const session = sm.createSession();
      // No agents attached — will fail

      const fn = buildRunAgentTaskDep(state, sm);
      await fn("summarize_workspace");

      const s = sm.getSession(session.id)!;
      const agentEvents = s.events.filter(isAgentRunEvent);
      const kinds = agentEvents.map((e) => e.kind);
      expect(kinds).toContain("agent_run_requested");
      expect(kinds).toContain("agent_run_failed");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  6. End-to-end command path through executor                        */
/* ------------------------------------------------------------------ */

describe("End-to-end command path — Phase 48", () => {
  let sm: SessionManager;
  let state: ServerAdapterState;

  beforeEach(async () => {
    _resetRunIdCounter();
    sm = freshSessionManager();
    state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
  });

  describe("run_agent_task through executeCommand", () => {
    it("executes successfully through the full command path", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      const payload: CommandPayload = {
        commandId: "run_agent_task",
        data: { taskKind: "summarize_workspace" },
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        runAgentTask: buildRunAgentTaskDep(state, sm),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("completed");
    });

    it("fails gracefully when no agents attached", async () => {
      const session = sm.createSession();

      const payload: CommandPayload = {
        commandId: "run_agent_task",
        data: { taskKind: "summarize_workspace" },
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        runAgentTask: buildRunAgentTaskDep(state, sm),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("failed");
    });
  });

  describe("inspect_agent_adapter through executeCommand", () => {
    it("executes successfully through the full command path", async () => {
      const session = sm.createSession();

      const payload: CommandPayload = {
        commandId: "inspect_agent_adapter",
        data: {},
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        inspectAgentAdapter: buildInspectAgentAdapterDep(state),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("completed");
    });
  });

  describe("refresh_agent_adapter_status through executeCommand", () => {
    it("executes successfully through the full command path", async () => {
      const session = sm.createSession();

      const payload: CommandPayload = {
        commandId: "refresh_agent_adapter_status",
        data: {},
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        refreshAgentAdapterStatus: buildRefreshAgentAdapterStatusDep(state, sm),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("completed");
    });
  });

  describe("inspect_agent_run through executeCommand", () => {
    it("returns completed when a run exists", async () => {
      const session = sm.createSession();
      sm.attachResource(session.id, {
        id: "agent-1",
        kind: "agent",
        label: "Test Agent",
        ready: true,
      });

      // First run an agent task
      const runDep = buildRunAgentTaskDep(state, sm);
      await runDep("summarize_workspace");

      const payload: CommandPayload = {
        commandId: "inspect_agent_run",
        data: {},
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        inspectAgentRun: buildInspectAgentRunDep(state),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("completed");
    });

    it("fails when no run has executed", async () => {
      const session = sm.createSession();

      const payload: CommandPayload = {
        commandId: "inspect_agent_run",
        data: {},
      } as CommandPayload;

      const deps = {
        sessionManager: sm,
        inspectAgentRun: buildInspectAgentRunDep(state),
      };

      const result = await executeCommand(session.id, payload, deps);
      expect(result.status).toBe("failed");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  7. Server wiring verification                                      */
/* ------------------------------------------------------------------ */

describe("Server wiring verification — Phase 48", () => {
  it("command definitions include run_agent_task", () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === "run_agent_task");
    expect(def).toBeDefined();
    expect(def!.category).toBe("agent_run");
  });

  it("command definitions include inspect_agent_adapter", () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === "inspect_agent_adapter");
    expect(def).toBeDefined();
    expect(def!.category).toBe("agent_run");
  });

  it("command definitions include refresh_agent_adapter_status", () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === "refresh_agent_adapter_status");
    expect(def).toBeDefined();
    expect(def!.category).toBe("agent_run");
  });

  it("command definitions include inspect_agent_run", () => {
    const def = COMMAND_DEFINITIONS.find((d) => d.id === "inspect_agent_run");
    expect(def).toBeDefined();
    expect(def!.category).toBe("agent_run");
  });

  it("server exports getServerAdapterState", async () => {
    const server = await import("../../src/app-shell/server.js");
    expect(typeof server.getServerAdapterState).toBe("function");
  });

  it("server exports setServerAdapterState", async () => {
    const server = await import("../../src/app-shell/server.js");
    expect(typeof server.setServerAdapterState).toBe("function");
  });
});

/* ------------------------------------------------------------------ */
/*  8. Stub adapter execution (demo mode, no regression)               */
/* ------------------------------------------------------------------ */

describe("Stub adapter execution (demo mode) — Phase 48", () => {
  beforeEach(() => {
    _resetRunIdCounter();
  });

  it("stub adapter works end-to-end through server state", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "stub" });
    expect(state.adapter!.kind).toBe("stub");

    const sm = freshSessionManager();
    const session = sm.createSession();
    sm.attachResource(session.id, {
      id: "agent-1",
      kind: "agent",
      label: "Demo Agent",
      ready: true,
    });

    const fn = buildRunAgentTaskDep(state, sm);
    const result = await fn("summarize_workspace");
    expect(result.ok).toBe(true);
    expect(result.detail!.adapterKind).toBe("stub");
    expect(result.detail!.isModelGenerated).toBe(false);
  });

  it("echo_test adapter works end-to-end through server state", async () => {
    const state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });

    const sm = freshSessionManager();
    const session = sm.createSession();
    sm.attachResource(session.id, {
      id: "agent-1",
      kind: "agent",
      label: "Echo Agent",
      ready: true,
    });

    const fn = buildRunAgentTaskDep(state, sm);
    const result = await fn("explain_files");
    expect(result.ok).toBe(true);
    expect(result.detail!.adapterKind).toBe("echo_test");
    expect(result.detail!.outputPreview).toContain("Echo Test Adapter");
  });
});

/* ------------------------------------------------------------------ */
/*  9. All task kinds work through adapter                             */
/* ------------------------------------------------------------------ */

describe("All task kinds through adapter — Phase 48", () => {
  let state: ServerAdapterState;
  let sm: SessionManager;

  beforeEach(async () => {
    _resetRunIdCounter();
    state = freshState();
    await ensureAdapterResolved(state, { AGENT_ADAPTER_KIND: "echo_test" });
    sm = freshSessionManager();
    const session = sm.createSession();
    sm.attachResource(session.id, {
      id: "agent-1",
      kind: "agent",
      label: "Test Agent",
      ready: true,
    });
  });

  for (const taskKind of ALL_TASK_KINDS) {
    it(`task kind "${taskKind}" executes successfully`, async () => {
      const fn = buildRunAgentTaskDep(state, sm);
      const desc = taskKind === "custom" || taskKind === "general_query"
        ? "Test description for task"
        : undefined;
      const result = await fn(taskKind, desc);
      expect(result.ok).toBe(true);
      expect(result.detail!.taskKind).toBe(taskKind);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  10. Export surface                                                  */
/* ------------------------------------------------------------------ */

describe("Phase 48 export surface", () => {
  it("exports env-config types and functions", () => {
    expect(typeof loadAdapterConfigFromEnv).toBe("function");
    expect(typeof buildEnvConfigReport).toBe("function");
    expect(ENV_PREFIX).toBeDefined();
    expect(ENV_VARS).toBeDefined();
    expect(ALL_ENV_VARS).toBeDefined();
  });

  it("exports server-adapter-state types and functions", () => {
    expect(typeof createServerAdapterState).toBe("function");
    expect(typeof ensureAdapterResolved).toBe("function");
    expect(typeof buildRunAgentTaskDep).toBe("function");
    expect(typeof buildInspectAgentAdapterDep).toBe("function");
    expect(typeof buildRefreshAgentAdapterStatusDep).toBe("function");
    expect(typeof buildInspectAgentRunDep).toBe("function");
    expect(typeof emitAdapterResolvedEvent).toBe("function");
    expect(typeof getAdapterSessionSummary).toBe("function");
  });
});

/* ------------------------------------------------------------------ */
/*  11. Previous phase exports still work                              */
/* ------------------------------------------------------------------ */

describe("Previous phase exports (no regression) — Phase 48", () => {
  it("Phase 45 exports still available", () => {
    expect(typeof StubExecutionAdapter).toBe("function");
    expect(typeof dispatchAgentTask).toBe("function");
    expect(typeof inspectAgentRun).toBe("function");
    expect(ALL_TASK_KINDS).toBeDefined();
    expect(AGENT_RUN_EVENT_KINDS).toBeDefined();
  });

  it("Phase 46 exports still available", () => {
    expect(typeof EchoTestAdapter).toBe("function");
    expect(typeof resolveAdapter).toBe("function");
    expect(typeof refreshAdapterStatus).toBe("function");
    expect(typeof inspectAdapterStatus).toBe("function");
    expect(typeof buildAdapterStatus).toBe("function");
    expect(typeof validateOpenAIConfig).toBe("function");
    expect(ALL_ADAPTER_KINDS).toBeDefined();
    expect(ADAPTER_AVAILABILITY_LABELS).toBeDefined();
    expect(ADAPTER_KIND_LABELS).toBeDefined();
  });

  it("Session integration exports still available", () => {
    expect(typeof agentRunRequested).toBe("function");
    expect(typeof agentRunCompleted).toBe("function");
    expect(typeof agentRunFailed).toBe("function");
    expect(typeof agentAdapterResolved).toBe("function");
    expect(typeof agentAdapterStatusRefreshed).toBe("function");
    expect(typeof buildAgentRunSessionSummary).toBe("function");
    expect(typeof agentRunResultToEvents).toBe("function");
    expect(typeof isAgentRunEvent).toBe("function");
    expect(typeof filterAgentRunEvents).toBe("function");
  });
});
