/**
 * Zod schemas for runtime / provider types.
 */

import { z } from "zod";
import { CatalogStatusSchema } from "./model.schema.js";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const PlatformSchema = z.enum(["linux", "darwin", "win32"]);

export const RuntimeTypeSchema = z.enum([
  "local_server",
  "cli_tool",
  "api_endpoint",
]);

// ---------------------------------------------------------------------------
// Runtime entry
// ---------------------------------------------------------------------------

const platformRecord = z.record(PlatformSchema, z.array(z.string()));

export const RuntimeEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  type: RuntimeTypeSchema,
  detectionCommand: z.string().min(1),
  versionCommand: z.string().min(1),
  supportedPlatforms: z.array(PlatformSchema).min(1),
  requiredDrivers: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  installInstructions: platformRecord,
  postInstallVerification: platformRecord.optional(),
  status: CatalogStatusSchema,
});

// ---------------------------------------------------------------------------
// Runtime manifest (versioned)
// ---------------------------------------------------------------------------

export const RuntimeManifestSchema = z.object({
  schemaVersion: z.string().min(1),
  manifestVersion: z.string().min(1),
  runtime: RuntimeEntrySchema,
});
