/**
 * Model catalog.
 *
 * In-memory catalog that loads ModelManifests, indexes families /
 * variants / artifacts, and provides query capabilities.
 *
 * Performs full referential integrity validation on load.
 */

import type {
  ModelManifest,
  ModelFamily,
  ModelVariant,
  ModelArtifact,
  CatalogStatus,
  ModelCapabilities,
} from "../types/index.js";
import { CatalogError } from "./errors.js";

export class ModelCatalog {
  private readonly families = new Map<string, ModelFamily>();
  private readonly variants = new Map<string, ModelVariant>();
  private readonly artifacts = new Map<string, ModelArtifact>();
  private readonly manifestVersions = new Map<string, string>();

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------

  /**
   * Add a validated model manifest to the catalog.
   * Checks duplicate IDs and internal referential integrity.
   *
   * Cross-catalog references (runtimeId) are checked separately via
   * `validateRuntimeReferences()`.
   */
  addManifest(manifest: ModelManifest): void {
    const { family, variants, artifacts, manifestVersion } = manifest;

    // --- Duplicate family ID ---
    if (this.families.has(family.id)) {
      throw new CatalogError(
        "DUPLICATE_ID",
        `Duplicate model family id "${family.id}"`,
        { entityId: family.id, manifestType: "model" },
      );
    }

    // --- Duplicate variant IDs ---
    for (const v of variants) {
      if (this.variants.has(v.id)) {
        throw new CatalogError(
          "DUPLICATE_ID",
          `Duplicate model variant id "${v.id}"`,
          { entityId: v.id, manifestType: "model" },
        );
      }
    }

    // --- Duplicate artifact IDs ---
    for (const a of artifacts) {
      if (this.artifacts.has(a.id)) {
        throw new CatalogError(
          "DUPLICATE_ID",
          `Duplicate model artifact id "${a.id}"`,
          { entityId: a.id, manifestType: "model" },
        );
      }
    }

    // --- Variant → Family referential integrity ---
    for (const v of variants) {
      if (v.familyId !== family.id) {
        throw new CatalogError(
          "REFERENCE_INTEGRITY_ERROR",
          `Variant "${v.id}" references familyId "${v.familyId}" but manifest family is "${family.id}"`,
          { entityId: v.id, manifestType: "model", expected: family.id, found: v.familyId },
        );
      }
    }

    // --- Artifact → Variant referential integrity ---
    const variantIds = new Set(variants.map((v) => v.id));
    for (const a of artifacts) {
      if (!variantIds.has(a.variantId)) {
        throw new CatalogError(
          "REFERENCE_INTEGRITY_ERROR",
          `Artifact "${a.id}" references variantId "${a.variantId}" which does not exist in this manifest`,
          { entityId: a.id, manifestType: "model", variantId: a.variantId },
        );
      }
    }

    // --- Commit to indexes ---
    this.families.set(family.id, family);
    this.manifestVersions.set(family.id, manifestVersion);
    for (const v of variants) this.variants.set(v.id, v);
    for (const a of artifacts) this.artifacts.set(a.id, a);
  }

  /**
   * Validate that every artifact's runtimeId exists in the provided set
   * of known runtime IDs.  Call after loading all manifests.
   */
  validateRuntimeReferences(knownRuntimeIds: ReadonlySet<string>): void {
    for (const a of this.artifacts.values()) {
      if (!knownRuntimeIds.has(a.runtimeId)) {
        throw new CatalogError(
          "REFERENCE_INTEGRITY_ERROR",
          `Artifact "${a.id}" references runtimeId "${a.runtimeId}" which is not in the runtime registry`,
          { entityId: a.id, manifestType: "model", runtimeId: a.runtimeId },
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Queries — by ID
  // -----------------------------------------------------------------------

  getFamily(id: string): ModelFamily | undefined {
    return this.families.get(id);
  }

  getVariant(id: string): ModelVariant | undefined {
    return this.variants.get(id);
  }

  getArtifact(id: string): ModelArtifact | undefined {
    return this.artifacts.get(id);
  }

  // -----------------------------------------------------------------------
  // Queries — list all
  // -----------------------------------------------------------------------

  listFamilies(): ModelFamily[] {
    return [...this.families.values()];
  }

  listVariants(): ModelVariant[] {
    return [...this.variants.values()];
  }

  listArtifacts(): ModelArtifact[] {
    return [...this.artifacts.values()];
  }

  // -----------------------------------------------------------------------
  // Queries — filtered
  // -----------------------------------------------------------------------

  /** Filter families by status. */
  filterFamiliesByStatus(status: CatalogStatus): ModelFamily[] {
    return this.listFamilies().filter((f) => f.status === status);
  }

  /** Filter families by a capability flag being true. */
  filterFamiliesByCapability(
    cap: keyof ModelCapabilities,
  ): ModelFamily[] {
    return this.listFamilies().filter((f) => f.capabilities[cap]);
  }

  /** Filter artifacts by runtime id. */
  filterArtifactsByRuntime(runtimeId: string): ModelArtifact[] {
    return this.listArtifacts().filter((a) => a.runtimeId === runtimeId);
  }

  /** Filter artifacts by status. */
  filterArtifactsByStatus(status: CatalogStatus): ModelArtifact[] {
    return this.listArtifacts().filter((a) => a.status === status);
  }

  // -----------------------------------------------------------------------
  // Queries — relational
  // -----------------------------------------------------------------------

  /** List variants belonging to a family. */
  listVariantsForFamily(familyId: string): ModelVariant[] {
    return this.listVariants().filter((v) => v.familyId === familyId);
  }

  /** List artifacts belonging to a variant. */
  listArtifactsForVariant(variantId: string): ModelArtifact[] {
    return this.listArtifacts().filter((a) => a.variantId === variantId);
  }

  /** List all artifacts for a family (across all its variants). */
  listArtifactsForFamily(familyId: string): ModelArtifact[] {
    const variantIds = new Set(
      this.listVariantsForFamily(familyId).map((v) => v.id),
    );
    return this.listArtifacts().filter((a) => variantIds.has(a.variantId));
  }

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  /** Number of loaded families. */
  get familyCount(): number {
    return this.families.size;
  }

  /** Number of loaded variants. */
  get variantCount(): number {
    return this.variants.size;
  }

  /** Number of loaded artifacts. */
  get artifactCount(): number {
    return this.artifacts.size;
  }

  /** Get the manifestVersion for a family. */
  getManifestVersion(familyId: string): string | undefined {
    return this.manifestVersions.get(familyId);
  }
}
