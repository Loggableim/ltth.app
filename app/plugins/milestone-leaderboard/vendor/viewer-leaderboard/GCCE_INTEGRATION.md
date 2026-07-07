# Viewer XP - GCCE Integration

## Übersicht

Viewer XP ist jetzt vollständig in die **Global Chat Command Engine (GCCE)** integriert. Dies ermöglicht es Zuschauern, ihre XP-Daten und Rankings direkt über Chat-Befehle abzufragen, die dann im **GCCE-HUD Overlay** angezeigt werden.

## Chat-Befehle

### `/xp [benutzername]`

**Beschreibung:** Zeigt den aktuellen XP-Stand, Level und Fortschritt zum nächsten Level an.

**Syntax:**
- `/xp` - Zeigt eigene XP-Daten
- `/xp username` - Zeigt XP-Daten eines anderen Benutzers

**Beispiel:**
```
/xp
→ Zeigt: "YourName: Level 5 | 600/900 XP (66.7%)"

/xp streamer123
→ Zeigt: "streamer123: Level 10 | 1500/2500 XP (60.0%)"
```

**Ausgabe:**
- Wird im GCCE-HUD Overlay angezeigt
- Zeigt Level, aktuellen XP-Fortschritt und Prozent zum nächsten Level
- Verwendet die Namensfarbe des Benutzers (wenn vorhanden)
- Anzeigedauer: 8 Sekunden

---

### `/rank [benutzername]`

**Beschreibung:** Zeigt den Rang des Benutzers auf der Bestenliste an.

**Syntax:**
- `/rank` - Zeigt eigenen Rang
- `/rank username` - Zeigt Rang eines anderen Benutzers

**Beispiel:**
```
/rank
→ Zeigt: "YourName: Rank #15 | Level 8 | 5,420 Total XP"

/rank topviewer
→ Zeigt: "topviewer: Rank #1 | Level 25 | 125,000 Total XP"
```

**Ausgabe:**
- Zeigt Rang auf der Bestenliste
- Zeigt aktuelles Level
- Zeigt gesamte verdiente XP
- Anzeigedauer: 8 Sekunden

---

### `/top [anzahl]`

**Beschreibung:** Zeigt die Top-Zuschauer der Bestenliste an.

**Syntax:**
- `/top` - Zeigt Top 5
- `/top 10` - Zeigt Top 10 (max. 10)

**Beispiel:**
```
/top
→ Zeigt: "🏆 Top 5 Viewers: #1 user1: Lv25 (125,000 XP) | #2 user2: Lv20 (80,000 XP) | ..."

/top 3
→ Zeigt: "🏆 Top 3 Viewers: #1 user1: Lv25 (125,000 XP) | #2 user2: Lv20 (80,000 XP) | #3 user3: Lv18 (65,000 XP)"
```

