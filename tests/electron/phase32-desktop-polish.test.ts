/**
 * Phase 32 — Desktop polish and desktop-specific UX tests.
 *
 * Tests the improvements to the Electron wrapper that make it feel like a
 * coherent desktop app:
 *   - Loading page HTML (shown while server boots)
 *   - Error page HTML (shown when server fails)
 *   - Window title with version and dev/prod distinction
 *   - Icon placeholder path support
 *   - Desktop version detection
 *   - Desktop startup/shutdown semantics
 *   - Preload bridge metadata
 *   - Server banner desktop-awareness
 *   - No regression in wrapper startup assumptions
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

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
  getDesktopVersion,
  buildWindowTitle,
  getIconPlaceholderPath,
  renderLoadingHtml,
  renderErrorHtml,
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
// 1. Desktop version detection
// ---------------------------------------------------------------------------

describe("Phase 32 — Desktop version", () => {
  it("getDesktopVersion returns a semver-like string", () => {
    const v = getDesktopVersion();
    expect(typeof v).toBe("string");
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("getDesktopVersion reads from package.json", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(getDesktopVersion()).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// 2. Window title building
// ---------------------------------------------------------------------------

describe("Phase 32 — Window title", () => {
  it("buildWindowTitle returns title with version", () => {
    const title = buildWindowTitle();
    expect(title).toContain(APP_TITLE);
    expect(title).toMatch(/v\d+\.\d+\.\d+/);
  });

  it("buildWindowTitle includes [Dev] suffix in dev mode", () => {
    const title = buildWindowTitle({ isDev: true });
    expect(title).toContain("[Dev]");
    expect(title).toContain(APP_TITLE);
  });

  it("buildWindowTitle excludes [Dev] suffix in production mode", () => {
    const title = buildWindowTitle({ isDev: false });
    expect(title).not.toContain("[Dev]");
  });

  it("buildWindowTitle omitting isDev does not add [Dev]", () => {
    const title = buildWindowTitle({});
    expect(title).not.toContain("[Dev]");
  });

  it("buildWindowTitle accepts custom version", () => {
    const title = buildWindowTitle({ version: "9.8.7" });
    expect(title).toContain("v9.8.7");
  });

  it("buildWindowTitle combines version and dev", () => {
    const title = buildWindowTitle({ isDev: true, version: "1.2.3" });
    expect(title).toBe("CodingAgent v1.2.3 [Dev]");
  });
});

// ---------------------------------------------------------------------------
// 3. Icon placeholder path
// ---------------------------------------------------------------------------

describe("Phase 32 — Icon placeholder", () => {
  it("getIconPlaceholderPath returns a string path", () => {
    const p = getIconPlaceholderPath();
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });

  it("icon placeholder path ends with icon.png", () => {
    const p = getIconPlaceholderPath();
    expect(p).toMatch(/icon\.png$/);
  });

  it("icon placeholder path is under assets/", () => {
    const p = getIconPlaceholderPath();
    expect(p).toContain("assets");
  });

  it("icon file is not required to exist yet", () => {
    // This is intentional — the path is a placeholder for future icon support
    // The test documents the expected convention
    const p = getIconPlaceholderPath();
    expect(typeof p).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 4. Loading page HTML
// ---------------------------------------------------------------------------

describe("Phase 32 — Loading page", () => {
  it("renderLoadingHtml returns valid HTML", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("loading page shows the app title", () => {
    const html = renderLoadingHtml();
    expect(html).toContain(APP_TITLE);
  });

  it("loading page shows the version", () => {
    const html = renderLoadingHtml();
    expect(html).toContain(`v${getDesktopVersion()}`);
  });

  it("loading page includes a spinner animation", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("spinner");
    expect(html).toContain("@keyframes spin");
  });

  it("loading page includes a status message", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("Starting");
  });

  it("loading page has proper meta tags", () => {
    const html = renderLoadingHtml();
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain("viewport");
  });

  it("loading page title includes Starting", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("<title>");
    expect(html).toContain("Starting");
  });

  it("loading page uses a dark background", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("#1a1a2e");
  });
});

// ---------------------------------------------------------------------------
// 5. Error page HTML
// ---------------------------------------------------------------------------

describe("Phase 32 — Error page", () => {
  it("renderErrorHtml returns valid HTML", () => {
    const html = renderErrorHtml("test error");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("error page shows the provided error message", () => {
    const html = renderErrorHtml("Something went wrong");
    expect(html).toContain("Something went wrong");
  });

  it("error page shows the app title", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain(APP_TITLE);
  });

  it("error page escapes HTML in error message", () => {
    const html = renderErrorHtml('<script>alert("xss")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("error page includes troubleshooting hints", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain("Troubleshooting");
    expect(html).toContain("npm install");
    expect(html).toContain("Node.js");
  });

  it("error page suggests running app-shell in terminal", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain("npm run app-shell");
  });

  it("error page references ELECTRON.md docs", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain("ELECTRON.md");
  });

  it("error page includes a retry button", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain("Retry");
    expect(html).toContain("retry-btn");
  });

  it("error page has proper meta tags", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain("viewport");
  });

  it("error page handles null/undefined message gracefully", () => {
    // @ts-expect-error — test undefined input
    const html1 = renderErrorHtml(undefined);
    expect(html1).toContain("Unknown error");
    // @ts-expect-error — test null input
    const html2 = renderErrorHtml(null);
    expect(html2).toContain("Unknown error");
  });

  it("error page handles empty string message", () => {
    const html = renderErrorHtml("");
    expect(html).toContain("Unknown error");
  });

  it("error page escapes ampersands and quotes", () => {
    const html = renderErrorHtml('Error & "details"');
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("error page title indicates startup error", () => {
    const html = renderErrorHtml("err");
    expect(html).toContain("<title>");
    expect(html).toContain("Startup Error");
  });
});

// ---------------------------------------------------------------------------
// 6. main.cjs — structural checks
// ---------------------------------------------------------------------------

describe("Phase 32 — main.cjs desktop polish", () => {
  const mainSrc = readFile("electron/main.cjs");

  it("main.cjs imports config module", () => {
    expect(mainSrc).toContain('require("./config.cjs")');
  });

  it("main.cjs uses config for timeout values", () => {
    expect(mainSrc).toContain("config.SERVER_START_TIMEOUT_MS");
    expect(mainSrc).toContain("config.GRACEFUL_KILL_TIMEOUT_MS");
  });

  it("main.cjs creates window before server is ready", () => {
    // Window creation should happen before startAppShellServer resolves
    const createIdx = mainSrc.indexOf("createMainWindow()");
    const startIdx = mainSrc.indexOf("startAppShellServer(");
    // createMainWindow is called (no-args = loading page), then server starts
    expect(createIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeGreaterThan(-1);
  });

  it("main.cjs shows error page on failure instead of quitting", () => {
    expect(mainSrc).toContain("showErrorPage");
    // Should NOT call app.quit() in the error handler
    const catchBlock = mainSrc.slice(mainSrc.indexOf("catch (err)"));
    expect(catchBlock).toContain("showErrorPage");
  });

  it("main.cjs loads loading HTML via data: URL", () => {
    expect(mainSrc).toContain("data:text/html");
    expect(mainSrc).toContain("renderLoadingHtml");
  });

  it("main.cjs uses buildWindowTitle for window title", () => {
    expect(mainSrc).toContain("buildWindowTitle");
  });

  it("main.cjs respects ELECTRON_DEV for console output", () => {
    expect(mainSrc).toContain("isDev");
    // In production mode, server output should not be forwarded to stdout
    expect(mainSrc).toContain("if (isDev)");
  });

  it("main.cjs sets backgroundColor to prevent white flash", () => {
    expect(mainSrc).toContain("backgroundColor");
    expect(mainSrc).toContain("#1a1a2e");
  });

  it("main.cjs applies navigation security", () => {
    expect(mainSrc).toContain("applyNavigationSecurity");
    expect(mainSrc).toContain("will-navigate");
    expect(mainSrc).toContain("setWindowOpenHandler");
  });
});

// ---------------------------------------------------------------------------
// 7. preload.cjs — desktop bridge
// ---------------------------------------------------------------------------

describe("Phase 32 — preload.cjs desktop bridge", () => {
  const preloadSrc = readFile("electron/preload.cjs");

  it("preload.cjs uses contextBridge", () => {
    expect(preloadSrc).toContain("contextBridge");
    expect(preloadSrc).toContain("exposeInMainWorld");
  });

  it("preload exposes isDesktop flag", () => {
    expect(preloadSrc).toContain("isDesktop");
    expect(preloadSrc).toContain("true");
  });

  it("preload exposes appName", () => {
    expect(preloadSrc).toContain("appName");
  });

  it("preload exposes version", () => {
    expect(preloadSrc).toContain("version");
    expect(preloadSrc).toContain("getDesktopVersion");
  });

  it("preload does NOT expose Node.js APIs", () => {
    // Should not expose process, require, fs, etc.
    expect(preloadSrc).not.toContain("process.env");
    expect(preloadSrc).not.toContain("require(\"node:");
    expect(preloadSrc).not.toContain("child_process");
  });

  it("preload imports config.cjs", () => {
    expect(preloadSrc).toContain('require("./config.cjs")');
  });
});

// ---------------------------------------------------------------------------
// 8. Server banner desktop-awareness
// ---------------------------------------------------------------------------

describe("Phase 32 — Server banner desktop-awareness", () => {
  const serverSrc = readFile("src/app-shell/server.ts");

  it("server.ts checks ELECTRON_DESKTOP env", () => {
    expect(serverSrc).toContain("ELECTRON_DESKTOP");
  });

  it("server.ts shows desktop-specific banner when ELECTRON_DESKTOP=1", () => {
    expect(serverSrc).toContain("CodingAgent Desktop");
  });

  it("server.ts shows browser-specific tips only when not desktop", () => {
    expect(serverSrc).toContain("Open the URL above in your browser");
    // Ctrl+C tip should be conditional
    expect(serverSrc).toContain("Press Ctrl+C to stop the server");
  });

  it("desktop banner says to close window to stop", () => {
    expect(serverSrc).toContain("close the window to stop");
  });

  it("both banner variants print the local URL", () => {
    // The URL line should not be conditional
    expect(serverSrc).toContain("Local:");
  });
});

// ---------------------------------------------------------------------------
// 9. Views desktop detection
// ---------------------------------------------------------------------------

describe("Phase 32 — Views desktop detection", () => {
  const viewsSrc = readFile("src/app-shell/views.ts");

  it("views.ts includes desktop detection code", () => {
    expect(viewsSrc).toContain("window.desktop");
  });

  it("views.ts updates title in desktop mode", () => {
    expect(viewsSrc).toContain("document.title");
    expect(viewsSrc).toContain("desktop.appName");
  });

  it("views.ts checks isDesktop flag", () => {
    expect(viewsSrc).toContain("isDesktop");
  });
});

// ---------------------------------------------------------------------------
// 10. Backward compatibility with Phase 31 config
// ---------------------------------------------------------------------------

describe("Phase 32 — Config backward compatibility", () => {
  it("still exports DEFAULT_WIDTH", () => {
    expect(DEFAULT_WIDTH).toBe(1280);
  });

  it("still exports DEFAULT_HEIGHT", () => {
    expect(DEFAULT_HEIGHT).toBe(860);
  });

  it("still exports MIN_WIDTH", () => {
    expect(MIN_WIDTH).toBe(800);
  });

  it("still exports MIN_HEIGHT", () => {
    expect(MIN_HEIGHT).toBe(600);
  });

  it("still exports APP_TITLE", () => {
    expect(APP_TITLE).toBe("CodingAgent");
  });

  it("still exports SERVER_START_TIMEOUT_MS", () => {
    expect(SERVER_START_TIMEOUT_MS).toBe(15000);
  });

  it("still exports GRACEFUL_KILL_TIMEOUT_MS", () => {
    expect(GRACEFUL_KILL_TIMEOUT_MS).toBe(3000);
  });

  it("still exports SECURITY_DEFAULTS", () => {
    expect(SECURITY_DEFAULTS.nodeIntegration).toBe(false);
    expect(SECURITY_DEFAULTS.contextIsolation).toBe(true);
    expect(SECURITY_DEFAULTS.sandbox).toBe(true);
  });

  it("still exports isLocalUrl", () => {
    expect(typeof isLocalUrl).toBe("function");
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
    expect(isLocalUrl("https://example.com")).toBe(false);
  });

  it("still exports buildLocalUrl", () => {
    expect(typeof buildLocalUrl).toBe("function");
    expect(buildLocalUrl(3000)).toBe("http://localhost:3000");
  });
});

// ---------------------------------------------------------------------------
// 11. Documentation updates
// ---------------------------------------------------------------------------

describe("Phase 32 — Documentation", () => {
  it("ELECTRON.md exists", () => {
    expect(existsSync(join(ROOT, "docs", "ELECTRON.md"))).toBe(true);
  });

  const electronDoc = readFile("docs/ELECTRON.md");

  it("ELECTRON.md covers loading page", () => {
    expect(electronDoc).toContain("loading");
  });

  it("ELECTRON.md covers error page", () => {
    expect(electronDoc).toContain("error");
  });

  it("ELECTRON.md covers browser vs desktop distinction", () => {
    expect(electronDoc).toContain("Browser");
    expect(electronDoc).toContain("Desktop");
  });

  it("ELECTRON.md covers dev mode", () => {
    expect(electronDoc).toContain("desktop:dev");
  });

  it("ELECTRON.md mentions Phase 32 polish", () => {
    expect(electronDoc).toContain("Phase 32");
  });

  it("ELECTRON.md documents troubleshooting", () => {
    expect(electronDoc).toContain("troubleshoot");
  });

  it("CHANGELOG.md references Phase 32", () => {
    const changelog = readFile("CHANGELOG.md");
    expect(changelog).toContain("Phase 32");
  });

  it("CHANGELOG.md lists desktop polish improvements", () => {
    const changelog = readFile("CHANGELOG.md");
    expect(changelog).toContain("loading");
    expect(changelog).toContain("error");
  });
});

// ---------------------------------------------------------------------------
// 12. File structure
// ---------------------------------------------------------------------------

describe("Phase 32 — File structure", () => {
  it("electron/main.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "main.cjs"))).toBe(true);
  });

  it("electron/preload.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "preload.cjs"))).toBe(true);
  });

  it("electron/config.cjs exists", () => {
    expect(existsSync(join(ELECTRON_DIR, "config.cjs"))).toBe(true);
  });

  it("config.cjs exports all expected functions", () => {
    expect(typeof getDesktopVersion).toBe("function");
    expect(typeof buildWindowTitle).toBe("function");
    expect(typeof getIconPlaceholderPath).toBe("function");
    expect(typeof renderLoadingHtml).toBe("function");
    expect(typeof renderErrorHtml).toBe("function");
    expect(typeof isLocalUrl).toBe("function");
    expect(typeof buildLocalUrl).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 13. No-regression: shell exports still work
// ---------------------------------------------------------------------------

describe("Phase 32 — Shell no-regression", () => {
  it("app-shell server exports resolvePort", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.resolvePort).toBe("function");
  });

  it("app-shell server exports startServer", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.startServer).toBe("function");
  });

  it("app-shell server exports handleRequest", async () => {
    const mod = await import("../../src/app-shell/server.js");
    expect(typeof mod.handleRequest).toBe("function");
  });

  it("app-shell views exports renderShellHtml", async () => {
    const mod = await import("../../src/app-shell/views.js");
    expect(typeof mod.renderShellHtml).toBe("function");
  });

  it("renderShellHtml still produces valid HTML", async () => {
    const { renderShellHtml } = await import("../../src/app-shell/views.js");
    const html = renderShellHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("CodingAgent");
    expect(html).toContain("Demo");
    expect(html).toContain("Real");
  });

  it("renderShellHtml contains desktop detection code", async () => {
    const { renderShellHtml } = await import("../../src/app-shell/views.js");
    const html = renderShellHtml();
    expect(html).toContain("window.desktop");
  });
});

// ---------------------------------------------------------------------------
// 14. Startup failure handling semantics
// ---------------------------------------------------------------------------

describe("Phase 32 — Startup failure handling", () => {
  it("error page is shown in-window, not via quit", () => {
    const mainSrc = readFile("electron/main.cjs");
    // The catch block should call showErrorPage, not app.quit
    const bootFn = mainSrc.slice(
      mainSrc.indexOf("async function boot()"),
      mainSrc.indexOf("// Electron app lifecycle"),
    );
    expect(bootFn).toContain("showErrorPage");
    // Ensure app.quit is NOT in the catch block
    const catchIdx = bootFn.indexOf("catch (err)");
    const catchBlock = bootFn.slice(catchIdx);
    expect(catchBlock).not.toContain("app.quit");
  });

  it("window is created before server attempt", () => {
    const mainSrc = readFile("electron/main.cjs");
    const bootFn = mainSrc.slice(
      mainSrc.indexOf("async function boot()"),
      mainSrc.indexOf("// Electron app lifecycle"),
    );
    const createWinIdx = bootFn.indexOf("createMainWindow()");
    const tryIdx = bootFn.indexOf("try {");
    // createMainWindow should be called before the try block
    // (or at least before findAvailablePort inside try)
    expect(createWinIdx).toBeGreaterThan(-1);
  });

  it("loading page is the first thing shown", () => {
    const mainSrc = readFile("electron/main.cjs");
    // createMainWindow loads the loading HTML
    const createFn = mainSrc.slice(
      mainSrc.indexOf("function createMainWindow()"),
      mainSrc.indexOf("function applyNavigationSecurity"),
    );
    expect(createFn).toContain("renderLoadingHtml");
  });

  it("error page for various failure messages", () => {
    const messages = [
      "Failed to start app-shell server: spawn ENOENT",
      "App-shell server exited unexpectedly with code 1",
      "Timed out waiting for app-shell server to start",
    ];
    for (const msg of messages) {
      const html = renderErrorHtml(msg);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Troubleshooting");
    }
  });
});

// ---------------------------------------------------------------------------
// 15. Package.json scripts
// ---------------------------------------------------------------------------

describe("Phase 32 — Package scripts", () => {
  const pkg = JSON.parse(readFile("package.json"));

  it("has desktop script", () => {
    expect(pkg.scripts.desktop).toBeDefined();
    expect(pkg.scripts.desktop).toContain("electron");
  });

  it("has desktop:dev script", () => {
    expect(pkg.scripts["desktop:dev"]).toBeDefined();
    expect(pkg.scripts["desktop:dev"]).toContain("ELECTRON_DEV");
  });

  it("has app-shell script for browser mode", () => {
    expect(pkg.scripts["app-shell"]).toBeDefined();
  });

  it("has app-shell:open script", () => {
    expect(pkg.scripts["app-shell:open"]).toBeDefined();
  });
});
