/**
 * Phase 46 — Model-backed execution adapter tests.
 *
 * Comprehensive tests for the execution adapter boundary:
 * - Adapter configuration & validation
 * - Adapter availability states
 * - OpenAI-compatible adapter execution (mocked)
 * - Echo test adapter
 * - Adapter manager resolution
 * - Adapter status refresh
 * - Session integration (events, summaries)
 * - Command integration
 * - Error handling & edge cases
 * - Deterministic behavior under mocked outputs
 *
 * All tests use deterministic mocks — no live external services.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports under test                                                 */
/* ------------------------------------------------------------------ */

import {
  /* adapter-config */
  ADAPTER_AVAILABILITY_LABELS,
  ALL_ADAPTER_KINDS,
  ADAPTER_KIND_LABELS,
  validateOpenAIConfig,
  buildAdapterStatus,
  inspectAdapterStatus,
  /* openai-adapter */
  OpenAIExecutionAdapter,
  checkOpenAIAvailability,
  /* adapter-manager */
  EchoTestAdapter,
  resolveAdapter,
  refreshAdapterStatus,
  /* existing adapter */
  StubExecutionAdapter,
  /* session integration */
  AGENT_RUN_EVENT_KINDS,
  agentAdapterResolved,
  agentAdapterStatusRefreshed,
  buildAgentRunSessionSummary,
  agentRunResultToEvents,
  isAgentRunEvent,
  filterAgentRunEvents,
  /* dispatch */
  dispatchAgentTask,
  inspectAgentRun,
  /* types */
  ALL_TASK_KINDS,
  TASK_KIND_LABELS,
  buildAgentRunSummary,
  _resetRunIdCounter,
} from "../../src/agent-run/index.js";

import type {
  AdapterAvailability,
  AdapterKind,
  OpenAIAdapterConfig,
  AdapterStatus,
  AgentRunRequest,
  AgentRunOutput,
  AgentRunResult,
  FetchFn,
  AgentExecutionAdapter,
  AgentRunInput,
  AgentRunDispatchDeps,
} from "../../src/agent-run/index.js";

import type { AgentSummary } from "../../src/agents/types.js";
import type { SessionEvent } from "../../src/session/types.js";

/* commands */
import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  getCommandDefinition,
} from "../../src/commands/types.js";
import { validateCommand } from "../../src/commands/validation.js";
import { getCommandAvailability } from "../../src/commands/availability.js";
import { executeCommand } from "../../src/commands/executor.js";

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                       */
/* ------------------------------------------------------------------ */

function makeMockAgentSummary(overrides?: Partial<AgentSummary>): AgentSummary {
  return {
    id: "agent-1",
    name: "Test Agent",
    kind: "coding",
    status: "attached",
    capabilities: ["read_code", "analyze"],
    allowedStages: ["analysis", "review"],
    participationEnabled: true,
    roleHint: "primary",
    routingPriority: 50,
    ...overrides,
  } as AgentSummary;
}

function makeMockRequest(overrides?: Partial<AgentRunRequest>): AgentRunRequest {
  return {
    runId: "run-1234-1",
    sessionId: "sess-001",
    agentId: "agent-1",
    agentName: "Test Agent",
    agentKind: "coding",
    taskKind: "summarize_workspace",
    taskDescription: "Summarize the workspace",
    selectionReason: {
      method: "best_fit",
      explanation: "Best fit agent",
      agentKind: "coding",
      roleHint: "primary",
      stage: null,
      priority: 50,
      eligibleCount: 1,
    },
    contextSummary: null,
    assembledContextText: "Sample context text for testing.",
    requestedAt: "2026-04-06T12:00:00.000Z",
    ...overrides,
  };
}

function makeMockOpenAIConfig(overrides?: Partial<OpenAIAdapterConfig>): OpenAIAdapterConfig {
  return {
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key-123",
    model: "gpt-4o-mini",
    maxTokens: 512,
    temperature: 0.1,
    timeoutMs: 5000,
    ...overrides,
  };
}

function makeMockFetchFn(responseBody: unknown, status = 200, statusText = "OK"): FetchFn {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(responseBody),
  });
}

function makeSuccessfulChatResponse(content = "Test response from the model.") {
  return {
    id: "chatcmpl-abc123",
    model: "gpt-4o-mini",
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 42,
      completion_tokens: 10,
      total_tokens: 52,
    },
  };
}

function makeMockResult(overrides?: Partial<AgentRunResult>): AgentRunResult {
  return {
    runId: "run-1234-1",
    sessionId: "sess-001",
    status: "completed",
    request: makeMockRequest(),
    output: {
      responseText: "Test output",
      isModelGenerated: true,
      adapterKind: "openai_compatible",
      durationMs: 150,
      structuredData: { model: "gpt-4o-mini" },
    },
    error: null,
    startedAt: "2026-04-06T12:00:00.000Z",
    finishedAt: "2026-04-06T12:00:00.150Z",
    durationMs: 150,
    ...overrides,
  };
}

