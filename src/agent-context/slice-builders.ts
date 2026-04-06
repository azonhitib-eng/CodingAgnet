/**
 * Context slice builders.
 *
 * Phase 44: Deterministic builders that extract context slices from
 * existing structured summaries. Each builder produces one or more
 * AgentPromptContextSlice from a single source.
 *
 * Every slice carries explicit reasons and evidence — no hidden heuristics.
 */

import type {
  AgentPromptContextSlice,
  AgentPromptPriority,
  AgentPromptReason,
  AgentPromptEvidence,
  AgentPromptSliceSource,
  AgentPromptBudget,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeSlice(
  sliceId: string,
  source: AgentPromptSliceSource,
  label: string,
  priority: AgentPromptPriority,
  content: Readonly<Record<string, unknown>>,
  textContent: string,
  reasons: readonly AgentPromptReason[],
  evidence: readonly AgentPromptEvidence[],
): AgentPromptContextSlice {
  return {
    sliceId,
    source,
    label,
    priority,
    content,
    textContent,
    charCount: textContent.length,
    reasons,
    evidence,
    trimmed: false,
    originalCharCount: null,
  };
}

function includeReason(kind: AgentPromptReason["kind"], explanation: string): AgentPromptReason {
  return { kind, explanation, effect: "included" };
}

function excludeReason(kind: AgentPromptReason["kind"], explanation: string): AgentPromptReason {
  return { kind, explanation, effect: "excluded" };
}

function evidence(source: string, description: string, reference?: string): AgentPromptEvidence {
  return { source, description, ...(reference !== undefined ? { reference } : {}) };
}

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "(unknown)";
  return String(val);
}

/* ------------------------------------------------------------------ */
/*  Session slice                                                      */
/* ------------------------------------------------------------------ */

export function buildSessionSlice(
  sessionSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!sessionSummary) {
    return makeSlice(
      "session_summary",
      "session",
      "Session Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No session summary available")],
      [],
    );
  }

  const lines: string[] = [
    `Session ID: ${safeStr(sessionSummary.id)}`,
    `Stage: ${safeStr(sessionSummary.stage)}`,
    `Status: ${safeStr(sessionSummary.status)}`,
  ];
  if (sessionSummary.workspacePath) lines.push(`Workspace: ${safeStr(sessionSummary.workspacePath)}`);
  if (sessionSummary.branch) lines.push(`Branch: ${safeStr(sessionSummary.branch)}`);
  if (sessionSummary.eventCount !== undefined) lines.push(`Events: ${safeStr(sessionSummary.eventCount)}`);

  const text = lines.join("\n");
  return makeSlice(
    "session_summary",
    "session",
    "Session Summary",
    "high",
    sessionSummary,
    text,
    [includeReason("always_included", "Session context is always provided to agents")],
    [evidence("session", "Current session state snapshot")],
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace slice                                                    */
/* ------------------------------------------------------------------ */

export function buildWorkspaceSlice(
  workspaceSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!workspaceSummary) {
    return makeSlice(
      "workspace_summary",
      "workspace",
      "Workspace Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No workspace summary available")],
      [],
    );
  }

  const lines: string[] = [
    `Path: ${safeStr(workspaceSummary.path)}`,
    `Source: ${safeStr(workspaceSummary.source)}`,
    `Status: ${safeStr(workspaceSummary.status)}`,
  ];
  if (workspaceSummary.branch) lines.push(`Branch: ${safeStr(workspaceSummary.branch)}`);
  if (workspaceSummary.isGitRepo !== undefined) lines.push(`Git repo: ${safeStr(workspaceSummary.isGitRepo)}`);
  if (workspaceSummary.remoteUrl) lines.push(`Remote: ${safeStr(workspaceSummary.remoteUrl)}`);

  const text = lines.join("\n");
  return makeSlice(
    "workspace_summary",
    "workspace",
    "Workspace Summary",
    "high",
    workspaceSummary,
    text,
    [includeReason("always_included", "Workspace context is always provided to agents")],
    [evidence("workspace", "Current workspace state")],
  );
}

