/**
 * Phase 43 — Language intelligence expansion: symbol and context layer.
 *
 * Comprehensive tests for:
 * - Language context types and constants
 * - Profile context support descriptors
 * - TypeScript/JavaScript context extraction (symbols, imports, exports, roles)
 * - Python context extraction (symbols, imports, exports, roles)
 * - PHP / WordPress context extraction (symbols, hooks, imports, exports, roles)
 * - Rust context extraction (symbols, imports, exports, roles)
 * - Go context extraction (symbols, imports, exports, roles)
 * - Generic/unknown fallback
 * - File analysis dispatch
 * - Module aggregation
 * - Workspace context collection
 * - File prioritization
 * - Mixed repo behavior
 * - Session integration (events, summary builder)
 * - Command integration (3 new commands)
 * - Session summary extension (11 new fields)
 */

import { describe, it, expect } from "vitest";

/* --- Types --- */
import type {
  SymbolKind,
  FileSymbol,
  ContextEvidenceKind,
  ContextEvidence,
  FileRole,
  FileContextSummary,
  ModuleContextSummary,
  WorkspaceContextSummary,
  ContextCollectionStatus,
  ContextSummaryReason,
  ProfileContextSupport,
} from "../../src/language-context/types.js";

/* --- Profile support --- */
import {
  PROFILE_CONTEXT_SUPPORT,
  getProfileContextSupport,
} from "../../src/language-context/profile-support.js";

/* --- TS/JS Analyzer --- */
import {
  detectTsJsFileRole,
  extractTsJsSymbols,
  extractTsJsImports,
  extractTsJsExports,
  analyzeTsJsFile,
} from "../../src/language-context/analyzer-ts-js.js";

/* --- Python Analyzer --- */
import {
  detectPythonFileRole,
  extractPythonSymbols,
  extractPythonImports,
  extractPythonExports,
  analyzePythonFile,
} from "../../src/language-context/analyzer-python.js";

/* --- PHP Analyzer --- */
import {
  detectPhpFileRole,
  extractPhpSymbols,
  extractWordPressSymbols,
  extractPhpImports,
  extractPhpExports,
  analyzePhpFile,
} from "../../src/language-context/analyzer-php.js";

/* --- Rust Analyzer --- */
import {
  detectRustFileRole,
  extractRustSymbols,
  extractRustImports,
  extractRustExports,
  analyzeRustFile,
} from "../../src/language-context/analyzer-rust.js";

/* --- Go Analyzer --- */
import {
  detectGoFileRole,
  extractGoSymbols,
  extractGoImports,
  extractGoExports,
  analyzeGoFile,
} from "../../src/language-context/analyzer-go.js";

/* --- Generic Analyzer --- */
import {
  detectGenericFileRole,
  analyzeGenericFile,
} from "../../src/language-context/analyzer-generic.js";

/* --- Aggregation --- */
import {
  analyzeFile,
  aggregateModules,
  collectWorkspaceContext,
  prioritizeFiles,
} from "../../src/language-context/aggregation.js";

/* --- Session integration --- */
import {
  LANGUAGE_CONTEXT_EVENT_KINDS,
  workspaceContextCollected,
  workspaceContextRefreshed,
  workspaceContextFailed,
  isLanguageContextEvent,
  filterLanguageContextEvents,
  buildLanguageContextSessionSummary,
} from "../../src/language-context/session-integration.js";

/* --- Commands --- */
import {
  COMMAND_DEFINITIONS,
  ALL_COMMAND_IDS,
  ALL_COMMAND_CATEGORIES,
  getCommandDefinition,
  validateCommand,
} from "../../src/commands/index.js";

/* --- Session manager --- */
import { SessionManager } from "../../src/session/session-manager.js";

/* ================================================================== */
/*  1. Types sanity                                                    */
/* ================================================================== */

describe("Language context types (types.ts)", () => {
  it("SymbolKind includes expected values", () => {
    const kinds: SymbolKind[] = [
      "function", "class", "constant", "variable", "interface",
      "type_alias", "enum", "module", "hook", "export", "import",
      "entrypoint", "unknown",
    ];
    expect(kinds).toHaveLength(13);
  });

  it("FileRole includes expected values", () => {
    const roles: FileRole[] = [
      "entrypoint", "config", "test", "library", "component",
      "utility", "build", "documentation", "data", "unknown",
    ];
    expect(roles).toHaveLength(10);
  });

  it("ContextEvidenceKind includes expected values", () => {
    const kinds: ContextEvidenceKind[] = [
      "file_pattern", "content_regex", "package_json", "config_file",
      "directory_structure", "import_analysis", "export_analysis",
      "naming_convention", "profile_hint",
    ];
    expect(kinds).toHaveLength(9);
  });

  it("ContextCollectionStatus includes expected values", () => {
    const statuses: ContextCollectionStatus[] = [
      "pending", "collecting", "completed", "partial", "failed",
    ];
    expect(statuses).toHaveLength(5);
  });

  it("ContextSummaryReason includes expected values", () => {
    const reasons: ContextSummaryReason[] = [
      "workspace_opened", "profile_selected", "manual_refresh",
      "file_inventory_complete", "partial_analysis",
    ];
    expect(reasons).toHaveLength(5);
  });
});

/* ================================================================== */
/*  2. Profile context support                                         */
/* ================================================================== */

describe("Profile context support (profile-support.ts)", () => {
  it("PROFILE_CONTEXT_SUPPORT has all 8 profiles", () => {
    expect(Object.keys(PROFILE_CONTEXT_SUPPORT)).toHaveLength(8);
  });

  it("getProfileContextSupport returns descriptor for each profile", () => {
    const profiles = [
      "typescript-node", "javascript-node", "python-backend",
      "php-general", "php-wordpress", "rust-cli", "go-module", "generic-unknown",
    ] as const;
    for (const p of profiles) {
      const support = getProfileContextSupport(p);
      expect(support.profileId).toBe(p);
      expect(typeof support.symbolExtraction).toBe("boolean");
      expect(typeof support.importExportAnalysis).toBe("boolean");
      expect(Array.isArray(support.limitations)).toBe(true);
      expect(support.limitations.length).toBeGreaterThan(0);
    }
  });

  it("typescript-node has symbol extraction enabled", () => {
    const s = getProfileContextSupport("typescript-node");
    expect(s.symbolExtraction).toBe(true);
    expect(s.importExportAnalysis).toBe(true);
    expect(s.entrypointDetection).toBe(true);
  });

  it("generic-unknown has symbol extraction disabled", () => {
    const s = getProfileContextSupport("generic-unknown");
    expect(s.symbolExtraction).toBe(false);
    expect(s.importExportAnalysis).toBe(false);
    expect(s.entrypointDetection).toBe(false);
  });

  it("all profiles have limitations listed", () => {
    for (const [, support] of Object.entries(PROFILE_CONTEXT_SUPPORT)) {
      expect(support.limitations.length).toBeGreaterThan(0);
    }
  });
});

