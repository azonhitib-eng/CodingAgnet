/**
 * Streaming adapter output types and helpers.
 *
 * Phase 49: Streaming adapter output.
 *
 * This module defines the streaming extension to the execution adapter layer.
 * Adapters that support streaming can progressively emit partial output chunks
 * instead of waiting for the full response.
 *
 * This is bounded streaming within a single agent run. It is NOT:
 * - Multi-turn conversation
 * - Autonomous orchestration
 * - Background job queues
 * - Tool calling inside runs
 *
 * If the adapter is non-streaming, the system falls back to full-response mode.
 * If streaming fails mid-stream, the error is explicit and visible.
 */

import type { AgentRunRequest, AgentRunOutput } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Streaming chunk                                                    */
/* ------------------------------------------------------------------ */

/**
 * The lifecycle phase of a streaming chunk.
 *
 * - "start"    — Stream has begun, no content yet
 * - "delta"    — Partial content token/fragment
 * - "complete" — Stream finished successfully
 * - "error"    — Stream ended with an error
 */
export type StreamChunkType = "start" | "delta" | "complete" | "error";

/**
 * A single chunk of streaming output.
 *
 * Emitted progressively during a streaming agent run.
 */
export interface StreamChunk {
  /** Lifecycle phase of this chunk. */
  readonly type: StreamChunkType;
  /** Partial text content (present for "delta" and "complete" types). */
  readonly content: string;
  /** Index of this chunk in the stream (0-based). */
  readonly index: number;
  /** Finish reason from the model (present for "complete" type). */
  readonly finishReason: string | null;
  /** Optional metadata from the adapter. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ */
/*  Streaming capability                                               */
/* ------------------------------------------------------------------ */

/**
 * Streaming capability of an adapter.
 *
 * - "streaming"      — Adapter supports streaming and it is the preferred path
 * - "non_streaming"  — Adapter does not support streaming, uses full-response
 * - "unavailable"    — Adapter is not available at all
 */
export type StreamingCapability = "streaming" | "non_streaming" | "unavailable";

/* ------------------------------------------------------------------ */
/*  Streaming callback                                                 */
/* ------------------------------------------------------------------ */

/**
 * Callback invoked for each chunk during streaming execution.
 *
 * The callback may be sync or async. If async, the stream will await it
 * before emitting the next chunk (backpressure).
 */
export type StreamChunkCallback = (chunk: StreamChunk) => void | Promise<void>;

/* ------------------------------------------------------------------ */
/*  Streaming execution adapter interface                              */
/* ------------------------------------------------------------------ */

/**
 * Extension interface for adapters that support streaming.
 *
 * This is separate from AgentExecutionAdapter so existing non-streaming
 * adapters remain compatible without modification.
 *
 * An adapter that implements both AgentExecutionAdapter and StreamingExecutionAdapter
 * is considered streaming-capable.
 */
export interface StreamingExecutionAdapter {
  /** Whether this adapter supports streaming. Always true. */
  readonly supportsStreaming: true;

