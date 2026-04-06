/**
 * Python file context analyzer.
 *
 * Phase 43: Profile-aware context extraction for Python files.
 * Uses lightweight regex heuristics — NOT a full Python AST parser.
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
  /test_\w+\.py$/,
  /\w+_test\.py$/,
  /\/tests?\//,
  /conftest\.py$/,
];

const CONFIG_PATTERNS = [
  /setup\.py$/,
  /setup\.cfg$/,
  /pyproject\.toml$/,
  /tox\.ini$/,
  /\.flake8$/,
  /\.pylintrc$/,
  /mypy\.ini$/,
  /pytest\.ini$/,
  /Pipfile$/,
  /requirements.*\.txt$/,
];

const ENTRYPOINT_PATTERNS = [
  /^main\.py$/,
  /^app\.py$/,
  /^__main__\.py$/,
  /^src\/main\.py$/,
  /^src\/app\.py$/,
  /^manage\.py$/,
  /^wsgi\.py$/,
  /^asgi\.py$/,
];

/** Detect the role of a Python file by its path. */
export function detectPythonFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (ENTRYPOINT_PATTERNS.some((p) => p.test(normalized))) return "entrypoint";

  if (/__init__\.py$/.test(normalized)) return "library";
  if (/\/(utils?|helpers?|lib)\//i.test(normalized)) return "utility";
  if (/\/(views?|controllers?|handlers?)\//i.test(normalized)) return "component";
  if (/\/(docs?|documentation)\//i.test(normalized)) return "documentation";

  return "library";
}

/* ------------------------------------------------------------------ */
/*  Symbol extraction                                                  */
/* ------------------------------------------------------------------ */

/** Extract symbols from Python file content using regex heuristics. */
export function extractPythonSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments and empty lines
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Top-level class definition
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      const exported = !classMatch[1].startsWith("_");
      symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // Top-level function/async function
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      const exported = !funcMatch[1].startsWith("_");
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // Top-level UPPER_CASE constant
    const constMatch = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (constMatch && !seen.has(constMatch[1])) {
      seen.add(constMatch[1]);
      symbols.push({
        name: constMatch[1],
        kind: "constant",
        line: lineNum,
        exported: true,
        confidence: "medium",
      });
    }
  }

  return symbols;
}

/* ------------------------------------------------------------------ */
/*  Import extraction                                                  */
/* ------------------------------------------------------------------ */

/** Extract import references from Python file content. */
export function extractPythonImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();

  // import X / import X as Y
  const importRegex = /^import\s+([\w.]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // from X import ...
  const fromImportRegex = /^from\s+([\w.]+)\s+import/gm;
  while ((match = fromImportRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  return imports;
}

/** Extract export names from Python file content. */
export function extractPythonExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  // __all__ = [...] — use non-greedy character class to avoid backtracking
  const allMatch = content.match(/__all__\s{0,10}=\s{0,10}\[([^\]]*)\]/);
  if (allMatch) {
    const names = allMatch[1].match(/["'](\w+)["']/g);
    if (names) {
      for (const n of names) {
        const name = n.replace(/["']/g, "");
        if (!seen.has(name)) {
          seen.add(name);
          exports.push(name);
        }
      }
    }
  }

  // Top-level non-underscore functions and classes as implicit exports
  const lines = content.split("\n");
  for (const line of lines) {
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch && !funcMatch[1].startsWith("_") && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      exports.push(funcMatch[1]);
    }
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch && !classMatch[1].startsWith("_") && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      exports.push(classMatch[1]);
    }
  }

  return exports;
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a Python file and produce a context summary.
 */
export function analyzePythonFile(
  filePath: string,
  content: string | null,
): FileContextSummary {
  const role = detectPythonFileRole(filePath);
  const evidence: ContextEvidence[] = [];

  if (content === null) {
    evidence.push({
      kind: "file_pattern",
      description: `Role detected from file path: ${role}`,
      source: filePath,
    });
    return {
      filePath,
      language: "python",
      role,
      symbols: [],
      imports: [],
      exports: [],
      evidence,
      analysisDepth: "path_only",
      confidence: "low",
    };
  }

  const symbols = extractPythonSymbols(content);
  const imports = extractPythonImports(content);
  const exports = extractPythonExports(content);

  evidence.push({
    kind: "content_regex",
    description: `Extracted ${symbols.length} symbols, ${imports.length} imports, ${exports.length} exports via regex heuristics`,
    source: filePath,
  });

  if (role === "entrypoint") {
    evidence.push({
      kind: "file_pattern",
      description: "File matches Python entrypoint naming pattern",
      source: filePath,
    });
  }

  // __main__ guard detection
  if (content.includes('if __name__') && content.includes('__main__')) {
    evidence.push({
      kind: "content_regex",
      description: 'Contains if __name__ == "__main__" guard — likely executable',
      source: filePath,
    });
  }

  return {
    filePath,
    language: "python",
    role,
    symbols,
    imports,
    exports,
    evidence,
    analysisDepth: "content",
    confidence: symbols.length > 0 || imports.length > 0 ? "medium" : "low",
  };
}
