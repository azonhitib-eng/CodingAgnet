/**
 * Chat-like session console helpers for the app shell.
 *
 * Transforms flat timeline events into a structured console feed with:
 * - Actor/source identity (system, workspace, mcp, agent, workflow)
 * - Message grouping by time windows and actor
 * - Action-oriented card classification
 * - Presence summaries for runtime participants
 *
 * Phase 24: Chat-like Session Console.
 */

import type { ClassifiedTimelineEvent, TimelineEventCategory } from "./timeline-helpers.js";
import { classifyEvent } from "./timeline-helpers.js";

/* ------------------------------------------------------------------ */
/*  Actor / source classification                                     */
/* ------------------------------------------------------------------ */

/** The logical actor or source of a console message. */
export type ConsoleActor =
  | "system"
  | "workspace"
  | "mcp"
  | "agent"
  | "workflow";

/** Map event kinds to their actor/source. */
const KIND_TO_ACTOR: Record<string, ConsoleActor> = {
  // System
  session_created: "system",
  note: "system",
  info: "system",
  warning: "system",

  // Workspace
  workspace_bound: "workspace",
  workspace_open_requested: "workspace",
  workspace_opened: "workspace",
  workspace_invalid: "workspace",
  workspace_ready: "workspace",
  clone_requested: "workspace",
  clone_started: "workspace",
  clone_completed: "workspace",
  clone_failed: "workspace",

  // MCP
  mcp_attach_requested: "mcp",
  mcp_attached: "mcp",
  mcp_starting: "mcp",
  mcp_started: "mcp",
  mcp_failed: "mcp",
  mcp_stopped: "mcp",
  mcp_discovered_tools: "mcp",
  mcp_discovered_resources: "mcp",
  mcp_discovered_prompts: "mcp",
  mcp_health_refreshed: "mcp",
  mcp_health_degraded: "mcp",
  mcp_discovery_refreshed: "mcp",
  mcp_stale: "mcp",

  // Agent
  agent_attach_requested: "agent",
  agent_attached: "agent",
  agent_detached: "agent",
  agent_enabled: "agent",
  agent_disabled: "agent",
  agent_failed: "agent",
  agent_capabilities_updated: "agent",
  agent_routing_evaluated: "agent",
  agent_stage_participation_updated: "agent",
  agent_skipped_for_stage: "agent",
  agent_selected_for_stage: "agent",

  // Agent context (Phase 44)
  agent_context_assembled: "agent",
  agent_context_refreshed: "agent",
  agent_context_failed: "agent",

  // Agent run (Phase 45)
  agent_run_requested: "agent",
  agent_run_started: "agent",
  agent_run_completed: "agent",
  agent_run_failed: "agent",

  // Execution adapter (Phase 46–47)
  agent_adapter_resolved: "agent",
  agent_adapter_status_refreshed: "agent",

  // Fingerprinting / profile (Phase 38)
  repo_fingerprinted: "workspace",
  profile_selected: "workspace",

  // Workflow
  catalogs_loaded: "workflow",
  host_detected: "workflow",
  workflow_started: "workflow",
  stage_completed: "workflow",
  requires_approval: "workflow",
  blocked: "workflow",
  failed: "workflow",
  completed: "workflow",
};

/** Classify an event kind to its logical actor. */
export function classifyActor(kind: string): ConsoleActor {
  return KIND_TO_ACTOR[kind] ?? "system";
}

/** Human-readable label for an actor. */
const ACTOR_LABELS: Record<ConsoleActor, string> = {
  system: "System",
  workspace: "Workspace",
  mcp: "MCP Server",
  agent: "Agent",
  workflow: "Workflow",
};

export function actorLabel(actor: ConsoleActor): string {
  return ACTOR_LABELS[actor] ?? "System";
}

/** Emoji icon for an actor. */
const ACTOR_ICONS: Record<ConsoleActor, string> = {
  system: "\u2699\ufe0f",     // ⚙️
  workspace: "\ud83d\udcc2",  // 📂
  mcp: "\ud83d\udd0c",        // 🔌
  agent: "\ud83e\udd16",      // 🤖
  workflow: "\ud83d\udce6",    // 📦
};

