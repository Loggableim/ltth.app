# LTTH Game Engine Plugin

## Beschreibung

Das **LTTH Game Engine Plugin** ermöglicht es Streamern, interaktive Spiele mit ihren Zuschauern während TikTok LIVE Streams zu spielen. Zuschauer können über Chat-Befehle oder Geschenke teilnehmen und werden mit XP belohnt.

## Features

### 🎮 Aktuell verfügbare Spiele

#### Connect4 (Vier Gewinnt)
- Klassisches Vier-Gewinnt-Spiel mit 7 Spalten (A-G) und 6 Reihen
- Zuschauer spielen gegen den Streamer
- Chat-Steuerung über Buchstaben (A-G) oder Befehle (!c4 A)
- Echtzeit-Overlay mit animierten Spielsteinen
- Automatische Gewinn-Erkennung (horizontal, vertikal, diagonal)

#### ♟️ Chess (Blitzschach)
- Vollständiges Schachspiel mit Zeitkontrolle
- Standard-Schachregeln (En Passant, Rochade, Bauernumwandlung)
- Verschiedene Zeitformate (3+0, 5+0, 10+5, etc.)
- ELO-Rating System
- PGN-Export für Spielanalyse

#### 🎰 Plinko (NEU!)
- Physikbasiertes Glücksspiel mit Matter.js
- Zuschauer setzen XP und lassen Bälle fallen
- Verschiedene Multiplikatoren (0x bis 10x)
- Echtzeit-Physik-Simulation mit Neon-Cyberpunk Design
- Geschenk-Trigger für besondere Bälle (z.B. goldener Ball mit 2x Multiplikator)
- Live-Statistiken (RTP, durchschnittlicher Multiplikator, höchster Gewinn)
- Optimiert für 50+ gleichzeitige Bälle

### 🎯 Hauptfunktionen

- **Chat-Integration**: GCCE (Global Chat Command Engine) Integration für Chat-Befehle
- **Geschenk-Trigger**: Spiele können durch spezifische TikTok-Geschenke gestartet werden
- **XP-Belohnungen**: Automatische XP-Vergabe an Zuschauer (Sieg, Niederlage, Unentschieden, Teilnahme)
- **Anpassbare Overlays**: Farben, Schriftarten und Animationen konfigurierbar
- **Backend-UI**: Streamer-Panel zur Spielsteuerung und Konfiguration
- **Echtzeit-Updates**: Socket.io für sofortige Spielzug-Aktualisierungen
- **Statistiken**: Tracking von gespielten Spielen und Spieler-Statistiken
- **Erweiterbar**: Modulare Architektur für zukünftige Spiele (Schach, Mensch ärgere dich nicht, etc.)

### 🆕 Neue Features (v1.1)

- **Kompaktes HUD**: Kleines Status-Overlay für permanente Anzeige in OBS
  - Zeigt aktuelle Spieler und wer am Zug ist
  - Anpassbare Position (Ecken, Mitte)
  - Minimaler Modus verfügbar
  - Auto-Hide Option wenn kein Spiel aktiv
- **Sound-Effekte**: Audioeffekte für Spielzüge, Siege und Unentschieden
  - Einstellbare Lautstärke
  - Kann deaktiviert werden
- **Siegesserien-Tracking**: Verfolgt Gewinnserien der Spieler
  - Zeigt aktuelle Siegesserie an
  - Speichert beste Siegesserie
  - Anzeige im Overlay nach Sieg
  - Leaderboard für beste Serien
- **Konfetti-Effekt**: Visuelle Feier bei Sieg
  - Animierte Konfetti fallen vom Himmel
  - Kann deaktiviert werden
- **Erweiterte Statistiken**: Detaillierte Spielerstatistiken
  - Gespielte Spiele
  - Siege/Niederlagen/Unentschieden
  - Aktuelle Siegesserie
  - Beste Siegesserie
  - Verdiente XP
  - Letztes Spiel

### 🆕 Neue Features (v1.2)

