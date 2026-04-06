# Architecture Consistency Audit — Phase 29

This document records the findings of the Phase 29 architecture audit
across all layers of the codingagent-backend system.

## 1. Architecture Consistency Assessment

**Overall state:** 94 source files across 12 modules, 2386 passing tests.
Naming conventions (PascalCase types, camelCase functions, UPPER_SNAKE_CASE
constants) are consistently applied across all modules.

### Strongest boundaries

| Boundary | Details |
|----------|---------|
| Session layer | Clean DAG; only type-only imports from workflow |
| MCP ↔ Agents | Independent of each other; both connect to session via a publish pattern |
| Frontend-contracts | Properly separated from backend internals |
| CLI | Direct CLI-to-workflow pipeline; isolated from session/commands layers |

### Weakest boundaries

| Boundary | Details |
|----------|---------|
| `views.ts` duplication | Inline JS maps duplicate `timeline-helpers.ts` and `console-helpers.ts` |
| App-shell index re-exports | Re-exports 17 commands symbols, duplicating `./commands` subpath |

## 2. Domain Terminology Consistency

| Concept | Status | Notes |
|---------|--------|-------|
| session | ✅ Consistent | Clear lifecycle entity with id/stage/status |
| workspace | ✅ Consistent | Filesystem abstraction inside session |
| workflow | ✅ Consistent | Backend pipeline with 8 stages |
| command | ✅ Consistent | 10 structured user actions |
| MCP server | ✅ Consistent | External process with stdio lifecycle |
| attached agent | ✅ Consistent | Agent bound to a session with enable/disable |
| host source | ✅ Consistent | `demo`, `file`, `detected` |
| approval | ✅ Consistent | `completed_requires_approval` across all layers |
| blocked | ✅ Consistent | `blocked` status and event kind |
| partial | ⚠️ Minor | Workflow `partial` maps to session `active` — lossy but deliberate |
| restored/stale/live | ✅ Consistent | MCP discovery states are well-defined |
| current stage/status | ✅ Consistent | 6 session stages, 6 session statuses |

### Naming drift

- `ParticipationReason`, `StageParticipation`, `StageParticipationSummary` in `src/agents/types.ts` lack the `Agent` prefix used by all other agent types. Not fixed in this phase (breaking change).
- `WorkspaceStatus` and `WorkspaceReadiness` overlap on 4 of 5 values. Semantically correct (different domains) but confusing. Documented here for future cleanup.

## 3. Status and State Mapping Consistency

### Session statuses
`active` · `completed` · `completed_requires_approval` · `blocked` · `failed` · `idle`

### Session stages
`initializing` · `workspace_binding` · `host_detection` · `workflow_running` · `review` · `done`

### Workflow statuses → Session status mapping

| Workflow | Session | Notes |
|----------|---------|-------|
| `completed` | `completed` | Direct |
| `completed_requires_approval` | `completed_requires_approval` | Direct |
| `blocked` | `blocked` | Direct |
| `failed` | `failed` | Direct |
| `partial` | `active` | Lossy — session can't distinguish partial-workflow from idle-active |

### Command execution statuses
`pending` · `validating` · `executing` · `completed` · `failed` · `validation_failed`

Note: `pending` and `executing` are defined but never returned by the executor. They exist for future async command support.

### Event kinds coverage
- 51 session event kinds defined across all modules
- `views.ts` inline maps now include all event kinds after Phase 29 fix

## 4. Boundary and Responsibility Problems

### Identified issues

1. **`views.ts` god-file tendency** — 1700+ lines with 12 duplicated classification maps from `timeline-helpers.ts` and `console-helpers.ts`. The duplication exists because views.ts produces client-side vanilla JS that cannot import TypeScript modules. This is a known architectural limitation of the zero-dependency app shell design.

2. **App-shell index.ts re-exports commands** — `src/app-shell/index.ts` re-exports 17 symbols from `../commands/index.js`. This creates two import paths for the same symbols. Low risk but worth documenting.

3. **Command events reuse generic kinds** — Commands use `info`, `note`, `failed`, `warning` event kinds with `commandAction` metadata instead of defining command-specific event kinds. Acceptable for now but limits event filtering granularity.

4. **`targetStage` field in CommandDefinition** — Defined on command types but never validated or used in availability checks. Reserved for future stage-aware command filtering.

## 5. Documentation Alignment

### Fixed in Phase 29
- README.md now references all 13 docs instead of only 3

### Remaining gaps
- No unified event kind reference across docs (each doc lists its own event kinds)
- No cross-referencing between related docs (e.g., MCP-SERVERS → MCP-HEALTH)
- APP-SHELL.md does not document Phase 24-28 features comprehensively
- README overview section describes only Phases 1-8 capabilities

## 6. Module Export Consistency

### Fixed in Phase 29

| Module | package.json | src/index.ts | Before | After |
|--------|:------------:|:------------:|:------:|:-----:|
| ./agents | ✅ | ❌ | Mismatch | ✅ Fixed |
| ./commands | ✅ | ❌ | Mismatch | ✅ Fixed |

### Remaining

| Module | package.json | src/index.ts | Status |
|--------|:------------:|:------------:|--------|
| ./types | ❌ | ✅ | Undeclared subpath (accessible via main) |
| ./catalog | ❌ | ✅ | Undeclared subpath (accessible via main) |
| ./detection | ❌ | ✅ | Undeclared subpath (accessible via main) |
| ./compatibility | ❌ | ✅ | Undeclared subpath (accessible via main) |
| ./install-plan | ❌ | ✅ | Undeclared subpath (accessible via main) |

These 5 infrastructure modules are intentionally available only via the main package entry point. Adding subpath exports is a future consideration.

## 7. Remaining Known Inconsistencies

1. **Agent type naming** — 3 types lack `Agent` prefix (breaking change to fix)
2. **WorkspaceStatus/WorkspaceReadiness overlap** — 4 shared values across two types
3. **views.ts duplication** — Architectural limitation of zero-dep vanilla JS shell
4. **Command event granularity** — Generic event kinds with metadata rather than specific kinds
5. **Unused `targetStage` field** — Reserved for future use
6. **README overview** — Describes only Phase 1-8 capabilities
7. **Cross-doc references** — Missing between related docs
