/**
 * list-models CLI command.
 *
 * Lists model families, variants, and artifacts from the loaded catalog.
 * Supports filtering by status, runtime, and capability.
 * Wraps the ModelCatalog query methods.
 */

import type { CatalogBundle } from "../../catalog/bundle.js";
import type { ModelArtifact, ModelFamily, CatalogStatus, ModelCapabilities } from "../../types/model.js";
import { printOutput } from "../format.js";
import { usageError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListModelsArgs {
  bundle: CatalogBundle;
  json: boolean;
  status?: string;
  runtime?: string;
  capability?: string;
  writer?: (msg: string) => void;
}

interface ArtifactRow {
  artifactId: string;
  variantId: string;
  familyId: string;
  family: string;
  variant: string;
  runtime: string;
  quantization: string;
  status: CatalogStatus;
  ramGb: number;
  vramGb: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set<string>(["supported", "experimental", "deprecated"]);
const VALID_CAPABILITIES = new Set<string>(["coding", "agenticToolUse", "autocomplete", "longContext"]);

function validateFilters(args: ListModelsArgs): void {
  if (args.status && !VALID_STATUSES.has(args.status)) {
    throw usageError(
      `Invalid status "${args.status}". Must be one of: ${[...VALID_STATUSES].join(", ")}`,
    );
  }
  if (args.capability && !VALID_CAPABILITIES.has(args.capability)) {
    throw usageError(
      `Invalid capability "${args.capability}". Must be one of: ${[...VALID_CAPABILITIES].join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

function formatArtifactsPretty(rows: ArtifactRow[]): string {
  if (rows.length === 0) return "No models found matching the given filters.";

  const lines: string[] = [];
  lines.push(`Found ${rows.length} artifact(s):\n`);

  // Group by family
  const grouped = new Map<string, ArtifactRow[]>();
  for (const r of rows) {
    const existing = grouped.get(r.family) ?? [];
    existing.push(r);
    grouped.set(r.family, existing);
  }

  for (const [family, artifacts] of grouped) {
    lines.push(`  ${family}`);
    for (const a of artifacts) {
      lines.push(
        `    ${a.artifactId}  [${a.quantization}]  runtime=${a.runtime}  ` +
        `RAM≥${a.ramGb}GB  VRAM≥${a.vramGb}GB  status=${a.status}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runListModels(args: ListModelsArgs): ArtifactRow[] {
  validateFilters(args);

  const { bundle } = args;

  // Start with all artifacts
  let artifacts: ModelArtifact[] = bundle.models.listArtifacts();

  // Filter by status
  if (args.status) {
    artifacts = artifacts.filter((a) => a.status === args.status);
  }

  // Filter by runtime
  if (args.runtime) {
    artifacts = artifacts.filter((a) => a.runtimeId === args.runtime);
  }

  // Filter by capability (needs family lookup)
  let allowedFamilyIds: Set<string> | undefined;
  if (args.capability) {
    const cap = args.capability as keyof ModelCapabilities;
    const families = bundle.models.filterFamiliesByCapability(cap);
    allowedFamilyIds = new Set(families.map((f: ModelFamily) => f.id));
  }

  // Build rows
  const rows: ArtifactRow[] = [];
  for (const a of artifacts) {
    const variant = bundle.models.getVariant(a.variantId);
    if (!variant) continue;
    const family = bundle.models.getFamily(variant.familyId);
    if (!family) continue;

    // Filter by capability
    if (allowedFamilyIds && !allowedFamilyIds.has(family.id)) continue;

    rows.push({
      artifactId: a.id,
      variantId: a.variantId,
      familyId: family.id,
      family: family.displayName,
      variant: variant.displayName,
      runtime: a.runtimeId,
      quantization: a.quantization,
      status: a.status,
      ramGb: a.minimumRamGb,
      vramGb: a.minimumVramGb,
    });
  }

  // Stable sort: family → variant → artifactId for deterministic output
  rows.sort((a, b) =>
    a.family.localeCompare(b.family) ||
    a.variant.localeCompare(b.variant) ||
    a.artifactId.localeCompare(b.artifactId),
  );

  if (args.json) {
    printOutput(rows, true, args.writer);
  } else {
    printOutput(formatArtifactsPretty(rows), false, args.writer);
  }

  return rows;
}
