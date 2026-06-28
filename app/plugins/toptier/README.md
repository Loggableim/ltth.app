# 🏆 Top Tier Plugin

**Live-Leaderboard für TikTok LIVE Likes & Geschenke**

Top Tier ist ein Echtzeit-Leaderboard-Plugin für PupCid's Little TikTool Helper. Es trackt Likes und Geschenke von TikTok LIVE Zuschauern, berechnet Scores mit konfigurierbarer Decay-Mechanik und stellt OBS-Overlay-Varianten für Hochformat und Querformat bereit.

---

## ✨ Features

- **Zwei unabhängige Boards:** Likes-Board und Gifts-Board mit separater Konfiguration
- **Coins = Punkte:** 1 Rose = 1 Coin = 1 Punkt, 1 Galaxy = 1000 Coins = 1000 Punkte. Keine Multiplikatoren — die TikTok Coin-Werte sind der Score direkt.
- **Session-basiert:** Leaderboards werden nur bei einem neuen Stream zurückgesetzt, nicht bei jedem Reconnect. Kurzzeitige Verbindungsabbrüche behalten die Daten.
- **5 Decay-Modi:** none, linear, percentage, idle, step
- **8 OBS-Overlay-Varianten:**
  - Classic List – Statische sortierte Liste
  - Animated Race – FLIP-Technik für smooth Zeilen-Reordering mit Kronen-Glow
  - Spotlight – Zeigt 1 User groß, rotiert durch Top N
  - Podium View – Klassisches 3-Stufen-Podium
  - Ticker – Laufschrift (horizontal im Querformat, vertikal im Hochformat)
  - Holographic Cards – Glassmorphism/Neon-Glow Cards
  - Scoreboard – ESports-Tabelle mit Delta-Spalte
  - Combined – Likes + Gifts in einem View (Split-Layout)
- **Hochformat und Querformat:** Overlay-Orientierung für vertikale (TikTok LIVE) und horizontale Streams
- **Echtzeit-Animationen:** Rang-Wechsel, New-Leader-Effekte, Decay-Pulse
- **Chat-Command:** `!rank` für Zuschauer-Rang-Abfrage
- **Session-Management:** Automatischer Reset bei neuem Stream, manuelle Session-Steuerung
- **Offline-fähig:** Kein CDN nötig, funktioniert komplett lokal in OBS

---

## 🚀 Installation

Das Plugin ist bereits im LTTH-Projekt integriert. Es wird automatisch beim Start geladen, wenn es aktiviert ist.

---

## 📺 OBS-Overlay einrichten

1. Öffne die **Admin-UI** des Plugins im LTTH-Dashboard (Sidebar → Top Tier)
2. Gehe zum Tab **🎬 OBS URLs**
3. Wähle Ausrichtung (Hochformat/Querformat) und Theme
4. Wähle die gewünschte Variante und Board-Kombination
5. Kopiere die URL
6. In OBS: **Quellen → Browser-Quelle hinzufügen → URL einfügen**

### URL-Parameter

| Parameter     | Werte                              | Standard        |
|---------------|------------------------------------|-----------------|
| `board`       | `likes`, `gifts`, `both`, `combined` | `likes`       |
| `variant`     | siehe 8 Varianten oben             | `animated-race` |
| `theme`       | `dark`, `neon`, `light`, `minimal` | `dark`          |
| `orientation` | `landscape`, `portrait`            | `landscape`     |
| `size`        | `S`, `M`, `L`                      | `M`             |
| `count`       | 1–20                               | `5`             |
| `accent`      | HEX-Farbcode                       | `#f59e0b`       |
| `opacity`     | 0–1                                | `0.85`          |
| `avatars`     | `true`, `false`                    | `true`          |
| `bars`        | `true`, `false`                    | `true`          |
| `rotation`    | ms (Spotlight-Intervall)           | `8000`          |

**Beispiel Querformat:**
```
http://localhost:3000/plugins/toptier/overlay.html?board=both&variant=animated-race&orientation=landscape&theme=dark&count=5
```

**Beispiel Hochformat (TikTok LIVE vertikal):**
```
http://localhost:3000/plugins/toptier/overlay.html?board=combined&variant=combined&orientation=portrait&theme=neon&count=3
```

---

## ⚙️ Konfiguration

Die gesamte Konfiguration erfolgt über die Admin-UI oder die REST-API.

