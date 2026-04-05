/**
 * recommend-models CLI command.
 *
 * Generates ranked model recommendations for a host profile.
 * Wraps `recommend` from the compatibility layer.
 */

import type { CatalogBundle } from "../../catalog/bundle.js";
import type { HostProfile, ModelRecommendation } from "../../types/index.js";
import { recommend } from "../../compatibility/recommendation-engine.js";
import { printOutput } from "../format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendModelsArgs {
  bundle: CatalogBundle;
  host: HostProfile;
  json: boolean;
  includeUnsupported?: boolean;
  writer?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Pretty formatter
// ---------------------------------------------------------------------------

function formatRecommendationsPretty(recs: ModelRecommendation[]): string {
  if (recs.length === 0) return "No compatible models found for this host.";

  const lines: string[] = [];
  lines.push(`Found ${recs.length} recommendation(s):\n`);

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    lines.push(`  #${i + 1}  ${r.displayName}`);
    lines.push(`       Score: ${r.score}  Class: ${r.compatibility.classification}`);
    lines.push(`       Artifact: ${r.artifactId}`);
    if (r.explanations.length > 0) {
      lines.push(`       Reasons:`);
      for (const exp of r.explanations) {
        lines.push(`         - ${exp}`);
      }
    }
    if (r.compatibility.warnings.length > 0) {
      lines.push(`       Warnings:`);
      for (const w of r.compatibility.warnings) {
        lines.push(`         ⚠ ${w}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function runRecommendModels(args: RecommendModelsArgs): ModelRecommendation[] {
  const recs = recommend(args.host, args.bundle, {
    includeUnsupported: args.includeUnsupported ?? false,
  });

  if (args.json) {
    printOutput(recs, true, args.writer);
  } else {
    printOutput(formatRecommendationsPretty(recs), false, args.writer);
  }

  return recs;
}
