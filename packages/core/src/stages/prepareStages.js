import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import {
  ensureDir,
  exists,
  copyDirectory,
  readJson,
  removePath
} from "../utils/fs.js";
import { runCommand, commandExists } from "../utils/exec.js";
import { sha256File } from "../utils/hash.js";
import { resolveWorkPaths } from "../utils/paths.js";
import { getWindowsArch } from "../utils/platform.js";
import { findFirstByName } from "../utils/discovery.js";
import { getPatchRecipes } from "@codex-win/patches";

async function resolve7ZipPath(context) {
  if (await commandExists("7z")) {
    return "7z";
  }

  const candidates = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe"
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  if (context.config.autoInstallTools === "always") {
    const install = await runCommand("winget", [
      "install",
      "--id",
      "7zip.7zip",
      "-e",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--silent"
    ]);

    if (install.code === 0) {
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

async function resolveDmgPath(optionDmgPath) {
  if (optionDmgPath) {
    const absolute = path.resolve(optionDmgPath);
    if (await exists(absolute)) {
      return absolute;
    }
    throw new Error(`DMG not found: ${optionDmgPath}`);
  }

  const defaultDmg = path.resolve(process.cwd(), "Codex.dmg");
  if (await exists(defaultDmg)) {
    return defaultDmg;
  }

  return null;
}

async function extractDmg(context) {
  await ensureDir(context.paths.extractedDir);
  const args = ["x", "-y", context.dmgPath, `-o${context.paths.extractedDir}`];
  const result = await runCommand(context.tools.sevenZip, args, { logger: context.logger });

  if (result.code !== 0) {
    // 7-Zip fails on macOS symlinks (framework bundles) without admin privileges
    // Check if the extraction still succeeded for the files we actually need
    const isSymlinkError = result.stderr &&
      (result.stderr.includes("Cannot create symbolic link") ||
        result.stderr.includes("A required privilege is not held"));

    if (isSymlinkError) {
      // Check if app.asar was extracted despite symlink errors
      const asarCheck = await findFirstByName(context.paths.extractedDir, "app.asar", { maxDepth: 10 });
      if (asarCheck) {
        context.logger.warn("DMG extraction had symlink errors (expected on Windows), but app.asar was found");
        return; // Continue despite symlink errors
      }
    }

    throw new Error(result.stderr || "Failed to extract DMG");
  }
}

async function locateAsarFromExtracted(context) {
  const directAsar = await findFirstByName(context.paths.extractedDir, "app.asar", {
    maxDepth: 10
  });

  if (directAsar) {
    const stagedAsar = path.join(context.paths.electronDir, "app.asar");
    await ensureDir(context.paths.electronDir);
    await copyFile(directAsar, stagedAsar);

    const unpackedSibling = path.join(path.dirname(directAsar), "app.asar.unpacked");
    if (await exists(unpackedSibling)) {
      const stagedUnpacked = path.join(context.paths.electronDir, "app.asar.unpacked");
      await copyDirectory(unpackedSibling, stagedUnpacked);
      context.asarUnpackedPath = stagedUnpacked;
    }

    context.asarPath = stagedAsar;
    return;
  }

  const hfsPath = await findFirstByName(context.paths.extractedDir, "4.hfs", {
    maxDepth: 4
  });

  if (!hfsPath) {
    throw new Error("Unable to find app.asar or 4.hfs after DMG extraction");
  }

  await ensureDir(context.paths.electronDir);
  const extractArgs = [
    "x",
    "-y",
    hfsPath,
    "Codex Installer/Codex.app/Contents/Resources/app.asar",
    "Codex Installer/Codex.app/Contents/Resources/app.asar.unpacked",
    `-o${context.paths.electronDir}`
  ];

  const result = await runCommand(context.tools.sevenZip, extractArgs, {
    logger: context.logger
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to extract app.asar from HFS");
  }

  const hfsAsar = await findFirstByName(context.paths.electronDir, "app.asar", {
    maxDepth: 10
  });

  if (!hfsAsar) {
    throw new Error("app.asar not found after HFS extraction");
  }

  const stagedAsar = path.join(context.paths.electronDir, "app.asar");
  if (path.resolve(hfsAsar) !== path.resolve(stagedAsar)) {
    await copyFile(hfsAsar, stagedAsar);
  }

  const unpacked = await findFirstByName(context.paths.electronDir, "app.asar.unpacked", {
    maxDepth: 10
  });
  if (unpacked) {
    const stagedUnpacked = path.join(context.paths.electronDir, "app.asar.unpacked");
    if (path.resolve(unpacked) !== path.resolve(stagedUnpacked)) {
      await copyDirectory(unpacked, stagedUnpacked);
    }
    context.asarUnpackedPath = stagedUnpacked;
  }

  context.asarPath = stagedAsar;
}

async function unpackAsar(context) {
  await removePath(context.paths.appDir);
  await ensureDir(context.paths.appDir);

  // Quote paths to handle spaces in Windows paths
  const quotedAsarPath = `"${context.asarPath}"`;
  const quotedAppDir = `"${context.paths.appDir}"`;

  const unpackResult = await runCommand(
    "npx",
    ["--yes", "@electron/asar", "extract", quotedAsarPath, quotedAppDir],
    { logger: context.logger, shell: true }
  );

  if (unpackResult.code !== 0) {
    throw new Error(unpackResult.stderr || "Failed to unpack app.asar");
  }

  if (context.asarUnpackedPath && (await exists(context.asarUnpackedPath))) {
    await copyDirectory(context.asarUnpackedPath, context.paths.appDir);
  }
}

async function applyPatches(context) {
  const recipes = getPatchRecipes();
  const patchResults = [];

  for (const recipe of recipes) {
    if (!recipe.supports(context.metadata || {})) {
      continue;
    }

    const applied = await recipe.apply({ appDir: context.paths.appDir });
    const verified = await recipe.verify({ appDir: context.paths.appDir });

    if (!verified.ok) {
      throw new Error(`Patch verification failed: ${recipe.id}`);
    }

    patchResults.push({
      id: recipe.id,
      changed: applied.changed,
      reason: applied.reason
    });
  }

  return patchResults;
}

async function readMetadata(context) {
  const pkgPath = path.join(context.paths.appDir, "package.json");
  if (!(await exists(pkgPath))) {
    throw new Error(`package.json missing from app dir: ${pkgPath}`);
  }

  const pkg = await readJson(pkgPath);
  const electronVersion =
    pkg?.devDependencies?.electron ||
    pkg?.dependencies?.electron ||
    pkg?.optionalDependencies?.electron;

  if (!electronVersion) {
    throw new Error("Electron version not found in package.json");
  }

  context.metadata = {
    packageName: pkg.name,
    packageVersion: pkg.version,
    electronVersion,
    betterSqlite3Version: pkg?.dependencies?.["better-sqlite3"] || null,
    nodePtyVersion: pkg?.dependencies?.["node-pty"] || null,
    codexBuildNumber: pkg?.codexBuildNumber || null,
    codexBuildFlavor: pkg?.codexBuildFlavor || null
  };
}

async function prepareNativeModules(context) {
  const betterVersion = context.metadata.betterSqlite3Version;
  const ptyVersion = context.metadata.nodePtyVersion;

  if (!betterVersion || !ptyVersion) {
    throw new Error("Native module versions missing from app package metadata");
  }

  const arch = getWindowsArch();
  const nativeKey = `${context.metadata.electronVersion}-${arch}`;
  const nativeBuildDir = path.join(context.paths.nativeRootDir, nativeKey);
  context.paths.nativeBuildDir = nativeBuildDir;

  await ensureDir(nativeBuildDir);

  const appBetterDst = path.join(
    context.paths.appDir,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );

  const appPtyDst = path.join(
    context.paths.appDir,
    "node_modules",
    "node-pty",
    "prebuilds",
    arch,
    "pty.node"
  );

  const skipOnReuse = context.options.reuse && (await exists(appBetterDst)) && (await exists(appPtyDst));
  if (skipOnReuse) {
    return {
      skipped: true,
      reason: "reuse requested and app native modules already present",
      nativeBuildDir
    };
  }

  if (!(await exists(path.join(nativeBuildDir, "package.json")))) {
    const init = await runCommand("npm", ["init", "-y"], {
      cwd: nativeBuildDir,
      logger: context.logger,
      shell: true
    });

    if (init.code !== 0) {
      throw new Error(init.stderr || "npm init failed in native build dir");
    }
  }

  const deps = [
    `better-sqlite3@${betterVersion}`,
    `node-pty@${ptyVersion}`,
    "@electron/rebuild",
    "prebuild-install",
    `electron@${context.metadata.electronVersion}`
  ];

  const install = await runCommand("npm", ["install", "--no-save", ...deps], {
    cwd: nativeBuildDir,
    logger: context.logger,
    shell: true
  });

  if (install.code !== 0) {
    throw new Error(install.stderr || "npm install failed for native modules");
  }

  const rebuildCli = path.join(nativeBuildDir, "node_modules", "@electron", "rebuild", "lib", "cli.js");
  const rebuild = await runCommand(
    "node",
    [rebuildCli, "-v", context.metadata.electronVersion, "-w", "better-sqlite3,node-pty"],
    {
      cwd: nativeBuildDir,
      logger: context.logger
    }
  );

  if (rebuild.code !== 0) {
    context.nativeWarnings.push("electron-rebuild failed, attempting prebuild fallback");

    const prebuildCli = path.join(nativeBuildDir, "node_modules", "prebuild-install", "bin.js");
    const bsDir = path.join(nativeBuildDir, "node_modules", "better-sqlite3");
    const fallback = await runCommand(
      "node",
      [prebuildCli, "-r", "electron", "-t", context.metadata.electronVersion, "--tag-prefix=electron-v"],
      {
        cwd: bsDir,
        logger: context.logger
      }
    );

    if (fallback.code !== 0) {
      // Check if native file exists despite the error - it may have been built by npm install
      const bsSrc = path.join(nativeBuildDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
      if (!(await exists(bsSrc))) {
        throw new Error(fallback.stderr || "Failed native rebuild and fallback prebuild");
      }
      context.nativeWarnings.push("prebuild-install reported failure but native file exists, continuing");
    }
  }

  const bsSrc = path.join(nativeBuildDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const ptySrcDir = path.join(nativeBuildDir, "node_modules", "node-pty", "prebuilds", arch);

  if (!(await exists(bsSrc))) {
    throw new Error("Native file missing: better_sqlite3.node");
  }

  await ensureDir(path.dirname(appBetterDst));
  await copyFile(bsSrc, appBetterDst);

  const ptyTargets = [
    path.join(context.paths.appDir, "node_modules", "node-pty", "prebuilds", arch),
    path.join(context.paths.appDir, "node_modules", "node-pty", "build", "Release")
  ];

  for (const target of ptyTargets) {
    await ensureDir(target);
  }

  for (const fileName of ["pty.node", "conpty.node", "conpty_console_list.node"]) {
    const src = path.join(ptySrcDir, fileName);
    if (!(await exists(src))) {
      continue;
    }

    for (const target of ptyTargets) {
      await copyFile(src, path.join(target, fileName));
    }
  }

  return {
    skipped: false,
    nativeBuildDir,
    arch
  };
}

async function verifyNativeModules(context) {
  const arch = getWindowsArch();
  const checks = [
    path.join(
      context.paths.appDir,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node"
    ),
    path.join(context.paths.appDir, "node_modules", "node-pty", "prebuilds", arch, "pty.node")
  ];

  const missing = [];
  for (const check of checks) {
    if (!(await exists(check))) {
      missing.push(check);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Native verification failed. Missing files: ${missing.join(", ")}`);
  }

  return {
    verified: true,
    arch,
    checkedFiles: checks
  };
}

export function createPrepareStages() {
  return [
    {
      name: "resolve_dmg_and_paths",
      async run(context) {
        const dmgPath = await resolveDmgPath(context.options.dmgPath);
        if (!dmgPath) {
          throw new Error("No DMG found. Pass --dmg <path> or place Codex.dmg in the project root.");
        }

        context.dmgPath = dmgPath;
        context.dmgHash = await sha256File(dmgPath);
        context.paths = resolveWorkPaths(context.config.workdir, context.dmgHash, getWindowsArch());

        await ensureDir(context.paths.workdir);
        await ensureDir(context.paths.logsDir);
        await ensureDir(context.paths.manifestsDir);

        context.tools.sevenZip = await resolve7ZipPath(context);
        if (!context.tools.sevenZip) {
          throw new Error("7z not found. Install 7-Zip or set autoInstallTools to always.");
        }

        context.reuseHit =
          context.options.reuse &&
          (await exists(path.join(context.paths.appDir, "package.json"))) &&
          (await exists(path.join(context.paths.appDir, ".vite", "build", "preload.js")));

        return {
          outputs: {
            dmgPath,
            dmgHash: context.dmgHash,
            paths: context.paths,
            sevenZip: context.tools.sevenZip,
            reuseHit: context.reuseHit
          }
        };
      }
    },
    {
      name: "extract_dmg",
      async run(context) {
        if (context.reuseHit) {
          return {
            warnings: ["reuse mode: skipping DMG extraction"],
            outputs: { skipped: true }
          };
        }

        await extractDmg(context);
        return {
          outputs: {
            extractedDir: context.paths.extractedDir
          }
        };
      }
    },
    {
      name: "locate_or_extract_asar",
      async run(context) {
        if (context.reuseHit) {
          return {
            warnings: ["reuse mode: skipping ASAR locate/extract"],
            outputs: { skipped: true }
          };
        }

        await locateAsarFromExtracted(context);
        return {
          outputs: {
            asarPath: context.asarPath,
            asarUnpackedPath: context.asarUnpackedPath || null
          }
        };
      }
    },
    {
      name: "unpack_asar",
      async run(context) {
        if (context.reuseHit) {
          return {
            warnings: ["reuse mode: skipping ASAR unpack"],
            outputs: { skipped: true }
          };
        }

        await unpackAsar(context);
        return {
          outputs: {
            appDir: context.paths.appDir
          }
        };
      }
    },
    {
      name: "patch_preload",
      async run(context) {
        const patchResults = await applyPatches(context);
        return {
          outputs: {
            patches: patchResults
          }
        };
      }
    },
    {
      name: "read_metadata",
      async run(context) {
        await readMetadata(context);
        return {
          outputs: context.metadata
        };
      }
    },
    {
      name: "prepare_native_modules",
      async run(context) {
        const output = await prepareNativeModules(context);
        return {
          warnings: context.nativeWarnings,
          outputs: output
        };
      }
    },
    {
      name: "verify_native_modules",
      async run(context) {
        const output = await verifyNativeModules(context);
        return {
          outputs: output
        };
      }
    }
  ];
}

export async function createInitialPrepareContext(config, options, logger) {
  return {
    config,
    options,
    logger,
    stageOutputs: {},
    tools: {},
    metadata: null,
    paths: null,
    dmgPath: null,
    dmgHash: null,
    asarPath: null,
    asarUnpackedPath: null,
    reuseHit: false,
    nativeWarnings: []
  };
}
