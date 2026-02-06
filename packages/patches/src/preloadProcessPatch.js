import path from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const PROCESS_BRIDGE_SNIPPET =
  "const processBridge={env:process.env,platform:process.platform,versions:process.versions,arch:process.arch,cwd:()=>process.env.PWD||process.cwd(),argv:process.argv,pid:process.pid};n.contextBridge.exposeInMainWorld(\"process\",processBridge);";

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function findPatchAnchor(source) {
  const direct = /n\.contextBridge\.exposeInMainWorld\("electronBridge",[A-Za-z0-9_$]+\);/;
  const directMatch = source.match(direct);
  if (directMatch) {
    return {
      index: directMatch.index + directMatch[0].length,
      label: "electronBridge"
    };
  }

  const fallback = /contextBridge\.exposeInMainWorld\([^)]*electronBridge[^)]*\);/;
  const fallbackMatch = source.match(fallback);
  if (fallbackMatch) {
    return {
      index: fallbackMatch.index + fallbackMatch[0].length,
      label: "fallback-electronBridge"
    };
  }

  return null;
}

export const preloadProcessPatch = {
  id: "preload-process-bridge-v1",
  supports() {
    return true;
  },
  async apply({ appDir }) {
    const preloadPath = path.join(appDir, ".vite", "build", "preload.js");
    if (!(await exists(preloadPath))) {
      return {
        changed: false,
        reason: "preload file not found",
        preloadPath
      };
    }

    const raw = await readFile(preloadPath, "utf8");
    if (raw.includes('exposeInMainWorld("process"')) {
      return {
        changed: false,
        reason: "process bridge already present",
        preloadPath
      };
    }

    const anchor = findPatchAnchor(raw);
    if (!anchor) {
      throw new Error("Unable to find preload patch anchor");
    }

    const patched = raw.slice(0, anchor.index) + PROCESS_BRIDGE_SNIPPET + raw.slice(anchor.index);
    await writeFile(preloadPath, patched, "utf8");

    return {
      changed: true,
      reason: `inserted at ${anchor.label}`,
      preloadPath
    };
  },
  async verify({ appDir }) {
    const preloadPath = path.join(appDir, ".vite", "build", "preload.js");
    if (!(await exists(preloadPath))) {
      return {
        ok: false,
        reason: "preload file not found",
        preloadPath
      };
    }

    const raw = await readFile(preloadPath, "utf8");
    return {
      ok: raw.includes('exposeInMainWorld("process"'),
      reason: "process bridge marker check",
      preloadPath
    };
  }
};
