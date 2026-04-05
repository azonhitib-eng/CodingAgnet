/**
 * Zod schemas for the model type hierarchy.
 *
 * Validates ModelFamily → ModelVariant → ModelArtifact → ModelManifest.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const SizeClassSchema = z.enum([
  "tiny",
  "small",
  "medium",
  "large",
  "xlarge",
]);

export const QuantizationTypeSchema = z.union([
  z.enum([
    "f16",
    "q8_0",
    "q6_k",
    "q5_k_m",
    "q4_k_m",
    "q4_0",
    "q3_k_m",
    "q2_k",
    "gguf",
    "gptq",
    "awq",
    "exl2",
    "none",
  ]),
  z.string().min(1),
]);

export const CatalogStatusSchema = z.enum([
  "supported",
  "experimental",
  "deprecated",
]);

export const ModelCapabilitiesSchema = z.object({
  coding: z.boolean(),
  agenticToolUse: z.boolean(),
  autocomplete: z.boolean(),
  longContext: z.boolean(),
});

// ---------------------------------------------------------------------------
// Model family
// ---------------------------------------------------------------------------

export const ModelFamilySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  provider: z.string().min(1),
  url: z.string().url().optional(),
  description: z.string().optional(),
  capabilities: ModelCapabilitiesSchema,
  status: CatalogStatusSchema,
});

// ---------------------------------------------------------------------------
// Model variant
// ---------------------------------------------------------------------------

export const ModelVariantSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().min(1),
  displayName: z.string().min(1),
  parameterLabel: z.string().min(1),
  sizeClass: SizeClassSchema,
  contextWindow: z.number().int().positive().optional(),
  capabilityOverrides: ModelCapabilitiesSchema.partial().optional(),
  status: CatalogStatusSchema,
});

// ---------------------------------------------------------------------------
// Model artifact
// ---------------------------------------------------------------------------

export const ModelArtifactSchema = z.object({
  id: z.string().min(1),
  variantId: z.string().min(1),
  runtimeId: z.string().min(1),
  quantization: QuantizationTypeSchema,
  fileSizeGb: z.number().positive().optional(),
  minimumRamGb: z.number().nonnegative(),
  recommendedRamGb: z.number().nonnegative(),
  minimumVramGb: z.number().nonnegative(),
  recommendedVramGb: z.number().nonnegative(),
  pullCommand: z.string().optional(),
  downloadUrl: z.string().url().optional(),
  osNotes: z.string().optional(),
  warningNotes: z.string().optional(),
  status: CatalogStatusSchema,
});

// ---------------------------------------------------------------------------
// Model manifest (versioned wrapper)
// ---------------------------------------------------------------------------

export const ModelManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  manifestVersion: z.string().min(1),
  family: ModelFamilySchema,
  variants: z.array(ModelVariantSchema).min(1),
  artifacts: z.array(ModelArtifactSchema).min(1),
});
