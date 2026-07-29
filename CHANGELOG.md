# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Stream Monsters 1.11.0 source candidate (Open Beta)**: Portrait Arcade Rally adds a 90-second default only for fresh configurations, selectable German/English/Spanish/French overlay sequencing, a strict 74/26 TikTok-safe battle takeover and clearer egg, adoption, hatch and stat prompts.
- **Rules v8 K.O. Arena**: Battles end only by K.O. or forfeit; sealed A/B/C actions, capped passive Special charge, Arena Collapse from round five and element-specific WebGPU effects share deterministic replay and fallback timing.
- **Stream Monsters 1.9.0 (Open Beta)**: Rules v7 adds passive Special charge, localized skill explanations, combat-relevant evolution stages, animated stat growth, and deterministic reveal recovery to the retention and competitive arcade loop.
- **Sealed Rules-v7 Arena**: A/B/C choices remain sealed until both fighters lock or time out, then reveal together with deterministic replays and balanced elemental roles.

### Changed

- **Release separation**: LTTH stays at 1.4.1. Stream Monsters 1.11.0 is staged as source only until its deterministic package and SHA-256 are verified; the published 1.10.0 store artifact and all earlier packages remain immutable.

## [1.4.1] - 2026-07-26

### Added

- **Stream Monsters 1.5.0 (Open Beta)**: Enabled TikTok gifts are now the only egg source. Three incubators, FIFO overflow, configurable hatch presets, 24-hour ready-egg expiry, Hype milestones, Heart Chains, quests, and editable GCCE aliases complete the gift-to-collection loop.
- **72 Bundled Furry Forms**: The 24 monster templates now ship with verified Evolution I, II, and III artwork. Cosmetic evolution, mastery, essence, levels, and allocated stats persist without changing paid combat odds.
- **Interactive Arena PvP**: Both viewers choose A, B, or C in timed, reproducible battles with deterministic timeout choices, ordered replay, reload recovery, XP, and post-battle stat allocation.
- **Two Seasonal Leaderboards**: Collector Score and Arena Rating are tracked separately in configurable seasons while collections, evolution, levels, and stats remain permanent.
- **Portrait-First Arena**: The OBS arena keeps the lower 26 percent clear for TikTok chat, supports landscape layouts, and shares one deterministic timeline across WebGPU effects and Canvas2D fallback.
- **Curated Local Audio**: Five persisted audio channels route deterministic, impact-synchronized CC0 cues with preload, limiting, and silent failure handling.

### Changed

- **Creator Live Center**: Replaced Art Lab with six focused creator areas for live status, gameplay, gifts and chat, overlay setup, the bundled monster library, and community/season controls.
- **Bundled-Only Visuals**: Stream Monsters no longer ships a provider, model installer, generation pool, ComfyUI path, or any live image-generation runtime. Verified bundled Furry artwork is canonical and Kenney remains an emergency fallback.
- **Rules v5**: Gift deduplication, egg promotion, battle reservations, public replay projection, critical overlay queues, renderer recovery, and structured privacy-safe diagnostics are now durable and bounded.

### Compatibility

- **Stable Identity and Data**: The `streamalchemy` plugin ID, existing player data, legacy battle replays, and every published Stream Monsters archive through 1.4.0 are preserved.
- **Plugin Versions**: This LTTH patch advances Stream Monsters to 1.5.0; all other plugin versions remain unchanged, including WebGPU Fireworks 3.1.1.

## [1.4.0] - 2026-07-22

### Added

- **Stream Monsters 1.1.2**: Relaunched StreamAlchemy as Stream Monsters while retaining the compatible `streamalchemy` plugin ID and existing data. TikTok gifts become deterministic elemental eggs, community monsters, quests, and transparent three-round duels through `/streammonsters/*` and `/api/streammonsters/*`.
- **WebGPU Weather Control 1.0.0 (Open Beta)**: Added an independent cinematic WebGPU weather plugin with transparent OBS rendering, a native framegraph, adaptive quality, isolated configuration storage, `/api/webgpu-weather/*`, socket controls, Flow actions, and an optional community HUD.
- **Music Bot Smart Radio**: Added localized Radio Preview and live feedback, persistent catalog and playlist workflows, safer seeking, a self-healing radio supervisor, and optional viewer voting through `!vote1` and `!vote2`.
- **Talking Heads Local Assets and Gift Lottery**: Added bundled modular avatar asset packs and a gift-driven avatar lottery.
- **WebGPU Fireworks Show Platform**: Added PyroDSL, premium and revisioned custom shows, visual authoring, preview and import/export workflows, Goal and Superfan overrides, Pride rockets, and the 3D Furry/Boykisser finale.
- **Game Engine Controls**: Added per-event audio controls and fair Round Robin rotation with the active interactive player visible in the OBS overlay.
- **Emoji Rain Commands**: Added editable chat commands, command-specific lifetimes, and locked command assets.

