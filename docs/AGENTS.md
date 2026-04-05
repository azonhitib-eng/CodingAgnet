# Attached Agent Registry

Phase 23 introduces first-class attachable agents into the session model.

## What is an Attached Agent?

An **attached agent** is a declared participant in a session that has explicit identity, capabilities, stage affinity, and lifecycle state. Sessions can show which agents are present, what they can do, and how they relate to session stages.

Agents are **not** MCP servers. An agent *may depend on* an MCP server (via `mcpDependency`), but the domains are separate:

| Concept       | Purpose                                     | Module        |
|---------------|---------------------------------------------|---------------|
| MCP Server    | Protocol server providing tools/resources   | `src/mcp/`    |
| Agent         | Session participant with capabilities/roles | `src/agents/` |

An MCP server is infrastructure. An agent is a participant.

## Agent Domain Types

### AgentId
Opaque string identifier for an agent definition.

### AgentKind
Classification of an agent:
- `system` — built-in / platform-provided
- `coding` — local coding / editing agent
- `review` — code review agent
- `planning` — planning / architecture agent
- `testing` — test generation / execution agent
- `external` — third-party or placeholder agent

### AgentStatus
Lifecycle status of an agent definition (independent of session attachment):
- `registered` — definition known, not attached anywhere
- `available` — ready to be attached
- `disabled` — explicitly disabled (not usable)
- `failed` — definition failed validation or init

### AgentCapability
Typed capability flags:
- `planning`
- `reviewing`
- `testing`
- `editing`
- `repo_exploration`
- `mcp_interaction`
- `shell_assistance`
- `session_narration`

### AgentStageAffinity
Session stages an agent can participate in (mirrors `SessionStage`):
- `initializing`, `workspace_binding`, `host_detection`, `workflow_running`, `review`, `done`

### AgentDefinition
Static definition of an agent — id, name, kind, capabilities, allowed stages, optional MCP dependency.

### AgentAttachmentStatus
Status of an agent attachment to a session:
- `pending` → `attached` → `enabled` / `disabled` / `failed` / `detached`

### AgentAttachment
Runtime binding of an agent to a session, tracking lifecycle state, timestamps, and failure/disabled reasons.

### AgentSummary
Aggregated snapshot for frontend consumption — combines definition fields with attachment status.

## Agent Registry

The `AgentRegistry` class provides:

| Method | Description |
|--------|-------------|
| `registerAgent(definition)` | Register an agent definition |
| `getAgent(agentId)` | Get agent record |
| `listAgents()` | List all registered agents |
| `updateAgentStatus(agentId, status, reason?)` | Change agent definition status |
| `attachToSession(agentId, sessionId)` | Attach agent to session |
| `detachFromSession(agentId, sessionId)` | Detach agent from session |
| `enableAgent(agentId, sessionId)` | Enable an attached agent |
| `disableAgent(agentId, sessionId, reason?)` | Disable an attached agent |
| `markAttachmentFailed(agentId, sessionId, reason)` | Mark attachment as failed |
| `notifyCapabilitiesUpdated(agentId, sessionId, caps)` | Emit capabilities-updated event |
| `getAttachment(agentId, sessionId)` | Get attachment record |
| `listSessionAttachments(sessionId)` | List attachments for a session |
| `listAgentAttachments(agentId)` | List all sessions an agent is attached to |
| `getSessionAgentSummaries(sessionId)` | Get agent summaries for a session |
| `clear()` | Clear all state |

## Session Integration

### Session Summary
`SessionSummary` includes:
- `agentCount` — number of agents attached to the session
- `agents` — array of `{ id, label, ready }` for each attached agent

### Session Events
Agent lifecycle events on the session timeline:

| Event Kind | Category | Description |
|-----------|----------|-------------|
| `agent_attach_requested` | warning | Attach requested |
| `agent_attached` | progress | Successfully attached |
| `agent_detached` | failure | Detached from session |
| `agent_enabled` | progress | Enabled within session |
| `agent_disabled` | failure | Disabled within session |
| `agent_failed` | failure | Attachment failed |
| `agent_capabilities_updated` | progress | Capabilities changed |

### Timeline Helpers
All agent event kinds are classified in the timeline helper (`classifyEvent()`) for UI rendering.

## Session Event Helpers

| Helper | Description |
|--------|-------------|
| `AGENT_EVENT_KINDS` | All 7 agent event kind strings |
| `isAgentEvent(kind)` | Check if a kind is an agent event |
| `filterAgentEvents(events)` | Filter to agent events only |
| `buildAgentEventSummary(events)` | Summarize by attached/detached/enabled/disabled/failed |

## Package Export

```ts
import { AgentRegistry, type AgentDefinition } from "codingagent-backend/agents";
```

Subpath: `./agents`

## What is Implemented Now

- Agent domain types (10 types)
- Agent registry with registration, attach/detach, enable/disable, failure marking
- Session integration with events and summary exposure
- Timeline classification for all agent events
- Comprehensive tests (106 tests)

## What is Deferred

| Feature | Status |
|---------|--------|
| Autonomous task delegation/routing | Not implemented — future phase |
| Multi-agent orchestration | Not implemented — future phase |
| Agent execution engine | Not implemented — no execution layer |
| Chat UI / message routing | Not implemented — no chat layer |
| Agent marketplace / discovery | Not implemented — future phase |
| Background job management | Not implemented — local-first only |
| Remote/cloud agent deployment | Not implemented — local-first only |

## How This Moves Toward a Session-Oriented Agent Platform

This phase establishes the foundational model:

1. **Sessions know their agents** — explicit attachment, not implicit inference
2. **Agents have typed capabilities** — deterministic, not free-form
3. **Agents have stage affinity** — relates agents to session workflow stages
4. **Agent lifecycle is event-driven** — timeline shows agent activity
5. **Agents are separate from MCP** — clean domain boundary
6. **Agent summaries are frontend-ready** — shell can render agent panels

The next phases can build on this to add:
- Agent routing and task delegation
- Agent-to-agent communication
- Agent management UI in the shell
- Dynamic agent discovery and marketplace
