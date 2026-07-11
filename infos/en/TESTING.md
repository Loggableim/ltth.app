# Testing Guide

This guide reflects the current snapshot.

## Dependency State

No tests can run until backend dependencies are installed:

```bash
cd app
npm install
```

## Standard Checks

```bash
cd app
npm test
npm run test:coverage
npm run build:css
npm run lint
```

## Targeted Jest Runs

Use targeted tests while working on one subsystem:

```bash
npx jest test/plugin-state-persistence.test.js
npx jest test/plugin-tiktok-event-cleanup.test.js
npx jest test/gift-deduplication.test.js
npx jest test/tiktok-error-handling.test.js
npx jest test/goals-state-machine.test.js
npx jest test/tts-api-key-validation.test.js
```

## What To Test By Area

TikTok adapters:

- connect/disconnect status events
- gift deduplication
- streakable gift handling
- reconnect behavior
- event log writes
- stats broadcasts

Plugins:

- load on startup when enabled
- enable/disable/reload through API
- route registration
- Socket.IO registration
- TikTok event registration and cleanup
- config persistence
- persistent file storage through `api.getPluginDataDir()`

Automation:

- matching trigger type
- condition evaluation
- action execution
- cooldowns
- timer triggers
- frontend debug events

Frontend/overlay:

- dashboard loads without console errors
- Socket.IO reconnects after refresh
- OBS overlay URLs render transparent pages
- audio unlock behavior still works for sound/TTS paths

## Manual Runtime Smoke Test

After installing dependencies:

1. Start `cd app && npm start`.
2. Open `http://localhost:3000/dashboard.html`.
3. Check `http://localhost:3000/api/health`.
4. Open `http://localhost:3000/overlay.html`.
5. List plugins through `http://localhost:3000/api/plugins`.
6. Trigger available dashboard test actions for alerts/goals where relevant.

## External Dependencies

Some behavior requires external applications or credentials:

- Eulerstream API key for real TikTok LIVE connection
- TikFinity desktop app for TikFinity source mode
- OBS Studio for OBS WebSocket actions and Browser Source testing
- plugin-specific credentials for OpenAI, OpenShock, Speechify, etc.

Mock or isolate these in automated tests whenever possible.
