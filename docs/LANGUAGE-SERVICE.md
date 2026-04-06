# Language Service / Diagnostics Layer

> Phase 40 — Minimal LSP bridge and diagnostics layer.

## Overview

The language-service module provides a thin, explicit language-intelligence bridge that surfaces diagnostics availability and basic language-aware context for supported workspace profiles.

**What it is:**
- A typed domain layer for language-service awareness
- A deterministic mapping from language profiles to diagnostics sources
- An honest availability/planning layer that answers "what intelligence is available here?"
- A minimal explicit diagnostics collection path using toolchain commands
- Session/workspace summary integration

**What it is NOT:**
- Not a full LSP orchestration engine
- Not an editor embedding layer
- Not a persistent language server daemon manager
- Not an autonomous code editing system

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Session / Workspace                                             │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ SessionSummary   │  │ SessionEvent     │                    │
│  │ + ls fields (9)  │  │ + 3 new kinds    │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Language-Service Module (src/language-service/)          │   │
│  │                                                          │   │
│  │  types.ts          ← domain types                        │   │
│  │  mapping.ts        ← profile → service kind mapping      │   │
│  │  availability.ts   ← availability assessment             │   │
│  │  collection.ts     ← explicit diagnostics collection     │   │
│  │  session-integration.ts ← events + summary extension     │   │
│  │  index.ts          ← barrel exports                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Fingerprint /    │  │ Toolchain /      │                    │
│  │ Profiles (P38)   │→→│ Adapters (P39)   │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Relationship to Fingerprinting and Toolchain Adapters

1. **Repository fingerprinting** (Phase 38) detects languages, frameworks, and selects a `LanguageProfileId`.
2. **Toolchain adapters** (Phase 39) map profiles to build/test/lint commands.
3. **Language-service layer** (Phase 40) maps profiles to diagnostics sources and assesses whether language intelligence is available.

The language-service layer builds on top of both:
- It uses `LanguageProfileId` from fingerprinting as its primary input
- It shares the same workspace file inventory concept
- It can leverage toolchain commands as diagnostics sources (e.g., `tsc --noEmit` is both a toolchain typecheck command and a diagnostics source)

## Types

### LanguageServiceKind
```
"typescript" | "javascript" | "python" | "php" | "rust" | "go" | "none"
```

Maps directly from language profiles:
| Profile ID | Service Kind |
|---|---|
| `typescript-node` | `typescript` |
| `javascript-node` | `javascript` |
| `python-backend` | `python` |
| `php-general` | `php` |
| `php-wordpress` | `php` |
| `rust-cli` | `rust` |
| `go-module` | `go` |
| `generic-unknown` | `none` |

### LanguageServiceStatus
```
"available" | "likely_available" | "unavailable" | "not_configured" | "unknown"
```

- **available**: Service binary detected on PATH + workspace has config files
- **likely_available**: Config files detected but tool availability not checked
- **unavailable**: Service not found, not applicable, or generic profile
- **not_configured**: Tools exist but workspace lacks config files
- **unknown**: Neither config nor tools could be verified

### DiagnosticSeverity
```
"error" | "warning" | "information" | "hint"
```
LSP-compatible severity levels.

### FileDiagnostic
Represents a single diagnostic attached to a file location: file path, line, column, severity, message, source, and optional code.

### WorkspaceDiagnosticSummary
Aggregated summary: counts by severity, files affected, sample messages, and the full diagnostics list.

### LanguageContextHint
Describes what intelligence capabilities a service could provide: type-checking, linting, formatting, symbol navigation (informational only).

### LanguageServiceAvailability
The primary output of the planning layer: profile, service kind, status, unavailable reason, explanation, evidence, and context hint.

### LanguageServiceResultSummary
Combined result from availability assessment + optional diagnostics collection.

## Diagnostics Support Matrix