/* ================================================================== */
/*  3. TypeScript / JavaScript context extraction                      */
/* ================================================================== */

describe("TS/JS analyzer (analyzer-ts-js.ts)", () => {
  // --- File role detection ---
  describe("file role detection", () => {
    it("detects test files", () => {
      expect(detectTsJsFileRole("src/utils.test.ts")).toBe("test");
      expect(detectTsJsFileRole("tests/foo.spec.js")).toBe("test");
      expect(detectTsJsFileRole("__tests__/bar.tsx")).toBe("test");
    });

    it("detects config files", () => {
      expect(detectTsJsFileRole("tsconfig.json")).toBe("config");
      expect(detectTsJsFileRole("vitest.config.ts")).toBe("config");
      expect(detectTsJsFileRole("webpack.config.js")).toBe("config");
      expect(detectTsJsFileRole("next.config.mjs")).toBe("config");
    });

    it("detects entrypoints", () => {
      expect(detectTsJsFileRole("src/index.ts")).toBe("entrypoint");
      expect(detectTsJsFileRole("src/main.tsx")).toBe("entrypoint");
      expect(detectTsJsFileRole("src/app.js")).toBe("entrypoint");
      expect(detectTsJsFileRole("index.ts")).toBe("entrypoint");
    });

    it("detects components", () => {
      expect(detectTsJsFileRole("src/components/Button.tsx")).toBe("component");
    });

    it("detects utilities", () => {
      expect(detectTsJsFileRole("src/utils/format.ts")).toBe("utility");
    });

    it("defaults to library", () => {
      expect(detectTsJsFileRole("src/services/api.ts")).toBe("library");
    });
  });

  // --- Symbol extraction ---
  describe("symbol extraction", () => {
    it("extracts exported functions", () => {
      const content = `
export function greet(name: string): string {
  return "Hello " + name;
}

export async function fetchData(): Promise<void> {}
`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols[0].name).toBe("greet");
      expect(symbols[0].kind).toBe("function");
      expect(symbols[0].exported).toBe(true);
      expect(symbols[0].confidence).toBe("high");
      expect(symbols[1].name).toBe("fetchData");
    });

    it("extracts exported classes", () => {
      const content = `export class SessionManager {}\nexport abstract class BaseHandler {}`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols[0].kind).toBe("class");
      expect(symbols[1].kind).toBe("class");
    });

    it("extracts exported interfaces and type aliases", () => {
      const content = `
export interface Config {
  readonly name: string;
}
export type Status = "active" | "inactive";
`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols.find(s => s.name === "Config")?.kind).toBe("interface");
      expect(symbols.find(s => s.name === "Status")?.kind).toBe("type_alias");
    });

    it("extracts exported enums", () => {
      const content = `export enum Color { Red, Green, Blue }\nexport const enum Direction { Up, Down }`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols.every(s => s.kind === "enum")).toBe(true);
    });

    it("extracts exported constants", () => {
      const content = `export const DEFAULT_TIMEOUT = 5000;\nexport const myVar = "hello";`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols[0].kind).toBe("constant");
      expect(symbols[1].kind).toBe("variable");
    });

    it("extracts non-exported functions at lower confidence", () => {
      const content = `function helper() {}\nclass InternalClass {}`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols[0].exported).toBe(false);
      expect(symbols[0].confidence).toBe("medium");
    });

    it("skips comments", () => {
      const content = `// export function fake() {}\n/* export class Nope {} */\nexport function real() {}`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("real");
    });

    it("deduplicates symbols", () => {
      const content = `export function foo() {}\nexport function foo() {}`;
      const symbols = extractTsJsSymbols(content);
      expect(symbols).toHaveLength(1);
    });
  });

  // --- Import extraction ---
  describe("import extraction", () => {
    it("extracts ES imports", () => {
      const content = `
import { foo } from "./foo.js";
import type { Bar } from "../bar.js";
import * as path from "path";
`;
      const imports = extractTsJsImports(content);
      expect(imports).toContain("./foo.js");
      expect(imports).toContain("../bar.js");
      expect(imports).toContain("path");
    });

    it("extracts side-effect imports", () => {
      const content = `import "./polyfill.js";`;
      const imports = extractTsJsImports(content);
      expect(imports).toContain("./polyfill.js");
    });

    it("extracts CommonJS require", () => {
      const content = `const fs = require("fs");\nconst path = require("path");`;
      const imports = extractTsJsImports(content);
      expect(imports).toContain("fs");
      expect(imports).toContain("path");
    });

    it("deduplicates imports", () => {
      const content = `import { a } from "x";\nimport { b } from "x";`;
      const imports = extractTsJsImports(content);
      expect(imports.filter(i => i === "x")).toHaveLength(1);
    });
  });

  // --- Export extraction ---
  describe("export extraction", () => {
    it("extracts named exports", () => {
      const content = `
export function foo() {}
export class Bar {}
export const X = 1;
`;
      const exports = extractTsJsExports(content);
      expect(exports).toContain("foo");
      expect(exports).toContain("Bar");
      expect(exports).toContain("X");
    });

    it("extracts re-exports", () => {
      const content = `export { foo, bar as baz } from "./mod.js";`;
      const exports = extractTsJsExports(content);
      expect(exports).toContain("foo");
      expect(exports).toContain("baz");
    });

    it("extracts star re-exports", () => {
      const content = `export * from "./types.js";`;
      const exports = extractTsJsExports(content);
      expect(exports).toContain("* from ./types.js");
    });
  });

  // --- Full file analysis ---
  describe("full file analysis", () => {
    it("analyzes TS file with content", () => {
      const summary = analyzeTsJsFile(
        "src/index.ts",
        `export function main() {}\nimport { foo } from "./foo.js";`,
      );
      expect(summary.filePath).toBe("src/index.ts");
      expect(summary.language).toBe("typescript");
      expect(summary.role).toBe("entrypoint");
      expect(summary.symbols).toHaveLength(1);
      expect(summary.imports).toContain("./foo.js");
      expect(summary.exports).toContain("main");
      expect(summary.analysisDepth).toBe("content");
    });

    it("analyzes file with path only (no content)", () => {
      const summary = analyzeTsJsFile("src/utils/helper.ts", null);
      expect(summary.analysisDepth).toBe("path_only");
      expect(summary.confidence).toBe("low");
      expect(summary.symbols).toHaveLength(0);
    });

    it("detects JS language for .js files", () => {
      const summary = analyzeTsJsFile("app.js", "");
      expect(summary.language).toBe("javascript");
    });
  });
});

