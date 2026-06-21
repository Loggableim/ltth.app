# WebGPU Emoji Rain Plugin - Enhanced Edition

GPU-beschleunigter Emoji-Partikel-Effekt für LTTH mit WebGPU instanziertem Rendering, vollständig integriert mit der Global Chat Command Engine (GCCE).

## ✨ Features

### Core Features
- **GPU-beschleunigtes Rendering**: WebGPU mit instanziertem Rendering für maximale Performance
- **GCCE-Integration**: Vollständige Chat-Command-Unterstützung
- **Preset-System**: Konfigurierbare Vorlagen für schnellen Zugriff
- **Anti-Spam & Rate Limiting**: Globale und benutzerspezifische Cooldowns
- **Telemetrie & Debug**: Umfassende Metriken und Debug-Funktionen
- **Persistent Storage**: Alle Daten überleben Updates

### Enhanced Features
- **SuperFan/Coins-Skalierung**: Automatische Intensitäts-Anpassung basierend auf Gift-Wert und SuperFan-Level
- **Sticker Rain**: Automatischer Sticker-Regen/-Burst wenn Nutzer Sticker senden, mit Fan-Level-Skalierung
- **Upload-Validierung**: SVG-Sanitization, MIME-Type-Checks, Per-User-Limits
- **Overlay-Steuerung**: Pause/Resume/Clear, Theme, Opacity, Speed, Bounding Box
- **Bulk User Mappings**: Import/Export von Benutzer-Emoji-Zuordnungen
- **Flow Actions**: 4 neue Flow-Aktionen (Trigger, Preset, Burst, Clear)

### Integration
- **TikTok Events**: Gift, Like, Follow, Share, Subscribe, Sticker mit Skalierung
- **Flow System**: Automation mit erweiterten Aktionen
- **OBS**: Separate High-Quality OBS HUD Overlay (1920x1080)
- **Localization**: Deutsch und Englisch

## 🎭 Sticker Rain Feature

### Übersicht
Wenn ein Nutzer einen Sticker im TikTok-Stream sendet, wird automatisch ein Sticker-Regen ausgelöst. Die Anzahl der Sticker und das Verhalten hängen vom Fan-Level des Nutzers ab:

- **Normale Nutzer**: Sticker-Regen mit konfigurierbarer Basis-Anzahl
- **Team-Mitglieder**: Mehr Sticker basierend auf Fan-Level (Level 1, 2, 3, etc.)
- **SuperFans (Level ≥ 1)**: Statt Regen wird ein spektakulärer Sticker-Burst ausgelöst

### Fan-Level Skalierung
```
Anzahl = Basis-Anzahl + (Fan Level × Multiplikator)
Anzahl = min(Anzahl, Max-Anzahl)

Intensität = 1.0 + (Fan Level × 0.3)
```

**Beispiel**:
- Basis: 5 Sticker
- Fan Level: 2
- Multiplikator: 3
- Max: 30

```
Anzahl = 5 + (2 × 3) = 11 Sticker
Intensität = 1.0 + (2 × 0.3) = 1.6x
```

### Cooldown-System
Separate Cooldowns für verschiedene Nutzergruppen:

| Nutzertyp | Standard Cooldown | Konfigurierbar |
|-----------|-------------------|----------------|
| Normale Nutzer | 10 Sekunden | ✅ `sticker_user_cooldown_ms` |
| SuperFans | 5 Sekunden | ✅ `sticker_superfan_cooldown_ms` |

### SuperFan Burst-Modus
Wenn ein SuperFan (Fan Level ≥ 1) einen Sticker sendet:
- Automatischer Burst-Effekt statt normalen Regen
- Höhere Intensität basierend auf Fan-Level
- Alle Sticker erscheinen gleichzeitig für maximale Wirkung
- Kann in der Konfiguration deaktiviert werden

### Konfiguration
In der Admin-UI unter "🎭 Sticker Regen Konfiguration":

