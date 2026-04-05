/**
 * Host profile file loader for deterministic CLI input.
 *
 * Loads and validates a HostProfile from a JSON file, enabling
 * deterministic recommend/check/plan flows without live host detection.
 *
 * Validation uses the canonical HostProfileSchema from the schemas layer.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HostProfileSchema } from "../schemas/host.schema.js";
import type { HostProfile } from "../types/host.js";
import { inputError } from "./errors.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a HostProfile from a JSON file path.
 *
 * The file must contain valid JSON that conforms to the HostProfileSchema.
 * Throws a CliError (EXIT_INPUT) if the file is missing, not valid JSON,
 * or fails schema validation.
 *
 * @param filePath - Path to the host profile JSON file.
 * @returns A validated HostProfile.
 */
export function loadHostProfile(filePath: string): HostProfile {
  const resolved = resolve(filePath);

  // Read file
  let raw: string;
  try {
    raw = readFileSync(resolved, "utf-8");
  } catch {
    throw inputError(`Cannot read host file: ${resolved}`);
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw inputError(`Invalid JSON in host file: ${resolved}`);
  }

  // Validate against schema
  const result = HostProfileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw inputError(
      `Host file validation failed (${resolved}):\n${issues}`,
    );
  }

  return result.data as HostProfile;
}

/**
 * Validate an unknown object as a HostProfile.
 *
 * Pure validation without file I/O — useful for library consumers
 * who already have parsed JSON.
 *
 * @param data - The data to validate.
 * @returns The validated HostProfile.
 * @throws {Error} If validation fails.
 */
export function validateHostProfile(data: unknown): HostProfile {
  const result = HostProfileSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Host profile validation failed:\n${issues}`);
  }
  return result.data as HostProfile;
}
