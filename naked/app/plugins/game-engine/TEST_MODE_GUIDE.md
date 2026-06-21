# 🧪 Game Engine Offline Test Mode - Anleitung

## Übersicht

Der **Offline Test-Modus** ermöglicht es Streamern, alle Spiele der Game Engine direkt in OBS zu testen, **ohne** TikTok-Chat-Befehle oder aktive Live-Verbindung zu benötigen.

## Schnellstart

### 1. Test-Modus aktivieren

Füge einfach `?testMode=true` an das Ende der Overlay-URL an:

```
http://localhost:3000/overlay/game-engine/connect4?testMode=true
```

### 2. In OBS einrichten

1. Öffne OBS Studio
2. Füge eine **Browser-Quelle** hinzu
3. Gib die Overlay-URL mit `?testMode=true` ein
4. Stelle Breite und Höhe ein (empfohlen: 1920x1080)
5. Ein **Kontrollpanel** erscheint automatisch in der oberen rechten Ecke

### 3. Spiel testen

Nutze die Buttons im Kontrollpanel, um das Spiel zu steuern:
- Spiel starten
- Züge machen
- Spiel beenden

## Verfügbare Spiele

### 🎮 Connect4 (Vier Gewinnt)

**URL:**
```
http://localhost:3000/overlay/game-engine/connect4?testMode=true
```

**Funktionen:**
- ✅ "Start Test Game" Button
- ✅ Spalten-Buttons (A-G) zum Steine platzieren
- ✅ Automatischer Spielerwechsel
- ✅ "End Test Game" Button
- ✅ Vollständige Spiellogik wie im Live-Betrieb

**Verwendung:**
1. Klicke "Start Test Game"
2. Klicke auf eine Spalte (A-G) um einen Stein zu platzieren
3. Der aktuelle Spieler wechselt automatisch
4. Spiele bis zum Sieg, Unentschieden oder klicke "End Test Game"

---

### 🎰 Plinko

**URL:**
```
http://localhost:3000/overlay/game-engine/plinko?testMode=true
```

**Funktionen:**
- ✅ Einsatz-Betrag konfigurierbar (10-1000 XP)
- ✅ Spielername änderbar
- ✅ Ball-Anzahl einstellbar (1-10)
- ✅ "Drop Ball" Button
- ✅ Mehrere Bälle gleichzeitig testbar
- ✅ Echte Physik-Simulation
- ✅ **NEU:** "Show Leaderboard" Button für manuelle Leaderboard-Anzeige
- ✅ **NEU:** Automatische Leaderboard-Anzeige nach Batch-Completion

**Verwendung:**
1. Stelle den Einsatz-Betrag ein (Standard: 100 XP)
2. Ändere optional den Spielernamen
3. Wähle die Ball-Anzahl (Standard: 1, max: 10)
4. Klicke "Drop Ball" um Ball(e) zu spawnen
5. **NEU:** Klicke "Show Leaderboard" um die Top 10 Spieler anzuzeigen
6. Wiederhole für Stress-Tests mit mehreren Bällen

**Leaderboard-Feature:**
- Nach einer Batch-Completion (mehrere Bälle) wird automatisch das Leaderboard für 5 Sekunden angezeigt
- Das Leaderboard zeigt die Top 10 Spieler nach Gesamtprofit
- Enthält: Rang, Name, Gesamtprofit, Spiele-Anzahl, Durchschnitts-Multiplikator
- Top 3 haben spezielle Farben (Gold/Silber/Bronze)
- Positive/negative Profite sind farbcodiert (Grün/Rot)

---

### 🎡 Glücksrad (Wheel of Fortune)

**URL:**
```
http://localhost:3000/overlay/game-engine/wheel?testMode=true
```

**Funktionen:**
- ✅ Spielername konfigurierbar
- ✅ "Spin Wheel" Button
- ✅ Vollständige Rad-Animation
- ✅ Gewinn-Anzeige

