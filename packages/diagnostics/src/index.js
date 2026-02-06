import os from "node:os";
import path from "node:path";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

function parseNodeMajor(versionString) {
  const clean = versionString.replace(/^v/, "");
  const major = Number(clean.split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "pipe"
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

async function probeCommand(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(probe, [command]);
  return result.code === 0;
}

export async function runDoctorChecks() {
  const issues = [];
  const checks = [];

  const nodeMajor = parseNodeMajor(process.version);
  checks.push({ name: "node_version", ok: nodeMajor >= 18, value: process.version });
  if (nodeMajor < 18) {
    issues.push("Node.js 18+ is required.");
  }

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
    issues.push("This launcher targets Windows. Current OS is not win32.");
  }

  return {
    ok: issues.length === 0,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpus: os.cpus().length
    },
    checks,
    issues,
    suggestions: [
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
