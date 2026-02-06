import path from "node:path";
import { readdir } from "node:fs/promises";
import { exists } from "./fs.js";
import { resolveCommandPath, runCommand } from "./exec.js";

async function resolveCodexFromCmdShim(cmdPath) {
  // The .cmd shim is at C:\Users\...\npm\codex.cmd
  // The actual exe is at C:\Users\...\npm\node_modules\@openai\codex\vendor\<arch>\codex\codex.exe
  const npmDir = path.dirname(cmdPath);
  const vendorDir = path.join(npmDir, "node_modules", "@openai", "codex", "vendor");
  if (!(await exists(vendorDir))) {
    return null;
  }

  // Prefer x86_64 on most Windows systems
  const archDirs = ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"];
  for (const archDir of archDirs) {
    const candidate = path.join(vendorDir, archDir, "codex", "codex.exe");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  // Fallback: try to find any codex.exe in vendor
  try {
    const foundArchs = await readdir(vendorDir);
    for (const archDir of foundArchs) {
      const candidate = path.join(vendorDir, archDir, "codex", "codex.exe");
      if (await exists(candidate)) {
        return candidate;
      }
    }
  } catch {
    // ignore readdir errors
  }

  return null;
}

export async function resolveCodexCliPath(explicitPath, logger) {
  if (explicitPath) {
    const absolute = path.resolve(explicitPath);
    if (await exists(absolute)) {
      return absolute;
    }

    throw new Error(`Codex CLI path does not exist: ${explicitPath}`);
  }

  const envOverride = process.env.CODEX_CLI_PATH;
  if (envOverride && (await exists(envOverride))) {
    return path.resolve(envOverride);
  }

  const whereCodexExe = await resolveCommandPath("codex.exe");
  if (whereCodexExe) {
    return whereCodexExe;
  }

  const whereCodex = await resolveCommandPath("codex");
  if (whereCodex) {
    if (whereCodex.toLowerCase().endsWith(".cmd")) {
      const resolvedFromShim = await resolveCodexFromCmdShim(whereCodex);
      if (resolvedFromShim) {
        return resolvedFromShim;
      }
    }

    return whereCodex;
  }

  const npmRoot = await runCommand("npm", ["root", "-g"], { shell: true });
  if (npmRoot.code === 0) {
    const base = npmRoot.stdout.trim();
    const candidates = [
      path.join(base, "@openai", "codex", "vendor", "x86_64-pc-windows-msvc", "codex", "codex.exe"),
      path.join(base, "@openai", "codex", "vendor", "aarch64-pc-windows-msvc", "codex", "codex.exe")
    ];

    for (const candidate of candidates) {
      if (await exists(candidate)) {
        return candidate;
      }
    }
  }

  await logger.warn("Failed to auto-detect codex.exe");
  return null;
}

export async function ensureGitOnPath(logger) {
  const candidates = [
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    "C:\\Program Files (x86)\\Git\\bin\\git.exe"
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      const dir = path.dirname(candidate);
      if (!process.env.PATH?.toLowerCase().includes(dir.toLowerCase())) {
        process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ""}`;
        await logger.debug("Added Git to PATH", { dir });
      }
      return;
    }
  }
}
