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
- **Session management** — first-class sessions with lifecycle stages, event timelines, save/restore, and recent-session tracking
- **Workspace lifecycle** — open existing directories or clone repositories as session workspaces with git metadata detection
- **MCP server integration** — attach, manage, and monitor Model Context Protocol servers with health and discovery tracking
- **Agent registry** — register, attach, and route coding agents with capability-based stage participation
- **Structured commands** — typed, validated command layer for all session actions (open workspace, attach MCP, run workflow, etc.)
- **App shell** — zero-dependency local web UI with demo and real modes, session timeline, console, and command composer
- **CLI** — developer-facing command interface for detection, compatibility, planning, and workflow execution

## What this package does NOT do

- **Execute install commands** — plans are informational only; the backend never runs shell commands
- **Support YAML manifests** — only JSON manifests are supported
- **Connect to cloud/remote services** — all operations are local-first
- **Provide a plugin marketplace** — catalogs are loaded from local directories
- **Run autonomous agents** — agent routing is declarative; there is no autonomous execution loop
- **Provide an LLM chat interface** — the command layer is structured and deterministic, not free-form

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
import { ... } from "codingagent-backend";                    // Root: types, schemas, catalog, detection, compatibility, planning, safety, workflow, session, MCP, agents, commands
import { ... } from "codingagent-backend/cli";                // CLI: main, errors, commands, host-loader
import { ... } from "codingagent-backend/workflow";           // Workflow: runWorkflow, types, stage order
import { ... } from "codingagent-backend/schemas";            // Schemas: all Zod schemas
import { ... } from "codingagent-backend/frontend-contracts"; // Frontend contracts: mappers, status labels, view-model types
import { ... } from "codingagent-backend/app-shell";          // App shell: server, views, data provider, timeline/console helpers
import { ... } from "codingagent-backend/session";            // Session: manager, persistence, recent sessions, workspace lifecycle
import { ... } from "codingagent-backend/mcp";                // MCP: manager, process manager, capability discovery, health, tool invocation
import { ... } from "codingagent-backend/agents";             // Agents: registry, routing, participation, session integration
import { ... } from "codingagent-backend/commands";           // Commands: definitions, validation, availability, executor
import { ... } from "codingagent-backend/fingerprint";        // Fingerprint: repo detection, language profiles, agent enrichment
import { ... } from "codingagent-backend/toolchain";          // Toolchain: profile-aware adapters, workspace checks, availability
import { ... } from "codingagent-backend/language-service";   // Language service: diagnostics layer, LSP bridge, availability
import { ... } from "codingagent-backend/language-context";   // Language context: symbol extraction, file/module/workspace intelligence
import { ... } from "codingagent-backend/agent-context";     // Agent context: deterministic prompt context assembly, prioritization, traceability
import { ... } from "codingagent-backend/agent-run";         // Agent run: bounded task dispatch, agent selection, execution adapters
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

## App shell (local web UI)

The app shell provides a zero-dependency browser-based UI for exploring model compatibility, recommendations, install plans, workflow summaries, session timelines, and the structured command composer.

```bash
npm run app-shell          # Start on port 3000 (demo mode by default)
npm run preflight          # Check environment readiness
```

Open http://localhost:3000 — demo mode works out of the box with no setup.

Capabilities:
- **Demo mode** — 6 pre-built scenarios covering supported, unsupported, blocked, and partial workflows
- **Real mode** — run the actual backend workflow against your own data and host profile
- **Session timeline** — chronological event feed with category classification
- **Session console** — chat-like console with actor/card grouping and presence indicators
- **Command composer** — structured command UI for workspace, MCP, agent, workflow, and session operations
- **Session persistence** — save, restore, and browse recent sessions

For real mode with your own data, see **[docs/QUICKSTART.md](docs/QUICKSTART.md)**.

## Documentation

