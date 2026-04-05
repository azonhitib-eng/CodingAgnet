# Session Persistence

Phase 25 introduces local-first session persistence, enabling sessions to
survive process restarts and appear in a recent-sessions list.

## What Is Persisted

| Data                    | Persisted?  | Notes                                                       |
| ----------------------- | ----------- | ----------------------------------------------------------- |
| Session metadata        | ✅ Yes      | id, timestamps, stage, status                               |
| Workspace binding       | ✅ Yes      | path, source, branch, clone URL, repo metadata              |
| Event timeline          | ✅ Yes      | full event array — kind, timestamp, message, detail payload |
| Run context             | ✅ Partial  | stage, status, flags preserved; opaque `workflowResultRef` is **not** preserved |
| Attached resources list | ✅ Yes      | kind, id, label are saved                                   |
| Resource runtime state  | ❌ No       | `ready` is always `false` on restore — see below            |
| Workflow result object  | ❌ No       | the full `WorkflowResult` is runtime-only                   |
| In-memory session map   | ❌ No       | `SessionManager` map is still ephemeral                     |

## What Is NOT Persisted

- **MCP server processes** — MCP servers from an old session are not
  automatically treated as running. On restore, their `ready` flag is `false`.
- **Agent runtime state** — agent attachments are restored as records, but
  runtime liveness must be explicitly re-established.
- **Workflow result reference** — the opaque `workflowResultRef` on
  `SessionRunContext` is cleared on restore (set to `null`).
- **Global application state** — window layout, user preferences, etc.

## Storage Layout

Persistence uses a simple JSON file layout under a configurable base
directory (default: `~/.codingagent/sessions/`):

```
~/.codingagent/sessions/
  index.json             ← ordered list of recent session metadata
  sessions/
    <session-id>.json    ← full session snapshot
```

Each session file contains:

```json
{
  "meta": { "id": "...", "createdAt": "...", "status": "...", ... },
  "workspace": { ... },
  "events": [ ... ],
  "runContext": { ... },
  "attachedResources": [ ... ]
}
```

The index file tracks metadata for fast listing:

```json
{
  "version": 1,
  "sessions": [
    { "id": "...", "createdAt": "...", "updatedAt": "...", "status": "...", ... }
  ]
}
```

## How Recent Sessions Work

1. **Save** — call `POST /api/sessions/save` with `{ sessionId }` to persist
   the current live session to disk. The session is saved as a snapshot and
   added to the recent-sessions index.

2. **List** — call `GET /api/sessions/recent` to get an ordered list of
   recent session metadata (most recent first).

3. **Restore** — call `GET /api/sessions/:id/restore` to load a persisted
   session. The response includes:
   - the session data (events, workspace, status)
   - `origin: "restored"` to distinguish from live sessions
   - `restoredAt` timestamp
   - `warnings` about what cannot be automatically restored

4. **Delete** — call `DELETE /api/sessions/:id` to remove a persisted session.

### Metadata in Listing

Each entry in the recent-sessions list includes:

- Session ID
- Created / updated timestamps
- Status (`idle`, `active`, `completed`, `blocked`, `failed`, …)
- Stage (`initializing`, `workspace_binding`, `done`, …)
- Workspace path and source
- Last workflow stage
- Agent count
- MCP server count
- Event count

## How Restored Sessions Behave

A restored session is honest about what is and is not live:

| Aspect                | Behavior                                                 |
| --------------------- | -------------------------------------------------------- |
| Timeline / events     | Fully available — same ordering, timestamps, payloads    |
| Session summary       | Derived from persisted data — stage, status, counts      |
| Workspace metadata    | Preserved — path, branch, repo meta                      |
| MCP servers           | Listed but `ready: false` — must reattach/restart        |
| Agents                | Listed but `ready: false` — must re-establish            |
| Workflow result       | Summary fields available; full result object is `null`   |
| Origin indicator      | `origin: "restored"` clearly marks historical sessions   |
| Restore warnings      | Array of human-readable warnings about what needs reattachment |

### What Must Be Reattached/Restarted After Restore

- **MCP servers** — the processes are not running. Use the MCP manager to
  start them again if needed.
- **Agents** — agent attachments are records only. Re-register and reattach
  through the agent registry.
- **Workflow execution** — the workflow runner is stateless. Re-run if needed.

## API Endpoints

| Method   | Path                           | Description                          |
| -------- | ------------------------------ | ------------------------------------ |
| `GET`    | `/api/sessions/recent`         | List recent sessions (metadata)      |
| `POST`   | `/api/sessions/save`           | Save a live session (`{ sessionId }`) |
| `GET`    | `/api/sessions/:id/restore`    | Restore a persisted session          |
| `DELETE` | `/api/sessions/:id`            | Delete a persisted session           |

## Architecture

```
SessionManager (in-memory)
      │
      ▼
  persistence.ts ─── SessionPersistence (file I/O adapter)
      │                    │
      ▼                    ▼
recent-sessions.ts    JSON files on disk
  RecentSessions         (index.json + per-session files)
      │
      ▼
  server.ts ─── API endpoints
```

- **Session domain** (`types.ts`, `session-manager.ts`) remains unchanged.
- **Persistence** is a thin adapter — all file I/O is contained in
  `SessionPersistence`.
- **RecentSessions** is a service layer bridging domain and persistence.
- **Server** exposes HTTP endpoints for the shell UI.

## Design Constraints

- No database — JSON files only
- No remote/cloud persistence
- No heavy UI redesign
- Local-first and repository-agnostic
- Persistence is an adapter, not smeared through the domain
- File I/O is isolated in `SessionPersistence`

## Tests

66 tests covering:

- Save / load session round-trip
- List recent sessions
- Recency ordering
- Index update on save/re-save
- Delete session
- Restored session state semantics (resources `ready: false`)
- Historical session does not falsely imply live MCP/agent state
- Timeline persistence integrity (ordering, timestamps, details, kinds)
- Round-trip serialisation fidelity
- Edge cases (empty events, many events, clone workspaces, special IDs, corrupt index)
- SessionManager ↔ persistence integration
- Server persistence bridge behavior