function makeMinimalSessionManager() {
  const events: SessionEvent[] = [];
  return {
    appendEvent: vi.fn((_sessionId: string, event: SessionEvent) => {
      events.push(event);
    }),
    events,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests: Adapter configuration & validation                          */
/* ------------------------------------------------------------------ */

describe("Phase 46 — Model-Backed Execution Adapter", () => {
  beforeEach(() => {
    _resetRunIdCounter();
  });

  describe("Adapter Config Types & Constants", () => {
    it("should define all known adapter kinds", () => {
      expect(ALL_ADAPTER_KINDS).toContain("stub");
      expect(ALL_ADAPTER_KINDS).toContain("openai_compatible");
      expect(ALL_ADAPTER_KINDS).toContain("echo_test");
      expect(ALL_ADAPTER_KINDS.length).toBe(3);
    });

    it("should have labels for all adapter kinds", () => {
      for (const kind of ALL_ADAPTER_KINDS) {
        expect(ADAPTER_KIND_LABELS[kind]).toBeDefined();
        expect(typeof ADAPTER_KIND_LABELS[kind]).toBe("string");
      }
    });

    it("should define all availability states", () => {
      const states: AdapterAvailability[] = [
        "configured_available",
        "configured_unavailable",
        "not_configured",
        "unsupported",
      ];
      for (const state of states) {
        expect(ADAPTER_AVAILABILITY_LABELS[state]).toBeDefined();
        expect(typeof ADAPTER_AVAILABILITY_LABELS[state]).toBe("string");
      }
    });

    it("should have 4 availability state labels", () => {
      expect(Object.keys(ADAPTER_AVAILABILITY_LABELS).length).toBe(4);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  OpenAI config validation                                           */
  /* ------------------------------------------------------------------ */

  describe("validateOpenAIConfig", () => {
    it("should accept a valid complete config", () => {
      const errors = validateOpenAIConfig(makeMockOpenAIConfig());
      expect(errors).toEqual([]);
    });

    it("should accept a config with empty apiKey (no-auth like Ollama)", () => {
      const errors = validateOpenAIConfig(makeMockOpenAIConfig({ apiKey: "" }));
      expect(errors).toEqual([]);
    });

    it("should reject missing baseUrl", () => {
      const errors = validateOpenAIConfig({ ...makeMockOpenAIConfig(), baseUrl: "" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("baseUrl");
    });

    it("should reject missing model", () => {
      const errors = validateOpenAIConfig({ ...makeMockOpenAIConfig(), model: "" });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("model");
    });

    it("should reject undefined apiKey", () => {
      const config = { baseUrl: "https://api.example.com", model: "test" };
      const errors = validateOpenAIConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("apiKey"))).toBe(true);
    });

    it("should reject negative maxTokens", () => {
      const errors = validateOpenAIConfig(makeMockOpenAIConfig({ maxTokens: -1 }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("maxTokens");
    });

    it("should reject temperature out of range", () => {
      const errors = validateOpenAIConfig(makeMockOpenAIConfig({ temperature: 3 }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("temperature");
    });

    it("should reject negative timeoutMs", () => {
      const errors = validateOpenAIConfig(makeMockOpenAIConfig({ timeoutMs: -100 }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("timeoutMs");
    });

    it("should return multiple errors for completely empty config", () => {
      const errors = validateOpenAIConfig({});
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  buildAdapterStatus                                                 */
  /* ------------------------------------------------------------------ */

  describe("buildAdapterStatus", () => {
    it("should build status for stub adapter", () => {
      const adapter = new StubExecutionAdapter();
      const status = buildAdapterStatus(adapter, "configured_available");
      expect(status.kind).toBe("stub");
      expect(status.isModelBacked).toBe(false);
      expect(status.availability).toBe("configured_available");
      expect(status.modelName).toBeNull();
    });

    it("should build status with model name for openai adapter", () => {
      const config = makeMockOpenAIConfig();
      const adapter = new OpenAIExecutionAdapter(config, makeMockFetchFn({}));
      const status = buildAdapterStatus(adapter, "configured_available", {
        modelName: config.model,
        baseUrl: config.baseUrl,
      });
      expect(status.kind).toBe("openai_compatible");
      expect(status.isModelBacked).toBe(true);
      expect(status.modelName).toBe("gpt-4o-mini");
      expect(status.baseUrl).toContain("***"); // redacted
    });

    it("should include lastError when unavailable", () => {
      const adapter = new StubExecutionAdapter();
      const status = buildAdapterStatus(adapter, "configured_unavailable", {
        lastError: "Connection refused",
      });
      expect(status.availability).toBe("configured_unavailable");
      expect(status.lastError).toBe("Connection refused");
    });

    it("should handle unknown adapter kind gracefully", () => {
      const adapter = { kind: "custom_kind", isModelBacked: false, execute: async () => ({} as AgentRunOutput) };
      const status = buildAdapterStatus(adapter, "unsupported");
      expect(status.kind).toBe("custom_kind");
      expect(status.label).toBe("custom_kind"); // falls back to kind
    });
  });

  /* ------------------------------------------------------------------ */
  /*  inspectAdapterStatus                                               */
  /* ------------------------------------------------------------------ */

  describe("inspectAdapterStatus", () => {
    it("should produce a human-readable report for configured adapter", () => {
      const status: AdapterStatus = {
        kind: "openai_compatible",
        label: "OpenAI-compatible (gpt-4o-mini)",
        isModelBacked: true,
        availability: "configured_available",
        availabilityMessage: "Configured & Available",
        modelName: "gpt-4o-mini",
        baseUrl: "https://api.example.com/***",
        lastCheckedAt: "2026-04-06T12:00:00.000Z",
        lastError: null,
      };
      const report = inspectAdapterStatus(status);
      expect(report).toContain("Execution Adapter Status");
      expect(report).toContain("openai_compatible");
      expect(report).toContain("gpt-4o-mini");
      expect(report).toContain("real model-generated output");
    });

    it("should produce a report for stub adapter", () => {
      const status: AdapterStatus = {
        kind: "stub",
        label: "Stub (Deterministic / Demo)",
        isModelBacked: false,
        availability: "configured_available",
        availabilityMessage: "Configured & Available",
        modelName: null,
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const report = inspectAdapterStatus(status);
      expect(report).toContain("stub");
      expect(report).toContain("deterministic/template");
    });

    it("should include last error in unavailable report", () => {
      const status: AdapterStatus = {
        kind: "openai_compatible",
        label: "Test",
        isModelBacked: true,
        availability: "configured_unavailable",
        availabilityMessage: "Configured but Unavailable",
        modelName: "gpt-4o-mini",
        baseUrl: null,
        lastCheckedAt: "2026-04-06T12:00:00.000Z",
        lastError: "Connection refused",
      };
      const report = inspectAdapterStatus(status);
      expect(report).toContain("Connection refused");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  OpenAI-Compatible Adapter                                          */
  /* ------------------------------------------------------------------ */

  describe("OpenAIExecutionAdapter", () => {
    it("should have correct kind and isModelBacked", () => {
      const config = makeMockOpenAIConfig();
      const adapter = new OpenAIExecutionAdapter(config, makeMockFetchFn({}));
      expect(adapter.kind).toBe("openai_compatible");
      expect(adapter.isModelBacked).toBe(true);
      expect(adapter.modelName).toBe("gpt-4o-mini");
      expect(adapter.baseUrl).toBe("https://api.example.com/v1");
    });

    it("should execute successfully with mocked API response", async () => {
      const chatResponse = makeSuccessfulChatResponse("Model analysis of workspace.");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);
      const request = makeMockRequest();

      const output = await adapter.execute(request);

      expect(output.responseText).toBe("Model analysis of workspace.");
      expect(output.isModelGenerated).toBe(true);
      expect(output.adapterKind).toBe("openai_compatible");
      expect(output.durationMs).toBeGreaterThanOrEqual(0);
      expect(output.structuredData).toBeDefined();
      expect(output.structuredData?.model).toBe("gpt-4o-mini");
      expect(output.structuredData?.totalTokens).toBe(52);
    });

    it("should send correct request structure to API", async () => {
      const chatResponse = makeSuccessfulChatResponse("OK");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);
      const request = makeMockRequest();

      await adapter.execute(request);

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(init.headers["Authorization"]).toBe("Bearer test-key-123");
      const body = JSON.parse(init.body);
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.messages.length).toBe(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.max_tokens).toBe(512);
      expect(body.temperature).toBe(0.1);
    });

    it("should not send Authorization header when apiKey is empty", async () => {
      const chatResponse = makeSuccessfulChatResponse("OK");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig({ apiKey: "" });
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);

      await adapter.execute(makeMockRequest());

      const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(init.headers["Authorization"]).toBeUndefined();
    });

    it("should throw on HTTP error", async () => {
      const fetchFn = makeMockFetchFn({ error: { message: "Rate limit exceeded" } }, 429, "Too Many Requests");
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("HTTP 429");
    });

    it("should throw on API-level error in response body", async () => {
      const fetchFn = makeMockFetchFn({ error: { message: "Invalid model" } }, 200, "OK");
      // This should still trigger the error check because it has .choices empty + error
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("Invalid model");
    });

    it("should throw on empty response (no choices)", async () => {
      const fetchFn = makeMockFetchFn({ choices: [] });
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("empty response");
    });

    it("should throw on network error", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn as unknown as FetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("Network error");
    });

    it("should throw on timeout (abort)", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("The operation was aborted"));
      const adapter = new OpenAIExecutionAdapter(
        makeMockOpenAIConfig({ timeoutMs: 100 }),
        fetchFn as unknown as FetchFn,
      );

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("timed out");
    });

    it("should include context in user message when assembledContextText is provided", async () => {
      const chatResponse = makeSuccessfulChatResponse("Result");
      const fetchFn = makeMockFetchFn(chatResponse);
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);
      const request = makeMockRequest({ assembledContextText: "## Workspace\nTypeScript project" });

      await adapter.execute(request);

      const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.messages[1].content).toContain("## Workspace");
      expect(body.messages[1].content).toContain("TypeScript project");
    });

    it("should handle empty assembledContextText", async () => {
      const chatResponse = makeSuccessfulChatResponse("Result");
      const fetchFn = makeMockFetchFn(chatResponse);
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);
      const request = makeMockRequest({ assembledContextText: "" });

      await adapter.execute(request);

      const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.messages[1].content).toContain("No workspace context");
    });

    it("should use default maxTokens when not configured", async () => {
      const chatResponse = makeSuccessfulChatResponse("OK");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      delete (config as Record<string, unknown>).maxTokens;
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);

      await adapter.execute(makeMockRequest());

      const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBe(1024);
    });

    it("should use default temperature when not configured", async () => {
      const chatResponse = makeSuccessfulChatResponse("OK");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      delete (config as Record<string, unknown>).temperature;
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);

      await adapter.execute(makeMockRequest());

      const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.temperature).toBe(0.2);
    });

    it("should expose label property", () => {
      const config = makeMockOpenAIConfig({ label: "My Custom Backend" });
      const adapter = new OpenAIExecutionAdapter(config, makeMockFetchFn({}));
      expect(adapter.label).toBe("My Custom Backend");
    });

    it("should generate default label from model name", () => {
      const config = makeMockOpenAIConfig();
      delete (config as Record<string, unknown>).label;
      const adapter = new OpenAIExecutionAdapter(config, makeMockFetchFn({}));
      expect(adapter.label).toContain("gpt-4o-mini");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  checkOpenAIAvailability                                            */
  /* ------------------------------------------------------------------ */

  describe("checkOpenAIAvailability", () => {
    it("should return available when models endpoint responds 200", async () => {
      const fetchFn = makeMockFetchFn({ data: [{ id: "gpt-4o-mini" }] });
      const result = await checkOpenAIAvailability(makeMockOpenAIConfig(), fetchFn);
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return unavailable on 401 with auth error", async () => {
      const fetchFn = makeMockFetchFn({}, 401, "Unauthorized");
      const result = await checkOpenAIAvailability(makeMockOpenAIConfig(), fetchFn);
      expect(result.available).toBe(false);
      expect(result.error).toContain("Authentication failed");
    });

    it("should return unavailable on 500", async () => {
      const fetchFn = makeMockFetchFn({}, 500, "Internal Server Error");
      const result = await checkOpenAIAvailability(makeMockOpenAIConfig(), fetchFn);
      expect(result.available).toBe(false);
      expect(result.error).toContain("HTTP 500");
    });

    it("should return unavailable on network error", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await checkOpenAIAvailability(
        makeMockOpenAIConfig(),
        fetchFn as unknown as FetchFn,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Cannot reach backend");
    });

    it("should call the models endpoint", async () => {
      const fetchFn = makeMockFetchFn({ data: [] });
      await checkOpenAIAvailability(makeMockOpenAIConfig(), fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://api.example.com/v1/models");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  EchoTestAdapter                                                    */
  /* ------------------------------------------------------------------ */

  describe("EchoTestAdapter", () => {
    it("should have correct kind and isModelBacked", () => {
      const adapter = new EchoTestAdapter();
      expect(adapter.kind).toBe("echo_test");
      expect(adapter.isModelBacked).toBe(false);
    });

    it("should echo request details in response", async () => {
      const adapter = new EchoTestAdapter();
      const request = makeMockRequest({
        taskKind: "explain_files",
        taskDescription: "Explain main.ts",
      });
      const output = await adapter.execute(request);

      expect(output.responseText).toContain("Echo Test Adapter");
      expect(output.responseText).toContain("explain_files");
      expect(output.responseText).toContain("Explain main.ts");
      expect(output.responseText).toContain("Test Agent");
      expect(output.isModelGenerated).toBe(false);
      expect(output.adapterKind).toBe("echo_test");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Adapter Manager — resolveAdapter                                   */
  /* ------------------------------------------------------------------ */

  describe("resolveAdapter", () => {
    it("should resolve stub adapter (always available)", async () => {
      const result = await resolveAdapter({ kind: "stub" });
      expect(result.ok).toBe(true);
      expect(result.adapter).toBeDefined();
      expect(result.adapter!.kind).toBe("stub");
      expect(result.adapter!.isModelBacked).toBe(false);
      expect(result.status).toBeDefined();
      expect(result.status!.availability).toBe("configured_available");
      expect(result.error).toBeNull();
    });

    it("should resolve echo_test adapter (always available)", async () => {
      const result = await resolveAdapter({ kind: "echo_test" });
      expect(result.ok).toBe(true);
      expect(result.adapter!.kind).toBe("echo_test");
      expect(result.status!.availability).toBe("configured_available");
      expect(result.error).toBeNull();
    });

    it("should resolve openai_compatible adapter with valid config and available backend", async () => {
      const fetchFn = makeMockFetchFn({ data: [] }); // models endpoint
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        fetchFn,
      });
      expect(result.ok).toBe(true);
      expect(result.adapter).toBeDefined();
      expect(result.adapter!.kind).toBe("openai_compatible");
      expect(result.adapter!.isModelBacked).toBe(true);
      expect(result.status!.availability).toBe("configured_available");
      expect(result.status!.modelName).toBe("gpt-4o-mini");
    });

    it("should fail when openai_compatible has no config", async () => {
      const result = await resolveAdapter({ kind: "openai_compatible" });
      expect(result.ok).toBe(false);
      expect(result.adapter).toBeNull();
      expect(result.error!.kind).toBe("not_configured");
      expect(result.error!.message).toContain("requires configuration");
      expect(result.status!.availability).toBe("not_configured");
    });

    it("should fail when openai_compatible has invalid config", async () => {
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: { baseUrl: "", apiKey: "test", model: "" } as OpenAIAdapterConfig,
      });
      expect(result.ok).toBe(false);
      expect(result.error!.kind).toBe("invalid_config");
      expect(result.error!.details.length).toBeGreaterThan(0);
    });

    it("should fail when openai_compatible backend is unreachable", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        fetchFn: fetchFn as unknown as FetchFn,
      });
      expect(result.ok).toBe(false);
      expect(result.error!.kind).toBe("unavailable");
      expect(result.status!.availability).toBe("configured_unavailable");
    });

    it("should skip availability check when requested", async () => {
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        skipAvailabilityCheck: true,
      });
      expect(result.ok).toBe(true);
      expect(result.adapter!.kind).toBe("openai_compatible");
      expect(result.status!.availability).toBe("configured_available");
    });

    it("should fail for unsupported adapter kind", async () => {
      const result = await resolveAdapter({ kind: "nonexistent_provider" });
      expect(result.ok).toBe(false);
      expect(result.error!.kind).toBe("unsupported_kind");
      expect(result.error!.message).toContain("nonexistent_provider");
      expect(result.status!.availability).toBe("unsupported");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Adapter Manager — refreshAdapterStatus                             */
  /* ------------------------------------------------------------------ */

  describe("refreshAdapterStatus", () => {
    it("should refresh stub adapter status", async () => {
      const adapter = new StubExecutionAdapter();
      const status = await refreshAdapterStatus(adapter);
      expect(status.kind).toBe("stub");
      expect(status.availability).toBe("configured_available");
      expect(status.lastCheckedAt).toBeDefined();
    });

    it("should refresh echo_test adapter status", async () => {
      const adapter = new EchoTestAdapter();
      const status = await refreshAdapterStatus(adapter);
      expect(status.kind).toBe("echo_test");
      expect(status.availability).toBe("configured_available");
    });

    it("should refresh openai_compatible adapter — available", async () => {
      const config = makeMockOpenAIConfig();
      const fetchFn = makeMockFetchFn({ data: [] });
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);
      const status = await refreshAdapterStatus(adapter, { openaiConfig: config, fetchFn });
      expect(status.availability).toBe("configured_available");
      expect(status.modelName).toBe("gpt-4o-mini");
    });

    it("should refresh openai_compatible adapter — unavailable", async () => {
      const config = makeMockOpenAIConfig();
      const fetchFn = vi.fn().mockRejectedValue(new Error("timeout"));
      const adapter = new OpenAIExecutionAdapter(config, makeMockFetchFn({}));
      const status = await refreshAdapterStatus(adapter, {
        openaiConfig: config,
        fetchFn: fetchFn as unknown as FetchFn,
      });
      expect(status.availability).toBe("configured_unavailable");
      expect(status.lastError).toContain("timeout");
    });

    it("should return unsupported for unknown adapter kind", async () => {
      const adapter = { kind: "unknown", isModelBacked: false, execute: async () => ({} as AgentRunOutput) };
      const status = await refreshAdapterStatus(adapter);
      expect(status.availability).toBe("unsupported");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Session Integration — adapter events                               */
  /* ------------------------------------------------------------------ */

  describe("Session Integration — Adapter Events", () => {
    it("should include adapter event kinds in AGENT_RUN_EVENT_KINDS", () => {
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_adapter_resolved");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_adapter_status_refreshed");
      expect(AGENT_RUN_EVENT_KINDS.length).toBe(6); // 4 original + 2 new
    });

    it("should create agent_adapter_resolved event", () => {
      const status: AdapterStatus = {
        kind: "openai_compatible",
        label: "Test",
        isModelBacked: true,
        availability: "configured_available",
        availabilityMessage: "Configured & Available",
        modelName: "gpt-4o-mini",
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const event = agentAdapterResolved(status);
      expect(event.kind).toBe("agent_adapter_resolved");
      expect(event.message).toContain("openai_compatible");
      expect(event.detail.adapterKind).toBe("openai_compatible");
      expect(event.detail.isModelBacked).toBe(true);
      expect(event.detail.availability).toBe("configured_available");
    });

    it("should create agent_adapter_status_refreshed event", () => {
      const status: AdapterStatus = {
        kind: "stub",
        label: "Stub",
        isModelBacked: false,
        availability: "configured_available",
        availabilityMessage: "Configured & Available",
        modelName: null,
        baseUrl: null,
        lastCheckedAt: "2026-04-06T12:00:00.000Z",
        lastError: null,
      };
      const event = agentAdapterStatusRefreshed(status);
      expect(event.kind).toBe("agent_adapter_status_refreshed");
      expect(event.detail.adapterKind).toBe("stub");
    });

    it("should recognize adapter events with isAgentRunEvent", () => {
      const status: AdapterStatus = {
        kind: "stub",
        label: "Stub",
        isModelBacked: false,
        availability: "configured_available",
        availabilityMessage: "OK",
        modelName: null,
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const resolvedEvent = agentAdapterResolved(status);
      const refreshedEvent = agentAdapterStatusRefreshed(status);
      expect(isAgentRunEvent(resolvedEvent)).toBe(true);
      expect(isAgentRunEvent(refreshedEvent)).toBe(true);
    });

    it("should filter adapter events with filterAgentRunEvents", () => {
      const status: AdapterStatus = {
        kind: "stub",
        label: "Stub",
        isModelBacked: false,
        availability: "configured_available",
        availabilityMessage: "OK",
        modelName: null,
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const events: SessionEvent[] = [
        agentAdapterResolved(status),
        { kind: "note", message: "unrelated", timestamp: new Date().toISOString(), metadata: {} },
        agentAdapterStatusRefreshed(status),
      ];
      const filtered = filterAgentRunEvents(events);
      expect(filtered.length).toBe(2);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Session Integration — buildAgentRunSessionSummary with adapter     */
  /* ------------------------------------------------------------------ */

  describe("buildAgentRunSessionSummary — adapter metadata", () => {
    it("should include adapter fields when no result and no adapter status", () => {
      const summary = buildAgentRunSessionSummary(null, 0);
      expect(summary.activeAdapterKind).toBeNull();
      expect(summary.activeAdapterAvailability).toBeNull();
      expect(summary.activeAdapterIsModelBacked).toBeNull();
      expect(summary.activeAdapterModelName).toBeNull();
    });

    it("should include adapter status when provided with no result", () => {
      const adapterStatus: AdapterStatus = {
        kind: "openai_compatible",
        label: "Test",
        isModelBacked: true,
        availability: "configured_available",
        availabilityMessage: "OK",
        modelName: "gpt-4o-mini",
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const summary = buildAgentRunSessionSummary(null, 0, adapterStatus);
      expect(summary.activeAdapterKind).toBe("openai_compatible");
      expect(summary.activeAdapterAvailability).toBe("configured_available");
      expect(summary.activeAdapterIsModelBacked).toBe(true);
      expect(summary.activeAdapterModelName).toBe("gpt-4o-mini");
    });

    it("should include both result and adapter status", () => {
      const result = makeMockResult();
      const adapterStatus: AdapterStatus = {
        kind: "openai_compatible",
        label: "Test",
        isModelBacked: true,
        availability: "configured_available",
        availabilityMessage: "OK",
        modelName: "gpt-4o-mini",
        baseUrl: null,
        lastCheckedAt: null,
        lastError: null,
      };
      const summary = buildAgentRunSessionSummary(result, 3, adapterStatus);
      expect(summary.agentRunExecuted).toBe(true);
      expect(summary.lastAgentRunAdapterKind).toBe("openai_compatible");
      expect(summary.lastAgentRunModelGenerated).toBe(true);
      expect(summary.activeAdapterKind).toBe("openai_compatible");
      expect(summary.totalAgentRuns).toBe(3);
    });

    it("should fall back to result adapter kind when no adapter status", () => {
      const result = makeMockResult();
      const summary = buildAgentRunSessionSummary(result, 1);
      expect(summary.activeAdapterKind).toBe("openai_compatible"); // from result output
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Dispatch integration — real adapter paths                          */
  /* ------------------------------------------------------------------ */

  describe("dispatchAgentTask with real adapters", () => {
    it("should dispatch with OpenAI adapter and mocked response", async () => {
      const chatResponse = makeSuccessfulChatResponse("Here is the workspace summary.");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);

      const input: AgentRunInput = {
        sessionId: "sess-001",
        taskKind: "summarize_workspace",
      };
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => [makeMockAgentSummary()],
        adapter,
      };

      const result = await dispatchAgentTask(input, deps);

      expect(result.status).toBe("completed");
      expect(result.output).toBeDefined();
      expect(result.output!.responseText).toBe("Here is the workspace summary.");
      expect(result.output!.isModelGenerated).toBe(true);
      expect(result.output!.adapterKind).toBe("openai_compatible");
      expect(result.output!.structuredData?.model).toBe("gpt-4o-mini");
    });

    it("should dispatch with EchoTestAdapter", async () => {
      const adapter = new EchoTestAdapter();
      const input: AgentRunInput = {
        sessionId: "sess-001",
        taskKind: "explain_files",
      };
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => [makeMockAgentSummary()],
        adapter,
      };

      const result = await dispatchAgentTask(input, deps);

      expect(result.status).toBe("completed");
      expect(result.output!.isModelGenerated).toBe(false);
      expect(result.output!.adapterKind).toBe("echo_test");
      expect(result.output!.responseText).toContain("Echo Test Adapter");
    });

    it("should dispatch with StubExecutionAdapter (existing behavior preserved)", async () => {
      const adapter = new StubExecutionAdapter();
      const input: AgentRunInput = {
        sessionId: "sess-001",
        taskKind: "summarize_workspace",
      };
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => [makeMockAgentSummary()],
        adapter,
      };

      const result = await dispatchAgentTask(input, deps);

      expect(result.status).toBe("completed");
      expect(result.output!.isModelGenerated).toBe(false);
      expect(result.output!.adapterKind).toBe("stub");
    });

    it("should handle adapter execution failure gracefully", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("Connection reset"));
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn as unknown as FetchFn);
      const input: AgentRunInput = {
        sessionId: "sess-001",
        taskKind: "summarize_workspace",
      };
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => [makeMockAgentSummary()],
        adapter,
      };

      const result = await dispatchAgentTask(input, deps);

      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("EXECUTION_FAILED");
      expect(result.error!.message).toContain("Connection reset");
    });

    it("should generate events from model-backed run result", () => {
      const result = makeMockResult();
      const events = agentRunResultToEvents(result);
      expect(events.length).toBe(1);
      expect(events[0].kind).toBe("agent_run_completed");
      expect(events[0].detail.adapterKind).toBe("openai_compatible");
      expect(events[0].detail.isModelGenerated).toBe(true);
    });

    it("should generate events from failed run result", () => {
      const result = makeMockResult({
        status: "failed",
        output: null,
        error: { code: "EXECUTION_FAILED", message: "Backend error", phase: "executing" },
      });
      const events = agentRunResultToEvents(result);
      expect(events.length).toBe(1);
      expect(events[0].kind).toBe("agent_run_failed");
    });

    it("should include adapter info in inspectAgentRun output", () => {
      const result = makeMockResult();
      const report = inspectAgentRun(result);
      expect(report).toContain("openai_compatible");
      expect(report).toContain("Model-generated: true");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Command Integration                                                */
  /* ------------------------------------------------------------------ */

  describe("Command Integration", () => {
    it("should define inspect_agent_adapter command", () => {
      const def = getCommandDefinition("inspect_agent_adapter");
      expect(def).toBeDefined();
      expect(def!.category).toBe("agent_run");
      expect(def!.label).toContain("Adapter");
    });

    it("should define refresh_agent_adapter_status command", () => {
      const def = getCommandDefinition("refresh_agent_adapter_status");
      expect(def).toBeDefined();
      expect(def!.category).toBe("agent_run");
      expect(def!.label).toContain("Status");
    });

    it("should include new commands in ALL_COMMAND_IDS", () => {
      expect(ALL_COMMAND_IDS).toContain("inspect_agent_adapter");
      expect(ALL_COMMAND_IDS).toContain("refresh_agent_adapter_status");
    });

    it("should include new commands in COMMAND_DEFINITIONS", () => {
      const ids = COMMAND_DEFINITIONS.map((d) => d.id);
      expect(ids).toContain("inspect_agent_adapter");
      expect(ids).toContain("refresh_agent_adapter_status");
    });

    it("should validate inspect_agent_adapter command (no required fields)", () => {
      const result = validateCommand({
        commandId: "inspect_agent_adapter",
        data: {},
      } as import("../../src/commands/types.js").CommandPayload);
      expect(result.valid).toBe(true);
    });

    it("should validate refresh_agent_adapter_status command (no required fields)", () => {
      const result = validateCommand({
        commandId: "refresh_agent_adapter_status",
        data: {},
      } as import("../../src/commands/types.js").CommandPayload);
      expect(result.valid).toBe(true);
    });

    it("should check availability for inspect_agent_adapter", () => {
      const avail = getCommandAvailability("inspect_agent_adapter", {
        hasActiveSession: false,
        hasWorkspace: false,
        hasMcp: false,
        hasAgent: false,
      });
      expect(avail.available).toBe(true);
    });

    it("should check availability for refresh_agent_adapter_status", () => {
      const avail = getCommandAvailability("refresh_agent_adapter_status", {
        hasActiveSession: true,
        hasWorkspace: true,
        hasMcp: false,
        hasAgent: false,
      });
      expect(avail.available).toBe(true);
    });

    it("should execute inspect_agent_adapter command via executor", async () => {
      const sm = makeMinimalSessionManager();
      const result = await executeCommand(
        "sess-001",
        { commandId: "inspect_agent_adapter", data: {} } as import("../../src/commands/types.js").CommandPayload,
        {
          sessionManager: sm as unknown as import("../../src/session/session-manager.js").SessionManager,
          inspectAgentAdapter: async () => ({
            ok: true,
            detail: { kind: "openai_compatible", availability: "configured_available" },
          }),
        },
      );
      expect(result.status).toBe("completed");
      expect(result.detail?.kind).toBe("openai_compatible");
    });

    it("should fail inspect_agent_adapter when dep is missing", async () => {
      const sm = makeMinimalSessionManager();
      const result = await executeCommand(
        "sess-001",
        { commandId: "inspect_agent_adapter", data: {} } as import("../../src/commands/types.js").CommandPayload,
        {
          sessionManager: sm as unknown as import("../../src/session/session-manager.js").SessionManager,
        },
      );
      expect(result.status).toBe("failed");
      expect(result.message).toContain("not available");
    });

    it("should execute refresh_agent_adapter_status command via executor", async () => {
      const sm = makeMinimalSessionManager();
      const result = await executeCommand(
        "sess-001",
        { commandId: "refresh_agent_adapter_status", data: {} } as import("../../src/commands/types.js").CommandPayload,
        {
          sessionManager: sm as unknown as import("../../src/session/session-manager.js").SessionManager,
          refreshAgentAdapterStatus: async () => ({
            ok: true,
            detail: { availability: "configured_available" },
          }),
        },
      );
      expect(result.status).toBe("completed");
    });

    it("should fail refresh_agent_adapter_status when dep is missing", async () => {
      const sm = makeMinimalSessionManager();
      const result = await executeCommand(
        "sess-001",
        { commandId: "refresh_agent_adapter_status", data: {} } as import("../../src/commands/types.js").CommandPayload,
        {
          sessionManager: sm as unknown as import("../../src/session/session-manager.js").SessionManager,
        },
      );
      expect(result.status).toBe("failed");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Deterministic behavior                                             */
  /* ------------------------------------------------------------------ */

  describe("Deterministic Behavior", () => {
    it("should produce identical output for identical OpenAI adapter inputs", async () => {
      const chatResponse = makeSuccessfulChatResponse("Deterministic response.");
      const fetchFn1 = makeMockFetchFn(chatResponse);
      const fetchFn2 = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig();
      const adapter1 = new OpenAIExecutionAdapter(config, fetchFn1);
      const adapter2 = new OpenAIExecutionAdapter(config, fetchFn2);
      const request = makeMockRequest();

      const output1 = await adapter1.execute(request);
      const output2 = await adapter2.execute(request);

      expect(output1.responseText).toBe(output2.responseText);
      expect(output1.isModelGenerated).toBe(output2.isModelGenerated);
      expect(output1.adapterKind).toBe(output2.adapterKind);
    });

    it("should produce identical resolution results for same config", async () => {
      const fetchFn = makeMockFetchFn({ data: [] });
      const config = makeMockOpenAIConfig();
      const result1 = await resolveAdapter({ kind: "openai_compatible", openaiConfig: config, fetchFn });
      const result2 = await resolveAdapter({ kind: "openai_compatible", openaiConfig: config, fetchFn });

      expect(result1.ok).toBe(result2.ok);
      expect(result1.status!.kind).toBe(result2.status!.kind);
      expect(result1.status!.availability).toBe(result2.status!.availability);
    });

    it("should produce identical status for stub adapter across refreshes", async () => {
      const adapter = new StubExecutionAdapter();
      const s1 = await refreshAdapterStatus(adapter);
      const s2 = await refreshAdapterStatus(adapter);
      expect(s1.kind).toBe(s2.kind);
      expect(s1.availability).toBe(s2.availability);
      expect(s1.isModelBacked).toBe(s2.isModelBacked);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Error handling edge cases                                          */
  /* ------------------------------------------------------------------ */

  describe("Error Handling Edge Cases", () => {
    it("should handle JSON parse error in API error response", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: () => Promise.reject(new Error("Invalid JSON")),
      });
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn as unknown as FetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("HTTP 503");
    });

    it("should handle response with no choices array", async () => {
      const fetchFn = makeMockFetchFn({ id: "chatcmpl-abc" }); // no choices
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("empty response");
    });

    it("should handle response with null content in choice", async () => {
      const fetchFn = makeMockFetchFn({
        choices: [{ message: { role: "assistant", content: null } }],
      });
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("empty response");
    });

    it("should handle response with empty content string", async () => {
      const fetchFn = makeMockFetchFn({
        choices: [{ message: { role: "assistant", content: "" } }],
      });
      const adapter = new OpenAIExecutionAdapter(makeMockOpenAIConfig(), fetchFn);

      await expect(adapter.execute(makeMockRequest())).rejects.toThrow("empty response");
    });

    it("should handle trailing slashes in baseUrl", async () => {
      const chatResponse = makeSuccessfulChatResponse("OK");
      const fetchFn = makeMockFetchFn(chatResponse);
      const config = makeMockOpenAIConfig({ baseUrl: "https://api.example.com/v1///" });
      const adapter = new OpenAIExecutionAdapter(config, fetchFn);

      await adapter.execute(makeMockRequest());

      const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://api.example.com/v1/chat/completions");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Adapter config — all four availability states                      */
  /* ------------------------------------------------------------------ */

  describe("All Four Availability States", () => {
    it("configured_available — stub", async () => {
      const result = await resolveAdapter({ kind: "stub" });
      expect(result.ok).toBe(true);
      expect(result.status!.availability).toBe("configured_available");
    });

    it("configured_available — openai with reachable backend", async () => {
      const fetchFn = makeMockFetchFn({ data: [] });
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        fetchFn,
      });
      expect(result.ok).toBe(true);
      expect(result.status!.availability).toBe("configured_available");
    });

    it("configured_unavailable — openai with unreachable backend", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("timeout"));
      const result = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        fetchFn: fetchFn as unknown as FetchFn,
      });
      expect(result.ok).toBe(false);
      expect(result.status!.availability).toBe("configured_unavailable");
    });

    it("not_configured — openai without config", async () => {
      const result = await resolveAdapter({ kind: "openai_compatible" });
      expect(result.ok).toBe(false);
      expect(result.status!.availability).toBe("not_configured");
    });

    it("unsupported — unknown kind", async () => {
      const result = await resolveAdapter({ kind: "magic_model" });
      expect(result.ok).toBe(false);
      expect(result.status!.availability).toBe("unsupported");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Summary and metadata consistency                                   */
  /* ------------------------------------------------------------------ */

  describe("Summary and Metadata Consistency", () => {
    it("buildAgentRunSummary should include adapter info from model-backed run", () => {
      const result = makeMockResult();
      const summary = buildAgentRunSummary(result);
      expect(summary.adapterKind).toBe("openai_compatible");
      expect(summary.isModelGenerated).toBe(true);
      expect(summary.outputPreview).toContain("Test output");
    });

    it("buildAgentRunSummary should include adapter info from stub run", () => {
      const result = makeMockResult({
        output: {
          responseText: "Stub response",
          isModelGenerated: false,
          adapterKind: "stub",
          durationMs: 1,
        },
      });
      const summary = buildAgentRunSummary(result);
      expect(summary.adapterKind).toBe("stub");
      expect(summary.isModelGenerated).toBe(false);
    });

    it("inspectAgentRun should distinguish stub vs model-backed", () => {
      const stubResult = makeMockResult({
        output: {
          responseText: "Stub",
          isModelGenerated: false,
          adapterKind: "stub",
          durationMs: 0,
        },
      });
      const modelResult = makeMockResult();

      const stubReport = inspectAgentRun(stubResult);
      const modelReport = inspectAgentRun(modelResult);

      expect(stubReport).toContain("Model-generated: false");
      expect(stubReport).toContain("Adapter: stub");
      expect(modelReport).toContain("Model-generated: true");
      expect(modelReport).toContain("Adapter: openai_compatible");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Full pipeline integration test                                     */
  /* ------------------------------------------------------------------ */

  describe("Full Pipeline Integration", () => {
    it("should run complete pipeline: resolve → dispatch → events → summary", async () => {
      // 1. Resolve adapter
      const chatResponse = makeSuccessfulChatResponse("Workspace has 42 TypeScript files.");
      const fetchFnModels = makeMockFetchFn({ data: [] });
      const fetchFnChat = makeMockFetchFn(chatResponse);

      // Use different fetch for models vs chat
      let callCount = 0;
      const fetchFn: FetchFn = async (url, init) => {
        callCount++;
        if (url.includes("/models")) {
          return fetchFnModels(url, init);
        }
        return fetchFnChat(url, init);
      };

      const resolution = await resolveAdapter({
        kind: "openai_compatible",
        openaiConfig: makeMockOpenAIConfig(),
        fetchFn,
      });
      expect(resolution.ok).toBe(true);

      // 2. Create adapter resolved event
      const resolvedEvent = agentAdapterResolved(resolution.status!);
      expect(resolvedEvent.kind).toBe("agent_adapter_resolved");

      // 3. Dispatch task
      const input: AgentRunInput = {
        sessionId: "sess-pipeline",
        taskKind: "summarize_workspace",
      };
      const deps: AgentRunDispatchDeps = {
        getSessionAgents: () => [makeMockAgentSummary()],
        adapter: resolution.adapter!,
      };
      const result = await dispatchAgentTask(input, deps);
      expect(result.status).toBe("completed");
      expect(result.output!.responseText).toBe("Workspace has 42 TypeScript files.");
      expect(result.output!.isModelGenerated).toBe(true);

      // 4. Generate events
      const events = agentRunResultToEvents(result);
      expect(events.length).toBe(1);
      expect(events[0].kind).toBe("agent_run_completed");
      expect(events[0].detail.isModelGenerated).toBe(true);

      // 5. Build session summary
      const sessionSummary = buildAgentRunSessionSummary(result, 1, resolution.status);
      expect(sessionSummary.agentRunExecuted).toBe(true);
      expect(sessionSummary.lastAgentRunModelGenerated).toBe(true);
      expect(sessionSummary.activeAdapterKind).toBe("openai_compatible");
      expect(sessionSummary.activeAdapterAvailability).toBe("configured_available");
      expect(sessionSummary.activeAdapterModelName).toBe("gpt-4o-mini");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Backward compatibility                                             */
  /* ------------------------------------------------------------------ */

  describe("Backward Compatibility", () => {
    it("should preserve existing StubExecutionAdapter behavior", async () => {
      const adapter = new StubExecutionAdapter();
      const request = makeMockRequest();
      const output = await adapter.execute(request);
      expect(output.isModelGenerated).toBe(false);
      expect(output.adapterKind).toBe("stub");
      expect(output.responseText).toContain("Stub response");
    });

    it("should preserve existing AgentExecutionAdapter interface", () => {
      const adapter: AgentExecutionAdapter = new StubExecutionAdapter();
      expect(adapter.kind).toBe("stub");
      expect(adapter.isModelBacked).toBe(false);
      expect(typeof adapter.execute).toBe("function");
    });

    it("should preserve all existing task kinds", () => {
      expect(ALL_TASK_KINDS).toContain("summarize_workspace");
      expect(ALL_TASK_KINDS).toContain("review_diagnostics");
      expect(ALL_TASK_KINDS).toContain("explain_files");
      expect(ALL_TASK_KINDS).toContain("summarize_github");
      expect(ALL_TASK_KINDS).toContain("general_query");
      expect(ALL_TASK_KINDS).toContain("custom");
    });

    it("should preserve existing event kinds", () => {
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_requested");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_started");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_completed");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_failed");
    });

    it("should preserve buildAgentRunSessionSummary with 2-arg call", () => {
      const result = makeMockResult();
      const summary = buildAgentRunSessionSummary(result, 1);
      expect(summary.agentRunExecuted).toBe(true);
      // Phase 46 fields default to null when no adapter status
      expect(summary.activeAdapterKind).toBe("openai_compatible"); // from result
      expect(summary.activeAdapterAvailability).toBeNull();
    });

    it("should preserve existing command definitions", () => {
      expect(ALL_COMMAND_IDS).toContain("run_agent_task");
      expect(ALL_COMMAND_IDS).toContain("inspect_agent_run");
    });
  });
});