- **[docs/QUICKSTART.md](docs/QUICKSTART.md)** — Quick start guide (demo + real mode)
- **[docs/APP-SHELL.md](docs/APP-SHELL.md)** — App shell architecture and API reference
- **[docs/USAGE.md](docs/USAGE.md)** — Full usage guide with library, CLI, and workflow documentation
- **[docs/SESSION-WORKSPACE.md](docs/SESSION-WORKSPACE.md)** — Session and workspace domain model
- **[docs/SESSION-TIMELINE.md](docs/SESSION-TIMELINE.md)** — Session timeline UI and event categories
- **[docs/SESSION-CONSOLE.md](docs/SESSION-CONSOLE.md)** — Chat-like session console
- **[docs/SESSION-PERSISTENCE.md](docs/SESSION-PERSISTENCE.md)** — Session save/restore and recent sessions
- **[docs/MCP-SERVERS.md](docs/MCP-SERVERS.md)** — MCP server integration and lifecycle
- **[docs/MCP-HEALTH.md](docs/MCP-HEALTH.md)** — MCP health monitoring and discovery
- **[docs/GITHUB-MCP.md](docs/GITHUB-MCP.md)** — GitHub MCP read-only integration and tool invocation
- **[docs/AGENTS.md](docs/AGENTS.md)** — Agent registry and attachment model
- **[docs/AGENT-ROUTING.md](docs/AGENT-ROUTING.md)** — Agent routing and stage participation
- **[docs/COMMANDS.md](docs/COMMANDS.md)** — Structured command composer
- **[docs/FINGERPRINTING.md](docs/FINGERPRINTING.md)** — Repository fingerprinting and language detection
- **[docs/TOOLCHAIN.md](docs/TOOLCHAIN.md)** — Profile-aware toolchain adapters and workspace checks
- **[docs/LANGUAGE-SERVICE.md](docs/LANGUAGE-SERVICE.md)** — Minimal language service and diagnostics layer
- **[docs/LANGUAGE-CONTEXT.md](docs/LANGUAGE-CONTEXT.md)** — Language context: symbol extraction and workspace intelligence
- **[docs/AGENT-CONTEXT.md](docs/AGENT-CONTEXT.md)** — Agent context: deterministic prompt context assembly and prioritization
- **[docs/AGENT-RUN.md](docs/AGENT-RUN.md)** — Agent run: bounded task dispatch, selection, and execution adapters
- **[docs/EXECUTION-ADAPTER.md](docs/EXECUTION-ADAPTER.md)** — Model-backed execution adapter: OpenAI-compatible API, configuration, and availability
- **[docs/ADAPTER-DISPLAY.md](docs/ADAPTER-DISPLAY.md)** — Shell adapter status display and agent output rendering
- **[docs/ELECTRON.md](docs/ELECTRON.md)** — Electron desktop wrapper
- **[docs/PACKAGING.md](docs/PACKAGING.md)** — Packaging and desktop launcher decisions
- **[docs/CODE-SIGNING.md](docs/CODE-SIGNING.md)** — Code-signing strategy and release readiness
- **[docs/BETA-TESTING.md](docs/BETA-TESTING.md)** — Beta testing and V1 release guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Architecture consistency audit and module map
- **[CHANGELOG.md](CHANGELOG.md)** — Release notes

## Known limitations (V1)

- **No install execution** — plans describe what steps would be needed but are never executed
- **MCP transport** — only `stdio` transport is implemented; `sse` and `streamable_http` are modeled but deferred
- **Agent execution** — agent routing and participation are declarative; autonomous agent execution is not implemented
- **Session persistence** — MCP server processes and agent runtime state are not preserved across save/restore; only metadata and events are persisted
- **Real-time updates** — the app shell uses request/response; there is no WebSocket or SSE push for live event streaming
- **GitHub MCP** — read-only tools only; manual discovery (no live MCP protocol handshake); token presence is checked but not validated; no rate limiting
- **Language service** — minimal diagnostics layer; no persistent LSP daemon management, real-time diagnostics streaming, or editor embedding
- **Toolchain adapters** — profile-to-command mapping is deterministic but basic; no custom user-defined adapters
- **Repository fingerprinting** — file-based detection only; no deep AST analysis or dynamic probing
- **Naming drift** — a few agent types (`ParticipationReason`, `StageParticipation`) lack the `Agent` prefix (breaking change deferred)
- **views.ts duplication** — client-side JS in the app shell duplicates some server-side constants (unavoidable without a shared module system)
- **Desktop builds are unsigned** — users will see OS security warnings on first launch; code signing is environment-driven but not yet active

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
