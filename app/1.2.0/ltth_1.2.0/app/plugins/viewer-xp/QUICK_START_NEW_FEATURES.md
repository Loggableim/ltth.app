# Viewer XP System - Quick Start Guide 🚀

## Neuerungen in diesem Update

### ✅ Behobene Probleme
1. **Viewer-Suche funktioniert jetzt**: Die Suche in der Viewer-Historie zeigt jetzt korrekt formatierte Details an
2. **JSON-Details werden richtig angezeigt**: Alle XP-Transaktionsdetails werden lesbar dargestellt

### 🆕 Neue Features

#### 1. Live Preview System
**Wo:** Admin Panel → "👁️ Live Preview"

**Was du tun kannst:**
- Alle Overlays vor der OBS-Integration testen
- Preview-Größe anpassen (50%, 75%, 100%)
- Test-Events triggern:
  - Level-Up Animation testen
  - XP-Gewinn simulieren
  - Leaderboard aktualisieren
  - User-Profile anzeigen
- OBS URLs direkt kopieren

**So nutzt du es:**
1. Öffne `/viewer-xp/admin`
2. Klicke auf "Live Preview" in der Navigation
3. Wähle ein Overlay aus der Liste
4. Klicke "Copy OBS URL" und füge die URL in OBS als Browser Source ein

#### 2. Erweiterte Level-Konfiguration
**Wo:** Admin Panel → "📈 Level Configuration"

**Progression-Typen:**
- **Exponentiell**: XP steigt exponentiell (Standard, gut für lange Streams)
- **Linear**: Feste XP pro Level (z.B. immer 1000 XP)
- **Custom**: Eigene XP-Werte für jedes Level

**Level-Generator:**
1. Anzahl der Level festlegen (10-999)
2. Start-XP wählen
3. Wachstumsrate auswählen:
   - Slow (1.1x): Langsamer Anstieg
   - Medium (1.2x): Moderater Anstieg ⭐ Empfohlen
   - Fast (1.5x): Schneller Anstieg
   - Extreme (2.0x): Sehr schneller Anstieg
4. "Generate Levels" klicken
5. "Preview Progression" für Vorschau

#### 3. User Profile Overlay
**Neues Overlay:** `/overlay/viewer-xp/user-profile`

**Features:**
- Zeigt detailliertes Viewer-Profil
- Animierte XP-Fortschrittsbalken
- Rang-Badge für Top-Platzierungen
- Stats: Total XP, Streak, Watch Time, Last Seen
- Dynamische Badges
- Auto-Hide nach 10 Sekunden

**Triggern via Chat:**
```
/profile [username]  - Zeigt Profil-Overlay
```

**Test-Modus in OBS:**
```
http://localhost:3000/overlay/viewer-xp/user-profile?test=1
```

#### 4. Neue Chat-Commands

**Für Viewer:**
- `/xp` - Zeigt dein XP, Level und Fortschritt
- `/rank` - Zeigt deinen Rang im Leaderboard
- `/profile` - 🆕 Zeigt dein detailliertes Profil im Overlay
- `/stats` - 🆕 Zeigt umfassende Statistiken im HUD
- `/top [5]` - Zeigt Top 5 Viewer im HUD
- `/leaderboard [10]` - Zeigt Top 10 im Leaderboard-Overlay

**Alle Commands unterstützen optionale Usernamen:**
```
/xp TestUser
/rank TestUser
/profile TestUser
```

#### 5. Verbessertes Leaderboard
**Was ist neu:**
- Moderne Gradient-Hintergründe
- Shimmer-Animationen
- Glühender Titel mit Puls-Effekt
- Verbesserte Rang-Badges mit Animationen
- Hover-Effekte mit Slide & Scale
- Shine-Effekt auf Level-Badges

## Setup-Anleitung

### Schritt 1: Plugin aktivieren
1. Öffne das Dashboard
2. Gehe zu Plugins
3. Aktiviere "Viewer XP System"

### Schritt 2: Grundeinstellungen
1. Öffne `/viewer-xp/admin`
2. Gehe zu "⚙️ XP Settings"
3. Konfiguriere XP-Werte für Aktionen:
   - Chat Message: 10 XP (empfohlen)
   - Like: 2 XP
   - Share: 50 XP
   - Follow: 100 XP
   - Gift Tier 1: 50 XP
   - Gift Tier 2: 150 XP
   - Gift Tier 3: 500 XP
4. Aktiviere Features:
   - ✅ Daily Bonus
   - ✅ Streaks
   - ✅ Watch Time
   - ✅ Announce Level Ups

