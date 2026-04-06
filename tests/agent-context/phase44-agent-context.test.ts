/**
 * Phase 44 — Context-informed agent prompting tests.
 *
 * Comprehensive tests for the agent-context module:
 * - Types and constants
 * - Slice builders (all 9 sources)
 * - Role-based priority adjustments
 * - Budget control and trimming
 * - Context assembly per agent kind
 * - Traceability (reasons, evidence, explanations)
 * - Session integration (events, summaries)
 * - Command integration (new commands)
 * - Determinism (same input → same output)
 * - Profile-aware differences
 */

import { describe, it, expect } from "vitest";

/* ------------------------------------------------------------------ */
/*  Imports — types                                                    */
/* ------------------------------------------------------------------ */

import type {
  AgentPromptPriority,
  AgentPromptReasonKind,
  AgentPromptReason,
  AgentPromptEvidence,
  AgentPromptSliceSource,
  AgentPromptContextSlice,
  AgentPromptBudget,
  AgentPromptAssemblyInput,
  AgentPromptAssemblyResult,
  AgentPromptSummary,
  AgentPromptContext,
} from "../../src/agent-context/types.js";

/* ------------------------------------------------------------------ */
/*  Imports — module functions                                         */
/* ------------------------------------------------------------------ */

import {
  DEFAULT_AGENT_PROMPT_BUDGET,
  buildSessionSlice,
  buildWorkspaceSlice,
  buildFingerprintSlice,
  buildToolchainSlice,
  buildDiagnosticsSlice,
  buildLanguageContextSlice,
  buildMcpSlice,
  buildAgentsSlice,
  buildGitHubMcpSlice,
  buildAllCandidateSlices,
  priorityScore,
  comparePriority,
  meetsPriorityThreshold,
  trimSlice,
  applyBudget,
  adjustPrioritiesForRole,
  resolveBudget,
  buildPromptSummary,
  assembleAgentContext,
  inspectAssembly,
  getSliceReasons,
  getSliceEvidence,
  findSlice,
  getSlicesBySource,
  getContributingSources,
  getAllInclusionReasons,
  getAllExclusionReasons,
  buildCompactExplanation,
  buildOneLinerSummary,
  AGENT_CONTEXT_EVENT_KINDS,
  agentContextAssembled,
  agentContextRefreshed,
  agentContextFailed,
  isAgentContextEvent,
  filterAgentContextEvents,
  buildAgentContextSessionSummary,
} from "../../src/agent-context/index.js";

import type { AgentContextEventKind, AgentContextSessionSummary } from "../../src/agent-context/index.js";

/* ------------------------------------------------------------------ */
/*  Imports — command types for integration checks                     */
/* ------------------------------------------------------------------ */

import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
} from "../../src/commands/types.js";

import { validateCommand } from "../../src/commands/validation.js";

/* ------------------------------------------------------------------ */
/*  Deterministic fixtures                                             */
/* ------------------------------------------------------------------ */

const FIXTURE_SESSION_SUMMARY: Record<string, unknown> = {
  id: "sess-001",
  stage: "workspace_binding",
  status: "active",
  workspacePath: "/repos/my-project",
  branch: "main",
  eventCount: 12,
};

const FIXTURE_WORKSPACE_SUMMARY: Record<string, unknown> = {
  path: "/repos/my-project",
  source: "local_existing",
  status: "ready",
  branch: "main",
  isGitRepo: true,
  remoteUrl: "https://github.com/test/my-project.git",
};

const FIXTURE_FINGERPRINT_SUMMARY: Record<string, unknown> = {
  path: "/repos/my-project",
  languages: ["typescript", "javascript"],
  frameworks: [{ name: "node", language: "typescript", confidence: "strong" }],
  isMixed: false,
  hasStrongSignal: true,
};

const FIXTURE_PROFILE_SELECTION: Record<string, unknown> = {
  primary: {
    id: "typescript-node",
    label: "TypeScript / Node.js",
    primaryLanguage: "typescript",
    toolchainHints: ["npm", "tsc"],
    relatedCapabilities: ["editing", "testing", "reviewing"],
    preferredAgentRoles: ["editor", "reviewer", "tester"],
  },
  reason: "strong_language_match",
  confident: true,
  explanation: "Strong TypeScript/Node.js signals detected.",
};

const FIXTURE_TOOLCHAIN_SUMMARY: Record<string, unknown> = {
  adapterId: "typescript-node-toolchain",
  profileId: "typescript-node",
  toolchainKind: "npm",
  commands: [
    { type: "lint", label: "ESLint", command: "npx eslint .", tool: "eslint" },
    { type: "test", label: "Vitest", command: "npx vitest run", tool: "vitest" },
    { type: "typecheck", label: "TypeScript", command: "npx tsc --noEmit", tool: "tsc" },
  ],
  recommended: [
    { type: "lint", label: "ESLint" },
    { type: "test", label: "Vitest" },
  ],
  optional: [{ type: "typecheck", label: "TypeScript" }],
  unavailable: [],
  notes: [],
};

const FIXTURE_DIAGNOSTICS_SUMMARY: Record<string, unknown> = {
  profileId: "typescript-node",
  serviceKind: "typescript",
  collected: true,
  errorCount: 3,
  warningCount: 7,
  informationCount: 2,
  hintCount: 0,
  totalCount: 12,
  filesAffected: 5,
  sampleMessages: [
    "TS2304: Cannot find name 'foo'.",
    "TS2345: Argument of type 'string' is not assignable.",
    "TS6133: 'unused' is declared but never used.",
  ],
  diagnostics: [],
};

const FIXTURE_LANGUAGE_CONTEXT_SUMMARY: Record<string, unknown> = {
  profileId: "typescript-node",
  totalFilesAnalyzed: 42,
  confidence: "medium",
  entrypoints: ["src/index.ts", "src/server.ts"],
  configFiles: ["tsconfig.json", "package.json"],
  testFiles: ["tests/unit.test.ts", "tests/integration.test.ts"],
  notableSymbols: [
    { name: "SessionManager", kind: "class", exported: true, confidence: "high" },
    { name: "assembleAgentContext", kind: "function", exported: true, confidence: "high" },
  ],
  modules: [
    { modulePath: "src", fileCount: 20 },
    { modulePath: "tests", fileCount: 10 },
  ],
};

