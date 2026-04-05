/**
 * Workspace creation helpers.
 *
 * Phase 19 models workspace identity; it does NOT fully execute clone
 * operations. The domain makes room for open-existing, clone-into, and
 * generic-directory patterns.
 */

import type { Workspace, WorkspaceSource, WorkspaceStatus } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Constructors                                                      */
/* ------------------------------------------------------------------ */

/** Create a workspace for an existing local directory / repository. */
export function openLocalWorkspace(
  path: string,
  opts?: { branch?: string; ref?: string },
): Workspace {
  return {
    path,
    source: "local_existing",
    status: "ready",
    branch: opts?.branch ?? null,
    ref: opts?.ref ?? null,
    cloneUrl: null,
  };
}

/** Model a workspace that will be populated by a future clone operation. */
export function prepareCloneWorkspace(
  targetPath: string,
  cloneUrl: string,
  opts?: { branch?: string; ref?: string },
): Workspace {
  return {
    path: targetPath,
    source: "cloned",
    status: "pending",
    branch: opts?.branch ?? null,
    ref: opts?.ref ?? null,
    cloneUrl,
  };
}

/** Mark a pending clone workspace as ready after clone execution. */
export function markWorkspaceReady(ws: Workspace): Workspace {
  return { ...ws, status: "ready" };
}

/** Mark a workspace as invalid (e.g. missing directory, corrupt state). */
export function markWorkspaceInvalid(ws: Workspace): Workspace {
  return { ...ws, status: "invalid" };
}

/** Mark a workspace as closed (session is done with it). */
export function markWorkspaceClosed(ws: Workspace): Workspace {
  return { ...ws, status: "closed" };
}

/** Create a generic local directory workspace (not a git repo). */
export function openGenericDirectory(
  path: string,
): Workspace {
  return {
    path,
    source: "generic_directory",
    status: "ready",
    branch: null,
    ref: null,
    cloneUrl: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Predicates                                                        */
/* ------------------------------------------------------------------ */

export function isWorkspaceReady(ws: Workspace): boolean {
  return ws.status === "ready";
}

export function isCloneWorkspace(ws: Workspace): boolean {
  return ws.source === "cloned";
}

/** Validate the source value is one of the known WorkspaceSource types. */
export function isValidSource(s: string): s is WorkspaceSource {
  return s === "local_existing" || s === "cloned" || s === "generic_directory";
}

/** Validate the status value is one of the known WorkspaceStatus types. */
export function isValidStatus(s: string): s is WorkspaceStatus {
  return s === "pending" || s === "ready" || s === "invalid" || s === "closed";
}
