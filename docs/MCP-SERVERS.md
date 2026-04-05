# MCP Server Management

Phase 20 introduces first-class MCP (Model Context Protocol) server management
and session attachment lifecycle.

## What exists now

### MCP Domain Types

The `src/mcp/types.ts` module defines explicit types for the MCP domain:

| Type | Description |
|------|-------------|
| `McpServerId` | Opaque string identifier for an MCP server config |
| `McpServerConfig` | Static config describing how to launch/connect to an MCP server |
| `McpTransport` | Transport type: `stdio`, `sse`, `streamable_http` |
| `McpServerStatus` | Runtime status: `registered`, `starting`, `running`, `stopping`, `stopped`, `failed` |
| `McpServerHealth` | Health assessment: `unknown`, `healthy`, `degraded`, `unhealthy` |
| `McpAttachment` | Binding of an MCP server to a session |
| `McpAttachmentStatus` | Attachment lifecycle: `pending`, `attached`, `detaching`, `detached`, `failed` |
| `McpDiscoveredTool` | A tool discovered from an MCP server |
| `McpDiscoveredResource` | A resource discovered from an MCP server |
| `McpDiscoveredPrompt` | A prompt template discovered from an MCP server |
| `McpRuntimeInfo` | Aggregated summary: config + status + health + discovered capabilities |

### What "attached MCP server" means

An **attached MCP server** is an MCP server config that has been:

1. **Registered** with the MCP process manager (config known)
2. **Attached** to a session (binding created, session resource added)
3. Optionally **started** (process launched for stdio, or externally available for network transports)
4. Optionally **discovered** (capabilities like tools, resources, prompts registered)

The attachment is tracked independently from the server process lifecycle.
A session can have multiple MCP servers attached. An MCP server can be attached
to multiple sessions.

### Transports modeled

| Transport | Description | Implemented |
|-----------|-------------|-------------|
| `stdio` | Local child process via stdin/stdout | ✅ Process start/stop |
| `sse` | Server-sent events over HTTP | 🔲 Modeled, not implemented |
| `streamable_http` | Newer HTTP-based transport | 🔲 Modeled, not implemented |

For `stdio` transport, the config includes:
- `command` — launch command (required)
- `args` — command arguments
- `env` — environment variables
- `cwd` — working directory

For network transports (`sse`, `streamable_http`), the config includes:
- `url` — server URL (required)

### Statuses modeled

**Server Status** (`McpServerStatus`):
- `registered` → config known, not yet started
- `starting` → process launch in progress
- `running` → process is alive
- `stopping` → shutdown requested
- `stopped` → cleanly stopped
- `failed` → crashed or failed to start

**Server Health** (`McpServerHealth`):
- `unknown` → not yet assessed
- `healthy` → responding normally
- `degraded` → partially working
- `unhealthy` → not responding or erroring

**Attachment Status** (`McpAttachmentStatus`):
- `pending` → attach requested
- `attached` → successfully attached to session
- `detaching` → detach in progress
- `detached` → cleanly detached
- `failed` → attachment failed

### What is actually implemented vs deferred

**Implemented in Phase 20:**
- ✅ MCP domain types (all listed above)
- ✅ Process lifecycle management (start/stop for stdio, placeholder for network)
- ✅ Session attachment/detachment with event tracking
- ✅ 9 MCP session event kinds for full lifecycle visibility
- ✅ Capability discovery modeling (manual registration + bulk apply)
- ✅ Validation helpers for discovered capabilities
- ✅ MCP fields in SessionSummary (mcpServerCount, mcpServers)
- ✅ Fixture/factory config helpers for testing
- ✅ Comprehensive test coverage (117 tests)

**Deferred:**
- 🔲 Full MCP protocol handshake/negotiation
- 🔲 Real capability discovery via protocol
- 🔲 SSE/streamable_http transport connection
- 🔲 Health monitoring/ping
- 🔲 Automatic restart on failure
- 🔲 Background process supervision
- 🔲 UI for MCP server management
- 🔲 Global MCP config file
- 🔲 Agent registry integration
- 🔲 Install execution

## How this connects to sessions

MCP servers integrate with the session model via:

1. **Attached Resources**: MCP servers are added to `session.attachedResources`
   with `kind: "mcp_server"`.

2. **Session Events**: 9 MCP-specific event kinds are emitted to the session
   timeline, providing full lifecycle visibility:
   - `mcp_attach_requested` — attachment requested
   - `mcp_attached` — successfully attached
   - `mcp_starting` — server process starting
   - `mcp_started` — server process started (includes PID for stdio)
   - `mcp_failed` — server failed to start or crashed
   - `mcp_stopped` — server stopped
   - `mcp_discovered_tools` — tools discovered
   - `mcp_discovered_resources` — resources discovered
   - `mcp_discovered_prompts` — prompts discovered

3. **Session Summary**: `SessionSummary` now includes:
   - `mcpServerCount` — number of attached MCP servers
   - `mcpServers` — array with id, label, and ready status

4. **Session Status**: MCP events appear in the session timeline but do NOT
   replace the session's own status/stage. MCP lifecycle is tracked alongside
   workflow lifecycle.

## Architecture

The MCP module follows separation of concerns:

```
src/mcp/
├── types.ts              # Domain types (pure, no logic)
├── process-manager.ts    # Process lifecycle (start/stop/status)
├── capability-discovery.ts # Capability modeling (tools/resources/prompts)
├── session-integration.ts # Session event bridge (MCP ↔ session events)
├── config.ts             # Config factories and fixtures
├── mcp-manager.ts        # Orchestration (coordinates all of the above)
└── index.ts              # Barrel exports
```

- **Process lifecycle** is separate from **protocol/capability modeling**
- **Session integration** is separate from both
- The `McpManager` orchestrates all three without collapsing them

## What is still missing before a full Copilot/Codex-like session environment

1. **Full MCP protocol support** — real initialize/handshake, tool calling,
   resource reading, prompt execution
2. **Agent registry** — discoverable agents with capabilities and roles
3. **Clone execution** — actually cloning repos into workspaces
4. **Install execution** — running install plans (currently informational only)
5. **Multi-agent orchestration** — coordinating multiple agents within a session
6. **Background job management** — long-running tasks, progress reporting
7. **Persistent state** — sessions and configs surviving restarts
8. **UI for MCP management** — visual server management, capability browsing
9. **Health monitoring** — automatic health checks, reconnection, supervision
10. **Global configuration** — central config for MCP servers across sessions

## Usage

### Import

```typescript
import {
  McpManager,
  McpProcessManager,
  createMcpServerConfig,
  type McpServerConfig,
  type McpRuntimeInfo,
} from "codingagent-backend/mcp";
```

### Register and start a server

```typescript
import { SessionManager } from "codingagent-backend/session";

const sm = new SessionManager();
const mm = new McpManager(sm);

// Register a config
const config = createMcpServerConfig({
  name: "My MCP Server",
  transport: "stdio",
  command: "node",
  args: ["path/to/mcp-server.js"],
});
mm.registerServer(config);

// Create a session and attach
const session = sm.createSession();
mm.attachToSession(config.id, session.id);

// Start the server
await mm.startServer(config.id, session.id);

// Apply discovered capabilities
mm.applyDiscoveryResult(config.id, {
  tools: [{ name: "read_file", description: "Read a file" }],
  resources: [],
  prompts: [],
  complete: true,
}, session.id);

// Get runtime info
const info = mm.getRuntimeInfo(config.id);
console.log(info?.status);  // "running"
console.log(info?.tools);   // [{ name: "read_file", ... }]

// Stop
await mm.stopServer(config.id, session.id);
```