/* ================================================================== */
/*  4. Python context extraction                                       */
/* ================================================================== */

describe("Python analyzer (analyzer-python.ts)", () => {
  describe("file role detection", () => {
    it("detects test files", () => {
      expect(detectPythonFileRole("test_utils.py")).toBe("test");
      expect(detectPythonFileRole("utils_test.py")).toBe("test");
      expect(detectPythonFileRole("conftest.py")).toBe("test");
      expect(detectPythonFileRole("tests/test_main.py")).toBe("test");
    });

    it("detects config files", () => {
      expect(detectPythonFileRole("setup.py")).toBe("config");
      expect(detectPythonFileRole("pyproject.toml")).toBe("config");
      expect(detectPythonFileRole("requirements.txt")).toBe("config");
    });

    it("detects entrypoints", () => {
      expect(detectPythonFileRole("main.py")).toBe("entrypoint");
      expect(detectPythonFileRole("app.py")).toBe("entrypoint");
      expect(detectPythonFileRole("manage.py")).toBe("entrypoint");
      expect(detectPythonFileRole("__main__.py")).toBe("entrypoint");
    });

    it("detects library files", () => {
      expect(detectPythonFileRole("src/mypackage/__init__.py")).toBe("library");
    });
  });

  describe("symbol extraction", () => {
    it("extracts classes and functions", () => {
      const content = `
class MyClass:
    pass

def my_function():
    pass

async def async_handler():
    pass
`;
      const symbols = extractPythonSymbols(content);
      expect(symbols).toHaveLength(3);
      expect(symbols.find(s => s.name === "MyClass")?.kind).toBe("class");
      expect(symbols.find(s => s.name === "my_function")?.kind).toBe("function");
      expect(symbols.find(s => s.name === "async_handler")?.kind).toBe("function");
    });

    it("marks private symbols as not exported", () => {
      const content = `
def _private():
    pass

class _InternalClass:
    pass

def public_func():
    pass
`;
      const symbols = extractPythonSymbols(content);
      const priv = symbols.find(s => s.name === "_private");
      expect(priv?.exported).toBe(false);
      const pub = symbols.find(s => s.name === "public_func");
      expect(pub?.exported).toBe(true);
    });

    it("extracts UPPER_CASE constants", () => {
      const content = `MAX_RETRIES = 3\nDEFAULT_TIMEOUT = 30`;
      const symbols = extractPythonSymbols(content);
      expect(symbols).toHaveLength(2);
      expect(symbols.every(s => s.kind === "constant")).toBe(true);
    });
  });

  describe("import extraction", () => {
    it("extracts import statements", () => {
      const content = `
import os
import sys
from pathlib import Path
from typing import Optional
`;
      const imports = extractPythonImports(content);
      expect(imports).toContain("os");
      expect(imports).toContain("sys");
      expect(imports).toContain("pathlib");
      expect(imports).toContain("typing");
    });
  });

  describe("export extraction", () => {
    it("extracts __all__ exports", () => {
      const content = `
__all__ = ["foo", "bar", "MyClass"]

def foo():
    pass

def bar():
    pass

class MyClass:
    pass
`;
      const exports = extractPythonExports(content);
      expect(exports).toContain("foo");
      expect(exports).toContain("bar");
      expect(exports).toContain("MyClass");
    });

    it("extracts public functions as implicit exports", () => {
      const content = `
def public_func():
    pass

def _private_func():
    pass
`;
      const exports = extractPythonExports(content);
      expect(exports).toContain("public_func");
      expect(exports).not.toContain("_private_func");
    });
  });

  describe("full file analysis", () => {
    it("analyzes Python file with content", () => {
      const summary = analyzePythonFile(
        "app.py",
        `import os\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()`,
      );
      expect(summary.language).toBe("python");
      expect(summary.role).toBe("entrypoint");
      expect(summary.symbols.length).toBeGreaterThanOrEqual(1);
      expect(summary.imports).toContain("os");
      expect(summary.evidence.some(e => e.description.includes("__main__"))).toBe(true);
    });

    it("analyzes Python file with path only", () => {
      const summary = analyzePythonFile("src/utils.py", null);
      expect(summary.analysisDepth).toBe("path_only");
      expect(summary.confidence).toBe("low");
    });
  });
});

/* ================================================================== */
/*  5. PHP / WordPress context extraction                              */
/* ================================================================== */

