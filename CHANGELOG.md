# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Phase 15** — Packaging and distribution readiness
  - `docs/QUICKSTART.md` — comprehensive quick start guide with demo-mode and real-mode walkthroughs
  - `scripts/preflight.ts` — environment readiness checker (Node version, dependencies, data directory, docs)
  - Enhanced startup output with mode guidance, tips, and URL display
  - `resolvePort()` function: supports `--port` flag, `PORT` env var, and default 3000
  - `--help` flag for the app shell server
  - New npm scripts: `app-shell:demo`, `app-shell:help`, `generate-host-profile`, `preflight`
  - 48 new tests: port resolution, package script sanity, source/docs/data directory checks, QUICKSTART content alignment
  - Updated CHANGELOG, README, and APP-SHELL.md with Phase 15 documentation

- **Phase 12** — Minimal app shell
  - New module: `src/app-shell/` (5 files: `index.ts`, `data-provider.ts`, `demo-scenarios.ts`, `server.ts`, `views.ts`)
  - Local web app shell served via Node.js built-in HTTP server (zero new dependencies)
  - Single-page HTML app with vanilla CSS/JS — no framework
  - Service/boundary layer (`data-provider.ts`) that maps demo scenarios through frontend-contract layer
  - 6 embedded demo scenarios: mid-range GPU, high-end GPU, low-end CPU-only, unsupported, blocked workflow, partial workflow
  - JSON API: `GET /api/scenarios`, `GET /api/scenarios/:id`, `GET /api/scenarios/:id/:view`
  - 5 core views: host summary, recommendation, compatibility detail, plan review, workflow summary
  - Scenario selector for switching between demo fixtures
  - `./app-shell` subpath export in `package.json`
  - `npm run app-shell` script for quick startup
  - 92 new tests: data provider, server HTTP handlers, demo scenario contract integration, view renderer
  - Documentation: `docs/APP-SHELL.md`

- **Phase 11** — Frontend contract / view-model layer
  - New module: `src/frontend-contracts/` (4 files: `types.ts`, `status-labels.ts`, `errors.ts`, `mappers.ts`, `index.ts`)
  - View-model types: `HostSummaryViewModel`, `ArtifactListItem`, `RecommendationItem`, `CompatibilityViewModel`, `PlanReviewViewModel`, `SafetyStatusView`, `WorkflowViewModel`, `FinalReviewState`
  - Normalized status types: `CompatibilityStatus`, `WorkflowViewStatus`, `SafetyStatus`, `Severity`
  - Status label constants: `COMPATIBILITY_LABELS`, `WORKFLOW_STATUS_LABELS`, `SAFETY_STATUS_LABELS`, `RISK_SEVERITY`, `STAGE_LABELS`
  - Mapping functions: `toHostSummary()`, `toArtifactListItem()`, `toCompatibilityView()`, `toRecommendationItem()`, `toRecommendationList()`, `toSafetyStatusView()`, `toPlanReviewView()`, `toWorkflowView()`, `toFinalReviewState()`
  - Normalized frontend error contract: `FrontendError`, `FrontendErrorCode`, `createFrontendError()`, `normalizeFrontendError()`
  - Fixture examples for 7 scenarios: low-end CPU-only, mid-range GPU, high-end GPU, unsupported machine, blocked workflow, requires-approval workflow, partial workflow
  - `./frontend-contracts` subpath export in `package.json`
  - 91 new tests covering all mappers, status semantics, deterministic ordering, error normalization
  - Documentation section on frontend contract layer in USAGE.md

- **Phase 10** — Cross-platform validation and deterministic host/profile fixture infrastructure
  - Deterministic host profile fixtures: 6 representative hardware classes (low-end CPU, mid-range GPU, high-end GPU, missing-runtime, partially-unknown, unsupported/weak)
  - Fixture infrastructure in `tests/fixtures/` with `host-profiles.ts`, `detector-outputs.ts`, and `support-semantics.ts`
  - Cross-platform detector parsing validation with realistic mocked command outputs for Linux, macOS, and Windows
  - Support-matrix regression suite combining fixture profiles × catalog × compatibility × recommendation × workflow
  - Recommendation ordering drift detection tests
  - Support-class semantics documentation (`supported`, `supported_with_limits`, `cpu_only_slow`, `unsupported`)
  - Profile expectation map for regression testing across fixture hosts
  - Documentation section on deterministic testing intent, fixture strategy, and practical support expectations

- **Phase 9C** — Final release polish and installed-package sanity
  - Version is now read from `package.json` at runtime via `getVersion()` — eliminates manual `PKG_VERSION` constant drift
  - `--strict` flag for CI-oriented exit semantics: `completed_requires_approval` returns exit code `5` instead of `0`
  - Exit code `5` (`EXIT_APPROVAL`) for strict mode approval-required workflows
  - `getVersion()` exported from `codingagent-backend/cli` subpath
  - Installed-package sanity tests: version sync, subpath import resolution, package metadata validation
  - Documented API example sanity tests: verify README/USAGE snippets match current exports
  - Release checklist in README
  - `--strict` mode documented in README, USAGE.md, and CLI help
  - Exit code table updated to include code `5`

### Changed

- **Phase 9B** — Package, release surface, and consumer experience hardening
  - Explicit `exports` field in package.json with subpath exports (`.`, `./cli`, `./workflow`, `./schemas`)
  - `files` field to control npm publish surface
  - `--version` flag for the CLI
  - Exit code `4` (`EXIT_BLOCKED`) for blocked workflow results
  - Workflow CLI now returns non-zero exit codes for `blocked` (4) and `failed` (3) statuses
  - Package keywords and enhanced description
  - CHANGELOG.md stub
  - Comprehensive README.md with quick start, library/CLI/workflow usage guides
  - Smoke and export surface tests

## [0.1.0] — Initial development

### Included (Phases 1–8B)

- **Phase 1** — Type system and Zod schemas for models, runtimes, agent-tools, host profiles, compatibility, install plans, and safety
- **Phase 2** — Catalog layer: model catalog, runtime registry, agent-tool catalog, manifest loading, bundle loading with cross-catalog validation
- **Phase 3** — Host detection: OS, CPU, memory, GPU, and runtime detection with confidence levels
- **Phase 4** — Compatibility engine and recommendation engine with data-driven scoring
- **Phase 5** — Install plan generator, safety evaluator, plan renderer, execution policies
- **Phase 6** — High-level API facade (`renderPlanWithSafety`, `runFullFlow`), integration tests, example runner, USAGE.md
- **Phase 7A** — CLI layer: detect-host, list-models, recommend-models, check-compatibility, plan-install, render-plan commands
- **Phase 7B** — Host file support (`--host-file`), host profile validation, deterministic CLI paths
- **Phase 8A** — Workflow orchestration layer: staged pipeline runner with typed inputs/outputs, approval-aware status
- **Phase 8B** — Workflow CLI entrypoint (`run-workflow` command)
