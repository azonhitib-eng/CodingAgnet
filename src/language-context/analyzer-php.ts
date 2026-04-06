/**
 * PHP / WordPress file context analyzer.
 *
 * Phase 43: Profile-aware context extraction for PHP files.
 * Includes WordPress-specific plugin/theme/hook detection.
 * Uses lightweight regex heuristics — NOT a full PHP parser.
 */

import type {
  FileContextSummary,
  FileSymbol,
  ContextEvidence,
  FileRole,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  File role detection                                                */
/* ------------------------------------------------------------------ */

const TEST_PATTERNS = [
  /Test\.php$/,
  /\.test\.php$/,
  /\/tests?\//,
  /phpunit/i,
];

const CONFIG_PATTERNS = [
  /composer\.json$/,
  /composer\.lock$/,
  /phpunit\.xml(\.dist)?$/,
  /phpstan\.neon(\.dist)?$/,
  /\.php-cs-fixer/,
  /php\.ini$/,
  /wp-config\.php$/,
  /\.env$/,
];

const ENTRYPOINT_PATTERNS = [
  /^index\.php$/,
  /^public\/index\.php$/,
  /^web\/index\.php$/,
  /^artisan$/,
  /^wp-config\.php$/,
  /^functions\.php$/,
  /^style\.css$/,
];

const WORDPRESS_PLUGIN_PATTERNS = [
  /Plugin Name:/i,
  /Plugin URI:/i,
];

const WORDPRESS_THEME_PATTERNS = [
  /Theme Name:/i,
  /Theme URI:/i,
];

/** Detect the role of a PHP file by its path. */
export function detectPhpFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (ENTRYPOINT_PATTERNS.some((p) => p.test(normalized))) return "entrypoint";

  if (/\/(controllers?|handlers?)\//i.test(normalized)) return "component";
  if (/\/(models?|entities)\//i.test(normalized)) return "library";
  if (/\/(utils?|helpers?)\//i.test(normalized)) return "utility";
  if (/\/(views?|templates?)\//i.test(normalized)) return "component";
  if (/\/(config|settings)\//i.test(normalized)) return "config";
  if (/\/(migrations?|seeds?)\//i.test(normalized)) return "data";

  return "library";
}

/* ------------------------------------------------------------------ */
/*  Symbol extraction                                                  */
/* ------------------------------------------------------------------ */

/** Extract symbols from PHP file content using regex heuristics. */
export function extractPhpSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#")) {
      continue;
    }

    // Class
    const classMatch = line.match(/^\s*(?:abstract\s+|final\s+)?class\s+(\w+)/);
    if (classMatch && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Interface
    const interfaceMatch = line.match(/^\s*interface\s+(\w+)/);
    if (interfaceMatch && !seen.has(interfaceMatch[1])) {
      seen.add(interfaceMatch[1]);
      symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Function (top-level)
    const funcMatch = line.match(/^\s*function\s+(\w+)/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Top-level define() constants
    const defineMatch = line.match(/define\s*\(\s*["'](\w+)["']/);
    if (defineMatch && !seen.has(defineMatch[1])) {
      seen.add(defineMatch[1]);
      symbols.push({
        name: defineMatch[1],
        kind: "constant",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Trait
    const traitMatch = line.match(/^\s*trait\s+(\w+)/);
    if (traitMatch && !seen.has(traitMatch[1])) {
      seen.add(traitMatch[1]);
      symbols.push({
        name: traitMatch[1],
        kind: "class",
        line: lineNum,
        exported: true,
        confidence: "medium",
      });
    }
  }

  return symbols;
}

/** Extract WordPress-specific symbols (hooks, actions, filters). */
export function extractWordPressSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // add_action / add_filter
    const hookMatch = line.match(/(?:add_action|add_filter)\s*\(\s*["']([^"']+)["']/);
    if (hookMatch && !seen.has(hookMatch[1])) {
      seen.add(hookMatch[1]);
      symbols.push({
        name: hookMatch[1],
        kind: "hook",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
    }

    // do_action / apply_filters
    const dispatchMatch = line.match(/(?:do_action|apply_filters)\s*\(\s*["']([^"']+)["']/);
    if (dispatchMatch && !seen.has(`dispatch:${dispatchMatch[1]}`)) {
      seen.add(`dispatch:${dispatchMatch[1]}`);
      symbols.push({
        name: dispatchMatch[1],
        kind: "hook",
        line: lineNum,
        exported: true,
        confidence: "medium",
      });
    }
  }

  return symbols;
}

/* ------------------------------------------------------------------ */
/*  Import/export extraction                                           */
/* ------------------------------------------------------------------ */

/** Extract import references from PHP file content. */
export function extractPhpImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();

  // use statements
  const useRegex = /^\s*use\s+([\w\\]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = useRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // require/include
  const requireRegex = /(?:require|include)(?:_once)?\s*\(?["']([^"']+)["']/g;
  while ((match = requireRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  return imports;
}

/** Extract export names from PHP file content. */
export function extractPhpExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  const lines = content.split("\n");
  for (const line of lines) {
    // Classes, interfaces, traits, functions
    const classMatch = line.match(/^\s*(?:abstract\s+|final\s+)?class\s+(\w+)/);
    if (classMatch && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      exports.push(classMatch[1]);
    }
    const interfaceMatch = line.match(/^\s*interface\s+(\w+)/);
    if (interfaceMatch && !seen.has(interfaceMatch[1])) {
      seen.add(interfaceMatch[1]);
      exports.push(interfaceMatch[1]);
    }
    const funcMatch = line.match(/^\s*function\s+(\w+)/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      exports.push(funcMatch[1]);
    }
  }

  return exports;
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a PHP file and produce a context summary.
 */
export function analyzePhpFile(
  filePath: string,
  content: string | null,
  isWordPress: boolean = false,
): FileContextSummary {
  const role = detectPhpFileRole(filePath);
  const evidence: ContextEvidence[] = [];

  if (content === null) {
    evidence.push({
      kind: "file_pattern",
      description: `Role detected from file path: ${role}`,
      source: filePath,
    });
    return {
      filePath,
      language: "php",
      role,
      symbols: [],
      imports: [],
      exports: [],
      evidence,
      analysisDepth: "path_only",
      confidence: "low",
    };
  }

  let symbols = extractPhpSymbols(content);
  const imports = extractPhpImports(content);
  const exports = extractPhpExports(content);

  // WordPress-specific analysis
  if (isWordPress) {
    const wpSymbols = extractWordPressSymbols(content);
    symbols = [...symbols, ...wpSymbols];

    // Plugin/theme header detection
    if (WORDPRESS_PLUGIN_PATTERNS.some((p) => p.test(content))) {
      evidence.push({
        kind: "content_regex",
        description: "WordPress plugin header detected",
        source: filePath,
      });
    }
    if (WORDPRESS_THEME_PATTERNS.some((p) => p.test(content))) {
      evidence.push({
        kind: "content_regex",
        description: "WordPress theme header detected",
        source: filePath,
      });
    }
  }

  evidence.push({
    kind: "content_regex",
    description: `Extracted ${symbols.length} symbols, ${imports.length} imports, ${exports.length} exports via regex heuristics`,
    source: filePath,
  });

  // Namespace detection
  const nsMatch = content.match(/^\s*namespace\s+([\w\\]+)/m);
  if (nsMatch) {
    evidence.push({
      kind: "content_regex",
      description: `PHP namespace: ${nsMatch[1]}`,
      source: filePath,
    });
  }

  return {
    filePath,
    language: "php",
    role,
    symbols,
    imports,
    exports,
    evidence,
    analysisDepth: "content",
    confidence: symbols.length > 0 || imports.length > 0 ? "medium" : "low",
  };
}
