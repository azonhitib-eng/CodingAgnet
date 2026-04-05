# App Shell — Architecture & Usage

## Overview

The app shell is a **minimal local web app** providing a browser-based UI for viewing model compatibility, recommendations, install plans, and workflow summaries.

It supports two modes:

- **Demo mode** (Phase 12) — Embedded fixture scenarios, works without any local setup
- **Real mode** (Phase 13) — Connects to the real backend workflow pipeline using actual data directories and host profile files

The shell is built with **zero additional dependencies** — it uses Node.js built-in `http` module to serve a single-page HTML application. The client-side uses vanilla HTML/CSS/JS with no framework.

**Phase 14** improved the UX with: enhanced status clarity, distinct blocked/approval presentation, better form usability, structured error presentation, and convenience features (copy JSON, reset, localStorage persistence, collapsible sections).

**Phase 15** improved packaging and distribution readiness: enhanced startup output with mode guidance, `--help` flag, `PORT` env var support, `resolvePort()` utility, preflight check script, `generate-host-profile` convenience script, and comprehensive `QUICKSTART.md`.

**Phase 16** added live host detection integration: `POST /api/host/detect` endpoint for live hardware detection, `POST /api/host/validate` for host profile validation, "Detect Host" button in the UI, host-source semantics showing whether host data came from demo/file/live-detection, and support for running workflows with detected host profiles directly (no host file needed).

**Phase 17** added desktop packaging: `--open` flag for auto-browser-open, `attachGracefulShutdown()` for clean Ctrl+C handling, `openBrowser()` utility with URL protocol validation, `scripts/desktop-launch.ts` desktop launcher with preflight checks, `npm run app-shell:desktop` for single-command desktop experience. Packaging decision: enhanced local web shell (Electron/Tauri deferred). See `docs/PACKAGING.md`.

**Phase 18** added product-shell polish and session usability: sticky section navigation bar with IntersectionObserver, run-context summary bar with timestamps, compact summary strip, "Clear Results" vs "Reset" distinction, export result/host JSON downloads, copy summary text, import host profile file, contextual error recovery hints, and section anchoring for quick jumps between result areas.

## Architecture

```
┌───────────────────────────────────────────┐
│  Browser  (vanilla HTML/CSS/JS SPA)       │
│   ├─ Mode selector (Demo / Real)          │
│   ├─ Mode-specific hint text              │
│   ├─ Demo: Scenario selector              │
│   ├─ Real: Grouped form + Reset/Validate  │
│   ├─ Real: Detect Host button             │
│   ├─ Host source indicator (badge)        │
│   ├─ Host summary card (with source)      │
│   ├─ Recommendation card                  │
│   ├─ Compatibility detail card            │
│   ├─ Plan review card (safety-styled)     │
│   ├─ Workflow summary card (status-styled)│
│   └─ Copy JSON / Collapsible sections     │
└────────────────┬──────────────────────────┘
                 │  fetch/post JSON
                 ▼
┌───────────────────────────────────────────┐
│  HTTP Server  (Node.js built-in http)     │
│   GET  /                   → HTML shell   │
│   GET  /api/scenarios      → scenario list│
│   GET  /api/scenarios/:id  → view-model   │
│   GET  /api/stages         → stage names  │
│   POST /api/host/detect    → live detect  │
│   POST /api/host/validate  → validate obj │
│   POST /api/workflow/run   → run workflow  │
│   POST /api/workflow/validate → validate  │
└──────────┬───────────────┬────────────────┘
           │               │
           ▼               ▼
┌──────────────────┐ ┌─────────────────────┐
│  Data Provider   │ │  Workflow Bridge     │
│  (demo mode)     │ │  (real mode)         │
│  mapScenario()   │ │  executeRealWorkflow │
│  loadDemoScen()  │ │  validateDataDir()   │
│  listDemoScen()  │ │  validateHostFile()  │
└────────┬─────────┘ └──────┬──────────────┘
         │                  │
         ▼                  ▼
┌───────────────────────────────────────────┐
│  Frontend-Contract Layer                  │
│   toHostSummary(), toWorkflowView(), etc. │
└──────────────────┬────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────┐
│  Backend Modules (workflow runner,        │
│  catalog, compatibility, install plan,    │
│  host detection)                          │
└───────────────────────────────────────────┘
```

