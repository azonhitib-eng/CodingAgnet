/**
 * Agent / tool type contracts.
 *
 * Agent tools (Aider, Continue, OpenHands, …) are cataloged
 * separately from models.  Each entry describes purpose,
 * dependencies, and host assumptions.
 */

import type { CatalogStatus } from "./model.js";
import type { Platform } from "./runtime.js";

export interface AgentToolEntry {
  id: string;
  displayName: string;
  purpose: string;
  /** Runtime or dependency ids this tool needs. */
  requiredRuntimes: string[];
  /** Free-form host assumptions, e.g. "requires Docker". */
  hostAssumptions: string[];
  suitableUseCases: string[];
  warnings: string[];
  /** Per-platform install instructions. */
  installInstructions: Partial<Record<Platform, string[]>>;
  supportedPlatforms: Platform[];
  status: CatalogStatus;
}

export interface AgentToolManifest {
  schemaVersion: string;
  manifestVersion: string;
  tool: AgentToolEntry;
}
