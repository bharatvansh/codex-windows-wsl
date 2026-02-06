import path from "node:path";

export const defaultConfig = {
  workdir: path.resolve(process.cwd(), "work"),
  codexCliPath: null,
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
