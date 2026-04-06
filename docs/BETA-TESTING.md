# Desktop Beta Testing Guide — Phase 37

## Overview

CodingAgent desktop is available as a **public beta**. This document covers
everything a tester needs to install, run, and report issues with the desktop
application on each supported platform.

> **Current status:** Beta builds are **unsigned**. You will see OS security
> warnings on first launch. This is expected and documented below.

## Quick start by platform

### Linux (AppImage)

1. Download `CodingAgent-<version>-x86_64.AppImage`
2. Make it executable:
   ```bash
   chmod +x CodingAgent-*.AppImage
   ```
3. Run it:
   ```bash
   ./CodingAgent-*.AppImage
   ```

No installation required. The AppImage is a portable, self-contained binary.

**Notes:**
- No OS security warnings on Linux
- To integrate with your desktop menu, some distributions offer AppImage
  integration tools (e.g. `AppImageLauncher`)
- If the AppImage fails to launch, ensure FUSE is available:
  ```bash
  sudo apt install libfuse2   # Debian/Ubuntu
  ```

### macOS (dmg)

1. Download `CodingAgent-<version>-arm64.dmg` (Apple Silicon) or
   `CodingAgent-<version>-x64.dmg` (Intel)
2. Open the `.dmg` file
3. Drag **CodingAgent** to your **Applications** folder

**Unsigned build warning (Gatekeeper):**

On first launch, macOS will show:

> "CodingAgent can't be opened because Apple cannot check it for malicious
> software."

**To bypass this warning:**
- **Option A:** Right-click (or Control-click) the app → select **Open** →
  click **Open** in the dialog
- **Option B:** Run in Terminal:
  ```bash
  xattr -cr /Applications/CodingAgent.app
  ```
  Then launch normally.

After the first successful open, macOS remembers your choice and will not
warn again.

### Windows (NSIS installer)

1. Download `CodingAgent-Setup-<version>-x64.exe`
2. Run the installer

**Unsigned build warning (SmartScreen):**

On first launch, Windows may show:

> "Windows protected your PC — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting."

**To bypass this warning:**
- Click **More info**
- Click **Run anyway**

Some corporate/managed environments may block unsigned applications entirely.
Contact your IT administrator if the app is blocked.

**Notes:**
- The installer is a one-click install (no configuration dialogs)
- Installs per-user (no admin required)
- Uninstall via Settings → Apps or Add/Remove Programs

## First-run expectations

When launching CodingAgent for the first time:

1. **Loading screen** — A branded loading page appears immediately with
   "Starting up — this may take a moment…"
2. **Server boot** — The backend server starts as a background process
   (this takes a few seconds)
3. **App ready** — Once the server is running, the full app shell loads
4. **If startup fails** — An error page with troubleshooting hints is shown,
   including a Retry button and a "Help & environment info" section

**Startup delay is normal.** The desktop app spawns a local server process,
which takes 2–5 seconds on most systems. You will always see the loading
screen briefly.

## What to test

### Core functionality
- [ ] App launches and shows the loading screen
- [ ] App loads the full shell after the loading screen
- [ ] Session management works (create, view, timeline)
- [ ] MCP health and discovery UI
- [ ] Agent attachment and management
- [ ] Command composer input
- [ ] Demo mode content loads
- [ ] Window title shows version number
- [ ] Window close exits cleanly (no orphan processes)

### Error handling
- [ ] If you kill the server process, the app shows an error page
- [ ] The Retry button works from the error page
- [ ] The "Help & environment info" section shows correct platform info

### Platform-specific
- [ ] macOS: Gatekeeper bypass works (right-click → Open)
- [ ] macOS: App appears in Dock while running
- [ ] Windows: SmartScreen bypass works (More info → Run anyway)
- [ ] Windows: App appears in taskbar while running
- [ ] Linux: AppImage runs after chmod +x
- [ ] Linux: App appears in taskbar / system tray area

## Known limitations (beta)

The following are known limitations in the current beta. You do not need to
report these unless you encounter unexpected behavior related to them.

