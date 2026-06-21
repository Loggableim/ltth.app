# Game Engine Plugin - Test Plan

## Automatisierte Tests

### Jest Tests (wenn vorhanden)
```bash
cd /home/runner/work/ltth_desktop2/ltth_desktop2/app
npm test -- plugins/game-engine
```

### Plugin-spezifische Tests
```bash
cd /home/runner/work/ltth_desktop2/ltth_desktop2/app/plugins/game-engine
node test/connect4.test.js
node test/challenge-flow.test.js
```

## Manuelle Tests

### 1. CSP-Konformität und UI-Funktionalität

#### Test 1.1: Admin UI lädt ohne CSP-Fehler
**Schritte:**
1. Server starten: `cd app && node server.js`
2. Browser öffnen: `http://localhost:3000/game-engine/ui`
3. Browser DevTools öffnen (F12)
4. Console-Tab prüfen

**Erwartetes Ergebnis:**
- ✅ UI lädt vollständig
- ✅ Keine CSP-Verletzungen in der Console
- ✅ Keine Fehler wie "Content-Security-Policy: The page's settings blocked an event handler"
- ✅ Alle Tabs sind sichtbar und anklickbar

#### Test 1.2: Connect4 Tab existiert und ist funktional
**Schritte:**
1. In Admin UI: Click auf "Connect4"-Tab
2. Prüfe dass Tab aktiviert wird (grüne Farbe)
3. Scrolle durch alle Connect4-Einstellungen

**Erwartetes Ergebnis:**
- ✅ "Connect4"-Tab existiert (nicht mehr "Einstellungen")
- ✅ Tab-Wechsel funktioniert
- ✅ Alle Connect4-spezifischen Einstellungen sind sichtbar:
  - Spielfeld-Farbe
  - Spieler 1/2 Farben
  - Text-Farbe
  - Schriftart
  - Koordinaten anzeigen
  - Animations-Geschwindigkeit
  - Streamer Rolle
  - Challenge Flow Einstellungen
  - Leaderboard Einstellungen
  - Round Timer Einstellungen

#### Test 1.3: Einstellungen speichern funktioniert
**Schritte:**
1. Im Connect4-Tab: Ändere Spielfeld-Farbe auf #FF0000 (rot)
2. Click auf "Einstellungen speichern"
3. Warte auf Success-Meldung
4. Seite neu laden (F5)
5. Connect4-Tab öffnen
6. Spielfeld-Farbe prüfen

**Erwartetes Ergebnis:**
- ✅ Button "Einstellungen speichern" ist klickbar
- ✅ Grüne Success-Meldung erscheint: "Einstellungen gespeichert!"
- ✅ Nach Reload ist die Farbe noch auf #FF0000 gesetzt
- ✅ Keine JavaScript-Fehler in Console

#### Test 1.4: Trigger-Management funktioniert
**Schritte:**
1. "Trigger"-Tab öffnen
2. Click auf "📦 Geschenk-Katalog öffnen"
3. Modal öffnet sich
4. Click auf "✕" zum Schließen
5. Click auf "🔄 Katalog aktualisieren"
6. Warte auf Meldung

**Erwartetes Ergebnis:**
- ✅ Alle Buttons sind klickbar
- ✅ Modal öffnet und schließt korrekt
- ✅ Keine CSP-Fehler
- ✅ Katalog-Aktualisierung zeigt Feedback

#### Test 1.5: XP und ELO Einstellungen speichern
**Schritte:**
1. "XP-Belohnungen"-Tab: Ändere "XP für Sieg" auf 999
2. Click "XP-Belohnungen speichern"
3. "ELO System"-Tab: Ändere "Start ELO Rating" auf 1500
4. Click "ELO Einstellungen speichern"

**Erwartetes Ergebnis:**
- ✅ Beide Speichern-Buttons funktionieren
- ✅ Success-Meldungen erscheinen
- ✅ Nach Reload sind Werte gespeichert

#### Test 1.6: Media Upload/Delete Buttons
**Schritte:**
1. "Media"-Tab öffnen
2. Scrolle durch alle Media-Event-Sections
3. Prüfe dass alle "Upload Custom" und "Zurück zu Default" Buttons vorhanden sind

**Erwartetes Ergebnis:**
- ✅ Mindestens 7 Upload/Delete Button-Paare vorhanden:
  - New Challenger
  - Challenge Accepted
  - Player 1 Wins
  - Player 2 Wins
  - Game Over
  - Piece Drop
  - Timer Warning
- ✅ Buttons sind klickbar (auch wenn Upload noch nicht vollständig implementiert)

### 2. Nur ein aktives Spiel

#### Test 2.1: Zweites Spiel wird blockiert
**Voraussetzungen:**
- Plugin aktiviert
- Mindestens ein Trigger konfiguriert (z.B. Rose = Connect4)

**Schritte:**
1. TikTok LIVE verbinden oder simulieren
2. Geschenk senden das Connect4 triggert (z.B. Rose)
3. Warten bis Challenge/Spiel startet
4. **SOFORT** ein weiteres Geschenk senden (gleich oder anderes)
5. Logs und Console prüfen

**Erwartetes Ergebnis:**
- ✅ Erstes Spiel startet normal
- ✅ Zweites Geschenk wird blockiert
- ✅ Log-Nachricht: "Cannot start new game: Another game is already active"
- ✅ Socket-Event wird emittiert: `game-engine:game-blocked`
- ✅ Event enthält: `{ reason: 'active_game_exists', message: '...' }`

