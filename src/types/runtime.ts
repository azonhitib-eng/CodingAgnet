/**
 * Runtime / provider type contracts.
 *
 * A runtime is a software component that can serve or execute model
 * artifacts locally (e.g. Ollama, llama.cpp server, vLLM).
 */

import type { CatalogStatus } from "./model.js";

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

export type RuntimeType =
  | "local_server"    // long-running local HTTP server (Ollama, vLLM)
  | "cli_tool"        // invoke-and-wait CLI binary (llama.cpp)
  | "api_endpoint";   // remote or local OpenAI-compatible API

export type Platform = "linux" | "darwin" | "win32";

// ---------------------------------------------------------------------------
// Runtime entry
// ---------------------------------------------------------------------------

export interface RuntimeEntry {
  id: string;
  displayName: string;
  type: RuntimeType;
  /** Shell command to detect presence, e.g. "ollama --version". */
  detectionCommand: string;
  /** Shell command to retrieve version, e.g. "ollama --version". */
  versionCommand: string;
  supportedPlatforms: Platform[];
  /** Driver requirements, e.g. ["CUDA >= 11.8"]. */
  requiredDrivers?: string[];
  /** Capabilities the runtime exposes, e.g. ["gpu_offload", "batching"]. */
  capabilities?: string[];
  /** Per-platform install instructions. */
  installInstructions: Partial<Record<Platform, string[]>>;
  /** Per-platform post-install verification commands. */
  postInstallVerification?: Partial<Record<Platform, string[]>>;
  status: CatalogStatus;
}

// ---------------------------------------------------------------------------
// Manifest wrapper (versioned)
// ---------------------------------------------------------------------------

export interface RuntimeManifest {
  schemaVersion: string;
  manifestVersion: string;
  runtime: RuntimeEntry;
}
