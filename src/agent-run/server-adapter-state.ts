/**
 * Server-level adapter state — resolve, cache, and refresh the active adapter.
 *
 * Phase 48: Closes the gap between the adapter layer and server/command wiring.
 *
 * This module holds the server-scoped adapter state and provides the
 * dependency implementations that `buildCommandExecutorDeps()` needs for:
 * - run_agent_task
 * - inspect_agent_adapter
 * - refresh_agent_adapter_status
 * - inspect_agent_run
 *
 * Design:
 * - Resolves adapter lazily on first use (or on explicit refresh)
 * - Caches the adapter + status so repeated commands don't re-resolve
 * - Uses env-config as the default configuration source
 * - Falls back to stub adapter when not configured (honest about it)
 * - All state is server-scoped, not global mutable singleton
 *
 * Does NOT:
 * - Background poll / auto-refresh
 * - Manage multiple adapters simultaneously
 * - Cache across server restarts
 */

import type { AgentExecutionAdapter } from "./adapter.js";
import type { AdapterStatus, OpenAIAdapterConfig } from "./adapter-config.js";
import { inspectAdapterStatus } from "./adapter-config.js";
import type { AdapterResolutionResult } from "./adapter-config.js";
import { resolveAdapter, refreshAdapterStatus } from "./adapter-manager.js";
import type { ResolveAdapterOptions } from "./adapter-manager.js";
import { loadAdapterConfigFromEnv, buildEnvConfigReport } from "./env-config.js";
import type { EnvConfigResult } from "./env-config.js";
import { dispatchAgentTask, inspectAgentRun } from "./dispatch.js";
import type { AgentRunDispatchDeps } from "./dispatch.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";
import {
  agentRunRequested,
  agentRunResultToEvents,
  agentAdapterResolved,
  agentAdapterStatusRefreshed,
  buildAgentRunSessionSummary,
  agentRunStreamStarted,
  agentRunStreamChunk,
  agentRunStreamCompleted,
  agentRunStreamFailed,
} from "./session-integration.js";
import type { AgentSummary, AgentAttachmentStatus } from "../agents/types.js";
import type { SessionManager } from "../session/index.js";
import type { FetchFn } from "./openai-adapter.js";
import { isStreamingAdapter, getStreamingCapability } from "./streaming.js";
import type { StreamChunk, StreamingCapability } from "./streaming.js";

/* ------------------------------------------------------------------ */
/*  Server adapter state                                               */
/* ------------------------------------------------------------------ */

/**
 * Mutable server-level adapter state.
 *
 * Created per server instance. Not a global singleton.
 */
export interface ServerAdapterState {
  /** Currently resolved adapter (null until first resolution). */
  adapter: AgentExecutionAdapter | null;
  /** Current adapter status snapshot. */
  status: AdapterStatus | null;
  /** Last resolution result (for diagnostics). */
  lastResolution: AdapterResolutionResult | null;
  /** Last env config result (for diagnostics). */
  lastEnvConfig: EnvConfigResult | null;
  /** OpenAI config if loaded (for refresh). */
  openaiConfig: OpenAIAdapterConfig | null;
  /** Override fetch function (for testing). */
  fetchFn: FetchFn | undefined;
  /** Total runs executed through this state. */
  totalRuns: number;
  /** Last run result. */
  lastRunResult: AgentRunResult | null;
}

