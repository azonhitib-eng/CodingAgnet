/**
 * Rust file context analyzer.
 *
 * Phase 43: Profile-aware context extraction for Rust files.
 * Uses lightweight regex heuristics — NOT the Rust compiler.
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
  /tests?\//,
  /_test\.rs$/,
  /test_\w+\.rs$/,
];

const CONFIG_PATTERNS = [
  /Cargo\.toml$/,
  /Cargo\.lock$/,
  /\.cargo\/config/,
  /build\.rs$/,
  /rust-toolchain/,
  /clippy\.toml$/,
  /rustfmt\.toml$/,
];

const ENTRYPOINT_PATTERNS = [
  /^src\/main\.rs$/,
  /^src\/lib\.rs$/,
  /^main\.rs$/,
  /^lib\.rs$/,
];

/** Detect the role of a Rust file by its path. */
export function detectRustFileRole(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, "/");

  if (TEST_PATTERNS.some((p) => p.test(normalized))) return "test";
  if (CONFIG_PATTERNS.some((p) => p.test(normalized))) return "config";
  if (ENTRYPOINT_PATTERNS.some((p) => p.test(normalized))) return "entrypoint";

  if (/\/examples?\//i.test(normalized)) return "utility";
  if (/\/benches?\//i.test(normalized)) return "utility";

  return "library";
}

/* ------------------------------------------------------------------ */
/*  Symbol extraction                                                  */
/* ------------------------------------------------------------------ */

/** Extract symbols from Rust file content using regex heuristics. */
export function extractRustSymbols(content: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  const lines = content.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("///") || trimmed.startsWith("/*")) {
      continue;
    }

    // pub fn / fn
    const funcMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (funcMatch && !seen.has(funcMatch[2])) {
      seen.add(funcMatch[2]);
      symbols.push({
        name: funcMatch[2],
        kind: "function",
        line: lineNum,
        exported: !!funcMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub struct / struct
    const structMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?struct\s+(\w+)/);
    if (structMatch && !seen.has(structMatch[2])) {
      seen.add(structMatch[2]);
      symbols.push({
        name: structMatch[2],
        kind: "class",
        line: lineNum,
        exported: !!structMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub enum / enum
    const enumMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?enum\s+(\w+)/);
    if (enumMatch && !seen.has(enumMatch[2])) {
      seen.add(enumMatch[2]);
      symbols.push({
        name: enumMatch[2],
        kind: "enum",
        line: lineNum,
        exported: !!enumMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub trait / trait
    const traitMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?trait\s+(\w+)/);
    if (traitMatch && !seen.has(traitMatch[2])) {
      seen.add(traitMatch[2]);
      symbols.push({
        name: traitMatch[2],
        kind: "interface",
        line: lineNum,
        exported: !!traitMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub type / type alias
    const typeMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?type\s+(\w+)/);
    if (typeMatch && !seen.has(typeMatch[2])) {
      seen.add(typeMatch[2]);
      symbols.push({
        name: typeMatch[2],
        kind: "type_alias",
        line: lineNum,
        exported: !!typeMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub const / const
    const constMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?const\s+(\w+)/);
    if (constMatch && !seen.has(constMatch[2])) {
      seen.add(constMatch[2]);
      symbols.push({
        name: constMatch[2],
        kind: "constant",
        line: lineNum,
        exported: !!constMatch[1],
        confidence: "high",
      });
      continue;
    }

    // pub mod / mod
    const modMatch = line.match(/^\s*(pub(?:\(crate\))?\s+)?mod\s+(\w+)/);
    if (modMatch && !seen.has(modMatch[2])) {
      seen.add(modMatch[2]);
      symbols.push({
        name: modMatch[2],
        kind: "module",
        line: lineNum,
        exported: !!modMatch[1],
        confidence: "high",
      });
    }
  }

  return symbols;
}

/* ------------------------------------------------------------------ */
/*  Import/export extraction                                           */
/* ------------------------------------------------------------------ */

/** Extract import references from Rust file content. */
export function extractRustImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();

  // use statements
  const useRegex = /^\s*use\s+([\w:]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = useRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  // extern crate
  const externRegex = /^\s*extern\s+crate\s+(\w+)/gm;
  while ((match = externRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      imports.push(match[1]);
    }
  }

  return imports;
}

/** Extract export names from Rust file content. */
export function extractRustExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  const lines = content.split("\n");
  for (const line of lines) {
    // pub items
    const pubMatch = line.match(
      /^\s*pub(?:\(crate\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|mod)\s+(\w+)/,
    );
    if (pubMatch && !seen.has(pubMatch[1])) {
      seen.add(pubMatch[1]);
      exports.push(pubMatch[1]);
    }
  }

  return exports;
}

/* ------------------------------------------------------------------ */
/*  Full file context analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze a Rust file and produce a context summary.
 */
export function analyzeRustFile(
  filePath: string,
  content: string | null,
): FileContextSummary {
  const role = detectRustFileRole(filePath);
  const evidence: ContextEvidence[] = [];

  if (content === null) {
    evidence.push({
      kind: "file_pattern",
      description: `Role detected from file path: ${role}`,
      source: filePath,
    });
    return {
      filePath,
      language: "rust",
      role,
      symbols: [],
      imports: [],
      exports: [],
      evidence,
      analysisDepth: "path_only",
      confidence: "low",
    };
  }

  const symbols = extractRustSymbols(content);
  const imports = extractRustImports(content);
  const exports = extractRustExports(content);

  evidence.push({
    kind: "content_regex",
    description: `Extracted ${symbols.length} symbols, ${imports.length} imports, ${exports.length} exports via regex heuristics`,
    source: filePath,
  });

  if (role === "entrypoint") {
    evidence.push({
      kind: "file_pattern",
      description: "File matches Rust entrypoint pattern (main.rs or lib.rs)",
      source: filePath,
    });
  }

  // Check for #[test] module
  if (content.includes("#[cfg(test)]") || content.includes("#[test]")) {
    evidence.push({
      kind: "content_regex",
      description: "Contains #[test] or #[cfg(test)] — has inline tests",
      source: filePath,
    });
  }

  return {
    filePath,
    language: "rust",
    role,
    symbols,
    imports,
    exports,
    evidence,
    analysisDepth: "content",
    confidence: symbols.length > 0 || imports.length > 0 ? "medium" : "low",
  };
}
