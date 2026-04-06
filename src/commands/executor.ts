/**
 * Command executor — maps structured commands to existing backend capabilities.
 *
 * Phase 28: Structured Command Composer / Session Input Layer.
 *
 * This module does NOT duplicate backend logic. It delegates to:
 * - repo-lifecycle for workspace commands
 * - detection/host-detector for host commands
 * - MCP manager for MCP commands
 * - agent registry for agent commands
 * - workflow-bridge for workflow commands
 * - session persistence for session commands
 *
 * Each executor function returns a CommandExecutionResult.
 */

import type {
  CommandPayload,
  CommandExecutionResult,
  CommandId,
} from "./types.js";
import { validateCommand } from "./validation.js";
import {
  commandSubmitted,
  commandCompleted,
  commandFailed,
  commandValidationFailed,
} from "./session-integration.js";
import { getCommandDefinition } from "./types.js";
import type { SessionManager } from "../session/session-manager.js";

/* ------------------------------------------------------------------ */
/*  Execution result helpers                                           */
/* ------------------------------------------------------------------ */

function makeResult(
  commandId: CommandId,
  status: CommandExecutionResult["status"],
  message: string,
  detail?: Record<string, unknown>,
): CommandExecutionResult {
  return {
    commandId,
    status,
    message,
    ...(detail !== undefined ? { detail } : {}),
    timestamp: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Executor dependencies (injected at call time)                      */
/* ------------------------------------------------------------------ */

/**
 * External dependencies needed by the executor.
 *
 * These are injected rather than imported directly so that:
 * 1. The executor is testable without real backends.
 * 2. The server can pass its singletons.
 */
export interface CommandExecutorDeps {
  readonly sessionManager: SessionManager;
  /** Open a local workspace. Returns {ok, error?}. */
  readonly openWorkspace?: (
    path: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Clone a remote repository. Returns {ok, error?}. */
  readonly cloneWorkspace?: (
    url: string,
    targetPath: string,
    branch?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Detect host profile. Returns the detected profile or throws. */
  readonly detectHost?: () => Promise<Record<string, unknown>>;
  /** Attach an MCP server. Returns {ok, error?}. */
  readonly attachMcp?: (
    serverId: string,
    command: string,
    args?: readonly string[],
    label?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Refresh MCP health. Returns {ok, error?}. */
  readonly refreshMcpHealth?: (
    serverId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Refresh MCP discovery. Returns {ok, error?}. */
  readonly refreshMcpDiscovery?: (
    serverId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Attach an agent. Returns {ok, error?}. */
  readonly attachAgent?: (
    agentId: string,
    name: string,
    kind?: string,
    capabilities?: readonly string[],
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Run workflow. Returns {ok, error?, detail?}. */
  readonly runWorkflow?: (
    dataDir: string,
    hostFile?: string,
    artifactId?: string,
    stopAfter?: string,
  ) => Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }>;
  /** Save session. Returns {ok, error?}. */
  readonly saveSession?: (
    sessionId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Restore session. Returns {ok, error?}. */
  readonly restoreSession?: (
    sessionId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Inspect toolchain. Returns {ok, error?, detail?}. */
  readonly inspectToolchain?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Run workspace check. Returns {ok, error?, detail?}. */
  readonly runWorkspaceCheck?: (
    commandType: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Refresh toolchain summary. Returns {ok, error?, detail?}. */
  readonly refreshToolchainSummary?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect language service. Returns {ok, error?, detail?}. */
  readonly inspectLanguageService?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Collect diagnostics. Returns {ok, error?, detail?}. */
  readonly collectDiagnostics?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Refresh diagnostics summary. Returns {ok, error?, detail?}. */
  readonly refreshDiagnosticsSummary?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Core executor                                                      */
/* ------------------------------------------------------------------ */

/**
 * Execute a command submission.
 *
 * 1. Validates the payload.
 * 2. Emits a "submitted" event to the session timeline.
 * 3. Delegates to the appropriate backend.
 * 4. Emits a "completed" or "failed" event.
 * 5. Returns the execution result.
 */
export async function executeCommand(
  sessionId: string,
  payload: CommandPayload,
  deps: CommandExecutorDeps,
): Promise<CommandExecutionResult> {
  const { commandId } = payload;
  const def = getCommandDefinition(commandId);
  const label = def?.label ?? commandId;

  // 1. Validate
  const validation = validateCommand(payload);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => `${e.field}: ${e.message}`);
    const event = commandValidationFailed(commandId, errorMessages);
    try {
      deps.sessionManager.appendEvent(sessionId, event);
    } catch {
      // Session may not exist for restore_session — tolerate.
    }
    return makeResult(commandId, "validation_failed", errorMessages.join("; "));
  }

  // 2. Emit submitted event
  const submittedEvent = commandSubmitted(commandId, label);
  try {
    deps.sessionManager.appendEvent(sessionId, submittedEvent);
  } catch {
    // Session may not exist yet — tolerate for restore_session.
  }

  // 3. Delegate to backend
  try {
    const result = await dispatchCommand(sessionId, payload, deps);

    // 4. Emit result event
    const event =
      result.status === "completed"
        ? commandCompleted(commandId, result.message)
        : commandFailed(commandId, result.message);
    try {
      deps.sessionManager.appendEvent(sessionId, event);
    } catch {
      // Tolerate — session may have changed state.
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const event = commandFailed(commandId, message);
    try {
      deps.sessionManager.appendEvent(sessionId, event);
    } catch {
      // Tolerate.
    }
    return makeResult(commandId, "failed", message);
  }
}

/* ------------------------------------------------------------------ */
/*  Dispatch to backend                                                */
/* ------------------------------------------------------------------ */

async function dispatchCommand(
  sessionId: string,
  payload: CommandPayload,
  deps: CommandExecutorDeps,
): Promise<CommandExecutionResult> {
  switch (payload.commandId) {
    case "open_workspace": {
      if (!deps.openWorkspace) {
        return makeResult(payload.commandId, "failed", "Workspace open not available.");
      }
      const res = await deps.openWorkspace(payload.data.path);
      return res.ok
        ? makeResult(payload.commandId, "completed", `Workspace opened: ${payload.data.path}`)
        : makeResult(payload.commandId, "failed", res.error ?? "Failed to open workspace.");
    }

    case "clone_repository": {
      if (!deps.cloneWorkspace) {
        return makeResult(payload.commandId, "failed", "Clone not available.");
      }
      const res = await deps.cloneWorkspace(
        payload.data.url,
        payload.data.targetPath,
        payload.data.branch,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `Repository cloned: ${payload.data.url}`)
        : makeResult(payload.commandId, "failed", res.error ?? "Clone failed.");
    }

    case "detect_host": {
      if (!deps.detectHost) {
        return makeResult(payload.commandId, "failed", "Host detection not available.");
      }
      const profile = await deps.detectHost();
      return makeResult(payload.commandId, "completed", "Host detected successfully.", {
        profile,
      });
    }

    case "attach_mcp": {
      if (!deps.attachMcp) {
        return makeResult(payload.commandId, "failed", "MCP attachment not available.");
      }
      const res = await deps.attachMcp(
        payload.data.serverId,
        payload.data.command,
        payload.data.args,
        payload.data.label,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `MCP server attached: ${payload.data.serverId}`)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP attach failed.");
    }

    case "refresh_mcp_health": {
      if (!deps.refreshMcpHealth) {
        return makeResult(payload.commandId, "failed", "MCP health refresh not available.");
      }
      const res = await deps.refreshMcpHealth(payload.data.serverId);
      return res.ok
        ? makeResult(payload.commandId, "completed", `MCP health refreshed: ${payload.data.serverId}`)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP health refresh failed.");
    }

    case "refresh_mcp_discovery": {
      if (!deps.refreshMcpDiscovery) {
        return makeResult(payload.commandId, "failed", "MCP discovery refresh not available.");
      }
      const res = await deps.refreshMcpDiscovery(payload.data.serverId);
      return res.ok
        ? makeResult(payload.commandId, "completed", `MCP discovery refreshed: ${payload.data.serverId}`)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP discovery refresh failed.");
    }

    case "attach_agent": {
      if (!deps.attachAgent) {
        return makeResult(payload.commandId, "failed", "Agent attachment not available.");
      }
      const res = await deps.attachAgent(
        payload.data.agentId,
        payload.data.name,
        payload.data.kind,
        payload.data.capabilities,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `Agent attached: ${payload.data.agentId}`)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent attach failed.");
    }

    case "run_workflow": {
      if (!deps.runWorkflow) {
        return makeResult(payload.commandId, "failed", "Workflow execution not available.");
      }
      const res = await deps.runWorkflow(
        payload.data.dataDir,
        payload.data.hostFile,
        payload.data.artifactId,
        payload.data.stopAfter,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", "Workflow executed successfully.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Workflow failed.");
    }

    case "save_session": {
      if (!deps.saveSession) {
        return makeResult(payload.commandId, "failed", "Session save not available.");
      }
      const res = await deps.saveSession(sessionId);
      return res.ok
        ? makeResult(payload.commandId, "completed", "Session saved.")
        : makeResult(payload.commandId, "failed", res.error ?? "Session save failed.");
    }

    case "restore_session": {
      if (!deps.restoreSession) {
        return makeResult(payload.commandId, "failed", "Session restore not available.");
      }
      const res = await deps.restoreSession(payload.data.sessionId);
      return res.ok
        ? makeResult(payload.commandId, "completed", `Session restored: ${payload.data.sessionId}`)
        : makeResult(payload.commandId, "failed", res.error ?? "Session restore failed.");
    }

    case "inspect_toolchain": {
      if (!deps.inspectToolchain) {
        return makeResult(payload.commandId, "failed", "Toolchain inspection not available.");
      }
      const res = await deps.inspectToolchain();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Toolchain inspected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Toolchain inspection failed.");
    }

    case "run_workspace_check": {
      if (!deps.runWorkspaceCheck) {
        return makeResult(payload.commandId, "failed", "Workspace check execution not available.");
      }
      const res = await deps.runWorkspaceCheck(payload.data.commandType);
      return res.ok
        ? makeResult(payload.commandId, "completed", `Workspace check completed: ${payload.data.commandType}`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Workspace check failed.");
    }

    case "refresh_toolchain_summary": {
      if (!deps.refreshToolchainSummary) {
        return makeResult(payload.commandId, "failed", "Toolchain summary refresh not available.");
      }
      const res = await deps.refreshToolchainSummary();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Toolchain summary refreshed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Toolchain summary refresh failed.");
    }

    case "inspect_language_service": {
      if (!deps.inspectLanguageService) {
        return makeResult(payload.commandId, "failed", "Language service inspection not available.");
      }
      const res = await deps.inspectLanguageService();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Language service inspected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Language service inspection failed.");
    }

    case "collect_diagnostics": {
      if (!deps.collectDiagnostics) {
        return makeResult(payload.commandId, "failed", "Diagnostics collection not available.");
      }
      const res = await deps.collectDiagnostics();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Diagnostics collected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Diagnostics collection failed.");
    }

    case "refresh_diagnostics_summary": {
      if (!deps.refreshDiagnosticsSummary) {
        return makeResult(payload.commandId, "failed", "Diagnostics summary refresh not available.");
      }
      const res = await deps.refreshDiagnosticsSummary();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Diagnostics summary refreshed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Diagnostics summary refresh failed.");
    }
  }
}
