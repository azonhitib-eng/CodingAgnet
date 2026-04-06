# Electron Desktop Wrapper — Phase 31 + Phase 32 + Phase 33 + Phase 34 + Phase 35 + Phase 36

## Overview

Phase 31 added an Electron desktop wrapper around the existing CodingAgent app
shell. Phase 32 polished the desktop experience with a loading page, error
handling, versioned window titles, desktop-aware server banner, and a preload
bridge. Phase 33 adds the first real distributable packaging flow using
electron-builder. Phase 34 polishes the first-run and packaged-mode UX so
the desktop app feels coherent and resilient in normal use. Phase 36 adds
code-signing readiness and desktop release polish.

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

### Server fails to start (dev mode)

If you see the error page in the Electron window during development:

1. **Check dependencies**: Run `npm install` in the project root
2. **Check Node.js version**: Requires Node.js ≥ 18
3. **Run in terminal**: Try `npm run app-shell` to see full server output
4. **Check ports**: Make sure no firewall rules block localhost connections
5. **Dev mode**: Use `npm run desktop:dev` for verbose terminal output

### Server fails to start (packaged mode)

In a packaged build, the error page shows user-friendly hints:

1. **Close and reopen** — the issue may be temporary
2. **Check for other instances** — only one instance should run at a time
3. **Check local network** — the app needs localhost connections
4. **Restart your computer** — if the problem persists
5. **Environment info** — expand the "Help & environment info" section on the
   error page for version, platform, and mode details to share with support

### Window is blank

This should not happen after Phase 32 — the window always shows either:
- A loading page (while server boots)
- The app shell (when server is ready)
- An error page (if server failed)

If it does happen, use `npm run desktop:dev` and check the terminal output.

### First-run expectations (Phase 34)

When launching the packaged app for the first time:

- A loading page appears immediately with "Starting up — this may take a moment…"
- The loading page shows the app name and version
- If startup fails, an error page with non-technical wording is shown
- The error page includes a Retry button and a collapsible "Help & environment
  info" section with version, platform, and mode details
- Developer-oriented hints (npm commands, terminal instructions) are only shown
  in development mode, never in the packaged build

## Generating a Packaged Desktop Build (Phase 33)

### Prerequisites

- Node.js ≥ 18
- `npm install` completed (installs electron-builder as devDependency)

### Quick build (directory output only, fastest)

```bash
npm run desktop:pack
```

This will:
1. Compile TypeScript to `dist/` via `tsc`
2. Run electron-builder with `--dir` flag (no installer, just a directory)
3. Output to `dist-electron/` (e.g. `dist-electron/linux-unpacked/`, `dist-electron/mac/`, or `dist-electron/win-unpacked/`)

### Full build

```bash
npm run desktop:build
```

Same as above but may produce additional platform-specific artifacts depending
on the host platform.

### What is included in the artifact

- Compiled backend code (`dist/`)
- Data catalogs (`data/`)
- Electron wrapper files (`electron/main.cjs`, `electron/preload.cjs`, `electron/config.cjs`)
- Runtime dependencies (`node_modules/` — production only)
- Package metadata (`package.json`)
- Bundled Electron binary

### What is NOT included

- TypeScript source (`src/`)
- Test files (`tests/`)
- Documentation (`docs/`)
- Dev-only config files (`eslint.config.js`, `vitest.config.ts`, `tsconfig.json`)

### Where the output appears

```
dist-electron/
├── linux-unpacked/   (on Linux)
├── mac/              (on macOS)
│   └── CodingAgent.app/
└── win-unpacked/     (on Windows)
```

### Platform support in this phase

| Platform | Target | Status |
|----------|--------|--------|
| Linux    | `dir`  | ✅ Supported |
| macOS    | `dir`  | ✅ Supported (unsigned) |
| Windows  | `dir`  | ✅ Supported |

Cross-platform builds (building for a different OS than the host) are NOT
supported in this phase.

### Packaged-mode runtime behavior

