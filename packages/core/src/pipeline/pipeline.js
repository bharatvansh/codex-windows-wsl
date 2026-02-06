export class PipelineExecutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PipelineExecutionError";
    this.details = details;
  }
}

export async function runPipeline(stages, context, logger) {
  const results = [];

  for (const stage of stages) {
    const start = Date.now();

    try {
      const output = await stage.run(context);
      const durationMs = Date.now() - start;

      const stageResult = {
        stage: stage.name,
        durationMs,
        warnings: output?.warnings || [],
        outputs: output?.outputs || output || {}
      };

      context.stageOutputs[stage.name] = stageResult.outputs;
      results.push(stageResult);

      await logger.info(`Stage completed: ${stage.name}`, {
        durationMs,
        warnings: stageResult.warnings.length
      });
    } catch (error) {
      const durationMs = Date.now() - start;

      await logger.error(`Stage failed: ${stage.name}`, {
        durationMs,
        message: error.message
      });

      throw new PipelineExecutionError(`Stage failed: ${stage.name}`, {
        stage: stage.name,
        durationMs,
        previousResults: results,
        cause: error.message
      });
    }
  }

  return results;
}
