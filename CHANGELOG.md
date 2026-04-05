# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Phase 23** — Attached Agent Registry and Agent Attachment Model
  - New `src/agents/` module with 4 files: `types.ts`, `session-integration.ts`, `agent-registry.ts`, `index.ts`
  - 10 agent domain types: `AgentId`, `AgentKind`, `AgentStatus`, `AgentCapability`, `AgentStageAffinity`, `AgentDefinition`, `AgentAttachmentStatus`, `AgentAttachment`, `AgentSummary`, `AgentRecord`
  - 6 agent kinds: `system`, `coding`, `review`, `planning`, `testing`, `external`
  - 8 typed capabilities: `planning`, `reviewing`, `testing`, `editing`, `repo_exploration`, `mcp_interaction`, `shell_assistance`, `session_narration`
  - `AgentRegistry`: register agent definitions, attach/detach to sessions, enable/disable, mark failed, query attachments, derive summaries
  - 7 agent session event kinds: `agent_attach_requested`, `agent_attached`, `agent_detached`, `agent_enabled`, `agent_disabled`, `agent_failed`, `agent_capabilities_updated`
  - `SessionEventKind` union extended with 7 agent event kinds
  - `SessionSummary` extended with `agentCount` and `agents` fields
  - Timeline classification for all agent events in `timeline-helpers.ts`
  - Agent event helpers: `isAgentEvent()`, `filterAgentEvents()`, `buildAgentEventSummary()`
  - Event factory functions for all 7 agent lifecycle events
  - Agents are explicitly separate from MCP servers — clean domain boundary
  - Subpath export: `./agents` in package.json
  - 106 new tests covering agent registration, attach/detach, duplicate handling, status transitions, capability exposure, session summary exposure, event emission, edge cases, agent/MCP separation, timeline classification
  - New documentation: `docs/AGENTS.md`

- **Phase 21** — Repository Open/Clone Lifecycle and Workspace Bootstrap
  - Extended Workspace model with `repoMeta` (RepositoryMeta) for git repo detection
  - New `bootstrapping` workspace status for in-progress clone operations
  - `RepositoryMeta`: `isGitRepo`, `repoPath`, `remoteUrl`, `branch`, `headRef`, `openedAt`, `readiness`, `notes`
  - `WorkspaceReadiness` type: `ready`, `pending`, `bootstrapping`, `invalid`, `unavailable`
  - New `src/session/repo-lifecycle.ts`: repository open and clone lifecycle
  - `openWorkspace()`: validate path, detect git repo, build metadata, create workspace with events
  - `cloneWorkspace()`: validate URL/target, execute `git clone --single-branch`, build metadata
  - `GitExecutor` interface for testability (mock git in tests, real git in production)
  - Path validation: `validateLocalPath()`, `validateCloneTarget()`
  - URL validation: `validateCloneUrl()` — allows https/http/git/SSH, blocks file://
  - 8 new session event kinds: `workspace_open_requested`, `workspace_opened`, `workspace_invalid`, `clone_requested`, `clone_started`, `clone_completed`, `clone_failed`, `workspace_ready`
  - Event factories for all 8 workspace lifecycle events
  - `SessionSummary` extended with `workspaceReadiness`, `workspaceIsGitRepo`, `workspaceRemoteUrl`, `workspaceBranch`
  - `markWorkspaceBootstrapping()` workspace transition helper
  - 5 new server endpoints: `POST /api/workspace/open`, `POST /api/workspace/clone`, `POST /api/workspace/validate-path`, `POST /api/workspace/validate-url`, `GET /api/workspace/state/:sessionId`
  - 77 new tests covering path validation, URL validation, open flows, clone flows, failure handling, session events, summary exposure, server endpoints
  - Updated `docs/SESSION-WORKSPACE.md` with workspace lifecycle, repo metadata, open vs clone, server endpoints

- **Phase 20** — MCP Manager and Server Attachment Lifecycle
  - New `src/mcp/` module with 6 files: `types.ts`, `process-manager.ts`, `capability-discovery.ts`, `session-integration.ts`, `config.ts`, `mcp-manager.ts`, `index.ts`
  - 11 MCP domain types: `McpServerId`, `McpServerConfig`, `McpTransport`, `McpServerStatus`, `McpServerHealth`, `McpAttachment`, `McpAttachmentStatus`, `McpDiscoveredTool`, `McpDiscoveredResource`, `McpDiscoveredPrompt`, `McpRuntimeInfo`
  - `McpProcessManager`: register, start (stdio spawn), stop (SIGTERM), health tracking, failure marking
  - `McpManager`: orchestration layer coordinating process lifecycle, session attachment, capability discovery, and event emission
  - 9 MCP session event kinds: `mcp_attach_requested`, `mcp_attached`, `mcp_starting`, `mcp_started`, `mcp_failed`, `mcp_stopped`, `mcp_discovered_tools`, `mcp_discovered_resources`, `mcp_discovered_prompts`
  - `SessionEventKind` union extended with 9 MCP event kinds
  - `SessionSummary` extended with `mcpServerCount` and `mcpServers` fields
  - Capability discovery modeling: `applyDiscovery`, manual tool/resource/prompt registration, validation helpers
  - Config factories: `createMcpServerConfig` with validation, fixture configs for testing
  - Subpath export: `./mcp` in package.json
  - 117 new tests covering config validation, process lifecycle, attach/detach, start/stop, status transitions, failure handling, session event emission, summary exposure, discovery, edge cases, and type coverage
  - New documentation: `docs/MCP-SERVERS.md`

