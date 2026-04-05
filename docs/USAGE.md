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
| `--strict` | Strict/CI mode: non-zero exit for approval-required workflows |
| `--help` | Show help message |
| `--version` | Show package version |

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

#### `run-workflow`

Run the full staged workflow pipeline. This command invokes the workflow runner (`runWorkflow()`) which
orchestrates catalog loading → host acquisition → recommendation → target selection → compatibility
evaluation → install planning → safety evaluation → rendering in a single deterministic pass.

```bash
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --json
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --artifact codellama-7b-q4_k_m-ollama
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --stop-after recommendation
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --stop-after safety_evaluation --json
```

| Flag | Description |
|------|-------------|
| `--artifact <id>` | Target a specific artifact (optional; defaults to top recommendation) |
| `--stop-after <stage>` | Stop after the given stage for review (optional) |

Valid `--stop-after` stages: `catalog_loading`, `host_acquisition`, `recommendation`, `target_selection`, `compatibility_evaluation`, `install_planning`, `safety_evaluation`, `rendering`.

**Output:**
- Pretty mode shows status, completed stages, target selection reasoning, safety summary, and rendered plan
- JSON mode provides structured output with `status`, `completedStages`, `stageOutputs`, and optional `stoppedAfter`/`error`/`failedStage` fields

**⚠ IMPORTANT: This is NOT an execution engine. Plans are INFORMATIONAL ONLY and are NOT executed.**

**Exit code behavior for `run-workflow`:**
- `completed` and `completed_requires_approval` → exit code `0`
- `partial` → exit code `0` (user requested early stop)
- `blocked` → exit code `4` (`EXIT_BLOCKED`)
- `failed` → exit code `3` (`EXIT_RUNTIME`)
- With `--strict`: `completed_requires_approval` → exit code `5` (`EXIT_APPROVAL`)

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
| `4` | `EXIT_BLOCKED` | Blocked | Workflow safety evaluation found blocked violations |
| `5` | `EXIT_APPROVAL` | Requires approval | `--strict` mode only: workflow completed but requires human approval |

**Error behavior:**
- All errors print to stderr via `Error: <message>` format
- Schema validation failures include field-level details (e.g. `steps.0.command: String must contain at least 1 character(s)`)
- File read errors include the underlying OS error detail
- Missing artifact IDs include the ID in the error message

### Strict/CI mode

The `--strict` flag is intended for CI/CD pipelines where `completed_requires_approval` should not silently succeed:

```bash
# Normal: approval-required returns exit 0
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json

# Strict: approval-required returns exit 5
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --strict
```

| Workflow status | Default exit | `--strict` exit |
|---|---|---|
| `completed` | `0` | `0` |
| `completed_requires_approval` | `0` | `5` |
| `partial` | `0` | `0` |
| `blocked` | `4` | `4` |
| `failed` | `3` | `3` |

The `--strict` flag only affects the `run-workflow` command. Other commands are unaffected.

### Command → backend module mapping

| CLI Command | Backend Module(s) |
|---|---|
| `detect-host` | `detectHost()` from `src/detection/host-detector.ts` |
| `list-models` | `ModelCatalog` queries from `src/catalog/model-catalog.ts` |
| `recommend-models` | `recommend()` from `src/compatibility/recommendation-engine.ts` |
| `check-compatibility` | `checkCompatibility()` from `src/compatibility/compatibility-engine.ts` |
| `plan-install` | `generateInstallPlan()`, `evaluatePlanSafety()`, `renderPlan()` from `src/install-plan/` |
| `render-plan` | `evaluatePlanSafety()`, `renderPlan()` from `src/install-plan/` |
| `run-workflow` | `runWorkflow()` from `src/workflow/workflow-runner.ts` |

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

## Deterministic Testing & Host-Profile Fixtures

### Overview

Phase 10 introduces a **deterministic host-profile fixture infrastructure** for
cross-platform validation and regression prevention. This enables reproducible
testing of compatibility, recommendation, planning, and workflow behavior across
representative hardware classes — without requiring real hardware access in CI.

### Fixture Strategy

Host-profile fixtures live in `tests/fixtures/host-profiles.ts` and represent
six realistic hardware classes:

| Fixture Name       | Description                                          |
|--------------------|------------------------------------------------------|
| `lowEndCpuOnly`    | Budget laptop: 8 GB RAM, no GPU, 4 threads           |
| `midRangeGpu`      | Developer workstation: 32 GB RAM, RTX 3060 12 GB     |
| `highEndGpu`       | ML workstation: 64 GB RAM, RTX 4090 24 GB            |
| `missingRuntime`   | Good hardware (M2 Pro) but no runtimes installed      |
| `partiallyUnknown` | Mixed confidence levels, some detection failures      |
| `unsupportedWeak`  | Extremely low resources: 2 GB RAM, no GPU             |

All fixtures conform to the `HostProfile` type and pass `HostProfileSchema`
validation. Confidence levels (`certain`, `estimated`, `unknown`) are set
realistically for each field.

### What Is Directly Tested vs Inferred

| Behavior                              | Testing Method                        |
|---------------------------------------|---------------------------------------|
| GPU parser output (nvidia-smi, macOS) | Direct mock outputs, unit tests       |
| Compatibility classification          | Fixtures × catalog, deterministic     |
| Recommendation ordering               | Fixtures × catalog, drift detection   |
| Install plan generation               | Fixtures × top recommendation         |
| Safety evaluation                     | Fixtures × default policy             |
| Workflow terminal status              | Fixtures × full pipeline              |
| Real OS / CPU / memory detection      | Inferred (uses Node.js builtins)      |
| Real GPU detection (nvidia-smi, etc.) | Inferred (tested via mocked runners)  |
| Runtime version extraction            | Existing unit tests with mock outputs |

