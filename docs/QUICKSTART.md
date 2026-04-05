# Quick Start Guide

Get the CodingAgent app shell running locally in under 2 minutes.

> **Reminder**: All install plans shown in the shell are **informational only** — they are never executed.

## Prerequisites

- Node.js >= 18 (`node --version`)
- npm (`npm --version`)

## 1. Install dependencies

```bash
npm install
```

## 2. Run the preflight check (optional)

```bash
npm run preflight
```

This verifies your environment is ready: Node version, dependencies, source files, data directory, and docs.

## 3. Start the app shell

```bash
npm run app-shell
```

Open **http://localhost:3000** in your browser.

### Desktop mode (recommended for first-time users)

For a one-command desktop-like experience that runs preflight checks, starts the server, and opens your browser automatically:

```bash
npm run app-shell:desktop
```

Or to just auto-open the browser without preflight:

```bash
npm run app-shell:open
```

### Custom port

```bash
npm run app-shell -- --port 8080
npm run app-shell:desktop -- --port 8080
# or
PORT=4000 npm run app-shell
```

### Help

```bash
npm run app-shell:help
```

---

## Demo Mode (no setup required)

Demo mode is selected **by default** when you open the shell.

1. Start the shell: `npm run app-shell`
2. Open http://localhost:3000
3. "Demo" mode is pre-selected — browse 6 pre-built scenarios
4. Select a scenario from the dropdown to explore host, recommendation, compatibility, plan, and workflow views

### Available demo scenarios

| Scenario | What it shows |
|----------|---------------|
| Mid-Range GPU | Fully supported setup (RTX 3060, 32 GB) |
| High-End GPU | Fully supported setup (RTX 4090, 64 GB) |
| Low-End CPU Only | CPU-only, slow but functional (8 GB, no GPU) |
| Unsupported | Below minimum requirements (2 GB RAM) |
| Blocked Workflow | Dangerous plan blocked by safety policy |
| Partial Workflow | Stopped early after recommendation stage |

---

## Real Mode

Real mode runs the **actual backend workflow** against your own data directory and host profile.

### Step 1 — Generate a host profile

Run the host detection command and save the output:

```bash
npx tsx src/cli/main.ts detect-host --json > my-host.json
```

Or use the convenience script:

```bash
npm run generate-host-profile > my-host.json
```

This creates a JSON file describing your machine (OS, CPU, memory, GPU, installed runtimes).

### Step 2 — Prepare a data directory

The data directory must contain three subdirectories with JSON manifests:

```
data/
  models/       ← model manifest files (e.g., codellama.json)
  runtimes/     ← runtime manifest files (e.g., ollama.json)
  agent-tools/  ← agent-tool manifest files (e.g., aider.json)
```

The repository ships with a sample `data/` directory you can use as-is.

### Step 3 — Start the shell and switch to Real mode

```bash
npm run app-shell
```

1. Open http://localhost:3000
2. Switch from "Demo" to **"Real"** in the Mode dropdown
3. Enter **Data Directory**: path to your data directory (e.g., `./data` or absolute path)
4. Enter **Host Profile File**: path to the JSON file from Step 1 (e.g., `./my-host.json`)
5. (Optional) Enter an **Artifact ID** to target a specific model
6. (Optional) Set **Stop After Stage** to run only part of the workflow
7. Click **Validate Inputs** to check your paths
8. Click **Run Workflow** to execute

### Valid workflow stages

`catalog_loading` → `host_acquisition` → `recommendation` → `target_selection` → `compatibility_evaluation` → `install_planning` → `safety_evaluation` → `rendering`

---

## Interpreting startup output

When you start the server, you'll see:

```
────────────────────────────────────────────────────────
  CodingAgent App Shell
────────────────────────────────────────────────────────

  ➜  Local:   http://localhost:3000

  Modes:
    • Demo  — pre-built scenarios, no setup required
    • Real  — connect your own data-dir + host profile

  Quick tips:
    - Open the URL above in your browser
    - Demo mode is selected by default
    - For real mode, prepare a data directory and host profile
    - See docs/QUICKSTART.md for detailed instructions

  Press Ctrl+C to stop the server
────────────────────────────────────────────────────────
```