### Changed

- **AnimazingPal Consolidation**: Integrated Stream Assistant capabilities, Live Host configuration, and the assistant HUD into AnimazingPal; `animazingpal` remains the public plugin ID.
- **EulerStream-only LIVE Transport**: EulerStream is now the sole TikTok LIVE event source, with bounded fallback support for connection recovery.
- **Launcher Reliability**: Hardened startup and runtime-path handling, database-start integrity checks, dependency self-healing, and launcher branding while retaining the signed release binary.
- **Localization and Documentation**: Regenerated affected plugin guides, catalogs, galleries, and UI surfaces in German, English, Spanish, and French.
- **App Store Sessions**: Profile logins now persist across app restarts.

### Fixed

- **Game Engine Stability**: Closed timer and audio-identity races, paused timers during hidden-game and result recovery states, restored default and custom Connect Four audio, hardened Chess lifecycle handling, and improved CoinBattle pyramid mode.
- **Music Bot Playback**: Hardened configuration, playback recovery, catalog and playlist handling, seek races, localization, and Smart Radio Auto-DJ recovery.
- **WebGPU Fireworks Runtime**: Improved renderer capability routing, GPU resource and atlas lifecycle handling, safe finale admission, telemetry, preview delivery, bottom-edge launches, visible-envelope rocket-to-burst alignment, and top-edge framing in WebGPU Fireworks 3.1.1.
- **STT Ticker**: Hardened multilingual live transcription, ASR credentials, source-language policy, translation caching, and secret masking.
- **Schnorrbecher**: Restored coin-jar behavior, configurable gift sizing, repeat-gift visuals, bundled glass-impact audio, and natural overflow.
- **Weather Control**: Improved gamification timer cleanup and independent community HUD controls.

### Removed

- **Sidekick Plugin**: Removed the standalone Sidekick plugin after consolidating its stream-assistant functionality into AnimazingPal.
- **Data Source Manager**: Removed the obsolete Data Source plugin and its dashboard, store, documentation, package, and translation surfaces.
- **TikFinity and Legacy Source Selection**: Removed the TikFinity adapter, TikFinity-facing documentation, and remaining multi-source LIVE configuration. Existing installations must use EulerStream for TikTok LIVE events.
- **Generated Talking Heads Assets**: Removed legacy generated-avatar paths in favor of bundled local assets.

### Security

- **Signed Windows Launcher**: Retains a valid Authenticode signature and adds hardened startup integrity checks.
- **Safer Diagnostics and Credentials**: Music Bot redacts media parameters in diagnostics, while STT Ticker improves credential validation and masking.


## [1.3.37] - 2026-07-20

### Fixed

- **Exact Rocket-to-Burst Alignment**: Star, ring, standard, and special rockets now carry one immutable visible-envelope fit from launch through explosion, so the burst opens at the exact rendered rocket endpoint without horizontal or vertical spawn drift.
- **Top-Edge Framing**: Rocket tips and complete star and ring shells retain their calculated top headroom, including effects fired from the settings test controls.

### Changed

- **Current Runtime Contracts**: Preview freshness now validates registered renderers through `statusUpdatedAt`; show-style catalogs, benchmark payloads, and crackle controls are covered by their current server contracts.
- **WebGPU Fireworks 3.1.1**: Advanced the plugin and cache keys while aligning package, README, changelog, download, locale, website, and release-test surfaces to LTTH 1.3.37.

## [1.3.36] - 2026-07-20

### Added

- **Pride Special Rockets**: Added rainbow and trans-color special rocket trails and finale accents.
- **Schnorrbecher Gift Rain**: Repeated gifts now fall individually through the jar opening and use the bundled glass impact sound.

