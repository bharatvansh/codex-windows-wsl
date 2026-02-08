import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveRuntimeOptions,
  resolveRuntimeWorkdir
} from "../packages/core/src/runtime/resolveRuntime.js";
import { parseWslDistroList, toWslPath } from "../packages/core/src/runtime/wslExec.js";

test("resolveRuntimeOptions defaults to windows", () => {
  const resolved = resolveRuntimeOptions({}, {});
  assert.equal(resolved.runtime, "windows");
  assert.equal(resolved.runtimeFallback, "prompt");
  assert.equal(resolved.wsl.workdir, "~/.codex-win/work");
});

test("resolveRuntimeOptions merges config and cli for wsl runtime", () => {
  const resolved = resolveRuntimeOptions(
    {
      runtime: "wsl",
      wsl: {
        distro: "Ubuntu-22.04",
        workdir: "/home/user/.codex-win/work",
        codexCliPath: "/usr/local/bin/codex",
        runtimeFallback: "none"
      }
    },
    {
      wslDistro: "Ubuntu",
      runtimeFallback: "windows"
    }
  );

  assert.equal(resolved.runtime, "wsl");
  assert.equal(resolved.runtimeFallback, "windows");
  assert.equal(resolved.wsl.distro, "Ubuntu");
  assert.equal(resolved.wsl.workdir, "/home/user/.codex-win/work");
  assert.equal(resolved.wsl.codexCliPath, "/usr/local/bin/codex");
});

test("resolveRuntimeWorkdir isolates host workdir for wsl", () => {
  const workdir = resolveRuntimeWorkdir("C:/tmp/work", "wsl");
  assert.ok(workdir.endsWith("work/wsl"));
});

test("resolveRuntimeOptions rejects invalid runtime", () => {
  assert.throws(() => resolveRuntimeOptions({}, { runtime: "linux" }), /Invalid runtime/);
});

test("parseWslDistroList removes empty values", () => {
  const distros = parseWslDistroList("Ubuntu\r\n\nDebian\r\n");
  assert.deepEqual(distros, ["Ubuntu", "Debian"]);
});

test("toWslPath converts windows and unc paths", () => {
  assert.equal(toWslPath("C:\\Users\\me\\Codex.dmg"), "/mnt/c/Users/me/Codex.dmg");
  assert.equal(
    toWslPath("//wsl.localhost/Ubuntu/home/me/.codex"),
    "/home/me/.codex"
  );
});
