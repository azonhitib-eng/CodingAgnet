/**
 * Minimal local HTTP server for the app shell.
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 *
 * Routes:
 *   GET  /                          — HTML shell (single-page app)
 *   GET  /api/scenarios             — list of available demo scenarios
 *   GET  /api/scenarios/:id         — full view-model data for a scenario
 *   GET  /api/scenarios/:id/host    — host summary only
 *   GET  /api/scenarios/:id/workflow — workflow summary only
 *   GET  /api/stages                — list valid workflow stage names
 *   POST /api/host/detect           — detect host profile live
 *   POST /api/host/validate         — validate a host profile object
 *   POST /api/workflow/run          — run real workflow (JSON body)
 *   POST /api/workflow/validate     — validate inputs without running
 *
 * Usage:
 *   npx tsx src/app-shell/server.ts [--port 3000]
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { URL } from "node:url";

import {
  listDemoScenarios,
  loadDemoScenario,
  type ScenarioViewModel,
} from "./data-provider.js";

import { renderShellHtml } from "./views.js";

import {
  executeRealWorkflow,
  validateDataDir,
  validateHostFile,
  validateStopAfter,
  getStageNames,
  type RealWorkflowInput,
} from "./workflow-bridge.js";

import { detectHost } from "../detection/host-detector.js";
import { validateHostProfile } from "../cli/host-loader.js";
import { toHostSummary } from "../frontend-contracts/index.js";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function notFound(res: ServerResponse, message = "Not found"): void {
  json(res, { error: message }, 404);
}

function badRequest(res: ServerResponse, message: string): void {
  json(res, { error: message }, 400);
}

/**
 * Read the full request body as a string (for POST requests).
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Parse JSON body from a POST request.
 * Returns null and sends a 400 response if parsing fails.
 */
async function parseJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
  try {
    const body = await readBody(req);
    if (!body.trim()) {
      badRequest(res, "Request body is empty");
      return null;
    }
    return JSON.parse(body);
  } catch {
    badRequest(res, "Invalid JSON in request body");
    return null;
  }
}

/**
 * Extract a sub-view from a scenario if a view suffix is provided.
 */
function extractSubView(
  scenario: ScenarioViewModel,
  view: string | undefined,
): unknown {
  switch (view) {
    case "host":
      return scenario.host;
    case "recommendation":
      return scenario.recommendation;
    case "compatibility":
      return scenario.compatibility;
    case "plan":
      return scenario.planReview;
    case "workflow":
      return scenario.workflow;
    default:
      return null;
  }
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();

  // HTML shell
  if (path === "/" || path === "/index.html") {
    return html(res, renderShellHtml());
  }

  // API: list scenarios
  if (path === "/api/scenarios" && method === "GET") {
    return json(res, listDemoScenarios());
  }

  // API: list valid stage names
  if (path === "/api/stages" && method === "GET") {
    return json(res, getStageNames());
  }

  // API: run real workflow (POST)
  if (path === "/api/workflow/run" && method === "POST") {
    handleWorkflowRun(req, res);
    return;
  }

  // API: validate inputs (POST)
  if (path === "/api/workflow/validate" && method === "POST") {
    handleWorkflowValidate(req, res);
    return;
  }

  // API: detect host live (POST)
  if (path === "/api/host/detect" && method === "POST") {
    handleHostDetect(req, res);
    return;
  }

  // API: validate host profile object (POST)
  if (path === "/api/host/validate" && method === "POST") {
    handleHostValidate(req, res);
    return;
  }

  // API: single scenario (or sub-view)
  const scenarioMatch = path.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/);
  if (scenarioMatch && method === "GET") {
    const id = decodeURIComponent(scenarioMatch[1]);
    const subView = scenarioMatch[2];
    const scenario = loadDemoScenario(id);
    if (!scenario) {
      return notFound(res, `Scenario "${id}" not found`);
    }
    if (subView) {
      const data = extractSubView(scenario, subView);
      if (data === null) {
        return notFound(res, `View "${subView}" not recognized`);
      }
      return json(res, data);
    }
    return json(res, scenario);
  }

  notFound(res);
}

// ---------------------------------------------------------------------------
// POST /api/workflow/run
// ---------------------------------------------------------------------------

