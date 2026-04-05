/**
 * Phase 16: Live host detection integration tests.
 *
 * Covers:
 *   - POST /api/host/detect endpoint
 *   - POST /api/host/validate endpoint
 *   - Host-source semantics (demo, file, detected)
 *   - Workflow execution with inline hostProfile (detected mode)
 *   - Workflow execution with hostFile (file mode)
 *   - Host-source labeling in ScenarioViewModel
 *   - Detection failure rendering
 *   - No regression in demo mode
 *   - UI rendering of host-source indicators and detect button
 *   - Deterministic behavior when using saved host profiles
 */

import { describe, it, expect } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { handleRequest } from "../../src/app-shell/server.js";
import { renderShellHtml } from "../../src/app-shell/views.js";
import {
  executeRealWorkflow,
} from "../../src/app-shell/workflow-bridge.js";
import {
  mapScenario,
  loadDemoScenario,
  listDemoScenarios,
  type HostSource,
} from "../../src/app-shell/data-provider.js";
import { DEMO_SCENARIOS } from "../../src/app-shell/demo-scenarios.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "../..");
const DATA_DIR = join(REPO_ROOT, "data");

// ---------------------------------------------------------------------------
// Mock request/response helpers (consistent with server.test.ts)
// ---------------------------------------------------------------------------

function createMockReq(url: string, method = "GET", body?: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  req.method = method;
  req.headers = { host: "localhost:3000" };
  if (body != null) {
    // Simulate readable body
    req.push(Buffer.from(body, "utf-8"));
    req.push(null);
  }
  return req;
}

interface MockResponseData {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function createMockRes(): { res: ServerResponse; getData: () => Promise<MockResponseData> } {
  const socket = new Socket();
  const innerReq = new IncomingMessage(socket);
  const res = new ServerResponse(innerReq);
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
    getData: () =>
      new Promise<MockResponseData>((resolve) => {
        // Allow async handlers to complete
        const check = () => {
          if (body || statusCode !== 200) {
            resolve({ statusCode, headers, body });
          } else {
            setTimeout(check, 10);
          }
        };
        setTimeout(check, 20);
      }),
  };
}

// ---------------------------------------------------------------------------
// Host profile fixtures
// ---------------------------------------------------------------------------

function createValidHostProfile() {
  return {
    detectedAt: "2025-06-01T12:00:00Z",
    os: {
      platform: { value: "linux", confidence: "certain" as const },
      release: { value: "6.5.0", confidence: "certain" as const },
      arch: { value: "x64", confidence: "certain" as const },
    },
    cpu: {
      model: { value: "AMD Ryzen 7 5800X", confidence: "certain" as const },
      cores: { value: 8, confidence: "certain" as const },
      threads: { value: 16, confidence: "certain" as const },
    },
    memory: {
      totalGb: { value: 32, confidence: "certain" as const },
      availableGb: { value: 24, confidence: "certain" as const },
    },
    gpu: {
      present: { value: true, confidence: "certain" as const },
      model: { value: "NVIDIA GeForce RTX 3060", confidence: "certain" as const },
      vramGb: { value: 12, confidence: "certain" as const },
      cudaVersion: { value: null, confidence: "unknown" as const },
      rocmVersion: { value: null, confidence: "unknown" as const },
      driverVersion: { value: "535.0", confidence: "certain" as const },
    },
    installedRuntimes: [
      { runtimeId: "ollama", version: { value: "0.4.1", confidence: "certain" as const } },
    ],
    missingDependencies: [],
  };
}

function createTempHostFile() {
  const dir = join(tmpdir(), "codingagent-p16-" + Date.now());
  mkdirSync(dir, { recursive: true });
  const hostFile = join(dir, "host.json");
  writeFileSync(hostFile, JSON.stringify(createValidHostProfile(), null, 2));
  return hostFile;
}

// ---------------------------------------------------------------------------
// POST /api/host/detect — endpoint existence and response shape
// ---------------------------------------------------------------------------

