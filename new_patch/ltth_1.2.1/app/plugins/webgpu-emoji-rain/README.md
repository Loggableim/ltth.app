# WebGPU Emoji Rain Plugin

GPU-beschleunigter Emoji-Partikel-Effekt für LTTH unter Verwendung der WebGPU-Engine mit instanziertem Rendering.

Dies ist ein 1:1 funktionaler Port des originalen Emoji Rain Plugins, der WebGPU für deutlich bessere Performance nutzt.

## Features

- **GPU-beschleunigtes Rendering**: WebGPU mit instanziertem Rendering statt Canvas/Matter.js
- **Alle Original-Features**: Vollständig kompatibel mit dem originalen Emoji Rain Plugin
- **Custom Emoji Sets**: Konfigurierbare Emoji-Arrays aus der Datenbank
- **Benutzer-spezifische Mappings**: Individuelle Emojis pro TikTok-Benutzer
- **Custom Image Upload**: PNG/JPG/GIF/WebP/SVG Unterstützung
- **TikTok-Integration**: Gift, Like, Follow, Share, Subscribe Events
- **SuperFan Burst**: Spezial-Effekte für SuperFan-Abonnenten
- **Flow System**: Integriert mit dem Automation Flow System
- **OBS-kompatibel**: Separate High-Quality OBS HUD Overlay
- **Persistent Storage**: Uploads und User-Mappings überleben Updates
- **Lokalisierung**: Deutsch und Englisch

## Overlay-URLs

### Standard Overlay (Responsiv)
```
http://localhost:3000/webgpu-emoji-rain/overlay
```

### OBS HUD (1920x1080 Fixed)
```
http://localhost:3000/webgpu-emoji-rain/obs-hud
```

## API-Endpunkte

### Status abfragen
```
GET /api/webgpu-emoji-rain/status
```

### Konfiguration
```
GET /api/webgpu-emoji-rain/config
POST /api/webgpu-emoji-rain/config
Body: { "config": {...}, "enabled": true/false }
```

### Toggle
```
POST /api/webgpu-emoji-rain/toggle
Body: { "enabled": true/false }
```

### Test-Spawn
```
POST /api/webgpu-emoji-rain/test
Body: { "count": 20, "emoji": "💙", "x": 0.5, "y": 0.0 }
```

### Trigger (für Flows)
```
POST /api/webgpu-emoji-rain/trigger
Body: { 
  "emoji": "💙",
  "count": 20,
  "duration": 2000,
  "intensity": 1.5,
  "burst": false
}
```

### File Upload
```
POST /api/webgpu-emoji-rain/upload
Content-Type: multipart/form-data
Field: image (PNG/JPG/GIF/WebP/SVG, max 5MB)
```

### User Mappings
```
GET /api/webgpu-emoji-rain/user-mappings
POST /api/webgpu-emoji-rain/user-mappings
Body: { "mappings": { "username": "💙", ... } }
```

## Socket.io Events

### Partikel spawnen
```javascript
socket.emit('webgpu-emoji-rain:spawn', {
  count: 20,
  emoji: '💙',
  x: 0.5,      // 0-1, horizontal
  y: 0.0,      // 0-1, vertikal (0 = oben)
  username: 'TestUser',
  reason: 'gift',
  burst: false
});
```

### Konfiguration ändern
```javascript
socket.emit('webgpu-emoji-rain:config-update', {
  config: {
    particleScale: 0.08,
    gravity: 0.5,
    lifespan: 5.0
  }
});
```

### Toggle
```javascript
socket.emit('webgpu-emoji-rain:toggle', {
  enabled: true
});
```

## Event-Kalkulation

Das Plugin verwendet dieselben Kalkulationsformeln wie das Original:

### Gifts
```
count = gift_base_emojis + (coins * gift_coin_multiplier)
count = min(count, gift_max_emojis)
```

### Likes
```
count = likeCount / like_count_divisor
count = max(like_min_emojis, min(count, like_max_emojis))
```

### Follow/Share/Subscribe
```
count = 5-8 Emojis (konfigurierbar)
```

## Technische Details

### WebGPU Rendering

Der Vertex-Shader verwendet instanziertes Rendering:
- Jede Partikel-Instanz liest ihre Daten aus einem Storage Buffer
- Quad-Vertices werden prozedural generiert (6 Vertices pro Partikel)
- Rotation und Skalierung werden per Instanz angewendet

### Performance-Vergleich

| Feature | Original (Canvas) | WebGPU |
|---------|------------------|--------|
| Max Partikel | 200 | 1000 |
| Draw Calls | ~200 | 1 |
| CPU Last | Hoch | Niedrig |
| FPS (volle Last) | 30-45 | 60 |
| Freeze Protection | ✅ | ✅ |

### Automatic Freeze Recovery

Beide Plugin-Versionen (Original und WebGPU) enthalten einen Schutzmechanismus gegen komplette Abstürze:

- **FPS-Überwachung**: Kontinuierliche Performance-Überwachung
- **Freeze-Erkennung**: Erkennt, wenn FPS auf 0 fällt (kompletter Freeze)
- **Auto-Wiederherstellung**: Nach 3 aufeinanderfolgenden Sekunden bei 0 FPS:
  1. Fehler wird in Konsole geloggt
  2. Visuelle Warnung wird angezeigt
  3. Overlay lädt sich nach 2 Sekunden automatisch neu
- **Intelligente Wiederherstellung**: Wenn FPS sich vor dem Reload erholt, wird der Failsafe zurückgesetzt und der Normalbetrieb fortgesetzt

Dies stellt sicher, dass das Overlay auch bei extremem Gift-Spam automatisch wiederhergestellt wird, ohne dass ein vollständiger System-Neustart erforderlich ist.

### Partikel-Daten

```
Particle Buffer Layout (32 bytes/8 floats):
- position: vec2<f32>    (x, y)
- velocity: vec2<f32>    (vx, vy)
- rotation: f32
- scale: f32
- alpha: f32
- _padding: f32
```

## Migration vom Original

Das Plugin migriert automatisch:
1. Uploads aus dem emoji-rain Plugin
2. User-Mappings aus verschiedenen Quellen
3. Datenbank-Konfiguration (shared mit Original)

Die Konfiguration wird in der `emoji_rain_config` Tabelle gespeichert und ist mit dem originalen Plugin kompatibel.

## Systemanforderungen

- **Browser**: Chrome 113+ / Edge 113+ / Electron 25+
- **GPU**: WebGPU-Unterstützung erforderlich
- **OS**: Windows 10/11, macOS 12+, oder Linux mit Vulkan
- **OBS**: Für OBS Browser Source mindestens OBS 29+

## Unterschiede zum Original

### Vorteile
- 5x mehr Partikel möglich
- Niedrigere CPU-Last
- Höhere FPS
- Moderne GPU-Pipeline

### Einschränkungen
- Benötigt WebGPU-Support im Browser
- Keine Matter.js Physik-Engine (vereinfachte Physik)
- Rendering nur client-side (keine Server-side Simulation)

## Flow System Integration

Das Plugin registriert die Action "Trigger WebGPU Emoji Rain" für das Flow System mit folgenden Parametern:

- Emoji/Text (optional)
- Anzahl (1-100)
- Dauer (0-10000ms)
- Intensität (0.1-5.0)
- Burst Mode (boolean)

## Lizenz

CC-BY-NC-4.0

