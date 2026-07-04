# LTTH App + ltth.app (Mega Repo)

This repository contains both the LTTH runtime application and the official ltth.app website assets/docs in a single workspace snapshot.

- Runtime app: `app/`
- Website + marketing pages: repository root (root html/css/js/assets)
- Launcher build sources: `build-src/`
- Plugin ecosystem: `app/plugins/`

## Current project shape

- This is not a legacy Git checkout: no `.git` folder is included in this snapshot.
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

- Version shown in package manifests: `1.3.9`
- Current changelog: [CHANGELOG.md](CHANGELOG.md)
- Active app changelog: [app/CHANGELOG.md](app/CHANGELOG.md)
- License: [LICENSE](LICENSE)

## Deployment

The website can be served from static hosting (for example GitHub Pages), while the runtime is started via Node from `app/`.
