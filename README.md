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

### Host (Windows)
- **Windows 10/11**
- **Node.js 18+**
- **npm + npx** (included with Node)
- **Git**
- **7-Zip** (Ensure `7z` is on your `PATH`)
- **Codex CLI:** `npm i -g @openai/codex`

### WSL Runtime (Required only for `--runtime wsl`)
- **WSL2** with a distro like Ubuntu.
- **WSLg** (for GUI support) or a running X Server.
- **Linux Dependencies:** Inside WSL, run:
  ```bash
  sudo apt-get update
  sudo apt-get install -y nodejs npm git p7zip-full curl python3 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 libasound2 libgbm1
  ```
- **Codex CLI in WSL:** `npm i -g @openai/codex`

## Quick start

1. **Clone and Install:**
   ```bash
   git clone <repo-url>
   cd codex-for-windows
   npm install
   ```

2. **Run Environment Check:**
   ```bash
   # For Native Windows
   node packages/cli/bin/codex-win.js doctor
   
   # For WSL
   node packages/cli/bin/codex-win.js doctor --runtime wsl --wsl-distro Ubuntu
   ```

3. **Run the App:**
   ```bash
   # Native Windows
   node packages/cli/bin/codex-win.js run
   
   # WSL (Recommends --reuse after first successful prepare)
   node packages/cli/bin/codex-win.js run --runtime wsl --wsl-distro Ubuntu --reuse
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
