/**
 * Phase 33 — Installer / distribution first slice tests.
 *
 * Validates the packaging configuration, build scripts, packaged-mode
 * path resolution, and overall readiness for generating a distributable
 * desktop artifact via electron-builder.
 *
 * These are deterministic smoke tests — they do NOT attempt to run a full
 * electron-builder build (that would require downloading Electron binaries).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";

// ---------------------------------------------------------------------------
// Import the CJS config module (testable without Electron)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronConfig = await import(
  resolve(process.cwd(), "electron", "config.cjs")
).then((m) => m.default ?? m);

const {
  isPackaged,
  getAppRoot,
  getServerLaunchConfig,
  getPreloadPath,
  getRequiredPackagedFiles,
  getRequiredPackagedDirs,
  getDesktopVersion,
  buildWindowTitle,
  APP_TITLE,
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

// ---------------------------------------------------------------------------
// 1. electron-builder configuration
// ---------------------------------------------------------------------------

describe("Phase 33 — Packaging config", () => {
  it("electron-builder.config.js exists", () => {
    expect(fileExists("electron-builder.config.js")).toBe(true);
  });

  it("electron-builder config is a valid JS module", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("config has appId", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(typeof config.appId).toBe("string");
    expect(config.appId.length).toBeGreaterThan(0);
  });

  it("config has productName matching APP_TITLE", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config.productName).toBe(APP_TITLE);
  });

  it("config output directory is dist-electron", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config.directories?.output).toBe("dist-electron");
  });

  it("config includes essential file patterns", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    const files = config.files as string[];
    expect(Array.isArray(files)).toBe(true);
    expect(files).toContain("dist/**/*");
    expect(files).toContain("data/**/*");
    expect(files).toContain("electron/**/*");
    expect(files).toContain("package.json");
  });

  it("config excludes source/test/docs files", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    const files = config.files as string[];
    expect(files).toContain("!src/**");
    expect(files).toContain("!tests/**");
    expect(files).toContain("!docs/**");
  });

  it("config overrides main to electron/main.cjs", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config.extraMetadata?.main).toBe("electron/main.cjs");
  });

  it("config has platform targets (at least dir)", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    // At least one platform should target "dir" for local testing
    const hasDir = (targets: Array<{ target: string }>) =>
      targets.some((t) => t.target === "dir");
    const linuxOk = config.linux?.target ? hasDir(config.linux.target) : false;
    const macOk = config.mac?.target ? hasDir(config.mac.target) : false;
    const winOk = config.win?.target ? hasDir(config.win.target) : false;
    expect(linuxOk || macOk || winOk).toBe(true);
  });

  it("config disables publishing", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config.publish).toBeNull();
  });

  it("config disables code signing on mac (identity: null)", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    expect(config.mac?.identity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Package.json build scripts
// ---------------------------------------------------------------------------

describe("Phase 33 — Build scripts", () => {
  const pkg = readJson("package.json") as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it("has desktop:build script", () => {
    expect(typeof pkg.scripts["desktop:build"]).toBe("string");
  });

  it("desktop:build runs tsc then electron-builder", () => {
    const script = pkg.scripts["desktop:build"];
    expect(script).toContain("npm run build");
    expect(script).toContain("electron-builder");
    expect(script).toContain("electron-builder.config.js");
  });

  it("has desktop:pack script (dir-only, fast)", () => {
    expect(typeof pkg.scripts["desktop:pack"]).toBe("string");
    const script = pkg.scripts["desktop:pack"];
    expect(script).toContain("--dir");
  });

  it("desktop:pack runs tsc first", () => {
    const script = pkg.scripts["desktop:pack"];
    expect(script).toContain("npm run build");
  });

  it("existing desktop and desktop:dev scripts are unchanged", () => {
    expect(pkg.scripts["desktop"]).toBe("electron electron/main.cjs");
    expect(pkg.scripts["desktop:dev"]).toContain("ELECTRON_DEV=1");
  });

  it("electron-builder is in devDependencies", () => {
    expect(typeof pkg.devDependencies["electron-builder"]).toBe("string");
  });

  it("electron is still in devDependencies", () => {
    expect(typeof pkg.devDependencies["electron"]).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 3. Packaged-mode detection
// ---------------------------------------------------------------------------

describe("Phase 33 — isPackaged()", () => {
  it("returns false in dev mode (no asar, no override)", () => {
    expect(isPackaged()).toBe(false);
  });

  it("can be forced to true via option", () => {
    expect(isPackaged({ forcePackaged: true })).toBe(true);
  });

  it("can be forced to false via option", () => {
    expect(isPackaged({ forcePackaged: false })).toBe(false);
  });

  it("returns boolean", () => {
    expect(typeof isPackaged()).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// 4. App root resolution
// ---------------------------------------------------------------------------

describe("Phase 33 — getAppRoot()", () => {
  it("returns a string", () => {
    expect(typeof getAppRoot()).toBe("string");
  });

  it("returns a path that exists", () => {
    expect(existsSync(getAppRoot())).toBe(true);
  });

  it("app root contains package.json", () => {
    expect(existsSync(join(getAppRoot(), "package.json"))).toBe(true);
  });

  it("app root contains electron/ directory", () => {
    expect(existsSync(join(getAppRoot(), "electron"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Server launch config
// ---------------------------------------------------------------------------

describe("Phase 33 — getServerLaunchConfig()", () => {
  it("returns object with command, args, serverScript", () => {
    const cfg = getServerLaunchConfig();
    expect(typeof cfg.command).toBe("string");
    expect(Array.isArray(cfg.args)).toBe(true);
    expect(typeof cfg.serverScript).toBe("string");
  });

  describe("dev mode", () => {
    const cfg = getServerLaunchConfig({ forcePackaged: false });

    it("uses npx as command", () => {
      const expected = process.platform === "win32" ? "npx.cmd" : "npx";
      expect(cfg.command).toBe(expected);
    });

    it("args include tsx", () => {
      expect(cfg.args).toContain("tsx");
    });

    it("server script points to TypeScript source", () => {
      expect(cfg.serverScript).toContain("src");
      expect(cfg.serverScript).toContain("server.ts");
    });

    it("server script path is absolute", () => {
      // Absolute path check (Unix or Windows)
      const isAbsolute = cfg.serverScript.startsWith("/") || /^[A-Z]:\\/.test(cfg.serverScript);
      expect(isAbsolute).toBe(true);
    });
  });

  describe("packaged mode", () => {
    const cfg = getServerLaunchConfig({ forcePackaged: true });

    it("uses process.execPath as command", () => {
      expect(cfg.command).toBe(process.execPath);
    });

    it("args contain server script path only", () => {
      expect(cfg.args.length).toBe(1);
      expect(cfg.args[0]).toContain("server.js");
    });

    it("server script points to compiled JS", () => {
      expect(cfg.serverScript).toContain("dist");
      expect(cfg.serverScript).toContain("server.js");
      expect(cfg.serverScript).not.toContain("src");
      expect(cfg.serverScript).not.toContain(".ts");
    });

    it("server script path is absolute", () => {
      const isAbsolute = cfg.serverScript.startsWith("/") || /^[A-Z]:\\/.test(cfg.serverScript);
      expect(isAbsolute).toBe(true);
    });

    it("does not reference tsx or npx", () => {
      expect(cfg.command).not.toContain("npx");
      expect(cfg.command).not.toContain("tsx");
      expect(cfg.args.join(" ")).not.toContain("npx");
      expect(cfg.args.join(" ")).not.toContain("tsx");
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Preload path
// ---------------------------------------------------------------------------

describe("Phase 33 — getPreloadPath()", () => {
  it("returns a string", () => {
    expect(typeof getPreloadPath()).toBe("string");
  });

  it("path ends with preload.cjs", () => {
    expect(getPreloadPath()).toMatch(/preload\.cjs$/);
  });

  it("preload file exists at the returned path", () => {
    expect(existsSync(getPreloadPath())).toBe(true);
  });

  it("path is absolute", () => {
    const p = getPreloadPath();
    const isAbsolute = p.startsWith("/") || /^[A-Z]:\\/.test(p);
    expect(isAbsolute).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Required files/dirs lists
// ---------------------------------------------------------------------------

describe("Phase 33 — getRequiredPackagedFiles()", () => {
  it("returns an array", () => {
    expect(Array.isArray(getRequiredPackagedFiles())).toBe(true);
  });

  it("includes electron entry files", () => {
    const files = getRequiredPackagedFiles();
    expect(files).toContain("electron/main.cjs");
    expect(files).toContain("electron/preload.cjs");
    expect(files).toContain("electron/config.cjs");
  });

  it("includes package.json", () => {
    expect(getRequiredPackagedFiles()).toContain("package.json");
  });

  it("all listed files exist in the source tree", () => {
    for (const file of getRequiredPackagedFiles()) {
      expect(fileExists(file)).toBe(true);
    }
  });
});

describe("Phase 33 — getRequiredPackagedDirs()", () => {
  it("returns an array", () => {
    expect(Array.isArray(getRequiredPackagedDirs())).toBe(true);
  });

  it("includes dist, data, electron", () => {
    const dirs = getRequiredPackagedDirs();
    expect(dirs).toContain("dist");
    expect(dirs).toContain("data");
    expect(dirs).toContain("electron");
  });
});

// ---------------------------------------------------------------------------
// 8. Electron main.cjs packaged-mode integration
// ---------------------------------------------------------------------------

describe("Phase 33 — main.cjs packaged-mode integration", () => {
  const mainSrc = readFileSync(resolve(ROOT, "electron/main.cjs"), "utf-8");

  it("main.cjs uses getServerLaunchConfig()", () => {
    expect(mainSrc).toContain("getServerLaunchConfig");
  });

  it("main.cjs uses getAppRoot() for cwd", () => {
    expect(mainSrc).toContain("getAppRoot");
  });

  it("main.cjs uses getPreloadPath() for preload", () => {
    expect(mainSrc).toContain("getPreloadPath");
  });

  it("main.cjs no longer hard-codes npx tsx path", () => {
    // The old pattern was: spawn(npxCmd, ["tsx", serverScript, ...])
    // Now it should use launchConfig.command / launchConfig.args
    const lines = mainSrc.split("\n");
    const hasHardcodedNpx = lines.some(
      (line: string) =>
        line.includes('spawn(npxCmd') || line.includes("spawn(\"npx"),
    );
    expect(hasHardcodedNpx).toBe(false);
  });

  it("main.cjs no longer hard-codes server.ts path", () => {
    // Should not have a direct path.join to src/app-shell/server.ts in the spawn call
    expect(mainSrc).not.toContain("path.join(rootDir, \"src\"");
  });
});

// ---------------------------------------------------------------------------
// 9. .gitignore includes dist-electron
// ---------------------------------------------------------------------------

describe("Phase 33 — .gitignore", () => {
  const gitignore = readFileSync(resolve(ROOT, ".gitignore"), "utf-8");

  it("dist-electron/ is in .gitignore", () => {
    expect(gitignore).toContain("dist-electron");
  });
});

// ---------------------------------------------------------------------------
// 10. Backward compatibility
// ---------------------------------------------------------------------------

describe("Phase 33 — Backward compatibility", () => {
  it("getDesktopVersion still works", () => {
    const version = getDesktopVersion();
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
  });

  it("buildWindowTitle still works", () => {
    const title = buildWindowTitle();
    expect(title).toContain(APP_TITLE);
    expect(title).toContain("v");
  });

  it("buildWindowTitle with isDev still works", () => {
    const title = buildWindowTitle({ isDev: true });
    expect(title).toContain("[Dev]");
  });

  it("all Phase 32 config exports are still present", () => {
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
    ];
    for (const name of expectedExports) {
      expect(electronConfig[name]).toBeDefined();
    }
  });

  it("all Phase 33 config exports are present", () => {
    const newExports = [
      "isPackaged",
      "getAppRoot",
      "getServerLaunchConfig",
      "getPreloadPath",
      "getRequiredPackagedFiles",
      "getRequiredPackagedDirs",
    ];
    for (const name of newExports) {
      expect(typeof electronConfig[name]).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Packaging config consistency
// ---------------------------------------------------------------------------

describe("Phase 33 — Packaging config consistency", () => {
  it("electron-builder files patterns include all required dirs", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    const files = config.files as string[];
    const requiredDirs = getRequiredPackagedDirs();
    for (const dir of requiredDirs) {
      const pattern = `${dir}/**/*`;
      // Allow exact match or the dir is listed as plain string
      const found = files.some(
        (f: string) => f === pattern || f === `${dir}/**` || f === dir,
      );
      expect(found).toBe(true);
    }
  });

  it("electron-builder files patterns include all required files", async () => {
    const config = await import(resolve(ROOT, "electron-builder.config.js")).then(
      (m) => m.default ?? m,
    );
    const files = config.files as string[];
    const requiredFiles = getRequiredPackagedFiles();
    for (const rf of requiredFiles) {
      // Each required file should be covered by a pattern
      const covered = files.some((f: string) => {
        if (f.startsWith("!")) return false;
        if (f === rf) return true;
        // Check glob patterns
        const dir = rf.split("/")[0];
        if (f === `${dir}/**/*` || f === `${dir}/**`) return true;
        return false;
      });
      expect(covered).toBe(true);
    }
  });

  it("version in package.json matches getDesktopVersion()", () => {
    const pkg = readJson("package.json") as { version: string };
    expect(getDesktopVersion()).toBe(pkg.version);
  });
});

// ---------------------------------------------------------------------------
// 12. Documentation existence
// ---------------------------------------------------------------------------

describe("Phase 33 — Documentation", () => {
  it("ELECTRON.md exists", () => {
    expect(fileExists("docs/ELECTRON.md")).toBe(true);
  });

  it("PACKAGING.md exists", () => {
    expect(fileExists("docs/PACKAGING.md")).toBe(true);
  });

  it("ELECTRON.md mentions packaged build", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("desktop:build");
  });

  it("ELECTRON.md mentions desktop:pack", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("desktop:pack");
  });

  it("ELECTRON.md mentions dist-electron output", () => {
    const content = readFileSync(resolve(ROOT, "docs/ELECTRON.md"), "utf-8");
    expect(content).toContain("dist-electron");
  });

  it("CHANGELOG.md mentions Phase 33", () => {
    const content = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");
    expect(content).toContain("Phase 33");
  });
});