| Language | Type-Check | Lint | Format | Symbols* |
|---|---|---|---|---|
| TypeScript | ✅ tsc | ✅ eslint | ✅ prettier | ℹ️ tsserver |
| JavaScript | ❌ | ✅ eslint | ✅ prettier | ℹ️ tsserver |
| Python | ✅ mypy/pyright | ✅ ruff/flake8 | ✅ black/ruff | ℹ️ pyright |
| PHP | ✅ phpstan/psalm | ✅ phpcs | ✅ php-cs-fixer | ℹ️ intelephense |
| Rust | ✅ cargo check | ✅ clippy | ✅ rustfmt | ℹ️ rust-analyzer |
| Go | ✅ go vet | ✅ golangci-lint | ✅ gofmt | ℹ️ gopls |
| Unknown | ❌ | ❌ | ❌ | ❌ |

\* Symbol/go-to-definition support is informational only — not implemented in this layer.

## Executable vs. Inferred

### Executable (Phase 40)
- **Availability assessment**: Can assess whether a language service is available for any profiled workspace
- **Diagnostics collection**: Can run a one-shot diagnostics command and parse structured output for `file:line:col: severity: message` format

### Inferred Only
- **Symbol navigation**: Described in context hints but not implemented
- **Refactoring support**: Not implemented
- **Real-time diagnostics**: No background watcher or persistent LSP daemon
- **JSON-format parsing**: Only simple line-based output is parsed; JSON output from eslint/cargo/phpstan requires per-tool parsers (deferred)

## Commands

Three new commands added to the structured command layer:

| Command | Category | Description |
|---|---|---|
| `inspect_language_service` | `language_service` | Inspect language-service availability and diagnostics support |
| `collect_diagnostics` | `language_service` | Run an explicit diagnostics collection |
| `refresh_diagnostics_summary` | `language_service` | Re-assess availability and refresh diagnostics summary |

## Session Integration

### New Event Kinds
- `language_service_assessed` — emitted when availability is assessed
- `diagnostics_collected` — emitted when diagnostics are successfully collected
- `diagnostics_collection_failed` — emitted when collection fails

### SessionSummary Fields (9 new)
- `languageServiceKind` — service kind (e.g., "typescript")
- `languageServiceStatus` — runtime status
- `languageServiceLabel` — human-readable label
- `diagnosticsAvailable` — boolean availability
- `diagnosticsUnavailableReason` — why unavailable (null if available)
- `lastDiagnosticsErrorCount` — error count from last collection
- `lastDiagnosticsWarningCount` — warning count
- `lastDiagnosticsTotalCount` — total diagnostic count
- `lastDiagnosticsFilesAffected` — files with diagnostics

## What Remains Deferred

Before richer LSP integration, the following would need to be addressed:

1. **Persistent LSP daemon management** — Starting/stopping real language servers (tsserver, pyright, gopls, etc.)
2. **Real-time diagnostics streaming** — Background file watchers with diagnostic updates
3. **Per-tool JSON parsers** — Parsing structured output from eslint, cargo, phpstan, etc.
4. **Symbol/definition support** — Go-to-definition, find-references, rename
5. **Multi-root workspace** — Supporting multiple language services in a mixed-language repo
6. **Language server auto-installation** — This layer explicitly does NOT auto-install language servers
7. **Editor embedding** — No editor protocol bridge yet
8. **Completion/hover support** — Not in scope for diagnostics layer

## Subpath Export

```typescript
import { mapProfileToServiceKind, assessLanguageServiceAvailability } from "codingagent-backend/language-service";
```

## Tests

108 tests covering:
- Profile-to-service mapping (all 8 profiles)
- Diagnostics sources per language
- Context hint building
- Command hints
- Config evidence detection
- Availability assessment (all status paths)
- Diagnostics parsing (tsc, generic, no-column formats)
- Diagnostics summary building
- Explicit collection with mock runner
- Session event creation and filtering
- Session summary extension
- SessionManager integration
- Command definitions, validation, availability, execution
- End-to-end scenarios (TypeScript workspace, unknown workspace)
