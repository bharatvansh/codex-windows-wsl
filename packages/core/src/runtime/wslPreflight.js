import { runWslShell, resolveWslCommand, resolveWslDistro } from "./wslExec.js";

const REQUIRED_WSL_COMMANDS = ["node", "npm", "npx", "git", "7z", "curl", "python3"];

function parseMissingCommands(raw = "") {
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function runWslPreflight(options = {}) {
  const { distro, requireDisplay = false, logger } = options;

  const wslCommand = await resolveWslCommand(logger);
  const resolvedDistro = await resolveWslDistro(distro, { wslCommand, logger });

  const depsScript = `missing=(); for cmd in ${REQUIRED_WSL_COMMANDS.join(" ")}; do command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd"); done; printf '%s' "${
    "${missing[*]}"
  }"`;
  const depsResult = await runWslShell(depsScript, {
    wslCommand,
    distro: resolvedDistro,
    logger
  });

  if (depsResult.code !== 0) {
    throw new Error(depsResult.stderr || "Unable to run WSL dependency checks.");
  }

  const missingCommands = parseMissingCommands(depsResult.stdout);

  let displayAvailable = true;
  if (requireDisplay) {
    const displayResult = await runWslShell(
      "if [ -n \"$WAYLAND_DISPLAY\" ] || [ -n \"$DISPLAY\" ]; then echo yes; else echo no; fi",
      {
        wslCommand,
        distro: resolvedDistro,
        logger
      }
    );

    if (displayResult.code !== 0) {
      throw new Error(displayResult.stderr || "Unable to check WSL display environment.");
    }

    displayAvailable = displayResult.stdout.trim() === "yes";
  }

  return {
    wslCommand,
    distro: resolvedDistro,
    missingCommands,
    displayAvailable,
    ok: missingCommands.length === 0 && displayAvailable
  };
}

export function buildWslPreflightError(preflight, options = {}) {
  const { requireDisplay = false } = options;
  const issues = [];

  if (preflight.missingCommands.length > 0) {
    issues.push(`Missing WSL commands: ${preflight.missingCommands.join(", ")}`);
  }

  if (requireDisplay && !preflight.displayAvailable) {
    issues.push("No GUI display found in WSL (missing WAYLAND_DISPLAY/DISPLAY). Enable WSLg or X server.");
  }

  const suffix = issues.length > 0 ? ` ${issues.join(" ")}` : "";
  return new Error(`WSL preflight checks failed.${suffix}`);
}
