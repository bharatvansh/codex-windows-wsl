import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { loadConfig } from "../packages/core/src/config/loadConfig.js";

test("loadConfig merges defaults, file config, and CLI overrides", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "codex-win-config-"));
  const previous = process.cwd();

  try {
    process.chdir(base);

    const fileConfig = {
      workdir: "C:/tmp/work-a",
      nativeBuild: { strategy: "prebuilt-first" },
      logging: { level: "warn" }
    };
    await writeFile(
      path.join(base, "codex-win.config.json"),
      JSON.stringify(fileConfig, null, 2),
      "utf8"
    );

    const cfg = await loadConfig({ workdir: "C:/tmp/work-b", logLevel: "debug" });

    assert.equal(cfg.workdir, "C:/tmp/work-b");
    assert.equal(cfg.nativeBuild.strategy, "prebuilt-first");
    assert.equal(cfg.logging.level, "debug");
  } finally {
    process.chdir(previous);
  }
});
