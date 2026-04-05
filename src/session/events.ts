/**
 * Session event factory functions.
 *
 * Pure helpers to produce typed {@link SessionEvent} instances without
 * polluting call-sites with repeated boilerplate.
 */

import type { SessionEvent, SessionEventKind } from "./types.js";

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

/** Create a session event with the current timestamp. */
export function createEvent(
  kind: SessionEventKind,
  message: string,
  detail?: Record<string, unknown>,
): SessionEvent {
  return {
    kind,
    timestamp: new Date().toISOString(),
    message,
    ...(detail !== undefined ? { detail } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Convenience constructors                                          */
/* ------------------------------------------------------------------ */

export const sessionCreated = (id: string): SessionEvent =>
  createEvent("session_created", `Session ${id} created`, { sessionId: id });

export const workspaceBound = (path: string, source: string): SessionEvent =>
  createEvent("workspace_bound", `Workspace bound: ${path}`, { path, source });

export const hostDetected = (summary: string): SessionEvent =>
  createEvent("host_detected", summary);

export const catalogsLoaded = (count: number): SessionEvent =>
  createEvent("catalogs_loaded", `${count} catalog entries loaded`, { count });

export const workflowStarted = (): SessionEvent =>
  createEvent("workflow_started", "Workflow execution started");

export const stageCompleted = (stage: string): SessionEvent =>
  createEvent("stage_completed", `Stage completed: ${stage}`, { stage });

export const requiresApproval = (reason: string): SessionEvent =>
  createEvent("requires_approval", reason);

export const blockedEvent = (reason: string): SessionEvent =>
  createEvent("blocked", reason);

export const failedEvent = (reason: string): SessionEvent =>
  createEvent("failed", reason);

export const completedEvent = (): SessionEvent =>
  createEvent("completed", "Session completed successfully");

export const noteEvent = (message: string): SessionEvent =>
  createEvent("note", message);

export const infoEvent = (message: string): SessionEvent =>
  createEvent("info", message);

export const warningEvent = (message: string): SessionEvent =>
  createEvent("warning", message);