### Key design decisions

- **No framework**: Vanilla JS keeps the shell thin and dependency-free.
- **Clean boundary**: UI never imports backend internals directly — everything flows through data provider / workflow bridge → frontend-contract layer.
- **Dual mode**: Demo mode uses embedded scenarios; real mode uses actual backend workflow execution.
- **JSON API**: The server exposes a clean REST-like API that decouples the UI from data loading.
- **No install execution**: Plans are display-only in both modes. Plans are informational only — they are never executed.

## Running the app shell

```bash
# Install dependencies (if not done already)
npm install

# Run preflight check (optional — verifies environment)
npm run preflight

# Start the app shell (default port 3000)
npm run app-shell

# Start and auto-open browser
npm run app-shell:open

# Desktop mode: preflight + server + auto-open (recommended for first-time users)
npm run app-shell:desktop

# Or with a custom port
npm run app-shell -- --port 8080
npm run app-shell:desktop -- --port 8080

# Or using the PORT environment variable
PORT=4000 npm run app-shell

# Show app shell help
npm run app-shell:help

# Generate a host profile for real mode
npm run generate-host-profile > my-host.json
```

Then open http://localhost:3000 in a browser.

For detailed setup instructions, see **[docs/QUICKSTART.md](QUICKSTART.md)**.

## Demo mode

Select "Demo" from the Mode dropdown (default). A hint below the selector explains: *"Explore pre-built scenarios — no setup required."*

Choose a scenario from the dropdown to view pre-computed results. This is the easiest first-run experience and requires no local setup.

### Demo scenarios (6 pre-built)

| Scenario | Description |
|----------|-------------|
| Mid-Range GPU | RTX 3060, 32 GB — fully supported |
| High-End GPU | RTX 4090, 64 GB — fully supported |
| Low-End CPU Only | No GPU, 8 GB — CPU-only, slow |
| Unsupported | 2 GB RAM — below minimum, workflow failed |
| Blocked Workflow | Dangerous plan — blocked by safety |
| Partial Workflow | Stopped early after recommendation |

## Real mode

Select "Real" from the Mode dropdown. The hint updates: *"Run the real backend workflow with your own data directory and host profile."*

### Form layout (Phase 14)

Inputs are grouped into two fieldsets:

- **Required Inputs**: Data Directory, Host Profile File (with inline helper text)
- **Optional**: Artifact ID, Stop After Stage (with inline helper text)
- **Actions**: Run Workflow, Validate Inputs, Reset

Each field shows helper text explaining what is expected. Missing required fields are highlighted with a red border on submission.

### Required inputs

| Field | Description | Required |
|-------|-------------|----------|
| Data Directory | Path to directory containing `models/`, `runtimes/`, `agent-tools/` subdirectories | Yes |
| Host Profile File | Path to a JSON file containing a valid `HostProfile` | Yes (unless using live detection) |
| Artifact ID | Specific artifact to target (omit for auto-recommendation) | No |
| Stop After Stage | Stop workflow after this stage (for partial runs) | No |

### Host profile: file vs live detection (Phase 16)

There are two ways to provide host information in real mode:

| Method | How | Best for |
|--------|-----|----------|
| **Host File** | Enter a path to a pre-generated JSON file | Deterministic/repeatable runs, CI, sharing profiles between machines |
| **Live Detection** | Click "Detect Host" in the UI | Quick local evaluation, first-run convenience |

**Host file mode** loads a saved `HostProfile` JSON file. This is deterministic — the same file always produces the same results. Generate a host file with `npm run generate-host-profile > my-host.json`.

**Live detection mode** calls the backend `detectHost()` function to probe the current machine's hardware (OS, CPU, memory, GPU, installed runtimes). The detected profile is used directly without writing to disk.

If both a host file and a detected profile are available, the host file takes priority when entered. Use "Reset" to clear both.

### Host source indicator

The UI shows a badge in the Host Summary section indicating how the profile was obtained:

| Badge | Meaning |
|-------|---------|
| 🎭 **Demo Scenario** | Embedded fixture data (demo mode) |
| 📁 **Host File** | Loaded from a user-supplied JSON file |
| 🔍 **Live Detected** | Obtained via live host detection |

This helps you track where the host information came from at a glance.

### How to run real mode locally

