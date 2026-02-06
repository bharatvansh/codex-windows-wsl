# Architecture

## Package layout

- `packages/cli`: command entrypoint and argument parsing.
- `packages/core`: prepare/launch pipeline, manifests, runtime orchestration.
- `packages/patches`: versioned patch recipes with apply/verify hooks.
- `packages/diagnostics`: environment checks and support report generation.

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

## Manifests

Manifests are written to `<workdir>/manifests`:

- `prepare-*.json`: metadata, stage results, resolved paths.
- `launch-*.json`: launch runtime details and exit code.

## Cache model

Artifacts are namespaced by DMG SHA-256 hash and platform architecture to avoid collisions:

- `work/extracted/<hash>`
- `work/electron/<hash>`
- `work/app/<hash>`
- `work/native/<electronVersion-arch>`