- **Challenge Flow**: Interaktive Herausforderungs-Mechanik
  - "New Challenger!" Bildschirm wenn Zuschauer ein Geschenk sendet
  - Zeigt Geschenkbild und Namen des Herausforderers
  - Countdown-Timer bis Spielstart
  - Konfigurierbare Timeout-Zeit (Standard: 30 Sekunden)
  - Automatischer Start gegen Streamer nach Timeout
  - Optional deaktivierbar für sofortigen Spielstart
- **Leaderboard-Rotation**: Automatische Anzeige nach Spielende
  - Tägliches Leaderboard (Spiele des Tages)
  - Saison-Leaderboard (aktueller Monat)
  - Allzeit-Leaderboard (alle Spiele)
  - Rotierende Anzeige (Standard: 3 Sekunden pro Board)
  - Konfigurierbare Anzeigezeit
  - Auswählbare Leaderboard-Typen
  - Automatisches Ausblenden nach Rotation
- **Geschenk-Katalog**: Verbesserte Gift-Auswahl
  - Visueller Katalog mit Geschenkbildern
  - "Katalog aktualisieren" Button
  - Schnelle Auswahl per Klick
  - Ähnlich zum Soundboard-System
  - Zeigt Geschenk-ID und Name
- **Auto-Hide HUD**: HUD verschwindet nach Spielende automatisch
  - Wartet bis Leaderboards durchgelaufen sind
  - Sanfte Ausblend-Animation

## Installation

1. Das Plugin befindet sich bereits im Plugins-Verzeichnis: `/app/plugins/game-engine/`
2. Plugin aktivieren im Admin-Panel unter "Plugins"
3. Konfiguration öffnen: `/game-engine/ui`

## Konfiguration

### 1. Basis-Einstellungen (Tab: Einstellungen)

#### Spielfeld-Design
- **Spielfeld-Farbe**: Hintergrundfarbe des Spielbretts
- **Spieler 1 Farbe**: Farbe der Zuschauer-Spielsteine (Standard: Rot)
- **Spieler 2 Farbe**: Farbe der Streamer-Spielsteine (Standard: Gelb)
- **Text-Farbe**: Farbe für Texte und Beschriftungen
- **Schriftart**: CSS-Schriftart für das Overlay
- **Koordinaten anzeigen**: Zeige/Verstecke Spaltenbeschriftungen (A-G)
- **Animations-Geschwindigkeit**: Geschwindigkeit der Spielstein-Animation (ms)
- **Streamer Rolle**: Wähle ob Streamer Spieler 1 (Rot) oder Spieler 2 (Gelb) ist

#### Challenge Flow Einstellungen (NEU v1.2)
- **Challenge-Bildschirm anzeigen**: Aktiviert/Deaktiviert den "New Challenger!" Bildschirm
  - Wenn deaktiviert: Spiel startet sofort nach Geschenk
  - Wenn aktiviert: Zeigt Herausforderungs-Bildschirm mit Countdown
- **Challenge-Timeout (Sekunden)**: Zeit bis der Herausforderer gegen den Streamer spielt
  - Standard: 30 Sekunden
  - Bereich: 5-120 Sekunden
  - Nach Ablauf startet das Spiel automatisch gegen den Streamer

#### Leaderboard Einstellungen (NEU v1.2)
- **Leaderboard nach Spiel anzeigen**: Aktiviert/Deaktiviert automatische Leaderboard-Anzeige
- **Anzeigezeit pro Leaderboard (Sekunden)**: Dauer jedes Leaderboards
  - Standard: 3 Sekunden
  - Bereich: 1-10 Sekunden
- **Anzuzeigende Leaderboards**: Wähle welche Boards angezeigt werden
  - ☑ Täglich: Spiele und Siege des heutigen Tages
  - ☑ Saison: Spiele und Siege des aktuellen Monats
  - ☑ Allzeit: Gesamtstatistik aller Spiele

### 2. Spiel-Trigger (Tab: Trigger)