/* ------------------------------------------------------------------ */
/*  Fingerprint / profile slice                                        */
/* ------------------------------------------------------------------ */

export function buildFingerprintSlice(
  fingerprintSummary: Readonly<Record<string, unknown>> | null | undefined,
  profileSelection: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!fingerprintSummary && !profileSelection) {
    return makeSlice(
      "fingerprint_profile",
      "fingerprint",
      "Repository Fingerprint & Profile",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No fingerprint or profile data available")],
      [],
    );
  }

  const content: Record<string, unknown> = {};
  const lines: string[] = [];

  if (fingerprintSummary) {
    const languages = fingerprintSummary.languages;
    const frameworks = fingerprintSummary.frameworks;
    if (Array.isArray(languages) && languages.length > 0) {
      lines.push(`Languages: ${languages.join(", ")}`);
      content.languages = languages;
    }
    if (Array.isArray(frameworks) && frameworks.length > 0) {
      const fwNames = frameworks.map((f: unknown) =>
        typeof f === "object" && f !== null && "name" in f ? (f as Record<string, unknown>).name : String(f),
      );
      lines.push(`Frameworks: ${fwNames.join(", ")}`);
      content.frameworks = fwNames;
    }
    if (fingerprintSummary.isMixed !== undefined) {
      lines.push(`Mixed project: ${safeStr(fingerprintSummary.isMixed)}`);
      content.isMixed = fingerprintSummary.isMixed;
    }
  }

  if (profileSelection) {
    const primary = profileSelection.primary;
    if (typeof primary === "object" && primary !== null) {
      const p = primary as Record<string, unknown>;
      lines.push(`Profile: ${safeStr(p.id)} (${safeStr(p.label)})`);
      content.profileId = p.id;
      content.profileLabel = p.label;
      content.primaryLanguage = p.primaryLanguage;
    }
    if (profileSelection.reason) {
      lines.push(`Selection reason: ${safeStr(profileSelection.reason)}`);
      content.selectionReason = profileSelection.reason;
    }
    if (profileSelection.confident !== undefined) {
      lines.push(`Confident: ${safeStr(profileSelection.confident)}`);
      content.confident = profileSelection.confident;
    }
  }

  const text = lines.join("\n");
  return makeSlice(
    "fingerprint_profile",
    "fingerprint",
    "Repository Fingerprint & Profile",
    "critical",
    content,
    text,
    [includeReason("profile_match", "Repository profile informs agent context assembly")],
    [
      ...(fingerprintSummary ? [evidence("fingerprint", "Repository fingerprint analysis")] : []),
      ...(profileSelection ? [evidence("fingerprint", "Profile selection result")] : []),
    ],
  );
}

/* ------------------------------------------------------------------ */
/*  Toolchain slice                                                    */
/* ------------------------------------------------------------------ */

export function buildToolchainSlice(
  toolchainSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!toolchainSummary) {
    return makeSlice(
      "toolchain_summary",
      "toolchain",
      "Toolchain Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No toolchain summary available")],
      [],
    );
  }

  const lines: string[] = [];
  lines.push(`Toolchain: ${safeStr(toolchainSummary.toolchainKind)}`);
  lines.push(`Profile: ${safeStr(toolchainSummary.profileId)}`);

  const commands = toolchainSummary.commands;
  if (Array.isArray(commands)) {
    lines.push(`Commands: ${commands.length}`);
  }

  const recommended = toolchainSummary.recommended;
  if (Array.isArray(recommended) && recommended.length > 0) {
    const labels = recommended.map((c: unknown) =>
      typeof c === "object" && c !== null && "label" in c ? (c as Record<string, unknown>).label : String(c),
    );
    lines.push(`Recommended checks: ${labels.join(", ")}`);
  }

  const unavailable = toolchainSummary.unavailable;
  if (Array.isArray(unavailable) && unavailable.length > 0) {
    lines.push(`Unavailable: ${unavailable.length} check(s)`);
  }

  const text = lines.join("\n");
  return makeSlice(
    "toolchain_summary",
    "toolchain",
    "Toolchain Summary",
    "high",
    toolchainSummary,
    text,
    [includeReason("profile_match", "Toolchain summary is profile-specific context")],
    [evidence("toolchain", "Workspace toolchain assessment")],
  );
}

