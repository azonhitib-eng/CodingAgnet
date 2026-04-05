/**
 * Tests for the plan renderer.
 *
 * Covers:
 *   - plan rendering output structure (header, sections, footer)
 *   - rendering with safety report
 *   - rendering without safety report
 *   - correct section headers
 *   - step details rendering
 *   - resource estimate rendering
 *   - risk/warning rendering
 *   - custom line width
 */

import { describe, it, expect } from "vitest";
import { renderPlan } from "../../src/install-plan/plan-renderer.js";
import type {
  InstallPlan,
  SafetyReport,
} from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(overrides?: Partial<InstallPlan>): InstallPlan {
  return {
    artifactId: "test-model-7b-q4_k_m-ollama",
    runtimeId: "ollama",
    targetPlatform: "linux",
    prerequisites: [
      {
        name: "Ollama",
        checkCommand: "ollama --version",
        installHint: "curl -fsSL https://ollama.ai/install.sh | sh",
      },
    ],
    steps: [
      {
        order: 0,
        command: "curl -fsSL https://ollama.ai/install.sh | sh",
        description: "Install Ollama on linux",
        riskLevel: "caution",
        requiresApproval: true,
        reversible: true,
        platforms: ["linux"],
      },
      {
        order: 1,
        command: "ollama pull test-model:7b-q4_k_m",
        description: "Download model artifact",
        riskLevel: "safe",
        requiresApproval: false,
        reversible: true,
        platforms: ["linux"],
        estimatedDurationSec: 84,
      },
    ],
    postInstallVerification: [
      {
        command: "ollama --version",
        description: "Verify Ollama is installed",
      },
      {
        command: "ollama list | grep test-model",
        description: "Verify model is available",
        expectedOutput: "test-model",
      },
    ],
    resourceEstimate: {
      diskSpaceGb: 4.1,
      peakRamGb: 12,
      requiresNetwork: true,
      estimatedDownloadGb: 4.1,
    },
    risks: [
      "WARNING: GPU VRAM is estimated — actual capacity may differ.",
      "CAUTION: Runtime install uses a piped download script.",
    ],
    humanSummary: 'Install plan for "Test Model 7B" (q4_k_m) using Ollama on linux.',
    ...overrides,
  };
}

function makeSafetyReport(overrides?: Partial<SafetyReport>): SafetyReport {
  return {
    planId: "test-model-7b-q4_k_m-ollama",
    violations: [
      {
        stepIndex: 0,
        type: "command",
        description: "Dangerous: curl pipe",
        severity: "dangerous",
      },
    ],
    warnings: [
      "Step 0: curl detected — network download",
    ],
    approved: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderPlan", () => {

  describe("output structure", () => {
    it("should contain header with INSTALL PLAN", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("INSTALL PLAN:");
    });

    it("should contain END OF PLAN footer", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("END OF PLAN");
    });

    it("should contain PREREQUISITES section", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("PREREQUISITES");
    });

    it("should contain INSTALL STEPS section", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("INSTALL STEPS");
    });

    it("should contain POST-INSTALL VERIFICATION section", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("POST-INSTALL VERIFICATION");
    });

    it("should contain RESOURCE ESTIMATES section", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("RESOURCE ESTIMATES");
    });

    it("should contain RISKS & WARNINGS section when risks exist", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("RISKS & WARNINGS");
    });
  });

  describe("plan content rendering", () => {
    it("should render summary line", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Summary:");
      expect(output).toContain("Test Model 7B");
    });

    it("should render runtime and platform", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Runtime: ollama");
      expect(output).toContain("Platform: linux");
    });

    it("should render prerequisite details", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("[Ollama]");
      expect(output).toContain("Check: ollama --version");
    });

    it("should render step commands and risk levels", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Command: ollama pull test-model:7b-q4_k_m");
      expect(output).toContain("Risk: safe | reversible");
    });

    it("should render APPROVAL REQUIRED for steps that need approval", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("[APPROVAL REQUIRED]");
    });

    it("should render estimated duration when present", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Est. duration: ~84s");
    });

    it("should render verification steps with expected output", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Expected: test-model");
    });

    it("should render resource estimates", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("Disk space: 4.1 GB");
      expect(output).toContain("Peak RAM: 12 GB");
      expect(output).toContain("Network required: yes");
      expect(output).toContain("Download size: ~4.1 GB");
    });

    it("should render risk notes", () => {
      const output = renderPlan(makePlan());
      expect(output).toContain("GPU VRAM is estimated");
      expect(output).toContain("piped download script");
    });
  });

  describe("safety report rendering", () => {
    it("should include SAFETY REPORT section when report is provided", () => {
      const output = renderPlan(makePlan(), makeSafetyReport());
      expect(output).toContain("SAFETY REPORT");
      expect(output).toContain("Approved: YES");
    });

    it("should render violations", () => {
      const output = renderPlan(makePlan(), makeSafetyReport());
      expect(output).toContain("VIOLATIONS:");
      expect(output).toContain("Dangerous: curl pipe");
    });

    it("should render safety warnings", () => {
      const output = renderPlan(makePlan(), makeSafetyReport());
      expect(output).toContain("WARNINGS:");
      expect(output).toContain("curl detected");
    });

    it("should show NO for unapproved plans", () => {
      const report = makeSafetyReport({ approved: false });
      const output = renderPlan(makePlan(), report);
      expect(output).toContain("Approved: NO");
    });

    it("should not include safety section when explicitly disabled", () => {
      const output = renderPlan(makePlan(), makeSafetyReport(), {
        includeSafety: false,
      });
      expect(output).not.toContain("SAFETY REPORT");
    });

    it("should not include safety section when no report provided", () => {
      const output = renderPlan(makePlan());
      expect(output).not.toContain("SAFETY REPORT");
    });
  });

  describe("edge cases", () => {
    it("should handle empty prerequisites", () => {
      const plan = makePlan({ prerequisites: [] });
      const output = renderPlan(plan);
      expect(output).toContain("(none)");
    });

    it("should handle empty steps", () => {
      const plan = makePlan({ steps: [] });
      const output = renderPlan(plan);
      expect(output).toContain("(no steps)");
    });

    it("should handle empty verification", () => {
      const plan = makePlan({ postInstallVerification: [] });
      const output = renderPlan(plan);
      expect(output).toContain("(none)");
    });

    it("should handle no risks", () => {
      const plan = makePlan({ risks: [] });
      const output = renderPlan(plan);
      expect(output).not.toContain("RISKS & WARNINGS");
    });

    it("should respect custom line width", () => {
      const output = renderPlan(makePlan(), undefined, { lineWidth: 40 });
      // Check that separators are 40 chars wide
      expect(output).toContain("=".repeat(40));
      expect(output).toContain("-".repeat(40));
    });

    it("should handle safety report with no violations", () => {
      const report = makeSafetyReport({ violations: [] });
      const output = renderPlan(makePlan(), report);
      expect(output).toContain("Violations: 0");
      expect(output).not.toContain("VIOLATIONS:");
    });

    it("should handle safety report with no warnings", () => {
      const report = makeSafetyReport({ warnings: [] });
      const output = renderPlan(makePlan(), report);
      expect(output).toContain("Warnings: 0");
    });
  });
});
