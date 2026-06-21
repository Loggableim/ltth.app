# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Snapshot documentation and setup metadata were refreshed for backend-first development.
- Active docs now point future agents to `AGENTS.md`, `docs/SNAPSHOT_STATUS.md`, and `infos/`.
- Removed active Electron setup guidance because the Electron main-process source is not present in this snapshot.

### Added

#### 🎵 **Music Bot Overlay: Theme-Engine & Visualizer**
- OBS-Overlay unterstützt nun URL-Themes `default`, `cyberpunk`, `minimal`, `neon` (inkl. Legacy-Mapping alter Theme-Namen).
- Neues Canvas-basiertes Echtzeit-Visualizer-Rendering mit Web Audio API (`AnalyserNode`, `requestAnimationFrame`) und Theme-gebundener Farbpalette.
- Konfigurierbares Songlängen-Limit (Default 360s) inkl. Dashboard-Feld und hartem Queue-Check vor dem Hinzufügen von Requests.
#### 🎵 **Music Bot – Monetization/UI/Overlay Ausbau** (Feature 21, 22, 29, 31, 33, 34, 36, 38, 39)
- **Pay-to-Play** mit Geschenkekatalog + Coin-Schwelle: `!sr`-Requests benötigen (konfigurierbar) passendes Gift oder ausreichende Coins; Credits werden über Gift-Events vergeben.
- **Pay-to-Skip** mit Geschenkekatalog: definierte Gifts überspringen den aktuell laufenden Song sofort.
- **Like-Gated Requests** mit Mindestlikes pro User: `!sr` wird abgelehnt, bis die konfigurierbare Like-Schwelle erreicht ist.
- Dashboard-Konfiguration um **Monetization-Settings** (Pay-to-Play/Skip, Giftlisten, Mindestlikes) inkl. Persistenz erweitert.
- Dashboard um **Master-/Source-Volume-Slider** erweitert, live angewendet und in Plugin-Config persistent gespeichert.
- Dashboard-Queue unterstützt **Drag & Drop Reorder** plus UI-Aktionen für Pause/Resume und Löschen.
- Dashboard-**Status-Toasts** für Request-Erfolg/-Ablehnung, API-Fehler und Netzwerk-/Socket-Probleme ergänzt.
- Overlay zeigt **Requester-Avatar** beim aktuellen Song (Avatar-URL wird beim Queue-Add gespeichert).
- Overlay ergänzt um **dynamisch animierte Album-Artworks** (rotierend, pausiert bei Playback-Pause).
- Overlay ergänzt um **Up-Next Widget** (nächste 2-3 Queue-Songs, live via Socket-Queue-Updates).

#### 🎵 **Music Bot – Core Feature Erweiterung (Audio/Queue/Chat)**
- **Audio-Ducking:** Automatisches Ducking der Musik bei `tts:playback:started` sowie systemweiten `alert:show` Events mit konfigurierbaren Fade-In/Fade-Out Zeiten.
- **Lautstärke-Normalisierung:** MPV-Audiofilter `loudnorm` für konsistentere Track-Lautheit (konfigurierbar über `playback.normalization`).
- **Fallback-Playlist:** Automatischer Fallback auf vordefinierte lokale/URL-basierte Tracks bei leerer Request-Queue.
- **Pre-Caching:** Asynchrones Vorladen der nächsten Tracks (Lookahead) in den persistenten `pluginDataDir/cache` Bereich.
- **Request-Limits robuster:** User-Limit und Cooldown werden jetzt case-insensitive ausgewertet, um Umgehung via Groß-/Kleinschreibung zu verhindern.
- **Tests ergänzt:** Neue Jest-Tests für Ducking-/Normalisierungslogik und case-insensitive Request-Limits.

#### 🔌 **Adapter Architecture for TikTok Data Sources** (`app/modules/adapters/`)
- `BaseAdapter.js`: Abstract base class for all data source adapters. Extends `EventEmitter`. Provides shared state (`isConnected`, `currentUsername`, `streamStartTime`, `stats`), broadcast helpers (`broadcastStats`, `broadcastStatus`), event routing (`handleEvent`), and duration interval management.
- `EulerstreamAdapter.js`: Eulerstream WebSocket logic extracted from `tiktok.js` with zero behaviour change. All original event handling, deduplication, gift catalog, room info fetching, diagnostics, and heartbeat logic are fully preserved.
- `TikFinityAdapter.js`: New adapter for TikFinity Desktop App local WebSocket API (`ws://localhost:21213`). Supports gift, chat, follow, like, share, subscribe, join, viewer-count, room-stats events. Configurable port via `tikfinity_ws_port` DB setting. Includes auto-reconnect with exponential back-off, ping keep-alive, and stats persistence.

#### 🏆 **Top Tier Plugin** (`toptier`): Live-Leaderboard für TikTok LIVE Likes & Geschenke
- Zwei unabhängige Boards: Likes-Board und Gifts-Board
- 5 Decay-Modi: none, linear, percentage, idle, step
- 7 OBS-Overlay-Varianten: Classic List, Animated Race, Spotlight, Podium, Ticker, Holographic, Scoreboard
- Echtzeit Rang-Wechsel- und New-Leader-Animationen
- All-Time Hall of Fame über alle Sessions
- Geschenk-Multiplikator-Regeln pro Geschenk-Name/ID
- Chat-Command `!rank` für Zuschauer-Rang-Abfrage
- Session-Management mit Auto-Reset bei Reconnect
- Vollständige Admin-UI mit Live-Preview und OBS-URL-Generator

### Fixed

