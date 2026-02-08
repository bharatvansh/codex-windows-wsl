import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { exists, removePath } from "../utils/fs.js";
import {
  runWslShell,
  shellEscape,
  resolveWslHomeDir,
  expandWslHomePath
} from "../runtime/wslExec.js";

async function removeWslPath(targetPath, runtime, logger) {
  const result = await runWslShell(`rm -rf ${shellEscape(targetPath)}`, {
    distro: runtime.wsl.distro,
    wslCommand: runtime.wslCommand,
    logger
  });

  return result.code === 0;
}

export async function cleanWslCommand(options = {}, injected = {}) {
  const config = injected.config || (await loadConfig(options));
  const runtime = injected.runtimeOptions;

  if (!runtime) {
    throw new Error("Missing runtime options for WSL clean command.");
  }

  const runtimeWorkdir = injected.runtimeWorkdir || config.workdir;
  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json)
  });

  const removed = [];
  const warnings = [];
  let wslWorkdir = runtime.wsl.workdir;

  const hostTargets = options.cacheOnly
    ? [
        path.join(runtimeWorkdir, "cache"),
        path.join(runtimeWorkdir, "logs"),
        path.join(runtimeWorkdir, "manifests")
      ]
    : [runtimeWorkdir];

  for (const target of hostTargets) {
    if (await exists(target)) {
      await removePath(target);
      removed.push(target);
    }
  }

  if (runtime.wslCommand) {
    try {
      const homeDir = await resolveWslHomeDir({
        wslCommand: runtime.wslCommand,
        distro: runtime.wsl.distro,
        logger
      });
      wslWorkdir = expandWslHomePath(wslWorkdir, homeDir);
      runtime.wsl.workdir = wslWorkdir;
    } catch {
      warnings.push("Failed to resolve WSL home directory; using raw configured wsl workdir.");
    }

    const wslTargets = options.cacheOnly
      ? [`${wslWorkdir}/cache`, `${wslWorkdir}/logs`]
      : [wslWorkdir];

    for (const target of wslTargets) {
      const ok = await removeWslPath(target, runtime, logger);
      if (ok) {
        removed.push(`wsl:${target}`);
      } else {
        warnings.push(`Failed to remove WSL path: ${target}`);
      }
    }
  } else {
    warnings.push("Skipped WSL filesystem cleanup because wsl command was unavailable.");
  }

  await logger.info("Removed paths", {
    runtime: "wsl",
    removed,
    warnings
  });

  return {
    ok: warnings.length === 0,
    runtime: "wsl",
    removed,
    warnings
  };
}