async function handleWorkflowRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return; // response already sent

  const input = body as Record<string, unknown>;

  // Require dataDir
  if (typeof input.dataDir !== "string" || !input.dataDir.trim()) {
    return badRequest(res, "Missing required field: dataDir");
  }

  // Require either hostFile or hostProfile
  const hasHostFile = typeof input.hostFile === "string" && input.hostFile.trim() !== "";
  const hasHostProfile = input.hostProfile != null && typeof input.hostProfile === "object";
  if (!hasHostFile && !hasHostProfile) {
    return badRequest(res, "Missing required field: provide either hostFile or hostProfile");
  }

  const workflowInput: RealWorkflowInput = {
    dataDir: input.dataDir as string,
  };

  if (hasHostFile) {
    workflowInput.hostFile = input.hostFile as string;
  }
  if (hasHostProfile) {
    workflowInput.hostProfile = input.hostProfile as import("../types/host.js").HostProfile;
  }

  if (typeof input.artifactId === "string" && input.artifactId.trim()) {
    workflowInput.artifactId = input.artifactId;
  }
  if (typeof input.stopAfter === "string" && input.stopAfter.trim()) {
    workflowInput.stopAfter = input.stopAfter;
  }

  const result = executeRealWorkflow(workflowInput);
  if (result.ok) {
    return json(res, {
      ok: true,
      viewModel: result.viewModel,
      status: result.rawResult.status,
      completedStages: result.rawResult.completedStages.map((s) => s.stage),
    });
  } else {
    return json(res, {
      ok: false,
      error: result.error,
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/workflow/validate
// ---------------------------------------------------------------------------

async function handleWorkflowValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  const input = body as Record<string, unknown>;
  const results: Record<string, { valid: boolean; error?: string }> = {};

  if (typeof input.dataDir === "string") {
    results.dataDir = validateDataDir(input.dataDir);
  }
  if (typeof input.hostFile === "string") {
    results.hostFile = validateHostFile(input.hostFile);
  }
  if (typeof input.stopAfter === "string") {
    results.stopAfter = validateStopAfter(input.stopAfter);
  }

  return json(res, { validations: results });
}

// ---------------------------------------------------------------------------
// POST /api/host/detect
// ---------------------------------------------------------------------------

async function handleHostDetect(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const hostProfile = await detectHost();
    const summary = toHostSummary(hostProfile);
    return json(res, {
      ok: true,
      hostProfile,
      summary,
      source: "detected" as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, {
      ok: false,
      error: {
        code: "HOST_DETECTION_FAILED",
        message: `Host detection failed: ${message}`,
      },
    }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/host/validate
// ---------------------------------------------------------------------------

async function handleHostValidate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (body === null) return;

  try {
    const validated = validateHostProfile(body);
    const summary = toHostSummary(validated);
    return json(res, {
      valid: true,
      hostProfile: validated,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(res, {
      valid: false,
      error: message,
    });
  }
}

// ---------------------------------------------------------------------------
// Browser opener
// ---------------------------------------------------------------------------

/**
 * Open a URL in the default system browser.
 * Only allows http: and https: protocols to prevent command injection.
 * Uses execFile to avoid shell interpolation of URL characters.
 * Returns true if the command was spawned, false on validation failure.
 */
export function openBrowser(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const safeUrl = parsed.href;
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === "darwin") {
    cmd = "open";
    args = [safeUrl];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", safeUrl];
  } else {
    cmd = "xdg-open";
    args = [safeUrl];
  }
  execFile(cmd, args, (err) => {
    if (err) {
      // Silently ignore — user can still open the URL manually
    }
  });
  return true;
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Attach graceful shutdown handlers to the given server.
 * On SIGINT/SIGTERM, prints a message and closes the server cleanly.
 */
export function attachGracefulShutdown(server: ReturnType<typeof createServer>): void {
  const shutdown = (signal: string) => {
    console.log();
    console.log(`  Received ${signal}. Shutting down CodingAgent App Shell…`);
    server.close(() => {
      console.log("  Server stopped. Goodbye!");
      process.exit(0);
    });
    // Force exit after 3 seconds if connections linger
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ---------------------------------------------------------------------------
// Server entrypoint
// ---------------------------------------------------------------------------

export interface StartServerOptions {
  /** Automatically open the browser after the server starts. Default: false. */
  open?: boolean;
}

export function startServer(
  port: number,
  options?: StartServerOptions,
): ReturnType<typeof createServer> {
  const server = createServer(handleRequest);
  server.listen(port, () => {
    const localUrl = `http://localhost:${port}`;
    const line = "─".repeat(56);
    console.log();
    console.log(line);
    console.log("  CodingAgent App Shell");
    console.log(line);
    console.log();
    console.log(`  ➜  Local:   ${localUrl}`);
    console.log();
    console.log("  Modes:");
    console.log("    • Demo  — pre-built scenarios, no setup required");
    console.log("    • Real  — connect your own data-dir + host profile or detect live");
    console.log();
    console.log("  Quick tips:");
    console.log("    - Open the URL above in your browser");
    console.log("    - Demo mode is selected by default");
    console.log("    - For real mode, prepare a data directory and host profile");
    console.log("    - Or use the \"Detect Host\" button to detect your host live");
    console.log("    - See docs/QUICKSTART.md for detailed instructions");
    console.log();
    console.log("  Press Ctrl+C to stop the server");
    console.log(line);
    console.log();

    if (options?.open) {
      console.log("  Opening browser…");
      const opened = openBrowser(localUrl);
      if (!opened) {
        console.log("  ⚠  Could not open browser automatically. Please open the URL above manually.");
      }
      console.log();
    }
  });
  return server;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

/**
 * Resolve the port number from CLI args or environment.
 * Priority: --port flag > PORT env var > default 3000.
 */
export function resolvePort(args: string[]): number {
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsed = parseInt(args[portIdx + 1], 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  const envPort = process.env.PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return 3000;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx src/app-shell/server.ts [options]

Options:
  --port <number>   Port to listen on (default: 3000, or PORT env var)
  --open            Automatically open the default browser on startup
  --help, -h        Show this help message

Environment variables:
  PORT              Port to listen on (overridden by --port flag)

Examples:
  npm run app-shell                           # Start on port 3000
  npm run app-shell -- --port 8080            # Start on port 8080
  npm run app-shell -- --open                 # Start and open browser
  npm run app-shell:desktop                   # Desktop mode (preflight + open)
  PORT=4000 npm run app-shell                 # Start on port 4000

See docs/QUICKSTART.md for full setup instructions.
`);
    return;
  }

  const port = resolvePort(args);
  const shouldOpen = args.includes("--open");
  const server = startServer(port, { open: shouldOpen });
  attachGracefulShutdown(server);
}

// Run if this is the entry module
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/server.ts") ||
   process.argv[1].endsWith("/server.js") ||
   process.argv[1].includes("app-shell/server"));

if (isMain) {
  main();
}
