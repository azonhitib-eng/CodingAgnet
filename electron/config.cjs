/**
 * Electron configuration constants for CodingAgent desktop wrapper.
 *
 * Centralizes configurable values used by the main process and tests.
 * Keeping these in a separate file makes them easy to test without
 * importing Electron APIs.
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
 * @returns {string}
 */
function renderLoadingHtml() {
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
    <p class="status">Starting app shell server…</p>
  </div>
</body>
</html>`;
}

/**
 * Render an error HTML page shown in the BrowserWindow when the
 * app-shell server fails to start. Includes retry guidance and
 * troubleshooting hints.
 * @param {string} message - The error message to display
 * @returns {string}
 */
function renderErrorHtml(message) {
  const safeMessage = String(message || "Unknown error")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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
</style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h1>${APP_TITLE}</h1>
    <p style="color:#888;margin-top:0.25rem;">Could not start the app shell server</p>
    <div class="error-msg">${safeMessage}</div>
    <div class="hints">
      <h2>Troubleshooting</h2>
      <ul>
        <li>Make sure <code>npm install</code> has been run</li>
        <li>Check that Node.js ≥ 18 is installed</li>
        <li>Try running <code>npm run app-shell</code> in a terminal to see full output</li>
        <li>Check for port conflicts or firewall rules</li>
        <li>See <code>docs/ELECTRON.md</code> for desktop troubleshooting</li>
      </ul>
    </div>
    <button class="retry-btn" onclick="window.location.reload()">Retry</button>
  </div>
</body>
</html>`;
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
};
