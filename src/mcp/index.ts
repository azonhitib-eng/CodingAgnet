/**
 * MCP module — barrel exports.
 *
 * MCP server attachment lifecycle for the coding-agent platform.
 * Phase 20: local-first MCP management, session integration,
 * and capability discovery modeling.
 * Phase 26: health hardening, discovery state tracking, refresh/recheck.
 * Phase 41: tool invocation layer, tool registry, GitHub MCP integration.
 */

/* types */
export type {
  McpServerId,
  McpServerConfig,
  McpTransport,
  McpServerStatus,
  McpServerHealth,
  McpHealthReport,
  McpDiscoverySource,
  McpDiscoveryStatus,
  McpDiscoveryState,
  McpAttachment,
  McpAttachmentStatus,
  McpDiscoveredTool,
  McpDiscoveredResource,
  McpDiscoveredPrompt,
  McpRuntimeInfo,
} from "./types.js";

/* process manager */
export {
  McpProcessManager,
  createDefaultHealthReport,
  createDefaultDiscoveryState,
  createStaleHealthReport,
  createStaleDiscoveryState,
} from "./process-manager.js";
export type { McpProcessRecord } from "./process-manager.js";

/* capability discovery */
export {
  applyDiscovery,
  markDiscovering,
  markDiscoveryStale,
  registerTool,
  registerResource,
  registerPrompt,
  isValidTool,
  isValidResource,
  isValidPrompt,
  emptyDiscovery,
  failedDiscovery,
} from "./capability-discovery.js";
export type { McpDiscoveryResult } from "./capability-discovery.js";

/* session integration */
export {
  mcpAttachRequested,
  mcpAttached,
  mcpStarting,
  mcpStarted,
  mcpFailed,
  mcpStopped,
  mcpDiscoveredTools,
  mcpDiscoveredResources,
  mcpDiscoveredPrompts,
  mcpHealthRefreshed,
  mcpHealthDegraded,
  mcpDiscoveryRefreshed,
  mcpStale,
  MCP_EVENT_KINDS,
  isMcpEvent,
  filterMcpEvents,
  buildMcpEventSummary,
} from "./session-integration.js";
export type { McpSessionEventKind } from "./session-integration.js";

/* config */
export {
  createMcpServerConfig,
  generateMcpServerId,
  _resetMcpIdCounter,
  fixtureEchoConfig,
  fixtureNodeConfig,
  fixtureSseConfig,
} from "./config.js";
export type { CreateMcpServerConfigOptions } from "./config.js";

/* mcp manager */
export { McpManager } from "./mcp-manager.js";

/* tool invocation (Phase 41) */
export type {
  McpToolId,
  McpToolDefinition,
  McpToolInputSchemaSummary,
  McpToolInvocationRequest,
  McpToolInvocationStatus,
  McpToolInvocationResultSummary,
  McpToolInvocationError,
  SessionToolActionSummary,
} from "./tool-invocation.js";
export {
  validateInvocationInput,
  executeToolInvocation,
  buildSessionToolActionSummary,
} from "./tool-invocation.js";

/* tool registry (Phase 41) */
export type {
  McpToolState,
  McpToolRegistryEntry,
} from "./tool-registry.js";
export {
  McpToolRegistry,
  extractInputSchemaSummary,
} from "./tool-registry.js";

/* tool session integration (Phase 41) */
export {
  mcpToolInvocationStarted,
  mcpToolInvocationCompleted,
  mcpToolInvocationFailed,
  mcpToolListRefreshed,
  mcpGitHubAttached,
  mcpGitHubAuthMissing,
  MCP_TOOL_EVENT_KINDS,
  isMcpToolEvent,
  invocationResultToEvents,
} from "./tool-session-integration.js";
export type { McpToolEventKind } from "./tool-session-integration.js";

/* GitHub MCP integration (Phase 41) */
export type { GitHubMcpIntegrationStatus } from "./github-mcp.js";
export {
  GITHUB_MCP_SERVER_ID,
  GITHUB_MCP_SERVER_NAME,
  GITHUB_MCP_DEFAULT_COMMAND,
  GITHUB_MCP_DEFAULT_ARGS,
  GITHUB_TOKEN_ENV_VAR,
  isGitHubAuthConfigured,
  getGitHubAuthStatus,
  createGitHubMcpConfig,
  getKnownGitHubToolDefinitions,
  KNOWN_GITHUB_TOOL_IDS,
  assessGitHubMcpStatus,
} from "./github-mcp.js";
