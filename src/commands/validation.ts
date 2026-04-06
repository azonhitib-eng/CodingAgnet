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
  InspectMcpToolPayload,
  InvokeMcpToolPayload,
  InspectFileContextPayload,
  InspectAgentContextPayload,
  BuildAgentPromptContextPayload,
  RunAgentTaskPayload,
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

export function validateInspectMcpTool(data: InspectMcpToolPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.serverId)) {
    errors.push(fieldError("serverId", "MCP server ID is required."));
  }
  if (!isNonEmpty(data.toolId)) {
    errors.push(fieldError("toolId", "Tool ID is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateInvokeMcpTool(data: InvokeMcpToolPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.serverId)) {
    errors.push(fieldError("serverId", "MCP server ID is required."));
  }
  if (!isNonEmpty(data.toolId)) {
    errors.push(fieldError("toolId", "Tool ID is required."));
  }
  if (data.input === undefined || data.input === null || typeof data.input !== "object") {
    errors.push(fieldError("input", "Tool input must be an object."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateInspectFileContext(data: InspectFileContextPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.filePath)) {
    errors.push(fieldError("filePath", "File path is required."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

const VALID_AGENT_KINDS = ["system", "coding", "review", "planning", "testing", "external"];

export function validateInspectAgentContext(data: InspectAgentContextPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.agentKind)) {
    errors.push(fieldError("agentKind", "Agent kind is required."));
  } else if (!VALID_AGENT_KINDS.includes(data.agentKind)) {
    errors.push(fieldError("agentKind", `Invalid agent kind. Must be one of: ${VALID_AGENT_KINDS.join(", ")}.`));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

export function validateBuildAgentPromptContext(data: BuildAgentPromptContextPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.agentKind)) {
    errors.push(fieldError("agentKind", "Agent kind is required."));
  } else if (!VALID_AGENT_KINDS.includes(data.agentKind)) {
    errors.push(fieldError("agentKind", `Invalid agent kind. Must be one of: ${VALID_AGENT_KINDS.join(", ")}.`));
  }
  if (data.maxTotalChars !== undefined && (typeof data.maxTotalChars !== "number" || data.maxTotalChars < 100)) {
    errors.push(fieldError("maxTotalChars", "Max total chars must be a number >= 100."));
  }
  if (data.maxSlices !== undefined && (typeof data.maxSlices !== "number" || data.maxSlices < 1)) {
    errors.push(fieldError("maxSlices", "Max slices must be a number >= 1."));
  }
  return errors.length > 0 ? invalid(errors) : VALID_OK;
}

const VALID_TASK_KINDS = [
  "summarize_workspace",
  "review_diagnostics",
  "explain_files",
  "summarize_github",
  "general_query",
  "custom",
];

export function validateRunAgentTask(data: RunAgentTaskPayload): CommandValidationResult {
  const errors: CommandFieldError[] = [];
  if (!isNonEmpty(data.taskKind)) {
    errors.push(fieldError("taskKind", "Task kind is required."));
  } else if (!VALID_TASK_KINDS.includes(data.taskKind)) {
    errors.push(fieldError("taskKind", `Invalid task kind. Must be one of: ${VALID_TASK_KINDS.join(", ")}.`));
  }
  if ((data.taskKind === "custom" || data.taskKind === "general_query") && !isNonEmpty(data.taskDescription)) {
    errors.push(fieldError("taskDescription", `Task description is required for "${data.taskKind}" tasks.`));
  }
  if (data.preferredAgentKind !== undefined && !VALID_AGENT_KINDS.includes(data.preferredAgentKind)) {
    errors.push(fieldError("preferredAgentKind", `Invalid agent kind. Must be one of: ${VALID_AGENT_KINDS.join(", ")}.`));
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
    case "inspect_language_service":
      return VALID_OK; // No inputs required.
    case "collect_diagnostics":
      return VALID_OK; // No inputs required.
    case "refresh_diagnostics_summary":
      return VALID_OK; // No inputs required.
    case "list_mcp_tools":
      return VALID_OK; // Optional serverId filter, no required fields.
    case "inspect_mcp_tool":
      return validateInspectMcpTool(payload.data);
    case "invoke_mcp_tool":
      return validateInvokeMcpTool(payload.data);
    case "attach_github_mcp":
      return VALID_OK; // Optional token, no required fields.
    case "inspect_workspace_context":
      return VALID_OK; // No inputs required.
    case "inspect_file_context":
      return validateInspectFileContext(payload.data);
    case "refresh_context_summary":
      return VALID_OK; // No inputs required.
    case "inspect_agent_context":
      return validateInspectAgentContext(payload.data);
    case "build_agent_prompt_context":
      return validateBuildAgentPromptContext(payload.data);
    case "refresh_agent_context":
      return VALID_OK; // No inputs required.
    case "run_agent_task":
      return validateRunAgentTask(payload.data);
    case "inspect_agent_run":
      return VALID_OK; // Optional runId, no required fields.
    case "inspect_agent_adapter":
      return VALID_OK; // No required fields.
    case "refresh_agent_adapter_status":
      return VALID_OK; // No required fields.
  }
}
