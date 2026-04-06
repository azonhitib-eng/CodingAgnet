# Electron Desktop Wrapper — Phase 31 + Phase 32

## Overview

Phase 31 added an Electron desktop wrapper around the existing CodingAgent app
shell. Phase 32 polished the desktop experience with a loading page, error
handling, versioned window titles, desktop-aware server banner, and a preload
bridge.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Electron Main Process (electron/main.cjs)  │
│                                             │
│  1. Create BrowserWindow with loading page  │
│  2. Find available TCP port                 │
│  3. Spawn app-shell server as child process │
│  4. Wait for server ready signal            │
│  5. Navigate window to localhost:PORT       │
│  6. On failure → show error page in window  │
│  7. Manage lifecycle (startup/shutdown)      │
└──────────────────┬──────────────────────────┘
                   │
                   │ child_process.spawn
                   ▼
┌─────────────────────────────────────────────┐
│  App Shell Server (src/app-shell/server.ts) │
│                                             │
│  Existing HTTP server — unchanged           │
│  Detects ELECTRON_DESKTOP=1 for banner      │
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
│  Preload bridge: window.desktop metadata    │
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
1. Open a native window immediately with a loading page
2. Find an available port
3. Start the app-shell server
4. Navigate the window to the app once ready
5. If the server fails, show an error page with troubleshooting hints

### Development mode

```bash
npm run desktop:dev
```

Same as above but with:
- Server output forwarded to the terminal
- `[Dev]` suffix in the window title
- Electron DevTools available (Ctrl+Shift+I / Cmd+Option+I)

### Browser mode (unchanged)

The existing browser-based launch paths still work:

```bash
npm run app-shell              # Start server, open browser manually
npm run app-shell:open         # Start server, auto-open browser
npm run app-shell:desktop      # Preflight + server + auto-open browser
```

## Browser vs Desktop — Comparison

| Feature                  | Browser mode           | Desktop mode (Electron)  |
|--------------------------|------------------------|--------------------------|
| Launch command           | `npm run app-shell`    | `npm run desktop`        |
| Window                   | Default browser tab    | Native Electron window   |
| Loading indicator        | Browser loading bar    | Branded loading page     |
| Server failure           | Terminal error message | In-window error page     |
| Banner messaging         | Includes browser tips  | Desktop-tailored         |
| Dev tools                | Browser DevTools       | `npm run desktop:dev`    |
| Desktop metadata         | Not available          | `window.desktop` bridge  |
| Requires Electron dep    | No                     | Yes (devDependency)      |

## File Structure

```
electron/
├── main.cjs      — Main process (loading page, server management, window, error handling)
├── preload.cjs   — Preload script (exposes window.desktop bridge with metadata)
└── config.cjs    — Shared config (constants, HTML renderers, version, title builder)
```

## Desktop Startup Flow (Phase 32)

```
app.whenReady()
  │
  ├─ createMainWindow()          ← Window shown immediately with loading page
  │     └─ loadURL(data:...)     ← Branded spinner + "Starting app shell server…"
  │
  ├─ findAvailablePort()         ← Bind to port 0 to get a free port
  │
  ├─ startAppShellServer(port)   ← Spawn child process
  │     ├─ Watch stdout for URL
  │     └─ Timeout after 15s
  │
  ├─ [SUCCESS] navigateToApp(url) ← Load the actual app shell
  │     └─ applyNavigationSecurity()
  │
  └─ [FAILURE] showErrorPage(msg) ← Show branded error page with:
        ├─ Error message
        ├─ Troubleshooting hints
        └─ Retry button
```

## Shutdown Flow

- **Window close** → `window-all-closed` → kill server → `app.quit()`
- **Ctrl+C / SIGTERM** → `before-quit` → kill server
- **Server kill** → sends `SIGTERM`, force `SIGKILL` after 3 seconds

## Desktop Identity (Phase 32)

- **Window title**: `CodingAgent v0.1.0` (production) or `CodingAgent v0.1.0 [Dev]` (dev mode)
- **Background color**: `#1a1a2e` (dark) — prevents white flash between loading and app
- **Icon placeholder**: `assets/icon.png` — path is defined for future icon support
- **Preload bridge**: `window.desktop` exposes `{ isDesktop, appName, version }`
- **Server banner**: Desktop-tailored (no "open URL in browser" tips)

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
- **Preload bridge is read-only** — only safe metadata exposed, no process/fs access

## Troubleshooting

### Server fails to start

If you see the error page in the Electron window:

1. **Check dependencies**: Run `npm install` in the project root
2. **Check Node.js version**: Requires Node.js ≥ 18
3. **Run in terminal**: Try `npm run app-shell` to see full server output
4. **Check ports**: Make sure no firewall rules block localhost connections
5. **Dev mode**: Use `npm run desktop:dev` for verbose terminal output

### Window is blank

This should not happen after Phase 32 — the window always shows either:
- A loading page (while server boots)
- The app shell (when server is ready)
- An error page (if server failed)

If it does happen, use `npm run desktop:dev` and check the terminal output.

## What This Phase Includes

### Phase 31 (Electron wrapper)
- ✅ Electron main process wrapper
- ✅ Secure BrowserWindow configuration
- ✅ Dynamic port allocation
- ✅ Server child process management
- ✅ Clean startup/shutdown lifecycle
- ✅ `npm run desktop` and `npm run desktop:dev` scripts
- ✅ Preload script (minimal)
- ✅ Configuration module for testable constants
- ✅ Deterministic test suite

### Phase 32 (Desktop polish)
- ✅ Branded loading page shown immediately on startup
- ✅ In-window error page with troubleshooting hints when server fails
- ✅ Versioned window title with dev/prod distinction
- ✅ Icon placeholder path for future icon support
- ✅ Preload bridge (`window.desktop`) for desktop detection
- ✅ Desktop-aware server banner (no terminal-oriented tips)
- ✅ Dark background color to prevent white flash
- ✅ App shell detects desktop mode and updates title
- ✅ Quiet stdout in production mode (verbose only in dev)
- ✅ Retry button on error page
- ✅ Documentation: browser vs desktop comparison, troubleshooting
- ✅ Phase 32 deterministic test suite

## What Is Deferred (Future Phases)

- Application icon asset (the path convention is defined)
- Auto-update mechanism (`electron-updater`)
- OS-level installer generation (DMG, MSI, AppImage, deb)
- Tray / dock integration
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
  server starts (now shown with a loading page)
- **Port is ephemeral** — the port changes on each launch (by design, to avoid
  conflicts)
- **Electron binary is large** — adds ~200 MB to `node_modules`; this is a
  devDependency only and is not included in the published npm package
- **No custom icon yet** — uses default Electron icon; the path convention for
  a custom icon is defined at `assets/icon.png`