#### Test 2.2: Pending Challenge blockiert neue Spiele
**Schritte:**
1. Challenge-Screen aktiviert in Settings (`showChallengeScreen: true`)
2. Geschenk senden → Challenge wird erstellt
3. **WÄHREND** Challenge läuft (innerhalb 30 Sekunden): Weiteres Geschenk senden
4. Logs prüfen

**Erwartetes Ergebnis:**
- ✅ Zweites Geschenk wird blockiert
- ✅ Log: "Cannot start new game: A challenge is already pending"
- ✅ Event: `{ reason: 'challenge_pending', message: '...' }`

#### Test 2.3: Nach Spiel-Ende kann neues Spiel starten
**Schritte:**
1. Spiel starten und zu Ende spielen
2. Warten bis "Game Ended" erscheint
3. Neues Geschenk senden

**Erwartetes Ergebnis:**
- ✅ Neues Spiel/Challenge startet normal
- ✅ Keine Blockierung

### 3. JSON.parse Fehler behoben

#### Test 3.1: Statistiken laden ohne Fehler
**Schritte:**
1. "Statistiken"-Tab öffnen
2. Console prüfen (F12)
3. Falls keine Daten: Prüfe dass UI "Keine Statistiken verfügbar" zeigt

**Erwartetes Ergebnis:**
- ✅ Keine JSON.parse Fehler in Console
- ✅ Keine "SyntaxError: JSON.parse: unexpected end of data"
- ✅ Entweder Statistiken werden angezeigt ODER "Keine Statistiken verfügbar"
- ✅ Bei Fehler: "Fehler beim Laden der Statistiken" statt kryptischer Fehler

#### Test 3.2: Leere API-Response wird behandelt
**Schritte:**
1. Server-Log prüfen während Statistiken-Tab geöffnet wird
2. Falls API leere Response zurückgibt, prüfe UI-Reaktion

**Erwartetes Ergebnis:**
- ✅ Kein JavaScript-Fehler
- ✅ UI zeigt sinnvolle Meldung

### 4. Streamer-Kontrollen im "Aktives Spiel"-Tab

#### Test 4.1: Column-Buttons funktionieren
**Voraussetzungen:**
- Aktives Spiel mit Streamer am Zug

**Schritte:**
1. "Aktives Spiel"-Tab öffnen
2. Streamer ist am Zug
3. Click auf Column-Button (z.B. "C")

**Erwartetes Ergebnis:**
- ✅ Button ist klickbar
- ✅ Zug wird ausgeführt
- ✅ Spielfeld aktualisiert sich
- ✅ Keine CSP-Fehler

#### Test 4.2: "Spiel abbrechen" funktioniert
**Schritte:**
1. Während aktives Spiel läuft
2. Click auf "Spiel abbrechen"
3. Confirm-Dialog bestätigen

**Erwartetes Ergebnis:**
- ✅ Confirm-Dialog erscheint
- ✅ Spiel wird abgebrochen
- ✅ UI wechselt zu "Kein aktives Spiel"
- ✅ Keine Fehler

## Regressions-Tests

### Test 5.1: Bestehende Features funktionieren weiterhin
**Zu prüfen:**
- ✅ ELO-System funktioniert noch
- ✅ XP-Vergabe funktioniert
- ✅ Leaderboard-Anzeige nach Spiel
- ✅ Round Timer (falls aktiviert)
- ✅ Challenge Flow
- ✅ Media-Events werden getriggert
- ✅ Overlay zeigt Spiel korrekt an

### Test 5.2: GCCE-Integration
**Falls GCCE Plugin aktiviert:**
- ✅ `!c4 A` Befehl funktioniert
- ✅ Commands werden registriert
- ✅ Keine Konflikte mit Game Engine

## Acceptance Criteria

### Muss erfüllt sein ✅
- [ ] Keine CSP-Verletzungen in Browser Console
- [ ] Alle Buttons in Admin UI sind klickbar und funktional
- [ ] Connect4-Tab existiert und ist vollständig
- [ ] Einstellungen können gespeichert werden
- [ ] Nur ein Spiel kann gleichzeitig laufen
- [ ] JSON.parse Fehler tritt nicht mehr auf
- [ ] Statistiken werden korrekt geladen oder Fehler sinnvoll angezeigt
- [ ] Keine bestehenden Features kaputt

### Nice-to-have ✅
- [ ] Dokumentation ist vollständig (README, Summary)
- [ ] Version wurde auf 1.1.1 erhöht
- [ ] Changelog ist aktuell

## Bekannte Limitationen

- Media-Upload Feature ist noch nicht vollständig implementiert (File-Upload-Endpoint fehlt)
- Buttons zeigen Placeholder-Fehler wenn Upload versucht wird
- Das ist OK, da es ein separates Feature ist und nicht Teil dieser Bugfixes

## Test-Umgebung

- Node.js Version: ≥18.x
- Browser: Chrome/Edge (Chromium-based)
- OS: Windows/Linux/macOS
- Abhängigkeiten: siehe `app/package.json`

## Bei Problemen

1. Browser DevTools Console prüfen
2. Server-Logs prüfen: `app/logs/`
3. Plugin-Logs: Nach `game-engine` im Log suchen
4. Datenbank prüfen: `app/data/database.db` (SQLite)
5. Screenshots von Fehlern machen
6. Console-Logs kopieren

## Kontakt

Bei Fragen oder Problemen:
- GitHub Issues erstellen
- Logs und Screenshots anhängen
- Schritte zur Reproduktion beschreiben
