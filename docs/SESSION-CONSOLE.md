# Chat-like Session Console

Phase 24 introduces a **chat-like session console** that transforms the
previous simple timeline UI into a structured, conversational session feed.

## What It Is

The session console is a **presentation layer** on top of the existing
session event model. It organises session events into a readable feed
that:

- Groups events by **actor** (System, Workspace, MCP Server, Agent,
  Workflow) and **time window**.
- Renders high-value states as **action-oriented cards** (approval
  required, blocked, failure, success, lifecycle, discovery).
- Shows runtime **presence** — which agents, MCP servers, and workspace
  bindings are currently active.
- Supports **filtering** by actor category.
- Preserves and links to all existing **detail views** (host summary,
  recommendations, compatibility, plan review, workflow summary).

## What It Shows

| Element | Description |
|---------|-------------|
| **Status header** | Sticky bar showing current session stage, status, approval/blocked flags, and last significant action. |
| **Presence bar** | Workspace binding status, attached MCP servers (with ready indicators), and attached agents. |
| **Filter bar** | Toggle buttons to filter the feed by actor: All, System, Workspace, MCP, Agent, Workflow. |
| **Console feed** | Grouped messages with actor icons, timestamps, event kind badges, and message text. |
| **Action cards** | Distinct styled cards for approval, blocked, failure, success, lifecycle, and discovery events. |
| **Detail toggles** | Click to expand event detail JSON where present. |
| **Navigation links** | Quick-jump links from action cards to related detail sections (e.g. "View Workflow →"). |

## How It Differs from the Previous Timeline

| Aspect | Previous (Phase 22) | New (Phase 24) |
|--------|---------------------|----------------|
| Layout | Flat chronological list with dots | Grouped conversational feed |
| Actor identity | None | Per-message actor icon, label, CSS class |
| Card types | None | 7 distinct card types for high-value events |
| Presence | Summary grid only | Dedicated presence bar with ready indicators |
| Filtering | None | Actor-based filter bar |
| Navigation | Section nav only | In-card links to detail sections |
| MCP/Agent events | Not in demo | Full lifecycle in demo and real mode |
| Expandable details | None | Click-to-expand event detail JSON |
| Status header | None | Sticky stage/status header |

The original timeline (collapsed by default) and session summary grid are
still rendered below the console for backwards compatibility.

## Architecture

```
┌─ console-helpers.ts ──────────────────────────────┐
│  classifyActor()   → ConsoleActor                 │
│  classifyCard()    → ConsoleCardType              │
│  toConsoleMessage()→ ConsoleMessage               │
│  groupMessages()   → ConsoleMessageGroup[]        │
│  buildPresence()   → ConsoleFeedPresence          │
│  buildConsoleFeed()→ ConsoleFeed                  │
│  buildDemoConsoleFeed() → ConsoleFeed (demo mode) │
│  filterByActor()   → ConsoleMessage[]             │
└───────────────────────────────────────────────────┘
         ↓                        ↓
   Server API               Client-side JS
   /api/session/:id/console  (views.ts inline)
```

### Actor Classification

Every session event kind is mapped to one of five actors:

| Actor | Examples |
|-------|----------|
| **System** | `session_created`, `note`, `info`, `warning` |
| **Workspace** | `workspace_bound`, `workspace_opened`, `clone_*`, `workspace_ready` |
| **MCP** | `mcp_attached`, `mcp_started`, `mcp_discovered_*`, `mcp_failed` |
| **Agent** | `agent_attached`, `agent_enabled`, `agent_failed`, `agent_*` |
| **Workflow** | `catalogs_loaded`, `host_detected`, `workflow_started`, `stage_completed`, `completed`, `blocked`, `failed` |

### Card Types

| Card Type | Trigger Events | Styling |
|-----------|---------------|---------|
| `approval_card` | `requires_approval` | Yellow/amber |
| `blocked_card` | `blocked` | Purple |
| `failure_card` | `failed`, `*_failed`, `workspace_invalid` | Red |
| `success_card` | `completed`, `clone_completed`, `workspace_ready` | Green |
| `lifecycle_card` | `*_attached`, `*_started`, `*_enabled`, `*_stopped` | Blue |
| `discovery_card` | `mcp_discovered_*`, `agent_capabilities_updated` | Grey |
| `message` | All other events | Default |

## API

### `GET /api/session/:id/console`

Returns a complete console feed:

```json
{
  "sessionId": "session-123",
  "messages": [
    {
      "kind": "session_created",
      "timestamp": "2026-01-01T00:00:00.000Z",
      "message": "Session created",
      "category": "info",
      "actor": "system",
      "cardType": "message"
    }
  ],
  "groups": [
    {
      "actor": "system",
      "startTimestamp": "...",
      "endTimestamp": "...",
      "messages": [...]
    }
  ],
  "presence": {
    "sessionStage": "done",
    "sessionStatus": "completed",
    "workspaceStatus": "ready",
    "workspacePath": "/project",
    "mcpServers": [{ "kind": "mcp_server", "id": "srv1", "label": "srv1", "ready": true }],
    "agents": [{ "kind": "agent", "id": "agt1", "label": "agt1", "ready": true }],
    "approvalRequired": false,
    "isBlocked": false,
    "lastSignificantAction": "Session completed successfully"
  }
}
```

## What Remains Missing

Before a full agent session environment, the following are still needed:

- **Full LLM chat loop** — the console is not a conversational AI. It is
  a structured event feed. No free-form message composition exists yet.
- **Command composer** — users cannot type commands or queries.
- **Real-time streaming** — events are loaded via REST polling, not via
  WebSocket or SSE push.
- **Install execution** — no install plan is actually executed. The
  console is informational only.
- **Autonomous agent orchestration** — agents are tracked but do not
  autonomously perform tasks.
- **Conversational memory** — no message threading or context carry-over.
- **Remote/cloud execution** — everything remains local-first.

## Demo Mode

Demo mode now generates a richer timeline that includes:

- Workspace open events
- MCP server attach/start/discover lifecycle
- Agent attach/enable lifecycle
- All workflow stages
- Terminal event matching the scenario status

The console presence bar shows a demo MCP server (`code-assistant`) and
a demo agent (`copilot-agent`) to illustrate the full console experience.

## Testing

Phase 24 adds **112 tests** covering:

- Actor classification for all event kinds
- Card type classification
- Message enrichment (event → console message)
- Message grouping with time windows
- Presence summary building
- Console feed construction
- Demo console feed completeness
- Filter functionality
- HTML structure verification
- CSS class presence
- Client-side JS logic verification
- Demo/real mode coherence
- Mixed event feed scenarios
- Detail view accessibility
- Server API endpoint