In packaged mode, the Electron main process detects that it is inside an
electron-builder artifact and adjusts:

- **Server launch**: uses `node dist/app-shell/server.js` instead of `npx tsx src/app-shell/server.ts`
- **Path resolution**: uses the packaged app root instead of the source tree
- **Preload script**: resolved via `config.getPreloadPath()`
- **Version**: read from the bundled `package.json`

### Known limitations (Phase 34)

- **Unsigned build** — the packaged app is not code-signed; users may see OS warnings
- **No auto-update** — no `electron-updater` or update server
- **No custom icon asset** — the icon fallback mechanism is wired, but no
  `assets/icon.png` is shipped yet; Electron default icon is used
- **No tray/dock integration**
- **Production dependencies included** — `node_modules` contains zod and its
  transitive dependencies; no tree-shaking or bundling is applied
- **Local-platform-only** — cross-compilation is not supported
- **No crash reporting** — errors are shown in-window but not reported externally
- **Server startup delay** — the loading page is always shown briefly while the
  server boots; this is inherent to the child-process architecture

## Generating an Installable Desktop Artifact (Phase 35)

Phase 35 adds the first real installable targets: **AppImage** (Linux),
**dmg** (macOS), and **nsis** (Windows). These are configured in
`electron-builder.config.js` alongside the existing `dir` targets.

### Build the installer

```bash
npm run desktop:installer
```

This will:
1. Compile TypeScript to `dist/` via `tsc`
2. Run electron-builder with all configured targets (dir + installer)
3. Output everything to `dist-electron/`

### Build scripts comparison

| Script                 | What it does                                    | Output |
|------------------------|-------------------------------------------------|--------|
| `npm run app-shell`    | Browser-based shell — no Electron               | Terminal URL |
| `npm run desktop`      | Electron dev run — spawns source server          | Electron window |
| `npm run desktop:dev`  | Same as desktop, verbose + DevTools              | Electron window |
| `npm run desktop:pack` | Compile + electron-builder `--dir` (fastest)     | `dist-electron/` (unpacked dir) |
| `npm run desktop:build`| Compile + electron-builder (all targets)         | `dist-electron/` (dir + installer) |
| `npm run desktop:installer` | Compile + electron-builder `--publish never` | `dist-electron/` (dir + installer) |

### Installer targets by platform

| Platform | Installer target | Artifact                          | How to install |
|----------|------------------|-----------------------------------|----------------|
| Linux    | AppImage         | `CodingAgent-0.1.0-x86_64.AppImage` | `chmod +x` then run directly |
| macOS    | dmg              | `CodingAgent-0.1.0-arm64.dmg` (or x64) | Open dmg, drag to Applications |
| Windows  | nsis             | `CodingAgent-Setup-0.1.0-x64.exe` | Run the installer wizard |

All three platforms also retain the `dir` target for fast local testing.

### Where the output appears (Phase 35)

```
dist-electron/
├── linux-unpacked/                       (dir target)
├── CodingAgent-0.1.0-x86_64.AppImage    (AppImage installer)
├── mac/                                  (dir target)
│   └── CodingAgent.app/
├── CodingAgent-0.1.0-arm64.dmg          (dmg installer)
├── win-unpacked/                         (dir target)
└── CodingAgent-Setup-0.1.0-x64.exe      (nsis installer)
```

Actual filenames depend on the host platform and architecture.

### Platform support (Phase 35)

| Platform | Dir target | Installer target | Status |
|----------|------------|------------------|--------|
| Linux    | ✅ dir     | ✅ AppImage      | Supported |
| macOS    | ✅ dir     | ✅ dmg (unsigned)| Supported (users may see Gatekeeper warning) |
| Windows  | ✅ dir     | ✅ nsis (unsigned)| Supported (users may see SmartScreen warning) |

Cross-platform builds are NOT supported — build on each platform natively.

### Known limitations (Phase 35)

