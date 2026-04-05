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