The server is ready when you see the URL. Open it in any browser.

---

## Interpreting workflow results

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ completed | All stages passed, plan approved | Review the plan |
| ⚠️ completed_requires_approval | Stages passed but needs human review | **Review carefully** before any manual action |
| 🚫 blocked | Unsafe operations detected | **Do NOT execute** the plan |
| ❌ failed | A workflow stage failed | Check error details |
| ⏸️ partial | Stopped early (as requested) | Only partial results shown |

---

## Host profile format

A host profile is a JSON file with this structure:

```json
{
  "detectedAt": "2025-01-01T00:00:00.000Z",
  "os": {
    "platform": { "value": "linux", "confidence": "certain" },
    "release": { "value": "6.5.0", "confidence": "certain" },
    "arch": { "value": "x64", "confidence": "certain" }
  },
  "cpu": {
    "model": { "value": "AMD Ryzen 9 5900X", "confidence": "certain" },
    "cores": { "value": 12, "confidence": "certain" },
    "threads": { "value": 24, "confidence": "certain" }
  },
  "memory": {
    "totalGb": { "value": 32, "confidence": "certain" },
    "availableGb": { "value": 24, "confidence": "estimated" }
  },
  "gpu": {
    "present": { "value": true, "confidence": "certain" },
    "model": { "value": "NVIDIA RTX 3080", "confidence": "certain" },
    "vramGb": { "value": 10, "confidence": "certain" },
    "cudaVersion": { "value": "12.2", "confidence": "certain" },
    "rocmVersion": { "value": null, "confidence": "unknown" },
    "driverVersion": { "value": "535.129.03", "confidence": "certain" }
  },
  "installedRuntimes": [
    { "runtimeId": "ollama", "version": { "value": "0.3.0", "confidence": "certain" } }
  ],
  "missingDependencies": []
}
```

The easiest way to create one is: `npm run generate-host-profile > my-host.json`

---

## Where does data-dir point?

The **data directory** is a local folder containing JSON manifest files organized in three subdirectories:

| Subdirectory | Contents | Example |
|-------------|----------|---------|
| `models/` | Model family manifests | `codellama.json`, `starcoder2.json` |
| `runtimes/` | Runtime manifests | `ollama.json`, `llamacpp.json` |
| `agent-tools/` | Agent tool manifests | `aider.json`, `continue-dev.json` |

The repository includes a ready-to-use `data/` directory at the project root.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm run app-shell` fails | Run `npm install` first |
| Port already in use | Use `--port 8080` or `PORT=8080` |
| Real mode: "Data directory does not exist" | Use absolute path or path relative to where server was started |
| Real mode: "Invalid host file" | Regenerate with `npm run generate-host-profile > host.json` |
| Real mode: validation errors | Click "Validate Inputs" first to check each field |

---

## All npm scripts

| Script | Description |
|--------|-------------|
| `npm run app-shell` | Start the app shell (default port 3000) |
| `npm run app-shell:demo` | Same as above (demo mode is default) |
| `npm run app-shell:open` | Start the app shell and auto-open the browser |
| `npm run app-shell:desktop` | Desktop mode: preflight + server + auto-open |
| `npm run app-shell:help` | Show app shell CLI help |
| `npm run generate-host-profile` | Detect host and output JSON to stdout |
| `npm run preflight` | Verify environment is ready |
| `npm test` | Run all tests |
| `npm run build` | Compile TypeScript |
| `npm run lint` | Lint source and tests |
| `npm run typecheck` | Type-check without emitting |

---

## Important reminder

**Install plans are informational only.** The app shell displays what steps *would* be needed to set up a model, but it **never executes** any commands. All plans are for review and understanding only.
