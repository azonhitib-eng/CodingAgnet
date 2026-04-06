/**
 * Session timeline helpers for the app shell.
 *
 * Classifies session events by semantic category for UI rendering.
 * Used both server-side (API responses) and mirrored client-side
 * (for demo mode where no real session exists).
 */

/* ------------------------------------------------------------------ */
/*  Category type                                                     */
/* ------------------------------------------------------------------ */

/** Semantic category for timeline event rendering. */
export type TimelineEventCategory =
  | "info"
  | "progress"
  | "warning"
  | "blocked"
  | "failure";

/* ------------------------------------------------------------------ */
/*  Classification map                                                */
/* ------------------------------------------------------------------ */

const KIND_TO_CATEGORY: Record<string, TimelineEventCategory> = {
  // info — informational / lifecycle markers
  session_created: "info",
  note: "info",
  info: "info",
  catalogs_loaded: "info",
  workspace_open_requested: "info",
  clone_requested: "info",

  // progress — forward movement
  workspace_bound: "progress",
  host_detected: "progress",
  workflow_started: "progress",
  stage_completed: "progress",
  completed: "progress",
  workspace_opened: "progress",
  workspace_ready: "progress",
  clone_started: "progress",
  clone_completed: "progress",
  mcp_attached: "progress",
  mcp_started: "progress",
  mcp_discovered_tools: "progress",
  mcp_discovered_resources: "progress",
  mcp_discovered_prompts: "progress",
  mcp_health_refreshed: "progress",
  mcp_discovery_refreshed: "progress",
  agent_attached: "progress",
  agent_enabled: "progress",
  agent_capabilities_updated: "progress",
  agent_routing_evaluated: "info",
  agent_selected_for_stage: "progress",
  agent_stage_participation_updated: "info",

  // agent run lifecycle (Phase 45)
  agent_run_requested: "info",
  agent_run_started: "progress",
  agent_run_completed: "progress",
  agent_run_failed: "failure",

  // execution adapter lifecycle (Phase 46–47)
  agent_adapter_resolved: "progress",
  agent_adapter_status_refreshed: "info",

  // fingerprinting / profile (Phase 38)
  repo_fingerprinted: "info",
  profile_selected: "progress",

  // warning — needs attention / pending approval
  warning: "warning",
  requires_approval: "warning",
  mcp_attach_requested: "warning",
  mcp_starting: "warning",
  agent_attach_requested: "warning",

  // blocked
  blocked: "blocked",

  // failure
  failed: "failure",
  workspace_invalid: "failure",
  clone_failed: "failure",
  mcp_failed: "failure",
  mcp_stopped: "failure",
  mcp_health_degraded: "warning",
  mcp_stale: "warning",
  agent_failed: "failure",
  agent_disabled: "failure",
  agent_detached: "failure",
  agent_skipped_for_stage: "warning",
};

/** Classify a SessionEventKind string into a rendering category. */
export function classifyEvent(kind: string): TimelineEventCategory {
  return KIND_TO_CATEGORY[kind] ?? "info";
}

/* ------------------------------------------------------------------ */
/*  Category icons (emoji)                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_ICONS: Record<TimelineEventCategory, string> = {
  info: "\u2139\ufe0f",      // ℹ️
  progress: "\u2705",        // ✅
  warning: "\u26a0\ufe0f",   // ⚠️
  blocked: "\ud83d\udeab",   // 🚫
  failure: "\u274c",         // ❌
};

/** Emoji icon for a rendering category. */
export function categoryIcon(cat: TimelineEventCategory): string {
  return CATEGORY_ICONS[cat] ?? "\u2139\ufe0f";
}

/* ------------------------------------------------------------------ */
/*  CSS class                                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_CSS: Record<TimelineEventCategory, string> = {
  info: "tl-info",
  progress: "tl-progress",
  warning: "tl-warning",
  blocked: "tl-blocked",
  failure: "tl-failure",
};

/** CSS class suffix for a rendering category. */
export function categoryCssClass(cat: TimelineEventCategory): string {
  return CATEGORY_CSS[cat] ?? "tl-info";
}

/* ------------------------------------------------------------------ */
/*  Demo timeline builder                                             */
/* ------------------------------------------------------------------ */

/** Shape of a classified timeline event (for API and demo mode). */
export interface ClassifiedTimelineEvent {
  kind: string;
  timestamp: string;
  message: string;
  category: TimelineEventCategory;
}

/**
 * Build synthetic timeline events for demo mode.
 *
 * Produces a realistic sequence including session, workspace, catalog,
 * host, workflow stages, and a terminal event matching workflowStatus.
 */
export function buildDemoTimelineEvents(
  scenarioLabel: string,
  workflowStatus: string,
): ClassifiedTimelineEvent[] {
  const now = Date.now();
  const events: ClassifiedTimelineEvent[] = [];

  function add(kind: string, message: string, offsetMs: number): void {
    events.push({
      kind,
      timestamp: new Date(now + offsetMs).toISOString(),
      message,
      category: classifyEvent(kind),
    });
  }

  add("session_created", "Session created (demo)", 0);
  add("workspace_bound", `Workspace bound: demo/${scenarioLabel}`, 100);
  add("catalogs_loaded", "Catalog entries loaded", 200);
  add("host_detected", "Host profile loaded from demo scenario", 300);
  add("workflow_started", "Workflow execution started", 500);

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
    add("stage_completed", `Stage completed: ${stages[i]}`, 600 + i * 200);
  }

  // Terminal event based on workflow status
  switch (workflowStatus) {
    case "completed":
      add("completed", "Session completed successfully", 2500);
      break;
    case "completed_requires_approval":
      add(
        "requires_approval",
        "Workflow completed but requires human approval before execution",
        2500,
      );
      break;
    case "blocked":
      add("blocked", "Workflow blocked by safety evaluation", 2500);
      break;
    case "failed":
      add("failed", "Workflow failed", 2500);
      break;
    default:
      add("completed", "Session completed", 2500);
      break;
  }

  return events;
}
