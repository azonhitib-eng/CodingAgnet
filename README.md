# codingagent-backend

Portable, local-first coding-agent platform backend — catalog management, host detection, compatibility evaluation, install planning, safety analysis, and workflow orchestration.

> **Plans are informational only and are never executed.**

## What this package does

- **Catalog management** — load and validate model, runtime, and agent-tool manifests from JSON files
- **Host detection** — probe the local machine for OS, CPU, memory, GPU, and installed runtimes
- **Compatibility evaluation** — determine whether a model artifact can run on a given host
- **Recommendation** — rank all catalog artifacts by compatibility and quality for a host
- **Install planning** — generate deterministic, reviewable plans describing what steps would be needed
- **Safety evaluation** — classify every plan step by risk and produce an approval decision
- **Workflow orchestration** — run the full pipeline as a staged, deterministic workflow with typed outputs
- **CLI** — developer-facing command interface for all of the above

## What this package does NOT do

- **Execute commands** — plans are informational only; the backend never runs shell commands
- **Support YAML manifests** — only JSON manifests are supported
- **Connect to cloud/remote services** — all operations are local
- **Provide a plugin marketplace** — catalogs are loaded from local directories
- **Run background tasks** — no daemon, server, or background mode
- **Provide a frontend/UI** — backend only

## Quick start (library)

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

// 1. Load catalogs
const bundle = loadCatalogBundleSync({
  models: "./data/models",
  runtimes: "./data/runtimes",
  agentTools: "./data/agent-tools",
});

// 2. Detect host
const host = await detectHost({
  catalogRuntimes: bundle.runtimes.listAll(),
});

// 3. Get recommendations
const recs = recommend(host, bundle);

// 4. Generate install plan for the top recommendation
const artifact = bundle.models.getArtifact(recs[0].artifactId)!;
const variant = bundle.models.getVariant(recs[0].variantId)!;
const runtime = bundle.runtimes.get(artifact.runtimeId)!;
const plan = generateInstallPlan({
  host, artifact, variant, runtime,
  compatibility: recs[0].compatibility,
});

// 5. Evaluate safety
const safety = evaluatePlanSafety(plan, defaultExecutionPolicy());

// 6. Render
console.log(renderPlan(plan, safety));
```

## Quick start (CLI)

```bash
# Detect local host
npx tsx src/cli/main.ts detect-host --json

# List models
npx tsx src/cli/main.ts list-models --data-dir ./data

# Recommend models for your host
npx tsx src/cli/main.ts recommend-models --data-dir ./data

# Run the full workflow
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json

# Show help
npx tsx src/cli/main.ts --help
```

## Quick start (workflow)

```typescript
import { runWorkflow, loadCatalogBundleSync, detectHost } from "codingagent-backend";

const bundle = loadCatalogBundleSync({
  models: "./data/models",
  runtimes: "./data/runtimes",
  agentTools: "./data/agent-tools",
});
const host = await detectHost({ catalogRuntimes: bundle.runtimes.listAll() });

const result = runWorkflow({ bundle, host });
// result.status: "completed" | "completed_requires_approval" | "blocked" | "failed" | "partial"
// result.stageOutputs: typed outputs for each completed stage
```

## Safety status meanings

| Status | Meaning |
|--------|---------|
| `approved` | Plan is safe. No blocked violations, no dangerous commands. |
| `requiresHumanApproval` | Plan contains dangerous commands or policy mismatches. Human must review. |
| `blocked` | Plan contains blocked-severity violations. **Must not be executed.** |

**Precedence:** `blocked` > `requiresHumanApproval` > `approved`

## Subpath exports

```typescript
import { ... } from "codingagent-backend";          // Root: types, schemas, catalog, detection, compatibility, planning, safety, workflow, API
import { ... } from "codingagent-backend/cli";       // CLI: main, errors, commands, host-loader
import { ... } from "codingagent-backend/workflow";  // Workflow: runWorkflow, types, stage order
import { ... } from "codingagent-backend/schemas";   // Schemas: all Zod schemas
```

## CLI exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage error (wrong flags, missing arguments) |
| `2` | Input error (bad file, invalid JSON, unknown artifact) |
| `3` | Runtime error (unexpected internal error) |
| `4` | Blocked (workflow safety found blocked violations) |
| `5` | Requires approval (`--strict` mode only: workflow needs human review) |

## Strict/CI mode

Use `--strict` to get a non-zero exit code when a workflow completes but requires human approval. This is useful in CI/CD pipelines where approval-required is not an acceptable outcome:

```bash
# In CI: fail the build if the workflow requires approval
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json --strict
```

Without `--strict`, both `completed` and `completed_requires_approval` return exit code `0`.
With `--strict`, `completed_requires_approval` returns exit code `5`.

## Deterministic host files

Use `--host-file` for reproducible, deterministic results:

```bash
# Save host profile once
npx tsx src/cli/main.ts detect-host --json > host.json

# Reuse for deterministic operations
npx tsx src/cli/main.ts recommend-models --data-dir ./data --host-file host.json
npx tsx src/cli/main.ts run-workflow --data-dir ./data --host-file host.json
```

## JSON output

All CLI commands support `--json` for structured, machine-readable output. JSON output is deterministic for the same inputs.

## Documentation

- **[docs/USAGE.md](docs/USAGE.md)** — Full usage guide with library, CLI, and workflow documentation
- **[CHANGELOG.md](CHANGELOG.md)** — Release notes

## Development

```bash
npm install
npm run build       # Compile TypeScript
npm test            # Run tests
npm run typecheck   # Type-check without emitting
npm run lint        # Lint source and tests
```

Requires Node.js >= 18.0.0.

## Release checklist

1. Update version in `package.json` (the CLI reads it at runtime)
2. Update `CHANGELOG.md` with release notes
3. Run `npm test` — all tests must pass
4. Run `npm run typecheck` — no type errors
5. Run `npm run lint` — no lint errors
6. Run `npm run build` — clean compile
7. Verify `npm pack --dry-run` includes expected files
8. Publish: `npm publish`

## License

MIT
