/**
 * MCP module — barrel exports.
 *
 * MCP server attachment lifecycle for the coding-agent platform.
 * Phase 20: local-first MCP management, session integration,
 * and capability discovery modeling.
 * Phase 26: health hardening, discovery state tracking, refresh/recheck.
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
