# Agent Routing and Stage Participation

Phase 27 of the coding-agent platform.

## Overview

Agent routing determines which attached agents are **eligible**, **preferred**,
or **skipped** for each session stage.  It is a read-only, deterministic
evaluation layer — it does **not** execute tasks, delegate work, or orchestrate
agents autonomously.

### What it is

- A capability-to-stage mapping
- A participation model that evaluates agent eligibility per stage
- Session events for routing visibility
- Enriched session summaries for frontend consumption

### What it is NOT

- Autonomous multi-agent orchestration
- Smart delegation or planning
- An execution engine
- A background job system

## Architecture

```
┌─────────────────────┐
│  Agent Definitions   │  (id, name, kind, capabilities, allowedStages, routing)
├─────────────────────┤
│  AgentRoutingMeta    │  (roleHint, preferredStages, routingPriority, participationEnabled)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Capability→Stage   │  CAPABILITY_STAGE_MAP — deterministic mapping
│  Mapping            │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Participation      │  evaluateAgentForStage()
│  Model              │  evaluateStageParticipation()
│                     │  evaluateAllStages()
│                     │  getEligibleAgents() / getPreferredAgents() / getSkippedAgents()
│                     │  getTopAgent()
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Session Summary    │  Agents array enriched with routing metadata
│  & Events           │  4 new event kinds for routing visibility
└─────────────────────┘
```

## Types

### AgentRoleHint

High-level role hint for an agent:

| Value         | Description                  |
| ------------- | ---------------------------- |
| `planner`     | Planning / architecture      |
| `reviewer`    | Code review                  |
| `tester`      | Testing                      |
| `editor`      | Code editing                 |
| `explorer`    | Repository exploration       |
| `mcp_bridge`  | MCP-assisted tasks           |
| `narrator`    | Session narration / system   |
| `general`     | General-purpose              |

### AgentRoutingMeta

Optional routing metadata on an `AgentDefinition`:

```typescript
interface AgentRoutingMeta {
  roleHint?: AgentRoleHint;
  preferredStages?: readonly AgentStageAffinity[];
  routingPriority?: number;       // 0–100, default 50
  participationEnabled?: boolean;
}
```

### StageParticipation

Evaluation of one agent for one stage:

```typescript
interface StageParticipation {
  agentId: AgentId;
  stage: AgentStageAffinity;
  eligible: boolean;
  preferred: boolean;
  reasons: readonly ParticipationReason[];
  priority: number;
  matchingCapabilities: readonly AgentCapability[];
}
```

### ParticipationReason

Why an agent was considered eligible or ineligible:

| Reason                    | Meaning                                   |
| ------------------------- | ----------------------------------------- |
| `allowed_stage`           | Stage is in the agent's allowedStages     |
| `preferred_stage`         | Stage is in the agent's preferredStages   |
| `capability_match`        | Agent has a capability mapped to the stage |
| `not_allowed`             | Stage is not in allowedStages             |
| `disabled`                | Attachment is disabled                    |
| `unavailable`             | Attachment status is not active           |
| `failed`                  | Attachment failed                         |
| `detached`                | Agent is detached                         |
| `participation_disabled`  | Routing participation explicitly disabled |

## Capability → Stage Mapping

The `CAPABILITY_STAGE_MAP` defines which capabilities are relevant to which stages:

| Capability          | Stages                                                              |
| ------------------- | ------------------------------------------------------------------- |
| `planning`          | initializing, workflow_running                                      |
| `reviewing`         | review, done                                                        |
| `testing`           | workflow_running, review                                            |
| `editing`           | workspace_binding, workflow_running                                 |
| `repo_exploration`  | initializing, workspace_binding                                     |
| `mcp_interaction`   | initializing, workspace_binding, host_detection, workflow_running, review |
| `shell_assistance`  | all stages                                                          |
| `session_narration` | all stages                                                          |

## Participation Functions

### Core evaluation

- `evaluateAgentForStage(agent, stage)` — single agent, single stage
- `evaluateStageParticipation(agents, stage, preferredStagesMap?)` — all agents for one stage
- `evaluateAllStages(agents, preferredStagesMap?)` — all agents across all stages

### Convenience queries

- `getEligibleAgents(agents, stage)` — eligible agents sorted by priority
- `getPreferredAgents(agents, stage, preferredStagesMap)` — preferred agents only
- `getSkippedAgents(agents, stage)` — ineligible agents
- `getTopAgent(agents, stage)` — highest-priority eligible agent

### Helpers

- `buildPreferredStagesMap(definitions)` — extract preferred stages from definitions
- `stagesForCapability(cap)` — stages a capability maps to
- `capabilitiesForStage(stage)` — capabilities relevant to a stage
- `isCapabilityRelevant(cap, stage)` — check relevance

## Session Events

Four new event kinds:

| Event Kind                            | When                                |
| ------------------------------------- | ----------------------------------- |
| `agent_routing_evaluated`             | Routing evaluated for a stage       |
| `agent_stage_participation_updated`   | Agent's participation status changed |
| `agent_skipped_for_stage`             | Agent skipped for a stage           |
| `agent_selected_for_stage`            | Agent selected for a stage          |

## Session Summary

The `SessionSummary.agents` array now includes optional routing metadata:

```typescript
agents: ReadonlyArray<{
  id: string;
  label: string;
  ready: boolean;
  roleHint?: string;           // Phase 27
  routingPriority?: number;    // Phase 27
  participationEnabled?: boolean; // Phase 27
  allowedStages?: readonly string[]; // Phase 27
}>
```

Pass `agentSummaries` to `getSessionSummary()` to populate these fields.

## Routing honesty

All routing decisions are:

- **Deterministic**: same inputs → same outputs
- **Explicit**: based on declared capabilities, allowed stages, and enabled state
- **Traceable**: each decision includes reasons and matching capabilities
- **Honest**: no fake intelligence or hidden heuristics

The routing model does **not** claim to:
- Autonomously delegate work to agents
- Make intelligent scheduling decisions
- Replace human judgment about agent selection

## Deferred to later phases

- Autonomous multi-agent orchestration
- Agent task execution
- Background job scheduling
- Remote/cloud agent coordination
- Full agent management UI
- Plugin marketplace or dynamic agent loading

## Files

| File                              | Description                                |
| --------------------------------- | ------------------------------------------ |
| `src/agents/types.ts`             | Extended with routing types                |
| `src/agents/stage-routing.ts`     | Capability → stage mapping                 |
| `src/agents/participation.ts`     | Participation model functions              |
| `src/agents/session-integration.ts` | 4 new routing event factories            |
| `src/agents/agent-registry.ts`    | Summaries include routing metadata         |
| `src/agents/index.ts`             | Updated barrel exports                     |
| `src/session/types.ts`            | 4 new event kinds                          |
| `src/session/session-manager.ts`  | Summary enrichment with routing metadata   |
| `src/app-shell/console-helpers.ts` | New events classified for console         |
| `src/app-shell/timeline-helpers.ts` | New events classified for timeline       |
