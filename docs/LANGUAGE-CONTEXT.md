# Language Context Layer

> Phase 43: Language intelligence expansion — symbol and context layer.

## Overview

The language context layer provides profile-aware file and workspace intelligence
for the coding agent platform. It surfaces structured context about files, modules,
and workspaces — including symbols, imports/exports, entrypoints, config files,
test relationships, and framework cues.

**This is NOT:**
- A full LSP implementation (see [Language Service](./LANGUAGE-SERVICE.md))
- A refactor engine or rename tool
- An autonomous code editor
- A replacement for proper compiler/parser tooling

**This IS:**
- Lightweight, heuristic-based context extraction
- Profile-aware (uses the fingerprint/profile system)
- Honest about confidence levels
- Useful for providing structured context to agents and tools

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Workspace Context Collection                    │
│  collectWorkspaceContext()                        │
├─────────────────────────────────────────────────┤
│  File Analysis Dispatch   │  Module Aggregation  │
│  analyzeFile()            │  aggregateModules()  │
├─────────────────────────────────────────────────┤
│  Profile-Aware Analyzers                         │
│  ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────────┐ │
│  │ TS/JS    │ │ Python │ │ PHP  │ │ Rust     │ │
│  │          │ │        │ │ + WP │ │          │ │
│  └──────────┘ └────────┘ └──────┘ └──────────┘ │
│  ┌──────────┐ ┌─────────────────┐               │
│  │ Go       │ │ Generic/Unknown │               │
│  └──────────┘ └─────────────────┘               │
├─────────────────────────────────────────────────┤
│  Profile Context Support                         │
│  PROFILE_CONTEXT_SUPPORT                         │
├─────────────────────────────────────────────────┤
│  Session Integration                             │
│  Events + Summary Builder                        │
└─────────────────────────────────────────────────┘
```

## Relationship to Other Layers

| Layer | Relationship |
|-------|-------------|
| **Fingerprinting** (Phase 38) | Provides `RepoFingerprint` and `LanguageProfileId` — the context layer uses these as input |
| **Language Profiles** (Phase 38) | The profile determines which analyzer is used and what context support is available |
| **Toolchain** (Phase 39) | Orthogonal — toolchain handles build/test commands, context handles file/symbol intelligence |
| **Language Service** (Phase 40) | Orthogonal — language service handles LSP-style diagnostics, context handles structural intelligence |
| **MCP/GitHub** (Phase 41) | Context can inform what tools/queries are relevant to the workspace |

## What Is Modeled

### File-Level Context (`FileContextSummary`)

For each analyzed file:
- **Language** — detected from file extension
- **Role** — entrypoint, config, test, library, component, utility, build, documentation, data, unknown
- **Symbols** — exported/non-exported functions, classes, interfaces, types, enums, constants, hooks
- **Imports** — dependency references found in the file
- **Exports** — names exported from the file
- **Evidence** — why each conclusion was reached
- **Analysis Depth** — whether content was analyzed or only the file path
- **Confidence** — high, medium, or low

### Module-Level Context (`ModuleContextSummary`)

For each directory/module:
- Notable exported symbols
- Entrypoints within the module
- Test and config file locations
- Evidence and confidence

### Workspace-Level Context (`WorkspaceContextSummary`)

For the entire workspace:
- All entrypoints, config files, and test anchors
- Notable symbols across the workspace
- Module-level summaries
- Profile context support descriptor
- Collection status and reason
- Honest notes about limitations

## Profile-Aware Analyzers

### TypeScript / JavaScript
- **Symbol extraction**: Functions, classes, interfaces, type aliases, enums, constants, variables
- **Import analysis**: ES imports, side-effect imports, CommonJS require
- **Export analysis**: Named exports, re-exports, star re-exports
- **Role detection**: Entrypoints (index/main/app), configs (tsconfig/vite/webpack), tests (.test/.spec), components, utilities
- **Confidence**: High for explicit exports, medium for non-exported symbols

### Python
- **Symbol extraction**: Classes, functions (including async), UPPER_CASE constants
- **Import analysis**: `import X`, `from X import Y`
- **Export analysis**: `__all__` and public (non-underscore) symbols
- **Role detection**: Entrypoints (main/app/__main__/manage), configs (setup.py/pyproject.toml), tests (test_*/conftest)
- **Extra evidence**: `if __name__ == "__main__"` guard detection

### PHP / WordPress
- **Symbol extraction**: Classes, interfaces, traits, functions, `define()` constants
- **WordPress extras**: Hook detection (add_action, add_filter, do_action, apply_filters), plugin/theme header detection
- **Import analysis**: `use` statements, `require`/`include`
- **Role detection**: Entrypoints (index.php), configs (composer.json/phpunit.xml/wp-config), tests
- **Extra evidence**: Namespace detection

### Rust
- **Symbol extraction**: Functions, structs, enums, traits, type aliases, constants, modules (with pub/pub(crate) visibility)
- **Import analysis**: `use` statements, `extern crate`
- **Role detection**: Entrypoints (main.rs/lib.rs), configs (Cargo.toml/build.rs), tests
- **Extra evidence**: `#[test]` / `#[cfg(test)]` detection