**Ausgabe:**
- Kompakte Liste der Top-Zuschauer
- Zeigt Rang, Username, Level und Total XP
- Goldene Farbe (#FFD700) für bessere Sichtbarkeit
- Anzeigedauer: 12 Sekunden

---

### `/leaderboard [anzahl]`

**Beschreibung:** Zeigt die vollständige Bestenliste im Leaderboard-Overlay an.

**Syntax:**
- `/leaderboard` - Zeigt Top 10
- `/leaderboard 20` - Zeigt Top 20 (max. 20)

**Beispiel:**
```
/leaderboard
→ Triggert Leaderboard-Overlay mit Top 10 Zuschauern

/leaderboard 15
→ Triggert Leaderboard-Overlay mit Top 15 Zuschauern
```

**Ausgabe:**
- Sendet Event an Leaderboard-Overlay
- Zeigt vollständige Rangliste mit Detailinformationen
- Kann für spezielle Events oder Community-Engagement verwendet werden

## Berechtigungen

Alle XP-System-Befehle sind für **alle Zuschauer** verfügbar:
- Permission Level: `all`
- Keine Einschränkungen
- Kein Cooldown (über GCCE verwaltet)

## GCCE-HUD Integration

### Automatische Anzeige

Wenn ein Befehl ausgeführt wird, erscheinen die Daten automatisch im **GCCE-HUD Overlay**:

1. **Position:** Top-Center (konfigurierbar im GCCE-HUD)
2. **Dauer:** 8-12 Sekunden (je nach Befehl)
3. **Styling:**
   - Große, gut lesbare Schrift
   - Halbtransparenter schwarzer Hintergrund
   - Farbige Benutzernamen (basierend auf Level-Farbe)
   - Responsive Layout

### OBS-Setup

Um das GCCE-HUD zu nutzen:

1. Öffne OBS Studio
2. Füge eine **Browser-Quelle** hinzu
3. URL: `http://localhost:3000/gcce-hud/overlay`
4. Breite: 1920px, Höhe: 1080px
5. Aktiviere "Quelle beim Ausblenden herunterfahren"
6. Positioniere die Quelle in deiner Szene

## Technische Details

### Implementierung

Die GCCE-Integration ist in `/app/plugins/viewer-leaderboard/main.js` implementiert:

- **registerGCCECommands()**: Registriert alle Chat-Befehle bei GCCE
- **handleXPCommand()**: Verarbeitet `/xp` Befehl
- **handleRankCommand()**: Verarbeitet `/rank` Befehl
- **handleTopCommand()**: Verarbeitet `/top` Befehl
- **handleLeaderboardCommand()**: Verarbeitet `/leaderboard` Befehl

### Socket.io Events

Die Befehle senden Daten über Socket.io:

```javascript
io.emit('gcce-hud:show', {
  id: 'unique-id',
  type: 'text',
  content: 'Display text',
  username: 'requester',
  timestamp: Date.now(),
  duration: 8000,
  expiresAt: Date.now() + 8000,
  style: { /* styling options */ }
});
```

### Fehlercodes

- **No XP data found**: Benutzer hat noch keine XP verdient
- **Not found on leaderboard**: Benutzer nicht in Top 1000
- **No leaderboard data**: Noch keine Zuschauer im System
- **GCCE not available**: GCCE-Plugin nicht aktiviert

## Konfiguration

### Plugin-Einstellungen

Viewer XP kann über das Admin Panel konfiguriert werden:

```
http://localhost:3000/viewer-xp/admin
```

Verfügbare Einstellungen:
- XP-Werte pro Aktion
- Cooldowns
- Daily Bonus / Streaks
- Watch Time XP
- Level-Progression

### GCCE-HUD-Einstellungen

Das GCCE-HUD kann separat konfiguriert werden:

```
http://localhost:3000/gcce-hud/ui
```

Verfügbare Einstellungen:
- Text-Farbe und Schriftart
- Hintergrundfarbe
- Anzeigedauer
- Position auf dem Screen
- Maximale Breite

## Verwendungszwecke

### Community-Engagement

1. **Wettbewerbe**: Zuschauer können ihren Rang checken
2. **Motivation**: Fortschritt wird sichtbar gemacht
3. **Transparenz**: Jeder kann Leaderboard einsehen
4. **Gamification**: Zuschauer konkurrieren um Plätze

### Stream-Integration

1. **Chat-Interaktion**: Zuschauer können aktiv teilnehmen
2. **Visual Feedback**: Automatische HUD-Anzeigen
3. **Leaderboard-Reveals**: `/top` für dramatische Reveals
4. **Milestone-Celebration**: Level-Ups werden angezeigt

## Troubleshooting

### Befehle funktionieren nicht

1. Prüfe ob GCCE-Plugin aktiviert ist
2. Prüfe ob Viewer XP Plugin aktiviert ist
3. Checke Browser-Console auf Fehler
4. Stelle sicher Socket.io-Verbindung besteht

### HUD zeigt nichts an

1. Prüfe ob GCCE-HUD-Plugin aktiviert ist
2. Prüfe OBS Browser-Source-URL
3. Checke ob Browser-Source sichtbar ist
4. F12 in OBS Browser-Source öffnen für Debug-Logs

### Falsche Daten angezeigt

1. Prüfe Datenbank: `/user_data/viewer-xp/`
2. Checke ob Daten korrekt synchronisiert werden
3. Prüfe Server-Logs auf Fehler
4. Bei Bedarf Plugin neu laden

## Zukunftserweiterungen

Geplante Features:
- `/stats` - Detaillierte Statistiken
- `/badges` - Badge-Anzeige
- `/streak` - Streak-Info
- `/compare <user1> <user2>` - Benutzervergleich
- Rate Limiting pro Befehl
- Custom Cooldowns
- Permission-basierte Befehle für Mods

## API-Referenz

Siehe auch:
- [GCCE README](../gcce/README.md)
- [GCCE-HUD Plugin](../gcce-hud/main.js)
- [Viewer XP README](README.md)

## Support

Bei Fragen oder Problemen:
1. Prüfe diese Dokumentation
2. Checke Server-Logs
3. Öffne ein Issue im Repository
4. Kontaktiere Support-Team

---

**Version:** 1.0.0  
**Letzte Aktualisierung:** 2024-12-07  
**Status:** ✅ Produktionsbereit
