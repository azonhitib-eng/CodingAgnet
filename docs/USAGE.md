# CodingAgent Backend — Usage Guide

## What this system does

The CodingAgent backend is a **local-first, portable** toolkit for:

- **Catalog management** — loading and validating model, runtime, and agent-tool manifests from JSON files
- **Host detection** — probing the local machine for OS, CPU, memory, GPU, and installed runtimes
- **Compatibility evaluation** — determining whether a model artifact can run on a given host
- **Recommendation** — ranking all catalog artifacts by compatibility and quality for a host
- **Install planning** — generating a deterministic, reviewable plan describing what steps would be needed to install a model
- **Safety evaluation** — classifying every plan step by risk and producing an approval decision (`approved`, `requiresHumanApproval`, or `blocked`)
- **Rendering** — producing human-readable text output of plans and safety reports

## What this system does NOT do

- **Execute commands** — plans are informational only; the backend never runs shell commands
- **Support YAML manifests** — only JSON manifests are supported
- **Connect to cloud/remote services** — all operations are local
- **Provide a plugin marketplace** — catalogs are loaded from local directories
- **Run background tasks** — all operations are synchronous or simple async

## Quick start

```typescript
import {
  loadCatalogBundleSync,
  detectHost,
  recommend,
  generateInstallPlan,
  evaluatePlanSafety,
  defaultExecutionPolicy,
  renderPlan,
} from "codingagent-backend";
```

## Step-by-step usage

### 1. Load catalogs

Load all manifests from a directory layout:

```typescript
import { loadCatalogBundleSync, loadCatalogBundle } from "codingagent-backend";

// Synchronous
const bundle = loadCatalogBundleSync({
  models: "./data/models",
  runtimes: "./data/runtimes",
  agentTools: "./data/agent-tools",
});

// Asynchronous
const bundle = await loadCatalogBundle({
  models: "./data/models",
  runtimes: "./data/runtimes",
  agentTools: "./data/agent-tools",
});
```

