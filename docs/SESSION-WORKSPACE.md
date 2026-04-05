# Session & Workspace Domain

Phase 19 introduces first-class session and workspace concepts, preparing the
product to evolve from a local workflow tool into a session-oriented local agent
platform.

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
| `local_existing`    | An existing local repo or directory path   |
| `cloned`            | A directory populated by a clone operation |
| `generic_directory` | A plain local directory (not a git repo)   |

Workspace statuses: `pending` · `ready` · `invalid` · `closed`

Clone execution is **modeled but not implemented** in this phase. The
`prepareCloneWorkspace()` helper creates a workspace in `pending` status that
can later be transitioned to `ready` via `markWorkspaceReady()`.

## How This Differs from the Raw Workflow Runner

| Concern              | Workflow Runner            | Session Manager                |
| -------------------- | -------------------------- | ------------------------------ |
| Scope                | Single deterministic run   | Multiple runs, full lifecycle  |
| State                | Accumulated internally     | Explicit, queryable            |
| Timeline             | Stage outputs only         | Structured events with kinds   |
| Approval/blocking    | Encoded in status          | Propagated to session status   |
| Workspace identity   | None (accepts input)       | First-class bound workspace    |
| Frontend exposure    | Via frontend-contracts     | SessionSummary + events        |
| MCP/agent attachment | N/A                        | Resource reference slots       |

## Session Events

Events form a structured timeline on each session:

| Kind                   | Emitted when                                   |
| ---------------------- | ---------------------------------------------- |
| `session_created`      | Session is created                             |
| `workspace_bound`      | Workspace is bound                             |
| `host_detected`        | Host detection completes                       |
| `catalogs_loaded`      | Catalog bundle is loaded                       |
| `workflow_started`     | Workflow execution begins                      |
| `stage_completed`      | A workflow stage finishes                      |
| `requires_approval`    | Workflow needs human approval                  |
| `blocked`              | Workflow is blocked by safety violations       |
| `failed`               | Workflow or session fails                      |
| `completed`            | Session completes successfully                 |
| `note` / `info` / `warning` | Informational events                    |

Each event carries: `kind`, `timestamp` (ISO-8601), `message`, and optional
`detail` (structured payload).

## Usage

```typescript
import {
  SessionManager,
  openLocalWorkspace,
  hostDetected,
  catalogsLoaded,
} from "codingagent-backend/session";

const mgr = new SessionManager();

// Create session
const session = mgr.createSession();

// Bind workspace
mgr.bindWorkspace(session.id, openLocalWorkspace("/my/repo", { branch: "main" }));

// Record events
mgr.updateStage(session.id, "host_detection");
mgr.appendEvent(session.id, hostDetected("Linux x86_64 / 32GB / RTX 3060"));
mgr.appendEvent(session.id, catalogsLoaded(42));

// Record workflow result
mgr.updateStage(session.id, "workflow_running");
mgr.recordWorkflowResult(session.id, workflowResult);

// Get summary for frontend
const summary = mgr.getSessionSummary(session.id);
```

## What Is Implemented Now (Phase 19)

- ✅ Session, Workspace, Event domain types
- ✅ Typed event kinds with factory functions
- ✅ Workspace model (local existing, clone placeholder, generic directory)
- ✅ In-memory SessionManager
- ✅ Workflow result → session state mapping
- ✅ Approval/blocking propagation
- ✅ SessionSummary derivation for frontend consumption
- ✅ AttachedResource references for future MCP/agent attachment
- ✅ 86 tests covering all behaviors

## What Is Deferred to Later Phases

- ❌ **Persistence** — sessions are in-memory only; a persistence layer (SQLite, file-based) is deferred
- ❌ **Clone execution** — workspace clone is modeled but `git clone` is not executed
- ❌ **MCP manager** — attached resource references exist but no MCP lifecycle management
- ❌ **Agent registry** — agent attachment slots exist but no agent orchestration
- ❌ **Session UI** — frontend rendering of session/timeline is deferred to Phase 20
- ❌ **Background jobs** — no async job execution
- ❌ **Remote/cloud execution** — local-first only
