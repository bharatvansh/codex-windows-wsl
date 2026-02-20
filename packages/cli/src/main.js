import path from "node:path";
import {
  prepareCommand,
  launchCommand,
  runCommandWithPrepare,
  cleanCommand,
  killCommand,
  loadConfig,
  readLatestManifest
} from "@codex-win/core";
import { runDoctorChecks, writeSupportReport } from "@codex-win/diagnostics";
import { parseArgs } from "./parseArgs.js";

function printHelp() {
  console.log(`codex-win - Windows compatibility launcher for Codex app assets

Usage:
  codex-win <command> [options]

Commands:
  doctor                          Run environment compatibility checks
  prepare [--dmg <path>]          Extract/patch/prepare native modules
  launch [--prepare-manifest <p>] Launch from latest or explicit prepare manifest
  run [--dmg <path>]              Run prepare then launch
  clean [--cache-only]            Remove work artifacts
  kill [--runtime <windows|wsl>]  Kill stuck app processes
  report --out <path>             Build support report JSON/ZIP

Common options:
  --workdir <path>                Set work directory (default: ./work)
  --codex-cli <path>              Explicit codex.exe path
  --runtime <windows|wsl>         Choose runtime environment (default: windows)
  --wsl-distro <name>             WSL distro name (default: system default distro)
  --wsl-workdir <path>            Linux workdir for WSL runtime (default: ~/.codex-win/work)
  --wsl-codex-cli <path>          Explicit codex CLI path inside WSL
  --runtime-fallback <mode>       prompt | windows | none (WSL failures only)
  --download-latest               Force download latest DMG from official OpenAI URL
  --no-download-latest            Disable auto-download when local DMG is missing
  --download-url <url>            Override DMG download URL (advanced)
  --reuse                         Reuse previously prepared app/native artifacts
  --log-level <level>             error | warn | info | debug
  --json                          JSON logging mode
`);
}

function printResult(result) {
  if (!result) {
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function resolveRuntimeManifestsWorkdir(config, options = {}) {
  const runtime = String(options.runtime || config.runtime || "windows").toLowerCase();
  if (runtime === "wsl") {
    return path.join(config.workdir, "wsl");
  }

  return config.workdir;
}

function buildDoctorOptions(config, options = {}) {
  return {
    runtime: options.runtime || config.runtime,
    wslDistro: options.wslDistro || config.wsl?.distro
  };
}

export async function main(argv) {
  const parsed = parseArgs(argv);
  const { command, options } = parsed;

  if (options.help || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "doctor") {
    const config = await loadConfig(options);
    const report = await runDoctorChecks(buildDoctorOptions(config, options));
    printResult(report);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "prepare") {
    const result = await prepareCommand(options);
    printResult({
      ok: result.ok,
      runtime: result.runtime || options.runtime || "windows",
      manifestPath: result.manifestPath,
      logPath: result.logPath,
      appDir: result.context?.paths?.appDir,
      downloadInfo: result.context?.downloadInfo || null,
      runtimeContext: result.context?.runtimeContext || null
    });
    return;
  }

  if (command === "launch") {
    const result = await launchCommand(options);
    printResult(result);
    return;
  }

  if (command === "run") {
    if (options.noPrepare) {
      const launchOnly = await launchCommand(options);
      printResult(launchOnly);
      return;
    }

    const result = await runCommandWithPrepare(options);
    printResult(result);
    return;
  }

  if (command === "clean") {
    const result = await cleanCommand(options);
    printResult(result);
    return;
  }

  if (command === "kill") {
    const result = await killCommand(options);
    printResult(result);
    return;
  }

  if (command === "report") {
    if (!options.outPath) {
      throw new Error("Missing required option: --out <path>");
    }

    const config = await loadConfig(options);
    const doctor = await runDoctorChecks(buildDoctorOptions(config, options));
    const manifestsDir = path.join(resolveRuntimeManifestsWorkdir(config, options), "manifests");

    const prepare = await readLatestManifest(manifestsDir, "prepare-");
    const launch = await readLatestManifest(manifestsDir, "launch-");

    const report = await writeSupportReport({
      outPath: options.outPath,
      doctor,
      prepareManifest: prepare?.data || null,
      launchManifest: launch?.data || null,
      logs: [prepare?.data?.logPath, launch?.data?.logPath].filter(Boolean)
    });

    printResult({ ok: true, report });
    return;
  }

  printHelp();
  throw new Error(`Unknown command: ${command}`);
}
