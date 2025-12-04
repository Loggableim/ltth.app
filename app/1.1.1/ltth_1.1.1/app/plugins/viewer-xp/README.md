# Viewer XP System Plugin

Ein umfassendes Gamification-System für TikTok-Streamer, das Zuschauer durch XP (Experience Points), Level, Badges und Belohnungen an den Stream bindet.

## 🎯 Features

### Kernfunktionen
- **Persistente XP-Speicherung**: Alle Zuschauerdaten bleiben über Sessions und Streams hinweg erhalten
- **Levelsystem**: Automatische Level-Berechnung basierend auf gesammelten XP
- **XP für Aktionen**: Belohnungen für Chat-Nachrichten, Likes, Shares, Gifts, Follow und Zuschauzeit
- **Daily Bonus**: Tägliche XP-Boni beim ersten Beitritt zum Stream
- **Streak-System**: Zusätzliche XP für mehrere aufeinanderfolgende Tage
- **Badge-System**: Automatische Badge-Vergabe basierend auf Achievements
- **Titel & Farben**: Anpassbare Namen-Highlights und Titel je nach Level

### Overlays
- **XP Bar**: Live-Anzeige mit XP-Fortschritt, Level und animierten Updates
- **Leaderboard**: Top-Viewer-Rangliste (All-Time, 7 Tage, 30 Tage)
- **Level-Up-Animationen**: Einblendungen bei Level-Aufstiegen mit Konfetti und Sound

### Admin Panel
- **Viewer-Management**: Detaillierte Ansicht aller Zuschauer-Profile
- **Statistik-Dashboard**: Übersicht über Gesamtstatistiken
- **XP-Konfiguration**: Anpassbare XP-Werte für alle Aktionen
- **Level-System-Konfiguration**: Wählbare Level-Progression (Exponentiell, Linear, Logarithmisch, Custom)
  - Definiere eigene XP-Anforderungen für jedes Level
  - Custom-Titel und Farben pro Level
  - Live-Preview der Level-Kurve
- **Manuelle XP-Vergabe**: Admin-Funktion für spezielle Belohnungen
- **Import/Export**: Backup und Migration von Viewer-Daten
- **Viewer-Historie**: Detaillierter XP-Verlauf pro Zuschauer
- **Einstellungen**: Aktivierung/Deaktivierung von Features

### Performance & Skalierbarkeit
- **Batch-Processing**: Effiziente DB-Writes für hohe Zuschauerzahlen
- **SQLite WAL-Modus**: Optimierte Datenbank-Performance
- **In-Memory-Cooldowns**: Schnelle Cooldown-Verwaltung
- **Indizierte Abfragen**: Optimierte Leaderboard-Queries

## 📦 Installation

Das Plugin ist automatisch verfügbar, wenn es im `plugins/viewer-xp/` Verzeichnis liegt.

1. Der Plugin-Loader erkennt das Plugin automatisch
2. Aktivierung über das Dashboard oder durch Setzen von `"enabled": true` in `plugin.json`
3. Die Datenbank wird beim ersten Start automatisch initialisiert

## 🚀 Verwendung

### Overlay-URLs

#### XP Bar
```
http://localhost:3000/overlay/viewer-xp/xp-bar?username=USERNAME
```

**Parameter:**
- `username`: (Optional) Zeigt XP-Bar für spezifischen Nutzer
- `autoHide`: (Optional) `true`/`false` - Auto-Ausblenden nach Zeit
- `duration`: (Optional) Anzeigedauer in ms (Standard: 5000)
- `showPic`: (Optional) `true`/`false` - Profilbild anzeigen

#### Leaderboard
```
http://localhost:3000/overlay/viewer-xp/leaderboard
```

**Parameter:**
- `limit`: (Optional) Anzahl der Top-Viewer (Standard: 10)
- `days`: (Optional) Zeitraum in Tagen (leer = All-Time, 7 = letzte 7 Tage)
- `refresh`: (Optional) Auto-Refresh-Intervall in ms (Standard: 30000)

#### Level-Up Animation (NEU!)
```
http://localhost:3000/overlay/viewer-xp/level-up
```

**Parameter:**
- `duration`: (Optional) Anzeigedauer in ms (Standard: 5000)
- `sound`: (Optional) `true`/`false` - Sound aktivieren (Standard: true)
- `test`: (Optional) `true` - Zeigt Test-Animation beim Laden

**Features:**
- Animierte Level-Anzeige mit Konfetti-Effekt
- Partikel-Animationen
- Soundeffekte (melodische Tonfolge)
- Zeigt neue Belohnungen (Titel, Farben)
- Automatisches Ausblenden nach Dauer
- Reagiert auf WebSocket-Event `viewer-xp:level-up`

### Admin Panel

```
http://localhost:3000/viewer-xp/admin
```