Definiere, wie Spiele gestartet werden:

- **Geschenke**: Bestimmte TikTok-Geschenke starten ein Spiel
  - Beispiel: "Rose", "Galaxy", etc.
- **Chat-Befehle**: Befehle im Chat starten ein Spiel
  - Beispiel: "!play", "!c4", etc.

**Trigger hinzufügen:**
1. Spiel-Typ auswählen (Connect4)
2. Trigger-Typ wählen (Geschenk oder Befehl)
3. Trigger-Wert eingeben (z.B. "Rose" oder "!play")
4. "Trigger hinzufügen" klicken

### 3. XP-Belohnungen (Tab: XP-Belohnungen)

Konfiguriere XP-Vergabe für Zuschauer:

- **XP für Sieg**: Belohnung beim Gewinn (Standard: 100 XP)
- **XP für Niederlage**: Belohnung bei Verlust (Standard: 25 XP)
- **XP für Unentschieden**: Belohnung bei Unentschieden (Standard: 50 XP)
- **XP für Teilnahme**: Basis-Belohnung für die Teilnahme (Standard: 10 XP)

## Verwendung

### Für Streamer

#### Spiel starten:
1. Zuschauer sendet konfiguriertes Geschenk oder Chat-Befehl
2. Spiel startet automatisch
3. Overlay wird eingeblendet

#### Züge machen:
- Im Backend-Panel (Tab: Aktives Spiel) auf Spalte A-G klicken
- Der Spielstein fällt automatisch in die unterste freie Reihe

#### Spiel beenden:
- Spiel endet automatisch bei Sieg, Niederlage oder Unentschieden
- Manuell abbrechen: "Spiel abbrechen" Button im Backend

### Für Zuschauer

#### Spiel beitreten:
- Sende konfiguriertes Geschenk ODER
- Schreibe konfigurierten Chat-Befehl

#### Züge machen:
**Variante 1 (einfach):** Nur Buchstabe
```
A
```

**Variante 2 (mit Befehl):** Mit Präfix
```
!c4 A
```

**Variante 3 (GCCE):** Wenn GCCE aktiviert
```
!c4 A
```

Der Spielstein fällt in die gewählte Spalte (A-G) und landet in der untersten freien Reihe.

## Overlay einrichten

### OBS Studio - Hauptspiel-Overlay

1. **Quelle hinzufügen**: Browser-Quelle
2. **URL**: `http://localhost:3000/overlay/game-engine/connect4`
3. **Breite**: 1920 (oder Ihre Auflösung)
4. **Höhe**: 1080 (oder Ihre Auflösung)
5. **Benutzerdefiniertes CSS** (optional):
   ```css
   body { background-color: rgba(0, 0, 0, 0); }
   ```

### OBS Studio - Kompaktes HUD 🆕

Das kompakte HUD zeigt den aktuellen Spielstatus in einer kleinen Box an und kann permanent eingeblendet bleiben.

1. **Quelle hinzufügen**: Browser-Quelle
2. **URL**: `http://localhost:3000/overlay/game-engine/hud`
3. **Breite**: 400
4. **Höhe**: 300

#### HUD URL-Parameter

Passe das HUD mit URL-Parametern an:

**Position:**
- `?position=top-left` - Oben links (Standard)
- `?position=top-right` - Oben rechts
- `?position=bottom-left` - Unten links
- `?position=bottom-right` - Unten rechts
- `?position=center` - Oben mittig

**Weitere Optionen:**
- `&minimal=true` - Kompaktere Ansicht ohne Statistiken
- `&hideWhenInactive=true` - HUD nur anzeigen wenn Spiel aktiv

**Beispiele:**
```
http://localhost:3000/overlay/game-engine/hud?position=bottom-right&minimal=true
http://localhost:3000/overlay/game-engine/hud?position=top-left&hideWhenInactive=true
```

### 🧪 Offline Test-Modus (NEU!)

