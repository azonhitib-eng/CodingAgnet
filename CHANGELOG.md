# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
