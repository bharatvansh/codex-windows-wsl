import path from "node:path";
import { defaultConfig } from "./defaults.js";
import { exists, readJson } from "../utils/fs.js";

function mergeConfig(base, overlay) {
  return {
    ...base,
    ...overlay,
    wsl: {
      ...(base.wsl || {}),
      ...(overlay?.wsl || {})
    },
    nativeBuild: {
      ...base.nativeBuild,
      ...(overlay?.nativeBuild || {})
    },
    logging: {
      ...base.logging,
      ...(overlay?.logging || {})
    },
    telemetry: {
      ...base.telemetry,
      ...(overlay?.telemetry || {})
    }
  };
}

export async function loadConfig(cliOptions = {}) {
  const configPath = path.resolve(process.cwd(), "codex-win.config.json");
  let fileConfig = {};

  if (await exists(configPath)) {
    fileConfig = await readJson(configPath);
  }

  const merged = mergeConfig(defaultConfig, fileConfig);

  return mergeConfig(merged, {
    workdir: cliOptions.workdir || merged.workdir,
    codexCliPath: cliOptions.codexCliPath || merged.codexCliPath,
    runtime: cliOptions.runtime || merged.runtime,
    wsl: {
      distro: cliOptions.wslDistro || merged.wsl?.distro,
      workdir: cliOptions.wslWorkdir || merged.wsl?.workdir,
      codexCliPath: cliOptions.wslCodexCliPath || merged.wsl?.codexCliPath,
      runtimeFallback: cliOptions.runtimeFallback || merged.wsl?.runtimeFallback
    },
    logging: {
      level: cliOptions.logLevel || merged.logging.level
    }
  });
}
