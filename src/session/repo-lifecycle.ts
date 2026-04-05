/**
 * Repository open/clone lifecycle.
 *
 * Thin, local-first operations for:
 * - Opening an existing local directory or git repository as a workspace
 * - Cloning a remote repository to a local path
 * - Validating paths and URLs
 * - Emitting session events for workspace lifecycle transitions
 *
 * This module does NOT:
 * - Execute install commands
 * - Manage credentials
 * - Queue background jobs
 * - Perform branch mutation beyond minimal clone support
 */

import { execFile } from "node:child_process";
import { stat, access } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";

import type {
  Workspace,
  RepositoryMeta,
  SessionEvent,
} from "./types.js";
import {
  workspaceOpenRequested,
  workspaceOpened,
  workspaceInvalid,
  cloneRequested,
  cloneStarted,
  cloneCompleted,
  cloneFailed,
  workspaceReady,
} from "./events.js";

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                */
/* ------------------------------------------------------------------ */

/** Result of a validation check. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Validate a local filesystem path for use as a workspace.
 * Checks: non-empty, absolute, exists, is a directory.
 */
export async function validateLocalPath(rawPath: string): Promise<ValidationResult> {
  if (!rawPath || typeof rawPath !== "string") {
    return { valid: false, error: "Path must be a non-empty string" };
  }
  const resolved = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
  try {
    await access(resolved);
  } catch {
    return { valid: false, error: `Path does not exist: ${resolved}` };
  }
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${resolved}` };
    }
  } catch {
    return { valid: false, error: `Cannot stat path: ${resolved}` };
  }
  return { valid: true };
}

/**
 * Validate a clone URL.
 * Allows https://, http://, git://, and ssh-style (git@host:path) URLs.
 * Blocks file:// and empty strings.
 */
export function validateCloneUrl(url: string): ValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Clone URL must be a non-empty string" };
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Clone URL must be a non-empty string" };
  }

  // Block file:// protocol
  if (trimmed.startsWith("file://")) {
    return { valid: false, error: "file:// clone URLs are not allowed" };
  }

  // Allow https://, http://, git://
  if (/^https?:\/\/.+/i.test(trimmed)) return { valid: true };
  if (/^git:\/\/.+/i.test(trimmed)) return { valid: true };

  // Allow SSH-style: git@host:user/repo.git
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:.+/.test(trimmed)) return { valid: true };

  return { valid: false, error: `Unrecognized clone URL format: ${trimmed}` };
}

/**
 * Validate a clone target path.
 * Must be absolute and must NOT already exist (to avoid collisions).
 */
export async function validateCloneTarget(targetPath: string): Promise<ValidationResult> {
  if (!targetPath || typeof targetPath !== "string") {
    return { valid: false, error: "Clone target path must be a non-empty string" };
  }
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: `Clone target must be an absolute path: ${targetPath}` };
  }
  try {
    await access(targetPath);
    return { valid: false, error: `Clone target already exists: ${targetPath}` };
  } catch {
    // Not existing is the expected good case
    return { valid: true };
  }
}

/* ------------------------------------------------------------------ */
/*  Git detection                                                     */
/* ------------------------------------------------------------------ */

/**
 * Interface for git operations.
 * Default implementation uses real `git` commands.
 * Can be replaced in tests with a mock/fake.
 */
export interface GitExecutor {
  /** Check if a path is inside a git work tree. */
  isGitRepo(path: string): Promise<boolean>;
  /** Get the remote origin URL. */
  getRemoteUrl(path: string): Promise<string | null>;
  /** Get the current branch name. */
  getCurrentBranch(path: string): Promise<string | null>;
  /** Get the current HEAD ref (short SHA). */
  getHeadRef(path: string): Promise<string | null>;
  /** Clone a repository from url to targetPath. */
  clone(url: string, targetPath: string, opts?: { branch?: string }): Promise<CloneExecResult>;
}

export interface CloneExecResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Execute a git command and return stdout (trimmed), or null on failure.
 */
function execGit(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 30_000 }, (err, stdout) => {
      if (err) {
        resolve(null);
      } else {
        resolve((stdout ?? "").trim() || null);
      }
    });
  });
}

/** Default git executor using real `git` commands. */
export const defaultGitExecutor: GitExecutor = {
  async isGitRepo(path: string): Promise<boolean> {
    const result = await execGit(["rev-parse", "--is-inside-work-tree"], path);
    return result === "true";
  },

  async getRemoteUrl(path: string): Promise<string | null> {
    return execGit(["config", "--get", "remote.origin.url"], path);
  },

  async getCurrentBranch(path: string): Promise<string | null> {
    return execGit(["rev-parse", "--abbrev-ref", "HEAD"], path);
  },

  async getHeadRef(path: string): Promise<string | null> {
    return execGit(["rev-parse", "--short", "HEAD"], path);
  },

  async clone(
    url: string,
    targetPath: string,
    opts?: { branch?: string },
  ): Promise<CloneExecResult> {
    return new Promise((resolve) => {
      const args = ["clone", "--single-branch"];
      if (opts?.branch) {
        args.push("--branch", opts.branch);
      }
      args.push(url, targetPath);
      execFile("git", args, { timeout: 300_000 }, (err) => {
        if (err) {
          resolve({
            ok: false,
            error: err.message ?? "Clone failed",
          });
        } else {
          resolve({ ok: true });
        }
      });
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Repository metadata builder                                       */
/* ------------------------------------------------------------------ */

async function buildRepoMeta(
  path: string,
  git: GitExecutor,
): Promise<RepositoryMeta> {
  const isGit = await git.isGitRepo(path);
  const notes: string[] = [];

  if (!isGit) {
    return {
      isGitRepo: false,
      repoPath: path,
      remoteUrl: null,
      branch: null,
      headRef: null,
      openedAt: new Date().toISOString(),
      readiness: "ready",
      notes: ["Not a git repository; treated as generic directory workspace"],
    };
  }

  const [remoteUrl, branch, headRef] = await Promise.all([
    git.getRemoteUrl(path),
    git.getCurrentBranch(path),
    git.getHeadRef(path),
  ]);

  if (!remoteUrl) {
    notes.push("No remote origin configured");
  }
  if (branch === "HEAD") {
    notes.push("Detached HEAD state");
  }

  return {
    isGitRepo: true,
    repoPath: path,
    remoteUrl,
    branch: branch === "HEAD" ? null : branch,
    headRef,
    openedAt: new Date().toISOString(),
    readiness: "ready",
    notes,
  };
}

/* ------------------------------------------------------------------ */
/*  Open workspace flow                                               */
/* ------------------------------------------------------------------ */

/** Result of an open-workspace operation. */
export interface OpenWorkspaceResult {
  readonly ok: boolean;
  readonly workspace: Workspace | null;
  readonly events: SessionEvent[];
  readonly error?: string;
}

/**
 * Open an existing local path as a workspace.
 *
 * Steps:
 * 1. Emit workspace_open_requested
 * 2. Validate path exists and is a directory
 * 3. Detect if it's a git repository
 * 4. Build repository metadata
 * 5. Create workspace with appropriate source
 * 6. Emit workspace_opened or workspace_invalid
 * 7. Emit workspace_ready if valid
 */
export async function openWorkspace(
  rawPath: string,
  git: GitExecutor = defaultGitExecutor,
): Promise<OpenWorkspaceResult> {
  const events: SessionEvent[] = [];
  const resolvedPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);

  events.push(workspaceOpenRequested(resolvedPath));

  // Validate
  const pathValidation = await validateLocalPath(resolvedPath);
  if (!pathValidation.valid) {
    events.push(workspaceInvalid(resolvedPath, pathValidation.error!));
    return {
      ok: false,
      workspace: {
        path: resolvedPath,
        source: "local_existing",
        status: "invalid",
        branch: null,
        ref: null,
        cloneUrl: null,
        repoMeta: {
          isGitRepo: false,
          repoPath: resolvedPath,
          remoteUrl: null,
          branch: null,
          headRef: null,
          openedAt: new Date().toISOString(),
          readiness: "invalid",
          notes: [pathValidation.error!],
        },
      },
      events,
      error: pathValidation.error,
    };
  }

  // Detect and build metadata
  const meta = await buildRepoMeta(resolvedPath, git);

  const workspace: Workspace = {
    path: resolvedPath,
    source: meta.isGitRepo ? "local_existing" : "generic_directory",
    status: "ready",
    branch: meta.branch,
    ref: meta.headRef,
    cloneUrl: meta.remoteUrl,
    repoMeta: meta,
  };

  events.push(workspaceOpened(resolvedPath, meta.isGitRepo));
  events.push(workspaceReady(resolvedPath));

  return {
    ok: true,
    workspace,
    events,
  };
}

/* ------------------------------------------------------------------ */
/*  Clone workspace flow                                              */
/* ------------------------------------------------------------------ */

/** Clone request model. */
export interface CloneRequest {
  /** Remote URL to clone from. */
  readonly url: string;
  /** Target local path for the clone. */
  readonly targetPath: string;
  /** Optional branch to clone. */
  readonly branch?: string;
}

/** Result of a clone-workspace operation. */
export interface CloneWorkspaceResult {
  readonly ok: boolean;
  readonly workspace: Workspace | null;
  readonly events: SessionEvent[];
  readonly error?: string;
}

/**
 * Clone a remote repository to a local path and create a workspace.
 *
 * Steps:
 * 1. Validate clone URL
 * 2. Validate target path (must not already exist)
 * 3. Emit clone_requested
 * 4. Emit clone_started
 * 5. Execute git clone
 * 6. On success: build repo metadata, emit clone_completed + workspace_ready
 * 7. On failure: emit clone_failed
 */
export async function cloneWorkspace(
  request: CloneRequest,
  git: GitExecutor = defaultGitExecutor,
): Promise<CloneWorkspaceResult> {
  const events: SessionEvent[] = [];

  // Validate URL
  const urlValidation = validateCloneUrl(request.url);
  if (!urlValidation.valid) {
    events.push(cloneFailed(request.url, urlValidation.error!));
    return {
      ok: false,
      workspace: null,
      events,
      error: urlValidation.error,
    };
  }

  // Validate target path
  const targetValidation = await validateCloneTarget(request.targetPath);
  if (!targetValidation.valid) {
    events.push(cloneFailed(request.url, targetValidation.error!));
    return {
      ok: false,
      workspace: null,
      events,
      error: targetValidation.error,
    };
  }

  events.push(cloneRequested(request.url, request.targetPath));
  events.push(cloneStarted(request.url, request.targetPath));

  // Create pending workspace
  const pendingWorkspace: Workspace = {
    path: request.targetPath,
    source: "cloned",
    status: "bootstrapping",
    branch: request.branch ?? null,
    ref: null,
    cloneUrl: request.url,
    repoMeta: {
      isGitRepo: false,
      repoPath: request.targetPath,
      remoteUrl: request.url,
      branch: request.branch ?? null,
      headRef: null,
      openedAt: new Date().toISOString(),
      readiness: "bootstrapping",
      notes: ["Clone in progress"],
    },
  };

  // Execute clone
  const result = await git.clone(
    request.url,
    request.targetPath,
    request.branch ? { branch: request.branch } : undefined,
  );

  if (!result.ok) {
    events.push(cloneFailed(request.url, result.error ?? "Clone failed"));
    const failedWs: Workspace = {
      ...pendingWorkspace,
      status: "invalid",
      repoMeta: {
        ...pendingWorkspace.repoMeta!,
        readiness: "unavailable",
        notes: [`Clone failed: ${result.error ?? "Unknown error"}`],
      },
    };
    return {
      ok: false,
      workspace: failedWs,
      events,
      error: result.error,
    };
  }

  // Clone succeeded — build metadata from the cloned repo
  const meta = await buildRepoMeta(request.targetPath, git);

  const workspace: Workspace = {
    path: request.targetPath,
    source: "cloned",
    status: "ready",
    branch: meta.branch ?? request.branch ?? null,
    ref: meta.headRef,
    cloneUrl: request.url,
    repoMeta: {
      ...meta,
      remoteUrl: meta.remoteUrl ?? request.url,
      openedAt: pendingWorkspace.repoMeta!.openedAt,
    },
  };

  events.push(cloneCompleted(request.url, request.targetPath));
  events.push(workspaceReady(request.targetPath));

  return {
    ok: true,
    workspace,
    events,
  };
}
