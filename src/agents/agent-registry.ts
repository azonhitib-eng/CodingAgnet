/**
 * Agent Registry / Attachment Manager.
 *
 * Thin orchestration layer for:
 * - Registering agent definitions
 * - Attaching / detaching agents to sessions
 * - Updating attachment status
 * - Exposing attached agent summaries
 * - Emitting session events for agent lifecycle changes
 *
 * Does NOT:
 * - Implement autonomous task delegation
 * - Run agents or execute tasks
 * - Manage chat or message routing
 * - Replace the SessionManager
 */

import type {
  AgentId,
  AgentDefinition,
  AgentStatus,
  AgentAttachment,
  AgentAttachmentStatus,
  AgentSummary,
  AgentCapability,
} from "./types.js";
import {
  agentAttachRequested,
  agentAttached,
  agentDetached,
  agentEnabled,
  agentDisabled,
  agentFailed,
  agentCapabilitiesUpdated,
} from "./session-integration.js";
import type { SessionManager } from "../session/session-manager.js";
import type { SessionId, AttachedResource } from "../session/types.js";

/* ------------------------------------------------------------------ */
/*  Agent Record (internal)                                           */
/* ------------------------------------------------------------------ */

/** Internal record for a registered agent. */
export interface AgentRecord {
  readonly definition: AgentDefinition;
  status: AgentStatus;
  /** ISO-8601 timestamp when registered. */
  readonly registeredAt: string;
  /** Failure reason if status is 'failed'. */
  failureReason: string | null;
  /** Disabled reason if status is 'disabled'. */
  disabledReason: string | null;
}

/* ------------------------------------------------------------------ */
/*  Agent Registry                                                    */
/* ------------------------------------------------------------------ */

export class AgentRegistry {
  private readonly agents = new Map<AgentId, AgentRecord>();
  private readonly attachments = new Map<string, AgentAttachment>();

  constructor(
    private readonly sessionManager: SessionManager,
  ) {}

  /* ---------- register ---------- */

  /**
   * Register an agent definition.
   *
   * Creates an internal record with status 'registered'.
   * Throws if an agent with the same id is already registered.
   */
  registerAgent(definition: AgentDefinition): AgentRecord {
    if (this.agents.has(definition.id)) {
      throw new Error(`Agent already registered: ${definition.id}`);
    }

    const record: AgentRecord = {
      definition,
      status: "registered",
      registeredAt: new Date().toISOString(),
      failureReason: null,
      disabledReason: null,
    };

    this.agents.set(definition.id, record);
    return record;
  }

  /* ---------- query agents ---------- */

  /** Get an agent record by id. */
  getAgent(agentId: AgentId): AgentRecord | undefined {
    return this.agents.get(agentId);
  }

  /** List all registered agents. */
  listAgents(): AgentRecord[] {
    return [...this.agents.values()];
  }

  /** Update agent definition status. */
  updateAgentStatus(
    agentId: AgentId,
    status: AgentStatus,
    reason?: string,
  ): AgentRecord {
    const record = this.requireAgent(agentId);
    record.status = status;
    if (status === "failed") {
      record.failureReason = reason ?? null;
    }
    if (status === "disabled") {
      record.disabledReason = reason ?? null;
    }
    return record;
  }

  /* ---------- attach ---------- */

