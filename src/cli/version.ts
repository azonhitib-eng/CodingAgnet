/**
 * Package version helper.
 *
 * Reads the version from package.json at runtime using createRequire,
 * which works correctly from both source (src/) and compiled (dist/) paths.
 * Falls back to a hardcoded value if package.json cannot be read.
 */

import { createRequire } from "node:module";

const FALLBACK_VERSION = "0.1.0";

let cachedVersion: string | undefined;

/**
 * Get the package version from the nearest package.json.
 * Result is cached after first successful read.
 */
export function getVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;

  try {
    const require = createRequire(import.meta.url);
    // Walk up from src/cli/ or dist/cli/ to find the root package.json
    const pkg = require("../../package.json") as { version?: string };
    cachedVersion = typeof pkg.version === "string" ? pkg.version : FALLBACK_VERSION;
  } catch {
    cachedVersion = FALLBACK_VERSION;
  }

  return cachedVersion;
}
