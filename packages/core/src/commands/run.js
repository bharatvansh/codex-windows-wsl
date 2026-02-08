import { prepareCommand } from "./prepare.js";
import { launchCommand } from "./launch.js";

export async function runCommandWithPrepare(options = {}) {
  const prep = await prepareCommand(options);

  if (options.noLaunch) {
    return {
      ok: true,
      runtime: prep.runtime || options.runtime || "windows",
      prepareOnly: true,
      prepareManifestPath: prep.manifestPath,
      logPath: prep.logPath
    };
  }

  const launch = await launchCommand({
    ...options,
    runtime: prep.runtime || options.runtime,
    prepareManifest: prep.manifestPath
  });

  return {
    ok: true,
    runtime: launch.runtime || prep.runtime || options.runtime || "windows",
    prepareManifestPath: prep.manifestPath,
    launchManifestPath: launch.launchManifestPath,
    logPath: launch.logPath
  };
}