### Support-Class Semantics

The compatibility engine produces four classifications:

- **`supported`** — Host meets all recommended requirements. Full context window,
  GPU offload, no disk swap. Example: RTX 4090 + 64 GB RAM running 7B model.

- **`supported_with_limits`** — Host meets minimum but not recommended requirements.
  Context window may be reduced, partial GPU offload, settings adjustments needed.
  Example: 32 GB RAM machine running 13B model near boundary.

- **`cpu_only_slow`** — No viable GPU offload. Model runs on CPU only, ~5–20×
  slower than GPU. May still be acceptable for batch use. Example: CPU-only
  laptop running small 7B model.

- **`unsupported`** — Host fails critical requirements. Model cannot run reliably.
  Causes: insufficient RAM, missing runtime, incompatible OS. Example: 2 GB RAM
  machine or no runtimes installed.

### Practical Support Expectations / Limitations

- **Workflow status**: Install plans typically contain `curl | sh` style runtime
  installation commands that the safety evaluator classifies as `caution`. This
  means most workflows produce `completed_requires_approval` rather than
  `completed`, even on high-end hardware. This is by design — the system is
  conservative about approval.

- **GPU detection**: Only NVIDIA (via `nvidia-smi`) and macOS (via
  `system_profiler`) are directly tested. Other GPU vendors fall back to
  `unknown`. Detection confidence is always preserved in the host profile.

- **Uncertainty handling**: When host values are `estimated` or `unknown`, the
  compatibility engine adds warnings but does not block. GPU offload is
  optimistically assumed when a GPU is detected but VRAM is unknown.

- **Recommendation stability**: Recommendations are scored deterministically
  (`CLASS_SCORE + QUANT_QUALITY`). For identical inputs, ordering is guaranteed
  stable. Ties are broken alphabetically by display name.

### Running Regression Tests

```bash
# Run all tests including Phase 10 regression suite
npx vitest run

# Run only the support-matrix regression suite
npx vitest run tests/integration/support-matrix-regression.test.ts

# Run only fixture validation tests
npx vitest run tests/fixtures/host-profiles.test.ts

# Run cross-platform detector validation
npx vitest run tests/detection/cross-platform-detector.test.ts
```

---

## Frontend contract layer

### What it is

The frontend contract layer (`src/frontend-contracts/`) provides stable, UI-friendly
**view-model types** and **mapping functions** on top of existing backend outputs.
It is a thin transformation layer — not a replacement for the backend types.

Import via the main package or the dedicated subpath:

```typescript
import {
  toHostSummary,
  toCompatibilityView,
  toRecommendationList,
  toPlanReviewView,
  toWorkflowView,
  toFinalReviewState,
  normalizeFrontendError,
  COMPATIBILITY_LABELS,
  WORKFLOW_STATUS_LABELS,
  SAFETY_STATUS_LABELS,
} from "codingagent-backend";

// Or from the dedicated subpath:
// import { ... } from "codingagent-backend/frontend-contracts";
```

### Why it exists

Backend outputs use rich, detailed types optimised for correctness and internal use.
A future frontend needs:

- **Concise summaries** (one-line host description, status labels)
- **Severity levels** (`info`, `warning`, `error`, `critical`) for colour-coding
- **Normalized status enums** with stable labels and messages
- **Flat, UI-friendly shapes** that don't require deep nesting knowledge
- **Preserved detail** — `_raw` fields expose the original backend objects

The view-model layer bridges this gap without duplicating business logic.

### Raw backend outputs underneath

| Backend type | View-model | Mapper |
|---|---|---|
| `HostProfile` | `HostSummaryViewModel` | `toHostSummary()` |
| `CompatibilityResult` | `CompatibilityViewModel` | `toCompatibilityView()` |
| `ModelRecommendation[]` | `RecommendationItem[]` | `toRecommendationList()` |
| `InstallPlan` + `SafetyReport` | `PlanReviewViewModel` | `toPlanReviewView()` |
| `SafetyReport` | `SafetyStatusView` | `toSafetyStatusView()` |
| `WorkflowResult` | `WorkflowViewModel` | `toWorkflowView()` |
| composite | `FinalReviewState` | `toFinalReviewState()` |

### Normalized statuses

**Compatibility statuses** (from `CompatibilityClass`):

| Status | Label | Severity |
|---|---|---|
| `supported` | Fully Supported | `info` |
| `supported_with_limits` | Supported with Limits | `warning` |
| `cpu_only_slow` | CPU Only — Slow | `warning` |
| `unsupported` | Unsupported | `error` |

**Workflow statuses** (from `WorkflowStatus`):

| Status | Label | Severity |
|---|---|---|
| `completed` | Completed | `info` |
| `completed_requires_approval` | Completed — Requires Approval | `warning` |
| `blocked` | Blocked | `critical` |
| `failed` | Failed | `error` |
| `partial` | Partial | `info` |

**Safety statuses** (derived from `SafetyReport`):

| Status | Label | Severity |
|---|---|---|
| `approved` | Approved | `info` |
| `requiresHumanApproval` | Requires Human Approval | `warning` |
| `blocked` | Blocked | `critical` |

### Error contract

The `FrontendError` type provides a stable, machine-readable error shape:

```typescript
interface FrontendError {
  code: "INVALID_INPUT" | "MISSING_ARTIFACT" | "MISSING_RUNTIME"
      | "BLOCKED_BY_POLICY" | "INTERNAL_FAILURE";
  message: string;
  details: Record<string, unknown> | null;
}
```

Use `normalizeFrontendError(error)` to classify backend errors into this shape.

### Running frontend contract tests

```bash
# Run frontend contract mapping tests
npx vitest run tests/frontend-contracts/mappers.test.ts
```
