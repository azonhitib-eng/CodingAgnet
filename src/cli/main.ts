#!/usr/bin/env node
/**
 * codingagent-backend CLI — minimal developer-facing command interface.
 *
 * This CLI is for developer usability and backend verification only.
 * It is NOT a product shell, execution engine, or daemon.
 * Install plans are INFORMATIONAL ONLY — they are NOT executed.
 *
 * Usage:
 *   npx tsx src/cli/main.ts <command> [options]
 *
 * Commands:
 *   detect-host          Detect local host capabilities
 *   list-models          List catalog models/artifacts
 *   recommend-models     Rank models for a host
 *   check-compatibility  Check artifact compatibility with host
 *   plan-install         Generate an install plan (informational only)
 *   render-plan          Render a saved plan JSON file
 *   run-workflow          Run the full staged workflow pipeline
 */

import { resolve } from "node:path";
import { loadCatalogBundleSync, type CatalogPaths } from "../catalog/bundle.js";
import { CliError, usageError, EXIT_OK, EXIT_RUNTIME } from "./errors.js";
import { printError } from "./format.js";
import { runDetectHost } from "./commands/detect-host.js";
import { runListModels } from "./commands/list-models.js";
import { runRecommendModels } from "./commands/recommend-models.js";
import { runCheckCompatibility } from "./commands/check-compatibility.js";
import { runPlanInstall } from "./commands/plan-install.js";
import { runRenderPlan } from "./commands/render-plan.js";
import { runRunWorkflow } from "./commands/run-workflow.js";
import { detectHost } from "../detection/host-detector.js";
import { loadHostProfile } from "./host-loader.js";

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const USAGE = `
codingagent-backend CLI — developer-facing backend verification tool

Usage: codingagent-cli <command> [options]

Commands:
  detect-host          Detect local host capabilities
  list-models          List catalog models/artifacts
  recommend-models     Rank models for a host
  check-compatibility  Check artifact compatibility with host
  plan-install         Generate an install plan (informational only)
  render-plan          Render a saved plan JSON file
  run-workflow         Run the full staged workflow pipeline

Global options:
  --json               Output as JSON
  --data-dir <path>    Path to catalog data directory (default: ./data)
  --host-file <path>   Use a saved host profile JSON instead of live detection
  --help               Show this help message

Command-specific options:
  list-models:
    --status <status>       Filter by status (supported|experimental|deprecated)
    --runtime <id>          Filter by runtime ID
    --capability <cap>      Filter by capability (coding|agenticToolUse|autocomplete|longContext)

  recommend-models:
    --include-unsupported   Include unsupported artifacts in results

  check-compatibility:
    --artifact <id>         Artifact ID to check (required)

  plan-install:
    --artifact <id>         Artifact ID to plan for (required)

  render-plan:
    --plan-file <path>      Path to a saved plan JSON file (required)

  run-workflow:
    --artifact <id>         Target a specific artifact (optional; defaults to top recommendation)
    --stop-after <stage>    Stop after the given stage for review (optional)
                            Stages: catalog_loading, host_acquisition, recommendation,
                            target_selection, compatibility_evaluation, install_planning,
                            safety_evaluation, rendering

Note: Install plans are INFORMATIONAL ONLY and are NOT executed.
      Use --host-file for deterministic, reproducible results.
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(
  argv: string[] = process.argv.slice(2),
  writer: (msg: string) => void = console.log,
  errWriter: (msg: string) => void = console.error,
): Promise<number> {
  try {
    const command = argv[0];

    if (!command || hasFlag(argv, "--help")) {
      writer(USAGE);
      return EXIT_OK;
    }

    const jsonMode = hasFlag(argv, "--json");

    // Commands that don't need catalog
    if (command === "detect-host") {
      const dataDir = getFlagValue(argv, "--data-dir");
      let bundle;
      if (dataDir) {
        const paths = resolveCatalogPaths(dataDir);
        bundle = loadCatalogBundleSync(paths);
      }
      await runDetectHost({ json: jsonMode, bundle, writer });
      return EXIT_OK;
    }

    if (command === "render-plan") {
      const planFile = getFlagValue(argv, "--plan-file");
      if (!planFile) {
        throw usageError("render-plan requires --plan-file <path>");
      }
      runRenderPlan({ planPath: resolve(planFile), json: jsonMode, writer });
      return EXIT_OK;
    }

    // All remaining commands need a catalog bundle
    const dataDir = getFlagValue(argv, "--data-dir") ?? "./data";
    const paths = resolveCatalogPaths(dataDir);
    const bundle = loadCatalogBundleSync(paths);

    switch (command) {
      case "list-models": {
        runListModels({
          bundle,
          json: jsonMode,
          status: getFlagValue(argv, "--status"),
          runtime: getFlagValue(argv, "--runtime"),
          capability: getFlagValue(argv, "--capability"),
          writer,
        });
        return EXIT_OK;
      }

      case "recommend-models": {
        const hostFilePath = getFlagValue(argv, "--host-file");
        const host = hostFilePath
          ? loadHostProfile(hostFilePath)
          : await detectHost({ catalogRuntimes: bundle.runtimes.listAll() });
        runRecommendModels({
          bundle,
          host,
          json: jsonMode,
          includeUnsupported: hasFlag(argv, "--include-unsupported"),
          writer,
        });
        return EXIT_OK;
      }

      case "check-compatibility": {
        const artifactId = getFlagValue(argv, "--artifact");
        if (!artifactId) {
          throw usageError("check-compatibility requires --artifact <id>");
        }
        const hostFilePath = getFlagValue(argv, "--host-file");
        const host = hostFilePath
          ? loadHostProfile(hostFilePath)
          : await detectHost({ catalogRuntimes: bundle.runtimes.listAll() });
        runCheckCompatibility({
          bundle,
          host,
          artifactId,
          json: jsonMode,
          writer,
        });
        return EXIT_OK;
      }

      case "plan-install": {
        const artifactId = getFlagValue(argv, "--artifact");
        if (!artifactId) {
          throw usageError("plan-install requires --artifact <id>");
        }
        const hostFilePath = getFlagValue(argv, "--host-file");
        const host = hostFilePath
          ? loadHostProfile(hostFilePath)
          : await detectHost({ catalogRuntimes: bundle.runtimes.listAll() });
        runPlanInstall({
          bundle,
          host,
          artifactId,
          json: jsonMode,
          writer,
        });
        return EXIT_OK;
      }

      case "run-workflow": {
        const hostFilePath = getFlagValue(argv, "--host-file");
        const host = hostFilePath
          ? loadHostProfile(hostFilePath)
          : await detectHost({ catalogRuntimes: bundle.runtimes.listAll() });
        runRunWorkflow({
          bundle,
          host,
          artifactId: getFlagValue(argv, "--artifact"),
          stopAfter: getFlagValue(argv, "--stop-after"),
          json: jsonMode,
          writer,
        });
        return EXIT_OK;
      }

      default:
        throw usageError(`Unknown command: "${command}". Run with --help for usage.`);
    }
  } catch (error: unknown) {
    if (error instanceof CliError) {
      printError(error.message, errWriter);
      return error.exitCode;
    }
    // Unexpected/runtime errors get EXIT_RUNTIME, not EXIT_USAGE
    const msg = error instanceof Error ? error.message : String(error);
    printError(`Unexpected error: ${msg}`, errWriter);
    return EXIT_RUNTIME;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCatalogPaths(dataDir: string): CatalogPaths {
  const resolved = resolve(dataDir);
  return {
    models: resolve(resolved, "models"),
    runtimes: resolve(resolved, "runtimes"),
    agentTools: resolve(resolved, "agent-tools"),
  };
}

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------

/* c8 ignore start */
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli/main.ts") || process.argv[1].endsWith("/cli/main.js"));

if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  });
}
/* c8 ignore stop */
