/**
 * Phase 34 — Desktop first-run polish and packaged UX hardening tests.
 *
 * Validates loading page, error page, runtime validation, environment
 * summary, icon fallback, escapeHtml, and preload bridge extensions
 * introduced in Phase 34.
 *
 * These are deterministic tests — they do NOT require Electron to be running.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Import the CJS config module (testable without Electron)
// ---------------------------------------------------------------------------

const electronConfig = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const {
  renderLoadingHtml,
  renderErrorHtml,
  escapeHtml,
  validatePackagedRuntime,
  buildEnvironmentSummary,
  getIconPath,
  getIconPlaceholderPath,
  getDesktopVersion,
  buildWindowTitle,
  isPackaged,
  getAppRoot,
  APP_TITLE,
} = electronConfig;

// ---------------------------------------------------------------------------
// 1. Loading page — packaged vs dev mode wording
// ---------------------------------------------------------------------------

describe("renderLoadingHtml — Phase 34 packaged-mode wording", () => {
  it("dev mode shows 'app shell server' wording", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("Starting app shell server");
    expect(html).not.toContain("this may take a moment");
  });

  it("dev mode (explicit false) shows dev wording", () => {
    const html = renderLoadingHtml({ packaged: false });
    expect(html).toContain("Starting app shell server");
  });

  it("packaged mode shows user-friendly wording", () => {
    const html = renderLoadingHtml({ packaged: true });
    expect(html).toContain("this may take a moment");
    expect(html).not.toContain("app shell server");
  });

  it("loading page always contains app title", () => {
    expect(renderLoadingHtml()).toContain(APP_TITLE);
    expect(renderLoadingHtml({ packaged: true })).toContain(APP_TITLE);
  });

  it("loading page always contains version", () => {
    const version = getDesktopVersion();
    expect(renderLoadingHtml()).toContain(version);
    expect(renderLoadingHtml({ packaged: true })).toContain(version);
  });

  it("loading page is valid HTML", () => {
    const html = renderLoadingHtml({ packaged: true });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>");
  });

  it("loading page contains spinner", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("spinner");
  });
});

// ---------------------------------------------------------------------------
// 2. Error page — packaged vs dev mode wording
// ---------------------------------------------------------------------------

describe("renderErrorHtml — Phase 34 packaged-mode wording", () => {
  it("dev mode shows developer-oriented hints", () => {
    const html = renderErrorHtml("some error");
    expect(html).toContain("npm install");
    expect(html).toContain("npm run app-shell");
    expect(html).toContain("Node.js");
  });

  it("dev mode does not show packaged-only hints", () => {
    const html = renderErrorHtml("some error");
    expect(html).not.toContain("Close the app and reopen");
    expect(html).not.toContain("Help &amp; environment info");
  });

  it("packaged mode shows user-friendly hints", () => {
    const html = renderErrorHtml("some error", { packaged: true });
    expect(html).toContain("Close the app and reopen");
    expect(html).toContain("no other instance");
    expect(html).toContain("local network connections");
    expect(html).toContain("restarting your computer");
  });

  it("packaged mode does NOT show developer hints", () => {
    const html = renderErrorHtml("some error", { packaged: true });
    expect(html).not.toContain("npm install");
    expect(html).not.toContain("npm run app-shell");
  });

  it("packaged mode subtitle is user-friendly", () => {
    const html = renderErrorHtml("some error", { packaged: true });
    expect(html).toContain("could not start properly");
  });

  it("dev mode subtitle mentions server", () => {
    const html = renderErrorHtml("some error");
    expect(html).toContain("Could not start the app shell server");
  });

  it("packaged mode includes environment summary", () => {
    const html = renderErrorHtml("some error", { packaged: true });
    expect(html).toContain("Help &amp; environment info");
    expect(html).toContain("Version:");
    expect(html).toContain("Platform:");
    expect(html).toContain("Mode: packaged");
  });

  it("dev mode does NOT include environment summary", () => {
    const html = renderErrorHtml("some error");
    expect(html).not.toContain("Help &amp; environment info");
    expect(html).not.toContain("Mode: packaged");
  });

  it("error page always contains version", () => {
    const version = getDesktopVersion();
    expect(renderErrorHtml("e")).toContain(version);
    expect(renderErrorHtml("e", { packaged: true })).toContain(version);
  });

  it("error page escapes HTML in messages", () => {
    const html = renderErrorHtml("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("error page always has retry button", () => {
    expect(renderErrorHtml("e")).toContain("Retry");
    expect(renderErrorHtml("e", { packaged: true })).toContain("Retry");
  });

  it("error page always has What to try heading", () => {
    expect(renderErrorHtml("e")).toContain("What to try");
    expect(renderErrorHtml("e", { packaged: true })).toContain("What to try");
  });

  it("error page is valid HTML", () => {
    const html = renderErrorHtml("test", { packaged: true });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain(APP_TITLE);
  });

  it("error page handles empty message gracefully", () => {
    const html = renderErrorHtml("", { packaged: true });
    expect(html).toContain("Unknown error");
  });

  it("error page handles null message gracefully", () => {
    const html = renderErrorHtml(null, { packaged: true });
    expect(html).toContain("Unknown error");
  });
});

// ---------------------------------------------------------------------------
// 3. escapeHtml utility
// ---------------------------------------------------------------------------

describe("escapeHtml — Phase 34", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<b>test</b>")).toBe("&lt;b&gt;test&lt;/b&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles plain text without escaping", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("coerces non-string input", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("null");
  });
});

// ---------------------------------------------------------------------------
// 4. validatePackagedRuntime
// ---------------------------------------------------------------------------

describe("validatePackagedRuntime — Phase 34", () => {
  it("returns an object with ok and issues", () => {
    const result = validatePackagedRuntime();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("issues");
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("detects missing dist directory when not built", () => {
    // In the test environment, dist/ may not exist
    const result = validatePackagedRuntime();
    // The result should either be OK or list specific missing files/dirs
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i: string) => i.includes("Missing"))).toBe(true);
    }
  });

  it("reports issues as human-readable strings", () => {
    const result = validatePackagedRuntime();
    for (const issue of result.issues) {
      expect(typeof issue).toBe("string");
      expect(issue.length).toBeGreaterThan(0);
    }
  });

  it("checks server script existence in packaged mode", () => {
    const result = validatePackagedRuntime({ forcePackaged: true });
    // In this test env we are NOT actually packaged, so the server.js won't exist
    expect(result.ok).toBe(false);
    expect(result.issues.some((i: string) => i.includes("Server script"))).toBe(true);
  });

  it("does NOT check server script in dev mode", () => {
    const result = validatePackagedRuntime({ forcePackaged: false });
    // Dev mode does not check for dist/app-shell/server.js
    const serverIssues = result.issues.filter((i: string) => i.includes("Server script"));
    expect(serverIssues.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. buildEnvironmentSummary
// ---------------------------------------------------------------------------

describe("buildEnvironmentSummary — Phase 34", () => {
  it("returns version, platform, arch, packaged, nodeVersion, appRoot", () => {
    const summary = buildEnvironmentSummary();
    expect(summary).toHaveProperty("version");
    expect(summary).toHaveProperty("platform");
    expect(summary).toHaveProperty("arch");
    expect(summary).toHaveProperty("packaged");
    expect(summary).toHaveProperty("nodeVersion");
    expect(summary).toHaveProperty("appRoot");
  });

  it("version matches getDesktopVersion", () => {
    expect(buildEnvironmentSummary().version).toBe(getDesktopVersion());
  });

  it("platform is a non-empty string", () => {
    expect(typeof buildEnvironmentSummary().platform).toBe("string");
    expect(buildEnvironmentSummary().platform.length).toBeGreaterThan(0);
  });

  it("arch is a non-empty string", () => {
    expect(typeof buildEnvironmentSummary().arch).toBe("string");
    expect(buildEnvironmentSummary().arch.length).toBeGreaterThan(0);
  });

  it("packaged is boolean", () => {
    expect(typeof buildEnvironmentSummary().packaged).toBe("boolean");
  });

  it("packaged can be overridden", () => {
    expect(buildEnvironmentSummary({ forcePackaged: true }).packaged).toBe(true);
    expect(buildEnvironmentSummary({ forcePackaged: false }).packaged).toBe(false);
  });

  it("nodeVersion starts with v", () => {
    expect(buildEnvironmentSummary().nodeVersion).toMatch(/^v/);
  });

  it("appRoot is an absolute path", () => {
    const root = buildEnvironmentSummary().appRoot;
    expect(root).toMatch(/^\//); // Unix absolute path
  });
});

// ---------------------------------------------------------------------------
// 6. Icon fallback behavior
// ---------------------------------------------------------------------------

describe("getIconPath — Phase 34 icon fallback", () => {
  it("returns null when icon file does not exist", () => {
    // No assets/icon.png in the test checkout
    const result = getIconPath();
    expect(result).toBeNull();
  });

  it("getIconPlaceholderPath returns a path string", () => {
    const p = getIconPlaceholderPath();
    expect(typeof p).toBe("string");
    expect(p).toContain("icon.png");
  });

  it("placeholder path is under assets/", () => {
    const p = getIconPlaceholderPath();
    expect(p).toContain("assets");
  });
});

// ---------------------------------------------------------------------------
// 7. Window title — backward compatibility
// ---------------------------------------------------------------------------

describe("buildWindowTitle — Phase 34 backward compatibility", () => {
  it("still includes version", () => {
    const title = buildWindowTitle();
    expect(title).toContain("v");
    expect(title).toContain(getDesktopVersion());
  });

  it("still includes app title", () => {
    expect(buildWindowTitle()).toContain(APP_TITLE);
  });

  it("dev mode still adds [Dev]", () => {
    expect(buildWindowTitle({ isDev: true })).toContain("[Dev]");
  });

  it("production mode does not add [Dev]", () => {
    expect(buildWindowTitle({ isDev: false })).not.toContain("[Dev]");
  });
});

// ---------------------------------------------------------------------------
// 8. Preload bridge — isPackaged exposure
// ---------------------------------------------------------------------------

describe("preload bridge — Phase 34 isPackaged exposure", () => {
  it("preload.cjs source exposes isPackaged", () => {
    const preloadSrc = readFileSync(
      resolve(process.cwd(), "electron", "preload.cjs"),
      "utf-8",
    );
    expect(preloadSrc).toContain("isPackaged");
  });

  it("preload.cjs source still exposes isDesktop", () => {
    const preloadSrc = readFileSync(
      resolve(process.cwd(), "electron", "preload.cjs"),
      "utf-8",
    );
    expect(preloadSrc).toContain("isDesktop: true");
  });

  it("preload.cjs source still exposes appName", () => {
    const preloadSrc = readFileSync(
      resolve(process.cwd(), "electron", "preload.cjs"),
      "utf-8",
    );
    expect(preloadSrc).toContain("appName");
  });

  it("preload.cjs source still exposes version", () => {
    const preloadSrc = readFileSync(
      resolve(process.cwd(), "electron", "preload.cjs"),
      "utf-8",
    );
    expect(preloadSrc).toContain("version");
  });
});

// ---------------------------------------------------------------------------
// 9. main.cjs — Phase 34 structural checks
// ---------------------------------------------------------------------------

describe("main.cjs — Phase 34 structural checks", () => {
  const mainSrc = readFileSync(
    resolve(process.cwd(), "electron", "main.cjs"),
    "utf-8",
  );

  it("main.cjs calls validatePackagedRuntime for packaged mode", () => {
    expect(mainSrc).toContain("validatePackagedRuntime");
  });

  it("main.cjs passes packaged flag to createMainWindow", () => {
    expect(mainSrc).toContain("createMainWindow({ packaged");
  });

  it("main.cjs passes packaged flag to showErrorPage", () => {
    expect(mainSrc).toContain("showErrorPage(");
    expect(mainSrc).toContain("packaged");
  });

  it("main.cjs references getIconPath for icon fallback", () => {
    expect(mainSrc).toContain("getIconPath");
  });

  it("main.cjs still uses config.getServerLaunchConfig", () => {
    expect(mainSrc).toContain("getServerLaunchConfig");
  });

  it("main.cjs still exports findAvailablePort and config", () => {
    expect(mainSrc).toContain("findAvailablePort");
    expect(mainSrc).toContain("module.exports");
  });
});

// ---------------------------------------------------------------------------
// 10. Backward compatibility — Phase 32/33 functions still work
// ---------------------------------------------------------------------------

describe("backward compatibility — Phase 34 does not break previous phases", () => {
  it("renderLoadingHtml() with no args still works (Phase 32 compat)", () => {
    const html = renderLoadingHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(APP_TITLE);
    expect(html).toContain("spinner");
  });

  it("renderErrorHtml(msg) with one arg still works (Phase 32 compat)", () => {
    const html = renderErrorHtml("test error");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("test error");
    expect(html).toContain("Retry");
  });

  it("isPackaged() still works with forcePackaged override", () => {
    expect(isPackaged({ forcePackaged: true })).toBe(true);
    expect(isPackaged({ forcePackaged: false })).toBe(false);
  });

  it("getAppRoot() returns a valid path", () => {
    const root = getAppRoot();
    expect(typeof root).toBe("string");
    expect(root.length).toBeGreaterThan(0);
  });

  it("APP_TITLE is CodingAgent", () => {
    expect(APP_TITLE).toBe("CodingAgent");
  });
});