const FIXTURE_MCP_SUMMARY: Record<string, unknown> = {
  attachedCount: 2,
  healthyCount: 2,
  toolCount: 15,
  serverIds: ["mcp-echo", "mcp-github"],
};

const FIXTURE_AGENTS_SUMMARY: Record<string, unknown> = {
  attachedCount: 3,
  agents: [
    { name: "Planner", kind: "planning", status: "attached" },
    { name: "Coder", kind: "coding", status: "attached" },
    { name: "Reviewer", kind: "review", status: "attached" },
  ],
};

const FIXTURE_GITHUB_MCP_SUMMARY: Record<string, unknown> = {
  configured: true,
  authConfigured: true,
  toolCount: 10,
};

/** Full input with all sources available. */
function fullInput(agentKind: string, roleHint?: string): AgentPromptAssemblyInput {
  return {
    agentKind: agentKind as AgentPromptAssemblyInput["agentKind"],
    roleHint: roleHint as AgentPromptAssemblyInput["roleHint"],
    sessionSummary: FIXTURE_SESSION_SUMMARY,
    workspaceSummary: FIXTURE_WORKSPACE_SUMMARY,
    fingerprintSummary: FIXTURE_FINGERPRINT_SUMMARY,
    profileSelection: FIXTURE_PROFILE_SELECTION,
    toolchainSummary: FIXTURE_TOOLCHAIN_SUMMARY,
    diagnosticsSummary: FIXTURE_DIAGNOSTICS_SUMMARY,
    languageContextSummary: FIXTURE_LANGUAGE_CONTEXT_SUMMARY,
    mcpSummary: FIXTURE_MCP_SUMMARY,
    agentsSummary: FIXTURE_AGENTS_SUMMARY,
    githubMcpSummary: FIXTURE_GITHUB_MCP_SUMMARY,
  };
}

/** Minimal input with no sources available. */
function emptyInput(agentKind: string): AgentPromptAssemblyInput {
  return {
    agentKind: agentKind as AgentPromptAssemblyInput["agentKind"],
  };
}

/* ================================================================== */
/*  1. Types and constants                                             */
/* ================================================================== */

describe("Phase 44 — Types and constants", () => {
  it("DEFAULT_AGENT_PROMPT_BUDGET has sane defaults", () => {
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxTotalChars).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxSlices).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxSliceChars).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxFiles).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxSymbols).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.maxDiagnostics).toBeGreaterThan(0);
    expect(DEFAULT_AGENT_PROMPT_BUDGET.minPriority).toBe("low");
  });

  it("AGENT_CONTEXT_EVENT_KINDS has 3 kinds", () => {
    expect(AGENT_CONTEXT_EVENT_KINDS).toHaveLength(3);
    expect(AGENT_CONTEXT_EVENT_KINDS).toContain("agent_context_assembled");
    expect(AGENT_CONTEXT_EVENT_KINDS).toContain("agent_context_refreshed");
    expect(AGENT_CONTEXT_EVENT_KINDS).toContain("agent_context_failed");
  });
});

/* ================================================================== */
/*  2. Slice builders                                                  */
/* ================================================================== */

