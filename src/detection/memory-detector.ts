/**
 * Memory detector.
 *
 * Detects total and available system memory using Node.js `os` module.
 * Values are always available and certain.
 */

import os from "node:os";
import type { MemoryInfo, Detected } from "../types/host.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "certain", source };
}

/** Convert bytes to gigabytes, rounded to 1 decimal. */
export function bytesToGb(bytes: number): number {
  return Math.round((bytes / (1024 ** 3)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Detect system memory. */
export function detectMemory(): MemoryInfo {
  return parseMemoryInfo(os.totalmem(), os.freemem());
}

// ---------------------------------------------------------------------------
// Pure parsing (testable)
// ---------------------------------------------------------------------------

/**
 * Build MemoryInfo from raw byte values.
 * Exported for unit testing.
 */
export function parseMemoryInfo(
  totalBytes: number,
  freeBytes: number,
): MemoryInfo {
  return {
    totalGb: certain(bytesToGb(totalBytes), "os.totalmem()"),
    availableGb: certain(bytesToGb(freeBytes), "os.freemem()"),
  };
}
