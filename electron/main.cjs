/**
 * Electron main process for CodingAgent desktop wrapper.
 *
 * Architecture:
 *   - Spawns the existing app-shell server as a child process
 *   - Waits for the server to be ready (detects the local URL from stdout)
 *   - Opens a BrowserWindow pointing to the local URL
 *   - Cleans up the child process on quit
 *
 * This is intentionally a thin wrapper — all app logic stays in the app-shell.
 */

"use strict";

const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default window dimensions */
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

/** App title */
const APP_TITLE = "CodingAgent";

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
 * Start the app-shell server as a child process using tsx.
 * Returns a Promise that resolves to the local URL once the server is ready.
 *
 * @param {number} port - Port number to use
 * @returns {Promise<string>} The local URL (e.g. http://localhost:12345)
 */
function startAppShellServer(port) {
  return new Promise((resolve, reject) => {
    const rootDir = path.resolve(__dirname, "..");
    const serverScript = path.join(rootDir, "src", "app-shell", "server.ts");

    // Use npx tsx to run the TypeScript server
    const isWindows = process.platform === "win32";
    const npxCmd = isWindows ? "npx.cmd" : "npx";

    serverProcess = spawn(npxCmd, ["tsx", serverScript, "--port", String(port)], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_DESKTOP: "1" },
    });

    let resolved = false;
    const expectedUrl = `http://localhost:${port}`;

    // Watch stdout for the server ready signal (the URL line in the banner)
    serverProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (!resolved && text.includes(`http://localhost:${port}`)) {
        resolved = true;
        resolve(expectedUrl);
      }
    });

    serverProcess.stderr.on("data", (chunk) => {
      process.stderr.write(chunk.toString());
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

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Timed out waiting for app-shell server to start"));
      }
    }, 15000);
  });
}

/**
 * Stop the app-shell server child process.
 */
function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    // Force kill after 3 seconds if still running
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }, 3000);
  }
  serverProcess = null;
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Create the main application window.
 *
 * @param {string} url - Local URL to load
 */
function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_TITLE,
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
      preload: path.join(__dirname, "preload.cjs"),
      // Security: disable webview tag
      webviewTag: false,
    },
    // Do not show until ready to prevent flash
    show: false,
  });

  // Show window once content is ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Load the local app-shell URL
  mainWindow.loadURL(url);

  // Security: prevent navigation away from local app
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    if (parsed.origin !== new URL(url).origin) {
      event.preventDefault();
    }
  });

  // Security: prevent new windows from opening
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

async function boot() {
  console.log();
  console.log("  CodingAgent — Desktop Mode (Electron)");
  console.log("  " + "─".repeat(44));
  console.log();

  try {
    // Step 1: Find available port
    console.log("  Finding available port…");
    const port = await findAvailablePort();
    console.log(`  Using port ${port}`);
    console.log();

    // Step 2: Start app-shell server
    console.log("  Starting app-shell server…");
    const url = await startAppShellServer(port);
    console.log();
    console.log(`  ✅  Server ready at ${url}`);
    console.log("  Opening desktop window…");
    console.log();

    // Step 3: Create window
    createMainWindow(url);
  } catch (err) {
    console.error(`  ❌  Desktop startup failed: ${err.message}`);
    stopServer();
    app.quit();
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
    // Server is still running, re-create window
    const port = serverProcess.spawnargs.find((_a, i, arr) => arr[i - 1] === "--port");
    if (port) {
      createMainWindow(`http://localhost:${port}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== "undefined") {
  module.exports = {
    findAvailablePort,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    MIN_WIDTH,
    MIN_HEIGHT,
    APP_TITLE,
  };
}
