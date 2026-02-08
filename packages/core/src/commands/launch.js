import { resolveCommandContext } from "../runtime/commandContext.js";
import { shouldFallbackToWindows } from "../runtime/fallback.js";
import { launchWindowsCommand } from "./launchWindows.js";
import { launchWslCommand } from "./launchWsl.js";

function withFallbackHint(error, runtimeOptions) {
  if (runtimeOptions.runtime !== "wsl") {
    return error;
  }

  if (runtimeOptions.runtimeFallback !== "prompt") {
    return error;
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    return error;
  }

  return new Error(`${error.message} Set --runtime-fallback windows to auto-fallback in non-interactive mode.`);
}

export async function launchCommand(options = {}, internal = {}) {
  const context = internal.context || (await resolveCommandContext(options));

  if (context.runtimeOptions.runtime === "windows") {
    return launchWindowsCommand(options, context);
  }

  try {
    return await launchWslCommand(options, context);
  } catch (error) {
    throw withFallbackHint(error, context.runtimeOptions);
  }
}
