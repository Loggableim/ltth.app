# EmojiRain 2.1 - kompatible Edition

Physikbasierter Emoji-Partikel-Effekt mit Matter.js und DOM-Sprites, vollständig integriert mit der Global Chat Command Engine (GCCE).

## ✨ Features

### Core Features
- **Breite Kompatibilität**: Matter.js-Physik ohne WebGPU-Voraussetzung
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
**Beschreibung**: SuperFan-Burst-Effekt mit 30 Pfötchen.

**Beispiel**:
```
/beans → 🐾🐾🐾 SuperFan Pfötchen-Burst!
```

#### `/miau`, `/rawr`, `/woof`, `/wuff`
**Permission**: all<br>
**Cooldown**: 60s per user, 15s global<br>
**Beschreibung**: Lösen jeweils einen 30er-Burst aus: 🐱, 🦖 beziehungsweise 🐶.

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

#### GET `/api/emoji-rain/presets`
Alle Presets abrufen.

#### GET `/api/emoji-rain/presets/:id`
Spezifisches Preset abrufen.

#### POST `/api/emoji-rain/presets`
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

#### PUT `/api/emoji-rain/presets/:id`
Preset aktualisieren.

#### DELETE `/api/emoji-rain/presets/:id`
Preset löschen.

#### POST `/api/emoji-rain/presets/:id/trigger`
Preset auslösen.

## 🎛️ Overlay-Steuerung

### API-Endpunkte

#### POST `/api/emoji-rain/overlay/pause`
Overlay pausieren (Spawns werden in Queue gesammelt).

#### POST `/api/emoji-rain/overlay/resume`
Overlay fortsetzen (Queue wird abgearbeitet).

#### POST `/api/emoji-rain/overlay/clear`
Alle Emojis sofort entfernen.

#### POST `/api/emoji-rain/overlay/theme`
**Body**: `{ "theme": "dark" }`  
Themes: `default`, `light`, `dark`, `neon`, `custom`

#### POST `/api/emoji-rain/overlay/opacity`
**Body**: `{ "opacity": 0.8 }`  
Range: 0.0 - 1.0

#### POST `/api/emoji-rain/overlay/speed`
**Body**: `{ "speed": 1.5 }`  
Range: 0.1 - 5.0

#### POST `/api/emoji-rain/overlay/bounding-box`
**Body**:
```json
{
  "x": 0.1,
  "y": 0.1,
  "width": 0.8,
  "height": 0.8
}
```

#### GET `/api/emoji-rain/overlay/state`
Aktuellen Overlay-Status abrufen.

### Socket.io Events

#### Empfangen (Server → Client)
```javascript
// Emoji spawnen
socket.on('emoji-rain:spawn', (data) => {
  // data: { count, emoji, x, y, username, reason, burst, intensity }
});

// Overlay pausieren
socket.on('emoji-rain:pause', (data) => {
  // data: { paused: true }
});

// Overlay fortsetzen
socket.on('emoji-rain:resume', (data) => {
  // data: { paused: false }
});

// Alle Emojis entfernen
socket.on('emoji-rain:clear', () => {
  // Clear all particles
});

// Theme ändern
socket.on('emoji-rain:theme', (data) => {
  // data: { theme: 'dark' }
});

// Opacity ändern
socket.on('emoji-rain:opacity', (data) => {
  // data: { opacity: 0.8 }
});

// Speed ändern
socket.on('emoji-rain:speed', (data) => {
  // data: { speed: 1.5 }
});

// Bounding Box ändern
socket.on('emoji-rain:bounding-box', (data) => {
  // data: { boundingBox: { x, y, width, height } }
});

// Config Update
socket.on('emoji-rain:config-update', (data) => {
  // data: { config, enabled }
});

// User Mappings Update
socket.on('emoji-rain:user-mappings-update', (data) => {
  // data: { mappings }
});
```

## 📤 Upload-Handling

### File Upload

