/**
 * Runtime registry.
 *
 * In-memory registry of RuntimeEntry objects loaded from manifests.
 * Validates duplicates and provides query capabilities.
 */

import type { RuntimeManifest, RuntimeEntry, CatalogStatus } from "../types/index.js";
import { CatalogError } from "./errors.js";

export class RuntimeRegistry {
  private readonly runtimes = new Map<string, RuntimeEntry>();
  private readonly manifestVersions = new Map<string, string>();

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  addManifest(manifest: RuntimeManifest): void {
    const { runtime, manifestVersion } = manifest;

    if (this.runtimes.has(runtime.id)) {
      throw new CatalogError(
        "DUPLICATE_ID",
        `Duplicate runtime id "${runtime.id}"`,
        { id: runtime.id, type: "RuntimeEntry" },
      );
    }

    this.runtimes.set(runtime.id, runtime);
    this.manifestVersions.set(runtime.id, manifestVersion);
  }

  // -----------------------------------------------------------------------
  // Queries — by ID
  // -----------------------------------------------------------------------

  get(id: string): RuntimeEntry | undefined {
    return this.runtimes.get(id);
  }

  has(id: string): boolean {
    return this.runtimes.has(id);
  }

  // -----------------------------------------------------------------------
  // Queries — list / filter
  // -----------------------------------------------------------------------

  listAll(): RuntimeEntry[] {
    return [...this.runtimes.values()];
  }

  filterByStatus(status: CatalogStatus): RuntimeEntry[] {
    return this.listAll().filter((r) => r.status === status);
  }

  filterByCapability(capability: string): RuntimeEntry[] {
    return this.listAll().filter(
      (r) => r.capabilities?.includes(capability) ?? false,
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Set of all known runtime IDs, useful for cross-catalog validation. */
  get knownIds(): ReadonlySet<string> {
    return new Set(this.runtimes.keys());
  }

  get count(): number {
    return this.runtimes.size;
  }

  getManifestVersion(runtimeId: string): string | undefined {
    return this.manifestVersions.get(runtimeId);
  }
}
