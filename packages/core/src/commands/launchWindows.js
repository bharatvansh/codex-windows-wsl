import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { ensureDir, exists } from "../utils/fs.js";
import { writeManifest } from "../utils/manifests.js";
import { resolveCodexCliPath, ensureGitOnPath } from "../utils/env.js";
import { runCommand } from "../utils/exec.js";
import { findFirstByName } from "../utils/discovery.js";
import { resolveLaunchSource } from "./resolveLaunchSource.js";

function launchStderrFilter(line) {
  if (!line) return false;
  const ignored = [
    "[electron-message-handler]",
    "[electron-fetch-handler]",
    "[git-repo-watcher]",
    "[git-origin-and-roots]",
    "[git]",
    "[build-flavor]",
    "Statsig:",
    "Failed to register codex://",
    "DeprecationWarning:"
  ];
  return !ignored.some((prefix) => line.includes(prefix));
}

async function resolveElectronExe(prepData, logger) {
  const nativeBuildDir = prepData?.paths?.nativeBuildDir;
  if (nativeBuildDir) {
    const candidate = path.join(nativeBuildDir, "node_modules", "electron", "dist", "electron.exe");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  const nativeRoot = prepData?.paths?.nativeRootDir;
  if (nativeRoot && (await exists(nativeRoot))) {
    const discovered = await findFirstByName(nativeRoot, "electron.exe", { maxDepth: 8 });
    if (discovered) {
      return discovered;
    }
  }

  const fallback = "C:\\Program Files\\nodejs\\node_modules\\electron\\dist\\electron.exe";
  if (await exists(fallback)) {
    await logger.warn("Using fallback Electron runtime", { fallback });
    return fallback;
  }

  return null;
}

export async function launchWindowsCommand(options = {}, injected = {}) {
  const config = injected.config || (await loadConfig(options));
  const runtimeWorkdir = injected.runtimeWorkdir || config.workdir;

  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json),
    logDir: path.join(runtimeWorkdir, "logs")
  });

  const source = await resolveLaunchSource(options, path.join(runtimeWorkdir, "manifests"));
  const prep = source.data;

  const appDir = prep?.paths?.appDir;
  if (!appDir || !(await exists(appDir))) {
    throw new Error(`App directory missing. Expected: ${appDir}`);
  }

  const electronExe = await resolveElectronExe(prep, logger);
  if (!electronExe) {
    throw new Error("Unable to resolve electron.exe runtime");
  }

  const codexCliPath = await resolveCodexCliPath(options.codexCliPath || config.codexCliPath, logger);
  if (!codexCliPath) {
    throw new Error("Unable to resolve Codex CLI. Install with npm i -g @openai/codex.");
  }

  await ensureGitOnPath(logger);

  const userDataDir = prep?.paths?.userDataDir || path.join(runtimeWorkdir, "userdata");
  const cacheDir = prep?.paths?.cacheDir || path.join(runtimeWorkdir, "cache");
  await ensureDir(userDataDir);
  await ensureDir(cacheDir);

  const metadata = prep?.metadata || {};
  const rendererUrl = pathToFileURL(path.join(appDir, "webview", "index.html")).toString();

  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
    ELECTRON_FORCE_IS_PACKAGED: "1",
    CODEX_BUILD_NUMBER: String(metadata.codexBuildNumber || 510),
    CODEX_BUILD_FLAVOR: String(metadata.codexBuildFlavor || "prod"),
    BUILD_FLAVOR: String(metadata.codexBuildFlavor || "prod"),
    NODE_ENV: "production",
    CODEX_CLI_PATH: codexCliPath,
    PWD: appDir
  };

  await logger.info("Launching Codex app", {
    runtime: "windows",
    electronExe,
    appDir,
    codexCliPath
  });

  const launchArgs = [
    appDir,
    `--user-data-dir=${userDataDir}`,
    `--disk-cache-dir=${cacheDir}`
  ];

  const result = await runCommand(electronExe, launchArgs, {
    env,
    logger,
    inheritStdio: false,
    shell: false,
    stderrLogLevel: "error",
    stderrFilter: launchStderrFilter
  });

  const launchManifest = {
    kind: "launch",
    runtime: "windows",
    generatedAt: new Date().toISOString(),
    prepareManifestPath: source.manifestPath,
    electronExe,
    appDir,
    codexCliPath,
    userDataDir,
    cacheDir,
    exitCode: result.code,
    logPath: logger.logPath
  };

  const manifestsDir = prep?.paths?.manifestsDir || path.join(runtimeWorkdir, "manifests");
  const launchManifestPath = await writeManifest(
    manifestsDir,
    `launch-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    launchManifest
  );

  if (result.code !== 0) {
    throw new Error(`Electron process exited with code ${result.code}`);
  }

  return {
    ok: true,
    runtime: "windows",
    launchManifestPath,
    logPath: logger.logPath
  };
}