describe("PHP analyzer (analyzer-php.ts)", () => {
  describe("file role detection", () => {
    it("detects test files", () => {
      expect(detectPhpFileRole("tests/MyTest.php")).toBe("test");
      expect(detectPhpFileRole("UserTest.php")).toBe("test");
    });

    it("detects config files", () => {
      expect(detectPhpFileRole("composer.json")).toBe("config");
      expect(detectPhpFileRole("phpunit.xml.dist")).toBe("config");
      expect(detectPhpFileRole("wp-config.php")).toBe("config");
    });

    it("detects entrypoints", () => {
      expect(detectPhpFileRole("index.php")).toBe("entrypoint");
      expect(detectPhpFileRole("public/index.php")).toBe("entrypoint");
    });
  });

  describe("symbol extraction", () => {
    it("extracts classes and functions", () => {
      const content = `
<?php
class UserController {
    public function index() {}
}

function helper_function() {}

interface UserInterface {}

define('MAX_USERS', 100);
`;
      const symbols = extractPhpSymbols(content);
      expect(symbols.find(s => s.name === "UserController")?.kind).toBe("class");
      expect(symbols.find(s => s.name === "helper_function")?.kind).toBe("function");
      expect(symbols.find(s => s.name === "UserInterface")?.kind).toBe("interface");
      expect(symbols.find(s => s.name === "MAX_USERS")?.kind).toBe("constant");
    });

    it("extracts traits", () => {
      const content = `trait Cacheable {}`;
      const symbols = extractPhpSymbols(content);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("Cacheable");
    });
  });

  describe("WordPress symbol extraction", () => {
    it("extracts hooks (add_action, add_filter)", () => {
      const content = `
add_action('init', 'my_init');
add_filter('the_content', 'my_filter');
do_action('custom_hook');
`;
      const symbols = extractWordPressSymbols(content);
      expect(symbols.find(s => s.name === "init")?.kind).toBe("hook");
      expect(symbols.find(s => s.name === "the_content")?.kind).toBe("hook");
      expect(symbols.find(s => s.name === "custom_hook")?.kind).toBe("hook");
    });
  });

  describe("import/export extraction", () => {
    it("extracts use statements", () => {
      const content = `
use App\\Models\\User;
use Illuminate\\Support\\Facades\\Auth;
`;
      const imports = extractPhpImports(content);
      expect(imports).toContain("App\\Models\\User");
      expect(imports).toContain("Illuminate\\Support\\Facades\\Auth");
    });

    it("extracts require/include", () => {
      const content = `require_once 'vendor/autoload.php';\ninclude 'config.php';`;
      const imports = extractPhpImports(content);
      expect(imports).toContain("vendor/autoload.php");
      expect(imports).toContain("config.php");
    });
  });

  describe("full file analysis", () => {
    it("analyzes PHP file without WordPress mode", () => {
      const summary = analyzePhpFile(
        "src/Controller.php",
        `<?php\nnamespace App;\nclass Controller {}`,
        false,
      );
      expect(summary.language).toBe("php");
      expect(summary.symbols.find(s => s.name === "Controller")).toBeTruthy();
      expect(summary.evidence.some(e => e.description.includes("namespace"))).toBe(true);
    });

    it("analyzes PHP file with WordPress mode", () => {
      const content = `<?php\n/*\nPlugin Name: My Plugin\nPlugin URI: http://example.com\n*/\nadd_action('init', 'my_init');\nfunction my_init() {}`;
      const summary = analyzePhpFile("my-plugin.php", content, true);
      expect(summary.symbols.some(s => s.kind === "hook")).toBe(true);
      expect(summary.evidence.some(e => e.description.includes("plugin header"))).toBe(true);
    });

    it("analyzes PHP file path only", () => {
      const summary = analyzePhpFile("src/Model.php", null);
      expect(summary.analysisDepth).toBe("path_only");
    });
  });
});

/* ================================================================== */
/*  6. Rust context extraction                                         */
/* ================================================================== */

describe("Rust analyzer (analyzer-rust.ts)", () => {
  describe("file role detection", () => {
    it("detects test files", () => {
      expect(detectRustFileRole("tests/integration.rs")).toBe("test");
    });

    it("detects config files", () => {
      expect(detectRustFileRole("Cargo.toml")).toBe("config");
      expect(detectRustFileRole("build.rs")).toBe("config");
    });

    it("detects entrypoints", () => {
      expect(detectRustFileRole("src/main.rs")).toBe("entrypoint");
      expect(detectRustFileRole("src/lib.rs")).toBe("entrypoint");
    });
  });

  describe("symbol extraction", () => {
    it("extracts pub and non-pub items", () => {
      const content = `
pub fn handle_request() {}
fn internal_helper() {}
pub struct Config {}
struct PrivateData {}
pub enum Status { Active, Inactive }
pub trait Handler {}
pub type Result<T> = std::result::Result<T, Error>;
pub const MAX_SIZE: usize = 1024;
pub mod api;
mod internal;
`;
      const symbols = extractRustSymbols(content);
      expect(symbols.find(s => s.name === "handle_request")?.exported).toBe(true);
      expect(symbols.find(s => s.name === "internal_helper")?.exported).toBe(false);
      expect(symbols.find(s => s.name === "Config")?.kind).toBe("class");
      expect(symbols.find(s => s.name === "Status")?.kind).toBe("enum");
      expect(symbols.find(s => s.name === "Handler")?.kind).toBe("interface");
      expect(symbols.find(s => s.name === "Result")?.kind).toBe("type_alias");
      expect(symbols.find(s => s.name === "MAX_SIZE")?.kind).toBe("constant");
      expect(symbols.find(s => s.name === "api")?.kind).toBe("module");
    });

    it("handles pub(crate) visibility", () => {
      const content = `pub(crate) fn internal_api() {}`;
      const symbols = extractRustSymbols(content);
      expect(symbols[0].exported).toBe(true);
    });
  });

  describe("import extraction", () => {
    it("extracts use statements", () => {
      const content = `use std::io;\nuse crate::config::Config;\nextern crate serde;`;
      const imports = extractRustImports(content);
      expect(imports).toContain("std::io");
      expect(imports).toContain("crate::config::Config");
      expect(imports).toContain("serde");
    });
  });

  describe("full file analysis", () => {
    it("analyzes Rust file with content", () => {
      const content = `use std::io;\n\npub fn main() {\n    println!("Hello");\n}\n\n#[cfg(test)]\nmod tests {}`;
      const summary = analyzeRustFile("src/main.rs", content);
      expect(summary.language).toBe("rust");
      expect(summary.role).toBe("entrypoint");
      expect(summary.symbols.length).toBeGreaterThanOrEqual(1);
      expect(summary.evidence.some(e => e.description.includes("#[test]") || e.description.includes("#[cfg(test)]"))).toBe(true);
    });

    it("analyzes Rust file with path only", () => {
      const summary = analyzeRustFile("src/lib.rs", null);
      expect(summary.analysisDepth).toBe("path_only");
      expect(summary.role).toBe("entrypoint");
    });
  });
});

