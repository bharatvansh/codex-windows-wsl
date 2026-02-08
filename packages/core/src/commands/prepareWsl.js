import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { ensureDir, exists } from "../utils/fs.js";
import { writeManifest } from "../utils/manifests.js";
import { DEFAULT_LATEST_DMG_URL } from "../utils/download.js";
import {
  runWslShell,
  resolveWslHomeDir,
  expandWslHomePath,
  shellEscape,
  toWslPath
} from "../runtime/wslExec.js";
import { runWslPreflight, buildWslPreflightError } from "../runtime/wslPreflight.js";

function makeManifestName(prefix, hash) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shortHash = hash.slice(0, 12);
  return `${prefix}-${timestamp}-${shortHash}.json`;
}

function makeRuntimeConfig(config, runtimeWorkdir) {
  return {
    ...config,
    workdir: runtimeWorkdir
  };
}

async function runWslStep(name, script, runtime, logger, options = {}) {
  await logger.debug(`WSL step: ${name}`);
  if (options.label) {
    await logger.info(options.label);
  }
  const result = await runWslShell(script, {
    distro: runtime.wsl.distro,
    wslCommand: runtime.wslCommand,
    logger,
    inheritStdio: Boolean(options.inheritStdio)
  });

  if (result.code !== 0) {
    if (logger) {
      await logger.error(`WSL step failed`, { step: name, code: result.code, stderr: result.stderr });
    }
    throw new Error(result.stderr || `WSL step failed: ${name} (code ${result.code})`);
  }

  return result;
}

async function resolveWslDmgPath(context) {
  const {
    options,
    runtime,
    logger,
    hostCwdWsl,
    linuxWorkdir
  } = context;

  if (options.downloadLatest && options.noDownloadLatest) {
    throw new Error("Cannot combine --download-latest and --no-download-latest.");
  }

  if (options.dmgPath) {
    const explicit = toWslPath(path.resolve(options.dmgPath));
    const existsResult = await runWslStep(
      "check_explicit_dmg",
      `[ -f ${shellEscape(explicit)} ] && echo yes || echo no`,
      runtime,
      logger
    );

    if (existsResult.stdout.trim() !== "yes") {
      throw new Error(`DMG not found from WSL: ${explicit}`);
    }

    return {
      dmgPath: explicit,
      downloadInfo: null
    };
  }

  // Prefer local DMG in host CWD if it looks healthy
  const hostLocalDmg = `${hostCwdWsl}/work/downloads/Codex-latest.dmg`;
  const hostLocalAlt = `${hostCwdWsl}/Codex.dmg`;
  
  for (const candidate of [hostLocalDmg, hostLocalAlt]) {
    const checkResult = await runWslStep(
      "check_host_dmg",
      `[ -f ${shellEscape(candidate)} ] && [ $(stat -c%s ${shellEscape(candidate)}) -gt 140000000 ] && echo yes || echo no`,
      runtime,
      logger
    );
    if (checkResult.stdout.trim() === "yes") {
      await logger.info("Using healthy DMG from host workdir", { path: candidate });
      return { dmgPath: candidate, downloadInfo: null };
    }
  }

  const localDmg = `${linuxWorkdir}/downloads/Codex-latest.dmg`;
  if (!options.downloadLatest) {
    const localResult = await runWslStep(
      "check_local_dmg",
      `[ -f ${shellEscape(localDmg)} ] && echo yes || echo no`,
      runtime,
      logger
    );

    if (localResult.stdout.trim() === "yes") {
      return {
        dmgPath: localDmg,
        downloadInfo: null
      };
    }
  }

  if (options.noDownloadLatest) {
    return {
      dmgPath: null,
      downloadInfo: null
    };
  }

  const downloadTarget = `${linuxWorkdir}/downloads/Codex-latest.dmg`;
  const downloadUrl = options.downloadUrl || DEFAULT_LATEST_DMG_URL;
  await logger.info("Downloading latest Codex DMG in WSL", {
    downloadUrl,
    downloadTarget
  });

  await runWslStep(
    "download_latest_dmg",
    [
      "set -euo pipefail",
      `mkdir -p ${shellEscape(`${linuxWorkdir}/downloads`)}`,
      `curl -L --fail --show-error --retry 3 --retry-delay 5 -o ${shellEscape(downloadTarget)} ${shellEscape(downloadUrl)}`,
      `[ -s ${shellEscape(downloadTarget)} ]`
    ].join("\n"),
    runtime,
    logger
  );

  return {
    dmgPath: downloadTarget,
    downloadInfo: {
      downloadedPath: downloadTarget,
      downloadUrl,
      mode: options.downloadLatest ? "explicit" : "automatic"
    }
  };
}