/** Create a fresh server adapter state. */
export function createServerAdapterState(
  overrides?: Partial<Pick<ServerAdapterState, "fetchFn">>,
): ServerAdapterState {
  return {
    adapter: null,
    status: null,
    lastResolution: null,
    lastEnvConfig: null,
    openaiConfig: null,
    fetchFn: overrides?.fetchFn,
    totalRuns: 0,
    lastRunResult: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter resolution                                                 */
/* ------------------------------------------------------------------ */

/**
 * Ensure the adapter is resolved. Resolves lazily on first call.
 *
 * If the adapter is already resolved, returns the cached state.
 * If not, loads config from env and resolves the adapter.
 *
 * Falls back to stub when no configuration is available.
 */
export async function ensureAdapterResolved(
  state: ServerAdapterState,
  env?: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  if (state.adapter && state.status) return;

  // Load config from environment
  const envConfig = loadAdapterConfigFromEnv(env);
  state.lastEnvConfig = envConfig;

  let resolveOptions: ResolveAdapterOptions;

  if (envConfig.status === "configured" && envConfig.resolveOptions) {
    resolveOptions = {
      ...envConfig.resolveOptions,
      fetchFn: state.fetchFn,
    };
    state.openaiConfig = envConfig.openaiConfig;
  } else {
    // Fall back to stub — honest about it
    resolveOptions = { kind: "stub" };
    state.openaiConfig = null;
  }

  const result = await resolveAdapter(resolveOptions);
  state.lastResolution = result;

  if (result.ok && result.adapter) {
    state.adapter = result.adapter;
    state.status = result.status;
  } else {
    // Resolution failed — fall back to stub with clear status
    const stubResult = await resolveAdapter({ kind: "stub" });
    state.adapter = stubResult.adapter;
    state.status = result.status; // Keep the failed status for diagnostics
  }
}

/* ------------------------------------------------------------------ */
/*  Command implementations                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the `runAgentTask` dependency for the command executor.
 *
 * This is the main integration point: takes command-level params and
 * translates them into the dispatch layer's input/deps model.
 */
export function buildRunAgentTaskDep(
  state: ServerAdapterState,
  sessionManager: SessionManager,
): (
  taskKind: string,
  taskDescription?: string,
  targetAgentId?: string,
  preferredAgentKind?: string,
  preferredRoleHint?: string,
) => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
  return async (taskKind, taskDescription, targetAgentId, preferredAgentKind, preferredRoleHint) => {
    // Ensure adapter is resolved
    await ensureAdapterResolved(state);

    if (!state.adapter) {
      return {
        ok: false,
        error: "No execution adapter available. Configure adapter via environment or restart.",
      };
    }

    // Get the active session
    const sessions = sessionManager.listSessions();
    const session = sessions.at(-1);
    if (!session) {
      return { ok: false, error: "No active session." };
    }

    // Build the run input
    const input: AgentRunInput = {
      sessionId: session.id,
      taskKind: taskKind as AgentRunInput["taskKind"],
      taskDescription,
      targetAgentId,
      preferredAgentKind: preferredAgentKind as AgentRunInput["preferredAgentKind"],
      preferredRoleHint: preferredRoleHint as AgentRunInput["preferredRoleHint"],
    };

    // Emit "requested" event
    sessionManager.appendEvent(
      session.id,
      agentRunRequested(
        "(pending)",
        taskKind,
        taskDescription ?? taskKind,
      ),
    );

    // Determine streaming capability
    const streamingCapability: StreamingCapability = getStreamingCapability(state.adapter);

    // Build dispatch deps
    const dispatchDeps: AgentRunDispatchDeps = {
      adapter: state.adapter,
      getSessionAgents: (sid: string) => {
        const s = sessionManager.getSession(sid);
        if (!s) return [];
        return s.attachedResources
          .filter((r) => r.kind === "agent")
          .map((r): AgentSummary => ({
            id: r.id,
            name: r.label,
            kind: "general" as AgentSummary["kind"],
            status: (r.ready ? "attached" : "pending") as AgentAttachmentStatus,
            capabilities: [],
            allowedStages: [],
            failureReason: null,
            disabledReason: null,
          }));
      },
    };

    // Build streaming chunk callback if adapter supports streaming
    let chunksReceived = 0;
    let totalCharsReceived = 0;
    const streamingRunId = "(pending)";
    const onChunk = streamingCapability === "streaming"
      ? (chunk: StreamChunk): void => {
          if (chunk.type === "start") {
            sessionManager.appendEvent(
              session.id,
              agentRunStreamStarted(streamingRunId, state.adapter!.kind, state.adapter!.isModelBacked),
            );
          } else if (chunk.type === "delta") {
            chunksReceived++;
            totalCharsReceived += chunk.content.length;
            // Emit stream chunk events at sensible intervals (not every token)
            if (chunksReceived === 1 || chunksReceived % 10 === 0 || totalCharsReceived % 200 < chunk.content.length) {
              sessionManager.appendEvent(
                session.id,
                agentRunStreamChunk(streamingRunId, chunk.index, chunk.content, totalCharsReceived),
              );
            }
          } else if (chunk.type === "error") {
            sessionManager.appendEvent(
              session.id,
              agentRunStreamFailed(streamingRunId, chunk.content, chunksReceived),
            );
          }
          // "complete" is handled after dispatch returns
        }
      : undefined;

    // Dispatch (with streaming callback if available)
    const result = await dispatchAgentTask(input, dispatchDeps, onChunk);
    state.lastRunResult = result;
    state.totalRuns += 1;

    // Emit streaming completion event if streaming was used
    if (streamingCapability === "streaming" && result.status === "completed") {
      sessionManager.appendEvent(
        session.id,
        agentRunStreamCompleted(
          result.runId,
          chunksReceived,
          totalCharsReceived,
          result.durationMs,
          (result.output?.structuredData?.finishReason as string) ?? null,
        ),
      );
    }

    // Emit result events to session
    const resultEvents = agentRunResultToEvents(result);
    for (const ev of resultEvents) {
      sessionManager.appendEvent(session.id, ev);
    }

    if (result.status === "completed" && result.output) {
      return {
        ok: true,
        detail: {
          runId: result.runId,
          status: result.status,
          agentName: result.request?.agentName ?? null,
          agentKind: result.request?.agentKind ?? null,
          taskKind: result.request?.taskKind ?? null,
          adapterKind: result.output.adapterKind,
          isModelGenerated: result.output.isModelGenerated,
          durationMs: result.durationMs,
          outputPreview: result.output.responseText.substring(0, 500),
          streamed: result.output.structuredData?.streamed === true,
          streamingCapability,
        },
      };
    }

    // Failed — build clear error
    return {
      ok: false,
      error: buildRunFailureMessage(result),
      detail: {
        runId: result.runId,
        status: result.status,
        errorCode: result.error?.code ?? null,
        errorPhase: result.error?.phase ?? null,
        errorMessage: result.error?.message ?? null,
      },
    };
  };
}

/**
 * Build clear failure message with distinct error categories.
 *
 * Phase 48 requirement: When adapter execution fails, the shell should
 * clearly distinguish between different failure types.
 */
function buildRunFailureMessage(result: AgentRunResult): string {
  if (!result.error) return "Agent run failed with unknown error.";

  switch (result.error.code) {
    case "NO_ELIGIBLE_AGENT":
    case "AGENT_NOT_FOUND":
    case "AGENT_NOT_ATTACHED":
      return `Agent selection failed: ${result.error.message}`;
    case "CONTEXT_ASSEMBLY_FAILED":
      return `Context assembly failed: ${result.error.message}`;
    case "EXECUTION_FAILED":
      return `Adapter execution failed: ${result.error.message}`;
    case "EXECUTION_TIMEOUT":
      return `Execution timed out: ${result.error.message}`;
    case "INVALID_TASK":
      return `Invalid task: ${result.error.message}`;
    case "SESSION_NOT_FOUND":
      return `Session not found: ${result.error.message}`;
    default:
      return `Agent run failed: ${result.error.message}`;
  }
}

/**
 * Build the `inspectAgentAdapter` dependency for the command executor.
 */
export function buildInspectAgentAdapterDep(
  state: ServerAdapterState,
): () => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
  return async () => {
    await ensureAdapterResolved(state);

    if (!state.status) {
      return {
        ok: false,
        error: "No adapter resolved. Configuration may be missing.",
      };
    }

    const report = inspectAdapterStatus(state.status);
    const envReport = state.lastEnvConfig
      ? buildEnvConfigReport(state.lastEnvConfig)
      : null;

    return {
      ok: true,
      detail: {
        status: { ...state.status },
        report,
        envConfigStatus: state.lastEnvConfig?.status ?? null,
        envConfigReport: envReport,
        totalRuns: state.totalRuns,
        lastRunStatus: state.lastRunResult?.status ?? null,
        lastRunId: state.lastRunResult?.runId ?? null,
        resolutionOk: state.lastResolution?.ok ?? null,
        resolutionError: state.lastResolution?.error
          ? {
              kind: state.lastResolution.error.kind,
              message: state.lastResolution.error.message,
            }
          : null,
      },
    };
  };
}

