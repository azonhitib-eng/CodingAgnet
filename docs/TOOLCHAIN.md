# Toolchain Adapters

Phase 39: Profile-aware toolchain adapter layer and workspace checks.

## Overview

Toolchain adapters bridge the gap between **repository fingerprinting / language profiles** (Phase 38) and **practical coding-agent utility**. They answer the questions:

- What checks are relevant for this repository?
- What toolchain commands make sense given the detected profile?
- Which tools are available vs missing?
- What can be run safely and explicitly?

Toolchain adapters are **not** an execution engine, install system, or autonomous agent framework. They provide structured, deterministic information about what toolchain commands are relevant and whether they can be run.

## Architecture

```
RepoFingerprint → ProfileSelection → ToolchainAdapter → WorkspaceToolchainSummary
     (Phase 38)      (Phase 38)         (Phase 39)           (Phase 39)
```

### Module Structure

```
src/toolchain/
├── types.ts                 — Domain types (ToolchainAdapterId, commands, checks, etc.)
├── mapping.ts               — Profile-to-toolchain command mapping
├── check-planning.ts        — Workspace check planning and availability assessment
├── execution.ts             — Minimal explicit execution support
├── session-integration.ts   — Session events and summary helpers
└── index.ts                 — Barrel exports
```

## Key Types

| Type | Purpose |
|------|---------|
| `ToolchainAdapterId` | Unique adapter identifier (e.g., `typescript-node-toolchain`) |
| `ToolchainKind` | Broad toolchain family: `npm`, `cargo`, `go`, `pip`, `composer`, etc. |
| `ToolchainCommandType` | Check category: `lint`, `test`, `build`, `typecheck`, `format`, `dependency_check` |
| `ToolchainCommandDefinition` | A single command/check with evidence, priority, and tool info |
| `ToolchainAvailability` | Availability assessment (available, likely_available, unavailable, unknown) |
| `ToolchainCheckResult` | Execution result (passed, failed, error, skipped) |
| `ToolchainCheckResultSummary` | Aggregate of all check results |
| `WorkspaceToolchainSummary` | Complete toolchain state for a workspace |

## Profile-to-Toolchain Mapping

Each language profile maps to specific toolchain commands based on **file evidence** found in the repository:

### TypeScript (Node.js) — `typescript-node`
- **Typecheck**: `npx tsc --noEmit` (when `tsconfig.json` found)
- **Lint**: `npx eslint .` (when eslint config found)
- **Test**: `npx vitest run` / `npx jest` (when config found)
- **Build**: `npm run build` (when `package.json` found)
- **Format**: `npx prettier --check .` (when prettier config found)
- **Dependency check**: `npm audit --omit=dev` (when lockfile found)

### JavaScript (Node.js) — `javascript-node`
- **Lint**: `npx eslint .`
- **Test**: `npx jest` / `npm test`
- **Build**: `npm run build`
- **Format**: `npx prettier --check .`
- **Dependency check**: `npm audit --omit=dev`

### Python Backend — `python-backend`
- **Lint**: `ruff check .` or `flake8 .`
- **Test**: `pytest`
- **Typecheck**: `mypy .` (when config found)
- **Format**: `ruff format --check .`
- **Dependency check**: `pip check`

### PHP General — `php-general`
- **Lint**: `vendor/bin/phpcs` (when phpcs.xml found)
- **Typecheck**: `vendor/bin/phpstan analyse` (when phpstan.neon found)
- **Test**: `vendor/bin/phpunit` (when phpunit.xml found)
- **Format**: `vendor/bin/php-cs-fixer fix --dry-run --diff`
- **Dependency check**: `composer audit`

### PHP WordPress — `php-wordpress`
- Inherits PHP general checks
- Adds WPCS (WordPress Coding Standards) suggestion if no phpcs config found