/* ================================================================== */
/*  7. Go context extraction                                           */
/* ================================================================== */

describe("Go analyzer (analyzer-go.ts)", () => {
  describe("file role detection", () => {
    it("detects test files", () => {
      expect(detectGoFileRole("handler_test.go")).toBe("test");
    });

    it("detects config files", () => {
      expect(detectGoFileRole("go.mod")).toBe("config");
      expect(detectGoFileRole("go.sum")).toBe("config");
      expect(detectGoFileRole("Makefile")).toBe("config");
    });

    it("detects entrypoints", () => {
      expect(detectGoFileRole("main.go")).toBe("entrypoint");
      expect(detectGoFileRole("cmd/server/main.go")).toBe("entrypoint");
    });
  });

  describe("symbol extraction", () => {
    it("extracts exported and unexported symbols", () => {
      const content = `
package main

func HandleRequest() {}
func internalHelper() {}
type Config struct {}
type handler struct {}
type Reader interface {}
const MaxRetries = 3
var defaultTimeout = 30
`;
      const symbols = extractGoSymbols(content);
      expect(symbols.find(s => s.name === "HandleRequest")?.exported).toBe(true);
      expect(symbols.find(s => s.name === "internalHelper")?.exported).toBe(false);
      expect(symbols.find(s => s.name === "Config")?.kind).toBe("class");
      expect(symbols.find(s => s.name === "Reader")?.kind).toBe("interface");
      expect(symbols.find(s => s.name === "MaxRetries")?.exported).toBe(true);
      expect(symbols.find(s => s.name === "defaultTimeout")?.exported).toBe(false);
    });

    it("extracts methods", () => {
      const content = `func (s *Server) Start() error {}`;
      const symbols = extractGoSymbols(content);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("Start");
      expect(symbols[0].exported).toBe(true);
    });
  });

  describe("import extraction", () => {
    it("extracts single and grouped imports", () => {
      const content = `
import "fmt"

import (
    "os"
    "net/http"
    "github.com/gin-gonic/gin"
)
`;
      const imports = extractGoImports(content);
      expect(imports).toContain("fmt");
      expect(imports).toContain("os");
      expect(imports).toContain("net/http");
      expect(imports).toContain("github.com/gin-gonic/gin");
    });
  });

  describe("export extraction", () => {
    it("extracts only uppercase (exported) symbols", () => {
      const content = `
func Public() {}
func private() {}
type Config struct {}
type internal struct {}
`;
      const exports = extractGoExports(content);
      expect(exports).toContain("Public");
      expect(exports).not.toContain("private");
      expect(exports).toContain("Config");
      expect(exports).not.toContain("internal");
    });
  });

  describe("full file analysis", () => {
    it("analyzes Go file with content", () => {
      const content = `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello")\n}`;
      const summary = analyzeGoFile("main.go", content);
      expect(summary.language).toBe("go");
      expect(summary.role).toBe("entrypoint");
      expect(summary.evidence.some(e => e.description.includes("Go package: main"))).toBe(true);
      expect(summary.evidence.some(e => e.description.includes("Package main"))).toBe(true);
    });

    it("analyzes Go file with path only", () => {
      const summary = analyzeGoFile("pkg/handler.go", null);
      expect(summary.analysisDepth).toBe("path_only");
      expect(summary.role).toBe("library");
    });
  });
});

/* ================================================================== */
/*  8. Generic / unknown fallback                                      */
/* ================================================================== */

