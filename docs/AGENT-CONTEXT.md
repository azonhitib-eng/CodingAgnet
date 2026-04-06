# Context-Informed Agent Prompting

**Phase 44** — `src/agent-context/`

## Overview

This module provides deterministic, inspectable context assembly for
agent-facing prompts. It turns the existing structured
repo/workspace/session intelligence into explicit context packets that
an agent can use to understand its working environment.

**What this is:**
- Context preparation — assembling relevant, prioritized information
  from existing structured summaries
- Deterministic and explainable — same inputs always produce the same
  outputs, every inclusion/exclusion has a reason
- Budget-aware — never dumps everything, respects explicit char/slice
  limits

**What this is NOT:**
- A full free-form conversational LLM chat loop
- Autonomous agent execution or reasoning
- Hidden prompt magic with no traceability
- Optimal prompt engineering (we are honest about limitations)
- Install execution or background job orchestration

## Architecture

```
┌─────────────────────────────────────────────┐
│              assembleAgentContext()          │
│                                             │
│  1. Collect candidate slices from sources   │
│  2. Adjust priorities for agent role        │
│  3. Apply budget constraints                │
│  4. Build inspectable result + summary      │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┼──────────────┐
    ▼          ▼              ▼
 Slice     Priority        Budget
 Builders  Adjustment      Control
    │          │              │
    ▼          ▼              ▼
 9 Sources  Role-based    Trimming,
 (session,  overrides     max chars,
  workspace, per agent    max slices,
  profile,   kind/role    min priority
  toolchain,
  diagnostics,
  language context,
  MCP, agents,
  GitHub MCP)
```

## Context Slice Sources

The system can derive context from these structured summaries:

| Source | Slice ID | What it provides |
|--------|----------|-----------------|
| Session | `session_summary` | Session ID, stage, status, workspace path |
| Workspace | `workspace_summary` | Workspace path, source, branch, git info |
| Fingerprint/Profile | `fingerprint_profile` | Detected languages, frameworks, selected profile |
| Toolchain | `toolchain_summary` | Available checks (lint, test, build), toolchain kind |
| Diagnostics | `diagnostics_summary` | Error/warning counts, sample messages |
| Language Context | `language_context` | Entrypoints, config files, test files, notable symbols, modules |
| MCP | `mcp_summary` | Attached MCP servers, tool availability |
| Agents | `agents_summary` | Attached agents and their statuses |
| GitHub MCP | `github_mcp_summary` | GitHub MCP integration status |

Each slice carries:
- **Priority** — critical, high, medium, low, or excluded
- **Reasons** — why it was included or excluded
- **Evidence** — what data supports the slice
- **Text content** — compact, renderable text representation
- **Structured content** — typed key-value data

## How Prioritization Works

### Priority Levels

1. **Critical** — Must be included if available (e.g., profile identity for a planning agent)
2. **High** — Strongly recommended (e.g., entrypoints, severe diagnostics)
3. **Medium** — Useful but trimmable (e.g., module listing, optional tools)
4. **Low** — Nice-to-have (e.g., detailed symbol lists, informational diagnostics)
5. **Excluded** — Explicitly excluded from this assembly

### Role-Based Priority Adjustment

Different agent kinds get different priority profiles:

| Agent Kind | Critical Sources | High Sources | Lower Sources |
|-----------|-----------------|-------------|---------------|
| **planning** | fingerprint/profile, workspace | toolchain, language context | diagnostics, MCP, agents |
| **coding** | language context, workspace | fingerprint, diagnostics, toolchain | MCP |
| **review** | diagnostics, toolchain | language context, fingerprint | MCP, GitHub MCP |
| **testing** | toolchain, language context | diagnostics, fingerprint | MCP, GitHub MCP |
| **system** | session, workspace, MCP, agents | GitHub MCP | fingerprint, toolchain |

Role hints (e.g., `planner`, `editor`, `reviewer`) can further refine priorities.

### Budget Control

The `AgentPromptBudget` enforces:
- Maximum total characters across all slices
- Maximum number of slices
- Maximum characters per individual slice
- Minimum priority level
- Maximum files/symbols/diagnostics to list

Default budget: 8000 total chars, 15 slices, 2000 chars/slice, min priority "low".

### Trimming

When a slice exceeds its character budget:
1. The text is truncated with a `... (trimmed)` marker
2. The `trimmed` flag is set to `true`
3. The `originalCharCount` preserves the pre-trim size
4. All other metadata (reasons, evidence) is preserved

## Traceability

Every context assembly result is fully inspectable:

- **Per-slice reasons**: Each slice has explicit reasons for inclusion/exclusion
- **Evidence**: Each slice has supporting evidence (source, description, reference)
- **Compact explanations**: `buildCompactExplanation()` produces multi-line human-readable output
- **One-liner summaries**: `buildOneLinerSummary()` for quick display
- **Full inspection**: `inspectAssembly()` produces a detailed report
- **Lookup helpers**: `findSlice()`, `getSliceReasons()`, `getSliceEvidence()`, `getSlicesBySource()`

## Commands

Three new commands are available in the `agent_context` category:

| Command | Description |
|---------|-------------|
| `inspect_agent_context` | Inspect the assembled context for a specific agent kind |
| `build_agent_prompt_context` | Assemble a full agent prompt context packet |
| `refresh_agent_context` | Re-assemble agent context using latest data |

## Session Integration

### Event Kinds

- `agent_context_assembled` — context was assembled for an agent
- `agent_context_refreshed` — context was re-assembled with updated data
- `agent_context_failed` — context assembly failed

### Session Summary

The `AgentContextSessionSummary` provides:
- Whether context has been assembled
- Which agent kind it was assembled for
- Profile used
- Slice counts and char totals
- Contributing sources
- Whether any slices were trimmed

## Usage

```typescript
import { assembleAgentContext, inspectAssembly } from "codingagent-backend/agent-context";

const context = assembleAgentContext({
  agentKind: "planning",
  roleHint: "planner",
  sessionSummary: { id: "sess-001", stage: "workspace_binding", status: "active" },
  workspaceSummary: { path: "/repos/my-project", source: "local_existing" },
  fingerprintSummary: { languages: ["typescript"], frameworks: [{ name: "node" }] },
  profileSelection: { primary: { id: "typescript-node", label: "TypeScript/Node" } },
  toolchainSummary: { toolchainKind: "npm", commands: [...] },
  // ... other summaries
  budget: { maxTotalChars: 4000, maxSlices: 10 },
});

// Use the assembled text
console.log(context.assembledText);

// Inspect the assembly
console.log(inspectAssembly(context.assembly));

// Check why a slice was included or excluded
const reasons = getSliceReasons(context.assembly, "diagnostics_summary");
```

## What Remains Deferred

Before a full conversational/agent execution layer:
- **Agent execution engine** — this module provides context, not execution
- **LLM integration** — no model calls are made; this is pure context assembly
- **Conversational loop** — no chat or dialogue management
- **Autonomous orchestration** — no multi-agent coordination
- **Prompt optimization** — no A/B testing or model-specific tuning
- **Streaming** — no streaming context assembly
- **Caching** — no context caching across sessions
