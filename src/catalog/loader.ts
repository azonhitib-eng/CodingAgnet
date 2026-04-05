/**
 * Version-aware manifest loader.
 *
 * Loads JSON files from disk, parses them, validates against Zod
 * schemas, and checks that schemaVersion is supported.
 *
 * Phase 2 supports only JSON (no YAML).
 * Phase 2 supports only schemaVersion "1.0.0".
 */

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { z } from "zod";
import { CatalogError } from "./errors.js";

/** The only schema version we accept right now. */
export const SUPPORTED_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkSchemaVersion(raw: unknown, filePath: string): void {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("schemaVersion" in raw) ||
    typeof (raw as Record<string, unknown>).schemaVersion !== "string"
  ) {
    throw new CatalogError(
      "MANIFEST_PARSE_ERROR",
      `Manifest at ${filePath} is missing a valid "schemaVersion" field`,
      { filePath },
    );
  }
  const version = (raw as Record<string, unknown>).schemaVersion as string;
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new CatalogError(
      "SCHEMA_VERSION_UNSUPPORTED",
      `Manifest at ${filePath} has schemaVersion "${version}" but only "${SUPPORTED_SCHEMA_VERSION}" is supported`,
      { filePath, found: version, supported: SUPPORTED_SCHEMA_VERSION },
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and validate a manifest from a JSON file (async).
 */
export async function loadManifest<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    const text = await readFile(filePath, "utf-8");
    raw = JSON.parse(text);
  } catch (err) {
    if (err instanceof CatalogError) throw err;
    throw new CatalogError(
      "FILE_READ_ERROR",
      `Failed to read manifest at ${filePath}: ${(err as Error).message}`,
      { filePath },
    );
  }

  checkSchemaVersion(raw, filePath);

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new CatalogError(
      "MANIFEST_VALIDATION_ERROR",
      `Manifest at ${filePath} failed validation:\n${issues}`,
      { filePath, issues: result.error.issues },
    );
  }

  return result.data;
}

/**
 * Load and validate a manifest from a JSON file (sync).
 */
export function loadManifestSync<T>(
  filePath: string,
  schema: z.ZodType<T>,
): T {
  let raw: unknown;
  try {
    const text = readFileSync(filePath, "utf-8");
    raw = JSON.parse(text);
  } catch (err) {
    if (err instanceof CatalogError) throw err;
    throw new CatalogError(
      "FILE_READ_ERROR",
      `Failed to read manifest at ${filePath}: ${(err as Error).message}`,
      { filePath },
    );
  }

  checkSchemaVersion(raw, filePath);

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new CatalogError(
      "MANIFEST_VALIDATION_ERROR",
      `Manifest at ${filePath} failed validation:\n${issues}`,
      { filePath, issues: result.error.issues },
    );
  }

  return result.data;
}

/**
 * Parse and validate a manifest from an already-parsed JSON object.
 * Useful for testing without file IO.
 */
export function parseManifest<T>(
  data: unknown,
  schema: z.ZodType<T>,
  label = "<inline>",
): T {
  checkSchemaVersion(data, label);

  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new CatalogError(
      "MANIFEST_VALIDATION_ERROR",
      `Manifest ${label} failed validation:\n${issues}`,
      { label, issues: result.error.issues },
    );
  }

  return result.data;
}