| Option | Beschreibung | Standard |
|--------|--------------|----------|
| `sticker_enabled` | Sticker-Regen aktivieren/deaktivieren | ✅ Aktiviert |
| `sticker_base_count` | Basis-Anzahl von Stickern | 5 |
| `sticker_fan_level_multiplier` | Multiplikator pro Fan-Level | 3 |
| `sticker_max_count` | Maximale Anzahl von Stickern | 30 |
| `sticker_user_cooldown_ms` | Cooldown für normale Nutzer (ms) | 10000 |
| `sticker_superfan_cooldown_ms` | Cooldown für SuperFans (ms) | 5000 |
| `sticker_superfan_burst_enabled` | SuperFan Burst aktivieren | ✅ Aktiviert |

### Technische Details
- Sticker werden über das TikTok `emote` Event (WebcastEmoteChatMessage) empfangen
- Sticker-URL wird aus `emoteImageUrl` extrahiert
- Cooldowns werden pro Nutzer getrackt mit Präfix `sticker:${username}`
- Fan-Level wird aus `teamMemberLevel` in den Event-Daten ermittelt
- Kompatibel mit allen bestehenden Overlay-Features (Themes, Opacity, Speed, etc.)

## 🎮 GCCE Chat Commands

### Verfügbare Befehle

#### `/rain [preset]`
**Permission**: all  
**Cooldown**: 10s per user, 2s global  
**Beschreibung**: Löst Emoji-Regen aus. Optional kann ein Preset angegeben werden.

**Beispiele**:
```
/rain                    → Sanfter Regen mit zufälligen Emojis
/rain gentle-rain        → Preset "Gentle Rain"
/rain heavy-storm        → Preset "Heavy Storm"
```

#### `/emoji <emoji> [count] [intensity]`
**Permission**: all  
**Cooldown**: 10s per user, 2s global  
**Beschreibung**: Spawnt spezifisches Emoji mit optionaler Anzahl und Intensität.

**Beispiele**:
```
/emoji 💙                → 10x 💙 mit Standard-Intensität
/emoji ⭐ 25             → 25x ⭐
/emoji 🎉 30 1.5         → 30x 🎉 mit 1.5x Intensität
```

#### `/beans`
**Permission**: subscriber  
**Cooldown**: 30s per user, 5s global  
**Beschreibung**: SuperFan-Burst-Effekt mit 30 Sternen.

**Beispiel**:
```
/beans → ⭐⭐⭐ SuperFan Burst!
```

#### `/storm [emoji]`
**Permission**: vip  
**Cooldown**: 60s per user, 10s global  
**Beschreibung**: Schwerer Emoji-Sturm über 5 Sekunden.

**Beispiele**:
```
/storm       → Blitz-Sturm ⚡
/storm 🌈    → Regenbogen-Sturm
```

#### `/rainstop`
**Permission**: moderator  
**Cooldown**: 5s per user, 1s global  
**Beschreibung**: Stoppt allen aktiven Emoji-Regen sofort.

**Beispiel**:
```
/rainstop → Alle Effekte gestoppt
```

## 📋 Preset-System

### Standard-Presets

| ID | Name | Emoji | Count | Intensity | Duration | Burst |
|----|------|-------|-------|-----------|----------|-------|
| `gentle-rain` | Gentle Rain | 💙 | 10 | 1.0 | 2000ms | No |
| `heavy-storm` | Heavy Storm | ⚡ | 50 | 2.0 | 5000ms | No |
| `superfan-burst` | SuperFan Burst | ⭐ | 30 | 1.5 | 0ms | Yes |
| `celebration` | Celebration | 🎉 | 25 | 1.2 | 3000ms | No |

### API: Preset Management

#### GET `/api/webgpu-emoji-rain/presets`
Alle Presets abrufen.

#### GET `/api/webgpu-emoji-rain/presets/:id`
Spezifisches Preset abrufen.

#### POST `/api/webgpu-emoji-rain/presets`
Neues Preset erstellen.

**Body**:
```json
{
  "name": "My Custom Preset",
  "emoji": "🌟",
  "count": 15,
  "intensity": 1.3,
  "duration": 3000,
  "burst": false,
  "spawnArea": { "x": 0.5, "y": 0 }
}
```

#### PUT `/api/webgpu-emoji-rain/presets/:id`
Preset aktualisieren.

#### DELETE `/api/webgpu-emoji-rain/presets/:id`
Preset löschen.

#### POST `/api/webgpu-emoji-rain/presets/:id/trigger`
Preset auslösen.

## 🎛️ Overlay-Steuerung

### API-Endpunkte