describe("Phase 44 — Slice builders", () => {
  describe("buildSessionSlice", () => {
    it("builds slice from session summary", () => {
      const slice = buildSessionSlice(FIXTURE_SESSION_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("session_summary");
      expect(slice!.source).toBe("session");
      expect(slice!.priority).toBe("high");
      expect(slice!.textContent).toContain("sess-001");
      expect(slice!.textContent).toContain("workspace_binding");
      expect(slice!.charCount).toBeGreaterThan(0);
      expect(slice!.reasons.length).toBeGreaterThan(0);
      expect(slice!.trimmed).toBe(false);
    });

    it("returns excluded slice for null summary", () => {
      const slice = buildSessionSlice(null);
      expect(slice).not.toBeNull();
      expect(slice!.priority).toBe("excluded");
      expect(slice!.reasons[0].kind).toBe("source_unavailable");
    });
  });

  describe("buildWorkspaceSlice", () => {
    it("builds slice from workspace summary", () => {
      const slice = buildWorkspaceSlice(FIXTURE_WORKSPACE_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("workspace_summary");
      expect(slice!.source).toBe("workspace");
      expect(slice!.priority).toBe("high");
      expect(slice!.textContent).toContain("/repos/my-project");
      expect(slice!.textContent).toContain("main");
    });

    it("returns excluded for null", () => {
      const slice = buildWorkspaceSlice(null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildFingerprintSlice", () => {
    it("builds slice from fingerprint + profile", () => {
      const slice = buildFingerprintSlice(FIXTURE_FINGERPRINT_SUMMARY, FIXTURE_PROFILE_SELECTION);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("fingerprint_profile");
      expect(slice!.source).toBe("fingerprint");
      expect(slice!.priority).toBe("critical");
      expect(slice!.textContent).toContain("typescript");
      expect(slice!.textContent).toContain("typescript-node");
    });

    it("builds slice from fingerprint only", () => {
      const slice = buildFingerprintSlice(FIXTURE_FINGERPRINT_SUMMARY, null);
      expect(slice).not.toBeNull();
      expect(slice!.priority).toBe("critical");
      expect(slice!.textContent).toContain("typescript");
    });

    it("builds slice from profile only", () => {
      const slice = buildFingerprintSlice(null, FIXTURE_PROFILE_SELECTION);
      expect(slice).not.toBeNull();
      expect(slice!.priority).toBe("critical");
      expect(slice!.textContent).toContain("typescript-node");
    });

    it("returns excluded when both null", () => {
      const slice = buildFingerprintSlice(null, null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildToolchainSlice", () => {
    it("builds slice from toolchain summary", () => {
      const slice = buildToolchainSlice(FIXTURE_TOOLCHAIN_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("toolchain_summary");
      expect(slice!.source).toBe("toolchain");
      expect(slice!.priority).toBe("high");
      expect(slice!.textContent).toContain("npm");
      expect(slice!.textContent).toContain("ESLint");
    });

    it("returns excluded for null", () => {
      const slice = buildToolchainSlice(null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildDiagnosticsSlice", () => {
    it("builds high-priority slice when errors exist", () => {
      const slice = buildDiagnosticsSlice(FIXTURE_DIAGNOSTICS_SUMMARY, 10);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("diagnostics_summary");
      expect(slice!.priority).toBe("high");
      expect(slice!.textContent).toContain("3 errors");
      expect(slice!.textContent).toContain("TS2304");
    });

    it("builds medium-priority slice when only warnings", () => {
      const warningsOnly = { ...FIXTURE_DIAGNOSTICS_SUMMARY, errorCount: 0, totalCount: 7 };
      const slice = buildDiagnosticsSlice(warningsOnly, 10);
      expect(slice!.priority).toBe("medium");
    });

    it("builds low-priority slice when no issues", () => {
      const clean = { ...FIXTURE_DIAGNOSTICS_SUMMARY, errorCount: 0, warningCount: 0, totalCount: 0 };
      const slice = buildDiagnosticsSlice(clean, 10);
      expect(slice!.priority).toBe("low");
    });

    it("returns excluded for null", () => {
      const slice = buildDiagnosticsSlice(null, 10);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildLanguageContextSlice", () => {
    it("builds slice with entrypoints, configs, tests, symbols, modules", () => {
      const slice = buildLanguageContextSlice(FIXTURE_LANGUAGE_CONTEXT_SUMMARY, 20, 30);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("language_context");
      expect(slice!.priority).toBe("high");
      expect(slice!.textContent).toContain("src/index.ts");
      expect(slice!.textContent).toContain("tsconfig.json");
      expect(slice!.textContent).toContain("SessionManager");
    });

    it("respects maxFiles/maxSymbols limits", () => {
      const manyFiles = {
        ...FIXTURE_LANGUAGE_CONTEXT_SUMMARY,
        entrypoints: Array.from({ length: 25 }, (_, i) => `file${i}.ts`),
      };
      const slice = buildLanguageContextSlice(manyFiles, 5, 5);
      expect(slice!.textContent).toContain("+20 more");
    });

    it("returns excluded for null", () => {
      const slice = buildLanguageContextSlice(null, 20, 30);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildMcpSlice", () => {
    it("builds slice from MCP summary", () => {
      const slice = buildMcpSlice(FIXTURE_MCP_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("mcp_summary");
      expect(slice!.source).toBe("mcp");
      expect(slice!.textContent).toContain("2");
      expect(slice!.textContent).toContain("15");
    });

    it("returns excluded for null", () => {
      const slice = buildMcpSlice(null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildAgentsSlice", () => {
    it("builds slice from agents summary", () => {
      const slice = buildAgentsSlice(FIXTURE_AGENTS_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("agents_summary");
      expect(slice!.textContent).toContain("Planner");
      expect(slice!.textContent).toContain("Coder");
    });

    it("returns excluded for null", () => {
      const slice = buildAgentsSlice(null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildGitHubMcpSlice", () => {
    it("builds slice from GitHub MCP summary", () => {
      const slice = buildGitHubMcpSlice(FIXTURE_GITHUB_MCP_SUMMARY);
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("github_mcp_summary");
      expect(slice!.textContent).toContain("true");
    });

    it("returns excluded for null", () => {
      const slice = buildGitHubMcpSlice(null);
      expect(slice!.priority).toBe("excluded");
    });
  });

  describe("buildAllCandidateSlices", () => {
    it("builds 9 slices from full input", () => {
      const slices = buildAllCandidateSlices(
        {
          sessionSummary: FIXTURE_SESSION_SUMMARY,
          workspaceSummary: FIXTURE_WORKSPACE_SUMMARY,
          fingerprintSummary: FIXTURE_FINGERPRINT_SUMMARY,
          profileSelection: FIXTURE_PROFILE_SELECTION,
          toolchainSummary: FIXTURE_TOOLCHAIN_SUMMARY,
          diagnosticsSummary: FIXTURE_DIAGNOSTICS_SUMMARY,
          languageContextSummary: FIXTURE_LANGUAGE_CONTEXT_SUMMARY,
          mcpSummary: FIXTURE_MCP_SUMMARY,
          agentsSummary: FIXTURE_AGENTS_SUMMARY,
          githubMcpSummary: FIXTURE_GITHUB_MCP_SUMMARY,
        },
        DEFAULT_AGENT_PROMPT_BUDGET,
      );
      expect(slices).toHaveLength(9);
      const ids = slices.map((s) => s.sliceId);
      expect(ids).toContain("session_summary");
      expect(ids).toContain("workspace_summary");
      expect(ids).toContain("fingerprint_profile");
      expect(ids).toContain("toolchain_summary");
      expect(ids).toContain("diagnostics_summary");
      expect(ids).toContain("language_context");
      expect(ids).toContain("mcp_summary");
      expect(ids).toContain("agents_summary");
      expect(ids).toContain("github_mcp_summary");
    });

    it("builds 9 slices even when all null (all excluded)", () => {
      const slices = buildAllCandidateSlices(
        {},
        DEFAULT_AGENT_PROMPT_BUDGET,
      );
      expect(slices).toHaveLength(9);
      const excluded = slices.filter((s) => s.priority === "excluded");
      expect(excluded).toHaveLength(9);
    });
  });
});

/* ================================================================== */
/*  3. Prioritization                                                  */
/* ================================================================== */

describe("Phase 44 — Prioritization", () => {
  describe("priorityScore", () => {
    it("returns correct scores", () => {
      expect(priorityScore("critical")).toBe(100);
      expect(priorityScore("high")).toBe(75);
      expect(priorityScore("medium")).toBe(50);
      expect(priorityScore("low")).toBe(25);
      expect(priorityScore("excluded")).toBe(0);
    });
  });

  describe("comparePriority", () => {
    it("critical > high > medium > low > excluded", () => {
      expect(comparePriority("critical", "high")).toBeLessThan(0);
      expect(comparePriority("high", "medium")).toBeLessThan(0);
      expect(comparePriority("medium", "low")).toBeLessThan(0);
      expect(comparePriority("low", "excluded")).toBeLessThan(0);
    });

    it("equal priorities return 0", () => {
      expect(comparePriority("high", "high")).toBe(0);
    });
  });

  describe("meetsPriorityThreshold", () => {
    it("critical meets any threshold", () => {
      expect(meetsPriorityThreshold("critical", "low")).toBe(true);
      expect(meetsPriorityThreshold("critical", "critical")).toBe(true);
    });

    it("low does not meet high threshold", () => {
      expect(meetsPriorityThreshold("low", "high")).toBe(false);
    });

    it("excluded meets no non-excluded threshold", () => {
      expect(meetsPriorityThreshold("excluded", "low")).toBe(false);
    });
  });

  describe("trimSlice", () => {
    it("does not trim if under budget", () => {
      const slice: AgentPromptContextSlice = {
        sliceId: "test",
        source: "session",
        label: "Test",
        priority: "high",
        content: {},
        textContent: "Hello world",
        charCount: 11,
        reasons: [],
        evidence: [],
        trimmed: false,
        originalCharCount: null,
      };
      const result = trimSlice(slice, 100);
      expect(result.trimmed).toBe(false);
      expect(result.charCount).toBe(11);
    });

    it("trims if over budget", () => {
      const longText = "A".repeat(500);
      const slice: AgentPromptContextSlice = {
        sliceId: "test",
        source: "session",
        label: "Test",
        priority: "high",
        content: {},
        textContent: longText,
        charCount: 500,
        reasons: [],
        evidence: [],
        trimmed: false,
        originalCharCount: null,
      };
      const result = trimSlice(slice, 100);
      expect(result.trimmed).toBe(true);
      expect(result.charCount).toBeLessThanOrEqual(100);
      expect(result.originalCharCount).toBe(500);
      expect(result.textContent).toContain("(trimmed)");
    });
  });

  describe("applyBudget", () => {
    function makeSlice(id: string, priority: AgentPromptPriority, chars: number): AgentPromptContextSlice {
      return {
        sliceId: id,
        source: "session",
        label: id,
        priority,
        content: {},
        textContent: "X".repeat(chars),
        charCount: chars,
        reasons: [{ kind: "always_included", explanation: "test", effect: "included" }],
        evidence: [],
        trimmed: false,
        originalCharCount: null,
      };
    }

    it("includes all slices within budget", () => {
      const candidates = [
        makeSlice("a", "critical", 100),
        makeSlice("b", "high", 100),
      ];
      const budget: AgentPromptBudget = { ...DEFAULT_AGENT_PROMPT_BUDGET, maxTotalChars: 1000, maxSlices: 10 };
      const { included, excluded } = applyBudget(candidates, budget);
      expect(included).toHaveLength(2);
      expect(excluded).toHaveLength(0);
    });

    it("excludes slices below minPriority", () => {
      const candidates = [
        makeSlice("a", "critical", 100),
        makeSlice("b", "low", 100),
      ];
      const budget: AgentPromptBudget = { ...DEFAULT_AGENT_PROMPT_BUDGET, minPriority: "medium" };
      const { included, excluded } = applyBudget(candidates, budget);
      expect(included).toHaveLength(1);
      expect(excluded).toHaveLength(1);
      expect(excluded[0].reasons.some((r) => r.kind === "priority_cutoff")).toBe(true);
    });

    it("respects maxSlices limit", () => {
      const candidates = [
        makeSlice("a", "critical", 50),
        makeSlice("b", "high", 50),
        makeSlice("c", "medium", 50),
      ];
      const budget: AgentPromptBudget = { ...DEFAULT_AGENT_PROMPT_BUDGET, maxSlices: 2 };
      const { included, excluded } = applyBudget(candidates, budget);
      expect(included).toHaveLength(2);
      expect(excluded).toHaveLength(1);
      expect(excluded[0].reasons.some((r) => r.kind === "budget_exceeded")).toBe(true);
    });

    it("respects maxTotalChars limit", () => {
      const candidates = [
        makeSlice("a", "critical", 150),
        makeSlice("b", "high", 150),
        makeSlice("c", "medium", 150),
      ];
      const budget: AgentPromptBudget = { ...DEFAULT_AGENT_PROMPT_BUDGET, maxTotalChars: 300, maxSlices: 10 };
      const { included, excluded } = applyBudget(candidates, budget);
      expect(included).toHaveLength(2);
      expect(excluded).toHaveLength(1);
    });

    it("excludes already-excluded slices", () => {
      const candidates = [
        makeSlice("a", "critical", 100),
        { ...makeSlice("b", "excluded", 100) },
      ];
      const { included, excluded } = applyBudget(candidates, DEFAULT_AGENT_PROMPT_BUDGET);
      expect(included).toHaveLength(1);
      expect(excluded).toHaveLength(1);
    });

    it("sorts by priority (critical first, then alpha by sliceId)", () => {
      const candidates = [
        makeSlice("c", "low", 50),
        makeSlice("a", "critical", 50),
        makeSlice("b", "high", 50),
      ];
      const { included } = applyBudget(candidates, DEFAULT_AGENT_PROMPT_BUDGET);
      expect(included[0].sliceId).toBe("a");
      expect(included[1].sliceId).toBe("b");
      expect(included[2].sliceId).toBe("c");
    });
  });

  describe("adjustPrioritiesForRole", () => {
    function makeSlice(id: string, priority: AgentPromptPriority): AgentPromptContextSlice {
      return {
        sliceId: id,
        source: "session",
        label: id,
        priority,
        content: {},
        textContent: "",
        charCount: 0,
        reasons: [],
        evidence: [],
        trimmed: false,
        originalCharCount: null,
      };
    }

    it("planning agent elevates fingerprint and workspace to critical", () => {
      const slices = [
        makeSlice("fingerprint_profile", "high"),
        makeSlice("workspace_summary", "high"),
        makeSlice("diagnostics_summary", "high"),
      ];
      const adjusted = adjustPrioritiesForRole(slices, "planning");
      const fp = adjusted.find((s) => s.sliceId === "fingerprint_profile")!;
      const ws = adjusted.find((s) => s.sliceId === "workspace_summary")!;
      const diag = adjusted.find((s) => s.sliceId === "diagnostics_summary")!;
      expect(fp.priority).toBe("critical");
      expect(ws.priority).toBe("critical");
      expect(diag.priority).toBe("medium");
    });

    it("review agent elevates diagnostics to critical", () => {
      const slices = [
        makeSlice("diagnostics_summary", "medium"),
        makeSlice("toolchain_summary", "medium"),
      ];
      const adjusted = adjustPrioritiesForRole(slices, "review");
      expect(adjusted[0].priority).toBe("critical");
      expect(adjusted[1].priority).toBe("critical");
    });

    it("coding agent elevates language_context to critical", () => {
      const slices = [
        makeSlice("language_context", "high"),
        makeSlice("workspace_summary", "high"),
      ];
      const adjusted = adjustPrioritiesForRole(slices, "coding");
      expect(adjusted[0].priority).toBe("critical");
      expect(adjusted[1].priority).toBe("critical");
    });

    it("testing agent elevates toolchain to critical", () => {
      const slices = [
        makeSlice("toolchain_summary", "high"),
        makeSlice("language_context", "high"),
      ];
      const adjusted = adjustPrioritiesForRole(slices, "testing");
      expect(adjusted[0].priority).toBe("critical");
      expect(adjusted[1].priority).toBe("critical");
    });

    it("system agent elevates session/workspace/mcp/agents to critical", () => {
      const slices = [
        makeSlice("session_summary", "high"),
        makeSlice("workspace_summary", "high"),
        makeSlice("mcp_summary", "medium"),
        makeSlice("agents_summary", "medium"),
      ];
      const adjusted = adjustPrioritiesForRole(slices, "system");
      for (const s of adjusted) {
        expect(s.priority).toBe("critical");
      }
    });

    it("role hint overrides agent kind", () => {
      const slices = [makeSlice("mcp_summary", "medium")];
      // mcp_bridge role should elevate MCP to critical
      const adjusted = adjustPrioritiesForRole(slices, "external", "mcp_bridge");
      expect(adjusted[0].priority).toBe("critical");
    });

    it("does not adjust excluded slices", () => {
      const slices = [makeSlice("fingerprint_profile", "excluded")];
      const adjusted = adjustPrioritiesForRole(slices, "planning");
      expect(adjusted[0].priority).toBe("excluded");
    });

    it("adds role_match reason when adjusting", () => {
      const slices = [makeSlice("diagnostics_summary", "medium")];
      const adjusted = adjustPrioritiesForRole(slices, "review");
      expect(adjusted[0].reasons.some((r) => r.kind === "role_match")).toBe(true);
    });
  });
});

/* ================================================================== */
/*  4. Assembly                                                        */
/* ================================================================== */

describe("Phase 44 — Assembly", () => {
  describe("resolveBudget", () => {
    it("returns defaults when no partial", () => {
      const b = resolveBudget();
      expect(b).toEqual(DEFAULT_AGENT_PROMPT_BUDGET);
    });

    it("overrides specific fields", () => {
      const b = resolveBudget({ maxTotalChars: 4000 });
      expect(b.maxTotalChars).toBe(4000);
      expect(b.maxSlices).toBe(DEFAULT_AGENT_PROMPT_BUDGET.maxSlices);
    });
  });

  describe("assembleAgentContext — planning agent", () => {
    it("produces context with all sources included", () => {
      const ctx = assembleAgentContext(fullInput("planning", "planner"));
      expect(ctx.assembly.agentKind).toBe("planning");
      expect(ctx.assembly.roleHint).toBe("planner");
      expect(ctx.assembly.profileId).toBe("typescript-node");
      expect(ctx.assembly.includedSlices.length).toBeGreaterThan(0);
      expect(ctx.assembledText.length).toBeGreaterThan(0);
      expect(ctx.summary.includedSliceCount).toBeGreaterThan(0);
    });

    it("includes fingerprint/profile as critical", () => {
      const ctx = assembleAgentContext(fullInput("planning"));
      const fp = ctx.assembly.includedSlices.find((s) => s.sliceId === "fingerprint_profile");
      expect(fp).toBeDefined();
      expect(fp!.priority).toBe("critical");
    });

    it("includes workspace as critical", () => {
      const ctx = assembleAgentContext(fullInput("planning"));
      const ws = ctx.assembly.includedSlices.find((s) => s.sliceId === "workspace_summary");
      expect(ws).toBeDefined();
      expect(ws!.priority).toBe("critical");
    });
  });

  describe("assembleAgentContext — coding agent", () => {
    it("elevates language_context to critical", () => {
      const ctx = assembleAgentContext(fullInput("coding", "editor"));
      const lc = ctx.assembly.includedSlices.find((s) => s.sliceId === "language_context");
      expect(lc).toBeDefined();
      expect(lc!.priority).toBe("critical");
    });

    it("includes diagnostics as high", () => {
      const ctx = assembleAgentContext(fullInput("coding"));
      const diag = ctx.assembly.includedSlices.find((s) => s.sliceId === "diagnostics_summary");
      expect(diag).toBeDefined();
      expect(diag!.priority).toBe("high");
    });
  });

  describe("assembleAgentContext — review agent", () => {
    it("elevates diagnostics to critical", () => {
      const ctx = assembleAgentContext(fullInput("review", "reviewer"));
      const diag = ctx.assembly.includedSlices.find((s) => s.sliceId === "diagnostics_summary");
      expect(diag).toBeDefined();
      expect(diag!.priority).toBe("critical");
    });

    it("elevates toolchain to critical", () => {
      const ctx = assembleAgentContext(fullInput("review"));
      const tc = ctx.assembly.includedSlices.find((s) => s.sliceId === "toolchain_summary");
      expect(tc).toBeDefined();
      expect(tc!.priority).toBe("critical");
    });
  });

  describe("assembleAgentContext — testing agent", () => {
    it("elevates toolchain and language_context to critical", () => {
      const ctx = assembleAgentContext(fullInput("testing", "tester"));
      const tc = ctx.assembly.includedSlices.find((s) => s.sliceId === "toolchain_summary");
      const lc = ctx.assembly.includedSlices.find((s) => s.sliceId === "language_context");
      expect(tc!.priority).toBe("critical");
      expect(lc!.priority).toBe("critical");
    });
  });

  describe("assembleAgentContext — system agent", () => {
    it("elevates session/workspace/mcp/agents to critical", () => {
      const ctx = assembleAgentContext(fullInput("system", "narrator"));
      const sess = ctx.assembly.includedSlices.find((s) => s.sliceId === "session_summary");
      const mcp = ctx.assembly.includedSlices.find((s) => s.sliceId === "mcp_summary");
      const agents = ctx.assembly.includedSlices.find((s) => s.sliceId === "agents_summary");
      expect(sess!.priority).toBe("critical");
      expect(mcp!.priority).toBe("critical");
      expect(agents!.priority).toBe("critical");
    });
  });

  describe("assembleAgentContext — empty input", () => {
    it("all slices are excluded when no data available", () => {
      const ctx = assembleAgentContext(emptyInput("planning"));
      expect(ctx.assembly.includedSlices).toHaveLength(0);
      expect(ctx.assembly.excludedSlices.length).toBeGreaterThan(0);
      expect(ctx.assembly.totalIncludedChars).toBe(0);
      expect(ctx.assembledText).toBe("");
      expect(ctx.assembly.notes).toContain("No context slices available — all sources were unavailable or excluded.");
    });
  });

  describe("assembleAgentContext — determinism", () => {
    it("produces identical output for same input", () => {
      const input = fullInput("planning", "planner");
      const ctx1 = assembleAgentContext(input);
      const ctx2 = assembleAgentContext(input);

      // Compare slice IDs and priorities (timestamps will differ)
      const ids1 = ctx1.assembly.includedSlices.map((s) => `${s.sliceId}:${s.priority}`);
      const ids2 = ctx2.assembly.includedSlices.map((s) => `${s.sliceId}:${s.priority}`);
      expect(ids1).toEqual(ids2);

      // Same char counts
      expect(ctx1.assembly.totalIncludedChars).toBe(ctx2.assembly.totalIncludedChars);

      // Same number of excluded
      expect(ctx1.assembly.excludedSlices.length).toBe(ctx2.assembly.excludedSlices.length);
    });
  });

  describe("assembleAgentContext — profile-aware differences", () => {
    it("different profiles produce different results", () => {
      const tsInput = fullInput("coding");
      const unknownInput: AgentPromptAssemblyInput = {
        ...fullInput("coding"),
        profileSelection: {
          primary: {
            id: "generic-unknown",
            label: "Unknown",
            primaryLanguage: "unknown",
            toolchainHints: [],
            relatedCapabilities: [],
            preferredAgentRoles: [],
          },
          reason: "no_signals",
          confident: false,
        },
      };

      const tsCtx = assembleAgentContext(tsInput);
      const unknownCtx = assembleAgentContext(unknownInput);

      expect(tsCtx.assembly.profileId).toBe("typescript-node");
      expect(unknownCtx.assembly.profileId).toBe("generic-unknown");
    });
  });

  describe("assembleAgentContext — budget control", () => {
    it("respects custom budget", () => {
      const input: AgentPromptAssemblyInput = {
        ...fullInput("planning"),
        budget: { maxSlices: 3, maxTotalChars: 500 },
      };
      const ctx = assembleAgentContext(input);
      expect(ctx.assembly.includedSlices.length).toBeLessThanOrEqual(3);
      expect(ctx.assembly.totalIncludedChars).toBeLessThanOrEqual(500);
    });

    it("tight budget excludes lower priority slices", () => {
      const input: AgentPromptAssemblyInput = {
        ...fullInput("planning"),
        budget: { maxSlices: 2 },
      };
      const ctx = assembleAgentContext(input);
      expect(ctx.assembly.includedSlices.length).toBeLessThanOrEqual(2);
      expect(ctx.assembly.excludedSlices.length).toBeGreaterThan(0);
    });

    it("minPriority=high excludes medium and low slices", () => {
      const input: AgentPromptAssemblyInput = {
        ...fullInput("external"),
        budget: { minPriority: "high" as AgentPromptPriority },
      };
      const ctx = assembleAgentContext(input);
      for (const s of ctx.assembly.includedSlices) {
        expect(["critical", "high"]).toContain(s.priority);
      }
    });
  });

  describe("inspectAssembly", () => {
    it("produces a human-readable report", () => {
      const ctx = assembleAgentContext(fullInput("planning"));
      const report = inspectAssembly(ctx.assembly);
      expect(report).toContain("Agent Context Assembly Report");
      expect(report).toContain("planning");
      expect(report).toContain("Included slices");
      expect(report).toContain("Excluded slices");
      expect(report).toContain("Budget:");
      expect(report).toContain("Notes:");
    });
  });

  describe("buildPromptSummary", () => {
    it("builds compact summary", () => {
      const ctx = assembleAgentContext(fullInput("coding"));
      const summary = buildPromptSummary(ctx.assembly);
      expect(summary.agentKind).toBe("coding");
      expect(summary.includedSliceCount).toBeGreaterThan(0);
      expect(summary.totalChars).toBeGreaterThan(0);
      expect(summary.contributingSources.length).toBeGreaterThan(0);
      expect(summary.explanation).toContain("coding");
    });
  });
});

/* ================================================================== */
/*  5. Traceability                                                    */
/* ================================================================== */

describe("Phase 44 — Traceability", () => {
  const ctx = assembleAgentContext(fullInput("planning", "planner"));

  describe("getSliceReasons", () => {
    it("returns reasons for an included slice", () => {
      const reasons = getSliceReasons(ctx.assembly, "fingerprint_profile");
      expect(reasons.length).toBeGreaterThan(0);
    });

    it("returns empty for unknown slice", () => {
      const reasons = getSliceReasons(ctx.assembly, "nonexistent");
      expect(reasons).toHaveLength(0);
    });
  });

  describe("getSliceEvidence", () => {
    it("returns evidence for an included slice", () => {
      const evidence = getSliceEvidence(ctx.assembly, "session_summary");
      expect(evidence.length).toBeGreaterThan(0);
    });
  });

  describe("findSlice", () => {
    it("finds included slices", () => {
      const slice = findSlice(ctx.assembly, "session_summary");
      expect(slice).not.toBeNull();
      expect(slice!.sliceId).toBe("session_summary");
    });

    it("returns null for unknown", () => {
      expect(findSlice(ctx.assembly, "nonexistent")).toBeNull();
    });
  });

  describe("getSlicesBySource", () => {
    it("groups slices by source", () => {
      const { included, excluded } = getSlicesBySource(ctx.assembly, "session");
      expect(included.length + excluded.length).toBeGreaterThan(0);
    });
  });

  describe("getContributingSources", () => {
    it("returns sources with included slices", () => {
      const sources = getContributingSources(ctx.assembly);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources).toContain("session");
    });
  });

  describe("getAllInclusionReasons", () => {
    it("returns all inclusion reasons", () => {
      const reasons = getAllInclusionReasons(ctx.assembly);
      expect(reasons.length).toBeGreaterThan(0);
      for (const r of reasons) {
        expect(r.reason.effect).toBe("included");
      }
    });
  });

  describe("getAllExclusionReasons", () => {
    it("returns exclusion reasons when slices excluded", () => {
      const emptyCtx = assembleAgentContext(emptyInput("planning"));
      const reasons = getAllExclusionReasons(emptyCtx.assembly);
      expect(reasons.length).toBeGreaterThan(0);
      for (const r of reasons) {
        expect(r.reason.effect).toBe("excluded");
      }
    });
  });

  describe("buildCompactExplanation", () => {
    it("produces multi-line explanation", () => {
      const explanation = buildCompactExplanation(ctx.assembly);
      expect(explanation).toContain("planning");
      expect(explanation).toContain("Included");
    });

    it("shows unavailable slices in empty context", () => {
      const emptyCtx = assembleAgentContext(emptyInput("coding"));
      const explanation = buildCompactExplanation(emptyCtx.assembly);
      expect(explanation).toContain("Unavailable");
    });
  });

  describe("buildOneLinerSummary", () => {
    it("produces one-line summary", () => {
      const summary = buildOneLinerSummary(ctx.assembly);
      expect(summary).toContain("planning/planner");
      expect(summary).toContain("slices");
      expect(summary).toContain("chars");
    });
  });
});

/* ================================================================== */
/*  6. Session integration                                             */
/* ================================================================== */

describe("Phase 44 — Session integration", () => {
  describe("event factories", () => {
    it("agentContextAssembled creates event", () => {
      const ctx = assembleAgentContext(fullInput("coding"));
      const event = agentContextAssembled(ctx.summary);
      expect(event.kind).toBe("agent_context_assembled");
      expect(event.message).toContain("coding");
      expect(event.detail?.agentKind).toBe("coding");
      expect(event.detail?.includedSliceCount).toBeGreaterThan(0);
    });

    it("agentContextRefreshed creates event", () => {
      const ctx = assembleAgentContext(fullInput("review"));
      const event = agentContextRefreshed(ctx.summary);
      expect(event.kind).toBe("agent_context_refreshed");
      expect(event.message).toContain("review");
    });

    it("agentContextFailed creates event", () => {
      const event = agentContextFailed("testing", "Missing toolchain data");
      expect(event.kind).toBe("agent_context_failed");
      expect(event.message).toContain("testing");
      expect(event.message).toContain("Missing toolchain data");
    });
  });

  describe("event filtering", () => {
    it("isAgentContextEvent identifies context events", () => {
      const event = agentContextAssembled(assembleAgentContext(fullInput("coding")).summary);
      expect(isAgentContextEvent(event)).toBe(true);
    });

    it("isAgentContextEvent rejects non-context events", () => {
      expect(isAgentContextEvent({ kind: "session_created", timestamp: "", message: "" })).toBe(false);
    });

    it("filterAgentContextEvents filters correctly", () => {
      const events = [
        agentContextAssembled(assembleAgentContext(fullInput("coding")).summary),
        { kind: "session_created" as const, timestamp: "", message: "" },
        agentContextFailed("testing", "error"),
      ];
      const filtered = filterAgentContextEvents(events);
      expect(filtered).toHaveLength(2);
    });
  });

  describe("buildAgentContextSessionSummary", () => {
    it("builds summary from result", () => {
      const ctx = assembleAgentContext(fullInput("planning"));
      const summary = buildAgentContextSessionSummary(ctx.assembly);
      expect(summary.agentContextAssembled).toBe(true);
      expect(summary.agentContextAgentKind).toBe("planning");
      expect(summary.agentContextIncludedSlices).toBeGreaterThan(0);
      expect(summary.agentContextTotalChars).toBeGreaterThan(0);
      expect(summary.agentContextSources).not.toBeNull();
    });

    it("builds empty summary for null", () => {
      const summary = buildAgentContextSessionSummary(null);
      expect(summary.agentContextAssembled).toBe(false);
      expect(summary.agentContextAgentKind).toBeNull();
      expect(summary.agentContextIncludedSlices).toBeNull();
    });
  });
});

/* ================================================================== */
/*  7. Command integration                                             */
/* ================================================================== */

describe("Phase 44 — Command integration", () => {
  it("3 new command IDs exist", () => {
    expect(ALL_COMMAND_IDS).toContain("inspect_agent_context");
    expect(ALL_COMMAND_IDS).toContain("build_agent_prompt_context");
    expect(ALL_COMMAND_IDS).toContain("refresh_agent_context");
  });

  it("agent_context category exists", () => {
    expect(ALL_COMMAND_CATEGORIES).toContain("agent_context");
  });

  it("command definitions have correct category", () => {
    const inspect = getCommandDefinition("inspect_agent_context");
    const build = getCommandDefinition("build_agent_prompt_context");
    const refresh = getCommandDefinition("refresh_agent_context");
    expect(inspect?.category).toBe("agent_context");
    expect(build?.category).toBe("agent_context");
    expect(refresh?.category).toBe("agent_context");
  });

  it("total command definitions = 26", () => {
    expect(COMMAND_DEFINITIONS).toHaveLength(26);
  });

  describe("validation", () => {
    it("validates inspect_agent_context — requires agentKind", () => {
      const result = validateCommand({
        commandId: "inspect_agent_context",
        data: { agentKind: "" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates inspect_agent_context — valid kinds accepted", () => {
      for (const kind of ["system", "coding", "review", "planning", "testing", "external"]) {
        const result = validateCommand({
          commandId: "inspect_agent_context",
          data: { agentKind: kind },
        });
        expect(result.valid).toBe(true);
      }
    });

    it("validates inspect_agent_context — invalid kind rejected", () => {
      const result = validateCommand({
        commandId: "inspect_agent_context",
        data: { agentKind: "invalid" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates build_agent_prompt_context — requires agentKind", () => {
      const result = validateCommand({
        commandId: "build_agent_prompt_context",
        data: { agentKind: "" },
      });
      expect(result.valid).toBe(false);
    });

    it("validates build_agent_prompt_context — accepts valid input", () => {
      const result = validateCommand({
        commandId: "build_agent_prompt_context",
        data: { agentKind: "coding", roleHint: "editor", maxTotalChars: 4000, maxSlices: 5 },
      });
      expect(result.valid).toBe(true);
    });

    it("validates build_agent_prompt_context — rejects bad maxTotalChars", () => {
      const result = validateCommand({
        commandId: "build_agent_prompt_context",
        data: { agentKind: "coding", maxTotalChars: 10 },
      });
      expect(result.valid).toBe(false);
    });

    it("validates build_agent_prompt_context — rejects bad maxSlices", () => {
      const result = validateCommand({
        commandId: "build_agent_prompt_context",
        data: { agentKind: "coding", maxSlices: 0 },
      });
      expect(result.valid).toBe(false);
    });

    it("validates refresh_agent_context — no inputs required", () => {
      const result = validateCommand({
        commandId: "refresh_agent_context",
        data: {},
      });
      expect(result.valid).toBe(true);
    });
  });
});

/* ================================================================== */
/*  8. SessionEventKind type coverage                                  */
/* ================================================================== */

describe("Phase 44 — SessionEventKind coverage", () => {
  it("agent_context event kinds are in SessionEventKind (via session/types.ts)", async () => {
    // Dynamically import to verify the types compile
    const sessionTypes = await import("../../src/session/types.js");
    // The type check is compile-time. We verify the event kinds work at runtime via factories.
    const event = agentContextAssembled(assembleAgentContext(fullInput("coding")).summary);
    expect(event.kind).toBe("agent_context_assembled");
    // If this compiles and runs, the event kind is properly in SessionEventKind
  });
});

/* ================================================================== */
/*  9. Barrel export completeness                                      */
/* ================================================================== */

describe("Phase 44 — Barrel exports", () => {
  it("agent-context index exports all public functions", async () => {
    const mod = await import("../../src/agent-context/index.js");
    // Types (checked via presence of value exports)
    expect(mod.DEFAULT_AGENT_PROMPT_BUDGET).toBeDefined();
    // Slice builders
    expect(mod.buildSessionSlice).toBeTypeOf("function");
    expect(mod.buildWorkspaceSlice).toBeTypeOf("function");
    expect(mod.buildFingerprintSlice).toBeTypeOf("function");
    expect(mod.buildToolchainSlice).toBeTypeOf("function");
    expect(mod.buildDiagnosticsSlice).toBeTypeOf("function");
    expect(mod.buildLanguageContextSlice).toBeTypeOf("function");
    expect(mod.buildMcpSlice).toBeTypeOf("function");
    expect(mod.buildAgentsSlice).toBeTypeOf("function");
    expect(mod.buildGitHubMcpSlice).toBeTypeOf("function");
    expect(mod.buildAllCandidateSlices).toBeTypeOf("function");
    // Prioritization
    expect(mod.priorityScore).toBeTypeOf("function");
    expect(mod.comparePriority).toBeTypeOf("function");
    expect(mod.meetsPriorityThreshold).toBeTypeOf("function");
    expect(mod.trimSlice).toBeTypeOf("function");
    expect(mod.applyBudget).toBeTypeOf("function");
    expect(mod.adjustPrioritiesForRole).toBeTypeOf("function");
    // Assembly
    expect(mod.resolveBudget).toBeTypeOf("function");
    expect(mod.buildPromptSummary).toBeTypeOf("function");
    expect(mod.assembleAgentContext).toBeTypeOf("function");
    expect(mod.inspectAssembly).toBeTypeOf("function");
    // Traceability
    expect(mod.getSliceReasons).toBeTypeOf("function");
    expect(mod.getSliceEvidence).toBeTypeOf("function");
    expect(mod.findSlice).toBeTypeOf("function");
    expect(mod.getSlicesBySource).toBeTypeOf("function");
    expect(mod.getContributingSources).toBeTypeOf("function");
    expect(mod.getAllInclusionReasons).toBeTypeOf("function");
    expect(mod.getAllExclusionReasons).toBeTypeOf("function");
    expect(mod.buildCompactExplanation).toBeTypeOf("function");
    expect(mod.buildOneLinerSummary).toBeTypeOf("function");
    // Session integration
    expect(mod.AGENT_CONTEXT_EVENT_KINDS).toBeDefined();
    expect(mod.agentContextAssembled).toBeTypeOf("function");
    expect(mod.agentContextRefreshed).toBeTypeOf("function");
    expect(mod.agentContextFailed).toBeTypeOf("function");
    expect(mod.isAgentContextEvent).toBeTypeOf("function");
    expect(mod.filterAgentContextEvents).toBeTypeOf("function");
    expect(mod.buildAgentContextSessionSummary).toBeTypeOf("function");
  });

  it("main index re-exports agent-context", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.assembleAgentContext).toBeTypeOf("function");
    expect(mod.DEFAULT_AGENT_PROMPT_BUDGET).toBeDefined();
  });
});

/* ================================================================== */
/*  10. Package.json subpath export                                    */
/* ================================================================== */

describe("Phase 44 — Package subpath export", () => {
  it("package.json has ./agent-context export", async () => {
    const { readFileSync } = await import("fs");
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(pkg.exports["./agent-context"]).toBeDefined();
    expect(pkg.exports["./agent-context"].import).toContain("agent-context");
  });
});

/* ================================================================== */
/*  11. Additional edge cases                                          */
/* ================================================================== */

describe("Phase 44 — Edge cases", () => {
  it("assembly with only session data produces 1 included slice", () => {
    const input: AgentPromptAssemblyInput = {
      agentKind: "system",
      sessionSummary: FIXTURE_SESSION_SUMMARY,
    };
    const ctx = assembleAgentContext(input);
    expect(ctx.assembly.includedSlices.length).toBe(1);
    expect(ctx.assembly.includedSlices[0].sliceId).toBe("session_summary");
    expect(ctx.assembly.excludedSlices.length).toBe(8);
  });

  it("notes always include honesty disclaimer", () => {
    const ctx = assembleAgentContext(fullInput("planning"));
    expect(ctx.assembly.notes.some((n) => n.includes("deterministically"))).toBe(true);
  });

  it("notes include no-profile warning when profile missing", () => {
    const input: AgentPromptAssemblyInput = {
      agentKind: "planning",
      sessionSummary: FIXTURE_SESSION_SUMMARY,
    };
    const ctx = assembleAgentContext(input);
    expect(ctx.assembly.notes.some((n) => n.includes("No language profile"))).toBe(true);
  });

  it("assembledText has section headers per slice", () => {
    const ctx = assembleAgentContext(fullInput("coding"));
    expect(ctx.assembledText).toContain("--- ");
    expect(ctx.assembledText).toContain("---\n");
  });

  it("empty assembledText when no slices included", () => {
    const ctx = assembleAgentContext(emptyInput("planning"));
    expect(ctx.assembledText).toBe("");
  });

  it("summary explanation mentions agent kind", () => {
    const ctx = assembleAgentContext(fullInput("testing"));
    expect(ctx.summary.explanation).toContain("testing");
  });
});