**Option A — with a host file (deterministic):**
1. Start the shell: `npm run app-shell`
2. Open http://localhost:3000
3. Switch to "Real" mode
4. Enter the path to your data directory (e.g., `./data` or the absolute path)
5. Enter the path to a host profile JSON file
6. Optionally set an artifact ID or stop-after stage
7. Click "Validate Inputs" to check inputs before running
8. Click "Run Workflow" to execute

**Option B — with live detection (quick start):**
1. Start the shell: `npm run app-shell`
2. Open http://localhost:3000
3. Switch to "Real" mode
4. Enter the path to your data directory
5. Click "Detect Host" — the shell detects your hardware
6. Click "Run Workflow" — no host file needed
7. The detected profile is shown in the result with a "Live Detected" badge

Use "Reset" to clear all inputs, detection results, and start over.

### Valid stop-after stages

`catalog_loading`, `host_acquisition`, `recommendation`, `target_selection`, `compatibility_evaluation`, `install_planning`, `safety_evaluation`, `rendering`

## Status presentation in the shell (Phase 14)

### Workflow result statuses

| Status | Badge | Visual | What it means | What to do next |
|--------|-------|--------|---------------|-----------------|
| `completed` | ✅ info | Default card | All stages passed, plan approved | Review the plan — ready for execution |
| `completed_requires_approval` | ⚠️ warning | Yellow card | All stages passed, but steps need review | **Review carefully** — some steps require explicit approval |
| `blocked` | 🚫 critical | Purple card | Unsafe operations detected | **Do NOT execute** — blocked by safety policy |
| `failed` | ❌ error | Red card | A stage failed | Check error details, fix the issue |
| `partial` | ⏸️ info | Default card | Stopped early as requested | Only a subset of stages were executed |

### Stage progress visibility

- **Progress bar**: Color-coded segments showing completed (green), failed (red), and blocked (purple) stages
- **Progress label**: Shows `N/M (X%)` completed stages
- **Stage list**: Each stage shows ✓ (done), ○ (pending), or ✗ (failed) with clear labels
- **Failed stage**: Marked with a red FAILED badge
- **Next-action guidance**: Every status includes a "What to do next" hint

### Blocked and requires-approval states

These states are **visually distinct** from success:

- **Blocked**: Purple background, 🚫 icon, prominent "BLOCKED — Unsafe Operations Detected" box
- **Requires Approval**: Yellow background, ⚠️ icon, "Requires Human Approval" warning box
- Plan steps that require approval have a yellow-tinted border
- Plan steps that are blocked have a purple-tinted border
- Irreversible steps are marked

### Safety evaluation rendering

- **Approved**: Standard badge and summary
- **Requires Approval**: Yellow warning box with clear heading
- **Blocked**: Purple blocked box with prominent heading and violation table

## Validation feedback in the shell (Phase 14)

### Validation result display

After clicking "Validate Inputs", results are shown with:

- ✅ Green background for all-valid results
- ❌ Red background for all-invalid results
- ⚠️ Yellow background for mixed results
- Per-field validation hints explaining what to fix

### Error presentation

Errors from workflow execution are shown with:

- **Error code badge** (e.g., `[INVALID_INPUT]`)
- **Human-readable message**
- **Contextual hint** explaining likely cause and fix (per error code)
- **Collapsible details** for the full error object (click to expand)

| Error Code | Hint |
|------------|------|
| INVALID_INPUT | Check input paths and values |
| MISSING_ARTIFACT | Artifact not found — use auto-recommendation or verify ID |
| MISSING_RUNTIME | Required runtime not available |
| BLOCKED_BY_POLICY | Safety policy violation — review install plan |
| INTERNAL_FAILURE | Unexpected error — check details |

## Convenience features (Phase 14)

| Feature | Description |
|---------|-------------|
| **Copy JSON** | Button to copy the full result JSON to clipboard |
| **Reset Form** | Clears all inputs and validation state |
| **localStorage persistence** | Mode, data directory, host file, and artifact ID are remembered across page reloads |
| **Collapsible sections** | Error details can be expanded/collapsed |
| **Mode hints** | Contextual hint text changes when switching between Demo and Real mode |
| **Input error highlighting** | Missing required fields get a red border; clears on typing |
| **Button disabling** | Run and Validate buttons are disabled during execution |