#### POST `/api/webgpu-emoji-rain/overlay/pause`
Overlay pausieren (Spawns werden in Queue gesammelt).

#### POST `/api/webgpu-emoji-rain/overlay/resume`
Overlay fortsetzen (Queue wird abgearbeitet).

#### POST `/api/webgpu-emoji-rain/overlay/clear`
Alle Emojis sofort entfernen.

#### POST `/api/webgpu-emoji-rain/overlay/theme`
**Body**: `{ "theme": "dark" }`  
Themes: `default`, `light`, `dark`, `neon`, `custom`

#### POST `/api/webgpu-emoji-rain/overlay/opacity`
**Body**: `{ "opacity": 0.8 }`  
Range: 0.0 - 1.0

#### POST `/api/webgpu-emoji-rain/overlay/speed`
**Body**: `{ "speed": 1.5 }`  
Range: 0.1 - 5.0

#### POST `/api/webgpu-emoji-rain/overlay/bounding-box`
**Body**:
```json
{
  "x": 0.1,
  "y": 0.1,
  "width": 0.8,
  "height": 0.8
}
```

#### GET `/api/webgpu-emoji-rain/overlay/state`
Aktuellen Overlay-Status abrufen.

### Socket.io Events

#### Empfangen (Server → Client)
```javascript
// Emoji spawnen
socket.on('webgpu-emoji-rain:spawn', (data) => {
  // data: { count, emoji, x, y, username, reason, burst, intensity }
});

// Overlay pausieren
socket.on('webgpu-emoji-rain:pause', (data) => {
  // data: { paused: true }
});

// Overlay fortsetzen
socket.on('webgpu-emoji-rain:resume', (data) => {
  // data: { paused: false }
});

// Alle Emojis entfernen
socket.on('webgpu-emoji-rain:clear', () => {
  // Clear all particles
});

// Theme ändern
socket.on('webgpu-emoji-rain:theme', (data) => {
  // data: { theme: 'dark' }
});

// Opacity ändern
socket.on('webgpu-emoji-rain:opacity', (data) => {
  // data: { opacity: 0.8 }
});

// Speed ändern
socket.on('webgpu-emoji-rain:speed', (data) => {
  // data: { speed: 1.5 }
});

// Bounding Box ändern
socket.on('webgpu-emoji-rain:bounding-box', (data) => {
  // data: { boundingBox: { x, y, width, height } }
});

// Config Update
socket.on('webgpu-emoji-rain:config-update', (data) => {
  // data: { config, enabled }
});

// User Mappings Update
socket.on('webgpu-emoji-rain:user-mappings-update', (data) => {
  // data: { mappings }
});
```

## 📤 Upload-Handling

### File Upload

**Endpoint**: `POST /api/webgpu-emoji-rain/upload`  
**Content-Type**: `multipart/form-data`  
**Field**: `image`

**Limits**:
- Max. 5MB pro Datei
- Max. 10 Uploads pro Benutzer
- Erlaubte Typen: PNG, JPG, JPEG, GIF, WebP, SVG

**Validierung**:
- MIME-Type-Check
- Dateiendungs-Check
- SVG-Sanitization (Script-Tags und Event-Handler werden entfernt)

**Response**:
```json
{
  "success": true,
  "url": "/webgpu-emoji-rain/uploads/emoji-1234567890-abc123.png",
  "filename": "emoji-1234567890-abc123.png",
  "size": 12345,
  "uploads": {
    "current": 3,
    "max": 10
  }
}
```

### File Listing

**Endpoint**: `GET /api/webgpu-emoji-rain/images`

