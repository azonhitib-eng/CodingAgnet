/**
 * Zod schemas for install plans.
 */

import { z } from "zod";
import { PlatformSchema } from "./runtime.schema.js";

export const RiskLevelSchema = z.enum([
  "safe",
  "caution",
  "dangerous",
  "blocked",
]);

export const InstallStepSchema = z.object({
  order: z.number().int().nonnegative(),
  command: z.string().min(1),
  description: z.string().min(1),
  riskLevel: RiskLevelSchema,
  requiresApproval: z.boolean(),
  reversible: z.boolean(),
  platforms: z.array(PlatformSchema).optional(),
  estimatedDurationSec: z.number().positive().optional(),
});

export const PrerequisiteSchema = z.object({
  name: z.string().min(1),
  checkCommand: z.string().min(1),
  installHint: z.string().min(1),
});

export const ResourceEstimateSchema = z.object({
  diskSpaceGb: z.number().nonnegative(),
  peakRamGb: z.number().nonnegative().optional(),
  requiresNetwork: z.boolean(),
  estimatedDownloadGb: z.number().nonnegative().optional(),
});

export const VerificationStepSchema = z.object({
  command: z.string().min(1),
  expectedOutput: z.string().optional(),
  description: z.string().min(1),
});

export const InstallPlanSchema = z.object({
  artifactId: z.string().min(1),
  runtimeId: z.string().min(1),
  targetPlatform: PlatformSchema,
  prerequisites: z.array(PrerequisiteSchema),
  steps: z.array(InstallStepSchema),
  postInstallVerification: z.array(VerificationStepSchema),
  resourceEstimate: ResourceEstimateSchema,
  risks: z.array(z.string()),
  humanSummary: z.string().min(1),
});