describe("POST /api/host/detect", () => {
  it("returns a response with ok field", async () => {
    const req = createMockReq("/api/host/detect", "POST", "{}");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed).toHaveProperty("ok");
    // In CI, detection should still succeed (returns unknown for unsupported)
    if (parsed.ok) {
      expect(parsed).toHaveProperty("hostProfile");
      expect(parsed).toHaveProperty("summary");
      expect(parsed.source).toBe("detected");
      // Host profile should have the expected shape
      expect(parsed.hostProfile).toHaveProperty("detectedAt");
      expect(parsed.hostProfile).toHaveProperty("os");
      expect(parsed.hostProfile).toHaveProperty("cpu");
      expect(parsed.hostProfile).toHaveProperty("memory");
      // Summary should be a view-model
      expect(parsed.summary).toHaveProperty("summary");
      expect(parsed.summary).toHaveProperty("os");
      expect(parsed.summary).toHaveProperty("arch");
    }
  });

  it("returns a host profile with detectedAt timestamp", async () => {
    const req = createMockReq("/api/host/detect", "POST", "{}");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    const parsed = JSON.parse(data.body);
    if (parsed.ok) {
      expect(typeof parsed.hostProfile.detectedAt).toBe("string");
      // Should be a valid ISO date
      expect(new Date(parsed.hostProfile.detectedAt).toISOString()).toBeTruthy();
    }
  });

  it("returns source as 'detected'", async () => {
    const req = createMockReq("/api/host/detect", "POST", "{}");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    const parsed = JSON.parse(data.body);
    if (parsed.ok) {
      expect(parsed.source).toBe("detected");
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/host/validate — host profile validation
// ---------------------------------------------------------------------------

describe("POST /api/host/validate", () => {
  it("accepts a valid host profile object", async () => {
    const host = createValidHostProfile();
    const req = createMockReq("/api/host/validate", "POST", JSON.stringify(host));
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.valid).toBe(true);
    expect(parsed).toHaveProperty("hostProfile");
    expect(parsed).toHaveProperty("summary");
    expect(parsed.summary).toHaveProperty("summary");
  });

  it("rejects an invalid host profile object", async () => {
    const req = createMockReq(
      "/api/host/validate",
      "POST",
      JSON.stringify({ invalid: true }),
    );
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.valid).toBe(false);
    expect(parsed).toHaveProperty("error");
    expect(typeof parsed.error).toBe("string");
  });

  it("rejects an empty body", async () => {
    const req = createMockReq("/api/host/validate", "POST", "");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const req = createMockReq("/api/host/validate", "POST", "not-json{");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Host-source semantics in ScenarioViewModel
// ---------------------------------------------------------------------------

describe("HostSource semantics", () => {
  it("demo scenarios have hostSource 'demo'", () => {
    const scenarios = listDemoScenarios();
    for (const s of scenarios) {
      const vm = loadDemoScenario(s.id);
      expect(vm).not.toBeNull();
      expect(vm!.hostSource).toBe("demo");
    }
  });

  it("mapScenario always sets hostSource to 'demo'", () => {
    const firstKey = Object.keys(DEMO_SCENARIOS)[0] as keyof typeof DEMO_SCENARIOS;
    const vm = mapScenario(firstKey, DEMO_SCENARIOS[firstKey]);
    expect(vm.hostSource).toBe("demo");
  });

  it("executeRealWorkflow with hostFile sets hostSource to 'file'", () => {
    const hostFile = createTempHostFile();
    try {
      const result = executeRealWorkflow({
        dataDir: DATA_DIR,
        hostFile,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.viewModel.hostSource).toBe("file");
      }
    } finally {
      rmSync(resolve(hostFile, ".."), { recursive: true });
    }
  });

  it("executeRealWorkflow with hostProfile sets hostSource to 'detected'", () => {
    const host = createValidHostProfile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostProfile: host,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viewModel.hostSource).toBe("detected");
    }
  });

  it("HostSource type includes 'demo', 'file', 'detected'", () => {
    const validSources: HostSource[] = ["demo", "file", "detected"];
    expect(validSources.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Workflow with inline hostProfile (detected mode)
// ---------------------------------------------------------------------------

describe("executeRealWorkflow with inline hostProfile", () => {
  it("runs workflow with inline hostProfile instead of hostFile", () => {
    const host = createValidHostProfile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostProfile: host,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viewModel).toHaveProperty("host");
      expect(result.viewModel).toHaveProperty("workflow");
      expect(result.viewModel.host.summary).toContain("linux");
    }
  });

  it("validates inline hostProfile and rejects invalid data", () => {
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostProfile: { invalid: true } as unknown as Parameters<typeof executeRealWorkflow>[0]["hostProfile"],
    });
    expect(result.ok).toBe(false);
  });

  it("returns error when neither hostFile nor hostProfile provided", () => {
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("hostFile");
    }
  });

  it("hostProfile is preferred when both are provided", () => {
    // If hostProfile is provided, it takes precedence
    const host = createValidHostProfile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostProfile: host,
      hostFile: "/nonexistent/path.json",
    });
    // Should succeed because hostProfile is used (hostFile is ignored)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viewModel.hostSource).toBe("detected");
    }
  });

  it("supports stopAfter with inline hostProfile", () => {
    const host = createValidHostProfile();
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostProfile: host,
      stopAfter: "recommendation",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawResult.status).toBe("partial");
    }
  });
});

