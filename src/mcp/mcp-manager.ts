/**
 * MCP Manager — thin orchestration boundary.
 *
 * Coordinates:
 * - Server config registration (via McpProcessManager)
 * - Attachment to sessions (via SessionManager)
 * - Process lifecycle (start/stop via McpProcessManager)
 * - Capability discovery (via capability-discovery helpers)
 * - Session event emission (via session-integration helpers)
 *
 * Phase 26 additions:
 * - Health refresh / recheck
 * - Discovery refresh / recheck
 * - Stale server marking
 * - Enriched runtime info with healthReport and discoveryState
 *
 * Does NOT:
 * - Implement full MCP protocol handshake
 * - Manage background schedulers or distributed control
 * - Replace the SessionManager
 */

import type {
  McpServerId,
  McpServerConfig,
  McpAttachment,
  McpRuntimeInfo,
  McpHealthReport,
  McpDiscoveryState,
} from "./types.js";
import { McpProcessManager } from "./process-manager.js";
import type { McpProcessRecord } from "./process-manager.js";
import type { McpDiscoveryResult } from "./capability-discovery.js";
import { applyDiscovery, markDiscovering } from "./capability-discovery.js";
import {
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
} from "./session-integration.js";
import type { SessionManager } from "../session/session-manager.js";
import type { SessionId, AttachedResource } from "../session/types.js";

/* ------------------------------------------------------------------ */
/*  MCP Manager                                                       */
/* ------------------------------------------------------------------ */

export class McpManager {
  readonly processManager: McpProcessManager;
  private readonly attachments = new Map<string, McpAttachment>();

  constructor(
    private readonly sessionManager: SessionManager,
    processManager?: McpProcessManager,
  ) {
    this.processManager = processManager ?? new McpProcessManager();
  }

  /* ---------- register ---------- */

  /** Register an MCP server config. */
  registerServer(config: McpServerConfig): McpProcessRecord {
    return this.processManager.register(config);
  }

  /* ---------- attach ---------- */

  /**
   * Attach an MCP server to a session.
   *
   * Records the attachment, emits session events, and adds the server
   * as an attached resource on the session.
   */
  attachToSession(serverId: McpServerId, sessionId: SessionId): McpAttachment {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    // Ensure session exists
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const attachmentKey = `${serverId}:${sessionId}`;
    if (this.attachments.has(attachmentKey)) {
      const existing = this.attachments.get(attachmentKey)!;
      if (existing.status === "attached" || existing.status === "pending") {
        throw new Error(
          `MCP server ${serverId} is already attached to session ${sessionId}`,
        );
      }
    }

    // Emit attach_requested event
    this.sessionManager.appendEvent(
      sessionId,
      mcpAttachRequested(serverId, record.config.name),
    );

    // Create attachment record
    const attachment: McpAttachment = {
      serverId,
      sessionId,
      status: "pending",
      attachedAt: new Date().toISOString(),
      detachedAt: null,
      failureReason: null,
    };

    this.attachments.set(attachmentKey, attachment);

    // Add as attached resource on the session
    const resource: AttachedResource = {
      kind: "mcp_server",
      id: serverId,
      label: record.config.name,
      ready: false,
    };
    this.sessionManager.attachResource(sessionId, resource);

    // Mark as attached
    attachment.status = "attached";
    this.sessionManager.appendEvent(
      sessionId,
      mcpAttached(serverId, record.config.name),
    );

    return attachment;
  }

  /* ---------- detach ---------- */

  /** Detach an MCP server from a session. */
  detachFromSession(serverId: McpServerId, sessionId: SessionId): McpAttachment {
    const attachmentKey = `${serverId}:${sessionId}`;
    const attachment = this.attachments.get(attachmentKey);
    if (!attachment) {
      throw new Error(
        `No attachment found for server ${serverId} on session ${sessionId}`,
      );
    }

    attachment.status = "detaching";
    attachment.status = "detached";
    attachment.detachedAt = new Date().toISOString();

    // Update the attached resource to not-ready
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      const resource = session.attachedResources.find(
        (r) => r.kind === "mcp_server" && r.id === serverId,
      );
      if (resource) {
        resource.ready = false;
      }
    }

