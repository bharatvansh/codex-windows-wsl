import { appendFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs.js";

const LEVELS = ["error", "warn", "info", "debug"];

function levelIndex(level) {
  return LEVELS.indexOf(level);
}

export async function createLogger(options = {}) {
  const level = options.level || "info";
  const json = Boolean(options.json);
  const logDir = options.logDir;
  const logPath = logDir
    ? path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.log`)
    : null;

  if (logDir) {
    await ensureDir(logDir);
  }

  async function writeLog(levelName, message, meta) {
    if (levelIndex(levelName) > levelIndex(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level: levelName,
      message,
      ...(meta ? { meta } : {})
    };

    const line = json
      ? JSON.stringify(payload)
      : `[${timestamp}] ${levelName.toUpperCase()} ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;

    if (levelName === "error") {
      console.error(line);
    } else if (levelName === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (logPath) {
      try {
        await appendFile(logPath, line + "\n", "utf8");
      } catch {
        // Logging should never break command execution.
      }
    }
  }

  return {
    logPath,
    error: (message, meta) => writeLog("error", message, meta),
    warn: (message, meta) => writeLog("warn", message, meta),
    info: (message, meta) => writeLog("info", message, meta),
    debug: (message, meta) => writeLog("debug", message, meta)
  };
}