**Endpoint**: `POST /api/emoji-rain/upload`  
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
  "url": "/emoji-rain/uploads/emoji-1234567890-abc123.png",
  "filename": "emoji-1234567890-abc123.png",
  "size": 12345,
  "uploads": {
    "current": 3,
    "max": 10
  }
}
```

### File Listing

**Endpoint**: `GET /api/emoji-rain/images`

**Response**:
```json
{
  "success": true,
  "images": [
    {
      "filename": "emoji-1234567890-abc123.png",
      "url": "/emoji-rain/uploads/emoji-1234567890-abc123.png",
      "size": 12345,
      "created": "2026-01-06T00:00:00.000Z",
      "modified": "2026-01-06T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

### File Delete

**Endpoint**: `DELETE /api/emoji-rain/images/:filename`

## 👥 User Mappings

### Get Mappings

**Endpoint**: `GET /api/emoji-rain/user-mappings`

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

**Endpoint**: `POST /api/emoji-rain/user-mappings`

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

**Endpoint**: `GET /api/emoji-rain/user-mappings/export`

Downloads JSON file with all mappings.

### Bulk Import

**Endpoint**: `POST /api/emoji-rain/user-mappings/import`

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

**Endpoint**: `DELETE /api/emoji-rain/user-mappings/:username`

## ⚡ Flow Actions

### 1. `emoji_rain_trigger`
**Name**: Trigger Emoji Rain
**Kategorie**: effects
**Icon**: 🌧️

**Parameter**:
- `emoji` (text): Emoji oder Text
- `count` (number, 1-100): Anzahl der Emojis
- `duration` (number, 0-10000): Dauer in ms
- `intensity` (number, 0.1-5.0): Intensitäts-Multiplikator
- `burst` (boolean): Burst-Modus aktivieren

### 2. `emoji_rain_preset`
**Name**: Trigger Emoji Rain Preset
**Kategorie**: effects
**Icon**: 📋

**Parameter**:
- `presetId` (text): ID des Presets (z.B. "gentle-rain")

### 3. `emoji_rain_burst`
**Name**: Emoji Rain Burst
**Kategorie**: effects
**Icon**: 💥

**Parameter**:
- `emoji` (text): Emoji für Burst
- `count` (number, 5-100): Anzahl der Emojis

### 4. `emoji_rain_clear`
**Name**: Clear Emoji Rain
**Kategorie**: effects
**Icon**: 🧹

**Parameter**: keine

## 📊 Telemetrie & Debug

### Get Metrics

**Endpoint**: `GET /api/emoji-rain/metrics`

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

**Endpoint**: `POST /api/emoji-rain/metrics/reset`

### Toggle Debug Mode

**Endpoint**: `POST /api/emoji-rain/debug`

**Body**:
```json
{
  "enabled": true
}
```

Im Debug-Modus werden detaillierte Logs geschrieben (rate-limited auf 100 logs/minute).

## 🎁 Geschenk-Kugeln (Gift Ball System)

### Übersicht
Wenn ein Zuschauer ein Geschenk schickt, fällt zusätzlich zum Emoji-Regen eine
bounceende Kugel mit dem **Bild des Geschenks aus dem Geschenkekatalog** vom
oberen Rand herunter. Größe, Anzahl und Sichtbarkeitsdauer hängen vom
Geschenkpreis und der Konfiguration ab.

### Aktivierung
Unter **Admin UI → 🎁 Geschenk-Kugeln → Geschenke als bounceende Kugeln anzeigen**
den Haken setzen. Das Plugin verwendet dann automatisch das `image_url` aus dem
Geschenkekatalog-Datensatz — wenn das Event keinen Bild-URL liefert, wird aus
dem Katalog nachgeladen.

### Standard-Skalierung (logarithmisch)
```
Größe = gift_ball_min_size_px + (gift_ball_max_size_px − min) × log10(price+1) / log10(reference+1)
Größe = Größe × (1 + log10(seriesCount) × 0.12)   // gecappt auf ×1.35
```

### Preis-Stufen-System (Tier-basiert) — NEU
Statt der logarithmischen Standard-Skalierung kann ein **6-stufiges Tier-System**
aktiviert werden. Jede Stufe hat einen eigenen Preis-Bereich und eine eigene
Pixel-Größe — teurere Geschenke werden automatisch riesig dargestellt.

**Schwellen** (in Coins, inklusive Obergrenze):

| Stufe | Preis-Bereich | Default-Größe | Beispiel-Geschenke |
|-------|---------------|---------------|---------------------|
| 1     | 1 – 30        | 44 px         | Rosen, kleine Herzen |
| 2     | 31 – 100      | 80 px         | Standard-Gifts |
| 3     | 101 – 500     | 150 px        | Mid-Tier Gifts |
| 4     | 501 – 1000    | 300 px        | Premium Gifts |
| 5     | 1001 – 5000   | 700 px        | Whale-Gifts |
| 6     | > 5000        | 5000 px       | Mythische Top-Gifts |

Die Stufen werden in der UI unter **Preis-Stufen aktivieren** freigeschaltet.
Alle Pixel-Werte (12-5000) sind frei konfigurierbar, jede Stufe kann in der
Admin-UI einzeln eingestellt werden.

**Verhalten bei aktiven Tiers:**
- Die Größe wird direkt aus der passenden Stufe übernommen (kein Clamp auf
  `gift_ball_max_size_px` mehr).
- Series-Skalierung (`× log10(seriesCount)` bis max 1.35) wird weiterhin
  angewendet, damit Combo-Gifts (z.B. „100x Rose") etwas größer werden.
- Despawn-Dauer und Anzahl-Drops bleiben von der Stufenwahl unberührt.

**Beispiel-Spawn** für ein Universe-Geschenk (9999 Coins):
```
Stufe: 6 (>5000 Coins)
Größe: 5000px  →  füllt den kompletten Overlay-Bereich
Anzahl: 1 Ball
Despawn: max. 20 Sekunden
```

### Konfigurations-Felder

| Feld | Beschreibung | Default |
|------|--------------|---------|
| `gift_balls_enabled` | Gift-Balls aktivieren | `false` |
| `gift_ball_min_size_px` | Min. Größe (Standard-Skalierung) | `44` |
| `gift_ball_max_size_px` | Max. Größe (Standard-Skalierung) | `128` |
| `gift_ball_price_reference_coins` | Preisreferenz für log-Skalierung | `1000` |
| `gift_ball_tier_thresholds_enabled` | **NEU**: Tier-System aktivieren | `false` |
| `gift_ball_tier_size_1` | **NEU**: Stufe 1 Größe (px) | `44` |
| `gift_ball_tier_size_2` | **NEU**: Stufe 2 Größe (px) | `80` |
| `gift_ball_tier_size_3` | **NEU**: Stufe 3 Größe (px) | `150` |
| `gift_ball_tier_size_4` | **NEU**: Stufe 4 Größe (px) | `300` |
| `gift_ball_tier_size_5` | **NEU**: Stufe 5 Größe (px) | `700` |
| `gift_ball_tier_size_6` | **NEU**: Stufe 6 Größe (px) | `5000` |

### Cooldown-Hinweis
Gift-Balls teilen sich die globalen Anti-Spam-Limits (siehe unten) mit den
normalen Emoji-Regen-Triggern. Für teure Stufe-5/6-Geschenke empfiehlt sich
ein hoher `gift_ball_despawn_multiplier`, damit die Kugel lange genug sichtbar
bleibt, um vom Publikum wahrgenommen zu werden.

## 🛡️ Anti-Spam & Sicherheit

### Globale Limits
- **Max Triggers**: 50 pro 30 Sekunden (global)
- **Global Cooldown**: 1 Sekunde zwischen allen Triggers
- **User Cooldown**: 5 Sekunden pro Benutzer (Standard)

### Command-spezifische Cooldowns
- `/rain`: 10s user, 2s global
- `/emoji`: 10s user, 2s global
- `/beans`: 30s user, 5s global (subscriber only)
- `/miau`, `/rawr`, `/woof`, `/wuff`: 60s user, 15s global
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
http://localhost:3000/emoji-rain/overlay
```

### OBS HUD (1920x1080 Fixed)
```
http://localhost:3000/emoji-rain/obs-hud
```

### Admin UI
```
http://localhost:3000/emoji-rain/ui
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
<UserProfile>/LTTH/plugins/emoji-rain/
├── uploads/                # Hochgeladene Bilder
├── users.json              # User-Emoji-Mappings
└── presets.json            # Gespeicherte Presets
```

Zusätzlich in user_configs (manuell editierbar):
```
<UserProfile>/LTTH/user_configs/emoji-rain/
└── users.json              # User-Emoji-Mappings (Backup)
```

## 🐛 Troubleshooting

### Plugin startet nicht
- Prüfe Log-Datei: `[Emoji Rain]` Tags
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
