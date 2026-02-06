import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDmgUrlFromHtml,
  DEFAULT_LATEST_DMG_URL
} from "../packages/core/src/utils/download.js";

test("extractDmgUrlFromHtml returns official DMG URL when present", () => {
  const html = `
    <a href="https://persistent.oaistatic.com/codex-app-prod/Codex.dmg">Download for macOS</a>
  `;
  const url = extractDmgUrlFromHtml(html);
  assert.equal(url, DEFAULT_LATEST_DMG_URL);
});

test("extractDmgUrlFromHtml returns null when DMG URL is absent", () => {
  const html = `<html><body>No dmg link here</body></html>`;
  const url = extractDmgUrlFromHtml(html);
  assert.equal(url, null);
});
