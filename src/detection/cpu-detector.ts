/**
 * CPU detector.
 *
 * Detects CPU model, core count, and thread count using Node.js
 * built-in `os` module.
 *
 * - `os.cpus()` returns per-logical-core info; length = thread count
 * - Physical core count is not directly available from Node.js;
 *   we report it as "estimated" (threads / 2 if > 1, else 1).
 * - Model string comes from the first entry in `os.cpus()`.
 */

import os from "node:os";
import type { CpuInfo, Detected } from "../types/host.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "certain", source };
}

function estimated<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "estimated", source };
}

function unknown(source: string): Detected<never> {
  return { value: null, confidence: "unknown", source } as Detected<never>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Detect CPU information from the host. */
export function detectCpu(): CpuInfo {
  const cpus = os.cpus();
  return parseCpuInfo(cpus);
}

// ---------------------------------------------------------------------------
// Pure parsing (testable)
// ---------------------------------------------------------------------------

/** Estimate physical cores from logical thread count. */
export function estimateCores(threads: number): number {
  // Heuristic: most consumer CPUs are hyper-threaded (2 threads/core).
  // This is explicitly "estimated" — not authoritative.
  return threads > 1 ? Math.ceil(threads / 2) : 1;
}

/**
 * Build CpuInfo from raw os.cpus() output.
 * Exported for unit testing.
 */
export function parseCpuInfo(cpus: os.CpuInfo[]): CpuInfo {
  if (cpus.length === 0) {
    return {
      model: unknown("os.cpus() returned empty array"),
      cores: unknown("os.cpus() returned empty array"),
      threads: unknown("os.cpus() returned empty array"),
    };
  }

  const threads = cpus.length;
  const model = cpus[0].model;

  return {
    model: model
      ? certain(model, "os.cpus()[0].model")
      : unknown("os.cpus()[0].model was empty"),
    cores: estimated(estimateCores(threads), "estimated from thread count / 2"),
    threads: certain(threads, "os.cpus().length"),
  };
}
