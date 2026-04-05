/**
 * Zod schemas for compatibility results.
 */

import { z } from "zod";

export const CompatibilityClassSchema = z.enum([
  "supported",
  "supported_with_limits",
  "cpu_only_slow",
  "unsupported",
]);

export const BottleneckCategorySchema = z.enum([
  "ram",
  "vram",
  "cpu",
  "disk",
  "driver",
  "runtime_missing",
  "os_incompatible",
  "unknown",
]);

export const OperatingLimitsSchema = z.object({
  effectiveContextWindow: z.number().int().nonnegative().optional(),
  gpuOffloadPossible: z.boolean(),
  estimatedGpuLayers: z.number().int().nonnegative().optional(),
  requiresDiskSwap: z.boolean(),
});

export const SettingsAdjustmentSchema = z.object({
  parameter: z.string().min(1),
  suggestedValue: z.string().min(1),
  reason: z.string().min(1),
});

export const CompatibilityResultSchema = z.object({
  classification: CompatibilityClassSchema,
  bottlenecks: z.array(BottleneckCategorySchema),
  limits: OperatingLimitsSchema,
  settingsAdjustments: z.array(SettingsAdjustmentSchema),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});
