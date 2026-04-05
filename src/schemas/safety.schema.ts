/**
 * Zod schemas for the safety system.
 */

import { z } from "zod";
import { RiskLevelSchema } from "./install-plan.schema.js";

// ---------------------------------------------------------------------------
// Command policy
// ---------------------------------------------------------------------------

export const CommandClassificationSchema = z.object({
  command: z.string().min(1),
  riskLevel: RiskLevelSchema,
  reason: z.string().min(1),
  requiresApproval: z.boolean(),
});

// ---------------------------------------------------------------------------
// Path policy
// ---------------------------------------------------------------------------

export const PathSensitivitySchema = z.enum([
  "normal",
  "sensitive",
  "secret",
  "blocked",
]);

export const PathClassificationSchema = z.object({
  path: z.string().min(1),
  sensitivity: PathSensitivitySchema,
  reason: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Execution policy
// ---------------------------------------------------------------------------

export const ExecutionModeSchema = z.enum([
  "plan_only",
  "prompt_each",
  "auto_safe_only",
]);

export const ExecutionPolicySchema = z.object({
  mode: ExecutionModeSchema,
  requireApprovalFor: z.array(RiskLevelSchema),
  blockedPathPatterns: z.array(z.string()),
  sensitivePathPatterns: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Safety report
// ---------------------------------------------------------------------------

export const SafetyViolationSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  type: z.enum(["command", "path", "execution"]),
  description: z.string().min(1),
  severity: RiskLevelSchema,
});

export const SafetyReportSchema = z.object({
  planId: z.string().min(1),
  violations: z.array(SafetyViolationSchema),
  warnings: z.array(z.string()),
  approved: z.boolean(),
});
