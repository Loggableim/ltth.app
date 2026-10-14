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
- The Bash installer auto-installs Git and current Node LTS on macOS/Linux, and the Node fallback installer auto-installs Git where possible.

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

## Cursor Cloud specific instructions

- Install from `app/` with `npm ci`. Set `PUPPETEER_SKIP_DOWNLOAD=true` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so optional Puppeteer and Playwright browser downloads are skipped. Node 22 on the default image can load `better-sqlite3` from its prebuild.
- Asset tests call `python` and `PIL`. The environment image includes `python-is-python3` and `python3-pil`.
- Start the backend with `LTTH_DISABLE_AUTO_UPDATE=true`. Plain `npm start` runs the Git updater and can `git reset --hard` the working tree when `origin` is ahead. `LTTH_SKIP_DEFERRED_CONFIG_REPAIR=true` skips the delayed profile-database repair scan.
- The app listens on `127.0.0.1:3000`. Dashboard: `http://127.0.0.1:3000/dashboard.html`. Health: `GET /api/health`. Overlay: `http://127.0.0.1:3000/overlay.html`.
- Profile databases are created under `~/.local/share/ltth.app/user_configs/`, outside the repository.
- An Eulerstream API key is required only to connect to a live TikTok stream. The dashboard, goals, settings, and local APIs work without one.
- CI-equivalent checks from `app/` are `npm run build:css`, `npm run lint`, and `npm test -- --runInBand --forceExit`.