Alle Overlays unterstützen jetzt einen **Test-Modus**, mit dem du Spiele direkt im OBS-Overlay testen kannst, ohne TikTok-Chat-Befehle oder Geschenke zu benötigen!

### 🎯 Unified Queue System (NEU!)

Plinko und Glücksrad (Wheel) teilen sich jetzt eine **einheitliche Warteschlange**:
- FIFO (First-In-First-Out) Reihenfolge für beide Spiele
- Verhindert Konflikte zwischen Plinko-Drops und Wheel-Spins
- Automatische Verarbeitung mit intelligenter Priorität
- Siehe `UNIFIED_QUEUE_IMPLEMENTATION.md` für technische Details

#### Test-Modus aktivieren

Füge einfach `?testMode=true` zur Overlay-URL hinzu:

**Connect4 Test-Modus:**
```
http://localhost:3000/overlay/game-engine/connect4?testMode=true
```

**Plinko Test-Modus:**
```
http://localhost:3000/overlay/game-engine/plinko?testMode=true
```

**Wheel (Glücksrad) Test-Modus:**
```
http://localhost:3000/overlay/game-engine/wheel?testMode=true
```

**Chess Test-Modus:**
```
http://localhost:3000/overlay/game-engine/chess?testMode=true
```
*(Hinweis: Schach erfordert die Admin-UI für manuelle Spiele)*

#### Test-Modus Funktionen

Wenn der Test-Modus aktiviert ist, erscheint ein **Kontrollpanel** in der oberen rechten Ecke des Overlays mit folgenden Funktionen:

**Connect4:**
- "Start Test Game" Button zum Starten eines Test-Spiels
- Spalten-Buttons (A-G) zum direkten Platzieren von Spielsteinen
- Automatische Spieler-Wechsel
- "End Test Game" Button zum Beenden

**Plinko:**
- Einsatz-Betrag eingeben (10-1000 XP)
- Spielername anpassen
- "Drop Ball" Button zum Abwerfen eines Test-Balls
- Mehrere Bälle gleichzeitig möglich

**Wheel (Glücksrad):**
- Spielername eingeben
- "Spin Wheel" Button zum Drehen des Rads
- Funktioniert wie ein normaler Spin

#### Verwendung im OBS

1. Erstelle eine Browser-Quelle in OBS
2. Füge die Overlay-URL mit `?testMode=true` Parameter hinzu
3. Das Kontrollpanel erscheint automatisch im Overlay
4. Teste alle Funktionen direkt in OBS ohne Live-Chat
5. Für die finale Stream-Einrichtung, entferne `?testMode=true` aus der URL

**Tipp:** Du kannst Test-Modus mit anderen URL-Parametern kombinieren:
```
http://localhost:3000/overlay/game-engine/connect4?testMode=true&position=center
```

### Empfohlene Einstellungen

- **Position**: Zentriert oder nach Wunsch
- **Größe**: Skalierung 100% oder nach Bedarf
- **Transparenz**: Aktiviert (für transparenten Hintergrund)

## 🎨 Overlay Modes (v2.0)

Das Game Engine Plugin bietet nun zwei Overlay-Modi für maximale Flexibilität:

### Unified Overlay (Empfohlen) ✅

**Ein OBS Browser Source für alle Spiele:**
```
http://localhost:3000/overlay/game-engine/unified
```

**Vorteile:**
- ✅ Automatisches Umschalten zwischen Spielen
- ✅ Queue-Management integriert
- ✅ Bessere Performance (weniger Browser-Instanzen)
- ✅ Kein manuelles Ein-/Ausblenden in OBS
- ✅ Smooth Transitions zwischen Spielen

**Setup:**
1. Admin UI öffnen → "⚙️ Overlay Mode" Tab
2. Spiele für Unified Overlay aktivieren (Standard: alle aktiviert)
3. Eine Browser Source in OBS mit obiger URL erstellen
4. Fertig! Alle aktivierten Spiele werden automatisch umgeschaltet

