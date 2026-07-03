# Viewer XP System - Quick Start Guide

## Installation

Das Plugin ist automatisch verfügbar. Es wird beim Server-Start geladen, wenn es im `plugins/viewer-xp/` Verzeichnis liegt und in der `plugin.json` aktiviert ist (`"enabled": true`).

## Schnellstart

### 1. Server starten
```bash
npm start
```

Das Plugin initialisiert sich automatisch beim Start und erstellt die Datenbank unter `user_data/viewer-xp/viewer-xp.db`.

### 2. Admin Panel öffnen
```
http://localhost:3000/viewer-xp/admin
```

Hier kannst du:
- Top Viewer ansehen
- XP-Werte für Aktionen konfigurieren
- Einstellungen anpassen (Daily Bonus, Streaks, etc.)
- Manuell XP vergeben

### 3. Overlays in OBS einbinden

#### XP Bar (Live-Anzeige)
1. In OBS: Quelle hinzufügen → Browser
2. URL: `http://localhost:3000/overlay/viewer-xp/xp-bar`
3. Breite: 600, Höhe: 200
4. Custom CSS bei Bedarf

**Optional: Nur für bestimmten User:**
```
http://localhost:3000/overlay/viewer-xp/xp-bar?username=USERNAME&autoHide=false
```

#### Leaderboard
1. In OBS: Quelle hinzufügen → Browser
2. URL: `http://localhost:3000/overlay/viewer-xp/leaderboard`
3. Breite: 700, Höhe: 800

**Top 5 der letzten 7 Tage:**
```
http://localhost:3000/overlay/viewer-xp/leaderboard?limit=5&days=7
```

## Konfiguration

### XP-Werte anpassen

Im Admin Panel → Tab "XP Settings":
- XP-Betrag pro Aktion
- Cooldown-Zeit (verhindert Spam)
- Aktion aktivieren/deaktivieren

### Allgemeine Einstellungen

Im Admin Panel → Tab "XP Settings" → "General Settings":
- **Daily Bonus aktivieren**: Tägliche XP beim ersten Join
- **Streaks aktivieren**: Bonus für aufeinanderfolgende Tage
- **Watch Time XP**: XP für Zuschauzeit
- **Watch Time Interval**: Wie oft XP für Zuschauzeit vergeben wird
- **Level-Up Announcements**: Ankündigungen bei Level-Aufstieg

### Manuelle XP-Vergabe

Im Admin Panel → Tab "Manual Award":
1. Username eingeben
2. XP-Betrag festlegen
3. Optional: Grund angeben
4. "Award XP" klicken

## XP-System Übersicht

### Wie funktioniert XP?

Zuschauer erhalten XP für:
- **Chat-Nachrichten**: 5 XP (max. alle 30s)
- **Likes**: 2 XP (max. alle 60s)
- **Shares**: 25 XP (max. alle 5min)
- **Follows**: 50 XP (einmalig)
- **Gifts**: 10-100 XP (je nach Wert)
- **Zuschauzeit**: 3 XP pro Minute
- **Daily Bonus**: 100 XP beim ersten Join des Tages
- **Streak Bonus**: 50 XP für aufeinanderfolgende Tage

### Level-System

- **Level 1**: 0 XP
- **Level 2**: 100 XP
- **Level 3**: 400 XP
- **Level 5**: 1.600 XP
- **Level 10**: 8.100 XP
- **Level 25**: 57.600 XP

### Belohnungen

Bei bestimmten Levels erhalten Zuschauer:
- **Titel** (z.B. "Regular Viewer", "Super Fan", "Legend")
- **Namensfarben** (Grün → Blau → Gold → Magenta → Orange-Rot)
- **Badges** (werden zukünftig angezeigt)

## API-Nutzung

### Viewer-Profil abrufen
```javascript
fetch('/api/viewer-xp/profile/USERNAME')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Leaderboard abrufen
```javascript
// Top 10 All-Time
fetch('/api/viewer-xp/leaderboard?limit=10')
  .then(res => res.json())
  .then(data => console.log(data));

// Top 5 letzte 7 Tage
fetch('/api/viewer-xp/leaderboard?limit=5&days=7')
  .then(res => res.json())
  .then(data => console.log(data));
```

### WebSocket Events

```javascript
const socket = io();

// XP-Update in Echtzeit
socket.on('viewer-xp:update', (data) => {
  console.log(`${data.username} erhielt ${data.amount} XP für ${data.actionType}`);
});

// Level-Up
socket.on('viewer-xp:level-up', (data) => {
  console.log(`${data.username} erreichte Level ${data.newLevel}!`);
});
```

## Troubleshooting

### Plugin lädt nicht
1. Prüfe `plugin.json`: `"enabled": true`
2. Checke Server-Logs beim Start
3. Stelle sicher, dass alle Dateien vorhanden sind

### Overlays zeigen nichts
1. Prüfe URL in OBS Browser-Quelle
2. Öffne Browser-Console (F12) für Fehler
3. Stelle sicher, dass Server läuft
4. Checke Socket.io-Verbindung

### XP wird nicht vergeben
1. Prüfe Cooldowns im Admin Panel
2. Stelle sicher, dass Aktion aktiviert ist
3. Checke Server-Logs
4. Prüfe TikTok-Verbindung

### Datenbank-Fehler
1. Prüfe Ordner `user_data/viewer-xp/` existiert
2. Prüfe Schreibrechte
3. Bei Korruption: Lösche `viewer-xp.db` (wird neu erstellt)

## Best Practices

### Performance
- Nutze Batch-Processing (automatisch aktiv)
- Setze sinnvolle Cooldowns (verhindert Spam)
- Limitiere Leaderboard-Größe auf max. 50

### Engagement
- Setze erreichbare Level-Ziele
- Kommuniziere Belohnungen im Stream
- Zeige Leaderboard regelmäßig
- Feiere Level-Ups der Zuschauer

### Moderation
- Nutze manuelle XP-Vergabe für Events
- Passe XP-Werte bei Bedarf an
- Überwache Top-Viewer auf Missbrauch

## Support

Bei Fragen oder Problemen:
1. Checke diese Anleitung
2. Schaue in die `README.md`
3. Prüfe Server-Logs
4. Öffne ein Issue im Repository

---

**Version**: 1.0.0  
**Plugin-ID**: viewer-xp  
**Dokumentation**: `/plugins/viewer-xp/README.md`
