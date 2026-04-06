/**
 * electron-builder configuration for CodingAgent desktop distribution.
 *
 * Phase 33 — first distributable desktop build path.
 * Phase 35 — first installable artifact targets (AppImage, dmg, nsis).
 *
 * This configuration produces packaged and installable artifacts for the
 * primary development platform. It wraps the existing Electron shell
 * architecture without changing the runtime model.
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

  // --- Platform configurations ---
  // Each platform defines both a dir target (for fast local testing / Phase 33)
  // and an installable target (Phase 35).

  // Linux — AppImage is a single portable binary, works on most distributions
  linux: {
    target: [{ target: "dir" }, { target: "AppImage" }],
    category: "Development",
    synopsis: "Portable local-first coding-agent platform",
    description:
      "CodingAgent — a portable, local-first coding-agent desktop application " +
      "for catalog management, host detection, compatibility evaluation, " +
      "install planning, and workflow orchestration.",
  },

  // AppImage-specific settings
  appImage: {
    // Include the system-level desktop integration prompt
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },

  // macOS — dmg is the standard distributable disk image
  mac: {
    target: [{ target: "dir" }, { target: "dmg" }],
    category: "public.app-category.developer-tools",
    // No code signing in this phase
    identity: null,
  },

  // dmg-specific settings
  dmg: {
    // Keep defaults — drag-to-Applications layout
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },

  // Windows — nsis is the standard graphical installer
  win: {
    target: [{ target: "dir" }, { target: "nsis" }],
  },

  // nsis-specific settings
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
  },

  // --- Artifact naming (for dir and other generic targets) ---
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",

  // Disable publishing (local builds only)
  publish: null,

  // Disable auto-update
  // (electron-updater is not included)
};

module.exports = config;
