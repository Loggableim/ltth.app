# LastEvent Spotlight Plugin

## 📖 Beschreibung

Das **LastEvent Spotlight** Plugin bietet sechs permanente Live-Overlays, die jeweils den zuletzt aktiven Nutzer für verschiedene Event-Typen anzeigen. Perfekt für OBS, LIVE Studio und andere Streaming-Software.

## ✨ Features

- **6 Live-Overlays** für verschiedene Event-Typen:
  - 👤 **Follower** - Zeigt den letzten neuen Follower
  - ❤️ **Like** - Zeigt den letzten Like
  - 💬 **Chatter** - Zeigt den letzten Chat-Nutzer
  - 🔗 **Share** - Zeigt den letzten Share
  - 🎁 **Gifter** - Zeigt den letzten Gift-Sender
  - ⭐ **Subscriber** - Zeigt den letzten Subscriber

- **Echtzeit-Updates** über WebSocket
- **Umfangreiche Anpassungsmöglichkeiten**:
  - Schriftarten und Farben
  - Text-Effekte (Wave, Jitter, Bounce, Glow)
  - Animationen (Fade, Slide, Pop, Zoom, Bounce)
  - Profilbild-Einstellungen
  - Layout-Optionen
  - Hintergrund und Rahmen

- **Produktionsreif**:
  - Keine Platzhalter
  - Vollständig funktionsfähig
  - Image-Caching
  - Fehlerbehandlung

## 🚀 Installation

1. Das Plugin befindet sich bereits im `/plugins/lastevent-spotlight` Verzeichnis
2. Aktivieren Sie das Plugin im Plugin-Manager
3. Navigieren Sie zur Plugin-UI unter `/lastevent-spotlight/ui`

## 📺 Overlay-URLs

Die Overlays sind unter folgenden URLs verfügbar:

```
/overlay/lastevent/follower
/overlay/lastevent/like
/overlay/lastevent/chatter
/overlay/lastevent/share
/overlay/lastevent/gifter
/overlay/lastevent/subscriber
```

## 🎨 Verwendung

### 1. Plugin UI öffnen

Öffnen Sie die Plugin-Verwaltung und navigieren Sie zum "LastEvent Spotlight" Tab.

### 2. Overlay-URLs kopieren

Für jedes Overlay:
- Klicken Sie auf **"Copy URL"**, um die URL in die Zwischenablage zu kopieren
- Fügen Sie die URL in OBS als Browser-Quelle ein

### 3. Einstellungen anpassen

Klicken Sie auf **"Settings"** für jeden Overlay-Typ, um:

#### Schrift-Einstellungen
- Font Family (Standard: Exo 2)
- Font Size (Standard: 32px)
- Line Spacing
- Letter Spacing
- Font Color

#### Username-Effekte
- Effect Type: none, wave, wave-slow, wave-fast, jitter, bounce
- Glow Effect mit Farbauswahl

#### Border
- Enable/Disable
- Border Color

#### Background
- Enable/Disable
- Background Color (RGBA)

#### Profilbild
- Show/Hide
- Size (Standard: 80px)

#### Layout
- Show/Hide Username
- Center Alignment

#### Animationen
- In Animation: fade, slide, pop, zoom, glow, bounce
- Out Animation: fade, slide, pop, zoom, glow, bounce
- Animation Speed: slow, medium, fast

#### Verhalten
- Auto Refresh Interval (Sekunden)
- Hide on Null User
- Preload Images

### 4. Testen

Klicken Sie auf **"Test"**, um ein Test-Event zu senden und das Overlay zu testen.

### 5. Vorschau

Klicken Sie auf **"Preview"**, um eine Live-Vorschau des Overlays zu sehen.

## 🔧 API-Endpoints

### GET `/api/lastevent/settings`
Gibt alle Einstellungen für alle Overlay-Typen zurück.

### GET `/api/lastevent/settings/:type`
Gibt Einstellungen für einen bestimmten Typ zurück.

**Parameter:**
- `type`: follower, like, chatter, share, gifter, subscriber

### POST `/api/lastevent/settings/:type`
Aktualisiert Einstellungen für einen bestimmten Typ.

