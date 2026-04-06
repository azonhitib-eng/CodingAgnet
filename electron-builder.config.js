/**
 * electron-builder configuration for CodingAgent desktop distribution.
 *
 * Phase 33 — first distributable desktop build path.
 *
 * This configuration produces a minimal packaged artifact for the primary
 * development platform. It wraps the existing Electron shell architecture
 * without changing the runtime model.
 *
 * What is included:
 *   - Compiled backend (dist/)
 *   - Data catalogs (data/)
 *   - Electron wrapper files (electron/)
 *   - Package metadata (package.json)
 *
 * What is NOT included:
 *   - Auto-update support
 *   - Code signing
 *   - Multi-platform release automation
 */

"use strict";

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "com.codingagent.desktop",
  productName: "CodingAgent",

  // Directories
  directories: {
    // Build output directory
    output: "dist-electron",
    // Use the project root as the app source
    app: ".",
  },

  // Files to include in the packaged app (relative to app root)
  files: [
    "dist/**/*",
    "data/**/*",
    "electron/**/*",
    "package.json",
    "!node_modules/.cache",
    "!node_modules/**/test/**",
    "!node_modules/**/tests/**",
    "!node_modules/**/docs/**",
    "!node_modules/**/*.md",
    "!node_modules/**/*.ts",
    "!node_modules/**/.github/**",
    "!src/**",
    "!tests/**",
    "!scripts/**",
    "!docs/**",
    "!coverage/**",
    "!*.tsbuildinfo",
    "!.git/**",
    "!.gitignore",
    "!eslint.config.js",
    "!vitest.config.ts",
    "!tsconfig.json",
    "!electron-builder.config.js",
    "!CHANGELOG.md",
    "!README.md",
  ],

  // Include production dependencies only
  // The app needs its node_modules for the compiled dist/ code
  npmRebuild: false,

  // Electron main process entry
  // electron-builder reads this from package.json "main" field
  // We override it in extraMetadata below
  extraMetadata: {
    main: "electron/main.cjs",
  },

  // --- Platform configurations (minimal) ---

  // Linux
  linux: {
    target: [{ target: "dir" }],
    category: "Development",
  },

  // macOS
  mac: {
    target: [{ target: "dir" }],
    category: "public.app-category.developer-tools",
    // No code signing in this phase
    identity: null,
  },

  // Windows
  win: {
    target: [{ target: "dir" }],
  },

  // --- Artifact naming ---
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",

  // Disable publishing (local builds only)
  publish: null,

  // Disable auto-update
  // (electron-updater is not included)
};

module.exports = config;
