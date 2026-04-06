/**
 * Phase 49 — Streaming Adapter Output tests.
 *
 * Covers:
 * - Streaming types and helpers (StreamChunk, StreamAccumulator, StreamRunState)
 * - Streaming adapter detection and capability
 * - OpenAI adapter streaming execution with SSE parsing
 * - Chunk aggregation and final result assembly
 * - Non-streaming adapter compatibility
 * - Failure during streaming
 * - Session event emission for streaming lifecycle
 * - Console/timeline classification of streaming events
 * - Shell/console rendering of streaming output cards
 * - No regression in existing full-response flows
 * - Export surface
 *
 * Uses deterministic mocks/fakes. No live external services.
 */

import { describe, it, expect, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports from streaming module                                      */
/* ------------------------------------------------------------------ */

import {
  isStreamingAdapter,
  getStreamingCapability,
  createStreamAccumulator,
  applyChunk,
  createStreamRunState,
  updateStreamRunState,
  markFallbackCompleted,
} from "../../src/agent-run/streaming.js";

import type {
  StreamChunk,
  StreamChunkType,
  StreamingCapability,
  StreamChunkCallback,
  StreamingExecutionAdapter,
  StreamAccumulator,
  StreamRunStatus,
  StreamRunState,
} from "../../src/agent-run/streaming.js";

/* ------------------------------------------------------------------ */
/*  Imports from adapter modules                                       */
/* ------------------------------------------------------------------ */

import { StubExecutionAdapter } from "../../src/agent-run/adapter.js";
import { OpenAIExecutionAdapter } from "../../src/agent-run/openai-adapter.js";
import type { FetchFn, StreamingFetchFn } from "../../src/agent-run/openai-adapter.js";
import type { OpenAIAdapterConfig } from "../../src/agent-run/adapter-config.js";
import { EchoTestAdapter } from "../../src/agent-run/adapter-manager.js";

/* ------------------------------------------------------------------ */
/*  Imports from session integration                                   */
/* ------------------------------------------------------------------ */

import {
  AGENT_RUN_EVENT_KINDS,
  agentRunStreamStarted,
  agentRunStreamChunk,
  agentRunStreamCompleted,
  agentRunStreamFailed,
  isAgentRunEvent,
  buildAgentRunSessionSummary,
} from "../../src/agent-run/session-integration.js";

/* ------------------------------------------------------------------ */
/*  Imports from dispatch                                              */
/* ------------------------------------------------------------------ */

import { dispatchAgentTask } from "../../src/agent-run/dispatch.js";
import type { AgentRunDispatchDeps } from "../../src/agent-run/dispatch.js";
import type { AgentRunRequest, AgentRunInput } from "../../src/agent-run/types.js";
import { _resetRunIdCounter } from "../../src/agent-run/types.js";

/* ------------------------------------------------------------------ */
/*  Imports from app-shell helpers                                     */
/* ------------------------------------------------------------------ */

import { classifyEvent } from "../../src/app-shell/timeline-helpers.js";
import { classifyActor, classifyCard } from "../../src/app-shell/console-helpers.js";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeAgentSummary(id = "agent-1", name = "TestAgent") {
  return {
    id,
    name,
    kind: "general" as const,
    status: "attached" as const,
    capabilities: [] as string[],
    allowedStages: [] as string[],
    failureReason: null,
    disabledReason: null,
  };
}

const baseConfig: OpenAIAdapterConfig = {
  baseUrl: "https://api.test.com/v1",
  apiKey: "test-key",
  model: "test-model",
  maxTokens: 100,
  temperature: 0.1,
  timeoutMs: 5000,
};

/**
 * Create a mock non-streaming fetch that returns a chat completion response.
 */
function makeMockFetchFn(content: string): FetchFn {
  return async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      id: "test-completion",
      model: "test-model",
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
  });
}

/**
 * Create a mock streaming fetch that returns SSE chunks.
 */
function makeMockStreamingFetchFn(chunks: string[], finishReason = "stop"): StreamingFetchFn {
  return async () => {
    // Build SSE data
    const sseLines: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const data = JSON.stringify({
        choices: [{ delta: { content: chunks[i] }, finish_reason: i === chunks.length - 1 ? finishReason : null }],
        model: "test-model",
      });
      sseLines.push(`data: ${data}\n\n`);
    }
    sseLines.push("data: [DONE]\n\n");

    const fullText = sseLines.join("");
    const encoder = new TextEncoder();
    const encoded = encoder.encode(fullText);

    let position = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Emit in small chunks to simulate streaming
        const chunkSize = Math.min(50, encoded.length - position);
        if (chunkSize <= 0) {
          controller.close();
          return;
        }
        controller.enqueue(encoded.slice(position, position + chunkSize));
        position += chunkSize;
      },
    });

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      body: stream,
    };
  };
}

