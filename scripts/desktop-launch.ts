#!/usr/bin/env node
/**
 * Desktop launcher — single-command desktop-style startup for CodingAgent.
 *
 * Usage:
 *   npx tsx scripts/desktop-launch.ts [--port <number>]
 *   npm run app-shell:desktop
 *   npm run app-shell:desktop -- --port 8080
 *
 * This script:
 *   1. Runs a quick preflight check (Node version, dependencies, source files)
 *   2. Starts the app shell server
 *   3. Opens the default browser automatically
 *   4. Attaches graceful shutdown (Ctrl+C)
 *
 * The goal is a single command that gives a desktop-app-like experience:
 *   npm run app-shell:desktop
 *   → checks environment → starts server → opens browser → ready.
 */

import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { startServer, resolvePort, openBrowser, attachGracefulShutdown } from "../src/app-shell/server.js";

// ---------------------------------------------------------------------------
// Minimal preflight
// ---------------------------------------------------------------------------

interface PreflightResult {
  ok: boolean;
  checks: Array<{ label: string; passed: boolean; detail?: string }>;
}

export function runPreflight(): PreflightResult {
  const root = resolve(import.meta.dirname ?? ".", "..");
  const checks: PreflightResult["checks"] = [];

  function check(label: string, ok: boolean, detail?: string): void {
    checks.push({ label, passed: ok, detail });
  }

  // Node.js version
  const major = parseInt(process.versions.node.split(".")[0], 10);
  check(`Node.js >= 18 (v${process.versions.node})`, major >= 18);

  // Dependencies
  const nmDir = join(root, "node_modules");
  check("Dependencies installed", existsSync(nmDir) && statSync(nmDir).isDirectory(), "Run: npm install");

  // Source files
  const serverPath = join(root, "src", "app-shell", "server.ts");
  check("App shell source", existsSync(serverPath) && statSync(serverPath).isFile());

  // Data directory
  const dataDir = join(root, "data");
  check("Data directory", existsSync(dataDir) && statSync(dataDir).isDirectory());

  const ok = checks.every((c) => c.passed);
  return { ok, checks };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx scripts/desktop-launch.ts [options]
       npm run app-shell:desktop [-- options]

Options:
  --port <number>   Port to listen on (default: 3000, or PORT env var)
  --help, -h        Show this help message

This is the desktop-style launcher that:
  1. Runs a quick preflight check
  2. Starts the CodingAgent app shell server
  3. Opens your default browser automatically
  4. Handles Ctrl+C gracefully

For the basic server without auto-open, use: npm run app-shell
`);
    return;
  }

  // Step 1: Preflight
  console.log();
  console.log("  CodingAgent — Desktop Launch");
  console.log("  " + "─".repeat(40));
  console.log();
  console.log("  Running preflight checks…");
  console.log();

  const preflight = runPreflight();
  for (const c of preflight.checks) {
    const icon = c.passed ? "✅" : "❌";
    const detail = c.passed ? "" : c.detail ? ` — ${c.detail}` : "";
    console.log(`    ${icon}  ${c.label}${detail}`);
  }
  console.log();

  if (!preflight.ok) {
    console.log("  ❌  Preflight failed. Fix the issues above before launching.");
    console.log();
    process.exit(1);
  }

  console.log("  ✅  Preflight passed. Starting server…");
  console.log();

  // Step 2: Start server
  const port = resolvePort(args);
  const server = startServer(port, { open: true });

  // Step 3: Graceful shutdown
  attachGracefulShutdown(server);
}

main();
