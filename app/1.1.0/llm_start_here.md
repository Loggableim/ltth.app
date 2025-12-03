# LLM Start Here - Pup Cid's Little TikTok Helper

**Entwickler-Leitfaden für KI-Assistenten**

Diese Datei dient als zentraler Einstiegspunkt für LLMs, die an diesem Projekt arbeiten. Sie beschreibt die Architektur, Module, Endpoints, Events und wichtige Konventionen.

---

## 📋 Projektübersicht

**Name:** Pup Cid's Little TikTok Helper
**Stack:** Node.js + Express + Socket.io + SQLite + TikTok LIVE Connector
**Version:** 1.0.3
**Letzte Aktualisierung:** 2025-11-15
**Zweck:** Professionelles TikTok LIVE Streaming Tool mit Overlays, Alerts, TTS, Automation und Plugin-System

---

## 🏗️ Architektur

### Core-Module (`modules/`)

- **`database.js`**: SQLite-Datenbank (WAL Mode) für Settings, Gifts, Users, Goals
- **`tiktok.js`**: TikTok LIVE Connector Integration (Events: gift, chat, follow, share, like)
- **`tts.js`**: Text-to-Speech Engine (TikTok TTS, Google Cloud TTS)
- **`alerts.js`**: Alert-Manager für Gift/Follow/Subscribe-Notifications
- **`flows.js`**: Flow-Engine für Event-basierte Automation (Trigger → Actions)
- **`soundboard.js`**: Soundboard-Manager (MyInstants API, Custom Sounds)
- **`goals.js`**: Goal-Tracking (Follower, Likes, Gifts, Coins)
- **`user-profiles.js`**: Multi-User-Profile-Management
- **`vdoninja.js`**: VDO.Ninja Integration für Multi-Guest-Streaming
- **`obs-websocket.js`**: OBS WebSocket Integration (v5)
- **`subscription-tiers.js`**: Subscription Tier Management
- **`leaderboard.js`**: Leaderboard-System
- **`logger.js`**: Winston Logger (Console + Daily Rotating Files)
- **`rate-limiter.js`**: Express Rate Limiting
- **`i18n.js`**: Internationalisierung (DE/EN)
- **`plugin-loader.js`**: Plugin-System Loader mit Lifecycle-Management
- **`update-manager.js`**: Git-unabhängiges Update-System mit Backup/Rollback
- **`launcher.js`**: Platform-agnostischer Launcher mit Dependency-Check
- **`tty-logger.js`**: TTY-sicheres Logging-System
- **`update-checker.js`**: GitHub Releases API für Auto-Updates
- **`cloud-sync.js`**: Cloud-Synchronisation für User-Konfigurationen (OneDrive, Google Drive, Dropbox)

### Plugin-System (`plugins/`)

Alle Plugins folgen dieser Struktur:

```
plugins/<plugin-id>/
├── plugin.json       # Metadata (id, name, version, entry)
├── main.js           # Plugin-Klasse mit init() und destroy()
├── ui.html           # Optional: Admin-UI
└── assets/           # Optional: CSS, JS, Images
```

**Aktive Plugins:**

- **`api-bridge/`**: RESTful API für externe Integrationen
- **`clarityhud/`**: Dual VR-optimierte Overlays für VRChat
- **`emoji-rain/`**: Emoji-Regen-Effekt im Overlay (Physics-basiert)
- **`goals/`**: Interaktives Goal-Tracking (Follower, Likes, Gifts, Coins, Templates)
- **`hybridshock/`**: OpenShock-Integration für haptic feedback
- **`lastevent-spotlight/`**: Sechs Live-Event-Overlays
- **`multicam/`**: Multi-Cam Switcher (OBS Szenen via Gifts/Commands)
- **`osc-bridge/`**: OSC-Bridge für VRChat-Integration (bidirektionale Kommunikation)
- **`quiz_show/`**: Interaktive Quiz-Show mit TikTok-Integration
- **`resource-monitor/`**: System-Ressourcen-Überwachung (CPU, RAM, Network)
- **`soundboard/`**: Soundboard-Manager (MyInstants API, Custom Sounds)
- **`tts/`**: TTS-Engine als Plugin (75+ Stimmen, Queue, Blacklist)
- **`vdoninja/`**: VDO.Ninja Manager als Plugin
- **`gift-milestone/`**: Gift-Milestone-Tracker mit Animationen
- **`topboard/`**: Top Gifters, Streaks, Donors im Overlay
- **`weather-control/`**: Professional Weather Effects System (Rain, Snow, Storm, Fog, Thunder, Sunbeam, Glitch Clouds)

