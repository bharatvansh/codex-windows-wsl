import path from "node:path";
import { exists, readJson } from "../utils/fs.js";
import { readLatestManifest } from "../utils/manifests.js";

export async function resolveLaunchSource(options, manifestsDir) {
  if (options.prepareManifest) {
    const manifestPath = path.resolve(options.prepareManifest);
    if (!(await exists(manifestPath))) {
      throw new Error(`Prepare manifest not found: ${manifestPath}`);
    }

    const data = await readJson(manifestPath);
    return { manifestPath, data };
  }

  const latest = await readLatestManifest(manifestsDir, "prepare-");
  if (!latest) {
    throw new Error("No prepare manifest found. Run `codex-win prepare` first.");
  }

  return {
    manifestPath: latest.path,
    data: latest.data
  };
}