  /**
   * Attach an agent to a session.
   *
   * Records the attachment, emits session events, and adds the agent
   * as an attached resource on the session.
   */
  attachToSession(agentId: AgentId, sessionId: SessionId): AgentAttachment {
    const record = this.requireAgent(agentId);

    // Ensure session exists
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Check agent status — disabled/failed agents cannot be attached
    if (record.status === "disabled") {
      throw new Error(
        `Cannot attach disabled agent: ${agentId}${record.disabledReason ? ` (${record.disabledReason})` : ""}`,
      );
    }
    if (record.status === "failed") {
      throw new Error(
        `Cannot attach failed agent: ${agentId}${record.failureReason ? ` (${record.failureReason})` : ""}`,
      );
    }

    const attachmentKey = `${agentId}:${sessionId}`;
    if (this.attachments.has(attachmentKey)) {
      const existing = this.attachments.get(attachmentKey)!;
      if (
        existing.status === "attached" ||
        existing.status === "pending" ||
        existing.status === "enabled"
      ) {
        throw new Error(
          `Agent ${agentId} is already attached to session ${sessionId}`,
        );
      }
    }

    // Emit attach_requested event
    this.sessionManager.appendEvent(
      sessionId,
      agentAttachRequested(agentId, record.definition.name),
    );

    // Create attachment record
    const attachment: AgentAttachment = {
      agentId,
      sessionId,
      status: "pending",
      attachedAt: new Date().toISOString(),
      detachedAt: null,
      failureReason: null,
      disabledReason: null,
    };

    this.attachments.set(attachmentKey, attachment);

    // Add as attached resource on the session
    const resource: AttachedResource = {
      kind: "agent",
      id: agentId,
      label: record.definition.name,
      ready: false,
    };
    this.sessionManager.attachResource(sessionId, resource);

    // Mark as attached
    attachment.status = "attached";
    this.sessionManager.appendEvent(
      sessionId,
      agentAttached(agentId, record.definition.name),
    );

    // Mark resource as ready
    const updatedSession = this.sessionManager.getSession(sessionId);
    if (updatedSession) {
      const res = updatedSession.attachedResources.find(
        (r) => r.kind === "agent" && r.id === agentId,
      );
      if (res) {
        res.ready = true;
      }
    }

    // Update agent status to available
    record.status = "available";

    return attachment;
  }

  /* ---------- detach ---------- */

  /** Detach an agent from a session. */
  detachFromSession(agentId: AgentId, sessionId: SessionId): AgentAttachment {
    const attachmentKey = `${agentId}:${sessionId}`;
    const attachment = this.attachments.get(attachmentKey);
    if (!attachment) {
      throw new Error(
        `No attachment found for agent ${agentId} on session ${sessionId}`,
      );
    }

    const record = this.agents.get(agentId);

    attachment.status = "detaching";
    attachment.status = "detached";
    attachment.detachedAt = new Date().toISOString();

    // Emit detached event
    this.sessionManager.appendEvent(
      sessionId,
      agentDetached(agentId, record?.definition.name ?? agentId),
    );

    // Update the attached resource to not-ready
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      const resource = session.attachedResources.find(
        (r) => r.kind === "agent" && r.id === agentId,
      );
      if (resource) {
        resource.ready = false;
      }
    }

