/**
 * Phase 35 — Installer generation / first distributable installer slice tests.
 *
 * Validates the installer target configuration in electron-builder.config.js,
 * the new desktop:installer build script, installer target metadata helpers,
 * and overall readiness for generating a real installable desktop artifact.
 *
 * These are deterministic smoke tests — they do NOT attempt to run a full
 * electron-builder build (that would require downloading Electron binaries
 * and platform-specific tooling).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronConfig = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const { getInstallerTargets, APP_TITLE, getDesktopVersion } = electronConfig;

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

async function loadBuilderConfig(): Promise<Record<string, unknown>> {
  return import(resolve(ROOT, "electron-builder.config.js")).then(
    (m) => m.default ?? m,
  );
}

// ---------------------------------------------------------------------------
// 1. Installer targets in electron-builder.config.js
// ---------------------------------------------------------------------------

describe("Phase 35 — Installer target configuration", () => {
  it("Linux target includes AppImage", async () => {
    const config = await loadBuilderConfig();
    const targets = config.linux as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "AppImage")).toBe(true);
  });

  it("Linux target still includes dir for fast testing", async () => {
    const config = await loadBuilderConfig();
    const targets = config.linux as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "dir")).toBe(true);
  });

  it("macOS target includes dmg", async () => {
    const config = await loadBuilderConfig();
    const targets = config.mac as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "dmg")).toBe(true);
  });

  it("macOS target still includes dir", async () => {
    const config = await loadBuilderConfig();
    const targets = config.mac as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "dir")).toBe(true);
  });

  it("Windows target includes nsis", async () => {
    const config = await loadBuilderConfig();
    const targets = config.win as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "nsis")).toBe(true);
  });

  it("Windows target still includes dir", async () => {
    const config = await loadBuilderConfig();
    const targets = config.win as { target: Array<{ target: string }> };
    expect(targets.target.some((t) => t.target === "dir")).toBe(true);
  });

  it("macOS still has identity: null (no code signing)", async () => {
    const config = await loadBuilderConfig();
    const mac = config.mac as { identity: null };
    expect(mac.identity).toBeNull();
  });

  it("publishing is still disabled", async () => {
    const config = await loadBuilderConfig();
    expect(config.publish).toBeNull();
  });

  it("output directory is still dist-electron", async () => {
    const config = await loadBuilderConfig();
    const dirs = config.directories as { output: string };
    expect(dirs.output).toBe("dist-electron");
  });

  it("productName matches APP_TITLE", async () => {
    const config = await loadBuilderConfig();
    expect(config.productName).toBe(APP_TITLE);
  });
});

// ---------------------------------------------------------------------------
// 2. Installer-specific section configs
// ---------------------------------------------------------------------------

describe("Phase 35 — Installer section configs", () => {
  it("nsis section exists with oneClick: true", async () => {
    const config = await loadBuilderConfig();
    const nsis = config.nsis as { oneClick: boolean };
    expect(nsis).toBeDefined();
    expect(nsis.oneClick).toBe(true);
  });

  it("nsis perMachine is false (per-user install)", async () => {
    const config = await loadBuilderConfig();
    const nsis = config.nsis as { perMachine: boolean };
    expect(nsis.perMachine).toBe(false);
  });

  it("nsis has artifactName with Setup in name", async () => {
    const config = await loadBuilderConfig();
    const nsis = config.nsis as { artifactName: string };
    expect(nsis.artifactName).toContain("Setup");
  });

  it("dmg section exists", async () => {
    const config = await loadBuilderConfig();
    expect(config.dmg).toBeDefined();
  });

  it("dmg has artifactName", async () => {
    const config = await loadBuilderConfig();
    const dmg = config.dmg as { artifactName: string };
    expect(typeof dmg.artifactName).toBe("string");
    expect(dmg.artifactName.length).toBeGreaterThan(0);
  });

  it("appImage section exists", async () => {
    const config = await loadBuilderConfig();
    expect(config.appImage).toBeDefined();
  });

  it("appImage has artifactName", async () => {
    const config = await loadBuilderConfig();
    const appImage = config.appImage as { artifactName: string };
    expect(typeof appImage.artifactName).toBe("string");
    expect(appImage.artifactName.length).toBeGreaterThan(0);
  });

  it("Linux has synopsis and description", async () => {
    const config = await loadBuilderConfig();
    const linux = config.linux as { synopsis: string; description: string };
    expect(typeof linux.synopsis).toBe("string");
    expect(linux.synopsis.length).toBeGreaterThan(0);
    expect(typeof linux.description).toBe("string");
    expect(linux.description.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. desktop:installer build script
// ---------------------------------------------------------------------------

describe("Phase 35 — Build scripts", () => {
  const pkg = readJson("package.json") as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("has desktop:installer script", () => {
    expect(typeof pkg.scripts["desktop:installer"]).toBe("string");
  });

  it("desktop:installer runs tsc first", () => {
    const script = pkg.scripts["desktop:installer"];
    expect(script).toContain("npm run build");
  });

  it("desktop:installer invokes electron-builder", () => {
    const script = pkg.scripts["desktop:installer"];
    expect(script).toContain("electron-builder");
  });

  it("desktop:installer uses --publish never", () => {
    const script = pkg.scripts["desktop:installer"];
    expect(script).toContain("--publish never");
  });

  it("desktop:installer references the config file", () => {
    const script = pkg.scripts["desktop:installer"];
    expect(script).toContain("electron-builder.config.js");
  });

  it("existing desktop:build script is unchanged", () => {
    const script = pkg.scripts["desktop:build"];
    expect(script).toContain("npm run build");
    expect(script).toContain("electron-builder");
  });

  it("existing desktop:pack script is unchanged", () => {
    const script = pkg.scripts["desktop:pack"];
    expect(script).toContain("--dir");
  });

  it("existing desktop script is unchanged", () => {
    expect(pkg.scripts["desktop"]).toBe("electron electron/main.cjs");
  });

  it("existing desktop:dev script is unchanged", () => {
    expect(pkg.scripts["desktop:dev"]).toContain("ELECTRON_DEV=1");
  });
});

// ---------------------------------------------------------------------------
// 4. getInstallerTargets() helper
// ---------------------------------------------------------------------------

describe("Phase 35 — getInstallerTargets()", () => {
  it("is exported from config.cjs", () => {
    expect(typeof getInstallerTargets).toBe("function");
  });

  it("returns object with expected shape", () => {
    const result = getInstallerTargets();
    expect(typeof result.platform).toBe("string");
    expect(typeof result.installerTarget).toBe("string");
    expect(typeof result.ext).toBe("string");
    expect(typeof result.description).toBe("string");
  });

  it("Linux returns AppImage target", () => {
    const result = getInstallerTargets("linux");
    expect(result.platform).toBe("linux");
    expect(result.installerTarget).toBe("AppImage");
    expect(result.ext).toBe("AppImage");
    expect(result.description).toContain("Linux");
  });

  it("macOS returns dmg target", () => {
    const result = getInstallerTargets("darwin");
    expect(result.platform).toBe("darwin");
    expect(result.installerTarget).toBe("dmg");
    expect(result.ext).toBe("dmg");
    expect(result.description).toContain("macOS");
  });

  it("Windows returns nsis target", () => {
    const result = getInstallerTargets("win32");
    expect(result.platform).toBe("win32");
    expect(result.installerTarget).toBe("nsis");
    expect(result.ext).toBe("exe");
    expect(result.description).toContain("Windows");
  });

  it("unknown platform falls back to dir", () => {
    const result = getInstallerTargets("freebsd");
    expect(result.installerTarget).toBe("dir");
    expect(result.ext).toBe("dir");
  });

  it("default (no arg) uses process.platform", () => {
    const result = getInstallerTargets();
    expect(result.platform).toBe(process.platform);
  });

  it("descriptions mention unsigned for macOS and Windows", () => {
    expect(getInstallerTargets("darwin").description).toContain("unsigned");
    expect(getInstallerTargets("win32").description).toContain("unsigned");
  });
});

// ---------------------------------------------------------------------------
// 5. File inclusion sanity — installer targets don't break file patterns
// ---------------------------------------------------------------------------

describe("Phase 35 — File inclusion consistency", () => {
  it("electron-builder files still include dist/**/*", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("dist/**/*");
  });

  it("electron-builder files still include data/**/*", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("data/**/*");
  });

  it("electron-builder files still include electron/**/*", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("electron/**/*");
  });

  it("electron-builder files still include package.json", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("package.json");
  });

  it("electron-builder files still exclude src/**", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("!src/**");
  });

  it("electron-builder files still exclude tests/**", async () => {
    const config = await loadBuilderConfig();
    const files = config.files as string[];
    expect(files).toContain("!tests/**");
  });

  it("extraMetadata.main is still electron/main.cjs", async () => {
    const config = await loadBuilderConfig();
    const meta = config.extraMetadata as { main: string };
    expect(meta.main).toBe("electron/main.cjs");
  });

  it("npmRebuild is still false", async () => {
    const config = await loadBuilderConfig();
    expect(config.npmRebuild).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Backward compatibility — all Phase 33/34 exports still present
// ---------------------------------------------------------------------------

describe("Phase 35 — Backward compatibility", () => {
  it("all Phase 33 config exports are still present", () => {
    const expected = [
      "isPackaged",
      "getAppRoot",
      "getServerLaunchConfig",
      "getPreloadPath",
      "getRequiredPackagedFiles",
      "getRequiredPackagedDirs",
    ];
    for (const name of expected) {
      expect(typeof electronConfig[name]).toBe("function");
    }
  });

  it("all Phase 34 config exports are still present", () => {
    const expected = [
      "escapeHtml",
      "validatePackagedRuntime",
      "buildEnvironmentSummary",
      "getIconPath",
    ];
    for (const name of expected) {
      expect(typeof electronConfig[name]).toBe("function");
    }
  });

  it("all Phase 32 config exports are still present", () => {
    const expected = [
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
    ];
    for (const name of expected) {
      expect(electronConfig[name]).toBeDefined();
    }
  });

  it("Phase 35 getInstallerTargets is present", () => {
    expect(typeof electronConfig.getInstallerTargets).toBe("function");
  });

  it("getDesktopVersion still returns correct version", () => {
    const pkg = readJson("package.json") as { version: string };
    expect(getDesktopVersion()).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// 7. Documentation existence and content
// ---------------------------------------------------------------------------

describe("Phase 35 — Documentation", () => {
  it("ELECTRON.md exists", () => {
    expect(fileExists("docs/ELECTRON.md")).toBe(true);
  });

  it("PACKAGING.md exists", () => {
    expect(fileExists("docs/PACKAGING.md")).toBe(true);
  });

  it("ELECTRON.md mentions desktop:installer", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("desktop:installer");
  });

  it("ELECTRON.md mentions AppImage", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("AppImage");
  });

  it("ELECTRON.md mentions dmg", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("dmg");
  });

  it("ELECTRON.md mentions nsis", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("nsis");
  });

  it("PACKAGING.md mentions Phase 35", () => {
    const content = readFileSync(resolve(ROOT, "docs/PACKAGING.md"), "utf-8");
    expect(content).toContain("Phase 35");
  });

  it("CHANGELOG.md mentions Phase 35", () => {
    const content = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");
    expect(content).toContain("Phase 35");
  });
});

// ---------------------------------------------------------------------------
// 8. Build path clarity — scripts cover all four modes
// ---------------------------------------------------------------------------

describe("Phase 35 — Build path clarity", () => {
  const pkg = readJson("package.json") as { scripts: Record<string, string> };

  it("browser shell: app-shell script exists", () => {
    expect(typeof pkg.scripts["app-shell"]).toBe("string");
  });

  it("desktop dev run: desktop and desktop:dev scripts exist", () => {
    expect(typeof pkg.scripts["desktop"]).toBe("string");
    expect(typeof pkg.scripts["desktop:dev"]).toBe("string");
  });

  it("packed/unpacked desktop build: desktop:pack script exists", () => {
    expect(typeof pkg.scripts["desktop:pack"]).toBe("string");
  });

  it("full build with all targets: desktop:build script exists", () => {
    expect(typeof pkg.scripts["desktop:build"]).toBe("string");
  });

  it("installer build: desktop:installer script exists", () => {
    expect(typeof pkg.scripts["desktop:installer"]).toBe("string");
  });

  it("all five desktop-related scripts are distinct", () => {
    const scripts = [
      pkg.scripts["desktop"],
      pkg.scripts["desktop:dev"],
      pkg.scripts["desktop:pack"],
      pkg.scripts["desktop:build"],
      pkg.scripts["desktop:installer"],
    ];
    const unique = new Set(scripts);
    expect(unique.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 9. Platform target count validation
// ---------------------------------------------------------------------------

describe("Phase 35 — Platform target counts", () => {
  it("Linux has exactly 2 targets (dir + AppImage)", async () => {
    const config = await loadBuilderConfig();
    const targets = (config.linux as { target: unknown[] }).target;
    expect(targets.length).toBe(2);
  });

  it("macOS has exactly 2 targets (dir + dmg)", async () => {
    const config = await loadBuilderConfig();
    const targets = (config.mac as { target: unknown[] }).target;
    expect(targets.length).toBe(2);
  });

  it("Windows has exactly 2 targets (dir + nsis)", async () => {
    const config = await loadBuilderConfig();
    const targets = (config.win as { target: unknown[] }).target;
    expect(targets.length).toBe(2);
  });
});
