/**
 * Phase 17 — Desktop packaging decision and first packaging slice tests.
 *
 * Tests:
 *   - openBrowser URL validation (security)
 *   - openBrowser platform dispatch
 *   - startServer accepts options parameter
 *   - --open flag recognition
 *   - attachGracefulShutdown export
 *   - desktop launcher preflight
 *   - new npm scripts present
 *   - packaging decision document
 *   - no regression: demo mode routes
 *   - no regression: real mode routes
 *   - app-shell index exports Phase 17 utilities
 *   - --help output includes --open flag
 *   - server startup banner content
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? ".", "../..");

function fileExists(rel: string): boolean {
  const p = join(ROOT, rel);
  return existsSync(p) && statSync(p).isFile();
}

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf-8")) as Record<string, unknown>;
}

function readText(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

function fakeRequest(method: string, url: string): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };
  return req;
}

function fakeResponse(): ServerResponse & { _body: string; _status: number } {
  const res = new ServerResponse(fakeRequest("GET", "/")) as ServerResponse & {
    _body: string;
    _status: number;
  };
  res._body = "";
  res._status = 200;

  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode: number, ...args: unknown[]): ServerResponse {
    res._status = statusCode;
    return origWriteHead(statusCode, ...(args as [Record<string, string>]));
  } as typeof res.writeHead;

  const origEnd = res.end.bind(res);
  res.end = function (chunk?: unknown, ...args: unknown[]): ServerResponse {
    if (typeof chunk === "string") {
      res._body = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      res._body = chunk.toString("utf-8");
    }
    return origEnd(chunk, ...(args as [BufferEncoding, () => void]));
  } as typeof res.end;

  return res;
}

// ---------------------------------------------------------------------------
// openBrowser — URL validation (security)
// ---------------------------------------------------------------------------

describe("openBrowser — URL validation", () => {
  let openBrowser: (url: string) => boolean;

  it("should be importable from app-shell server", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(typeof openBrowser).toBe("function");
  });

  it("returns true for http URLs", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(openBrowser("http://localhost:3000")).toBe(true);
  });

  it("returns true for https URLs", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(openBrowser("https://example.com")).toBe(true);
  });

  it("returns false for non-http protocols", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(openBrowser("file:///etc/passwd")).toBe(false);
    expect(openBrowser("ftp://example.com")).toBe(false);
    expect(openBrowser("javascript:alert(1)")).toBe(false);
  });

  it("returns false for invalid URLs", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(openBrowser("not-a-url")).toBe(false);
    expect(openBrowser("")).toBe(false);
  });

  it("returns false for data: protocol", async () => {
    const mod = await import("../../src/app-shell/server.js");
    openBrowser = mod.openBrowser;
    expect(openBrowser("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startServer — options parameter
// ---------------------------------------------------------------------------

describe("startServer — options", () => {
  it("accepts an options parameter", async () => {
    const mod = await import("../../src/app-shell/server.js");
    // startServer should accept (port, options?) signature
    expect(mod.startServer.length).toBeGreaterThanOrEqual(1);
    expect(mod.startServer.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// attachGracefulShutdown — export check
// ---------------------------------------------------------------------------

describe("attachGracefulShutdown", () => {
  it("is exported from server module", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.attachGracefulShutdown).toBe("function");
  });

  it("is exported from app-shell index", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.attachGracefulShutdown).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// app-shell index — Phase 17 exports
// ---------------------------------------------------------------------------

describe("app-shell index — Phase 17 exports", () => {
  it("exports openBrowser", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.openBrowser).toBe("function");
  });

  it("exports attachGracefulShutdown", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.attachGracefulShutdown).toBe("function");
  });

  it("still exports handleRequest", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.handleRequest).toBe("function");
  });

  it("still exports startServer", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.startServer).toBe("function");
  });

  it("still exports resolvePort", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.resolvePort).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Desktop launcher script existence
// ---------------------------------------------------------------------------

describe("desktop launcher script", () => {
  it("scripts/desktop-launch.ts exists", () => {
    expect(fileExists("scripts/desktop-launch.ts")).toBe(true);
  });

  it("desktop launcher imports from app-shell server", () => {
    const content = readText("scripts/desktop-launch.ts");
    expect(content).toContain("startServer");
    expect(content).toContain("resolvePort");
    expect(content).toContain("openBrowser");
    expect(content).toContain("attachGracefulShutdown");
  });

  it("desktop launcher has preflight logic", () => {
    const content = readText("scripts/desktop-launch.ts");
    expect(content).toContain("runPreflight");
    expect(content).toContain("node_modules");
  });

  it("desktop launcher supports --help", () => {
    const content = readText("scripts/desktop-launch.ts");
    expect(content).toContain("--help");
    expect(content).toContain("-h");
  });

  it("desktop launcher starts server with open: true", () => {
    const content = readText("scripts/desktop-launch.ts");
    expect(content).toContain("open: true");
  });
});

// ---------------------------------------------------------------------------
// package.json — new scripts
// ---------------------------------------------------------------------------

describe("package.json — Phase 17 scripts", () => {
  const pkg = readJson("package.json");
  const scripts = pkg.scripts as Record<string, string>;

  it("has app-shell:desktop script", () => {
    expect(scripts["app-shell:desktop"]).toBeDefined();
    expect(scripts["app-shell:desktop"]).toContain("desktop-launch");
  });

  it("has app-shell:open script", () => {
    expect(scripts["app-shell:open"]).toBeDefined();
    expect(scripts["app-shell:open"]).toContain("--open");
  });

  it("still has app-shell script", () => {
    expect(scripts["app-shell"]).toBeDefined();
    expect(scripts["app-shell"]).toContain("server.ts");
  });

  it("still has app-shell:demo script", () => {
    expect(scripts["app-shell:demo"]).toBeDefined();
  });

  it("still has app-shell:help script", () => {
    expect(scripts["app-shell:help"]).toBeDefined();
  });

  it("still has preflight script", () => {
    expect(scripts["preflight"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Packaging decision document
// ---------------------------------------------------------------------------

describe("docs/PACKAGING.md", () => {
  it("exists", () => {
    expect(fileExists("docs/PACKAGING.md")).toBe(true);
  });

  const content = readText("docs/PACKAGING.md");

  it("states the chosen packaging path", () => {
    expect(content.toLowerCase()).toContain("enhanced local web shell");
  });

  it("mentions Electron as deferred alternative", () => {
    expect(content).toContain("Electron");
    expect(content.toLowerCase()).toContain("deferred");
  });

  it("mentions Tauri as deferred alternative", () => {
    expect(content).toContain("Tauri");
    expect(content.toLowerCase()).toContain("deferred");
  });

  it("describes why the choice fits the architecture", () => {
    expect(content.toLowerCase()).toContain("wrapper only");
    expect(content.toLowerCase()).toContain("local-first");
  });

  it("lists what Phase 17 adds", () => {
    expect(content).toContain("--open");
    expect(content).toContain("Graceful shutdown");
    expect(content).toContain("Desktop launcher");
  });

  it("lists what is still missing", () => {
    expect(content.toLowerCase()).toContain("still missing");
    expect(content.toLowerCase()).toContain("auto-update");
  });

  it("documents CodeQL alert status", () => {
    expect(content.toLowerCase()).toContain("codeql");
    expect(content.toLowerCase()).toContain("not enabled");
  });

  it("documents openBrowser security", () => {
    expect(content.toLowerCase()).toContain("protocol");
    expect(content.toLowerCase()).toContain("command injection");
  });
});

// ---------------------------------------------------------------------------
// No regression: demo mode routes
// ---------------------------------------------------------------------------

describe("no regression — demo mode routes", () => {
  let handleRequest: (req: IncomingMessage, res: ServerResponse) => void;

  it("imports handleRequest", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    expect(typeof handleRequest).toBe("function");
  });

  it("GET / returns HTML shell", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("GET", "/");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toContain("<!DOCTYPE html>");
    expect(res._body).toContain("CodingAgent");
  });

  it("GET /api/scenarios returns scenario list", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("GET", "/api/scenarios");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/scenarios/:id returns scenario data", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("GET", "/api/scenarios/midRangeGpu");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(data.id).toBe("midRangeGpu");
    expect(data.host).toBeDefined();
    expect(data.workflow).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// No regression: real mode route handling
// ---------------------------------------------------------------------------

describe("no regression — real mode routes", () => {
  let handleRequest: (req: IncomingMessage, res: ServerResponse) => void;

  it("GET /api/stages returns stage names", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("GET", "/api/stages");
    const res = fakeResponse();
    handleRequest(req, res);
    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toContain("catalog_loading");
    expect(data).toContain("rendering");
  });

  it("POST /api/workflow/run rejects missing body", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("POST", "/api/workflow/run");

    // Simulate empty body
    const res = fakeResponse();
    handleRequest(req, res);

    // Emit end to trigger body parsing
    req.emit("end");
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(400);
  });

  it("POST /api/workflow/validate accepts validation request", async () => {
    const mod = await import("../../src/app-shell/server.js");
    handleRequest = mod.handleRequest;
    const req = fakeRequest("POST", "/api/workflow/validate");

    const body = JSON.stringify({ dataDir: "/nonexistent/path" });
    const res = fakeResponse();
    handleRequest(req, res);

    // Simulate body
    req.emit("data", Buffer.from(body));
    req.emit("end");
    await new Promise((r) => setTimeout(r, 50));

    expect(res._status).toBe(200);
    const data = JSON.parse(res._body);
    expect(data.validations).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// --help output includes new flags
// ---------------------------------------------------------------------------

describe("--help output content", () => {
  it("server.ts help text includes --open flag", () => {
    const content = readText("src/app-shell/server.ts");
    expect(content).toContain("--open");
    expect(content).toContain("Automatically open");
  });

  it("server.ts help text mentions app-shell:desktop", () => {
    const content = readText("src/app-shell/server.ts");
    expect(content).toContain("app-shell:desktop");
  });
});

// ---------------------------------------------------------------------------
// Server startup banner content
// ---------------------------------------------------------------------------

describe("server startup banner", () => {
  it("startup code includes URL display", () => {
    const content = readText("src/app-shell/server.ts");
    expect(content).toContain("http://localhost:");
    expect(content).toContain("CodingAgent App Shell");
  });

  it("startup code includes browser-open logic when open option is true", () => {
    const content = readText("src/app-shell/server.ts");
    expect(content).toContain("options?.open");
    expect(content).toContain("Opening browser");
  });

  it("startup code includes graceful shutdown messaging", () => {
    const content = readText("src/app-shell/server.ts");
    expect(content).toContain("Shutting down");
    expect(content).toContain("Goodbye");
  });
});

// ---------------------------------------------------------------------------
// Desktop launcher preflight function
// ---------------------------------------------------------------------------

describe("desktop launcher — runPreflight", () => {
  it("is exported from desktop-launch script", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    expect(typeof mod.runPreflight).toBe("function");
  });

  it("returns { ok, checks } object", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("checks Node.js version", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    const nodeCheck = result.checks.find((c: { label: string }) => c.label.includes("Node.js"));
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.passed).toBe(true);
  });

  it("checks dependencies", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    const depCheck = result.checks.find((c: { label: string }) => c.label.includes("Dependencies"));
    expect(depCheck).toBeDefined();
    expect(depCheck!.passed).toBe(true);
  });

  it("checks source files", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    const srcCheck = result.checks.find((c: { label: string }) => c.label.includes("source"));
    expect(srcCheck).toBeDefined();
    expect(srcCheck!.passed).toBe(true);
  });

  it("checks data directory", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    const dataCheck = result.checks.find((c: { label: string }) => c.label.includes("Data"));
    expect(dataCheck).toBeDefined();
    expect(dataCheck!.passed).toBe(true);
  });

  it("all checks pass in this environment", async () => {
    const mod = await import("../../scripts/desktop-launch.js");
    const result = mod.runPreflight();
    expect(result.ok).toBe(true);
  });
});
