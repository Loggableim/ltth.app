# Alert-System – Vollständige Dokumentation

> Das Alert-System zeigt visuelle und akustische Benachrichtigungen als OBS Browser Source, wenn TikTok-LIVE-Events auftreten.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Event-Typen](#event-typen)
3. [Template-Variablen](#template-variablen)
4. [Konfigurationsoptionen](#konfigurationsoptionen)
5. [Sound-Konfiguration](#sound-konfiguration)
6. [Bild & GIF Support](#bild--gif-support)
7. [Animationsoptionen](#animationsoptionen)
8. [OBS Browser Source einrichten](#obs-browser-source-einrichten)
9. [Beispiel-Konfigurationen](#beispiel-konfigurationen)
10. [Troubleshooting](#troubleshooting)

---

## Übersicht

Das Alert-System verarbeitet TikTok-LIVE-Events und zeigt entsprechende Benachrichtigungen im Stream an. Es unterstützt:

- 🎁 **Gifts** – Wenn ein Viewer ein Geschenk sendet
- 👋 **Follows** – Wenn jemand dem Stream folgt
- 🔔 **Subscribes** – Wenn jemand den Creator abonniert
- 📤 **Shares** – Wenn jemand den Stream teilt
- ❤️ **Like-Threshold** – Wenn eine bestimmte Anzahl an Likes erreicht wird

Jeder Event-Typ hat einen eigenen Alert mit individuellem Text, Sound, Bild und Animation.

**Konfiguration:** Dashboard → **Alerts** (Seitenleiste)

**OBS Browser Source URL:** `http://localhost:3000/overlay`

---

## Event-Typen

| Event-Typ | Beschreibung | Standard-Template |
|-----------|--------------|-------------------|
| `gift` | Viewer sendet ein Geschenk | `{username} sent {gift_name} x{repeat_count}! ({coins} coins)` |
| `follow` | Neuer Follower | `{username} followed!` |
| `subscribe` | Neuer Subscriber | `{username} subscribed!` |
| `share` | Stream geteilt | `{username} shared the stream!` |
| `like` | Like-Threshold erreicht | `{username} liked!` |

### Gift-Alert mit Mindest-Coins-Filter

Der Gift-Alert unterstützt einen **Mindest-Coins-Filter**. Gifts unterhalb dieses Wertes lösen keinen Alert aus:

- `min_coins: 0` → Alle Gifts (Standard)
- `min_coins: 5` → Nur Gifts mit ≥ 5 Coins (z.B. Rose = 1, TikTok Universe = 34.999)
- `min_coins: 100` → Nur größere Gifts

---

## Template-Variablen

In den Text-Templates können folgende Variablen verwendet werden:

| Variable | Beschreibung | Beispiel |
|----------|--------------|---------|
| `{username}` | TikTok-Anzeigename des Viewers | `PupCid` |
| `{gift_name}` | Name des Geschenks | `Rose` |
| `{coins}` | Coin-Wert des Geschenks | `1` |
| `{repeat_count}` | Anzahl der Wiederholungen (Combo) | `5` |

**Beispiele:**

```
{username} hat {gift_name} x{repeat_count} geschickt! ({coins} Coins)
→ "PupCid hat Rose x3 geschickt! (3 Coins)"

{username} folgt jetzt!
→ "StreamFan123 folgt jetzt!"

{username} hat abonniert! 🎉
→ "TopViewer hat abonniert! 🎉"
```

---

## Konfigurationsoptionen

Jeder Event-Typ hat folgende Einstellungsfelder:

| Option | Typ | Beschreibung | Standard |
|--------|-----|--------------|---------|
| `enabled` | boolean | Alert für diesen Event aktivieren | `true` |
| `text_template` | string | Anzeigetext mit Variablen | Event-spezifisch |
| `sound_file` | string | Pfad zur Sound-Datei | `null` |
| `sound_volume` | number (0–100) | Lautstärke des Sounds | `80` |
| `min_coins` | number | Mindest-Coins (nur Gift) | `0` |
| `duration` | number | Anzeigedauer in Sekunden | `5` |
| `animation` | string | Einblend-Animation | `'fadeIn'` |
| `image` | string | Pfad zu Bild/GIF | `null` |

### Vollständige JSON-Konfiguration (Beispiel)

```json
{
  "gift": {
    "event_type": "gift",
    "enabled": true,
    "sound_file": "/sounds/gift.mp3",
    "sound_volume": 80,
    "text_template": "{username} hat {gift_name} x{repeat_count} geschickt! ({coins} Coins)",
    "min_coins": 5,
    "duration": 5,
    "animation": "slideIn"
  },
  "follow": {
    "event_type": "follow",
    "enabled": true,
    "sound_file": "/sounds/follow.mp3",
    "sound_volume": 80,
    "text_template": "{username} folgt jetzt!",
    "duration": 4,
    "animation": "fadeIn"
  },
  "subscribe": {
    "event_type": "subscribe",
    "enabled": true,
    "sound_file": "/sounds/subscribe.mp3",
    "sound_volume": 100,
    "text_template": "{username} hat abonniert!",
    "duration": 6,
    "animation": "bounceIn"
  },
  "share": {
    "event_type": "share",
    "enabled": true,
    "sound_file": null,
    "sound_volume": 80,
    "text_template": "{username} hat den Stream geteilt!",
    "duration": 4,
    "animation": "fadeIn"
  },
  "like": {
    "event_type": "like",
    "enabled": false,
    "sound_file": null,
    "sound_volume": 50,
    "text_template": "{username} hat geliked!",
    "duration": 3,
    "animation": "fadeIn"
  }
}
```

---

## Sound-Konfiguration

### Unterstützte Formate

- **MP3** (empfohlen)
- **WAV**
- **OGG**

### Sound hochladen

1. Dashboard → **Alerts** → **Einstellungen**
2. Pro Event-Typ: **Sound wählen** → Datei auswählen oder URL eingeben
3. **Lautstärke** mit dem Slider einstellen (0–100)
4. **Testen** mit dem Play-Button

### Soundboard-Integration

Falls das **Soundboard**-Plugin aktiv ist, kann es Gift-Sounds übernehmen:
- Bei Gift-Events prüft das Alert-System zuerst, ob das Soundboard einen spezifischen Sound für dieses Gift hat
- Falls ja: Soundboard-Sound wird verwendet (Alert-Sound wird übersprungen)
- Falls nein: Alert-eigener Sound wird verwendet

---

## Bild & GIF Support

### Unterstützte Formate

- **PNG** – statische Bilder
- **JPG/JPEG** – statische Bilder
- **GIF** – animierte Bilder (empfohlen für Alerts)
- **WebP** – modernes Format mit Animation-Support

### Bild konfigurieren

1. Dashboard → **Alerts** → jeweiliger Event-Typ → **Bild**
2. Bild-URL eingeben oder Datei hochladen
3. Position und Größe über CSS anpassen (Advanced)

### Automatische Gift-Bilder

Bei Gift-Events zeigt das Alert-System automatisch das **TikTok-Gift-Bild** an (`giftPictureUrl`), sofern kein eigenes Bild konfiguriert ist. Falls kein Gift-Bild vorhanden ist, wird das **Profilbild** des Senders genutzt.

---

## Animationsoptionen

| Animation | Beschreibung |
|-----------|-------------|
| `fadeIn` | Langsames Einblenden |
| `fadeOut` | Langsames Ausblenden |
| `slideIn` | Einsliden von der Seite |
| `bounceIn` | Bounce-Effekt beim Erscheinen |
| `zoomIn` | Hereinzoomen |
| `none` | Keine Animation |

Die Animationen werden über CSS-Klassen gesteuert und können in der Alert-Overlay-CSS-Datei angepasst werden.

---

## OBS Browser Source einrichten

### Haupt-Overlay (Alerts + HUD)

1. OBS Studio öffnen
2. **Szene** → **Quellen** → **+** → **Browser**
3. URL: `http://localhost:3000/overlay`
4. Breite: `1920`, Höhe: `1080`
5. **"Szene ist aktiv" aktualisieren** aktivieren

### Nur Alert-Overlay

```
http://localhost:3000/overlay
```

> Das Overlay zeigt alle konfigurierten Alerts. Der Hintergrund ist transparent – Alerts erscheinen als Einblendung über dem Stream.

---

## Beispiel-Konfigurationen

### Minimal-Setup (nur große Gifts)

```json
{
  "gift": {
    "enabled": true,
    "text_template": "{username}: {gift_name} ({coins} 🪙)",
    "min_coins": 50,
    "sound_volume": 80
  },
  "follow": { "enabled": false },
  "subscribe": { "enabled": true },
  "share": { "enabled": false },
  "like": { "enabled": false }
}
```

### Vollständiges Gaming-Setup

```json
{
  "gift": {
    "enabled": true,
    "text_template": "🎁 {username} schickt {gift_name} x{repeat_count}!",
    "sound_file": "/sounds/coin.mp3",
    "min_coins": 1,
    "animation": "bounceIn",
    "duration": 5
  },
  "follow": {
    "enabled": true,
    "text_template": "👋 Willkommen, {username}!",
    "sound_file": "/sounds/join.mp3",
    "animation": "slideIn",
    "duration": 3
  },
  "subscribe": {
    "enabled": true,
    "text_template": "⭐ {username} ist jetzt Subscriber!",
    "sound_file": "/sounds/fanfare.mp3",
    "animation": "zoomIn",
    "duration": 7
  }
}
```

---

## Troubleshooting

### Alert erscheint nicht im OBS

1. Prüfe, ob die Browser Source URL korrekt ist: `http://localhost:3000/overlay`
2. Rechtsklick auf Browser Source → **Aktualisieren**
3. Prüfe, ob der Alert-Event-Typ **aktiviert** ist
4. Dashboard → Alerts → **Test-Button** klicken

### Sound wird nicht abgespielt

1. Lautstärke in OBS Browser Source prüfen (nicht auf 0 gestellt)
2. Sound-Datei-Format prüfen (MP3 empfohlen)
3. Pfad der Sound-Datei prüfen (Dashboard → Alerts → Sound-Einstellung)
4. Browser-Autoplay-Richtlinien: OBS muss "Medien-Autoplay" erlauben

### Gift-Alert erscheint bei kleinen Gifts nicht

→ `min_coins`-Schwellenwert ist zu hoch. Auf `0` setzen für alle Gifts.

---

*Letzte Aktualisierung: 2026-04-04*  
*Siehe Dashboard → Alerts für die vollständige Konfiguration.*
