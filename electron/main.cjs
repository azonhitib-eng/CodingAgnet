/**
 * Electron main process for CodingAgent desktop wrapper.
 *
 * Architecture:
 *   - Shows a loading page immediately in the BrowserWindow
 *   - Spawns the existing app-shell server as a child process
 *   - Waits for the server to be ready (detects the local URL from stdout)
 *   - Navigates the window to the local URL
 *   - Shows an error page if the server fails to start
 *   - Cleans up the child process on quit
 *
 * This is intentionally a thin wrapper — all app logic stays in the app-shell.
 *
 * Phase 33: server launch now uses config.getServerLaunchConfig() to support
 * both dev mode (npx tsx, TypeScript) and packaged mode (node, compiled JS).
 *
 * Phase 34: loading/error pages now adapt wording for packaged vs dev mode.
 * Runtime validation runs before server launch in packaged mode.
 * Window icon uses fallback behavior via getIconPath().
 */

"use strict";

const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const path = require("node:path");

const config = require("./config.cjs");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const isDev = process.env.ELECTRON_DEV === "1";

// ---------------------------------------------------------------------------
// Port utilities
// ---------------------------------------------------------------------------

/**
 * Find an available TCP port by briefly binding to port 0.
 * Returns a Promise that resolves to the port number.
 */
function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Server child process management
// ---------------------------------------------------------------------------

/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null;

/**
 * Start the app-shell server as a child process.
 * In dev mode: uses npx tsx (TypeScript).
 * In packaged mode: uses node with compiled JS.
 * Returns a Promise that resolves to the local URL once the server is ready.
 *
 * @param {number} port - Port number to use
 * @returns {Promise<string>} The local URL (e.g. http://localhost:12345)
 */
function startAppShellServer(port) {
  return new Promise((resolve, reject) => {
    const launchConfig = config.getServerLaunchConfig();

    // On Windows, .cmd/.bat files require shell: true to be spawnable.
    // Without it, spawn throws EINVAL.
    const needsShell = process.platform === "win32";

    serverProcess = spawn(launchConfig.command, [...launchConfig.args, "--port", String(port)], {
      cwd: config.getAppRoot(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_DESKTOP: "1" },
      ...(needsShell ? { shell: true } : {}),
    });

    let resolved = false;
    const expectedUrl = `http://localhost:${port}`;

    // Watch stdout for the server ready signal (the URL line in the banner)
    serverProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      // In dev mode, forward server output to the terminal
      if (isDev) {
        process.stdout.write(text);
      }
      if (!resolved && text.includes(`http://localhost:${port}`)) {
        resolved = true;
        resolve(expectedUrl);
      }
    });

    serverProcess.stderr.on("data", (chunk) => {
      if (isDev) {
        process.stderr.write(chunk.toString());
      }
    });

    serverProcess.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start app-shell server: ${err.message}`));
      }
    });

    serverProcess.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`App-shell server exited unexpectedly with code ${code}`));
      }
    });

    // Timeout after configured duration
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Timed out waiting for app-shell server to start"));
      }
    }, config.SERVER_START_TIMEOUT_MS);
  });
}

/**
 * Stop the app-shell server child process.
 */
function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    // Force kill after timeout if still running
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }, config.GRACEFUL_KILL_TIMEOUT_MS);
  }
  serverProcess = null;
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Create the main application window and immediately show
 * a loading page while the server boots.
 *
 * @param {{ packaged?: boolean }} [opts]
 * @returns {BrowserWindow}
 */
function createMainWindow(opts) {
  const packaged = !!(opts && opts.packaged);
  const windowTitle = config.buildWindowTitle({ isDev });

  // Use icon if it exists on disk, otherwise omit (default Electron icon)
  const iconPath = config.getIconPath();
  const iconOpts = iconPath ? { icon: iconPath } : {};

  mainWindow = new BrowserWindow({
    width: config.DEFAULT_WIDTH,
    height: config.DEFAULT_HEIGHT,
    minWidth: config.MIN_WIDTH,
    minHeight: config.MIN_HEIGHT,
    title: windowTitle,
    ...iconOpts,
    webPreferences: {
      // Security: no Node.js integration in the renderer
      nodeIntegration: false,
      // Security: context isolation keeps preload separate from page JS
      contextIsolation: true,
      // Security: disable remote module
      enableRemoteModule: false,
      // Security: sandboxed renderer
      sandbox: true,
      // Preload script for any future bridge needs
      preload: config.getPreloadPath(),
      // Security: disable webview tag
      webviewTag: false,
    },
    // Show window with loading page immediately
    show: false,
    backgroundColor: "#1a1a2e",
  });

  // Show window once loading content is painted
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Load the loading page immediately — adapts wording for packaged mode
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(config.renderLoadingHtml({ packaged }))}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Configure security restrictions on a BrowserWindow for a given app origin.
 * @param {BrowserWindow} win
 * @param {string} allowedOrigin
 */
function applyNavigationSecurity(win, allowedOrigin) {
  // Security: prevent navigation away from local app
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    if (parsed.origin !== allowedOrigin) {
      event.preventDefault();
    }
  });

  // Security: prevent new windows from opening
  win.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
}

/**
 * Navigate the main window to the running server URL.
 * @param {string} url
 */
function navigateToApp(url) {
  if (!mainWindow) return;
  const origin = new URL(url).origin;
  applyNavigationSecurity(mainWindow, origin);
  mainWindow.loadURL(url);
}

/**
 * Show the error page in the main window.
 * @param {string} message
 * @param {{ packaged?: boolean }} [opts]
 */
function showErrorPage(message, opts) {
  if (!mainWindow) return;
  const packaged = !!(opts && opts.packaged);
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(config.renderErrorHtml(message, { packaged }))}`);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

