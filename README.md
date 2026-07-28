# LTTH App + ltth.app (Mega Repo)

This repository contains both the LTTH runtime application and the official ltth.app website assets/docs in a single workspace snapshot.

- Canonical GitHub repo: `Loggableim/ltth.app`
- Canonical repo URL: https://github.com/Loggableim/ltth.app
- Official website: https://ltth.app
- Runtime app: `app/`
- Website + marketing pages: repository root (root html/css/js/assets)
- Launcher build sources: `build-src/`
- Plugin ecosystem: `app/plugins/`

## Current project shape

- This is a full Git checkout; use `git log`, `git status`, and `git diff` normally.
- If older repo names appear in archived docs or generated reports, ignore them for current work. The active repo identity is documented in [REPOSITORY_IDENTITY.md](REPOSITORY_IDENTITY.md).
- The root `package.json` is a convenience wrapper that delegates common commands into `app/`.
- The old Electron main-process folder is intentionally not present in this snapshot.
- The maintained runtime source is `app/`.

## What lives here

- `app/`
  Node.js backend, Socket.IO runtime, plugin loader, SQLite database, dashboard/overlays, tests.
- `app/wiki/`
  German user documentation for the runtime tool.
- Root website files (`index.html`, `features.html`, `plugins.html`, `docs.html`, etc.)
  Marketing and public pages for ltth.app.
- `build-src/` and packaged binaries
  Windows launcher source/build artifacts.
- `docs/`, `infos/`, `docs_archive/`
  Active developer documentation and historical references.

## Quick start

### App runtime (recommended)

```bash
cd app
npm install
npm start
```

Dashboard: `http://localhost:3000/dashboard.html`

### Website preview

```bash
python3 -m http.server 8080
# or any static server (node/http-server, php, etc.)
```

Open: `http://localhost:8080`

## Wrapper scripts from repo root

```bash
npm start             # runs app start
npm run dev
npm test
npm run build:css
npm run lint
```

## Useful links

- Website: https://ltth.app
- Issues: https://github.com/Loggableim/ltth.app/issues
- App/runtime docs: [app/wiki/Getting-Started.md](app/wiki/Getting-Started.md)
- Developer orientation:
  - [REPOSITORY_IDENTITY.md](REPOSITORY_IDENTITY.md)
  - [AGENTS.md](AGENTS.md)
  - [infos/llm_start_here.md](infos/llm_start_here.md)
  - [docs/SNAPSHOT_STATUS.md](docs/SNAPSHOT_STATUS.md)
  - [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)

## Important notes

- For coding and plugin development, follow `AGENTS.md` and existing app conventions.
- Use `app/node_modules/` for dependencies; root dependencies are intentionally absent.
- Keep plugin data in `api.getPluginDataDir()` or database settings, not inside plugin folders.
- Use `this.api.log()` in plugins and shared logger utilities in backend modules.

## Status

- Current LTTH release: `1.4.1`
- Current Stream Monsters release: `1.9.0` (Open Beta, stable plugin ID `streamalchemy`)
- Stream Monsters 1.9.0 adds passive Special charge, explained and localized Rules-v7 skills, combat evolution with animated stat growth, simultaneous sealed A/B/C reveals, and deterministic recovery while retaining the 1.8 retention and competitive arcade loop.
- Current WebGPU Fireworks plugin release: `3.1.1`
- Fireworks 3.1.1 keeps star, ring, standard, and special rockets inside one shared visible envelope so each burst opens at the exact rendered rocket endpoint without top-edge clipping.
- Current changelog: [CHANGELOG.md](CHANGELOG.md)
- Active app changelog: [app/CHANGELOG.md](app/CHANGELOG.md)
- License: [LICENSE](LICENSE)

The published one-line installers use the `main/install/install.*` endpoints and the installer defaults to `main` unless `LTTH_REPO_BRANCH` is set explicitly.
On Windows, the PowerShell installer self-elevates on first run and auto-installs missing Git/Node prerequisites before cloning the repo.
The Bash installer auto-installs Git and current Node LTS on macOS/Linux, and the Node fallback auto-installs Git where possible.

## Deployment

The website can be served from static hosting (for example GitHub Pages), while the runtime is started via Node from `app/`.