**Body:** JSON mit Einstellungen

### GET `/api/lastevent/last/:type`
Gibt den letzten Nutzer für einen bestimmten Typ zurück.

### POST `/api/lastevent/test/:type`
Sendet ein Test-Event für einen bestimmten Typ.

## 🔌 WebSocket-Events

### Empfangen (Client)

- `lastevent.update.follower` - Neuer Follower
- `lastevent.update.like` - Neuer Like
- `lastevent.update.chatter` - Neuer Chat
- `lastevent.update.share` - Neuer Share
- `lastevent.update.gifter` - Neues Gift
- `lastevent.update.subscriber` - Neuer Subscriber
- `lastevent.settings.<type>` - Settings-Update

### Event-Datenstruktur

```javascript
{
  uniqueId: "username",
  nickname: "Display Name",
  profilePictureUrl: "https://...",
  timestamp: "2025-01-15T12:00:00.000Z",
  eventType: "follower",
  label: "New Follower",
  metadata: {
    giftName: "Rose",      // nur bei gifter
    giftCount: 1,          // nur bei gifter
    message: "Hello!",     // nur bei chatter
    coins: 100            // nur bei gifter
  }
}
```

## 📁 Dateistruktur

```
lastevent-spotlight/
├── plugin.json                 # Plugin-Manifest
├── main.js                     # Backend-Logik
├── README.md                   # Diese Datei
├── lib/
│   ├── animations.js          # Animationssystem
│   ├── text-effects.js        # Text-Effekte
│   └── template-renderer.js   # Template-Rendering
├── overlays/
│   ├── follower.html          # Follower Overlay
│   ├── like.html              # Like Overlay
│   ├── chatter.html           # Chatter Overlay
│   ├── share.html             # Share Overlay
│   ├── gifter.html            # Gifter Overlay
│   └── subscriber.html        # Subscriber Overlay
└── ui/
    └── main.html              # Plugin UI
```

## 🎯 Event-Zuordnung

| TikTok Event | Overlay Type |
|-------------|-------------|
| `follow`    | `follower`  |
| `like`      | `like`      |
| `chat`      | `chatter`   |
| `share`     | `share`     |
| `gift`      | `gifter`    |
| `subscribe` | `subscriber`|
| `superfan`  | `subscriber`|

## 🛠️ Entwicklung

### Animationssystem

Das Animationssystem basiert auf `AnimationRegistry` und `AnimationRenderer`:

```javascript
const registry = new AnimationRegistry();
const renderer = new AnimationRenderer(registry);

// Animate in
await renderer.animateIn(element, 'fade', 'medium');

// Animate out
await renderer.animateOut(element, 'slide', 'fast');
```

### Text-Effekte

Text-Effekte werden über `TextEffects` angewendet:

```javascript
const textEffects = new TextEffects();
textEffects.applyComprehensiveEffects(element, settings);
```

### Template-Renderer

Der Template-Renderer verwaltet das Rendering der Overlays:

```javascript
const renderer = new TemplateRenderer(container, settings);
await renderer.render(userData, animate);
```

## 📝 Lizenz

Teil des Pup Cid's TikTool Helper Systems

## 🐛 Fehlerbehebung

### Overlay zeigt nichts an
- Überprüfen Sie, ob das Plugin aktiviert ist
- Testen Sie das Overlay mit dem Test-Button
- Öffnen Sie die Browser-Konsole für Fehler

### Animationen funktionieren nicht
- Überprüfen Sie die Animation-Settings
- Stellen Sie sicher, dass JavaScript aktiviert ist
- Prüfen Sie, ob alle Bibliotheken geladen wurden

### Profilbilder werden nicht angezeigt
- Aktivieren Sie "Preload Images" in den Settings
- Überprüfen Sie die CORS-Einstellungen
- Prüfen Sie die Netzwerk-Tab im Browser

## 📞 Support

Bei Fragen oder Problemen öffnen Sie ein Issue im GitHub-Repository.

---

**Version:** 1.0.0
**Author:** Plugin System
**Last Updated:** 2025-01-15
