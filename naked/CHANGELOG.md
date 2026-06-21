# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Snapshot cleanup: root package metadata now targets the maintained backend app and Go launcher sources instead of missing Electron files.
- Active documentation was refreshed for the local snapshot workflow and future agent work.
- Stale Electron and obsolete plugin-specific CI workflows were removed from the active workflow set.

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