### Fixed

- **Boykisser Finale**: Rebuilt the small and Hero Boykisser effects as recognizable particle rocket formations and integrated the Superfan finale with the current UI and renderer protocol.
- **Fireworks Framing and Runtime**: Preserved rocket-tip headroom, prevented clipped star and ring shells, hardened command admission and GPU resource handling, and retained adaptive fallbacks for older overlays.
- **Emoji Rain Commands**: Added dynamic command editing and command-specific despawn timing with reliable UI refresh behavior.
- **Game and Dashboard Polish**: Hardened Coinbattle pyramid gameplay, restored custom Connect Four audio handling, retried rejected Goal finales, clarified Music Bot health state, and removed the obsolete Viewer Profiles dashboard surface.

### Changed

- **Localized Guides**: Regenerated affected plugin guides in German, English, Spanish, and French.
- **Release Metadata**: Synchronized package, launcher, download, locale, website, and release-test version surfaces to LTTH 1.3.36.

## [1.3.35] - 2026-07-19

### Added

- **Controlled 3D Depth**: Furry Celebration now stages shells across far, mid, and near WebGPU particle volumes with fixed-camera perspective, camera-facing glyphs, and depth-aware flight timing.
- **Boykisser Choreography**: A procedural Boykisser/Silly Cat glyph appears throughout the redesigned Furry finale and closes as one centered Hero cat framed by subtle rainbow and trans-color halos.

### Changed

- **Renderer Capability Handshake**: Renderer protocol 3 advertises `depth3d-v1` and `boykisser-v1`; outdated OBS sources receive actionable refresh guidance and normal Furry events keep a playable legacy fallback.
- **WebGPU Fireworks 3.1.0**: Advanced the plugin version and aligned active package, launcher, download, locale, and website release surfaces to LTTH 1.3.35.

## [1.3.34] - 2026-07-19

### Added

- **Five Premium Finales**: Nishiki Kamuro, Aurora Cathedral, Royal Brocade, Phoenix Ascension, and Furry Celebration expand WebGPU Fireworks to nine built-in shows with 27 curated short, medium, and long variants.
- **PyroDSL and Show Designer**: Added a validated layered show format, deterministic compilation, a visual four-panel editor, variant derivation, autosave, undo/redo, import/export, and explicit cue, phase, and show previews.
- **Revisioned Custom Shows**: Added atomic draft storage, validation, publishing, duplication, derivation, archive/restore, revision conflicts, and snapshot-safe playback through the Custom Show API.
- **Professional GPU Effects**: Added radial, ring, spiral, palm, crossette, comet, mine, and curated glyph primitives with layered palettes, splits, strobes, trails, and adaptive particle budgeting.

### Changed

- **Finale Integrations**: Goal and Superfan finales can select built-in or published custom shows while preserving inherited defaults, queue order, live gifts, and deterministic preview behavior.
- **Localized Show Surfaces**: Added German, English, Spanish, and French copy for show titles, selectors, runtime status, and the Show Designer.
- **WebGPU Fireworks 3.0.0**: Advanced the plugin version and aligned active package, launcher, download, locale, and website release surfaces to LTTH 1.3.34.

## [1.3.33] - 2026-07-17

### Fixed

- **Weather Control Overlay Recovery**: OBS overlays reconnect after a server-initiated app restart and replay their ready handshake when Weather Control reloads.

### Changed

- **Localized Plugin Tutorials**: Refreshed the 39 sourced tutorials in German, English, Spanish, and French with verified product captures.
- **Test Execution**: Run the Jest suite in a resource-safe single-process mode.
- **Release Metadata**: Synchronized package, launcher, download, locale, and website version surfaces to 1.3.33.

## [1.3.32] - 2026-07-17

### Added

- **Unified Interactive Match Queue**: Connect Four and Chess now share a persistent FIFO queue for concurrent viewer matches; the active board waits for the streamer before rotation continues.
- **Rotating OBS Boards**: The unified overlay cycles through every active match, always renders the latest board state, and labels each board as host vs. player.
- **Host and Chat Controls**: The streamer controls host turns from the Game Engine dashboard while viewers submit their moves through chat.

### Fixed

