# Adapter Display & Agent Output Rendering

> Phase 47 — Shell/console adapter status display and agent output rendering.

## Overview

Phase 47 makes the execution layer visible and trustworthy in the desktop app and shell.
Before this phase, the backend had complete adapter resolution, availability checking,
and agent run output — but none of it was rendered in the UI.

Now the console clearly shows:
- Which adapter is active (stub, OpenAI-compatible, echo test)
- Whether it is real (model-backed) vs stub/echo
- Whether it is configured, available, unavailable, or not configured
- What the last agent run produced (output preview with metadata)
- What failed, if anything (structured error cards)

## What the Shell Shows About Adapters

### Presence Bar — Adapter Status

The console presence bar includes an **Adapter** section when an adapter is active:

```
🧠 Adapter: [Stub (Demo)] [Available] [Stub (Not Model Output)]
```

For a configured OpenAI adapter:

```
🧠 Adapter: [OpenAI-Compatible API] [Available] [Model-Backed] gpt-4o-mini
```

For an unavailable adapter:

```
🧠 Adapter: [OpenAI-Compatible API] [Unavailable] [Model-Backed]
```

Badges use color coding:
- **Green** — Model-backed / Available
- **Yellow** — Stub / Echo test
- **Red** — Unavailable
- **Gray** — Not configured

### Timeline Events

Two new event kinds are now classified and rendered:

| Event | Category | Card Type | Actor |
|-------|----------|-----------|-------|
| `agent_adapter_resolved` | progress | lifecycle_card | agent |
| `agent_adapter_status_refreshed` | info | lifecycle_card | agent |

### Adapter Resolved Card

When an adapter is resolved, the console shows a compact status bar:

```
🧠 Adapter Resolved  [Stub (Demo)]  [Available]  [Stub (Not Model Output)]
```

## How Bounded Agent Output Is Rendered

### Successful Run — Agent Output Card

When an agent run completes, the console renders a dedicated output card:

```
┌─────────────────────────────────────────────────┐
│ copilot — summarize_workspace  [Stub Output]    │
│ [Stub (Demo)]                                   │
├─────────────────────────────────────────────────┤
│ [Stub] Workspace summary for demo project:      │
│ This is a deterministic demo response...        │
├─────────────────────────────────────────────────┤
│ 🕒 10:30:45 AM  ⏱ 42ms  ID: demo-run │
└─────────────────────────────────────────────────┘
```

The card includes:
- Agent name and task kind
- **Model Output** / **Stub Output** / **Echo Test Output** badge (honest labeling)
- Adapter kind label
- Output preview in a monospace block
- Timestamp, duration, and run ID metadata

### Failed Run — Error Card

When an agent run fails:

```
┌─────────────────────────────────────────────────┐
│ ❌ Agent Run Failed                              │
│ EXECUTION_FAILED — Backend unreachable           │
│ 🕒 10:30:45 AM  ID: run-err                     │
└─────────────────────────────────────────────────┘
```

## How to Tell Stub vs Real Execution Apart

The UI uses three distinct visual indicators:

| Adapter Kind | Badge Text | Badge Color | isModelBacked |
|-------------|-----------|-------------|---------------|
| `stub` | "Stub Output" | Yellow | false |
| `echo_test` | "Echo Test Output" | Blue | false |
| `openai_compatible` | "Model Output" | Green | true |

### Presence Bar Labels

| State | Label |
|-------|-------|
| Model-backed adapter | "Model-Backed" (green) |
| Stub adapter | "Stub (Not Model Output)" (yellow) |
| Echo test adapter | "Echo Test (Not Model Output)" (blue) |

### Availability Labels

| State | Label | Color |
|-------|-------|-------|
| `configured_available` | "Available" | Green |
| `configured_unavailable` | "Unavailable" | Red |
| `not_configured` | "Not Configured" | Gray |
| `unsupported` | "Unsupported" | Gray |

## Demo Mode

Demo mode includes adapter and agent run events in the console feed:
1. Adapter resolved (stub, configured & available)
2. Agent run requested (summarize_workspace)
3. Agent run started (copilot-agent selected via best_fit)
4. Agent run completed (stub output with preview)

This demonstrates the full rendering pipeline without requiring a real backend.

## What Remains Deferred

The following are explicitly **not** part of this phase:

- **Streaming output** — Real-time token-by-token rendering
- **Multi-turn conversation** — Chat loop with memory
- **Autonomous orchestration** — Multi-agent loops or retry logic
- **Install execution** — Actually running install plans
- **Full chat UI** — Input box + message history UI
- **Background job queues** — Async task processing
- **Global config system** — Centralized adapter/model configuration

## Files

| File | Role |
|------|------|
| `src/app-shell/timeline-helpers.ts` | Event classification for adapter events |
| `src/app-shell/console-helpers.ts` | Actor/card mapping + adapter presence |
| `src/app-shell/views.ts` | CSS + JS for adapter status, output cards, error cards |
| `tests/app-shell/phase47-adapter-display.test.ts` | 81 tests |
| `docs/ADAPTER-DISPLAY.md` | This document |
