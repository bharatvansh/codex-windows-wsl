import { resolveCommandContext } from "../runtime/commandContext.js";
import { shouldFallbackToWindows } from "../runtime/fallback.js";
import { prepareWindowsCommand } from "./prepareWindows.js";
import { prepareWslCommand } from "./prepareWsl.js";

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

export async function prepareCommand(options = {}, internal = {}) {
  const context = internal.context || (await resolveCommandContext(options));

  if (context.runtimeOptions.runtime === "windows") {
    return prepareWindowsCommand(options, context);
  }

  try {
    return await prepareWslCommand(options, context);
  } catch (error) {
    throw withFallbackHint(error, context.runtimeOptions);
  }
}
