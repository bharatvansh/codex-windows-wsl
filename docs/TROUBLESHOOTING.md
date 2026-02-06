# Troubleshooting

## `7z not found`

Install 7-Zip and ensure `7z` is on PATH.

## Native rebuild failures

Install C++ toolchain prerequisites:

- Visual Studio Build Tools (C++ workload)
- MSVC redistributables

Then rerun `codex-win prepare --dmg <path>`.

## `codex.exe` not found

Install Codex CLI:

```bash
npm i -g @openai/codex
```

Or launch with explicit path:

```bash
codex-win launch --codex-cli C:\\path\\to\\codex.exe
```

## Launch exits immediately

Run with debug logs:

```bash
codex-win run --dmg <path> --log-level debug
```

Generate support report:

```bash
codex-win report --out codex-win-report.json
```
