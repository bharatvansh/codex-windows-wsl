import path from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ensureDir } from "./fs.js";

export const OFFICIAL_CODEX_PAGES = [
  "https://developers.openai.com/codex/app/",
  "https://developers.openai.com/codex/quickstart/",
  "https://openai.com/codex/"
];

export const DEFAULT_LATEST_DMG_URL =
  "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";

export function extractDmgUrlFromHtml(html) {
  if (!html || typeof html !== "string") {
    return null;
  }

  const matches = html.match(
    /https:\/\/persistent\.oaistatic\.com\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]*Codex\.dmg/gi
  );

  if (!matches || matches.length === 0) {
    return null;
  }

  return matches[0];
}

async function fetchText(url) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is unavailable in this Node runtime.");
  }

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

export async function resolveLatestDmgUrl(logger) {
  for (const pageUrl of OFFICIAL_CODEX_PAGES) {
    try {
      const html = await fetchText(pageUrl);
      const discovered = extractDmgUrlFromHtml(html);
      if (discovered) {
        await logger?.info?.("Discovered latest Codex DMG URL from official page", {
          pageUrl,
          dmgUrl: discovered
        });
        return discovered;
      }
    } catch (error) {
      await logger?.debug?.("Failed DMG URL discovery from page", {
        pageUrl,
        error: error.message
      });
    }
  }

  await logger?.warn?.("Falling back to default Codex DMG URL", {
    dmgUrl: DEFAULT_LATEST_DMG_URL
  });
  return DEFAULT_LATEST_DMG_URL;
}

export async function downloadFile(url, destinationPath, logger) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch() is unavailable in this Node runtime.");
  }

  await ensureDir(path.dirname(destinationPath));

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const out = createWriteStream(destinationPath);
  const input = Readable.fromWeb(response.body);
  await pipeline(input, out);

  await logger?.info?.("Downloaded DMG file", {
    destinationPath,
    bytes: Number(response.headers.get("content-length")) || null
  });

  return destinationPath;
}

export async function downloadLatestDmg(options = {}) {
  const { targetPath, downloadUrl, logger } = options;

  if (!targetPath) {
    throw new Error("targetPath is required for downloadLatestDmg()");
  }

  const resolvedTarget = path.resolve(targetPath);
  const resolvedUrl = downloadUrl || (await resolveLatestDmgUrl(logger));
  const downloadedPath = await downloadFile(resolvedUrl, resolvedTarget, logger);

  return {
    downloadedPath,
    downloadUrl: resolvedUrl
  };
}
