import path from "node:path";

export const VALID_RUNTIMES = ["windows", "wsl"];
export const VALID_RUNTIME_FALLBACKS = ["prompt", "windows", "none"];

function normalizeValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function ensureValid(value, validValues, label) {
  if (!value) {
    return null;
  }

  if (!validValues.includes(value)) {
    throw new Error(`Invalid ${label}: ${value}. Expected one of: ${validValues.join(", ")}`);
  }

  return value;
}

export function resolveRuntimeOptions(config = {}, cliOptions = {}) {
  const configRuntime = normalizeValue(config.runtime);
  const inferredRuntime =
    cliOptions.wslDistro || cliOptions.wslWorkdir || cliOptions.wslCodexCliPath ? "wsl" : null;

  const runtime =
    ensureValid(normalizeValue(cliOptions.runtime), VALID_RUNTIMES, "runtime") ||
    ensureValid(configRuntime, VALID_RUNTIMES, "runtime") ||
    inferredRuntime ||
    "windows";

  const configWsl = config.wsl || {};

  const runtimeFallback =
    ensureValid(
      normalizeValue(cliOptions.runtimeFallback),
      VALID_RUNTIME_FALLBACKS,
      "runtime fallback"
    ) ||
    ensureValid(
      normalizeValue(configWsl.runtimeFallback),
      VALID_RUNTIME_FALLBACKS,
      "runtime fallback"
    ) ||
    "prompt";

  return {
    runtime,
    runtimeFallback,
    wsl: {
      distro: cliOptions.wslDistro || configWsl.distro || null,
      workdir: cliOptions.wslWorkdir || configWsl.workdir || "~/.codex-win/work",
      codexCliPath: cliOptions.wslCodexCliPath || configWsl.codexCliPath || null
    }
  };
}

export function resolveRuntimeWorkdir(baseWorkdir, runtime) {
  const absolute = path.resolve(baseWorkdir);
  if (runtime === "wsl") {
    return path.join(absolute, "wsl");
  }

  return absolute;
}
