/**
 * Session integration for commands.
 *
 * Phase 28: Produces session events when commands are submitted or completed.
 * Maps command lifecycle to the existing session event model.
 */

import type { SessionEvent, SessionEventKind } from "../session/types.js";
import { createEvent } from "../session/events.js";
import type { CommandId, CommandExecutionResult } from "./types.js";

/* ------------------------------------------------------------------ */
/*  New event kinds for command lifecycle                               */
/* ------------------------------------------------------------------ */

/** Additional event kinds introduced by Phase 28 for command lifecycle. */
export const COMMAND_EVENT_KINDS: readonly SessionEventKind[] = [
  "info",   // command_submitted events reuse "info"
  "note",   // command_completed events reuse "note"
  "failed", // command_failed events reuse "failed"
  "warning", // validation_failed events reuse "warning"
] as const;

/* ------------------------------------------------------------------ */
/*  Event factories                                                    */
/* ------------------------------------------------------------------ */

/** Create a session event when a command is submitted. */
export function commandSubmitted(commandId: CommandId, label: string): SessionEvent {
  return createEvent("info", `Command submitted: ${label}`, {
    commandId,
    commandAction: "submitted",
  });
}

/** Create a session event when a command completes successfully. */
export function commandCompleted(commandId: CommandId, message: string): SessionEvent {
  return createEvent("note", `Command completed: ${message}`, {
    commandId,
    commandAction: "completed",
  });
}

/** Create a session event when a command fails. */
export function commandFailed(commandId: CommandId, message: string): SessionEvent {
  return createEvent("failed", `Command failed: ${message}`, {
    commandId,
    commandAction: "failed",
  });
}

/** Create a session event when command validation fails. */
export function commandValidationFailed(commandId: CommandId, errors: readonly string[]): SessionEvent {
  return createEvent("warning", `Command validation failed: ${errors.join("; ")}`, {
    commandId,
    commandAction: "validation_failed",
    errors,
  });
}

/** Map a CommandExecutionResult to a session event. */
export function resultToSessionEvent(result: CommandExecutionResult): SessionEvent {
  switch (result.status) {
    case "completed":
      return commandCompleted(result.commandId, result.message);
    case "failed":
      return commandFailed(result.commandId, result.message);
    case "validation_failed":
      return commandValidationFailed(result.commandId, [result.message]);
    default:
      return createEvent("info", `Command ${result.commandId}: ${result.message}`, {
        commandId: result.commandId,
        commandAction: result.status,
      });
  }
}
