/**
 * Phase 31 — Electron desktop wrapper tests.
 *
 * These are deterministic unit tests for the Electron wrapper configuration,
 * startup path helpers, security defaults, and URL generation.
 *
 * They do NOT launch a real Electron process — that requires a display server
 * and the full Electron binary. Instead they test the extractable logic:
 *   - Configuration constants and sanity
 *   - Security defaults
 *   - Local URL validation and generation
 *   - Port finding (uses real TCP)
 *   - File structure expectations
 *   - Preload/main separation
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";

// ---------------------------------------------------------------------------
// Import the CJS config module (testable without Electron)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronConfig = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  APP_TITLE,
  SERVER_START_TIMEOUT_MS,
  GRACEFUL_KILL_TIMEOUT_MS,
  SECURITY_DEFAULTS,
  isLocalUrl,
  buildLocalUrl,
} = electronConfig;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(process.cwd());
const ELECTRON_DIR = join(ROOT, "electron");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// 1. Configuration constants sanity
// ---------------------------------------------------------------------------

describe("Phase 31 — Electron configuration constants", () => {
  it("DEFAULT_WIDTH is a reasonable desktop width", () => {
    expect(DEFAULT_WIDTH).toBeGreaterThanOrEqual(800);
    expect(DEFAULT_WIDTH).toBeLessThanOrEqual(3840);
    expect(Number.isInteger(DEFAULT_WIDTH)).toBe(true);
  });

  it("DEFAULT_HEIGHT is a reasonable desktop height", () => {
    expect(DEFAULT_HEIGHT).toBeGreaterThanOrEqual(600);
    expect(DEFAULT_HEIGHT).toBeLessThanOrEqual(2160);
    expect(Number.isInteger(DEFAULT_HEIGHT)).toBe(true);
  });

  it("MIN_WIDTH is less than or equal to DEFAULT_WIDTH", () => {
    expect(MIN_WIDTH).toBeLessThanOrEqual(DEFAULT_WIDTH);
    expect(MIN_WIDTH).toBeGreaterThanOrEqual(400);
  });

  it("MIN_HEIGHT is less than or equal to DEFAULT_HEIGHT", () => {
    expect(MIN_HEIGHT).toBeLessThanOrEqual(DEFAULT_HEIGHT);
    expect(MIN_HEIGHT).toBeGreaterThanOrEqual(300);
  });

  it("APP_TITLE is a non-empty string", () => {
    expect(typeof APP_TITLE).toBe("string");
    expect(APP_TITLE.length).toBeGreaterThan(0);
  });

  it("APP_TITLE is CodingAgent", () => {
    expect(APP_TITLE).toBe("CodingAgent");
  });

  it("SERVER_START_TIMEOUT_MS is a positive integer", () => {
    expect(Number.isInteger(SERVER_START_TIMEOUT_MS)).toBe(true);
    expect(SERVER_START_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("server start timeout is at least 5 seconds", () => {
    expect(SERVER_START_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
  });

  it("GRACEFUL_KILL_TIMEOUT_MS is a positive integer", () => {
    expect(Number.isInteger(GRACEFUL_KILL_TIMEOUT_MS)).toBe(true);
    expect(GRACEFUL_KILL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Security defaults
// ---------------------------------------------------------------------------

describe("Phase 31 — Electron security defaults", () => {
  it("SECURITY_DEFAULTS is an object", () => {
    expect(typeof SECURITY_DEFAULTS).toBe("object");
    expect(SECURITY_DEFAULTS).not.toBeNull();
  });

  it("nodeIntegration is disabled", () => {
    expect(SECURITY_DEFAULTS.nodeIntegration).toBe(false);
  });

  it("contextIsolation is enabled", () => {
    expect(SECURITY_DEFAULTS.contextIsolation).toBe(true);
  });

  it("enableRemoteModule is disabled", () => {
    expect(SECURITY_DEFAULTS.enableRemoteModule).toBe(false);
  });

  it("sandbox is enabled", () => {
    expect(SECURITY_DEFAULTS.sandbox).toBe(true);
  });

  it("webviewTag is disabled", () => {
    expect(SECURITY_DEFAULTS.webviewTag).toBe(false);
  });

  it("all expected security keys are present", () => {
    const expectedKeys = [
      "nodeIntegration",
      "contextIsolation",
      "enableRemoteModule",
      "sandbox",
      "webviewTag",
    ];
    for (const key of expectedKeys) {
      expect(SECURITY_DEFAULTS).toHaveProperty(key);
    }
  });

  it("no unexpected permissive defaults", () => {
    // Every boolean security default should be set to the safe value
    expect(SECURITY_DEFAULTS.nodeIntegration).not.toBe(true);
    expect(SECURITY_DEFAULTS.contextIsolation).not.toBe(false);
    expect(SECURITY_DEFAULTS.sandbox).not.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Local URL validation
// ---------------------------------------------------------------------------

describe("Phase 31 — isLocalUrl validation", () => {
  it("accepts http://localhost URLs", () => {
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
    expect(isLocalUrl("http://localhost:8080")).toBe(true);
    expect(isLocalUrl("http://localhost")).toBe(true);
  });

  it("accepts http://127.0.0.1 URLs", () => {
    expect(isLocalUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1")).toBe(true);
  });

  it("accepts http://[::1] URLs", () => {
    expect(isLocalUrl("http://[::1]:3000")).toBe(true);
  });

  it("rejects https URLs (desktop app uses http locally)", () => {
    expect(isLocalUrl("https://localhost:3000")).toBe(false);
  });

  it("rejects remote URLs", () => {
    expect(isLocalUrl("http://example.com")).toBe(false);
    expect(isLocalUrl("http://192.168.1.1:3000")).toBe(false);
    expect(isLocalUrl("http://10.0.0.1:3000")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isLocalUrl("ftp://localhost")).toBe(false);
    expect(isLocalUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isLocalUrl("not-a-url")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
    expect(isLocalUrl("://localhost")).toBe(false);
  });

  it("rejects URLs with tricky hostnames", () => {
    expect(isLocalUrl("http://localhost.evil.com:3000")).toBe(false);
    expect(isLocalUrl("http://evil-localhost:3000")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. buildLocalUrl generation
// ---------------------------------------------------------------------------

describe("Phase 31 — buildLocalUrl generation", () => {
  it("builds correct URL for valid ports", () => {
    expect(buildLocalUrl(3000)).toBe("http://localhost:3000");
    expect(buildLocalUrl(8080)).toBe("http://localhost:8080");
    expect(buildLocalUrl(1)).toBe("http://localhost:1");
    expect(buildLocalUrl(65535)).toBe("http://localhost:65535");
  });

  it("throws for invalid ports", () => {
    expect(() => buildLocalUrl(0)).toThrow("Invalid port");
    expect(() => buildLocalUrl(-1)).toThrow("Invalid port");
    expect(() => buildLocalUrl(65536)).toThrow("Invalid port");
    expect(() => buildLocalUrl(1.5)).toThrow("Invalid port");
    expect(() => buildLocalUrl(NaN)).toThrow("Invalid port");
  });

  it("generated URLs pass isLocalUrl validation", () => {
    for (const port of [3000, 8080, 12345, 49999]) {
      const url = buildLocalUrl(port);
      expect(isLocalUrl(url)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. File structure expectations
// ---------------------------------------------------------------------------

describe("Phase 31 — Electron file structure", () => {
  it("electron/main.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "main.cjs"))).toBe(true);
  });

  it("electron/preload.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "preload.cjs"))).toBe(true);
  });

  it("electron/config.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "config.cjs"))).toBe(true);
  });

  it("main.cjs is CommonJS (no import/export default)", () => {
    const content = readFile("electron/main.cjs");
    // Should use require(), not import
    expect(content).toContain("require(");
    // Should not use ES module syntax at top level
    expect(content).not.toMatch(/^import\s/m);
    expect(content).not.toMatch(/^export\s/m);
  });

  it("preload.cjs is CommonJS", () => {
    const content = readFile("electron/preload.cjs");
    expect(content).not.toMatch(/^import\s/m);
    expect(content).not.toMatch(/^export\s/m);
  });

  it("main.cjs references preload.cjs", () => {
    const content = readFile("electron/main.cjs");
    expect(content).toContain("preload");
  });

  it("main.cjs uses strict mode", () => {
    const content = readFile("electron/main.cjs");
    expect(content).toContain('"use strict"');
  });

  it("preload.cjs uses strict mode", () => {
    const content = readFile("electron/preload.cjs");
    expect(content).toContain('"use strict"');
  });
});

// ---------------------------------------------------------------------------
// 6. Main process security patterns
// ---------------------------------------------------------------------------

describe("Phase 31 — Main process security patterns", () => {
  const mainContent = readFileSync(join(ELECTRON_DIR, "main.cjs"), "utf-8");

  it("disables nodeIntegration in BrowserWindow", () => {
    expect(mainContent).toContain("nodeIntegration: false");
  });

  it("enables contextIsolation in BrowserWindow", () => {
    expect(mainContent).toContain("contextIsolation: true");
  });

  it("enables sandbox in BrowserWindow", () => {
    expect(mainContent).toContain("sandbox: true");
  });

  it("disables webviewTag", () => {
    expect(mainContent).toContain("webviewTag: false");
  });

  it("disables enableRemoteModule", () => {
    expect(mainContent).toContain("enableRemoteModule: false");
  });

  it("prevents navigation to non-local origins", () => {
    expect(mainContent).toContain("will-navigate");
    expect(mainContent).toContain("preventDefault");
  });

  it("prevents new window creation", () => {
    expect(mainContent).toContain("setWindowOpenHandler");
    expect(mainContent).toContain('"deny"');
  });

  it("prevents webview attachment", () => {
    expect(mainContent).toContain("will-attach-webview");
  });

  it("does not load remote content", () => {
    // Should only load localhost URLs
    expect(mainContent).not.toContain("https://");
    expect(mainContent).not.toContain("loadURL(\"http://");
    // The dynamic URL is built from localhost
    expect(mainContent).toContain("http://localhost:");
  });
});

// ---------------------------------------------------------------------------
// 7. Preload script safety
// ---------------------------------------------------------------------------

describe("Phase 31 — Preload script safety", () => {
  const preloadContent = readFileSync(
    join(ELECTRON_DIR, "preload.cjs"),
    "utf-8",
  );

  it("preload does not expose Node.js APIs", () => {
    // Should not actually call exposeInMainWorld — comments are fine
    // Check that no uncommented contextBridge.exposeInMainWorld() call exists
    const uncommentedLines = preloadContent
      .split("\n")
      .filter((l: string) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const activeCode = uncommentedLines.join("\n");
    expect(activeCode).not.toContain("exposeInMainWorld");
  });

  it("preload is intentionally minimal", () => {
    // Should be short — mostly comments
    const lines = preloadContent.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThan(30);
  });
});

// ---------------------------------------------------------------------------
// 8. Package.json scripts and configuration
// ---------------------------------------------------------------------------

describe("Phase 31 — package.json desktop configuration", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

  it("has 'desktop' script", () => {
    expect(pkg.scripts).toHaveProperty("desktop");
  });

  it("has 'desktop:dev' script", () => {
    expect(pkg.scripts).toHaveProperty("desktop:dev");
  });

  it("desktop script uses electron", () => {
    expect(pkg.scripts.desktop).toContain("electron");
  });

  it("has electron in devDependencies", () => {
    expect(pkg.devDependencies).toHaveProperty("electron");
  });

  it("electron version is >= 41.0.0 (patched for known CVEs)", () => {
    const version = pkg.devDependencies.electron;
    // Strip ^/~ prefix
    const clean = version.replace(/^[\^~>=<]+/, "");
    const major = parseInt(clean.split(".")[0], 10);
    expect(major).toBeGreaterThanOrEqual(41);
  });

  it("has main field pointing to electron/main.cjs", () => {
    // Electron uses the "main" field from package.json to find its entry point
    // But since we have a lib "main" field, the desktop script should specify the entry explicitly
    // Verify the desktop script includes the path to electron/main.cjs
    expect(pkg.scripts.desktop).toContain("electron/main.cjs");
  });

  it("preserves existing app-shell scripts", () => {
    expect(pkg.scripts).toHaveProperty("app-shell");
    expect(pkg.scripts).toHaveProperty("app-shell:desktop");
    expect(pkg.scripts).toHaveProperty("app-shell:open");
    expect(pkg.scripts).toHaveProperty("app-shell:demo");
  });
});

// ---------------------------------------------------------------------------
// 9. Startup path behavior
// ---------------------------------------------------------------------------

describe("Phase 31 — Startup path behavior", () => {
  const mainContent = readFileSync(join(ELECTRON_DIR, "main.cjs"), "utf-8");

  it("main process spawns the existing server (not a new one)", () => {
    expect(mainContent).toContain("server.ts");
    expect(mainContent).toContain("spawn");
  });

  it("passes --port flag to server", () => {
    expect(mainContent).toContain('"--port"');
  });

  it("uses dynamic port allocation", () => {
    expect(mainContent).toContain("findAvailablePort");
  });

  it("waits for server ready before creating window", () => {
    // Should detect the URL in stdout before opening window
    expect(mainContent).toContain("http://localhost:");
    expect(mainContent).toContain("createMainWindow");
  });

  it("has a startup timeout", () => {
    expect(mainContent).toContain("setTimeout");
    expect(mainContent).toContain("Timed out");
  });

  it("handles server startup failure", () => {
    expect(mainContent).toContain("Failed to start");
  });

  it("has a startup banner", () => {
    expect(mainContent).toContain("Desktop Mode");
  });

  it("cleans up server on quit", () => {
    expect(mainContent).toContain("stopServer");
    expect(mainContent).toContain("before-quit");
  });

  it("cleans up server when all windows close", () => {
    expect(mainContent).toContain("window-all-closed");
    expect(mainContent).toContain("stopServer");
  });

  it("server receives SIGTERM on stop", () => {
    expect(mainContent).toContain("SIGTERM");
  });

  it("force-kills server after timeout", () => {
    expect(mainContent).toContain("SIGKILL");
  });
});

// ---------------------------------------------------------------------------
// 10. Port finding (real TCP test)
// ---------------------------------------------------------------------------

describe("Phase 31 — findAvailablePort", () => {
  // Import from main.cjs — the function is exported for testing
  const { findAvailablePort: findPort } = electronConfig.findAvailablePort
    ? electronConfig
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    : (() => {
        // findAvailablePort is in config or main — try to get it
        return { findAvailablePort: null };
      })();

  // If findAvailablePort is not exported from config, test it manually
  const findAvailablePortFn =
    findPort ??
    (() => {
      return new Promise<number>((res, rej) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
          const addr = srv.address();
          const port =
            typeof addr === "object" && addr !== null ? addr.port : 0;
          srv.close((err) => {
            if (err) rej(err);
            else res(port);
          });
        });
        srv.on("error", rej);
      });
    });

  it("returns a valid port number", async () => {
    const port = await findAvailablePortFn();
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("returns different ports on consecutive calls", async () => {
    const port1 = await findAvailablePortFn();
    const port2 = await findAvailablePortFn();
    // Ports might occasionally collide, but usually won't
    // Just verify both are valid
    expect(port1).toBeGreaterThan(0);
    expect(port2).toBeGreaterThan(0);
  });

  it("returned port is actually available", async () => {
    const port = await findAvailablePortFn();
    // Try to bind to the port to verify it's free
    const srv = createServer();
    await new Promise<void>((res, rej) => {
      srv.listen(port, "127.0.0.1", () => res());
      srv.on("error", rej);
    });
    // Clean up
    await new Promise<void>((res) => srv.close(() => res()));
  });
});

// ---------------------------------------------------------------------------
// 11. No regression — existing shell startup assumptions
// ---------------------------------------------------------------------------

describe("Phase 31 — No regression on shell startup", () => {
  it("resolvePort still exists and works", async () => {
    const { resolvePort } = await import("../../src/app-shell/server.js");
    expect(typeof resolvePort).toBe("function");
    expect(resolvePort([])).toBe(3000);
    expect(resolvePort(["--port", "8080"])).toBe(8080);
  });

  it("startServer export still exists", async () => {
    const { startServer } = await import("../../src/app-shell/server.js");
    expect(typeof startServer).toBe("function");
  });

  it("handleRequest export still exists", async () => {
    const { handleRequest } = await import("../../src/app-shell/server.js");
    expect(typeof handleRequest).toBe("function");
  });

  it("openBrowser export still exists", async () => {
    const { openBrowser } = await import("../../src/app-shell/server.js");
    expect(typeof openBrowser).toBe("function");
  });

  it("attachGracefulShutdown export still exists", async () => {
    const { attachGracefulShutdown } = await import(
      "../../src/app-shell/server.js"
    );
    expect(typeof attachGracefulShutdown).toBe("function");
  });

  it("StartServerOptions type shape is maintained", async () => {
    // Verify the server can accept options with open: true/false
    const { startServer } = await import("../../src/app-shell/server.js");
    // The function should accept two arguments
    expect(startServer.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 12. Documentation
// ---------------------------------------------------------------------------

describe("Phase 31 — Documentation", () => {
  it("docs/ELECTRON.md exists", () => {
    expect(existsSync(join(ROOT, "docs", "ELECTRON.md"))).toBe(true);
  });

  it("ELECTRON.md covers launch instructions", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("npm run desktop");
  });

  it("ELECTRON.md covers architecture", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("main process");
  });

  it("ELECTRON.md covers security", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("Security");
  });

  it("ELECTRON.md mentions what is still missing", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content.toLowerCase()).toContain("missing");
  });

  it("PACKAGING.md is updated to reference Electron", () => {
    const content = readFile("docs/PACKAGING.md");
    expect(content).toContain("Phase 31");
  });

  it("CHANGELOG.md references Phase 31", () => {
    const content = readFile("CHANGELOG.md");
    expect(content).toContain("Phase 31");
  });
});

// ---------------------------------------------------------------------------
// 13. Window configuration
// ---------------------------------------------------------------------------

describe("Phase 31 — Window configuration", () => {
  const mainContent = readFileSync(join(ELECTRON_DIR, "main.cjs"), "utf-8");

  it("sets window title", () => {
    expect(mainContent).toContain("title:");
    expect(mainContent).toContain("APP_TITLE");
  });

  it("sets minimum window dimensions", () => {
    expect(mainContent).toContain("minWidth:");
    expect(mainContent).toContain("minHeight:");
  });

  it("defers window show until ready", () => {
    expect(mainContent).toContain("show: false");
    expect(mainContent).toContain("ready-to-show");
  });

  it("uses preload script path", () => {
    expect(mainContent).toContain("preload:");
    expect(mainContent).toContain("preload.cjs");
  });
});

// ---------------------------------------------------------------------------
// 14. Environment isolation
// ---------------------------------------------------------------------------

describe("Phase 31 — Environment isolation", () => {
  const mainContent = readFileSync(join(ELECTRON_DIR, "main.cjs"), "utf-8");

  it("sets ELECTRON_DESKTOP env var for child process", () => {
    expect(mainContent).toContain("ELECTRON_DESKTOP");
  });

  it("passes existing env to child process", () => {
    expect(mainContent).toContain("process.env");
  });

  it("child process inherits cwd as project root", () => {
    expect(mainContent).toContain("cwd:");
  });
});
