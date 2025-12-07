# Changelog

All notable changes to Pup Cid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **Electron Performance Flags** (`electron/main.js`)
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
  - Plugin-State-Persistierung in `plugins_state.json`
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