## Session usability (Phase 18)

**Phase 18** polishes the shell for repeated daily use as a local product.

### Navigation

A **sticky section nav bar** appears when results are displayed. It provides jump links to:

| Section | Description |
|---------|-------------|
| **Host** | Host summary card |
| **Recommendation** | Top recommendation card |
| **Compatibility** | Compatibility detail card |
| **Plan Review** | Install plan review card |
| **Workflow** | Workflow summary card |

The nav bar highlights the currently visible section using an IntersectionObserver. Click any link to scroll to that section. The nav bar is hidden when no results are displayed.

### Run context

Each result display includes a **run context bar** showing:

- **Mode** — Demo or Real
- **Label** — Scenario name (demo) or "Real Workflow" (real)
- **Timestamp** — When the run was executed
- **Artifact ID** — If a specific artifact was targeted (real mode)
- **Stop After** — If the workflow was stopped early (real mode)

This helps track what produced the current results, especially during repeated runs.

### Summary strip

A **compact summary strip** appears at the top of results showing the status icon, host summary, recommendation name, and compatibility label — all in one scannable line.

### Clear Results vs Reset

Two separate actions:

| Action | Behavior |
|--------|----------|
| **Clear Results** | Removes the result display but keeps form inputs intact — ready for a re-run with tweaked parameters |
| **Reset** | Clears all form inputs, detection results, and results — start completely fresh |

### Repeated runs

The last workflow result stays visible until replaced by a new run. There is no "pending" state between runs — the previous result remains on screen until the new one is ready.

### Export and import

| Feature | Description |
|---------|-------------|
| **Export Result JSON** | Downloads the full workflow result as a `.json` file with a timestamped filename |
| **Export Host JSON** | Downloads just the host profile section as a `.json` file |
| **Copy Summary Text** | Copies a plain-text summary (host, recommendation, compatibility, status) to clipboard |
| **Copy JSON** | Copies the full JSON result to clipboard (existing feature) |
| **Import Host JSON** | Load a host profile `.json` file from your computer in real mode (validated via backend) |

The import feature validates the file through the backend before accepting it, and sets it as the active detected host profile.

### Error recovery hints

Common errors now include contextual recovery hints:

| Error Pattern | Recovery Hint |
|---------------|---------------|
| Path does not exist | Check the path, use absolute paths |
| Missing subdirectories | Data dir needs `models/`, `runtimes/`, `agent-tools/` |
| Invalid host file | Regenerate with `npm run generate-host-profile`, or use Detect Host |
| Host file does not exist | File may have been moved — use Detect Host or regenerate |
| Artifact not in catalog | Remove artifact ID for auto-recommendation |

These hints appear in addition to the existing error code hints (Phase 14).

> **Reminder**: Install plans shown in the shell are informational only. They describe what *would* be done, but the shell never executes them.

## What it intentionally does NOT do

- **No install execution** — plans are display-only, never executed
- **No design system** — minimal CSS, no component library
- **No state management** — simple fetch-and-render with localStorage for preferences and session-level run tracking
- **No desktop packaging** — runs as a local web server with desktop launcher (see `docs/PACKAGING.md`)
- **No server/daemon mode** — start/stop manually (Ctrl+C with graceful shutdown)
- **No background tasks** — workflow runs synchronously
- **No remote/cloud features**
- **No plugin/extension system**
- **No global config system**

> **Reminder**: Install plans shown in the shell are informational only. They describe what *would* be done, but the shell never executes them.

## File structure

```
src/app-shell/
  index.ts             — Public exports
  data-provider.ts     — Service layer: maps demo scenarios → view-models
  demo-scenarios.ts    — Embedded demo fixture data
  server.ts            — HTTP server with demo + real mode endpoints, browser opener, graceful shutdown
  views.ts             — HTML/CSS/JS template rendering (both modes, Phase 14 UX, Phase 18 session polish)
  workflow-bridge.ts   — Thin bridge: shell → real backend workflow

scripts/
  desktop-launch.ts    — Desktop launcher: preflight + server + auto-open
  preflight.ts         — Environment readiness checker

tests/app-shell/
  data-provider.test.ts      — Data provider / service layer tests
  demo-scenarios.test.ts     — Scenario structure + contract integration
  server.test.ts             — HTTP handler tests (demo + real endpoints)
  views.test.ts              — HTML render smoke tests (both modes)
  views-phase14.test.ts      — Phase 14 UX hardening tests (47 tests)
  workflow-bridge.test.ts    — Workflow bridge: validation, execution, errors
  phase16-host-detection.test.ts — Phase 16: host detection, source semantics (48 tests)
  phase17-desktop-packaging.test.ts — Phase 17: desktop packaging, launcher, security (53 tests)
  phase18-session-usability.test.ts — Phase 18: session usability, navigation, export/import (82 tests)
```

