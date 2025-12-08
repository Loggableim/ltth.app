# Emoji Rain HUD Feature

## Übersicht

Das **Emoji Rain HUD** ist ein physik-basiertes Emoji-Animations-System, das auf TikTok-Stream-Events reagiert und Emojis mit realistischer Physik (Gravitation, Wind, Bouncing) auf dem Overlay anzeigt.

## Features

- 🎨 **Physik-Engine**: Realistische Emoji-Physik mit Matter.js
- 🌧️ **Event-basiert**: Automatisches Spawning bei Likes, Gifts, Follows, Subscribes, Shares
- ⚙️ **Vollständig konfigurierbar**: 44+ Konfigurationsparameter
- 🎯 **Smart Scaling**: Anzahl der Emojis skaliert mit Gift-Wert und Like-Count
- 🎭 **Transparent**: Perfekt für OBS Browser Source
- 💨 **Realistische Effekte**: Wind, Luftwiderstand, Bounce, Rotation

## Installation & Setup

### 1. Overlay zu OBS hinzufügen

1. Öffne OBS Studio
2. Füge eine neue **Browser Source** hinzu
3. URL: `http://localhost:3000/emoji-rain-overlay.html`
4. Breite: `1280` (oder deine Stream-Auflösung)
5. Höhe: `720` (oder deine Stream-Auflösung)
6. ✅ **"Shutdown source when not visible"** deaktivieren
7. ✅ **"Refresh browser when scene becomes active"** deaktivieren

### 2. Feature aktivieren

1. Öffne das Dashboard: `http://localhost:3000/dashboard.html`
2. Navigiere zu: **Emoji Rain Konfiguration** (oder direkt `http://localhost:3000/emoji-rain-config.html`)
3. Aktiviere den Toggle-Switch oben
4. Passe die Konfiguration nach Bedarf an
5. Klicke auf **"Konfiguration speichern"**

### 3. Testen

- Klicke auf **"Emoji Rain testen"** im Admin-Interface
- Oder verwende die API: `POST /api/emoji-rain/test`
- Emojis sollten nun im Overlay fallen!

## Konfiguration

### Canvas Einstellungen

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| `width_px` | Canvas-Breite in Pixel | 1280 |
| `height_px` | Canvas-Höhe in Pixel | 720 |

**Empfehlung**: Sollte mit deiner OBS Browser Source Auflösung übereinstimmen.

### Emoji Set

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| `emoji_set` | Array von Emojis, die zufällig gespawnt werden | `["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"]` |

**Beispiel**: Du kannst eigene Emojis hinzufügen oder entfernen, z.B. `["🎉","🎊","🎈","🎁"]` für eine Party-Theme.

### Physik Einstellungen

| Parameter | Beschreibung | Standard | Bereich |
|-----------|--------------|----------|---------|
| `physics_gravity_y` | Gravitations-Stärke (Y-Achse) | 1.0 | 0-3 |
| `physics_air` | Luftwiderstand | 0.02 | 0-0.2 |
| `physics_friction` | Reibung an Wänden/Boden | 0.1 | 0-1 |
| `physics_restitution` | Elastizität (Bounce-Faktor) | 0.6 | 0-1 |
| `physics_wind_strength` | Maximale Windstärke | 0.0005 | 0-0.01 |
| `physics_wind_variation` | Wind-Variation | 0.0003 | 0-0.01 |

**Tipps**:
- Höhere `gravity_y` = schnelleres Fallen
- Höhere `restitution` = mehr Bounce
- Höhere `wind_strength` = stärkerer seitlicher Wind

### Darstellung

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| `emoji_min_size_px` | Minimale Emoji-Größe | 40 |
| `emoji_max_size_px` | Maximale Emoji-Größe | 80 |
| `emoji_rotation_speed` | Rotationsgeschwindigkeit | 0.05 |
| `emoji_lifetime_ms` | Lebensdauer (0 = unbegrenzt) | 8000 |
| `emoji_fade_duration_ms` | Ausblenden-Dauer | 1000 |
| `max_emojis_on_screen` | Max. Emojis gleichzeitig | 200 |

### Skalierungs-Regeln

#### Likes

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| `like_count_divisor` | Like-Count wird durch diesen Wert geteilt | 10 |
| `like_min_emojis` | Mindestanzahl bei Likes | 1 |
| `like_max_emojis` | Maximalanzahl bei Likes | 20 |

**Berechnung**: `Anzahl = min(max, max(min, likeCount / divisor))`

**Beispiel**: Bei 50 Likes und divisor=10 → 5 Emojis

#### Gifts

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| `gift_base_emojis` | Basis-Anzahl bei jedem Gift | 3 |
| `gift_coin_multiplier` | Coins werden mit diesem Wert multipliziert | 0.1 |
| `gift_max_emojis` | Maximalanzahl bei Gifts | 50 |

**Berechnung**: `Anzahl = min(max, base + coins * multiplier)`

**Beispiel**: Rose (1 Coin) → 3 + 1*0.1 = 3 Emojis
**Beispiel**: Lion (500 Coins) → 3 + 500*0.1 = 53 → max 50 Emojis

## Event-basiertes Spawning

Das System spawnt automatisch Emojis bei folgenden TikTok-Events:

| Event | Emoji | Anzahl | Beschreibung |
|-------|-------|--------|--------------|
| **Gift** | Zufällig | Smart Scaling | Basierend auf Coin-Wert |
| **Like** | Zufällig | Smart Scaling | Basierend auf Like-Count |
| **Follow** | 💙 | 5 | Feste Anzahl |
| **Subscribe** | ⭐ | 8 | Feste Anzahl |
| **Share** | 🔄 | 5 | Feste Anzahl |

### Anpassung

Die Event-Emojis können im Code angepasst werden (`server.js`, Zeile ~1714-1807):

```javascript
// Beispiel: Follow Event
spawnEmojiRain('follow', data, 5, '💙'); // Anzahl und Emoji anpassbar
```

## API Endpunkte

### GET `/api/emoji-rain/config`
Ruft die aktuelle Konfiguration ab.

**Response**:
```json
{
  "success": true,
  "config": {
    "enabled": true,
    "width_px": 1280,
    "emoji_set": ["💧","💙","💚"],
    ...
  }
}
```

### POST `/api/emoji-rain/config`
Aktualisiert die Konfiguration.

**Body**:
```json
{
  "config": {
    "width_px": 1920,
    "height_px": 1080,
    "emoji_set": ["🎉","🎊","🎈"]
  },
  "enabled": true
}
```

### POST `/api/emoji-rain/toggle`
Aktiviert/deaktiviert das Feature.

**Body**:
```json
{
  "enabled": true
}
```

### POST `/api/emoji-rain/test`
Spawnt Test-Emojis zum Testen.

**Body** (optional):
```json
{
  "count": 10,
  "emoji": "🎉",
  "x": 0.5,
  "y": 0
}
```

## Socket.IO Events

Das Overlay lauscht auf folgende Socket.IO Events:

### `emoji-rain:spawn`
Spawnt Emojis im Overlay.

**Payload**:
```javascript
{
  count: 5,           // Anzahl der Emojis
  emoji: "🎉",        // Emoji-Zeichen
  x: 0.5,             // X-Position (0-1 normalisiert)
  y: 0,               // Y-Position (px)
  username: "User",   // Username des Auslösers
  reason: "gift"      // Event-Typ
}
```

### `emoji-rain:config-update`
Aktualisiert die Overlay-Konfiguration.

### `emoji-rain:toggle`
Aktiviert/deaktiviert das Overlay.

## Performance-Tipps

1. **Max Emojis begrenzen**: Setze `max_emojis_on_screen` auf einen vernünftigen Wert (50-200)
2. **Lifetime setzen**: Verwende `emoji_lifetime_ms` um alte Emojis zu entfernen (empfohlen: 5000-10000ms)
3. **Divisor anpassen**: Bei vielen Likes, erhöhe `like_count_divisor` um die Anzahl zu reduzieren
4. **Größe optimieren**: Kleinere Emojis (`emoji_max_size_px`) = bessere Performance

## Troubleshooting

### Emojis erscheinen nicht

1. ✅ Prüfe ob das Feature aktiviert ist (Toggle im Admin-Interface)
2. ✅ Prüfe OBS Browser Source URL (`http://localhost:3000/emoji-rain-overlay.html`)
3. ✅ Öffne Browser-Konsole (F12) im OBS Browser Source → Fehler?
4. ✅ Teste mit "Emoji Rain testen" Button

### Emojis fallen zu schnell/langsam

- Passe `physics_gravity_y` an (Standard: 1.0)
- Passe `physics_air` für Luftwiderstand an

### Zu viele Emojis

- Reduziere `gift_coin_multiplier` (z.B. auf 0.05)
- Erhöhe `like_count_divisor` (z.B. auf 20)
- Setze `max_emojis_on_screen` niedriger

### Emojis verschwinden nicht

- Setze `emoji_lifetime_ms` auf einen Wert > 0 (z.B. 8000)
- Erhöhe `emoji_fade_duration_ms` für sanfteres Ausblenden

## Debug-Modus

Drücke **Strg + D** im Overlay-Fenster um Debug-Informationen anzuzeigen:
- Anzahl aktiver Emojis
- Aktuelle Windstärke
- Physics Bodies Count
- Enabled-Status

## Technische Details

### Stack
- **Frontend**: HTML5, CSS3, JavaScript
- **Physics Engine**: Matter.js 0.19.0
- **Communication**: Socket.IO
- **Backend**: Node.js + Express

### Architektur
- **Database**: SQLite (`emoji_rain_config` Tabelle)
- **Server**: API Endpunkte + Socket.IO Events
- **Overlay**: Matter.js Physics World + DOM Rendering

### Dateien
```
/modules/database.js          - Datenbank-Schema & Methoden
/server.js                    - API Endpunkte & Event-Handler
/public/emoji-rain-config.html - Admin-Interface
/public/emoji-rain-overlay.html - Overlay mit Matter.js
/docs/EMOJI_RAIN.md           - Diese Dokumentation
```

## Credits

Basierend auf dem originalen Python Emoji Rain Script, adaptiert und erweitert für das TikTok Stream Tool.

**Features hinzugefügt**:
- Integration mit TikTok Events
- Vollständige Admin-UI
- Persistente Konfiguration
- Socket.IO Realtime-Updates
- Smart Scaling für Gifts/Likes

---

**Viel Spaß mit dem Emoji Rain! 🌧️✨**