    return attachment;
  }

  /* ---------- enable / disable ---------- */

  /** Enable an attached agent within a session. */
  enableAgent(agentId: AgentId, sessionId: SessionId): AgentAttachment {
    const attachment = this.requireAttachment(agentId, sessionId);
    if (attachment.status !== "attached" && attachment.status !== "disabled") {
      throw new Error(
        `Cannot enable agent in status '${attachment.status}' — must be 'attached' or 'disabled'`,
      );
    }

    const record = this.agents.get(agentId);

    attachment.status = "enabled";
    attachment.disabledReason = null;

    this.sessionManager.appendEvent(
      sessionId,
      agentEnabled(agentId, record?.definition.name ?? agentId),
    );

    return attachment;
  }

  /** Disable an attached agent within a session. */
  disableAgent(
    agentId: AgentId,
    sessionId: SessionId,
    reason?: string,
  ): AgentAttachment {
    const attachment = this.requireAttachment(agentId, sessionId);
    if (attachment.status !== "attached" && attachment.status !== "enabled") {
      throw new Error(
        `Cannot disable agent in status '${attachment.status}' — must be 'attached' or 'enabled'`,
      );
    }

    const record = this.agents.get(agentId);

    attachment.status = "disabled";
    attachment.disabledReason = reason ?? null;

    this.sessionManager.appendEvent(
      sessionId,
      agentDisabled(agentId, record?.definition.name ?? agentId, reason),
    );

    return attachment;
  }

  /* ---------- failure ---------- */

  /** Mark an attachment as failed. */
  markAttachmentFailed(
    agentId: AgentId,
    sessionId: SessionId,
    reason: string,
  ): AgentAttachment {
    const attachment = this.requireAttachment(agentId, sessionId);

    const record = this.agents.get(agentId);

    attachment.status = "failed";
    attachment.failureReason = reason;

    this.sessionManager.appendEvent(
      sessionId,
      agentFailed(agentId, record?.definition.name ?? agentId, reason),
    );

    // Update the attached resource to not-ready
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      const resource = session.attachedResources.find(
        (r) => r.kind === "agent" && r.id === agentId,
      );
      if (resource) {
        resource.ready = false;
      }
    }

    return attachment;
  }

  /* ---------- capabilities ---------- */

  /** Notify that an agent's capabilities have been updated. */
  notifyCapabilitiesUpdated(
    agentId: AgentId,
    sessionId: SessionId,
    capabilities: readonly AgentCapability[],
  ): void {
    const record = this.requireAgent(agentId);

    this.sessionManager.appendEvent(
      sessionId,
      agentCapabilitiesUpdated(agentId, record.definition.name, capabilities),
    );
  }

  /* ---------- query attachments ---------- */

  /** Get the attachment record for an agent-session pair. */
  getAttachment(
    agentId: AgentId,
    sessionId: SessionId,
  ): AgentAttachment | undefined {
    return this.attachments.get(`${agentId}:${sessionId}`);
  }

  /** List all attachments for a session. */
  listSessionAttachments(sessionId: SessionId): AgentAttachment[] {
    return [...this.attachments.values()].filter(
      (a) => a.sessionId === sessionId,
    );
  }

  /** List all attachments for an agent. */
  listAgentAttachments(agentId: AgentId): AgentAttachment[] {
    return [...this.attachments.values()].filter(
      (a) => a.agentId === agentId,
    );
  }

  /* ---------- summaries ---------- */

  /**
   * Get agent summaries for a session.
   *
   * Returns one AgentSummary per attached/enabled/disabled/failed attachment.
   */
  getSessionAgentSummaries(sessionId: SessionId): AgentSummary[] {
    const sessionAttachments = this.listSessionAttachments(sessionId);
    const summaries: AgentSummary[] = [];

    for (const attachment of sessionAttachments) {
      const record = this.agents.get(attachment.agentId);
      if (!record) continue;

      summaries.push({
        id: record.definition.id,
        name: record.definition.name,
        kind: record.definition.kind,
        status: attachment.status,
        capabilities: [...record.definition.capabilities],
        allowedStages: [...record.definition.allowedStages],
        failureReason: attachment.failureReason,
        disabledReason: attachment.disabledReason,
        roleHint: record.definition.routing?.roleHint,
        routingPriority: record.definition.routing?.routingPriority,
        participationEnabled: record.definition.routing?.participationEnabled,
      });
    }

    return summaries;
  }

  /* ---------- cleanup ---------- */

  /** Clear all state. */
  clear(): void {
    this.agents.clear();
    this.attachments.clear();
  }

  /* ---------- internal ---------- */

  private requireAgent(agentId: AgentId): AgentRecord {
    const record = this.agents.get(agentId);
    if (!record) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return record;
  }

  private requireAttachment(
    agentId: AgentId,
    sessionId: SessionId,
  ): AgentAttachment {
    const attachmentKey = `${agentId}:${sessionId}`;
    const attachment = this.attachments.get(attachmentKey);
    if (!attachment) {
      throw new Error(
        `No attachment found for agent ${agentId} on session ${sessionId}`,
      );
    }
    return attachment;
  }
}