    return attachment;
  }

  /* ---------- start ---------- */

  /**
   * Start an MCP server and emit lifecycle events on the session.
   *
   * If sessionId is provided, events are emitted to that session.
   */
  async startServer(
    serverId: McpServerId,
    sessionId?: SessionId,
  ): Promise<McpProcessRecord> {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    // Emit starting event
    if (sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpStarting(serverId, record.config.name),
      );
    }

    const result = await this.processManager.start(serverId);

    if (result.status === "running") {
      // Emit started event
      if (sessionId) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpStarted(serverId, record.config.name, result.pid),
        );

        // Mark attached resource as ready
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          const resource = session.attachedResources.find(
            (r) => r.kind === "mcp_server" && r.id === serverId,
          );
          if (resource) {
            resource.ready = true;
          }
        }
      }
    } else if (result.status === "failed") {
      // Emit failed event
      if (sessionId) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpFailed(
            serverId,
            record.config.name,
            result.lastError ?? "Unknown failure",
          ),
        );

        // Update attachment status
        const attachmentKey = `${serverId}:${sessionId}`;
        const attachment = this.attachments.get(attachmentKey);
        if (attachment) {
          attachment.status = "failed";
          attachment.failureReason = result.lastError;
        }
      }
    }

    return result;
  }

  /* ---------- stop ---------- */

  /** Stop a running MCP server and emit lifecycle events. */
  async stopServer(
    serverId: McpServerId,
    sessionId?: SessionId,
  ): Promise<McpProcessRecord> {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const result = await this.processManager.stop(serverId);

    if (result.status === "stopped" && sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpStopped(serverId, record.config.name),
      );
    }

    return result;
  }

  /* ---------- discovery ---------- */

  /**
   * Apply a discovery result to a server and emit session events.
   */
  applyDiscoveryResult(
    serverId: McpServerId,
    result: McpDiscoveryResult,
    sessionId?: SessionId,
  ): void {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    applyDiscovery(record, result);

    if (sessionId) {
      if (result.tools.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredTools(
            serverId,
            result.tools.map((t) => t.name),
          ),
        );
      }
      if (result.resources.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredResources(
            serverId,
            result.resources.map((r) => r.uri),
          ),
        );
      }
      if (result.prompts.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredPrompts(
            serverId,
            result.prompts.map((p) => p.name),
          ),
        );
      }
    }
  }

  /* ---------- health refresh (Phase 26) ---------- */

  /**
   * Refresh health status for a server and emit session events.
   *
   * This is an explicit "recheck" — not continuous monitoring.
   * Returns the updated health report.
   */
  refreshHealth(
    serverId: McpServerId,
    sessionId?: SessionId,
  ): McpHealthReport {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const healthReport = this.processManager.refreshHealth(serverId);

    if (sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpHealthRefreshed(
          serverId,
          record.config.name,
          healthReport.status,
          healthReport.processAlive,
        ),
      );

      // If degraded, also emit degraded event
      if (healthReport.status === "degraded") {
        this.sessionManager.appendEvent(
          sessionId,
          mcpHealthDegraded(
            serverId,
            record.config.name,
            healthReport.lastError ?? "Partial capability loss",
          ),
        );
      }
    }

    return healthReport;
  }

  /* ---------- discovery refresh (Phase 26) ---------- */

  /**
   * Refresh discovery for a server.
   *
   * Marks discovery as in-progress, applies the provided result,
   * and emits session events for the outcome.
   *
   * In this phase, actual protocol-driven discovery is not implemented.
   * The caller provides the discovery result (from a mock, fixture,
   * or future protocol handler).
   */
  refreshDiscovery(
    serverId: McpServerId,
    result: McpDiscoveryResult,
    sessionId?: SessionId,
  ): McpDiscoveryState {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    // Mark discovering
    markDiscovering(record);

    // Apply
    applyDiscovery(record, result);

    // Emit session events
    if (sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpDiscoveryRefreshed(
          serverId,
          record.config.name,
          record.discoveryState.status,
          record.discoveryState.toolCount,
          record.discoveryState.resourceCount,
          record.discoveryState.promptCount,
        ),
      );

      // Also emit capability events if there are new discoveries
      if (result.tools.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredTools(serverId, result.tools.map((t) => t.name)),
        );
      }
      if (result.resources.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredResources(serverId, result.resources.map((r) => r.uri)),
        );
      }
      if (result.prompts.length > 0) {
        this.sessionManager.appendEvent(
          sessionId,
          mcpDiscoveredPrompts(serverId, result.prompts.map((p) => p.name)),
        );
      }
    }

    return record.discoveryState;
  }

  /* ---------- stale marking (Phase 26) ---------- */

  /**
   * Mark an MCP server as stale (e.g., after session restore).
   *
   * Sets status to "stale", marks health/discovery as stale,
   * and emits a session event.
   */
  markServerStale(
    serverId: McpServerId,
    sessionId?: SessionId,
  ): McpProcessRecord {
    const record = this.processManager.markStale(serverId);

    if (sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpStale(serverId, record.config.name),
      );
    }

    return record;
  }

  /**
   * Mark a server as degraded with a reason.
   */
  markServerDegraded(
    serverId: McpServerId,
    reason: string,
    sessionId?: SessionId,
  ): McpProcessRecord {
    const record = this.processManager.getRecord(serverId);
    if (!record) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    record.status = "degraded";
    record.health = "degraded";
    record.lastError = reason;
    const now = new Date().toISOString();
    record.healthReport = {
      ...record.healthReport,
      status: "degraded",
      lastError: reason,
      lastFailureAt: now,
      lastCheckedAt: now,
    };

    if (sessionId) {
      this.sessionManager.appendEvent(
        sessionId,
        mcpHealthDegraded(serverId, record.config.name, reason),
      );
    }

    return record;
  }

  /* ---------- query ---------- */

  /** Get runtime info for a server (Phase 26: enriched with healthReport + discoveryState). */
  getRuntimeInfo(serverId: McpServerId): McpRuntimeInfo | undefined {
    const record = this.processManager.getRecord(serverId);
    if (!record) return undefined;

    return {
      config: record.config,
      status: record.status,
      health: record.health,
      healthReport: { ...record.healthReport },
      discoveryState: { ...record.discoveryState },
      pid: record.pid,
      startedAt: record.startedAt,
      stoppedAt: record.stoppedAt,
      lastError: record.lastError,
      tools: [...record.tools],
      resources: [...record.resources],
      prompts: [...record.prompts],
    };
  }

  /** Get the attachment record for a server-session pair. */
  getAttachment(
    serverId: McpServerId,
    sessionId: SessionId,
  ): McpAttachment | undefined {
    return this.attachments.get(`${serverId}:${sessionId}`);
  }

  /** List all attachments for a session. */
  listSessionAttachments(sessionId: SessionId): McpAttachment[] {
    return [...this.attachments.values()].filter(
      (a) => a.sessionId === sessionId,
    );
  }

  /** List all attachments for a server. */
  listServerAttachments(serverId: McpServerId): McpAttachment[] {
    return [...this.attachments.values()].filter(
      (a) => a.serverId === serverId,
    );
  }

  /* ---------- cleanup ---------- */

  /** Clear all state. */
  clear(): void {
    this.processManager.clear();
    this.attachments.clear();
  }
}
