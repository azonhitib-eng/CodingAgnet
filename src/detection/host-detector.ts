/**
 * Host detector orchestrator.
 *
 * Aggregates all sub-detectors into a single `HostProfile`.
 * This is the main public entry point for host detection.
 *
 * Design:
 * - All detectors are called; none are skipped on failure
 * - Each detector handles its own error cases (returns unknown)
 * - The orchestrator never throws — it always returns a profile
 * - Command execution is injected for testability
 */

import type { HostProfile } from "../types/host.js";
import type { RuntimeEntry, Platform } from "../types/runtime.js";
import { detectOs } from "./os-detector.js";
import { detectCpu } from "./cpu-detector.js";
import { detectMemory } from "./memory-detector.js";
import { detectGpu } from "./gpu-detector.js";
import { detectRuntimes } from "./runtime-detector.js";
import { runCommand, type CommandRunner } from "./run-command.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DetectHostOptions {
  /**
   * Catalog runtimes to probe for.
   * If omitted, no runtime detection is performed.
   */
  catalogRuntimes?: readonly RuntimeEntry[];
  /**
   * Override the command runner (for testing).
   * Defaults to the real `runCommand`.
   */
  commandRunner?: CommandRunner;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect host capabilities and return a complete `HostProfile`.
 *
 * Never throws — sub-detector failures degrade to "unknown" values.
 */
export async function detectHost(
  options: DetectHostOptions = {},
): Promise<HostProfile> {
  const run = options.commandRunner ?? runCommand;

  // Synchronous detectors
  const os = detectOs();
  const cpu = detectCpu();
  const memory = detectMemory();

  // Platform string for GPU and runtime detectors
  const platform = (os.platform.value ?? "linux") as Platform;

  // Async detectors
  const gpu = await detectGpu(platform, run);
  const installedRuntimes = options.catalogRuntimes
    ? await detectRuntimes(options.catalogRuntimes, platform, run)
    : [];

  // Determine missing dependencies:
  // runtimes in the catalog that are supported on this platform but not detected
  const detectedRuntimeIds = new Set(installedRuntimes.map((r) => r.runtimeId));
  const missingDependencies: string[] = [];
  if (options.catalogRuntimes) {
    for (const rt of options.catalogRuntimes) {
      if (
        rt.supportedPlatforms.includes(platform) &&
        !detectedRuntimeIds.has(rt.id)
      ) {
        missingDependencies.push(rt.id);
      }
    }
  }

  return {
    detectedAt: new Date().toISOString(),
    os,
    cpu,
    memory,
    gpu,
    installedRuntimes,
    missingDependencies,
  };
}
