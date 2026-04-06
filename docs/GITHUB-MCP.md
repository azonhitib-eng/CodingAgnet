# GitHub MCP Integration

Phase 41: GitHub MCP integration and tool invocation layer.

## Overview

This phase introduces a typed tool invocation layer for MCP-backed tools,
with first-class support for a GitHub MCP server. It enables the platform
to discover, register, and explicitly invoke GitHub-oriented read tools
within sessions.

**Key principles:**
- Tool invocation is always explicit and user-triggered — never automatic
- Read-only tools first (no destructive GitHub operations)
- Honest about auth/discovery state — no fake connectivity claims
- Local-first, repository-agnostic

## Architecture

### MCP Tool Invocation Domain (`src/mcp/tool-invocation.ts`)

Typed layer for modeling tool invocations:

| Type | Purpose |
|------|---------|
| `McpToolId` | Tool identifier (string) |
| `McpToolDefinition` | Full tool metadata (label, description, schema, readOnly, enabled) |
| `McpToolInputSchemaSummary` | Simplified input parameter schema |
| `McpToolInvocationRequest` | Explicit invocation request |
| `McpToolInvocationStatus` | Lifecycle status (pending → invoking → completed/failed) |
| `McpToolInvocationResultSummary` | Invocation result with timing, partial flag, error |
| `McpToolInvocationError` | Structured error with code, message, recoverable flag |
| `SessionToolActionSummary` | Per-session aggregation of invocation activity |

Functions:
- `validateInvocationInput()` — validates request against tool definition schema
- `executeToolInvocation()` — core invocation flow with injected executor
- `buildSessionToolActionSummary()` — aggregates results for session reporting

### MCP Tool Registry (`src/mcp/tool-registry.ts`)

In-memory tool inventory organized by MCP server:

- `McpToolRegistry` class — register, query, filter, enable/disable tools
- `McpToolState` — available / disabled / unavailable / unknown
- `McpToolRegistryEntry` — tool definition + state + reason
- `extractInputSchemaSummary()` — extracts parameter hints from JSON Schema
- Supports both runtime-discovered and manually-registered tools

### GitHub MCP Integration (`src/mcp/github-mcp.ts`)

First-class GitHub MCP server support:

- `createGitHubMcpConfig()` — creates a server config for the standard
  `@modelcontextprotocol/server-github` package
- `getKnownGitHubToolDefinitions()` — returns 10 read-only GitHub tool definitions
- `isGitHubAuthConfigured()` / `getGitHubAuthStatus()` — honest auth checking
- `assessGitHubMcpStatus()` — comprehensive readiness assessment

### Tool Session Integration (`src/mcp/tool-session-integration.ts`)

Session events for tool invocation lifecycle:

| Event Kind | When |
|------------|------|
| `mcp_tool_invocation_started` | Invocation begins |
| `mcp_tool_invocation_completed` | Invocation succeeds |
| `mcp_tool_invocation_failed` | Invocation fails |
| `mcp_tool_list_refreshed` | Tool list updated |
| `mcp_github_attached` | GitHub MCP server attached |
| `mcp_github_auth_missing` | GitHub auth not configured |

## Supported GitHub Tools (Read-Only)

| Tool ID | Description |
|---------|-------------|
| `get_file_contents` | Get file or directory contents from a repository |
| `list_pull_requests` | List PRs in a repository |
| `pull_request_read` | Get detailed PR information |
| `list_branches` | List branches in a repository |
| `list_commits` | List commits on a branch |
| `search_code` | Search code across repositories |
| `search_issues` | Search issues in repositories |
| `search_pull_requests` | Search PRs in repositories |
| `get_commit` | Get commit details |
| `actions_list` | List GitHub Actions workflows/runs |

All tools require `owner` and `repo` (or `query` for search tools).
All are read-only — no write/delete operations are supported in this phase.

## Commands

Four new commands added to the structured command layer:

| Command | Category | Description |
|---------|----------|-------------|
| `list_mcp_tools` | mcp | List available tools from attached MCP servers |
| `inspect_mcp_tool` | mcp | Get detailed metadata for a specific tool |
| `invoke_mcp_tool` | mcp | Explicitly invoke a read-only tool with inputs |
| `attach_github_mcp` | mcp | Attach GitHub MCP server and register known tools |

## Session Summary Extensions

New fields on `SessionSummary`:

| Field | Type | Description |
|-------|------|-------------|
| `toolInvocationCount` | `number \| null` | Total invocations in session |
| `toolInvocationSuccessCount` | `number \| null` | Successful invocations |
| `toolInvocationFailureCount` | `number \| null` | Failed invocations |
| `toolsUsed` | `string[] \| null` | Unique tool IDs used |
| `githubMcpAttached` | `boolean` | Whether GitHub MCP is attached |
| `githubAuthConfigured` | `boolean` | Whether GitHub auth is configured |
| `githubMcpReadinessMessage` | `string \| null` | Readiness assessment message |

## Auth & Honesty

The system is explicit about what is and isn't configured:

- If `GITHUB_TOKEN` is not set, all GitHub tools report as unavailable
- If the MCP server is not registered or attached, tools report their state
- Partial results are flagged with `isPartial: true`
- Failed invocations include structured error codes and messages
- No automatic tool calls — everything is user/command-triggered

## What Remains Missing

Before a richer Copilot-like GitHub workflow:

1. **Live MCP protocol handshake** — discovery still uses manual/fixture data
2. **Write operations** — create PR, push commits, create issues (deferred)
3. **Streaming results** — large results are not streamed
4. **Token validation** — token presence is checked, not validity
5. **Rate limiting** — no GitHub API rate limit handling
6. **Multi-server tool coordination** — one server at a time
7. **Persistent tool preferences** — tool enable/disable not persisted
8. **Real-time tool status updates** — no WebSocket push for tool state changes

## Usage Example

```typescript
import {
  McpToolRegistry,
  getKnownGitHubToolDefinitions,
  createGitHubMcpConfig,
  isGitHubAuthConfigured,
  executeToolInvocation,
  GITHUB_MCP_SERVER_ID,
} from "codingagent-backend/mcp";

// 1. Check auth
if (!isGitHubAuthConfigured()) {
  console.log("Set GITHUB_TOKEN to enable GitHub tools");
}

// 2. Create config
const config = createGitHubMcpConfig({ token: process.env.GITHUB_TOKEN });

// 3. Register known tools
const registry = new McpToolRegistry();
for (const def of getKnownGitHubToolDefinitions()) {
  registry.registerTool(def);
}

// 4. Invoke a tool explicitly
const def = registry.getToolDefinition(GITHUB_MCP_SERVER_ID, "get_file_contents")!;
const result = await executeToolInvocation(
  {
    toolId: "get_file_contents",
    serverId: GITHUB_MCP_SERVER_ID,
    sessionId: "my-session",
    input: { owner: "octocat", repo: "Hello-World", path: "README.md" },
  },
  def,
  myMcpExecutor, // your actual MCP communication layer
);
```