- **Authoritative Viewer Clock**: The clock pauses during host turns, starts for the viewer turn, and records an automatic player loss when the configured response time expires.
- **Queue Reliability**: Hardened restart recovery, event deduplication, board advancement, and host-control races.

### Changed

- **Release Metadata**: Synchronized package, launcher, download, locale, and website version surfaces to 1.3.32.

## [1.3.31] - 2026-07-17

### Added

- **Choreographed WebGPU Finales**: Added four deterministic finale shows in short, medium, and long lengths with synchronized formations, staged phases, queueing, and live gift rockets that do not disrupt show cues.
- **Music-Bot Runtime Hardening**: Added a dual-slot playback controller, media cache, process reconciliation, resolver diagnostics, expanded runtime controls, and safer queue identities.
- **Emoji Animal Command Controls**: Added persisted SuperFan-only controls for animal commands while keeping their output as plain emoji rain.

### Fixed

- **Music-Bot Auto-DJ Recovery**: Auto-DJ now advances after the playback controller retires an MPV slot that ended with an error.
- **Finale Goal Integration**: Like-goal and goal-editor finale triggers now inherit or override the global show style and length consistently.

### Changed

- **Release Metadata**: Synchronized package, launcher, download, locale, and website version surfaces to 1.3.31.

## [1.3.28] - 2026-07-15

### Added

- **Visual FX Frame WEBGPU Beta**: Bundled the independent, disabled-by-default Visual FX Frame WEBGPU 1.2.0 runtime plugin. Its subscriber open-beta Plugin Store package remains available for WebGPU-capable OBS browser sources.

### Fixed

- **Goals Stream Lifecycle**: Goals now reset exactly once for each confirmed TikTok LIVE stream identity and ignore reconnects to the same LIVE room.

### Changed

- **Launcher Defaults**: High-contrast mode, keeping the launcher open, and the Stable update channel are now the tracked defaults.

## [1.3.27] - 2026-07-11

### Added

- **Emoji Rain Refresh**: Added the refreshed Emoji Rain and WebGPU Emoji Rain packages, assets, localization coverage, and regression tests.

### Fixed

- **Eulerstream Quota Safety**: LIVE is confirmed only after `roomInfo` or a real webcast event; reconnects are bounded and close-code aware.
- **Eulerstream Fallback Keys**: Shared keys require explicit consent, a three-second delay, controlled rotation on key rejection, and a terminal exhaustion message.

### Changed

- **Localization and Documentation**: Synchronized the expanded translations, plugin locales, and localized documentation surfaces.

### Added

- **Fireworks Stability Pass**: Added validated Fireworks configuration handling, sanitized trigger/finale/gift-mapping API payloads, and centralized trigger backpressure for safer OBS streaming under gift spam or low-FPS conditions.
- **Game Engine 1.3.1**: Plinko outcomes are selected server-side; the browser only reports animation completion. Plinko OpenShock rules now create a streamer review notice instead of dispatching hardware actions.

### Fixed

- **Game Engine Security**: Authorized Socket.IO mutations by admin/streamer and overlay role, removed SVG slot uploads, made destructive Plinko/Wheel migrations transactional, and moved live viewer data rendering to DOM APIs.

### Changed

- **Fireworks Plugin Store**: Removed the obsolete `fireworks-dev` Bossfight plugin from the repo and public plugin catalog. Stable `fireworks` is now the maintained Fireworks plugin.
- **Game Engine Queues**: Consolidated Plinko and Wheel processing on the unified queue and published the refreshed 1.3.1 open-beta package.
## [1.3.8] - 2026-07-03

### Fixed

- **Fireworks 2.0.1 Runtime Contract**: Restored persistent Paws, renderer, Toaster, trails, glow, and particle-limit settings; corrected real WebGL2/Canvas selection, adaptive quality, benchmark telemetry, and renderer cleanup.
- **ClarityHUD XSS Security**: Added `escapeAttr()` helper function; all template literal values in input fields are now properly escaped to prevent XSS injection attacks.
- **ClarityHUD UI**: `.source-badge` text color changed from `color-text-inverse` to `color-text-primary` for better contrast across themes.

### Added

- **ClarityHUD Form Collection**: New `collectCurrentFormValues()` function for centralized form state management across all dock types (chat, full, multi, stream).
- **ClarityHUD CSS**: Added `.preview-message.style-badge` CSS class for badge-style message previews.