## API reference

### `GET /api/scenarios`

Returns an array of demo scenario descriptors:

```json
[
  { "id": "midRangeGpu", "label": "Mid-Range GPU", "description": "..." },
  ...
]
```

### `GET /api/scenarios/:id`

Returns the full `ScenarioViewModel` for a demo scenario:

```json
{
  "id": "midRangeGpu",
  "label": "Mid-Range GPU",
  "description": "...",
  "host": { "summary": "linux x64 · 32 GB RAM · ...", ... },
  "recommendation": { "artifactId": "...", "score": 106, ... },
  "compatibility": { "status": "supported", ... },
  "planReview": { "steps": [...], "safety": {...}, ... },
  "workflow": { "status": "completed_requires_approval", ... }
}
```

### `GET /api/scenarios/:id/:view`

Returns a single sub-view. Valid views: `host`, `recommendation`, `compatibility`, `plan`, `workflow`.

### `GET /api/stages`

Returns the ordered list of valid workflow stage names:

```json
["catalog_loading", "host_acquisition", "recommendation", ...]
```

### `POST /api/workflow/run`

Run a real workflow. Request body — provide either `hostFile` **or** `hostProfile`:

```json
{
  "dataDir": "/path/to/data",
  "hostFile": "/path/to/host.json",
  "artifactId": "optional-artifact-id",
  "stopAfter": "optional-stage-name"
}
```

Or with a detected host profile (no file needed):

```json
{
  "dataDir": "/path/to/data",
  "hostProfile": { "detectedAt": "...", "os": {...}, "cpu": {...}, ... },
  "artifactId": "optional-artifact-id"
}
```

Success response (includes `hostSource` indicating data provenance):

```json
{
  "ok": true,
  "viewModel": { "id": "_real_workflow", "hostSource": "file", "host": {...}, "workflow": {...}, ... },
  "status": "completed_requires_approval",
  "completedStages": ["catalog_loading", "host_acquisition", ...]
}
```

Error response:

```json
{
  "ok": false,
  "error": { "code": "INVALID_INPUT", "message": "...", "details": {...} }
}
```

### `POST /api/workflow/validate`

Validate inputs without running the workflow. Request body (all fields optional):

```json
{
  "dataDir": "/path/to/data",
  "hostFile": "/path/to/host.json",
  "stopAfter": "recommendation"
}
```

Response:

```json
{
  "validations": {
    "dataDir": { "valid": true },
    "hostFile": { "valid": false, "error": "Host file does not exist: ..." },
    "stopAfter": { "valid": true }
  }
}
```

### `POST /api/host/detect` (Phase 16)

Detect host hardware live. No request body required.

Success response:

```json
{
  "ok": true,
  "hostProfile": { "detectedAt": "2025-06-01T12:00:00Z", "os": {...}, "cpu": {...}, ... },
  "summary": { "summary": "linux x64 · 32 GB RAM · RTX 3060 12 GB", "os": "linux", ... },
  "source": "detected"
}
```

Error response (e.g. if detection fails in a restricted environment):

```json
{
  "ok": false,
  "error": { "code": "HOST_DETECTION_FAILED", "message": "Host detection failed: ..." }
}
```

### `POST /api/host/validate` (Phase 16)

Validate a host profile object (without running a workflow). Request body: a HostProfile JSON object.

Success response:

```json
{
  "valid": true,
  "hostProfile": { "detectedAt": "...", ... },
  "summary": { "summary": "linux x64 · 32 GB RAM", ... }
}
```

Error response:

```json
{
  "valid": false,
  "error": "Validation failed: ..."
}
```

> **Reminder**: Install plans shown in the shell are informational only. They describe what *would* be done, but the shell never executes them.
