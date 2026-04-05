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
 *   POST /api/workflow/run          — run real workflow (JSON body)
 *   POST /api/workflow/validate     — validate inputs without running
 *
 * Usage:
 *   npx tsx src/app-shell/server.ts [--port 3000]
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

  // Require dataDir and hostFile
  if (typeof input.dataDir !== "string" || !input.dataDir.trim()) {
    return badRequest(res, "Missing required field: dataDir");
  }
  if (typeof input.hostFile !== "string" || !input.hostFile.trim()) {
    return badRequest(res, "Missing required field: hostFile");
  }

  const workflowInput: RealWorkflowInput = {
    dataDir: input.dataDir as string,
    hostFile: input.hostFile as string,
  };

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
// Server entrypoint
// ---------------------------------------------------------------------------

export function startServer(port: number): ReturnType<typeof createServer> {
  const server = createServer(handleRequest);
  server.listen(port, () => {
    console.log(`CodingAgent app shell running at http://localhost:${port}`);
  });
  return server;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  let port = 3000;

  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsed = parseInt(args[portIdx + 1], 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    }
  }

  startServer(port);
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
