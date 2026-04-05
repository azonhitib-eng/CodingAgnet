/**
 * Safety evaluator for install plans.
 *
 * Evaluates an InstallPlan against an ExecutionPolicy, producing a
 * SafetyReport with violations, warnings, and an approval decision.
 *
 * The evaluator checks:
 *   1. Command risk classification for each step
 *   2. Sensitive path detection in step commands
 *   3. Approval requirements based on policy
 *   4. Blocked vs allowed actions
 */

import type {
  InstallPlan,
  ExecutionPolicy,
  SafetyReport,
  SafetyViolation,
  CommandClassification,
  PathClassification,
  RiskLevel,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an InstallPlan against an ExecutionPolicy.
 *
 * @param plan   - The install plan to evaluate.
 * @param policy - The execution policy governing safety rules.
 * @returns A SafetyReport summarizing violations, warnings, and approval.
 */
export function evaluatePlanSafety(
  plan: InstallPlan,
  policy: ExecutionPolicy,
): SafetyReport {
  const violations: SafetyViolation[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    // 1. Classify the command
    const cmdClass = classifyCommand(step.command);
    if (cmdClass.riskLevel === "blocked") {
      violations.push({
        stepIndex: i,
        type: "command",
        description: `Blocked command: "${step.command}" — ${cmdClass.reason}`,
        severity: "blocked",
      });
    } else if (cmdClass.riskLevel === "dangerous") {
      violations.push({
        stepIndex: i,
        type: "command",
        description: `Dangerous command: "${step.command}" — ${cmdClass.reason}`,
        severity: "dangerous",
      });
    } else if (cmdClass.riskLevel === "caution") {
      warnings.push(
        `Step ${i}: "${step.command}" — ${cmdClass.reason}`,
      );
    }

    // 2. Check for sensitive paths in the command
    const pathClasses = classifyPaths(step.command, policy);
    for (const pc of pathClasses) {
      if (pc.sensitivity === "blocked") {
        violations.push({
          stepIndex: i,
          type: "path",
          description: `Blocked path "${pc.path}" in command — ${pc.reason}`,
          severity: "blocked",
        });
      } else if (pc.sensitivity === "secret" || pc.sensitivity === "sensitive") {
        warnings.push(
          `Step ${i}: Touches ${pc.sensitivity} path "${pc.path}" — ${pc.reason}`,
        );
      }
    }

    // 3. Check if the step risk level requires approval per policy
    if (policy.requireApprovalFor.includes(step.riskLevel)) {
      if (!step.requiresApproval) {
        warnings.push(
          `Step ${i}: Risk level "${step.riskLevel}" requires approval per policy, but step is not marked for approval.`,
        );
      }
    }
  }

  // Also evaluate verification commands for blocked paths
  for (const vs of plan.postInstallVerification) {
    const pathClasses = classifyPaths(vs.command, policy);
    for (const pc of pathClasses) {
      if (pc.sensitivity === "blocked") {
        warnings.push(
          `Verification command touches blocked path "${pc.path}" — ${pc.reason}`,
        );
      }
    }
  }

  // Approval: no blocked violations → approved (dangerous still need review)
  const hasBlocked = violations.some((v) => v.severity === "blocked");
  const approved = !hasBlocked;

  return {
    planId: plan.artifactId,
    violations,
    warnings,
    approved,
  };
}

// ---------------------------------------------------------------------------
// Command classification
// ---------------------------------------------------------------------------

/** Pattern-based command risk classification. */
interface CommandPattern {
  pattern: RegExp;
  riskLevel: RiskLevel;
  reason: string;
}

const COMMAND_PATTERNS: readonly CommandPattern[] = [
  // Blocked
  { pattern: /\brm\s+-rf\s+\/(?!\S)/, riskLevel: "blocked", reason: "Recursive delete of root filesystem" },
  { pattern: /\bmkfs\b/, riskLevel: "blocked", reason: "Filesystem format command" },
  { pattern: /\bdd\s+if=.*of=\/dev\//, riskLevel: "blocked", reason: "Raw disk write" },
  { pattern: /\b:(){ :\|:& };:/, riskLevel: "blocked", reason: "Fork bomb" },
  { pattern: />\s*\/dev\/[sh]d[a-z]/, riskLevel: "blocked", reason: "Direct device write" },
  { pattern: /\bchmod\s+777\s+\/(?:\s|$)/, riskLevel: "blocked", reason: "Insecure permission change on root path" },
  // Dangerous
  { pattern: /\brm\s+-rf\b/, riskLevel: "dangerous", reason: "Recursive force-delete" },
  { pattern: /\bsudo\s+rm\b/, riskLevel: "dangerous", reason: "Privileged delete operation" },
  { pattern: /\bcurl\b.*\|\s*(sudo\s+)?sh/, riskLevel: "dangerous", reason: "Remote script execution via pipe" },
  { pattern: /\bwget\b.*\|\s*(sudo\s+)?sh/, riskLevel: "dangerous", reason: "Remote script execution via pipe" },
  { pattern: /\bchmod\s+777\b/, riskLevel: "dangerous", reason: "Insecure permission change (world-writable)" },
  { pattern: /\bchown\s+-R\b.*\//, riskLevel: "dangerous", reason: "Recursive ownership change" },
  // Caution
  { pattern: /\bsudo\b/, riskLevel: "caution", reason: "Elevated privileges required" },
  { pattern: /\bcurl\b/, riskLevel: "caution", reason: "Network download" },
  { pattern: /\bwget\b/, riskLevel: "caution", reason: "Network download" },
  { pattern: /\bpip\s+install\b/, riskLevel: "caution", reason: "Python package installation" },
  { pattern: /\bnpm\s+install\b/, riskLevel: "caution", reason: "Node.js package installation" },
  { pattern: /\bapt\s+(install|upgrade)\b/, riskLevel: "caution", reason: "System package installation" },
  { pattern: /\bbrew\s+install\b/, riskLevel: "caution", reason: "Homebrew package installation" },
];

/**
 * Classify a shell command by risk level.
 * Returns the highest-risk matching pattern.
 */
export function classifyCommand(command: string): CommandClassification {
  const RISK_ORDER: Record<RiskLevel, number> = {
    blocked: 3,
    dangerous: 2,
    caution: 1,
    safe: 0,
  };

  let best: CommandClassification = {
    command,
    riskLevel: "safe",
    reason: "No known risk patterns detected",
    requiresApproval: false,
  };

  for (const pat of COMMAND_PATTERNS) {
    if (pat.pattern.test(command) && RISK_ORDER[pat.riskLevel] > RISK_ORDER[best.riskLevel]) {
      best = {
        command,
        riskLevel: pat.riskLevel,
        reason: pat.reason,
        requiresApproval: pat.riskLevel !== "safe",
      };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Path classification
// ---------------------------------------------------------------------------

/**
 * Scan a command string for paths that match policy-defined patterns.
 */
export function classifyPaths(
  command: string,
  policy: ExecutionPolicy,
): PathClassification[] {
  const results: PathClassification[] = [];

  for (const pattern of policy.blockedPathPatterns) {
    if (matchGlobInCommand(command, pattern)) {
      results.push({
        path: pattern,
        sensitivity: "blocked",
        reason: `Path matches blocked pattern "${pattern}"`,
      });
    }
  }

  for (const pattern of policy.sensitivePathPatterns) {
    if (matchGlobInCommand(command, pattern)) {
      results.push({
        path: pattern,
        sensitivity: "sensitive",
        reason: `Path matches sensitive pattern "${pattern}"`,
      });
    }
  }

  return results;
}

/**
 * Simple glob-in-command matcher.
 * Converts glob patterns to regex and checks if the command contains a match.
 */
function matchGlobInCommand(command: string, glob: string): boolean {
  // Escape regex special characters, then convert glob wildcards.
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(escaped);
  return regex.test(command);
}

// ---------------------------------------------------------------------------
// Default execution policy
// ---------------------------------------------------------------------------

/** Sensible default execution policy for install plans. */
export function defaultExecutionPolicy(): ExecutionPolicy {
  return {
    mode: "plan_only",
    requireApprovalFor: ["caution", "dangerous", "blocked"],
    blockedPathPatterns: [
      "/etc/shadow",
      "/etc/passwd",
      "/dev/sd*",
      "/dev/nvme*",
      "/boot/*",
    ],
    sensitivePathPatterns: [
      "/etc/*",
      "/usr/local/bin/*",
      "/root/*",
      "~/.ssh/*",
      "~/.gnupg/*",
    ],
  };
}
