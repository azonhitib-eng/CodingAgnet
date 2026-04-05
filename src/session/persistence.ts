/**
 * Session persistence — thin JSON-file adapter for local-first session storage.
 *
 * Design:
 *  - Each session is persisted as a single JSON file.
 *  - An index file tracks recent session metadata for fast listing.
 *  - The session domain stays clean — persistence is an adapter, not domain logic.
 *  - No database, no external dependencies, no remote storage.
 *
 * File layout (configurable base dir):
 *   <baseDir>/
 *     index.json          — ordered list of recent session metadata
 *     sessions/
 *       <session-id>.json — full session snapshot (metadata + events + context)
 */

import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import type {
  Session,
  SessionId,
  SessionEvent,
  SessionRunContext,
  Workspace,
  AttachedResource,
  SessionStatus,
  SessionStage,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Persisted types                                                   */
/* ------------------------------------------------------------------ */

/**
 * Persisted form of an attached resource.
 * Runtime liveness is always `false` on restore — you must reattach.
 */
export interface PersistedResource {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  /** Always persisted as false — runtime liveness must be re-established. */
  readonly ready: false;
}

/** Metadata stored in the index for fast listing. */
export interface PersistedSessionMeta {
  readonly id: SessionId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: SessionStatus;
  readonly stage: SessionStage;
  readonly workspacePath: string | null;
  readonly workspaceSource: string | null;
  readonly lastStage: string | null;
  readonly agentCount: number;
  readonly mcpCount: number;
  readonly eventCount: number;
}

/** Full persisted session snapshot (written to individual session files). */
export interface PersistedSession {
  readonly meta: PersistedSessionMeta;
  readonly workspace: Workspace | null;
  readonly events: SessionEvent[];
  readonly runContext: SessionRunContext | null;
  readonly attachedResources: PersistedResource[];
}

/** The index file shape. */
export interface SessionIndex {
  readonly version: 1;
  readonly sessions: PersistedSessionMeta[];
}

/* ------------------------------------------------------------------ */
/*  Serialisation helpers                                              */
/* ------------------------------------------------------------------ */

/** Extract metadata from a live session for index storage. */
export function extractMeta(session: Session): PersistedSessionMeta {
  const mcpCount = session.attachedResources.filter(
    (r) => r.kind === "mcp_server",
  ).length;
  const agentCount = session.attachedResources.filter(
    (r) => r.kind === "agent",
  ).length;
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    stage: session.stage,
    workspacePath: session.workspace?.path ?? null,
    workspaceSource: session.workspace?.source ?? null,
    lastStage: session.runContext?.workflowStage ?? null,
    agentCount,
    mcpCount,
    eventCount: session.events.length,
  };
}

/**
 * Convert a live session to its persisted form.
 * Attached resources are persisted with `ready: false` to avoid
 * falsely implying that old MCP servers or agents are still running.
 */
export function toPersistedSession(session: Session): PersistedSession {
  const resources: PersistedResource[] = session.attachedResources.map((r) => ({
    kind: r.kind,
    id: r.id,
    label: r.label,
    ready: false as const,
  }));

  return {
    meta: extractMeta(session),
    workspace: session.workspace,
    events: [...session.events],
    runContext: session.runContext ? { ...session.runContext } : null,
    attachedResources: resources,
  };
}

/**
 * Reconstitute a Session from its persisted form.
 * The returned session is marked as a restored/historical session:
 * - All attached resources have `ready: false`.
 */
export function fromPersistedSession(persisted: PersistedSession): Session {
  const resources: AttachedResource[] = persisted.attachedResources.map((r) => ({
    kind: r.kind as AttachedResource["kind"],
    id: r.id,
    label: r.label,
    ready: false,
  }));

  // Reconstitute run context — clear the opaque workflowResultRef since
  // it cannot be meaningfully serialised.
  let runContext: SessionRunContext | null = null;
  if (persisted.runContext) {
    runContext = {
      ...persisted.runContext,
      workflowResultRef: null,
    };
  }

  return {
    id: persisted.meta.id,
    createdAt: persisted.meta.createdAt,
    updatedAt: persisted.meta.updatedAt,
    stage: persisted.meta.stage,
    status: persisted.meta.status,
    workspace: persisted.workspace,
    events: [...persisted.events],
    runContext,
    attachedResources: resources,
  };
}

/* ------------------------------------------------------------------ */
/*  File-system adapter                                               */
/* ------------------------------------------------------------------ */

/** Default base directory for session persistence. */
export const DEFAULT_PERSISTENCE_DIR = ".codingagent/sessions";

/**
 * Thin file-system adapter for session persistence.
 *
 * All I/O is contained within this class — the rest of the session domain
 * remains pure.
 */
export class SessionPersistence {
  private readonly baseDir: string;
  private readonly sessionsDir: string;
  private readonly indexPath: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.sessionsDir = join(baseDir, "sessions");
    this.indexPath = join(baseDir, "index.json");
  }

  /** Ensure the persistence directories exist. */
  async ensureDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  /** Return the configured base directory. */
  getBaseDir(): string {
    return this.baseDir;
  }

  /* ---------- save ---------- */

  /**
   * Save a session to disk and update the index.
   */
  async saveSession(session: Session): Promise<void> {
    await this.ensureDir();

    const persisted = toPersistedSession(session);
    const sessionPath = join(this.sessionsDir, `${session.id}.json`);
    await writeFile(sessionPath, JSON.stringify(persisted, null, 2), "utf-8");

    // Update index
    const index = await this.readIndex();
    const existing = index.sessions.findIndex((s) => s.id === session.id);
    if (existing >= 0) {
      index.sessions.splice(existing, 1);
    }
    // Prepend (most recent first)
    index.sessions.unshift(persisted.meta);
    await this.writeIndex(index);
  }

  /* ---------- load ---------- */

  /**
   * Load a single persisted session by id.
   * Returns null if the session file does not exist.
   */
  async loadSession(id: SessionId): Promise<PersistedSession | null> {
    const sessionPath = join(this.sessionsDir, `${id}.json`);
    try {
      const raw = await readFile(sessionPath, "utf-8");
      return JSON.parse(raw) as PersistedSession;
    } catch {
      return null;
    }
  }

  /* ---------- list ---------- */

  /**
   * List recent session metadata, ordered by most recent first.
   */
  async listRecentSessions(): Promise<PersistedSessionMeta[]> {
    const index = await this.readIndex();
    return index.sessions;
  }

  /* ---------- delete ---------- */

  /**
   * Delete a persisted session by id.
   * Removes both the session file and the index entry.
   */
  async deleteSession(id: SessionId): Promise<boolean> {
    const index = await this.readIndex();
    const idx = index.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return false;

    index.sessions.splice(idx, 1);
    await this.writeIndex(index);

    const sessionPath = join(this.sessionsDir, `${id}.json`);
    try {
      await unlink(sessionPath);
    } catch {
      // File might already be missing
    }
    return true;
  }

  /* ---------- index I/O ---------- */

  private async readIndex(): Promise<{ version: 1; sessions: PersistedSessionMeta[] }> {
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw) as SessionIndex;
      if (parsed.version === 1 && Array.isArray(parsed.sessions)) {
        return { version: 1, sessions: [...parsed.sessions] };
      }
    } catch {
      // Missing or corrupt — return empty
    }
    return { version: 1, sessions: [] };
  }

  private async writeIndex(index: { version: 1; sessions: PersistedSessionMeta[] }): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }
}
