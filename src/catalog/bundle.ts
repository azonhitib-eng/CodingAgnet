/**
 * Catalog bundle loader.
 *
 * Single official entry point for loading the entire catalog.
 * Loads runtime → model → agent-tool manifests in the correct order,
 * then runs all cross-catalog referential integrity checks before
 * returning a fully validated CatalogBundle.
 *
 * Cross-catalog validation is **not optional** — it is built into
 * the only public loading path.
 */

import { readdir } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, loadManifestSync } from "./loader.js";
import { ModelCatalog } from "./model-catalog.js";
import { RuntimeRegistry } from "./runtime-registry.js";
import { AgentToolCatalog } from "./agent-tool-catalog.js";
import { CatalogError } from "./errors.js";
import { ModelManifestSchema } from "../schemas/model.schema.js";
import { RuntimeManifestSchema } from "../schemas/runtime.schema.js";
import { AgentToolManifestSchema } from "../schemas/agent-tool.schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A fully loaded and validated catalog bundle. */
export interface CatalogBundle {
  readonly models: ModelCatalog;
  readonly runtimes: RuntimeRegistry;
  readonly agentTools: AgentToolCatalog;
}

/** Paths to the three manifest directories. */
export interface CatalogPaths {
  /** Directory containing model manifest JSON files. */
  models: string;
  /** Directory containing runtime manifest JSON files. */
  runtimes: string;
  /** Directory containing agent-tool manifest JSON files. */
  agentTools: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonFiles(names: string[]): string[] {
  return names.filter((n) => n.endsWith(".json")).sort();
}

function wrapLoadError(
  err: unknown,
  filePath: string,
  manifestType: "model" | "runtime" | "agent-tool",
): CatalogError {
  if (err instanceof CatalogError) {
    // Enrich with filePath / manifestType if not already present.
    if (err.filePath === undefined || err.manifestType === undefined) {
      return new CatalogError(err.code, err.message, {
        ...err.details,
        filePath,
        manifestType,
      });
    }
    return err;
  }
  return new CatalogError(
    "FILE_READ_ERROR",
    `Failed to load ${manifestType} manifest at ${filePath}: ${(err as Error).message}`,
    { filePath, manifestType },
  );
}

// ---------------------------------------------------------------------------
// Async entry point
// ---------------------------------------------------------------------------

/**
 * Load **all** manifests from the given directory layout, validate
 * every one, and run cross-catalog referential integrity checks.
 *
 * Returns a fully validated `CatalogBundle` or throws a
 * `CatalogError` with precise context.
 *
 * Loading order: runtimes → models → agent-tools.
 * Cross-catalog checks run automatically after all manifests are loaded.
 */
export async function loadCatalogBundle(
  paths: CatalogPaths,
): Promise<CatalogBundle> {
  const runtimes = new RuntimeRegistry();
  const models = new ModelCatalog();
  const agentTools = new AgentToolCatalog();

  // 1. Load runtimes first (others reference them).
  const rtFiles = jsonFiles(await listDir(paths.runtimes));
  for (const name of rtFiles) {
    const fp = join(paths.runtimes, name);
    try {
      const manifest = await loadManifest(fp, RuntimeManifestSchema);
      runtimes.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "runtime");
    }
  }

  // 2. Load models.
  const modelFiles = jsonFiles(await listDir(paths.models));
  for (const name of modelFiles) {
    const fp = join(paths.models, name);
    try {
      const manifest = await loadManifest(fp, ModelManifestSchema);
      models.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "model");
    }
  }

  // 3. Load agent-tools.
  const toolFiles = jsonFiles(await listDir(paths.agentTools));
  for (const name of toolFiles) {
    const fp = join(paths.agentTools, name);
    try {
      const manifest = await loadManifest(fp, AgentToolManifestSchema);
      agentTools.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "agent-tool");
    }
  }

  // 4. Cross-catalog referential integrity.
  models.validateRuntimeReferences(runtimes.knownIds);
  agentTools.validateRuntimeReferences(runtimes.knownIds);

  return { models, runtimes, agentTools };
}

// ---------------------------------------------------------------------------
// Sync entry point
// ---------------------------------------------------------------------------

/**
 * Synchronous variant of `loadCatalogBundle()`.
 */
export function loadCatalogBundleSync(paths: CatalogPaths): CatalogBundle {
  const runtimes = new RuntimeRegistry();
  const models = new ModelCatalog();
  const agentTools = new AgentToolCatalog();

  // 1. Load runtimes.
  const rtFiles = jsonFiles(readdirSync(paths.runtimes));
  for (const name of rtFiles) {
    const fp = join(paths.runtimes, name);
    try {
      const manifest = loadManifestSync(fp, RuntimeManifestSchema);
      runtimes.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "runtime");
    }
  }

  // 2. Load models.
  const modelFiles = jsonFiles(readdirSync(paths.models));
  for (const name of modelFiles) {
    const fp = join(paths.models, name);
    try {
      const manifest = loadManifestSync(fp, ModelManifestSchema);
      models.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "model");
    }
  }

  // 3. Load agent-tools.
  const toolFiles = jsonFiles(readdirSync(paths.agentTools));
  for (const name of toolFiles) {
    const fp = join(paths.agentTools, name);
    try {
      const manifest = loadManifestSync(fp, AgentToolManifestSchema);
      agentTools.addManifest(manifest);
    } catch (err) {
      throw wrapLoadError(err, fp, "agent-tool");
    }
  }

  // 4. Cross-catalog referential integrity.
  models.validateRuntimeReferences(runtimes.knownIds);
  agentTools.validateRuntimeReferences(runtimes.knownIds);

  return { models, runtimes, agentTools };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err) {
    throw new CatalogError(
      "FILE_READ_ERROR",
      `Cannot read manifest directory "${dir}": ${(err as Error).message}`,
      { filePath: dir },
    );
  }
}
