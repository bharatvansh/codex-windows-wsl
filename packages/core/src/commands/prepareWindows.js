import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { createLogger } from "../utils/logger.js";
import { writeManifest } from "../utils/manifests.js";
import { createPrepareStages, createInitialPrepareContext } from "../stages/prepareStages.js";
import { runPipeline } from "../pipeline/pipeline.js";

function makeManifestName(prefix, hash) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const shortHash = hash.slice(0, 12);
  return `${prefix}-${timestamp}-${shortHash}.json`;
}

export async function prepareWindowsCommand(options = {}, injected = {}) {
  const config = injected.config || (await loadConfig(options));
  const runtimeWorkdir = injected.runtimeWorkdir || config.workdir;

  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json),
    logDir: path.join(runtimeWorkdir, "logs")
  });

  const runtimeConfig = {
    ...config,
    workdir: runtimeWorkdir
  };

  const context = await createInitialPrepareContext(runtimeConfig, options, logger);

  await logger.info("Starting prepare pipeline", {
    runtime: "windows",
    workdir: runtimeWorkdir,
    reuse: Boolean(options.reuse)
  });

  const stages = createPrepareStages();
  const results = await runPipeline(stages, context, logger);

  const manifestPayload = {
    kind: "prepare",
    runtime: "windows",
    generatedAt: new Date().toISOString(),
    options,
    config: {
      workdir: runtimeWorkdir,
      nativeBuildStrategy: config.nativeBuild.strategy
    },
    dmgPath: context.dmgPath,
    dmgHash: context.dmgHash,
    downloadInfo: context.downloadInfo,
    metadata: context.metadata,
    paths: context.paths,
    stageResults: results,
    logPath: logger.logPath
  };

  const manifestName = makeManifestName("prepare", context.dmgHash);
  const manifestPath = await writeManifest(context.paths.manifestsDir, manifestName, manifestPayload);

  await logger.info("Prepare pipeline completed", {
    runtime: "windows",
    manifestPath,
    appDir: context.paths.appDir
  });

  return {
    ok: true,
    runtime: "windows",
    manifestPath,
    context,
    stageResults: results,
    logPath: logger.logPath
  };
}
