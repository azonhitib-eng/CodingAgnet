/**
 * Language context module — barrel exports.
 *
 * Phase 43: Language intelligence expansion — symbol and context layer.
 */

/* types */
export type {
  SymbolKind,
  FileSymbol,
  ContextEvidenceKind,
  ContextEvidence,
  FileRole,
  FileContextSummary,
  ModuleContextSummary,
  ContextCollectionStatus,
  ContextSummaryReason,
  ProfileContextSupport,
  WorkspaceContextSummary,
} from "./types.js";

/* profile support */
export {
  PROFILE_CONTEXT_SUPPORT,
  getProfileContextSupport,
} from "./profile-support.js";

/* analyzers */
export {
  detectTsJsFileRole,
  extractTsJsSymbols,
  extractTsJsImports,
  extractTsJsExports,
  analyzeTsJsFile,
} from "./analyzer-ts-js.js";

export {
  detectPythonFileRole,
  extractPythonSymbols,
  extractPythonImports,
  extractPythonExports,
  analyzePythonFile,
} from "./analyzer-python.js";

export {
  detectPhpFileRole,
  extractPhpSymbols,
  extractWordPressSymbols,
  extractPhpImports,
  extractPhpExports,
  analyzePhpFile,
} from "./analyzer-php.js";

export {
  detectRustFileRole,
  extractRustSymbols,
  extractRustImports,
  extractRustExports,
  analyzeRustFile,
} from "./analyzer-rust.js";

export {
  detectGoFileRole,
  extractGoSymbols,
  extractGoImports,
  extractGoExports,
  analyzeGoFile,
} from "./analyzer-go.js";

export {
  detectGenericFileRole,
  analyzeGenericFile,
} from "./analyzer-generic.js";

/* aggregation */
export {
  analyzeFile,
  aggregateModules,
  collectWorkspaceContext,
  prioritizeFiles,
} from "./aggregation.js";

export type {
  FileContentProvider,
  WorkspaceContextOptions,
} from "./aggregation.js";

/* session integration */
export {
  LANGUAGE_CONTEXT_EVENT_KINDS,
  workspaceContextCollected,
  workspaceContextRefreshed,
  workspaceContextFailed,
  isLanguageContextEvent,
  filterLanguageContextEvents,
  buildLanguageContextSessionSummary,
} from "./session-integration.js";

export type {
  LanguageContextEventKind,
  LanguageContextSessionSummary,
} from "./session-integration.js";
