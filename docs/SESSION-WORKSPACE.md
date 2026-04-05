# Session & Workspace Domain

Phase 19 introduced first-class session and workspace concepts. Phase 21
extended this with real repository open/clone lifecycle and workspace bootstrap.

## What Is a Session?

A **session** represents a single, coherent user interaction with the platform.
It wraps one or more workflow runs, tracks progression through typed events, and
carries approval/blocking state.

Key properties:

| Field              | Description                                    |
| ------------------ | ---------------------------------------------- |
| `id`               | Unique session identifier                      |
| `createdAt`        | ISO-8601 creation timestamp                    |
| `updatedAt`        | ISO-8601 last-modified timestamp               |
| `stage`            | High-level lifecycle stage                     |
| `status`           | Lifecycle status (idle, active, completed, …)  |
| `workspace`        | Bound workspace (if any)                       |
| `events`           | Ordered timeline of structured events          |
| `runContext`        | Metadata about the current/last workflow run    |
| `attachedResources`| Placeholder references for MCP/agent attachment |

### Session Stages

`initializing` → `workspace_binding` → `host_detection` → `workflow_running` → `review` → `done`

### Session Statuses

`idle` · `active` · `completed` · `completed_requires_approval` · `blocked` · `failed`

## What Is a Workspace?

A **workspace** represents the local directory context for a session.

Supported sources:

| Source              | Description                                |
| ------------------- | ------------------------------------------ |
| `local_existing`    | An existing local git repository           |
| `cloned`            | A directory populated by a clone operation |
| `generic_directory` | A plain local directory (not a git repo)   |

Workspace statuses: `pending` · `bootstrapping` · `ready` · `invalid` · `closed`

### Repository Metadata

When a workspace is opened or cloned (Phase 21), a `RepositoryMeta` object
is attached:

| Field        | Description                                          |
| ------------ | ---------------------------------------------------- |
| `isGitRepo`  | Whether the directory is a git repository            |
| `repoPath`   | Absolute path to the repository root                 |
| `remoteUrl`  | Remote origin URL (if detectable)                    |
| `branch`     | Current branch name (if detectable)                  |
| `headRef`    | Current HEAD ref / short SHA (if detectable)         |
| `openedAt`   | ISO-8601 timestamp when opened or cloned             |
| `readiness`  | `ready` · `pending` · `bootstrapping` · `invalid` · `unavailable` |
| `notes`      | Warnings or notes (e.g. "Detached HEAD", "No remote origin") |

## Local Open vs Clone

### Opening a Local Path

Use `openWorkspace(path)` to open an existing local directory:

1. Validates the path exists and is a directory
2. Detects whether it is a git repository
3. Builds `RepositoryMeta` with branch, remote URL, HEAD ref
4. Creates a workspace with source `local_existing` (git repo) or `generic_directory`
5. Emits `workspace_open_requested`, `workspace_opened`, `workspace_ready` events

If the path is invalid:
- Workspace is created with `status: "invalid"` and `readiness: "invalid"`
- Events: `workspace_open_requested`, `workspace_invalid`

### Cloning a Repository

Use `cloneWorkspace({ url, targetPath, branch? })` to clone:

1. Validates the clone URL (https, http, git, SSH-style; blocks `file://`)
2. Validates target path (must be absolute, must not already exist)
3. Executes `git clone --single-branch` via `execFile` (no shell)
4. Builds `RepositoryMeta` from the cloned repository
5. Creates workspace with source `cloned` and `status: "ready"`

Events on success: `clone_requested`, `clone_started`, `clone_completed`, `workspace_ready`
Events on failure: `clone_requested`, `clone_started`, `clone_failed`

Important:
- Clone execution is explicit and local
- No credentials manager
- No background queue
- No retry logic
- No branch mutation beyond `--branch` during clone
- Failure is always explicit and reviewable

## Session Events

Events form a structured timeline on each session:

