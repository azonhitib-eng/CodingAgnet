/**
 * Session manager — thin in-memory orchestration boundary.
 *
 * Responsibilities:
 * - create sessions
 * - bind workspaces
 * - append events
 * - update stage/status deterministically
 * - derive session summaries
 * - integrate workflow results
 *
 * No persistence beyond in-memory state.
 * Designed for clean replacement with persistent storage later.
 */

import type {
  Session,
  SessionId,
  SessionStatus,
  SessionStage,
  SessionEvent,
  SessionRunContext,
  Workspace,
  AttachedResource,
} from "./types.js";
import { sessionCreated, workspaceBound } from "./events.js";
import {
  workflowStatusToSessionStatus,
  workflowStatusToSessionStage,
  buildRunContext,
  deriveEventsFromWorkflow,
} from "./workflow-integration.js";
import type { WorkflowResult } from "../workflow/index.js";

/* ------------------------------------------------------------------ */
/*  Session summary (read-only snapshot for frontends)                */
/* ------------------------------------------------------------------ */

/** Lightweight read-only snapshot of a session for UI consumption. */
export interface SessionSummary {
  readonly id: SessionId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stage: SessionStage;
  readonly status: SessionStatus;
  readonly workspacePath: string | null;
  readonly workspaceSource: string | null;
  readonly workspaceStatus: string | null;
  readonly workspaceReadiness: string | null;
  readonly workspaceIsGitRepo: boolean | null;
  readonly workspaceRemoteUrl: string | null;
  readonly workspaceBranch: string | null;
  readonly eventCount: number;
  readonly lastEventKind: string | null;
  readonly lastEventMessage: string | null;
  readonly approvalRequired: boolean;
  readonly isBlocked: boolean;
  readonly lastError: string | null;
  readonly attachedResourceCount: number;
  /** Number of MCP servers currently attached. */
  readonly mcpServerCount: number;
  /** MCP servers with their ready status and health/discovery state (Phase 26). */
  readonly mcpServers: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly ready: boolean;
    /** Server runtime status if known (Phase 26). */
    readonly status?: string;
    /** Server health if known (Phase 26). */
    readonly health?: string;
    /** Whether health data is stale (Phase 26). */
    readonly healthStale?: boolean;
    /** Discovery status if known (Phase 26). */
    readonly discoveryStatus?: string;
    /** Discovery source if known (Phase 26). */
    readonly discoverySource?: string;
    /** Whether discovery data is current (Phase 26). */
    readonly discoveryCurrent?: boolean;
  }>;
  /** Number of agents currently attached. */
  readonly agentCount: number;
  /** Attached agents with their ready status and routing metadata (Phase 27). */
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly ready: boolean;
    /** Role hint from routing metadata (Phase 27). */
    readonly roleHint?: string;
    /** Routing priority (Phase 27). */
    readonly routingPriority?: number;
    /** Whether routing participation is enabled (Phase 27). */
    readonly participationEnabled?: boolean;
    /** Allowed stages (Phase 27). */
    readonly allowedStages?: readonly string[];
  }>;

  /* Fingerprint / language profile (Phase 38) */

  /** Detected languages (ordered by signal strength). */
  readonly detectedLanguages: readonly string[] | null;
  /** Detected frameworks / toolchains. */
  readonly detectedFrameworks: readonly string[] | null;
  /** Whether the repository is a mixed/multi-language project. */
  readonly isMixedRepo: boolean | null;
  /** Selected language profile id. */
  readonly profileId: string | null;
  /** Selected language profile display label. */
  readonly profileLabel: string | null;
  /** Primary detected language. */
  readonly primaryLanguage: string | null;
  /** Why the profile was selected. */
  readonly profileSelectionReason: string | null;
  /** Human-readable profile selection explanation. */
  readonly profileSelectionExplanation: string | null;
  /** Whether the profile selection is confident. */
  readonly profileConfident: boolean | null;

  /* Toolchain adapter (Phase 39) */

  /** Toolchain adapter id, if toolchain summary generated. */
  readonly toolchainAdapterId: string | null;
  /** Toolchain kind (npm, cargo, go, etc.). */
  readonly toolchainKind: string | null;
  /** Total toolchain commands mapped. */
  readonly toolchainCommandCount: number | null;
  /** Number of recommended checks. */
  readonly toolchainRecommendedCount: number | null;
  /** Number of unavailable checks. */
  readonly toolchainUnavailableCount: number | null;

  /* Language service / diagnostics (Phase 40) */

  /** Language service kind (e.g. "typescript", "python", "none"). */
  readonly languageServiceKind: string | null;
  /** Language service runtime status. */
  readonly languageServiceStatus: string | null;
  /** Human-readable language service label. */
  readonly languageServiceLabel: string | null;
  /** Whether diagnostics are available for this workspace. */
  readonly diagnosticsAvailable: boolean | null;
  /** Why diagnostics are unavailable (null if available). */
  readonly diagnosticsUnavailableReason: string | null;
  /** Last collected diagnostics: error count. */
  readonly lastDiagnosticsErrorCount: number | null;
  /** Last collected diagnostics: warning count. */
  readonly lastDiagnosticsWarningCount: number | null;
  /** Last collected diagnostics: total count. */
  readonly lastDiagnosticsTotalCount: number | null;
  /** Last collected diagnostics: files affected. */
  readonly lastDiagnosticsFilesAffected: number | null;

  /* MCP tool invocation (Phase 41) */

  /** Total tool invocations in this session. */
  readonly toolInvocationCount: number | null;
  /** Successful tool invocations. */
  readonly toolInvocationSuccessCount: number | null;
  /** Failed tool invocations. */
  readonly toolInvocationFailureCount: number | null;
  /** Unique tool IDs invoked. */
  readonly toolsUsed: readonly string[] | null;
  /** Whether GitHub MCP is attached. */
  readonly githubMcpAttached: boolean;
  /** Whether GitHub auth is configured. */
  readonly githubAuthConfigured: boolean;
  /** GitHub MCP readiness message. */
  readonly githubMcpReadinessMessage: string | null;
}

