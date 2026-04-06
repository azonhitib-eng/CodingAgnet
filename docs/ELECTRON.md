# Electron Desktop Wrapper — Phase 31

## Overview

Phase 31 adds an Electron desktop wrapper around the existing CodingAgent app
shell. The wrapper provides a native desktop window experience without requiring
the user to manually open a browser.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron Main Process (electron/main.cjs)  │
│                                             │
│  1. Find available TCP port                 │
│  2. Spawn app-shell server as child process │
│  3. Wait for server ready signal            │
│  4. Create BrowserWindow → localhost:PORT   │
│  5. Manage lifecycle (startup/shutdown)      │
└──────────────────┬──────────────────────────┘
                   │
                   │ child_process.spawn
                   ▼
┌─────────────────────────────────────────────┐
│  App Shell Server (src/app-shell/server.ts) │
│                                             │
│  Existing HTTP server — unchanged           │
│  Serves HTML/CSS/JS, API routes             │
└──────────────────┬──────────────────────────┘
                   │
                   │ http://localhost:PORT
                   ▼
┌─────────────────────────────────────────────┐
│  Electron BrowserWindow (renderer)          │
│                                             │
│  Loads the app shell as a normal web page   │
│  No Node.js access, sandboxed, isolated     │
└─────────────────────────────────────────────┘
```

**Key design choices:**

- The Electron main process is a **thin wrapper** — it does not duplicate any
  backend logic
- The app-shell server runs as a **child process**, not inside Electron's main
  process, to preserve the existing architecture
- The BrowserWindow loads the **same local URL** that would normally be opened
  in a regular browser
- Port is **dynamically allocated** to avoid conflicts
- All existing features (demo mode, real mode, sessions, MCP, agents, commands)
  work unchanged

## How to Launch

### Desktop mode (Electron window)

```bash
npm run desktop
```

This will:
1. Find an available port
2. Start the app-shell server
3. Open a native Electron window
4. Handle Ctrl+C / window close cleanly

### Development mode

```bash
npm run desktop:dev
```

Same as above but with Electron DevTools available (Ctrl+Shift+I / Cmd+Option+I).

### Browser mode (unchanged)

The existing browser-based launch paths still work:

```bash
npm run app-shell              # Start server, open browser manually
npm run app-shell:open         # Start server, auto-open browser
npm run app-shell:desktop      # Preflight + server + auto-open browser
```

## File Structure

```
electron/
├── main.cjs      — Electron main process (server management, window creation)
├── preload.cjs   — Minimal preload script (intentionally empty for now)
└── config.cjs    — Shared configuration constants (testable without Electron)
```

## Security

The Electron wrapper follows conservative security defaults:

| Setting              | Value   | Purpose |
|---------------------|---------|---------|
| `nodeIntegration`   | `false` | No Node.js APIs in the renderer |
| `contextIsolation`  | `true`  | Preload runs in separate context |
| `sandbox`           | `true`  | Renderer is sandboxed |
| `enableRemoteModule`| `false` | Deprecated remote module disabled |
| `webviewTag`        | `false` | No webview embedding |

Additional protections:
- **Navigation restricted** — the BrowserWindow can only navigate to the local
  server origin
- **New windows blocked** — `window.open()` and `<a target="_blank">` are denied
- **Webview attachment blocked** — prevents dynamic webview injection
- **Local-only loading** — only `http://localhost` URLs are loaded
- **No remote content** — the app never fetches from external domains in the
  wrapper layer

## Startup / Shutdown Flow

### Startup
1. Electron `app.whenReady()` fires
2. `findAvailablePort()` binds to port 0 to get a free port
3. `startAppShellServer(port)` spawns `npx tsx src/app-shell/server.ts --port PORT`
4. Main process watches stdout for the server URL line
5. Once detected, `createMainWindow(url)` opens the BrowserWindow
6. Window shows after `ready-to-show` to prevent white flash

### Shutdown
- **Window close** → `window-all-closed` → kill server → `app.quit()`
- **Ctrl+C / SIGTERM** → `before-quit` → kill server
- **Server kill** → sends `SIGTERM`, force `SIGKILL` after 3 seconds

## What This Phase Includes

- ✅ Electron main process wrapper
- ✅ Secure BrowserWindow configuration
- ✅ Dynamic port allocation
- ✅ Server child process management
- ✅ Clean startup/shutdown lifecycle
- ✅ `npm run desktop` and `npm run desktop:dev` scripts
- ✅ Preload script (intentionally minimal)
- ✅ Configuration module for testable constants
- ✅ Deterministic test suite

## What Is Still Missing Before a Polished Desktop Product

- Application icon and metadata (Electron `forge` or `builder` config)
- Auto-update mechanism (`electron-updater`)
- OS-level installer generation (DMG, MSI, AppImage, deb)
- Tray / dock integration
- Splash screen / loading indicator before server is ready
- Native file dialogs via IPC bridge
- Menu bar customization
- System notifications
- Offline-first asset bundling (embed server output instead of spawning)
- Code signing for distribution
- Crash reporting

## Limitations

- **Requires Node.js and npm** — this is a development/power-user desktop mode,
  not a standalone redistributable binary
- **No installer** — users must clone the repo and run `npm install`
- **Server is a child process** — there is a brief startup delay while the
  server starts
- **Port is ephemeral** — the port changes on each launch (by design, to avoid
  conflicts)
- **Electron binary is large** — adds ~200 MB to `node_modules`; this is a
  devDependency only and is not included in the published npm package
