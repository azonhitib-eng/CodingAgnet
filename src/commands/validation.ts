/**
 * Command input validation.
 *
 * Phase 28: Validates command payloads before execution.
 * Produces structured field-level errors, not raw exceptions.
 */

import type {
  CommandPayload,
  CommandValidationResult,
  CommandFieldError,
  OpenWorkspacePayload,
  CloneRepositoryPayload,
  AttachMcpPayload,
  RefreshMcpHealthPayload,
  RefreshMcpDiscoveryPayload,
  AttachAgentPayload,
  RunWorkflowPayload,
  RestoreSessionPayload,
  RunWorkspaceCheckPayload,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fieldError(field: string, message: string): CommandFieldError {
  return { field, message };
}

const VALID_OK: CommandValidationResult = { valid: true, errors: [] };

function invalid(errors: CommandFieldError[]): CommandValidationResult {
  return { valid: false, errors };
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/*  Per-command validators                                             */
/* ------------------------------------------------------------------ */

export function validateOpenWorkspace(data: OpenWorkspacePayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.path)) {
    errors.push(fieldError("path", "Workspace path is required."));
  } else {
    const p = data.path.trim();
    if (!p.startsWith("/") && !p.match(/^[A-Z]:\\/i)) {
      errors.push(fieldError("path", "Workspace path must be absolute (e.g. /home/user/project)."));
    }
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateCloneRepository(data: CloneRepositoryPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.url)) {
    errors.push(fieldError("url", "Clone URL is required."));
  } else {
    const u = data.url.trim();
    const isHttps = u.startsWith("https://");
    const isHttp = u.startsWith("http://");
    const isGit = u.startsWith("git://");
    const isSsh = u.includes("@") && u.includes(":");
    const isFile = u.startsWith("file://");
    if (isFile) {
      errors.push(fieldError("url", "file:// URLs are not allowed for clone. Use a remote URL."));
    } else if (!isHttps && !isHttp && !isGit && !isSsh) {
      errors.push(fieldError("url", "Clone URL must be an https://, http://, git://, or SSH URL."));
    }
  }
  if (!isNonEmpty(data.targetPath)) {
    errors.push(fieldError("targetPath", "Target path is required."));
  } else {
    const tp = data.targetPath.trim();
    if (!tp.startsWith("/") && !tp.match(/^[A-Z]:\\/i)) {
      errors.push(fieldError("targetPath", "Target path must be absolute."));
    }
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateAttachMcp(data: AttachMcpPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.serverId)) {
    errors.push(fieldError("serverId", "MCP server ID is required."));
  }
  if (!isNonEmpty(data.command)) {
    errors.push(fieldError("command", "MCP server command is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateRefreshMcpHealth(data: RefreshMcpHealthPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.serverId)) {
    errors.push(fieldError("serverId", "MCP server ID is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateRefreshMcpDiscovery(data: RefreshMcpDiscoveryPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.serverId)) {
    errors.push(fieldError("serverId", "MCP server ID is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateAttachAgent(data: AttachAgentPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.agentId)) {
    errors.push(fieldError("agentId", "Agent ID is required."));
  }
  if (!isNonEmpty(data.name)) {
    errors.push(fieldError("name", "Agent name is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateRunWorkflow(data: RunWorkflowPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.dataDir)) {
    errors.push(fieldError("dataDir", "Data directory is required."));
  } else {
    const d = data.dataDir.trim();
    if (!d.startsWith("/") && !d.match(/^[A-Z]:\\/i)) {
      errors.push(fieldError("dataDir", "Data directory must be absolute."));
    }
  }
  if (data.hostFile !== undefined && data.hostFile !== "") {
    const hf = data.hostFile.trim();
    if (!hf.endsWith(".json")) {
      errors.push(fieldError("hostFile", "Host file must be a .json file."));
    }
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateRestoreSession(data: RestoreSessionPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.sessionId)) {
    errors.push(fieldError("sessionId", "Session ID is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateRunWorkspaceCheck(data: RunWorkspaceCheckPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.commandType)) {
    errors.push(fieldError("commandType", "Command type is required (e.g. lint, test, build)."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

/* ------------------------------------------------------------------ */
/*  Top-level dispatcher                                               */
/* ------------------------------------------------------------------ */

/** Validate a command payload based on its type. */
export function validateCommand(payload: CommandPayload): CommandValidationResult {
  switch (payload.commandId) {
    case "open_workspace":
      return validateOpenWorkspace(payload.data);
    case "clone_repository":
      return validateCloneRepository(payload.data);
    case "detect_host":
      return VALID_OK; // No inputs required.
    case "attach_mcp":
      return validateAttachMcp(payload.data);
    case "refresh_mcp_health":
      return validateRefreshMcpHealth(payload.data);
    case "refresh_mcp_discovery":
      return validateRefreshMcpDiscovery(payload.data);
    case "attach_agent":
      return validateAttachAgent(payload.data);
    case "run_workflow":
      return validateRunWorkflow(payload.data);
    case "save_session":
      return VALID_OK; // No inputs required.
    case "restore_session":
      return validateRestoreSession(payload.data);
    case "inspect_toolchain":
      return VALID_OK; // No inputs required.
    case "run_workspace_check":
      return validateRunWorkspaceCheck(payload.data);
    case "refresh_toolchain_summary":
      return VALID_OK; // No inputs required.
  }
}
