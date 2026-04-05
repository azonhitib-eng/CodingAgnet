/**
 * App shell server tests.
 *
 * Tests the HTTP request handler for the app shell, including
 * HTML serving, JSON API endpoints, and error handling.
 *
 * Uses Node.js built-in IncomingMessage/ServerResponse mocks.
 */

import { describe, it, expect } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { handleRequest } from "../../src/app-shell/server.js";
import { DEMO_SCENARIO_NAMES } from "../../src/app-shell/demo-scenarios.js";

// ---------------------------------------------------------------------------
// Minimal request/response mock helpers
// ---------------------------------------------------------------------------

function createMockReq(url: string, method = "GET"): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  req.method = method;
  req.headers = { host: "localhost:3000" };
  return req;
}

interface MockResponseData {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function createMockRes(): { res: ServerResponse; getData: () => MockResponseData } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (
    code: number,
    hdrs?: Record<string, string | number>,
  ): ServerResponse {
    statusCode = code;
    if (hdrs) {
      for (const [k, v] of Object.entries(hdrs)) {
        headers[k.toLowerCase()] = String(v);
      }
    }
    return origWriteHead(code, hdrs);
  } as typeof res.writeHead;

  const origEnd = res.end.bind(res);
  res.end = function (data?: string | Buffer): ServerResponse {
    if (data) body = data.toString();
    return origEnd(data);
  } as typeof res.end;

  return {
    res,
    getData: () => ({ statusCode, headers, body }),
  };
}

// ---------------------------------------------------------------------------
// HTML shell
// ---------------------------------------------------------------------------

describe("GET /", () => {
  it("returns HTML content", () => {
    const req = createMockReq("/");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    expect(data.headers["content-type"]).toContain("text/html");
    expect(data.body).toContain("<!DOCTYPE html>");
    expect(data.body).toContain("CodingAgent");
  });

  it("returns HTML for /index.html too", () => {
    const req = createMockReq("/index.html");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    expect(data.body).toContain("<!DOCTYPE html>");
  });
});

// ---------------------------------------------------------------------------
// API: list scenarios
// ---------------------------------------------------------------------------

describe("GET /api/scenarios", () => {
  it("returns JSON array of scenario descriptors", () => {
    const req = createMockReq("/api/scenarios");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    expect(data.headers["content-type"]).toContain("application/json");
    const parsed = JSON.parse(data.body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(DEMO_SCENARIO_NAMES.length);
    expect(parsed[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), label: expect.any(String) }),
    );
  });
});

// ---------------------------------------------------------------------------
// API: single scenario
// ---------------------------------------------------------------------------