**OBS Einstellungen:**
- Breite: 1920
- Höhe: 1080
- Benutzerdefiniertes CSS: `body { background-color: rgba(0, 0, 0, 0); }`

### Legacy Mode ⚠️

**Separate OBS Browser Sources pro Spiel:**
```
http://localhost:3000/overlay/game-engine/connect4
http://localhost:3000/overlay/game-engine/chess
http://localhost:3000/overlay/game-engine/plinko
http://localhost:3000/overlay/game-engine/wheel
```

**Wann nutzen:**
- Du möchtest verschiedene Szenen pro Spiel
- Du brauchst individuelle Positionierung
- Kompatibilität mit bestehendem Setup

**Setup:**
1. Admin UI öffnen → "⚙️ Overlay Mode" Tab
2. Spiele für Legacy Mode deaktivieren (Toggle auf "Legacy" setzen)
3. Separate Browser Sources in OBS erstellen
4. Manuell zwischen Quellen wechseln wenn Spiel wechselt

### Overlay Mode Einstellungen

Im Admin UI unter "⚙️ Overlay Mode" kannst du für jedes Spiel individuell wählen:

- **🔴 Connect4**: Unified ✅ / Legacy ⚠️
- **♟️ Chess**: Unified ✅ / Legacy ⚠️
- **🎰 Plinko**: Unified ✅ / Legacy ⚠️
- **🎡 Wheel**: Unified ✅ / Legacy ⚠️

**Hinweis:** Du kannst die Modi auch mischen! Zum Beispiel:
- Connect4 & Chess im Unified Mode
- Plinko & Wheel im Legacy Mode

Die Einstellungen werden sofort übernommen und persistent gespeichert.

## Technische Details

### Datenbankstruktur

Das Plugin erstellt folgende Tabellen:

- `game_sessions`: Spiel-Sessions mit Spielern und Status
- `game_moves`: Spielzug-Historie
- `game_configs`: Spiel-Konfigurationen
- `game_triggers`: Geschenk/Befehl-Trigger
- `game_xp_rewards`: XP-Belohnungs-Konfiguration

### API-Endpunkte

**Konfiguration:**
- `GET /api/game-engine/config/:gameType` - Konfiguration abrufen
- `POST /api/game-engine/config/:gameType` - Konfiguration speichern

**Trigger:**
- `GET /api/game-engine/triggers/:gameType?` - Trigger abrufen
- `POST /api/game-engine/triggers` - Trigger hinzufügen
- `DELETE /api/game-engine/triggers/:triggerId` - Trigger entfernen

**XP-Belohnungen:**
- `GET /api/game-engine/xp-rewards/:gameType` - XP-Belohnungen abrufen
- `POST /api/game-engine/xp-rewards/:gameType` - XP-Belohnungen speichern

**Spiel-Sessions:**
- `GET /api/game-engine/active-session` - Aktive Session abrufen
- `GET /api/game-engine/stats/:gameType?` - Spielstatistiken abrufen

**Spieler-Statistiken 🆕:**
- `GET /api/game-engine/player-stats/:username` - Basis-Statistiken abrufen
- `GET /api/game-engine/player-stats-detailed/:username/:gameType?` - Detaillierte Statistiken mit Serien
- `GET /api/game-engine/streak-leaderboard/:gameType?` - Serien-Rangliste abrufen
  - Query-Parameter: `?limit=10` (Standard: 10)

### Socket.io Events

**Client → Server:**
- `game-engine:streamer-move` - Streamer macht Zug
- `game-engine:cancel-game` - Spiel abbrechen

**Server → Client:**
- `game-engine:game-started` - Spiel gestartet
- `game-engine:move-made` - Zug gemacht
- `game-engine:game-ended` - Spiel beendet
- `game-engine:config-updated` - Konfiguration aktualisiert
- `game-engine:error` - Fehler aufgetreten
- `game-engine:new-streak-record` 🆕 - Neue Serien-Bestmarke erreicht

## Erweiterbarkeit

