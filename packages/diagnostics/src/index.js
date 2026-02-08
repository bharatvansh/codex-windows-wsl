import os from "node:os";
import path from "node:path";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

const WSL_REQUIRED_COMMANDS = ["node", "npm", "npx", "git", "7z", "curl", "python3"];

function parseNodeMajor(versionString) {
  const clean = versionString.replace(/^v/, "");
  const major = Number(clean.split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function normalizeRuntime(value) {
  if (typeof value !== "string") {
    return "windows";
  }

  const runtime = value.trim().toLowerCase();
  if (runtime === "wsl") {
    return "wsl";
  }

  return "windows";
}

function parseWslDistroList(raw = "") {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, "").trim())
    .filter(Boolean);
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "pipe",
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function commandPathExists(command) {
  try {
    await access(command, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function probeCommand(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(probe, [command]);
  return result.code === 0;
}

async function probeWslCommand() {
  const candidates =
    process.platform === "win32" ? ["wsl.exe", "wsl"] : ["wsl", "wsl.exe"];

  for (const candidate of candidates) {
    if (await probeCommand(candidate)) {
      return candidate;
    }
  }

  const explicit = "/mnt/c/Windows/System32/wsl.exe";
  if (await commandPathExists(explicit)) {
    return explicit;
  }

  return null;
}

async function runWslCommand(wslCommand, distro, script) {
  const args = [];
  if (distro) {
    args.push("-d", distro);
  }
  args.push("--", "bash", "-lc", script);
  return runCommand(wslCommand, args);
}

async function runWindowsDoctorChecks(checks, issues) {
  const requiredCommands = ["npm", "npx", "git", "7z"];
  for (const command of requiredCommands) {
    const ok = await probeCommand(command);
    checks.push({ name: `command_${command}`, ok, value: ok ? "found" : "missing" });
    if (!ok) {
      issues.push(`Missing command: ${command}`);
    }
  }

  const osCheck = process.platform === "win32";
  checks.push({ name: "windows_os", ok: osCheck, value: process.platform });
  if (!osCheck) {
    issues.push("Windows runtime requires win32 host shell.");
  }
}

async function runWslDoctorChecks(runtimeOptions, checks, issues) {
  const wslCommand = await probeWslCommand();
  checks.push({
    name: "wsl_command",
    ok: Boolean(wslCommand),
    value: wslCommand || "missing"
  });

  if (!wslCommand) {
    issues.push("Unable to find wsl command. Install/enable WSL.");
    return {
      wslCommand: null,
      distro: null
    };
  }

  const distroListResult = await runCommand(wslCommand, ["-l", "-q"]);
  const distros = distroListResult.code === 0 ? parseWslDistroList(distroListResult.stdout) : [];
  const requestedDistro = runtimeOptions.wslDistro || null;
  const resolvedDistro = requestedDistro
    ? distros.find((distro) => distro.toLowerCase() === requestedDistro.toLowerCase()) || null
    : null;

  checks.push({
    name: "wsl_distro",
    ok: !requestedDistro || Boolean(resolvedDistro),
    value: requestedDistro || "(default)"
  });

  if (requestedDistro && !resolvedDistro) {
    issues.push(
      `WSL distro not found: ${requestedDistro}${distros.length > 0 ? ` (available: ${distros.join(", ")})` : ""}`
    );
  }

  const distroForChecks = resolvedDistro || requestedDistro || null;
  const depScript = `missing=(); for cmd in ${WSL_REQUIRED_COMMANDS.join(" ")}; do command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd"); done; printf '%s' "${"${missing[*]}"}"`;
  const depResult = await runWslCommand(wslCommand, distroForChecks, depScript);
  const missingDeps =
    depResult.code === 0
      ? depResult.stdout
          .trim()
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean)
      : WSL_REQUIRED_COMMANDS;

  checks.push({
    name: "wsl_required_commands",
    ok: depResult.code === 0 && missingDeps.length === 0,
    value: missingDeps.length === 0 ? "found" : `missing: ${missingDeps.join(", ")}`
  });

  if (depResult.code !== 0) {
    issues.push(`Failed to probe WSL dependencies: ${depResult.stderr || "unknown error"}`);
  } else if (missingDeps.length > 0) {
    issues.push(`Missing WSL commands: ${missingDeps.join(", ")}`);
  }

  const displayResult = await runWslCommand(
    wslCommand,
    distroForChecks,
    "if [ -n \"$WAYLAND_DISPLAY\" ] || [ -n \"$DISPLAY\" ]; then echo yes; else echo no; fi"
  );
  const displayOk = displayResult.code === 0 && displayResult.stdout.trim() === "yes";
  checks.push({
    name: "wsl_display",
    ok: displayOk,
    value: displayOk ? "available" : "missing"
  });
  if (!displayOk) {
    issues.push("No GUI display in WSL (missing WAYLAND_DISPLAY/DISPLAY). Enable WSLg or X server.");
  }

  return {
    wslCommand,
    distro: distroForChecks
  };
}

export async function runDoctorChecks(options = {}) {
  const issues = [];
  const checks = [];
  const runtime = normalizeRuntime(options.runtime);

  const nodeMajor = parseNodeMajor(process.version);
  checks.push({ name: "node_version", ok: nodeMajor >= 18, value: process.version });
  if (nodeMajor < 18) {
    issues.push("Node.js 18+ is required.");
  }

  let runtimeContext = { runtime };
  if (runtime === "wsl") {
    runtimeContext = {
      runtime,
      ...(await runWslDoctorChecks(options, checks, issues))
    };
  } else {
    await runWindowsDoctorChecks(checks, issues);
  }

  return {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    runtime,
    runtimeContext,
    environment: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpus: os.cpus().length
    },
    checks,
    issues,
    suggestions:
      runtime === "wsl"
        ? [
            "Install WSL and verify `wsl -l -q` returns your distro.",
            "Inside WSL install dependencies: nodejs npm p7zip-full curl python3 git.",
            "Enable WSLg (or X server) so DISPLAY/WAYLAND_DISPLAY is available.",
            "Install Codex CLI in WSL via `npm i -g @openai/codex`."
          ]
        : [
            "Install 7-Zip and ensure `7z` is on PATH.",
            "Install Visual Studio Build Tools if native module rebuild fails.",
            "Install Codex CLI via `npm i -g @openai/codex`."
          ]
  };
}

export async function writeSupportReport(options = {}) {
  const {
    outPath,
    doctor,
    prepareManifest,
    launchManifest,
    logs = []
  } = options;

  if (!outPath) {
    throw new Error("outPath is required");
  }

  const absoluteOut = path.resolve(outPath);
  await ensureDir(path.dirname(absoluteOut));

  const payload = {
    generatedAt: new Date().toISOString(),
    doctor,
    prepareManifest,
    launchManifest,
    logs
  };

  if (absoluteOut.endsWith(".json")) {
    await writeJson(absoluteOut, payload);
    return { outPath: absoluteOut, format: "json" };
  }

  if (absoluteOut.endsWith(".zip") && process.platform === "win32") {
    const tempDir = absoluteOut.replace(/\.zip$/, "");
    await ensureDir(tempDir);

    const summaryPath = path.join(tempDir, "summary.json");
    await writeJson(summaryPath, payload);

    const script = `Compress-Archive -Path \"${tempDir}\\*\" -DestinationPath \"${absoluteOut}\" -Force`;
    const result = await runCommand("powershell", ["-NoProfile", "-Command", script]);
    if (result.code !== 0) {
      throw new Error(result.stderr || "Failed to create zip report.");
    }

    return { outPath: absoluteOut, format: "zip" };
  }

  await writeFile(absoluteOut, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { outPath: absoluteOut, format: "json" };
}
