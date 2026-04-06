/**
 * Profile-aware toolchain mapping.
 *
 * Maps language profiles to sensible toolchain command definitions based on
 * file/config evidence found in the repository. Deterministic and explicit —
 * does not pretend a repo supports tools that are not evidenced by files.
 *
 * Phase 39: Profile-aware toolchain adapter layer and workspace checks.
 */

import type { LanguageProfileId } from "../fingerprint/types.js";
import type {
  ToolchainAdapterId,
  ToolchainKind,
  ToolchainCommandDefinition,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Adapter identity helpers                                          */
/* ------------------------------------------------------------------ */

/** Build adapter id from a profile id. */
export function buildAdapterId(profileId: LanguageProfileId): ToolchainAdapterId {
  return `${profileId}-toolchain` as ToolchainAdapterId;
}

/* ------------------------------------------------------------------ */
/*  Evidence → command matchers                                       */
/* ------------------------------------------------------------------ */

/**
 * Given a list of workspace file paths, return the toolchain commands
 * that are evidenced for a given language profile.
 */
export function mapProfileToCommands(
  profileId: LanguageProfileId,
  files: readonly string[],
): readonly ToolchainCommandDefinition[] {
  const fileSet = new Set(files.map(normalizeFilePath));

  switch (profileId) {
    case "typescript-node":
      return mapTypescriptNode(fileSet, files);
    case "javascript-node":
      return mapJavascriptNode(fileSet, files);
    case "python-backend":
      return mapPythonBackend(fileSet, files);
    case "php-general":
      return mapPhpGeneral(fileSet, files);
    case "php-wordpress":
      return mapPhpWordpress(fileSet, files);
    case "rust-cli":
      return mapRustCli(fileSet, files);
    case "go-module":
      return mapGoModule(fileSet, files);
    case "generic-unknown":
      return mapGenericUnknown(fileSet, files);
    default:
      return [];
  }
}

/** Determine the primary toolchain kind for a profile and file set. */
export function resolveToolchainKind(
  profileId: LanguageProfileId,
  files: readonly string[],
): ToolchainKind {
  const fileSet = new Set(files.map(normalizeFilePath));

  switch (profileId) {
    case "typescript-node":
    case "javascript-node": {
      if (fileSet.has("pnpm-lock.yaml")) return "pnpm";
      if (fileSet.has("yarn.lock")) return "yarn";
      return "npm";
    }
    case "python-backend": {
      if (fileSet.has("poetry.lock") || fileSet.has("pyproject.toml")) return "poetry";
      return "pip";
    }
    case "php-general":
    case "php-wordpress":
      return "composer";
    case "rust-cli":
      return "cargo";
    case "go-module":
      return "go";
    default:
      return "generic";
  }
}

/* ------------------------------------------------------------------ */
/*  Path normalization                                                */
/* ------------------------------------------------------------------ */

function normalizeFilePath(f: string): string {
  // Normalize to forward slashes and strip leading "./" or "/"
  return f.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

function hasAny(fileSet: Set<string>, patterns: readonly string[]): boolean {
  return patterns.some((p) => fileSet.has(p));
}

function findMatching(files: readonly string[], pattern: RegExp): readonly string[] {
  return files.filter((f) => pattern.test(normalizeFilePath(f)));
}

/* ------------------------------------------------------------------ */
/*  TypeScript (Node.js)                                              */
/* ------------------------------------------------------------------ */

function mapTypescriptNode(
  fileSet: Set<string>,
  files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];
  const hasPkg = fileSet.has("package.json");

  // Typecheck — tsconfig.json implies tsc
  if (hasAny(fileSet, ["tsconfig.json"])) {
    commands.push({
      type: "typecheck",
      label: "TypeScript Compiler",
      command: "npx tsc --noEmit",
      tool: "tsc",
      evidence: ["tsconfig.json"],
      expectedLocal: true,
      priority: "recommended",
    });
  }

  // Lint — eslint config
  const eslintEvidence = findMatching(files, /eslint\.config\.[cm]?[jt]s$|\.eslintrc/);
  if (eslintEvidence.length > 0) {
    commands.push({
      type: "lint",
      label: "ESLint",
      command: "npx eslint .",
      tool: "eslint",
      evidence: eslintEvidence,
      expectedLocal: true,
      priority: "recommended",
    });
  }

  // Test — vitest or jest
  const vitestEvidence = findMatching(files, /vitest\.config\.[cm]?[jt]s$/);
  const jestEvidence = findMatching(files, /jest\.config\.[cm]?[jt]s$/);
  if (vitestEvidence.length > 0) {
    commands.push({
      type: "test",
      label: "Vitest",
      command: "npx vitest run",
      tool: "vitest",
      evidence: vitestEvidence,
      expectedLocal: true,
      priority: "recommended",
    });
  } else if (jestEvidence.length > 0) {
    commands.push({
      type: "test",
      label: "Jest",
      command: "npx jest",
      tool: "jest",
      evidence: jestEvidence,
      expectedLocal: true,
      priority: "recommended",
    });
  } else if (hasPkg) {
    commands.push({
      type: "test",
      label: "npm test",
      command: "npm test",
      tool: "npm",
      evidence: ["package.json"],
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Build — package.json implies npm run build
  if (hasPkg) {
    commands.push({
      type: "build",
      label: "npm build",
      command: "npm run build",
      tool: "npm",
      evidence: ["package.json"],
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Format — prettier config
  const prettierEvidence = findMatching(files, /\.prettierrc|prettier\.config\.[cm]?[jt]s$/);
  if (prettierEvidence.length > 0) {
    commands.push({
      type: "format",
      label: "Prettier",
      command: "npx prettier --check .",
      tool: "prettier",
      evidence: prettierEvidence,
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Dependency check
  if (hasAny(fileSet, ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"])) {
    const depEvidence: string[] = [];
    if (fileSet.has("package-lock.json")) depEvidence.push("package-lock.json");
    if (fileSet.has("pnpm-lock.yaml")) depEvidence.push("pnpm-lock.yaml");
    if (fileSet.has("yarn.lock")) depEvidence.push("yarn.lock");
    commands.push({
      type: "dependency_check",
      label: "npm audit",
      command: "npm audit --omit=dev",
      tool: "npm",
      evidence: depEvidence,
      expectedLocal: true,
      priority: "informational",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  JavaScript (Node.js)                                              */
/* ------------------------------------------------------------------ */

function mapJavascriptNode(
  fileSet: Set<string>,
  files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];
  const hasPkg = fileSet.has("package.json");

  // Lint — eslint
  const eslintEvidence = findMatching(files, /eslint\.config\.[cm]?[jt]s$|\.eslintrc/);
  if (eslintEvidence.length > 0) {
    commands.push({
      type: "lint",
      label: "ESLint",
      command: "npx eslint .",
      tool: "eslint",
      evidence: eslintEvidence,
      expectedLocal: true,
      priority: "recommended",
    });
  }

  // Test
  const jestEvidence = findMatching(files, /jest\.config\.[cm]?[jt]s$/);
  if (jestEvidence.length > 0) {
    commands.push({
      type: "test",
      label: "Jest",
      command: "npx jest",
      tool: "jest",
      evidence: jestEvidence,
      expectedLocal: true,
      priority: "recommended",
    });
  } else if (hasPkg) {
    commands.push({
      type: "test",
      label: "npm test",
      command: "npm test",
      tool: "npm",
      evidence: ["package.json"],
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Build
  if (hasPkg) {
    commands.push({
      type: "build",
      label: "npm build",
      command: "npm run build",
      tool: "npm",
      evidence: ["package.json"],
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Format — prettier
  const prettierEvidence = findMatching(files, /\.prettierrc|prettier\.config\.[cm]?[jt]s$/);
  if (prettierEvidence.length > 0) {
    commands.push({
      type: "format",
      label: "Prettier",
      command: "npx prettier --check .",
      tool: "prettier",
      evidence: prettierEvidence,
      expectedLocal: true,
      priority: "optional",
    });
  }

  // Dependency check
  if (hasAny(fileSet, ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"])) {
    const depEvidence: string[] = [];
    if (fileSet.has("package-lock.json")) depEvidence.push("package-lock.json");
    if (fileSet.has("pnpm-lock.yaml")) depEvidence.push("pnpm-lock.yaml");
    if (fileSet.has("yarn.lock")) depEvidence.push("yarn.lock");
    commands.push({
      type: "dependency_check",
      label: "npm audit",
      command: "npm audit --omit=dev",
      tool: "npm",
      evidence: depEvidence,
      expectedLocal: true,
      priority: "informational",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  Python backend                                                    */
/* ------------------------------------------------------------------ */

function mapPythonBackend(
  fileSet: Set<string>,
  files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];

  // Lint — ruff or flake8
  const ruffEvidence = findMatching(files, /ruff\.toml$|pyproject\.toml/);
  const flake8Evidence = findMatching(files, /\.flake8$|setup\.cfg$/);
  if (fileSet.has("ruff.toml") || fileSet.has("pyproject.toml")) {
    commands.push({
      type: "lint",
      label: "Ruff",
      command: "ruff check .",
      tool: "ruff",
      evidence: ruffEvidence,
      expectedLocal: false,
      priority: "recommended",
    });
  } else if (flake8Evidence.length > 0) {
    commands.push({
      type: "lint",
      label: "Flake8",
      command: "flake8 .",
      tool: "flake8",
      evidence: flake8Evidence,
      expectedLocal: false,
      priority: "recommended",
    });
  }

  // Test — pytest
  const pytestEvidence: string[] = [];
  if (fileSet.has("pytest.ini")) pytestEvidence.push("pytest.ini");
  if (fileSet.has("pyproject.toml")) pytestEvidence.push("pyproject.toml");
  if (fileSet.has("setup.cfg")) pytestEvidence.push("setup.cfg");
  const testDirs = findMatching(files, /^tests?\//);
  if (testDirs.length > 0) pytestEvidence.push("tests/ directory");
  if (pytestEvidence.length > 0) {
    commands.push({
      type: "test",
      label: "pytest",
      command: "pytest",
      tool: "pytest",
      evidence: pytestEvidence,
      expectedLocal: false,
      priority: "recommended",
    });
  }

  // Typecheck — mypy
  const mypyEvidence: string[] = [];
  if (fileSet.has("mypy.ini")) mypyEvidence.push("mypy.ini");
  if (fileSet.has("pyproject.toml")) mypyEvidence.push("pyproject.toml");
  if (fileSet.has("setup.cfg")) mypyEvidence.push("setup.cfg");
  if (mypyEvidence.length > 0) {
    commands.push({
      type: "typecheck",
      label: "mypy",
      command: "mypy .",
      tool: "mypy",
      evidence: mypyEvidence,
      expectedLocal: false,
      priority: "optional",
    });
  }

  // Format — black or ruff format
  if (fileSet.has("pyproject.toml")) {
    commands.push({
      type: "format",
      label: "Ruff format",
      command: "ruff format --check .",
      tool: "ruff",
      evidence: ["pyproject.toml"],
      expectedLocal: false,
      priority: "optional",
    });
  }

  // Dependency check
  if (hasAny(fileSet, ["requirements.txt", "Pipfile.lock", "poetry.lock"])) {
    const depEvidence: string[] = [];
    if (fileSet.has("requirements.txt")) depEvidence.push("requirements.txt");
    if (fileSet.has("Pipfile.lock")) depEvidence.push("Pipfile.lock");
    if (fileSet.has("poetry.lock")) depEvidence.push("poetry.lock");
    commands.push({
      type: "dependency_check",
      label: "pip check",
      command: "pip check",
      tool: "pip",
      evidence: depEvidence,
      expectedLocal: false,
      priority: "informational",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  PHP (general)                                                     */
/* ------------------------------------------------------------------ */

function mapPhpGeneral(
  fileSet: Set<string>,
  files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];

  // Lint — phpcs or phpstan
  if (fileSet.has("phpcs.xml") || fileSet.has("phpcs.xml.dist")) {
    const evidence: string[] = [];
    if (fileSet.has("phpcs.xml")) evidence.push("phpcs.xml");
    if (fileSet.has("phpcs.xml.dist")) evidence.push("phpcs.xml.dist");
    commands.push({
      type: "lint",
      label: "PHP_CodeSniffer",
      command: "vendor/bin/phpcs",
      tool: "phpcs",
      evidence,
      expectedLocal: true,
      priority: "recommended",
    });
  }

  if (fileSet.has("phpstan.neon") || fileSet.has("phpstan.neon.dist")) {
    const evidence: string[] = [];
    if (fileSet.has("phpstan.neon")) evidence.push("phpstan.neon");
    if (fileSet.has("phpstan.neon.dist")) evidence.push("phpstan.neon.dist");
    commands.push({
      type: "typecheck",
      label: "PHPStan",
      command: "vendor/bin/phpstan analyse",
      tool: "phpstan",
      evidence,
      expectedLocal: true,
      priority: "recommended",
    });
  }

  // Test — phpunit
  if (fileSet.has("phpunit.xml") || fileSet.has("phpunit.xml.dist")) {
    const evidence: string[] = [];
    if (fileSet.has("phpunit.xml")) evidence.push("phpunit.xml");
    if (fileSet.has("phpunit.xml.dist")) evidence.push("phpunit.xml.dist");
    commands.push({
      type: "test",
      label: "PHPUnit",
      command: "vendor/bin/phpunit",
      tool: "phpunit",
      evidence,
      expectedLocal: true,
      priority: "recommended",
    });
  }

  // Dependency check — composer
  if (fileSet.has("composer.lock")) {
    commands.push({
      type: "dependency_check",
      label: "Composer audit",
      command: "composer audit",
      tool: "composer",
      evidence: ["composer.lock"],
      expectedLocal: false,
      priority: "informational",
    });
  }

  // Format — php-cs-fixer
  const fixerEvidence = findMatching(files, /\.php-cs-fixer/);
  if (fixerEvidence.length > 0) {
    commands.push({
      type: "format",
      label: "PHP-CS-Fixer",
      command: "vendor/bin/php-cs-fixer fix --dry-run --diff",
      tool: "php-cs-fixer",
      evidence: fixerEvidence,
      expectedLocal: true,
      priority: "optional",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  PHP (WordPress)                                                   */
/* ------------------------------------------------------------------ */

function mapPhpWordpress(
  fileSet: Set<string>,
  files: readonly string[],
): ToolchainCommandDefinition[] {
  // WordPress inherits PHP general checks plus WP-specific
  const commands = mapPhpGeneral(fileSet, files);

  // If PHPCS config not found, suggest WordPress Coding Standards
  if (!commands.some((c) => c.tool === "phpcs")) {
    if (fileSet.has("composer.json")) {
      commands.push({
        type: "lint",
        label: "WPCS (WordPress Coding Standards)",
        command: "vendor/bin/phpcs --standard=WordPress",
        tool: "phpcs",
        evidence: ["composer.json"],
        expectedLocal: true,
        priority: "optional",
      });
    }
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  Rust CLI                                                          */
/* ------------------------------------------------------------------ */

function mapRustCli(
  fileSet: Set<string>,
  _files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];
  const hasCargo = fileSet.has("Cargo.toml");

  if (!hasCargo) return commands;

  const cargoEvidence = ["Cargo.toml"];

  commands.push({
    type: "build",
    label: "Cargo check",
    command: "cargo check",
    tool: "cargo",
    evidence: cargoEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  commands.push({
    type: "test",
    label: "Cargo test",
    command: "cargo test",
    tool: "cargo",
    evidence: cargoEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  commands.push({
    type: "lint",
    label: "Clippy",
    command: "cargo clippy -- -D warnings",
    tool: "clippy",
    evidence: cargoEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  commands.push({
    type: "format",
    label: "Rustfmt",
    command: "cargo fmt --check",
    tool: "rustfmt",
    evidence: cargoEvidence,
    expectedLocal: false,
    priority: "optional",
  });

  if (fileSet.has("Cargo.lock")) {
    commands.push({
      type: "dependency_check",
      label: "Cargo audit",
      command: "cargo audit",
      tool: "cargo-audit",
      evidence: ["Cargo.lock"],
      expectedLocal: false,
      priority: "informational",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  Go module                                                         */
/* ------------------------------------------------------------------ */

function mapGoModule(
  fileSet: Set<string>,
  _files: readonly string[],
): ToolchainCommandDefinition[] {
  const commands: ToolchainCommandDefinition[] = [];
  const hasGoMod = fileSet.has("go.mod");

  if (!hasGoMod) return commands;

  const goEvidence = ["go.mod"];

  commands.push({
    type: "build",
    label: "Go build",
    command: "go build ./...",
    tool: "go",
    evidence: goEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  commands.push({
    type: "test",
    label: "Go test",
    command: "go test ./...",
    tool: "go",
    evidence: goEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  commands.push({
    type: "format",
    label: "Go fmt",
    command: "gofmt -l .",
    tool: "gofmt",
    evidence: goEvidence,
    expectedLocal: false,
    priority: "optional",
  });

  commands.push({
    type: "lint",
    label: "Go vet",
    command: "go vet ./...",
    tool: "go",
    evidence: goEvidence,
    expectedLocal: false,
    priority: "recommended",
  });

  if (fileSet.has("go.sum")) {
    commands.push({
      type: "dependency_check",
      label: "Go mod verify",
      command: "go mod verify",
      tool: "go",
      evidence: ["go.sum"],
      expectedLocal: false,
      priority: "informational",
    });
  }

  return commands;
}

/* ------------------------------------------------------------------ */
/*  Generic/unknown                                                   */
/* ------------------------------------------------------------------ */

function mapGenericUnknown(
  _fileSet: Set<string>,
  _files: readonly string[],
): ToolchainCommandDefinition[] {
  // No toolchain commands for generic/unknown
  return [];
}
