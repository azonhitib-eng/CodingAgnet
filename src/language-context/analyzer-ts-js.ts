/**
 * TypeScript / JavaScript file context analyzer.
 *
 * Phase 43: Profile-aware context extraction for TS/JS files.
 * Uses lightweight regex heuristics — NOT a full parser or compiler.
 */

import type {
  FileContextSummary,
  FileSymbol,
  ContextEvidence,
  FileRole,
  SymbolKind,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  File role detection                                                */
/* ------------------------------------------------------------------ */

const TEST_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__tests__\//,
  /tests?\//,
];

const CONFIG_PATTERNS = [
  /\.config\.[tj]sx?$/,
  /\.config\.(json|ya?ml|cjs|mjs)$/,
  /tsconfig.*\.json$/,
  /jest\.config/,
  /vitest\.config/,
  /webpack\.config/,
  /rollup\.config/,
  /vite\.config/,
  /eslint/,
  /prettier/,
  /babel\.config/,
  /\.babelrc/,
  /next\.config/,
  /nuxt\.config/,
];

const ENTRYPOINT_PATTERNS = [
  /^src\/index\.[tj]sx?$/,
  /^src\/main\.[tj]sx?$/,
  /^src\/app\.[tj]sx?$/,
  /^index\.[tj]sx?$/,
  /^main\.[tj]sx?$/,
  /^app\.[tj]sx?$/,
  /^src\/server\.[tj]sx?$/,
  /^server\.[tj]sx?$/,
];

