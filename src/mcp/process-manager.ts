/**
 * MCP server process lifecycle management.
 *
 * Responsible ONLY for process start/stop and status tracking.
 * Does NOT handle MCP protocol, capability discovery, or session binding.
 *
 * Separation of concerns:
 * - process-manager.ts → process lifecycle
 * - capability-discovery.ts → capability modeling
 * - mcp-manager.ts → orchestration + session integration
 */

import type {
  McpServerId,
  McpServerConfig,
  McpServerStatus,
  McpServerHealth,
  McpDiscoveredTool,
  McpDiscoveredResource,
  McpDiscoveredPrompt,
  McpHealthReport,
  McpDiscoveryState,
  McpDiscoverySource,
  McpDiscoveryStatus,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Factories for health and discovery state                          */
/* ------------------------------------------------------------------ */

/** Create a default (unknown/never-checked) health report. */
export function createDefaultHealthReport(): McpHealthReport {
  return {
    status: "unknown",
    processAlive: false,
    lastKnownHealthyAt: null,
    lastCheckedAt: null,
    lastError: null,
    lastFailureAt: null,
    isStale: false,
  };
}

/** Create a default (never-discovered) discovery state. */
export function createDefaultDiscoveryState(): McpDiscoveryState {
  return {
    status: "never_discovered",
    source: "manual",
    lastDiscoveryAt: null,
    lastAttemptAt: null,
    lastError: null,
    isCurrent: false,
    toolCount: 0,
    resourceCount: 0,
    promptCount: 0,
  };
}

/** Create a stale/restored health report (for persistence restore). */
export function createStaleHealthReport(
  previous?: Partial<McpHealthReport>,
): McpHealthReport {
  return {
    status: "unknown",
    processAlive: false,
    lastKnownHealthyAt: previous?.lastKnownHealthyAt ?? null,
    lastCheckedAt: previous?.lastCheckedAt ?? null,
    lastError: previous?.lastError ?? null,
    lastFailureAt: previous?.lastFailureAt ?? null,
    isStale: true,
  };
}

/** Create a stale/restored discovery state (for persistence restore). */
export function createStaleDiscoveryState(
  previous?: Partial<McpDiscoveryState>,
): McpDiscoveryState {
  return {
    status: previous?.lastDiscoveryAt ? "stale" : "never_discovered",
    source: "restored",
    lastDiscoveryAt: previous?.lastDiscoveryAt ?? null,
    lastAttemptAt: previous?.lastAttemptAt ?? null,
    lastError: previous?.lastError ?? null,
    isCurrent: false,
    toolCount: previous?.toolCount ?? 0,
    resourceCount: previous?.resourceCount ?? 0,
    promptCount: previous?.promptCount ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Internal process record                                           */
/* ------------------------------------------------------------------ */

/** Mutable record tracking a single MCP server's process state. */
export interface McpProcessRecord {
  readonly config: McpServerConfig;
  status: McpServerStatus;
  health: McpServerHealth;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  lastError: string | null;
  /** Discovered capabilities (populated after handshake/discovery). */
  tools: McpDiscoveredTool[];
  resources: McpDiscoveredResource[];
  prompts: McpDiscoveredPrompt[];
  /** Reference to the child process handle (opaque). */
  processHandle: unknown | null;
  /** Structured health report (Phase 26). */
  healthReport: McpHealthReport;
  /** Discovery lifecycle state (Phase 26). */
  discoveryState: McpDiscoveryState;
}

/* ------------------------------------------------------------------ */
/*  Process Manager                                                   */
/* ------------------------------------------------------------------ */

/**
 * Manages the process lifecycle of MCP servers.
 *
 * Local-first: only stdio transport is actually started/stopped.
 * Network transports are tracked as externally-managed placeholders.
 */
export class McpProcessManager {
  private readonly records = new Map<McpServerId, McpProcessRecord>();

  /* ---------- register ---------- */

  /**
   * Register a server config. Creates a record in "registered" status.
   * Returns the process record.
   */
  register(config: McpServerConfig): McpProcessRecord {
    if (this.records.has(config.id)) {
      throw new Error(`MCP server already registered: ${config.id}`);
    }
    const record: McpProcessRecord = {
      config,
      status: "registered",
      health: "unknown",
      pid: null,
      startedAt: null,
      stoppedAt: null,
      lastError: null,
      tools: [],
      resources: [],
      prompts: [],
      processHandle: null,
      healthReport: createDefaultHealthReport(),
      discoveryState: createDefaultDiscoveryState(),
    };
    this.records.set(config.id, record);
    return record;
  }

  /* ---------- get ---------- */

  /** Get the process record for a server, or undefined. */
  getRecord(id: McpServerId): McpProcessRecord | undefined {
    return this.records.get(id);
  }

  /** Get all registered records. */
  listRecords(): McpProcessRecord[] {
    return [...this.records.values()];
  }

  /* ---------- start ---------- */

  /**
   * Start a local stdio MCP server process.
   *
   * In this phase, we use `child_process.spawn` to launch the command.
   * A real MCP handshake is NOT performed here; discovery is modeled
   * separately and can be triggered after start.
   *
   * @returns The updated process record.
   */
  async start(id: McpServerId): Promise<McpProcessRecord> {
    const record = this.requireRecord(id);

    if (record.status === "running" || record.status === "starting") {
      throw new Error(`MCP server ${id} is already ${record.status}`);
    }

    if (record.config.transport !== "stdio") {
      // Network transports are externally managed
      record.status = "running";
      record.health = "unknown";
      record.startedAt = new Date().toISOString();
      record.lastError = null;
      record.healthReport = {
        ...record.healthReport,
        processAlive: true,
        isStale: false,
      };
      return record;
    }

    if (!record.config.command) {
      record.status = "failed";
      record.lastError = "No command specified for stdio transport";
      const now = new Date().toISOString();
      record.healthReport = {
        ...record.healthReport,
        status: "unhealthy",
        processAlive: false,
        lastError: record.lastError,
        lastFailureAt: now,
        lastCheckedAt: now,
      };
      return record;
    }

    record.status = "starting";
    record.lastError = null;

    try {
      const { spawn } = await import("node:child_process");
      const child = spawn(
        record.config.command,
        record.config.args ? [...record.config.args] : [],
        {
          cwd: record.config.cwd,
          env: record.config.env
            ? { ...process.env, ...record.config.env }
            : undefined,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      // Capture PID
      record.pid = child.pid ?? null;
      record.processHandle = child;
      record.status = "running";
      record.health = "unknown";
      record.startedAt = new Date().toISOString();
      record.healthReport = {
        ...record.healthReport,
        processAlive: true,
        isStale: false,
        lastCheckedAt: record.startedAt,
      };

      // Track unexpected exits
      child.on("error", (err: Error) => {
        record.status = "failed";
        record.health = "unhealthy";
        record.lastError = err.message;
        record.stoppedAt = new Date().toISOString();
        record.healthReport = {
          ...record.healthReport,
          status: "unhealthy",
          processAlive: false,
          lastError: err.message,
          lastFailureAt: record.stoppedAt,
          lastCheckedAt: record.stoppedAt,
        };
      });

      child.on("exit", (code: number | null) => {
        if (record.status === "running") {
          record.status = "failed";
          record.health = "unhealthy";
          record.lastError = `Process exited unexpectedly with code ${code}`;
          record.stoppedAt = new Date().toISOString();
          record.healthReport = {
            ...record.healthReport,
            status: "unhealthy",
            processAlive: false,
            lastError: record.lastError,
            lastFailureAt: record.stoppedAt,
            lastCheckedAt: record.stoppedAt,
          };
        }
      });

      return record;
    } catch (err: unknown) {
      record.status = "failed";
      record.health = "unhealthy";
      record.lastError =
        err instanceof Error ? err.message : "Unknown spawn error";
      const now = new Date().toISOString();
      record.healthReport = {
        ...record.healthReport,
        status: "unhealthy",
        processAlive: false,
        lastError: record.lastError,
        lastFailureAt: now,
        lastCheckedAt: now,
      };
      return record;
    }
  }

  /* ---------- stop ---------- */

  /**
   * Stop a running MCP server process.
   *
   * Sends SIGTERM, then marks as stopped.
   */
  async stop(id: McpServerId): Promise<McpProcessRecord> {
    const record = this.requireRecord(id);

    if (record.status === "stopped" || record.status === "registered") {
      return record; // Nothing to stop
    }

    record.status = "stopping";

    try {
      if (record.processHandle && typeof record.processHandle === "object") {
        const child = record.processHandle as {
          kill: (signal?: string) => boolean;
          killed: boolean;
        };
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      }
      record.status = "stopped";
      record.health = "unknown";
      record.stoppedAt = new Date().toISOString();
      record.processHandle = null;
      record.healthReport = {
        ...record.healthReport,
        status: "unknown",
        processAlive: false,
        lastCheckedAt: record.stoppedAt,
      };
      return record;
    } catch (err: unknown) {
      record.status = "failed";
      record.lastError =
        err instanceof Error ? err.message : "Unknown stop error";
      record.stoppedAt = new Date().toISOString();
      record.healthReport = {
        ...record.healthReport,
        status: "unhealthy",
        processAlive: false,
        lastError: record.lastError,
        lastFailureAt: record.stoppedAt,
        lastCheckedAt: record.stoppedAt,
      };
      return record;
    }
  }

  /* ---------- health ---------- */

  /** Update the health status of a server. */
  updateHealth(id: McpServerId, health: McpServerHealth): McpProcessRecord {
    const record = this.requireRecord(id);
    record.health = health;
    const now = new Date().toISOString();
    record.healthReport = {
      ...record.healthReport,
      status: health,
      lastCheckedAt: now,
      ...(health === "healthy" ? { lastKnownHealthyAt: now, lastError: null } : {}),
      ...(health === "unhealthy" || health === "degraded"
        ? { lastFailureAt: now }
        : {}),
    };
    return record;
  }

  /** Mark a server as failed with an error message. */
  markFailed(id: McpServerId, error: string): McpProcessRecord {
    const record = this.requireRecord(id);
    record.status = "failed";
    record.health = "unhealthy";
    record.lastError = error;
    record.stoppedAt = new Date().toISOString();
    record.healthReport = {
      ...record.healthReport,
      status: "unhealthy",
      processAlive: false,
      lastError: error,
      lastFailureAt: record.stoppedAt,
      lastCheckedAt: record.stoppedAt,
    };
    return record;
  }

  /**
   * Refresh health by checking if the process is still alive.
   * Returns the updated health report.
   */
  refreshHealth(id: McpServerId): McpHealthReport {
    const record = this.requireRecord(id);
    const now = new Date().toISOString();

    // Determine if process appears alive
    let processAlive = false;
    if (record.status === "running" || record.status === "discovery_pending" ||
        record.status === "discovery_complete" || record.status === "degraded") {
      if (record.processHandle && typeof record.processHandle === "object") {
        const child = record.processHandle as { killed?: boolean };
        processAlive = !child.killed;
      } else if (record.config.transport !== "stdio") {
        // Network transports: assume alive if status is running
        processAlive = true;
      }
    }

    let health: McpServerHealth;
    if (record.status === "stopped" || record.status === "registered" || record.status === "stale") {
      health = "unknown";
    } else if (record.status === "failed") {
      health = "unhealthy";
    } else if (!processAlive && record.status === "running") {
      health = "unhealthy";
      record.status = "failed";
      record.lastError = "Process no longer alive on health refresh";
      record.stoppedAt = now;
    } else if (record.status === "degraded") {
      health = "degraded";
    } else {
      health = processAlive ? "healthy" : "unknown";
    }

    record.health = health;
    record.healthReport = {
      status: health,
      processAlive,
      lastKnownHealthyAt: health === "healthy" ? now : record.healthReport.lastKnownHealthyAt,
      lastCheckedAt: now,
      lastError: health === "unhealthy" ? (record.lastError ?? "Process not alive") : record.healthReport.lastError,
      lastFailureAt: health === "unhealthy" ? now : record.healthReport.lastFailureAt,
      isStale: false,
    };
    return record.healthReport;
  }

  /** Mark a server as stale (restored from persistence, not verified). */
  markStale(id: McpServerId): McpProcessRecord {
    const record = this.requireRecord(id);
    record.status = "stale";
    record.health = "unknown";
    record.processHandle = null;
    record.pid = null;
    record.healthReport = createStaleHealthReport(record.healthReport);
    record.discoveryState = createStaleDiscoveryState(record.discoveryState);
    return record;
  }

  /* ---------- unregister ---------- */

  /** Remove a server record. Must be stopped or registered. */
  unregister(id: McpServerId): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    if (record.status === "running" || record.status === "starting") {
      throw new Error(
        `Cannot unregister MCP server ${id} while ${record.status}`,
      );
    }
    return this.records.delete(id);
  }

  /** Clear all records. */
  clear(): void {
    this.records.clear();
  }

  /* ---------- internal ---------- */

  private requireRecord(id: McpServerId): McpProcessRecord {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`MCP server not found: ${id}`);
    }
    return record;
  }
}
