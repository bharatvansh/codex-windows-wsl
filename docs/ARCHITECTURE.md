# Architecture

## Package layout

- `packages/cli`: command entrypoint and argument parsing.
- `packages/core`: prepare/launch pipeline, manifests, runtime orchestration.
- `packages/patches`: versioned patch recipes with apply/verify hooks.
- `packages/diagnostics`: environment checks and support report generation.

## Runtime model

- `windows` runtime uses Windows Electron + Windows Codex CLI.
- `wsl` runtime uses Linux Electron inside WSL + Linux Codex CLI and Linux `~/.codex` state.
- Runtime routing lives in `packages/core/src/commands/{prepare,launch,clean}.js`.
- Runtime resolution and WSL utilities live in `packages/core/src/runtime/*`.
- Host-side manifests/logs are isolated by runtime workdir (`<workdir>` for windows, `<workdir>/wsl` for wsl).

## Prepare pipeline stages

1. `resolve_dmg_and_paths`
2. `extract_dmg`
3. `locate_or_extract_asar`
4. `unpack_asar`
5. `patch_preload`
6. `read_metadata`
7. `prepare_native_modules`
8. `verify_native_modules`

Each stage produces machine-readable outputs in a prepare manifest.

`resolve_dmg_and_paths` now supports three DMG sources:
- explicit `--dmg <path>`
- local `./Codex.dmg`
- auto-download of the latest official OpenAI DMG when local file is missing (unless disabled)

## Manifests

Manifests are written to `<workdir>/manifests`:

- `prepare-*.json`: metadata, stage results, resolved paths.
- `launch-*.json`: launch runtime details and exit code.
- Each manifest includes `runtime` and (for WSL) `runtimeContext`.

## Cache model

Artifacts are namespaced by DMG SHA-256 hash and platform architecture to avoid collisions:

- `work/extracted/<hash>`
- `work/electron/<hash>`
- `work/app/<hash>`
- `work/native/<electronVersion-arch>`
