/**
 * Repository fingerprinting — file-based detection logic.
 *
 * Scans a file inventory (list of relative file paths) for known signals
 * that indicate which languages, frameworks, and toolchains are in use.
 *
 * Design:
 * - Pure function — no filesystem access, operates on a string array
 * - Deterministic — same inventory → same fingerprint
 * - Explicit — every conclusion is backed by a FingerprintSignal
 * - Honest — mixed/uncertain repos are flagged as such
 *
 * Phase 38: Language support architecture and repository fingerprinting.
 */

import type {
  DetectedLanguage,
  DetectedFramework,
  FingerprintSignal,
  RepoFingerprint,
  SignalStrength,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Signal definitions                                                */
/* ------------------------------------------------------------------ */

interface SignalRule {
  readonly pattern: string;
  readonly language: DetectedLanguage;
  readonly strength: SignalStrength;
  readonly frameworkHint?: string;
}

/**
 * Static signal rules.
 * Order does not matter — all matching rules produce signals.
 */
const SIGNAL_RULES: readonly SignalRule[] = [
  /* TypeScript / JavaScript — Node */
  { pattern: "tsconfig.json", language: "typescript", strength: "strong" },
  { pattern: "tsconfig.build.json", language: "typescript", strength: "moderate" },
  { pattern: "package.json", language: "javascript", strength: "strong", frameworkHint: "node" },
  { pattern: "package-lock.json", language: "javascript", strength: "moderate", frameworkHint: "npm" },
  { pattern: "yarn.lock", language: "javascript", strength: "moderate", frameworkHint: "yarn" },
  { pattern: "pnpm-lock.yaml", language: "javascript", strength: "moderate", frameworkHint: "pnpm" },
  { pattern: ".eslintrc.json", language: "javascript", strength: "weak" },
  { pattern: ".eslintrc.js", language: "javascript", strength: "weak" },
  { pattern: "eslint.config.js", language: "javascript", strength: "weak" },
  { pattern: "eslint.config.mjs", language: "javascript", strength: "weak" },
  { pattern: ".prettierrc", language: "javascript", strength: "weak" },
  { pattern: "vitest.config.ts", language: "typescript", strength: "moderate", frameworkHint: "vitest" },
  { pattern: "jest.config.ts", language: "typescript", strength: "moderate", frameworkHint: "jest" },
  { pattern: "jest.config.js", language: "javascript", strength: "moderate", frameworkHint: "jest" },
  { pattern: "webpack.config.js", language: "javascript", strength: "moderate", frameworkHint: "webpack" },
  { pattern: "vite.config.ts", language: "typescript", strength: "moderate", frameworkHint: "vite" },
  { pattern: "next.config.js", language: "javascript", strength: "strong", frameworkHint: "nextjs" },
  { pattern: "next.config.mjs", language: "javascript", strength: "strong", frameworkHint: "nextjs" },

  /* Python */
  { pattern: "pyproject.toml", language: "python", strength: "strong" },
  { pattern: "requirements.txt", language: "python", strength: "strong" },
  { pattern: "setup.py", language: "python", strength: "strong" },
  { pattern: "setup.cfg", language: "python", strength: "moderate" },
  { pattern: "Pipfile", language: "python", strength: "strong", frameworkHint: "pipenv" },
  { pattern: "Pipfile.lock", language: "python", strength: "moderate", frameworkHint: "pipenv" },
  { pattern: "poetry.lock", language: "python", strength: "moderate", frameworkHint: "poetry" },
  { pattern: "tox.ini", language: "python", strength: "weak" },
  { pattern: ".flake8", language: "python", strength: "weak" },
  { pattern: "manage.py", language: "python", strength: "moderate", frameworkHint: "django" },

  /* PHP */
  { pattern: "composer.json", language: "php", strength: "strong", frameworkHint: "composer" },
  { pattern: "composer.lock", language: "php", strength: "moderate", frameworkHint: "composer" },
  { pattern: "artisan", language: "php", strength: "strong", frameworkHint: "laravel" },
  { pattern: "wp-config.php", language: "php", strength: "strong", frameworkHint: "wordpress" },
  { pattern: "wp-content", language: "php", strength: "strong", frameworkHint: "wordpress" },
  { pattern: "wp-includes", language: "php", strength: "moderate", frameworkHint: "wordpress" },
  { pattern: "wp-admin", language: "php", strength: "moderate", frameworkHint: "wordpress" },
  { pattern: "style.css", language: "php", strength: "weak", frameworkHint: "wordpress-theme" },
  { pattern: "functions.php", language: "php", strength: "moderate", frameworkHint: "wordpress-theme" },

  /* Rust */
  { pattern: "Cargo.toml", language: "rust", strength: "strong", frameworkHint: "cargo" },
  { pattern: "Cargo.lock", language: "rust", strength: "moderate", frameworkHint: "cargo" },

  /* Go */
  { pattern: "go.mod", language: "go", strength: "strong", frameworkHint: "go-modules" },
  { pattern: "go.sum", language: "go", strength: "moderate", frameworkHint: "go-modules" },
];

/* ------------------------------------------------------------------ */
/*  Core detection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Scan a file inventory for known signals.
 *
 * @param files - array of relative file paths (e.g. ["package.json", "src/index.ts"])
 * @returns matching signals
 */
export function detectSignals(
  files: readonly string[],
): FingerprintSignal[] {
  const fileSet = new Set(files.map(normalizeFilePath));
  const signals: FingerprintSignal[] = [];

  for (const rule of SIGNAL_RULES) {
    const normalizedPattern = normalizeFilePath(rule.pattern);
    if (fileSet.has(normalizedPattern)) {
      signals.push({
        file: rule.pattern,
        language: rule.language,
        strength: rule.strength,
        ...(rule.frameworkHint !== undefined
          ? { frameworkHint: rule.frameworkHint }
          : {}),
      });
    }
  }

  return signals;
}

/** Normalize file path for matching (trim leading/trailing slashes). */
function normalizeFilePath(p: string): string {
  let result = p;
  while (result.startsWith("/")) result = result.slice(1);
  while (result.endsWith("/")) result = result.slice(0, -1);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Language ranking                                                  */
/* ------------------------------------------------------------------ */

const STRENGTH_WEIGHT: Record<SignalStrength, number> = {
  strong: 3,
  moderate: 2,
  weak: 1,
};

/**
 * When both TypeScript and JavaScript are detected and TS has strong signals,
 * boost TS above JS by this margin. TypeScript projects often have both
 * tsconfig.json AND package.json, so JS signals are evidence of the TS ecosystem.
 */
const TS_OVER_JS_BOOST = 1;

/**
 * Rank detected languages by cumulative signal weight.
 * Returns unique languages sorted strongest-first.
 */
export function rankLanguages(
  signals: readonly FingerprintSignal[],
): DetectedLanguage[] {
  const weights = new Map<DetectedLanguage, number>();
  for (const s of signals) {
    const current = weights.get(s.language) ?? 0;
    weights.set(s.language, current + STRENGTH_WEIGHT[s.strength]);
  }

  // Special handling: if both typescript and javascript are detected,
  // and typescript has strong signals, boost typescript above javascript
  const tsWeight = weights.get("typescript") ?? 0;
  const jsWeight = weights.get("javascript") ?? 0;
  if (tsWeight > 0 && jsWeight > 0) {
    const tsHasStrong = signals.some(
      (s) => s.language === "typescript" && s.strength === "strong",
    );
    if (tsHasStrong && tsWeight <= jsWeight) {
      weights.set("typescript", jsWeight + TS_OVER_JS_BOOST);
    }
  }

  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

/* ------------------------------------------------------------------ */
/*  Framework extraction                                              */
/* ------------------------------------------------------------------ */

/**
 * Extract unique detected frameworks from signals.
 */
export function extractFrameworks(
  signals: readonly FingerprintSignal[],
): DetectedFramework[] {
  const seen = new Set<string>();
  const frameworks: DetectedFramework[] = [];
  for (const s of signals) {
    if (s.frameworkHint && !seen.has(s.frameworkHint)) {
      seen.add(s.frameworkHint);
      frameworks.push({
        name: s.frameworkHint,
        language: s.language,
        confidence: s.strength,
      });
    }
  }
  return frameworks;
}

/* ------------------------------------------------------------------ */
/*  Full fingerprint                                                  */
/* ------------------------------------------------------------------ */

/**
 * Produce a complete RepoFingerprint from a file inventory.
 *
 * @param path - the workspace/repo path being fingerprinted
 * @param files - relative file paths in the repository root
 * @returns typed RepoFingerprint
 */
export function fingerprintRepo(
  path: string,
  files: readonly string[],
): RepoFingerprint {
  const signals = detectSignals(files);
  const languages = rankLanguages(signals);
  const frameworks = extractFrameworks(signals);
  const hasStrongSignal = signals.some((s) => s.strength === "strong");
  const uniqueLangs = new Set(languages);
  const isMixed = uniqueLangs.size > 1;

  return {
    path,
    detectedAt: new Date().toISOString(),
    languages,
    frameworks,
    signals,
    isMixed,
    hasStrongSignal,
  };
}
