import readline from "node:readline/promises";

export async function shouldFallbackToWindows(runtimeContext, error, logger) {
  if (runtimeContext.runtime !== "wsl") {
    return false;
  }

  if (runtimeContext.runtimeFallback === "none") {
    return false;
  }

  if (runtimeContext.runtimeFallback === "windows") {
    await logger?.warn?.("WSL runtime failed. Falling back to Windows runtime.", {
      reason: error.message
    });
    return true;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const question = `WSL runtime failed (${error.message}). Fallback to Windows runtime? [y/N] `;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    const accepted = answer === "y" || answer === "yes";

    if (accepted) {
      await logger?.warn?.("User selected runtime fallback to Windows.");
    }

    return accepted;
  } finally {
    rl.close();
  }
}
