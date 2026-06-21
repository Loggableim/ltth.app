# Development Guide

This guide is for the current local snapshot.

## Prerequisites

- Node.js `>=18.0.0 <25.0.0`
- npm
- Go, only for launcher work
- OBS Studio, optional for overlay testing
- Eulerstream API key, required for Eulerstream TikTok LIVE connections

The current local machine has Node, npm, and Go available, but dependencies are not installed in this snapshot.

## Install

Install backend dependencies:

```bash
cd app
npm install
```

Copy environment template if needed:

```bash
copy .env.example .env
```

Configure `EULER_API_KEY` in `app/.env` or in the dashboard settings.

## Run

From `app/`:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

From the repository root:

```bash
npm start
npm run dev
```

Dashboard:

```text
http://localhost:3000/dashboard.html
```

Health/status:

```text
http://localhost:3000/api/health
http://localhost:3000/api/status
```

## Build CSS

```bash
cd app
npm run build:css
```

## Test

```bash
cd app
npm test
npm run test:coverage
```

Run targeted Jest tests by path when working on a subsystem:

```bash
npx jest test/plugin-state-persistence.test.js
npx jest test/tiktok-error-handling.test.js
```

## Lint

```bash
cd app
npm run lint
```

## Launcher Builds

From root:

```bash
npm run build:launcher:win
npm run build:launcher:console
npm run build:launcher:dev
```

Or from `build-src/`:

```bash
go build -o ../launcher.exe -ldflags "-H windowsgui -s -w" launcher-gui.go
go build -o ../launcher-console.exe -ldflags "-s -w" launcher.go
go build -o ../dev_launcher.exe -ldflags "-s -w" dev-launcher.go
```

## Electron

Do not use Electron commands for this snapshot. The Electron main-process source folder is absent. Restore or rebuild Electron separately if it becomes a product requirement.

## Coding Workflow

1. Read the relevant module/plugin.
2. Make the smallest coherent change.
3. Add or update focused tests when behavior changes.
4. Update active docs when commands, architecture, API contracts, plugin contracts, or user-visible behavior changes.
5. Run the narrowest relevant tests, then broader checks when dependencies exist.

## Common Work Areas

- TikTok event handling: `app/modules/tiktok.js`, `app/modules/adapters/`
- Plugin lifecycle: `app/modules/plugin-loader.js`, `app/routes/plugin-routes.js`
- Automation: `app/modules/ifttt/`
- Goals: `app/modules/goals.js`, `app/plugins/goals/`
- Soundboard: `app/plugins/soundboard/`, dashboard soundboard JS
- TTS: `app/plugins/tts/`
- Dashboard: `app/public/dashboard.html`, `app/public/js/`
- OBS overlays: `app/public/*overlay*.html`, plugin overlay files

## Style

- CommonJS modules.
- 2-space indentation.
- English code and comments.
- German is acceptable for user-facing UI/wiki copy.
- Use logger APIs in production paths.
- Prefer existing helpers and module boundaries over new abstractions.

## Persistence Rules

- User profile databases live in the config path managed by `ConfigPathManager`.
- Plugin files that must survive updates belong in `api.getPluginDataDir()`.
- Config values belong in SQLite settings through existing helpers.
- Do not add persistent writes under `app/plugins/<plugin>` unless the file is truly static source/config shipped with the plugin.
