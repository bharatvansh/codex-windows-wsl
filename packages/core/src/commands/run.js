import { prepareCommand } from "./prepare.js";
import { launchCommand } from "./launch.js";

export async function runCommandWithPrepare(options = {}) {
  const prep = await prepareCommand(options);

  if (options.noLaunch) {
    return {
      ok: true,
      prepareOnly: true,
      prepareManifestPath: prep.manifestPath,
      logPath: prep.logPath
    };
  }

  const launch = await launchCommand({
    ...options,
    prepareManifest: prep.manifestPath
  });

  return {
    ok: true,
    prepareManifestPath: prep.manifestPath,
    launchManifestPath: launch.launchManifestPath,
    logPath: launch.logPath
  };
}