| Kind                     | Emitted when                                   |
| ------------------------ | ---------------------------------------------- |
| `session_created`        | Session is created                             |
| `workspace_bound`        | Workspace is bound to session                  |
| `workspace_open_requested` | Local path open is requested                 |
| `workspace_opened`       | Local path successfully opened                 |
| `workspace_invalid`      | Path validation or workspace state is invalid  |
| `clone_requested`        | Clone operation is requested                   |
| `clone_started`          | Git clone execution begins                     |
| `clone_completed`        | Git clone execution succeeds                   |
| `clone_failed`           | Git clone execution fails                      |
| `workspace_ready`        | Workspace is ready for use                     |
| `host_detected`          | Host detection completes                       |
| `catalogs_loaded`        | Catalog bundle is loaded                       |
| `workflow_started`       | Workflow execution begins                      |
| `stage_completed`        | A workflow stage finishes                      |
| `requires_approval`      | Workflow needs human approval                  |
| `blocked`                | Workflow is blocked by safety violations       |
| `failed`                 | Workflow or session fails                      |
| `completed`              | Session completes successfully                 |
| `note` / `info` / `warning` | Informational events                       |

Each event carries: `kind`, `timestamp` (ISO-8601), `message`, and optional
`detail` (structured payload).

## Workspace Lifecycle Flow

```
create/bind session
    ↓
open or clone workspace  ← repo lifecycle (Phase 21)
    ↓
mark workspace readiness
    ↓
later use workspace in further session flows (workflow, etc.)
```

The workspace lifecycle is intentionally **separate from workflow execution**.
This allows sessions to be created and workspaces to be bound before any
workflow is run.

## Usage

```typescript
import {
  SessionManager,
  openWorkspace,
  cloneWorkspace,
} from "codingagent-backend/session";

const mgr = new SessionManager();

// Create session
const session = mgr.createSession();

// Open existing repo
const openResult = await openWorkspace("/my/repo");
if (openResult.ok) {
  mgr.appendEvents(session.id, openResult.events);
  mgr.bindWorkspace(session.id, openResult.workspace!);
}

// Or clone a repo
const cloneResult = await cloneWorkspace({
  url: "https://github.com/user/repo.git",
  targetPath: "/tmp/my-clone",
  branch: "main",
});
if (cloneResult.ok) {
  mgr.appendEvents(session.id, cloneResult.events);
  mgr.bindWorkspace(session.id, cloneResult.workspace!);
}

// Get summary for frontend
const summary = mgr.getSessionSummary(session.id);
// summary includes: workspaceReadiness, workspaceIsGitRepo, workspaceRemoteUrl, etc.
```

## Server Endpoints (Phase 21)

| Method | Path                            | Description                  |
| ------ | ------------------------------- | ---------------------------- |
| POST   | `/api/workspace/open`           | Open a local path as workspace |
| POST   | `/api/workspace/clone`          | Clone a remote repo          |
| POST   | `/api/workspace/validate-path`  | Validate a local path        |
| POST   | `/api/workspace/validate-url`   | Validate a clone URL         |
| GET    | `/api/workspace/state/:sessionId` | Get workspace state for session |

## What Is Implemented Now (Phase 21)

- ✅ Extended Workspace model with `repoMeta` (RepositoryMeta)
- ✅ `bootstrapping` workspace status
- ✅ WorkspaceReadiness enum (`ready`, `pending`, `bootstrapping`, `invalid`, `unavailable`)
- ✅ Repository open flow with git detection
- ✅ Repository clone flow with URL/path validation
- ✅ 8 new session event kinds for workspace lifecycle
- ✅ Session event factories for all workspace events
- ✅ SessionSummary extended with workspace metadata fields
- ✅ GitExecutor interface for testability (mock/real git)
- ✅ Server endpoints for workspace open/clone/validate/state
- ✅ 77 tests covering all behaviors

## What Is Deferred to Later Phases

- ❌ **Persistence** — sessions are in-memory only
- ❌ **Clone execution** — clone is local only, no credentials, no retry
- ❌ **Install execution** — workspace lifecycle does not trigger installs
- ❌ **Agent registry** — not part of workspace lifecycle
- ❌ **Full UI** — server endpoints are exposed but no workspace UI yet
- ❌ **Background jobs** — clone is synchronous, no background queue
- ❌ **Remote/cloud execution** — local-first only
- ❌ **Global config** — no configuration system
- ❌ **Branch mutation** — no checkout/merge/rebase beyond clone `--branch`
