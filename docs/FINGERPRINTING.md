# Repository Fingerprinting and Language Profiles

Phase 38 introduces repository fingerprinting and language profile support,
making the product aware of what kind of repository/workspace it is operating
on and which language/toolchain profiles are relevant.

## What is repository fingerprinting?

Repository fingerprinting is a file-based detection process that classifies a
workspace or repository by scanning its root-level files for known indicators
of programming languages, frameworks, and toolchains.

For example, the presence of `tsconfig.json` is a strong signal for TypeScript,
while `pyproject.toml` indicates Python.

Fingerprinting is:

- **File-based** — scans an inventory of file paths, not file contents
- **Deterministic** — same files → same fingerprint
- **Explicit** — every conclusion is backed by a named signal with a strength
- **Honest** — mixed or uncertain repos are flagged as such, not guessed

## RepoFingerprint

The `RepoFingerprint` type is the output of the detection process:

```typescript
interface RepoFingerprint {
  path: string;                              // workspace path
  detectedAt: string;                        // ISO-8601 timestamp
  languages: readonly DetectedLanguage[];    // ranked by signal weight
  frameworks: readonly DetectedFramework[];  // detected toolchains
  signals: readonly FingerprintSignal[];     // raw evidence
  isMixed: boolean;                          // multi-language?
  hasStrongSignal: boolean;                  // any strong indicator?
}
```

## Detected languages

Currently detected: `typescript`, `javascript`, `python`, `php`, `rust`, `go`,
and `unknown` as a fallback.

## Detected frameworks

Frameworks/toolchains detected include:

| Framework         | Language   | Trigger                          |
|-------------------|------------|----------------------------------|
| node              | JavaScript | `package.json`                   |
| npm               | JavaScript | `package-lock.json`              |
| yarn              | JavaScript | `yarn.lock`                      |
| pnpm              | JavaScript | `pnpm-lock.yaml`                 |
| vitest            | TypeScript | `vitest.config.ts`               |
| jest              | JS/TS      | `jest.config.js` / `.ts`         |
| webpack           | JavaScript | `webpack.config.js`              |
| vite              | TypeScript | `vite.config.ts`                 |
| nextjs            | JavaScript | `next.config.js` / `.mjs`       |
| pipenv            | Python     | `Pipfile`                        |
| poetry            | Python     | `poetry.lock`                    |
| django            | Python     | `manage.py`                      |
| composer          | PHP        | `composer.json`                  |
| laravel           | PHP        | `artisan`                        |
| wordpress         | PHP        | `wp-config.php`, `wp-content`    |
| wordpress-theme   | PHP        | `functions.php`                  |
| cargo             | Rust       | `Cargo.toml`                     |
| go-modules        | Go         | `go.mod`                         |

## Language profiles

A language profile describes how the product understands a particular kind of
repository. Each profile is explicit, typed, and registered.

### Available profiles

| Profile ID          | Label               | Primary Language | Toolchain Hints              |
|---------------------|----------------------|------------------|------------------------------|
| `typescript-node`   | TypeScript (Node.js)| typescript       | npm, npx, tsc, tsx, vitest   |
| `javascript-node`   | JavaScript (Node.js)| javascript       | npm, npx, node, jest, eslint |
| `python-backend`    | Python Backend      | python           | pip, python, pytest, mypy    |
| `php-general`       | PHP (General)       | php              | composer, php, phpunit       |
| `php-wordpress`     | PHP (WordPress)     | php              | composer, php, wp-cli        |
| `rust-cli`          | Rust CLI            | rust             | cargo, rustc, rustfmt, clippy|
| `go-module`         | Go Module           | go               | go, go test, golangci-lint   |
| `generic-unknown`   | Unknown / Generic   | unknown          | (none)                       |

## How profile selection works

The `selectProfiles()` function maps a `RepoFingerprint` to one or more
`LanguageProfile` objects. The logic is:

1. **No signals** → `generic-unknown` (not confident)
2. **Rank languages** by cumulative signal weight
3. **Map each language** to its default profile (e.g. `python` → `python-backend`)
4. **Refine** based on frameworks (e.g. WordPress signals → `php-wordpress` instead of `php-general`)
5. **Primary profile** = strongest language's profile
6. **Confidence** = strong signal + not mixed → confident; otherwise → not confident
7. **Explanation** = human-readable description of why

The selection is:

- **Deterministic** — same fingerprint → same selection
- **Honest** — mixed repos are flagged, weak signals are flagged
- **Explicit** — reason and explanation are always provided

## How this affects agent participation

The enrichment layer (`evaluateAgentForProfile`) evaluates whether a given
agent is more or less relevant for the detected profile. It checks:

- Whether the agent's capabilities overlap with the profile's related capabilities
- Whether the agent's role hint matches the profile's preferred roles
- Whether the agent only has universal capabilities (always neutral)

This enrichment is:

- **Read-only** — does not make execution decisions
- **Suggestive** — returns "preferred", "neutral", or "discouraged" relevance
- **Transparent** — always includes a human-readable reason

Agent enrichment connects to the existing agent routing model (Phase 27) but
does NOT rewrite it.

## Session/workspace integration

- `SessionEventKind` includes `repo_fingerprinted` and `profile_selected`
- `SessionSummary` includes fingerprint/profile fields (detected languages, frameworks, profile info, selection reason)
- Timeline classifies fingerprint events as `info`/`progress`
- Console classifies fingerprint events under the `workspace` actor
- The shell renders profile info in the session summary panel

## API endpoints

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| POST   | `/api/workspace/fingerprint`  | Fingerprint a workspace (pass path + files) |
| GET    | `/api/profiles`               | List all available language profiles     |

## What is implemented now

- ✅ File-based repo fingerprinting (6 languages, 18+ frameworks)
- ✅ 8 language/toolchain profiles
- ✅ Deterministic profile selection with confidence and explanation
- ✅ Agent participation enrichment based on profile
- ✅ Session event integration (2 new event kinds)
- ✅ SessionSummary exposure (9 new fields)
- ✅ Timeline and console classification
- ✅ Shell rendering of profile info
- ✅ API endpoints for fingerprinting and profile listing
- ✅ 117 tests covering all major scenarios

## What is deferred

- ❌ Full LSP/language server integration
- ❌ File content analysis (only file names are scanned)
- ❌ Install/execution integration
- ❌ Autonomous agent orchestration based on profile
- ❌ Tool runner integration per language
- ❌ Deep framework version detection
- ❌ Monorepo/workspace detection (e.g. npm workspaces, Cargo workspaces)
- ❌ Heavy UI redesign for profile display

## Subpath export

The fingerprint module is available as a subpath export:

```typescript
import {
  fingerprintRepo,
  selectProfiles,
  LANGUAGE_PROFILES,
  evaluateAgentForProfile,
} from "codingagent-backend/fingerprint";
```

Or from the main package:

```typescript
import { fingerprintRepo, selectProfiles } from "codingagent-backend";
```
