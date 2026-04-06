# Code Signing Strategy — Phase 36

## Overview

CodingAgent desktop builds support environment-driven code signing. When the
correct environment variables are set, `electron-builder` automatically signs
and (on macOS) notarizes the artifacts. When no signing credentials are
present, builds are **unsigned** and users will see OS security warnings.

This document describes:
1. Per-platform signing requirements
2. Environment variables
3. How to verify signing status
4. Expected unsigned behavior
5. What remains before public distribution

## Current status

| Aspect | Status |
|--------|--------|
| Signing infrastructure | ✅ Config supports env-driven signing |
| macOS signing | ⏳ Ready when CSC_LINK + Apple creds are set |
| macOS notarization | ⏳ Ready when APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD are set |
| Windows Authenticode | ⏳ Ready when CSC_LINK (or WIN_CSC_LINK) is set |
| Linux GPG | ⏳ Optional, post-build only |
| Actual signing active | ❌ No — requires real certificates |

## Per-platform signing

### macOS (Gatekeeper + Notarization)

**What it does:** Signs the `.app` bundle and dmg with an Apple Developer ID
certificate, then submits to Apple's notarization service.

**Required environment variables:**

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Path to `.p12` certificate file, or base64-encoded certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` certificate |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |

**How it works:** `electron-builder` reads these variables automatically during
`npm run desktop:build` or `npm run desktop:installer`. When `CSC_LINK` is set,
signing is performed. When `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` are also
set, notarization is performed after signing.

**When not set:** `identity: null` is applied in `electron-builder.config.js`,
which disables signing without producing an error.

### Windows (Authenticode / SmartScreen)

**What it does:** Signs the `.exe` installer with an Authenticode certificate
(code signing certificate from a trusted CA).

**Required environment variables:**

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Path to `.pfx` certificate file, or base64-encoded certificate |
| `CSC_KEY_PASSWORD` | Password for the `.pfx` certificate |

Or platform-specific overrides:

| Variable | Purpose |
|----------|---------|
| `WIN_CSC_LINK` | Windows-only certificate (overrides `CSC_LINK`) |
| `WIN_CSC_KEY_PASSWORD` | Windows-only password (overrides `CSC_KEY_PASSWORD`) |

**How it works:** `electron-builder` reads these variables automatically.
When set, the exe and nsis installer are signed with Authenticode.

**When not set:** The installer is unsigned. Windows SmartScreen will warn
users that the app is from an "unrecognized publisher".

### Linux (optional GPG)

**What it does:** AppImage files are not code-signed by default on Linux.
Optional GPG signing can be applied post-build.

| Variable | Purpose |
|----------|---------|
| `GPG_KEY_ID` | GPG key ID for optional post-build signing |

**When not set:** No signing occurs. This is normal — Linux users do not
typically encounter signing-related warnings for AppImage files.

## Unsigned behavior — what users will see

### macOS (unsigned)

When the dmg or app is unsigned:
- **Gatekeeper warning:** "CodingAgent can't be opened because Apple cannot
  check it for malicious software"
- **Workaround:** Right-click → Open → click "Open" in the dialog, or:
  ```bash
  xattr -cr /Applications/CodingAgent.app
  ```
- The app works normally after the first-open override

### Windows (unsigned)

When the exe/installer is unsigned:
- **SmartScreen warning:** "Windows protected your PC — this app is from an
  unknown publisher"
- **Workaround:** Click "More info" → "Run anyway"
- Some corporate environments may block unsigned apps entirely

### Linux (unsigned)

- No warnings. AppImage runs directly after `chmod +x`.

## Checking signing readiness

### From code (Node.js / tests)

```js
const config = require("./electron/config.cjs");

// Full signing config for current platform
const signing = config.getSigningConfig();
console.log(signing.summary);
// → "Signing not configured — set CSC_LINK (and related vars) to enable"

// Quick boolean check
console.log(config.isSigningConfigured()); // false (no creds set)

// Full release readiness
const readiness = config.getReleaseReadiness();
console.log(readiness.signing.active);     // false
console.log(readiness.unsignedWarning);    // describes OS warnings
```

### From the build output

`electron-builder` prints signing status during the build:
- When signing: `signing ... with certificate ...`
- When not signing: `skipping macOS code signing` or no signing output

## Build commands

| Command | Signs if creds present? |
|---------|------------------------|
| `npm run desktop` | No (dev run, no packaging) |
| `npm run desktop:dev` | No (dev run) |
| `npm run desktop:pack` | No (dir target only) |
| `npm run desktop:build` | ✅ Yes, if env vars are set |
| `npm run desktop:installer` | ✅ Yes, if env vars are set |

## What remains before public distribution

1. **Obtain signing certificates** — Apple Developer ID ($99/yr), Windows
   Authenticode cert (from DigiCert, Sectigo, etc.)
2. **CI/CD secrets** — add signing env vars as encrypted secrets in CI
3. **Notarization pipeline** — macOS requires network access to Apple servers
4. **EV certificate consideration** — Windows SmartScreen trusts EV certs
   immediately; standard certs require reputation building
5. **Auto-update** — `electron-updater` with a release/update server
6. **Release pipeline** — CI matrix builds per platform per release tag
7. **Custom application icon** — `assets/icon.png` (512×512 recommended)

## Security notes

- Signing certificates must NEVER be committed to the repository
- Use CI/CD encrypted secrets or hardware security modules (HSMs)
- The `electron-builder.config.js` reads credentials from environment only
- No credentials are embedded in the built artifacts
- The `getSigningConfig()` helper only checks for variable *presence*, not
  validity — it never reads or logs the actual credential values