### Changed

- **Launcher Settings**: Default theme changed from `night` to `highcontrast` for improved accessibility out of the box.

## [1.3.7] - 2026-03-07
### Added
- Deepgram Nova‑3 Provider – 3‑stufige Fallback‑Logik (Deepgram → Fish.audio → Ollama)
- Multi‑Language Mode – 7 Sprachen, 0 Halluzinationen in CJK/Thai/Arabic
- Confidence‑Threshold 0.3 – Low‑Quality‑Resultate verworfen
- Auto/Deepgram/Fish.audio Provider‑Switch in Admin‑UI
- Persistent Key‑Storage – Deepgram‑Key in Plugin‑Config gespeichert, nie in Git

### Fixed
- UI‑Bug – Overlay‑Container bei schneller Scroll‑Geschwindigkeit nicht korrekt gerendert
- Key‑Rotation – Deepgram‑Key bei fehlender Konfiguration nicht zurückgesetzt

## [1.3.6] - 2026-03-06
### Fixed & Performance
- Deepgram‑Key‑Validation – Fehlende Keys führen jetzt zu klarem Fehler‑Dialog
- VAD‑Cache‑Optimierung – 20 % weniger CPU‑Last bei langen Sessions
- 3‑Zeilen Ticker – Neue FIFO‑Ring‑Buffer‑Logik, keine DOM‑Recycling‑Fehler

## [1.3.5] - 2026-03-05
### Added
- Persistent Ollama‑Key mit __KEEP__‑Pattern (UI‑Save behält bestehenden Key)
- Auto‑Detect der Quellsprache aus der Heuristik
- Skip‑Optimization – Kein Call wenn Original bereits Zielsprache

## [1.3.4] - 2026-03-04
### Fixed
- UI‑Bug – Overlay‑Container bei schneller Scroll‑Geschwindigkeit nicht korrekt gerendert
- Key‑Rotation – Deepgram‑Key bei fehlender Konfiguration nicht zurückgesetzt

## [1.3.3] - 2026-03-26

### Added

#### 🎵 **Music Bot Plugin** (Neues Plugin v1.0 → v1.2.0)
- YouTube-Suche und Streaming via yt-dlp (gebündelt via youtube-dl-exec, kein Python nötig)
- Auto-Installation von yt-dlp beim ersten Start
- YouTube Player UI mit Suchvorschau
- Multi-Design OBS Overlay (3 Designs)
- Smart Query Normalization, Superfan-only Song Requests
- Queue Persistence, neue Chat-Commands (`!skip`, `!queue`, `!nowplaying`, `!remove`)
- Spotify/SoundCloud oEmbed-Integration
- Vote-Skip-Bar und Idle State im Overlay
- REST API Endpoints für Queue-Management

#### 🌦️ **Weather Engine – Massiver Ausbau** (7 → 13 Effekte)
- Neue Effekte: Aurora, Fireflies, Meteors, Sakura, Embers, Heatwave
- Rain: Puddle Ripples, Motion Blur, Ground Mist
- Snow: Accumulation System
- Wind: Perlin Noise basiert, Wind Streaks
- Storm: Screen Shake, Dark Overlay
- Thunder: Upgrades mit prozeduralen Blitz-Effekten
- Fog: Ground-Mode + Color Presets
- Sunbeam: Lens Flare + Color Temperature
- Weather Control UI: Alle 12 Engine-Effekte exponiert
- 9 Performance & Architektur-Fixes (O(n²) Lookup, GC Pressure, Quality Presets, Adaptive FPS)

#### ⚡ **OpenShock – PiShock Provider**
- PiShock als auswählbarer API-Provider (Provider Pattern)

#### 🎆 **Fireworks – Erweiterungen**
- Random Timer, Rainbow Color Mode
- Config Reset API
- Path Traversal Security Fix
- Deduplizierte Overlay-Route

#### 🎮 **Game Engine – Slot Machine (Unreleased → 1.3.3)**
- Token System für alle Spiele (Wheel, Plinko, Connect4, Schach): Konfigurierbare Overlay-Texte
- Slot Machine: Superfan Recognition, Sound Management (7 Sounds), Spin-to-Sound Sync
- Slot Machine: Design Settings (Farben, Presets: Classic/Ocean/Fire/Neon/Monochrome/Retro)
- Slot Machine: Customisable Result Labels, Symbol Image Upload
- Slot Machine: Media Tab Integration
- Wheel Queue / Spin-Hanger Fix: `_cleanupSpinState()` verhindert permanentes Queue-Hängen

