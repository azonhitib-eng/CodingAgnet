/**
 * Tests for the safety evaluator.
 *
 * Covers:
 *   - blocked command classification
 *   - dangerous command classification
 *   - caution command classification
 *   - safe command classification
 *   - sensitive path detection
 *   - blocked path detection
 *   - approval requirements per policy
 *   - overall plan approval logic
 *   - default execution policy
 */

import { describe, it, expect } from "vitest";
import {
  evaluatePlanSafety,
  classifyCommand,
  classifyPaths,
  defaultExecutionPolicy,
} from "../../src/install-plan/safety-evaluator.js";
import type {
  InstallPlan,
  ExecutionPolicy,
  InstallStep,
  RiskLevel,
} from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides?: Partial<InstallStep>): InstallStep {
  return {
    order: 0,
    command: "echo hello",
    description: "Test step",
    riskLevel: "safe" as RiskLevel,
    requiresApproval: false,
    reversible: true,
    ...overrides,
  };
}

function makePlan(overrides?: Partial<InstallPlan>): InstallPlan {
  return {
    artifactId: "test-artifact",
    runtimeId: "ollama",
    targetPlatform: "linux",
    prerequisites: [],
    steps: [makeStep()],
    postInstallVerification: [],
    resourceEstimate: {
      diskSpaceGb: 4,
      requiresNetwork: true,
    },
    risks: [],
    humanSummary: "Test plan",
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<ExecutionPolicy>): ExecutionPolicy {
  return {
    mode: "plan_only",
    requireApprovalFor: ["caution", "dangerous", "blocked"],
    blockedPathPatterns: ["/etc/shadow", "/dev/sd*"],
    sensitivePathPatterns: ["/etc/*", "~/.ssh/*"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyCommand tests
// ---------------------------------------------------------------------------

describe("classifyCommand", () => {

  describe("blocked commands", () => {
    it("should classify rm -rf / as blocked", () => {
      const result = classifyCommand("rm -rf /");
      expect(result.riskLevel).toBe("blocked");
      expect(result.reason).toContain("root filesystem");
    });

    it("should classify mkfs as blocked", () => {
      const result = classifyCommand("mkfs.ext4 /dev/sda1");
      expect(result.riskLevel).toBe("blocked");
      expect(result.reason).toContain("Filesystem format");
    });

    it("should classify dd to device as blocked", () => {
      const result = classifyCommand("dd if=/dev/zero of=/dev/sda");
      expect(result.riskLevel).toBe("blocked");
      expect(result.reason).toContain("Raw disk write");
    });

    it("should classify chmod 777 / as blocked", () => {
      const result = classifyCommand("chmod 777 /");
      expect(result.riskLevel).toBe("blocked");
      expect(result.reason).toContain("root path");
    });
  });

  describe("dangerous commands", () => {
    it("should classify rm -rf as dangerous", () => {
      const result = classifyCommand("rm -rf /home/user/models");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("Recursive force-delete");
    });

    it("should classify curl | sh as dangerous", () => {
      const result = classifyCommand("curl -fsSL https://example.com/install.sh | sh");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("Remote script execution");
    });

    it("should classify wget | sh as dangerous", () => {
      const result = classifyCommand("wget -qO- https://example.com/install.sh | sh");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("Remote script execution");
    });

    it("should classify curl | sudo sh as dangerous", () => {
      const result = classifyCommand("curl -fsSL https://example.com/install.sh | sudo sh");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("Remote script execution");
    });

    it("should classify chmod 777 on non-root as dangerous", () => {
      const result = classifyCommand("chmod 777 /home/user/dir");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("world-writable");
    });

    it("should classify sudo rm as dangerous", () => {
      const result = classifyCommand("sudo rm /var/log/syslog");
      expect(result.riskLevel).toBe("dangerous");
      expect(result.reason).toContain("Privileged delete");
    });
  });

  describe("caution commands", () => {
    it("should classify sudo as caution", () => {
      const result = classifyCommand("sudo apt update");
      expect(result.riskLevel).toBe("caution");
    });

    it("should classify pip install as caution", () => {
      const result = classifyCommand("pip install torch");
      expect(result.riskLevel).toBe("caution");
    });

    it("should classify brew install as caution", () => {
      const result = classifyCommand("brew install ollama");
      expect(result.riskLevel).toBe("caution");
    });

    it("should classify apt install as caution", () => {
      const result = classifyCommand("apt install cuda-toolkit");
      expect(result.riskLevel).toBe("caution");
    });

    it("should classify plain curl as caution", () => {
      const result = classifyCommand("curl -O https://example.com/file.tar.gz");
      expect(result.riskLevel).toBe("caution");
    });
  });

  describe("safe commands", () => {
    it("should classify echo as safe", () => {
      const result = classifyCommand("echo hello");
      expect(result.riskLevel).toBe("safe");
      expect(result.requiresApproval).toBe(false);
    });

    it("should classify ollama pull as safe", () => {
      const result = classifyCommand("ollama pull llama3:8b");
      expect(result.riskLevel).toBe("safe");
    });

    it("should classify ollama serve as safe", () => {
      const result = classifyCommand("ollama serve");
      expect(result.riskLevel).toBe("safe");
    });

    it("should classify ls as safe", () => {
      const result = classifyCommand("ls -la /home/user");
      expect(result.riskLevel).toBe("safe");
    });
  });
});

// ---------------------------------------------------------------------------
// classifyPaths tests
// ---------------------------------------------------------------------------

describe("classifyPaths", () => {
  const policy = makePolicy();

  it("should detect blocked paths in commands", () => {
    const results = classifyPaths("cat /etc/shadow", policy);
    expect(results.some((r) => r.sensitivity === "blocked")).toBe(true);
  });

  it("should detect sensitive paths in commands", () => {
    const results = classifyPaths("cat /etc/hostname", policy);
    expect(results.some((r) => r.sensitivity === "sensitive")).toBe(true);
  });

  it("should detect blocked device paths via glob", () => {
    const results = classifyPaths("dd if=/dev/zero of=/dev/sda", policy);
    expect(results.some((r) => r.sensitivity === "blocked")).toBe(true);
  });

  it("should return empty for safe paths", () => {
    const results = classifyPaths("ls /home/user/models", policy);
    expect(results).toEqual([]);
  });

  it("should detect ssh paths as sensitive", () => {
    const results = classifyPaths("cat ~/.ssh/id_rsa", policy);
    expect(results.some((r) => r.sensitivity === "sensitive")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluatePlanSafety tests
// ---------------------------------------------------------------------------

describe("evaluatePlanSafety", () => {
  const policy = makePolicy();

  describe("safe plan", () => {
    it("should approve a plan with only safe commands", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "ollama pull test-model:7b" }),
          makeStep({ command: "ollama serve" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(true);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(false);
      expect(report.violations).toEqual([]);
    });
  });

  describe("plan with blocked commands", () => {
    it("should not approve a plan containing blocked commands", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "rm -rf /" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(true);
      expect(report.requiresHumanApproval).toBe(false);
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations[0].severity).toBe("blocked");
    });
  });

  describe("plan with dangerous commands", () => {
    it("should not approve and require human approval for dangerous commands", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "rm -rf /home/user/old-models" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(true);
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations[0].severity).toBe("dangerous");
    });
  });

  describe("plan with blocked paths", () => {
    it("should not approve a plan touching blocked paths", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "cat /etc/shadow" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(true);
      expect(report.requiresHumanApproval).toBe(false);
      expect(report.violations.some((v) => v.type === "path")).toBe(true);
    });
  });

  describe("plan with sensitive paths", () => {
    it("should warn about sensitive paths but still approve if no approval required", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "cat /etc/hostname", requiresApproval: false }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(true);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(false);
      expect(report.warnings.some((w) => w.includes("sensitive"))).toBe(true);
    });
  });

  describe("approval requirement mismatch", () => {
    it("should warn when step risk level requires approval but step is not marked", () => {
      const plan = makePlan({
        steps: [
          makeStep({
            command: "sudo apt install cuda",
            riskLevel: "caution",
            requiresApproval: false,
          }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(
        report.warnings.some((w) => w.includes("requires approval per policy")),
      ).toBe(true);
    });
  });

  describe("plan ID", () => {
    it("should set planId from the plan artifactId", () => {
      const plan = makePlan({ artifactId: "my-model-id" });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.planId).toBe("my-model-id");
    });
  });

  describe("verification command safety", () => {
    it("should warn about blocked paths in verification commands", () => {
      const plan = makePlan({
        steps: [],
        postInstallVerification: [
          { command: "cat /etc/shadow", description: "bad verification" },
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.warnings.some((w) => w.includes("blocked path"))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3-state approval semantics (Phase 5.1)
  // -------------------------------------------------------------------------

  describe("3-state approval semantics", () => {
    it("fully safe plan: approved=true, blocked=false, requiresHumanApproval=false", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "ollama pull model:7b", requiresApproval: false }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(true);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(false);
    });

    it("blocked plan: approved=false, blocked=true, requiresHumanApproval=false", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "rm -rf /" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(true);
      expect(report.requiresHumanApproval).toBe(false);
    });

    it("dangerous command: approved=false, blocked=false, requiresHumanApproval=true", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "rm -rf /home/user/old" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(true);
    });

    it("step with requiresApproval=true: approved=false, requiresHumanApproval=true", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "echo safe", requiresApproval: true }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(true);
    });

    it("approval mismatch: approved=false, requiresHumanApproval=true", () => {
      const plan = makePlan({
        steps: [
          makeStep({
            command: "sudo apt install cuda",
            riskLevel: "caution",
            requiresApproval: false,
          }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(true);
    });

    it("blocked + dangerous: blocked takes precedence, requiresHumanApproval=false", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "rm -rf /" }),
          makeStep({ command: "rm -rf /home/user/data" }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(false);
      expect(report.blocked).toBe(true);
      expect(report.requiresHumanApproval).toBe(false);
    });

    it("multiple safe steps with no approval: fully approved", () => {
      const plan = makePlan({
        steps: [
          makeStep({ command: "echo a", requiresApproval: false }),
          makeStep({ command: "echo b", requiresApproval: false }),
          makeStep({ command: "ollama serve", requiresApproval: false }),
        ],
      });
      const report = evaluatePlanSafety(plan, policy);

      expect(report.approved).toBe(true);
      expect(report.blocked).toBe(false);
      expect(report.requiresHumanApproval).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// defaultExecutionPolicy tests
// ---------------------------------------------------------------------------

describe("defaultExecutionPolicy", () => {
  it("should return a valid policy", () => {
    const policy = defaultExecutionPolicy();

    expect(policy.mode).toBe("plan_only");
    expect(policy.requireApprovalFor).toContain("dangerous");
    expect(policy.requireApprovalFor).toContain("blocked");
    expect(policy.blockedPathPatterns.length).toBeGreaterThan(0);
    expect(policy.sensitivePathPatterns.length).toBeGreaterThan(0);
  });
});
