# App Shell — Architecture & Usage

## Overview

The app shell is a **minimal local web app** providing a browser-based UI for viewing model compatibility, recommendations, install plans, and workflow summaries.

It supports two modes:

- **Demo mode** (Phase 12) — Embedded fixture scenarios, works without any local setup
- **Real mode** (Phase 13) — Connects to the real backend workflow pipeline using actual data directories and host profile files

The shell is built with **zero additional dependencies** — it uses Node.js built-in `http` module to serve a single-page HTML application. The client-side uses vanilla HTML/CSS/JS with no framework.

## Architecture

```
┌───────────────────────────────────────────┐
│  Browser  (vanilla HTML/CSS/JS SPA)       │
│   ├─ Mode selector (Demo / Real)          │
│   ├─ Demo: Scenario selector              │
│   ├─ Real: Input fields + Run button      │
│   ├─ Host summary card                    │
│   ├─ Recommendation card                  │
│   ├─ Compatibility detail card            │
│   ├─ Plan review card                     │
│   └─ Workflow summary card                │
└────────────────┬──────────────────────────┘
                 │  fetch/post JSON
                 ▼
┌───────────────────────────────────────────┐
│  HTTP Server  (Node.js built-in http)     │
│   GET  /                   → HTML shell   │
│   GET  /api/scenarios      → scenario list│
│   GET  /api/scenarios/:id  → view-model   │
│   GET  /api/stages         → stage names  │
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
│  catalog, compatibility, install plan)    │
└───────────────────────────────────────────┘
```

### Key design decisions

- **No framework**: Vanilla JS keeps the shell thin and dependency-free.
- **Clean boundary**: UI never imports backend internals directly — everything flows through data provider / workflow bridge → frontend-contract layer.
- **Dual mode**: Demo mode uses embedded scenarios; real mode uses actual backend workflow execution.
- **JSON API**: The server exposes a clean REST-like API that decouples the UI from data loading.
- **No install execution**: Plans are display-only in both modes.

## Running the app shell

```bash
# Install dependencies (if not done already)
npm install

# Start the app shell (default port 3000)
npm run app-shell

# Or with a custom port
npx tsx src/app-shell/server.ts --port 8080
```

Then open http://localhost:3000 in a browser.

## Demo mode

Select "Demo" from the Mode dropdown (default). Choose a scenario from the dropdown to view pre-computed results.

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

Select "Real" from the Mode dropdown. This mode connects to the actual backend workflow pipeline.

### Required inputs

| Field | Description | Required |
|-------|-------------|----------|
| Data Directory | Path to directory containing `models/`, `runtimes/`, `agent-tools/` subdirectories | Yes |
| Host Profile File | Path to a JSON file containing a valid `HostProfile` | Yes |
| Artifact ID | Specific artifact to target (omit for auto-recommendation) | No |
| Stop After Stage | Stop workflow after this stage (for partial runs) | No |

### How to run real mode locally

1. Start the shell: `npm run app-shell`
2. Open http://localhost:3000
3. Switch to "Real" mode
4. Enter the path to your data directory (e.g., `./data` or the absolute path)
5. Enter the path to a host profile JSON file
6. Optionally set an artifact ID or stop-after stage
7. Click "Validate Inputs" to check inputs before running
8. Click "Run Workflow" to execute

### Valid stop-after stages

`catalog_loading`, `host_acquisition`, `recommendation`, `target_selection`, `compatibility_evaluation`, `install_planning`, `safety_evaluation`, `rendering`

### Workflow result states

| Status | Meaning |
|--------|---------|
| completed | All stages ran, plan is approved |
| completed_requires_approval | All stages ran, safety requires human approval |
| blocked | Safety evaluation found blocked violations |
| failed | A stage failed due to invalid input or internal error |
| partial | Stopped early at a requested stage |

## What the shell currently shows

### Views (5 core screens)

1. **Host Summary** — OS, CPU, RAM, GPU, installed runtimes, missing dependencies
2. **Recommendation** — Top recommended model artifact with score, compatibility label, explanations, warnings
3. **Compatibility Detail** — Classification, GPU offload, context window, settings adjustments, reasons, warnings
4. **Plan Review** — Install steps with risk levels, prerequisites, resource estimates, safety violations
5. **Workflow Summary** — Stage completion progress, status, error messages (if any)

### Error handling

Real mode surfaces errors through the frontend-contract error normalization layer:

- Invalid data directory → clear path error message
- Invalid host file → schema validation error details
- Invalid artifact ID → workflow failure at target_selection stage
- Workflow blocked → blocked status with safety violation details
- Workflow failed → failed stage identification with error message

Errors are displayed with structured codes (INVALID_INPUT, MISSING_ARTIFACT, BLOCKED_BY_POLICY, etc.) — never raw stack traces.

## What it intentionally does NOT do

- **No install execution** — plans are display-only, never executed
- **No live host detection** — provide a host profile file manually
- **No design system** — minimal CSS, no component library
- **No state management** — simple fetch-and-render
- **No desktop packaging** — runs as a local web server only
- **No server/daemon mode** — start/stop manually
- **No background tasks** — workflow runs synchronously
- **No remote/cloud features**
- **No plugin/extension system**
- **No global config system**

## File structure

```
src/app-shell/
  index.ts             — Public exports
  data-provider.ts     — Service layer: maps demo scenarios → view-models
  demo-scenarios.ts    — Embedded demo fixture data
  server.ts            — HTTP server with demo + real mode endpoints
  views.ts             — HTML/CSS/JS template rendering (both modes)
  workflow-bridge.ts   — Thin bridge: shell → real backend workflow

tests/app-shell/
  data-provider.test.ts      — Data provider / service layer tests
  demo-scenarios.test.ts     — Scenario structure + contract integration
  server.test.ts             — HTTP handler tests (demo + real endpoints)
  views.test.ts              — HTML render smoke tests (both modes)
  workflow-bridge.test.ts    — Workflow bridge: validation, execution, errors
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

Run a real workflow. Request body:

```json
{
  "dataDir": "/path/to/data",
  "hostFile": "/path/to/host.json",
  "artifactId": "optional-artifact-id",
  "stopAfter": "optional-stage-name"
}
```

Success response:

```json
{
  "ok": true,
  "viewModel": { "id": "_real_workflow", "host": {...}, "workflow": {...}, ... },
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
