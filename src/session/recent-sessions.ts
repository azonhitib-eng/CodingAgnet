/**
 * Recent sessions model — thin domain layer over persistence for
 * listing, loading, restoring, and managing recent sessions.
 *
 * Keeps the persistence boundary clean by not smearing file I/O
 * through the session domain.
 */

import type {
  Session,
  SessionId,
} from "./types.js";

import type {
  PersistedSessionMeta,
} from "./persistence.js";

import {
  SessionPersistence,
  fromPersistedSession,
} from "./persistence.js";

/* ------------------------------------------------------------------ */
/*  Restored session wrapper                                          */
/* ------------------------------------------------------------------ */

/** Distinguishes between a live/active session and a historical/restored one. */
export type SessionOrigin = "live" | "restored";

/** A session augmented with restore metadata. */
export interface RestoredSession {
  /** The reconstituted session object. */
  readonly session: Session;
  /** Whether the session is live (current process) or restored from disk. */
  readonly origin: SessionOrigin;
  /** ISO-8601 timestamp of when the session was restored. */
  readonly restoredAt: string;
  /**
   * Warnings about runtime state that could not be restored.
   * E.g. "MCP servers are not running — reattach required"
   */
  readonly warnings: string[];
}

/** Build restoration warnings based on the session's attached resources. */
export function buildRestoreWarnings(session: Session): string[] {
  const warnings: string[] = [];
  const mcpServers = session.attachedResources.filter(
    (r) => r.kind === "mcp_server",
  );
  const agents = session.attachedResources.filter(
    (r) => r.kind === "agent",
  );

  if (mcpServers.length > 0) {
    warnings.push(
      `${mcpServers.length} MCP server(s) were attached in the original session. ` +
      `They are restored as stale — health and discovery data is historical. ` +
      `Reattach, restart, or refresh to regain live status.`,
    );
  }
  if (agents.length > 0) {
    warnings.push(
      `${agents.length} agent(s) were attached in the original session. ` +
      `They are restored as records only — runtime liveness must be re-established.`,
    );
  }
  if (session.runContext?.workflowResultRef) {
    warnings.push(
      "Workflow result reference is not preserved across sessions. " +
      "The summary and timeline are available, but the full result object is not.",
    );
  }
  return warnings;
}

/* ------------------------------------------------------------------ */
/*  Recent session service                                            */
/* ------------------------------------------------------------------ */

/**
 * Service layer for recent sessions.
 *
 * Bridges the in-memory SessionManager world with file-based persistence.
 * Keeps all file I/O behind the SessionPersistence adapter.
 */
export class RecentSessions {
  private readonly persistence: SessionPersistence;

  constructor(persistence: SessionPersistence) {
    this.persistence = persistence;
  }

  /**
   * Save a live session to persistence.
   */
  async save(session: Session): Promise<void> {
    await this.persistence.saveSession(session);
  }

  /**
   * List recent sessions ordered by most recent first.
   * Returns metadata only — not full session data.
   */
  async list(): Promise<PersistedSessionMeta[]> {
    return this.persistence.listRecentSessions();
  }

  /**
   * Load and restore a session from persistence.
   *
   * The returned session is clearly marked as "restored" with warnings
   * about runtime resources that cannot be automatically re-established.
   */
  async restore(id: SessionId): Promise<RestoredSession | null> {
    const persisted = await this.persistence.loadSession(id);
    if (!persisted) return null;

    const session = fromPersistedSession(persisted);
    const warnings = buildRestoreWarnings(session);

    return {
      session,
      origin: "restored",
      restoredAt: new Date().toISOString(),
      warnings,
    };
  }

  /**
   * Delete a persisted session.
   */
  async delete(id: SessionId): Promise<boolean> {
    return this.persistence.deleteSession(id);
  }

  /**
   * Check whether a session exists in persistence.
   */
  async exists(id: SessionId): Promise<boolean> {
    const persisted = await this.persistence.loadSession(id);
    return persisted !== null;
  }
}
