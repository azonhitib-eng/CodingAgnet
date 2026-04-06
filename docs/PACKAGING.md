# Packaging Decision — Phases 17, 31 & 33

## Decision

**Phase 17: Enhanced local web shell + desktop launcher**
**Phase 31: Electron desktop wrapper — first usable desktop slice**
**Phase 33: First distributable desktop build via electron-builder**

Phase 17 established the browser-based desktop launcher. Phase 31 adds an
actual Electron wrapper that opens the app in a native desktop window.

Both paths remain available:
- `npm run app-shell:desktop` — browser-based (Phase 17, no Electron needed)
- `npm run desktop` — Electron window (Phase 31)

## Why this fits the current architecture

- **Wrapper only** — Electron sits on top of the existing app-shell server;
  no backend logic is duplicated inside Electron.
- **Child process model** — the Electron main process spawns the existing
  server as a child process and loads its URL in a BrowserWindow.
- **Local-first** — only `http://localhost` URLs are loaded; no remote content.
- **Works everywhere Node.js works** — Linux, macOS, Windows.
- **Backwards compatible** — all existing browser-based scripts still work.

## Phase 17 additions (browser-based)

1. `--open` flag on the app shell server
2. Graceful shutdown (Ctrl+C)
3. Desktop launcher script (`scripts/desktop-launch.ts`)
4. `npm run app-shell:desktop` — one-command browser-based launch
5. `openBrowser()` utility

## Phase 31 additions (Electron)

1. `electron/main.cjs` — Electron main process
2. `electron/preload.cjs` — minimal secure preload
3. `electron/config.cjs` — testable configuration constants
4. `npm run desktop` — one-command Electron window launch
5. `npm run desktop:dev` — Electron with DevTools
6. Dynamic port allocation
7. Clean startup/shutdown lifecycle
8. Conservative BrowserWindow security defaults

See [`docs/ELECTRON.md`](./ELECTRON.md) for full details.

## Phase 33 additions (electron-builder packaging)

1. `electron-builder.config.js` — deterministic packaging config
2. `npm run desktop:build` — compile TypeScript + electron-builder full build
3. `npm run desktop:pack` — compile TypeScript + electron-builder directory-only build
4. Packaged-mode detection: `isPackaged()` in `electron/config.cjs`
5. Packaged-mode server launch: uses `node dist/app-shell/server.js` instead of `npx tsx`
6. Packaged-mode path helpers: `getAppRoot()`, `getPreloadPath()`, `getServerLaunchConfig()`
7. Required files/dirs validation helpers for smoke testing
8. `dist-electron/` output directory (gitignored)
9. Supports Linux, macOS, Windows — `dir` target only (no installers)
10. No code signing, no auto-update

## Why further alternatives are deferred

| Alternative | Reason deferred |
|-------------|----------------|
| **Tauri** | Requires Rust toolchain and platform-specific build. Good future option for smaller binaries. |
| **Compiled binary (pkg / nexe)** | Snapshot-based bundling is fragile with dynamic imports and `data/` directories. |
| **Electron auto-update** | Requires a release/update server. Premature before the product is distributed. |
| **Installer generation** | DMG/MSI/AppImage requires `electron-builder` or `electron-forge` config. Deferred until the product surface is stable. |

## What is still missing before a polished desktop product

- Application icon and metadata
- Auto-update mechanism (`electron-updater`)
- OS-level installer / DMG / MSI / AppImage packaging (currently `dir` only)
- Code signing for distribution
- Tray/dock integration
- Offline-first asset bundling (embed server instead of spawning)
- Native file dialogs via IPC
- Menu bar customization
- Cross-platform build automation (CI matrix)
- Tree-shaking / bundling of production dependencies

## CodeQL alert status

CodeQL code scanning is **not enabled** on this repository (confirmed via GitHub
API — returns 403 "Code scanning is not enabled"). No pre-existing alerts exist
to fix or defer. If CodeQL is enabled in the future, all current source should
be scanned and any findings addressed.

## Security notes

- `openBrowser()` validates the URL protocol (`http:` or `https:` only) before
  passing it to the system command, preventing command injection via crafted URLs.
- The server binds to `localhost` only — not exposed to the network.
- No secrets or credentials are involved in the packaging path.