/**
 * Build the `refreshAgentAdapterStatus` dependency for the command executor.
 */
export function buildRefreshAgentAdapterStatusDep(
  state: ServerAdapterState,
  sessionManager: SessionManager,
): () => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
  return async () => {
    // If no adapter yet, resolve first
    if (!state.adapter) {
      await ensureAdapterResolved(state);
    }

    if (!state.adapter) {
      return {
        ok: false,
        error: "No adapter available to refresh.",
      };
    }

    // Refresh status
    const refreshed = await refreshAdapterStatus(state.adapter, {
      openaiConfig: state.openaiConfig ?? undefined,
      fetchFn: state.fetchFn,
    });

    state.status = refreshed;

    // Emit event to session
    const sessions = sessionManager.listSessions();
    const session = sessions.at(-1);
    if (session) {
      sessionManager.appendEvent(session.id, agentAdapterStatusRefreshed(refreshed));
    }

    return {
      ok: true,
      detail: {
        kind: refreshed.kind,
        availability: refreshed.availability,
        availabilityMessage: refreshed.availabilityMessage,
        isModelBacked: refreshed.isModelBacked,
        modelName: refreshed.modelName,
        lastCheckedAt: refreshed.lastCheckedAt,
        lastError: refreshed.lastError,
      },
    };
  };
}

/**
 * Build the `inspectAgentRun` dependency for the command executor.
 */
export function buildInspectAgentRunDep(
  state: ServerAdapterState,
): (
  runId?: string,
) => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
  return async (_runId?: string) => {
    if (!state.lastRunResult) {
      return {
        ok: false,
        error: "No agent run has been executed yet in this session.",
      };
    }

    const report = inspectAgentRun(state.lastRunResult);
    return {
      ok: true,
      detail: {
        report,
        runId: state.lastRunResult.runId,
        status: state.lastRunResult.status,
        durationMs: state.lastRunResult.durationMs,
      },
    };
  };
}

/**
 * Build the adapter-resolved event and emit it to the session.
 *
 * Call this after ensureAdapterResolved() to record the adapter state.
 */
export async function emitAdapterResolvedEvent(
  state: ServerAdapterState,
  sessionManager: SessionManager,
): Promise<void> {
  if (!state.status) return;

  const sessions = sessionManager.listSessions();
  const session = sessions.at(-1);
  if (session) {
    sessionManager.appendEvent(session.id, agentAdapterResolved(state.status));
  }
}

/**
 * Get the current adapter session summary contribution.
 */
export function getAdapterSessionSummary(
  state: ServerAdapterState,
) {
  return buildAgentRunSessionSummary(
    state.lastRunResult,
    state.totalRuns,
    state.status,
    state.adapter,
  );
}
