/**
 * Phase 42 — V1 release hardening / smoke-style validation tests.
 *
 * Validates:
 *   - V1 version coherence across package.json, README, CHANGELOG
 *   - README subpath exports completeness (all 13 documented)
 *   - README known limitations accuracy (all subsystems represented)
 *   - README doc references completeness (all docs referenced)
 *   - Electron V1 release helpers (RELEASE_STAGE, V1_KNOWN_LIMITATIONS, etc.)
 *   - Cross-surface consistency (docs, naming, wording)
 *   - Public export surface integrity
 *   - BETA-TESTING.md V1 updates
 *   - CHANGELOG Phase 42 entry
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const readme = () => readFileSync(join(ROOT, "README.md"), "utf-8");
const changelog = () => readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8");
const pkgJson = () =>
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
    exports: Record<string, unknown>;
    version: string;
    name: string;
    description: string;
  };
const betaTestingDoc = () =>
  readFileSync(join(ROOT, "docs/BETA-TESTING.md"), "utf-8");

async function loadConfig() {
  return import(resolve(ROOT, "electron", "config.cjs")).then(
    (m) => m.default ?? m,
  );
}

// ---------------------------------------------------------------------------
// 1. V1 version coherence
// ---------------------------------------------------------------------------

describe("Phase 42 — V1 version coherence", () => {
  it("package.json version is 1.0.0", () => {
    const pkg = pkgJson();
    expect(pkg.version).toBe("1.0.0");
  });

  it("README does not say 'release candidate' in limitations heading", () => {
    const content = readme();
    expect(content).not.toContain("Known limitations (release candidate)");
  });

  it("README says 'Known limitations (V1)'", () => {
    const content = readme();
    expect(content).toContain("Known limitations (V1)");
  });

  it("CHANGELOG contains V1 release section", () => {
    const content = changelog();
    expect(content).toContain("[1.0.0]");
    expect(content).toContain("V1 Release");
  });

  it("CHANGELOG contains Phase 42 entry", () => {
    const content = changelog();
    expect(content).toContain("Phase 42");
    expect(content).toContain("V1 Release Hardening");
  });
});

// ---------------------------------------------------------------------------
// 2. README subpath exports completeness
// ---------------------------------------------------------------------------

describe("Phase 42 — README subpath exports completeness", () => {
  const expectedExports = [
    "codingagent-backend",
    "codingagent-backend/cli",
    "codingagent-backend/workflow",
    "codingagent-backend/schemas",
    "codingagent-backend/frontend-contracts",
    "codingagent-backend/app-shell",
    "codingagent-backend/session",
    "codingagent-backend/mcp",
    "codingagent-backend/agents",
    "codingagent-backend/commands",
    "codingagent-backend/fingerprint",
    "codingagent-backend/toolchain",
    "codingagent-backend/language-service",
  ];

  const content = readme();

  for (const exp of expectedExports) {
    it(`README mentions subpath export: ${exp}`, () => {
      expect(content).toContain(exp);
    });
  }

  it("package.json exports match README count (16 total)", () => {
    const pkg = pkgJson();
    const exportKeys = Object.keys(pkg.exports);
    expect(exportKeys.length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// 3. README known limitations accuracy
// ---------------------------------------------------------------------------

describe("Phase 42 — README known limitations accuracy", () => {
  const content = readme();
  const limitationsSection = content.slice(
    content.indexOf("## Known limitations (V1)"),
  );

  const requiredTopics = [
    "install execution",
    "MCP transport",
    "Agent execution",
    "Session persistence",
    "Real-time updates",
    "GitHub MCP",
    "Language service",
    "Toolchain adapters",
    "Repository fingerprinting",
    "Naming drift",
    "views.ts duplication",
    "unsigned",
  ];

  for (const topic of requiredTopics) {
    it(`known limitations mentions: ${topic}`, () => {
      expect(limitationsSection.toLowerCase()).toContain(topic.toLowerCase());
    });
  }
});

// ---------------------------------------------------------------------------
// 4. README doc references completeness
// ---------------------------------------------------------------------------

describe("Phase 42 — README doc references completeness", () => {
  const content = readme();
  const docsDir = readdirSync(join(ROOT, "docs"));
  const mdDocs = docsDir.filter((f) => f.endsWith(".md"));

  for (const doc of mdDocs) {
    it(`README references docs/${doc}`, () => {
      expect(content).toContain(`docs/${doc}`);
    });
  }

  it("README references CHANGELOG.md", () => {
    expect(content).toContain("CHANGELOG.md");
  });
});

// ---------------------------------------------------------------------------
// 5. Electron V1 release helpers
// ---------------------------------------------------------------------------

describe("Phase 42 — Electron V1 release helpers", () => {
  it("RELEASE_STAGE is 'v1'", async () => {
    const config = await loadConfig();
    expect(config.RELEASE_STAGE).toBe("v1");
  });

  it("V1_KNOWN_LIMITATIONS is a non-empty array of strings", async () => {
    const config = await loadConfig();
    expect(Array.isArray(config.V1_KNOWN_LIMITATIONS)).toBe(true);
    expect(config.V1_KNOWN_LIMITATIONS.length).toBeGreaterThan(0);
    for (const item of config.V1_KNOWN_LIMITATIONS) {
      expect(typeof item).toBe("string");
      expect(item.length).toBeGreaterThan(0);
    }
  });

  it("V1_KNOWN_LIMITATIONS covers key subsystems", async () => {
    const config = await loadConfig();
    const joined = config.V1_KNOWN_LIMITATIONS.join(" ").toLowerCase();
    expect(joined).toContain("install execution");
    expect(joined).toContain("mcp");
    expect(joined).toContain("agent");
    expect(joined).toContain("session");
    expect(joined).toContain("github");
    expect(joined).toContain("language service");
    expect(joined).toContain("unsigned");
  });

  it("getReleaseLabel() returns 'v1'", async () => {
    const config = await loadConfig();
    expect(config.getReleaseLabel()).toBe("v1");
  });

  it("getReleaseVersion() returns a valid semver-like string", async () => {
    const config = await loadConfig();
    const version = config.getReleaseVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("getReleaseVersion() matches package.json version", async () => {
    const config = await loadConfig();
    const pkg = pkgJson();
    expect(config.getReleaseVersion()).toBe(pkg.version);
  });

  it("getReleaseMetadata() returns a complete metadata object", async () => {
    const config = await loadConfig();
    const meta = config.getReleaseMetadata();

    expect(meta.version).toBe("1.0.0");
    expect(meta.releaseStage).toBe("v1");
    expect(meta.releaseLabel).toBe("v1");
    expect(meta.productIdentity).toBeDefined();
    expect(meta.productIdentity.appId).toBe("com.codingagent.desktop");
    expect(meta.productIdentity.productName).toBe("CodingAgent");
    expect(meta.signing).toBeDefined();
    expect(meta.icon).toBeDefined();
    expect(meta.knownLimitations).toEqual(config.V1_KNOWN_LIMITATIONS);
    expect(meta.artifactNaming).toBeDefined();
    expect(meta.platforms).toBeDefined();
    expect(meta.platforms.linux).toBe("AppImage");
    expect(meta.platforms.darwin).toBe("dmg");
    expect(meta.platforms.win32).toBe("nsis");
  });

  it("getBetaLabel and getBetaVersion still work (backward compat)", async () => {
    const config = await loadConfig();
    expect(config.getBetaLabel()).toBe("beta");
    expect(config.getBetaVersion()).toMatch(/^\d+\.\d+\.\d+-beta$/);
  });

  it("BETA_KNOWN_LIMITATIONS still exists (backward compat)", async () => {
    const config = await loadConfig();
    expect(Array.isArray(config.BETA_KNOWN_LIMITATIONS)).toBe(true);
    expect(config.BETA_KNOWN_LIMITATIONS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Cross-surface consistency
// ---------------------------------------------------------------------------

describe("Phase 42 — Cross-surface consistency", () => {
  it("package.json name is 'codingagent-backend'", () => {
    const pkg = pkgJson();
    expect(pkg.name).toBe("codingagent-backend");
  });

  it("README title matches package name context", () => {
    const content = readme();
    expect(content).toContain("# codingagent-backend");
  });

  it("PRODUCT_NAME in config.cjs matches APP_TITLE", async () => {
    const config = await loadConfig();
    expect(config.PRODUCT_NAME).toBe(config.APP_TITLE);
  });

  it("PRODUCT_DESCRIPTION is non-empty and relevant", async () => {
    const config = await loadConfig();
    expect(config.PRODUCT_DESCRIPTION.length).toBeGreaterThan(50);
    expect(config.PRODUCT_DESCRIPTION).toContain("local-first");
  });

  it("README describes the same product as package.json", () => {
    const pkg = pkgJson();
    const content = readme();
    // Both mention core concepts
    expect(content).toContain("catalog");
    expect(content).toContain("host detection");
    expect(pkg.description).toContain("catalog");
    expect(pkg.description).toContain("host detection");
  });
});

// ---------------------------------------------------------------------------
// 7. Public export surface integrity
// ---------------------------------------------------------------------------

describe("Phase 42 — Public export surface integrity", () => {
  it("root index.ts re-exports all major modules", async () => {
    const indexContent = readFileSync(
      join(ROOT, "src/index.ts"),
      "utf-8",
    );
    const expectedModules = [
      "types",
      "schemas",
      "catalog",
      "detection",
      "compatibility",
      "install-plan",
      "workflow",
      "frontend-contracts",
      "session",
      "mcp",
      "agents",
      "commands",
      "fingerprint",
      "toolchain",
      "language-service",
    ];
    for (const mod of expectedModules) {
      expect(indexContent).toContain(mod);
    }
  });

  it("all subpath export directories exist in src/", () => {
    const exportDirs = [
      "cli",
      "workflow",
      "schemas",
      "frontend-contracts",
      "app-shell",
      "session",
      "mcp",
      "agents",
      "commands",
      "fingerprint",
      "toolchain",
      "language-service",
    ];
    for (const dir of exportDirs) {
      const fullPath = join(ROOT, "src", dir);
      expect(existsSync(fullPath)).toBe(true);
    }
  });

  it("each subpath export has an index.ts", () => {
    const exportDirs = [
      "cli",
      "workflow",
      "schemas",
      "frontend-contracts",
      "app-shell",
      "session",
      "mcp",
      "agents",
      "commands",
      "fingerprint",
      "toolchain",
      "language-service",
    ];
    for (const dir of exportDirs) {
      const indexPath = join(ROOT, "src", dir, "index.ts");
      expect(existsSync(indexPath)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. BETA-TESTING.md V1 updates
// ---------------------------------------------------------------------------

describe("Phase 42 — BETA-TESTING.md V1 updates", () => {
  const content = betaTestingDoc();

  it("title includes V1 reference", () => {
    expect(content).toContain("V1");
  });

  it("mentions V1 release", () => {
    expect(content).toContain("V1 release");
  });

  it("contains V1 release checklist", () => {
    expect(content).toContain("V1 release checklist");
  });

  it("V1 release checklist mentions npm publish", () => {
    expect(content).toContain("npm publish");
  });

  it("still contains beta testing content (backward compat)", () => {
    expect(content).toContain("Beta release checklist");
  });
});

// ---------------------------------------------------------------------------
// 9. Docs directory completeness
// ---------------------------------------------------------------------------

describe("Phase 42 — Docs directory completeness", () => {
  const expectedDocs = [
    "QUICKSTART.md",
    "APP-SHELL.md",
    "USAGE.md",
    "SESSION-WORKSPACE.md",
    "SESSION-TIMELINE.md",
    "SESSION-CONSOLE.md",
    "SESSION-PERSISTENCE.md",
    "MCP-SERVERS.md",
    "MCP-HEALTH.md",
    "GITHUB-MCP.md",
    "AGENTS.md",
    "AGENT-ROUTING.md",
    "COMMANDS.md",
    "FINGERPRINTING.md",
    "TOOLCHAIN.md",
    "LANGUAGE-SERVICE.md",
    "ELECTRON.md",
    "PACKAGING.md",
    "CODE-SIGNING.md",
    "BETA-TESTING.md",
    "ARCHITECTURE.md",
  ];

  for (const doc of expectedDocs) {
    it(`docs/${doc} exists`, () => {
      expect(existsSync(join(ROOT, "docs", doc))).toBe(true);
    });
  }

  it("all docs are non-empty", () => {
    for (const doc of expectedDocs) {
      const content = readFileSync(join(ROOT, "docs", doc), "utf-8");
      expect(content.length).toBeGreaterThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. V1 release metadata coherence
// ---------------------------------------------------------------------------

describe("Phase 42 — V1 release metadata coherence", () => {
  it("electron config V1 version matches package.json", async () => {
    const config = await loadConfig();
    const pkg = pkgJson();
    expect(config.getReleaseVersion()).toBe(pkg.version);
  });

  it("V1 known limitations count is >= 10", async () => {
    const config = await loadConfig();
    expect(config.V1_KNOWN_LIMITATIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("V1 metadata includes all required artifact naming patterns", async () => {
    const config = await loadConfig();
    const meta = config.getReleaseMetadata();
    expect(meta.artifactNaming.generic).toContain("productName");
    expect(meta.artifactNaming.appImage).toContain("productName");
    expect(meta.artifactNaming.dmg).toContain("productName");
    expect(meta.artifactNaming.nsis).toContain("Setup");
  });

  it("RELEASE_STAGE and getReleaseLabel() are consistent", async () => {
    const config = await loadConfig();
    expect(config.getReleaseLabel()).toBe(config.RELEASE_STAGE);
  });
});
