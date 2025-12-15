# Konfiguration

[← Installation & Setup](Installation-&-Setup) | [→ Architektur](Architektur)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Datenbank-Settings](#datenbank-settings)
3. [TTS-Konfiguration](#tts-konfiguration)
4. [Alert-Konfiguration](#alert-konfiguration)
5. [Goal-Konfiguration](#goal-konfiguration)
6. [Flow-Konfiguration](#flow-konfiguration)
7. [OBS WebSocket-Konfiguration](#obs-websocket-konfiguration)
8. [Plugin-Konfigurationen](#plugin-konfigurationen)
9. [Multi-Profile-System](#multi-profile-system)
10. [Cloud Sync](#cloud-sync)
11. [Umgebungsvariablen](#umgebungsvariablen)
12. [Erweiterte Einstellungen](#erweiterte-einstellungen)

---

## 🔍 Übersicht

Alle Konfigurationen werden in der **SQLite-Datenbank** gespeichert (`user_configs/<profile>/database.db`). Es gibt **keine externen Config-Dateien** und **keine obligatorischen API-Keys**.

### Speicherort

```
user_configs/
├── .active_profile          # Aktives Profil (Textdatei)
└── <profile-name>/
    ├── database.db          # SQLite-Datenbank (Haupt-Config)
    ├── database.db-shm      # Shared Memory (WAL Mode)
    └── database.db-wal      # Write-Ahead Log (WAL Mode)
```

### Datenbank-Tabellen

```sql
settings               -- Key-Value-Settings (JSON)
alert_configs          -- Alert-Konfigurationen
flows                  -- Flow-Definitionen
gift_sounds            -- Gift-zu-Sound-Mappings
user_voices            -- User-zu-Voice-Mappings
top_gifters            -- Top Gifters Statistik
streaks                -- Gift Combo Streaks
recent_donors          -- Letzte Spender
events                 -- Event-History
...
```

---

## 💾 Datenbank-Settings

### Settings-Tabelle

Struktur:
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

Alle Settings werden als **JSON-Strings** gespeichert.

### Wichtige Settings-Keys

| Key | Typ | Beschreibung | Beispiel |
|-----|-----|--------------|----------|
| `tts_enabled` | Boolean | TTS aktiviert | `"true"` |
| `default_tts_voice` | String | Standard-TTS-Stimme | `"en_us_001"` |
| `tts_volume` | Number | TTS-Lautstärke (0-100) | `"80"` |
| `soundboard_enabled` | Boolean | Soundboard aktiviert | `"true"` |
| `last_connected_username` | String | Letzter TikTok-Username | `"example_user"` |
| `auto_reconnect` | Boolean | Auto-Reconnect | `"true"` |
| `goal_likes` | Object | Likes-Goal-Config | `{...}` |
| `goal_followers` | Object | Followers-Goal-Config | `{...}` |
| `goal_subs` | Object | Subs-Goal-Config | `{...}` |
| `goal_coins` | Object | Coins-Goal-Config | `{...}` |
| `hud_config` | Object | HUD-Konfigurator | `{...}` |
| `plugin:<id>:config` | Object | Plugin-Konfiguration | `{...}` |

### Settings abrufen (API)

```bash
# Alle Settings
GET http://localhost:3000/api/settings

# Spezifisches Setting
GET http://localhost:3000/api/settings?key=tts_enabled
```

### Settings setzen (API)

```bash
POST http://localhost:3000/api/settings
Content-Type: application/json

{
  "key": "tts_enabled",
  "value": true
}
```

---

## 🎙️ TTS-Konfiguration

### TTS-Settings

**Dashboard:** Settings → TTS

**Settings-Key:** `plugin:tts:config`

**Struktur:**
```json
{
  "enabled": true,
  "default_voice": "en_us_001",
  "volume": 80,
  "speed": 1.0,
  "auto_tts_enabled": true,
  "auto_tts_min_team_level": 0,
  "auto_tts_blacklist": ["badword1", "badword2"],
  "user_blacklist": ["annoying_user"],
  "max_queue_size": 100,
  "google_api_key": ""
}
```

### Parameter-Beschreibung

| Parameter | Typ | Standard | Beschreibung |
|-----------|-----|----------|--------------|
| `enabled` | Boolean | `true` | TTS-System aktiviert |
| `default_voice` | String | `"en_us_001"` | Standard-Stimme (TikTok-ID) |
| `volume` | Number | `80` | Lautstärke (0-100) |
| `speed` | Number | `1.0` | Geschwindigkeit (0.5-2.0) |
| `auto_tts_enabled` | Boolean | `true` | Auto-TTS für Chat |
| `auto_tts_min_team_level` | Number | `0` | Min. Team-Level für Auto-TTS |
| `auto_tts_blacklist` | Array | `[]` | Blockierte Wörter |
| `user_blacklist` | Array | `[]` | Blockierte User |
| `max_queue_size` | Number | `100` | Max. Queue-Größe |
| `google_api_key` | String | `""` | Google Cloud TTS API-Key (optional) |

### Verfügbare Stimmen

**TikTok TTS (75+ Stimmen, kostenlos):**

**Englisch:**
- `en_us_001` - Female (Standard)
- `en_us_002` - Male
- `en_us_006` - Male (Deep)
- `en_us_007` - Male (Young)
- `en_us_009` - Female (Cheerful)
- `en_us_010` - Male (Narrator)
- `en_uk_001` - British Female
- `en_uk_003` - British Male
- ... (viele weitere)

**Deutsch:**
- `de_001` - German Female
- `de_002` - German Male

**Weitere Sprachen:**
- `es_mx_002` - Spanish (Mexico)
- `fr_001` - French Female
- `jp_001` - Japanese Female
- `kr_002` - Korean Male
- ... (40+ Sprachen)

**Vollständige Liste:** [TikTok TTS Voices](https://github.com/oscie57/tiktok-voice/wiki/Voice-Codes)

**Google Cloud TTS (30+ Stimmen, API-Key erforderlich):**
- Hochwertigere Qualität
- Mehr Anpassungsoptionen
- Kostenlos bis 4 Mio. Zeichen/Monat
- Requires: Google Cloud Account + API-Key

### User-Voice-Mapping

User können eigene Stimmen zugewiesen bekommen:

**Dashboard:** Settings → TTS → User Voice Mapping

**Datenbank:**
```sql
CREATE TABLE user_voices (
    username TEXT PRIMARY KEY,
    voice_id TEXT NOT NULL
);
```

**Beispiel:**
```sql
INSERT INTO user_voices (username, voice_id) VALUES
('user123', 'en_us_006'),
('streamer_friend', 'en_uk_001');
```

**Funktion:** Wenn `user123` chattet, wird immer Stimme `en_us_006` verwendet.

### TTS-API-Endpunkte

```bash
# Test-TTS
POST http://localhost:3000/api/tts/test
Content-Type: application/json

{
  "text": "Hello, this is a test",
  "voice": "en_us_001"
}

# Verfügbare Stimmen abrufen
GET http://localhost:3000/api/voices
```

---

## 🔔 Alert-Konfiguration

### Alert-Settings

**Dashboard:** Settings → Alerts

**Datenbank:**
```sql
CREATE TABLE alert_configs (
    event_type TEXT PRIMARY KEY,  -- 'gift', 'follow', 'subscribe', etc.
    enabled INTEGER DEFAULT 1,
    text_template TEXT,
    sound_file TEXT,
    duration INTEGER DEFAULT 5000,
    image_url TEXT,
    animation_type TEXT
);
```

### Event-Types

| Event Type | Beschreibung |
|------------|--------------|
| `gift` | Geschenk erhalten |
| `follow` | Neuer Follower |
| `subscribe` | Neuer Subscriber |
| `share` | Stream geteilt |
| `like` | Likes erhalten |
| `chat` | Chat-Nachricht |

### Alert-Konfiguration (Beispiel: Gift)

```json
{
  "enabled": true,
  "text_template": "{username} sent {giftName} x{count} ({coins} coins)",
  "sound_file": "/sounds/gift.mp3",
  "duration": 5000,
  "image_url": "/images/gift.gif",
  "animation_type": "slide-in"
}
```

### Template-Platzhalter

**Gift-Event:**
- `{username}` - Username des Senders
- `{giftName}` - Name des Geschenks
- `{giftId}` - ID des Geschenks
- `{count}` - Anzahl (Combo)
- `{coins}` - Coin-Wert
- `{profilePictureUrl}` - Profilbild-URL

**Follow-Event:**
- `{username}` - Username des Followers
- `{followRole}` - Follow-Role (0, 1, 2)

**Subscribe-Event:**
- `{username}` - Username des Subscribers
- `{subLevel}` - Subscription-Level (1-3)
- `{subMonth}` - Sub-Monat

**Chat-Event:**
- `{username}` - Username
- `{message}` - Chat-Nachricht

### Animation-Types

- `slide-in` - Von rechts einschieben
- `fade-in` - Einblenden
- `bounce` - Bounce-Effekt
- `zoom` - Zoom-Effekt
- `none` - Keine Animation

### Alert-API-Endpunkte

```bash
# Alert-Config abrufen
GET http://localhost:3000/api/alerts?eventType=gift

# Alert-Config speichern
POST http://localhost:3000/api/alerts/gift
Content-Type: application/json

{
  "enabled": true,
  "text_template": "{username} sent {giftName}!",
  "sound_file": "/sounds/gift.mp3",
  "duration": 5000
}

# Test-Alert senden
POST http://localhost:3000/api/alerts/test
Content-Type: application/json

{
  "type": "gift",
  "username": "TestUser",
  "giftName": "Rose",
  "coins": 100
}
```

---

## 🎯 Goal-Konfiguration

### Goal-Types

| Goal-Key | Beschreibung | Trigger |
|----------|--------------|---------|
| `likes` | Likes-Ziel | Bei Like-Events |
| `followers` | Follower-Ziel | Bei Follow-Events |
| `subs` | Subscriber-Ziel | Bei Subscribe-Events |
| `coins` | Coins-Ziel | Bei Gift-Events (Coin-Summe) |

### Goal-Config-Struktur

**Settings-Key:** `goal_<key>` (z.B. `goal_likes`)

```json
{
  "name": "Likes",
  "goal": 1000,
  "mode": "add",
  "add_amount": 1000,
  "show_goal": true,
  "style": {
    "fill_color1": "#4ade80",
    "fill_color2": "#22c55e",
    "bg_color": "#1f2937",
    "text_color": "#ffffff",
    "border_color": "#374151",
    "label_template": "Likes: {total} / {goal} ({percent}%)",
    "width": "400px",
    "height": "50px",
    "border_radius": "25px"
  }
}
```

### Parameter-Beschreibung

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `name` | String | Display-Name |
| `goal` | Number | Ziel-Wert |
| `mode` | String | `"add"` oder `"set"` |
| `add_amount` | Number | Bei `mode: "add"` - Wert zum Addieren bei Goal-Erreichen |
| `show_goal` | Boolean | Goal im Overlay anzeigen |
| `style.fill_color1` | String | Gradient-Farbe 1 (Hex) |
| `style.fill_color2` | String | Gradient-Farbe 2 (Hex) |
| `style.bg_color` | String | Hintergrundfarbe (Hex) |
| `style.text_color` | String | Textfarbe (Hex) |
| `style.border_color` | String | Rahmenfarbe (Hex) |
| `style.label_template` | String | Label-Template mit Platzhaltern |
| `style.width` | String | Breite (CSS) |
| `style.height` | String | Höhe (CSS) |
| `style.border_radius` | String | Border-Radius (CSS) |

### Label-Template-Platzhalter

- `{total}` - Aktueller Wert
- `{goal}` - Ziel-Wert
- `{percent}` - Prozent (0-100, gerundet)
- `{remaining}` - Verbleibend bis Goal

### Goal-Modes

**`mode: "add"`:**
- Bei Goal-Erreichen wird `add_amount` zum Goal addiert
- Beispiel: Goal = 1000, bei Erreichen → Goal = 2000
- Für endlose Streams geeignet

**`mode: "set"`:**
- Goal bleibt fix
- Bei Erreichen → Goal bleibt bei 1000
- Für einmalige Events geeignet

### Goal-API-Endpunkte

```bash
# Goal-Config abrufen
GET http://localhost:3000/api/goals/likes

# Goal-Config speichern
POST http://localhost:3000/api/goals/likes/config
Content-Type: application/json

{
  "name": "Likes",
  "goal": 1000,
  "mode": "add",
  "add_amount": 1000,
  "show_goal": true
}

# Goal-Style speichern
POST http://localhost:3000/api/goals/likes/style
Content-Type: application/json

{
  "fill_color1": "#4ade80",
  "fill_color2": "#22c55e",
  "label_template": "Likes: {total} / {goal}"
}

# Goal-Wert setzen
POST http://localhost:3000/api/goals/likes/set
Content-Type: application/json

{
  "value": 500
}

# Goal inkrementieren
POST http://localhost:3000/api/goals/likes/increment
Content-Type: application/json

{
  "value": 10
}

# Goal zurücksetzen
POST http://localhost:3000/api/goals/likes/reset

# Alle Goals zurücksetzen
POST http://localhost:3000/api/goals/reset
```

---

## ⚡ Flow-Konfiguration

### Flow-Struktur

**Datenbank:**
```sql
CREATE TABLE flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,  -- 'gift', 'chat', 'follow', etc.
    trigger_condition TEXT,      -- JSON
    actions TEXT NOT NULL,       -- JSON Array
    enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);
```

### Flow-Beispiel (Vollständig)

```json
{
  "id": 1,
  "name": "Rose Gift → Thank You",
  "description": "Danke-Nachricht bei Rose-Geschenken",
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": "==",
    "field": "giftName",
    "value": "Rose"
  },
  "actions": [
    {
      "type": "tts",
      "text": "Danke {username} für die Rose!",
      "voice": "en_us_001"
    },
    {
      "type": "alert",
      "text": "{username} sent a Rose!",
      "sound": "/sounds/rose.mp3",
      "duration": 3000
    }
  ],
  "enabled": 1
}
```

### Trigger-Types

| Trigger Type | Beschreibung | Verfügbare Fields |
|--------------|--------------|-------------------|
| `gift` | Geschenk erhalten | `giftName`, `giftId`, `coins`, `username`, `count` |
| `chat` | Chat-Nachricht | `message`, `username` |
| `follow` | Neuer Follower | `username`, `followRole` |
| `subscribe` | Neuer Subscriber | `username`, `subLevel` |
| `share` | Stream geteilt | `username` |
| `like` | Likes erhalten | `likeCount`, `username` |

### Condition-Operators

| Operator | Beschreibung | Beispiel |
|----------|--------------|----------|
| `==` | Gleich | `giftName == "Rose"` |
| `!=` | Ungleich | `giftName != "Rose"` |
| `>` | Größer | `coins > 1000` |
| `>=` | Größer-Gleich | `coins >= 500` |
| `<` | Kleiner | `coins < 100` |
| `<=` | Kleiner-Gleich | `coins <= 50` |
| `contains` | Enthält (String) | `message contains "hello"` |
| `startsWith` | Beginnt mit | `message startsWith "!"` |
| `endsWith` | Endet mit | `message endsWith "?"` |

### Action-Types

#### 1. TTS-Action

```json
{
  "type": "tts",
  "text": "Text mit {username} Platzhaltern",
  "voice": "en_us_001"
}
```

#### 2. Alert-Action

```json
{
  "type": "alert",
  "text": "Alert-Text mit {username}",
  "sound": "/sounds/file.mp3",
  "duration": 5000,
  "image": "/images/file.gif"
}
```

#### 3. OBS-Scene-Action

```json
{
  "type": "obs_scene",
  "scene_name": "Cam2"
}
```

#### 4. OBS-Source-Action

```json
{
  "type": "obs_source_visibility",
  "source_name": "Alert Box",
  "visible": true
}
```

#### 5. OSC-VRChat-Action

```json
{
  "type": "osc_vrchat_wave",
  "duration": 2000
}
```

Weitere: `osc_vrchat_celebrate`, `osc_vrchat_dance`, `osc_vrchat_hearts`, `osc_vrchat_confetti`

#### 6. Custom OSC-Action

```json
{
  "type": "osc_send",
  "address": "/avatar/parameters/MyParam",
  "value": 1
}
```

#### 7. HTTP-Request-Action

```json
{
  "type": "http_request",
  "method": "POST",
  "url": "https://example.com/webhook",
  "body": {
    "username": "{username}",
    "giftName": "{giftName}"
  }
}
```

#### 8. Delay-Action

```json
{
  "type": "delay",
  "duration": 2000
}
```

### Flow-API-Endpunkte

```bash
# Alle Flows abrufen
GET http://localhost:3000/api/flows

# Flow abrufen
GET http://localhost:3000/api/flows/1

# Flow erstellen
POST http://localhost:3000/api/flows
Content-Type: application/json

{
  "name": "Test Flow",
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": "==",
    "field": "giftName",
    "value": "Rose"
  },
  "actions": [...]
}

# Flow aktualisieren
PUT http://localhost:3000/api/flows/1
Content-Type: application/json

{
  "name": "Updated Flow",
  "enabled": 1
}

# Flow löschen
DELETE http://localhost:3000/api/flows/1

# Flow aktivieren/deaktivieren
POST http://localhost:3000/api/flows/1/toggle

# Flow testen
POST http://localhost:3000/api/flows/1/test
```

---

## 🎛️ OBS WebSocket-Konfiguration

### Multi-Cam-Plugin-Config

**Settings-Key:** `plugin:multicam:config`

```json
{
  "obsWebSocket": {
    "host": "localhost",
    "port": 4455,
    "password": ""
  },
  "chatCommands": {
    "enabled": true,
    "prefix": "!",
    "modsOnly": false,
    "broadcasterOnly": false,
    "allowedUsers": []
  },
  "giftMapping": {
    "1": {
      "giftId": 5655,
      "action": "switchScene",
      "target": "Cam1"
    },
    "2": {
      "giftId": 5827,
      "action": "switchScene",
      "target": "Cam2"
    }
  },
  "cooldowns": {
    "perUser": 15000,
    "global": 5000
  },
  "safetyLimits": {
    "maxRapidSwitchesPer30s": 10
  }
}
```

### OBS WebSocket aktivieren

1. OBS öffnen
2. Tools → WebSocket Server Settings
3. Enable WebSocket server: ✅
4. Server Port: `4455`
5. Server Password: (optional)

### OBS-API-Endpunkte

```bash
# OBS verbinden
POST http://localhost:3000/api/obs/connect

# OBS trennen
POST http://localhost:3000/api/obs/disconnect

# Status abrufen
GET http://localhost:3000/api/obs/status

# Szene wechseln
POST http://localhost:3000/api/obs/scene/Cam2

# Source Sichtbarkeit
POST http://localhost:3000/api/obs/source/AlertBox/visibility
Content-Type: application/json

{
  "visible": true
}

# Szenen abrufen
GET http://localhost:3000/api/obs/scenes

# Sources abrufen
GET http://localhost:3000/api/obs/sources
```

---

## 🔌 Plugin-Konfigurationen

### Plugin-Config-Schema

Alle Plugin-Configs werden gespeichert als:
```
Settings-Key: plugin:<plugin-id>:config
Value: JSON-Object
```

### TTS-Plugin-Config

**Key:** `plugin:tts:config`

Siehe [TTS-Konfiguration](#tts-konfiguration) oben.

### OSC-Bridge-Plugin-Config

**Key:** `plugin:osc-bridge:config`

```json
{
  "osc": {
    "sendPort": 9000,
    "receivePort": 9001,
    "host": "127.0.0.1"
  },
  "vrchat": {
    "enabled": true,
    "autoStart": true
  },
  "security": {
    "allowedIPs": ["127.0.0.1", "::1"]
  },
  "verbose": false
}
```

### Soundboard-Plugin-Config

**Key:** `plugin:soundboard:config`

```json
{
  "enabled": true,
  "volume": 80,
  "event_sounds": {
    "follow": "/sounds/follow.mp3",
    "subscribe": "/sounds/sub.mp3",
    "share": "/sounds/share.mp3"
  },
  "like_threshold": {
    "enabled": true,
    "threshold": 100,
    "sound": "/sounds/like_milestone.mp3"
  }
}
```

---

## 👤 Multi-Profile-System

### Profil-Verwaltung

**Speicherort:** `user_configs/`

**Aktives Profil:** `user_configs/.active_profile`

### Profil erstellen

**Dashboard:** Settings → Profiles → Create New Profile

**API:**
```bash
POST http://localhost:3000/api/profiles
Content-Type: application/json

{
  "username": "my_stream_setup"
}
```

### Profil wechseln

**Dashboard:** Settings → Profiles → Switch

**API:**
```bash
POST http://localhost:3000/api/profiles/switch
Content-Type: application/json

{
  "username": "my_stream_setup"
}
```

**Effekt:** Server lädt Datenbank neu, alle Einstellungen werden gewechselt.

### Profil löschen

**API:**
```bash
DELETE http://localhost:3000/api/profiles/my_stream_setup
```

**Warnung:** Löscht alle Daten unwiderruflich!

### Profil-Backup erstellen

**API:**
```bash
POST http://localhost:3000/api/profiles/my_stream_setup/backup
```

**Backup-Speicherort:** `user_configs/backups/my_stream_setup_TIMESTAMP.db`

---

## ☁️ Cloud Sync

**Beschreibung:** Optionale bidirektionale Synchronisation aller User-Konfigurationen mit Cloud-Speichern.

### Übersicht

Cloud Sync ermöglicht die automatische Synchronisation des gesamten `user_configs/` Verzeichnisses mit OneDrive, Google Drive oder Dropbox. Die Funktion ist standardmäßig deaktiviert und muss vom User bewusst aktiviert werden.

### Konfiguration

**Settings-Key:** `cloud_sync:config`

```json
{
  "enabled": false,
  "cloudPath": null,
  "lastSyncTime": null,
  "stats": {
    "totalSyncs": 0,
    "successfulSyncs": 0,
    "failedSyncs": 0,
    "filesUploaded": 0,
    "filesDownloaded": 0,
    "conflicts": 0
  }
}
```

### Aktivierung über UI

1. Öffne **Settings** → **Cloud Sync**
2. Klicke auf **"Auswählen"**
3. Gib den Cloud-Ordner-Pfad ein (z.B. `C:\Users\Name\OneDrive\TikTokHelper`)
4. Klicke auf **"Cloud Sync aktivieren"**

### Aktivierung über API

**POST** `/api/cloud-sync/enable`

```json
{
  "cloudPath": "/path/to/cloud/folder"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cloud sync enabled successfully",
  "enabled": true,
  "cloudPath": "/path/to/cloud/folder",
  "stats": { ... }
}
```

### Deaktivierung

**POST** `/api/cloud-sync/disable`

```json
{
  "success": true,
  "message": "Cloud sync disabled successfully",
  "enabled": false
}
```

### Manueller Sync

**POST** `/api/cloud-sync/manual-sync`

Triggert einen sofortigen Sync-Vorgang.

### Status abfragen

**GET** `/api/cloud-sync/status`

```json
{
  "success": true,
  "enabled": true,
  "cloudPath": "/path/to/cloud",
  "syncInProgress": false,
  "lastSyncTime": "2025-11-17T23:44:37.000Z",
  "stats": {
    "totalSyncs": 10,
    "successfulSyncs": 10,
    "failedSyncs": 0,
    "filesUploaded": 25,
    "filesDownloaded": 5,
    "conflicts": 2
  },
  "watchers": {
    "local": true,
    "cloud": true
  }
}
```

### Synchronisierte Daten

Alle Dateien in `user_configs/` werden synchronisiert:
- ✅ Datenbanken (*.db)
- ✅ Plugin-Konfigurationen
- ✅ TTS-Profile
- ✅ Flow-Definitionen
- ✅ Custom-Assets
- ✅ Alle anderen Dateien

### Technische Details

- **Synchronisation:** Bidirektional (Local ↔ Cloud)
- **Konfliktlösung:** Timestamp-basiert (neuere Datei gewinnt)
- **File-Watcher:** Echtzeit-Überwachung beider Verzeichnisse
- **Debounce:** 1 Sekunde (verhindert Sync-Schleifen)
- **Atomare Schreibvorgänge:** Kein Datenverlust bei Fehlern

### Best Practices

1. **Dedizierter Ordner:** Nutze einen separaten Ordner im Cloud-Speicher
2. **Regelmäßige Backups:** Cloud-Sync ersetzt keine Backups
3. **Ein Gerät aktiv:** Nutze nicht gleichzeitig auf mehreren Geräten
4. **Überwache Stats:** Behalte Sync-Statistiken im Auge

### Weitere Informationen

- **Feature-Dokumentation:** [Features/Cloud-Sync](Features/Cloud-Sync.md)
- **Technische Dokumentation:** [CLOUD_SYNC_DOCUMENTATION.md](../../CLOUD_SYNC_DOCUMENTATION.md)

---

## 🌍 Umgebungsvariablen

### PORT

**Beschreibung:** HTTP-Server-Port

**Standard:** `3000`

**Setzen:**
```bash
# Windows (PowerShell)
$env:PORT=3001; npm start

# Linux/macOS
PORT=3001 npm start
```

### NODE_ENV

**Beschreibung:** Node.js-Environment

**Werte:** `development`, `production`

**Standard:** `development`

**Effekt:**
- `production` → Keine Debug-Logs, Optimierungen
- `development` → Verbose Logging

**Setzen:**
```bash
NODE_ENV=production npm start
```

### LOG_LEVEL

**Beschreibung:** Winston-Log-Level

**Werte:** `error`, `warn`, `info`, `debug`

**Standard:** `info`

**Setzen:**
```bash
LOG_LEVEL=debug npm start
```

---

## ⚙️ Erweiterte Einstellungen

### HUD-Konfigurator

**Settings-Key:** `hud_config`

```json
{
  "elements": {
    "viewer_count": {
      "enabled": true,
      "position": { "x": 10, "y": 10 },
      "style": {
        "color": "#ffffff",
        "fontSize": "24px"
      }
    },
    "like_count": {
      "enabled": true,
      "position": { "x": 10, "y": 50 }
    }
  }
}
```

### Gift-Katalog aktualisieren

**Dashboard:** Settings → Gift Catalog → Update

**API:**
```bash
POST http://localhost:3000/api/gift-catalog/update
```

**Funktion:** Lädt aktuellen Gift-Katalog von TikTok (Scraping).

### Leaderboard-Einstellungen

**Dashboard:** Settings → Leaderboard

**API:**
```bash
GET http://localhost:3000/api/leaderboard/top/gifters?limit=10
```

**Kategorien:**
- `gifters` - Top Gifters (sortiert nach Total Coins)
- `donors` - Recent Donors
- `chatters` - Most Active Chatters (Message Count)

---

## 🔐 Sicherheitshinweise

### Keine Secrets in Datenbank

- Google Cloud API-Keys werden verschlüsselt gespeichert
- Niemals OBS-Passwörter in Git committen
- `.gitignore` enthält bereits `user_configs/`

### Rate-Limiting

**Einstellungen:** `modules/rate-limiter.js`

```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100 // Max 100 Requests pro IP
});
```

### Firewall

Nur Port 3000 öffnen, **nicht öffentlich** verfügbar machen ohne Authentifizierung!

---

## 📚 Weitere Informationen

- **[[API-Reference]]** - Vollständige API-Dokumentation
- **[[Plugin-Dokumentation]]** - Plugin-System im Detail
- **[[Entwickler-Leitfaden]]** - Code-Standards und Entwicklung

---

[← Installation & Setup](Installation-&-Setup) | [→ Architektur](Architektur)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
