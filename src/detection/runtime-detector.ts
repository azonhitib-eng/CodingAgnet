/**
 * Runtime detector.
 *
 * Probes the host for installed runtimes listed in the catalog.
 * For each runtime, runs its `detectionCommand` and `versionCommand`
 * and parses the output.
 *
 * Detection is intentionally simple:
 * - If the command runs successfully → runtime is present
 * - Version is extracted with best-effort parsing
 * - If the command fails → runtime is not installed (skip it)
 *
 * Command execution is injected so tests can provide mock output.
 */

import type { RuntimeEntry, Platform } from "../types/runtime.js";
import type { InstalledRuntime, Detected } from "../types/host.js";
import type { CommandRunner } from "./run-command.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimated<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "estimated", source };
}

function unknown<T>(source: string): Detected<T> {
  return { value: null, confidence: "unknown", source } as Detected<T>;
}

// ---------------------------------------------------------------------------
// Version parsing
// ---------------------------------------------------------------------------

/**
 * Extract a semver-ish version string from command output.
 *
 * Looks for patterns like:
 *   - "ollama version 0.1.32"
 *   - "v0.1.32"
 *   - "0.1.32"
 *   - "llama-server version: b1234 (abc123)"  →  "b1234"
 *
 * Returns null if nothing matched.
 */
export function extractVersion(output: string): string | null {
  // Try semver first: X.Y.Z or vX.Y.Z with optional pre-release/build suffix
  // Use bounded digit groups and atomic-like suffix to prevent backtracking
  const semver = output.match(/v?(\d{1,10}\.\d{1,10}\.\d{1,10}(?:[-+][a-zA-Z0-9._-]{1,40})?)/);
  if (semver) return semver[1];

  // Try build-tag style: b1234 or B1234
  const buildTag = output.match(/\b(b\d+)\b/i);
  if (buildTag) return buildTag[1];

  return null;
}

// ---------------------------------------------------------------------------
// Single-runtime detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a single runtime is installed and extract its version.
 * Returns null if the runtime is not present on this platform.
 */
export async function detectSingleRuntime(
  runtime: RuntimeEntry,
  platform: Platform,
  run: CommandRunner,
): Promise<InstalledRuntime | null> {
  // Skip if runtime doesn't support this platform
  if (!runtime.supportedPlatforms.includes(platform)) {
    return null;
  }

  // Parse detection command into command + args
  const [cmd, ...args] = runtime.detectionCommand.split(/\s+/);
  if (!cmd) return null;

  const result = await run(cmd, args);

  if (!result.ok && result.exitCode === null) {
    // Command not found — runtime not installed
    return null;
  }

  // Command ran (even if exit code is non-zero, some tools still output version)
  const combined = `${result.stdout}\n${result.stderr}`;
  const version = extractVersion(combined);

  return {
    runtimeId: runtime.id,
    version: version
      ? estimated(version, `parsed from: ${runtime.versionCommand}`)
      : unknown(`no version found in output of: ${runtime.versionCommand}`),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect all installed runtimes from a list of catalog entries.
 *
 * @param runtimes - All known runtimes from the catalog.
 * @param platform - Current OS platform.
 * @param run - Command runner (injected for testability).
 * @returns List of detected runtimes (only those actually found).
 */
export async function detectRuntimes(
  runtimes: readonly RuntimeEntry[],
  platform: Platform,
  run: CommandRunner,
): Promise<InstalledRuntime[]> {
  const results: InstalledRuntime[] = [];

  for (const rt of runtimes) {
    const detected = await detectSingleRuntime(rt, platform, run);
    if (detected) {
      results.push(detected);
    }
  }

  return results;
}
