# Streaming Adapter Output

Phase 49 documentation.

## Overview

This phase adds **streaming adapter output** — the ability for model-backed execution adapters to progressively emit partial output chunks during bounded agent runs, instead of waiting for the full response.

This improves the user experience in the app shell by showing in-progress output as the model generates it.

### What streaming means in this project

- A bounded agent run can now receive **partial text chunks** (deltas) from a streaming-capable adapter
- The shell/timeline shows streaming lifecycle events: started → chunk updates → completed/failed
- The final assembled result is the same as a non-streaming run
- Streaming is opt-in: only adapters that support it will use it
- Non-streaming adapters fall back gracefully to full-response mode

### What this is NOT

- Multi-turn conversation (deferred)
- Autonomous orchestration or follow-up behavior (deferred)
- Tool calling inside runs (deferred)
- Code modification or autonomous planning (deferred)
- Install execution (not in scope)

## Architecture

### Streaming types (`src/agent-run/streaming.ts`)

| Type | Purpose |
|------|---------|
| `StreamChunkType` | `"start"` / `"delta"` / `"complete"` / `"error"` |
| `StreamChunk` | A single chunk of streaming output |
| `StreamingCapability` | `"streaming"` / `"non_streaming"` / `"unavailable"` |
| `StreamChunkCallback` | Callback invoked for each chunk |
| `StreamingExecutionAdapter` | Interface for streaming-capable adapters |
| `StreamAccumulator` | Tracks chunks and assembles final text |
| `StreamRunState` | In-progress state of a streaming run |

### Adapter support

| Adapter Kind | Supports Streaming | Notes |
|---|---|---|
| `openai_compatible` | ✅ Yes | Uses SSE (Server-Sent Events) with `stream: true` |
| `stub` | ❌ No | Deterministic template responses, no streaming |
| `echo_test` | ❌ No | Echo responses for testing |

### How streaming works

1. **Detection**: `isStreamingAdapter(adapter)` checks if the adapter implements `StreamingExecutionAdapter`
2. **Capability**: `getStreamingCapability(adapter)` returns `"streaming"`, `"non_streaming"`, or `"unavailable"`
3. **Dispatch**: `dispatchAgentTask(input, deps, onChunk?)` accepts an optional streaming callback
4. **Execution**: If the adapter supports streaming and `onChunk` is provided, `executeStreaming()` is used
5. **Fallback**: If the adapter does not support streaming, `execute()` is used (full response)

### Stream lifecycle

```
onChunk({ type: "start" })           → Stream begins
onChunk({ type: "delta", content })  → Partial text (repeated)
onChunk({ type: "complete" })        → Stream finished
```

On error:
```
onChunk({ type: "error", content })  → Error reported
Promise rejects with Error            → Dispatch catches and returns failed result
```

### Accumulator

The `StreamAccumulator` is an immutable state object that tracks all chunks:

```typescript
const acc = createStreamAccumulator();
const acc2 = applyChunk(acc, { type: "delta", content: "Hello", ... });
// acc2.assembledText === "Hello"
```

### Stream run state

The `StreamRunState` tracks the lifecycle of a streaming run:

```typescript
const state = createStreamRunState("run-123", "streaming");
// state.status === "not_started"

const updated = updateStreamRunState(state, startChunk);
// updated.status === "streaming"
```

## Session events

Four new session event kinds are emitted during streaming:

| Event Kind | When | Detail |
|---|---|---|
| `agent_run_stream_started` | Stream begins | `runId`, `adapterKind`, `isModelBacked` |
| `agent_run_stream_chunk` | Periodically (not every token) | `runId`, `chunkIndex`, `contentPreview`, `totalCharsReceived` |
| `agent_run_stream_completed` | Stream finishes | `runId`, `totalChunks`, `totalChars`, `durationMs`, `finishReason` |
| `agent_run_stream_failed` | Stream errors | `runId`, `errorMessage`, `chunksReceivedBeforeError` |

**Chunk event throttling**: `agent_run_stream_chunk` is NOT emitted for every single token. It is emitted at sensible intervals (first chunk, every 10th chunk, or when total characters cross a 200-char boundary). This keeps the timeline usable.

## Shell/console rendering

### New UI elements

- **Stream Started Card**: Blue status bar showing adapter kind and model-backed badge
- **Stream Chunk Card**: Compact progress indicator showing chars received
- **Stream Completed Card**: Green success card with chunk count, char count, duration
- **Stream Failed Card**: Red failure card with error message and chunks received before failure

### Timeline classification

| Event | Category | Actor | Card Type |
|---|---|---|---|
| `agent_run_stream_started` | progress | agent | lifecycle_card |
| `agent_run_stream_chunk` | info | agent | message |
| `agent_run_stream_completed` | progress | agent | success_card |
| `agent_run_stream_failed` | failure | agent | failure_card |

### Distinction between streaming and non-streaming

When the agent run completes:
- **Streamed runs** have `structuredData.streamed === true` and show streaming events in the timeline
- **Non-streamed runs** work exactly as before (single `agent_run_completed` event)
- The adapter status display continues to show the adapter kind and availability

## Session summary fields

Two new fields on `AgentRunSessionSummary`:

| Field | Type | Description |
|---|---|---|
| `lastAgentRunStreamed` | `boolean \| null` | Whether the last run used streaming |
| `activeAdapterStreamingCapability` | `string \| null` | `"streaming"`, `"non_streaming"`, or `"unavailable"` |

## Command integration

The existing `run_agent_task` command automatically uses streaming when:
1. The resolved adapter supports streaming (`getStreamingCapability()`)
2. The adapter has a `streamingFetchFn` configured

No new commands were added. The command result includes:
- `streamed: true/false` — whether streaming was used
- `streamingCapability` — the adapter's capability

## Honesty and safety

- **Stub adapter**: Clearly marked as non-streaming. Does not fake streaming.
- **OpenAI adapter without streaming fetch**: Falls back to non-streaming execute(). No fake streaming.
- **Streaming failure**: Error is emitted as `agent_run_stream_failed` event with clear error message and count of chunks received before failure.
- **No hidden retries**: If streaming fails, it fails. No automatic retry or fallback to non-streaming.
- **No token-level noise**: Chunk events are throttled to keep the timeline usable.

## Remaining deferred items

- Multi-turn conversation
- Tool calling inside agent runs
- Autonomous follow-up behavior
- Server-Sent Events endpoint for real-time client push (currently events are polled)
- Streaming visualization in desktop Electron app
- Provider-specific streaming optimizations
- Streaming for non-OpenAI-compatible adapters
