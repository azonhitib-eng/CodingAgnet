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
  /** List MCP tools. Returns {ok, error?, detail?}. */
  readonly listMcpTools?: (
    serverId?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect a specific MCP tool. Returns {ok, error?, detail?}. */
  readonly inspectMcpTool?: (
    serverId: string,
    toolId: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Invoke an MCP tool. Returns {ok, error?, detail?}. */
  readonly invokeMcpTool?: (
    serverId: string,
    toolId: string,
    input: Readonly<Record<string, unknown>>,
    reason?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Attach GitHub MCP server. Returns {ok, error?, detail?}. */
  readonly attachGitHubMcp?: (
    token?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect workspace context. Returns {ok, error?, detail?}. */
  readonly inspectWorkspaceContext?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect file context. Returns {ok, error?, detail?}. */
  readonly inspectFileContext?: (
    filePath: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Refresh context summary. Returns {ok, error?, detail?}. */
  readonly refreshContextSummary?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect agent context. Returns {ok, error?, detail?}. */
  readonly inspectAgentContext?: (
    agentKind: string,
    roleHint?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Build agent prompt context. Returns {ok, error?, detail?}. */
  readonly buildAgentPromptContext?: (
    agentKind: string,
    roleHint?: string,
    maxTotalChars?: number,
    maxSlices?: number,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Refresh agent context. Returns {ok, error?, detail?}. */
  readonly refreshAgentContext?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Run an agent task. Returns {ok, error?, detail?}. */
  readonly runAgentTask?: (
    taskKind: string,
    taskDescription?: string,
    targetAgentId?: string,
    preferredAgentKind?: string,
    preferredRoleHint?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect an agent run. Returns {ok, error?, detail?}. */
  readonly inspectAgentRun?: (
    runId?: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Inspect the current agent execution adapter. Returns {ok, error?, detail?}. */
  readonly inspectAgentAdapter?: () => Promise<{
    ok: boolean;
    error?: string;
    detail?: Record<string, unknown>;
  }>;
  /** Refresh the agent execution adapter status. Returns {ok, error?, detail?}. */
  readonly refreshAgentAdapterStatus?: () => Promise<{
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

    case "list_mcp_tools": {
      if (!deps.listMcpTools) {
        return makeResult(payload.commandId, "failed", "MCP tool listing not available.");
      }
      const res = await deps.listMcpTools(payload.data.serverId);
      return res.ok
        ? makeResult(payload.commandId, "completed", "MCP tools listed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP tool listing failed.");
    }

    case "inspect_mcp_tool": {
      if (!deps.inspectMcpTool) {
        return makeResult(payload.commandId, "failed", "MCP tool inspection not available.");
      }
      const res = await deps.inspectMcpTool(payload.data.serverId, payload.data.toolId);
      return res.ok
        ? makeResult(payload.commandId, "completed", `MCP tool inspected: ${payload.data.toolId}`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP tool inspection failed.");
    }

    case "invoke_mcp_tool": {
      if (!deps.invokeMcpTool) {
        return makeResult(payload.commandId, "failed", "MCP tool invocation not available.");
      }
      const res = await deps.invokeMcpTool(
        payload.data.serverId,
        payload.data.toolId,
        payload.data.input,
        payload.data.reason,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `MCP tool invoked: ${payload.data.toolId}`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "MCP tool invocation failed.");
    }

    case "attach_github_mcp": {
      if (!deps.attachGitHubMcp) {
        return makeResult(payload.commandId, "failed", "GitHub MCP attachment not available.");
      }
      const res = await deps.attachGitHubMcp(payload.data.token);
      return res.ok
        ? makeResult(payload.commandId, "completed", "GitHub MCP server attached.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "GitHub MCP attachment failed.");
    }

    case "inspect_workspace_context": {
      if (!deps.inspectWorkspaceContext) {
        return makeResult(payload.commandId, "failed", "Workspace context inspection not available.");
      }
      const res = await deps.inspectWorkspaceContext();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Workspace context inspected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Workspace context inspection failed.");
    }

    case "inspect_file_context": {
      if (!deps.inspectFileContext) {
        return makeResult(payload.commandId, "failed", "File context inspection not available.");
      }
      const res = await deps.inspectFileContext(payload.data.filePath);
      return res.ok
        ? makeResult(payload.commandId, "completed", `File context inspected: ${payload.data.filePath}`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "File context inspection failed.");
    }

    case "refresh_context_summary": {
      if (!deps.refreshContextSummary) {
        return makeResult(payload.commandId, "failed", "Context summary refresh not available.");
      }
      const res = await deps.refreshContextSummary();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Context summary refreshed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Context summary refresh failed.");
    }

    case "inspect_agent_context": {
      if (!deps.inspectAgentContext) {
        return makeResult(payload.commandId, "failed", "Agent context inspection not available.");
      }
      const res = await deps.inspectAgentContext(payload.data.agentKind, payload.data.roleHint);
      return res.ok
        ? makeResult(payload.commandId, "completed", `Agent context inspected for ${payload.data.agentKind}.`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent context inspection failed.");
    }

    case "build_agent_prompt_context": {
      if (!deps.buildAgentPromptContext) {
        return makeResult(payload.commandId, "failed", "Agent prompt context build not available.");
      }
      const res = await deps.buildAgentPromptContext(
        payload.data.agentKind,
        payload.data.roleHint,
        payload.data.maxTotalChars,
        payload.data.maxSlices,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `Agent prompt context built for ${payload.data.agentKind}.`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent prompt context build failed.");
    }

    case "refresh_agent_context": {
      if (!deps.refreshAgentContext) {
        return makeResult(payload.commandId, "failed", "Agent context refresh not available.");
      }
      const res = await deps.refreshAgentContext();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Agent context refreshed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent context refresh failed.");
    }

    case "run_agent_task": {
      if (!deps.runAgentTask) {
        return makeResult(payload.commandId, "failed", "Agent task execution not available.");
      }
      const res = await deps.runAgentTask(
        payload.data.taskKind,
        payload.data.taskDescription,
        payload.data.targetAgentId,
        payload.data.preferredAgentKind,
        payload.data.preferredRoleHint,
      );
      return res.ok
        ? makeResult(payload.commandId, "completed", `Agent task completed: ${payload.data.taskKind}.`, res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent task execution failed.");
    }

    case "inspect_agent_run": {
      if (!deps.inspectAgentRun) {
        return makeResult(payload.commandId, "failed", "Agent run inspection not available.");
      }
      const res = await deps.inspectAgentRun(payload.data.runId);
      return res.ok
        ? makeResult(payload.commandId, "completed", "Agent run inspected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent run inspection failed.");
    }

    case "inspect_agent_adapter": {
      if (!deps.inspectAgentAdapter) {
        return makeResult(payload.commandId, "failed", "Agent adapter inspection not available.");
      }
      const res = await deps.inspectAgentAdapter();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Agent adapter inspected.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent adapter inspection failed.");
    }

    case "refresh_agent_adapter_status": {
      if (!deps.refreshAgentAdapterStatus) {
        return makeResult(payload.commandId, "failed", "Agent adapter status refresh not available.");
      }
      const res = await deps.refreshAgentAdapterStatus();
      return res.ok
        ? makeResult(payload.commandId, "completed", "Agent adapter status refreshed.", res.detail)
        : makeResult(payload.commandId, "failed", res.error ?? "Agent adapter status refresh failed.");
    }
  }
}
