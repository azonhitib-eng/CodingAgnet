/**
 * Structured command/input model for session actions.
 *
 * Phase 28: Structured Command Composer / Session Input Layer.
 *
 * This is a typed, deterministic input layer over existing product capabilities.
 * It is NOT an LLM chat loop, NOT autonomous agent execution, and NOT a command DSL.
 */

/* ------------------------------------------------------------------ */
/*  Command identity                                                   */
/* ------------------------------------------------------------------ */

/** Unique command type identifier. */
export type CommandId =
  | "open_workspace"
  | "clone_repository"
  | "detect_host"
  | "attach_mcp"
  | "refresh_mcp_health"
  | "refresh_mcp_discovery"
  | "attach_agent"
  | "run_workflow"
  | "save_session"
  | "restore_session"
  | "inspect_toolchain"
  | "run_workspace_check"
  | "refresh_toolchain_summary"
  | "inspect_language_service"
  | "collect_diagnostics"
  | "refresh_diagnostics_summary"
  | "list_mcp_tools"
  | "inspect_mcp_tool"
  | "invoke_mcp_tool"
  | "attach_github_mcp"
  | "inspect_workspace_context"
  | "inspect_file_context"
  | "refresh_context_summary";

/** Logical category grouping for commands. */
export type CommandCategory =
  | "workspace"
  | "host"
  | "mcp"
  | "agent"
  | "workflow"
  | "session"
  | "toolchain"
  | "language_service"
  | "language_context";

/* ------------------------------------------------------------------ */
/*  Command definition (static metadata)                               */
/* ------------------------------------------------------------------ */

/** Static definition of a command — describes what it is. */
export interface CommandDefinition {
  /** Command type identifier. */
  readonly id: CommandId;
  /** Logical grouping category. */
  readonly category: CommandCategory;
  /** Human-readable label for display. */
  readonly label: string;
  /** Short description of what the command does. */
  readonly description: string;
  /** Optional suggested target session stage/domain. */
  readonly targetStage?: string;
}

/* ------------------------------------------------------------------ */
/*  Input payload shapes (per command)                                  */
/* ------------------------------------------------------------------ */

export interface OpenWorkspacePayload {
  readonly path: string;
}

export interface CloneRepositoryPayload {
  readonly url: string;
  readonly targetPath: string;
  readonly branch?: string;
}

export type DetectHostPayload = Record<string, never>;

export interface AttachMcpPayload {
  readonly serverId: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly label?: string;
}

export interface RefreshMcpHealthPayload {
  readonly serverId: string;
}

export interface RefreshMcpDiscoveryPayload {
  readonly serverId: string;
}

export interface AttachAgentPayload {
  readonly agentId: string;
  readonly name: string;
  readonly kind?: string;
  readonly capabilities?: readonly string[];
}

export interface RunWorkflowPayload {
  readonly dataDir: string;
  readonly hostFile?: string;
  readonly artifactId?: string;
  readonly stopAfter?: string;
}

export type SaveSessionPayload = Record<string, never>;

export interface RestoreSessionPayload {
  readonly sessionId: string;
}

export type InspectToolchainPayload = Record<string, never>;

export interface RunWorkspaceCheckPayload {
  readonly commandType: string;
}

export type RefreshToolchainSummaryPayload = Record<string, never>;

export type InspectLanguageServicePayload = Record<string, never>;

export type CollectDiagnosticsPayload = Record<string, never>;

export type RefreshDiagnosticsSummaryPayload = Record<string, never>;

export interface ListMcpToolsPayload {
  readonly serverId?: string;
}

export interface InspectMcpToolPayload {
  readonly serverId: string;
  readonly toolId: string;
}

export interface InvokeMcpToolPayload {
  readonly serverId: string;
  readonly toolId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly reason?: string;
}

export interface AttachGitHubMcpPayload {
  readonly token?: string;
}

export type InspectWorkspaceContextPayload = Record<string, never>;

export interface InspectFileContextPayload {
  readonly filePath: string;
}

export type RefreshContextSummaryPayload = Record<string, never>;