**Funktionen:**
- Leaderboard-Ansicht mit Filteroptionen
- XP-Action-Konfiguration (XP-Werte, Cooldowns)
- Allgemeine Einstellungen (Daily Bonus, Streaks, Watch Time)
- Manuelle XP-Vergabe für einzelne Zuschauer
- Detaillierte Viewer-Statistiken

## ⚙️ Konfiguration

### XP-Aktionen (Standard-Werte)

| Aktion | XP | Cooldown |
|--------|-----|----------|
| Chat Message | 5 | 30s |
| Like | 2 | 60s |
| Share | 25 | 5min |
| Follow | 50 | - |
| Gift Tier 1 (< 100 Coins) | 10 | - |
| Gift Tier 2 (100-999 Coins) | 50 | - |
| Gift Tier 3 (1000+ Coins) | 100 | - |
| Watch Time (pro Minute) | 3 | 60s |
| Daily Bonus | 100 | 24h |
| Streak Bonus | 50 | 24h |

Alle Werte können über das Admin Panel angepasst werden.

### Level-System

Das Level-System unterstützt jetzt **4 verschiedene Progression-Typen**, konfigurierbar im Admin Panel:

#### 1. Exponentiell (Standard)
**Level-Formel:**
```
Level = floor(sqrt(XP / 100)) + 1
```

**XP für Level:**
- Level 1: 0 XP
- Level 2: 100 XP
- Level 3: 400 XP
- Level 4: 900 XP
- Level 5: 1.600 XP
- Level 10: 8.100 XP
- Level 25: 57.600 XP

**Vorteil:** Wird mit jedem Level schwieriger, ideal für langfristiges Engagement

#### 2. Linear
**Level-Formel:**
```
Level = floor(XP / XPPerLevel) + 1
```

**Beispiel (1000 XP pro Level):**
- Level 1: 0 XP
- Level 2: 1.000 XP
- Level 3: 2.000 XP
- Level 10: 9.000 XP
- Level 25: 24.000 XP

**Vorteil:** Gleichmäßiger Fortschritt, vorhersehbar für Zuschauer

#### 3. Logarithmisch
**Level-Formel:**
```
XP = Multiplier * log(Level) * Level
```

**Beispiel (Multiplier = 500):**
- Level 1: 0 XP
- Level 2: ~350 XP
- Level 5: ~4.000 XP
- Level 10: ~11.500 XP
- Level 25: ~40.000 XP

**Vorteil:** Moderate Steigerung, ausbalanciert zwischen linear und exponentiell

#### 4. Custom (Individuell)
Definiere jedes Level einzeln mit:
- Exakter XP-Anforderung
- Eigenem Titel
- Eigener Namensfarbe

**Vorteil:** Vollständige Kontrolle, ideal für spezielle Events oder Milestones

**Konfiguration:**
Im Admin Panel unter "📊 Level Configuration" kannst du:
1. Den Progression-Typ wählen
2. Parameter anpassen (z.B. XP pro Level bei Linear)
3. Preview der Level-Kurve ansehen
4. Konfiguration speichern und anwenden

**XP für Level (Standard - Exponentiell):**
- Level 1: 0 XP
- Level 2: 100 XP
- Level 3: 400 XP
- Level 4: 900 XP
- Level 5: 1.600 XP
- Level 10: 8.100 XP
- Level 25: 57.600 XP

### Standard-Belohnungen

| Level | Titel | Farbe |
|-------|-------|-------|
| 1 | Newcomer | #FFFFFF (Weiß) |
| 5 | Regular Viewer | #00FF00 (Grün) |
| 10 | Dedicated Fan | #00BFFF (Blau) |
| 15 | Super Fan | #FFD700 (Gold) |
| 20 | Elite Supporter | #FF00FF (Magenta) |
| 25 | Legend | #FF4500 (Orange-Rot) |
| 30 | Mythic | #8B00FF (Violett) |

## 🔌 API Endpoints

### GET `/api/viewer-xp/profile/:username`
Abrufen eines Viewer-Profils mit XP, Level, Badges, etc.

### GET `/api/viewer-xp/stats/:username`
Detaillierte Statistiken für einen Viewer (XP-Breakdown, Daily Activity)

### GET `/api/viewer-xp/leaderboard?limit=10&days=7`
Leaderboard abrufen (Top-Viewer nach XP)

### GET `/api/viewer-xp/stats`
Gesamt-Statistiken (Total Viewers, Total XP, Avg Level, etc.)

### GET `/api/viewer-xp/actions`
Alle XP-Aktionen und ihre Konfiguration

### POST `/api/viewer-xp/actions/:actionType`
XP-Aktion aktualisieren
```json
{
  "xp_amount": 10,
  "cooldown_seconds": 60,
  "enabled": true
}
```

