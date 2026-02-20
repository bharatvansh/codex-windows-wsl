import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { ensureDir } from "../utils/fs.js";
import { writeManifest } from "../utils/manifests.js";
import { resolveLaunchSource } from "./resolveLaunchSource.js";
import {
  runWslShell,
  resolveWslHomeDir,
  expandWslHomePath,
  shellEscape,
  toWslPath
} from "../runtime/wslExec.js";
import { runWslPreflight, buildWslPreflightError } from "../runtime/wslPreflight.js";

async function runWslStep(name, script, runtime, logger, options = {}) {
  await logger.debug(`WSL step: ${name}`);

  const result = await runWslShell(script, {
    distro: runtime.wsl.distro,
    wslCommand: runtime.wslCommand,
    logger,
    inheritStdio: Boolean(options.inheritStdio)
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || `WSL step failed: ${name}`);
  }

  return result;
}

async function resolveElectronPath(prep, runtime, logger) {
  const nativeBuildDir = prep?.paths?.nativeBuildDir;
  if (nativeBuildDir) {
    const candidate = `${nativeBuildDir}/node_modules/electron/dist/electron`;
    const existsResult = await runWslStep(
      "resolve_electron_from_native_build",
      `[ -x ${shellEscape(candidate)} ] && echo ${shellEscape(candidate)} || true`,
      runtime,
      logger
    );

    const value = existsResult.stdout.trim();
    if (value) {
      return value;
    }
  }

  const nativeRoot = prep?.paths?.nativeRootDir;
  if (nativeRoot) {
    const discoverResult = await runWslStep(
      "discover_electron_binary",
      `find ${shellEscape(nativeRoot)} -maxdepth 8 -type f -name electron | head -1 || true`,
      runtime,
      logger
    );

    const value = discoverResult.stdout.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

async function resolveWslCodexCliPath(runtime, options, logger, homeDir) {
  const explicitRaw = options.wslCodexCliPath || runtime.wsl.codexCliPath;
  const explicit = expandWslHomePath(explicitRaw, homeDir);

  if (explicit) {
    const check = await runWslStep(
      "resolve_codex_cli_explicit",
      `[ -x ${shellEscape(explicit)} ] && echo ${shellEscape(explicit)} || true`,
      runtime,
      logger
    );

    const value = check.stdout.trim();
    if (!value) {
      throw new Error(`WSL Codex CLI path does not exist or is not executable: ${explicit}`);
    }

    return value;
  }

  const resolutionSteps = [
    {
      name: "resolve_codex_cli_path",
      script:
        "candidate=\"$(command -v codex 2>/dev/null || true)\"; [ -n \"$candidate\" ] && [ -x \"$candidate\" ] && printf '%s' \"$candidate\" | grep -v '/mnt/c/' || true"
    },
    {
      name: "resolve_codex_cli_path_bashrc",
      script:
        "if [ -f \"$HOME/.bashrc\" ]; then . \"$HOME/.bashrc\" >/dev/null 2>&1 || true; fi; candidate=\"$(command -v codex 2>/dev/null || true)\"; [ -n \"$candidate\" ] && [ -x \"$candidate\" ] && printf '%s' \"$candidate\" | grep -v '/mnt/c/' || true"
    },
    {
      name: "resolve_codex_cli_path_npm_prefix",
      script:
        "npm_prefix=\"$(npm config get prefix 2>/dev/null || true)\"; [ -n \"$npm_prefix\" ] && [ -x \"$npm_prefix/bin/codex\" ] && printf '%s' \"$npm_prefix/bin/codex\" | grep -v '/mnt/c/' || true"
    },
    {
      name: "resolve_codex_cli_path_npm_root",
      script:
        "npm_root=\"$(npm root -g 2>/dev/null || true)\"; npm_bin=\"$(dirname \"$npm_root\")/bin/codex\"; [ -n \"$npm_root\" ] && [ -x \"$npm_bin\" ] && printf '%s' \"$npm_bin\" | grep -v '/mnt/c/' || true"
    },
    {
      name: "resolve_codex_cli_path_user_shell",
      script:
        "user_shell=\"$(getent passwd \"$(id -un)\" | cut -d: -f7)\"; if [ -n \"$user_shell\" ] && [ -x \"$user_shell\" ]; then \"$user_shell\" -ic 'candidate=\"$(command -v codex 2>/dev/null || true)\"; [ -n \"$candidate\" ] && [ -x \"$candidate\" ] && printf \"%s\" \"$candidate\" || true' 2>/dev/null | grep -v '/mnt/c/' || true; fi"
    },
    {
      name: "resolve_codex_cli_path_mnt_fallback",
      script:
        "candidate=\"$(command -v codex 2>/dev/null || true)\"; [ -n \"$candidate\" ] && [ -x \"$candidate\" ] && printf '%s' \"$candidate\" || true"
    }
  ];

  const hostAppData = process.env.APPDATA;
  if (hostAppData) {
    const hostNpmCodexShim = toWslPath(path.join(hostAppData, "npm", "codex"));
    resolutionSteps.push({
      name: "resolve_codex_cli_path_host_npm_shim",
      script:
        `[ -x ${shellEscape(hostNpmCodexShim)} ] && printf '%s' ${shellEscape(hostNpmCodexShim)} || true`
    });
  }

  for (const step of resolutionSteps) {
    const result = await runWslStep(step.name, step.script, runtime, logger);
    const resolved = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (resolved) {
      if (resolved.startsWith("/mnt/c/")) {
        await logger.warn("Resolved Codex CLI from Windows-mounted path in WSL", {
          codexCliPath: resolved
        });
      }
      return resolved;
    }
  }

  throw new Error("Unable to resolve Codex CLI in WSL. Install with npm i -g @openai/codex.");
}

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
    "libnotify-WARNING",
    "notify_notification_show",
    "Failed to register codex://",
    "DeprecationWarning:",
    "org.freedesktop.systemd1"
  ];
  return !ignored.some((prefix) => line.includes(prefix));
}

