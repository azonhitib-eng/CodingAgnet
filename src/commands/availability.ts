/**
 * Command availability logic.
 *
 * Phase 28: Determines which commands are currently available based on
 * session, workspace, MCP, and agent state.
 *
 * Simple and deterministic — no magic.
 */

import type { CommandId, CommandAvailability } from "./types.js";
import { ALL_COMMAND_IDS } from "./types.js";
import type { SessionSummary } from "../session/session-manager.js";

/* ------------------------------------------------------------------ */
/*  State snapshot used for availability checks                        */
/* ------------------------------------------------------------------ */

/** Minimal state snapshot for evaluating command availability. */
export interface CommandContextState {
  /** Whether a session exists and is active. */
  readonly hasActiveSession: boolean;
  /** The current session summary (if available). */
  readonly sessionSummary: SessionSummary | null;
}

/* ------------------------------------------------------------------ */
/*  Per-command availability evaluators                                 */
/* ------------------------------------------------------------------ */

function checkOpenWorkspace(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "open_workspace", available: false, reason: "No active session." };
  }
  return { commandId: "open_workspace", available: true };
}

function checkCloneRepository(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "clone_repository", available: false, reason: "No active session." };
  }
  return { commandId: "clone_repository", available: true };
}

function checkDetectHost(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "detect_host", available: false, reason: "No active session." };
  }
  return { commandId: "detect_host", available: true };
}

function checkAttachMcp(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "attach_mcp", available: false, reason: "No active session." };
  }
  return { commandId: "attach_mcp", available: true };
}

function checkRefreshMcpHealth(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "refresh_mcp_health", available: false, reason: "No active session." };
  }
  const s = ctx.sessionSummary;
  if (!s || s.mcpServerCount === 0) {
    return { commandId: "refresh_mcp_health", available: false, reason: "No MCP servers attached." };
  }
  return { commandId: "refresh_mcp_health", available: true };
}

function checkRefreshMcpDiscovery(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "refresh_mcp_discovery", available: false, reason: "No active session." };
  }
  const s = ctx.sessionSummary;
  if (!s || s.mcpServerCount === 0) {
    return { commandId: "refresh_mcp_discovery", available: false, reason: "No MCP servers attached." };
  }
  return { commandId: "refresh_mcp_discovery", available: true };
}

function checkAttachAgent(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "attach_agent", available: false, reason: "No active session." };
  }
  return { commandId: "attach_agent", available: true };
}

function checkRunWorkflow(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "run_workflow", available: false, reason: "No active session." };
  }
  return { commandId: "run_workflow", available: true };
}

function checkSaveSession(ctx: CommandContextState): CommandAvailability {
  if (!ctx.hasActiveSession) {
    return { commandId: "save_session", available: false, reason: "No active session." };
  }
  return { commandId: "save_session", available: true };
}

function checkRestoreSession(_ctx: CommandContextState): CommandAvailability {
  // Restore is always available — it targets a persisted session.
  return { commandId: "restore_session", available: true };
}

/* ------------------------------------------------------------------ */
/*  Availability dispatcher                                            */
/* ------------------------------------------------------------------ */

const CHECKERS: Record<CommandId, (ctx: CommandContextState) => CommandAvailability> = {
  open_workspace: checkOpenWorkspace,
  clone_repository: checkCloneRepository,
  detect_host: checkDetectHost,
  attach_mcp: checkAttachMcp,
  refresh_mcp_health: checkRefreshMcpHealth,
  refresh_mcp_discovery: checkRefreshMcpDiscovery,
  attach_agent: checkAttachAgent,
  run_workflow: checkRunWorkflow,
  save_session: checkSaveSession,
  restore_session: checkRestoreSession,
};

/** Get availability of a single command given the current state. */
export function getCommandAvailability(
  commandId: CommandId,
  ctx: CommandContextState,
): CommandAvailability {
  const checker = CHECKERS[commandId];
  return checker(ctx);
}

/** Get availability for all commands given the current state. */
export function getAllCommandAvailability(
  ctx: CommandContextState,
): readonly CommandAvailability[] {
  return ALL_COMMAND_IDS.map((id) => getCommandAvailability(id, ctx));
}

/** Filter to only available command IDs. */
export function getAvailableCommandIds(ctx: CommandContextState): readonly CommandId[] {
  return getAllCommandAvailability(ctx)
    .filter((a) => a.available)
    .map((a) => a.commandId);
}