#### 🚀 Launcher/Port-Stabilität (Go + Node.js)
- `build-src/dev-launcher.go` und `build-src/launcher-gui.go`: `checkServerHealth()` nutzt jetzt dynamisch `alternativePort`, wenn ein Fallback-Port gewählt wurde (statt hartcodiert 3000), wodurch Health-Check-Timeouts auf Alternativports verhindert werden.
- `build-src/dev-launcher.go` und `build-src/launcher-gui.go`: `autoFixPort()` wartet bei blockiertem Port 3000 nur noch kurz (max. 3s statt 15s) und überlässt erweitertes Recovery dem Node.js-Port-Management.
- `app/modules/tiktok.js` und `app/server.js`: EventEmitter-Listener-Limits für TikTokConnector und Socket.IO Namespace auf 50 erhöht, um `MaxListenersExceededWarning` in legitimen Multi-Listener-Szenarien zu vermeiden.
- `app/modules/port-manager.js` + `app/server.js`: EADDRINUSE-Retry kann jetzt fehlgeschlagene Ports explizit ausschließen (`excludePorts`), sodass ein gerade fehlgeschlagener Fallback-Port nicht sofort erneut ausgewählt wird.
- `app/server.js` + `app/modules/port-manager.js` + `build-src/dev-launcher.go` + `build-src/launcher-gui.go`: Port-Strategie auf „Force Port 3000“ umgestellt. Kein Ausweichen auf 3001+ mehr; stattdessen aggressives Rebind (`exclusive: false`), EADDRINUSE-Warteschleife sowie Kill/Wait-Only Port-Resolution auf 3000.
- `app/server.js` + `app/modules/port-manager.js`: Port-Start jetzt robust und flexibel: Bind startet mit `exclusive: true` auf 3000 und wechselt bei `EADDRINUSE` schrittweise bis 3050; erfolgreiche Runtime-Portnummer wird in `.ltth_port` gespeichert.
- `app/server.js`: Beim erfolgreichen Start wird `obs-overlay-wrapper.html` im Projekt-Root neu erzeugt (lokale OBS-Dateiquelle mit dynamischem Port inkl. Query/Hash-Passthrough).
- `build-src/dev-launcher.go` + `build-src/launcher-gui.go`: Launcher lesen den aktiven Node-Port über `getCurrentNodePort()` aus `.ltth_port` (Fallback 3000) und nutzen ihn für Health-Checks und Dashboard-Weiterleitung.

#### 🔌 OSC-Bridge + CoinBattle Stabilitätsfixes
- `app/plugins/osc-bridge/main.js` und `app/plugins/osc-bridge/modules/OSCQueryClient.js`: OSCQuery-Fehlerlogs (Auto-Discovery/Subscribe/WebSocket) loggen jetzt nur noch `error.message` plus optionalen `error.stack`, statt komplette (potenziell zirkuläre) Error-Objekte.
- `app/plugins/coinbattle/backend/database.js`: `coinbattle_archived_matches` wird jetzt bereits in `initializeTables()` via `CREATE TABLE IF NOT EXISTS` angelegt (inkl. Index), damit Cleanup/Archivierung nicht mehr an fehlender Tabelle scheitert.

#### 🔥 **Flame Overlay WebGL rendering + bloom framebuffer state**
- `app/plugins/flame-overlay/renderer/post-processor.js`: `renderToFramebuffer()` now validates target framebuffer, applies matching viewport size for scene vs bloom buffers, clears color/depth before rendering, and restores default framebuffer viewport afterward.
- `app/plugins/flame-overlay/renderer/effects-engine.js`: `render()` now explicitly restores canvas framebuffer/viewport before final composite and direct rendering fallback; smoke rendering logic is encapsulated in `renderSmoke(time)` and invoked safely from `renderScene()`.
- Added regression test coverage in `app/test/flame-overlay-renderer-webgl-state.test.js` to guard viewport/framebuffer and render-scene delegation behavior.

#### 🔌 **EulerstreamAdapter – Token-Drain & ~60s-Disconnect-Loop**
- EulerstreamAdapter: 4404 (Not Live) retry now uses a dedicated retry budget and no longer drains the general auto-reconnect counter.
- EulerstreamAdapter: 4429 (Too Many Connections) retry now uses a dedicated retry budget and no longer drains the general auto-reconnect counter.
- EulerstreamAdapter: Heartbeat timeout no longer causes ~60s reconnect loop – ws.removeAllListeners() is called before terminate() to prevent the close handler from triggering an uncontrolled reconnect chain

#### 🏆 **Leaderboard + Eulerstream stability hardening**
- `app/modules/leaderboard.js`: `updateStats()` now rejects missing/invalid usernames before DB writes, preventing `NOT NULL` crashes for anonymous/aggregated events.
- `app/server.js`: all `leaderboard.track*()` calls now guard `data.username` and skip tracking with debug logging when missing.
- `app/modules/adapters/EulerstreamAdapter.js`: raised general reconnect budget (`maxAutoReconnects` 5→50), added dedicated 4404/4429 retry counters/limits, added delayed self-heal reconnect reset after max-reached states, and made heartbeat tolerant to 2 consecutive missed pongs with message-based liveness reset.

#### 🎰 **Plinko – Board-aware gift trigger flow** (PR #222)
- Fixed root cause: gifts configured on non-default Plinko boards were never recognized because `handlePlinkoGiftTrigger()` always loaded the first/default board config via `getConfig()` without a board ID, ignoring the board already identified by `findBoardByGiftTrigger()`.
- `handleGiftTrigger()` now passes `matchingPlinkoBoard.id` into `handlePlinkoGiftTrigger()` so the correct board's config is used directly.
- `handlePlinkoGiftTrigger()` accepts a new optional `boardId` parameter; when provided, `getConfig(boardId)` targets that specific board instead of the default.
- Trigger-Tab-only fallback (`useDefaults=true`) and disabled-board handling are fully preserved.
- Improved log output: logs now show which board was targeted, which mapping key matched, whether defaults were applied, and the reason when spawning is skipped.
- Added 4 regression tests: non-default board path, fall-through-to-all-boards warning, `handleGiftTrigger` boardId propagation, Trigger-Tab null-boardId contract.

### Changed

- **`app/modules/tiktok.js`**: Refactored to Facade/Router class. Public API 100% unchanged. Delegates to the active adapter based on the `tiktok_data_source` DB setting (`'eulerstream'` default, `'tikfinity'` optional). The setting is re-evaluated on every `connect()` call so no server restart is needed after changing it.

## [1.3.3] - 2026-03-26

### Added

