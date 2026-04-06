/**
 * Phase 37 — Desktop release polish / public beta readiness tests.
 *
 * Validates:
 *   - Desktop metadata consistency (product identity, naming, appId)
 *   - Icon config/path sanity
 *   - Artifact naming patterns
 *   - Beta metadata and labeling
 *   - Known limitations list integrity
 *   - No regression in existing wrapper/installer assumptions
 *   - Docs-aligned beta release flow expectations
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

const config = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const ROOT = resolve(process.cwd());

function loadElectronBuilderConfig() {
  return import(resolve(ROOT, "electron-builder.config.js")).then(
    (m) => m.default ?? m,
  );
}

// ---------------------------------------------------------------------------
// Product identity
// ---------------------------------------------------------------------------

describe("Phase 37 — Product identity", () => {
  it("exports PRODUCT_APP_ID as a reverse-domain string", () => {
    expect(config.PRODUCT_APP_ID).toBe("com.codingagent.desktop");
    expect(config.PRODUCT_APP_ID).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
  });

  it("exports PRODUCT_NAME matching APP_TITLE", () => {
    expect(config.PRODUCT_NAME).toBe("CodingAgent");
    expect(config.PRODUCT_NAME).toBe(config.APP_TITLE);
  });

  it("exports PRODUCT_DESCRIPTION as a non-empty string", () => {
    expect(typeof config.PRODUCT_DESCRIPTION).toBe("string");
    expect(config.PRODUCT_DESCRIPTION.length).toBeGreaterThan(20);
    expect(config.PRODUCT_DESCRIPTION).toContain("coding-agent");
  });

  it("getProductIdentity() returns consistent metadata", () => {
    const identity = config.getProductIdentity();
    expect(identity.appId).toBe(config.PRODUCT_APP_ID);
    expect(identity.productName).toBe(config.PRODUCT_NAME);
    expect(identity.appTitle).toBe(config.APP_TITLE);
    expect(identity.description).toBe(config.PRODUCT_DESCRIPTION);
  });

  it("getProductIdentity() appTitle equals productName", () => {
    const identity = config.getProductIdentity();
    expect(identity.appTitle).toBe(identity.productName);
  });
});

// ---------------------------------------------------------------------------
// Beta labeling
// ---------------------------------------------------------------------------

describe("Phase 37 — Beta labeling", () => {
  it("getBetaLabel() returns 'beta' with no options", () => {
    expect(config.getBetaLabel()).toBe("beta");
  });

  it("getBetaLabel() returns 'beta' with empty options", () => {
    expect(config.getBetaLabel({})).toBe("beta");
  });

  it("getBetaLabel() returns 'beta.N' with betaNumber", () => {
    expect(config.getBetaLabel({ betaNumber: 1 })).toBe("beta.1");
    expect(config.getBetaLabel({ betaNumber: 5 })).toBe("beta.5");
    expect(config.getBetaLabel({ betaNumber: 42 })).toBe("beta.42");
  });

  it("getBetaLabel() returns 'beta' for zero or negative betaNumber", () => {
    expect(config.getBetaLabel({ betaNumber: 0 })).toBe("beta");
    expect(config.getBetaLabel({ betaNumber: -1 })).toBe("beta");
  });

  it("getBetaVersion() returns version-beta", () => {
    const version = config.getDesktopVersion();
    expect(config.getBetaVersion()).toBe(`${version}-beta`);
  });

  it("getBetaVersion() returns version-beta.N with betaNumber", () => {
    const version = config.getDesktopVersion();
    expect(config.getBetaVersion({ betaNumber: 3 })).toBe(`${version}-beta.3`);
  });

  it("getBetaVersion() base matches getDesktopVersion()", () => {
    const betaVersion = config.getBetaVersion();
    expect(betaVersion.startsWith(config.getDesktopVersion())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Beta metadata
// ---------------------------------------------------------------------------

describe("Phase 37 — Beta metadata", () => {
  it("getBetaMetadata() returns all expected fields", () => {
    const meta = config.getBetaMetadata();
    expect(meta).toHaveProperty("version");
    expect(meta).toHaveProperty("betaVersion");
    expect(meta).toHaveProperty("betaLabel");
    expect(meta).toHaveProperty("productIdentity");
    expect(meta).toHaveProperty("signing");
    expect(meta).toHaveProperty("icon");
    expect(meta).toHaveProperty("knownLimitations");
    expect(meta).toHaveProperty("artifactNaming");
    expect(meta).toHaveProperty("platforms");
  });

  it("getBetaMetadata() version matches getDesktopVersion()", () => {
    const meta = config.getBetaMetadata();
    expect(meta.version).toBe(config.getDesktopVersion());
  });

  it("getBetaMetadata() betaVersion is correctly formatted", () => {
    const meta = config.getBetaMetadata();
    expect(meta.betaVersion).toBe(`${meta.version}-beta`);
  });

  it("getBetaMetadata() with betaNumber decorates correctly", () => {
    const meta = config.getBetaMetadata({ betaNumber: 7 });
    expect(meta.betaVersion).toBe(`${meta.version}-beta.7`);
    expect(meta.betaLabel).toBe("beta.7");
  });

  it("getBetaMetadata() productIdentity is consistent", () => {
    const meta = config.getBetaMetadata();
    const identity = config.getProductIdentity();
    expect(meta.productIdentity).toEqual(identity);
  });

  it("getBetaMetadata() signing has expected shape", () => {
    const meta = config.getBetaMetadata();
    expect(meta.signing).toHaveProperty("configured");
    expect(meta.signing).toHaveProperty("active");
    expect(meta.signing).toHaveProperty("summary");
    expect(typeof meta.signing.configured).toBe("boolean");
    expect(typeof meta.signing.active).toBe("boolean");
    expect(typeof meta.signing.summary).toBe("string");
  });

  it("getBetaMetadata() icon has expected shape", () => {
    const meta = config.getBetaMetadata();
    expect(meta.icon).toHaveProperty("present");
    expect(meta.icon).toHaveProperty("path");
    expect(meta.icon).toHaveProperty("placeholderPath");
    expect(meta.icon).toHaveProperty("supportedFormats");
    expect(typeof meta.icon.present).toBe("boolean");
    expect(Array.isArray(meta.icon.supportedFormats)).toBe(true);
  });

  it("getBetaMetadata() icon supportedFormats includes png/icns/ico", () => {
    const meta = config.getBetaMetadata();
    expect(meta.icon.supportedFormats).toContain("png");
    expect(meta.icon.supportedFormats).toContain("icns");
    expect(meta.icon.supportedFormats).toContain("ico");
  });

  it("getBetaMetadata() knownLimitations is a non-empty array of strings", () => {
    const meta = config.getBetaMetadata();
    expect(Array.isArray(meta.knownLimitations)).toBe(true);
    expect(meta.knownLimitations.length).toBeGreaterThan(0);
    for (const lim of meta.knownLimitations) {
      expect(typeof lim).toBe("string");
      expect(lim.length).toBeGreaterThan(10);
    }
  });

  it("getBetaMetadata() artifactNaming has all platform patterns", () => {
    const meta = config.getBetaMetadata();
    expect(meta.artifactNaming).toHaveProperty("generic");
    expect(meta.artifactNaming).toHaveProperty("appImage");
    expect(meta.artifactNaming).toHaveProperty("dmg");
    expect(meta.artifactNaming).toHaveProperty("nsis");
  });

  it("getBetaMetadata() platforms covers linux/darwin/win32", () => {
    const meta = config.getBetaMetadata();
    expect(meta.platforms.linux).toBe("AppImage");
    expect(meta.platforms.darwin).toBe("dmg");
    expect(meta.platforms.win32).toBe("nsis");
  });
});

// ---------------------------------------------------------------------------
// Icon configuration
// ---------------------------------------------------------------------------

describe("Phase 37 — Icon configuration", () => {
  it("exports SUPPORTED_ICON_FORMATS as an array", () => {
    expect(Array.isArray(config.SUPPORTED_ICON_FORMATS)).toBe(true);
    expect(config.SUPPORTED_ICON_FORMATS).toContain("png");
    expect(config.SUPPORTED_ICON_FORMATS).toContain("icns");
    expect(config.SUPPORTED_ICON_FORMATS).toContain("ico");
  });

  it("getIconConfig() returns expected shape", () => {
    const ic = config.getIconConfig();
    expect(ic).toHaveProperty("present");
    expect(ic).toHaveProperty("path");
    expect(ic).toHaveProperty("placeholderPath");
    expect(ic).toHaveProperty("supportedFormats");
    expect(ic).toHaveProperty("recommendation");
    expect(typeof ic.present).toBe("boolean");
    expect(typeof ic.placeholderPath).toBe("string");
    expect(typeof ic.recommendation).toBe("string");
  });

  it("getIconConfig() placeholderPath is under assets/", () => {
    const ic = config.getIconConfig();
    expect(ic.placeholderPath).toContain("assets");
    expect(ic.placeholderPath).toContain("icon.png");
  });

  it("getIconConfig() recommendation is non-empty", () => {
    const ic = config.getIconConfig();
    expect(ic.recommendation.length).toBeGreaterThan(10);
  });

  it("getIconConfig() supportedFormats matches SUPPORTED_ICON_FORMATS", () => {
    const ic = config.getIconConfig();
    expect(ic.supportedFormats).toEqual(config.SUPPORTED_ICON_FORMATS);
  });

  it("getIconConfig() present is false when no icon file exists", () => {
    // In the test environment, assets/icon.png does not exist
    const ic = config.getIconConfig();
    expect(ic.present).toBe(false);
    expect(ic.path).toBeNull();
  });

  it("getIconConfig() recommendation suggests placing icon when absent", () => {
    const ic = config.getIconConfig();
    if (!ic.present) {
      expect(ic.recommendation).toContain("512×512");
      expect(ic.recommendation).toContain("PNG");
    }
  });

  it("getIconPlaceholderPath() points to assets/icon.png", () => {
    const p = config.getIconPlaceholderPath();
    expect(p.endsWith("icon.png")).toBe(true);
    expect(p).toContain("assets");
  });
});

// ---------------------------------------------------------------------------
// Desktop metadata validation
// ---------------------------------------------------------------------------

describe("Phase 37 — Desktop metadata validation", () => {
  it("validateDesktopMetadata() passes with current config", () => {
    const result = config.validateDesktopMetadata();
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checked.length).toBeGreaterThan(0);
  });

  it("validateDesktopMetadata() checks product name consistency", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("APP_TITLE matches PRODUCT_NAME");
  });

  it("validateDesktopMetadata() checks version format", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("version is semver-like");
  });

  it("validateDesktopMetadata() checks appId format", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("appId is reverse-domain format");
  });

  it("validateDesktopMetadata() checks icon path", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("icon placeholder path is under assets/");
  });

  it("validateDesktopMetadata() checks product description", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("product description is non-empty");
  });

  it("validateDesktopMetadata() checks known limitations", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked).toContain("known limitations list is non-empty");
  });

  it("validateDesktopMetadata() returns checked as non-empty array", () => {
    const result = config.validateDesktopMetadata();
    expect(result.checked.length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Artifact naming validation
// ---------------------------------------------------------------------------

describe("Phase 37 — Artifact naming validation", () => {
  it("validateArtifactNaming() passes with current config", () => {
    const result = config.validateArtifactNaming();
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("validateArtifactNaming() checks generic pattern", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked.some((c: string) => c.includes("generic"))).toBe(true);
  });

  it("validateArtifactNaming() checks appImage pattern", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked.some((c: string) => c.includes("appImage"))).toBe(true);
  });

  it("validateArtifactNaming() checks dmg pattern", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked.some((c: string) => c.includes("dmg"))).toBe(true);
  });

  it("validateArtifactNaming() checks nsis pattern", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked.some((c: string) => c.includes("nsis"))).toBe(true);
  });

  it("validateArtifactNaming() verifies nsis has Setup in name", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked).toContain("nsis pattern includes 'Setup'");
  });

  it("validateArtifactNaming() returns checked with multiple entries", () => {
    const result = config.validateArtifactNaming();
    expect(result.checked.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Known limitations
// ---------------------------------------------------------------------------

describe("Phase 37 — Beta known limitations", () => {
  it("BETA_KNOWN_LIMITATIONS is an array of strings", () => {
    expect(Array.isArray(config.BETA_KNOWN_LIMITATIONS)).toBe(true);
    for (const lim of config.BETA_KNOWN_LIMITATIONS) {
      expect(typeof lim).toBe("string");
    }
  });

  it("BETA_KNOWN_LIMITATIONS has at least 5 entries", () => {
    expect(config.BETA_KNOWN_LIMITATIONS.length).toBeGreaterThanOrEqual(5);
  });

  it("BETA_KNOWN_LIMITATIONS mentions unsigned builds", () => {
    const text = config.BETA_KNOWN_LIMITATIONS.join(" ");
    expect(text.toLowerCase()).toContain("unsigned");
  });

  it("BETA_KNOWN_LIMITATIONS mentions no auto-update", () => {
    const text = config.BETA_KNOWN_LIMITATIONS.join(" ");
    expect(text.toLowerCase()).toContain("auto-update");
  });

  it("BETA_KNOWN_LIMITATIONS mentions no custom icon", () => {
    const text = config.BETA_KNOWN_LIMITATIONS.join(" ");
    expect(text.toLowerCase()).toContain("icon");
  });

  it("BETA_KNOWN_LIMITATIONS mentions startup delay", () => {
    const text = config.BETA_KNOWN_LIMITATIONS.join(" ");
    expect(text.toLowerCase()).toContain("startup delay");
  });
});

// ---------------------------------------------------------------------------
// No regression — existing Phase 31-36 exports still work
// ---------------------------------------------------------------------------

describe("Phase 37 — No regression in existing exports", () => {
  it("still exports APP_TITLE", () => {
    expect(config.APP_TITLE).toBe("CodingAgent");
  });

  it("still exports window dimension constants", () => {
    expect(config.DEFAULT_WIDTH).toBe(1280);
    expect(config.DEFAULT_HEIGHT).toBe(860);
    expect(config.MIN_WIDTH).toBe(800);
    expect(config.MIN_HEIGHT).toBe(600);
  });

  it("still exports SECURITY_DEFAULTS", () => {
    expect(config.SECURITY_DEFAULTS.nodeIntegration).toBe(false);
    expect(config.SECURITY_DEFAULTS.contextIsolation).toBe(true);
    expect(config.SECURITY_DEFAULTS.sandbox).toBe(true);
  });

  it("still exports getDesktopVersion()", () => {
    const version = config.getDesktopVersion();
    expect(typeof version).toBe("string");
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("still exports buildWindowTitle()", () => {
    const title = config.buildWindowTitle();
    expect(title).toContain("CodingAgent");
    expect(title).toContain("v");
  });

  it("still exports renderLoadingHtml()", () => {
    const html = config.renderLoadingHtml();
    expect(html).toContain("CodingAgent");
    expect(html).toContain("Starting");
  });

  it("still exports renderErrorHtml()", () => {
    const html = config.renderErrorHtml("test error");
    expect(html).toContain("test error");
    expect(html).toContain("CodingAgent");
  });

  it("still exports isPackaged()", () => {
    expect(typeof config.isPackaged()).toBe("boolean");
  });

  it("still exports getServerLaunchConfig()", () => {
    const lc = config.getServerLaunchConfig();
    expect(lc).toHaveProperty("command");
    expect(lc).toHaveProperty("args");
    expect(lc).toHaveProperty("serverScript");
  });

  it("still exports getSigningConfig()", () => {
    const sc = config.getSigningConfig();
    expect(sc).toHaveProperty("platform");
    expect(sc).toHaveProperty("configured");
    expect(sc).toHaveProperty("active");
  });

  it("still exports getReleaseReadiness()", () => {
    const rr = config.getReleaseReadiness();
    expect(rr).toHaveProperty("version");
    expect(rr).toHaveProperty("productName");
    expect(rr).toHaveProperty("signing");
    expect(rr).toHaveProperty("icon");
    expect(rr).toHaveProperty("unsignedWarning");
  });

  it("still exports getInstallerTargets()", () => {
    const targets = config.getInstallerTargets("linux");
    expect(targets.installerTarget).toBe("AppImage");
  });

  it("still exports SIGNING_ENV_VARS", () => {
    expect(config.SIGNING_ENV_VARS).toHaveProperty("darwin");
    expect(config.SIGNING_ENV_VARS).toHaveProperty("win32");
    expect(config.SIGNING_ENV_VARS).toHaveProperty("linux");
  });

  it("still exports validatePackagedRuntime()", () => {
    const result = config.validatePackagedRuntime();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("issues");
  });
});

// ---------------------------------------------------------------------------
// Metadata consistency with electron-builder.config.js
// ---------------------------------------------------------------------------

describe("Phase 37 — Metadata consistency with electron-builder config", () => {
  it("appId matches PRODUCT_APP_ID", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.appId).toBe(config.PRODUCT_APP_ID);
  });

  it("productName matches PRODUCT_NAME", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.productName).toBe(config.PRODUCT_NAME);
  });

  it("electron-builder output directory is dist-electron", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.directories.output).toBe("dist-electron");
  });

  it("electron-builder main entry is electron/main.cjs", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.extraMetadata.main).toBe("electron/main.cjs");
  });

  it("linux target includes AppImage", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    const targets = ebConfig.linux.target.map((t: { target: string } | string) =>
      typeof t === "string" ? t : t.target
    );
    expect(targets).toContain("AppImage");
  });

  it("mac target includes dmg", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    const targets = ebConfig.mac.target.map((t: { target: string } | string) =>
      typeof t === "string" ? t : t.target
    );
    expect(targets).toContain("dmg");
  });

  it("win target includes nsis", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    const targets = ebConfig.win.target.map((t: { target: string } | string) =>
      typeof t === "string" ? t : t.target
    );
    expect(targets).toContain("nsis");
  });

  it("nsis artifactName includes Setup", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.nsis.artifactName).toContain("Setup");
  });

  it("publish is null (local builds only)", async () => {
    const ebConfig = await loadElectronBuilderConfig();
    expect(ebConfig.publish).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Metadata consistency with package.json
// ---------------------------------------------------------------------------

describe("Phase 37 — Metadata consistency with package.json", () => {
  const pkgPath = resolve(ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  it("package.json version matches getDesktopVersion()", () => {
    expect(pkg.version).toBe(config.getDesktopVersion());
  });

  it("package.json has desktop scripts", () => {
    expect(pkg.scripts["desktop"]).toBeDefined();
    expect(pkg.scripts["desktop:dev"]).toBeDefined();
    expect(pkg.scripts["desktop:build"]).toBeDefined();
    expect(pkg.scripts["desktop:pack"]).toBeDefined();
    expect(pkg.scripts["desktop:installer"]).toBeDefined();
  });

  it("package.json has electron as devDependency", () => {
    expect(pkg.devDependencies["electron"]).toBeDefined();
  });

  it("package.json has electron-builder as devDependency", () => {
    expect(pkg.devDependencies["electron-builder"]).toBeDefined();
  });

  it("package.json engines requires Node >= 18", () => {
    expect(pkg.engines.node).toContain("18");
  });
});

// ---------------------------------------------------------------------------
// Documentation file existence
// ---------------------------------------------------------------------------

describe("Phase 37 — Documentation existence", () => {
  const docsDir = resolve(ROOT, "docs");

  it("BETA-TESTING.md exists", () => {
    expect(existsSync(resolve(docsDir, "BETA-TESTING.md"))).toBe(true);
  });

  it("BETA-TESTING.md is non-empty", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content.length).toBeGreaterThan(1000);
  });

  it("BETA-TESTING.md covers macOS unsigned guidance", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("Gatekeeper");
    expect(content).toContain("xattr");
  });

  it("BETA-TESTING.md covers Windows unsigned guidance", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("SmartScreen");
    expect(content).toContain("Run anyway");
  });

  it("BETA-TESTING.md covers Linux AppImage guidance", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("AppImage");
    expect(content).toContain("chmod +x");
  });

  it("BETA-TESTING.md covers first-run expectations", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content.toLowerCase()).toContain("first-run");
    expect(content).toContain("loading");
  });

  it("BETA-TESTING.md covers known limitations", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("known limitation");
    expect(content).toContain("unsigned");
    expect(content).toContain("auto-update");
  });

  it("BETA-TESTING.md covers beta release checklist", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("release checklist");
  });

  it("BETA-TESTING.md covers signed vs unsigned expectations", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("Signed vs unsigned");
  });

  it("BETA-TESTING.md covers reporting issues", () => {
    const content = readFileSync(resolve(docsDir, "BETA-TESTING.md"), "utf-8");
    expect(content).toContain("Reporting issues");
  });

  it("CODE-SIGNING.md exists", () => {
    expect(existsSync(resolve(docsDir, "CODE-SIGNING.md"))).toBe(true);
  });

  it("ELECTRON.md exists", () => {
    expect(existsSync(resolve(docsDir, "ELECTRON.md"))).toBe(true);
  });

  it("PACKAGING.md exists", () => {
    expect(existsSync(resolve(docsDir, "PACKAGING.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BETA-TESTING.md content depth
// ---------------------------------------------------------------------------

describe("Phase 37 — BETA-TESTING.md content depth", () => {
  const content = readFileSync(
    resolve(ROOT, "docs", "BETA-TESTING.md"),
    "utf-8"
  );

  it("includes per-platform sections for all 3 platforms", () => {
    expect(content).toContain("### Linux");
    expect(content).toContain("### macOS");
    expect(content).toContain("### Windows");
  });

  it("includes build commands reference table", () => {
    expect(content).toContain("desktop:pack");
    expect(content).toContain("desktop:build");
    expect(content).toContain("desktop:installer");
  });

  it("includes what-to-test checklist", () => {
    expect(content).toContain("What to test");
    expect(content).toContain("- [ ]");
  });

  it("includes issue reporting guidance", () => {
    expect(content).toContain("Steps to reproduce");
    expect(content).toContain("Expected behavior");
    expect(content).toContain("Actual behavior");
  });

  it("includes what remains before polished release", () => {
    expect(content).toContain("remains before");
    expect(content).toContain("Auto-update");
    expect(content).toContain("CI/CD");
  });

  it("includes prerequisites for building from source", () => {
    expect(content).toContain("Node.js");
    expect(content).toContain("npm install");
  });
});
