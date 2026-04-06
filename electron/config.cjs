/**
 * Electron configuration constants for CodingAgent desktop wrapper.
 *
 * Centralizes configurable values used by the main process and tests.
 * Keeping these in a separate file makes them easy to test without
 * importing Electron APIs.
 *
 * Phase 33: added packaged-mode detection and path resolution helpers
 * so that the app works both in dev mode (source tree) and when packaged
 * by electron-builder into a distributable artifact.
 *
 * Phase 34: added first-run polish — packaged-mode loading/error wording,
 * runtime validation, environment summary, icon fallback, escapeHtml helper.
 *
 * Phase 35: added installer target metadata helper (getInstallerTargets).
 *
 * Phase 36: added code-signing readiness helpers (getSigningConfig,
 * isSigningConfigured, getReleaseReadiness) and SIGNING_ENV_VARS map.
 *
 * Phase 37: added desktop release polish / public beta readiness helpers
 * (getProductIdentity, getBetaLabel, getBetaVersion, getBetaMetadata,
 * validateDesktopMetadata, validateArtifactNaming, getIconConfig,
 * BETA_KNOWN_LIMITATIONS, SUPPORTED_ICON_FORMATS).
 *
 * Phase 42: V1 release hardening — added V1 constants and helpers
 * (V1_KNOWN_LIMITATIONS, getReleaseLabel, getReleaseVersion, getReleaseMetadata,
 * RELEASE_STAGE).
 */

"use strict";

const path = require("node:path");
const fs = require("node:fs");

/** Default window dimensions */
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

/** App metadata */
const APP_TITLE = "CodingAgent";

/** Server startup timeout in milliseconds */
const SERVER_START_TIMEOUT_MS = 15000;

/** Graceful kill timeout in milliseconds */
const GRACEFUL_KILL_TIMEOUT_MS = 3000;

/**
 * BrowserWindow security defaults.
 * These are the values applied in main.cjs and validated by tests.
 */
const SECURITY_DEFAULTS = {
  nodeIntegration: false,
  contextIsolation: true,
  enableRemoteModule: false,
  sandbox: true,
  webviewTag: false,
};

/**
 * Read the package version from package.json.
 * Returns "0.1.0" as fallback if the file cannot be read.
 * @returns {string}
 */
function getDesktopVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

/**
 * Build window title with optional version and dev mode suffix.
 * @param {{ isDev?: boolean; version?: string }} [opts]
 * @returns {string}
 */
function buildWindowTitle(opts) {
  const version = (opts && opts.version) || getDesktopVersion();
  const parts = [`${APP_TITLE} v${version}`];
  if (opts && opts.isDev) {
    parts.push("[Dev]");
  }
  return parts.join(" ");
}

/**
 * Path where a custom application icon could be placed.
 * This path is not required to exist — it is a hint for future icon support.
 * @returns {string}
 */
function getIconPlaceholderPath() {
  return path.resolve(__dirname, "..", "assets", "icon.png");
}

/**
 * Validate that a URL is a local-only URL (http://localhost or http://127.0.0.1).
 * @param {string} url
 * @returns {boolean}
 */
function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Build the local app-shell URL for a given port.
 * @param {number} port
 * @returns {string}
 */
function buildLocalUrl(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return `http://localhost:${port}`;
}

/**
 * Render the loading HTML page shown in the BrowserWindow while the
 * app-shell server is starting. This avoids a blank/white window during
 * the brief server boot period.
 *
 * Phase 34: the loading page adapts its status message based on whether the
 * app is running in packaged mode (user-friendly wording) or dev mode.
 *
 * @param {{ packaged?: boolean }} [opts]
 * @returns {string}
 */