async function boot() {
  const packaged = config.isPackaged();
  if (isDev) {
    console.log();
    console.log("  CodingAgent — Desktop Mode (Electron) [Dev]");
    console.log("  " + "─".repeat(44));
    console.log(`  Packaged: ${packaged}`);
    console.log();
  }

  // Step 0 (Phase 34): In packaged mode, validate runtime prerequisites
  if (packaged) {
    const validation = config.validatePackagedRuntime();
    if (!validation.ok) {
      const detail = validation.issues.join("\n");
      const userMsg = "Some required application files are missing.\n\n" + detail;
      createMainWindow({ packaged: true });
      showErrorPage(userMsg, { packaged: true });
      return;
    }
  }

  // Step 1: Create window immediately with loading page
  createMainWindow({ packaged });

  try {
    // Step 2: Find available port
    if (isDev) console.log("  Finding available port…");
    const port = await findAvailablePort();
    if (isDev) console.log(`  Using port ${port}\n`);

    // Step 3: Start app-shell server
    if (isDev) console.log("  Starting app-shell server…");
    const url = await startAppShellServer(port);
    if (isDev) {
      console.log();
      console.log(`  ✅  Server ready at ${url}`);
      console.log();
    }

    // Step 4: Navigate window to the app
    navigateToApp(url);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (isDev) {
      console.error(`  ❌  Desktop startup failed: ${msg}`);
    }
    // Show error page with mode-appropriate guidance
    showErrorPage(msg, { packaged });
  }
}

// Electron app lifecycle
app.whenReady().then(boot);

app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});

app.on("before-quit", () => {
  stopServer();
});

// Security: disable additional renderer creation
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

// macOS: re-create window when dock icon is clicked
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverProcess) {
    const port = serverProcess.spawnargs.find((_a, i, arr) => arr[i - 1] === "--port");
    if (port) {
      createMainWindow();
      navigateToApp(`http://localhost:${port}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== "undefined") {
  module.exports = {
    findAvailablePort,
    config,
  };
}
