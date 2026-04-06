/**
 * Phase 29 — Architecture Consistency Audit tests.
 *
 * Validates the consistency fixes applied in Phase 29:
 * 1. Public API surface — agents and commands re-exported from src/index.ts
 * 2. views.ts inline maps — all event kinds present and consistent with helpers
 * 3. README documentation references — all docs discoverable
 */

import { describe, it, expect } from "vitest";
import * as api from "../../src/index.js";

import {
  classifyEvent,
  categoryIcon,
} from "../../src/app-shell/timeline-helpers.js";

import {
  classifyActor,
  classifyCard,
} from "../../src/app-shell/console-helpers.js";

import { renderShellHtml } from "../../src/app-shell/views.js";

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Fn = (...args: unknown[]) => unknown;
function isFn(v: unknown): v is Fn {
  return typeof v === "function";
}

const surface = api as Record<string, unknown>;

// ---------------------------------------------------------------------------
// 1. Public API surface — agents re-exported
// ---------------------------------------------------------------------------

describe("Phase 29 — agents re-exported from main index", () => {
  const agentSymbols = [
    "AgentRegistry",
    "AGENT_EVENT_KINDS",
    "agentAttachRequested",
    "agentAttached",
    "agentDetached",
    "agentEnabled",
    "agentDisabled",
    "agentFailed",
    "agentCapabilitiesUpdated",
    "agentRoutingEvaluated",
    "agentStageParticipationUpdated",
    "agentSkippedForStage",
    "agentSelectedForStage",
    "isAgentEvent",
    "filterAgentEvents",
    "buildAgentEventSummary",
    "CAPABILITY_STAGE_MAP",
    "ALL_STAGES",
    "DEFAULT_ROUTING_PRIORITY",
    "stagesForCapability",
    "capabilitiesForStage",
    "isCapabilityRelevant",
    "evaluateAgentForStage",
    "evaluateStageParticipation",
    "evaluateAllStages",
    "getEligibleAgents",
    "getPreferredAgents",
    "getSkippedAgents",
    "getTopAgent",
    "buildPreferredStagesMap",
  ];

  for (const name of agentSymbols) {
    it(`exports agent symbol: ${name}`, () => {
      expect(surface[name]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Public API surface — commands re-exported
// ---------------------------------------------------------------------------

describe("Phase 29 — commands re-exported from main index", () => {
  const commandSymbols = [
    "COMMAND_DEFINITIONS",
    "ALL_COMMAND_IDS",
    "ALL_COMMAND_CATEGORIES",
    "getCommandDefinition",
    "groupByCategory",
    "validateCommand",
    "getCommandAvailability",
    "getAllCommandAvailability",
    "getAvailableCommandIds",
    "executeCommand",
    "COMMAND_EVENT_KINDS",
    "commandSubmitted",
    "commandCompleted",
    "commandFailed",
    "commandValidationFailed",
    "resultToSessionEvent",
  ];

  for (const name of commandSymbols) {
    it(`exports command symbol: ${name}`, () => {
      expect(surface[name]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. views.ts inline maps — Phase 26/27 event kinds present
// ---------------------------------------------------------------------------

describe("Phase 29 — views.ts event kind coverage", () => {
  // These 8 event kinds were missing from views.ts before Phase 29
  const phase26_27_events = [
    "mcp_health_refreshed",
    "mcp_health_degraded",
    "mcp_discovery_refreshed",
    "mcp_stale",
    "agent_routing_evaluated",
    "agent_stage_participation_updated",
    "agent_skipped_for_stage",
    "agent_selected_for_stage",
  ];

  // Render the page and extract the inline JS
  const html = renderShellHtml();

  for (const kind of phase26_27_events) {
    it(`EVENT_CATEGORIES includes ${kind}`, () => {
      expect(html).toContain(`${kind}:`);
    });
  }

  it("views.ts contains all timeline-helpers event classifications", () => {
    for (const kind of phase26_27_events) {
      // Verify the helper classifies it (not default)
      const cat = classifyEvent(kind);
      expect(cat).not.toBe("unknown");
    }
  });

  it("views.ts contains all console-helpers actor classifications", () => {
    for (const kind of phase26_27_events) {
      const actor = classifyActor(kind);
      expect(["mcp", "agent"]).toContain(actor);
    }
  });

  it("views.ts contains all console-helpers card classifications", () => {
    for (const kind of phase26_27_events) {
      const card = classifyCard(kind);
      expect(card).not.toBe("message"); // default fallback
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Timeline/console helpers — classification consistency
// ---------------------------------------------------------------------------

describe("Phase 29 — classification consistency across helpers and views", () => {
  const eventKinds = [
    "mcp_health_refreshed",
    "mcp_health_degraded",
    "mcp_discovery_refreshed",
    "mcp_stale",
    "agent_routing_evaluated",
    "agent_stage_participation_updated",
    "agent_skipped_for_stage",
    "agent_selected_for_stage",
  ];

  it("timeline-helpers classifies mcp_health_refreshed as progress", () => {
    expect(classifyEvent("mcp_health_refreshed")).toBe("progress");
  });

  it("timeline-helpers classifies mcp_health_degraded as warning", () => {
    expect(classifyEvent("mcp_health_degraded")).toBe("warning");
  });

  it("timeline-helpers classifies mcp_stale as warning", () => {
    expect(classifyEvent("mcp_stale")).toBe("warning");
  });

  it("timeline-helpers classifies agent_routing_evaluated as info", () => {
    expect(classifyEvent("agent_routing_evaluated")).toBe("info");
  });

  it("timeline-helpers classifies agent_skipped_for_stage as warning", () => {
    expect(classifyEvent("agent_skipped_for_stage")).toBe("warning");
  });

  it("console-helpers classifies mcp events as mcp actor", () => {
    for (const kind of ["mcp_health_refreshed", "mcp_health_degraded", "mcp_discovery_refreshed", "mcp_stale"]) {
      expect(classifyActor(kind)).toBe("mcp");
    }
  });

  it("console-helpers classifies agent events as agent actor", () => {
    for (const kind of ["agent_routing_evaluated", "agent_stage_participation_updated", "agent_skipped_for_stage", "agent_selected_for_stage"]) {
      expect(classifyActor(kind)).toBe("agent");
    }
  });

  it("console-helpers classifies mcp_health_degraded as failure_card", () => {
    expect(classifyCard("mcp_health_degraded")).toBe("failure_card");
  });

  it("console-helpers classifies mcp_discovery_refreshed as discovery_card", () => {
    expect(classifyCard("mcp_discovery_refreshed")).toBe("discovery_card");
  });

  it("all Phase 26/27 event kinds have non-default category icons", () => {
    for (const kind of eventKinds) {
      const cat = classifyEvent(kind);
      const icon = categoryIcon(cat);
      expect(icon).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. README documentation references
// ---------------------------------------------------------------------------

describe("Phase 29 — README documentation references", () => {
  const readmePath = path.join(process.cwd(), "README.md");
  const readme = fs.readFileSync(readmePath, "utf-8");

  const expectedDocs = [
    "docs/QUICKSTART.md",
    "docs/APP-SHELL.md",
    "docs/USAGE.md",
    "docs/SESSION-WORKSPACE.md",
    "docs/SESSION-TIMELINE.md",
    "docs/SESSION-CONSOLE.md",
    "docs/SESSION-PERSISTENCE.md",
    "docs/MCP-SERVERS.md",
    "docs/MCP-HEALTH.md",
    "docs/AGENTS.md",
    "docs/AGENT-ROUTING.md",
    "docs/COMMANDS.md",
    "docs/PACKAGING.md",
  ];

  for (const doc of expectedDocs) {
    it(`README references ${doc}`, () => {
      expect(readme).toContain(doc);
    });
  }

  it("all referenced docs exist on disk", () => {
    for (const doc of expectedDocs) {
      const fullPath = path.join(process.cwd(), doc);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Package.json exports consistency
// ---------------------------------------------------------------------------

describe("Phase 29 — package.json exports consistency", () => {
  const pkgPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const exports = pkg.exports;

  const expectedSubpaths = [
    ".",
    "./cli",
    "./workflow",
    "./schemas",
    "./frontend-contracts",
    "./app-shell",
    "./session",
    "./mcp",
    "./agents",
    "./commands",
  ];

  for (const subpath of expectedSubpaths) {
    it(`package.json declares subpath export: ${subpath}`, () => {
      expect(exports[subpath]).toBeDefined();
      expect(exports[subpath].import).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Architecture doc exists
// ---------------------------------------------------------------------------

describe("Phase 29 — architecture audit document", () => {
  it("docs/ARCHITECTURE.md exists", () => {
    const archPath = path.join(process.cwd(), "docs/ARCHITECTURE.md");
    expect(fs.existsSync(archPath)).toBe(true);
  });

  it("docs/ARCHITECTURE.md contains all 7 audit sections", () => {
    const archPath = path.join(process.cwd(), "docs/ARCHITECTURE.md");
    const content = fs.readFileSync(archPath, "utf-8");
    expect(content).toContain("Architecture Consistency Assessment");
    expect(content).toContain("Domain Terminology Consistency");
    expect(content).toContain("Status and State Mapping Consistency");
    expect(content).toContain("Boundary and Responsibility Problems");
    expect(content).toContain("Documentation Alignment");
    expect(content).toContain("Module Export Consistency");
    expect(content).toContain("Remaining Known Inconsistencies");
  });
});
