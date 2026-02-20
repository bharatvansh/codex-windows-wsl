import { runCommand } from "../utils/exec.js";

export async function killCommand(options = {}) {
  const runtime = options.runtime || "windows";
  
  if (runtime === "wsl") {
    // Kill Electron, Codex CLI, and the launcher itself in WSL
    // We use -e to run in the default distro, or -d if specified
    const distroArgs = options.wslDistro ? ["-d", options.wslDistro] : [];
    
    try {
      await runCommand("wsl", [...distroArgs, "-e", "pkill", "-f", "electron"]);
      await runCommand("wsl", [...distroArgs, "-e", "pkill", "-f", "codex"]);
      // Also kill any node processes running codex-win
      await runCommand("wsl", [...distroArgs, "-e", "pkill", "-f", "codex-win"]);
    } catch (err) {
      // Ignore errors if processes aren't found
    }
    
    return { ok: true, runtime: "wsl", killed: true };
  }
  
  // Windows implementation
  try {
    // Taskkill is noisy if process not found, so we suppress output
    await runCommand("taskkill", ["/F", "/IM", "electron.exe"], { stdio: "ignore" });
    await runCommand("taskkill", ["/F", "/IM", "codex.exe"], { stdio: "ignore" });
  } catch (err) {
    // Ignore errors
  }
  
  return { ok: true, runtime: "windows", killed: true };
}
