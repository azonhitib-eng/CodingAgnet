/**
 * Minimal local HTTP server for the app shell.
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 *
 * Routes:
 *   GET /                          — HTML shell (single-page app)
 *   GET /api/scenarios             — list of available demo scenarios
 *   GET /api/scenarios/:id         — full view-model data for a scenario
 *   GET /api/scenarios/:id/host    — host summary only
 *   GET /api/scenarios/:id/workflow — workflow summary only
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

  // HTML shell
  if (path === "/" || path === "/index.html") {
    return html(res, renderShellHtml());
  }

  // API: list scenarios
  if (path === "/api/scenarios") {
    return json(res, listDemoScenarios());
  }

  // API: single scenario (or sub-view)
  const scenarioMatch = path.match(/^\/api\/scenarios\/([^/]+)(?:\/([^/]+))?$/);
  if (scenarioMatch) {
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
