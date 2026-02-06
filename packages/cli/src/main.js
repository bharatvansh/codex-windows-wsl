import path from "node:path";
import {
  prepareCommand,
  launchCommand,
  runCommandWithPrepare,
  cleanCommand,
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
  report --out <path>             Build support report JSON/ZIP

Common options:
  --workdir <path>                Set work directory (default: ./work)
  --codex-cli <path>              Explicit codex.exe path
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

export async function main(argv) {
  const parsed = parseArgs(argv);
  const { command, options } = parsed;

  if (options.help || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "doctor") {
    const report = await runDoctorChecks();
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
      manifestPath: result.manifestPath,
      logPath: result.logPath,
      appDir: result.context?.paths?.appDir,
      downloadInfo: result.context?.downloadInfo || null
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

  if (command === "report") {
    if (!options.outPath) {
      throw new Error("Missing required option: --out <path>");
    }

    const config = await loadConfig(options);
    const doctor = await runDoctorChecks();
    const manifestsDir = path.join(config.workdir, "manifests");

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