/** Discriminated union of all command payloads. */
export type CommandPayload =
  | { readonly commandId: "open_workspace"; readonly data: OpenWorkspacePayload }
  | { readonly commandId: "clone_repository"; readonly data: CloneRepositoryPayload }
  | { readonly commandId: "detect_host"; readonly data: DetectHostPayload }
  | { readonly commandId: "attach_mcp"; readonly data: AttachMcpPayload }
  | { readonly commandId: "refresh_mcp_health"; readonly data: RefreshMcpHealthPayload }
  | { readonly commandId: "refresh_mcp_discovery"; readonly data: RefreshMcpDiscoveryPayload }
  | { readonly commandId: "attach_agent"; readonly data: AttachAgentPayload }
  | { readonly commandId: "run_workflow"; readonly data: RunWorkflowPayload }
  | { readonly commandId: "save_session"; readonly data: SaveSessionPayload }
  | { readonly commandId: "restore_session"; readonly data: RestoreSessionPayload }
  | { readonly commandId: "inspect_toolchain"; readonly data: InspectToolchainPayload }
  | { readonly commandId: "run_workspace_check"; readonly data: RunWorkspaceCheckPayload }
  | { readonly commandId: "refresh_toolchain_summary"; readonly data: RefreshToolchainSummaryPayload }
  | { readonly commandId: "inspect_language_service"; readonly data: InspectLanguageServicePayload }
  | { readonly commandId: "collect_diagnostics"; readonly data: CollectDiagnosticsPayload }
  | { readonly commandId: "refresh_diagnostics_summary"; readonly data: RefreshDiagnosticsSummaryPayload }
  | { readonly commandId: "list_mcp_tools"; readonly data: ListMcpToolsPayload }
  | { readonly commandId: "inspect_mcp_tool"; readonly data: InspectMcpToolPayload }
  | { readonly commandId: "invoke_mcp_tool"; readonly data: InvokeMcpToolPayload }
  | { readonly commandId: "attach_github_mcp"; readonly data: AttachGitHubMcpPayload }
  | { readonly commandId: "inspect_workspace_context"; readonly data: InspectWorkspaceContextPayload }
  | { readonly commandId: "inspect_file_context"; readonly data: InspectFileContextPayload }
  | { readonly commandId: "refresh_context_summary"; readonly data: RefreshContextSummaryPayload };

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Single field-level validation issue. */
export interface CommandFieldError {
  readonly field: string;
  readonly message: string;
}

/** Result of validating a command before execution. */
export interface CommandValidationResult {
  readonly valid: boolean;
  readonly errors: readonly CommandFieldError[];
}

/* ------------------------------------------------------------------ */
/*  Execution status                                                   */
/* ------------------------------------------------------------------ */

/** Execution lifecycle status. */
export type CommandExecutionStatus =
  | "pending"
  | "validating"
  | "executing"
  | "completed"
  | "failed"
  | "validation_failed";

