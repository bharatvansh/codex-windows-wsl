import { spawn } from "node:child_process";

export function runCommand(command, args = [], options = {}) {
  const {
    cwd,
    env,
    logger,
    inheritStdio = false,
    shell = false,
    stderrLogLevel = "debug"
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: inheritStdio ? "inherit" : "pipe"
    });

    let stdout = "";
    let stderr = "";

    if (!inheritStdio) {
      child.stdout?.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        logger?.debug?.(text.trimEnd());
      });

      child.stderr?.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        logger?.[stderrLogLevel]?.(text.trimEnd());
      });
    }

    child.on("error", (error) => reject(error));

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export async function commandExists(command, options = {}) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(probe, [command], options);
  return result.code === 0;
}

export async function resolveCommandPath(command, options = {}) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(probe, [command], options);
  if (result.code !== 0) {
    return null;
  }

  const first = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return first || null;
}
