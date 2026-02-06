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

export async function prepareCommand(options = {}) {
  const config = await loadConfig(options);
  const logger = await createLogger({
    level: config.logging.level,
    json: Boolean(options.json),
    logDir: path.join(config.workdir, "logs")
  });

  const context = await createInitialPrepareContext(config, options, logger);

  await logger.info("Starting prepare pipeline", {
    workdir: config.workdir,
    reuse: Boolean(options.reuse)
  });

  const stages = createPrepareStages();
  const results = await runPipeline(stages, context, logger);

  const manifestPayload = {
    kind: "prepare",
    generatedAt: new Date().toISOString(),
    options,
    config: {
      workdir: config.workdir,
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
    manifestPath,
    appDir: context.paths.appDir
  });

  return {
    ok: true,
    manifestPath,
    context,
    stageResults: results,
    logPath: logger.logPath
  };
}