/** Summary of a command execution attempt. */
export interface CommandExecutionResult {
  readonly commandId: CommandId;
  readonly status: CommandExecutionStatus;
  readonly message: string;
  readonly detail?: Record<string, unknown>;
  readonly timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  Command submission (full request envelope)                         */
/* ------------------------------------------------------------------ */

/** A fully-typed command submission — input + metadata. */
export interface CommandSubmission {
  readonly sessionId: string;
  readonly payload: CommandPayload;
}

/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/* ------------------------------------------------------------------ */

/** Whether a command is currently available and why. */
export interface CommandAvailability {
  readonly commandId: CommandId;
  readonly available: boolean;
  /** Human-readable reason when not available. */
  readonly reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Command registry — static definitions                              */
/* ------------------------------------------------------------------ */

/** All supported command definitions. */
export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  {
    id: "open_workspace",
    category: "workspace",
    label: "Open Workspace",
    description: "Open an existing local directory as the session workspace.",
    targetStage: "workspace_binding",
  },
  {
    id: "clone_repository",
    category: "workspace",
    label: "Clone Repository",
    description: "Clone a remote repository to a local path.",
    targetStage: "workspace_binding",
  },
  {
    id: "detect_host",
    category: "host",
    label: "Detect Host",
    description: "Detect the current machine's hardware and runtime profile.",
    targetStage: "host_detection",
  },
  {
    id: "attach_mcp",
    category: "mcp",
    label: "Attach MCP Server",
    description: "Attach an MCP server to the current session.",
  },
  {
    id: "refresh_mcp_health",
    category: "mcp",
    label: "Refresh MCP Health",
    description: "Refresh health status for an attached MCP server.",
  },
  {
    id: "refresh_mcp_discovery",
    category: "mcp",
    label: "Refresh MCP Discovery",
    description: "Re-run capability discovery for an attached MCP server.",
  },
  {
    id: "attach_agent",
    category: "agent",
    label: "Attach Agent",
    description: "Register and attach an agent to the current session.",
  },
  {
    id: "run_workflow",
    category: "workflow",
    label: "Run Workflow",
    description: "Execute the evaluation workflow with specified inputs.",
    targetStage: "workflow_running",
  },
  {
    id: "save_session",
    category: "session",
    label: "Save Session",
    description: "Persist the current session to disk.",
  },
  {
    id: "restore_session",
    category: "session",
    label: "Restore Session",
    description: "Restore a previously saved session.",
  },
  {
    id: "inspect_toolchain",
    category: "toolchain",
    label: "Inspect Toolchain",
    description: "Inspect available toolchain commands and checks for the current workspace.",
  },
  {
    id: "run_workspace_check",
    category: "toolchain",
    label: "Run Workspace Check",
    description: "Run a specific toolchain check (lint, test, build, etc.) explicitly.",
  },
  {
    id: "refresh_toolchain_summary",
    category: "toolchain",
    label: "Refresh Toolchain Summary",
    description: "Re-generate the workspace toolchain summary based on current state.",
  },
  {
    id: "inspect_language_service",
    category: "language_service",
    label: "Inspect Language Service",
    description: "Inspect language-service availability and diagnostics support for the current workspace.",
  },
  {
    id: "collect_diagnostics",
    category: "language_service",
    label: "Collect Diagnostics",
    description: "Run an explicit diagnostics collection for the current workspace.",
  },
  {
    id: "refresh_diagnostics_summary",
    category: "language_service",
    label: "Refresh Diagnostics Summary",
    description: "Re-assess language-service availability and refresh diagnostics summary.",
  },
  {
    id: "list_mcp_tools",
    category: "mcp",
    label: "List MCP Tools",
    description: "List all available tools from attached MCP servers.",
  },
  {
    id: "inspect_mcp_tool",
    category: "mcp",
    label: "Inspect MCP Tool",
    description: "Get detailed metadata for a specific MCP tool.",
  },
  {
    id: "invoke_mcp_tool",
    category: "mcp",
    label: "Invoke MCP Tool",
    description: "Explicitly invoke a read-only MCP tool with provided inputs.",
  },
  {
    id: "attach_github_mcp",
    category: "mcp",
    label: "Attach GitHub MCP",
    description: "Attach a GitHub MCP server and register known GitHub tools.",
  },
  {
    id: "inspect_workspace_context",
    category: "language_context",
    label: "Inspect Workspace Context",
    description: "Inspect profile-aware workspace context: entrypoints, config, tests, notable symbols.",
  },
  {
    id: "inspect_file_context",
    category: "language_context",
    label: "Inspect File Context",
    description: "Inspect context for a specific file: symbols, imports, exports, role.",
  },
  {
    id: "refresh_context_summary",
    category: "language_context",
    label: "Refresh Context Summary",
    description: "Re-collect workspace context summary using current profile and file inventory.",
  },
] as const;

/** Lookup a command definition by id. */
export function getCommandDefinition(id: CommandId): CommandDefinition | undefined {
  return COMMAND_DEFINITIONS.find((d) => d.id === id);
}

/** All known command IDs. */
export const ALL_COMMAND_IDS: readonly CommandId[] = COMMAND_DEFINITIONS.map((d) => d.id);

/** All known command categories. */
export const ALL_COMMAND_CATEGORIES: readonly CommandCategory[] = [
  "workspace",
  "host",
  "mcp",
  "agent",
  "workflow",
  "session",
  "toolchain",
  "language_service",
  "language_context",
] as const;

/** Group command definitions by category. */
export function groupByCategory(): ReadonlyMap<CommandCategory, readonly CommandDefinition[]> {
  const map = new Map<CommandCategory, CommandDefinition[]>();
  for (const def of COMMAND_DEFINITIONS) {
    const list = map.get(def.category) ?? [];
    list.push(def);
    map.set(def.category, list);
  }
  return map;
}
