/**
 * GitHub MCP integration — first-class GitHub MCP slice.
 *
 * Phase 41: Smallest practical GitHub MCP integration path.
 *
 * Supports:
 * - GitHub MCP server config creation
 * - Known GitHub-oriented read tool definitions
 * - Auth/token awareness (honest about missing config)
 * - Read-oriented tool invocation (explicit, never automatic)
 * - Result surfacing for session/timeline/console
 *
 * Read-first tools supported:
 * - get_file_contents
 * - list_pull_requests
 * - pull_request_read
 * - list_branches
 * - list_commits
 * - search_code
 * - search_issues
 * - search_pull_requests
 * - get_commit
 * - actions_list
 *
 * Does NOT:
 * - Start destructive/write operations
 * - Implement autonomous reasoning loops
 * - Provide full GitHub API coverage
 */

import type { McpServerConfig, McpServerId } from "./types.js";
import type { McpToolDefinition, McpToolInputSchemaSummary } from "./tool-invocation.js";
import { createMcpServerConfig } from "./config.js";

/* ------------------------------------------------------------------ */
/*  GitHub MCP server identity                                         */
/* ------------------------------------------------------------------ */

/** Well-known server ID for GitHub MCP. */
export const GITHUB_MCP_SERVER_ID = "github-mcp-server" as McpServerId;

/** Well-known server name. */
export const GITHUB_MCP_SERVER_NAME = "GitHub MCP Server";

/** Default GitHub MCP server command. */
export const GITHUB_MCP_DEFAULT_COMMAND = "npx";

/** Default GitHub MCP server args. */
export const GITHUB_MCP_DEFAULT_ARGS: readonly string[] = [
  "-y",
  "@modelcontextprotocol/server-github",
] as const;

/* ------------------------------------------------------------------ */
/*  Auth awareness                                                     */
/* ------------------------------------------------------------------ */

/** Environment variable name for GitHub token. */
export const GITHUB_TOKEN_ENV_VAR = "GITHUB_TOKEN";

/**
 * Check if GitHub auth/token is configured.
 *
 * Checks the environment for GITHUB_TOKEN.
 * Does NOT validate the token — just checks if it's present.
 */
export function isGitHubAuthConfigured(
  env?: Readonly<Record<string, string | undefined>>,
): boolean {
  const effectiveEnv = env ?? (typeof process !== "undefined" ? process.env : {});
  const token = effectiveEnv[GITHUB_TOKEN_ENV_VAR];
  return typeof token === "string" && token.trim().length > 0;
}

/**
 * Get a human-readable auth status message.
 */
export function getGitHubAuthStatus(
  env?: Readonly<Record<string, string | undefined>>,
): { configured: boolean; message: string } {
  if (isGitHubAuthConfigured(env)) {
    return {
      configured: true,
      message: "GitHub token is configured (GITHUB_TOKEN present).",
    };
  }
  return {
    configured: false,
    message: "GitHub token is NOT configured. Set GITHUB_TOKEN environment variable to enable GitHub MCP tools.",
  };
}

/* ------------------------------------------------------------------ */
/*  GitHub MCP server config factory                                   */
/* ------------------------------------------------------------------ */

/**
 * Create a GitHub MCP server config.
 *
 * Uses the standard @modelcontextprotocol/server-github package.
 * Optionally passes GITHUB_TOKEN from environment.
 */
export function createGitHubMcpConfig(
  options?: {
    readonly id?: McpServerId;
    readonly token?: string;
    readonly additionalEnv?: Readonly<Record<string, string>>;
  },
): McpServerConfig {
  const env: Record<string, string> = {};

  // Include GitHub token if provided
  if (options?.token) {
    env[GITHUB_TOKEN_ENV_VAR] = options.token;
  }

  // Include additional env vars
  if (options?.additionalEnv) {
    Object.assign(env, options.additionalEnv);
  }

  return createMcpServerConfig({
    id: options?.id ?? GITHUB_MCP_SERVER_ID,
    name: GITHUB_MCP_SERVER_NAME,
    transport: "stdio",
    command: GITHUB_MCP_DEFAULT_COMMAND,
    args: [...GITHUB_MCP_DEFAULT_ARGS],
    ...(Object.keys(env).length > 0 ? { env } : {}),
  });
}

