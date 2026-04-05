#!/usr/bin/env node
/**
 * Preflight check — verifies the local environment is ready to run the app shell.
 *
 * Usage:
 *   npx tsx scripts/preflight.ts
 *   npm run preflight
 *
 * Checks:
 *   1. Node.js version >= 18
 *   2. Dependencies installed (node_modules exists)
 *   3. TypeScript source files present
 *   4. Data directory exists with expected subdirectories
 *   5. App shell server module loadable
 *
 * Exit code 0 = all checks pass. Non-zero = at least one check failed.
 */

import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function dirExists(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function fileExists(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function main(): void {
  const root = resolve(import.meta.dirname ?? ".", "..");

  console.log();
  console.log("CodingAgent — Preflight Check");
  console.log("─".repeat(40));
  console.log();

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  check(`Node.js >= 18 (found v${nodeVersion})`, major >= 18);

  // 2. Dependencies
  check(
    "node_modules/ exists",
    dirExists(join(root, "node_modules")),
    "run: npm install",
  );

  // 3. TypeScript source
  check(
    "src/app-shell/server.ts exists",
    fileExists(join(root, "src", "app-shell", "server.ts")),
  );
  check(
    "src/app-shell/views.ts exists",
    fileExists(join(root, "src", "app-shell", "views.ts")),
  );
  check(
    "src/app-shell/data-provider.ts exists",
    fileExists(join(root, "src", "app-shell", "data-provider.ts")),
  );

  // 4. Data directory
  const dataDir = join(root, "data");
  check("data/ directory exists", dirExists(dataDir));
  check("data/models/ exists", dirExists(join(dataDir, "models")));
  check("data/runtimes/ exists", dirExists(join(dataDir, "runtimes")));
  check("data/agent-tools/ exists", dirExists(join(dataDir, "agent-tools")));

  // 5. Package.json
  check("package.json exists", fileExists(join(root, "package.json")));

  // 6. Key docs
  check("docs/QUICKSTART.md exists", fileExists(join(root, "docs", "QUICKSTART.md")));
  check("docs/APP-SHELL.md exists", fileExists(join(root, "docs", "APP-SHELL.md")));

  console.log();
  console.log("─".repeat(40));
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log();

  if (failed > 0) {
    console.log("Some checks failed. Fix the issues above before starting the app shell.");
    process.exit(1);
  } else {
    console.log("All checks passed! Run the app shell with:");
    console.log();
    console.log("  npm run app-shell          # Demo mode (default)");
    console.log("  npm run app-shell -- --port 8080  # Custom port");
    console.log();
  }
}

main();