export function actorIcon(actor: ConsoleActor): string {
  return ACTOR_ICONS[actor] ?? "\u2699\ufe0f";
}

/** CSS class for actor styling. */
const ACTOR_CSS: Record<ConsoleActor, string> = {
  system: "actor-system",
  workspace: "actor-workspace",
  mcp: "actor-mcp",
  agent: "actor-agent",
  workflow: "actor-workflow",
};

export function actorCssClass(actor: ConsoleActor): string {
  return ACTOR_CSS[actor] ?? "actor-system";
}

/* ------------------------------------------------------------------ */
/*  Card type classification                                          */
/* ------------------------------------------------------------------ */

/** Action-oriented card types for high-value states. */
export type ConsoleCardType =
  | "message"          // normal timeline message
  | "approval_card"    // requires human approval
  | "blocked_card"     // blocked by safety
  | "failure_card"     // workflow/operation failure
  | "success_card"     // completion or successful operation
  | "lifecycle_card"   // MCP/agent/workspace lifecycle milestone
  | "discovery_card";  // MCP capability discovery

const KIND_TO_CARD: Record<string, ConsoleCardType> = {
  requires_approval: "approval_card",
  blocked: "blocked_card",
  failed: "failure_card",
  workspace_invalid: "failure_card",
  clone_failed: "failure_card",
  mcp_failed: "failure_card",
  agent_failed: "failure_card",
  completed: "success_card",
  clone_completed: "success_card",
  workspace_ready: "success_card",
  workspace_opened: "lifecycle_card",
  mcp_attached: "lifecycle_card",
  mcp_started: "lifecycle_card",
  mcp_stopped: "lifecycle_card",
  mcp_health_refreshed: "lifecycle_card",
  mcp_health_degraded: "failure_card",
  mcp_discovery_refreshed: "discovery_card",
  mcp_stale: "lifecycle_card",
  agent_attached: "lifecycle_card",
  agent_enabled: "lifecycle_card",
  agent_detached: "lifecycle_card",
  agent_disabled: "lifecycle_card",
  mcp_discovered_tools: "discovery_card",
  mcp_discovered_resources: "discovery_card",
  mcp_discovered_prompts: "discovery_card",
  agent_capabilities_updated: "discovery_card",
  agent_routing_evaluated: "lifecycle_card",
  agent_stage_participation_updated: "lifecycle_card",
  agent_skipped_for_stage: "lifecycle_card",
  agent_selected_for_stage: "lifecycle_card",
  repo_fingerprinted: "discovery_card",
  profile_selected: "discovery_card",

  // Agent context (Phase 44)
  agent_context_assembled: "discovery_card",
  agent_context_refreshed: "discovery_card",
  agent_context_failed: "failure_card",

  // Agent run (Phase 45)
  agent_run_requested: "lifecycle_card",
  agent_run_started: "lifecycle_card",
  agent_run_completed: "success_card",
  agent_run_failed: "failure_card",

  // Execution adapter (Phase 46–47)
  agent_adapter_resolved: "lifecycle_card",
  agent_adapter_status_refreshed: "lifecycle_card",
};

/** Classify an event kind to its card type. */
export function classifyCard(kind: string): ConsoleCardType {
  return KIND_TO_CARD[kind] ?? "message";
}

/** CSS class for a card type. */
const CARD_CSS: Record<ConsoleCardType, string> = {
  message: "console-msg",
  approval_card: "console-card-approval",
  blocked_card: "console-card-blocked",
  failure_card: "console-card-failure",
  success_card: "console-card-success",
  lifecycle_card: "console-card-lifecycle",
  discovery_card: "console-card-discovery",
};

export function cardCssClass(cardType: ConsoleCardType): string {
  return CARD_CSS[cardType] ?? "console-msg";
}

/* ------------------------------------------------------------------ */
/*  Console message (enriched timeline event)                         */
/* ------------------------------------------------------------------ */

/** A single message in the console feed. */
export interface ConsoleMessage {
  readonly kind: string;
  readonly timestamp: string;
  readonly message: string;
  readonly category: TimelineEventCategory;
  readonly actor: ConsoleActor;
  readonly cardType: ConsoleCardType;
  readonly detail?: Record<string, unknown>;
}

