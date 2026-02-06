import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function findFirstByName(root, targetName, options = {}) {
  const maxDepth = options.maxDepth ?? 12;

  async function walk(current, depth) {
    if (depth > maxDepth) {
      return null;
    }

    let entries;
    try {
      entries = await readdir(current);
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (entry === targetName) {
        return path.join(current, entry);
      }
    }

    for (const entry of entries) {
      const full = path.join(current, entry);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }

      if (!info.isDirectory()) {
        continue;
      }

      const nested = await walk(full, depth + 1);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  return walk(root, 0);
}