The bundle loader validates every manifest against its Zod schema and runs cross-catalog referential integrity checks (e.g. every artifact's `runtimeId` must reference an existing runtime).

### 2. Detect host

Detect the local machine's capabilities:

```typescript
import { detectHost } from "codingagent-backend";

const host = await detectHost({
  catalogRuntimes: bundle.runtimes.listAll(),
});
```

The host profile contains `Detected<T>` wrappers with confidence levels (`certain`, `estimated`, `unknown`). The detector never throws — failures degrade to unknown values.

For testing, you can construct a mock `HostProfile` directly:

```typescript
import type { HostProfile } from "codingagent-backend";

const mockHost: HostProfile = {
  detectedAt: new Date().toISOString(),
  os: { platform: { value: "linux", confidence: "certain" }, /* ... */ },
  // ...
};
```

### 3. Get recommendations

Rank all catalog artifacts against the host:

```typescript
import { recommend } from "codingagent-backend";

const recommendations = recommend(host, bundle);
// Sorted by score descending — best first.

for (const rec of recommendations) {
  console.log(rec.displayName, rec.score, rec.compatibility.classification);
}
```

Options:
- `includeUnsupported: true` — include artifacts that cannot run on this host

### 4. Generate an install plan

For a specific artifact, generate a step-by-step install plan:

```typescript
import { generateInstallPlan } from "codingagent-backend";

const plan = generateInstallPlan({
  host,
  artifact,   // ModelArtifact from the catalog
  variant,    // ModelVariant (parent of artifact)
  runtime,    // RuntimeEntry the artifact targets
  compatibility, // optional CompatibilityResult for enriched warnings
});
```

The plan is **informational only** — it describes what commands would need to run, their risk levels, prerequisites, resource estimates, and verification steps.

### 5. Evaluate safety

Evaluate the plan against an execution policy:

```typescript
import { evaluatePlanSafety, defaultExecutionPolicy } from "codingagent-backend";

const policy = defaultExecutionPolicy();
const safety = evaluatePlanSafety(plan, policy);
```

### 6. Interpret the safety status

The `SafetyReport` has a 3-state approval model:

| Field | Meaning |
|-------|---------|
| `approved: true` | Plan is safe to execute without further review. No blocked violations, no dangerous commands, and no steps requiring approval. |
| `requiresHumanApproval: true` | Plan contains dangerous commands, steps marked for approval, or policy mismatches. A human must review and explicitly approve before execution. The `violations` and `warnings` arrays describe what needs attention. |
| `blocked: true` | Plan contains at least one blocked-severity violation (e.g. `rm -rf /`, filesystem format, raw device write). **The plan must not be executed.** |

**Precedence rules:**
- `blocked` takes absolute precedence — if any blocked violation exists, `blocked=true` regardless of other conditions
- `requiresHumanApproval` only applies when not blocked
- `approved` is true only when neither blocked nor requiresHumanApproval

When both blocked and dangerous conditions coexist, the top-level status is `blocked`, but the `violations` array preserves all underlying reasons (both blocked and dangerous) for transparency.

### 7. Render the plan

Render the plan (with optional safety report) as human-readable text:

```typescript
import { renderPlan } from "codingagent-backend";

// Plan only
const text = renderPlan(plan);

// Plan + safety report
const text = renderPlan(plan, safety);
```

Or use the convenience wrapper:

```typescript
import { renderPlanWithSafety } from "codingagent-backend";

const { safetyReport, rendered } = renderPlanWithSafety(plan);
```

### 8. Full flow (convenience)

Run the entire pipeline in a single call:

```typescript
import { runFullFlow } from "codingagent-backend";

const result = runFullFlow({
  bundle,
  host,
  // artifactId: "optional-specific-artifact-id",
});

console.log(result.safetyReport.approved);  // boolean
console.log(result.rendered);                // full text output
```

## Example runner

A minimal developer-facing example runner is available:

```bash
npx tsx scripts/example-runner.ts
npx tsx scripts/example-runner.ts --data-dir ./data
```

This loads the bundled catalog data, uses a mock host profile, and runs the full flow with rendered output.

## Developer CLI

A minimal developer-facing CLI is provided for backend verification and developer usability.
The CLI is a thin wrapper over the existing backend modules — it does NOT execute install plans
or perform any mutation side effects.

### Running the CLI

```bash
npx tsx src/cli/main.ts <command> [options]
```

### Global options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON instead of human-readable text |
| `--data-dir <path>` | Path to catalog data directory (default: `./data`) |
| `--help` | Show help message |

### Commands

#### `detect-host`

Detect the local machine's capabilities (OS, CPU, memory, GPU, installed runtimes).

```bash
npx tsx src/cli/main.ts detect-host
npx tsx src/cli/main.ts detect-host --json
npx tsx src/cli/main.ts detect-host --data-dir ./data   # enables runtime detection
```

#### `list-models`

List known model artifacts from the catalog with optional filtering.

```bash
npx tsx src/cli/main.ts list-models --data-dir ./data
npx tsx src/cli/main.ts list-models --data-dir ./data --json
npx tsx src/cli/main.ts list-models --data-dir ./data --status supported
npx tsx src/cli/main.ts list-models --data-dir ./data --runtime ollama
npx tsx src/cli/main.ts list-models --data-dir ./data --capability coding
```

| Filter | Values |
|--------|--------|
| `--status` | `supported`, `experimental`, `deprecated` |
| `--runtime` | Any runtime ID (e.g. `ollama`, `llamacpp`) |
| `--capability` | `coding`, `agenticToolUse`, `autocomplete`, `longContext` |

#### `recommend-models`

Rank all catalog artifacts for the detected host, best first.

```bash
npx tsx src/cli/main.ts recommend-models --data-dir ./data
npx tsx src/cli/main.ts recommend-models --data-dir ./data --json
npx tsx src/cli/main.ts recommend-models --data-dir ./data --include-unsupported
```

#### `check-compatibility`

Check compatibility of a specific model artifact against the detected host.

```bash
npx tsx src/cli/main.ts check-compatibility --data-dir ./data --artifact codellama-7b-q4_k_m-ollama
npx tsx src/cli/main.ts check-compatibility --data-dir ./data --artifact codellama-7b-q4_k_m-ollama --json
```

Output includes: classification, bottlenecks, operating limits, suggested adjustments, and warnings.

#### `plan-install`

Generate an install plan for a model artifact on the detected host.

```bash
npx tsx src/cli/main.ts plan-install --data-dir ./data --artifact codellama-7b-q4_k_m-ollama
npx tsx src/cli/main.ts plan-install --data-dir ./data --artifact codellama-7b-q4_k_m-ollama --json
```

**⚠ IMPORTANT: Install plans are INFORMATIONAL ONLY and are NOT executed.**

The plan describes what commands would need to run, their risk levels, prerequisites,
resource estimates, and verification steps — but the CLI never executes any of them.

#### `render-plan`

Render a previously saved install plan JSON file with safety evaluation.

```bash
npx tsx src/cli/main.ts render-plan --plan-file ./my-plan.json
npx tsx src/cli/main.ts render-plan --plan-file ./my-plan.json --json
```

### JSON output

All commands support `--json` to output structured JSON instead of human-readable text.
This is useful for piping to other tools or programmatic consumption:

```bash
npx tsx src/cli/main.ts list-models --data-dir ./data --json | jq '.[].artifactId'
npx tsx src/cli/main.ts check-compatibility --data-dir ./data --artifact <id> --json | jq '.classification'
```

### Safety status interpretation

When using `plan-install` or `render-plan`, the safety report uses a 3-state model:

| Status | Meaning |
|--------|---------|
| **`approved`** | Plan is safe to execute without further review. No blocked violations, no dangerous commands, and no steps requiring approval. |
| **`requiresHumanApproval`** | Plan contains dangerous commands, steps marked for approval, or policy mismatches. A human must review and explicitly approve before any execution. The `violations` and `warnings` arrays describe what needs attention. |
| **`blocked`** | Plan contains at least one blocked-severity violation (e.g. `rm -rf /`, filesystem format, raw device write). **The plan must not be executed.** |

**Precedence:**
- `blocked` takes absolute precedence
- `requiresHumanApproval` only applies when not blocked
- `approved` is true only when neither blocked nor requiresHumanApproval

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage error (wrong flags, missing arguments) |
| `2` | Input error (file not found, invalid ID) |
| `3` | Runtime error |

### Command → backend module mapping

| CLI Command | Backend Module(s) |
|---|---|
| `detect-host` | `detectHost()` from `src/detection/host-detector.ts` |
| `list-models` | `ModelCatalog` queries from `src/catalog/model-catalog.ts` |
| `recommend-models` | `recommend()` from `src/compatibility/recommendation-engine.ts` |
| `check-compatibility` | `checkCompatibility()` from `src/compatibility/compatibility-engine.ts` |
| `plan-install` | `generateInstallPlan()`, `evaluatePlanSafety()`, `renderPlan()` from `src/install-plan/` |
| `render-plan` | `evaluatePlanSafety()`, `renderPlan()` from `src/install-plan/` |

## Testing

```bash
npm test              # Run all tests
npm run typecheck     # Type-check without emitting
npm run lint          # Lint source and tests
```