### Likes Board
- **Aktiviert/Deaktiviert**
- **Anzeige-Limit:** Wie viele Einträge auf dem Board angezeigt werden
- **Score-Multiplikator:** Faktor für Likes (z.B. 2.0 = doppelte Punkte)

### Gifts Board
- **Aktiviert/Deaktiviert**
- **Anzeige-Limit**
- **Coins = Punkte:** Keine Multiplikatoren, TikTok Coin-Werte sind direkt der Score

### Decay
| Typ         | Beschreibung                                                |
|-------------|-------------------------------------------------------------|
| `none`      | Kein Score-Verfall                                          |
| `linear`    | Fester Betrag pro Tick (z.B. -5 Punkte alle 10s)          |
| `percentage`| Prozentualer Abzug pro Tick (z.B. -10% alle 10s)          |
| `idle`      | Decay nur bei Inaktivität (kein Event seit X ms)           |
| `step`      | Decay nur, wenn ein Rivale im Schwellenbereich ist         |

### Session-Reset
- **Neuer Stream:** Wenn ein anderer Streamer verbindet, wird automatisch eine neue Session gestartet
- **Reconnect:** Wenn derselbe Streamer reconnectet, bleibt die Session erhalten
- **Manuell:** Über den Controls-Tab kann jederzeit eine neue Session gestartet werden

---

## 🔌 API

### REST-Endpunkte

| Methode | Pfad                       | Beschreibung                     |
|---------|----------------------------|----------------------------------|
| GET     | `/board/:boardType`        | Aktuelles Leaderboard abrufen    |
| POST    | `/reset/:boardType`        | Board zurücksetzen (oder `all`)  |
| GET     | `/config`                  | Konfiguration laden              |
| POST    | `/config`                  | Konfiguration speichern          |
| POST    | `/session/new`             | Neue Session starten             |
| GET     | `/session/current`         | Aktuelle Session-ID + Stream     |
| GET     | `/decay-log/:boardType`    | Decay-Log der aktuellen Session  |
| POST    | `/test-event`              | Test-Event senden                |

### Socket.IO Events

| Event                    | Richtung    | Beschreibung                   |
|--------------------------|-------------|--------------------------------|
| `toptier:update`         | Server → Client | Board-Update mit Einträgen  |
| `toptier:rank-change`    | Server → Client | Rang-Wechsel-Notification   |
| `toptier:new-leader`     | Server → Client | Neuer Leader-Notification   |
| `toptier:decay`          | Server → Client | Decay-Tick mit betroffenen Usern |
| `toptier:session-start`  | Server → Client | Neue Session gestartet      |
| `toptier:session-end`    | Server → Client | Session beendet             |
| `toptier:rank-reply`     | Server → Client | Antwort auf !rank Command   |
| `toptier:get-board`      | Client → Server | Board anfordern             |
| `toptier:get-config`     | Client → Server | Config anfordern            |
| `toptier:save-config`    | Client → Server | Config speichern            |

---

## 📁 Dateistruktur

```
app/plugins/toptier/
├── plugin.json           # Plugin-Metadaten
├── main.js               # Haupt-Plugin-Klasse
├── backend/
│   ├── db.js             # Datenbank-Handler (SQLite, session-only)
│   ├── score-engine.js   # Score-Berechnung & Events (coins = score)
│   ├── decay-scheduler.js# Decay-Timer-Logik
│   └── session-manager.js# Session-Verwaltung (stream-aware reset)
├── overlay.html          # OBS-Overlay HTML
├── assets/
│   ├── overlay.js        # Overlay-Logik mit 8 Varianten + orientation
│   ├── overlay.css       # Themes, Styles, Combined, Portrait/Landscape
│   ├── animations.css    # Alle @keyframes
│   └── avatar-placeholder.svg  # Fallback-Avatar
├── ui.html               # Admin-Oberfläche
└── README.md             # Diese Datei
```

---

## 🔒 Sicherheit

- Alle User-Inhalte (Nickname, Username) werden via `escHtml()` und `escAttr()` sanitized
- Kein CDN – alles läuft offline
- Prepared Statements für alle Datenbankoperationen
- Input-Validierung auf allen API-Endpunkten

---

## 📝 Lizenz

Dieses Plugin ist Teil von PupCid's Little TikTool Helper und unterliegt der CC-BY-NC-4.0 Lizenz.