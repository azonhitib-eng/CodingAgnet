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

For testing or deterministic workflows, you can construct a mock `HostProfile` directly:

```typescript
import type { HostProfile } from "codingagent-backend";

const mockHost: HostProfile = {
  detectedAt: new Date().toISOString(),
  os: { platform: { value: "linux", confidence: "certain" }, /* ... */ },
  // ...
};
```

You can also validate a previously saved host profile:

```typescript
import { validateHostProfile } from "codingagent-backend";

// Throws if data doesn't match HostProfileSchema
const host = validateHostProfile(parsedJsonObject);
```

> **Note:** `loadHostProfile(filePath)` is available from the CLI module
> (`import { loadHostProfile } from "codingagent-backend/cli"`) for file-based
> loading. The root API only exports the pure validation helper.

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

## Workflow orchestration layer (Phase 8A)

### What it is

The workflow layer is a **deterministic, staged pipeline** that orchestrates existing backend modules
in an explicit order with typed inputs/outputs and approval-aware status propagation.

It provides:

- **Explicit stages** with defined inputs and outputs
- **Deterministic stage ordering** — stages always run in the same sequence
- **Approval-aware status** — `completed`, `completed_requires_approval`, `blocked`, `failed`, or `partial`
- **Partial execution** — stop after any stage for review or debugging
- **Intermediate output preservation** — every completed stage's output is available in the result
- **Explicit target selection** — selection method and reasoning are surfaced in the result

### What it is NOT

- Not an execution engine — install plans are never executed
- Not a background job system — all operations are synchronous
- Not a multi-agent framework — no task delegation or scheduling
- Not a UI workflow builder — no visual steps or drag-and-drop
- Not a retry/scheduling system — no concurrency, retries, or queuing

### Available stages

Stages execute in this order:

| # | Stage | Input | Output |
|---|-------|-------|--------|
| 1 | `catalog_loading` | Pre-loaded `CatalogBundle` | Validated bundle reference |
| 2 | `host_acquisition` | Pre-acquired `HostProfile` | Validated host reference |
| 3 | `recommendation` | Bundle + host | Ranked `ModelRecommendation[]` |
| 4 | `target_selection` | Recommendations + optional `artifactId` | Selected artifact, variant, family, runtime + selection reasoning |
| 5 | `compatibility_evaluation` | Host + selected target | `CompatibilityResult` |
| 6 | `install_planning` | Host + target + compatibility | `InstallPlan` |
| 7 | `safety_evaluation` | Plan + policy | `SafetyReport` |
| 8 | `rendering` | Plan + safety report | Rendered text output |

### Approval / blocking semantics

The workflow result status directly reflects the safety evaluation:

| Status | Meaning |
|--------|---------|
| `completed` | All stages ran, safety report is **approved** |
| `completed_requires_approval` | All stages ran, but safety requires **human approval** before execution |
| `blocked` | Safety evaluation found **blocked** violations — workflow stops before rendering |
| `failed` | A stage failed due to invalid input or internal error |
| `partial` | Stopped early at a requested stage for review |

**Key rules:**
- If safety says `blocked`, the workflow surfaces `blocked` and stops before rendering
- If safety says `requiresHumanApproval`, the workflow surfaces `completed_requires_approval`
- These states are never hidden behind a single "success" result

### Running partial vs full workflows

```typescript
import { runWorkflow } from "codingagent-backend";

// Full workflow
const result = runWorkflow({ bundle, host });

// Stop after recommendation (for review)
const partial = runWorkflow({ bundle, host, stopAfter: "recommendation" });
// partial.status === "partial"
// partial.stageOutputs.recommendation is available
// partial.stageOutputs.target_selection is undefined

// Stop after compatibility evaluation
const compatOnly = runWorkflow({ bundle, host, stopAfter: "compatibility_evaluation" });

// Stop after safety evaluation (skip rendering)
const safetyOnly = runWorkflow({ bundle, host, stopAfter: "safety_evaluation" });

// Explicit artifact selection
const explicit = runWorkflow({ bundle, host, artifactId: "my-artifact-id" });
// explicit.stageOutputs.target_selection?.selectionMethod === "explicit_artifact_id"
```

