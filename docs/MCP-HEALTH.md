# MCP Health and Discovery Hardening

Phase 26 documentation — trustworthy MCP server lifecycle inside sessions.

## Overview

This phase hardens MCP server attachments so the system can clearly communicate:
- Whether a server is live vs stale vs restored from history
- What health state is known vs never-checked
- What discovery data is current vs historical vs placeholder
- What refresh/recheck means and when it should be triggered

## What "MCP Health" Means in This Project

MCP health is **not** continuous monitoring. It is an **explicit, on-demand assessment** of whether an MCP server process appears to be alive and responsive.

Health status values:
| Status | Meaning |
|--------|---------|
| `unknown` | Never checked, or server is stopped/registered — no health data available |
| `healthy` | Process appears alive and last check succeeded |
| `degraded` | Process alive but with partial capability loss or known issues |
| `unhealthy` | Process not responding, crashed, or failed to start |

### Health Report (`McpHealthReport`)

A structured health report tracks:
- `status` — current health assessment
- `processAlive` — whether the OS-level process appears running
- `lastKnownHealthyAt` — last timestamp when health was confirmed good (null if never)
- `lastCheckedAt` — last timestamp when health was assessed (null if never)
- `lastError` — last error message (null if none)
- `lastFailureAt` — last timestamp when a failure was recorded (null if never)
- `isStale` — whether this health data was restored from persistence and not re-verified

## Discovery States

Discovery tracks what tools, resources, and prompts an MCP server provides.

### Discovery Status (`McpDiscoveryStatus`)

| Status | Meaning |
|--------|---------|
| `never_discovered` | No discovery has been attempted for this server |
| `discovering` | Discovery is currently in progress |
| `discovered` | Discovery completed successfully at least once |
| `stale` | Previously discovered, but data is not re-verified (e.g., restored from history) |
| `failed` | Last discovery attempt failed |

### Discovery Source (`McpDiscoverySource`)

| Source | Meaning |
|--------|---------|
| `manual` | Capabilities registered manually or via fixture — not protocol-confirmed |
| `runtime` | Capabilities obtained from live protocol interaction (future) |
| `restored` | Capabilities loaded from persistence — not re-verified |
| `placeholder` | Synthetic/demo data — not protocol-confirmed |

### Discovery State (`McpDiscoveryState`)

Tracks:
- `status` — current discovery lifecycle
- `source` — how the data was obtained
- `lastDiscoveryAt` — last successful discovery timestamp
- `lastAttemptAt` — last discovery attempt timestamp
- `lastError` — error from last failed attempt
- `isCurrent` — whether the discovered capabilities are considered up-to-date
- `toolCount`, `resourceCount`, `promptCount` — counts of discovered capabilities

## What "Live", "Stale", and "Restored" Mean

### Live
A server is **live** when:
- Its process status is `running` (or `discovery_pending`, `discovery_complete`, `degraded`)
- Its health report shows `processAlive: true`
- Its health report shows `isStale: false`

### Stale
A server is **stale** when:
- Its status is `stale` (explicitly marked, e.g., after session restore)
- Its health report shows `isStale: true`
- Its discovery data shows `isCurrent: false`
- It needs a refresh/recheck to regain live confidence

### Restored
A server is **restored** when:
- It was loaded from session persistence
- Its discovery source is `"restored"`
- All attached resources have `ready: false`
- Health and discovery data are marked as historical

**Important:** Persisted sessions never restore MCP servers as running. On restore:
- All resources are `ready: false`
- Health reports are marked `isStale: true`
- Discovery state shows source `"restored"` with `isCurrent: false`
- A refresh/recheck is needed to confirm live status

## What Refresh/Recheck Does

### Health Refresh (`refreshHealth`)

An **explicit, on-demand** health check that:
1. Examines the process handle to determine if the OS process is alive
2. Updates the health report with current status and timestamps
3. Clears the `isStale` flag (since we just checked)
4. Emits an `mcp_health_refreshed` session event if a session is provided
5. If health is degraded, also emits `mcp_health_degraded`

**Note:** This is polling, not continuous monitoring. There is no background health daemon.

### Discovery Refresh (`refreshDiscovery`)

An **explicit, on-demand** re-discovery that:
1. Marks the discovery state as `discovering`
2. Applies the provided discovery result (from a mock, fixture, or future protocol handler)
3. Updates timestamps and capability counts
4. Emits `mcp_discovery_refreshed` and capability discovery session events
5. Clears the stale flag on success

**Note:** In this phase, actual MCP protocol-driven auto-discovery is **not** implemented. The caller must provide the discovery result. This will be wired to real protocol interaction in a future phase.

## Runtime Status Values

Phase 26 extends `McpServerStatus` with four new values:

| Status | Meaning |
|--------|---------|
| `registered` | Config known, not yet started |
| `starting` | Process launch in progress |
| `running` | Process is alive |
| `discovery_pending` | Running, discovery in progress |
| `discovery_complete` | Running, discovery finished |
| `degraded` | Running, but with partial capability loss |
| `stopping` | Shutdown requested |
| `stopped` | Cleanly stopped |
| `failed` | Crashed or failed to start |
| `stale` | Restored from history, not verified live |

## Session Events

Phase 26 adds four new MCP session event kinds:

| Event Kind | Category | Meaning |
|-----------|----------|---------|
| `mcp_health_refreshed` | progress | Health recheck completed |
| `mcp_health_degraded` | warning | Server degraded with a reason |
| `mcp_discovery_refreshed` | progress | Discovery recheck completed |
| `mcp_stale` | warning | Server marked stale (restored from history) |

These appear in the session timeline alongside existing MCP lifecycle events.

## API Endpoints

Phase 26 adds four MCP-related endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/session/:id/mcp/status` | List MCP server statuses for a session |
| GET | `/api/mcp/:id/info` | Get runtime info for a specific MCP server |
| POST | `/api/mcp/:id/refresh-health` | Refresh health for an MCP server |
| POST | `/api/mcp/:id/refresh-discovery` | Refresh discovery for an MCP server |

### GET `/api/session/:id/mcp/status`

Returns all MCP server attachments for a session with their health/discovery state.

### POST `/api/mcp/:id/refresh-health`

Body: `{ "sessionId": "optional-session-id" }`

Triggers a health refresh. If `sessionId` is provided, emits session events.

### POST `/api/mcp/:id/refresh-discovery`

Body: `{ "sessionId": "...", "tools": [...], "resources": [...], "prompts": [...], "complete": true, "source": "manual" }`

Triggers a discovery refresh with the provided capabilities.

## What Is Still Deferred

The following are **not** implemented in Phase 26:

- **Full MCP protocol handshake** — The system models discovery but does not perform real JSON-RPC protocol interaction with MCP servers. Discovery results must be provided externally.
- **Continuous health monitoring** — Health checks are on-demand only. No background polling daemon.
- **Automatic reconnection** — Stale servers are not automatically restarted or reconnected.
- **Install execution** — No package installation or server deployment.
- **Multi-agent orchestration** — No autonomous agent coordination.
- **Remote/cloud MCP control plane** — All management is local-first.
- **Plugin marketplace** — No server discovery or installation marketplace.
- **Global config system** — Server configs are per-session, not global.
- **UI for MCP management** — Endpoints exist but the shell UI is not updated in this phase.