/* ------------------------------------------------------------------ */
/*  Known GitHub tool definitions                                      */
/* ------------------------------------------------------------------ */

/** Helper to create a schema summary. */
function schema(
  required: string[],
  params: Record<string, { type: string; description: string }>,
): McpToolInputSchemaSummary {
  const parameters = Object.keys(params);
  const parameterTypes: Record<string, string> = {};
  const parameterDescriptions: Record<string, string> = {};
  for (const [name, info] of Object.entries(params)) {
    parameterTypes[name] = info.type;
    parameterDescriptions[name] = info.description;
  }
  return { required, parameters, parameterTypes, parameterDescriptions };
}

/**
 * Known GitHub MCP tool definitions (read-only, first slice).
 *
 * These are the tools we know the GitHub MCP server supports.
 * They are registered as known/expected — actual availability
 * depends on the MCP server being attached and responsive.
 */
export function getKnownGitHubToolDefinitions(
  serverId?: McpServerId,
): readonly McpToolDefinition[] {
  const sid = serverId ?? GITHUB_MCP_SERVER_ID;

  return [
    {
      toolId: "get_file_contents",
      serverId: sid,
      label: "Get File Contents",
      description: "Get the contents of a file or directory from a GitHub repository.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo"],
        {
          owner: { type: "string", description: "Repository owner (username or organization)" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "Path to file/directory (default: root)" },
          ref: { type: "string", description: "Git ref (branch, tag, or commit SHA)" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "list_pull_requests",
      serverId: sid,
      label: "List Pull Requests",
      description: "List pull requests in a GitHub repository.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo"],
        {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", description: "Filter by state (open, closed, all)" },
          sort: { type: "string", description: "Sort by (created, updated, popularity)" },
          direction: { type: "string", description: "Sort direction (asc, desc)" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "pull_request_read",
      serverId: sid,
      label: "Read Pull Request",
      description: "Get detailed information about a specific pull request.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo", "pullNumber"],
        {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: { type: "number", description: "Pull request number" },
          method: { type: "string", description: "Read method (get, get_diff, get_files, etc.)" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "list_branches",
      serverId: sid,
      label: "List Branches",
      description: "List branches in a GitHub repository.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo"],
        {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "list_commits",
      serverId: sid,
      label: "List Commits",
      description: "Get list of commits of a branch in a GitHub repository.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo"],
        {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          sha: { type: "string", description: "Branch or commit SHA" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "search_code",
      serverId: sid,
      label: "Search Code",
      description: "Search for code across GitHub repositories using GitHub's code search.",
      category: "github",
      inputSchema: schema(
        ["query"],
        {
          query: { type: "string", description: "Search query using GitHub code search syntax" },
          order: { type: "string", description: "Sort order (asc, desc)" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "search_issues",
      serverId: sid,
      label: "Search Issues",
      description: "Search for issues in GitHub repositories.",
      category: "github",
      inputSchema: schema(
        ["query"],
        {
          query: { type: "string", description: "Search query using GitHub issues syntax" },
          owner: { type: "string", description: "Optional repository owner" },
          repo: { type: "string", description: "Optional repository name" },
          sort: { type: "string", description: "Sort field" },
          order: { type: "string", description: "Sort order (asc, desc)" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "search_pull_requests",
      serverId: sid,
      label: "Search Pull Requests",
      description: "Search for pull requests in GitHub repositories.",
      category: "github",
      inputSchema: schema(
        ["query"],
        {
          query: { type: "string", description: "Search query using GitHub PR syntax" },
          owner: { type: "string", description: "Optional repository owner" },
          repo: { type: "string", description: "Optional repository name" },
          sort: { type: "string", description: "Sort field" },
          order: { type: "string", description: "Sort order (asc, desc)" },
          perPage: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "get_commit",
      serverId: sid,
      label: "Get Commit",
      description: "Get details for a specific commit from a GitHub repository.",
      category: "github",
      inputSchema: schema(
        ["owner", "repo", "sha"],
        {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          sha: { type: "string", description: "Commit SHA, branch name, or tag name" },
          include_diff: { type: "boolean", description: "Whether to include file diffs" },
          perPage: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
    {
      toolId: "actions_list",
      serverId: sid,
      label: "List Actions Workflows",
      description: "List GitHub Actions workflows and workflow runs in a repository.",
      category: "github",
      inputSchema: schema(
        ["method", "owner", "repo"],
        {
          method: { type: "string", description: "Action method (list_workflows, list_workflow_runs, etc.)" },
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          resource_id: { type: "string", description: "Workflow or run ID" },
          perPage: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      ),
      readOnly: true,
      enabled: true,
      discoveredAtRuntime: false,
    },
  ];
}

/** All known GitHub tool IDs. */
export const KNOWN_GITHUB_TOOL_IDS: readonly string[] = [
  "get_file_contents",
  "list_pull_requests",
  "pull_request_read",
  "list_branches",
  "list_commits",
  "search_code",
  "search_issues",
  "search_pull_requests",
  "get_commit",
  "actions_list",
] as const;

/* ------------------------------------------------------------------ */
/*  GitHub MCP integration status                                      */
/* ------------------------------------------------------------------ */

/**
 * Summary of GitHub MCP integration readiness.
 */
export interface GitHubMcpIntegrationStatus {
  /** Whether the GitHub MCP server config is registered. */
  readonly serverRegistered: boolean;
  /** Whether the server is attached to a session. */
  readonly serverAttached: boolean;
  /** Whether GitHub auth is configured. */
  readonly authConfigured: boolean;
  /** Human-readable auth status message. */
  readonly authMessage: string;
  /** Number of known GitHub tools. */
  readonly knownToolCount: number;
  /** Number of tools that are currently available. */
  readonly availableToolCount: number;
  /** Which tools are known but not invokable, and why. */
  readonly unavailableTools: ReadonlyArray<{
    readonly toolId: string;
    readonly reason: string;
  }>;
  /** Overall readiness assessment. */
  readonly ready: boolean;
  /** Human-readable readiness message. */
  readonly readinessMessage: string;
}

/**
 * Assess GitHub MCP integration readiness.
 *
 * Honest about what is configured vs missing.
 */
export function assessGitHubMcpStatus(options: {
  readonly serverRegistered: boolean;
  readonly serverAttached: boolean;
  readonly authConfigured: boolean;
  readonly discoveredToolCount: number;
  readonly registeredToolCount: number;
}): GitHubMcpIntegrationStatus {
  const authStatus = options.authConfigured
    ? "GitHub token is configured."
    : "GitHub token is NOT configured. Set GITHUB_TOKEN to enable.";

  const unavailableTools: Array<{ toolId: string; reason: string }> = [];
  let availableToolCount = 0;

  if (!options.authConfigured) {
    // All tools are unavailable without auth
    for (const toolId of KNOWN_GITHUB_TOOL_IDS) {
      unavailableTools.push({ toolId, reason: "GitHub auth not configured (GITHUB_TOKEN missing)" });
    }
  } else if (!options.serverRegistered) {
    for (const toolId of KNOWN_GITHUB_TOOL_IDS) {
      unavailableTools.push({ toolId, reason: "GitHub MCP server not registered" });
    }
  } else if (!options.serverAttached) {
    for (const toolId of KNOWN_GITHUB_TOOL_IDS) {
      unavailableTools.push({ toolId, reason: "GitHub MCP server not attached to session" });
    }
  } else {
    availableToolCount = options.registeredToolCount > 0
      ? options.registeredToolCount
      : KNOWN_GITHUB_TOOL_IDS.length;
  }

  const ready = options.serverRegistered && options.serverAttached && options.authConfigured;

  let readinessMessage: string;
  if (ready) {
    readinessMessage = `GitHub MCP integration is ready. ${availableToolCount} tool(s) available.`;
  } else {
    const missing: string[] = [];
    if (!options.authConfigured) missing.push("GITHUB_TOKEN not set");
    if (!options.serverRegistered) missing.push("server not registered");
    if (!options.serverAttached) missing.push("server not attached to session");
    readinessMessage = `GitHub MCP integration is NOT ready: ${missing.join(", ")}.`;
  }

  return {
    serverRegistered: options.serverRegistered,
    serverAttached: options.serverAttached,
    authConfigured: options.authConfigured,
    authMessage: authStatus,
    knownToolCount: KNOWN_GITHUB_TOOL_IDS.length,
    availableToolCount,
    unavailableTools,
    ready,
    readinessMessage,
  };
}
