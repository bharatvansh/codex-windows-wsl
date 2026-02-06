# codex-windows-bridge

A clean-room Windows compatibility launcher for Codex desktop app assets.

This project does **not** redistribute OpenAI binaries. You provide your own Codex DMG and a local Codex CLI install.

## Why this exists

`Codex-Windows` proved that the Codex app payload can run on Windows with careful extraction and native module replacement. This project keeps that behavior while using a modular, testable architecture built for long-term support.

## Features

- Staged prepare pipeline with manifest output.
- Reusable artifact cache keyed by DMG hash.
- Patch recipes with verification checks.
- Native module preparation and verification for Electron ABI compatibility.
- `doctor` command for environment diagnostics.
- `report` command for support bundles.

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
node packages/cli/bin/codex-win.js run --dmg C:\\path\\to\\Codex.dmg --reuse
```

## Commands

```bash
codex-win doctor
codex-win prepare --dmg <path> [--workdir <path>] [--reuse]
codex-win launch [--prepare-manifest <path>] [--codex-cli <path>]
codex-win run --dmg <path> [--workdir <path>] [--reuse]
codex-win clean [--cache-only]
codex-win report --out <path-to-report.json-or.zip>
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
