/**
 * Electron preload script for CodingAgent desktop wrapper.
 *
 * This script runs in a sandboxed context before the renderer page loads.
 * It provides a minimal, controlled bridge between the Electron main process
 * and the renderer (web page).
 *
 * Current scope: expose read-only desktop metadata so the shell UI can
 * detect it is running in a desktop window (vs a plain browser).
 *
 * Security:
 *   - contextIsolation is enabled in the main process
 *   - nodeIntegration is disabled in the main process
 *   - sandbox is enabled in the main process
 *   - Only safe, read-only values are exposed — no Node.js APIs
 */

"use strict";

const { contextBridge } = require("electron");

const config = require("./config.cjs");

/**
 * Expose a small read-only "desktop" namespace to the renderer.
 * The app shell can check `window.desktop` to know it's in Electron.
 */
contextBridge.exposeInMainWorld("desktop", {
  /** Always true when running inside the Electron wrapper */
  isDesktop: true,
  /** Application name */
  appName: config.APP_TITLE,
  /** Package version */
  version: config.getDesktopVersion(),
  /** Whether running from a packaged artifact */
  isPackaged: config.isPackaged(),
});
