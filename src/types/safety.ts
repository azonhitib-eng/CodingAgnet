/**
 * Safety system type contracts.
 *
 * Safety is layered into three policy dimensions:
 *   1. Command policy  — classifies shell commands by risk
 *   2. Path policy     — protects sensitive filesystem paths
 *   3. Execution policy — governs when/how plans may execute
 */

// ---------------------------------------------------------------------------
// Command policy
// ---------------------------------------------------------------------------

import type { RiskLevel } from "./install-plan.js";

export interface CommandClassification {
  command: string;
  riskLevel: RiskLevel;
  reason: string;
  requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Path policy
// ---------------------------------------------------------------------------

export type PathSensitivity = "normal" | "sensitive" | "secret" | "blocked";

export interface PathClassification {
  path: string;
  sensitivity: PathSensitivity;
  reason: string;
}

// ---------------------------------------------------------------------------
// Execution policy
// ---------------------------------------------------------------------------

export type ExecutionMode = "plan_only" | "prompt_each" | "auto_safe_only";

export interface ExecutionPolicy {
  /** Default execution mode. */
  mode: ExecutionMode;
  /** Risk levels that always require explicit approval. */
  requireApprovalFor: RiskLevel[];
  /** Glob patterns for paths that are always blocked. */
  blockedPathPatterns: string[];
  /** Glob patterns for paths considered sensitive / secret. */
  sensitivePathPatterns: string[];
}

// ---------------------------------------------------------------------------
// Safety report (aggregate output)
// ---------------------------------------------------------------------------

export interface SafetyViolation {
  stepIndex: number;
  type: "command" | "path" | "execution";
  description: string;
  severity: RiskLevel;
}

export interface SafetyReport {
  planId: string;
  violations: SafetyViolation[];
  warnings: string[];
  /**
   * True only when no blocked issues and no human-approval-required issues
   * exist.  A plan that requires human approval is NOT approved.
   */
  approved: boolean;
  /** True when at least one blocked-severity violation exists. */
  blocked: boolean;
  /** True when dangerous commands, explicit approval requirements, or
   *  approval-policy mismatches are present (and no blocked violations). */
  requiresHumanApproval: boolean;
}