// ---------------------------------------------------------------------------
// Workflow with hostFile (file mode) — no regression
// ---------------------------------------------------------------------------

describe("executeRealWorkflow with hostFile — no regression", () => {
  it("continues to work with hostFile path", () => {
    const hostFile = createTempHostFile();
    try {
      const result = executeRealWorkflow({ dataDir: DATA_DIR, hostFile });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.viewModel.hostSource).toBe("file");
        expect(result.viewModel.host.summary).toContain("linux");
      }
    } finally {
      rmSync(resolve(hostFile, ".."), { recursive: true });
    }
  });

  it("returns error for invalid hostFile", () => {
    const result = executeRealWorkflow({
      dataDir: DATA_DIR,
      hostFile: "/nonexistent/host.json",
    });
    expect(result.ok).toBe(false);
  });

  it("maintains deterministic output for same host file", () => {
    const hostFile = createTempHostFile();
    try {
      const r1 = executeRealWorkflow({ dataDir: DATA_DIR, hostFile });
      const r2 = executeRealWorkflow({ dataDir: DATA_DIR, hostFile });
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        // Same host file produces same workflow status
        expect(r1.rawResult.status).toBe(r2.rawResult.status);
        expect(r1.viewModel.host.summary).toBe(r2.viewModel.host.summary);
      }
    } finally {
      rmSync(resolve(hostFile, ".."), { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/workflow/run — accepts hostProfile
// ---------------------------------------------------------------------------

describe("POST /api/workflow/run with hostProfile", () => {
  it("accepts inline hostProfile instead of hostFile", async () => {
    const host = createValidHostProfile();
    const body = JSON.stringify({ dataDir: DATA_DIR, hostProfile: host });
    const req = createMockReq("/api/workflow/run", "POST", body);
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(200);
    const parsed = JSON.parse(data.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.viewModel).toHaveProperty("hostSource");
    expect(parsed.viewModel.hostSource).toBe("detected");
  });

  it("returns 400 when neither hostFile nor hostProfile provided", async () => {
    const body = JSON.stringify({ dataDir: DATA_DIR });
    const req = createMockReq("/api/workflow/run", "POST", body);
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(400);
    const parsed = JSON.parse(data.body);
    expect(parsed.error).toContain("hostFile");
  });

  it("still works with hostFile path", async () => {
    const hostFile = createTempHostFile();
    try {
      const body = JSON.stringify({ dataDir: DATA_DIR, hostFile });
      const req = createMockReq("/api/workflow/run", "POST", body);
      const { res, getData } = createMockRes();
      handleRequest(req, res);
      const data = await getData();
      expect(data.statusCode).toBe(200);
      const parsed = JSON.parse(data.body);
      expect(parsed.ok).toBe(true);
      expect(parsed.viewModel.hostSource).toBe("file");
    } finally {
      rmSync(resolve(hostFile, ".."), { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Demo mode — no regression
// ---------------------------------------------------------------------------

describe("Demo mode — no regression", () => {
  it("GET /api/scenarios still returns scenarios", async () => {
    const req = createMockReq("/api/scenarios");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.body).toBeTruthy();
    const parsed = JSON.parse(data.body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("demo scenarios all have hostSource 'demo'", () => {
    const scenarios = listDemoScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    for (const s of scenarios) {
      const vm = loadDemoScenario(s.id);
      expect(vm).not.toBeNull();
      expect(vm!.hostSource).toBe("demo");
    }
  });

  it("loadDemoScenario returns complete view-model with hostSource", () => {
    const vm = loadDemoScenario("midRangeGpu");
    expect(vm).not.toBeNull();
    expect(vm!.id).toBe("midRangeGpu");
    expect(vm!.hostSource).toBe("demo");
    expect(vm!.host).toHaveProperty("summary");
    expect(vm!.workflow).toHaveProperty("status");
  });
});

// ---------------------------------------------------------------------------
// Detection failure handling
// ---------------------------------------------------------------------------

describe("Detection failure handling", () => {
  it("POST /api/host/validate handles missing body gracefully", async () => {
    const req = createMockReq("/api/host/validate", "POST", "");
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    expect(data.statusCode).toBe(400);
  });

  it("POST /api/host/validate returns validation error for partial data", async () => {
    const partial = {
      detectedAt: "2025-01-01T00:00:00Z",
      os: { platform: { value: "linux", confidence: "certain" } },
      // Missing cpu, memory, etc.
    };
    const req = createMockReq("/api/host/validate", "POST", JSON.stringify(partial));
    const { res, getData } = createMockRes();
    handleRequest(req, res);
    const data = await getData();
    const parsed = JSON.parse(data.body);
    expect(parsed.valid).toBe(false);
    expect(typeof parsed.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// UI rendering — host detection controls and host-source indicators
// ---------------------------------------------------------------------------

describe("Shell HTML rendering — Phase 16 controls", () => {
  const html = renderShellHtml();

  it("contains Detect Host button", () => {
    expect(html).toContain('id="detect-host-btn"');
    expect(html).toContain("Detect Host");
  });

  it("contains host source indicator container", () => {
    expect(html).toContain('id="host-source-indicator"');
  });

  it("contains detect result container", () => {
    expect(html).toContain('id="detect-result"');
  });

  it("contains Host Detection fieldset", () => {
    expect(html).toContain("Host Detection");
  });

  it("contains host-source CSS classes", () => {
    expect(html).toContain("host-source-badge");
    expect(html).toContain("host-source-demo");
    expect(html).toContain("host-source-file");
    expect(html).toContain("host-source-detected");
  });

  it("contains detection result styling", () => {
    expect(html).toContain("dr-ok");
    expect(html).toContain("dr-err");
    expect(html).toContain("dr-loading");
  });

  it("updated mode hint mentions detect", () => {
    expect(html).toContain("detect your host live");
  });

  it("host file hint mentions Detect Host", () => {
    expect(html).toContain("Detect Host below");
  });

  it("still contains demo mode controls", () => {
    expect(html).toContain('id="demo-controls"');
    expect(html).toContain('id="scenario-select"');
  });

  it("still contains real mode form controls", () => {
    expect(html).toContain('id="real-controls"');
    expect(html).toContain('id="data-dir-input"');
    expect(html).toContain('id="host-file-input"');
    expect(html).toContain('id="run-workflow-btn"');
    expect(html).toContain('id="validate-btn"');
    expect(html).toContain('id="reset-form-btn"');
  });

  it("contains host-source label mapping in JS", () => {
    expect(html).toContain("HOST_SOURCE_LABELS");
    expect(html).toContain("host-source-demo");
    expect(html).toContain("host-source-file");
    expect(html).toContain("host-source-detected");
  });

  it("detect button triggers /api/host/detect", () => {
    expect(html).toContain("/api/host/detect");
  });

  it("run workflow can send hostProfile", () => {
    expect(html).toContain("body.hostProfile");
  });

  it("renders host source badge in host summary", () => {
    expect(html).toContain("hostSourceBadge");
    expect(html).toContain("data.hostSource");
  });

  it("JS handles _detectedHostProfile state variable", () => {
    expect(html).toContain("_detectedHostProfile");
    expect(html).toContain("_currentHostSource");
  });

  it("reset clears detection state", () => {
    // The reset handler clears _detectedHostProfile and host source indicator
    expect(html).toContain("_detectedHostProfile = null");
    expect(html).toContain("_currentHostSource = null");
  });
});

// ---------------------------------------------------------------------------
// Host source badge display in renderHost
// ---------------------------------------------------------------------------

describe("Host source badge in rendered output", () => {
  it("renderHost function accepts source parameter", () => {
    const html = renderShellHtml();
    // The renderHost function signature accepts source
    expect(html).toContain("function renderHost(h, source)");
  });

  it("renderScenario passes hostSource to renderHost", () => {
    const html = renderShellHtml();
    expect(html).toContain("renderHost(data.host, data.hostSource)");
  });
});

// ---------------------------------------------------------------------------
// Deterministic workflows with saved profiles
// ---------------------------------------------------------------------------

describe("Deterministic workflows with saved host profiles", () => {
  it("same inline hostProfile gives identical output", () => {
    const host = createValidHostProfile();
    const r1 = executeRealWorkflow({ dataDir: DATA_DIR, hostProfile: host });
    const r2 = executeRealWorkflow({ dataDir: DATA_DIR, hostProfile: host });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.rawResult.status).toBe(r2.rawResult.status);
      expect(r1.viewModel.host.summary).toBe(r2.viewModel.host.summary);
      expect(r1.viewModel.hostSource).toBe(r2.viewModel.hostSource);
    }
  });

  it("hostFile and equivalent inline profile produce same workflow status", () => {
    const hostFile = createTempHostFile();
    const hostProfile = createValidHostProfile();
    try {
      const r1 = executeRealWorkflow({ dataDir: DATA_DIR, hostFile });
      const r2 = executeRealWorkflow({ dataDir: DATA_DIR, hostProfile: hostProfile });
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.rawResult.status).toBe(r2.rawResult.status);
        expect(r1.viewModel.host.summary).toBe(r2.viewModel.host.summary);
      }
    } finally {
      rmSync(resolve(hostFile, ".."), { recursive: true });
    }
  });
});
