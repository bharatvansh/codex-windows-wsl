# codex-for-windows

A clean-room compatibility launcher for Codex desktop app assets on native Windows and WSL.

This project does **not** redistribute OpenAI binaries. You can provide your own Codex DMG, or let the tool download the latest official DMG from OpenAI at runtime.

## Why this exists

OpenAI's Codex desktop app is macOS-only. This project enables running it on Windows by extracting the app payload from a DMG, replacing native modules with compatible builds, and launching via the Codex CLI. It supports two runtime targets:

- Native Windows runtime.
- WSL runtime (Linux Electron + Linux Codex CLI + Linux `~/.codex` state).

## Features

- Staged prepare pipeline with manifest output.
- Reusable artifact cache keyed by DMG hash.
- Patch recipes with verification checks.
- Native module preparation and verification for Electron ABI compatibility.
- `doctor` command for environment diagnostics.
- `report` command for support bundles.
- Automatic latest DMG download from official OpenAI links when local DMG is missing.
- Runtime selection: `windows` or `wsl`.
- WSL runtime fallback modes: `prompt`, `windows`, `none`.

## Requirements

- Windows 10/11 (host)
- Node.js 18+
- npm + npx
- Git
- 7-Zip (`7z` on PATH)
- Codex CLI: `npm i -g @openai/codex`
- For `--runtime wsl`: a working WSL distro with Linux dependencies (`node`, `npm`, `npx`, `git`, `7z`, `curl`, `python3`) and WSLg/X display.

## Quick start

```bash
npm install
node packages/cli/bin/codex-win.js doctor
node packages/cli/bin/codex-win.js run --reuse
node packages/cli/bin/codex-win.js run --runtime wsl --wsl-distro Ubuntu
```

If `Codex.dmg` is not present in the working directory, `prepare`/`run` automatically downloads the latest official DMG.

## Commands

```bash
codex-win doctor [--runtime <windows|wsl>] [--wsl-distro <name>]
codex-win prepare [--runtime <windows|wsl>] [--dmg <path>] [--workdir <path>] [--reuse]
codex-win launch [--runtime <windows|wsl>] [--prepare-manifest <path>] [--codex-cli <path>]
codex-win run [--runtime <windows|wsl>] [--dmg <path>] [--workdir <path>] [--reuse]
codex-win clean [--cache-only]
codex-win report --out <path-to-report.json-or.zip>
```

Runtime options:

```bash
codex-win run --runtime windows
codex-win run --runtime wsl --wsl-distro Ubuntu
codex-win run --runtime wsl --runtime-fallback windows
codex-win run --runtime wsl --wsl-workdir /home/<user>/.codex-win/work
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