export async function launchWslCommand(options = {}, injected = {}) {
  const config = injected.config || (await loadConfig(options));
  const runtime = injected.runtimeOptions;
  if (!runtime) {
    throw new Error("Missing runtime options for WSL launch command.");
  }

  const runtimeWorkdir = injected.runtimeWorkdir || config.workdir;

  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json),
    logDir: path.join(runtimeWorkdir, "logs")
  });

  await ensureDir(runtimeWorkdir);
  await ensureDir(path.join(runtimeWorkdir, "manifests"));

  const preflight = await runWslPreflight({
    distro: runtime.wsl.distro,
    requireDisplay: true,
    logger
  });

  if (!preflight.ok) {
    throw buildWslPreflightError(preflight, { requireDisplay: true });
  }

  runtime.wslCommand = preflight.wslCommand;
  runtime.wsl.distro = preflight.distro;
  const homeDir = await resolveWslHomeDir({
    wslCommand: runtime.wslCommand,
    distro: runtime.wsl.distro,
    logger
  });
  runtime.wsl.workdir = expandWslHomePath(runtime.wsl.workdir, homeDir);

  const source = await resolveLaunchSource(options, path.join(runtimeWorkdir, "manifests"));
  const prep = source.data;

  const appDir = prep?.paths?.appDir;
  if (!appDir) {
    throw new Error("Prepare manifest is missing appDir for WSL launch.");
  }

  await runWslStep("check_app_dir", `[ -d ${shellEscape(appDir)} ]`, runtime, logger);

  const electronExe = await resolveElectronPath(prep, runtime, logger);
  if (!electronExe) {
    throw new Error("Unable to resolve Linux Electron runtime in WSL prepare artifacts.");
  }

  const codexCliPath = await resolveWslCodexCliPath(runtime, options, logger, homeDir);
  const userDataDir = prep?.paths?.userDataDir || `${runtime.wsl.workdir}/userdata`;
  const cacheDir = prep?.paths?.cacheDir || `${runtime.wsl.workdir}/cache`;

  await runWslStep(
    "ensure_runtime_dirs",
    `mkdir -p ${shellEscape(userDataDir)} ${shellEscape(cacheDir)}`,
    runtime,
    logger
  );

  const metadata = prep?.metadata || {};
  const rendererUrl = `file://${appDir}/webview/index.html`;

  await logger.info("Launching Codex app", {
    runtime: "wsl",
    distro: runtime.wsl.distro || "default",
    electronExe,
    appDir,
    codexCliPath
  });

  const launchScript = [
    "set -e",
    `cd ${shellEscape(appDir)}`,
    `export ELECTRON_RENDERER_URL=${shellEscape(rendererUrl)}`,
    "export ELECTRON_FORCE_IS_PACKAGED=1",
    `export CODEX_BUILD_NUMBER=${shellEscape(String(metadata.codexBuildNumber || 510))}`,
    `export CODEX_BUILD_FLAVOR=${shellEscape(String(metadata.codexBuildFlavor || "prod"))}`,
    `export BUILD_FLAVOR=${shellEscape(String(metadata.codexBuildFlavor || "prod"))}`,
    "export NODE_ENV=production",
    `export CODEX_CLI_PATH=${shellEscape(codexCliPath)}`,
    `export PWD=${shellEscape(appDir)}`,
    `${shellEscape(electronExe)} ${shellEscape(appDir)} --user-data-dir=${shellEscape(userDataDir)} --disk-cache-dir=${shellEscape(cacheDir)} </dev/null >/dev/null 2>&1 &`,
    "electron_pid=$!",
    "echo \"Electron launched with PID: $electron_pid\"",
    "trap 'kill \"$electron_pid\" >/dev/null 2>&1 || true' HUP INT TERM",
    "wait $electron_pid"
  ].join("\n");

  const launchResult = await runWslShell(launchScript, {
    distro: runtime.wsl.distro,
    wslCommand: runtime.wslCommand,
    logger,
    inheritStdio: false,
    stderrLogLevel: "error",
    stderrFilter: launchStderrFilter
  });

  const launchManifest = {
    kind: "launch",
    runtime: "wsl",
    generatedAt: new Date().toISOString(),
    prepareManifestPath: source.manifestPath,
    electronExe,
    appDir,
    codexCliPath,
    userDataDir,
    cacheDir,
    runtimeContext: {
      distro: runtime.wsl.distro || null,
      linuxWorkdir: runtime.wsl.workdir,
      wslCommand: runtime.wslCommand
    },
    exitCode: launchResult.code,
    logPath: logger.logPath
  };

  const manifestsDir = prep?.paths?.manifestsDir || path.join(runtimeWorkdir, "manifests");
  const launchManifestPath = await writeManifest(
    manifestsDir,
    `launch-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    launchManifest
  );

  if (launchResult.code !== 0) {
    throw new Error(`WSL Electron process exited with code ${launchResult.code}`);
  }

  return {
    ok: true,
    runtime: "wsl",
    launchManifestPath,
    logPath: logger.logPath
  };
}
