import { loadConfig } from "../config/loadConfig.js";
import { resolveRuntimeOptions, resolveRuntimeWorkdir } from "./resolveRuntime.js";

export async function resolveCommandContext(options = {}, overrides = {}) {
  const config = await loadConfig(options);

  const runtimeOptions = resolveRuntimeOptions(config, {
    ...options,
    ...(overrides.forceRuntime ? { runtime: overrides.forceRuntime } : {})
  });

  const runtimeWorkdir = resolveRuntimeWorkdir(config.workdir, runtimeOptions.runtime);

  return {
    config,
    runtimeOptions,
    runtimeWorkdir
  };
}