### POST `/api/viewer-xp/award`
Manuelle XP-Vergabe (Admin)
```json
{
  "username": "viewer123",
  "amount": 500,
  "reason": "Special event winner"
}
```

### GET/POST `/api/viewer-xp/settings`
Einstellungen abrufen/speichern

## 🔔 WebSocket Events

### Emitted Events

#### `viewer-xp:update`
```javascript
{
  username: "viewer123",
  amount: 5,
  actionType: "chat_message",
  profile: { /* full profile */ }
}
```

#### `viewer-xp:level-up`
```javascript
{
  username: "viewer123",
  oldLevel: 4,
  newLevel: 5,
  rewards: { /* level rewards */ }
}
```

### Received Events

#### `viewer-xp:get-profile`
Request viewer profile
```javascript
socket.emit('viewer-xp:get-profile', 'username');
```

#### `viewer-xp:get-leaderboard`
Request leaderboard
```javascript
socket.emit('viewer-xp:get-leaderboard', { limit: 10, days: 7 });
```

## 📊 Datenbank-Schema

### viewer_profiles
- `username` (PK): Eindeutiger Username
- `xp`: Aktuelle XP
- `level`: Aktuelles Level
- `total_xp_earned`: Gesamt verdiente XP
- `first_seen`: Erstes Erscheinen
- `last_seen`: Letztes Erscheinen
- `last_daily_bonus`: Letzter Daily Bonus
- `streak_days`: Aktuelle Streak
- `last_streak_date`: Letztes Streak-Datum
- `title`: Aktueller Titel
- `badges`: JSON-Array mit Badges
- `name_color`: Namensfarbe

### xp_transactions
Log aller XP-Transaktionen für Analytics

### daily_activity
Tägliche Aktivitätsdaten für Streak-Tracking

### badge_definitions
Badge-Definitionen und Anforderungen

### level_rewards
Belohnungen pro Level

### xp_actions
Konfigurierbare XP-Aktionen

## 🔧 Entwicklung

### Plugin-Struktur
```
viewer-xp/
├── plugin.json          # Plugin-Metadaten
├── main.js              # Haupt-Plugin-Klasse
├── backend/
│   └── database.js      # Datenbank-Manager
├── overlays/
│   ├── xp-bar.html      # XP-Bar Overlay
│   └── leaderboard.html # Leaderboard Overlay
└── ui/
    └── admin.html       # Admin Panel
```

### Erweiterungen

**Neue XP-Aktion hinzufügen:**
1. In `database.js` → `initializeDefaultActions()` eintragen
2. In `main.js` Event-Handler hinzufügen
3. Im Admin Panel wird es automatisch konfigurierbar

**Neue Badge hinzufügen:**
1. In `database.js` → `initializeDefaultBadges()` eintragen
2. Logik für Badge-Vergabe implementieren

## 🎨 Anpassung

### Overlay-Styling
Die HTML-Dateien in `overlays/` können direkt bearbeitet werden, um:
- Farben anzupassen
- Fonts zu ändern
- Animationen zu modifizieren
- Layout zu verändern

### Level-Formel ändern
In `database.js` → `calculateLevel()` und `getXPForLevel()`:
```javascript
// Aktuelle Formel (exponentiell)
calculateLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// Alternative: Linear
calculateLevel(xp) {
  return Math.floor(xp / 1000) + 1; // Alle 1000 XP ein Level
}
```

## 🐛 Troubleshooting

### XP wird nicht vergeben
- Prüfe Cooldowns im Admin Panel
- Prüfe ob Aktion aktiviert ist
- Checke Browser-Console auf Fehler
- Prüfe Server-Logs

### Overlay zeigt nichts an
- Prüfe ob Plugin aktiviert ist
- Checke URL-Parameter
- Öffne Browser-Console für Fehler
- Stelle sicher Socket.io-Verbindung besteht

### Datenbank-Fehler
- Stelle sicher `user_data/viewer-xp/` existiert
- Prüfe Schreibrechte
- Checke ob DB nicht korrupt ist
- Bei Problemen: DB-Datei löschen (wird neu erstellt)

## 📝 Changelog

### Version 1.0.0 (Initial Release)
- ✅ Vollständiges XP- und Levelsystem
- ✅ Daily Bonus und Streak-Tracking
- ✅ Badge- und Titel-System
- ✅ XP Bar und Leaderboard Overlays
- ✅ Admin Panel mit Statistiken
- ✅ Batch-Processing für Performance
- ✅ WebSocket-Integration für Live-Updates
- ✅ Konfigurierbare XP-Aktionen
- ✅ Manuelle XP-Vergabe

## 📄 Lizenz

Teil von Pup Cid's Little TikTok Helper - CC BY-NC 4.0 License

## 👨‍💻 Support

Bei Fragen oder Problemen:
1. Prüfe diese Dokumentation
2. Checke Server-Logs
3. Öffne ein Issue im Repository