/* ------------------------------------------------------------------ */
/*  ID generation                                                     */
/* ------------------------------------------------------------------ */

let _counter = 0;

/** Generate a unique session id (deterministic in tests via reset). */
export function generateSessionId(): SessionId {
  _counter += 1;
  return `session-${Date.now()}-${_counter}`;
}

/** Reset the internal counter (for deterministic tests only). */
export function _resetIdCounter(): void {
  _counter = 0;
}

/* ------------------------------------------------------------------ */
/*  Session Manager                                                   */
/* ------------------------------------------------------------------ */

export class SessionManager {
  private readonly sessions = new Map<SessionId, Session>();

  /* ---------- create ---------- */

  /** Create a new idle session. */
  createSession(): Session {
    const id = generateSessionId();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      createdAt: now,
      updatedAt: now,
      stage: "initializing",
      status: "idle",
      workspace: null,
      events: [sessionCreated(id)],
      runContext: null,
      attachedResources: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  /* ---------- read ---------- */

  /** Retrieve a session by id (or undefined). */
  getSession(id: SessionId): Session | undefined {
    return this.sessions.get(id);
  }

  /** List all sessions. */
  listSessions(): Session[] {
    return [...this.sessions.values()];
  }

  /* ---------- workspace ---------- */

  /** Bind a workspace to a session. */
  bindWorkspace(id: SessionId, workspace: Workspace): Session {
    const session = this.requireSession(id);
    session.workspace = workspace;
    session.stage = "workspace_binding";
    session.updatedAt = new Date().toISOString();
    session.events.push(workspaceBound(workspace.path, workspace.source));
    return session;
  }

  /* ---------- events ---------- */

  /** Append an event to the session timeline. */
  appendEvent(id: SessionId, event: SessionEvent): Session {
    const session = this.requireSession(id);
    session.events.push(event);
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /** Append multiple events at once. */
  appendEvents(id: SessionId, events: SessionEvent[]): Session {
    const session = this.requireSession(id);
    session.events.push(...events);
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /* ---------- stage / status ---------- */

  /** Update session stage. */
  updateStage(id: SessionId, stage: SessionStage): Session {
    const session = this.requireSession(id);
    session.stage = stage;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /** Update session status. */
  updateStatus(id: SessionId, status: SessionStatus): Session {
    const session = this.requireSession(id);
    session.status = status;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /* ---------- run context ---------- */

  /** Attach or update run context metadata. */
  setRunContext(id: SessionId, ctx: SessionRunContext): Session {
    const session = this.requireSession(id);
    session.runContext = ctx;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /* ---------- attached resources ---------- */

  /** Attach a resource reference (MCP server, agent, environment). */
  attachResource(id: SessionId, resource: AttachedResource): Session {
    const session = this.requireSession(id);
    session.attachedResources.push(resource);
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /* ---------- workflow integration ---------- */

  /**
   * Record a workflow result into the session.
   *
   * Updates run context, appends derived events, and sets terminal
   * stage/status.
   */
  recordWorkflowResult(id: SessionId, result: WorkflowResult): Session {
    const session = this.requireSession(id);

    // Run context
    session.runContext = buildRunContext(result);

    // Events
    const events = deriveEventsFromWorkflow(result);
    session.events.push(...events);

    // Stage & status
    session.stage = workflowStatusToSessionStage(result.status);
    session.status = workflowStatusToSessionStatus(result.status);

    session.updatedAt = new Date().toISOString();
    return session;
  }

  /* ---------- summary ---------- */

  /** Derive a lightweight read-only summary for frontend consumption. */
  getSessionSummary(
    id: SessionId,
    agentSummaries?: ReadonlyArray<{
      readonly id: string;
      readonly roleHint?: string;
      readonly routingPriority?: number;
      readonly participationEnabled?: boolean;
      readonly allowedStages?: readonly string[];
    }>,
    fingerprintSummary?: {
      readonly detectedLanguages?: readonly string[];
      readonly detectedFrameworks?: readonly string[];
      readonly isMixed?: boolean;
      readonly profileId?: string;
      readonly profileLabel?: string;
      readonly primaryLanguage?: string;
      readonly selectionReason?: string;
      readonly selectionExplanation?: string;
      readonly selectionConfident?: boolean;
    } | null,
    toolchainSummary?: {
      readonly adapterId?: string;
      readonly toolchainKind?: string;
      readonly commandCount?: number;
      readonly recommendedCount?: number;
      readonly unavailableCount?: number;
    } | null,
    languageServiceSummary?: {
      readonly serviceKind?: string;
      readonly serviceStatus?: string;
      readonly serviceLabel?: string;
      readonly diagnosticsAvailable?: boolean;
      readonly unavailableReason?: string | null;
      readonly lastDiagnosticsErrorCount?: number | null;
      readonly lastDiagnosticsWarningCount?: number | null;
      readonly lastDiagnosticsTotalCount?: number | null;
      readonly lastDiagnosticsFilesAffected?: number | null;
    } | null,
    toolInvocationSummary?: {
      readonly totalInvocations?: number;
      readonly successCount?: number;
      readonly failureCount?: number;
      readonly toolsUsed?: readonly string[];
    } | null,
    githubMcpSummary?: {
      readonly attached?: boolean;
      readonly authConfigured?: boolean;
      readonly readinessMessage?: string;
    } | null,
  ): SessionSummary {
    const session = this.requireSession(id);
    const lastEvent =
      session.events.length > 0
        ? session.events[session.events.length - 1]
        : null;
    const mcpResources = session.attachedResources.filter(
      (r) => r.kind === "mcp_server",
    );
    const agentResources = session.attachedResources.filter(
      (r) => r.kind === "agent",
    );
    return {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      stage: session.stage,
      status: session.status,
      workspacePath: session.workspace?.path ?? null,
      workspaceSource: session.workspace?.source ?? null,
      workspaceStatus: session.workspace?.status ?? null,
      workspaceReadiness: session.workspace?.repoMeta?.readiness ?? null,
      workspaceIsGitRepo: session.workspace?.repoMeta?.isGitRepo ?? null,
      workspaceRemoteUrl: session.workspace?.repoMeta?.remoteUrl ?? null,
      workspaceBranch: session.workspace?.repoMeta?.branch ?? session.workspace?.branch ?? null,
      eventCount: session.events.length,
      lastEventKind: lastEvent?.kind ?? null,
      lastEventMessage: lastEvent?.message ?? null,
      approvalRequired: session.runContext?.approvalRequired ?? false,
      isBlocked: session.runContext?.isBlocked ?? false,
      lastError: session.runContext?.lastError ?? null,
      attachedResourceCount: session.attachedResources.length,
      mcpServerCount: mcpResources.length,
      mcpServers: mcpResources.map((r) => ({
        id: r.id,
        label: r.label,
        ready: r.ready,
      })),
      agentCount: agentResources.length,
      agents: agentResources.map((r) => {
        const agentMeta = agentSummaries?.find((a) => a.id === r.id);
        return {
          id: r.id,
          label: r.label,
          ready: r.ready,
          ...(agentMeta?.roleHint !== undefined
            ? { roleHint: agentMeta.roleHint }
            : {}),
          ...(agentMeta?.routingPriority !== undefined
            ? { routingPriority: agentMeta.routingPriority }
            : {}),
          ...(agentMeta?.participationEnabled !== undefined
            ? { participationEnabled: agentMeta.participationEnabled }
            : {}),
          ...(agentMeta?.allowedStages !== undefined
            ? { allowedStages: agentMeta.allowedStages }
            : {}),
        };
      }),
      /* Fingerprint / profile (Phase 38) */
      detectedLanguages: fingerprintSummary?.detectedLanguages ?? null,
      detectedFrameworks: fingerprintSummary?.detectedFrameworks ?? null,
      isMixedRepo: fingerprintSummary?.isMixed ?? null,
      profileId: fingerprintSummary?.profileId ?? null,
      profileLabel: fingerprintSummary?.profileLabel ?? null,
      primaryLanguage: fingerprintSummary?.primaryLanguage ?? null,
      profileSelectionReason: fingerprintSummary?.selectionReason ?? null,
      profileSelectionExplanation: fingerprintSummary?.selectionExplanation ?? null,
      profileConfident: fingerprintSummary?.selectionConfident ?? null,
      /* Toolchain adapter (Phase 39) */
      toolchainAdapterId: toolchainSummary?.adapterId ?? null,
      toolchainKind: toolchainSummary?.toolchainKind ?? null,
      toolchainCommandCount: toolchainSummary?.commandCount ?? null,
      toolchainRecommendedCount: toolchainSummary?.recommendedCount ?? null,
      toolchainUnavailableCount: toolchainSummary?.unavailableCount ?? null,
      /* Language service / diagnostics (Phase 40) */
      languageServiceKind: languageServiceSummary?.serviceKind ?? null,
      languageServiceStatus: languageServiceSummary?.serviceStatus ?? null,
      languageServiceLabel: languageServiceSummary?.serviceLabel ?? null,
      diagnosticsAvailable: languageServiceSummary?.diagnosticsAvailable ?? null,
      diagnosticsUnavailableReason: languageServiceSummary?.unavailableReason ?? null,
      lastDiagnosticsErrorCount: languageServiceSummary?.lastDiagnosticsErrorCount ?? null,
      lastDiagnosticsWarningCount: languageServiceSummary?.lastDiagnosticsWarningCount ?? null,
      lastDiagnosticsTotalCount: languageServiceSummary?.lastDiagnosticsTotalCount ?? null,
      lastDiagnosticsFilesAffected: languageServiceSummary?.lastDiagnosticsFilesAffected ?? null,
      /* MCP tool invocation (Phase 41) */
      toolInvocationCount: toolInvocationSummary?.totalInvocations ?? null,
      toolInvocationSuccessCount: toolInvocationSummary?.successCount ?? null,
      toolInvocationFailureCount: toolInvocationSummary?.failureCount ?? null,
      toolsUsed: toolInvocationSummary?.toolsUsed ?? null,
      githubMcpAttached: githubMcpSummary?.attached ?? false,
      githubAuthConfigured: githubMcpSummary?.authConfigured ?? false,
      githubMcpReadinessMessage: githubMcpSummary?.readinessMessage ?? null,
    };
  }

  /* ---------- cleanup ---------- */

  /** Remove a session. */
  removeSession(id: SessionId): boolean {
    return this.sessions.delete(id);
  }

  /** Clear all sessions. */
  clear(): void {
    this.sessions.clear();
  }

  /* ---------- internal ---------- */

  private requireSession(id: SessionId): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }
}