Das Plugin ist so konzipiert, dass weitere Spiele einfach hinzugefügt werden können:

### Neues Spiel hinzufügen

1. **Spiel-Logik erstellen**: `/games/neues-spiel.js`
2. **Overlay erstellen**: `/overlay/neues-spiel.html`
3. **In main.js integrieren**: Spiel-Initialisierung und Routing
4. **Konfiguration erweitern**: Default-Configs und UI-Panel

### Geplante Spiele

- ♟️ **Schach**: Klassisches Schachspiel
- 🎲 **Mensch ärgere dich nicht**: Multiplayer-Brettspiel
- 🎯 **Tic-Tac-Toe**: Schnelles Strategiespiel
- 🃏 **Memory**: Gedächtnisspiel
- 🎰 **Slot Machine**: Glücksspiel mit Geschenk-Integration

## Fehlerbehebung

### Spiel startet nicht
- Prüfe ob Trigger korrekt konfiguriert sind
- Prüfe ob Plugin aktiviert ist
- Prüfe Browser-Konsole auf Fehler

### Overlay wird nicht angezeigt
- Prüfe URL in OBS: `http://localhost:3000/overlay/game-engine/connect4`
- Prüfe ob Plugin aktiviert und initialisiert ist
- Aktualisiere Browser-Quelle in OBS (F5)

### Züge werden nicht registriert
- Prüfe ob Zuschauer am Zug ist (Status im Overlay/Backend)
- Prüfe Chat-Befehls-Format (A-G oder !c4 A)
- Prüfe GCCE-Konfiguration wenn aktiviert

### XP wird nicht vergeben
- Prüfe ob Viewer-Leaderboard Plugin aktiviert ist
- Prüfe XP-Belohnungs-Konfiguration
- Prüfe Logs für Fehler

## Support & Entwicklung

- **Plugin-ID**: `game-engine`
- **Version**: 1.0.0
- **Autor**: Pup Cid
- **Lizenz**: CC-BY-NC-4.0

### Logs

Plugin-Logs sind im Haupt-Logger verfügbar. Achte auf:
- `🎮 Initializing LTTH Game Engine Plugin...`
- `✅ LTTH Game Engine initialized successfully`
- Spiel-Start/Ende-Nachrichten

## Changelog

### Version 1.1.1 (Dezember 2024) 🔧 Bugfix Release
- ✅ **CSP-Probleme behoben**: Alle Buttons in der Admin-UI funktionieren jetzt
  - Inline onclick-Handler durch Event-Listener ersetzt (16 Event-Listener)
  - CSP-konforme Implementierung ohne Security-Verletzungen
- ✅ **Connect4 eigener Tab**: Bessere Organisation der Einstellungen
  - "Einstellungen"-Tab wurde zu dediziertem "Connect4"-Tab
  - Vorbereitet für zukünftige Spiele mit eigenen Tabs
- ✅ **Nur ein aktives Spiel**: Game Engine erlaubt nur noch ein Spiel gleichzeitig
  - Verhindert Konflikte wenn mehrere Geschenke gleichzeitig gesendet werden
  - Neues Event: `game-engine:game-blocked` mit Grund und Nachricht
- ✅ **JSON.parse Fehler behoben**: Robustere Fehlerbehandlung in loadStats()
  - Behandelt leere Responses korrekt
  - Zeigt benutzerfreundliche Fehlermeldungen
- 📝 Umfassende Dokumentation der Änderungen (siehe CSP_AND_UI_FIXES_SUMMARY.md)

### Version 1.1.0 (Feature Update) 🆕
- ✅ Kompaktes HUD-Overlay für OBS mit konfigurierbarer Position
- ✅ Sound-Effekte für Züge, Siege und Unentschieden
- ✅ Siegesserien-Tracking (aktuelle und beste Serie)
- ✅ Konfetti-Effekt bei Sieg
- ✅ Erweiterte Spielerstatistiken mit Siegesserien
- ✅ Serien-Rangliste API
- ✅ Neue Socket-Events für Serien-Rekorde
- ✅ Verbesserte Datenbankstruktur
- ✅ Anpassbare Sound-Lautstärke
- ✅ Auto-Hide HUD Option

