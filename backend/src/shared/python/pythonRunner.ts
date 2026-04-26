import { spawn } from "node:child_process";
import { logger } from "../../config/logger.js";
import { AppError } from "../errors/AppError.js";

export type PythonRunnerOptions = {
  scriptPath: string;
  args?: string[];
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

type PythonExecutable = {
  command: string;
  prefixArgs: string[];
};

const getPythonExecutables = (): PythonExecutable[] => {
  if (process.platform === "win32") {
    return [
      { command: "python", prefixArgs: [] },
      { command: "py", prefixArgs: ["-3"] },
      { command: "py", prefixArgs: [] },
    ];
  }

  return [{ command: "python3", prefixArgs: [] }, { command: "python", prefixArgs: [] }];
};

const toPreview = (value: string, max = 500) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.slice(0, max);
};

export const runPythonJson = async <TOutput = unknown>(options: PythonRunnerOptions): Promise<TOutput> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scriptArgs = [options.scriptPath, ...(options.args ?? [])];
  const executables = getPythonExecutables();

  const runWithExecutable = async (candidateIndex: number): Promise<TOutput> => {
    const executable = executables[candidateIndex];
    if (!executable) {
      throw new AppError(500, "PYTHON_PROCESS_START_FAILED", "Failed to start Python process", {
        scriptPath: options.scriptPath,
      });
    }

    const args = [...executable.prefixArgs, ...scriptArgs];

    return new Promise<TOutput>((resolve, reject) => {
      logger.info("Python runner start", {
        command: executable.command,
        scriptPath: options.scriptPath,
        args: scriptArgs,
      });

      const child = spawn(executable.command, args, {
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

      child.on("error", async (error) => {
        settle(async () => {
          logger.warn("Python runner process error", {
            command: executable.command,
            scriptPath: options.scriptPath,
            error: error.message,
          });

          if (candidateIndex < executables.length - 1) {
            try {
              const fallbackResult = await runWithExecutable(candidateIndex + 1);
              resolve(fallbackResult);
              return;
            } catch (fallbackError) {
              reject(fallbackError);
              return;
            }
          }

          reject(
            new AppError(500, "PYTHON_PROCESS_START_FAILED", "Failed to start Python process", {
              executable: executable.command,
              scriptPath: options.scriptPath,
              error: error.message,
            }),
          );
        });
      });

      child.on("close", async (code, signal) => {
        settle(async () => {
          const stderrPreview = toPreview(stderr);
          const stdoutPreview = toPreview(stdout);

          logger.info("Python runner close", {
            command: executable.command,
            scriptPath: options.scriptPath,
            args: scriptArgs,
            exitCode: code,
            stderr: stderrPreview || null,
            stdoutPreview: stdoutPreview || null,
          });

          const pythonNotFound =
            code !== 0 && /python was not found/i.test(stderrPreview + " " + stdoutPreview);

          if (pythonNotFound && candidateIndex < executables.length - 1) {
            try {
              const fallbackResult = await runWithExecutable(candidateIndex + 1);
              resolve(fallbackResult);
              return;
            } catch (fallbackError) {
              reject(fallbackError);
              return;
            }
          }

          if (timedOut) {
            reject(
              new AppError(504, "PYTHON_PROCESS_TIMEOUT", "Python process timed out", {
                timeoutMs,
                scriptPath: options.scriptPath,
                stderr: stderrPreview || null,
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
                stderr: stderrPreview || null,
                stdoutPreview: stdoutPreview || null,
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
                stderr: stderrPreview || null,
                stdoutPreview: stdoutPreview || null,
              }),
            );
          }
        });
      });
    });
  };

  return runWithExecutable(0);
};