1. **Unsigned build** — OS security warnings (Gatekeeper, SmartScreen) are
   expected. See platform-specific bypass instructions above.
2. **No auto-update** — You must manually download and install new beta builds.
   There is no built-in update mechanism.
3. **No custom application icon** — The app uses the default Electron icon.
   A branded icon will be added in a future release.
4. **No tray or dock integration** — The app does not minimize to tray or
   provide dock menus.
5. **Server startup delay** — A loading screen is shown for 2–5 seconds while
   the backend starts. This is inherent to the architecture.
6. **Local-platform-only builds** — Each platform must be built natively.
   Cross-compilation is not supported.
7. **No crash reporting** — Errors are shown in-window but not reported
   externally. Please report crashes manually (see below).
8. **Production dependencies included** — The packaged app includes full
   `node_modules` without tree-shaking. Build size is larger than optimal.

## Reporting issues

When reporting a beta issue, please include:

1. **Platform** — macOS (Intel or Apple Silicon), Windows (version), or
   Linux (distribution)
2. **Build version** — Shown in the window title (e.g. "CodingAgent v0.1.0")
3. **Steps to reproduce** — What you did before the issue occurred
4. **Expected behavior** — What you expected to happen
5. **Actual behavior** — What actually happened
6. **Screenshot** — If applicable
7. **Environment info** — If the error page is shown, expand "Help &
   environment info" and include that information

## Build commands reference

For developers/testers who want to build from source:

| Command | Description | Output |
|---------|-------------|--------|
| `npm run desktop` | Dev run in Electron window | Electron window |
| `npm run desktop:dev` | Dev run with verbose output + DevTools | Electron window |
| `npm run desktop:pack` | Compile + electron-builder (dir only) | `dist-electron/` |
| `npm run desktop:build` | Compile + electron-builder (all targets) | `dist-electron/` |
| `npm run desktop:installer` | Compile + electron-builder (no publish) | `dist-electron/` |

### Prerequisites for building from source

- Node.js ≥ 18
- `npm install` completed
- Build on the target platform (no cross-compilation)

## Signed vs unsigned expectations

| Aspect | Unsigned (current beta) | Signed (future release) |
|--------|------------------------|------------------------|
| macOS | Gatekeeper warning — bypass required | No warning |
| macOS notarization | Not notarized | Notarized (if Apple creds configured) |
| Windows | SmartScreen warning — bypass required | Trusted publisher shown |
| Linux | No warning | No change (AppImage not typically signed) |
| Build command | Same (`npm run desktop:build`) | Same, with signing env vars set |

Code signing is **environment-driven**. When signing certificates and environment
variables are configured, builds are signed automatically. See
[`docs/CODE-SIGNING.md`](./CODE-SIGNING.md) for details.

## What remains before a polished public release

1. **Code signing certificates** — Apple Developer ID ($99/yr), Windows
   Authenticode cert
2. **Custom application icon** — 512×512 PNG at `assets/icon.png`
3. **Auto-update** — `electron-updater` with a release/update server
4. **CI/CD release pipeline** — Automated per-platform builds
5. **Linux package variants** — .deb, .rpm, Snap, Flatpak
6. **Tree-shaking / bundling** — Reduce packaged app size
7. **Crash reporting** — External error reporting service

## Beta release checklist

Before distributing a new beta build:

- [ ] All tests pass (`npm run test`)
- [ ] TypeScript compiles cleanly (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] `npm run desktop:pack` succeeds on the target platform
- [ ] `npm run desktop:installer` produces the expected artifact
- [ ] Artifact file name matches expected pattern (e.g. `CodingAgent-0.1.0-x86_64.AppImage`)
- [ ] Artifact size is reasonable (not empty, not absurdly large)
- [ ] Launch the packaged app — loading screen appears
- [ ] After loading, the full app shell loads
- [ ] Window title shows correct version
- [ ] Close the app — no orphan processes remain
- [ ] Document the build in release notes with:
  - Version number
  - Platform
  - Known limitations
  - Unsigned build warning
  - Download link
- [ ] Update CHANGELOG.md
