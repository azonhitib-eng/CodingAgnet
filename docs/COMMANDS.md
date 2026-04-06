# Structured Command Composer — Phase 28

## Overview

The **Structured Command Composer** is a typed, deterministic input layer
that gives users a controlled way to initiate session actions from the
app shell. It replaces scattered controls with a unified command picker
that validates inputs before execution and integrates results into the
session timeline.

This is **not** a natural-language / LLM chat interface. Every command
is explicit, typed, and maps directly to an existing backend capability.

## What commands exist

| Command ID | Category | Label | Description |
|---|---|---|---|
| `open_workspace` | workspace | Open Workspace | Open an existing local directory as the session workspace |
| `clone_repository` | workspace | Clone Repository | Clone a remote repository to a local path |
| `detect_host` | host | Detect Host | Detect the current machine's hardware and runtime profile |
| `attach_mcp` | mcp | Attach MCP Server | Attach an MCP server to the current session |
| `refresh_mcp_health` | mcp | Refresh MCP Health | Refresh health status for an attached MCP server |
| `refresh_mcp_discovery` | mcp | Refresh MCP Discovery | Re-run capability discovery for an attached MCP server |
| `attach_agent` | agent | Attach Agent | Register and attach an agent to the current session |
| `run_workflow` | workflow | Run Workflow | Execute the evaluation workflow with specified inputs |
| `save_session` | session | Save Session | Persist the current session to disk |
| `restore_session` | session | Restore Session | Restore a previously saved session |

## Command model

Each command has:

- **`id`** — unique command type identifier
- **`category`** — logical grouping (workspace / host / mcp / agent / workflow / session)
- **`label`** — display name
- **`description`** — what it does
- **`targetStage`** — optional suggested session stage

Input payloads are typed per command (e.g. `OpenWorkspacePayload`,
`CloneRepositoryPayload`). Validation is field-level with structured
`CommandFieldError` results.

## How it differs from a future chat / LLM layer

| Property | Command Composer (Phase 28) | Future Chat Layer |
|---|---|---|
| Input mode | Structured dropdown + typed fields | Free-form text |
| Parsing | None — deterministic dispatch | LLM interpretation |
| Validation | Field-level, synchronous | Semantic, potentially async |
| Execution | Direct function delegation | Agent orchestration |
| Scope | Explicit product capabilities only | Open-ended |

The command composer is a prerequisite for a future chat layer — it
defines the **action vocabulary** that a chat agent could invoke.

## Validation

Every command payload is validated **before** execution:

- Missing required fields (e.g. path, URL, serverId)
- Invalid paths (must be absolute)
- Invalid URLs (must be https/http/git/SSH; file:// blocked)
- Invalid file types (host file must be .json)
- Invalid references (empty IDs)

Validation errors are shown inline in the UI — never raw exceptions.

### Validated vs executable

All commands are **validated** by the composer. Whether a command is
**executable** depends on:

1. The current session state (availability check)
2. Whether the backend dependency is wired up

Commands that are not available in the current state are disabled in the
dropdown with a reason.

## Availability logic

Command availability is determined by the current session state:

- **No active session** → all commands unavailable except `restore_session`
- **No MCP servers attached** → `refresh_mcp_health` and `refresh_mcp_discovery` unavailable
- **Active session** → workspace, host, MCP attach, agent, workflow, and save commands available

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/commands` | List all command definitions |
| GET | `/api/commands/availability` | Get availability for all commands |
| POST | `/api/commands/validate` | Validate a command payload |
| POST | `/api/commands/execute` | Execute a command |

### POST /api/commands/validate

```json
{
  "commandId": "open_workspace",
  "data": { "path": "/home/user/project" }
}
```

Response: `{ "valid": true, "errors": [] }` or `{ "valid": false, "errors": [{ "field": "path", "message": "..." }] }`

### POST /api/commands/execute

```json
{
  "commandId": "open_workspace",
  "data": { "path": "/home/user/project" },
  "sessionId": "optional-explicit-session-id"
}
```

Response: `{ "commandId": "open_workspace", "status": "completed", "message": "...", "timestamp": "..." }`

## UI composer

The command composer appears in the session panel as a compact action bar:

1. **Command picker** — dropdown grouped by category, unavailable commands disabled
2. **Description** — shows what the selected command does
3. **Input fields** — contextual fields based on command type, with required indicators
4. **Run button** — validates then executes
5. **Validation feedback** — inline error display
6. **Result display** — success / failure / validation_failed with message

Command results also appear in the session timeline and console feed as
events.

## Session integration

When a command is submitted:

1. An `info` event ("Command submitted: ...") is appended to the session
2. After execution, a `note` (completed) or `failed` event is appended
3. If validation fails, a `warning` event is appended

These events appear in the session console and timeline like any other
session activity.

## Architecture

```
views.ts (UI)
  ↓ fetch
server.ts (API routes)
  ↓
commands/executor.ts  ←→  commands/validation.ts
  ↓                        commands/availability.ts
  ↓                        commands/session-integration.ts
existing backends:
  session/repo-lifecycle
  detection/host-detector
  mcp/mcp-manager
  agents/agent-registry
  session/persistence
```

The command module (`src/commands/`) does not duplicate any backend logic.
It validates, dispatches, and records results.

## What remains deferred

- **Free-form chat input** — no LLM interpretation yet
- **Autonomous agent execution** — commands are user-initiated, not agent-initiated
- **Background jobs / queuing** — commands execute synchronously
- **Install execution** — the workflow command evaluates plans, does not install
- **Plugin / extension commands** — command set is fixed in code
- **Command history / undo** — not yet implemented
- **Keyboard shortcuts** — not yet wired
- **Batch / scripted command sequences** — not supported yet

## Tests

140 tests in `tests/commands/phase28-command-composer.test.ts`:

- Command model (15 tests)
- Command validation (32 tests)
- Command availability (20 tests)
- Command executor (22 tests)
- Session integration (11 tests)
- UI rendering (15 tests)
- Server endpoints (10 tests)
