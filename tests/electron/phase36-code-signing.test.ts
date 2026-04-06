/**
 * Phase 36 — Code-signing strategy and desktop release polish tests.
 *
 * Validates:
 * - Signing-related config presence and behavior in electron/config.cjs
 * - Environment-driven signing in electron-builder.config.js
 * - Artifact naming / version consistency
 * - Desktop metadata consistency
 * - Docs alignment for release/signing statements
 *
 * These are deterministic smoke tests — they do NOT perform actual signing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronConfig = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const {
  SIGNING_ENV_VARS,
  getSigningConfig,
  isSigningConfigured,
  getReleaseReadiness,
  APP_TITLE,
  getDesktopVersion,
  getInstallerTargets,
  getIconPath,
} = electronConfig;

const ROOT = resolve(process.cwd());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(relPath: string): Record<string, unknown> {
  const fullPath = resolve(ROOT, relPath);
  return JSON.parse(readFileSync(fullPath, "utf-8"));
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(ROOT, relPath));
}

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

async function loadBuilderConfig(): Promise<Record<string, unknown>> {
  return import(resolve(ROOT, "electron-builder.config.js")).then(
    (m) => m.default ?? m,
  );
}

// ---------------------------------------------------------------------------
// 1. SIGNING_ENV_VARS map
// ---------------------------------------------------------------------------

describe("Phase 36 — SIGNING_ENV_VARS", () => {
  it("is a plain object", () => {
    expect(typeof SIGNING_ENV_VARS).toBe("object");
    expect(SIGNING_ENV_VARS).not.toBeNull();
  });

  it("defines darwin signing variables", () => {
    expect(Array.isArray(SIGNING_ENV_VARS.darwin)).toBe(true);
    expect(SIGNING_ENV_VARS.darwin.length).toBeGreaterThanOrEqual(2);
    expect(SIGNING_ENV_VARS.darwin).toContain("CSC_LINK");
    expect(SIGNING_ENV_VARS.darwin).toContain("CSC_KEY_PASSWORD");
  });

  it("defines win32 signing variables", () => {
    expect(Array.isArray(SIGNING_ENV_VARS.win32)).toBe(true);
    expect(SIGNING_ENV_VARS.win32.length).toBeGreaterThanOrEqual(2);
    expect(SIGNING_ENV_VARS.win32).toContain("CSC_LINK");
    expect(SIGNING_ENV_VARS.win32).toContain("CSC_KEY_PASSWORD");
  });

  it("defines linux signing variables", () => {
    expect(Array.isArray(SIGNING_ENV_VARS.linux)).toBe(true);
    expect(SIGNING_ENV_VARS.linux.length).toBeGreaterThanOrEqual(1);
  });

  it("darwin includes Apple notarization variables", () => {
    expect(SIGNING_ENV_VARS.darwin).toContain("APPLE_ID");
    expect(SIGNING_ENV_VARS.darwin).toContain("APPLE_APP_SPECIFIC_PASSWORD");
    expect(SIGNING_ENV_VARS.darwin).toContain("APPLE_TEAM_ID");
  });

  it("win32 includes platform-specific override variables", () => {
    expect(SIGNING_ENV_VARS.win32).toContain("WIN_CSC_LINK");
    expect(SIGNING_ENV_VARS.win32).toContain("WIN_CSC_KEY_PASSWORD");
  });

  it("all values are arrays of strings", () => {
    for (const [key, value] of Object.entries(SIGNING_ENV_VARS)) {
      expect(Array.isArray(value), `${key} should be an array`).toBe(true);
      for (const v of value as string[]) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. getSigningConfig()
// ---------------------------------------------------------------------------

describe("Phase 36 — getSigningConfig()", () => {
  // Save and restore env vars to avoid test pollution
  const savedEnv: Record<string, string | undefined> = {};
  const signingVars = [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
    "GPG_KEY_ID",
  ];

  beforeEach(() => {
    for (const v of signingVars) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of signingVars) {
      if (savedEnv[v] !== undefined) {
        process.env[v] = savedEnv[v];
      } else {
        delete process.env[v];
      }
    }
  });

  it("returns an object with expected shape", () => {
    const result = getSigningConfig("darwin");
    expect(result).toHaveProperty("platform");
    expect(result).toHaveProperty("configured");
    expect(result).toHaveProperty("active");
    expect(result).toHaveProperty("envVars");
    expect(result).toHaveProperty("summary");
  });

  it("reports not configured when no env vars are set (darwin)", () => {
    const result = getSigningConfig("darwin");
    expect(result.platform).toBe("darwin");
    expect(result.configured).toBe(false);
    expect(result.active).toBe(false);
    expect(result.summary).toContain("not configured");
    expect(result.summary).toContain("CSC_LINK");
  });

  it("reports not configured when no env vars are set (win32)", () => {
    const result = getSigningConfig("win32");
    expect(result.platform).toBe("win32");
    expect(result.configured).toBe(false);
    expect(result.active).toBe(false);
  });

  it("reports not configured for linux when GPG_KEY_ID is not set", () => {
    const result = getSigningConfig("linux");
    expect(result.platform).toBe("linux");
    expect(result.configured).toBe(false);
  });

  it("reports configured when CSC_LINK is set (darwin)", () => {
    process.env.CSC_LINK = "/path/to/cert.p12";
    const result = getSigningConfig("darwin");
    expect(result.configured).toBe(true);
  });

  it("reports configured when CSC_LINK is set (win32)", () => {
    process.env.CSC_LINK = "/path/to/cert.pfx";
    const result = getSigningConfig("win32");
    expect(result.configured).toBe(true);
  });

  it("reports configured when GPG_KEY_ID is set (linux)", () => {
    process.env.GPG_KEY_ID = "ABCD1234";
    const result = getSigningConfig("linux");
    expect(result.configured).toBe(true);
  });

  it("reports active only when configured AND on matching platform", () => {
    // Set the first signing env var for the current platform
    const currentPlatform = process.platform;
    const vars = SIGNING_ENV_VARS[currentPlatform];
    if (vars && vars.length > 0) {
      process.env[vars[0]] = "/fake/value";
      const result = getSigningConfig(currentPlatform);
      expect(result.configured).toBe(true);
      expect(result.active).toBe(true);
      expect(result.summary).toContain("active");
      delete process.env[vars[0]];
    }
  });

  it("reports inactive when configured for non-host platform", () => {
    process.env.CSC_LINK = "/path/to/cert.p12";
    // Pick a platform different from the current one
    const otherPlatform = process.platform === "darwin" ? "win32" : "darwin";
    const result = getSigningConfig(otherPlatform);
    expect(result.configured).toBe(true);
    expect(result.active).toBe(false);
    expect(result.summary).toContain("inactive");
  });

  it("envVars array has expected items for darwin", () => {
    const result = getSigningConfig("darwin");
    expect(result.envVars.length).toBe(SIGNING_ENV_VARS.darwin.length);
    for (const entry of result.envVars) {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("present");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.present).toBe("boolean");
    }
  });

  it("envVars.present reflects actual env state", () => {
    process.env.CSC_LINK = "test-value";
    const result = getSigningConfig("darwin");
    const cscEntry = result.envVars.find(
      (e: { name: string }) => e.name === "CSC_LINK",
    );
    expect(cscEntry).toBeDefined();
    expect(cscEntry.present).toBe(true);

    const appleEntry = result.envVars.find(
      (e: { name: string }) => e.name === "APPLE_ID",
    );
    expect(appleEntry).toBeDefined();
    expect(appleEntry.present).toBe(false);
  });

  it("returns sensible summary for unknown platform", () => {
    const result = getSigningConfig("freebsd");
    expect(result.platform).toBe("freebsd");
    expect(result.configured).toBe(false);
    expect(result.envVars).toHaveLength(0);
    expect(result.summary).toContain("No signing variables");
  });

  it("defaults to process.platform when no arg given", () => {
    const result = getSigningConfig();
    expect(result.platform).toBe(process.platform);
  });

  it("empty string env var is treated as not present", () => {
    process.env.CSC_LINK = "";
    const result = getSigningConfig("darwin");
    expect(result.configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. isSigningConfigured()
// ---------------------------------------------------------------------------

describe("Phase 36 — isSigningConfigured()", () => {
  const savedCscLink = process.env.CSC_LINK;

  beforeEach(() => {
    delete process.env.CSC_LINK;
  });

  afterEach(() => {
    if (savedCscLink !== undefined) {
      process.env.CSC_LINK = savedCscLink;
    } else {
      delete process.env.CSC_LINK;
    }
  });

  it("returns false when no creds are set", () => {
    expect(isSigningConfigured("darwin")).toBe(false);
    expect(isSigningConfigured("win32")).toBe(false);
  });

  it("returns true when CSC_LINK is set", () => {
    process.env.CSC_LINK = "test";
    expect(isSigningConfigured("darwin")).toBe(true);
    expect(isSigningConfigured("win32")).toBe(true);
  });

  it("returns boolean type", () => {
    expect(typeof isSigningConfigured("darwin")).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// 4. getReleaseReadiness()
// ---------------------------------------------------------------------------

describe("Phase 36 — getReleaseReadiness()", () => {
  const savedCscLink = process.env.CSC_LINK;

  beforeEach(() => {
    delete process.env.CSC_LINK;
  });

  afterEach(() => {
    if (savedCscLink !== undefined) {
      process.env.CSC_LINK = savedCscLink;
    } else {
      delete process.env.CSC_LINK;
    }
  });

  it("returns expected shape", () => {
    const r = getReleaseReadiness();
    expect(r).toHaveProperty("version");
    expect(r).toHaveProperty("productName");
    expect(r).toHaveProperty("signing");
    expect(r).toHaveProperty("icon");
    expect(r).toHaveProperty("artifactNaming");
    expect(r).toHaveProperty("unsignedWarning");
  });

  it("version matches getDesktopVersion()", () => {
    const r = getReleaseReadiness();
    expect(r.version).toBe(getDesktopVersion());
  });

  it("productName matches APP_TITLE", () => {
    const r = getReleaseReadiness();
    expect(r.productName).toBe(APP_TITLE);
  });

  it("signing section reports not configured when no creds set", () => {
    const r = getReleaseReadiness();
    expect(r.signing.configured).toBe(false);
    expect(r.signing.active).toBe(false);
    expect(typeof r.signing.summary).toBe("string");
  });

  it("icon section reports presence status", () => {
    const r = getReleaseReadiness();
    expect(typeof r.icon.present).toBe("boolean");
    // icon.present must be consistent with getIconPath()
    const actualIconPath = getIconPath();
    expect(r.icon.present).toBe(actualIconPath !== null);
    expect(r.icon.path).toBe(actualIconPath);
  });

  it("artifact naming contains template variables", () => {
    const r = getReleaseReadiness();
    expect(r.artifactNaming).toContain("productName");
    expect(r.artifactNaming).toContain("version");
  });

  it("unsignedWarning mentions OS warnings when not signed", () => {
    const r = getReleaseReadiness();
    expect(r.unsignedWarning).toContain("UNSIGNED");
    expect(r.unsignedWarning).toContain("macOS");
    expect(r.unsignedWarning).toContain("Windows");
  });

  it("unsignedWarning changes when signing is active", () => {
    // Simulate signing active for current platform by setting its first env var
    const vars = SIGNING_ENV_VARS[process.platform];
    if (vars && vars.length > 0) {
      process.env[vars[0]] = "/fake/cert";
      const r = getReleaseReadiness();
      // When signing is active for current platform, warning should say "signed"
      expect(r.unsignedWarning).toContain("signed");
      delete process.env[vars[0]];
    } else {
      // No signing vars for this platform — unsigned warning should mention UNSIGNED
      const r = getReleaseReadiness();
      expect(r.unsignedWarning).toContain("UNSIGNED");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. electron-builder.config.js signing readiness
// ---------------------------------------------------------------------------

describe("Phase 36 — electron-builder.config.js signing config", () => {
  it("builder config file exists", () => {
    expect(fileExists("electron-builder.config.js")).toBe(true);
  });

  it("mac section has identity field", async () => {
    const config = await loadBuilderConfig();
    const mac = config.mac as Record<string, unknown>;
    expect(mac).toBeDefined();
    expect("identity" in mac).toBe(true);
  });

  it("mac identity is null when CSC_LINK is not set", async () => {
    // In test environment, CSC_LINK is not set
    const config = await loadBuilderConfig();
    const mac = config.mac as Record<string, unknown>;
    if (!process.env.CSC_LINK) {
      expect(mac.identity).toBeNull();
    }
  });

  it("mac section has notarize field", async () => {
    const config = await loadBuilderConfig();
    const mac = config.mac as Record<string, unknown>;
    expect("notarize" in mac).toBe(true);
  });

  it("notarize is false when Apple creds are not set", async () => {
    const config = await loadBuilderConfig();
    const mac = config.mac as Record<string, unknown>;
    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
      expect(mac.notarize).toBe(false);
    }
  });

  it("win section exists", async () => {
    const config = await loadBuilderConfig();
    expect(config.win).toBeDefined();
  });

  it("config header mentions code signing", () => {
    const content = readFile("electron-builder.config.js");
    expect(content).toContain("Code signing");
    expect(content).toContain("CSC_LINK");
  });
});

// ---------------------------------------------------------------------------
// 6. Artifact naming / version consistency
// ---------------------------------------------------------------------------

describe("Phase 36 — Artifact naming and version consistency", () => {
  it("package.json version matches config version", () => {
    const pkg = readJson("package.json");
    expect(pkg.version).toBe(getDesktopVersion());
  });

  it("productName in builder config matches APP_TITLE", async () => {
    const config = await loadBuilderConfig();
    expect(config.productName).toBe(APP_TITLE);
  });

  it("appId follows reverse-domain convention", async () => {
    const config = await loadBuilderConfig();
    expect(typeof config.appId).toBe("string");
    expect((config.appId as string).includes(".")).toBe(true);
    expect((config.appId as string).toLowerCase()).toContain("codingagent");
  });

  it("artifact naming templates include version and arch", async () => {
    const config = await loadBuilderConfig();
    const naming = config.artifactName as string;
    expect(naming).toContain("${version}");
    expect(naming).toContain("${arch}");
    expect(naming).toContain("${productName}");
  });

  it("installer targets include version-based naming for all platforms", async () => {
    for (const plat of ["linux", "darwin", "win32"] as const) {
      const target = getInstallerTargets(plat);
      expect(target.platform).toBe(plat);
      expect(typeof target.ext).toBe("string");
      expect(target.ext.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Desktop metadata consistency
// ---------------------------------------------------------------------------

describe("Phase 36 — Desktop metadata consistency", () => {
  it("package.json has productName-compatible name field", () => {
    const pkg = readJson("package.json");
    expect(typeof pkg.name).toBe("string");
    expect((pkg.name as string).length).toBeGreaterThan(0);
  });

  it("package.json has a valid version", () => {
    const pkg = readJson("package.json");
    expect(typeof pkg.version).toBe("string");
    const semverRegex = /^\d+\.\d+\.\d+/;
    expect(semverRegex.test(pkg.version as string)).toBe(true);
  });

  it("package.json has description", () => {
    const pkg = readJson("package.json");
    expect(typeof pkg.description).toBe("string");
    expect((pkg.description as string).length).toBeGreaterThan(10);
  });

  it("package.json has MIT license", () => {
    const pkg = readJson("package.json");
    expect(pkg.license).toBe("MIT");
  });

  it("electron-builder extraMetadata points to main.cjs", async () => {
    const config = await loadBuilderConfig();
    const meta = config.extraMetadata as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(meta.main).toBe("electron/main.cjs");
  });

  it("linux metadata includes category and synopsis", async () => {
    const config = await loadBuilderConfig();
    const linux = config.linux as Record<string, unknown>;
    expect(linux.category).toBe("Development");
    expect(typeof linux.synopsis).toBe("string");
    expect((linux.synopsis as string).length).toBeGreaterThan(0);
  });

  it("mac metadata includes category", async () => {
    const config = await loadBuilderConfig();
    const mac = config.mac as Record<string, unknown>;
    expect(typeof mac.category).toBe("string");
    expect((mac.category as string).includes("developer")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Docs alignment for release/signing statements
// ---------------------------------------------------------------------------

describe("Phase 36 — Docs alignment", () => {
  it("CODE-SIGNING.md exists", () => {
    expect(fileExists("docs/CODE-SIGNING.md")).toBe(true);
  });

  it("CODE-SIGNING.md mentions all three platforms", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("macOS");
    expect(content).toContain("Windows");
    expect(content).toContain("Linux");
  });

  it("CODE-SIGNING.md mentions CSC_LINK", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("CSC_LINK");
  });

  it("CODE-SIGNING.md mentions Gatekeeper and SmartScreen", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("Gatekeeper");
    expect(content).toContain("SmartScreen");
  });

  it("CODE-SIGNING.md mentions unsigned behavior", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("unsigned");
    expect(content).toContain("Unsigned");
  });

  it("CODE-SIGNING.md mentions getSigningConfig", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("getSigningConfig");
  });

  it("CODE-SIGNING.md mentions remaining steps", () => {
    const content = readFile("docs/CODE-SIGNING.md");
    expect(content).toContain("remains");
    expect(content).toContain("certificates");
  });

  it("ELECTRON.md mentions Phase 36", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("Phase 36");
  });

  it("ELECTRON.md has signing readiness section", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("Code Signing Readiness");
    expect(content).toContain("CSC_LINK");
  });

  it("ELECTRON.md references CODE-SIGNING.md", () => {
    const content = readFile("docs/ELECTRON.md");
    expect(content).toContain("CODE-SIGNING.md");
  });

  it("PACKAGING.md mentions Phase 36", () => {
    const content = readFile("docs/PACKAGING.md");
    expect(content).toContain("Phase 36");
  });

  it("PACKAGING.md mentions signing readiness", () => {
    const content = readFile("docs/PACKAGING.md");
    expect(content).toContain("signing readiness");
  });

  it("CHANGELOG.md mentions Phase 36", () => {
    const content = readFile("CHANGELOG.md");
    expect(content).toContain("Phase 36");
  });

  it("CHANGELOG.md mentions getSigningConfig", () => {
    const content = readFile("CHANGELOG.md");
    expect(content).toContain("getSigningConfig");
  });

  it("CHANGELOG.md mentions no fake signing", () => {
    const content = readFile("CHANGELOG.md");
    expect(content).toContain("No fake signing");
  });
});

// ---------------------------------------------------------------------------
// 9. Integration: signing + installer targets consistency
// ---------------------------------------------------------------------------

describe("Phase 36 — Signing and installer target integration", () => {
  it("darwin installer target mentions unsigned when not signed", () => {
    const target = getInstallerTargets("darwin");
    // The description should mention unsigned status
    expect(target.description.toLowerCase()).toContain("unsigned");
  });

  it("win32 installer target mentions unsigned when not signed", () => {
    const target = getInstallerTargets("win32");
    expect(target.description.toLowerCase()).toContain("unsigned");
  });

  it("signing config platforms align with installer target platforms", () => {
    const signingPlatforms = Object.keys(SIGNING_ENV_VARS).sort();
    // All signing platforms should have installer targets
    for (const plat of signingPlatforms) {
      const target = getInstallerTargets(plat);
      expect(target.platform).toBe(plat);
    }
  });

  it("release readiness version matches package.json", () => {
    const pkg = readJson("package.json");
    const r = getReleaseReadiness();
    expect(r.version).toBe(pkg.version);
  });

  it("release readiness product name matches builder config", async () => {
    const config = await loadBuilderConfig();
    const r = getReleaseReadiness();
    expect(r.productName).toBe(config.productName);
  });
});

// ---------------------------------------------------------------------------
// 10. Config module exports completeness
// ---------------------------------------------------------------------------

describe("Phase 36 — Config module exports", () => {
  it("exports SIGNING_ENV_VARS", () => {
    expect(electronConfig.SIGNING_ENV_VARS).toBeDefined();
  });

  it("exports getSigningConfig", () => {
    expect(typeof electronConfig.getSigningConfig).toBe("function");
  });

  it("exports isSigningConfigured", () => {
    expect(typeof electronConfig.isSigningConfigured).toBe("function");
  });

  it("exports getReleaseReadiness", () => {
    expect(typeof electronConfig.getReleaseReadiness).toBe("function");
  });

  it("all pre-existing exports still present", () => {
    // Phase 31-35 exports should still be available
    const expectedExports = [
      "DEFAULT_WIDTH",
      "DEFAULT_HEIGHT",
      "MIN_WIDTH",
      "MIN_HEIGHT",
      "APP_TITLE",
      "SERVER_START_TIMEOUT_MS",
      "GRACEFUL_KILL_TIMEOUT_MS",
      "SECURITY_DEFAULTS",
      "getDesktopVersion",
      "buildWindowTitle",
      "getIconPlaceholderPath",
      "isLocalUrl",
      "buildLocalUrl",
      "renderLoadingHtml",
      "renderErrorHtml",
      "isPackaged",
      "getAppRoot",
      "getServerLaunchConfig",
      "getPreloadPath",
      "getRequiredPackagedFiles",
      "getRequiredPackagedDirs",
      "escapeHtml",
      "validatePackagedRuntime",
      "buildEnvironmentSummary",
      "getIconPath",
      "getInstallerTargets",
    ];
    for (const name of expectedExports) {
      expect(
        electronConfig[name] !== undefined,
        `expected export "${name}" to be defined`,
      ).toBe(true);
    }
  });
});