#### 🛡️ **Intelligent Port Management**
- EADDRINUSE Crash Prevention mit automatischer Port-Erkennung

### Changed
- **Repository Cleanup** – Alle `*_SUMMARY.md` in `docs_archive/` verschoben
- **Version Sync** – Alle Versionsnummern auf 1.3.3 synchronisiert
- **yt-dlp Bundling** – Python/pip-Dependency vollständig entfernt, via youtube-dl-exec gebündelt
- **`YOUTUBE_DL_SKIP_PYTHON_CHECK=1`** in allen npm install Execution Paths (JS, Go, Batch)
- **npm audit** – eslint ^9, uuid Override, deprecated transitive deps behoben
- **i18n** – Skip für disabled Plugins beim Laden von Lokalisierungs-Dateien

### Fixed
- **TikTok Connector / Eulerstream** – 3 Gift-Recognition-Fixes:
  - Null-Packet Filter vor Dedup verschoben
  - Streakable Gift Recognition: Dedup auf repeatEnd beschränkt
  - Eulerstream giftDetails Schema Mismatch behoben
- **Viewer Profiles** – 8 Bugs in Validatoren, Session Tracking, WebSocket Handlers, UI
- **Viewer XP** – Watch-Time XP Akkumulation stoppt bei Offline-Stream
- **Goals HUD** – Overlay ignoriert gespeicherte Styles nach Browser-Refresh nicht mehr
- **Gift Milestone** – File Deletion, Celebration Queue, Race Condition, Exclusive Timeout Cleanup
- **Soundboard & Game Engine** – repeatCount auf Gift Streaks wird jetzt beachtet (Cap @50)
- **Slot Overlay** – Dynamic Reel Symbol Height + RAF Race Condition Fix
- **Unified Game Engine Overlay** – 5 kritische Bugs (currentGame Reset, Request-State Handler, Slot iframe, Queue Indicator, Lazy-Load iframes)
- **Weather Control** – Sunbeam Crash (fehlende `height`/`y` auf Beam-Objekten)
- **Weather Effects Sync** – 6 fehlende Effekte zwischen Backend und OBS Overlay synchronisiert
- **Talking Heads** – Windows Paths, spriteMode in Test-Animation, Timeout Memory Leak

## [1.3.2] - 2026-02-07

### Changed
- **Version Update** - Maintenance release with version consistency updates
  - Synchronized all version numbers across package files to 1.3.2
  - Updated version strings in all relevant configuration files

## [1.3.1] - 2026-02-05

### Changed
- **Removed deprecated emoji-rain plugin** - Superseded by webgpu-emoji-rain
  - The original emoji-rain plugin has been removed from the codebase
  - Use the newer webgpu-emoji-rain plugin for better performance and WebGPU support

## [1.3.0] - 2026-02-03

### Added

#### 🧠 **AnimazingPal Brain Engine** - Advanced AI Memory System
- **Langzeit-Gedächtnis**: Persistent memory storage with SQLite database
- **Vector Memory**: Semantic similarity search using embeddings (cosine similarity)
- **User Profiles**: Tracks viewer habits, preferences, and interaction history
- **Streamer Personalities**: 5 pre-defined personalities (Freundlicher Streamer, Gaming Pro, Entertainer, Chill Vibes, Anime Fan)
- **GPT Integration**: OpenAI API support (GPT-4o-mini, GPT-5 Nano compatible)
- **Memory Archival**: Automatic compression and archiving of old memories after 7 days
- **Memory Decay**: Importance score decay over 90 days, auto-pruning after 30 days
- **Auto-Response**: Configurable auto-responses for chat, gifts, follows, shares
- **Rate Limiting**: Configurable max responses per minute, chat response probability
- **API Endpoints**: 15+ endpoints for brain status, personalities, memories, user profiles
- Files: `animazingpal/brain-engine.js`, `animazingpal/personality-manager.js`, `animazingpal/vector-memory.js`