### Accessing intermediate outputs

```typescript
const result = runWorkflow({ bundle, host });

// Every completed stage's output is available
const recs = result.stageOutputs.recommendation?.recommendations;
const target = result.stageOutputs.target_selection;
const safety = result.stageOutputs.safety_evaluation?.safetyReport;
const rendered = result.stageOutputs.rendering?.rendered;

// Target selection reasoning is explicit
console.log(target?.selectionMethod);  // "recommendation_default" or "explicit_artifact_id"
console.log(target?.selectionReason);  // Human-readable explanation
```

### Important: this does NOT execute install plans

The workflow layer orchestrates **planning and evaluation** only. Install plans describe what
commands would need to run, but the workflow layer (like all other backend layers) **never
executes** any commands. A human operator must review the plan and safety report before any
manual execution.

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
| `--host-file <path>` | Use a saved host profile JSON instead of live detection |
| `--help` | Show help message |

### Host detection behavior

Commands that need a host profile (`recommend-models`, `check-compatibility`, `plan-install`) use **live detection** by default — they probe the current machine's OS, CPU, memory, GPU, and installed runtimes.

To get **deterministic, reproducible results**, provide a saved host profile with `--host-file <path>`:

```bash
# Save a host profile once
npx tsx src/cli/main.ts detect-host --json > host.json

# Use the saved profile for deterministic results
npx tsx src/cli/main.ts recommend-models --data-dir ./data --host-file host.json
npx tsx src/cli/main.ts check-compatibility --data-dir ./data --host-file host.json --artifact <id>
npx tsx src/cli/main.ts plan-install --data-dir ./data --host-file host.json --artifact <id>
```

The host file must be valid JSON conforming to the `HostProfileSchema`. Invalid files produce clear error messages with field-level details.

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

**Input expectations:**
The plan file must be valid JSON conforming to the `InstallPlanSchema`. Required fields include `artifactId`, `runtimeId`, `targetPlatform`, `prerequisites`, `steps`, `postInstallVerification`, `resourceEstimate`, `risks`, and `humanSummary`. Each step must have valid `riskLevel` values (`safe`, `caution`, `dangerous`, `blocked`) and a valid `targetPlatform` (`linux`, `darwin`, `win32`). Invalid plans produce clear schema validation errors with field paths.

### JSON output

All commands support `--json` to output structured JSON instead of human-readable text.
This is useful for piping to other tools or programmatic consumption:

```bash
npx tsx src/cli/main.ts list-models --data-dir ./data --json | jq '.[].artifactId'
npx tsx src/cli/main.ts check-compatibility --data-dir ./data --artifact <id> --json | jq '.classification'
```

**JSON field ordering** follows object construction order for predictability. Arrays are sorted where meaningful (e.g. `list-models` sorts by family → variant → artifactId).

**Empty results** produce consistent messaging:
- `list-models` with no matches: `"No models found matching the given filters."` (pretty) or `[]` (JSON)
- `recommend-models` with no matches: `"No compatible models found for this host."` (pretty) or `[]` (JSON)

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

| Code | Constant | Meaning | Examples |
|------|----------|---------|----------|
| `0` | `EXIT_OK` | Success | Command completed normally |
| `1` | `EXIT_USAGE` | Usage error | Wrong flags, missing arguments, unknown command, invalid filter values |
| `2` | `EXIT_INPUT` | Input error | File not found, invalid JSON, schema validation failure, unknown artifact ID |
| `3` | `EXIT_RUNTIME` | Runtime error | Unexpected errors, catalog load failures, internal errors |

**Error behavior:**
- All errors print to stderr via `Error: <message>` format
- Schema validation failures include field-level details (e.g. `steps.0.command: String must contain at least 1 character(s)`)
- File read errors include the underlying OS error detail
- Missing artifact IDs include the ID in the error message

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

## Important: Plans are informational only

All install plans generated by this system are **informational only**. The CLI and
library **never execute** any commands. Plans describe what steps would be needed to
install a model on a given host, along with risk assessments and safety evaluations.

A human operator must review the plan, assess the safety report, and decide whether
to proceed with manual execution. The `blocked` safety status means the plan contains
dangerous operations that should never be executed without careful review.