**Response**:
```json
{
  "success": true,
  "images": [
    {
      "filename": "emoji-1234567890-abc123.png",
      "url": "/webgpu-emoji-rain/uploads/emoji-1234567890-abc123.png",
      "size": 12345,
      "created": "2026-01-06T00:00:00.000Z",
      "modified": "2026-01-06T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

### File Delete

**Endpoint**: `DELETE /api/webgpu-emoji-rain/images/:filename`

## 👥 User Mappings

### Get Mappings

**Endpoint**: `GET /api/webgpu-emoji-rain/user-mappings`

**Response**:
```json
{
  "success": true,
  "mappings": {
    "user1": "💙",
    "user2": "⭐"
  },
  "stats": {
    "totalMappings": 2,
    "uniqueEmojis": 2
  }
}
```

### Update Mappings

**Endpoint**: `POST /api/webgpu-emoji-rain/user-mappings`

**Body**:
```json
{
  "mappings": {
    "user1": "💙",
    "user2": "⭐"
  }
}
```

### Bulk Export

**Endpoint**: `GET /api/webgpu-emoji-rain/user-mappings/export`

Downloads JSON file with all mappings.

### Bulk Import

**Endpoint**: `POST /api/webgpu-emoji-rain/user-mappings/import`

**Body**:
```json
{
  "mappings": {
    "user1": "💙",
    "user2": "⭐"
  },
  "merge": true
}
```

Set `merge: true` to merge with existing mappings, `false` to replace all.

### Delete Mapping

**Endpoint**: `DELETE /api/webgpu-emoji-rain/user-mappings/:username`

## ⚡ Flow Actions

### 1. `webgpu_emoji_rain_trigger`
**Name**: Trigger WebGPU Emoji Rain  
**Kategorie**: effects  
**Icon**: 🌧️

**Parameter**:
- `emoji` (text): Emoji oder Text
- `count` (number, 1-100): Anzahl der Emojis
- `duration` (number, 0-10000): Dauer in ms
- `intensity` (number, 0.1-5.0): Intensitäts-Multiplikator
- `burst` (boolean): Burst-Modus aktivieren

### 2. `webgpu_emoji_rain_preset`
**Name**: Trigger WebGPU Emoji Rain Preset  
**Kategorie**: effects  
**Icon**: 📋

**Parameter**:
- `presetId` (text): ID des Presets (z.B. "gentle-rain")

### 3. `webgpu_emoji_rain_burst`
**Name**: WebGPU Emoji Rain Burst  
**Kategorie**: effects  
**Icon**: 💥

**Parameter**:
- `emoji` (text): Emoji für Burst
- `count` (number, 5-100): Anzahl der Emojis

### 4. `webgpu_emoji_rain_clear`
**Name**: Clear WebGPU Emoji Rain  
**Kategorie**: effects  
**Icon**: 🧹

**Parameter**: keine

## 📊 Telemetrie & Debug

### Get Metrics

**Endpoint**: `GET /api/webgpu-emoji-rain/metrics`

**Response**:
```json
{
  "success": true,
  "metrics": {
    "totalTriggers": 123,
    "commandTriggers": 45,
    "eventTriggers": 67,
    "flowTriggers": 11,
    "droppedEvents": 2,
    "totalEmojisSpawned": 2456,
    "avgCount": 19.97,
    "avgIntensity": 1.23,
    "lastError": null,
    "lastErrorTime": null
  },
  "overlay": {
    "state": {
      "paused": false,
      "theme": "default",
      "opacity": 1.0,
      "speed": 1.0
    },
    "queuedSpawns": 0
  },
  "antiSpam": {
    "globalTriggerCount": 5,
    "maxTriggers": 50,
    "activeCooldowns": 3
  }
}
```

### Reset Metrics

**Endpoint**: `POST /api/webgpu-emoji-rain/metrics/reset`

### Toggle Debug Mode

**Endpoint**: `POST /api/webgpu-emoji-rain/debug`

**Body**:
```json
{
  "enabled": true
}
```

Im Debug-Modus werden detaillierte Logs geschrieben (rate-limited auf 100 logs/minute).

## 🛡️ Anti-Spam & Sicherheit

### Globale Limits
- **Max Triggers**: 50 pro 30 Sekunden (global)
- **Global Cooldown**: 1 Sekunde zwischen allen Triggers
- **User Cooldown**: 5 Sekunden pro Benutzer (Standard)

### Command-spezifische Cooldowns
- `/rain`: 10s user, 2s global
- `/emoji`: 10s user, 2s global
- `/beans`: 30s user, 5s global (subscriber only)
- `/storm`: 60s user, 10s global (VIP only)
- `/rainstop`: 5s user, 1s global (moderator only)

### Upload-Limits
- Max. 10 Uploads pro Benutzer
- Max. 5MB pro Datei
- SVG-Sanitization (Scripts und Event-Handler werden entfernt)
- MIME-Type und Dateiendungs-Validierung

### Config-Limits
- `max_count_per_event`: Max. Anzahl Emojis pro Event (default: 100)
- `max_intensity`: Max. Intensität (default: 3.0)
- `emoji_blocklist`: Array von blockierten Emojis

## 🎨 SuperFan/Coins-Skalierung

### Gift-Events
```
Anzahl = gift_base_emojis + (coins × gift_coin_multiplier)
Anzahl = min(Anzahl, max_count_per_event)

