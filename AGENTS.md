# Agent Guide

This file is the first stop for future agents working on this LTTH snapshot.

## Snapshot Facts

- Canonical project identity: `ltth.app`, GitHub `Loggableim/ltth.app`, website `https://ltth.app`. Read `REPOSITORY_IDENTITY.md` before using repository names or GitHub links.
- This workspace is a full Git checkout of `Loggableim/ltth.app`. Use `git log`, `git status`, `git diff`, etc. normally.
- The maintained runtime is `app/`.
- Root `package.json` is only a convenience wrapper for `app/` commands and Go launcher builds.
- The historical Electron main-process folder is missing in this snapshot. Do not reintroduce Electron build assumptions unless the Electron files are restored or rebuilt intentionally.
- `docs_archive/` is historical reference only. Prefer `README.md`, `DOCUMENTATION_INDEX.md`, `infos/`, and `docs/SNAPSHOT_STATUS.md`.
- The published one-line installer uses `main/install/install.*`; `LTTH_REPO_BRANCH` exists only for explicit overrides.
- On Windows, the PowerShell installer self-elevates on first run and auto-installs missing Git/Node prerequisites before cloning the repo.

## Before Editing

1. Read `docs/SNAPSHOT_STATUS.md`.
2. Read `infos/llm_start_here.md`.
3. Read `REPOSITORY_IDENTITY.md` if your task touches repository names, clone URLs, GitHub links, releases, or docs that mention old repos.
4. Inspect the relevant module or plugin before changing it.
5. If dependencies are not installed, assume `app/node_modules` is absent and do not run Node tests until `cd app && npm install` has been done.

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
