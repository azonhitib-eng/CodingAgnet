/**
 * Electron preload script for CodingAgent desktop wrapper.
 *
 * This script runs in a sandboxed context before the renderer page loads.
 * It provides a minimal, controlled bridge between the Electron main process
 * and the renderer (web page).
 *
 * Current scope: minimal — no IPC exposed yet.
 * Future phases may add contextBridge.exposeInMainWorld() calls here
 * to provide controlled access to desktop features (e.g., native file dialogs).
 *
 * Security:
 *   - contextIsolation is enabled in the main process
 *   - nodeIntegration is disabled in the main process
 *   - sandbox is enabled in the main process
 *   - This preload does not expose any Node.js APIs to the renderer
 */

"use strict";

// Intentionally minimal.
// The app-shell runs as a normal web page with no Node.js access.
// All communication happens via the existing HTTP API (fetch to localhost).

// Future: use contextBridge to expose desktop-specific APIs
// const { contextBridge } = require("electron");
// contextBridge.exposeInMainWorld("desktop", { ... });
