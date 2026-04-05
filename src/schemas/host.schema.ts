/**
 * Zod schemas for host capability detection.
 *
 * Every detected value is wrapped in a Detected<T> envelope that
 * carries a confidence level and optional source note.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Confidence wrapper factory
// ---------------------------------------------------------------------------

export const ConfidenceSchema = z.enum(["certain", "estimated", "unknown"]);

/**
 * Creates a Detected<T> schema for a given inner schema.
 * When confidence is "unknown", value must be null.
 */
export function detectedSchema<T extends z.ZodTypeAny>(inner: T) {
  return z
    .object({
      value: inner.nullable(),
      confidence: ConfidenceSchema,
      source: z.string().optional(),
    })
    .refine(
      (d) => d.confidence !== "unknown" || d.value === null,
      { message: "value must be null when confidence is 'unknown'" },
    );
}

// ---------------------------------------------------------------------------
// Sub-profiles
// ---------------------------------------------------------------------------

export const OsInfoSchema = z.object({
  platform: detectedSchema(z.string()),
  release: detectedSchema(z.string()),
  arch: detectedSchema(z.string()),
});

export const CpuInfoSchema = z.object({
  model: detectedSchema(z.string()),
  cores: detectedSchema(z.number().int().positive()),
  threads: detectedSchema(z.number().int().positive()),
});

export const MemoryInfoSchema = z.object({
  totalGb: detectedSchema(z.number().nonnegative()),
  availableGb: detectedSchema(z.number().nonnegative()),
});

export const GpuInfoSchema = z.object({
  present: detectedSchema(z.boolean()),
  model: detectedSchema(z.string()),
  vramGb: detectedSchema(z.number().nonnegative()),
  cudaVersion: detectedSchema(z.string()),
  rocmVersion: detectedSchema(z.string()),
  driverVersion: detectedSchema(z.string()),
});

export const InstalledRuntimeSchema = z.object({
  runtimeId: z.string().min(1),
  version: detectedSchema(z.string()),
});

// ---------------------------------------------------------------------------
// Aggregate host profile
// ---------------------------------------------------------------------------

export const HostProfileSchema = z.object({
  detectedAt: z.string().datetime(),
  os: OsInfoSchema,
  cpu: CpuInfoSchema,
  memory: MemoryInfoSchema,
  gpu: GpuInfoSchema.nullable(),
  installedRuntimes: z.array(InstalledRuntimeSchema),
  missingDependencies: z.array(z.string()),
});
