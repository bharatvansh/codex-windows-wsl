export function isWindows() {
  return process.platform === "win32";
}

export function getWindowsArch() {
  if (process.arch === "arm64") {
    return "win32-arm64";
  }

  return "win32-x64";
}