### Schritt 3: Level-System konfigurieren
1. Gehe zu "📈 Level Configuration"
2. Wähle Progression-Typ (Empfehlung: Exponential für Start)
3. Optional: Generiere Custom Levels mit dem Generator
4. Klicke "Preview Progression" um zu sehen wie es aussieht

### Schritt 4: Overlays in OBS hinzufügen

#### Live Preview nutzen (Empfohlen!)
1. Gehe zu "👁️ Live Preview"
2. Wähle ein Overlay
3. Klicke "Copy OBS URL"
4. In OBS: Quelle hinzufügen → Browser
5. URL einfügen
6. Größe einstellen (siehe unten)

#### Overlay-Größen für OBS:

**XP Bar:**
- Breite: 400px
- Höhe: 100px
- Position: Unten Mitte

**Leaderboard:**
- Breite: 650px
- Höhe: 800px
- Position: Rechts

**Level-Up:**
- Breite: 800px
- Höhe: 600px
- Position: Mitte

**User Profile:**
- Breite: 500px
- Höhe: 700px
- Position: Links oder Mitte

### Schritt 5: GCCE aktivieren
1. Aktiviere das GCCE Plugin (falls noch nicht geschehen)
2. Die Viewer XP Commands werden automatisch registriert
3. Teste mit `/xp` im Chat

## Tipps & Tricks

### Performance-Optimierung
- Das System nutzt Batch-Processing für hohe Viewer-Zahlen
- Cooldowns verhindern XP-Spam
- Watch Time wird alle 30 Sekunden aktualisiert

### Empfohlene Einstellungen für neue Streams
```
Daily Bonus: ✅ Aktiviert (50 XP)
Streaks: ✅ Aktiviert (10 XP pro Tag)
Watch Time: ✅ Aktiviert (5 XP pro Minute)
Chat Message: 10 XP (Cooldown: 10 Sekunden)
Level-Typ: Exponential
```

### Für größere Communities
```
Erhöhe XP-Werte für besseres Engagement:
- Chat Message: 15-20 XP
- Gifts: 2x-3x erhöhen
- Watch Time: 10 XP pro Minute
- Daily Bonus: 100 XP
```

### Viewer motivieren
1. Announcements für Level-Ups aktivieren
2. Spezielle Titel für Milestones (Level 10, 25, 50, 100)
3. Custom Name-Colors für Top-Ranks
4. Badges für Achievements
5. Regelmäßig `/top` Command nutzen um Top-Viewer zu zeigen

## Fehlerbehebung

### "Commands funktionieren nicht"
- Stelle sicher, dass GCCE Plugin aktiviert ist
- Prüfe in den GCCE-Einstellungen ob Commands aktiviert sind
- Restart des Servers kann helfen

### "Overlay wird nicht angezeigt"
1. Prüfe die Browser-Console in OBS (F12)
2. Stelle sicher die URL korrekt ist
3. Teste zuerst im Live Preview
4. Prüfe ob Socket.io connected ist

### "XP wird nicht gespeichert"
- Prüfe ob die Datenbank-Datei schreibbar ist
- Schau in die Logs: `app/logs/`
- Restart des Plugins kann helfen

### "Search funktioniert immer noch nicht"
- Hard-Refresh der Admin-Seite (Ctrl+F5)
- Browser-Cache leeren
- Prüfe Browser-Console auf Fehler

## Nächste Schritte

1. ✅ Teste alle Overlays im Live Preview
2. ✅ Füge Overlays in OBS hinzu
3. ✅ Teste Chat-Commands
4. ✅ Konfiguriere Level-Rewards (optional)
5. ✅ Exportiere Daten als Backup (empfohlen)

## Support

Bei Problemen:
1. Prüfe die Browser-Console (F12)
2. Schau in die Server-Logs
3. Öffne ein Issue auf GitHub
4. Füge Logs und Screenshots hinzu

## Änderungsprotokoll

### Version 1.1.0 (Dieses Update)
- ✅ Viewer-Suche repariert
- ✅ Live Preview System
- ✅ Erweiterte Level-Konfiguration
- ✅ User Profile Overlay
- ✅ 2 neue Chat-Commands (/profile, /stats)
- ✅ Verbessertes Leaderboard mit Animationen
- ✅ Bessere JSON-Details-Anzeige
- ✅ Umfassende Dokumentation

### Version 1.0.0
- Grundlegendes XP-System
- XP Bar, Leaderboard, Level-Up Overlays
- Admin Panel
- GCCE Integration
- Import/Export

---

**Viel Erfolg mit dem erweiterten Viewer XP System! 🎮**

Bei Fragen oder Problemen einfach melden!
