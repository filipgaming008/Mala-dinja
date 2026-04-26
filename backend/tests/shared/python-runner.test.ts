import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/shared/errors/AppError.js";
import { runPythonJson } from "../../src/shared/python/pythonRunner.js";

type SpawnMock = ReturnType<typeof vi.fn>;

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
};

const spawnMock = vi.hoisted(() => vi.fn() as SpawnMock);

vi.mock("node:child_process", () => {
  return {
    spawn: spawnMock,
  };
});

const createFakeChild = (): FakeChild => {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.emit("close", null, "SIGTERM");
  };
  return child;
};

describe("runPythonJson", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("parses valid JSON", async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValueOnce(child);

    const promise = runPythonJson<{ ok: boolean }>({
      scriptPath: "scripts/mock.py",
      args: ["--demo"],
      timeoutMs: 500,
    });

    child.stdout.emit("data", Buffer.from('{"ok":true}'));
    child.emit("close", 0, null);

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("fails on invalid JSON", async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValueOnce(child);

    const promise = runPythonJson({
      scriptPath: "scripts/mock.py",
      timeoutMs: 500,
    });

    child.stdout.emit("data", "not-json");
    child.emit("close", 0, null);

    try {
      await promise;
      throw new Error("Expected runPythonJson to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "PYTHON_INVALID_JSON" });
    }
  });

  it("fails on timeout", async () => {
    vi.useFakeTimers();

    const child = createFakeChild();
    spawnMock.mockReturnValueOnce(child);

    const promise = runPythonJson({
      scriptPath: "scripts/mock.py",
      timeoutMs: 50,
    });

    const assertion = expect(promise).rejects.toMatchObject({ code: "PYTHON_PROCESS_TIMEOUT" });

    await vi.advanceTimersByTimeAsync(60);

    await assertion;

    vi.useRealTimers();
  });

  it("fails on non-zero exit code", async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValueOnce(child);

    const promise = runPythonJson({
      scriptPath: "scripts/mock.py",
      timeoutMs: 500,
    });

    child.stderr.emit("data", "boom");
    child.emit("close", 1, null);

    try {
      await promise;
      throw new Error("Expected runPythonJson to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "PYTHON_PROCESS_FAILED" });
    }
  });
});
