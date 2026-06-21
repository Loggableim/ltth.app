# Agent Guide

This file is the first stop for future agents working on this LTTH snapshot.

## Snapshot Facts

- This workspace is not a Git checkout. Do not rely on `git status`, branches, tags, or commit history until the owner uploads it to GitHub.
- The maintained runtime is `app/`.
- Root `package.json` is only a convenience wrapper for `app/` commands and Go launcher builds.
- The historical Electron main-process folder is missing in this snapshot. Do not reintroduce Electron build assumptions unless the Electron files are restored or rebuilt intentionally.
- `docs_archive/` is historical reference only. Prefer `README.md`, `DOCUMENTATION_INDEX.md`, `infos/`, and `docs/SNAPSHOT_STATUS.md`.

## Before Editing

1. Read `docs/SNAPSHOT_STATUS.md`.
2. Read `infos/llm_start_here.md`.
3. Inspect the relevant module or plugin before changing it.
4. If dependencies are not installed, assume `app/node_modules` is absent and do not run Node tests until `cd app && npm install` has been done.

## Coding Rules

- Keep changes scoped to the requested feature or bug.
- Follow existing CommonJS style in `app/`.
- Use 2-space indentation in JavaScript.
- Use the logger in backend code and `this.api.log()` inside plugins.
- Use prepared statements through existing database helpers.
- Avoid writing persistent plugin data into plugin directories. Use `api.getPluginDataDir()` or database settings.
- Do not remove user data, logs, configs, or runtime databases unless explicitly asked.

## Verification

Preferred checks after dependencies exist:

```bash
cd app
npm test
npm run build:css
npm run lint
```

When changing a specific plugin, also run the closest matching tests in `app/test/` and inspect that plugin's own `test/` folder if present.

## Documentation Policy

- Active developer docs live in `infos/`.
- User docs live in `app/wiki/`.
- Technical notes live in `docs/`.
- Historical implementation reports live in `docs_archive/` and must not be treated as current instructions.
