import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { removePath, exists } from "../utils/fs.js";

export async function cleanWindowsCommand(options = {}, injected = {}) {
  const config = injected.config || (await loadConfig(options));
  const runtimeWorkdir = injected.runtimeWorkdir || config.workdir;

  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json)
  });

  const targets = options.cacheOnly
    ? [
        path.join(runtimeWorkdir, "cache"),
        path.join(runtimeWorkdir, "logs"),
        path.join(runtimeWorkdir, "manifests")
      ]
    : [runtimeWorkdir];

  const removed = [];
  for (const target of targets) {
    if (await exists(target)) {
      await removePath(target);
      removed.push(target);
      await logger.info("Removed path", { runtime: "windows", target });
    }
  }

  return {
    ok: true,
    runtime: "windows",
    removed
  };
}