#### ⚡ **AnimazingPal Batch Processing** - Outbox System
- **Event Batching**: Collects multiple TikTok events (gifts, likes, follows) in time windows
- **Natural Speech Flow**: Combines events into coherent messages (e.g., "Thank you John for the Rose, Sarah for the Heart, and Mike for following!")
- **Configurable Window**: Default 8 seconds batch window, max 8 items, max 320 characters
- **Hold System**: Pauses batching during active speech or mic usage
- **Duplicate Prevention**: TTL-based event deduplication (600s default)
- **Activity Tracking**: Speech state and mic state monitoring with duration tracking
- Configuration: `outbox.windowSeconds`, `outbox.maxItems`, `outbox.maxChars`, `outbox.separator`

#### 🎯 **AnimazingPal Relevance Detection** - Smart Chat Filtering
- **Question Detection**: Recognizes questions with keywords (warum, wie, was, why, how, what, etc.)
- **Greeting Recognition**: Detects greetings (hallo, hi, hey, servus, moin, etc.) with cooldown (360s)
- **Thanks Detection**: Recognizes thank you messages (danke, thanks, merci, gracias, etc.)
- **Spam Filtering**: Ignores commands (!cam, /help), URLs, repeated characters, emojis-only messages
- **Score-Based**: Relevance score 0-1, configurable reply threshold (default 0.6)
- **API Endpoint**: `POST /api/animazingpal/relevance/test` - Test relevance score for any text
- Configuration: `relevance.minLength`, `relevance.replyThreshold`, `relevance.respondToGreetings`, `relevance.greetingCooldown`

#### 💬 **AnimazingPal Response Engine** - GPT-Powered Replies
- **Contextual Responses**: Uses user history and memory context for personalized replies
- **Quick Acknowledgments**: Fast responses for greetings, thanks, and gifts without full GPT calls
- **Response Caching**: 5-minute TTL cache to prevent duplicate API calls
- **Length Limiting**: Max 18 words per response for natural TTS pacing
- **ChatPal Integration**: Seamless integration with Animaze ChatPal for TTS output
- **Echo Mode Fallback**: Optional TTS-only mode without GPT processing

#### 📊 **New AnimazingPal API Endpoints**
- `GET /api/animazingpal/activity` - Speech/Mic/Batcher status
- `POST /api/animazingpal/batch/flush` - Manual batch queue flush
- `GET /api/animazingpal/relevance/test` - Test relevance score
- `POST /api/animazingpal/memory/decay` - Trigger memory decay manually
- `GET /api/animazingpal/memory/stats` - Extended memory statistics
- `GET /api/animazingpal/brain/status` - Brain engine status
- `POST /api/animazingpal/brain/config` - Configure brain settings
- `POST /api/animazingpal/brain/test` - Test GPT connection
- `GET /api/animazingpal/brain/personalities` - List all personalities
- `POST /api/animazingpal/brain/personality/set` - Activate personality
- `POST /api/animazingpal/brain/personality/create` - Create custom personality
- `GET /api/animazingpal/brain/memories/search` - Search memories semantically
- `GET /api/animazingpal/brain/user/:username` - Get user profile
- `POST /api/animazingpal/brain/chat` - Manual chat response
- `POST /api/animazingpal/brain/archive` - Archive old memories

### Changed
- **AnimazingPal README.md**: Expanded documentation to 443 lines with comprehensive Brain Engine docs
- **AnimazingPal Architecture**: Event-driven system with batching, relevance detection, and memory decay
- **AnimazingPal Performance**: Optimized response caching and batch processing for reduced API calls

### Fixed
- **Weather Control Plugin - OBS Overlay Transparency** (moved from Unreleased)
  - Fixed black background issue in OBS HUD overlay
  - Added explicit transparency settings to HTML, body, canvas, and container elements
  - Updated canvas context initialization with `premultipliedAlpha: true` for proper alpha blending
  - Ensured canvas maintains transparent background during initialization and resize
  - OBS now properly displays only weather effects without any background color
- **Goals Plugin Display Issues** (moved from Unreleased)
  - Fixed coin goal displaying values twice due to duplicate socket broadcasts
  - Fixed format function bug where 999999 displayed as "1000.0K" instead of "999K"
  - Simplified `broadcastGoalValueChanged()` to eliminate duplicate socket events (50% performance improvement)
  - Updated number formatting for cleaner display: numbers >= 10K now show without decimals (e.g., "50K" instead of "50.0K")
  - Ensured consistency between ClarityHUD and Goals overlays
  - Added comprehensive test suite (`goals-display-fix.test.js`) with 7 test cases

