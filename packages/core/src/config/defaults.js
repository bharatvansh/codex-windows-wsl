import path from "node:path";

export const defaultConfig = {
  workdir: path.resolve(process.cwd(), "work"),
  codexCliPath: null,
  runtime: "windows",
  wsl: {
    distro: null,
    workdir: "~/.codex-win/work",
    codexCliPath: null,
    runtimeFallback: "none"
  },
  autoInstallTools: "prompt",
  nativeBuild: {
    strategy: "auto"
  },
  logging: {
    level: "info"
  },
  telemetry: {
    optIn: false
  }
};