/** Enrich a classified timeline event into a console message. */
export function toConsoleMessage(
  event: ClassifiedTimelineEvent & { detail?: Record<string, unknown> },
): ConsoleMessage {
  return {
    kind: event.kind,
    timestamp: event.timestamp,
    message: event.message,
    category: event.category,
    actor: classifyActor(event.kind),
    cardType: classifyCard(event.kind),
    ...(event.detail !== undefined ? { detail: event.detail } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Message grouping                                                  */
/* ------------------------------------------------------------------ */

/** A group of consecutive messages from the same actor within a time window. */
export interface ConsoleMessageGroup {
  readonly actor: ConsoleActor;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly messages: ConsoleMessage[];
}

/** Default grouping window in milliseconds (30 seconds). */
const GROUP_WINDOW_MS = 30_000;

/**
 * Group console messages into actor-based clusters within a time window.
 *
 * Adjacent messages from the same actor within GROUP_WINDOW_MS are grouped
 * together. A new group starts when the actor changes or the time gap exceeds
 * the window.
 */
export function groupMessages(
  messages: ConsoleMessage[],
  windowMs: number = GROUP_WINDOW_MS,
): ConsoleMessageGroup[] {
  if (messages.length === 0) return [];

  const groups: ConsoleMessageGroup[] = [];
  let current: ConsoleMessageGroup = {
    actor: messages[0].actor,
    startTimestamp: messages[0].timestamp,
    endTimestamp: messages[0].timestamp,
    messages: [messages[0]],
  };

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    const timeDelta =
      new Date(msg.timestamp).getTime() -
      new Date(current.endTimestamp).getTime();

    if (msg.actor === current.actor && timeDelta <= windowMs) {
      // Extend current group (create new object for immutability)
      current = {
        ...current,
        endTimestamp: msg.timestamp,
        messages: [...current.messages, msg],
      };
    } else {
      groups.push(current);
      current = {
        actor: msg.actor,
        startTimestamp: msg.timestamp,
        endTimestamp: msg.timestamp,
        messages: [msg],
      };
    }
  }
  groups.push(current);
  return groups;
}

/* ------------------------------------------------------------------ */
/*  Presence summary                                                  */
/* ------------------------------------------------------------------ */

/** Runtime participant presence in the session. */
export interface PresenceEntry {
  readonly kind: "mcp_server" | "agent";
  readonly id: string;
  readonly label: string;
  readonly ready: boolean;
}

/** Aggregated presence state for the console sidebar/header. */
export interface ConsoleFeedPresence {
  readonly workspaceStatus: string | null;
  readonly workspacePath: string | null;
  readonly sessionStage: string;
  readonly sessionStatus: string;
  readonly mcpServers: ReadonlyArray<PresenceEntry>;
  readonly agents: ReadonlyArray<PresenceEntry>;
  readonly approvalRequired: boolean;
  readonly isBlocked: boolean;
  readonly lastSignificantAction: string | null;
  /** Active adapter status for display (Phase 47). */
  readonly adapterStatus: AdapterPresence | null;
}

/** Adapter presence info for display in the console (Phase 47). */
export interface AdapterPresence {
  readonly kind: string;
  readonly availability: string;
  readonly isModelBacked: boolean;
  readonly modelName: string | null;
  readonly label: string | null;
}

/**
 * Build presence summary from a session summary object (API shape).
 */
export function buildPresence(summary: {
  stage?: string;
  status?: string;
  workspaceStatus?: string | null;
  workspacePath?: string | null;
  mcpServers?: ReadonlyArray<{ id: string; label: string; ready: boolean }>;
  agents?: ReadonlyArray<{ id: string; label: string; ready: boolean }>;
  approvalRequired?: boolean;
  isBlocked?: boolean;
  lastEventMessage?: string | null;
  activeAdapterKind?: string | null;
  activeAdapterAvailability?: string | null;
  activeAdapterIsModelBacked?: boolean | null;
  activeAdapterModelName?: string | null;
}): ConsoleFeedPresence {
  const adapterStatus: AdapterPresence | null =
    summary.activeAdapterKind != null
      ? {
          kind: summary.activeAdapterKind,
          availability: summary.activeAdapterAvailability ?? "not_configured",
          isModelBacked: summary.activeAdapterIsModelBacked ?? false,
          modelName: summary.activeAdapterModelName ?? null,
          label: null,
        }
      : null;

  return {
    sessionStage: summary.stage ?? "initializing",
    sessionStatus: summary.status ?? "idle",
    workspaceStatus: summary.workspaceStatus ?? null,
    workspacePath: summary.workspacePath ?? null,
    mcpServers: (summary.mcpServers ?? []).map((s) => ({
      kind: "mcp_server" as const,
      id: s.id,
      label: s.label,
      ready: s.ready,
    })),
    agents: (summary.agents ?? []).map((a) => ({
      kind: "agent" as const,
      id: a.id,
      label: a.label,
      ready: a.ready,
    })),
    approvalRequired: summary.approvalRequired ?? false,
    isBlocked: summary.isBlocked ?? false,
    lastSignificantAction: summary.lastEventMessage ?? null,
    adapterStatus,
  };
}

/* ------------------------------------------------------------------ */
/*  Console feed (full assembled response)                            */
/* ------------------------------------------------------------------ */

/** Complete console feed for the frontend. */
export interface ConsoleFeed {
  readonly sessionId: string;
  readonly messages: ConsoleMessage[];
  readonly groups: ConsoleMessageGroup[];
  readonly presence: ConsoleFeedPresence;
}

/**
 * Build a complete console feed from session data.
 */
export function buildConsoleFeed(
  sessionId: string,
  events: Array<ClassifiedTimelineEvent & { detail?: Record<string, unknown> }>,
  summary: Parameters<typeof buildPresence>[0],
): ConsoleFeed {
  const messages = events.map(toConsoleMessage);
  const groups = groupMessages(messages);
  const presence = buildPresence(summary);
  return { sessionId, messages, groups, presence };
}

/* ------------------------------------------------------------------ */
/*  Demo console feed builder                                         */
/* ------------------------------------------------------------------ */

/**
 * Build an enhanced demo timeline that includes MCP and agent events
 * for a richer console experience.
 */
export function buildDemoConsoleFeed(
  scenarioLabel: string,
  workflowStatus: string,
): ConsoleFeed {
  const now = Date.now();
  const events: Array<ClassifiedTimelineEvent & { detail?: Record<string, unknown> }> = [];

  function add(
    kind: string,
    message: string,
    offsetMs: number,
    detail?: Record<string, unknown>,
  ): void {
    events.push({
      kind,
      timestamp: new Date(now + offsetMs).toISOString(),
      message,
      category: classifyEvent(kind),
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  // Session lifecycle
  add("session_created", "Session created (demo)", 0);
  add("workspace_bound", `Workspace bound: demo/${scenarioLabel}`, 100);
  add("workspace_opened", `Workspace opened: demo/${scenarioLabel} (git repo)`, 150, {
    path: `demo/${scenarioLabel}`,
    isGitRepo: true,
  });

  // MCP lifecycle (demo)
  add("mcp_attach_requested", "MCP server attach requested: code-assistant", 200, {
    serverId: "code-assistant",
  });
  add("mcp_attached", "MCP server attached: code-assistant", 250, {
    serverId: "code-assistant",
  });
  add("mcp_started", "MCP server started: code-assistant (pid: 1234)", 300, {
    serverId: "code-assistant",
    pid: 1234,
  });
  add("mcp_discovered_tools", "MCP server code-assistant: discovered 3 tools", 350, {
    serverId: "code-assistant",
    tools: ["search", "edit", "run"],
  });

  // Agent lifecycle (demo)
  add("agent_attach_requested", "Agent attach requested: copilot-agent", 400, {
    agentId: "copilot-agent",
  });
  add("agent_attached", "Agent attached: copilot-agent", 450, {
    agentId: "copilot-agent",
  });
  add("agent_enabled", "Agent enabled: copilot-agent", 500, {
    agentId: "copilot-agent",
  });

  // Adapter resolution (Phase 47 demo)
  add("agent_adapter_resolved", "Execution adapter resolved: stub — Configured & Available", 520, {
    adapterKind: "stub",
    isModelBacked: false,
    availability: "configured_available",
    modelName: null,
    label: "Stub (Deterministic / Demo)",
  });

  // Agent run lifecycle (Phase 47 demo)
  add("agent_run_requested", "Agent run requested: summarize_workspace — Summarize workspace", 550, {
    runId: "demo-run-001",
    taskKind: "summarize_workspace",
    taskDescription: "Summarize workspace",
  });
  add("agent_run_started", "Agent run started: copilot-agent (general) selected via best_fit", 560, {
    runId: "demo-run-001",
    agentName: "copilot-agent",
    agentKind: "general",
    selectionMethod: "best_fit",
  });
  add("agent_run_completed", "Agent run completed: copilot-agent (summarize_workspace) — 42ms", 580, {
    runId: "demo-run-001",
    agentId: "copilot-agent",
    agentName: "copilot-agent",
    agentKind: "general",
    taskKind: "summarize_workspace",
    adapterKind: "stub",
    isModelGenerated: false,
    durationMs: 42,
    outputPreview: "[Stub] Workspace summary for demo project: This is a deterministic demo response. The workspace contains a typical project structure with source code, tests, and documentation.",
  });

  // Workflow
  add("catalogs_loaded", "Catalog entries loaded", 600);
  add("host_detected", "Host profile loaded from demo scenario", 700);
  add("workflow_started", "Workflow execution started", 800);

  const stages = [
    "catalog_loading",
    "host_acquisition",
    "recommendation",
    "target_selection",
    "compatibility_evaluation",
    "install_planning",
    "safety_evaluation",
    "rendering",
  ];

  for (let i = 0; i < stages.length; i++) {
    add("stage_completed", `Stage completed: ${stages[i]}`, 900 + i * 200, {
      stage: stages[i],
    });
  }

  // Terminal event
  switch (workflowStatus) {
    case "completed":
      add("completed", "Session completed successfully", 2800);
      break;
    case "completed_requires_approval":
      add(
        "requires_approval",
        "Workflow completed but requires human approval before execution",
        2800,
      );
      break;
    case "blocked":
      add("blocked", "Workflow blocked by safety evaluation", 2800);
      break;
    case "failed":
      add("failed", "Workflow failed", 2800);
      break;
    default:
      add("completed", "Session completed", 2800);
      break;
  }

  const summary = {
    stage: "done" as const,
    status: workflowStatus === "blocked"
      ? "blocked"
      : workflowStatus === "failed"
        ? "failed"
        : "completed",
    workspaceStatus: "ready",
    workspacePath: `demo/${scenarioLabel}`,
    mcpServers: [{ id: "code-assistant", label: "code-assistant", ready: true }],
    agents: [{ id: "copilot-agent", label: "copilot-agent", ready: true }],
    approvalRequired: workflowStatus === "completed_requires_approval",
    isBlocked: workflowStatus === "blocked",
    lastEventMessage: events[events.length - 1]?.message ?? null,
    activeAdapterKind: "stub",
    activeAdapterAvailability: "configured_available",
    activeAdapterIsModelBacked: false,
    activeAdapterModelName: null,
  };

  return buildConsoleFeed(`demo-${scenarioLabel}`, events, summary);
}

/* ------------------------------------------------------------------ */
/*  Filter support                                                    */
/* ------------------------------------------------------------------ */

/** Available filter categories for the console. */
export const CONSOLE_FILTERS: ReadonlyArray<{
  readonly id: ConsoleActor | "all";
  readonly label: string;
  readonly icon: string;
}> = [
  { id: "all", label: "All", icon: "\ud83d\udcac" },       // 💬
  { id: "system", label: "System", icon: "\u2699\ufe0f" },  // ⚙️
  { id: "workspace", label: "Workspace", icon: "\ud83d\udcc2" }, // 📂
  { id: "mcp", label: "MCP", icon: "\ud83d\udd0c" },        // 🔌
  { id: "agent", label: "Agent", icon: "\ud83e\udd16" },    // 🤖
  { id: "workflow", label: "Workflow", icon: "\ud83d\udce6" }, // 📦
];

/** Filter messages by actor. */
export function filterByActor(
  messages: ConsoleMessage[],
  actor: ConsoleActor | "all",
): ConsoleMessage[] {
  if (actor === "all") return messages;
  return messages.filter((m) => m.actor === actor);
}