### Rust CLI — `rust-cli`
- **Build**: `cargo check`
- **Test**: `cargo test`
- **Lint**: `cargo clippy -- -D warnings`
- **Format**: `cargo fmt --check`
- **Dependency check**: `cargo audit` (when `Cargo.lock` found)

### Go Module — `go-module`
- **Build**: `go build ./...`
- **Test**: `go test ./...`
- **Lint**: `go vet ./...`
- **Format**: `gofmt -l .`
- **Dependency check**: `go mod verify` (when `go.sum` found)

### Generic Unknown — `generic-unknown`
- No toolchain commands (honest fallback)

## Workspace Check Planning

The check planning layer answers:

1. **Which checks are available?** — tools are installed or expected locally
2. **Which are recommended?** — priority is "recommended" and status is not unavailable
3. **Which are unavailable?** — tools not found on host
4. **Why were these checks selected?** — evidence files and reasons in each assessment

### Availability States

| Status | Meaning |
|--------|---------|
| `available` | Tool confirmed available on host |
| `likely_available` | Tool expected locally (node_modules/vendor) |
| `unavailable` | Tool not found on host |
| `unknown` | Requires host detection for confirmation |

## Execution Support

Minimal, explicit execution is available for safe developer-facing checks:

```typescript
import { executeCheck, executeChecks } from "./toolchain";

// Single check
const result = await executeCheck(command, workspacePath, shellRunner);
// result.status: "passed" | "failed" | "error" | "skipped"

// Multiple checks
const summary = await executeChecks(commands, workspacePath, shellRunner);
// summary.passed, summary.failed, summary.errored, summary.skipped
```

### Execution Constraints
- **Explicit invocation only** — no background execution
- **No autonomous retries** — failures are reported, not retried
- **No install behavior** — missing tools are reported, not installed
- **Output truncation** — stdout/stderr capped at 2000 chars
- **Duration tracking** — millisecond precision
- **ShellRunner injection** — testable without real subprocesses

## Session / Workspace Integration

### SessionSummary Fields (Phase 39)

| Field | Type | Description |
|-------|------|-------------|
| `toolchainAdapterId` | `string \| null` | Adapter identifier |
| `toolchainKind` | `string \| null` | Toolchain family |
| `toolchainCommandCount` | `number \| null` | Total mapped commands |
| `toolchainRecommendedCount` | `number \| null` | Recommended checks |
| `toolchainUnavailableCount` | `number \| null` | Unavailable checks |

### Session Events

Toolchain events are emitted through the existing session event model:

- `toolchain_summary_generated` — when a toolchain summary is built
- `toolchain_check_started` — when a check begins
- `toolchain_check_completed` — when a check finishes (with status)

### Command Integration

Three new commands are available through the structured command layer:

| Command | Category | Description |
|---------|----------|-------------|
| `inspect_toolchain` | toolchain | View available checks and toolchain state |
| `run_workspace_check` | toolchain | Run a specific check explicitly |
| `refresh_toolchain_summary` | toolchain | Re-generate the toolchain summary |

Commands require an active session with a bound workspace.

## Honesty and Safety

The toolchain layer follows these honesty principles:

- **No pretending**: If a tool is inferred but not confirmed installed, status is `unknown` or `likely_available`, not `available`
- **No auto-install**: Missing tools are reported as unavailable, never installed
- **Evidence-based**: Every command mapping is traced to specific config files
- **Explicit only**: Nothing runs without explicit developer action
- **Transparent notes**: Summary notes explain selection reasoning

## What Remains Deferred

- **Full LSP integration** — not in scope for Phase 39
- **Rich execution orchestration** — parallel execution, retries, queuing
- **Install behavior** — detecting and installing missing tools
- **Background execution** — autonomous check running
- **Plugin marketplace** — custom toolchain adapters
- **Deep framework-specific checks** — e.g., Next.js build, Django management commands

## Subpath Export

```typescript
import { ... } from "codingagent-backend/toolchain";
```
