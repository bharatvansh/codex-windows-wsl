import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../packages/cli/src/parseArgs.js";

test("parseArgs maps command and common flags", () => {
  const parsed = parseArgs([
    "prepare",
    "--dmg",
    "C:/tmp/Codex.dmg",
    "--workdir",
    "C:/tmp/work",
    "--reuse",
    "--codex-cli",
    "C:/bin/codex.exe",
    "--log-level",
    "debug"
  ]);

  assert.equal(parsed.command, "prepare");
  assert.equal(parsed.options.dmgPath, "C:/tmp/Codex.dmg");
  assert.equal(parsed.options.workdir, "C:/tmp/work");
  assert.equal(parsed.options.reuse, true);
  assert.equal(parsed.options.codexCliPath, "C:/bin/codex.exe");
  assert.equal(parsed.options.logLevel, "debug");
});

test("parseArgs supports equals form and boolean flags", () => {
  const parsed = parseArgs([
    "run",
    "--dmg=Codex.dmg",
    "--json",
    "--no-launch",
    "--no-prepare",
    "--download-latest",
    "--download-url",
    "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
  ]);

  assert.equal(parsed.command, "run");
  assert.equal(parsed.options.dmgPath, "Codex.dmg");
  assert.equal(parsed.options.json, true);
  assert.equal(parsed.options.noLaunch, true);
  assert.equal(parsed.options.noPrepare, true);
  assert.equal(parsed.options.downloadLatest, true);
  assert.equal(
    parsed.options.downloadUrl,
    "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
  );
});
