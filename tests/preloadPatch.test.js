import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { preloadProcessPatch } from "../packages/patches/src/preloadProcessPatch.js";

test("preload patch injects process bridge and verifies", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "codex-win-patch-"));
  const preloadDir = path.join(base, ".vite", "build");
  await mkdir(preloadDir, { recursive: true });

  const preloadPath = path.join(preloadDir, "preload.js");
  const source =
    'n.contextBridge.exposeInMainWorld("codexWindowType",A);n.contextBridge.exposeInMainWorld("electronBridge",B);';

  await writeFile(preloadPath, source, "utf8");

  const applied = await preloadProcessPatch.apply({ appDir: base });
  assert.equal(applied.changed, true);

  const verify = await preloadProcessPatch.verify({ appDir: base });
  assert.equal(verify.ok, true);

  const patched = await readFile(preloadPath, "utf8");
  assert.ok(patched.includes('exposeInMainWorld("process"'));
});
