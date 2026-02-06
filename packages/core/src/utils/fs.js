import { mkdir, access, readFile, writeFile, cp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const serialized = JSON.stringify(value, null, 2) + "\n";
  await writeFile(filePath, serialized, "utf8");
}

export async function copyDirectory(src, dest) {
  await ensureDir(path.dirname(dest));
  await cp(src, dest, { recursive: true, force: true });
}

export async function removePath(target) {
  await rm(target, { recursive: true, force: true });
}