- **Unsigned installer** — no code signing; users will see OS security warnings
  (Gatekeeper on macOS, SmartScreen on Windows)
- **No auto-update** — no `electron-updater` or update server
- **No custom icon asset** — uses Electron default icon
- **No tray/dock integration**
- **Production dependencies included** — no tree-shaking or bundling
- **Local-platform-only** — cross-compilation is not supported
- **No crash reporting**
- **Server startup delay** — inherent to the child-process architecture

### What is still missing before polished public desktop distribution

1. ~~**Code signing**~~ — signing readiness is configured (Phase 36); actual signing requires real certificates
2. **Auto-update** — `electron-updater` with a release/update server
3. **Custom application icon** — `assets/icon.png` (512×512 recommended)
4. **CI/CD release pipeline** — automated builds per platform per release tag
5. **Linux package variants** — `.deb`, `.rpm`, Snap, Flatpak
6. **Offline asset bundling** — embed server instead of child process spawn
7. **Tree-shaking / bundling** — reduce `node_modules` size in packaged app

## Code Signing Readiness (Phase 36)

Code signing is **environment-driven**. When the correct environment variables
are set, `electron-builder` signs artifacts automatically during
`npm run desktop:build` or `npm run desktop:installer`.

### Quick reference

| Platform | Required env vars | Effect |
|----------|-------------------|--------|
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD` | Signs .app and .dmg |
| macOS (notarize) | + `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Notarizes with Apple |
| Windows | `CSC_LINK`, `CSC_KEY_PASSWORD` (or `WIN_CSC_LINK`) | Authenticode signs .exe |
| Linux | (none required) | AppImage is typically unsigned |

### When no signing credentials are set

Builds are **unsigned**. Users will see OS security warnings:

- **macOS Gatekeeper:** "CodingAgent can't be opened because Apple cannot check
  it for malicious software." Workaround: right-click → Open → Open.
- **Windows SmartScreen:** "Windows protected your PC — this app is from an
  unknown publisher." Workaround: click "More info" → "Run anyway."
- **Linux:** No warnings.

### Checking readiness programmatically

```js
const config = require("./electron/config.cjs");
const signing = config.getSigningConfig();
console.log(signing.summary);
// "Signing not configured — set CSC_LINK (and related vars) to enable"
```

See [`docs/CODE-SIGNING.md`](./CODE-SIGNING.md) for the full signing strategy.

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

### Phase 33 (Installer / distribution first slice)
- ✅ electron-builder packaging configuration (`electron-builder.config.js`)
- ✅ `npm run desktop:build` — compile + package full build
- ✅ `npm run desktop:pack` — compile + package directory-only (fastest)
- ✅ Packaged-mode detection (`isPackaged()`)
- ✅ Packaged-mode server launch (compiled JS via `node` instead of `npx tsx`)
- ✅ Packaged-mode path resolution (`getAppRoot()`, `getPreloadPath()`)
- ✅ Required files/dirs validation helpers
- ✅ `dist-electron/` output directory (gitignored)
- ✅ Platform targets: Linux, macOS, Windows (all `dir` target)
- ✅ No code signing, no auto-update, no installer generation
- ✅ Documentation: build commands, output location, known limitations
- ✅ Phase 33 deterministic test suite

### Phase 34 (Desktop first-run polish and packaged UX hardening)
- ✅ Loading page adapts wording for packaged mode ("Starting up — this may take a moment…")
- ✅ Error page adapts wording for packaged vs dev mode
- ✅ Packaged-mode error hints are user-friendly (no npm/terminal commands)
- ✅ Dev-mode error hints remain developer-oriented
- ✅ Error page shows version number in both modes
- ✅ Error page includes collapsible "Help & environment info" section in packaged mode
- ✅ Environment summary: version, platform, arch, mode
- ✅ Runtime validation before server launch in packaged mode (`validatePackagedRuntime`)
- ✅ Server script existence check in packaged mode
- ✅ Icon fallback: `getIconPath()` returns actual path or null (no crash on missing icon)
- ✅ Window icon set from file if it exists, falls back to Electron default
- ✅ Preload bridge extended with `isPackaged` boolean
- ✅ `escapeHtml()` utility for safe HTML rendering
- ✅ `buildEnvironmentSummary()` for diagnostics
- ✅ All previous behavior preserved (demo mode, real mode, sessions, MCP, agents, commands)
- ✅ Phase 34 deterministic test suite (63 tests)