### Version 1.0.0 (Initial Release)
- ✅ Connect4 (Vier Gewinnt) implementiert
- ✅ GCCE Chat-Integration
- ✅ Geschenk-Trigger Support
- ✅ XP-Belohnungssystem
- ✅ Anpassbares Overlay
- ✅ Backend-UI Panel
- ✅ Echtzeit-Updates via Socket.io
- ✅ Statistik-Tracking
- ✅ Modulare Spiel-Architektur

## Zukünftige Features

- [ ] Multiplayer-Support (mehrere Zuschauer gegeneinander)
- [ ] Turnier-Modus
- [ ] Erweiterte Ranglisten-Integration
- [ ] Achievements/Badges
- [ ] Replay-System
- [ ] Zuschauer-Kommentare im Overlay
- [ ] Mehr Sound-Effekte und Musik
- [x] Mehr Spiele (Schach, Plinko)
- [ ] Mobile-optimierte Overlays
- [ ] Individuelle Spieler-Avatare im Overlay
- [ ] Chat-Befehle für Statistik-Abfragen
- [ ] Rematch-Funktion
- [ ] KI-Gegner für Übungsmodus

---

## 🎰 Plinko - Ausführliche Anleitung

### Was ist Plinko?

Plinko ist ein servergesteuertes Glücksspiel, bei dem Zuschauer XP setzen können, um einen Ball fallen zu lassen. Der Server bestimmt den Ergebnis-Slot vor der Animation mit einer zentrierten Plinko-Verteilung; das Overlay visualisiert diesen bereits feststehenden Ausgang über die Pegs und Slots.

### Funktionsweise

1. **Einsatz tätigen**: Zuschauer verwenden den Befehl `!plinko <betrag>` um XP zu setzen
2. **Ball fällt**: Ein Ball mit dem Namen und Profilbild des Zuschauers wird spawnt und fällt durch die Pegs
3. **Landung**: Das Overlay zeigt den vom Server vorgegebenen Ergebnis-Slot
4. **Auszahlung**: Der Gewinn wird berechnet (Einsatz × Multiplikator) und dem Zuschauer gutgeschrieben

### Chat-Befehle

- `!plinko <betrag>` - Setze eine bestimmte Menge XP (z.B. `!plinko 100`)
- `!plinko max` - Setze alle deine verfügbaren XP auf einmal

### Konfiguration

#### Slot-Editor
Im Admin UI kannst du folgende Einstellungen für jeden Slot anpassen:
- **Multiplikator**: Wert zwischen 0 und 100 (z.B. 0.2, 1.0, 5.0, 10.0)
- **Farbe**: Visuelle Farbe des Slots im Overlay
- **Anzahl Slots**: Füge Slots hinzu oder entferne sie (mindestens 3 erforderlich)

Empfohlene Slot-Konfiguration für ausgewogenes RTP (~95-105%):
```
[0.2x, 0.5x, 1.0x, 2.0x, 5.0x, 10.0x, 5.0x, 2.0x, 1.0x, 0.5x, 0.2x]
```

#### Physik-Einstellungen
- **Schwerkraft**: Wie schnell der Ball fällt (0.1 - 3.0, Standard: 1.0)
- **Ball-Elastizität**: Wie stark der Ball abprallt (0.1 - 1.0, Standard: 0.6)
- **Peg-Elastizität**: Elastizität der Pegs (0.1 - 1.0, Standard: 0.8)
- **Anzahl Peg-Reihen**: Mehr Reihen = längere Fallzeit (8 - 16, Standard: 12)
- **Peg-Abstand**: Abstand zwischen Pegs in Pixeln (40 - 100, Standard: 60)

