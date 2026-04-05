/**
 * Zod schemas for agent / tool catalog entries.
 */

import { z } from "zod";
import { CatalogStatusSchema } from "./model.schema.js";
import { PlatformSchema } from "./runtime.schema.js";

export const AgentToolEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  purpose: z.string().min(1),
  requiredRuntimes: z.array(z.string()),
  hostAssumptions: z.array(z.string()),
  suitableUseCases: z.array(z.string()),
  warnings: z.array(z.string()),
  installInstructions: z.record(PlatformSchema, z.array(z.string())),
  supportedPlatforms: z.array(PlatformSchema).min(1),
  status: CatalogStatusSchema,
});

export const AgentToolManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  manifestVersion: z.string().min(1),
  tool: AgentToolEntrySchema,
});
