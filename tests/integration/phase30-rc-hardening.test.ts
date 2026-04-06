/**
 * Phase 30 — RC hardening tests.
 *
 * Validates:
 *  - README accuracy (capabilities, limitations, subpath exports, docs list)
 *  - QUICKSTART accuracy (startup banner, advanced features section)
 *  - Startup banner wording (version, features, modes)
 *  - Subpath export alignment (package.json vs README)
 *  - Status label consistency across surfaces
 *  - Restore warning clarity
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, "../..");
const readme = () => readFileSync(join(ROOT, "README.md"), "utf-8");
const quickstart = () => readFileSync(join(ROOT, "docs/QUICKSTART.md"), "utf-8");
const pkgJson = () =>
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
    exports: Record<string, unknown>;
    version: string;
  };

// ---------------------------------------------------------------------------
// README — capabilities accuracy
// ---------------------------------------------------------------------------

describe("README — capabilities accuracy", () => {
  const content = readme();

  it("mentions session management in 'What this package does'", () => {
    expect(content).toContain("Session management");
  });

  it("mentions workspace lifecycle in 'What this package does'", () => {
    expect(content).toContain("Workspace lifecycle");
  });

  it("mentions MCP server integration in 'What this package does'", () => {
    expect(content).toContain("MCP server integration");
  });

  it("mentions agent registry in 'What this package does'", () => {
    expect(content).toContain("Agent registry");
  });

  it("mentions structured commands in 'What this package does'", () => {
    expect(content).toContain("Structured commands");
  });

  it("mentions app shell in 'What this package does'", () => {
    expect(content).toContain("App shell");
  });

  it("does NOT claim 'Provide a frontend/UI' in the does-NOT section", () => {
    expect(content).not.toContain("Provide a frontend/UI");
  });

  it("does NOT claim 'Run background tasks' in the does-NOT section", () => {
    expect(content).not.toContain("Run background tasks");
  });

  it("mentions 'No install execution' in does-NOT section", () => {
    expect(content).toContain("Execute install commands");
  });

  it("mentions 'No autonomous agents' in does-NOT section", () => {
    expect(content).toContain("Run autonomous agents");
  });

  it("mentions 'No LLM chat interface' in does-NOT section", () => {
    expect(content).toContain("LLM chat interface");
  });
});

// ---------------------------------------------------------------------------
// README — subpath exports match package.json
// ---------------------------------------------------------------------------

describe("README — subpath exports", () => {
  const content = readme();
  const pkg = pkgJson();
  const exportKeys = Object.keys(pkg.exports);

  it("has at least 10 subpath exports in package.json", () => {
    expect(exportKeys.length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ["codingagent-backend", "."],
    ["codingagent-backend/cli", "./cli"],
    ["codingagent-backend/workflow", "./workflow"],
    ["codingagent-backend/schemas", "./schemas"],
    ["codingagent-backend/frontend-contracts", "./frontend-contracts"],
    ["codingagent-backend/app-shell", "./app-shell"],
    ["codingagent-backend/session", "./session"],
    ["codingagent-backend/mcp", "./mcp"],
    ["codingagent-backend/agents", "./agents"],
    ["codingagent-backend/commands", "./commands"],
  ])("README mentions %s and package.json has %s", (importPath, exportKey) => {
    expect(content).toContain(importPath);
    expect(exportKeys).toContain(exportKey);
  });
});

// ---------------------------------------------------------------------------
// README — documentation links
// ---------------------------------------------------------------------------

describe("README — documentation links", () => {
  const content = readme();

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
    "docs/ARCHITECTURE.md",
    "CHANGELOG.md",
  ];

  it(`lists all ${expectedDocs.length} documentation files`, () => {
    for (const doc of expectedDocs) {
      expect(content).toContain(doc);
    }
  });

  it("has at least 15 doc links", () => {
    const docLinkCount = expectedDocs.filter((d) => content.includes(d)).length;
    expect(docLinkCount).toBe(expectedDocs.length);
  });
});

// ---------------------------------------------------------------------------
// README — known limitations
// ---------------------------------------------------------------------------

describe("README — known limitations", () => {
  const content = readme();

  it("has a 'Known limitations' section", () => {
    expect(content).toContain("Known limitations");
  });

  it("mentions install execution limitation", () => {
    expect(content).toContain("No install execution");
  });

  it("mentions MCP transport limitation", () => {
    expect(content).toContain("MCP transport");
  });

  it("mentions agent execution limitation", () => {
    expect(content).toContain("Agent execution");
  });

  it("mentions session persistence limitation", () => {
    expect(content).toContain("Session persistence");
  });

  it("mentions real-time updates limitation", () => {
    expect(content).toContain("Real-time updates");
  });
});

// ---------------------------------------------------------------------------
// README — app shell features
// ---------------------------------------------------------------------------

describe("README — app shell section", () => {
  const content = readme();

  it("mentions demo mode", () => {
    expect(content).toContain("Demo mode");
  });

  it("mentions real mode", () => {
    expect(content).toContain("Real mode");
  });

  it("mentions session timeline", () => {
    expect(content).toContain("Session timeline");
  });

  it("mentions command composer", () => {
    expect(content).toContain("Command composer");
  });

  it("mentions session persistence in app shell", () => {
    expect(content).toContain("Session persistence");
  });
});

// ---------------------------------------------------------------------------
// QUICKSTART — advanced features section
// ---------------------------------------------------------------------------

describe("QUICKSTART — advanced features", () => {
  const content = quickstart();

  it("has a 'Beyond Workflows' section", () => {
    expect(content).toContain("Beyond Workflows");
  });

  it("mentions session management", () => {
    expect(content).toContain("Session management");
  });

  it("mentions command composer", () => {
    expect(content).toContain("command composer");
  });

  it("mentions MCP server integration", () => {
    expect(content).toContain("MCP server integration");
  });

  it("mentions agent registry", () => {
    expect(content).toContain("Agent registry");
  });

  it("mentions save and restore", () => {
    expect(content).toContain("Save");
    expect(content).toContain("Restore");
  });

  it("warns about MCP/agent state not being preserved", () => {
    expect(content).toContain("not");
    expect(content).toContain("reattach");
  });
});

// ---------------------------------------------------------------------------
// QUICKSTART — startup output matches banner
// ---------------------------------------------------------------------------

describe("QUICKSTART — startup output accuracy", () => {
  const content = quickstart();

  it("shows version in startup output example", () => {
    expect(content).toMatch(/CodingAgent App Shell\s+v[\d.]+/);
  });

  it("shows Features section in startup output", () => {
    expect(content).toContain("Features:");
  });

  it("shows session timeline in features", () => {
    expect(content).toContain("Session timeline and console");
  });

  it("shows command composer in features", () => {
    expect(content).toContain("Command composer");
  });

  it("shows save/restore in features", () => {
    expect(content).toContain("Session save/restore");
  });
});

// ---------------------------------------------------------------------------
// Startup banner — server.ts wording
// ---------------------------------------------------------------------------

describe("Startup banner wording", () => {
  // Read server.ts to verify banner strings
  const serverSrc = readFileSync(
    join(ROOT, "src/app-shell/server.ts"),
    "utf-8",
  );

  it("includes version in banner", () => {
    expect(serverSrc).toContain("getVersion()");
    expect(serverSrc).toContain("CodingAgent App Shell  v${version}");
  });

  it("includes Features section", () => {
    expect(serverSrc).toContain('"  Features:"');
  });

  it("mentions session timeline", () => {
    expect(serverSrc).toContain("Session timeline and console");
  });

  it("mentions command composer", () => {
    expect(serverSrc).toContain("Command composer");
  });

  it("mentions save/restore", () => {
    expect(serverSrc).toContain("Session save/restore");
  });

  it("mentions Demo and Real modes", () => {
    expect(serverSrc).toContain("Demo");
    expect(serverSrc).toContain("Real");
  });

  it("mentions Ctrl+C to stop", () => {
    expect(serverSrc).toContain("Ctrl+C");
  });
});

// ---------------------------------------------------------------------------
// Restore warning wording clarity
// ---------------------------------------------------------------------------

describe("Restore warning wording", () => {
  const recentSessionsSrc = readFileSync(
    join(ROOT, "src/session/recent-sessions.ts"),
    "utf-8",
  );

  it("MCP restore warning mentions 'stale' and 'reattach'", () => {
    expect(recentSessionsSrc).toContain("restored as stale");
    expect(recentSessionsSrc).toContain("Reattach");
  });

  it("agent restore warning mentions 'records only' and 're-established'", () => {
    expect(recentSessionsSrc).toContain("restored as records only");
    expect(recentSessionsSrc).toContain("re-established");
  });

  it("workflow result warning mentions 'summary and timeline are available'", () => {
    expect(recentSessionsSrc).toContain(
      "summary and timeline are available",
    );
  });
});

// ---------------------------------------------------------------------------
// Status label cross-surface consistency
// ---------------------------------------------------------------------------

describe("Status label consistency", () => {
  const statusLabelsSrc = readFileSync(
    join(ROOT, "src/frontend-contracts/status-labels.ts"),
    "utf-8",
  );

  it("workflow statuses match session domain (completed, blocked, failed, partial)", () => {
    // In TypeScript source, object keys are unquoted identifiers
    expect(statusLabelsSrc).toContain("completed:");
    expect(statusLabelsSrc).toContain("completed_requires_approval:");
    expect(statusLabelsSrc).toContain("blocked:");
    expect(statusLabelsSrc).toContain("failed:");
    expect(statusLabelsSrc).toContain("partial:");
  });

  it("safety statuses are present (approved, requiresHumanApproval, blocked)", () => {
    expect(statusLabelsSrc).toContain("approved:");
    expect(statusLabelsSrc).toContain("requiresHumanApproval:");
    expect(statusLabelsSrc).toContain("blocked:");
  });

  it("README safety table matches status-labels.ts", () => {
    const readmeContent = readme();
    expect(readmeContent).toContain("`approved`");
    expect(readmeContent).toContain("`requiresHumanApproval`");
    expect(readmeContent).toContain("`blocked`");
  });
});

// ---------------------------------------------------------------------------
// Command definitions completeness
// ---------------------------------------------------------------------------

describe("Command definitions coverage", () => {
  const commandsSrc = readFileSync(
    join(ROOT, "src/commands/types.ts"),
    "utf-8",
  );

  const expectedCommands = [
    "open_workspace",
    "clone_repository",
    "detect_host",
    "attach_mcp",
    "refresh_mcp_health",
    "refresh_mcp_discovery",
    "attach_agent",
    "run_workflow",
    "save_session",
    "restore_session",
  ];

  it("defines all 10 command types", () => {
    for (const cmd of expectedCommands) {
      expect(commandsSrc).toContain(`"${cmd}"`);
    }
  });

  it("QUICKSTART mentions structured command types", () => {
    const content = quickstart();
    expect(content).toContain("Open Workspace");
    expect(content).toContain("Clone Repository");
    expect(content).toContain("Detect Host");
    expect(content).toContain("Attach MCP Server");
    expect(content).toContain("Run Workflow");
    expect(content).toContain("Save Session");
    expect(content).toContain("Restore Session");
  });
});

// ---------------------------------------------------------------------------
// CHANGELOG — Phase 30 entry
// ---------------------------------------------------------------------------

describe("CHANGELOG — Phase 30 entry", () => {
  const content = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8");

  it("has Phase 30 entry", () => {
    expect(content).toContain("Phase 30");
  });

  it("mentions RC Hardening", () => {
    expect(content).toContain("RC Hardening");
  });

  it("mentions README updates", () => {
    expect(content).toContain("README");
  });

  it("mentions QUICKSTART updates", () => {
    expect(content).toContain("QUICKSTART");
  });

  it("mentions startup banner updates", () => {
    expect(content).toContain("Startup banner");
  });
});

// ---------------------------------------------------------------------------
// Session event kind coverage — docs mention all major kinds
// ---------------------------------------------------------------------------

describe("Session event kind documentation coverage", () => {
  const sessionTypesSrc = readFileSync(
    join(ROOT, "src/session/types.ts"),
    "utf-8",
  );

  // Extract all event kinds from the SessionEventKind type
  const kindMatches = sessionTypesSrc.match(/\|\s*"([^"]+)"/g) ?? [];
  const allKinds = kindMatches.map((m) => m.replace(/\|\s*"/, "").replace(/"/, ""));

  it("has at least 40 event kinds defined", () => {
    expect(allKinds.length).toBeGreaterThanOrEqual(40);
  });

  it("includes MCP lifecycle kinds", () => {
    expect(allKinds).toContain("mcp_attached");
    expect(allKinds).toContain("mcp_started");
    expect(allKinds).toContain("mcp_failed");
  });

  it("includes agent lifecycle kinds", () => {
    expect(allKinds).toContain("agent_attached");
    expect(allKinds).toContain("agent_detached");
    expect(allKinds).toContain("agent_failed");
  });

  it("includes workspace lifecycle kinds", () => {
    expect(allKinds).toContain("workspace_opened");
    expect(allKinds).toContain("clone_completed");
    expect(allKinds).toContain("workspace_ready");
  });

  it("includes routing kinds", () => {
    expect(allKinds).toContain("agent_routing_evaluated");
    expect(allKinds).toContain("agent_selected_for_stage");
  });
});