### Go
- **Symbol extraction**: Functions, methods, structs, interfaces, type aliases, constants/variables (with uppercase export convention)
- **Import analysis**: Single and grouped imports
- **Role detection**: Entrypoints (main.go/cmd/), configs (go.mod), tests (_test.go)
- **Extra evidence**: Package name detection, `package main` flag

### Generic / Unknown
- **No symbol extraction** — honest about limitations
- **Role detection**: Only by file naming patterns (test, config, documentation, data, build)
- **Confidence**: Always "low"

## Heuristic vs. Stronger Evidence

| Evidence Type | Strength | Example |
|--------------|----------|---------|
| File pattern match | Medium | `src/index.ts` → entrypoint |
| Content regex match | Medium | `export function foo()` → exported function |
| Naming convention | Medium | Go uppercase = exported |
| Config file match | Medium-High | `package.json` → config |
| Directory structure | Medium | `src/components/` → component directory |
| Profile hint | Low-Medium | Profile suggests what to expect |

**What is NOT claimed:**
- Semantic accuracy of symbol boundaries
- Complete import resolution
- Correct type inference
- Macro/codegen symbol detection
- Dynamic import/require tracking

## Commands

| Command | Category | Description |
|---------|----------|-------------|
| `inspect_workspace_context` | `language_context` | Inspect profile-aware workspace context summary |
| `inspect_file_context` | `language_context` | Inspect context for a specific file |
| `refresh_context_summary` | `language_context` | Re-collect workspace context summary |

## Session Integration

### Event Kinds
- `workspace_context_collected` — initial context collection completed
- `workspace_context_refreshed` — context refreshed (manual or automatic)
- `workspace_context_failed` — context collection failed

### Session Summary Fields (11 new)
- `contextCollected` — whether context has been collected
- `contextProfileId` — profile used for analysis
- `contextCollectionStatus` — completed, partial, failed
- `contextTotalFiles` — total files analyzed
- `contextFilesWithContent` — files analyzed with content
- `contextEntrypointCount` — number of entrypoints found
- `contextConfigFileCount` — number of config files found
- `contextTestFileCount` — number of test files found
- `contextNotableSymbolCount` — number of notable symbols found
- `contextModuleCount` — number of modules found
- `contextConfidence` — overall confidence level

## Subpath Export

```typescript
import {
  collectWorkspaceContext,
  analyzeFile,
  getProfileContextSupport,
  buildLanguageContextSessionSummary,
  // ...
} from "codingagent-backend/language-context";
```

## What Remains Deferred

- **Full LSP orchestration** — not implemented; see Language Service layer
- **Semantic editing support** — no rename, refactor, or code modification
- **AST-level parsing** — regex heuristics only; no full parser
- **Cross-file resolution** — imports are listed but not resolved to targets
- **Incremental updates** — full re-analysis on each collection
- **Real-time file watching** — no file system watchers
- **Plugin-based analyzers** — fixed set of built-in analyzers only
