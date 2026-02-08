import { resolveCommandContext } from "../runtime/commandContext.js";
import { cleanWindowsCommand } from "./cleanWindows.js";
import { cleanWslCommand } from "./cleanWsl.js";
import { resolveWslCommand } from "../runtime/wslExec.js";

export async function cleanCommand(options = {}, internal = {}) {
  const context = internal.context || (await resolveCommandContext(options));

  if (context.runtimeOptions.runtime === "windows") {
    return cleanWindowsCommand(options, context);
  }

  try {
    context.runtimeOptions.wslCommand = await resolveWslCommand();
  } catch {
    // If WSL is unavailable we still clean host-side runtime artifacts.
  }

  return cleanWslCommand(options, context);
}
