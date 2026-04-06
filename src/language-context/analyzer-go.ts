/**
 * Go file context analyzer.
 *
 * Phase 43: Profile-aware context extraction for Go files.
 * Uses lightweight regex heuristics — NOT the Go compiler.
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
  /_test\.go$/,
  /\/testdata\//,
];

const CONFIG_PATTERNS = [
  /go\.mod$/,
  /go\.sum$/,
  /Makefile$/,
  /\.goreleaser/,
  /\.golangci/,
];

const ENTRYPOINT_PATTERNS = [
  /^main\.go$/,
  /^cmd\/[\w-]+\/main\.go$/,
  /^cmd\/main\.go$/,
];

/** Detect the role of a Go file by its path. */
export function detectGoFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (ENTRYPOINT_PATTERNS.some((p) => p.test(normalized))) return "entrypoint";

  if (/\/internal\//i.test(normalized)) return "library";
  if (/\/pkg\//i.test(normalized)) return "library";
  if (/\/cmd\//i.test(normalized)) return "entrypoint";
  if (/\/examples?\//i.test(normalized)) return "utility";

  return "library";
}

/* ------------------------------------------------------------------ */
/*  Symbol extraction                                                  */
/* ------------------------------------------------------------------ */

/** Extract symbols from Go file content using regex heuristics. */
export function extractGoSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      continue;
    }

    // func (exported = starts with uppercase)
    const funcMatch = line.match(/^func\s+(\w+)\s*\(/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      const exported = /^[A-Z]/.test(funcMatch[1]);
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // Method (func (receiver) Name(...))
    const methodMatch = line.match(/^func\s+\([^)]+\)\s+(\w+)\s*\(/);
    if (methodMatch && !seen.has(methodMatch[1])) {
      seen.add(methodMatch[1]);
      const exported = /^[A-Z]/.test(methodMatch[1]);
      symbols.push({
        name: methodMatch[1],
        kind: "function",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // type ... struct
    const structMatch = line.match(/^type\s+(\w+)\s+struct/);
    if (structMatch && !seen.has(structMatch[1])) {
      seen.add(structMatch[1]);
      const exported = /^[A-Z]/.test(structMatch[1]);
      symbols.push({
        name: structMatch[1],
        kind: "class",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // type ... interface
    const interfaceMatch = line.match(/^type\s+(\w+)\s+interface/);
    if (interfaceMatch && !seen.has(interfaceMatch[1])) {
      seen.add(interfaceMatch[1]);
      const exported = /^[A-Z]/.test(interfaceMatch[1]);
      symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // type alias
    const typeMatch = line.match(/^type\s+(\w+)\s+(?!struct\b|interface\b)/);
    if (typeMatch && !seen.has(typeMatch[1])) {
      seen.add(typeMatch[1]);
      const exported = /^[A-Z]/.test(typeMatch[1]);
      symbols.push({
        name: typeMatch[1],
        kind: "type_alias",
        line: lineNum,
        exported,
        confidence: "high",
      });
      continue;
    }

    // const (top-level)
    const constMatch = line.match(/^(?:const|var)\s+(\w+)/);
    if (constMatch && !seen.has(constMatch[1])) {
      seen.add(constMatch[1]);
      const exported = /^[A-Z]/.test(constMatch[1]);
      symbols.push({
        name: constMatch[1],
        kind: "constant",
        line: lineNum,
        exported,
        confidence: "medium",
      });
    }
  }

  return symbols;
}

/* ------------------------------------------------------------------ */
/*  Import/export extraction                                           */
/* ------------------------------------------------------------------ */

/** Extract import references from Go file content. */
export function extractGoImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();

  // Single import
  const singleImportRegex = /^\s*import\s+"([^"]+)"/gm;
  let match: RegExpExecArray | null;
  while ((match = singleImportRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // Grouped imports
  const groupRegex = /import\s*\(([\s\S]*?)\)/g;
  while ((match = groupRegex.exec(content)) !== null) {
    const block = match[1];
    const lineRegex = /["']([^"']+)["']/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      if (!seen.has(lineMatch[1])) {
        seen.add(lineMatch[1]);
        imports.push(lineMatch[1]);
      }
    }
  }

  return imports;
}

/** Extract export names from Go file content. */
export function extractGoExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  const lines = content.split("\n");
  for (const line of lines) {
    // Exported functions (uppercase)
    const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?([A-Z]\w*)\s*\(/);
    if (funcMatch && !seen.has(funcMatch[1])) {
      seen.add(funcMatch[1]);
      exports.push(funcMatch[1]);
    }
    // Exported types
    const typeMatch = line.match(/^type\s+([A-Z]\w*)/);
    if (typeMatch && !seen.has(typeMatch[1])) {
      seen.add(typeMatch[1]);
      exports.push(typeMatch[1]);
    }
    // Exported consts/vars
    const constMatch = line.match(/^(?:const|var)\s+([A-Z]\w*)/);
    if (constMatch && !seen.has(constMatch[1])) {
      seen.add(constMatch[1]);
      exports.push(constMatch[1]);
    }
  }

  return exports;
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a Go file and produce a context summary.
 */
export function analyzeGoFile(
  filePath: string,
  content: string | null,
): FileContextSummary {
  const role = detectGoFileRole(filePath);
  const evidence: ContextEvidence[] = [];

  if (content === null) {
    evidence.push({
      kind: "file_pattern",
      description: `Role detected from file path: ${role}`,
      source: filePath,
    });
    return {
      filePath,
      language: "go",
      role,
      symbols: [],
      imports: [],
      exports: [],
      evidence,
      analysisDepth: "path_only",
      confidence: "low",
    };
  }

  const symbols = extractGoSymbols(content);
  const imports = extractGoImports(content);
  const exports = extractGoExports(content);

  evidence.push({
    kind: "content_regex",
    description: `Extracted ${symbols.length} symbols, ${imports.length} imports, ${exports.length} exports via regex heuristics`,
    source: filePath,
  });

  if (role === "entrypoint") {
    evidence.push({
      kind: "file_pattern",
      description: "File matches Go entrypoint pattern",
      source: filePath,
    });
  }

  // package main detection
  const pkgMatch = content.match(/^package\s+(\w+)/m);
  if (pkgMatch) {
    evidence.push({
      kind: "content_regex",
      description: `Go package: ${pkgMatch[1]}`,
      source: filePath,
    });
    if (pkgMatch[1] === "main") {
      evidence.push({
        kind: "content_regex",
        description: "Package main — executable entry point",
        source: filePath,
      });
    }
  }

  return {
    filePath,
    language: "go",
    role,
    symbols,
    imports,
    exports,
    evidence,
    analysisDepth: "content",
    confidence: symbols.length > 0 || imports.length > 0 ? "medium" : "low",
  };
}
