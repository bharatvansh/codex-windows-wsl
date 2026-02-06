# codex-for-windows

A clean-room Windows compatibility launcher for Codex desktop app assets.

This project does **not** redistribute OpenAI binaries. You can provide your own Codex DMG, or let the tool download the latest official DMG from OpenAI at runtime.

## Why this exists

OpenAI's Codex desktop app is macOS-only. This project enables running it on Windows by extracting the app payload from a DMG, replacing native modules with Windows-compatible builds, and launching via the Codex CLI. It uses a modular, testable architecture built for long-term support.

## Features

- Staged prepare pipeline with manifest output.
- Reusable artifact cache keyed by DMG hash.
- Patch recipes with verification checks.
- Native module preparation and verification for Electron ABI compatibility.
- `doctor` command for environment diagnostics.
- `report` command for support bundles.
- Automatic latest DMG download from official OpenAI links when local DMG is missing.

## Requirements

- Windows 10/11
- Node.js 18+
- npm + npx
- Git
- 7-Zip (`7z` on PATH)
- Codex CLI: `npm i -g @openai/codex`

## Quick start

```bash
npm install
node packages/cli/bin/codex-win.js doctor
node packages/cli/bin/codex-win.js run --reuse
```

If `Codex.dmg` is not present in the working directory, `prepare`/`run` automatically downloads the latest official DMG.

## Commands

```bash
codex-win doctor
codex-win prepare [--dmg <path>] [--workdir <path>] [--reuse]
codex-win launch [--prepare-manifest <path>] [--codex-cli <path>]
codex-win run [--dmg <path>] [--workdir <path>] [--reuse]
codex-win clean [--cache-only]
codex-win report --out <path-to-report.json-or.zip>
```

Download controls:

```bash
codex-win prepare --download-latest
codex-win run --no-download-latest
codex-win prepare --download-url https://persistent.oaistatic.com/codex-app-prod/Codex.dmg
```

## Config

Create `codex-win.config.json` in the project directory. Example in `codex-win.config.example.json`.

## Development

```bash
npm test
```

## Legal

- Not affiliated with OpenAI.
- Do not distribute proprietary Codex app binaries.
- MIT license applies to this repository code only.
