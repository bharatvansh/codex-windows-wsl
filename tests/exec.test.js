import test from "node:test";
import assert from "node:assert/strict";
import { runCommand } from "../packages/core/src/utils/exec.js";

test("runCommand captures output when stdio is pipe", async () => {
  const result = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('hello');process.stderr.write('warn')"
  ]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "hello");
  assert.equal(result.stderr, "warn");
});

test("runCommand supports stdio ignore", async () => {
  const result = await runCommand(
    process.execPath,
    ["-e", "process.stdout.write('hello');process.stderr.write('warn')"],
    { stdio: "ignore" }
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});