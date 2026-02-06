import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { removePath, exists } from "../utils/fs.js";

export async function cleanCommand(options = {}) {
  const config = await loadConfig(options);
  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json)
  });

  const targets = options.cacheOnly
    ? [
        path.join(config.workdir, "cache"),
        path.join(config.workdir, "logs"),
        path.join(config.workdir, "manifests")
      ]
    : [config.workdir];

  const removed = [];
  for (const target of targets) {
    if (await exists(target)) {
      await removePath(target);
      removed.push(target);
      await logger.info("Removed path", { target });
    }
  }

  return {
    ok: true,
    removed
  };
}