/* ------------------------------------------------------------------ */
/*  Diagnostics slice                                                  */
/* ------------------------------------------------------------------ */

export function buildDiagnosticsSlice(
  diagnosticsSummary: Readonly<Record<string, unknown>> | null | undefined,
  maxDiagnostics: number,
): AgentPromptContextSlice | null {
  if (!diagnosticsSummary) {
    return makeSlice(
      "diagnostics_summary",
      "diagnostics",
      "Diagnostics Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No diagnostics summary available")],
      [],
    );
  }

  const lines: string[] = [];
  const errorCount = (diagnosticsSummary.errorCount as number) ?? 0;
  const warningCount = (diagnosticsSummary.warningCount as number) ?? 0;
  const totalCount = (diagnosticsSummary.totalCount as number) ?? 0;
  const filesAffected = (diagnosticsSummary.filesAffected as number) ?? 0;

  lines.push(`Service: ${safeStr(diagnosticsSummary.serviceKind)}`);
  lines.push(`Total: ${totalCount} (${errorCount} errors, ${warningCount} warnings)`);
  lines.push(`Files affected: ${filesAffected}`);

  // Include sample messages
  const sampleMessages = diagnosticsSummary.sampleMessages;
  if (Array.isArray(sampleMessages)) {
    const limited = sampleMessages.slice(0, maxDiagnostics);
    if (limited.length > 0) {
      lines.push("Sample issues:");
      for (const msg of limited) {
        lines.push(`  - ${String(msg)}`);
      }
    }
  }

  // Priority based on severity
  let priority: AgentPromptPriority = "medium";
  const reasons: AgentPromptReason[] = [];
  if (errorCount > 0) {
    priority = "high";
    reasons.push(includeReason("severity_threshold", `${errorCount} error(s) found — elevated priority`));
  } else if (warningCount > 0) {
    priority = "medium";
    reasons.push(includeReason("severity_threshold", `${warningCount} warning(s) found — standard priority`));
  } else {
    priority = "low";
    reasons.push(includeReason("relevance_score", "No errors or warnings — low priority"));
  }

  const text = lines.join("\n");
  return makeSlice(
    "diagnostics_summary",
    "diagnostics",
    "Diagnostics Summary",
    priority,
    diagnosticsSummary,
    text,
    reasons,
    [evidence("diagnostics", `Diagnostics: ${totalCount} total, ${errorCount} errors`, diagnosticsSummary.serviceKind as string)],
  );
}

/* ------------------------------------------------------------------ */
/*  Language context slice                                             */
/* ------------------------------------------------------------------ */