#### Geschenk-zu-Ball Mapping
Verknüpfe TikTok-Geschenke mit automatischen Plinko-Bällen:
- **Geschenk-Name**: Name des TikTok-Geschenks (z.B. "Rose", "Lion")
- **Einsatz (XP)**: Wie viel XP wird bei diesem Geschenk gesetzt
- **Ball-Typ**: 
  - Standard: Normaler Ball
  - Golden: Goldener Ball mit 2x globalem Multiplikator (alle Slot-Multiplikatoren werden verdoppelt)

Beispiel:
- Rose → 100 XP, Standard Ball
- Lion → 500 XP, Goldener Ball (2x Multiplikator)

### OBS Integration

1. Füge eine Browser-Quelle in OBS hinzu
2. URL: `http://localhost:3000/overlay/game-engine/plinko`
3. Breite: 1920, Höhe: 1080
4. Benutzerdefiniertes CSS: `body { background-color: rgba(0, 0, 0, 0); }`
5. Hardware-Beschleunigung aktivieren (für bessere Physik-Performance)

### Statistiken

Das Plinko-System trackt folgende Statistiken:
- **Total XP Bet**: Gesamtmenge an gesetzten XP
- **Total XP Paid Out**: Gesamtmenge an ausgezahlten XP
- **RTP (Return to Player)**: Prozentsatz der ausgezahlten XP im Verhältnis zu gesetzten XP
- **Durchschnittlicher Multiplikator**: Durchschnitt aller gelanden Multiplikatoren
- **Höchster Gewinn**: Größter Net-Gewinn (Auszahlung - Einsatz)

### Performance-Optimierung

Das Plinko-System ist für hohe Performance optimiert:
- **Batching**: Mehrere Bälle können gleichzeitig fallen
- **Memory Management**: Bälle werden nach 3 Sekunden automatisch aus dem Overlay entfernt
- **Cleanup System**: Stuck balls werden nach 2 Minuten automatisch entfernt und refunded
- **60 FPS Rendering**: Flüssige Physik-Simulation dank Matter.js

Getestet mit 50+ gleichzeitigen Bällen ohne Performance-Einbußen.

### Sicherheit

- **Bet-Validierung**: Negative Einsätze und Einsätze über dem verfügbaren XP werden abgelehnt
- **XP-Deduktion**: XP wird sofort beim Ball-Spawn abgezogen (kein Double-Spending möglich)
- **Serverautoritatives Ergebnis**: Der Auszahlungsslot wird vor dem Overlay-Rendern auf dem Server festgelegt; Browserdaten können das Ergebnis nicht verändern
- **OpenShock-Trennung**: Plinko-Ergebnisse lösen keine Hardwareaktion automatisch aus; vorhandene Regeln erzeugen ausschließlich einen Review-Hinweis für den Streamer
- **Refund-System**: Bei technischen Problemen (stuck balls) wird der Einsatz automatisch zurückerstattet

### Troubleshooting

**Problem**: Bälle spawnen nicht
- Lösung: Prüfe ob das Viewer XP Plugin aktiviert ist und der User genug XP hat

**Problem**: Overlay zeigt keine Pegs/Slots
- Lösung: Stelle sicher dass die Plinko-Konfiguration gespeichert wurde (Admin UI → Plinko Tab → Einstellungen speichern)

**Problem**: Physik ist zu schnell/langsam
- Lösung: Passe die Schwerkraft-Einstellung im Admin UI an (niedrigerer Wert = langsamer)

**Problem**: Bälle bleiben hängen
- Lösung: Das System entfernt automatisch stuck balls nach 2 Minuten und refunded den Einsatz

### Entwickler-Hinweise

Wenn du eigene Plinko-Features entwickeln möchtest:
- Game Logic: `/app/plugins/game-engine/games/plinko.js`
- Overlay: `/app/plugins/game-engine/overlay/plinko.html`
- Database: `/app/plugins/game-engine/backend/database.js` (Plinko-spezifische Methoden)
- Main Integration: `/app/plugins/game-engine/main.js` (Socket events, GCCE commands, API routes)