**Plugin-API (`PluginAPI` class in `plugin-loader.js`):**

- `registerRoute(method, path, handler)`: Express-Route registrieren
- `registerSocket(event, callback)`: Socket.io-Event registrieren
- `registerTikTokEvent(event, callback)`: TikTok-Event abonnieren
- `getConfig(key)`: Plugin-Config aus DB laden
- `setConfig(key, value)`: Plugin-Config in DB speichern
- `emit(event, data)`: Socket.io-Event an alle Clients senden
- `log(message, level)`: Logger-Wrapper
- `getSocketIO()`: Socket.io-Instanz abrufen
- `getDatabase()`: Datenbank-Instanz abrufen

### Routes (`routes/`)

- **`plugin-routes.js`**: Plugin-Manager-API (Upload, Enable, Disable, Delete, Reload)

### Frontend (`public/`)

- **`index.html`**: Dashboard (Bootstrap 5, jQuery)
- **`overlay.html`**: OBS Browser Source Overlay
- **`js/plugin-manager.js`**: Plugin-Manager Frontend
- **`js/update-checker.js`**: Update-Checker Frontend

---

## 🔌 Plugin: Multi-Cam Switcher (`plugins/multicam/`)

**Zweck:** Wechselt OBS-Szenen oder Kamerawinkel via TikTok Gifts oder Chat-Commands.

**Dateien:**
- `plugin.json`: Metadata
- `main.js`: OBS-WebSocket v5 Client, Chat-Command-Parser, Gift-Mapping
- `ui.html`: Admin-Panel (Connection Status, Manual Controls, Hot Buttons)

**Konfiguration:** `user_configs/<profile>/multicam.json`

**Features:**
- OBS-WebSocket v5 Integration (Reconnect mit Backoff)
- Chat-Commands: `!cam 1`, `!cam next`, `!scene Studio`, `!angle next`
- Gift-Mapping: rose→Cam1, lion→Cam5, rocket→Macro
- Macros: Multi-Step-Aktionen mit Waits
- Permissions: modsOnly, broadcasterOnly, allowedUsers
- Cooldowns: Per-User, Global
- Safety-Limits: maxRapidSwitchesPer30s
- Fallback: Hotkeys via robotjs (opt-in, wenn OBS-WS down)

**API-Endpoints:**
- `GET /api/multicam/config`: Config abrufen
- `POST /api/multicam/config`: Config speichern
- `POST /api/multicam/connect`: OBS verbinden
- `POST /api/multicam/disconnect`: OBS trennen
- `POST /api/multicam/action`: Manuelle Aktionen (switchScene, cycleScene)
- `GET /api/multicam/state`: Status (connected, currentScene, scenes[], sources[])

**Socket.io Events (emittiert):**
- `multicam_state`: Status-Update (connected, currentScene, queue)
- `multicam_switch`: Szenen-Wechsel-Event (username, action, target)

**TikTok Events (subscribed):**
- `gift`: Gift-Mapping → OBS-Actions
- `chat`: Chat-Command-Parsing → OBS-Actions

---

## 🌉 Plugin: OSC-Bridge (`plugins/osc-bridge/`)

**Zweck:** Dauerhafte OSC-Brücke für VRChat-Integration. Ermöglicht bidirektionale Kommunikation zwischen TikTok-Events und VRChat-Avataren.

**Dateien:**
- `plugin.json`: Metadata
- `main.js`: OSC UDP-Server/Client, VRChat-Parameter-Handler, Flow-Integration, Gift-Mappings, Avatar-Switching
- `ui.html`: Admin-Panel (Status, Config, Parameter-Tester, Gift-Mappings, Avatar-Management)
- `locales/`: Internationalisierung (DE/EN)

**Konfiguration:** Plugin-Settings im Dashboard