async function patchPreloadInWsl(appDir, runtime, logger) {
  const snippet =
    'const processBridge={env:process.env,platform:process.platform,versions:process.versions,arch:process.arch,cwd:()=>process.env.PWD||process.cwd(),argv:process.argv,pid:process.pid};n.contextBridge.exposeInMainWorld("process",processBridge);';

  const script = `node - ${shellEscape(appDir)} ${shellEscape(snippet)} <<'NODE'\nconst fs = require("node:fs");\nconst path = require("node:path");\n\nconst appDir = process.argv[2];\nconst snippet = process.argv[3];\nconst preloadPath = path.join(appDir, ".vite", "build", "preload.js");\n\nif (!fs.existsSync(preloadPath)) {\n  process.exit(0);\n}\n\nconst source = fs.readFileSync(preloadPath, "utf8");\nif (source.includes('exposeInMainWorld("process"')) {\n  process.exit(0);\n}\n\nconst direct = /n\\.contextBridge\\.exposeInMainWorld\\("electronBridge",[A-Za-z0-9_$]+\\);/;\nconst fallback = /contextBridge\\.exposeInMainWorld\\([^)]*electronBridge[^)]*\\);/;\nconst match = source.match(direct) || source.match(fallback);\n\nif (!match || typeof match.index !== "number") {\n  throw new Error("Unable to find preload patch anchor");\n}\n\nconst index = match.index + match[0].length;\nconst patched = source.slice(0, index) + snippet + source.slice(index);\nfs.writeFileSync(preloadPath, patched, "utf8");\nNODE`;

  await runWslStep("patch_preload", script, runtime, logger);
}

async function readMetadataInWsl(appDir, runtime, logger) {
  const script = `node - ${shellEscape(appDir)} <<'NODE'\nconst path = require("node:path");\nconst fs = require("node:fs");\n\nconst appDir = process.argv[2];\nconst pkgPath = path.join(appDir, "package.json");\nif (!fs.existsSync(pkgPath)) {\n  throw new Error(\`package.json missing from app dir: \${pkgPath}\`);\n}\n\nconst pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));\nconst electronVersion = pkg?.devDependencies?.electron || pkg?.dependencies?.electron || pkg?.optionalDependencies?.electron;\nif (!electronVersion) {\n  throw new Error("Electron version not found in package.json");\n}\n\nconst metadata = {\n  packageName: pkg.name,\n  packageVersion: pkg.version,\n  electronVersion,\n  betterSqlite3Version: pkg?.dependencies?.["better-sqlite3"] || null,\n  nodePtyVersion: pkg?.dependencies?.["node-pty"] || null,\n  codexBuildNumber: pkg?.codexBuildNumber || null,\n  codexBuildFlavor: pkg?.codexBuildFlavor || null\n};\n\nprocess.stdout.write(JSON.stringify(metadata));\nNODE`;

  const result = await runWslStep("read_metadata", script, runtime, logger);
  return JSON.parse(result.stdout.trim());
}

