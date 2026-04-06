# Minimal Agent Execution & Task Dispatch

**Phase 45** — `src/agent-run/`

## Overview

This module provides bounded, explicit agent execution:
select an attached agent, assemble context, dispatch a task,
and capture the result in the session.

**What this is:**
- Bounded task dispatch — execute small, explicit tasks with traceability
- Deterministic agent selection — explicit ID or best-fit scoring
- Execution adapter boundary — pluggable, honest about what is real vs stubbed
- Session-integrated — events, summaries, and console-ready results

**What this is NOT:**
- Autonomous multi-agent orchestration
- A free-form conversational LLM chat engine
- Code modification or install execution
- Hidden retry loops or background jobs
- Optimal prompt engineering

## Architecture

```
┌─────────────────────────────────────────────┐
│            dispatchAgentTask()               │
│                                             │
│  1. Validate input                          │
│  2. Select agent (explicit or best-fit)     │
│  3. Assemble context (via agent-context)    │
│  4. Execute via adapter                     │
│  5. Capture result + emit session events    │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┼──────────────┐
    ▼          ▼              ▼
 Selection  Context        Adapter
 (scoring)  Assembly       (stub/real)
    │        (Phase 44)       │
    ▼          ▼              ▼
 AgentSummary  AgentPrompt   AgentRunOutput
 + reason      Context       (response text,
                             adapter kind,
                             model-generated?)
```

## Task Kinds

| Kind | Description |
|------|------------|
| `summarize_workspace` | Summarize current workspace context |
| `review_diagnostics` | Review diagnostics and toolchain state |
| `explain_files` | Explain relevant files and modules |
| `summarize_github` | Summarize GitHub MCP results |
| `general_query` | Bounded free-text question about the repo |
| `custom` | Custom bounded task (requires description) |

## Agent Selection

### By Explicit ID

If `targetAgentId` is provided, that specific agent is used.
Fails if the agent is not found or not eligible.

### By Best-Fit

When no explicit ID is given, agents are scored:
- **Base score**: agent routing priority (0–100, default 50)
- **+30**: agent kind matches `preferredAgentKind`
- **+20**: role hint matches `preferredRoleHint`
- **+10**: agent's allowed stages include `preferredStage`
- **Tie-breaking**: alphabetical by agent ID for determinism

Selection is deterministic: same inputs → same output.

### Selection Reasons

Every selection produces an `AgentRunSelectionReason`:
- `method`: "explicit_id" | "best_fit" | "only_eligible"
- `explanation`: human-readable description
- `eligibleCount`: how many agents were eligible

## Execution Adapters

The `AgentExecutionAdapter` interface provides a pluggable boundary:

```typescript
interface AgentExecutionAdapter {
  readonly kind: string;            // "stub", "local", "api"
  readonly isModelBacked: boolean;  // true for real models
  execute(request: AgentRunRequest): Promise<AgentRunOutput>;
}
```

### StubExecutionAdapter

The default adapter produces deterministic, template-based responses.
It is honest: responses are clearly marked as non-model-generated.

Useful for:
- Testing the full pipeline
- Demo mode
- Verifying context assembly and dispatch

### Future Adapters

The interface is ready for real model-backed adapters:
- `local` — local model execution
- `api` — remote API-backed execution

## Status Lifecycle

```
pending → selecting → context_assembling → executing → completed
                                                    ↘ failed
         selecting → failed  (no eligible agent)
                   → context_assembling → failed  (assembly error)
                                       → executing → failed  (adapter error)
```

## Session Integration

### Event Kinds

| Event | When |
|-------|------|
| `agent_run_requested` | Task dispatch requested |
| `agent_run_started` | Agent selected, execution starting |
| `agent_run_completed` | Task completed successfully |
| `agent_run_failed` | Task failed at any stage |

### Session Summary

`AgentRunSessionSummary` exposes:
- Whether any run has been executed
- Last run ID, status, agent kind, task kind
- Adapter kind and whether model-generated
- Duration and error code
- Total run count

## Commands

Two commands in the `agent_run` category:

| Command | Description |
|---------|-------------|
| `run_agent_task` | Execute a bounded agent task |
| `inspect_agent_run` | Inspect the last or specific run |

## Usage

```typescript
import { dispatchAgentTask, StubExecutionAdapter, inspectAgentRun } from "codingagent-backend/agent-run";

const result = await dispatchAgentTask(
  {
    sessionId: "sess-001",
    taskKind: "summarize_workspace",
    preferredAgentKind: "planning",
  },
  {
    getSessionAgents: (sessionId) => registry.getSessionAgentSummaries(sessionId),
    adapter: new StubExecutionAdapter(),
  },
);

if (result.status === "completed") {
  console.log(result.output.responseText);
  console.log(`Selected: ${result.request.agentName} via ${result.request.selectionReason.method}`);
}

// Inspect the result
console.log(inspectAgentRun(result));
```

## Honesty and Safety

- This is **bounded** agent execution, not autonomous orchestration
- No hidden retries or background loops
- No code modification or install execution
- If the execution backend is stubbed, responses are clearly marked
- The `isModelGenerated` flag distinguishes real vs stub output
- All decisions (selection, context, execution) are traceable

## What Remains Deferred

- **Model-backed adapters** — real LLM execution adapters
- **Conversational loop** — multi-turn dialogue management
- **Autonomous orchestration** — multi-agent coordination
- **Code modification** — no editing or writing files
- **Streaming** — no streaming output
- **Retry/recovery** — no automatic retry on failure
- **Background execution** — no job queues or background runs
