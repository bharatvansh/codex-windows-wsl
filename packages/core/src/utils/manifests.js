import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { exists, writeJson, readJson } from "./fs.js";

export async function writeManifest(manifestsDir, fileName, payload) {
  const outPath = path.join(manifestsDir, fileName);
  await writeJson(outPath, payload);
  return outPath;
}

export async function readLatestManifest(manifestsDir, prefix) {
  if (!(await exists(manifestsDir))) {
    return null;
  }

  const entries = await readdir(manifestsDir);
  const matches = entries.filter((entry) => entry.startsWith(prefix) && entry.endsWith(".json"));
  if (matches.length === 0) {
    return null;
  }

  const withTimes = await Promise.all(
    matches.map(async (entry) => {
      const full = path.join(manifestsDir, entry);
      const info = await stat(full);
      return { full, mtimeMs: info.mtimeMs };
    })
  );

  withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = withTimes[0].full;

  return {
    path: latest,
    data: await readJson(latest)
  };
}
