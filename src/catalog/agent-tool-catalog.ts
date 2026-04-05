/**
 * Agent / tool catalog.
 *
 * In-memory catalog of AgentToolEntry objects loaded from manifests.
 * Validates duplicates and runtime dependency references.
 */

import type { AgentToolManifest, AgentToolEntry, CatalogStatus } from "../types/index.js";
import { CatalogError } from "./errors.js";

export class AgentToolCatalog {
  private readonly tools = new Map<string, AgentToolEntry>();
  private readonly manifestVersions = new Map<string, string>();

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  addManifest(manifest: AgentToolManifest): void {
    const { tool, manifestVersion } = manifest;

    if (this.tools.has(tool.id)) {
      throw new CatalogError(
        "DUPLICATE_ID",
        `Duplicate agent tool id "${tool.id}"`,
        { id: tool.id, type: "AgentToolEntry" },
      );
    }

    this.tools.set(tool.id, tool);
    this.manifestVersions.set(tool.id, manifestVersion);
  }

  /**
   * Validate that every tool's requiredRuntimes exist in the known set.
   * Call after loading all manifests.
   */
  validateRuntimeReferences(knownRuntimeIds: ReadonlySet<string>): void {
    for (const tool of this.tools.values()) {
      for (const rid of tool.requiredRuntimes) {
        if (!knownRuntimeIds.has(rid)) {
          throw new CatalogError(
            "REFERENCE_INTEGRITY_ERROR",
            `Agent tool "${tool.id}" requires runtime "${rid}" which is not in the runtime registry`,
            { toolId: tool.id, runtimeId: rid },
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Queries — by ID
  // -----------------------------------------------------------------------

  get(id: string): AgentToolEntry | undefined {
    return this.tools.get(id);
  }

  // -----------------------------------------------------------------------
  // Queries — list / filter
  // -----------------------------------------------------------------------

  listAll(): AgentToolEntry[] {
    return [...this.tools.values()];
  }

  filterByStatus(status: CatalogStatus): AgentToolEntry[] {
    return this.listAll().filter((t) => t.status === status);
  }

  /** Filter tools that require a specific runtime. */
  filterByRequiredRuntime(runtimeId: string): AgentToolEntry[] {
    return this.listAll().filter((t) =>
      t.requiredRuntimes.includes(runtimeId),
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  get count(): number {
    return this.tools.size;
  }

  getManifestVersion(toolId: string): string | undefined {
    return this.manifestVersions.get(toolId);
  }
}
