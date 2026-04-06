# Execution Adapter Wiring — Phase 48

End-to-end execution adapter wiring and shell agent run path.

## What Changed

Phase 48 closes the remaining gap between:

- Model-backed adapter support (Phase 46)
- Command execution (Phase 45)
- Server wiring
- Shell visibility (Phase 47)

The shell can now actually perform bounded agent runs end-to-end.

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     Shell / Console                        │
│  (commands, cards, events, adapter status display)         │
└──────────────────────┬────────────────────────────────────┘
                       │ POST /api/commands/execute
┌──────────────────────▼────────────────────────────────────┐
│                  Command Executor                           │
│  executeCommand → dispatchCommand → deps.runAgentTask       │
│  executeCommand → dispatchCommand → deps.inspectAgentAdapter│
│  executeCommand → dispatchCommand → deps.refreshAdapter...  │
│  executeCommand → dispatchCommand → deps.inspectAgentRun    │
└──────────────────────┬────────────────────────────────────┘
                       │ buildCommandExecutorDeps()
┌──────────────────────▼────────────────────────────────────┐
│              Server Adapter State                           │
│  (env-config → resolveAdapter → cache adapter/status)       │
│  buildRunAgentTaskDep()                                     │
│  buildInspectAgentAdapterDep()                              │
│  buildRefreshAgentAdapterStatusDep()                        │
│  buildInspectAgentRunDep()                                  │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Agent Run Dispatch                              │
│  dispatchAgentTask(input, deps)                             │
│  → validate → select agent → assemble context → execute     │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Execution Adapter                              │
│  StubExecutionAdapter | EchoTestAdapter | OpenAIAdapter     │
└───────────────────────────────────────────────────────────┘
```

## New Files

### `src/agent-run/env-config.ts`

Environment-based adapter configuration loader.

Environment variables (all prefixed `AGENT_ADAPTER_`):

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENT_ADAPTER_KIND` | Yes | Adapter kind: `stub`, `echo_test`, or `openai_compatible` |
| `AGENT_ADAPTER_OPENAI_BASE_URL` | For openai_compatible | API base URL |
| `AGENT_ADAPTER_OPENAI_API_KEY` | For openai_compatible | API key (empty string for no-auth) |
| `AGENT_ADAPTER_OPENAI_MODEL` | For openai_compatible | Model name |
| `AGENT_ADAPTER_OPENAI_MAX_TOKENS` | Optional | Max tokens |
| `AGENT_ADAPTER_OPENAI_TEMPERATURE` | Optional | Temperature (0–2) |
| `AGENT_ADAPTER_OPENAI_TIMEOUT_MS` | Optional | Timeout in ms |
| `AGENT_ADAPTER_OPENAI_LABEL` | Optional | Display label |

Configuration states:

- **not_configured**: No env vars set → falls back to stub adapter
- **partially_configured**: Some vars set but incomplete → falls back to stub
- **configured**: All required vars present → resolves the specified adapter

### `src/agent-run/server-adapter-state.ts`

Server-level adapter state management:

- Lazy resolution on first use
- Cached adapter + status for subsequent commands
- Dependency builders for command executor integration
- Session event emission on resolve/refresh/run

## Commands Wired End-to-End

| Command | Status | Description |
|---------|--------|-------------|
| `run_agent_task` | ✅ Fully wired | Select agent → assemble context → execute → return result |
| `inspect_agent_adapter` | ✅ Fully wired | Reports adapter kind, availability, config, run counts |
| `refresh_agent_adapter_status` | ✅ Fully wired | Re-checks adapter availability, emits session event |
| `inspect_agent_run` | ✅ Fully wired | Reports last run result in human-readable form |

## Adapter Configuration

### Using Environment Variables

```bash
# Local Ollama
export AGENT_ADAPTER_KIND=openai_compatible
export AGENT_ADAPTER_OPENAI_BASE_URL=http://localhost:11434/v1
export AGENT_ADAPTER_OPENAI_API_KEY=""
export AGENT_ADAPTER_OPENAI_MODEL=llama3.2

# OpenAI
export AGENT_ADAPTER_KIND=openai_compatible
export AGENT_ADAPTER_OPENAI_BASE_URL=https://api.openai.com/v1
export AGENT_ADAPTER_OPENAI_API_KEY=sk-...
export AGENT_ADAPTER_OPENAI_MODEL=gpt-4o-mini

# Echo test (for development)
export AGENT_ADAPTER_KIND=echo_test

# Stub / demo mode (default when nothing is set)
export AGENT_ADAPTER_KIND=stub
```

### Default Behavior

When no environment variables are set, the server falls back to the **stub adapter**:

- Deterministic, template-based responses
- Explicitly marked as non-model-generated
- No network calls
- Demo-safe

## Bounded Agent Runs

What they can do:

- Select an attached agent from the session
- Assemble agent context from available session data
- Execute a bounded task (summarize, review, explain, query)
- Return the result with metadata (adapter kind, model-backed, duration)
- Emit session events for the full lifecycle
- Reflect results in shell/console cards

What they **cannot** do (yet):

- Multi-turn conversation
- Tool calling inside agent runs
- Autonomous follow-up loops
- Code modification
- Streaming output

## Failure Clarity

The shell clearly distinguishes:

| Failure Type | Error Message Pattern |
|-------------|----------------------|
| Not configured | `"No adapter environment variables detected."` |
| Partially configured | `"Partial configuration: missing..."` |
| Configured but unavailable | `"OpenAI-compatible backend is not reachable..."` |
| Invalid config | `"Invalid OpenAI adapter configuration..."` |
| No eligible agent | `"Agent selection failed: ..."` |
| Context assembly error | `"Context assembly failed: ..."` |
| Runtime execution error | `"Adapter execution failed: ..."` |
| Invalid task | `"Invalid task: ..."` |
| No active session | `"No active session."` |

## What Remains Deferred

- **Streaming output**: Not yet implemented. Responses are returned in full.
- **Multi-turn conversation loop**: Not yet. Each run is bounded and stateless.
- **Autonomous orchestration**: Not yet. No hidden retries or follow-up.
- **Tool calling inside agent runs**: Not yet. Adapter produces text only.
- **Code modification**: Not supported. Agent output is read-only text.
- **Provider auto-discovery**: Not implemented. Configuration is explicit.
- **Background health checks**: Not implemented. Refresh is on-demand only.
- **Multiple adapters**: One active adapter at a time per server instance.
