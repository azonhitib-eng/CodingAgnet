/**
 * Electron configuration constants for CodingAgent desktop wrapper.
 *
 * Centralizes configurable values used by the main process and tests.
 * Keeping these in a separate file makes them easy to test without
 * importing Electron APIs.
 */

"use strict";

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

module.exports = {
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
};