function renderLoadingHtml(opts) {
  const packaged = !!(opts && opts.packaged);
  const statusText = packaged
    ? "Starting up — this may take a moment…"
    : "Starting app shell server…";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_TITLE} — Starting…</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
  }
  .container { max-width: 420px; padding: 2rem; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; color: #ffffff; }
  .version { font-size: 0.85rem; color: #888; margin-bottom: 1.5rem; }
  .spinner {
    width: 40px; height: 40px; margin: 0 auto 1.5rem;
    border: 4px solid #333;
    border-top-color: #6c63ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status { font-size: 1rem; color: #aaa; }
</style>
</head>
<body>
  <div class="container">
    <h1>${APP_TITLE}</h1>
    <p class="version">v${getDesktopVersion()}</p>
    <div class="spinner"></div>
    <p class="status">${statusText}</p>
  </div>
</body>
</html>`;
}

/**
 * Render an error HTML page shown in the BrowserWindow when the
 * app-shell server fails to start. Includes retry guidance and
 * troubleshooting hints.
 *
 * Phase 34: the error page now adapts wording to packaged vs dev mode,
 * hides developer-oriented hints from packaged users, and provides
 * a "what to try next" section with environment summary.
 *
 * @param {string} message - The error message to display
 * @param {{ packaged?: boolean }} [opts]
 * @returns {string}
 */
function renderErrorHtml(message, opts) {
  const safeMessage = String(message || "Unknown error")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const packaged = !!(opts && opts.packaged);
  const version = getDesktopVersion();

  // Troubleshooting hints differ between packaged and dev mode
  const packagedHints = `
        <li>Close the app and reopen it — the issue may be temporary</li>
        <li>Make sure no other instance is already running</li>
        <li>Check that your system allows local network connections</li>
        <li>If the problem persists, try restarting your computer</li>
        <li>See the Help section below for advanced details</li>`;

  const devHints = `
        <li>Make sure <code>npm install</code> has been run</li>
        <li>Check that Node.js ≥ 18 is installed</li>
        <li>Try running <code>npm run app-shell</code> in a terminal to see full output</li>
        <li>Check for port conflicts or firewall rules</li>
        <li>See <code>docs/ELECTRON.md</code> for desktop troubleshooting</li>`;

  const hints = packaged ? packagedHints : devHints;

  const subtitle = packaged
    ? "The application could not start properly"
    : "Could not start the app shell server";

  // Environment summary (packaged mode only, collapsed by default)
  const envSummary = packaged
    ? `
    <details class="env-details">
      <summary>Help &amp; environment info</summary>
      <div class="env-content">
        <p>Version: ${escapeHtml(version)}</p>
        <p>Platform: ${escapeHtml(process.platform)} (${escapeHtml(process.arch)})</p>
        <p>Mode: packaged</p>
        <p class="env-hint">If you need further help, share the error message and environment info above.</p>
      </div>
    </details>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_TITLE} — Startup Error</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
  }
  .container { max-width: 500px; padding: 2rem; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; color: #ffffff; }
  .version { font-size: 0.8rem; color: #666; margin-bottom: 0.25rem; }
  .error-icon { font-size: 2.5rem; margin-bottom: 1rem; }
  .error-msg {
    background: #2a1a1a;
    border: 1px solid #5a2020;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: 0.85rem;
    color: #ff8888;
    word-break: break-word;
    text-align: left;
  }
  .hints {
    text-align: left;
    margin: 1.5rem 0;
    padding: 0 0.5rem;
  }
  .hints h2 { font-size: 1rem; margin-bottom: 0.75rem; color: #ccc; }
  .hints ul { list-style: none; padding: 0; }
  .hints li {
    padding: 0.3rem 0;
    font-size: 0.9rem;
    color: #aaa;
  }
  .hints li::before { content: "→ "; color: #6c63ff; }
  .retry-btn {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.6rem 1.5rem;
    background: #6c63ff;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .retry-btn:hover { background: #5a52e0; }
  code { background: #2a2a3e; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.85rem; }
  .env-details {
    text-align: left;
    margin-top: 1.5rem;
    border: 1px solid #333;
    border-radius: 8px;
    overflow: hidden;
  }
  .env-details summary {
    padding: 0.6rem 1rem;
    background: #222244;
    color: #888;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
  }
  .env-details summary:hover { color: #aaa; }
  .env-content {
    padding: 0.8rem 1rem;
    font-size: 0.8rem;
    color: #888;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
  }
  .env-content p { padding: 0.15rem 0; }
  .env-hint {
    margin-top: 0.5rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    font-style: italic;
    color: #666;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h1>${APP_TITLE}</h1>
    <p class="version">v${escapeHtml(version)}</p>
    <p style="color:#888;margin-top:0.25rem;">${subtitle}</p>
    <div class="error-msg">${safeMessage}</div>
    <div class="hints">
      <h2>What to try</h2>
      <ul>${hints}
      </ul>
    </div>
    <button class="retry-btn" onclick="window.location.reload()">Retry</button>${envSummary}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe HTML embedding.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Packaged-mode detection and path resolution (Phase 33)
// ---------------------------------------------------------------------------

/**
 * Detect whether the app is running inside an electron-builder packaged asar
 * or unpacked directory. In dev mode, __dirname is inside the source tree.
 * In packaged mode, it is inside the asar archive or unpacked resources.
 *
 * Detection heuristic: the app.asar path segment or the presence of an
 * app-specific marker. We check whether __dirname contains "app.asar" or
 * whether the `app` module's `isPackaged` flag is set.
 *
 * For testability (without requiring Electron), this function also accepts
 * an explicit override.
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {boolean}
 */
function isPackaged(opts) {
  if (opts && typeof opts.forcePackaged === "boolean") {
    return opts.forcePackaged;
  }
  // Check for asar path (works even without Electron APIs)
  if (__dirname.includes("app.asar")) {
    return true;
  }
  // Check Electron's own flag if available
  try {
    const { app } = require("electron");
    if (app && typeof app.isPackaged === "boolean") {
      return app.isPackaged;
    }
  } catch {
    // Not in Electron context (e.g. running from tests)
  }
  return false;
}

/**
 * Get the application root directory.
 *
 * - Dev mode: project root (one level up from electron/)
 * - Packaged mode: the asar/unpacked root (same relative structure)
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {string}
 */
function getAppRoot(opts) {
  // In both dev and packaged mode, config.cjs lives in electron/
  // so one level up is the app root.
  return path.resolve(__dirname, "..");
}

/**
 * Get the path to the compiled server entry point.
 *
 * - Dev mode: uses `npx tsx src/app-shell/server.ts` (TypeScript, interpreted)
 * - Packaged mode: uses `node dist/app-shell/server.js` (compiled JS)
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {{ command: string; args: string[]; serverScript: string }}
 */
function getServerLaunchConfig(opts) {
  const appRoot = getAppRoot(opts);
  const packaged = isPackaged(opts);

  if (packaged) {
    // In packaged mode, TypeScript is not available — use compiled output
    const serverScript = path.join(appRoot, "dist", "app-shell", "server.js");
    return {
      command: process.execPath, // The bundled Node/Electron executable
      args: [serverScript],
      serverScript,
    };
  }

  // Dev mode: use npx tsx to run TypeScript source
  const serverScript = path.join(appRoot, "src", "app-shell", "server.ts");
  const isWindows = process.platform === "win32";
  const npxCmd = isWindows ? "npx.cmd" : "npx";
  return {
    command: npxCmd,
    args: ["tsx", serverScript],
    serverScript,
  };
}

/**
 * Get the path to the preload script.
 * Works in both dev and packaged mode.
 * @returns {string}
 */
function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

/**
 * List of required files that must be present for the packaged app to work.
 * Used by smoke tests and validation.
 * @returns {string[]}
 */
function getRequiredPackagedFiles() {
  return [
    "electron/main.cjs",
    "electron/preload.cjs",
    "electron/config.cjs",
    "package.json",
  ];
}

/**
 * List of required directories for the packaged app.
 * @returns {string[]}
 */
function getRequiredPackagedDirs() {
  return [
    "dist",
    "data",
    "electron",
  ];
}

// ---------------------------------------------------------------------------
// Packaged runtime validation (Phase 34)
// ---------------------------------------------------------------------------

/**
 * Validate that required files and directories exist for a packaged app.
 * Returns an array of issues found (empty means everything is OK).
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {{ ok: boolean; issues: string[] }}
 */
function validatePackagedRuntime(opts) {
  const appRoot = getAppRoot(opts);
  const issues = [];

  for (const relFile of getRequiredPackagedFiles()) {
    const fullPath = path.join(appRoot, relFile);
    if (!fs.existsSync(fullPath)) {
      issues.push(`Missing required file: ${relFile}`);
    }
  }

  for (const relDir of getRequiredPackagedDirs()) {
    const fullPath = path.join(appRoot, relDir);
    if (!fs.existsSync(fullPath)) {
      issues.push(`Missing required directory: ${relDir}`);
    }
  }

  // In packaged mode, the server script must exist
  if (isPackaged(opts)) {
    const launchConfig = getServerLaunchConfig(opts);
    if (!fs.existsSync(launchConfig.serverScript)) {
      issues.push(`Server script not found: ${launchConfig.serverScript}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Build a simple environment summary string for diagnostics.
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {{ version: string; platform: string; arch: string; packaged: boolean; nodeVersion: string; appRoot: string }}
 */
function buildEnvironmentSummary(opts) {
  return {
    version: getDesktopVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: isPackaged(opts),
    nodeVersion: process.version,
    appRoot: getAppRoot(opts),
  };
}

/**
 * Get a usable icon path with fallback behavior.
 * Returns the icon placeholder path if the file exists on disk, or null
 * if no icon file is present (the caller should then use the default icon).
 * @returns {string | null}
 */
function getIconPath() {
  const placeholder = getIconPlaceholderPath();
  try {
    if (fs.existsSync(placeholder)) {
      return placeholder;
    }
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Code-signing readiness (Phase 36)
// ---------------------------------------------------------------------------

/**
 * Environment variable names that drive code-signing configuration.
 *
 * These are not invented conventions — they are the standard variables used by
 * electron-builder and platform tooling:
 *
 *   macOS  — CSC_LINK (path/base64 p12), CSC_KEY_PASSWORD,
 *            APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *   Windows — CSC_LINK (path/base64 pfx), CSC_KEY_PASSWORD,
 *             WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD (platform-specific override)
 *   Linux  — typically unsigned; GPG_KEY_ID for optional GPG signatures
 *
 * This object is informational and used by readiness checks / docs only.
 */
const SIGNING_ENV_VARS = {
  darwin: ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  win32: ["CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"],
  linux: ["GPG_KEY_ID"],
};

/**
 * Return the current code-signing readiness status for a given platform.
 *
 * This does NOT perform any signing — it merely checks whether the expected
 * environment variables are present, so tooling / docs / CI can report
 * whether signing *would* be applied.
 *
 * @param {string} [platform] — defaults to process.platform
 * @returns {{
 *   platform: string;
 *   configured: boolean;
 *   active: boolean;
 *   envVars: { name: string; present: boolean }[];
 *   summary: string;
 * }}
 */
function getSigningConfig(platform) {
  const plat = platform || process.platform;
  const expectedVars = SIGNING_ENV_VARS[plat] || [];

  const envVars = expectedVars.map((name) => ({
    name,
    present: typeof process.env[name] === "string" && (process.env[name]?.length ?? 0) > 0,
  }));

  // "configured" means at least the primary certificate variable is set
  const configured = envVars.length > 0 && envVars[0].present;
  // "active" means configured AND we are on the correct host platform
  const active = configured && plat === process.platform;

  let summary;
  if (envVars.length === 0) {
    summary = `No signing variables defined for platform "${plat}"`;
  } else if (!configured) {
    summary = `Signing not configured — set ${expectedVars[0]} (and related vars) to enable`;
  } else if (!active) {
    summary = `Signing configured but inactive — host platform is "${process.platform}", target is "${plat}"`;
  } else {
    summary = "Signing configured and active for current platform";
  }

  return { platform: plat, configured, active, envVars, summary };
}

/**
 * Check whether code signing is configured for the current (or given) platform.
 * Convenience wrapper around getSigningConfig().
 *
 * @param {string} [platform]
 * @returns {boolean}
 */
function isSigningConfigured(platform) {
  return getSigningConfig(platform).configured;
}

/**
 * Return a human-readable release-readiness summary covering signing,
 * icon, and version metadata.
 *
 * @param {{ forcePackaged?: boolean }} [opts]
 * @returns {{
 *   version: string;
 *   productName: string;
 *   signing: { configured: boolean; active: boolean; summary: string };
 *   icon: { present: boolean; path: string | null };
 *   artifactNaming: string;
 *   unsignedWarning: string;
 * }}
 */
function getReleaseReadiness(opts) {
  const signing = getSigningConfig();
  const iconPath = getIconPath();
  const version = getDesktopVersion();

  const unsignedWarning = signing.active
    ? "Artifacts will be signed — no additional OS warnings expected."
    : [
        "Artifacts are UNSIGNED. Users will see OS security warnings:",
        "  • macOS: Gatekeeper will warn the app is from an unidentified developer",
        "  • Windows: SmartScreen will show an \"unrecognized app\" warning",
        "  • Linux: No warning (AppImage is not typically signed)",
      ].join("\n");

  return {
    version,
    productName: APP_TITLE,
    signing: {
      configured: signing.configured,
      active: signing.active,
      summary: signing.summary,
    },
    icon: { present: !!iconPath, path: iconPath },
    artifactNaming: "${productName}-${version}-${os}-${arch}.${ext}",
    unsignedWarning,
  };
}

// ---------------------------------------------------------------------------
// Installer target metadata (Phase 35)
// ---------------------------------------------------------------------------

/**
 * Return the installable artifact target name for a given platform.
 * This is used for documentation and smoke test validation only — it does
 * not drive electron-builder itself (that config lives in electron-builder.config.js).
 *
 * @param {string} [platform] — defaults to process.platform
 * @returns {{ platform: string; installerTarget: string; ext: string; description: string }}
 */
function getInstallerTargets(platform) {
  const plat = platform || process.platform;
  switch (plat) {
    case "linux":
      return {
        platform: "linux",
        installerTarget: "AppImage",
        ext: "AppImage",
        description: "Portable Linux application image — single executable, no installation required",
      };
    case "darwin":
      return {
        platform: "darwin",
        installerTarget: "dmg",
        ext: "dmg",
        description: "macOS disk image — drag to Applications to install (unsigned)",
      };
    case "win32":
      return {
        platform: "win32",
        installerTarget: "nsis",
        ext: "exe",
        description: "Windows installer (NSIS) — standard graphical setup wizard (unsigned)",
      };
    default:
      return {
        platform: plat,
        installerTarget: "dir",
        ext: "dir",
        description: "Directory output — no native installer available for this platform",
      };
  }
}

// ---------------------------------------------------------------------------
// Desktop release polish / public beta readiness (Phase 37)
// ---------------------------------------------------------------------------

/**
 * Product identity constants.
 * These are the canonical product strings for artifact names, display,
 * and metadata consistency.
 */
const PRODUCT_APP_ID = "com.codingagent.desktop";
const PRODUCT_NAME = "CodingAgent";
const PRODUCT_DESCRIPTION =
  "Portable, local-first coding-agent desktop application for catalog management, " +
  "host detection, compatibility evaluation, install planning, and workflow orchestration.";

/**
 * Supported icon file formats and expected paths.
 * electron-builder expects specific formats per platform:
 *   - .png  — Linux (256×256 or 512×512), also base for other formats
 *   - .icns — macOS (auto-generated from png by electron-builder)
 *   - .ico  — Windows (auto-generated from png by electron-builder)
 *
 * In practice, shipping a 512×512 PNG is sufficient — electron-builder
 * converts it for each platform.
 */
const SUPPORTED_ICON_FORMATS = ["png", "icns", "ico"];

/**
 * Known limitations to communicate to beta testers.
 * This list is the canonical reference — docs and release notes should
 * mirror it.
 */
const BETA_KNOWN_LIMITATIONS = [
  "Unsigned build — users will see OS security warnings (Gatekeeper on macOS, SmartScreen on Windows)",
  "No auto-update — testers must manually download new builds",
  "No custom application icon — uses Electron default icon",
  "No tray or dock integration",
  "Server startup delay — a loading screen is shown briefly while the backend starts",
  "Local-platform-only builds — cross-compilation is not supported",
  "No crash reporting — errors are shown in-window but not reported externally",
  "Production dependencies included — no tree-shaking or bundling applied",
];

/**
 * Return canonical product identity metadata.
 * Used for consistency validation between package.json, electron-builder
 * config, and the desktop wrapper.
 *
 * @returns {{
 *   appId: string;
 *   productName: string;
 *   appTitle: string;
 *   description: string;
 * }}
 */
function getProductIdentity() {
  return {
    appId: PRODUCT_APP_ID,
    productName: PRODUCT_NAME,
    appTitle: APP_TITLE,
    description: PRODUCT_DESCRIPTION,
  };
}

/**
 * Return a beta label string for display / artifact purposes.
 * Format: "beta" or "beta.N" if a beta number is provided.
 *
 * @param {{ betaNumber?: number }} [opts]
 * @returns {string}
 */
function getBetaLabel(opts) {
  if (opts && typeof opts.betaNumber === "number" && opts.betaNumber > 0) {
    return `beta.${opts.betaNumber}`;
  }
  return "beta";
}

/**
 * Return a beta-decorated version string.
 * e.g. "0.1.0-beta" or "0.1.0-beta.3"
 *
 * @param {{ betaNumber?: number }} [opts]
 * @returns {string}
 */
function getBetaVersion(opts) {
  const base = getDesktopVersion();
  const label = getBetaLabel(opts);
  return `${base}-${label}`;
}

/**
 * Return comprehensive beta metadata for release notes, docs, and tests.
 *
 * @param {{ betaNumber?: number; forcePackaged?: boolean }} [opts]
 * @returns {{
 *   version: string;
 *   betaVersion: string;
 *   betaLabel: string;
 *   productIdentity: ReturnType<typeof getProductIdentity>;
 *   signing: { configured: boolean; active: boolean; summary: string };
 *   icon: { present: boolean; path: string | null; placeholderPath: string; supportedFormats: string[] };
 *   knownLimitations: string[];
 *   artifactNaming: { generic: string; appImage: string; dmg: string; nsis: string };
 *   platforms: { linux: string; darwin: string; win32: string };
 * }}
 */
function getBetaMetadata(opts) {
  const signing = getSigningConfig();
  const iconPath = getIconPath();
  return {
    version: getDesktopVersion(),
    betaVersion: getBetaVersion(opts),
    betaLabel: getBetaLabel(opts),
    productIdentity: getProductIdentity(),
    signing: {
      configured: signing.configured,
      active: signing.active,
      summary: signing.summary,
    },
    icon: {
      present: !!iconPath,
      path: iconPath,
      placeholderPath: getIconPlaceholderPath(),
      supportedFormats: SUPPORTED_ICON_FORMATS,
    },
    knownLimitations: BETA_KNOWN_LIMITATIONS,
    artifactNaming: {
      generic: "${productName}-${version}-${os}-${arch}.${ext}",
      appImage: "${productName}-${version}-${arch}.${ext}",
      dmg: "${productName}-${version}-${arch}.${ext}",
      nsis: "${productName}-Setup-${version}-${arch}.${ext}",
    },
    platforms: {
      linux: "AppImage",
      darwin: "dmg",
      win32: "nsis",
    },
  };
}

/**
 * Release stage — indicates the current product release stage.
 * Transitions: "beta" → "v1" → future stages.
 */
const RELEASE_STAGE = "v1";

/**
 * Known limitations for V1 release.
 * This list is the canonical reference for V1 — docs and release notes
 * should mirror it.
 */
const V1_KNOWN_LIMITATIONS = [
  "No install execution — plans are informational only and are never executed",
  "MCP transport — only stdio transport is implemented; sse and streamable_http are deferred",
  "Agent execution — declarative routing only; no autonomous agent execution loop",
  "Session persistence — MCP processes and agent runtime state are not preserved across save/restore",
  "Real-time updates — request/response only; no WebSocket or SSE push",
  "GitHub MCP — read-only tools only; manual discovery; no token validation or rate limiting",
  "Language service — minimal diagnostics layer; no persistent LSP daemon or real-time streaming",
  "Unsigned builds — users will see OS security warnings; code signing is env-driven but not yet active",
  "No auto-update — users must manually download new builds",
  "No custom application icon — uses Electron default icon",
  "No crash reporting — errors shown in-window only",
];

/**
 * Return a release label string for display / artifact purposes.
 * Format: "v1" for the V1 release, "beta" or "beta.N" for beta releases.
 *
 * @returns {string}
 */
function getReleaseLabel() {
  return RELEASE_STAGE;
}

/**
 * Return a release version string for V1.
 * Returns the base version from package.json (e.g. "1.0.0").
 *
 * @returns {string}
 */
function getReleaseVersion() {
  return getDesktopVersion();
}

/**
 * Return comprehensive V1 release metadata for release notes, docs, and tests.
 *
 * @returns {{
 *   version: string;
 *   releaseStage: string;
 *   releaseLabel: string;
 *   productIdentity: ReturnType<typeof getProductIdentity>;
 *   signing: { configured: boolean; active: boolean; summary: string };
 *   icon: { present: boolean; path: string | null; placeholderPath: string; supportedFormats: string[] };
 *   knownLimitations: string[];
 *   artifactNaming: { generic: string; appImage: string; dmg: string; nsis: string };
 *   platforms: { linux: string; darwin: string; win32: string };
 * }}
 */
function getReleaseMetadata() {
  const signing = getSigningConfig();
  const iconPath = getIconPath();
  return {
    version: getDesktopVersion(),
    releaseStage: RELEASE_STAGE,
    releaseLabel: getReleaseLabel(),
    productIdentity: getProductIdentity(),
    signing: {
      configured: signing.configured,
      active: signing.active,
      summary: signing.summary,
    },
    icon: {
      present: !!iconPath,
      path: iconPath,
      placeholderPath: getIconPlaceholderPath(),
      supportedFormats: SUPPORTED_ICON_FORMATS,
    },
    knownLimitations: V1_KNOWN_LIMITATIONS,
    artifactNaming: {
      generic: "${productName}-${version}-${os}-${arch}.${ext}",
      appImage: "${productName}-${version}-${arch}.${ext}",
      dmg: "${productName}-${version}-${arch}.${ext}",
      nsis: "${productName}-Setup-${version}-${arch}.${ext}",
    },
    platforms: {
      linux: "AppImage",
      darwin: "dmg",
      win32: "nsis",
    },
  };
}

/**
 * Return the icon configuration status.
 * Reports whether an icon exists, where it's expected, and what formats
 * are supported.
 *
 * @returns {{
 *   present: boolean;
 *   path: string | null;
 *   placeholderPath: string;
 *   supportedFormats: string[];
 *   recommendation: string;
 * }}
 */
function getIconConfig() {
  const iconPath = getIconPath();
  const placeholderPath = getIconPlaceholderPath();
  const present = !!iconPath;

  const recommendation = present
    ? "Icon found — electron-builder will use it for all platforms"
    : `No icon found at ${placeholderPath}. Place a 512×512 PNG there for custom branding.`;

  return {
    present,
    path: iconPath,
    placeholderPath,
    supportedFormats: SUPPORTED_ICON_FORMATS,
    recommendation,
  };
}

/**
 * Validate that desktop metadata is internally consistent between
 * package.json, electron-builder.config.js values, and config.cjs constants.
 *
 * This is a structural check only — it does NOT read electron-builder.config.js
 * directly (that file may not be available at runtime in packaged mode).
 * Instead, it validates config.cjs's own constants against package.json.
 *
 * @returns {{ ok: boolean; issues: string[]; checked: string[] }}
 */
function validateDesktopMetadata() {
  const issues = [];
  const checked = [];

  // Check product name consistency
  checked.push("APP_TITLE matches PRODUCT_NAME");
  if (APP_TITLE !== PRODUCT_NAME) {
    issues.push(`APP_TITLE ("${APP_TITLE}") does not match PRODUCT_NAME ("${PRODUCT_NAME}")`);
  }

  // Check version is valid semver-like
  const version = getDesktopVersion();
  checked.push("version is semver-like");
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    issues.push(`Version "${version}" does not look like a valid semver string`);
  }

  // Check appId format (reverse-domain)
  checked.push("appId is reverse-domain format");
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(PRODUCT_APP_ID)) {
    issues.push(`appId "${PRODUCT_APP_ID}" is not in reverse-domain format`);
  }

  // Check icon placeholder path is under assets/
  const iconPlaceholder = getIconPlaceholderPath();
  checked.push("icon placeholder path is under assets/");
  if (!iconPlaceholder.includes("assets")) {
    issues.push(`Icon placeholder path "${iconPlaceholder}" is not under assets/`);
  }

  // Check product description is non-empty
  checked.push("product description is non-empty");
  if (!PRODUCT_DESCRIPTION || PRODUCT_DESCRIPTION.length < 10) {
    issues.push("Product description is missing or too short");
  }

  // Check known limitations list is non-empty
  checked.push("known limitations list is non-empty");
  if (!BETA_KNOWN_LIMITATIONS || BETA_KNOWN_LIMITATIONS.length === 0) {
    issues.push("Beta known limitations list is empty");
  }

  return { ok: issues.length === 0, issues, checked };
}

/**
 * Validate that artifact naming patterns are self-consistent and include
 * the expected template variables.
 *
 * @returns {{ ok: boolean; issues: string[]; checked: string[] }}
 */
function validateArtifactNaming() {
  const issues = [];
  const checked = [];

  const patterns = {
    generic: "${productName}-${version}-${os}-${arch}.${ext}",
    appImage: "${productName}-${version}-${arch}.${ext}",
    dmg: "${productName}-${version}-${arch}.${ext}",
    nsis: "${productName}-Setup-${version}-${arch}.${ext}",
  };

  const requiredVars = ["${productName}", "${version}", "${arch}", "${ext}"];

  for (const [name, pattern] of Object.entries(patterns)) {
    checked.push(`${name} pattern is a non-empty string`);
    if (typeof pattern !== "string" || pattern.length === 0) {
      issues.push(`${name} artifact naming pattern is empty`);
      continue;
    }

    for (const v of requiredVars) {
      checked.push(`${name} contains ${v}`);
      if (!pattern.includes(v)) {
        issues.push(`${name} pattern "${pattern}" is missing required variable ${v}`);
      }
    }
  }

  // nsis should include "Setup" in the name
  checked.push("nsis pattern includes 'Setup'");
  if (!patterns.nsis.includes("Setup")) {
    issues.push("nsis pattern should include 'Setup' for clarity");
  }

  return { ok: issues.length === 0, issues, checked };
}

module.exports = {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  APP_TITLE,
  SERVER_START_TIMEOUT_MS,
  GRACEFUL_KILL_TIMEOUT_MS,
  SECURITY_DEFAULTS,
  getDesktopVersion,
  buildWindowTitle,
  getIconPlaceholderPath,
  isLocalUrl,
  buildLocalUrl,
  renderLoadingHtml,
  renderErrorHtml,
  // Phase 33: packaged-mode helpers
  isPackaged,
  getAppRoot,
  getServerLaunchConfig,
  getPreloadPath,
  getRequiredPackagedFiles,
  getRequiredPackagedDirs,
  // Phase 34: first-run polish helpers
  escapeHtml,
  validatePackagedRuntime,
  buildEnvironmentSummary,
  getIconPath,
  // Phase 35: installer generation helpers
  getInstallerTargets,
  // Phase 36: code-signing readiness helpers
  SIGNING_ENV_VARS,
  getSigningConfig,
  isSigningConfigured,
  getReleaseReadiness,
  // Phase 37: desktop release polish / public beta readiness helpers
  PRODUCT_APP_ID,
  PRODUCT_NAME,
  PRODUCT_DESCRIPTION,
  SUPPORTED_ICON_FORMATS,
  BETA_KNOWN_LIMITATIONS,
  getProductIdentity,
  getBetaLabel,
  getBetaVersion,
  getBetaMetadata,
  getIconConfig,
  validateDesktopMetadata,
  validateArtifactNaming,
  // Phase 42: V1 release hardening helpers
  RELEASE_STAGE,
  V1_KNOWN_LIMITATIONS,
  getReleaseLabel,
  getReleaseVersion,
  getReleaseMetadata,
};
