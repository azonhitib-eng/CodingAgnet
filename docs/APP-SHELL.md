# App Shell — Architecture & Usage

## Overview

Phase 12 introduces a **minimal local web app shell** that provides a browser-based UI for viewing model compatibility, recommendations, install plans, and workflow summaries.

The shell is built with **zero additional dependencies** — it uses Node.js built-in `http` module to serve a single-page HTML application. The client-side uses vanilla HTML/CSS/JS with no framework.

## Architecture

```
┌───────────────────────────────────────────┐
│  Browser  (vanilla HTML/CSS/JS SPA)       │
│   ├─ Scenario selector                    │
│   ├─ Host summary card                    │
│   ├─ Recommendation card                  │
│   ├─ Compatibility detail card            │
│   ├─ Plan review card                     │
│   └─ Workflow summary card                │
└────────────────┬──────────────────────────┘
                 │  fetch JSON
                 ▼
┌───────────────────────────────────────────┐
│  HTTP Server  (Node.js built-in http)     │
│   GET /              → HTML shell page    │
│   GET /api/scenarios → scenario list      │
│   GET /api/scenarios/:id → full view-model│
│   GET /api/scenarios/:id/:view → sub-view │
└────────────────┬──────────────────────────┘
                 │
                 ▼
┌───────────────────────────────────────────┐
│  Data Provider  (service/boundary layer)  │
│   mapScenario()                           │
│   loadDemoScenario()                      │
│   listDemoScenarios()                     │
└────────────────┬──────────────────────────┘
                 │  calls
                 ▼
┌───────────────────────────────────────────┐
│  Frontend-Contract Layer (Phase 11)       │
│   toHostSummary()                         │
│   toRecommendationItem()                  │
│   toCompatibilityView()                   │
│   toPlanReviewView()                      │
│   toWorkflowView()                        │
└───────────────────────────────────────────┘
```

### Key design decisions

- **No framework**: Vanilla JS keeps the shell thin and dependency-free.
- **Clean boundary**: UI never imports backend internals directly — everything flows through the data provider → frontend-contract layer.
- **Demo/fixture mode**: The shell runs against embedded demo scenarios, so it works without live host detection.
- **JSON API**: The server exposes a clean REST-like API that decouples the UI from data loading.

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

## What the shell currently shows

### Views (5 core screens)

1. **Host Summary** — OS, CPU, RAM, GPU, installed runtimes, missing dependencies
2. **Recommendation** — Top recommended model artifact with score, compatibility label, explanations, warnings
3. **Compatibility Detail** — Classification, GPU offload, context window, settings adjustments, reasons, warnings
4. **Plan Review** — Install steps with risk levels, prerequisites, resource estimates, safety violations
5. **Workflow Summary** — Stage completion progress, status, error messages (if any)

### Demo scenarios (6 pre-built)

| Scenario | Description |
|----------|-------------|
| Mid-Range GPU | RTX 3060, 32 GB — fully supported |
| High-End GPU | RTX 4090, 64 GB — fully supported |
| Low-End CPU Only | No GPU, 8 GB — CPU-only, slow |
| Unsupported | 2 GB RAM — below minimum, workflow failed |
| Blocked Workflow | Dangerous plan — blocked by safety |
| Partial Workflow | Stopped early after recommendation |

### Interaction model

- Select a scenario from the dropdown to load all views
- Each view card renders its data from the corresponding view-model
- No editing, no execution — read-only display of pre-computed results

## What it intentionally does NOT do yet

- **No install execution** — plans are display-only
- **No live host detection** — uses embedded demo data only
- **No design system** — minimal CSS, no component library
- **No state management** — simple fetch-and-render
- **No desktop packaging** — runs as a local web server only
- **No server/daemon mode** — start/stop manually
- **No user configuration** — hard-coded demo scenarios
- **No plugin/extension system**
- **No remote/cloud features**

## File structure

```
src/app-shell/
  index.ts          — Public exports
  data-provider.ts  — Service layer: maps scenarios → view-models
  demo-scenarios.ts — Embedded demo fixture data
  server.ts         — Minimal HTTP server
  views.ts          — HTML/CSS/JS template rendering

tests/app-shell/
  data-provider.test.ts    — Data provider / service layer tests
  demo-scenarios.test.ts   — Scenario structure + contract integration
  server.test.ts           — HTTP handler tests
  views.test.ts            — HTML render smoke tests
```

## API reference

### `GET /api/scenarios`

Returns an array of scenario descriptors:

```json
[
  { "id": "midRangeGpu", "label": "Mid-Range GPU", "description": "..." },
  ...
]
```

### `GET /api/scenarios/:id`

Returns the full `ScenarioViewModel`:

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