describe("GET /api/scenarios/:id", () => {
  it("returns full scenario view-model for midRangeGpu", () => {
    const req = createMockReq("/api/scenarios/midRangeGpu");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.id).toBe("midRangeGpu");
    expect(parsed.host).toBeDefined();
    expect(parsed.host.summary).toContain("linux");
    expect(parsed.workflow).toBeDefined();
    expect(parsed.recommendation).toBeDefined();
  });

  it("returns 404 for unknown scenario", () => {
    const req = createMockReq("/api/scenarios/nonexistent");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(404);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// API: sub-views
// ---------------------------------------------------------------------------

describe("GET /api/scenarios/:id/:view", () => {
  it("returns host sub-view", () => {
    const req = createMockReq("/api/scenarios/highEndGpu/host");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.summary).toContain("linux");
    expect(parsed.gpuPresent).toBe(true);
  });

  it("returns workflow sub-view", () => {
    const req = createMockReq("/api/scenarios/unsupported/workflow");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.status).toBe("failed");
    expect(parsed.error).toContain("No compatible");
  });

  it("returns compatibility sub-view", () => {
    const req = createMockReq("/api/scenarios/lowEndCpuOnly/compatibility");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.status).toBe("cpu_only_slow");
  });

  it("returns plan sub-view", () => {
    const req = createMockReq("/api/scenarios/midRangeGpu/plan");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.artifactId).toBeDefined();
    expect(parsed.steps).toBeDefined();
  });

  it("returns recommendation sub-view", () => {
    const req = createMockReq("/api/scenarios/midRangeGpu/recommendation");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.artifactId).toBeDefined();
    expect(parsed.score).toBeDefined();
  });

  it("returns 404 for unknown sub-view", () => {
    const req = createMockReq("/api/scenarios/midRangeGpu/banana");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(404);
  });

  it("returns 404 for unknown scenario with valid sub-view", () => {
    const req = createMockReq("/api/scenarios/nonexistent/host");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

describe("unknown routes", () => {
  it("returns 404 for random paths", () => {
    const req = createMockReq("/foo/bar");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/stages
// ---------------------------------------------------------------------------

describe("GET /api/stages", () => {
  it("returns JSON array of stage names", () => {
    const req = createMockReq("/api/stages");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = getData();
    expect(data.statusCode).toBe(200);
    expect(data.headers["content-type"]).toContain("application/json");
    const parsed = JSON.parse(data.body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toContain("catalog_loading");
    expect(parsed).toContain("rendering");
    expect(parsed.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/workflow/run
// ---------------------------------------------------------------------------

// Helper to create a POST request with a body
function createPostReq(url: string, body: unknown): IncomingMessage {
  const req = createMockReq(url, "POST");
  // We need to simulate the body being readable
  const bodyStr = JSON.stringify(body);
  req.headers["content-type"] = "application/json";
  // Push body data onto the readable stream
  process.nextTick(() => {
    req.push(bodyStr);
    req.push(null);
  });
  return req;
}

function createPostReqRaw(url: string, rawBody: string): IncomingMessage {
  const req = createMockReq(url, "POST");
  req.headers["content-type"] = "application/json";
  process.nextTick(() => {
    req.push(rawBody);
    req.push(null);
  });
  return req;
}

async function waitForResponse(getData: () => MockResponseData): Promise<MockResponseData> {
  // Poll until body is populated
  for (let i = 0; i < 50; i++) {
    const data = getData();
    if (data.body) return data;
    await new Promise((r) => setTimeout(r, 50));
  }
  return getData();
}

describe("POST /api/workflow/run", () => {
  it("returns 400 for empty body", async () => {
    const req = createPostReqRaw("/api/workflow/run", "");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(400);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toBeTruthy();
  });

  it("returns 400 for missing dataDir", async () => {
    const req = createPostReq("/api/workflow/run", { hostFile: "/some/path" });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(400);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toContain("dataDir");
  });

  it("returns 400 for missing hostFile", async () => {
    const req = createPostReq("/api/workflow/run", { dataDir: "/some/path" });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(400);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toContain("hostFile");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createPostReqRaw("/api/workflow/run", "not json");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(400);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toContain("Invalid JSON");
  });

  it("returns ok:false for invalid data directory", async () => {
    const req = createPostReq("/api/workflow/run", {
      dataDir: "/nonexistent/data",
      hostFile: "/some/host.json",
    });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(parsed.error.code).toBeDefined();
  });

  it("returns ok:true with valid inputs and complete workflow", async () => {
    const { join } = await import("node:path");
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { resolve } = await import("node:path");
    const REPO_ROOT = resolve(__dirname, "../..");
    const DATA_DIR = join(REPO_ROOT, "data");

    // Create temp host file
    const dir = join(tmpdir(), "server-test-" + Date.now());
    mkdirSync(dir, { recursive: true });
    const hostFile = join(dir, "host.json");
    writeFileSync(hostFile, JSON.stringify({
      detectedAt: "2025-01-15T10:00:00Z",
      os: {
        platform: { value: "linux", confidence: "certain" },
        release: { value: "6.5.0", confidence: "certain" },
        arch: { value: "x64", confidence: "certain" },
      },
      cpu: {
        model: { value: "AMD Ryzen 7 5800X", confidence: "certain" },
        cores: { value: 8, confidence: "certain" },
        threads: { value: 16, confidence: "certain" },
      },
      memory: {
        totalGb: { value: 32, confidence: "certain" },
        availableGb: { value: 24, confidence: "certain" },
      },
      gpu: {
        present: { value: true, confidence: "certain" },
        model: { value: "NVIDIA GeForce RTX 3060", confidence: "certain" },
        vramGb: { value: 12, confidence: "certain" },
        cudaVersion: { value: null, confidence: "unknown" },
        rocmVersion: { value: null, confidence: "unknown" },
        driverVersion: { value: "535.0", confidence: "certain" },
      },
      installedRuntimes: [
        { runtimeId: "ollama", version: { value: "0.4.1", confidence: "certain" } },
      ],
      missingDependencies: [],
    }));

    const req = createPostReq("/api/workflow/run", {
      dataDir: DATA_DIR,
      hostFile,
    });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.viewModel).toBeDefined();
    expect(parsed.viewModel.host).toBeDefined();
    expect(parsed.viewModel.workflow).toBeDefined();
    expect(parsed.completedStages).toBeDefined();
    expect(Array.isArray(parsed.completedStages)).toBe(true);

    rmSync(dir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/workflow/validate
// ---------------------------------------------------------------------------

describe("POST /api/workflow/validate", () => {
  it("validates a valid data directory", async () => {
    const { resolve, join } = await import("node:path");
    const REPO_ROOT = resolve(__dirname, "../..");
    const DATA_DIR = join(REPO_ROOT, "data");

    const req = createPostReq("/api/workflow/validate", { dataDir: DATA_DIR });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.validations.dataDir.valid).toBe(true);
  });

  it("validates an invalid data directory", async () => {
    const req = createPostReq("/api/workflow/validate", { dataDir: "/nonexistent" });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.validations.dataDir.valid).toBe(false);
    expect(parsed.validations.dataDir.error).toBeTruthy();
  });

  it("validates a valid stop-after stage", async () => {
    const req = createPostReq("/api/workflow/validate", { stopAfter: "recommendation" });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.validations.stopAfter.valid).toBe(true);
  });

  it("validates an invalid stop-after stage", async () => {
    const req = createPostReq("/api/workflow/validate", { stopAfter: "bad_stage" });
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.validations.stopAfter.valid).toBe(false);
  });

  it("returns empty validations for empty body", async () => {
    const req = createPostReq("/api/workflow/validate", {});
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await waitForResponse(getData);
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.validations).toEqual({});
  });
});
