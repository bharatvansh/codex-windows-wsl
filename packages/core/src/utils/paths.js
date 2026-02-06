import path from "node:path";

export function resolveWorkPaths(baseWorkdir, dmgHash, arch) {
  const workdir = path.resolve(baseWorkdir);

  return {
    workdir,
    extractedDir: path.join(workdir, "extracted", dmgHash),
    electronDir: path.join(workdir, "electron", dmgHash),
    appDir: path.join(workdir, "app", dmgHash),
    nativeRootDir: path.join(workdir, "native"),
    nativeBuildDir: path.join(workdir, "native", arch),
    userDataDir: path.join(workdir, "userdata", dmgHash),
    cacheDir: path.join(workdir, "cache", dmgHash),
    logsDir: path.join(workdir, "logs"),
    manifestsDir: path.join(workdir, "manifests")
  };
}
