# Packaging Decision — Phase 17

## Decision

**Chosen path: Enhanced local web shell + desktop launcher**

Keep the current zero-dependency Node.js HTTP server and add a desktop-style
launcher that starts the server and auto-opens the browser.

## Why this fits the current architecture

- **Zero new dependencies** — the shell already runs on Node.js built-in `http`;
  opening a browser uses `child_process.exec` with platform-native commands.
- **Minimal disruption** — no framework migration, no build toolchain changes,
  no native compilation step.
- **Local-first by design** — the server binds to `localhost`, the browser is the
  presentation layer, and the entire lifecycle is a single process tree.
- **Works everywhere Node.js works** — Linux, macOS, Windows with no extra
  installers or platform-specific packaging.

## Why alternatives are deferred

| Alternative | Reason deferred |
|-------------|----------------|
| **Electron** | ~200 MB footprint, Chromium bundling, complex auto-update pipeline, separate build system. Premature before the product surface is stable. |
| **Tauri** | Requires Rust toolchain and platform-specific build. Good future option if a native window is needed, but adds significant build complexity right now. |
| **Compiled binary (pkg / nexe)** | Snapshot-based bundling is fragile with dynamic imports and `data/` directories. Better suited for a later release phase. |

## What Phase 17 adds

1. **`--open` flag** on the app shell server — auto-opens the default browser
   after the server starts listening.
2. **Graceful shutdown** — Ctrl+C prints a clean shutdown message and closes
   the server before exiting.
3. **Desktop launcher script** (`scripts/desktop-launch.ts`) — runs preflight
   checks, starts the server with `--open`, and provides a single-command
   desktop-like experience.
4. **`npm run app-shell:desktop`** script — one-command launch for the desktop
   product path.
5. **`openBrowser()` utility** — cross-platform browser opener using
   platform-native commands (`open`, `xdg-open`, `start`).

## What is still missing before a polished desktop product

- Native window wrapper (Electron or Tauri) for a true desktop feel
- Application icon and metadata
- Auto-update mechanism
- OS-level installer / DMG / MSI / AppImage packaging
- Tray/dock integration
- Offline-first asset bundling
- Splash screen / loading state before server is ready

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
