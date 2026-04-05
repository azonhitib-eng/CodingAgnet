/**
 * OS detector.
 *
 * Detects operating system platform, release, and architecture using
 * Node.js built-in `os` module.  These values are always available
 * so confidence is "certain".
 */

import os from "node:os";
import type { OsInfo, Detected } from "../types/host.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function certain<T>(value: T, source: string): Detected<T> {
  return { value, confidence: "certain", source };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect OS information.
 * All fields come from Node.js `os` module and are always certain.
 */
export function detectOs(): OsInfo {
  return {
    platform: certain(os.platform(), "os.platform()"),
    release: certain(os.release(), "os.release()"),
    arch: certain(os.arch(), "os.arch()"),
  };
}

// ---------------------------------------------------------------------------
// Pure parsing (testable without OS dependency)
// ---------------------------------------------------------------------------

/**
 * Build OsInfo from raw values.
 * Exported for unit testing without relying on the real OS.
 */
export function parseOsInfo(
  platform: string,
  release: string,
  arch: string,
): OsInfo {
  return {
    platform: certain(platform, "os.platform()"),
    release: certain(release, "os.release()"),
    arch: certain(arch, "os.arch()"),
  };
}