export function buildLanguageContextSlice(
  languageContextSummary: Readonly<Record<string, unknown>> | null | undefined,
  maxFiles: number,
  maxSymbols: number,
): AgentPromptContextSlice | null {
  if (!languageContextSummary) {
    return makeSlice(
      "language_context",
      "language_context",
      "Language Context",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No language context summary available")],
      [],
    );
  }

  const lines: string[] = [];
  lines.push(`Profile: ${safeStr(languageContextSummary.profileId)}`);
  lines.push(`Files analyzed: ${safeStr(languageContextSummary.totalFilesAnalyzed)}`);
  lines.push(`Confidence: ${safeStr(languageContextSummary.confidence)}`);

  // Entrypoints
  const entrypoints = languageContextSummary.entrypoints;
  if (Array.isArray(entrypoints) && entrypoints.length > 0) {
    const limited = entrypoints.slice(0, maxFiles);
    lines.push(`Entrypoints: ${limited.join(", ")}${entrypoints.length > maxFiles ? ` (+${entrypoints.length - maxFiles} more)` : ""}`);
  }

  // Config files
  const configFiles = languageContextSummary.configFiles;
  if (Array.isArray(configFiles) && configFiles.length > 0) {
    const limited = configFiles.slice(0, maxFiles);
    lines.push(`Config files: ${limited.join(", ")}${configFiles.length > maxFiles ? ` (+${configFiles.length - maxFiles} more)` : ""}`);
  }

  // Test files
  const testFiles = languageContextSummary.testFiles;
  if (Array.isArray(testFiles) && testFiles.length > 0) {
    const limited = testFiles.slice(0, maxFiles);
    lines.push(`Test files: ${limited.join(", ")}${testFiles.length > maxFiles ? ` (+${testFiles.length - maxFiles} more)` : ""}`);
  }

  // Notable symbols
  const notableSymbols = languageContextSummary.notableSymbols;
  if (Array.isArray(notableSymbols) && notableSymbols.length > 0) {
    const limited = notableSymbols.slice(0, maxSymbols);
    const symbolNames = limited.map((s: unknown) =>
      typeof s === "object" && s !== null && "name" in s ? (s as Record<string, unknown>).name : String(s),
    );
    lines.push(`Notable symbols: ${symbolNames.join(", ")}${notableSymbols.length > maxSymbols ? ` (+${notableSymbols.length - maxSymbols} more)` : ""}`);
  }

  // Modules
  const modules = languageContextSummary.modules;
  if (Array.isArray(modules) && modules.length > 0) {
    const limited = modules.slice(0, maxFiles);
    const modulePaths = limited.map((m: unknown) =>
      typeof m === "object" && m !== null && "modulePath" in m ? (m as Record<string, unknown>).modulePath : String(m),
    );
    lines.push(`Modules: ${modulePaths.join(", ")}${modules.length > maxFiles ? ` (+${modules.length - maxFiles} more)` : ""}`);
  }

  const text = lines.join("\n");
  return makeSlice(
    "language_context",
    "language_context",
    "Language Context",
    "high",
    languageContextSummary,
    text,
    [includeReason("profile_match", "Language context provides profile-aware workspace intelligence")],
    [evidence("language_context", `Workspace context: ${safeStr(languageContextSummary.totalFilesAnalyzed)} files analyzed`)],
  );
}

/* ------------------------------------------------------------------ */
/*  MCP slice                                                          */
/* ------------------------------------------------------------------ */

export function buildMcpSlice(
  mcpSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!mcpSummary) {
    return makeSlice(
      "mcp_summary",
      "mcp",
      "MCP Attachment Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No MCP summary available")],
      [],
    );
  }

  const lines: string[] = [];
  const attached = mcpSummary.attachedCount ?? mcpSummary.totalAttached ?? 0;
  const healthy = mcpSummary.healthyCount ?? 0;
  const tools = mcpSummary.toolCount ?? mcpSummary.totalTools ?? 0;

  lines.push(`MCP servers attached: ${safeStr(attached)}`);
  lines.push(`Healthy: ${safeStr(healthy)}`);
  lines.push(`Available tools: ${safeStr(tools)}`);

  if (mcpSummary.serverIds && Array.isArray(mcpSummary.serverIds)) {
    lines.push(`Servers: ${(mcpSummary.serverIds as string[]).join(", ")}`);
  }

  const text = lines.join("\n");
  return makeSlice(
    "mcp_summary",
    "mcp",
    "MCP Attachment Summary",
    "medium",
    mcpSummary,
    text,
    [includeReason("role_match", "MCP tool availability informs agent capabilities")],
    [evidence("mcp", `${safeStr(attached)} MCP server(s), ${safeStr(tools)} tool(s)`)],
  );
}

/* ------------------------------------------------------------------ */
/*  Agents / routing slice                                             */
/* ------------------------------------------------------------------ */