async function prepareNativeModulesInWsl(context) {
  const {
    runtime,
    logger,
    options,
    paths,
    metadata,
    arch
  } = context;

  const betterVersion = metadata.betterSqlite3Version;
  const ptyVersion = metadata.nodePtyVersion;
  const electronVersion = metadata.electronVersion;

  if (!betterVersion || !ptyVersion) {
    throw new Error("Native module versions missing from app package metadata");
  }

  const appBetter = `${paths.appDir}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`;
  const appPty = `${paths.appDir}/node_modules/node-pty/prebuilds/${arch}/pty.node`;
  const bsSrc = `${paths.nativeBuildDir}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`;
  const ptySrcDir = `${paths.nativeBuildDir}/node_modules/node-pty/prebuilds/${arch}`;

  const script = [
    "set -euxo pipefail",
    `mkdir -p ${shellEscape(paths.nativeBuildDir)}`,
    
    // Check if we can skip rebuild
    `if [ ${options.reuse ? "1" : "0"} -eq 1 ] && [ -f ${shellEscape(appBetter)} ] && [ -f ${shellEscape(appPty)} ]; then echo skipped; exit 0; fi`,
    
    // Init build project
    `if [ ! -f ${shellEscape(paths.nativeBuildDir)}/package.json ]; then (cd ${shellEscape(paths.nativeBuildDir)} && npm init -y >/dev/null); fi`,
    
    // Install dependencies
    `echo "Installing native module dependencies in WSL..."`,
    `(cd ${shellEscape(paths.nativeBuildDir)} && npm install --no-save ${shellEscape(`better-sqlite3@${betterVersion}`)} ${shellEscape(`node-pty@${ptyVersion}`)} "@electron/rebuild@^3.6.0" prebuild-install ${shellEscape(`electron@${electronVersion}`)} )`,
    
    "set +e",
    // Run rebuild
    `echo "Rebuilding native modules for Electron ${electronVersion}..."`,
    `(cd ${shellEscape(paths.nativeBuildDir)} && ./node_modules/.bin/electron-rebuild -v ${shellEscape(electronVersion)} -w better-sqlite3,node-pty)`,
    "if [ $? -ne 0 ]; then",
    `  (cd ${shellEscape(paths.nativeBuildDir)}/node_modules/better-sqlite3 && ../prebuild-install/bin.js -r electron -t ${shellEscape(electronVersion)} --tag-prefix=electron-v || true)`,
    "fi",
    "set -e",
    
    // Verify and copy
    `[ -f ${shellEscape(bsSrc)} ]`,
    
    `mkdir -p ${shellEscape(`${paths.appDir}/node_modules/better-sqlite3/build/Release`)}`,
    `cp ${shellEscape(bsSrc)} ${shellEscape(`${paths.appDir}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`)}`,
    
    `mkdir -p ${shellEscape(`${paths.appDir}/node_modules/node-pty/prebuilds/${arch}`)}`,
    `mkdir -p ${shellEscape(`${paths.appDir}/node_modules/node-pty/build/Release`)}`,
    
    // Copy pty nodes - try multiple possible locations
    `for file in pty.node; do`,
    `  src=""`,
    `  if [ -f ${shellEscape(`${paths.nativeBuildDir}/node_modules/node-pty/build/Release`)}/"$file" ]; then src=${shellEscape(`${paths.nativeBuildDir}/node_modules/node-pty/build/Release`)}/"$file"; fi`,
    `  if [ -z "$src" ] && [ -f ${shellEscape(`${paths.nativeBuildDir}/node_modules/node-pty/prebuilds/${arch}`)}/"$file" ]; then src=${shellEscape(`${paths.nativeBuildDir}/node_modules/node-pty/prebuilds/${arch}`)}/"$file"; fi`,
    `  if [ -n "$src" ]; then`,
    `    cp "$src" ${shellEscape(`${paths.appDir}/node_modules/node-pty/prebuilds/${arch}`)}/"$file"`,
    `    cp "$src" ${shellEscape(`${paths.appDir}/node_modules/node-pty/build/Release`)}/"$file"`,
    `  fi`,
    `done`
  ].join("\n");

  await runWslStep("prepare_native_modules", script, runtime, logger);
}

async function verifyNativeModulesInWsl(paths, arch, runtime, logger) {
  const script = [
    "set -euo pipefail",
    `[ -f ${shellEscape(`${paths.appDir}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`)} ]`,
    `[ -f ${shellEscape(`${paths.appDir}/node_modules/node-pty/build/Release/pty.node`)} ]`
  ].join("\n");

  await runWslStep("verify_native_modules", script, runtime, logger);
}