/**
 * Create a mock streaming fetch that fails after some chunks.
 */
function makeMockFailingStreamingFetchFn(chunksBeforeError: string[], errorMessage: string): StreamingFetchFn {
  return async () => {
    const sseLines: string[] = [];
    for (const chunk of chunksBeforeError) {
      const data = JSON.stringify({
        choices: [{ delta: { content: chunk }, finish_reason: null }],
      });
      sseLines.push(`data: ${data}\n\n`);
    }

    const fullText = sseLines.join("");
    const encoder = new TextEncoder();
    const encoded = encoder.encode(fullText);

    let position = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position < encoded.length) {
          controller.enqueue(encoded.slice(position));
          position = encoded.length;
          return;
        }
        // After emitting all chunks, throw error
        controller.error(new Error(errorMessage));
      },
    });

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      body: stream,
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Phase 49 — Streaming Adapter Output", () => {
  beforeEach(() => {
    _resetRunIdCounter();
  });

  /* ================================================================ */
  /*  Streaming types and helpers                                      */
  /* ================================================================ */

  describe("StreamChunk types", () => {
    it("supports all chunk types", () => {
      const types: StreamChunkType[] = ["start", "delta", "complete", "error"];
      expect(types).toHaveLength(4);
    });

    it("creates valid start chunk", () => {
      const chunk: StreamChunk = { type: "start", content: "", index: 0, finishReason: null };
      expect(chunk.type).toBe("start");
      expect(chunk.content).toBe("");
    });

    it("creates valid delta chunk", () => {
      const chunk: StreamChunk = { type: "delta", content: "Hello", index: 1, finishReason: null };
      expect(chunk.type).toBe("delta");
      expect(chunk.content).toBe("Hello");
    });

    it("creates valid complete chunk", () => {
      const chunk: StreamChunk = { type: "complete", content: "Full text", index: 5, finishReason: "stop" };
      expect(chunk.type).toBe("complete");
      expect(chunk.finishReason).toBe("stop");
    });

    it("creates valid error chunk", () => {
      const chunk: StreamChunk = { type: "error", content: "Error msg", index: 3, finishReason: null };
      expect(chunk.type).toBe("error");
      expect(chunk.content).toBe("Error msg");
    });
  });

  describe("StreamingCapability", () => {
    it("supports all capability values", () => {
      const caps: StreamingCapability[] = ["streaming", "non_streaming", "unavailable"];
      expect(caps).toHaveLength(3);
    });
  });

  /* ================================================================ */
  /*  Adapter detection                                                */
  /* ================================================================ */

  describe("isStreamingAdapter", () => {
    it("returns false for null", () => {
      expect(isStreamingAdapter(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isStreamingAdapter(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isStreamingAdapter("string")).toBe(false);
      expect(isStreamingAdapter(42)).toBe(false);
    });

    it("returns false for stub adapter", () => {
      expect(isStreamingAdapter(new StubExecutionAdapter())).toBe(false);
    });

    it("returns false for echo adapter", () => {
      expect(isStreamingAdapter(new EchoTestAdapter())).toBe(false);
    });

    it("returns true for OpenAI adapter (has executeStreaming)", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      expect(isStreamingAdapter(adapter)).toBe(true);
    });

    it("returns false for object with supportsStreaming=false", () => {
      expect(isStreamingAdapter({ supportsStreaming: false, executeStreaming: () => {} })).toBe(false);
    });

    it("returns false for object missing executeStreaming method", () => {
      expect(isStreamingAdapter({ supportsStreaming: true })).toBe(false);
    });

    it("returns true for object with supportsStreaming=true and executeStreaming function", () => {
      expect(isStreamingAdapter({ supportsStreaming: true, executeStreaming: () => {} })).toBe(true);
    });
  });

  describe("getStreamingCapability", () => {
    it("returns 'unavailable' for null adapter", () => {
      expect(getStreamingCapability(null)).toBe("unavailable");
    });

    it("returns 'unavailable' for undefined adapter", () => {
      expect(getStreamingCapability(undefined)).toBe("unavailable");
    });

    it("returns 'non_streaming' for stub adapter", () => {
      expect(getStreamingCapability(new StubExecutionAdapter())).toBe("non_streaming");
    });

    it("returns 'non_streaming' for echo adapter", () => {
      expect(getStreamingCapability(new EchoTestAdapter())).toBe("non_streaming");
    });

    it("returns 'streaming' for OpenAI adapter", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      expect(getStreamingCapability(adapter)).toBe("streaming");
    });
  });

  /* ================================================================ */
  /*  StreamAccumulator                                                */
  /* ================================================================ */

  describe("StreamAccumulator", () => {
    it("creates empty accumulator", () => {
      const acc = createStreamAccumulator();
      expect(acc.chunks).toHaveLength(0);
      expect(acc.assembledText).toBe("");
      expect(acc.deltaCount).toBe(0);
      expect(acc.isComplete).toBe(false);
      expect(acc.isError).toBe(false);
      expect(acc.errorMessage).toBeNull();
      expect(acc.finishReason).toBeNull();
    });

    it("applies start chunk", () => {
      const acc = createStreamAccumulator();
      const result = applyChunk(acc, { type: "start", content: "", index: 0, finishReason: null });
      expect(result.chunks).toHaveLength(1);
      expect(result.assembledText).toBe("");
      expect(result.deltaCount).toBe(0);
    });

    it("applies delta chunks and accumulates text", () => {
      let acc = createStreamAccumulator();
      acc = applyChunk(acc, { type: "start", content: "", index: 0, finishReason: null });
      acc = applyChunk(acc, { type: "delta", content: "Hello", index: 1, finishReason: null });
      acc = applyChunk(acc, { type: "delta", content: " World", index: 2, finishReason: null });

      expect(acc.chunks).toHaveLength(3);
      expect(acc.assembledText).toBe("Hello World");
      expect(acc.deltaCount).toBe(2);
      expect(acc.isComplete).toBe(false);
    });

    it("applies complete chunk", () => {
      let acc = createStreamAccumulator();
      acc = applyChunk(acc, { type: "delta", content: "Hello", index: 1, finishReason: null });
      acc = applyChunk(acc, { type: "complete", content: "", index: 2, finishReason: "stop" });

      expect(acc.isComplete).toBe(true);
      expect(acc.finishReason).toBe("stop");
      // When complete chunk has no content, keeps assembled text
      expect(acc.assembledText).toBe("Hello");
    });

    it("complete chunk with full text overrides assembled", () => {
      let acc = createStreamAccumulator();
      acc = applyChunk(acc, { type: "delta", content: "partial", index: 1, finishReason: null });
      acc = applyChunk(acc, { type: "complete", content: "full response", index: 2, finishReason: "stop" });

      expect(acc.assembledText).toBe("full response");
    });

    it("applies error chunk", () => {
      let acc = createStreamAccumulator();
      acc = applyChunk(acc, { type: "delta", content: "partial", index: 1, finishReason: null });
      acc = applyChunk(acc, { type: "error", content: "timeout", index: 2, finishReason: null });

      expect(acc.isError).toBe(true);
      expect(acc.errorMessage).toBe("timeout");
      expect(acc.assembledText).toBe("partial");
    });

    it("error with empty content gives default message", () => {
      let acc = createStreamAccumulator();
      acc = applyChunk(acc, { type: "error", content: "", index: 0, finishReason: null });
      expect(acc.errorMessage).toBe("Unknown streaming error");
    });

    it("is immutable — does not mutate original", () => {
      const acc1 = createStreamAccumulator();
      const acc2 = applyChunk(acc1, { type: "delta", content: "X", index: 1, finishReason: null });
      expect(acc1.assembledText).toBe("");
      expect(acc2.assembledText).toBe("X");
    });
  });

  /* ================================================================ */
  /*  StreamRunState                                                   */
  /* ================================================================ */

  describe("StreamRunState", () => {
    it("creates initial state for streaming adapter", () => {
      const state = createStreamRunState("run-123", "streaming");
      expect(state.runId).toBe("run-123");
      expect(state.status).toBe("not_started");
      expect(state.capability).toBe("streaming");
      expect(state.accumulator.assembledText).toBe("");
      expect(state.startedAt).toBeTruthy();
      expect(state.finishedAt).toBeNull();
    });

    it("creates fallback state for non-streaming adapter", () => {
      const state = createStreamRunState("run-456", "non_streaming");
      expect(state.status).toBe("fallback");
      expect(state.capability).toBe("non_streaming");
    });

    it("creates fallback state for unavailable adapter", () => {
      const state = createStreamRunState("run-789", "unavailable");
      expect(state.status).toBe("fallback");
    });

    it("updates to streaming status on start chunk", () => {
      const state = createStreamRunState("run-1", "streaming");
      const updated = updateStreamRunState(state, { type: "start", content: "", index: 0, finishReason: null });
      expect(updated.status).toBe("streaming");
      expect(updated.finishedAt).toBeNull();
    });

    it("updates to streaming status on delta chunk", () => {
      let state = createStreamRunState("run-1", "streaming");
      state = updateStreamRunState(state, { type: "start", content: "", index: 0, finishReason: null });
      state = updateStreamRunState(state, { type: "delta", content: "Hi", index: 1, finishReason: null });
      expect(state.status).toBe("streaming");
      expect(state.accumulator.assembledText).toBe("Hi");
    });

    it("updates to completed on complete chunk", () => {
      let state = createStreamRunState("run-1", "streaming");
      state = updateStreamRunState(state, { type: "complete", content: "Done", index: 2, finishReason: "stop" });
      expect(state.status).toBe("completed");
      expect(state.finishedAt).toBeTruthy();
    });

    it("updates to failed on error chunk", () => {
      let state = createStreamRunState("run-1", "streaming");
      state = updateStreamRunState(state, { type: "error", content: "Oops", index: 1, finishReason: null });
      expect(state.status).toBe("failed");
      expect(state.finishedAt).toBeTruthy();
      expect(state.accumulator.errorMessage).toBe("Oops");
    });

    it("markFallbackCompleted sets response text and completes", () => {
      const state = createStreamRunState("run-1", "non_streaming");
      const updated = markFallbackCompleted(state, "Full response text");
      expect(updated.status).toBe("fallback");
      expect(updated.accumulator.assembledText).toBe("Full response text");
      expect(updated.accumulator.isComplete).toBe(true);
      expect(updated.finishedAt).toBeTruthy();
    });
  });

  /* ================================================================ */
  /*  OpenAI adapter streaming execution                               */
  /* ================================================================ */

  describe("OpenAI adapter streaming", () => {
    it("has supportsStreaming = true", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      expect(adapter.supportsStreaming).toBe(true);
    });

    it("isStreamingAdapter returns true", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      expect(isStreamingAdapter(adapter)).toBe(true);
    });

    it("executeStreaming falls back to execute when no streamingFetchFn", async () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("fallback response"));
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      const output = await adapter.executeStreaming(request, (c) => { chunks.push(c); });
      expect(output.responseText).toBe("fallback response");
      expect(output.isModelGenerated).toBe(true);
      // No streaming chunks emitted because it fell back
      expect(chunks).toHaveLength(0);
    });

    it("executeStreaming parses SSE chunks correctly", async () => {
      const streamingFetch = makeMockStreamingFetchFn(["Hello", " ", "World"]);
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      const output = await adapter.executeStreaming(request, (c) => { chunks.push(c); });

      expect(output.responseText).toBe("Hello World");
      expect(output.isModelGenerated).toBe(true);
      expect(output.adapterKind).toBe("openai_compatible");
      expect(output.structuredData?.streamed).toBe(true);

      // Should have start + 3 deltas + complete
      const startChunks = chunks.filter((c) => c.type === "start");
      const deltaChunks = chunks.filter((c) => c.type === "delta");
      const completeChunks = chunks.filter((c) => c.type === "complete");

      expect(startChunks).toHaveLength(1);
      expect(deltaChunks).toHaveLength(3);
      expect(completeChunks).toHaveLength(1);

      expect(deltaChunks[0].content).toBe("Hello");
      expect(deltaChunks[1].content).toBe(" ");
      expect(deltaChunks[2].content).toBe("World");
      expect(completeChunks[0].content).toBe("Hello World");
      expect(completeChunks[0].finishReason).toBe("stop");
    });

    it("executeStreaming reports chunk count in structuredData", async () => {
      const streamingFetch = makeMockStreamingFetchFn(["A", "B", "C", "D"]);
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const request = makeRequest();

      const output = await adapter.executeStreaming(request, () => {});
      expect(output.structuredData?.chunkCount).toBe(4);
    });

    it("executeStreaming handles empty chunks", async () => {
      const streamingFetch = makeMockStreamingFetchFn(["Only"]);
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      const output = await adapter.executeStreaming(request, (c) => { chunks.push(c); });
      expect(output.responseText).toBe("Only");
    });

    it("executeStreaming handles HTTP error", async () => {
      const streamingFetch: StreamingFetchFn = async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        body: null,
      });
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      await expect(
        adapter.executeStreaming(request, (c) => { chunks.push(c); }),
      ).rejects.toThrow("API returned HTTP 500");

      const errorChunks = chunks.filter((c) => c.type === "error");
      expect(errorChunks).toHaveLength(1);
    });

    it("executeStreaming handles network error", async () => {
      const streamingFetch: StreamingFetchFn = async () => {
        throw new Error("Connection refused");
      };
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      await expect(
        adapter.executeStreaming(request, (c) => { chunks.push(c); }),
      ).rejects.toThrow("Network error");

      const errorChunks = chunks.filter((c) => c.type === "error");
      expect(errorChunks).toHaveLength(1);
      expect(errorChunks[0].content).toBe("Connection refused");
    });

    it("executeStreaming handles mid-stream error", async () => {
      const streamingFetch = makeMockFailingStreamingFetchFn(["Part1", "Part2"], "Stream interrupted");
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      await expect(
        adapter.executeStreaming(request, (c) => { chunks.push(c); }),
      ).rejects.toThrow("Streaming error");

      const errorChunks = chunks.filter((c) => c.type === "error");
      expect(errorChunks).toHaveLength(1);

      // Should have received some delta chunks before error
      const deltaChunks = chunks.filter((c) => c.type === "delta");
      expect(deltaChunks.length).toBeGreaterThanOrEqual(2);
    });

    it("executeStreaming handles null body", async () => {
      const streamingFetch: StreamingFetchFn = async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        body: null,
      });
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];
      const request = makeRequest();

      await expect(
        adapter.executeStreaming(request, (c) => { chunks.push(c); }),
      ).rejects.toThrow("streaming not supported");
    });
  });

  /* ================================================================ */
  /*  Non-streaming adapter compatibility                              */
  /* ================================================================ */

  describe("Non-streaming adapter compatibility", () => {
    it("StubExecutionAdapter still works via execute()", async () => {
      const adapter = new StubExecutionAdapter();
      const request = makeRequest();
      const output = await adapter.execute(request);
      expect(output.responseText).toContain("Stub response");
      expect(output.isModelGenerated).toBe(false);
      expect(output.adapterKind).toBe("stub");
    });

    it("EchoTestAdapter still works via execute()", async () => {
      const adapter = new EchoTestAdapter();
      const request = makeRequest();
      const output = await adapter.execute(request);
      expect(output.responseText).toContain("Echo");
      expect(output.isModelGenerated).toBe(false);
    });

    it("OpenAI adapter execute() still works (non-streaming)", async () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("Normal response"));
      const request = makeRequest();
      const output = await adapter.execute(request);
      expect(output.responseText).toBe("Normal response");
      expect(output.isModelGenerated).toBe(true);
      expect(output.structuredData?.streamed).toBeUndefined();
    });
  });

  /* ================================================================ */
  /*  Dispatch with streaming                                          */
  /* ================================================================ */

  describe("Dispatch with streaming callback", () => {
    it("uses streaming when adapter supports it and callback is provided", async () => {
      const streamingFetch = makeMockStreamingFetchFn(["Streamed", " response"]);
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];

      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };

      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "summarize_workspace",
      };

      const result = await dispatchAgentTask(input, deps, (c) => { chunks.push(c); });

      expect(result.status).toBe("completed");
      expect(result.output?.responseText).toBe("Streamed response");
      expect(result.output?.structuredData?.streamed).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("uses full-response when adapter does not support streaming", async () => {
      const adapter = new StubExecutionAdapter();
      const chunks: StreamChunk[] = [];

      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };

      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "summarize_workspace",
      };

      const result = await dispatchAgentTask(input, deps, (c) => { chunks.push(c); });

      expect(result.status).toBe("completed");
      expect(result.output?.adapterKind).toBe("stub");
      // No chunks because stub doesn't support streaming
      expect(chunks).toHaveLength(0);
    });

    it("works without streaming callback (backward compatible)", async () => {
      const adapter = new StubExecutionAdapter();

      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };

      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "summarize_workspace",
      };

      // No onChunk callback
      const result = await dispatchAgentTask(input, deps);

      expect(result.status).toBe("completed");
      expect(result.output?.adapterKind).toBe("stub");
    });

    it("handles streaming execution failure", async () => {
      const streamingFetch: StreamingFetchFn = async () => {
        throw new Error("Network failure");
      };
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("unused"), streamingFetch);
      const chunks: StreamChunk[] = [];

      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };

      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "summarize_workspace",
      };

      const result = await dispatchAgentTask(input, deps, (c) => { chunks.push(c); });

      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe("EXECUTION_FAILED");
    });
  });

  /* ================================================================ */
  /*  Session events for streaming                                     */
  /* ================================================================ */

  describe("Session events for streaming lifecycle", () => {
    it("AGENT_RUN_EVENT_KINDS includes streaming events", () => {
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_stream_started");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_stream_chunk");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_stream_completed");
      expect(AGENT_RUN_EVENT_KINDS).toContain("agent_run_stream_failed");
    });

    it("AGENT_RUN_EVENT_KINDS has 10 total kinds", () => {
      expect(AGENT_RUN_EVENT_KINDS).toHaveLength(10);
    });

    it("agentRunStreamStarted creates valid event", () => {
      const ev = agentRunStreamStarted("run-1", "openai_compatible", true);
      expect(ev.kind).toBe("agent_run_stream_started");
      expect(ev.message).toContain("Streaming started");
      expect(ev.message).toContain("openai_compatible");
      expect(ev.message).toContain("model-backed");
      expect(ev.detail?.runId).toBe("run-1");
      expect(ev.detail?.adapterKind).toBe("openai_compatible");
      expect(ev.detail?.isModelBacked).toBe(true);
    });

    it("agentRunStreamStarted for non-model adapter", () => {
      const ev = agentRunStreamStarted("run-2", "stub", false);
      expect(ev.message).not.toContain("model-backed");
    });

    it("agentRunStreamChunk creates valid event", () => {
      const ev = agentRunStreamChunk("run-1", 5, "Here is some partial output text", 250);
      expect(ev.kind).toBe("agent_run_stream_chunk");
      expect(ev.message).toContain("250 chars");
      expect(ev.detail?.runId).toBe("run-1");
      expect(ev.detail?.chunkIndex).toBe(5);
      expect(ev.detail?.totalCharsReceived).toBe(250);
      // Content preview is truncated
      const preview = ev.detail?.contentPreview as string;
      expect(preview.length).toBeLessThanOrEqual(100);
    });

    it("agentRunStreamChunk truncates long preview", () => {
      const longContent = "X".repeat(200);
      const ev = agentRunStreamChunk("run-1", 1, longContent, 200);
      expect((ev.detail?.contentPreview as string).length).toBe(100);
    });

    it("agentRunStreamCompleted creates valid event", () => {
      const ev = agentRunStreamCompleted("run-1", 42, 1500, 2300, "stop");
      expect(ev.kind).toBe("agent_run_stream_completed");
      expect(ev.message).toContain("42 chunks");
      expect(ev.message).toContain("1500 chars");
      expect(ev.message).toContain("2300ms");
      expect(ev.detail?.runId).toBe("run-1");
      expect(ev.detail?.totalChunks).toBe(42);
      expect(ev.detail?.totalChars).toBe(1500);
      expect(ev.detail?.durationMs).toBe(2300);
      expect(ev.detail?.finishReason).toBe("stop");
    });

    it("agentRunStreamCompleted handles null finishReason", () => {
      const ev = agentRunStreamCompleted("run-1", 10, 500, 1000, null);
      expect(ev.detail?.finishReason).toBeNull();
    });

    it("agentRunStreamFailed creates valid event", () => {
      const ev = agentRunStreamFailed("run-1", "Connection reset", 5);
      expect(ev.kind).toBe("agent_run_stream_failed");
      expect(ev.message).toContain("5 chunks");
      expect(ev.message).toContain("Connection reset");
      expect(ev.detail?.runId).toBe("run-1");
      expect(ev.detail?.errorMessage).toBe("Connection reset");
      expect(ev.detail?.chunksReceivedBeforeError).toBe(5);
    });

    it("streaming events are recognized by isAgentRunEvent", () => {
      const events = [
        agentRunStreamStarted("r", "s", true),
        agentRunStreamChunk("r", 0, "c", 1),
        agentRunStreamCompleted("r", 1, 1, 1, null),
        agentRunStreamFailed("r", "e", 0),
      ];
      for (const ev of events) {
        expect(isAgentRunEvent(ev)).toBe(true);
      }
    });
  });

  /* ================================================================ */
  /*  Session summary — streaming fields                               */
  /* ================================================================ */

  describe("Session summary with streaming fields", () => {
    it("includes streaming fields when no result", () => {
      const summary = buildAgentRunSessionSummary(null, 0, null, null);
      expect(summary.lastAgentRunStreamed).toBeNull();
      expect(summary.activeAdapterStreamingCapability).toBe("unavailable");
    });

    it("reports streaming capability for OpenAI adapter", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      const summary = buildAgentRunSessionSummary(null, 0, null, adapter);
      expect(summary.activeAdapterStreamingCapability).toBe("streaming");
    });

    it("reports non_streaming for stub adapter", () => {
      const adapter = new StubExecutionAdapter();
      const summary = buildAgentRunSessionSummary(null, 0, null, adapter);
      expect(summary.activeAdapterStreamingCapability).toBe("non_streaming");
    });

    it("reports streamed=true for streamed run result", () => {
      const result = {
        runId: "run-1",
        sessionId: "sess-1",
        status: "completed" as const,
        request: makeRequest() as any,
        output: {
          responseText: "Streamed output",
          isModelGenerated: true,
          adapterKind: "openai_compatible",
          structuredData: { streamed: true, chunkCount: 10 },
          durationMs: 500,
        },
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 500,
      };
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      const summary = buildAgentRunSessionSummary(result, 1, null, adapter);
      expect(summary.lastAgentRunStreamed).toBe(true);
    });

    it("reports streamed=false for non-streamed run result", () => {
      const result = {
        runId: "run-1",
        sessionId: "sess-1",
        status: "completed" as const,
        request: makeRequest() as any,
        output: {
          responseText: "Normal output",
          isModelGenerated: true,
          adapterKind: "openai_compatible",
          durationMs: 300,
        },
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 300,
      };
      const summary = buildAgentRunSessionSummary(result, 1, null, null);
      expect(summary.lastAgentRunStreamed).toBe(false);
    });
  });

  /* ================================================================ */
  /*  Timeline / Console event classification                          */
  /* ================================================================ */

  describe("Timeline classification of streaming events", () => {
    it("classifies agent_run_stream_started as progress", () => {
      expect(classifyEvent("agent_run_stream_started")).toBe("progress");
    });

    it("classifies agent_run_stream_chunk as info", () => {
      expect(classifyEvent("agent_run_stream_chunk")).toBe("info");
    });

    it("classifies agent_run_stream_completed as progress", () => {
      expect(classifyEvent("agent_run_stream_completed")).toBe("progress");
    });

    it("classifies agent_run_stream_failed as failure", () => {
      expect(classifyEvent("agent_run_stream_failed")).toBe("failure");
    });
  });

  describe("Console actor classification of streaming events", () => {
    it("classifies all streaming events as agent actor", () => {
      expect(classifyActor("agent_run_stream_started")).toBe("agent");
      expect(classifyActor("agent_run_stream_chunk")).toBe("agent");
      expect(classifyActor("agent_run_stream_completed")).toBe("agent");
      expect(classifyActor("agent_run_stream_failed")).toBe("agent");
    });
  });

  describe("Console card classification of streaming events", () => {
    it("classifies agent_run_stream_started as lifecycle_card", () => {
      expect(classifyCard("agent_run_stream_started")).toBe("lifecycle_card");
    });

    it("classifies agent_run_stream_chunk as message", () => {
      expect(classifyCard("agent_run_stream_chunk")).toBe("message");
    });

    it("classifies agent_run_stream_completed as success_card", () => {
      expect(classifyCard("agent_run_stream_completed")).toBe("success_card");
    });

    it("classifies agent_run_stream_failed as failure_card", () => {
      expect(classifyCard("agent_run_stream_failed")).toBe("failure_card");
    });
  });

  /* ================================================================ */
  /*  Shell/console rendering                                          */
  /* ================================================================ */

  describe("Shell/console rendering of streaming output", () => {
    it("includes streaming CSS classes in rendered HTML", async () => {
      const { renderShellHtml } = await import("../../src/app-shell/views.js");
      const html = renderShellHtml();

      // Check for streaming CSS class definitions
      expect(html).toContain(".stream-status-bar");
      expect(html).toContain(".stream-chunk-card");
      expect(html).toContain(".stream-complete-card");
      expect(html).toContain("ssb-label");
      expect(html).toContain("scc-progress");
    });

    it("includes streaming event kind mappings in client JS", async () => {
      const { renderShellHtml } = await import("../../src/app-shell/views.js");
      const html = renderShellHtml();

      // Check event category mappings
      expect(html).toContain("agent_run_stream_started");
      expect(html).toContain("agent_run_stream_chunk");
      expect(html).toContain("agent_run_stream_completed");
      expect(html).toContain("agent_run_stream_failed");
    });
  });

  /* ================================================================ */
  /*  No regression in full-response flows                             */
  /* ================================================================ */

  describe("No regression in full-response flows", () => {
    it("dispatchAgentTask without onChunk still works", async () => {
      const adapter = new StubExecutionAdapter();
      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };
      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "summarize_workspace",
      };

      const result = await dispatchAgentTask(input, deps);
      expect(result.status).toBe("completed");
      expect(result.output?.responseText).toContain("Stub response");
    });

    it("dispatchAgentTask with onChunk=undefined works", async () => {
      const adapter = new StubExecutionAdapter();
      const deps: AgentRunDispatchDeps = {
        adapter,
        getSessionAgents: () => [makeAgentSummary()],
      };
      const input: AgentRunInput = {
        sessionId: "sess-1",
        taskKind: "general_query",
        taskDescription: "What is this?",
      };

      const result = await dispatchAgentTask(input, deps, undefined);
      expect(result.status).toBe("completed");
    });

    it("OpenAI adapter execute() is unchanged", async () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("Classic response"));
      const request = makeRequest();
      const output = await adapter.execute(request);
      expect(output.responseText).toBe("Classic response");
      expect(output.isModelGenerated).toBe(true);
      expect(output.adapterKind).toBe("openai_compatible");
    });

    it("existing event kinds still classified correctly", () => {
      expect(classifyEvent("agent_run_requested")).toBe("info");
      expect(classifyEvent("agent_run_started")).toBe("progress");
      expect(classifyEvent("agent_run_completed")).toBe("progress");
      expect(classifyEvent("agent_run_failed")).toBe("failure");
      expect(classifyEvent("agent_adapter_resolved")).toBe("progress");
    });

    it("existing actor classifications unchanged", () => {
      expect(classifyActor("agent_run_requested")).toBe("agent");
      expect(classifyActor("agent_run_completed")).toBe("agent");
      expect(classifyActor("agent_run_failed")).toBe("agent");
    });
  });

  /* ================================================================ */
  /*  Export surface                                                    */
  /* ================================================================ */

  describe("Export surface", () => {
    it("streaming module exports all expected symbols", async () => {
      const mod = await import("../../src/agent-run/streaming.js");
      expect(typeof mod.isStreamingAdapter).toBe("function");
      expect(typeof mod.getStreamingCapability).toBe("function");
      expect(typeof mod.createStreamAccumulator).toBe("function");
      expect(typeof mod.applyChunk).toBe("function");
      expect(typeof mod.createStreamRunState).toBe("function");
      expect(typeof mod.updateStreamRunState).toBe("function");
      expect(typeof mod.markFallbackCompleted).toBe("function");
    });

    it("index barrel exports streaming symbols", async () => {
      const mod = await import("../../src/agent-run/index.js");
      expect(typeof mod.isStreamingAdapter).toBe("function");
      expect(typeof mod.getStreamingCapability).toBe("function");
      expect(typeof mod.createStreamAccumulator).toBe("function");
      expect(typeof mod.applyChunk).toBe("function");
      expect(typeof mod.createStreamRunState).toBe("function");
      expect(typeof mod.updateStreamRunState).toBe("function");
      expect(typeof mod.markFallbackCompleted).toBe("function");
    });

    it("index barrel exports streaming event factories", async () => {
      const mod = await import("../../src/agent-run/index.js");
      expect(typeof mod.agentRunStreamStarted).toBe("function");
      expect(typeof mod.agentRunStreamChunk).toBe("function");
      expect(typeof mod.agentRunStreamCompleted).toBe("function");
      expect(typeof mod.agentRunStreamFailed).toBe("function");
    });

    it("OpenAI adapter class has executeStreaming method", () => {
      const adapter = new OpenAIExecutionAdapter(baseConfig, makeMockFetchFn("test"));
      expect(typeof adapter.executeStreaming).toBe("function");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(): AgentRunRequest {
  return {
    runId: "run-test-1",
    sessionId: "sess-1",
    agentId: "agent-1",
    agentName: "TestAgent",
    agentKind: "general" as any,
    taskKind: "summarize_workspace",
    taskDescription: "Test task",
    selectionReason: {
      method: "best_fit" as const,
      explanation: "Only eligible agent",
      agentKind: "general" as any,
      roleHint: null,
      stage: null,
      priority: 100,
      eligibleCount: 1,
    },
    contextSummary: null,
    assembledContextText: "Test context",
    requestedAt: new Date().toISOString(),
  };
}