### Phase 35 (Installer generation / first distributable installer)
- ✅ Installable targets: AppImage (Linux), dmg (macOS), nsis (Windows)
- ✅ `npm run desktop:installer` — compile + full installer build with `--publish never`
- ✅ Installer-specific config sections (nsis, dmg, appImage) in `electron-builder.config.js`
- ✅ Linux metadata (synopsis, description) for AppImage desktop integration
- ✅ nsis config: oneClick, per-user install, artifact naming with "Setup" prefix
- ✅ dmg config: artifact naming
- ✅ AppImage config: artifact naming
- ✅ `getInstallerTargets()` helper in `electron/config.cjs` — returns platform-specific installer metadata
- ✅ Dir targets preserved alongside installer targets (all platforms have both)
- ✅ Build path clarity: 5 distinct desktop scripts documented
- ✅ No code signing, no auto-update, no publishing
- ✅ Documentation: installer build instructions, platform support, known limitations, missing steps
- ✅ Phase 35 deterministic test suite

### Phase 36 (Code-signing strategy and desktop release polish)
- ✅ Environment-driven code-signing readiness in `electron-builder.config.js`
- ✅ macOS: `identity` is env-driven (signs when `CSC_LINK` is set, `null` otherwise)
- ✅ macOS: `notarize` is env-driven (active when Apple credentials are present)
- ✅ Windows: `CSC_LINK` / `WIN_CSC_LINK` signing documented in builder config
- ✅ Linux: AppImage unsigned by default, optional GPG noted
- ✅ `SIGNING_ENV_VARS` map in `electron/config.cjs` — per-platform env var definitions
- ✅ `getSigningConfig(platform?)` — checks env var presence, returns readiness status
- ✅ `isSigningConfigured(platform?)` — convenience boolean check
- ✅ `getReleaseReadiness()` — comprehensive release readiness summary
- ✅ `docs/CODE-SIGNING.md` — full per-platform signing guide with env vars and unsigned behavior
- ✅ Updated `docs/ELECTRON.md` with Phase 36 signing readiness section
- ✅ Updated `docs/PACKAGING.md` with Phase 36 additions
- ✅ No fake signing, no auto-update, no backend changes
- ✅ Phase 36 deterministic test suite

## What Is Deferred (Future Phases)

- Application icon asset (the path convention is defined)
- Auto-update mechanism (`electron-updater`)
- Actual signing certificates (readiness is configured, certificates are not)
- Additional Linux package formats (deb, rpm, Snap, Flatpak)
- Tray / dock integration
- Native file dialogs via IPC bridge
- Menu bar customization
- System notifications
- Offline-first asset bundling (embed server output instead of spawning)
- Cross-platform build automation (CI matrix)
- Crash reporting

## Limitations

- **Unsigned by default** — builds are unsigned unless signing environment
  variables are set; users will see OS security warnings (see
  [Code Signing](./CODE-SIGNING.md) for details and workarounds)
- **Requires Node.js and npm** for development builds; the installer bundles
  its own runtime
- **Server is a child process** — there is a brief startup delay while the
  server starts (now shown with a loading page)
- **Port is ephemeral** — the port changes on each launch (by design, to avoid
  conflicts)
- **Electron binary is large** — adds ~200 MB to `node_modules`; this is a
  devDependency only and is not included in the published npm package
- **No custom icon yet** — uses default Electron icon; the path convention for
  a custom icon is defined at `assets/icon.png`
- **Local-platform-only** — cross-compilation is not supported; build on each
  platform natively