describe("Generic analyzer (analyzer-generic.ts)", () => {
  it("detects test files", () => {
    expect(detectGenericFileRole("tests/data.csv")).toBe("test");
  });

  it("detects config files", () => {
    expect(detectGenericFileRole("Dockerfile")).toBe("config");
    expect(detectGenericFileRole(".editorconfig")).toBe("config");
  });

  it("detects documentation", () => {
    expect(detectGenericFileRole("README.md")).toBe("documentation");
    expect(detectGenericFileRole("docs/guide.rst")).toBe("documentation");
  });

  it("detects data files", () => {
    expect(detectGenericFileRole("data/seed.json")).toBe("data");
  });

  it("returns unknown for unrecognized files", () => {
    expect(detectGenericFileRole("random-binary")).toBe("unknown");
  });

  it("analyzes generic file with no symbols", () => {
    const summary = analyzeGenericFile("unknown.xyz", "some content");
    expect(summary.language).toBe("unknown");
    expect(summary.symbols).toHaveLength(0);
    expect(summary.analysisDepth).toBe("path_only");
    expect(summary.confidence).toBe("low");
    expect(summary.evidence.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  9. File analysis dispatch                                          */
/* ================================================================== */

describe("File analysis dispatch (aggregation.ts)", () => {
  it("dispatches TS files to TS analyzer", () => {
    const summary = analyzeFile("src/index.ts", "export function main() {}", "typescript-node");
    expect(summary.language).toBe("typescript");
    expect(summary.symbols.length).toBeGreaterThan(0);
  });

  it("dispatches JS files to JS analyzer", () => {
    const summary = analyzeFile("app.js", "function run() {}", "javascript-node");
    expect(summary.language).toBe("javascript");
  });

  it("dispatches Python files to Python analyzer", () => {
    const summary = analyzeFile("main.py", "def main():\n    pass", "python-backend");
    expect(summary.language).toBe("python");
  });

  it("dispatches PHP files to PHP analyzer", () => {
    const summary = analyzeFile("index.php", "<?php\nclass Foo {}", "php-general");
    expect(summary.language).toBe("php");
  });

  it("dispatches PHP files with WordPress mode", () => {
    const summary = analyzeFile("plugin.php", "<?php\nadd_action('init', 'fn');", "php-wordpress");
    expect(summary.language).toBe("php");
  });

  it("dispatches Rust files to Rust analyzer", () => {
    const summary = analyzeFile("src/main.rs", "fn main() {}", "rust-cli");
    expect(summary.language).toBe("rust");
  });

  it("dispatches Go files to Go analyzer", () => {
    const summary = analyzeFile("main.go", "package main\nfunc main() {}", "go-module");
    expect(summary.language).toBe("go");
  });

  it("falls back to generic for unknown extensions", () => {
    const summary = analyzeFile("data.csv", "a,b,c", "typescript-node");
    expect(summary.language).toBe("unknown");
  });

  it("falls back by extension when profile doesn't match", () => {
    const summary = analyzeFile("utils.py", "def foo():\n    pass", "typescript-node");
    expect(summary.language).toBe("python");
  });
});

/* ================================================================== */
/*  10. Module aggregation                                             */
/* ================================================================== */

describe("Module aggregation (aggregation.ts)", () => {
  it("groups files by directory", () => {
    const files: FileContextSummary[] = [
      analyzeTsJsFile("src/index.ts", "export function main() {}"),
      analyzeTsJsFile("src/utils.ts", "export function helper() {}"),
      analyzeTsJsFile("tests/test.ts", null),
    ];
    const modules = aggregateModules(files);
    expect(modules.length).toBe(2);
    const srcModule = modules.find(m => m.modulePath === "src");
    expect(srcModule?.fileCount).toBe(2);
    expect(srcModule?.notableExports.length).toBeGreaterThan(0);
  });

  it("identifies entrypoints in modules", () => {
    const files: FileContextSummary[] = [
      analyzeTsJsFile("src/index.ts", "export function main() {}"),
      analyzeTsJsFile("src/lib.ts", "export class Lib {}"),
    ];
    const modules = aggregateModules(files);
    const srcModule = modules.find(m => m.modulePath === "src");
    expect(srcModule?.entrypoints).toContain("src/index.ts");
  });

  it("identifies test and config files in modules", () => {
    const files: FileContextSummary[] = [
      analyzeTsJsFile("src/foo.test.ts", null),
      analyzeTsJsFile("src/vitest.config.ts", null),
    ];
    const modules = aggregateModules(files);
    expect(modules[0].testFiles).toContain("src/foo.test.ts");
    expect(modules[0].configFiles).toContain("src/vitest.config.ts");
  });

  it("sorts modules by file count descending", () => {
    const files: FileContextSummary[] = [
      analyzeTsJsFile("a/one.ts", null),
      analyzeTsJsFile("b/one.ts", null),
      analyzeTsJsFile("b/two.ts", null),
      analyzeTsJsFile("b/three.ts", null),
    ];
    const modules = aggregateModules(files);
    expect(modules[0].modulePath).toBe("b");
    expect(modules[0].fileCount).toBe(3);
  });
});

/* ================================================================== */
/*  11. File prioritization                                            */
/* ================================================================== */

describe("File prioritization (aggregation.ts)", () => {
  it("puts entrypoints and configs first", () => {
    const files = [
      "src/deep/nested/util.ts",
      "tests/foo.test.ts",
      "src/index.ts",
      "package.json",
    ];
    const sorted = prioritizeFiles(files, "typescript-node");
    expect(sorted[0]).toBe("src/index.ts");
    expect(sorted[1]).toBe("package.json");
  });

  it("prioritizes profile-relevant extensions", () => {
    const files = [
      "data.csv",
      "src/main.py",
      "README.md",
    ];
    const sorted = prioritizeFiles(files, "python-backend");
    expect(sorted[0]).toBe("src/main.py");
  });
});

/* ================================================================== */
/*  12. Workspace context collection                                   */
/* ================================================================== */

describe("Workspace context collection (aggregation.ts)", () => {
  const mockFiles = [
    "src/index.ts",
    "src/utils.ts",
    "src/types.ts",
    "tests/index.test.ts",
    "package.json",
    "tsconfig.json",
  ];

  const mockContent: Record<string, string> = {
    "src/index.ts": `export function main() {}\nimport { helper } from "./utils.js";`,
    "src/utils.ts": `export function helper() {}\nexport const VERSION = "1.0";`,
    "src/types.ts": `export interface Config { readonly name: string; }`,
    "tests/index.test.ts": `import { main } from "../src/index.js";\ndescribe("main", () => {});`,
    "package.json": `{ "name": "test" }`,
    "tsconfig.json": `{ "compilerOptions": {} }`,
  };

  function getContent(filePath: string): string | null {
    return mockContent[filePath] ?? null;
  }

  it("collects workspace context with file content", () => {
    const ctx = collectWorkspaceContext({
      workspacePath: "/test",
      profileId: "typescript-node",
      files: mockFiles,
      getFileContent: getContent,
      reason: "workspace_opened",
    });
    expect(ctx.workspacePath).toBe("/test");
    expect(ctx.profileId).toBe("typescript-node");
    expect(ctx.totalFilesAnalyzed).toBe(mockFiles.length);
    expect(ctx.filesWithContentAnalysis).toBeGreaterThan(0);
    expect(ctx.entrypoints.length).toBeGreaterThan(0);
    expect(ctx.configFiles.length).toBeGreaterThan(0);
    expect(ctx.testFiles.length).toBeGreaterThan(0);
    expect(ctx.notableSymbols.length).toBeGreaterThan(0);
    expect(ctx.modules.length).toBeGreaterThan(0);
    expect(ctx.collectionStatus).toBe("completed");
    expect(ctx.confidence).toBe("medium");
    expect(ctx.evidence.length).toBeGreaterThan(0);
  });

  it("limits content analysis to maxContentAnalysis", () => {
    const ctx = collectWorkspaceContext({
      workspacePath: "/test",
      profileId: "typescript-node",
      files: mockFiles,
      getFileContent: getContent,
      reason: "workspace_opened",
      maxContentAnalysis: 2,
    });
    expect(ctx.filesWithContentAnalysis).toBeLessThanOrEqual(2);
    expect(ctx.collectionStatus).toBe("partial");
    expect(ctx.notes.length).toBeGreaterThan(0);
  });

  it("handles empty file list", () => {
    const ctx = collectWorkspaceContext({
      workspacePath: "/empty",
      profileId: "generic-unknown",
      files: [],
      getFileContent: () => null,
      reason: "workspace_opened",
    });
    expect(ctx.totalFilesAnalyzed).toBe(0);
    expect(ctx.entrypoints).toHaveLength(0);
    expect(ctx.collectionStatus).toBe("completed");
    expect(ctx.confidence).toBe("low");
  });

  it("uses profile support descriptor", () => {
    const ctx = collectWorkspaceContext({
      workspacePath: "/test",
      profileId: "typescript-node",
      files: mockFiles,
      getFileContent: getContent,
      reason: "profile_selected",
    });
    expect(ctx.profileSupport.profileId).toBe("typescript-node");
    expect(ctx.profileSupport.symbolExtraction).toBe(true);
  });

  it("works with generic-unknown profile", () => {
    const ctx = collectWorkspaceContext({
      workspacePath: "/test",
      profileId: "generic-unknown",
      files: ["README.md", "data.json"],
      getFileContent: () => null,
      reason: "workspace_opened",
    });
    expect(ctx.profileSupport.symbolExtraction).toBe(false);
    expect(ctx.notes.some(n => n.includes("No language-specific"))).toBe(true);
  });
});

/* ================================================================== */
/*  13. Mixed repo behavior                                            */
/* ================================================================== */

describe("Mixed repo context behavior", () => {
  it("handles mixed TS + Python repo", () => {
    const files = [
      "src/index.ts",
      "scripts/main.py",
      "tests/test_script.py",
      "package.json",
    ];
    const content: Record<string, string> = {
      "src/index.ts": "export function main() {}",
      "scripts/main.py": "def run():\n    pass",
      "tests/test_script.py": "def test_run():\n    pass",
      "package.json": '{"name":"mixed"}',
    };
    const ctx = collectWorkspaceContext({
      workspacePath: "/mixed",
      profileId: "typescript-node",
      files,
      getFileContent: (f) => content[f] ?? null,
      reason: "workspace_opened",
    });
    // TS files analyzed with TS analyzer, Python files analyzed with Python analyzer
    expect(ctx.totalFilesAnalyzed).toBe(4);
    const tsFile = ctx.fileSummaries.find(f => f.filePath === "src/index.ts");
    const pyFile = ctx.fileSummaries.find(f => f.filePath === "scripts/main.py");
    expect(tsFile?.language).toBe("typescript");
    expect(pyFile?.language).toBe("python");
  });
});

/* ================================================================== */
/*  14. Session integration                                            */
/* ================================================================== */

describe("Session integration (session-integration.ts)", () => {
  const mockSummary: WorkspaceContextSummary = {
    workspacePath: "/test",
    profileId: "typescript-node",
    generatedAt: new Date().toISOString(),
    collectionStatus: "completed",
    reason: "workspace_opened",
    totalFilesAnalyzed: 10,
    filesWithContentAnalysis: 5,
    entrypoints: ["src/index.ts"],
    configFiles: ["package.json"],
    testFiles: ["tests/index.test.ts"],
    notableSymbols: [
      { name: "main", kind: "function", exported: true, confidence: "high" },
    ],
    modules: [],
    fileSummaries: [],
    profileSupport: getProfileContextSupport("typescript-node"),
    evidence: [],
    notes: [],
    confidence: "medium",
  };

  it("LANGUAGE_CONTEXT_EVENT_KINDS has 3 entries", () => {
    expect(LANGUAGE_CONTEXT_EVENT_KINDS).toHaveLength(3);
  });

  it("workspaceContextCollected creates event with details", () => {
    const event = workspaceContextCollected(mockSummary);
    expect(event.kind).toBe("workspace_context_collected");
    expect(event.message).toContain("10 files");
    expect(event.message).toContain("1 notable symbols");
    expect(event.detail).toHaveProperty("profileId", "typescript-node");
    expect(event.detail).toHaveProperty("totalFilesAnalyzed", 10);
  });

  it("workspaceContextRefreshed creates event", () => {
    const event = workspaceContextRefreshed(mockSummary);
    expect(event.kind).toBe("workspace_context_refreshed");
    expect(event.message).toContain("refreshed");
  });

  it("workspaceContextFailed creates event", () => {
    const event = workspaceContextFailed("read error", "typescript-node");
    expect(event.kind).toBe("workspace_context_failed");
    expect(event.message).toContain("read error");
  });

  it("isLanguageContextEvent correctly identifies events", () => {
    const contextEvent = workspaceContextCollected(mockSummary);
    expect(isLanguageContextEvent(contextEvent)).toBe(true);
    const otherEvent = { kind: "session_created", timestamp: "", message: "" };
    expect(isLanguageContextEvent(otherEvent)).toBe(false);
  });

  it("filterLanguageContextEvents filters correctly", () => {
    const events = [
      workspaceContextCollected(mockSummary),
      { kind: "session_created", timestamp: "", message: "" },
      workspaceContextFailed("err", "x"),
    ];
    const filtered = filterLanguageContextEvents(events);
    expect(filtered).toHaveLength(2);
  });

  it("buildLanguageContextSessionSummary with context", () => {
    const summary = buildLanguageContextSessionSummary(mockSummary);
    expect(summary.contextCollected).toBe(true);
    expect(summary.contextProfileId).toBe("typescript-node");
    expect(summary.contextCollectionStatus).toBe("completed");
    expect(summary.contextTotalFiles).toBe(10);
    expect(summary.contextFilesWithContent).toBe(5);
    expect(summary.contextEntrypointCount).toBe(1);
    expect(summary.contextConfigFileCount).toBe(1);
    expect(summary.contextTestFileCount).toBe(1);
    expect(summary.contextNotableSymbolCount).toBe(1);
    expect(summary.contextModuleCount).toBe(0);
    expect(summary.contextConfidence).toBe("medium");
  });

  it("buildLanguageContextSessionSummary without context", () => {
    const summary = buildLanguageContextSessionSummary(null);
    expect(summary.contextCollected).toBe(false);
    expect(summary.contextProfileId).toBeNull();
    expect(summary.contextTotalFiles).toBeNull();
  });
});

/* ================================================================== */
/*  15. Session summary exposure                                       */
/* ================================================================== */

describe("Session summary exposure", () => {
  it("SessionSummary includes context fields with defaults", () => {
    const mgr = new SessionManager();
    const session = mgr.createSession();
    const summary = mgr.getSessionSummary(session.id);
    expect(summary.contextCollected).toBe(false);
    expect(summary.contextProfileId).toBeNull();
    expect(summary.contextCollectionStatus).toBeNull();
    expect(summary.contextTotalFiles).toBeNull();
    expect(summary.contextFilesWithContent).toBeNull();
    expect(summary.contextEntrypointCount).toBeNull();
    expect(summary.contextConfigFileCount).toBeNull();
    expect(summary.contextTestFileCount).toBeNull();
    expect(summary.contextNotableSymbolCount).toBeNull();
    expect(summary.contextModuleCount).toBeNull();
    expect(summary.contextConfidence).toBeNull();
  });

  it("SessionSummary surfaces context when provided", () => {
    const mgr = new SessionManager();
    const session = mgr.createSession();
    const summary = mgr.getSessionSummary(
      session.id,
      undefined, // agentSummaries
      undefined, // fingerprintSummary
      undefined, // toolchainSummary
      undefined, // languageServiceSummary
      undefined, // toolInvocationSummary
      undefined, // githubMcpSummary
      {
        contextCollected: true,
        contextProfileId: "typescript-node",
        contextCollectionStatus: "completed",
        contextTotalFiles: 20,
        contextFilesWithContent: 10,
        contextEntrypointCount: 2,
        contextConfigFileCount: 3,
        contextTestFileCount: 5,
        contextNotableSymbolCount: 15,
        contextModuleCount: 4,
        contextConfidence: "medium",
      },
    );
    expect(summary.contextCollected).toBe(true);
    expect(summary.contextProfileId).toBe("typescript-node");
    expect(summary.contextTotalFiles).toBe(20);
    expect(summary.contextNotableSymbolCount).toBe(15);
  });
});

/* ================================================================== */
/*  16. Command integration                                            */
/* ================================================================== */

describe("Command integration", () => {
  it("COMMAND_DEFINITIONS includes 3 new context commands", () => {
    const contextCmds = COMMAND_DEFINITIONS.filter(d => d.category === "language_context");
    expect(contextCmds).toHaveLength(3);
    const ids = contextCmds.map(d => d.id);
    expect(ids).toContain("inspect_workspace_context");
    expect(ids).toContain("inspect_file_context");
    expect(ids).toContain("refresh_context_summary");
  });

  it("ALL_COMMAND_IDS includes new commands", () => {
    expect(ALL_COMMAND_IDS).toContain("inspect_workspace_context");
    expect(ALL_COMMAND_IDS).toContain("inspect_file_context");
    expect(ALL_COMMAND_IDS).toContain("refresh_context_summary");
  });

  it("ALL_COMMAND_CATEGORIES includes language_context", () => {
    expect(ALL_COMMAND_CATEGORIES).toContain("language_context");
  });

  it("getCommandDefinition returns new commands", () => {
    const def = getCommandDefinition("inspect_workspace_context");
    expect(def).toBeDefined();
    expect(def?.category).toBe("language_context");
    expect(def?.label).toContain("Workspace Context");
  });

  it("validates inspect_workspace_context (no required fields)", () => {
    const result = validateCommand({
      commandId: "inspect_workspace_context",
      data: {},
    });
    expect(result.valid).toBe(true);
  });

  it("validates inspect_file_context requires filePath", () => {
    const result = validateCommand({
      commandId: "inspect_file_context",
      data: { filePath: "" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("filePath");
  });

  it("validates inspect_file_context with valid filePath", () => {
    const result = validateCommand({
      commandId: "inspect_file_context",
      data: { filePath: "src/index.ts" },
    });
    expect(result.valid).toBe(true);
  });

  it("validates refresh_context_summary (no required fields)", () => {
    const result = validateCommand({
      commandId: "refresh_context_summary",
      data: {},
    });
    expect(result.valid).toBe(true);
  });
});

/* ================================================================== */
/*  17. Barrel export integrity                                        */
/* ================================================================== */

describe("Barrel exports (index.ts)", () => {
  it("exports all types", async () => {
    const mod = await import("../../src/language-context/index.js");
    // Types are compile-time only, check value exports
    expect(typeof mod.getProfileContextSupport).toBe("function");
    expect(typeof mod.analyzeTsJsFile).toBe("function");
    expect(typeof mod.analyzePythonFile).toBe("function");
    expect(typeof mod.analyzePhpFile).toBe("function");
    expect(typeof mod.analyzeRustFile).toBe("function");
    expect(typeof mod.analyzeGoFile).toBe("function");
    expect(typeof mod.analyzeGenericFile).toBe("function");
    expect(typeof mod.analyzeFile).toBe("function");
    expect(typeof mod.aggregateModules).toBe("function");
    expect(typeof mod.collectWorkspaceContext).toBe("function");
    expect(typeof mod.prioritizeFiles).toBe("function");
    expect(typeof mod.buildLanguageContextSessionSummary).toBe("function");
    expect(typeof mod.workspaceContextCollected).toBe("function");
    expect(typeof mod.workspaceContextRefreshed).toBe("function");
    expect(typeof mod.workspaceContextFailed).toBe("function");
    expect(typeof mod.isLanguageContextEvent).toBe("function");
    expect(typeof mod.filterLanguageContextEvents).toBe("function");
    expect(mod.PROFILE_CONTEXT_SUPPORT).toBeDefined();
    expect(mod.LANGUAGE_CONTEXT_EVENT_KINDS).toBeDefined();
  });
});

/* ================================================================== */
/*  18. Edge cases                                                     */
/* ================================================================== */

describe("Edge cases", () => {
  it("handles empty file content gracefully", () => {
    const ts = analyzeTsJsFile("empty.ts", "");
    expect(ts.symbols).toHaveLength(0);

    const py = analyzePythonFile("empty.py", "");
    expect(py.symbols).toHaveLength(0);

    const php = analyzePhpFile("empty.php", "");
    expect(php.symbols).toHaveLength(0);

    const rs = analyzeRustFile("empty.rs", "");
    expect(rs.symbols).toHaveLength(0);

    const go = analyzeGoFile("empty.go", "");
    expect(go.symbols).toHaveLength(0);
  });

  it("handles files with only comments", () => {
    const ts = extractTsJsSymbols("// comment\n/* block */\n* star");
    expect(ts).toHaveLength(0);
  });

  it("handles very long symbol names", () => {
    const name = "a".repeat(200);
    const content = `export function ${name}() {}`;
    const symbols = extractTsJsSymbols(content);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe(name);
  });
});