### Technical
- **Dependencies**: OpenAI API integration for Brain Engine
- **Database Schema**: New tables for brain memories, user profiles, personality configs
- **Performance**: Memory decay reduces database size by auto-archiving old entries
- **Architecture**: Modular design with separate engines for batch processing, relevance detection, response generation

## [1.2.2] - 2025-12-15

### Added
- **Multilingual Plugin Descriptions** (Phase 4)
  - Added multilingual descriptions to all 30 plugin.json files
  - Support for 4 languages: English (en), German (de), Spanish (es), French (fr)
  - New `descriptions` object in plugin.json with language-specific descriptions
  - Maintained backward compatibility with existing `description` field
  - API support for localized descriptions via `locale` query parameter
  - Updated plugin loader with `getLocalizedDescription()` helper function
  - Updated `/api/plugins` and `/api/plugins/:id` routes to support locale selection
  - All plugin descriptions include comprehensive feature details
  - Automated test suite for validation and backward compatibility
- **Visual Indicators for API Key Storage**
  - Added visual indicators showing that API keys are stored persistently across updates
  - Improved user feedback for API key configuration
  - Better documentation of API key storage locations

### Changed
- **Repository Cleanup**
  - Moved 107 implementation summary and documentation files to `docs_archive/` folder
  - Moved test and utility scripts to `scripts/` folder
  - Cleaned up root directory structure for better maintainability
  - Organized temporary implementation files and sandboxes
- **Plugin Loader Enhancement**
  - `getAllPlugins()` now accepts optional `locale` parameter
  - Plugin API responses now include both `description` (localized) and `descriptions` (all languages)
  - Improved plugin metadata exposure for better internationalization support

### Technical Details
- 30 plugins updated with multilingual descriptions
- JSON validation passed for all plugin.json files
- Backward compatibility maintained for legacy plugins without `descriptions` object
- Localization fallback: `descriptions[locale]` → `description` → empty string

## [1.2.1] - 2025-12-09

### Fixed
- **Version Number Correction** - Corrected erroneous version 2.2.1 to 1.2.1
  - Previous version incorrectly labeled as 2.2.1 (typo)
  - Proper semantic versioning sequence: 1.1.0 → 1.2.0 → 1.2.1
- **Advanced Timer Plugin** - Fixed overlay routes and storage migration
  - Added missing overlay routes for timer display in OBS
  - Migrated timer storage to user profile for better data persistence
  - Improved timer state management and recovery
  - Fixed timer overlay not loading correctly in browser sources

## [1.2.0] - 2025-12-07

### Changed
- **Repository Cleanup & Documentation Consolidation**
  - Konsolidierung aller Dokumentationsdateien in README.md
  - Archivierung aller detailierten Informationsdateien in /docs_archive/
  - Root-Verzeichnis bereinigt und auf Kern-Elemente reduziert
  - Struktur vereinheitlicht für zukünftige Releases
  - LICENSE file moved to root directory
  - Neue konsolidierte README.md mit allen wichtigen Informationen
  - Migration guides und spezifische Dokumentationen archiviert

### Added
- CHANGELOG.md für bessere Versionsverfolgung
- docs_archive/ Ordner für historische Dokumentation
- Vereinfachte Root-Struktur mit klarer Trennung

## [1.1.0] - 2024-12

### Added
- Electron Desktop App Support
- Viewer XP System with overlays and statistics
- GCCE Integration for plugins
- Weather Control Plugin
- Multi-Cam Switcher improvements
- HUD System Plugin (core)
- Performance optimizations (60% Event Processing, 50-75% DB Query reduction)

### Changed
- Launcher optimizations and error handling improvements
- Repository size reduction (removed node_modules from git)
- Improved documentation structure

### Fixed
- Launcher syntax errors
- Launcher size optimization (28% reduction)
- Improved error handling with log files
- Various bug fixes and stability improvements

---

For detailed changelog of the backend application, see [app/CHANGELOG.md](app/CHANGELOG.md)
