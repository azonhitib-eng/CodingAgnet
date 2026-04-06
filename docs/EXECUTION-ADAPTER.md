# Model-Backed Execution Adapter

**Phase 46** — `src/agent-run/adapter-config.ts`, `openai-adapter.ts`, `adapter-manager.ts`

## Overview

This phase replaces the stub-only agent execution path with a real
model-backed execution adapter boundary that can power bounded agent runs.

**What a model-backed execution adapter means in this project:**

An execution adapter is the boundary between the agent-run dispatch layer
and an actual inference backend. When configured, it sends assembled context
and task descriptions to a model API and returns real, model-generated
responses. When not configured, the system falls back to the existing
stub adapter with deterministic, template-based responses.

**What this is:**
- A thin, explicit adapter interface for bounded task execution
- An OpenAI-compatible API adapter that works with any chat-completions endpoint
- Explicit configuration and availability states (no fake availability)
- Structured errors for missing or invalid configuration
- Session and command integration with adapter metadata

**What this is NOT:**
- Autonomous multi-agent orchestration
- A free-form conversational LLM chat engine
- A giant provider framework
- Code modification or install execution
- Hidden retry loops or background jobs

## Supported Adapters

| Adapter Kind | Model-Backed | Description |
|---|---|---|
| `stub` | No | Deterministic template responses for testing/demo |
| `openai_compatible` | Yes | Any OpenAI-compatible chat completions API |
| `echo_test` | No | Echoes request details for integration testing |

### OpenAI-Compatible Adapter

Works with any provider that exposes a chat-completions-compatible REST endpoint:

- **OpenAI** — `https://api.openai.com/v1`
- **Azure OpenAI** — `https://<resource>.openai.azure.com/openai/deployments/<deployment>`
- **Ollama** — `http://localhost:11434/v1` (empty apiKey)
- **LM Studio** — `http://localhost:1234/v1` (empty apiKey)
- **vLLM** — `http://localhost:8000/v1` (empty apiKey)

## Configuration

Configuration is explicit — no auto-detection from environment variables,
no magic fallbacks, no silent degradation.

```typescript
import { resolveAdapter } from "codingagent-backend/agent-run";

// Resolve a model-backed adapter
const result = await resolveAdapter({
  kind: "openai_compatible",
  openaiConfig: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-...",
    model: "gpt-4o-mini",
    maxTokens: 1024,        // optional, default 1024
    temperature: 0.2,        // optional, default 0.2
    timeoutMs: 30000,        // optional, default 30000
  },
});

if (result.ok) {
  // Use result.adapter in dispatchAgentTask
  const runResult = await dispatchAgentTask(input, {
    getSessionAgents: () => agents,
    adapter: result.adapter,
  });
}
```

### Configuration Fields

| Field | Required | Default | Description |
|---|---|---|---|
| `baseUrl` | Yes | — | Base URL of the API endpoint |
| `apiKey` | Yes | — | API key (use empty string for no-auth endpoints) |
| `model` | Yes | — | Model name (e.g. "gpt-4o-mini", "llama3.2") |
| `maxTokens` | No | 1024 | Maximum tokens to generate |
| `temperature` | No | 0.2 | Temperature (0–2, low for determinism) |
| `timeoutMs` | No | 30000 | Request timeout in milliseconds |
| `label` | No | auto | Display label for the adapter |

## Availability States

Every adapter explicitly reports one of four availability states:

| State | Meaning |
|---|---|
| `configured_available` | Adapter is configured and backend is reachable |
| `configured_unavailable` | Adapter is configured but backend is unreachable |
| `not_configured` | No configuration provided (e.g. missing API key) |
| `unsupported` | Adapter kind is not recognized or not implemented |

No fake availability. If the backend is down, the system says so.
If credentials are missing, the system says so.

## Session Integration

### New Event Kinds

| Event | When |
|---|---|
| `agent_adapter_resolved` | Adapter resolved from configuration |
| `agent_adapter_status_refreshed` | Adapter availability re-checked |

### Session Summary Fields (Phase 46 additions)

| Field | Type | Description |
|---|---|---|
| `activeAdapterKind` | `string \| null` | Current adapter kind |
| `activeAdapterAvailability` | `string \| null` | Current availability state |
| `activeAdapterIsModelBacked` | `boolean \| null` | Whether adapter uses a real model |
| `activeAdapterModelName` | `string \| null` | Model name if configured |

### Run Metadata

When a run completes, the output includes:
- `isModelGenerated: true/false` — whether the response came from a real model
- `adapterKind` — which adapter produced the output ("stub", "openai_compatible", "echo_test")
- `structuredData.model` — the actual model name from the backend (for openai_compatible)
- `structuredData.totalTokens` — token usage (when available)

## Commands

Two new commands in the `agent_run` category:

| Command | Description |
|---|---|
| `inspect_agent_adapter` | Inspect the current execution adapter status |
| `refresh_agent_adapter_status` | Re-check adapter availability |

These are always available (no session required).

## Honesty and Safety

- If output comes from a stub adapter, it is labeled as such
- If output comes from a real model, the backend name is reported
- No hidden retries or background loops
- No code modification or install behavior
- No autonomous planning or tool-calling within the model execution loop
- System prompts explicitly scope tasks as bounded and read-only

## Usage

```typescript
import {
  resolveAdapter,
  refreshAdapterStatus,
  inspectAdapterStatus,
  dispatchAgentTask,
  inspectAgentRun,
  agentAdapterResolved,
  buildAgentRunSessionSummary,
} from "codingagent-backend/agent-run";

// 1. Resolve adapter
const resolution = await resolveAdapter({
  kind: "openai_compatible",
  openaiConfig: { baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3.2" },
});

if (!resolution.ok) {
  console.error("Adapter not available:", resolution.error.message);
  // Fall back to stub
  const stub = await resolveAdapter({ kind: "stub" });
  // ...
}

// 2. Emit adapter event to session
const event = agentAdapterResolved(resolution.status);
sessionManager.appendEvent(sessionId, event);

// 3. Dispatch a bounded task
const result = await dispatchAgentTask(
  { sessionId, taskKind: "summarize_workspace" },
  { getSessionAgents: () => agents, adapter: resolution.adapter },
);

// 4. Build session summary with adapter info
const summary = buildAgentRunSessionSummary(result, 1, resolution.status);
console.log(`Model-backed: ${summary.activeAdapterIsModelBacked}`);
console.log(`Model: ${summary.activeAdapterModelName}`);

// 5. Refresh adapter status
const refreshed = await refreshAdapterStatus(resolution.adapter, {
  openaiConfig: config,
});
console.log(`Still available: ${refreshed.availability}`);
```

## What Remains Deferred

- **Conversational loop** — multi-turn dialogue management
- **Streaming** — streaming model output to the UI
- **Autonomous orchestration** — multi-agent coordination
- **Code modification** — no editing or writing files
- **Tool-calling** — model-initiated tool use within execution
- **Retry/recovery** — no automatic retry on transient failures
- **Provider marketplace** — only OpenAI-compatible is supported
- **Environment auto-detection** — configuration is always explicit
- **Background execution** — no job queues or background runs
