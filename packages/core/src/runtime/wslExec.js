import { commandExists, runCommand } from "../utils/exec.js";
import { exists } from "../utils/fs.js";

const WSL_COMMAND_CANDIDATES = process.platform === "win32" ? ["wsl.exe", "wsl"] : ["wsl", "wsl.exe"];

export function parseWslDistroList(raw = "") {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, "").trim())
    .filter(Boolean);
}

export function shellEscape(value) {
  const raw = String(value ?? "");
  return `'${raw.replace(/'/g, `'"'"'`)}'`;
}

export function toWslPath(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  const normalized = String(inputPath).trim().replace(/\\/g, "/");

  const unc = normalized.match(/^\/\/wsl\.localhost\/[^/]+\/(.*)$/i);
  if (unc) {
    return `/${unc[1]}`;
  }

  const drive = normalized.match(/^([a-zA-Z]):\/(.*)$/);
  if (drive) {
    const letter = drive[1].toLowerCase();
    const rest = drive[2].replace(/\/+/g, "/");
    return `/mnt/${letter}/${rest}`;
  }

  return normalized;
}

export function expandWslHomePath(inputPath, homeDir) {
  if (!inputPath) {
    return inputPath;
  }

  if (!homeDir) {
    return inputPath;
  }

  if (inputPath === "~") {
    return homeDir;
  }

  if (inputPath.startsWith("~/")) {
    return `${homeDir}/${inputPath.slice(2)}`;
  }

  return inputPath;
}

export async function resolveWslCommand(logger) {
  for (const candidate of WSL_COMMAND_CANDIDATES) {
    if (await commandExists(candidate, { logger })) {
      return candidate;
    }
  }

  const explicit = "/mnt/c/Windows/System32/wsl.exe";
  if (await exists(explicit)) {
    return explicit;
  }

  throw new Error("WSL command not found. Install WSL and ensure wsl.exe is on PATH.");
}

export async function runRawWslCommand(rawArgs, options = {}) {
  const {
    wslCommand,
    logger,
    cwd,
    env,
    inheritStdio = false,
    shell = false,
    stderrLogLevel = "debug",
    stderrFilter = null
  } = options;

  const resolvedWsl = wslCommand || (await resolveWslCommand(logger));
  return runCommand(resolvedWsl, rawArgs, {
    logger,
    cwd,
    env,
    inheritStdio,
    shell,
    stderrLogLevel,
    stderrFilter
  });
}

export function buildWslArgs(commandArgs, options = {}) {
  const args = [];

  if (options.distro) {
    args.push("-d", options.distro);
  }

  args.push("--", ...commandArgs);
  return args;
}

export async function runWslCommand(commandArgs, options = {}) {
  return runRawWslCommand(buildWslArgs(commandArgs, options), options);
}

export async function runWslShell(script, options = {}) {
  return runWslCommand(["bash", "-lc", script], options);
}

export async function resolveWslHomeDir(options = {}) {
  const result = await runWslShell("printf '%s' \"$HOME\"", options);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Unable to resolve WSL home directory.");
  }

  return result.stdout.trim();
}

export async function listWslDistros(options = {}) {
  const result = await runRawWslCommand(["-l", "-q"], options);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to list WSL distros.");
  }

  return parseWslDistroList(result.stdout);
}

export async function resolveWslDistro(requestedDistro, options = {}) {
  if (!requestedDistro) {
    return null;
  }

  const distros = await listWslDistros(options);
  const matched = distros.find((distro) => distro.toLowerCase() === requestedDistro.toLowerCase());

  if (!matched) {
    throw new Error(`WSL distro not found: ${requestedDistro}. Available: ${distros.join(", ") || "none"}`);
  }

  return matched;
}
