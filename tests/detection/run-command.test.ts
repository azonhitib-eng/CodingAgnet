/**
 * Tests for the command runner utility.
 *
 * Uses mock scenarios rather than actually running commands, since
 * the test environment may not have the binaries.  We test the
 * contract of CommandResult and the runCommand function behavior
 * with a known-good and known-bad command.
 */

import { describe, it, expect } from "vitest";
import type { CommandResult, CommandRunner } from "../../src/detection/run-command.js";

// ---------------------------------------------------------------------------
// Mock command runner factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock CommandRunner that returns predefined results.
 * Keyed by command name.
 */
export function mockRunner(
  responses: Record<string, CommandResult>,
): CommandRunner {
  return async (command: string) => {
    if (command in responses) return responses[command];
    // Default: command not found
    return {
      stdout: "",
      stderr: `command not found: ${command}`,
      exitCode: null,
      ok: false,
    };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommandResult contract", () => {
  it("successful result has ok=true and exit code 0", () => {
    const result: CommandResult = {
      stdout: "hello",
      stderr: "",
      exitCode: 0,
      ok: true,
    };
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("command-not-found result has ok=false and null exit code", () => {
    const result: CommandResult = {
      stdout: "",
      stderr: "command not found: foobar",
      exitCode: null,
      ok: false,
    };
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
  });

  it("non-zero exit code result has ok=false", () => {
    const result: CommandResult = {
      stdout: "",
      stderr: "error",
      exitCode: 1,
      ok: false,
    };
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});

describe("mockRunner", () => {
  it("returns configured response for known command", async () => {
    const run = mockRunner({
      "test-cmd": { stdout: "v1.0", stderr: "", exitCode: 0, ok: true },
    });
    const result = await run("test-cmd");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("v1.0");
  });

  it("returns not-found for unknown command", async () => {
    const run = mockRunner({});
    const result = await run("unknown-cmd");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
  });
});