  /**
   * Execute a bounded task with streaming output.
   *
   * Emits chunks progressively via the callback. Returns the final
   * assembled output after the stream completes.
   *
   * The stream lifecycle is:
   *   1. onChunk({ type: "start", ... })
   *   2. onChunk({ type: "delta", content: "...", ... }) — repeated
   *   3. onChunk({ type: "complete", content: fullText, ... })
   *
   * On error:
   *   1. onChunk({ type: "error", content: errorMessage, ... })
   *   2. The promise rejects with an Error
   *
   * @param request - The agent run request
   * @param onChunk - Callback for each streaming chunk
   * @returns The final assembled AgentRunOutput
   */
  executeStreaming(
    request: AgentRunRequest,
    onChunk: StreamChunkCallback,
  ): Promise<AgentRunOutput>;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

/**
 * Check if an adapter supports streaming.
 *
 * Returns true if the adapter implements the StreamingExecutionAdapter interface.
 */
export function isStreamingAdapter(adapter: unknown): adapter is StreamingExecutionAdapter {
  if (!adapter || typeof adapter !== "object") return false;
  const candidate = adapter as Record<string, unknown>;
  return (
    candidate.supportsStreaming === true &&
    typeof candidate.executeStreaming === "function"
  );
}

/**
 * Determine the streaming capability of an adapter.
 *
 * Returns:
 * - "streaming" if the adapter supports streaming
 * - "non_streaming" if the adapter is available but does not stream
 * - "unavailable" if the adapter is null/undefined
 */
export function getStreamingCapability(adapter: unknown): StreamingCapability {
  if (!adapter) return "unavailable";
  if (isStreamingAdapter(adapter)) return "streaming";
  return "non_streaming";
}

/* ------------------------------------------------------------------ */
/*  Stream accumulator                                                 */
/* ------------------------------------------------------------------ */

/**
 * Accumulated state from a streaming execution.
 *
 * Tracks chunks as they arrive and assembles the final text.
 */
export interface StreamAccumulator {
  /** All received chunks (in order). */
  readonly chunks: readonly StreamChunk[];
  /** Assembled full text from all delta chunks. */
  readonly assembledText: string;
  /** Total number of delta chunks received. */
  readonly deltaCount: number;
  /** Whether the stream has completed. */
  readonly isComplete: boolean;
  /** Whether the stream ended with an error. */
  readonly isError: boolean;
  /** Error message if the stream failed. */
  readonly errorMessage: string | null;
  /** Finish reason from the final chunk (if complete). */
  readonly finishReason: string | null;
}

/**
 * Create a fresh stream accumulator.
 */
export function createStreamAccumulator(): StreamAccumulator {
  return {
    chunks: [],
    assembledText: "",
    deltaCount: 0,
    isComplete: false,
    isError: false,
    errorMessage: null,
    finishReason: null,
  };
}

/**
 * Apply a chunk to an accumulator, returning the updated accumulator.
 *
 * Immutable: returns a new object each time.
 */
export function applyChunk(acc: StreamAccumulator, chunk: StreamChunk): StreamAccumulator {
  const chunks = [...acc.chunks, chunk];

  switch (chunk.type) {
    case "start":
      return { ...acc, chunks };

    case "delta":
      return {
        ...acc,
        chunks,
        assembledText: acc.assembledText + chunk.content,
        deltaCount: acc.deltaCount + 1,
      };

    case "complete":
      return {
        ...acc,
        chunks,
        isComplete: true,
        finishReason: chunk.finishReason,
        // If the complete chunk carries the full text, use it; otherwise keep assembled
        assembledText: chunk.content || acc.assembledText,
      };

    case "error":
      return {
        ...acc,
        chunks,
        isError: true,
        errorMessage: chunk.content || "Unknown streaming error",
      };

    default:
      return { ...acc, chunks };
  }
}

/* ------------------------------------------------------------------ */
/*  Streaming run state                                                */
/* ------------------------------------------------------------------ */

/**
 * Status of a streaming run in progress.
 *
 * - "not_started"  — Streaming has not begun
 * - "streaming"    — Chunks are being received
 * - "completed"    — Stream finished successfully
 * - "failed"       — Stream ended with an error
 * - "fallback"     — Adapter does not support streaming; fell back to full response
 */
export type StreamRunStatus =
  | "not_started"
  | "streaming"
  | "completed"
  | "failed"
  | "fallback";

/**
 * In-progress state of a streaming agent run.
 *
 * Used by the server/session layer to track streaming runs.
 */
export interface StreamRunState {
  /** Run ID this stream belongs to. */
  readonly runId: string;
  /** Current streaming status. */
  readonly status: StreamRunStatus;
  /** Streaming capability of the adapter used. */
  readonly capability: StreamingCapability;
  /** Accumulated stream state. */
  readonly accumulator: StreamAccumulator;
  /** ISO-8601 timestamp when the stream started. */
  readonly startedAt: string;
  /** ISO-8601 timestamp when the stream ended (null if in progress). */
  readonly finishedAt: string | null;
}

/**
 * Create initial stream run state.
 */
export function createStreamRunState(
  runId: string,
  capability: StreamingCapability,
): StreamRunState {
  return {
    runId,
    status: capability === "streaming" ? "not_started" : "fallback",
    capability,
    accumulator: createStreamAccumulator(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

/**
 * Update stream run state with a new chunk.
 */
export function updateStreamRunState(
  state: StreamRunState,
  chunk: StreamChunk,
): StreamRunState {
  const accumulator = applyChunk(state.accumulator, chunk);

  let status: StreamRunStatus = state.status;
  if (chunk.type === "start" || chunk.type === "delta") {
    status = "streaming";
  } else if (chunk.type === "complete") {
    status = "completed";
  } else if (chunk.type === "error") {
    status = "failed";
  }

  return {
    ...state,
    status,
    accumulator,
    finishedAt: (status === "completed" || status === "failed")
      ? new Date().toISOString()
      : null,
  };
}

/**
 * Mark stream run state as completed via fallback (non-streaming).
 */
export function markFallbackCompleted(
  state: StreamRunState,
  responseText: string,
): StreamRunState {
  return {
    ...state,
    status: "fallback",
    accumulator: {
      ...state.accumulator,
      assembledText: responseText,
      isComplete: true,
    },
    finishedAt: new Date().toISOString(),
  };
}