- **Phase 19** — Session and Workspace Domain
  - New `src/session/` module with 5 files: `types.ts`, `events.ts`, `workspace.ts`, `workflow-integration.ts`, `session-manager.ts`, `index.ts`
  - First-class Session entity with id, stage, status, workspace, events timeline, run context, attached resources
  - SessionStatus: `idle`, `active`, `completed`, `completed_requires_approval`, `blocked`, `failed`
  - SessionStage: `initializing`, `workspace_binding`, `host_detection`, `workflow_running`, `review`, `done`
  - Workspace model supporting `local_existing`, `cloned` (placeholder), and `generic_directory` sources
  - Workspace lifecycle: `pending` → `ready` / `invalid` / `closed`
  - 13 typed event kinds: `session_created`, `workspace_bound`, `host_detected`, `catalogs_loaded`, `workflow_started`, `stage_completed`, `requires_approval`, `blocked`, `failed`, `completed`, `note`, `info`, `warning`
  - Event factory functions for all event kinds
  - In-memory `SessionManager` with create, bind, append, update, record, summary operations
  - Workflow → session integration bridge: status/stage mapping, run context derivation, event derivation
  - `SessionSummary` lightweight snapshot for frontend consumption
  - `AttachedResource` references for future MCP server, agent, and environment attachment
  - Subpath export: `./session` in package.json
  - 86 new tests covering session lifecycle, workspace binding, events, status transitions, workflow integration, approval/blocking propagation, summary derivation, and edge cases
  - New documentation: `docs/SESSION-WORKSPACE.md`

- **Phase 18** — Product-shell polish and session usability
  - Sticky section navigation bar — jump links to Host, Recommendation, Compatibility, Plan Review, Workflow sections
  - IntersectionObserver-based active section highlighting in the nav bar
  - Section anchor IDs on all result cards for hash-based navigation
  - Run context summary bar — shows mode, label, timestamp, artifact, stop-after for each run
  - Compact summary strip — one-line overview at top of results with status, host, recommendation, compatibility
  - "Clear Results" button — clears output but preserves form inputs (distinct from existing "Reset")
  - Export Result JSON — downloads full workflow result as timestamped `.json` file
  - Export Host JSON — downloads host profile section as timestamped `.json` file
  - Copy Summary Text — copies plain-text summary to clipboard
  - Import Host JSON — file input in real mode for loading host profiles from the local filesystem (validated via backend)
  - Contextual recovery hints on errors — specific guidance for missing data-dir, invalid host file, unknown artifact, stale host file
  - `_lastRunMeta` session tracking — timestamps and parameters for both demo and real runs
  - 82 new tests: section navigation, session context, export/import, readability, error recovery, CSS additions, HTML structure, no regression
  - Updated APP-SHELL.md with Phase 18 documentation

- **Phase 17** — Desktop packaging decision and first packaging slice
  - Packaging decision: enhanced local web shell + desktop launcher (Electron/Tauri deferred)
  - `openBrowser()` utility — cross-platform browser opener with URL protocol validation (http/https only)
  - `--open` flag on app shell server — auto-opens default browser on startup
  - `attachGracefulShutdown()` — clean Ctrl+C handling with shutdown messaging
  - `StartServerOptions` interface for `startServer(port, options?)` signature
  - Desktop launcher script (`scripts/desktop-launch.ts`) — preflight + server + auto-open in one command
  - `npm run app-shell:desktop` — single-command desktop-style launch experience
  - `npm run app-shell:open` — start server and auto-open browser
  - `runPreflight()` exported from desktop launcher for programmatic environment checks
  - `docs/PACKAGING.md` — packaging decision document with rationale, alternatives, security notes, CodeQL status
  - 53 new tests: openBrowser URL validation (security), graceful shutdown export, desktop launcher preflight, new scripts, packaging document content, no regression for demo/real mode routes, startup banner content
  - CodeQL status: confirmed not enabled on repository; documented in PACKAGING.md
  - Updated CHANGELOG, APP-SHELL.md, QUICKSTART.md with Phase 17 documentation

- **Phase 16** — Live host detection integration in the app shell
  - `POST /api/host/detect` — detects host hardware live and returns a HostProfile + summary
  - `POST /api/host/validate` — validates a host profile JSON object
  - "Detect Host" button in real mode — detects hardware without requiring a host file
  - Host-source semantics: `HostSource` type (`"demo"` | `"file"` | `"detected"`) on `ScenarioViewModel`
  - Host source badges in UI: 🎭 Demo Scenario, 📁 Host File, 🔍 Live Detected
  - `POST /api/workflow/run` now accepts inline `hostProfile` as alternative to `hostFile`
  - `RealWorkflowInput.hostProfile` field for detected/inline host profiles
  - Detection result display with hardware summary, error handling, loading states
  - Host source indicator updates dynamically when switching between file/detected modes
  - Reset clears detection state, mode switch hides detection controls
  - 48 new tests: host detection endpoint, host validation endpoint, host-source semantics, inline host profile workflow, deterministic behavior, detection failure handling, UI rendering
  - Updated docs/APP-SHELL.md with live detection documentation, host-source indicator reference, and API reference

- **Phase 15** — Packaging and distribution readiness
  - `docs/QUICKSTART.md` — comprehensive quick start guide with demo-mode and real-mode walkthroughs
  - `scripts/preflight.ts` — environment readiness checker (Node version, dependencies, data directory, docs)
  - Enhanced startup output with mode guidance, tips, and URL display
  - `resolvePort()` function: supports `--port` flag, `PORT` env var, and default 3000
  - `--help` flag for the app shell server
  - New npm scripts: `app-shell:demo`, `app-shell:help`, `generate-host-profile`, `preflight`
  - 47 new tests: port resolution, package script sanity, source/docs/data directory checks, QUICKSTART content alignment
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
