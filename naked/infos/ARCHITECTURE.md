# Architecture

This document describes the current LTTH snapshot architecture.

## Overview

LTTH is an event-driven local web app:

- Express serves REST APIs and static frontend files.
- Socket.IO provides realtime dashboard and overlay updates.
- SQLite stores profile-scoped settings, event logs, gift metadata, plugin data, and stats.
- TikTok LIVE data is normalized through adapter classes.
- Plugins extend backend routes, Socket.IO, TikTok events, overlays, and automation.

## Runtime Layers

```text
External services
  Eulerstream / TikFinity
  OBS WebSocket
  MyInstants
  OSC / VRChat
  plugin-specific APIs

Adapters and integrations
  app/modules/tiktok.js
  app/modules/adapters/EulerstreamAdapter.js
  app/modules/adapters/TikFinityAdapter.js
  app/modules/obs-websocket.js

Core backend
  app/server.js
  app/modules/database.js
  app/modules/alerts.js
  app/modules/goals.js
  app/modules/leaderboard.js
  app/modules/ifttt/
  app/modules/plugin-loader.js

Frontend
  app/public/dashboard.html
  app/public/js/*.js
  app/public/*overlay*.html
  app/plugins/*/ui and overlay assets

Persistence
  platform-local config directory
  user profile SQLite databases
  plugin data directories
```

## Startup Flow

1. `app/server.js` loads environment variables and core modules.
2. `ConfigPathManager` resolves persistent config, user data, upload, and plugin data paths.
3. `UserProfileManager` selects or creates the active profile.
4. `DatabaseManager` opens the profile SQLite database and initializes schema.
5. Core services are created: network manager, TikTok connector, alerts, goals, IFTTT, OBS, subscription tiers, leaderboard, backup, preset, cloud sync.
6. `PluginLoader` scans `app/plugins`, loads enabled plugins, and registers plugin routes/events.
7. Static app and plugin files are served.
8. Server binds to the configured port and writes runtime helper files.

## TikTok Event Flow

```text
Eulerstream or TikFinity
  -> adapter normalizes event
  -> app/modules/tiktok.js re-emits event
  -> app/server.js core handler
  -> goals / alerts / leaderboard / IFTTT
  -> PluginLoader registered callbacks
  -> Socket.IO broadcasts to dashboard and overlays
  -> SQLite event log and stats updates
```

## Database

The current schema is initialized in `app/modules/database.js`. Important table groups:

- `settings`: global and plugin settings
- `profiles`: saved profile configs
- `flows`: automation definitions
- `event_logs`: event history
- `alert_configs`: alert templates/settings
- `gift_sounds`, `gift_catalog`, `gift_weather_mappings`
- `hud_elements`, `emoji_rain_config`
- `vdoninja_*`
- `milestone_*`
- `user_statistics`, `stream_stats`
- `profile_username_aliases`

SQLite is embedded and uses `better-sqlite3`. Event logs are batched for performance.

## Plugin System

`app/modules/plugin-loader.js` owns plugin lifecycle:

- scan plugin folders
- parse `plugin.json`
- load enabled plugin entry
- create `PluginAPI`
- call `init()`
- register routes, sockets, TikTok events, IFTTT components, and backup providers
- call `destroy()` on unload/disable/reload

Plugin HTTP routes are mounted through a plugin router so dynamically enabled plugins can register routes after startup.

## Frontend

The frontend is static and server-rendered only by file serving:

- Dashboard: `app/public/dashboard.html`
- Dashboard logic: `app/public/js/dashboard.js` and feature-specific JS files
- OBS overlays: `app/public/overlay.html`, `goals-overlay.html`, `animation-overlay.html`, plugin overlay files
- Styling: Bootstrap vendor CSS, Tailwind output, custom CSS files

There is no React/Vue/Svelte build pipeline in the current snapshot.

## Launcher

`build-src/` contains Go launcher sources and installer material. Root scripts can rebuild Windows launchers. The launcher is separate from the Node backend.

## Electron Status

Electron package metadata and CI were stale in the snapshot. The active Electron source folder is absent. Future Electron work should be handled as a dedicated restoration or rebuild task.

## Architecture Risks

- `app/server.js` is very large and mixes composition, middleware, routes, and event handlers.
- Dashboard HTML/JS is also large and should be changed carefully.
- Many plugins are substantial independent subsystems.
- Archive docs contain stale information and should not override code.
- Plugin event lifecycle and TikTok deduplication are sensitive areas with many regression tests.
