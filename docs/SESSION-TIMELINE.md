# Session Timeline UI

Phase 22 adds a structured session timeline and summary panel to the CodingAgent app shell, making session events and state progression visible.

## What the session timeline shows

The timeline renders a chronological list of **session events** — typed messages produced by the session manager during workspace operations, workflow execution, MCP lifecycle, and other domain activities.

Each event in the timeline shows:

- **Timestamp** — when the event occurred
- **Event kind** — the typed event identifier (e.g. `stage_completed`, `mcp_attached`)
- **Message** — a human-readable description
- **Visual category** — a colored dot indicating the event's semantic type

## Event categories

Events are classified into **5 semantic categories**, each with a distinct visual style:

| Category     | Color  | Icon | Examples                                                              |
|-------------|--------|------|-----------------------------------------------------------------------|
| **info**     | Blue   | ℹ️   | `session_created`, `note`, `info`, `catalogs_loaded`                 |
| **progress** | Green  | ✅   | `workspace_opened`, `stage_completed`, `mcp_started`, `completed`    |
| **warning**  | Yellow | ⚠️   | `warning`, `requires_approval`, `mcp_attach_requested`               |
| **blocked**  | Purple | 🚫   | `blocked`                                                             |
| **failure**  | Red    | ❌   | `failed`, `workspace_invalid`, `clone_failed`, `mcp_failed`         |

## Session summary panel

A compact grid showing at-a-glance session metadata:

- **Session ID** — unique identifier
- **Status** — active, completed, blocked, failed, idle
- **Stage** — initializing, workspace_binding, host_detection, workflow_running, review, done
- **Workspace** — current workspace status
- **Path** — workspace directory path (if bound)
- **Source** — how the workspace was sourced (local_existing, cloned, demo)
- **Git Repo** — whether the workspace is a git repository
- **Remote** — git remote URL (if available)
- **Branch** — current git branch (if available)
- **MCP Servers** — number of attached MCP servers
- **Events** — total event count
- **Approval** — whether approval is currently required
- **Blocked** — whether the session is blocked
- **Last Error** — most recent error message (if any)

## Demo vs. real mode

### Demo mode
In demo mode, the timeline renders **synthetic events** generated client-side to illustrate a typical session flow. This includes session creation, workspace binding, catalog loading, host detection, workflow stages, and a terminal event matching the scenario's workflow status.

### Real mode
In real mode, the timeline fetches **actual session events** from the server API. Events are produced during workspace open/clone operations and workflow runs.

## API endpoints

| Method | Path                           | Description                                  |
|--------|-------------------------------|----------------------------------------------|
| GET    | `/api/session/current`         | Latest session summary + classified events   |
| GET    | `/api/session/:id/summary`     | Session summary for a specific session       |
| GET    | `/api/session/:id/timeline`    | Session events with `category` classification|

### Response shapes

#### GET /api/session/current
```json
{
  "sessionId": "session-...",
  "summary": { "id": "...", "status": "active", "stage": "...", ... },
  "events": [
    { "kind": "session_created", "timestamp": "...", "message": "...", "category": "info" },
    ...
  ]
}
```

When no sessions exist:
```json
{ "sessionId": null, "summary": null, "events": [] }
```

#### GET /api/session/:id/timeline
```json
{
  "sessionId": "session-...",
  "events": [
    { "kind": "workspace_opened", "timestamp": "...", "message": "...", "category": "progress" },
    ...
  ]
}
```

## What is still missing before a true chat-like agent console

The session timeline is a **foundational step** toward an interactive agent console. The following are NOT yet implemented:

1. **Chat UI** — no conversational interface; the timeline is read-only
2. **Real-time streaming** — no live event push; timeline is populated on fetch
3. **Agent registry** — no registry of available agents; only MCP server attachment visibility
4. **Interactive filtering** — no filtering/search within the timeline
5. **Install execution** — plans are informational only; no execution capability
6. **Multi-agent orchestration** — no autonomous agent coordination
7. **Background jobs** — no long-running task tracking
8. **Remote/cloud sessions** — local-first only
9. **Persistent session history** — sessions are in-memory only

These items are left to future phases.