**Verwendung:**
1. Gib einen Spielernamen ein
2. Klicke "Spin Wheel"
3. Beobachte die Rad-Animation und Gewinn-Berechnung

---

### ♟️ Schach (Chess)

**URL:**
```
http://localhost:3000/overlay/game-engine/chess?testMode=true
```

**Hinweis:** Schach erfordert momentan die Admin-UI für manuelle Spiele. Das Kontrollpanel zeigt eine entsprechende Meldung.

**Alternative:** Nutze die Admin-UI unter `/game-engine/ui` → Tab "Manual Mode"

## Erweiterte Nutzung

### URL-Parameter kombinieren

Du kannst Test-Modus mit anderen Parametern kombinieren:

```
http://localhost:3000/overlay/game-engine/connect4?testMode=true&position=center
```

### Für verschiedene Szenarien testen

1. **Layout-Test:** Teste verschiedene OBS-Szenen und Positionen
2. **Performance-Test:** Spawne viele Plinko-Bälle gleichzeitig
3. **Animation-Test:** Prüfe Übergänge und Effekte
4. **Sound-Test:** Verifiziere Audio-Ausgabe und Lautstärke
5. **Style-Test:** Teste verschiedene Farb- und Design-Konfigurationen

## Technische Details

### Wie funktioniert es?

Der Test-Modus nutzt die bestehenden **Manual Game APIs**:

- **Connect4:** `/api/game-engine/manual/start`, `/api/game-engine/manual/move`, `/api/game-engine/manual/end`
- **Plinko:** Direkter Ball-Spawn über Client-Simulation
- **Wheel:** `/api/game-engine/wheel/spin`

### Was wird NICHT getestet?

- ❌ TikTok Chat-Integration (da offline)
- ❌ Geschenk-Trigger (keine Live-Verbindung)
- ❌ XP-Vergabe (Test-Spieler erhalten kein echtes XP)
- ❌ GCCE-Befehle (Chat-System offline)

### Was WIRD getestet?

- ✅ Overlay-Darstellung in OBS
- ✅ Animations und Übergänge
- ✅ Spiellogik und Regeln
- ✅ Sound-Effekte
- ✅ UI-Elemente und Farben
- ✅ Performance und FPS

## Fehlerbehebung

### Problem: Kontrollpanel erscheint nicht

**Lösung:** Prüfe ob `?testMode=true` in der URL enthalten ist

### Problem: 404 Fehler

**Lösung:** 
1. Stelle sicher, dass der Server läuft (`npm start`)
2. Prüfe ob das Game Engine Plugin aktiviert ist
3. Öffne `/api/plugins` und suche nach `"game-engine": { "enabled": true }`

### Problem: Buttons funktionieren nicht

**Lösung:**
1. Öffne die Browser-Konsole (F12)
2. Prüfe auf JavaScript-Fehler
3. Stelle sicher, dass Socket.io verbunden ist

### Problem: Spiel startet nicht

**Lösung:**
1. Prüfe ob bereits ein Spiel aktiv ist (nur 1 Spiel gleichzeitig)
2. Beende ggf. das aktive Spiel über die Admin-UI
3. Versuche es erneut

## Best Practices

### ✅ DO

- Teste vor jedem Stream alle Overlays
- Nutze Test-Modus für neue Konfigurationen
- Kombiniere mit verschiedenen URL-Parametern
- Teste in der finalen OBS-Szene

### ❌ DON'T

- Verlasse dich nicht nur auf Test-Modus (teste auch Live-Features)
- Vergiss nicht `?testMode=true` vor dem Live-Stream zu entfernen
- Starte nicht mehrere Test-Spiele gleichzeitig (Connect4/Chess)

## Support

Bei Problemen oder Fragen:
1. Prüfe die [README.md](README.md) für vollständige Dokumentation
2. Schaue in die Browser-Konsole (F12) für Fehler
3. Prüfe die Server-Logs für Backend-Probleme

---

**Version:** 1.2.0  
**Autor:** Pup Cid  
**Lizenz:** CC-BY-NC-4.0