/** Detect the role of a TS/JS file by its path. */
export function detectTsJsFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (ENTRYPOINT_PATTERNS.some((p) => p.test(normalized))) return "entrypoint";

  if (/\/(components?|ui|views?)\//i.test(normalized)) return "component";
  if (/\/(utils?|helpers?|lib)\//i.test(normalized)) return "utility";
  if (/\/(build|dist|scripts)\//i.test(normalized)) return "build";
  if (/\.(md|txt|rst)$/i.test(normalized)) return "documentation";

  return "library";
}

/* ------------------------------------------------------------------ */
/*  Symbol extraction (regex-based)                                     */
/* ------------------------------------------------------------------ */

/** Extract symbols from TS/JS file content using regex heuristics. */
export function extractTsJsSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    // Exported function
    const exportFuncMatch = line.match(
      /^export\s+(?:async\s+)?function\s+(\w+)/,
    );
    if (exportFuncMatch && !seen.has(exportFuncMatch[1])) {
      seen.add(exportFuncMatch[1]);
      symbols.push({
        name: exportFuncMatch[1],
        kind: "function",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Exported class
    const exportClassMatch = line.match(
      /^export\s+(?:abstract\s+)?class\s+(\w+)/,
    );
    if (exportClassMatch && !seen.has(exportClassMatch[1])) {
      seen.add(exportClassMatch[1]);
      symbols.push({
        name: exportClassMatch[1],
        kind: "class",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Exported interface (TS)
    const exportInterfaceMatch = line.match(
      /^export\s+interface\s+(\w+)/,
    );
    if (exportInterfaceMatch && !seen.has(exportInterfaceMatch[1])) {
      seen.add(exportInterfaceMatch[1]);
      symbols.push({
        name: exportInterfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Exported type alias (TS)
    const exportTypeMatch = line.match(
      /^export\s+type\s+(\w+)\s*[=<]/,
    );
    if (exportTypeMatch && !seen.has(exportTypeMatch[1])) {
      seen.add(exportTypeMatch[1]);
      symbols.push({
        name: exportTypeMatch[1],
        kind: "type_alias",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Exported enum (TS)
    const exportEnumMatch = line.match(
      /^export\s+(?:const\s+)?enum\s+(\w+)/,
    );
    if (exportEnumMatch && !seen.has(exportEnumMatch[1])) {
      seen.add(exportEnumMatch[1]);
      symbols.push({
        name: exportEnumMatch[1],
        kind: "enum",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Exported const/let/var
    const exportConstMatch = line.match(
      /^export\s+(?:const|let|var)\s+(\w+)/,
    );
    if (exportConstMatch && !seen.has(exportConstMatch[1])) {
      seen.add(exportConstMatch[1]);
      const isUpper = /^[A-Z_][A-Z0-9_]*$/.test(exportConstMatch[1]);
      symbols.push({
        name: exportConstMatch[1],
        kind: isUpper ? "constant" : "variable",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Export default function/class
    const exportDefaultFuncMatch = line.match(
      /^export\s+default\s+(?:async\s+)?function\s+(\w+)/,
    );
    if (exportDefaultFuncMatch && !seen.has(exportDefaultFuncMatch[1])) {
      seen.add(exportDefaultFuncMatch[1]);
      symbols.push({
        name: exportDefaultFuncMatch[1],
        kind: "function",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    const exportDefaultClassMatch = line.match(
      /^export\s+default\s+class\s+(\w+)/,
    );
    if (exportDefaultClassMatch && !seen.has(exportDefaultClassMatch[1])) {
      seen.add(exportDefaultClassMatch[1]);
      symbols.push({
        name: exportDefaultClassMatch[1],
        kind: "class",
        line: lineNum,
        exported: true,
        confidence: "high",
      });
      continue;
    }

    // Non-exported top-level function
    const funcMatch = line.match(
      /^(?:async\s+)?function\s+(\w+)/,
    );
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported: false,
        confidence: "medium",
      });
      continue;
    }

    // Non-exported top-level class
    const classMatch = line.match(
      /^(?:abstract\s+)?class\s+(\w+)/,
    );
    if (classMatch && !seen.has(classMatch[1])) {
      seen.add(classMatch[1]);
      symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNum,
        exported: false,
        confidence: "medium",
      });
      continue;
    }

    // Top-level const (uppercase = constant)
    const constMatch = line.match(
      /^(?:const|let|var)\s+(\w+)/,
    );
    if (constMatch && !seen.has(constMatch[1]) && /^[A-Z_][A-Z0-9_]*$/.test(constMatch[1])) {
      seen.add(constMatch[1]);
      symbols.push({
        name: constMatch[1],
        kind: "constant",
        line: lineNum,
        exported: false,
        confidence: "medium",
      });
    }
  }

  return symbols;
}

/* ------------------------------------------------------------------ */
/*  Import/export extraction                                           */
/* ------------------------------------------------------------------ */

/** Extract import references from TS/JS file content. */
export function extractTsJsImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();

  // ES import statements
  const esImportRegex = /import\s+.*?\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = esImportRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // Side-effect imports
  const sideEffectRegex = /import\s+["']([^"']+)["']/g;
  while ((match = sideEffectRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // CommonJS require
  const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  return imports;
}

/** Extract export names from TS/JS file content. */
export function extractTsJsExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  const lines = content.split("\n");
  for (const line of lines) {
    // Named exports
    const namedMatch = line.match(
      /^export\s+(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|abstract\s+class|default\s+function|default\s+class)\s+(\w+)/,
    );
    if (namedMatch && !seen.has(namedMatch[1])) {
      seen.add(namedMatch[1]);
      exports.push(namedMatch[1]);
    }

    // Re-exports: export { ... } from '...'
    const reExportMatch = line.match(/^export\s*\{([^}]+)\}/);
    if (reExportMatch) {
      const names = reExportMatch[1].split(",").map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return (parts[1] ?? parts[0]).trim();
      });
      for (const name of names) {
        if (name && !seen.has(name)) {
          seen.add(name);
          exports.push(name);
        }
      }
    }

    // export * from '...'
    const starExportMatch = line.match(/^export\s*\*\s*from\s+["']([^"']+)["']/);
    if (starExportMatch && !seen.has(`* from ${starExportMatch[1]}`)) {
      seen.add(`* from ${starExportMatch[1]}`);
      exports.push(`* from ${starExportMatch[1]}`);
    }
  }

  return exports;
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a TypeScript/JavaScript file and produce a context summary.
 *
 * @param filePath — relative path from workspace root
 * @param content — file content (or null for path-only analysis)
 */
export function analyzeTsJsFile(
  filePath: string,
  content: string | null,
): FileContextSummary {
  const language = filePath.match(/\.[tj]sx?$/)
    ? (filePath.match(/\.tsx?$/) ? "typescript" : "javascript")
    : "unknown";
  const role = detectTsJsFileRole(filePath);
  const evidence: ContextEvidence[] = [];

  if (content === null) {
    evidence.push({
      kind: "file_pattern",
      description: `Role detected from file path: ${role}`,
      source: filePath,
    });
    return {
      filePath,
      language: language === "unknown" ? "typescript" : language,
      role,
      symbols: [],
      imports: [],
      exports: [],
      evidence,
      analysisDepth: "path_only",
      confidence: "low",
    };
  }

  const symbols = extractTsJsSymbols(content);
  const imports = extractTsJsImports(content);
  const exports = extractTsJsExports(content);

  evidence.push({
    kind: "content_regex",
    description: `Extracted ${symbols.length} symbols, ${imports.length} imports, ${exports.length} exports via regex heuristics`,
    source: filePath,
  });

  if (role === "entrypoint") {
    evidence.push({
      kind: "file_pattern",
      description: "File matches entrypoint naming pattern",
      source: filePath,
    });
  }

  if (role === "test") {
    evidence.push({
      kind: "naming_convention",
      description: "File matches test naming pattern",
      source: filePath,
    });
  }

  if (role === "config") {
    evidence.push({
      kind: "config_file",
      description: "File matches config naming pattern",
      source: filePath,
    });
  }

  return {
    filePath,
    language: language === "unknown" ? "typescript" : language,
    role,
    symbols,
    imports,
    exports,
    evidence,
    analysisDepth: "content",
    confidence: symbols.length > 0 || imports.length > 0 ? "medium" : "low",
  };
}