export function buildAgentsSlice(
  agentsSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!agentsSummary) {
    return makeSlice(
      "agents_summary",
      "agents",
      "Attached Agents Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No agents summary available")],
      [],
    );
  }

  const lines: string[] = [];
  const count = agentsSummary.attachedCount ?? agentsSummary.totalAttached ?? 0;
  lines.push(`Attached agents: ${safeStr(count)}`);

  if (agentsSummary.agents && Array.isArray(agentsSummary.agents)) {
    for (const a of agentsSummary.agents as Array<Record<string, unknown>>) {
      lines.push(`  - ${safeStr(a.name)} (${safeStr(a.kind)}): ${safeStr(a.status)}`);
    }
  }

  const text = lines.join("\n");
  return makeSlice(
    "agents_summary",
    "agents",
    "Attached Agents Summary",
    "medium",
    agentsSummary,
    text,
    [includeReason("role_match", "Agent attachment state is relevant to coordination")],
    [evidence("agents", `${safeStr(count)} agent(s) attached`)],
  );
}

/* ------------------------------------------------------------------ */
/*  GitHub MCP slice                                                   */
/* ------------------------------------------------------------------ */

export function buildGitHubMcpSlice(
  githubMcpSummary: Readonly<Record<string, unknown>> | null | undefined,
): AgentPromptContextSlice | null {
  if (!githubMcpSummary) {
    return makeSlice(
      "github_mcp_summary",
      "github_mcp",
      "GitHub MCP Summary",
      "excluded",
      {},
      "",
      [excludeReason("source_unavailable", "No GitHub MCP summary available")],
      [],
    );
  }

  const lines: string[] = [];
  lines.push(`GitHub MCP configured: ${safeStr(githubMcpSummary.configured ?? githubMcpSummary.attached)}`);
  lines.push(`Auth: ${safeStr(githubMcpSummary.authConfigured ?? githubMcpSummary.authStatus)}`);

  if (githubMcpSummary.toolCount !== undefined) {
    lines.push(`Tools: ${safeStr(githubMcpSummary.toolCount)}`);
  }

  const text = lines.join("\n");
  return makeSlice(
    "github_mcp_summary",
    "github_mcp",
    "GitHub MCP Summary",
    "low",
    githubMcpSummary,
    text,
    [includeReason("role_match", "GitHub MCP availability may inform agent actions")],
    [evidence("github_mcp", "GitHub MCP integration status")],
  );
}

/* ------------------------------------------------------------------ */
/*  Build all candidate slices                                         */
/* ------------------------------------------------------------------ */

/**
 * Build all candidate context slices from the available data sources.
 * Returns both available and unavailable slices (unavailable ones have "excluded" priority).
 */
export function buildAllCandidateSlices(
  input: {
    sessionSummary?: Readonly<Record<string, unknown>> | null;
    workspaceSummary?: Readonly<Record<string, unknown>> | null;
    fingerprintSummary?: Readonly<Record<string, unknown>> | null;
    profileSelection?: Readonly<Record<string, unknown>> | null;
    toolchainSummary?: Readonly<Record<string, unknown>> | null;
    diagnosticsSummary?: Readonly<Record<string, unknown>> | null;
    languageContextSummary?: Readonly<Record<string, unknown>> | null;
    mcpSummary?: Readonly<Record<string, unknown>> | null;
    agentsSummary?: Readonly<Record<string, unknown>> | null;
    githubMcpSummary?: Readonly<Record<string, unknown>> | null;
  },
  budget: AgentPromptBudget,
): AgentPromptContextSlice[] {
  const slices: AgentPromptContextSlice[] = [];

  const push = (s: AgentPromptContextSlice | null) => {
    if (s) slices.push(s);
  };

  push(buildSessionSlice(input.sessionSummary));
  push(buildWorkspaceSlice(input.workspaceSummary));
  push(buildFingerprintSlice(input.fingerprintSummary, input.profileSelection));
  push(buildToolchainSlice(input.toolchainSummary));
  push(buildDiagnosticsSlice(input.diagnosticsSummary, budget.maxDiagnostics));
  push(buildLanguageContextSlice(input.languageContextSummary, budget.maxFiles, budget.maxSymbols));
  push(buildMcpSlice(input.mcpSummary));
  push(buildAgentsSlice(input.agentsSummary));
  push(buildGitHubMcpSlice(input.githubMcpSummary));

  return slices;
}