**Features:**
- Dauerhaft aktiv (kein Auto-Shutdown)
- VRChat-Standard-Parameter (/avatar/parameters/*, /world/*)
- Bidirektionale Kommunikation (Senden & Empfangen)
- **Gift Catalogue Mappings**: TikTok-Geschenke mit OSC-Aktionen verknüpfen
- **Avatar Switching**: VRChat-Avatar via OSC wechseln (/avatar/change)
- Standardports: 9000 (Send), 9001 (Receive)
- Nur lokale IPs erlaubt (Sicherheit)
- Vollständiges Logging (oscBridge.log)
- Verbose-Modus für Live-Debug
- Latenz < 50 ms

**VRChat Parameter:**
- `/avatar/parameters/Wave`: Wave-Geste
- `/avatar/parameters/Celebrate`: Celebrate-Animation
- `/avatar/parameters/DanceTrigger`: Dance-Trigger
- `/avatar/parameters/Hearts`: Hearts-Effekt
- `/avatar/parameters/Confetti`: Confetti-Effekt
- `/avatar/parameters/EmoteSlot0-7`: Emote-Slots
- `/avatar/change`: Avatar-Wechsel (String: avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

**API-Endpoints:**
- `GET /api/osc/status`: Status abrufen
- `POST /api/osc/start`: Bridge starten
- `POST /api/osc/stop`: Bridge stoppen
- `POST /api/osc/send`: OSC-Nachricht senden
- `POST /api/osc/test`: Test-Signal senden
- `GET /api/osc/config`: Config abrufen
- `POST /api/osc/config`: Config speichern
- `POST /api/osc/vrchat/wave`: Wave triggern
- `POST /api/osc/vrchat/celebrate`: Celebrate triggern
- `POST /api/osc/vrchat/dance`: Dance triggern
- `POST /api/osc/vrchat/hearts`: Hearts triggern
- `POST /api/osc/vrchat/confetti`: Confetti triggern
- `POST /api/osc/vrchat/emote`: Emote triggern
- `POST /api/osc/vrchat/avatar`: Avatar wechseln (avatarId, avatarName)
- `GET /api/osc/gift-mappings`: Gift-Mappings abrufen
- `POST /api/osc/gift-mappings`: Gift-Mappings speichern
- `GET /api/osc/avatars`: Avatar-Liste abrufen
- `POST /api/osc/avatars`: Avatar-Liste speichern

**Socket.io Events (emittiert):**
- `osc:status`: Status-Update (isRunning, stats, config)
- `osc:sent`: OSC-Nachricht gesendet
- `osc:received`: OSC-Nachricht empfangen
- `osc:gift-triggered`: Gift-Mapping ausgelöst
- `osc:avatar-switched`: Avatar gewechselt

**Flow-Actions (IFTTT):**
- `osc:send`: Beliebige OSC-Nachricht senden
- `osc:vrchat:wave`: Wave-Geste triggern
- `osc:vrchat:celebrate`: Celebrate-Animation triggern
- `osc:vrchat:dance`: Dance triggern
- `osc:vrchat:hearts`: Hearts-Effekt triggern
- `osc:vrchat:confetti`: Confetti-Effekt triggern
- `osc:vrchat:emote`: Emote-Slot triggern (slot: 0-7)
- `osc:vrchat:avatar`: Avatar wechseln (avatarId, avatarName)

**Gift Mappings:**
TikTok-Geschenke können direkt mit VRChat-Aktionen verknüpft werden:
- Konfiguration über UI oder API
- Unterstützte Aktionen: wave, celebrate, dance, hearts, confetti, emote, avatar, custom_parameter
- Automatische Ausführung bei Gift-Empfang
- Parameter anpassbar (duration, slot, avatarId, parameterName, value)

**Beispiel Gift Mapping:**
```json
{
  "giftId": 5655,
  "giftName": "Rose",
  "action": "hearts",
  "params": { "duration": 2000 }
}
```

**Beispiel Avatar Mapping:**
```json
{
  "giftId": 9999,
  "giftName": "Galaxy",
  "action": "avatar",
  "params": { 
    "avatarId": "avtr_12345678-1234-1234-1234-123456789abc",
    "avatarName": "My Favorite Avatar"
  }
}
```

**Beispiel-Flows:**
```json
{
  "trigger_type": "gift",
  "trigger_condition": { "operator": ">=", "field": "coins", "value": 5000 },
  "actions": [
    { "type": "osc:vrchat:celebrate", "duration": 3000 }
  ]
}
```

```json
{
  "trigger_type": "chat",
  "trigger_condition": { "operator": "contains", "field": "message", "value": "/wave" },
  "actions": [
    { "type": "osc:vrchat:wave", "duration": 2000 }
  ]
}
```

```json
{
  "trigger_type": "gift",
  "trigger_condition": { "operator": "==", "field": "giftName", "value": "Galaxy" },
  "actions": [
    { 
      "type": "osc:vrchat:avatar", 
      "avatarId": "avtr_12345678-1234-1234-1234-123456789abc",
      "avatarName": "Galaxy Avatar"
    }
  ]
}
```

---

## 🌦️ Plugin: Weather Control (`plugins/weather-control/`)

**Zweck:** Professionelles Weather-Effects-System für TikTok Live Overlays mit modernen GPU-beschleunigten Animationen.

**Dateien:**
- `plugin.json`: Metadata
- `main.js`: Backend-Logik, API-Endpoints, Permissions, Rate-Limiting
- `ui.html`: Admin-Panel (Configuration, Effect Testing)
- `overlay.html`: OBS Overlay mit Canvas 2D Rendering
- `README.md`: Umfassende Dokumentation

**Konfiguration:** Plugin-Settings im Dashboard (stored in database unter `weather_config`)

**Features:**
- 7 Weather Effects: Rain, Snow, Storm, Fog, Thunder, Sunbeam, Glitch Clouds
- GPU-accelerated Canvas 2D rendering (60 FPS)
- Permission-based Access Control (Followers, Superfans, Subscribers, Team Members, Top Gifters)
- Rate Limiting (configurable, default 10 req/min)
- WebSocket real-time event streaming
- Flow action support for automation
- Gift-based automatic triggers
- Input validation & sanitization
- Configurable intensity, duration, particle count
- Debug mode with FPS/particle counter

**Weather Effects:**
- **Rain** 🌧️: Realistic falling rain particles (200 particles @ 0.5 intensity)
- **Snow** ❄️: Gentle snowfall with wobble physics (150 particles)
- **Storm** ⛈️: Heavy rain + wind + camera shake (300 particles)
- **Fog** 🌫️: Layered noise fog with gradual fade (30 large particles)
- **Thunder** ⚡: Random lightning flashes with screen brightening
- **Sunbeam** ☀️: Warm animated light rays (5 beams)
- **Glitch Clouds** ☁️: Digital glitch with RGB noise lines

**API-Endpoints:**
- `POST /api/weather/trigger`: Trigger weather effect
- `GET /api/weather/config`: Get configuration
- `POST /api/weather/config`: Update configuration
- `GET /api/weather/effects`: List supported effects
- `POST /api/weather/reset-key`: Reset API key
- `GET /weather-control/ui`: Configuration panel
- `GET /weather-control/overlay`: OBS overlay

**Example POST /api/weather/trigger:**
```json
{
  "action": "rain",
  "intensity": 0.5,
  "duration": 10000,
  "username": "viewer123",
  "meta": {
    "triggeredBy": "gift"
  }
}
```

**Socket.io Events (emittiert):**
- `weather:trigger`: Weather effect triggered
  ```json
  {
    "type": "weather",
    "action": "rain",
    "intensity": 0.5,
    "duration": 10000,
    "username": "viewer123",
    "meta": {},
    "timestamp": 1234567890
  }
  ```
- `weather:permission-denied`: User permission denied

**Flow-Actions:**
- `weather.trigger`: Trigger weather effect from IFTTT flow

**Beispiel-Flows:**
```json
{
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": ">=",
    "field": "coins",
    "value": 5000
  },
  "actions": [
    {
      "type": "weather.trigger",
      "action": "storm",
      "intensity": 0.8,
      "duration": 10000
    }
  ]
}
```

```json
{
  "trigger_type": "follow",
  "actions": [
    {
      "type": "weather.trigger",
      "action": "snow",
      "intensity": 0.6,
      "duration": 8000
    }
  ]
}
```

**Gift Triggers (automatic):**
- 5000+ coins → Storm
- 1000-4999 coins → Thunder
- 500-999 coins → Rain
- 100-499 coins → Snow

**Permission System:**
```json
{
  "permissions": {
    "enabled": true,
    "allowAll": false,
    "allowedGroups": {
      "followers": true,
      "superfans": true,
      "subscribers": true,
      "teamMembers": true,
      "minTeamLevel": 1
    },
    "topGifterThreshold": 10,
    "minPoints": 0
  }
}
```

**OBS Setup:**
1. Add Browser Source to OBS
2. URL: `http://localhost:3000/weather-control/overlay`
3. Width: 1920, Height: 1080
4. Check "Shutdown source when not visible"
5. Debug mode: Add `?debug=true` to URL

---

## 📡 Socket.io Events

### Core Events

- `tiktok:connected`: TikTok LIVE Connection etabliert
- `tiktok:disconnected`: TikTok LIVE Connection beendet
- `tiktok:gift`: Gift empfangen
- `tiktok:chat`: Chat-Message empfangen
- `tiktok:follow`: Follow empfangen
- `tiktok:share`: Share empfangen
- `tiktok:like`: Like empfangen

### Plugin Events

- **Topboard:**
  - `topboard:update`: Top Gifters Update
  - `topboard:reset`: Topboard Reset
  - `topboard:config-update`: Config geändert

- **TTS:**
  - `tts:queue-update`: TTS-Queue Update
  - `tts:speaking`: TTS spricht gerade
  - `tts:finished`: TTS fertig

- **Multi-Cam:**
  - `multicam_state`: Status-Update
  - `multicam_switch`: Szenen-Wechsel

- **Weather Control:**
  - `weather:trigger`: Weather effect triggered (overlay receives this)
  - `weather:permission-denied`: User permission denied

---

## 🗄️ Datenbank-Tabellen

**Settings:**
- `key`: STRING (PRIMARY KEY)
- `value`: TEXT (JSON)

**Users:**
- `username`: STRING (PRIMARY KEY)
- `first_seen`: DATETIME
- `last_seen`: DATETIME
- `coins_sent`: INTEGER
- `gifts_sent`: INTEGER
- `messages_sent`: INTEGER
- `is_follower`: BOOLEAN
- `team_member_level`: INTEGER

**Gifts:**
- `username`: STRING
- `gift_name`: STRING
- `gift_id`: INTEGER
- `coins`: INTEGER
- `timestamp`: DATETIME

**Goals:**
- `id`: INTEGER (PRIMARY KEY)
- `type`: STRING (followers, likes, coins, etc.)
- `target`: INTEGER
- `current`: INTEGER
- `title`: STRING
- `created_at`: DATETIME

---

## 📝 Wichtige Konventionen

### Code-Style

- **Keine Features entfernen**: Nur ergänzen/patchen
- **Logger nutzen**: `logger.info()`, `logger.error()`, `logger.debug()`
- **Error-Handling**: Try-Catch für alle Async-Operationen
- **Config-Validierung**: Immer Defaults setzen, wenn Config fehlt
- **Atomic Writes**: Config-Dateien mit `.tmp` schreiben, dann umbenennen

### Plugin-Entwicklung

1. **plugin.json** anlegen mit `id`, `name`, `version`, `entry`, `enabled`
2. **main.js** mit Klasse die `init()` und `destroy()` implementiert
3. **Konstruktor**: `constructor(api)` mit `this.api = api`
4. **init()**: Routes/Sockets/Events registrieren, Config laden
5. **destroy()**: Cleanup (Connections schließen, Timers löschen)
6. **Config**: Via `api.getConfig('config')` / `api.setConfig('config', data)`

### Changelog-Updates

Nach jeder Änderung:

1. **CHANGELOG.md** aktualisieren:
   - Datum/Zeit im Format `YYYY-MM-DD HH:MM:SS`
   - Dateien auflisten
   - Kurzbeschreibung der Änderung

2. **llm_start_here.md** synchronisieren:
   - Neue Module/Plugins im Architekturüberblick
   - Neue Endpoints/Events dokumentieren

3. **llm_info Notiz** erstellen:
   - Vorher-Zustand
   - Nachher-Zustand
   - Geänderte Dateien

---

## 🚀 Development Workflow

1. **Verstehe Anforderung**: Requirements klar erfassen
2. **Lies llm_start_here.md**: Diese Datei zuerst lesen!
3. **Analysiere Codebase**: Bestehende Patterns verstehen
4. **Implementiere**: Code schreiben, keine Features entfernen
5. **Teste**: Funktionalität prüfen
6. **Dokumentiere**: CHANGELOG.md, llm_start_here.md, llm_info
7. **Commit**: Klare Commit-Message, pushe zu Feature-Branch

---

## 🔧 Launcher & Update-System

### Launcher-Struktur

**Einstiegspunkte:**
- `launch.js`: Haupt-Einstiegspunkt (ruft modules/launcher.js auf)
- `start.sh`: Linux/macOS Shell-Script (minimal, nur Node-Check)
- `start.bat`: Windows Batch-Script (minimal, nur Node-Check)

**Launcher-Ablauf:**
1. Node.js Version-Check (18-23 erforderlich)
2. npm Version-Check
3. Dependencies prüfen/installieren
4. Update-Check (optional)
5. Server starten (`server.js`)
6. Browser öffnen (Dashboard)

**TTY-sicheres Logging:**
- Automatische TTY-Erkennung (`process.stdout.isTTY`)
- ANSI-Farben nur bei TTY-Unterstützung
- UTF-8/Emoji-Detection
- Fallback auf Plain-Text für non-TTY (OBS, Redirects)

### Update-System

**Update-Strategien:**

**Git-basiert (wenn .git/ vorhanden):**
1. `git fetch origin`
2. `git pull`
3. `npm install` (wenn package.json geändert)
4. Backup vor Update
5. Rollback bei Fehler

**GitHub Release (ohne Git):**
1. Download ZIP von `https://api.github.com/repos/USER/REPO/releases/latest`
2. Backup erstellen (user_data/, user_configs/)
3. Entpacke ZIP (außer user_data/, user_configs/)
4. `npm install`
5. Rollback bei Fehler

**API-Endpoints:**
- `GET /api/update/check`: Prüft auf neue Versionen
- `POST /api/update/download`: Führt Update aus
- `GET /api/update/current`: Aktuelle Version
- `GET /api/update/instructions`: Manuelle Update-Anleitung

**Backup-Strategie:**
- Backup-Ordner: `.backups/backup_TIMESTAMP/`
- Gesichert: user_data/, user_configs/, package.json, package-lock.json
- Rollback bei Fehler: Restore aus Backup

---

## ☁️ Cloud Sync System

**Zweck:** Optionale bidirektionale Synchronisation aller User-Konfigurationen mit Cloud-Speichern.

**Unterstützte Anbieter:**
- OneDrive
- Google Drive
- Dropbox

**Synchronisierte Daten:**
- Alle Dateien in `user_configs/`
- Plugin-Konfigurationen
- TTS-Profile
- Flow-Automationen
- HUD-Layouts
- Custom-Assets

**API-Endpoints:**
- `GET /api/cloud-sync/status`: Status abrufen
- `POST /api/cloud-sync/enable`: Cloud Sync aktivieren
- `POST /api/cloud-sync/disable`: Cloud Sync deaktivieren
- `POST /api/cloud-sync/manual-sync`: Manuellen Sync durchführen
- `POST /api/cloud-sync/validate-path`: Cloud-Pfad validieren

**Funktionsweise:**
1. Keine direkten Cloud-API-Calls (nutzt lokale Ordner-Synchronisation)
2. File-Watcher für Echtzeit-Sync (bidirektional)
3. Timestamp-basierte Konfliktlösung
4. Atomare Schreibvorgänge (keine Datenverluste)
5. Standardmäßig deaktiviert (opt-in)

**Dokumentation:** Siehe `CLOUD_SYNC_DOCUMENTATION.md`

---

## 🔧 Tech Stack Details

- **Node.js**: >=18.0.0 <24.0.0
- **Express**: ^4.18.2
- **Socket.io**: ^4.6.1
- **better-sqlite3**: ^11.9.0
- **tiktok-live-connector**: ^2.1.0
- **obs-websocket-js**: ^5.0.6
- **osc**: ^2.4.5
- **winston**: ^3.18.3
- **multer**: ^2.0.2
- **axios**: ^1.6.5

---

## 📚 Weitere Dokumentation

- **CHANGELOG.md**: Detaillierte Versionshistorie
- **README.md**: User-facing Documentation (in this folder)
- **CLOUD_SYNC_DOCUMENTATION.md**: Cloud Sync Feature Dokumentation
- **VDONINJA_USER_GUIDE.md**: VDO.Ninja Anleitung
- **docs/**: API-Dokumentation, Guides
- **wiki/**: Wiki-Dokumentation

---

**Letzte Aktualisierung:** 2025-11-17 (Cloud Sync v1.0.0)
**Maintainer:** Pup Cid
