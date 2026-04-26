import { spawn } from "node:child_process";
import { AppError } from "../errors/AppError.js";

export type PythonRunnerOptions = {
  scriptPath: string;
  args?: string[];
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

const getDefaultPythonExecutable = () => {
  return process.platform === "win32" ? "python" : "python3";
};

export const runPythonJson = async <TOutput = unknown>(options: PythonRunnerOptions): Promise<TOutput> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const executable = getDefaultPythonExecutable();
  const args = [options.scriptPath, ...(options.args ?? [])];

  return new Promise<TOutput>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const settle = (fn: () => void) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      fn();
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      settle(() => {
        reject(
          new AppError(500, "PYTHON_PROCESS_START_FAILED", "Failed to start Python process", {
            executable,
            scriptPath: options.scriptPath,
            error: error.message,
          }),
        );
      });
    });

    child.on("close", (code, signal) => {
      settle(() => {
        if (timedOut) {
          reject(
            new AppError(504, "PYTHON_PROCESS_TIMEOUT", "Python process timed out", {
              timeoutMs,
              scriptPath: options.scriptPath,
              stderr: stderr.trim() || null,
            }),
          );

          return;
        }

        if (code !== 0) {
          reject(
            new AppError(500, "PYTHON_PROCESS_FAILED", "Python process failed", {
              exitCode: code,
              signal,
              scriptPath: options.scriptPath,
              stderr: stderr.trim() || null,
            }),
          );

          return;
        }

        try {
          const parsed = JSON.parse(stdout) as TOutput;
          resolve(parsed);
        } catch {
          reject(
            new AppError(500, "PYTHON_INVALID_JSON", "Python output is not valid JSON", {
              scriptPath: options.scriptPath,
              stdout: stdout.trim() || null,
              stderr: stderr.trim() || null,
            }),
          );
        }
      });
    });
  });
};