export async function prepareWslCommand(options = {}, injected = {}) {
  const baseConfig = injected.config || (await loadConfig(options));
  const runtimeWorkdir = injected.runtimeWorkdir || baseConfig.workdir;
  const config = makeRuntimeConfig(baseConfig, runtimeWorkdir);
  const runtime = injected.runtimeOptions;
  if (!runtime) {
    throw new Error("Missing runtime options for WSL prepare command.");
  }

  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json),
    logDir: path.join(runtimeWorkdir, "logs")
  });

  await ensureDir(runtimeWorkdir);
  await ensureDir(path.join(runtimeWorkdir, "manifests"));

  const preflight = await runWslPreflight({ distro: runtime.wsl.distro, logger });
  if (!preflight.ok) {
    throw buildWslPreflightError(preflight);
  }

  runtime.wslCommand = preflight.wslCommand;
  runtime.wsl.distro = preflight.distro;

  const homeDir = await resolveWslHomeDir({
    wslCommand: runtime.wslCommand,
    distro: runtime.wsl.distro,
    logger
  });
  const linuxWorkdir = expandWslHomePath(runtime.wsl.workdir, homeDir);
  runtime.wsl.workdir = linuxWorkdir;
  const hostCwdWsl = toWslPath(process.cwd());

  await logger.info("Starting WSL prepare pipeline", {
    runtime: "wsl",
    distro: runtime.wsl.distro || "default",
    linuxWorkdir,
    reuse: Boolean(options.reuse)
  });

  const dmgResolution = await resolveWslDmgPath({
    options,
    runtime,
    logger,
    hostCwdWsl,
    linuxWorkdir
  });

  if (!dmgResolution.dmgPath) {
    throw new Error(
      "No DMG found. Pass --dmg <path>, use --download-latest, or allow automatic download."
    );
  }

  await runWslStep("ensure_workdirs", `mkdir -p ${shellEscape(linuxWorkdir)}`, runtime, logger);

  const hashResult = await runWslStep(
    "hash_dmg",
    `sha256sum ${shellEscape(dmgResolution.dmgPath)}`,
    runtime,
    logger
  );
  const dmgHash = hashResult.stdout.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-f0-9]/g, "");

  const archResult = await runWslStep(
    "resolve_arch",
    "node -p \"process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'\"",
    runtime,
    logger
  );
  const arch = archResult.stdout.trim();

  const paths = {
    workdir: linuxWorkdir,
    extractedDir: `${linuxWorkdir}/extracted/${dmgHash}`,
    electronDir: `${linuxWorkdir}/electron/${dmgHash}`,
    appDir: `${linuxWorkdir}/app/${dmgHash}`,
    nativeRootDir: `${linuxWorkdir}/native`,
    nativeBuildDir: `${linuxWorkdir}/native/pending`,
    userDataDir: `${linuxWorkdir}/userdata/${dmgHash}`,
    cacheDir: `${linuxWorkdir}/cache/${dmgHash}`,
    logsDir: `${linuxWorkdir}/logs`,
    manifestsDir: path.join(runtimeWorkdir, "manifests")
  };

  const reuseProbe = await runWslStep(
    "reuse_probe",
    [
      `app_dir=${shellEscape(paths.appDir)}`,
      `if [ ${options.reuse ? "1" : "0"} -eq 1 ] && [ -f \"$app_dir/package.json\" ] && [ -f \"$app_dir/.vite/build/preload.js\" ]; then echo yes; else echo no; fi`
    ].join("\n"),
    runtime,
    logger
  );
  const reuseHit = reuseProbe.stdout.trim() === "yes";

  if (!reuseHit) {
    const extractedDir = paths.extractedDir;
    const electronDir = paths.electronDir;
    const appDir = paths.appDir;

    await runWslStep(
      "clean_prep_dirs",
      `rm -rf ${shellEscape(extractedDir)} ${shellEscape(electronDir)} ${shellEscape(appDir)} && mkdir -p ${shellEscape(extractedDir)} ${shellEscape(electronDir)} ${shellEscape(appDir)}`,
      runtime,
      logger
    );

    // Step 1: Extract DMG
    await logger.debug("Extracting DMG in WSL");
    await runWslShell(
      `cd ${shellEscape(extractedDir)} && /usr/bin/7z x -y -snl -aoa ${shellEscape(dmgResolution.dmgPath)} || [ $? -le 2 ]`,
      { ...runtime, logger }
    );

    // Step 2: Locate app.asar or 4.hfs
    const asarProbe = await runWslStep(
      "locate_asar",
      `find ${shellEscape(extractedDir)} -maxdepth 10 -name app.asar | head -1`,
      runtime,
      logger
    );
    let asarPath = asarProbe.stdout.trim();

    if (!asarPath) {
      const hfsProbe = await runWslStep(
        "locate_hfs",
        `find ${shellEscape(extractedDir)} -maxdepth 4 -name 4.hfs | head -1`,
        runtime,
        logger
      );
      const hfsPath = hfsProbe.stdout.trim();
      if (!hfsPath) {
        throw new Error("app.asar and 4.hfs not found in DMG");
      }

      await runWslStep(
        "extract_hfs",
        `/usr/bin/7z x -y ${shellEscape(hfsPath)} 'Codex Installer/Codex.app/Contents/Resources/app.asar' 'Codex Installer/Codex.app/Contents/Resources/app.asar.unpacked' -o${shellEscape(electronDir)} || [ $? -le 2 ]`,
        runtime,
        logger
      );

      const hfsAsarProbe = await runWslStep(
        "locate_hfs_asar",
        `find ${shellEscape(electronDir)} -maxdepth 10 -name app.asar | head -1`,
        runtime,
        logger
      );
      asarPath = hfsAsarProbe.stdout.trim();
    } else {
      await runWslStep(
        "copy_asar",
        `cp ${shellEscape(asarPath)} ${shellEscape(electronDir)}/app.asar && ([ ! -d "${asarPath}.unpacked" ] || cp -a "${asarPath}.unpacked" ${shellEscape(electronDir)}/app.asar.unpacked)`,
        runtime,
        logger
      );
      asarPath = `${electronDir}/app.asar`;
    }

    if (!asarPath) {
      throw new Error("Unable to locate app.asar after extraction");
    }

    // Step 3: Unpack ASAR
    await runWslStep(
      "unpack_asar",
      `cd ${shellEscape(appDir)} && npx --yes asar@3.1.0 extract ${shellEscape(electronDir)}/app.asar . && ([ ! -d "${electronDir}/app.asar.unpacked" ] || cp -a "${electronDir}/app.asar.unpacked/." .)`,
      runtime,
      logger
    );
  }

  await patchPreloadInWsl(paths.appDir, runtime, logger);

  await runWslStep(
    "remove_macos_modules",
    `rm -rf ${shellEscape(`${paths.appDir}/node_modules/sparkle-darwin`)} || true\nfind ${shellEscape(paths.appDir)} -name sparkle.node -delete || true`,
    runtime,
    logger
  );

  const metadata = await readMetadataInWsl(paths.appDir, runtime, logger);
  await logger.debug("Read app metadata in WSL", { metadata });
  paths.nativeBuildDir = `${paths.nativeRootDir}/${metadata.electronVersion}-${arch}`;

  await prepareNativeModulesInWsl({ runtime, logger, options, paths, metadata, arch });
  await logger.info("Verifying native modules...");
  await verifyNativeModulesInWsl(paths, arch, runtime, logger);

  const context = {
    runtime: "wsl",
    metadata,
    dmgPath: dmgResolution.dmgPath,
    dmgHash,
    downloadInfo: dmgResolution.downloadInfo,
    paths,
    runtimeContext: {
      distro: runtime.wsl.distro || null,
      linuxWorkdir,
      arch,
      wslCommand: runtime.wslCommand
    }
  };

  const manifestPayload = {
    kind: "prepare",
    runtime: "wsl",
    generatedAt: new Date().toISOString(),
    options,
    config: {
      workdir: runtimeWorkdir,
      wslWorkdir: linuxWorkdir,
      nativeBuildStrategy: config.nativeBuild.strategy
    },
    dmgPath: context.dmgPath,
    dmgHash: context.dmgHash,
    downloadInfo: context.downloadInfo,
    metadata: context.metadata,
    paths: context.paths,
    runtimeContext: context.runtimeContext,
    stageResults: [
      { stage: "resolve_dmg_and_paths", durationMs: 0, warnings: [], outputs: { reuseHit, paths } },
      { stage: "prepare_native_modules", durationMs: 0, warnings: [], outputs: { nativeBuildDir: paths.nativeBuildDir, arch } },
      { stage: "verify_native_modules", durationMs: 0, warnings: [], outputs: { verified: true, arch } }
    ],
    logPath: logger.logPath
  };

  const manifestName = makeManifestName("prepare", context.dmgHash);
  const manifestPath = await writeManifest(path.join(runtimeWorkdir, "manifests"), manifestName, manifestPayload);

  await logger.info("WSL prepare pipeline completed", {
    manifestPath,
    appDir: paths.appDir,
    distro: runtime.wsl.distro || "default"
  });

  if (!(await exists(manifestPath))) {
    throw new Error(`Prepare manifest missing after write: ${manifestPath}`);
  }

  return {
    ok: true,
    runtime: "wsl",
    manifestPath,
    context,
    stageResults: manifestPayload.stageResults,
    logPath: logger.logPath
  };
}
