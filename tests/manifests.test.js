import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp } from "node:fs/promises";
import { writeManifest, readLatestManifest } from "../packages/core/src/utils/manifests.js";

test("readLatestManifest returns newest manifest by prefix", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "codex-win-manifest-"));

  await writeManifest(base, "prepare-2026-01-01.json", { value: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeManifest(base, "prepare-2026-01-02.json", { value: 2 });

  const latest = await readLatestManifest(base, "prepare-");

  assert.ok(latest);
  assert.equal(latest.data.value, 2);
});
