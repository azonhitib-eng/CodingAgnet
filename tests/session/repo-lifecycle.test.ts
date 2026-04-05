/**
 * Phase 21 — Repository open/clone lifecycle and workspace bootstrap tests.
 *
 * Deterministic tests covering:
 * - Path validation
 * - Clone URL validation
 * - Clone target validation
 * - Open existing repo path
 * - Open generic directory path
 * - Invalid path handling
 * - Clone request validation
 * - Successful clone flow (mocked)
 * - Clone failure handling
 * - Workspace/session state transitions
 * - Session event emission for repo lifecycle
 * - Summary exposure of workspace state
 * - Server endpoint shape (workspace open/clone/validate)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

import {
  handleRequest,
} from "../../src/app-shell/server.js";

import {
  validateLocalPath,
  validateCloneUrl,
  validateCloneTarget,
  openWorkspace,
  cloneWorkspace,
} from "../../src/session/repo-lifecycle.js";
import type {
  GitExecutor,
  CloneExecResult,
} from "../../src/session/repo-lifecycle.js";
import {
  SessionManager,
  openLocalWorkspace,
  prepareCloneWorkspace,
  markWorkspaceReady,
  markWorkspaceInvalid,
  markWorkspaceClosed,
  markWorkspaceBootstrapping,
  openGenericDirectory,
  isValidStatus,
  _resetIdCounter,
} from "../../src/session/index.js";
import {
  workspaceOpenRequested,
  workspaceOpened,
  workspaceInvalid as workspaceInvalidEvent,
  cloneRequested,
  cloneStarted,
  cloneCompleted,
  cloneFailed,
  workspaceReady,
} from "../../src/session/events.js";

/* ------------------------------------------------------------------ */
/*  Mock git executor                                                 */
/* ------------------------------------------------------------------ */

function createMockGitExecutor(overrides?: {
  isGitRepo?: boolean;
  remoteUrl?: string | null;
  branch?: string | null;
  headRef?: string | null;
  cloneResult?: CloneExecResult;
}): GitExecutor {
  const isGit = overrides?.isGitRepo ?? true;
  const hasRemoteUrl = overrides !== undefined && "remoteUrl" in overrides;
  const hasBranch = overrides !== undefined && "branch" in overrides;
  const hasHeadRef = overrides !== undefined && "headRef" in overrides;
  return {
    async isGitRepo(): Promise<boolean> {
      return isGit;
    },
    async getRemoteUrl(): Promise<string | null> {
      return hasRemoteUrl ? overrides!.remoteUrl! : "https://github.com/test/repo.git";
    },
    async getCurrentBranch(): Promise<string | null> {
      return hasBranch ? overrides!.branch! : "main";
    },
    async getHeadRef(): Promise<string | null> {
      return hasHeadRef ? overrides!.headRef! : "abc1234";
    },
    async clone(): Promise<CloneExecResult> {
      return overrides?.cloneResult ?? { ok: true };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Temp directory helpers                                            */
/* ------------------------------------------------------------------ */

let tempDir: string;

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "phase21-test-"));
}

/* ------------------------------------------------------------------ */
/*  1. Path validation                                                */
/* ------------------------------------------------------------------ */

