#!/usr/bin/env node
/**
 * Minimal example runner — demonstrates the end-to-end flow.
 *
 * Usage:
 *   npx tsx scripts/example-runner.ts
 *   npx tsx scripts/example-runner.ts --data-dir ./data
 *
 * This is a developer-facing debug entrypoint, NOT a production CLI.
 */

import { resolve } from "node:path";
import {
  loadCatalogBundleSync,
  type CatalogPaths,
} from "../src/catalog/bundle.js";
import { recommend } from "../src/compatibility/recommendation-engine.js";
import { checkCompatibility } from "../src/compatibility/compatibility-engine.js";
import {
  generateInstallPlan,
} from "../src/install-plan/install-planner.js";
import {
  evaluatePlanSafety,
  defaultExecutionPolicy,
} from "../src/install-plan/safety-evaluator.js";
import { renderPlan } from "../src/install-plan/plan-renderer.js";
import type { HostProfile } from "../src/types/host.js";

// ---------------------------------------------------------------------------
// Mock host (simulates a Linux machine with GPU)
// ---------------------------------------------------------------------------

const mockHost: HostProfile = {
  detectedAt: new Date().toISOString(),
  os: {
    platform: { value: "linux", confidence: "certain" },
    release: { value: "6.5.0", confidence: "certain" },
    arch: { value: "x64", confidence: "certain" },
  },
  cpu: {
    model: { value: "AMD Ryzen 9 5900X", confidence: "certain" },
    cores: { value: 12, confidence: "certain" },
    threads: { value: 24, confidence: "certain" },
  },
  memory: {
    totalGb: { value: 32, confidence: "certain" },
    availableGb: { value: 24, confidence: "estimated" },
  },
  gpu: {
    present: { value: true, confidence: "certain" },
    model: { value: "NVIDIA RTX 3080", confidence: "certain" },
    vramGb: { value: 10, confidence: "certain" },
    cudaVersion: { value: "12.2", confidence: "certain" },
    rocmVersion: { value: null, confidence: "unknown" },
    driverVersion: { value: "535.129.03", confidence: "certain" },
  },
  installedRuntimes: [
    { runtimeId: "ollama", version: { value: "0.3.0", confidence: "certain" } },
  ],
  missingDependencies: [],
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const dataDir = resolve(
    process.argv.includes("--data-dir")
      ? process.argv[process.argv.indexOf("--data-dir") + 1]
      : "./data",
  );

  const catalogPaths: CatalogPaths = {
    models: resolve(dataDir, "models"),
    runtimes: resolve(dataDir, "runtimes"),
    agentTools: resolve(dataDir, "agent-tools"),
  };

  console.log("=== CodingAgent Backend — Example Runner ===\n");
  console.log(`Data directory: ${dataDir}\n`);

  // 1. Load catalogs
  console.log("1. Loading catalog bundle...");
  const bundle = loadCatalogBundleSync(catalogPaths);
  console.log(
    `   Loaded: ${bundle.models.listArtifacts().length} artifacts, ` +
    `${bundle.runtimes.listAll().length} runtimes, ` +
    `${bundle.agentTools.listAll().length} agent-tools\n`,
  );

  // 2. Recommend
  console.log("2. Generating recommendations for mock host...");
  const recs = recommend(mockHost, bundle);
  console.log(`   Found ${recs.length} compatible artifact(s):`);
  for (const r of recs.slice(0, 5)) {
    console.log(`     - ${r.displayName} [score=${r.score}, class=${r.compatibility.classification}]`);
  }
  console.log();

  if (recs.length === 0) {
    console.log("No compatible artifacts — exiting.");
    return;
  }

  // 3. Pick top recommendation
  const top = recs[0];
  const artifact = bundle.models.getArtifact(top.artifactId)!;
  const variant = bundle.models.getVariant(top.variantId)!;
  const family = bundle.models.getFamily(top.familyId)!;
  const runtime = bundle.runtimes.get(artifact.runtimeId)!;

  console.log(`3. Selected: ${top.displayName}`);
  console.log(`   Compatibility: ${top.compatibility.classification}\n`);

  // 4. Detailed compatibility
  const compat = checkCompatibility(mockHost, artifact, {
    variant,
    family,
    runtime,
    runtimeInstalled: mockHost.installedRuntimes.some(
      (r) => r.runtimeId === artifact.runtimeId,
    ),
  });
  console.log(`4. Detailed compatibility: ${compat.classification}`);
  if (compat.warnings.length > 0) {
    for (const w of compat.warnings) console.log(`   ⚠ ${w}`);
  }
  console.log();

  // 5. Generate install plan
  const plan = generateInstallPlan({
    host: mockHost,
    artifact,
    variant,
    runtime,
    compatibility: compat,
  });
  console.log(`5. Generated install plan: ${plan.steps.length} step(s)\n`);

  // 6. Safety evaluation
  const policy = defaultExecutionPolicy();
  const safety = evaluatePlanSafety(plan, policy);
  console.log("6. Safety evaluation:");
  console.log(`   Approved: ${safety.approved}`);
  console.log(`   Blocked: ${safety.blocked}`);
  console.log(`   Requires Human Approval: ${safety.requiresHumanApproval}`);
  console.log(`   Violations: ${safety.violations.length}`);
  console.log(`   Warnings: ${safety.warnings.length}\n`);

  // 7. Render
  console.log("7. Rendered plan:\n");
  const rendered = renderPlan(plan, safety);
  console.log(rendered);
}

main();