Bei SuperFan:
Anzahl = Anzahl × superfan_intensity_multiplier
Intensität = 1.0 + (superFanLevel × 0.3)
```

**Beispiel**:
- Gift: 100 Coins
- Base: 5 Emojis
- Multiplier: 0.5
- SuperFan Level: 2
- SuperFan Multiplier: 1.5

```
Anzahl = 5 + (100 × 0.5) = 55
Mit SuperFan: 55 × 1.5 = 82.5 → 82
Intensität: 1.0 + (2 × 0.3) = 1.6
```

## 🚀 Performance

### Spawn Batching
- Spawns werden in 50ms-Batches verarbeitet
- Max. 10 Spawns pro Batch
- Reduziert Socket.io-Overhead

### Overlay-Optimierungen
- WebGPU Instanced Rendering
- Toaster Mode für schwache PCs
- Konfigurierbares FPS-Limit
- Max. Partikel-Limit

## 📝 Overlay-URLs

### Standard Overlay (Responsiv)
```
http://localhost:3000/webgpu-emoji-rain/overlay
```

### OBS HUD (1920x1080 Fixed)
```
http://localhost:3000/webgpu-emoji-rain/obs-hud
```

### Admin UI
```
http://localhost:3000/webgpu-emoji-rain/ui
```

## 🔧 Konfiguration

Alle Konfigurationen werden in der Datenbank gespeichert (Tabelle: `emoji_rain_config`).

**Wichtige Config-Felder**:
- `enabled`: Plugin aktiviert/deaktiviert
- `emoji_set`: Array von Standard-Emojis
- `gift_base_emojis`: Basis-Anzahl für Gifts
- `gift_coin_multiplier`: Multiplikator für Gift-Coins
- `gift_max_emojis`: Max. Emojis für Gifts
- `like_count_divisor`: Divisor für Like-Count
- `like_min_emojis`: Min. Emojis für Likes
- `like_max_emojis`: Max. Emojis für Likes
- `superfan_burst_enabled`: SuperFan-Burst aktivieren
- `superfan_intensity_multiplier`: SuperFan-Intensitäts-Multiplikator
- `max_count_per_event`: Globales Max. für alle Events
- `max_intensity`: Globales Intensitäts-Max.
- `emoji_blocklist`: Array von blockierten Emojis

## 📦 Persistent Storage

Alle Daten werden im User-Profil-Verzeichnis gespeichert und überleben Updates:

```
<UserProfile>/LTTH/plugins/webgpu-emoji-rain/
├── uploads/                # Hochgeladene Bilder
├── users.json              # User-Emoji-Mappings
└── presets.json            # Gespeicherte Presets
```

Zusätzlich in user_configs (manuell editierbar):
```
<UserProfile>/LTTH/user_configs/webgpu-emoji-rain/
└── users.json              # User-Emoji-Mappings (Backup)
```

## 🐛 Troubleshooting

### Plugin startet nicht
- Prüfe Log-Datei: `[WebGPU Emoji Rain]` Tags
- Stelle sicher, dass Port 3000 erreichbar ist
- Prüfe, ob GCCE-Plugin geladen ist

### Commands funktionieren nicht
- Prüfe, ob GCCE-Plugin aktiviert ist
- Prüfe Cooldowns in den Logs
- Verifiziere Permissions des Users

### Upload schlägt fehl
- Prüfe Dateigröße (max 5MB)
- Prüfe Dateityp (PNG/JPG/GIF/WebP/SVG)
- Prüfe Upload-Limit (10 pro User)

### Overlay zeigt keine Emojis
- Prüfe, ob Plugin enabled ist
- Prüfe Browser-Console auf WebGPU-Errors
- Teste mit `/rainstop` und `/rain`

## 📄 Lizenz

CC-BY-NC-4.0 - Siehe Haupt-Repository-Lizenz