describe("validateLocalPath", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("accepts an existing directory", async () => {
    const result = await validateLocalPath(tempDir);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects empty string", async () => {
    const result = await validateLocalPath("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });

  it("rejects non-existent path", async () => {
    const result = await validateLocalPath("/tmp/definitely-not-a-real-path-xyz123");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not exist/i);
  });

  it("rejects a file path (not a directory)", async () => {
    // Use a known file that exists
    const filePath = join(tempDir, "testfile.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, "test");
    const result = await validateLocalPath(filePath);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a directory/i);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Clone URL validation                                           */
/* ------------------------------------------------------------------ */

describe("validateCloneUrl", () => {
  it("accepts https URL", () => {
    const result = validateCloneUrl("https://github.com/user/repo.git");
    expect(result.valid).toBe(true);
  });

  it("accepts http URL", () => {
    const result = validateCloneUrl("http://example.com/repo.git");
    expect(result.valid).toBe(true);
  });

  it("accepts git:// URL", () => {
    const result = validateCloneUrl("git://example.com/repo.git");
    expect(result.valid).toBe(true);
  });

  it("accepts SSH-style URL", () => {
    const result = validateCloneUrl("git@github.com:user/repo.git");
    expect(result.valid).toBe(true);
  });

  it("rejects empty string", () => {
    const result = validateCloneUrl("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });

  it("rejects file:// protocol", () => {
    const result = validateCloneUrl("file:///local/repo");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/file:\/\//i);
  });

  it("rejects unrecognized format", () => {
    const result = validateCloneUrl("just-some-random-text");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unrecognized/i);
  });

  it("rejects whitespace-only string", () => {
    const result = validateCloneUrl("   ");
    expect(result.valid).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Clone target validation                                        */
/* ------------------------------------------------------------------ */

describe("validateCloneTarget", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("accepts a non-existent absolute path", async () => {
    const target = join(tempDir, "new-clone-dir");
    const result = await validateCloneTarget(target);
    expect(result.valid).toBe(true);
  });

  it("rejects an existing directory", async () => {
    const result = await validateCloneTarget(tempDir);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already exists/i);
  });

  it("rejects relative path", async () => {
    const result = await validateCloneTarget("relative/path");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/absolute/i);
  });

  it("rejects empty string", async () => {
    const result = await validateCloneTarget("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Open workspace — existing git repo                             */
/* ------------------------------------------------------------------ */

describe("openWorkspace — git repo path", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("opens a valid directory detected as git repo", async () => {
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    expect(result.ok).toBe(true);
    expect(result.workspace).not.toBeNull();
    expect(result.workspace!.source).toBe("local_existing");
    expect(result.workspace!.status).toBe("ready");
    expect(result.workspace!.branch).toBe("main");
    expect(result.workspace!.ref).toBe("abc1234");
    expect(result.workspace!.cloneUrl).toBe("https://github.com/test/repo.git");
  });

  it("populates repository metadata for a git repo", async () => {
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    const meta = result.workspace!.repoMeta!;
    expect(meta.isGitRepo).toBe(true);
    expect(meta.repoPath).toBe(tempDir);
    expect(meta.remoteUrl).toBe("https://github.com/test/repo.git");
    expect(meta.branch).toBe("main");
    expect(meta.headRef).toBe("abc1234");
    expect(meta.readiness).toBe("ready");
    expect(meta.openedAt).toBeTruthy();
  });

  it("emits workspace_open_requested, workspace_opened, workspace_ready events", async () => {
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    const kinds = result.events.map((e) => e.kind);
    expect(kinds).toContain("workspace_open_requested");
    expect(kinds).toContain("workspace_opened");
    expect(kinds).toContain("workspace_ready");
  });

  it("detects detached HEAD state", async () => {
    const git = createMockGitExecutor({ isGitRepo: true, branch: "HEAD" });
    const result = await openWorkspace(tempDir, git);

    expect(result.workspace!.repoMeta!.branch).toBeNull();
    expect(result.workspace!.repoMeta!.notes).toContain("Detached HEAD state");
  });

  it("notes missing remote origin", async () => {
    const git = createMockGitExecutor({ isGitRepo: true, remoteUrl: null });
    const result = await openWorkspace(tempDir, git);

    expect(result.workspace!.repoMeta!.notes).toContain("No remote origin configured");
  });
});

/* ------------------------------------------------------------------ */
/*  5. Open workspace — generic directory                             */
/* ------------------------------------------------------------------ */

describe("openWorkspace — generic directory", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("opens a non-git directory as generic_directory source", async () => {
    const git = createMockGitExecutor({ isGitRepo: false });
    const result = await openWorkspace(tempDir, git);

    expect(result.ok).toBe(true);
    expect(result.workspace!.source).toBe("generic_directory");
    expect(result.workspace!.status).toBe("ready");
    expect(result.workspace!.repoMeta!.isGitRepo).toBe(false);
  });

  it("includes note about non-git directory", async () => {
    const git = createMockGitExecutor({ isGitRepo: false });
    const result = await openWorkspace(tempDir, git);

    expect(result.workspace!.repoMeta!.notes.length).toBeGreaterThan(0);
    expect(result.workspace!.repoMeta!.notes[0]).toMatch(/not a git repository/i);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Open workspace — invalid path                                  */
/* ------------------------------------------------------------------ */

describe("openWorkspace — invalid path", () => {
  it("returns error for non-existent path", async () => {
    const git = createMockGitExecutor();
    const result = await openWorkspace("/tmp/no-such-path-xyz-phase21", git);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not exist/i);
    expect(result.workspace).not.toBeNull();
    expect(result.workspace!.status).toBe("invalid");
  });

  it("emits workspace_invalid event for non-existent path", async () => {
    const git = createMockGitExecutor();
    const result = await openWorkspace("/tmp/no-such-path-xyz-phase21", git);

    const kinds = result.events.map((e) => e.kind);
    expect(kinds).toContain("workspace_open_requested");
    expect(kinds).toContain("workspace_invalid");
    expect(kinds).not.toContain("workspace_ready");
  });

  it("returns invalid workspace with readiness=invalid", async () => {
    const git = createMockGitExecutor();
    const result = await openWorkspace("/tmp/no-such-path-xyz-phase21", git);

    expect(result.workspace!.repoMeta!.readiness).toBe("invalid");
  });
});

/* ------------------------------------------------------------------ */
/*  7. Clone workspace — successful flow                              */
/* ------------------------------------------------------------------ */

describe("cloneWorkspace — success", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("clones successfully with all events", async () => {
    const targetPath = join(tempDir, "new-clone");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    expect(result.ok).toBe(true);
    expect(result.workspace).not.toBeNull();
    expect(result.workspace!.source).toBe("cloned");
    expect(result.workspace!.status).toBe("ready");
    expect(result.workspace!.cloneUrl).toBe("https://github.com/test/repo.git");
  });

  it("emits clone_requested, clone_started, clone_completed, workspace_ready", async () => {
    const targetPath = join(tempDir, "new-clone");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    const kinds = result.events.map((e) => e.kind);
    expect(kinds).toContain("clone_requested");
    expect(kinds).toContain("clone_started");
    expect(kinds).toContain("clone_completed");
    expect(kinds).toContain("workspace_ready");
  });

  it("populates metadata after successful clone", async () => {
    const targetPath = join(tempDir, "new-clone");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    const meta = result.workspace!.repoMeta!;
    expect(meta.isGitRepo).toBe(true);
    expect(meta.readiness).toBe("ready");
    expect(meta.remoteUrl).toBeTruthy();
  });

  it("passes branch option through to clone", async () => {
    const targetPath = join(tempDir, "new-clone");
    let clonedBranch: string | undefined;
    const git: GitExecutor = {
      ...createMockGitExecutor({ cloneResult: { ok: true } }),
      async clone(_url: string, _path: string, opts?: { branch?: string }): Promise<CloneExecResult> {
        clonedBranch = opts?.branch;
        return { ok: true };
      },
    };

    await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath, branch: "develop" },
      git,
    );

    expect(clonedBranch).toBe("develop");
  });
});

/* ------------------------------------------------------------------ */
/*  8. Clone workspace — failure handling                             */
/* ------------------------------------------------------------------ */

describe("cloneWorkspace — failure", () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  it("returns error on clone execution failure", async () => {
    const targetPath = join(tempDir, "fail-clone");
    const git = createMockGitExecutor({
      cloneResult: { ok: false, error: "Authentication failed" },
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Authentication failed");
    expect(result.workspace).not.toBeNull();
    expect(result.workspace!.status).toBe("invalid");
  });

  it("emits clone_failed event on execution failure", async () => {
    const targetPath = join(tempDir, "fail-clone");
    const git = createMockGitExecutor({
      cloneResult: { ok: false, error: "Timeout" },
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    const kinds = result.events.map((e) => e.kind);
    expect(kinds).toContain("clone_failed");
    expect(kinds).not.toContain("clone_completed");
    expect(kinds).not.toContain("workspace_ready");
  });

  it("sets readiness to unavailable on clone failure", async () => {
    const targetPath = join(tempDir, "fail-clone");
    const git = createMockGitExecutor({
      cloneResult: { ok: false, error: "Network error" },
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    expect(result.workspace!.repoMeta!.readiness).toBe("unavailable");
  });

  it("rejects invalid clone URL before attempting clone", async () => {
    const targetPath = join(tempDir, "bad-url");
    const git = createMockGitExecutor();
    const result = await cloneWorkspace(
      { url: "not-a-url", targetPath },
      git,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unrecognized/i);
  });

  it("rejects clone to existing directory", async () => {
    // tempDir already exists
    const git = createMockGitExecutor();
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath: tempDir },
      git,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already exists/i);
  });

  it("rejects clone to relative path", async () => {
    const git = createMockGitExecutor();
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath: "relative/path" },
      git,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/absolute/i);
  });
});

/* ------------------------------------------------------------------ */
/*  9. Workspace constructor helpers                                  */
/* ------------------------------------------------------------------ */

describe("workspace constructors (extended)", () => {
  it("openLocalWorkspace includes repoMeta: null", () => {
    const ws = openLocalWorkspace("/repo", { branch: "main" });
    expect(ws.repoMeta).toBeNull();
  });

  it("prepareCloneWorkspace includes repoMeta: null", () => {
    const ws = prepareCloneWorkspace("/target", "https://url.git");
    expect(ws.repoMeta).toBeNull();
  });

  it("openGenericDirectory includes repoMeta: null", () => {
    const ws = openGenericDirectory("/dir");
    expect(ws.repoMeta).toBeNull();
  });

  it("markWorkspaceBootstrapping sets status to bootstrapping", () => {
    const ws = prepareCloneWorkspace("/target", "https://url.git");
    const bootstrapping = markWorkspaceBootstrapping(ws);
    expect(bootstrapping.status).toBe("bootstrapping");
  });
});

/* ------------------------------------------------------------------ */
/*  10. isValidStatus includes bootstrapping                          */
/* ------------------------------------------------------------------ */

describe("isValidStatus (extended)", () => {
  it("accepts bootstrapping as valid status", () => {
    expect(isValidStatus("bootstrapping")).toBe(true);
  });

  it("still accepts all previous statuses", () => {
    expect(isValidStatus("pending")).toBe(true);
    expect(isValidStatus("ready")).toBe(true);
    expect(isValidStatus("invalid")).toBe(true);
    expect(isValidStatus("closed")).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(isValidStatus("unknown")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  11. Session event factories                                       */
/* ------------------------------------------------------------------ */

describe("workspace lifecycle event factories", () => {
  it("workspaceOpenRequested has correct kind and includes path in detail", () => {
    const event = workspaceOpenRequested("/my/path");
    expect(event.kind).toBe("workspace_open_requested");
    expect(event.detail?.path).toBe("/my/path");
    expect(event.timestamp).toBeTruthy();
  });

  it("workspaceOpened has correct kind and isGitRepo in detail", () => {
    const event = workspaceOpened("/my/path", true);
    expect(event.kind).toBe("workspace_opened");
    expect(event.detail?.isGitRepo).toBe(true);
  });

  it("workspaceInvalid has correct kind and reason in detail", () => {
    const event = workspaceInvalidEvent("/my/path", "Not found");
    expect(event.kind).toBe("workspace_invalid");
    expect(event.detail?.reason).toBe("Not found");
  });

  it("cloneRequested has correct kind with url and targetPath", () => {
    const event = cloneRequested("https://url.git", "/target");
    expect(event.kind).toBe("clone_requested");
    expect(event.detail?.url).toBe("https://url.git");
    expect(event.detail?.targetPath).toBe("/target");
  });

  it("cloneStarted has correct kind", () => {
    const event = cloneStarted("https://url.git", "/target");
    expect(event.kind).toBe("clone_started");
  });

  it("cloneCompleted has correct kind", () => {
    const event = cloneCompleted("https://url.git", "/target");
    expect(event.kind).toBe("clone_completed");
  });

  it("cloneFailed has correct kind with reason", () => {
    const event = cloneFailed("https://url.git", "Auth error");
    expect(event.kind).toBe("clone_failed");
    expect(event.detail?.reason).toBe("Auth error");
  });

  it("workspaceReady has correct kind", () => {
    const event = workspaceReady("/my/path");
    expect(event.kind).toBe("workspace_ready");
    expect(event.detail?.path).toBe("/my/path");
  });
});

/* ------------------------------------------------------------------ */
/*  12. Session integration — workspace lifecycle                     */
/* ------------------------------------------------------------------ */

describe("SessionManager — workspace lifecycle integration", () => {
  let mgr: SessionManager;

  beforeEach(async () => {
    _resetIdCounter();
    mgr = new SessionManager();
    tempDir = await createTempDir();
  });

  it("records open-workspace events on session timeline", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    mgr.appendEvents(session.id, result.events);
    if (result.workspace) {
      mgr.bindWorkspace(session.id, result.workspace);
    }

    const updated = mgr.getSession(session.id)!;
    const kinds = updated.events.map((e) => e.kind);
    expect(kinds).toContain("workspace_open_requested");
    expect(kinds).toContain("workspace_opened");
    expect(kinds).toContain("workspace_ready");
    expect(kinds).toContain("workspace_bound");
  });

  it("records clone-workspace events on session timeline", async () => {
    const session = mgr.createSession();
    const targetPath = join(tempDir, "clone-target");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    mgr.appendEvents(session.id, result.events);
    if (result.workspace) {
      mgr.bindWorkspace(session.id, result.workspace);
    }

    const updated = mgr.getSession(session.id)!;
    const kinds = updated.events.map((e) => e.kind);
    expect(kinds).toContain("clone_requested");
    expect(kinds).toContain("clone_started");
    expect(kinds).toContain("clone_completed");
    expect(kinds).toContain("workspace_ready");
    expect(kinds).toContain("workspace_bound");
  });

  it("records clone-failure events on session timeline", async () => {
    const session = mgr.createSession();
    const targetPath = join(tempDir, "fail-target");
    const git = createMockGitExecutor({
      cloneResult: { ok: false, error: "Permission denied" },
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    mgr.appendEvents(session.id, result.events);

    const updated = mgr.getSession(session.id)!;
    const kinds = updated.events.map((e) => e.kind);
    expect(kinds).toContain("clone_failed");
    expect(kinds).not.toContain("clone_completed");
  });

  it("records workspace_invalid event for failed open", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor();
    const result = await openWorkspace("/nonexistent/path/xyz", git);

    mgr.appendEvents(session.id, result.events);

    const updated = mgr.getSession(session.id)!;
    const kinds = updated.events.map((e) => e.kind);
    expect(kinds).toContain("workspace_invalid");
  });
});

/* ------------------------------------------------------------------ */
/*  13. SessionSummary — workspace metadata exposure                  */
/* ------------------------------------------------------------------ */

describe("SessionSummary — workspace metadata", () => {
  let mgr: SessionManager;

  beforeEach(async () => {
    _resetIdCounter();
    mgr = new SessionManager();
    tempDir = await createTempDir();
  });

  it("exposes workspaceReadiness in summary after open", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    mgr.appendEvents(session.id, result.events);
    mgr.bindWorkspace(session.id, result.workspace!);

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspaceReadiness).toBe("ready");
    expect(summary.workspaceIsGitRepo).toBe(true);
    expect(summary.workspaceRemoteUrl).toBe("https://github.com/test/repo.git");
    expect(summary.workspaceBranch).toBe("main");
  });

  it("exposes workspaceReadiness as null when no workspace bound", () => {
    const session = mgr.createSession();
    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspaceReadiness).toBeNull();
    expect(summary.workspaceIsGitRepo).toBeNull();
    expect(summary.workspaceRemoteUrl).toBeNull();
  });

  it("exposes workspace path, source, status after clone", async () => {
    const session = mgr.createSession();
    const targetPath = join(tempDir, "clone-sum");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    mgr.appendEvents(session.id, result.events);
    mgr.bindWorkspace(session.id, result.workspace!);

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspacePath).toBe(targetPath);
    expect(summary.workspaceSource).toBe("cloned");
    expect(summary.workspaceStatus).toBe("ready");
    expect(summary.workspaceReadiness).toBe("ready");
  });

  it("exposes generic directory workspace info in summary", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor({ isGitRepo: false });
    const result = await openWorkspace(tempDir, git);

    mgr.bindWorkspace(session.id, result.workspace!);

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspaceSource).toBe("generic_directory");
    expect(summary.workspaceIsGitRepo).toBe(false);
  });

  it("exposes workspace_branch from repoMeta when available", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor({ isGitRepo: true, branch: "feature-x" });
    const result = await openWorkspace(tempDir, git);

    mgr.bindWorkspace(session.id, result.workspace!);

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspaceBranch).toBe("feature-x");
  });
});

/* ------------------------------------------------------------------ */
/*  14. Workspace state transitions                                   */
/* ------------------------------------------------------------------ */

describe("workspace state transitions", () => {
  it("pending → bootstrapping → ready", () => {
    const ws = prepareCloneWorkspace("/path", "https://url.git");
    expect(ws.status).toBe("pending");
    const bootstrapping = markWorkspaceBootstrapping(ws);
    expect(bootstrapping.status).toBe("bootstrapping");
    const ready = markWorkspaceReady(bootstrapping);
    expect(ready.status).toBe("ready");
  });

  it("pending → invalid", () => {
    const ws = prepareCloneWorkspace("/path", "https://url.git");
    const invalid = markWorkspaceInvalid(ws);
    expect(invalid.status).toBe("invalid");
  });

  it("ready → closed", () => {
    const ws = openLocalWorkspace("/repo");
    const closed = markWorkspaceClosed(ws);
    expect(closed.status).toBe("closed");
  });

  it("bootstrapping → invalid (clone failure)", () => {
    const ws = markWorkspaceBootstrapping(prepareCloneWorkspace("/path", "https://url.git"));
    const invalid = markWorkspaceInvalid(ws);
    expect(invalid.status).toBe("invalid");
  });
});

/* ------------------------------------------------------------------ */
/*  15. Server endpoint shapes (unit-level)                           */
/* ------------------------------------------------------------------ */

describe("server workspace endpoints — handleRequest routing", () => {

  function mockReq(method: string, url: string, body?: string): import("node:http").IncomingMessage {
    const readable = new Readable({ read() {} });
    Object.assign(readable, {
      method,
      url,
      headers: { host: "localhost:3000", "content-type": "application/json" },
    });
    if (body !== undefined) {
      process.nextTick(() => {
        readable.push(body);
        readable.push(null);
      });
    } else {
      process.nextTick(() => readable.push(null));
    }
    return readable as unknown as import("node:http").IncomingMessage;
  }

  function mockRes(): { _body: string; _status: number; writeHead: (s: number, h?: Record<string, string>) => unknown; end: (b?: string) => void } & import("node:http").ServerResponse {
    const res = {
      _body: "",
      _status: 200,
      _headers: {} as Record<string, string>,
      writeHead(status: number, headers?: Record<string, string>) {
        res._status = status;
        if (headers) Object.assign(res._headers, headers);
        return res;
      },
      end(body?: string) {
        if (body) res._body = body;
      },
    };
    return res as unknown as { _body: string; _status: number; writeHead: (s: number, h?: Record<string, string>) => unknown; end: (b?: string) => void } & import("node:http").ServerResponse;
  }

  it("POST /api/workspace/validate-url returns valid for https URL", async () => {
    const req = mockReq("POST", "/api/workspace/validate-url", JSON.stringify({ url: "https://github.com/test/repo.git" }));
    const res = mockRes();
    handleRequest(req, res);
    // Wait for async body parsing
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(res._body);
    expect(parsed.valid).toBe(true);
  });

  it("POST /api/workspace/validate-url returns invalid for bad URL", async () => {
    const req = mockReq("POST", "/api/workspace/validate-url", JSON.stringify({ url: "not-a-url" }));
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    const parsed = JSON.parse(res._body);
    expect(parsed.valid).toBe(false);
  });

  it("POST /api/workspace/validate-path returns 400 for missing path", async () => {
    const req = mockReq("POST", "/api/workspace/validate-path", JSON.stringify({}));
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(400);
  });

  it("POST /api/workspace/open returns 400 for missing path", async () => {
    const req = mockReq("POST", "/api/workspace/open", JSON.stringify({}));
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(400);
  });

  it("POST /api/workspace/clone returns 400 for missing url", async () => {
    const req = mockReq("POST", "/api/workspace/clone", JSON.stringify({ targetPath: "/target" }));
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(400);
  });

  it("POST /api/workspace/clone returns 400 for missing targetPath", async () => {
    const req = mockReq("POST", "/api/workspace/clone", JSON.stringify({ url: "https://example.com/repo.git" }));
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(400);
  });

  it("GET /api/workspace/state/unknown returns 404", async () => {
    const req = mockReq("GET", "/api/workspace/state/unknown-session-id");
    const res = mockRes();
    handleRequest(req, res);
    await new Promise((r) => setTimeout(r, 50));
    expect(res._status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/*  16. Full lifecycle integration test                               */
/* ------------------------------------------------------------------ */

describe("full lifecycle integration — open → session → summary", () => {
  let mgr: SessionManager;

  beforeEach(async () => {
    _resetIdCounter();
    mgr = new SessionManager();
    tempDir = await createTempDir();
  });

  it("open repo → bind → summary has full workspace info", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor({
      isGitRepo: true,
      remoteUrl: "https://github.com/my-org/my-repo.git",
      branch: "main",
      headRef: "def5678",
    });
    const result = await openWorkspace(tempDir, git);
    expect(result.ok).toBe(true);

    // Append events and bind workspace
    mgr.appendEvents(session.id, result.events);
    mgr.bindWorkspace(session.id, result.workspace!);
    mgr.updateStage(session.id, "workspace_binding");
    mgr.updateStatus(session.id, "active");

    // Get summary
    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspacePath).toBe(tempDir);
    expect(summary.workspaceSource).toBe("local_existing");
    expect(summary.workspaceStatus).toBe("ready");
    expect(summary.workspaceReadiness).toBe("ready");
    expect(summary.workspaceIsGitRepo).toBe(true);
    expect(summary.workspaceRemoteUrl).toBe("https://github.com/my-org/my-repo.git");
    expect(summary.workspaceBranch).toBe("main");
    expect(summary.stage).toBe("workspace_binding");
    expect(summary.status).toBe("active");
    expect(summary.eventCount).toBeGreaterThan(3); // session_created + 3 workspace events + workspace_bound
  });

  it("clone → bind → summary has cloned workspace info", async () => {
    const session = mgr.createSession();
    const targetPath = join(tempDir, "clone-int");
    const git = createMockGitExecutor({
      cloneResult: { ok: true },
      remoteUrl: "https://github.com/my-org/my-repo.git",
      branch: "develop",
      headRef: "fff9999",
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/my-org/my-repo.git", targetPath, branch: "develop" },
      git,
    );
    expect(result.ok).toBe(true);

    mgr.appendEvents(session.id, result.events);
    mgr.bindWorkspace(session.id, result.workspace!);
    mgr.updateStage(session.id, "workspace_binding");
    mgr.updateStatus(session.id, "active");

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.workspacePath).toBe(targetPath);
    expect(summary.workspaceSource).toBe("cloned");
    expect(summary.workspaceStatus).toBe("ready");
    expect(summary.workspaceRemoteUrl).toBe("https://github.com/my-org/my-repo.git");
    expect(summary.workspaceBranch).toBe("develop");
  });

  it("failed open → session gets failure events but remains queryable", async () => {
    const session = mgr.createSession();
    const git = createMockGitExecutor();
    const result = await openWorkspace("/nonexistent/xyz", git);

    mgr.appendEvents(session.id, result.events);
    if (result.workspace) {
      mgr.bindWorkspace(session.id, result.workspace);
    }
    mgr.updateStatus(session.id, "failed");

    const summary = mgr.getSessionSummary(session.id);
    expect(summary.status).toBe("failed");
    expect(summary.workspaceStatus).toBe("invalid");
    expect(summary.workspaceReadiness).toBe("invalid");
  });
});

/* ------------------------------------------------------------------ */
/*  17. Event ordering                                                */
/* ------------------------------------------------------------------ */

describe("workspace lifecycle event ordering", () => {
  it("open events are in correct order", async () => {
    tempDir = await createTempDir();
    const git = createMockGitExecutor({ isGitRepo: true });
    const result = await openWorkspace(tempDir, git);

    const kinds = result.events.map((e) => e.kind);
    expect(kinds[0]).toBe("workspace_open_requested");
    expect(kinds[1]).toBe("workspace_opened");
    expect(kinds[2]).toBe("workspace_ready");
  });

  it("clone success events are in correct order", async () => {
    tempDir = await createTempDir();
    const targetPath = join(tempDir, "order-clone");
    const git = createMockGitExecutor({ cloneResult: { ok: true } });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    const kinds = result.events.map((e) => e.kind);
    expect(kinds[0]).toBe("clone_requested");
    expect(kinds[1]).toBe("clone_started");
    expect(kinds[2]).toBe("clone_completed");
    expect(kinds[3]).toBe("workspace_ready");
  });

  it("clone failure events are in correct order", async () => {
    tempDir = await createTempDir();
    const targetPath = join(tempDir, "order-fail");
    const git = createMockGitExecutor({
      cloneResult: { ok: false, error: "fail" },
    });
    const result = await cloneWorkspace(
      { url: "https://github.com/test/repo.git", targetPath },
      git,
    );

    const kinds = result.events.map((e) => e.kind);
    expect(kinds[0]).toBe("clone_requested");
    expect(kinds[1]).toBe("clone_started");
    expect(kinds[2]).toBe("clone_failed");
  });
});