#### 🎵 **Music Bot Plugin** (PR #184, #185, #186, #188, #190, #195, #198)
- YouTube-Suche und Streaming via yt-dlp (gebündelt via youtube-dl-exec, kein Python nötig) (#190)
- Auto-Installation von yt-dlp beim ersten Start (#186)
- YouTube Player UI mit Suchvorschau (#185)
- Multi-Design OBS Overlay (3 Designs), Smart Query Normalization, Superfan-only Song Requests (#188)
- Queue Persistence, neue Chat-Commands (`!skip`, `!queue`, `!nowplaying`, `!remove`) (#195)
- Spotify/SoundCloud oEmbed-Integration, Vote-Skip-Bar und Idle State im Overlay (#198)
- REST API Endpoints für Queue-Management (#195)
- Plugin-Grundgerüst, Crossfade, Device-Helper, Queue-Intelligence, Skip-Immunity, Auto-DJ, Moderation/Ban-Management, Resolver-Safeguards, Dashboard-Sidebar-Integration (#184)

#### 🌦️ **Weather Engine – Massiver Ausbau** (PR #191, #193, #194, #197, #199, #203, #207)
- Neue Effekte: Aurora, Fireflies, Meteors, Sakura, Embers, Heatwave (#199)
- Rain: Puddle Ripples, Motion Blur, Ground Mist (#194)
- Snow: Accumulation System (#197)
- Wind: Perlin Noise basiert, Wind Streaks (#194)
- Storm: Screen Shake, Dark Overlay (#194)
- Thunder: Upgrades mit prozeduralen Blitz-Effekten (#199)
- Fog: Ground-Mode + Color Presets (#197)
- Sunbeam: Lens Flare + Color Temperature (#197)
- Weather Control UI: Alle 12 Engine-Effekte exponiert, Fog/Sunbeam Property Guard, Missing Effect Config Warning (#203)
- 9 Performance & Architektur-Fixes: O(n²) Lookup eliminiert, GC-Pressure reduziert, Quality Presets, Adaptive FPS (#193)

#### ⚡ **OpenShock – PiShock Provider** (PR #192)
- PiShock als auswählbarer API-Provider (Provider Pattern), aria-label, JSDoc (#192)

#### 🎆 **Fireworks – Erweiterungen** (PR #201)
- Random Timer, Rainbow Color Mode (#201)
- Config Reset API (#201)
- Path Traversal Security Fix (#201)
- Deduplizierte Overlay-Route (#201)

#### 🎮 **Game Engine – Slot Machine**
- **Token System für alle Spiele** – Alle fest codierten Overlay-Texte für Wheel, Plinko,
  Connect4 und Schach sind jetzt als konfigurierbare Tokens über die Admin-GUI anpassbar.
  Neuer Abschnitt „📝 Anzeigetexte" in jedem Spiel-Tab. Tokens werden backward-compatible
  mit Defaults gespeichert.
  - Wheel: `titleText`, `labelSpin`, `labelResult`, `labelNiete`, `labelWin`, `labelQueued`
  - Plinko: `titleText`, `labelDrop`, `labelWin`, `labelMultiplierPrefix`, `labelQueued`
  - Connect4: `titleText`, `labelPlayer1`, `labelPlayer2`, `labelYourTurn`, `labelWaiting`, `labelWin`, `labelDraw`
  - Chess: `titleText`, `labelWhite`, `labelBlack`, `labelYourTurn`, `labelCheck`, `labelCheckmate`, `labelDraw`, `labelWin`
  Overlays lesen die Tokens via `applyDisplayTexts()` aus dem Config-Socket-Event.
  Lokalisierungs-JSONs (`locales/de.json`, `locales/en.json`) um `display_texts`-Sektion erweitert.
- **Slot Machine: Superfan recognition** – TikTok superfan status (`isSuperFan` /
  `isSuperfan` / `topGifter`) is now extracted from GCCE context and passed as `isSuperfan`
  in `userRoles`. Superfans receive the VIP cooldown. New `requireSuperfan` setting restricts
  chat-command access to superfans/mods only. GUI option added to the "Cooldowns & Zugriff" card.
- **Slot Machine: Sound management** – New per-machine custom sound upload API
  (`POST /api/game-engine/slot/audio/upload`, `POST reset`, `GET settings`). Seven
  configurable sounds: `spin`, `small_win`, `medium_win`, `big_win`, `jackpot`,
  `near_miss`, `reel_stop`. Sound management UI added in Slot Machine tab and Media/Sounds tab.
  Database table `game_slot_audio` stores per-machine custom audio settings.
- **Slot Machine: Spin-to-sound synchronisation** – New `syncSpinToSound` setting.
  When enabled, uploading a custom `spin` sound automatically updates the machine's
  `spinDuration` to match the audio file's duration. UI checkbox and sync indicator added.
- **Slot Machine: Design settings** – New `designSettings` object in machine config
  (`bgColor`, `borderColor`, `reelBgColor`, `textColor`, `winColor`, `titleText`).
  Settings applied as CSS custom properties in the overlay. "Design-Einstellungen" card
  added to the UI with color pickers and a title text field.
- **Slot Machine: Customisable result labels** – All six result-category texts
  (`labelLoss`, `labelNearMiss`, `labelSmallWin`, `labelMediumWin`, `labelBigWin`,
  `labelJackpot`) are now stored in `designSettings` and editable in the UI.
- **Slot Machine: Design theme presets** – Six colour presets (Classic, Ocean, Fire,
  Neon, Monochrome, Retro) selectable via a dropdown in the Design card.
- **Slot Machine: Symbol image upload** – Each symbol can now have a user-uploaded image.
  Images uploaded via `POST /api/game-engine/slot/symbol-image/upload` (PNG/JPEG/GIF/WebP/SVG,
  max 2 MB) and served from `/game-engine/slot-images/:machineId/:filename`.
- **Slot Machine: Media tab integration** – Slot Machine added to the media-game selector
  in the Media/Sounds tab for centralized sound management.
- **Slot Machine core**: 3-reel slot engine with configurable symbol sets (12 default emoji
  symbols), six outcome categories, configurable odds profiles, chat command triggers, gift
  trigger mapping, reward dispatcher, animated overlay, multi-machine support, REST API,
  persistent SQLite storage (`game_slot_config`, `game_slot_sessions`, `game_slot_stats`).

#### 🛡️ **Intelligent Port Management** (PR #211)
- EADDRINUSE Crash Prevention mit automatischer Port-Erkennung (#211)

### Changed
- **yt-dlp Bundling** – Python/pip-Dependency vollständig entfernt, via youtube-dl-exec gebündelt (#190)
- **`YOUTUBE_DL_SKIP_PYTHON_CHECK=1`** in allen npm install Execution Paths (JS, Go, Batch) (#208)
- **npm audit** – eslint ^9, uuid Override, deprecated transitive deps behoben (#209, #210)
- **i18n** – Skip für disabled Plugins beim Laden von Lokalisierungs-Dateien (#209)
- **Repository Cleanup** – Alle `*_SUMMARY.md` in `docs_archive/` verschoben
- **Version Sync** – Alle Versionsnummern auf 1.3.3 synchronisiert
- **Game Engine – Slot Machine: Cooldowns card** renamed to "Cooldowns & Zugriff" to
  reflect the new superfan access-control option.
- **Game Engine – Slot Machine: Animations card** – Sound settings remain in this card
  alongside the new `syncSpinToSound` checkbox; a dedicated "Sound-Einstellungen" card
  now provides per-sound upload controls directly in the Slot tab.

### Fixed
- **TikTok Connector – Null-Packet Filter** – Null-Packet Filter vor Dedup verschoben,
  Protocol-Packets blockierten echte Gifts im Dedup-Cache (#181)
- **TikTok Connector – Streakable Gift Recognition** – Dedup auf repeatEnd beschränkt,
  `repeatEnd` in Dedup-Key aufgenommen (#182)
- **TikTok Connector – Eulerstream** – `giftDetails` Schema-Mismatch behoben, Catalog
  Lookup vor Protocol-Packet Filter (#183)
- **Viewer Profiles** – 8 Bugs in Validatoren, Session Tracking, WebSocket Handlers, UI (#187)
- **Viewer XP** – Watch-Time XP Akkumulation stoppt bei Offline-Stream (#206)
- **Goals HUD** – Overlay ignoriert gespeicherte Styles nach Browser-Refresh nicht mehr;
  vollständige Style-Pipeline (Gradient, BG, Bar Height, Border, Shadow, Font, Label) (#189)
- **Gift Milestone** – File Deletion, Celebration Queue, Race Condition, Exclusive
  Timeout Cleanup (#196)
- **Soundboard & Game Engine** – `repeatCount` auf Gift Streaks wird jetzt beachtet (Cap @50) (#200)
- **Slot Overlay** – Dynamische Reel Symbol Height statt Hardcoded + RAF Race Condition Fix (#202)
- **Unified Game Engine Overlay** – 5 kritische Bugs: currentGame Reset, Request-State
  Handler, Missing Slot iFrame, Queue Indicator Race Condition, Lazy iFrame Loading (#205)
- **Weather Control** – Sunbeam Crash: fehlende `height`/`y` auf Beam-Objekten vergiftete
  Canvas Context (#191)
- **Weather Effects Sync** – 6 fehlende Effekte zwischen Backend (main.js) und OBS Overlay
  (overlay.html) synchronisiert (#207)
- **Talking Heads** – Windows Paths, spriteMode in Test-Animation, Cache Re-Fetch,
  Timeout Memory Leak behoben (#204)
- **Game Engine – Wheel Queue / Spin-Hanger** – Resolved a bug where the unified queue
  would permanently hang when many gifts arrived in rapid succession.
  - Introduced `_cleanupSpinState(spinId, reason)` as a single, centralised cleanup method
    that atomically resets `isSpinning`, `currentSpin`, `activeSpins`, and cancels the
    spin safety timeout.
  - `startSpin()` now calls `_cleanupSpinState()` on all validation-failure paths.
  - `handleSpinComplete()` now calls `_cleanupSpinState()` and
    `unifiedQueue.completeProcessing()` on every early-return error path.
  - `forceCompleteSpin()` consolidated to use `_cleanupSpinState()`.
  - `cleanupOldSpins()` now calls `unifiedQueue.completeProcessing()` to correctly
    unblock the queue after removing a stuck spin.

## [1.3.2] - 2026-02-07

### Changed
- **Version Update** - Maintenance release with version consistency updates
  - Synchronized all version numbers across package files to 1.3.2
  - Updated version strings in all relevant configuration files

## [1.3.0] - 2026-02-03

### Added
- **AnimazingPal Brain Engine** - Advanced AI-powered memory and personality system for VTuber avatars
  - Persistent long-term memory with semantic vector search
  - User profile tracking with relationship history
  - 5 pre-defined streamer personalities + custom personality creator
  - GPT-powered contextual responses (GPT-4o-mini, GPT-5 Nano)
  - Memory decay and archival system (7-day archive, 90-day decay, 30-day pruning)
  - Auto-response configuration for chat, gifts, follows, shares
  - Rate limiting and response probability controls
  - 15+ API endpoints for brain management
- **AnimazingPal Batch Processing (Outbox System)** - Natural speech flow for combined events
  - 8-second batch window for collecting events (configurable)
  - Max 8 items per batch, max 320 characters
  - Automatic pause during speech/mic activity
  - TTL-based event deduplication (600s)
- **AnimazingPal Relevance Detection** - Intelligent chat message filtering
  - Question detection with keyword matching
  - Greeting and thanks recognition with cooldowns
  - Spam filtering (commands, URLs, emoji-only, repeated chars)
  - Score-based relevance (0-1) with configurable threshold (0.6)
- **AnimazingPal Response Engine** - GPT-powered reply generation
  - Contextual responses using user history and memories
  - Quick acknowledgments for greetings/thanks/gifts
  - 5-minute response caching to reduce API calls
  - Max 18-word responses for natural TTS pacing
- **AnimazingPal Enhanced API** - 15 new endpoints for brain/batch/relevance management
  - Activity status, batch flushing, relevance testing
  - Memory decay triggers, extended statistics
  - Brain status, config, personality management
  - Memory search, user profiles, chat responses

### Changed
- **AnimazingPal Documentation** - Expanded README to 443 lines with full Brain Engine documentation
- **AnimazingPal Architecture** - Modular event-driven system with separate engines for batching, relevance, and responses

### Fixed
- **Gift Duplicate Detection** (moved from Unreleased, originally reported 2026-01-06)
  - Root cause: TikTok sends gift events twice (popup/animation + chat log entry) with identical `createTime` timestamps
  - Previous implementation generated new timestamps with `new Date().toISOString()`, causing deduplication to fail
  - **Solution:** Use TikTok's original `createTime` timestamp instead of generating new ones
  - Changes made in `app/modules/tiktok.js`:
    - Line 799: Changed `timestamp: new Date().toISOString()` to `timestamp: data.createTime || data.timestamp || new Date().toISOString()`
    - Line 759: Added debug logging for raw gift data with createTime values
    - Lines 1717-1722: Updated hash generation to prefer `createTime` over `timestamp`
  - Added test case in `app/test/gift-deduplication.test.js` for TikTok duplicate events
  - Fully backward compatible with fallback to `new Date()` when TikTok timestamp is missing
  - Affects all plugins that use gift events: lastevent-spotlight, clarityhud, goals, gift-milestone, coinbattle

## [1.2.3] - 2026-01-06

### Changed
- **Version Update** - Maintenance release with version consistency updates
  - Updated version numbers across all package files
  - Synchronized version strings in preset manager (1.0.3 → 1.2.3)
  - Updated test configuration version strings

### Fixed
- **Goals Plugin: Coins Double-Counting** - Fixed bug where coins were counted multiple times in live goal overlays
  - Root cause: TikTok event listeners were not properly removed when plugins were unloaded/reloaded
  - Added proper cleanup in `PluginAPI.unregisterAll()` to remove TikTok event listeners
  - This prevents duplicate event handlers from accumulating on plugin reload
  - Added test suite to verify event listener cleanup (`test/plugin-tiktok-event-cleanup.test.js`)
  - Affects all plugins that register TikTok event handlers (goals, coinbattle, viewer-leaderboard, etc.)

## [1.2.2] - 2025-12-15

### Added
- **Electron Performance Diagnostics Guide** (`infos/ELECTRON_PERFORMANCE_GUIDE.md`) - Comprehensive diagnostic guide
  - GPU & Rendering diagnosis (chrome://gpu, flag verification, DevTools in packaged app)
  - Build config validation (NODE_ENV, source maps, logging levels)
  - Thread blocking analysis (sync API identification, flamegraph analysis)
  - IO/DB diagnostics (SQLite pragmas, path differences, query timing)
  - CSS/DOM performance (expensive properties, virtualization strategies)
  - 13-step prioritized diagnostic checklist with expected results
- **Performance Diagnostics Tool** (`tools/performance-diagnostics.js`) - Console script for real-time analysis
  - DOM node count and nesting depth monitoring
  - Memory heap usage tracking
  - CSS property scan (box-shadow, filter, backdrop-filter)
  - Long Task observer (>50ms)
  - Input latency measurement and scroll FPS tracking
- **Diagnostics Panel in Settings** - Comprehensive logging tool in dashboard settings
  - GPU support detection, error logs from developer panel
  - Launches before all other plugins for complete logging
  - Can be deactivated, but active by default
- **Launch Mode Selection on Splash Screen** - Users can choose between Electron app or Browser mode at startup
  - Launch buttons enabled after backend is ready
  - Browser mode opens dashboard in default browser and minimizes to tray
  - Tray menu updated with German labels and both launch options

### Changed
- **SQLite Performance Optimizations** (`app/modules/database.js`)
  - journal_mode = WAL, synchronous = NORMAL
  - cache_size = 64MB, temp_store = MEMORY, mmap_size = 256MB
- **Desktop Performance Flags** (historical Electron build)
  - Disabled `CalculateNativeWinOcclusion` for reduced overhead
  - Enabled QUIC protocol for faster networking
  - Force sRGB color profile for consistent rendering
  - Disabled runtime component updates
- **IPC Batch Operations** for reduced overhead
  - Added `settings:getMultiple` - Fetch multiple settings in one IPC call
  - Added `settings:setMultiple` - Set multiple settings in one IPC call
- **Virtual Scroller Optimization** (`app/public/js/virtual-scroller.js`)
  - requestAnimationFrame throttling for scroll events
  - GPU layer promotion with `will-change: transform`
  - CSS `contain: layout style paint` for isolated rendering
  - Passive event listeners for better scroll performance
- **CSS Performance Improvements** (`app/public/css/navigation.css`)
  - `will-change: scroll-position` on scrollable containers
  - `contain: layout style paint` for better paint isolation
  - `overscroll-behavior: contain` for natural scrolling

### Fixed
- **Quick Actions Menu Not Updating** - Menu remained grayed out after enabling plugins until page refresh
  - Added `setupQuickActionPluginListener()` to refresh buttons on `plugins:changed` socket events
  - Extracted `fetchActivePlugins()` and `getTranslation()` utilities to reduce duplication
  - Added `refreshQuickActionButtons()` export for external access
  - Updated locale files (en, de, es, fr) with `quick_action.plugin_disabled` translations
- **Goals Modal Focus Issue in Electron** - Modal inputs unclickable due to CSS stacking and focus issues in iframe context
  - Changed modal sizing from `right: 0; bottom: 0` to `width: 100%; height: 100%`
  - Increased z-index from 1000 to 2000 (matching other modals)
  - Added `-webkit-user-select: text` to form inputs for Electron compatibility
  - Added `tabindex="-1"` to modal-content and auto-focus first input on open
- **TTS Admin Panel Unclickable in Electron** - Tabs, buttons, and inputs not responding to clicks in Electron iframe
  - Added `-webkit-user-select: text` and `user-select: text` for input/textarea elements
  - Added `cursor: pointer` and `user-select: none` for buttons, tabs, filter buttons
  - Updated Voice Assignment Modal with `w-full h-full` positioning and z-index: 2000
- **Plugin Disabled Detection Improved** - Better error messages for disabled plugins
  - OpenShock, Leaderboard, Stream-Alchemie, Thermaldrucker and other plugins now properly detect disabled state
- **Chatango Integration in Electron** - Fixed white window issue in installed version
  - Chatango embed now activates correctly in packaged Electron app
- **Language Selector Flags** - Fixed flag icons not showing in installed version
  - Instead of showing "de DE" or "en EN", now correctly shows flag icons with language code
- **TikTok TTS Engine Failing with 500 Errors** - Complete rewrite of TikTok TTS endpoint handling
  - **Problem:** All third-party proxy endpoints were returning HTTP 500 errors
  - **Root Cause:** Original implementation relied on outdated proxy services (weilnet, countik, gesserit)
  - **Solution:** Implemented hybrid endpoint approach with multiple fallback options:
    - Public proxy services: Weilbyte's Workers endpoint, TikAPI public endpoint
    - Official TikTok API endpoints with proper authentication headers
    - Automatic endpoint rotation when failures occur
  - **Technical Changes:**
    - Fixed Content-Type mismatch for official TikTok API (now uses URL-encoded format)
    - Updated User-Agent to modern Android 13 (was outdated Android 7.1.2)
    - Added support for multiple response formats (Weilnet, TikAPI, Official TikTok)
    - Implemented text chunking for messages over 300 characters
    - Improved error messages showing all attempted endpoints
  - **Known Limitation:** Long text (>300 chars) returns only first chunk - keep messages short
  - Files modified: `plugins/tts/engines/tiktok-engine.js`
  - Documentation: `docs/TIKTOK_TTS_FIX.md`
- **CRITICAL: TikTok Connection 504 Timeout** - Fixed Euler Stream timeout issues
  - **Root Cause:** `fetchRoomInfoOnConnect: true` was causing excessive Euler Stream API calls
  - **Solution:** Changed `fetchRoomInfoOnConnect` to `false` to reduce API calls
  - Connection now verifies stream is live through the WebSocket connection itself
  - Improved error messages for Euler Stream timeouts with clearer solutions
- **CRITICAL: TikTok Connection Invalid Option** - Fixed connection failure caused by invalid configuration option
  - Removed non-existent `enableWebsocketUpgrade` option from TikTokLiveConnection configuration

## [1.2.1] - 2025-12-09

### Fixed
- **Version Number Correction** - Corrected erroneous version 2.2.1 to 1.2.1
  - Previous version incorrectly labeled as 2.2.1 (typo)
  - Proper semantic versioning sequence: 1.1.0 → 1.2.0 → 1.2.1
- **Advanced Timer Plugin** - Overlay routes and storage improvements
  - Added missing overlay routes for seamless OBS integration
  - Migrated timer storage from global scope to user profile storage
  - Improved timer state persistence and auto-recovery on restart
  - Fixed timer overlay URL generation and routing
  - Enhanced WebSocket communication for real-time timer updates
  - Resolved timer data loss issues on server restart
  - Better error handling for timer operations

## [1.0.3] - 2025-11-10

### Added
- **Validators Module** (`modules/validators.js`) - Umfassende Input-Validierung
  - String, Number, Boolean, Array, Object, URL, Email, Enum Validators
  - Pattern-Matching, Length-Limits, Range-Checks
  - ValidationError Custom Error Class
- **Template Engine** (`modules/template-engine.js`) - Zentrale Template-Verarbeitung
  - RegExp-Cache (Map mit max 1000 Einträgen)
  - Variable-Replacement mit HTML-Escaping
  - TikTok-Event-spezifische Renderer
  - 10x Performance-Verbesserung durch Caching
- **Error Handler Module** (`modules/error-handler.js`) - Standardisierte Error-Behandlung
  - formatError(), handleError(), asyncHandler()
  - safeJsonParse(), withTimeout(), retryWithBackoff()
  - Custom Error Classes (NotFoundError, UnauthorizedError, etc.)

### Changed
- **CORS-Policy verschärft** - Whitelist-basiert statt wildcard "*"
  - Nur localhost/127.0.0.1 und OBS Browser Sources erlaubt
  - Credentials nur für vertrauenswürdige Origins
- **CSP mit Nonces** - Content Security Policy implementiert
  - Strikte CSP für Admin-Routes (ohne unsafe-inline/unsafe-eval)
  - Permissive CSP für OBS-Routes (Kompatibilität)
  - Random Nonce pro Request generiert
- **Webhook-Validierung verbessert** - DNS-basierte Sicherheit
  - DNS-Auflösung und IP-Prüfung
  - Blockiert Private IPs (RFC1918, IPv6 Link-Local, Multicast)
  - Strikte Subdomain-Validierung
  - Verhindert SSRF und DNS-Rebinding
- **API-Endpoint-Validierung** - Alle kritischen Endpoints validiert
  - `/api/connect` - Username-Validierung
  - `/api/settings` - Object-Validierung (max 200 Keys, max 50k Zeichen)
  - `/api/profiles/*` - Username-Validierung
- **Database-Batching** - Event-Logs werden gebatcht
  - Batch-Size: 100 Events
  - Batch-Timeout: 5 Sekunden
  - 50x schnellere Inserts (100 → 5000 Events/s)
- **Template-Rendering refactored** - Nutzt zentrale Template-Engine
  - Code-Duplikation eliminiert (~200 Zeilen reduziert)
  - RegExp-Cache automatisch genutzt
  - 90% Performance-Verbesserung

### Fixed
- **Memory Leaks** - Socket Event Cleanup implementiert
  - Event-Listener werden korrekt entfernt bei Plugin-Unload
  - Plugin-Reload ohne Server-Neustart möglich
- **Logging standardisiert** - console.* durch logger ersetzt
  - Logging in Dateien statt nur Console
  - Log-Rotation automatisch
  - Log-Levels konfigurierbar

### Security
- Sicherheit verbessert: 5/10 → 9/10 (+80%)
- CORS-Whitelist statt Wildcard
- CSP mit Nonces gegen XSS
- DNS-basierte Webhook-Validierung gegen SSRF
- Umfassende Input-Validierung
- IP-Blacklist für private Netzwerke

### Performance
- Performance verbessert: ~500 → ~800 Events/s (+60%)
- RegExp-Cache für Template-Rendering
- Database-Batching für Event-Logs
- Memory Leaks behoben (3 → 0)
- Code-Duplikation eliminiert

## [1.0.2] - 2025-11-09

### Added
- **OSC-Bridge Plugin** (`plugins/osc-bridge/`) - VRChat-Integration via OSC
  - Dauerhafte OSC-Brücke (kein Auto-Shutdown)
  - Bidirektionale Kommunikation (Senden & Empfangen)
  - VRChat-Standard-Parameter (/avatar/parameters/*, /world/*)
  - Standardports: 9000 (Send), 9001 (Receive), konfigurier bar
  - Sicherheit: Nur lokale IPs erlaubt (127.0.0.1, ::1)
  - Vollständiges Logging (oscBridge.log) mit Verbose-Modus
  - Latenz < 50 ms
  - **VRChat Helper-Methoden**: wave(), celebrate(), dance(), hearts(), confetti(), triggerEmote()
  - **API-Endpoints**:
    - `GET /api/osc/status`: Status und Statistiken
    - `POST /api/osc/start`: Bridge starten
    - `POST /api/osc/stop`: Bridge stoppen
    - `POST /api/osc/send`: Beliebige OSC-Nachricht senden
    - `POST /api/osc/test`: Test-Signal senden
    - `GET /api/osc/config`: Konfiguration abrufen
    - `POST /api/osc/config`: Konfiguration aktualisieren
    - `POST /api/osc/vrchat/wave|celebrate|dance|hearts|confetti`: VRChat-Actions
  - **Socket.io Events**:
    - `osc:status`: Status-Updates (isRunning, stats, config)
    - `osc:sent`: OSC-Nachricht gesendet
    - `osc:received`: OSC-Nachricht empfangen
  - **Flow-System-Integration**:
    - `osc_send`: Beliebige OSC-Nachricht senden
    - `osc_vrchat_wave`: Wave-Geste triggern
    - `osc_vrchat_celebrate`: Celebrate-Animation triggern
    - `osc_vrchat_dance`: Dance triggern
    - `osc_vrchat_hearts`: Hearts-Effekt triggern
    - `osc_vrchat_confetti`: Confetti-Effekt triggern
    - `osc_vrchat_emote`: Emote-Slot triggern (0-7)
    - `osc_vrchat_parameter`: Custom Avatar-Parameter triggern
  - **Admin-UI** (`ui.html`):
    - Live-Status-Anzeige (Running/Stopped mit Puls-Animation)
    - Statistiken (Nachrichten gesendet/empfangen, Fehler, Uptime)
    - Konfiguration (Host, Ports, Verbose-Modus)
    - VRChat Parameter Tester (8 Buttons für schnelle Tests)
    - Live-Log-Viewer (optional, nur wenn Verbose-Modus aktiv)
  - **Auto-Retry**: Bei Port-Kollision automatisch nächsten Port versuchen
  - **Plugin-Injection**: OSC-Bridge wird automatisch in Flow-Engine injiziert
  - **NPM Dependency**: `osc@^2.4.5` hinzugefügt

### Changed
- **Flow-System erweitert**: 8 neue OSC-Actions für VRChat-Integration
- **Plugin-Loader**: OSC-Bridge wird automatisch in Flows injiziert (wie VDO.Ninja)
- **Version**: 1.0.1 → 1.0.2
- **Dependencies**: `osc@^2.4.5` hinzugefügt für OSC-Kommunikation

### Added
- **Plugin System**: Vollständiges Plugin-System für modulare Erweiterungen
  - Plugin-Loader mit Lifecycle-Management (init, destroy)
  - PluginAPI mit sicheren Hooks für Routes, Socket.io und TikTok-Events
  - Plugin-Manager UI im Dashboard (Upload, Enable, Disable, Delete, Reload)
  - Beispiel-Plugin "Topboard" (Top Gifters, Streaks)
  - Plugin-State-Persistierung pro Profil in `<profil>_plugins_state.json` (user_configs)
  - Hot-Loading ohne Server-Neustart

- **Multi-Cam Switcher Plugin** (`plugins/multicam/`) - 2025-11-09
  - OBS-Szenen wechseln via TikTok Gifts oder Chat-Commands
  - OBS-WebSocket v5 Integration mit Auto-Reconnect (Exponential Backoff)
  - Chat-Commands: `!cam 1-5`, `!cam next/prev`, `!scene <name>`, `!angle next`
  - Gift-Mapping: Rose→Cam1, Lion→Cam5, konfigurierbare Coins-Schwellen
  - Macro-System: Multi-Step-Aktionen mit Waits (z.B. Studio→Cam3 mit Delay)
  - Permissions: modsOnly, broadcasterOnly, allowedUsers, minAccountAgeDays
  - Cooldowns: Per-User (15s), Global (5s), Macro-Max-Duration (10s)
  - Safety-Limits: maxRapidSwitchesPer30s (20) mit Auto-Lock
  - Admin-UI: Connection Status, Manual Scene Switcher, Hot Buttons, Activity Log
  - API-Routes: GET/POST `/api/multicam/config`, `/api/multicam/connect`, `/api/multicam/action`, `/api/multicam/state`
  - Socket.io Events: `multicam_state`, `multicam_switch`
  - Szenen-Auto-Discovery von OBS
  - Fallback-Hotkeys (optional, opt-in)

- **Launcher & Update-System Überarbeitung** - 2025-11-09
  - **Platform-Agnostischer Launcher** (`launch.js`, `modules/launcher.js`):
    - Cross-platform Unterstützung (Windows, Linux, macOS)
    - TTY-sicheres Logging (keine "stdout is not a tty" Fehler mehr)
    - Robuste Node.js/npm Version-Checks in JavaScript
    - Automatische Dependency-Prüfung und Installation
    - Browser-Auto-Start nach Launch
    - Kein Shell-spezifischer Code mehr
  - **TTY-Logger Modul** (`modules/tty-logger.js`):
    - Automatische TTY-Erkennung
    - ANSI-Farben nur bei TTY-Unterstützung
    - UTF-8/Emoji-Unterstützung-Detection
    - Fallback auf Plain-Text für non-TTY (OBS, Redirects)
    - Platform-spezifische Symbole
    - Logging-Methoden: info(), success(), error(), warn(), debug(), step()
  - **Update-Manager Überarbeitung** (`modules/update-manager.js`):
    - Git-basiertes Update (wenn .git vorhanden)
    - GitHub Release ZIP Download (ohne Git)
    - Automatisches Backup vor Update (user_data/, user_configs/)
    - Rollback bei fehlgeschlagenen Updates
    - Platform-unabhängige Update-Strategie
    - Syntax-Fehler aus altem update-checker.js behoben
  - **Minimale Launcher-Scripts**:
    - `start.sh`: Nur Node-Check, ruft `node launch.js` auf
    - `start.bat`: Nur Node-Check, ruft `node launch.js` auf
    - Keine Shell-spezifische Logik mehr (echo -e, cut, etc.)
  - **Behobene Probleme**:
    - ✅ Keine "stdout is not a tty" Fehler mehr
    - ✅ Keine "echo -e" Probleme unter Windows/Powershell
    - ✅ Keine "integer expression expected" Fehler bei Version-Checks
    - ✅ Updates funktionieren auch ohne Git-Repository
    - ✅ Farben werden korrekt in TTY und non-TTY Umgebungen gehandhabt
    - ✅ Node/npm Version-Checks robust und plattformunabhängig

- **Update-System**: Automatische Update-Prüfung via GitHub API
  - GitHub Releases API Integration
  - Semantic Versioning Vergleich
  - Auto-Check alle 24 Stunden
  - Update-Download via `git pull` + `npm install`
  - Dashboard-Banner bei verfügbarem Update
  - Manuelle Update-Anleitung als Fallback

- **Audio-Aktivierungs-Banner**: Prominente Warnung auf Dashboard-Homepage
  - Erklärt Browser Autoplay Policy
  - Schritt-für-Schritt-Anleitung
  - Direkter Link zu Overlay
  - Dismissable mit LocalStorage-Persistenz

### Changed
- **TTS zu Plugin migriert**: TTS-Engine jetzt als Plugin (`plugins/tts/`)
  - 75+ Stimmen (TikTok + Google TTS)
  - User-spezifische Voice-Mappings
  - Queue-Management (max 100 Items)
  - Auto-TTS für Chat mit Team-Level-Filter
  - API-Routes: `/api/voices`, `/api/tts/test`

- **VDO.Ninja zu Plugin migriert**: VDO.Ninja Manager jetzt als Plugin (`plugins/vdoninja/`)
  - 20 API-Routes für Room/Guest/Layout-Management
  - 8 Socket.io-Events für Real-time-Kontrolle
  - Multi-Guest-Streaming-Unterstützung
  - Automatische Injektion in Flows für Automation

- **Server.js Refactoring**: ~350 Zeilen entfernt
  - TTS Instanziierung und Routes entfernt
  - VDO.Ninja Instanziierung und Routes entfernt
  - TTS-Aufrufe aus TikTok-Events entfernt
  - VDO.Ninja Socket.io-Events entfernt
  - Flows erhält TTS=null (wird via Plugin injiziert)

- **Dynamic UI Visibility**: Dashboard-Tabs basierend auf aktiven Plugins
  - TTS-Tab nur sichtbar wenn TTS-Plugin aktiv
  - Multi-Guest-Tab nur sichtbar wenn VDO.Ninja-Plugin aktiv
  - Automatisches Ausblenden bei Plugin-Deaktivierung
  - Automatisches Einblenden bei Plugin-Aktivierung
  - Kein Page-Reload erforderlich

### Fixed
- **Update-Checker**: Graceful 404-Handling (keine GitHub Releases = Info statt Error)
- **Plugin-UI-Synchronisation**: UI bleibt nicht mehr sichtbar wenn Plugin deaktiviert wird

### Technical
- **Dependencies**: `zip-lib` für Plugin-ZIP-Extraktion
- **Module**:
  - `modules/plugin-loader.js` (545 Zeilen)
  - `modules/update-checker.js` (261 Zeilen)
- **Routes**:
  - `routes/plugin-routes.js` (484 Zeilen)
  - Plugin-Routes: GET/POST/DELETE `/api/plugins/*`
  - Update-Routes: GET/POST `/api/update/*`
- **Frontend**:
  - `public/js/plugin-manager.js` (372 Zeilen)
  - `public/js/update-checker.js` (270 Zeilen)
- **Architecture**: Event-driven Plugin-System mit Hot-Reloading

### Breaking Changes
- TTS und VDO.Ninja erfordern jetzt Plugin-Aktivierung (standardmäßig aktiviert)
- TTS- und VDO.Ninja-Routes wurden verschoben (von `/api/*` zu Plugin-Routes)
- Keine funktionalen Änderungen für Endnutzer (abwärtskompatibel)

---

## [0.9.0] - VDO.Ninja Multi-Guest Integration

### Added
- **VDO.Ninja Integration**: Multi-Guest-Streaming-Unterstützung
  - Room-Management für Live-Streams
  - Guest-Verwaltung (Add, Remove, Layout)
  - 20+ API-Endpoints für VDO.Ninja-Steuerung
  - Real-time Socket.io-Events
  - Integration mit Flow-Automation

### Technical
- VDO.Ninja Manager Modul (`modules/vdoninja.js`)
- VDO.Ninja Routes (`routes/vdoninja-routes.js`)

---

## [0.8.0] - Emoji Rain & HUD Verbesserungen

### Added
- **Emoji Rain Effekt**: Animierte Emoji-Regen bei Gifts
  - Konfigurierbare Gift-zu-Emoji-Mappings
  - Animationsgeschwindigkeit & Dichte
  - Emoji-Pool-System
  - HUD-Integration

### Changed
- **HUD Positionierung**: Drag & Drop Interface
  - Speicherbare Positionen (Top/Bottom, Left/Right)
  - Live-Vorschau im Dashboard
  - Persistenz in Datenbank

### Fixed
- HUD-Overlays jetzt per Drag & Drop verschiebbar
- Emoji Rain Performance-Optimierungen

---

## [0.6.0] - Goals & User Profiles

### Added
- **Goal-System**: Multi-Goal-Tracking
  - Follower, Likes, Shares Goals
  - Gift-basierte Goals (Coins, Diamonds)
  - Persistente Goal-Progress-Speicherung
  - Real-time Progress-Updates
  - Goal-Completion-Alerts

- **User-Profile-System**: Persistente Nutzer-Verwaltung
  - Automatische Profil-Erstellung bei TikTok-Events
  - User-Statistiken (Gifts, Coins, Chat-Messages)
  - Team-Member-Level-Tracking
  - Follow-Status-Tracking
  - Top-Gifter-Rankings

### Fixed
- Robuste Username-Extraktion aus TikTok-Events
- "Unknown"-Username-Display behoben
- Goal-Reset-Funktionalität verbessert

---

## [0.5.0] - Soundboard Pro

### Added
- **MyInstants API Integration**: 1 Million+ Sounds
  - Suchfunktion für MyInstants-Library
  - Favoriten-System
  - Sound-Preview
  - Custom Sound Upload

- **Soundboard Features**:
  - Volume-Kontrolle pro Sound
  - Hotkey-Support
  - Sound-Kategorien
  - Geschenk-zu-Sound-Mapping
  - Animation Support für Gifts

- **Gift-Katalog-Import**: Automatischer TikTok Gift Catalog
  - 200+ TikTok Gifts mit Icons
  - Automatisches Update beim Serverstart
  - Gift-Browser im Soundboard

### Changed
- Soundboard UI komplett überarbeitet
- Sound-Verwaltung deutlich verbessert

### Fixed
- Overlay Sound Button nicht responsive → behoben
- Database Syntax Errors in SQL Statements
- Server Startup Crashes

---

## [0.4.0] - Google TTS Integration

### Added
- **Google Cloud TTS**: Premium-Stimmen-Support
  - 40+ WaveNet & Standard Stimmen
  - Multi-Language Support (DE, EN-US, EN-GB, ES, FR, IT, JA, KR)
  - API-Key-Konfiguration
  - Provider-Switching (TikTok TTS ↔ Google TTS)

### Changed
- TTS-Engine erweitert für Multi-Provider-Support
- Voice-Auswahl im Dashboard erweitert

---

## [0.3.0] - Flow Automation & TikTok Security

### Added
- **Flow-Engine**: Trigger-basierte Automation
  - Event-Trigger (Chat, Gift, Follow, Share, Like)
  - Aktionen (TTS, Alert, OBS Scene, Sound)
  - Bedingungen (Gift-Value, Username, Text-Match)
  - Flow-Templates

### Fixed
- **Security**: tiktok-live-connector auf v2.1.0 upgraded
  - Sicherheitslücken geschlossen
  - Verbesserte Error-Handling
  - Robuster Retry-Mechanismus bei Connection-Errors

---

## [0.2.0] - Feature-Parität Python → Node.js

### Added
- Alle Features aus Python Soundboard migriert
- Winston Logger Integration
- Daily Rotating Log Files
- Express Rate Limiting
- Swagger API Dokumentation

### Changed
- Kompletter Rewrite von Python zu Node.js
- Modernere Architektur mit Modules

---

## [0.1.0] - Initial Release

### Added
- **Core Features**:
  - TikTok LIVE Connector Integration
  - Socket.io Real-time Communication
  - Express.js REST API
  - SQLite Database (WAL Mode)
  - Basic Dashboard UI
  - Overlay System für OBS

- **TikTok Events**:
  - Chat Messages
  - Gifts
  - Follows
  - Shares
  - Likes

- **TTS System**:
  - TikTok TTS API (75+ Voices)
  - Queue-Management
  - Blacklist-Filter
  - User-Voice-Mapping

- **Alert System**:
  - Gift Alerts
  - Follow Alerts
  - Konfigurierbare Templates

---

## Version Format

`MAJOR.MINOR.PATCH` (z.B. `1.2.0`)

- **MAJOR**: Breaking Changes (Inkompatible API-Änderungen)
- **MINOR**: Neue Features (Abwärtskompatibel)
- **PATCH**: Bug Fixes (Abwärtskompatibel)

---

**Hinweis**: Dieses Changelog wird ab Version 1.0.0 (Plugin System Release) aktiv gepflegt.
