/**
 * Phase 15 — Packaging and distribution readiness tests.
 *
 * Tests:
 *   - Startup path sanity (resolvePort, startServer export)
 *   - Package script expectations
 *   - Preflight script existence
 *   - App-shell run path expectations
 *   - Docs alignment
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? ".", "../..");

function fileExists(rel: string): boolean {
  const p = join(ROOT, rel);
  return existsSync(p) && statSync(p).isFile();
}

function dirExists(rel: string): boolean {
  const p = join(ROOT, rel);
  return existsSync(p) && statSync(p).isDirectory();
}

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf-8")) as Record<string, unknown>;
}

function readText(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

// ---------------------------------------------------------------------------
// resolvePort
// ---------------------------------------------------------------------------

describe("resolvePort", () => {
  // dynamic import to avoid side effects
  let resolvePort: (args: string[]) => number;

  it("should be importable from app-shell server", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    expect(typeof resolvePort).toBe("function");
  });

  it("returns 3000 as default port", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    // clear PORT env
    const original = process.env.PORT;
    delete process.env.PORT;
    expect(resolvePort([])).toBe(3000);
    if (original !== undefined) process.env.PORT = original;
  });

  it("returns --port flag value", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    expect(resolvePort(["--port", "8080"])).toBe(8080);
  });

  it("returns PORT env var when no flag", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    const original = process.env.PORT;
    process.env.PORT = "4000";
    expect(resolvePort([])).toBe(4000);
    if (original !== undefined) {
      process.env.PORT = original;
    } else {
      delete process.env.PORT;
    }
  });

  it("--port flag takes priority over PORT env var", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    const original = process.env.PORT;
    process.env.PORT = "4000";
    expect(resolvePort(["--port", "9090"])).toBe(9090);
    if (original !== undefined) {
      process.env.PORT = original;
    } else {
      delete process.env.PORT;
    }
  });

  it("ignores invalid --port values", async () => {
    const mod = await import("../../src/app-shell/server.js");
    resolvePort = mod.resolvePort;
    const original = process.env.PORT;
    delete process.env.PORT;
    expect(resolvePort(["--port", "not-a-number"])).toBe(3000);
    expect(resolvePort(["--port", "0"])).toBe(3000);
    expect(resolvePort(["--port", "99999"])).toBe(3000);
    if (original !== undefined) process.env.PORT = original;
  });
});

// ---------------------------------------------------------------------------
// Package.json scripts
// ---------------------------------------------------------------------------

describe("package.json scripts", () => {
  const pkg = readJson("package.json");
  const scripts = pkg.scripts as Record<string, string>;

  it("has app-shell script", () => {
    expect(scripts["app-shell"]).toBeDefined();
    expect(scripts["app-shell"]).toContain("server.ts");
  });

  it("has app-shell:demo script", () => {
    expect(scripts["app-shell:demo"]).toBeDefined();
  });

  it("has app-shell:help script", () => {
    expect(scripts["app-shell:help"]).toBeDefined();
    expect(scripts["app-shell:help"]).toContain("--help");
  });

  it("has generate-host-profile script", () => {
    expect(scripts["generate-host-profile"]).toBeDefined();
    expect(scripts["generate-host-profile"]).toContain("detect-host");
    expect(scripts["generate-host-profile"]).toContain("--json");
  });

  it("has preflight script", () => {
    expect(scripts["preflight"]).toBeDefined();
    expect(scripts["preflight"]).toContain("preflight");
  });

  it("has build script", () => {
    expect(scripts["build"]).toBeDefined();
  });

  it("has test script", () => {
    expect(scripts["test"]).toBeDefined();
  });

  it("has lint script", () => {
    expect(scripts["lint"]).toBeDefined();
  });

  it("has typecheck script", () => {
    expect(scripts["typecheck"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Source file existence
// ---------------------------------------------------------------------------

describe("app-shell source files exist", () => {
  const sourceFiles = [
    "src/app-shell/server.ts",
    "src/app-shell/views.ts",
    "src/app-shell/data-provider.ts",
    "src/app-shell/demo-scenarios.ts",
    "src/app-shell/workflow-bridge.ts",
    "src/app-shell/index.ts",
  ];

  for (const f of sourceFiles) {
    it(`${f} exists`, () => {
      expect(fileExists(f)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Data directory structure
// ---------------------------------------------------------------------------

describe("data directory structure", () => {
  it("data/ directory exists", () => {
    expect(dirExists("data")).toBe(true);
  });

  it("data/models/ directory exists", () => {
    expect(dirExists("data/models")).toBe(true);
  });

  it("data/runtimes/ directory exists", () => {
    expect(dirExists("data/runtimes")).toBe(true);
  });

  it("data/agent-tools/ directory exists", () => {
    expect(dirExists("data/agent-tools")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Documentation existence
// ---------------------------------------------------------------------------

describe("documentation files exist", () => {
  const docs = [
    "docs/QUICKSTART.md",
    "docs/APP-SHELL.md",
    "docs/USAGE.md",
    "README.md",
    "CHANGELOG.md",
  ];

  for (const f of docs) {
    it(`${f} exists`, () => {
      expect(fileExists(f)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// QUICKSTART.md content checks
// ---------------------------------------------------------------------------

describe("QUICKSTART.md content", () => {
  const content = readText("docs/QUICKSTART.md");

  it("mentions npm run app-shell", () => {
    expect(content).toContain("npm run app-shell");
  });

  it("mentions demo mode", () => {
    expect(content.toLowerCase()).toContain("demo mode");
  });

  it("mentions real mode", () => {
    expect(content.toLowerCase()).toContain("real mode");
  });

  it("mentions generate-host-profile", () => {
    expect(content).toContain("generate-host-profile");
  });

  it("mentions data directory", () => {
    expect(content.toLowerCase()).toContain("data directory");
  });

  it("mentions host profile file", () => {
    expect(content.toLowerCase()).toContain("host profile");
  });

  it("mentions informational only", () => {
    expect(content.toLowerCase()).toContain("informational only");
  });

  it("mentions preflight", () => {
    expect(content).toContain("preflight");
  });

  it("documents PORT env var", () => {
    expect(content).toContain("PORT=");
  });

  it("documents --port flag", () => {
    expect(content).toContain("--port");
  });

  it("mentions all workflow statuses", () => {
    expect(content).toContain("completed");
    expect(content).toContain("completed_requires_approval");
    expect(content).toContain("blocked");
    expect(content).toContain("failed");
    expect(content).toContain("partial");
  });
});

// ---------------------------------------------------------------------------
// Preflight script existence
// ---------------------------------------------------------------------------

describe("preflight script", () => {
  it("scripts/preflight.ts exists", () => {
    expect(fileExists("scripts/preflight.ts")).toBe(true);
  });

  it("preflight script references expected checks", () => {
    const content = readText("scripts/preflight.ts");
    expect(content).toContain("node_modules");
    expect(content).toContain("server.ts");
    expect(content).toContain("data");
    expect(content).toContain("QUICKSTART");
  });
});

// ---------------------------------------------------------------------------
// Server module exports
// ---------------------------------------------------------------------------

describe("server module exports", () => {
  it("exports handleRequest", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.handleRequest).toBe("function");
  });

  it("exports startServer", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.startServer).toBe("function");
  });

  it("exports resolvePort", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.resolvePort).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// App-shell public exports include resolvePort
// ---------------------------------------------------------------------------

describe("app-shell index exports", () => {
  it("re-exports resolvePort", async () => {
    const mod = await import("../../src/app-shell/index.js");
    expect(typeof mod.resolvePort).toBe("function");
  });
});
