# PupCid's Little TikTool Helper

Professional TikTok-compatible LIVE streaming tool with overlays, alerts, Text-to-Speech, Soundboard and event automation.

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Node.js](https://img.shields.io/badge/Node.js-18.0.0+-green.svg)](https://nodejs.org/)

---

## Über das Projekt

Dieses Tool wird von mir als Solo-Entwickler zusammen mit Claude AI entwickelt. Nicht alle Features sind perfekt - ich bin auf euer Feedback und eure Nutzungserfahrungen angewiesen.

**Bugs oder Feedback?** → [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## Features

### TikTok LIVE Integration
- Live-Verbindung über Username
- Echtzeit-Events (Gifts, Follows, Shares, Likes, Chat, Subs)
- Auto-Reconnect bei Verbindungsabbruch
- Live-Statistiken und Gift-Katalog

### Text-to-Speech
- 75+ TikTok-Stimmen, 30+ Google Cloud-Stimmen (optional)
- User-spezifisches Voice-Mapping
- Automatisches TTS für Chat-Nachrichten
- Blacklist, Volume, Speed anpassbar

### Alert-System
- Anpassbare Alerts für alle Event-Typen
- Sound + Text + Bild/GIF Support
- Template-System mit Variablen
- Mindest-Coins-Filter

### Soundboard
- 100.000+ Sounds von MyInstants
- Gift-spezifische Sounds mit Icons
- Event-Sounds (Follow, Subscribe, Share)
- Like-Threshold-System
- Sound-Picker mit Search, Favorites, Trending

### Goals
- 4 separate Goals (Likes, Followers, Subs, Coins)
- Individuelle Browser-Source-Overlays pro Goal
- Anpassbare Styles (Farben, Fonts, Animationen)
- Auto-Modi bei Zielerreichung (Add, Double, Hide)

### Event-Automation (Flows)
- "Wenn-Dann"-Automatisierungen ohne Code
- 6 Trigger-Typen, 6 Action-Typen
- Komplexe Bedingungen mit 8 Operatoren
- TTS, Alert, Sound, Webhook, Write_File, Delay

### OBS Integration
- Transparentes Full-HD-Overlay (1920x1080)
- HUD-Konfiguration per Drag & Drop
- Separate Goal-Overlays

### User-Profile
- Mehrere Datenbanken für verschiedene Setups
- Profile-Switching
- Backup-Funktion

---

## Installation

### Voraussetzungen
- Node.js 18.0.0+
- Moderner Browser
- OBS Studio (für Overlays)

### Setup

```bash
# Repository klonen
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper

# Dependencies installieren
npm install

# Eulerstream API Key konfigurieren (ERFORDERLICH)
# Option 1: .env Datei erstellen
echo "EULER_API_KEY=dein_api_key_hier" > .env

# Option 2: Oder über Dashboard Settings nach dem Start

# Server starten
npm start
```

Dashboard öffnet sich automatisch unter `http://localhost:3000`

**WICHTIG:** Ein Eulerstream API Key ist erforderlich, um sich mit TikTok LIVE zu verbinden.
- API Key erhalten: [https://www.eulerstream.com](https://www.eulerstream.com)
- Detaillierte Anleitung: Siehe `EULERSTREAM_API_GUIDE.md`
- API Key testen: `node validate-euler-api-key.js`

**🔄 Euler Backup Key:**  
Die App enthält einen Backup-API-Key für Notfälle. Wenn dieser verwendet wird:
- Erscheint eine **10-Sekunden-Warnung** beim Verbinden
- Die Warnung kann **nicht** geschlossen werden
- **Bitte hole dir deinen eigenen kostenlosen API-Key** von [eulerstream.com](https://www.eulerstream.com)
- Der Backup-Key sollte nur im Notfall verwendet werden

---

## Schnellstart

### 1. Mit TikTok verbinden
1. **API Key konfigurieren** (siehe Installation oben)
2. Dashboard öffnen: `http://localhost:3000`
3. TikTok-Username eingeben (ohne @)
4. "Connect" klicken
5. **Wichtig:** Du musst LIVE sein auf TikTok!

### 2. OBS einrichten

**Overlay:**
- Source → Browser Source
- URL: `http://localhost:3000/overlay.html`
- Breite: 1920, Höhe: 1080
- "Shutdown source when not visible" deaktivieren

**Optional - Goal-Overlays:**
```
http://localhost:3000/goal/likes
http://localhost:3000/goal/followers
http://localhost:3000/goal/subs
http://localhost:3000/goal/coins
```

**Optional - Animations-Overlay (für Follow/Subscribe/Share/Gift Animationen):**
- Source → Browser Source
- URL: `http://localhost:3000/animation-overlay.html`
- Breite: 1920, Höhe: 1080
- "Shutdown source when not visible" deaktivieren
- Hinweis: Animationen werden nur abgespielt, wenn im Soundboard-Plugin konfiguriert

### 3. Soundboard konfigurieren
1. Dashboard → Soundboard (`http://localhost:3000/soundboard/`)
2. Gift auswählen → "Set Sound"
3. Sound-Picker durchsuchen (Browser, Search, Favorites)
4. Sound zuweisen → Auto-Save

### 4. TTS aktivieren
1. Dashboard → TTS
2. User hinzufügen + Stimme wählen
3. Settings → "Enable TTS for Chat Messages"
4. Default Voice, Volume, Speed anpassen

---

## Troubleshooting

### Connection failed
- Stelle sicher, dass du LIVE bist
- Warte 10-15 Sekunden nach Stream-Start
- Username ohne @ eingeben
- Bei SIGI_STATE-Fehler: VPN verwenden

### TTS funktioniert nicht
- Im Overlay auf "Audio aktivieren" klicken
- Volume-Einstellungen überprüfen
- TTS-Provider könnte offline sein

### Overlay zeigt nichts
- URL überprüfen: `http://localhost:3000/overlay.html`
- Server muss laufen
- Browser-Source refreshen (Rechtsklick → Refresh)
- "Shutdown source when not visible" deaktivieren

### Port 3000 belegt
```bash
# Custom Port verwenden
PORT=3001 npm start
```

---

## API

Wichtige Endpunkte:

```bash
# TikTok-Verbindung
POST /api/connect
POST /api/disconnect
GET /api/status

# Settings & Profile
GET/POST /api/settings
GET/POST /api/profiles
POST /api/profiles/switch

# Flows & Soundboard
GET/POST/PUT/DELETE /api/flows
GET/POST /api/soundboard/gifts
GET /api/myinstants/search

# Goals
GET/POST /api/goals/:key
```

Vollständige Docs siehe Code-Kommentare in `server.js`

---

## Projekt-Struktur

```
pupcidslittletiktokhelper/
├── server.js                     # Haupt-Server
├── package.json
├── modules/                      # Backend
│   ├── database.js
│   ├── tiktok.js
│   ├── tts.js
│   ├── alerts.js
│   ├── flows.js
│   ├── soundboard.js
│   ├── goals.js
│   └── user-profiles.js
├── public/                       # Frontend
│   ├── dashboard.html
│   ├── soundboard/           # Plugin-based soundboard UI
│   ├── overlay.html
│   └── hud-config.html
└── user_configs/                 # Profile-Datenbanken (gitignored)
```

---

## Contributing

Pull Requests sind willkommen!

1. Fork das Repository
2. Branch erstellen: `git checkout -b feature/name`
3. Committen: `git commit -m 'Add feature'`
4. Pushen: `git push origin feature/name`
5. Pull Request öffnen

**Bug-Reports & Feature-Requests:**
- GitHub Issues oder direkt per E-Mail: [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## Lizenz

CC BY-NC 4.0 License - siehe [LICENSE](LICENSE)

---

## Credits

- [Eulerstream](https://www.eulerstream.com/) - TikTok LIVE WebSocket API and connection service
- [TikTok TTS API](https://github.com/oscie57/tiktok-voice) by @oscie57
- [MyInstants](https://www.myinstants.com/) für Sounds
- [Tailwind CSS](https://tailwindcss.com/), [Socket.IO](https://socket.io/), [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)

---

## Disclaimer

Dieses Tool ist nicht offiziell von TikTok unterstützt. Nutzung auf eigene Verantwortung.

- Keine Login-Daten erforderlich
- Keine Daten-Sammlung (100% lokal)
- TikTok-Nutzungsbedingungen beachten

---

## Support

- 📖 README & Troubleshooting-Sektion
- 🐛 [GitHub Issues](https://github.com/yourusername/pupcidslittletiktokhelper/issues)
- 📧 [loggableim@gmail.com](mailto:loggableim@gmail.com)
