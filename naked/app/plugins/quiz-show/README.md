# Pup Cid's Little Quiz Show Plugin

Ein vollständig funktionierendes interaktives Quiz-Show-Plugin für TikTok Livestreams.

## Features

### 1. Fragen-Datenbank
- OK JSON-Upload für Massenfragen-Import
- OK Manueller Editor für einzelne Fragen
- OK Bearbeiten und Löschen von Fragen
- OK Export-Funktion für Backup
- OK Persistente Speicherung

### 2. Spielsystem
- OK Konfigurierbarer Countdown-Timer
- OK Flexible Punktevergabe (erste/weitere richtige Antworten)
- OK Zufällige oder sequenzielle Fragenreihenfolge
- OK Optional: Antworten mischen
- OK Mehrere Gewinner oder nur schnellster
- OK Anti-Spam: Eine Antwort pro User pro Frage

### 3. Chat-Integration
- OK Erkennung von A/B/C/D Antworten
- OK Vollständige Antworttexte möglich
- OK Case-insensitive Matching
- OK Superfan-Joker Support

### 4. Joker-System
- OK **!joker25**: 25% Joker (entfernt 1 falsche Antwort) - NEU!
- OK **!joker50**: 50:50 Joker (entfernt 2 falsche Antworten)
- OK **!jokerInfo**: Info Joker (zeigt eine falsche Antwort)
- OK **!jokerTime**: Zeit Joker (verlängert Countdown)
- OK Konfigurierbare Joker-Limits pro Runde
- OK Visuelle Joker-Aktivierungs-Animationen
- OK **Gift-Joker Integration**: TikTok-Geschenke können Jokern zugeordnet werden - NEU!
- OK **Joker HUD**: Aktive Joker werden im Overlay angezeigt - NEU!

### 5. Leaderboard
- OK Persistente Punkteverfolgung pro User
- OK Season-basiertes Leaderboard System - NEU!
- OK Sortierung nach Punkten
- OK Export/Import Funktionalität
- OK Reset-Option
- OK Live-Updates
- OK **Automatische Anzeige**: Leaderboard wird nach jeder Runde automatisch angezeigt - NEU!
- OK **Konfigurierbar**: Runden-Leaderboard, Season-Leaderboard oder beides - NEU!
- OK **Animationen**: Einblenden, Gleiten, Zoomen - NEU!

### 6. Modern UI
- OK Tab-basiertes Interface (Dashboard, Fragen, Einstellungen, Leaderboard)
- OK Dark Theme mit Neon-Akzenten
- OK Live-Statistiken
- OK Responsive Design
- OK Echtzeit-Updates via Socket.IO

### 7. High-End Overlay
- OK Glassmorphism Design
- OK Neon-Glow-Effekte
- OK Circular Progress Timer mit Farbverlauf
- OK Smooth Animationen (GPU-beschleunigt)
- OK State Machine für flüssige Übergänge
- OK Joker-Animationen
- OK Richtige-Antwort-Reveal-Effekt
- OK **Responsive Design**: Funktioniert in horizontaler und vertikaler Ausrichtung - NEU!
- OK **Custom Layouts**: Drag-and-Drop Editor für benutzerdefinierte Layouts - NEU!
- OK **Orientation Support**: Automatische Anpassung an Portrait/Landscape - NEU!

### 8. TTS Integration - NEU!
- OK **Lautstärkeregelung**: Globale und Session-spezifische TTS-Lautstärke (0-100%)
- OK **Konfigurierbar**: Ein-/Ausschaltbar per Einstellung
- OK **Ansagen**: Automatische Ansage der richtigen Antwort und Zusatzinfos

### 9. Layout Editor - NEU!
- OK **Drag & Drop**: Visuelle Positionierung aller Overlay-Elemente
- OK **Auflösungsauswahl**: Unterstützt beliebige Auflösungen (Standard: 1920x1080, 1080x1920)
- OK **Vorschau**: Live-Vorschau des Layouts während der Bearbeitung
- OK **Speichern & Laden**: Mehrere Layouts pro Ausrichtung speicherbar
- OK **Standard-Layouts**: Vorkonfigurierte Layouts für horizontal und vertikal

### 10. Gift Catalogue Integration - NEU!
- OK **Joker-Zuordnung**: TikTok-Geschenke können Jokern zugeordnet werden
- OK **Automatische Aktivierung**: Geschenk senden = Joker aktivieren
- OK **Verwaltung**: Einfaches Zuordnungs-Interface im Admin-Panel
- OK **Anzeige**: Gift-Grafiken werden im Joker-HUD angezeigt
- OK Neon-Glow-Effekte
- OK Circular Progress Timer mit Farbverlauf
- OK Smooth Animationen (GPU-beschleunigt)
- OK State Machine für flüssige Übergänge
- OK Joker-Animationen
- OK Richtige-Antwort-Reveal-Effekt
- OK Responsive für Mobile/Desktop

## Installation

Das Plugin ist bereits im `/plugins/quiz_show/` Verzeichnis installiert und wird automatisch geladen.

## Verwendung

### Fragen hinzufügen

**Option 1: JSON Upload**
```json
[
  {
    "question": "Was ist die Hauptstadt von Deutschland?",
    "answers": ["Berlin", "München", "Hamburg", "Köln"],
    "correct": 0
  },
  {
    "question": "Wie viele Kontinente gibt es?",
    "answers": ["5", "6", "7", "8"],
    "correct": 2
  }
]
```

**Option 2: Manueller Editor**
1. Zum Tab "Fragen" navigieren
2. Frage und Antworten A-D eingeben
3. Richtige Antwort auswählen
4. "Frage Hinzufügen" klicken

### Quiz starten

1. Im Dashboard-Tab auf "Quiz Starten" klicken
2. Frage wird automatisch angezeigt
3. Zuschauer antworten im Chat mit A/B/C/D
4. Timer läuft ab
5. Punkte werden automatisch vergeben
6. "Nächste Frage" für weitere Runden

### Einstellungen anpassen

Im Einstellungen-Tab können konfiguriert werden:
- **Rundendauer**: 10-120 Sekunden
- **Punkte für erste richtige Antwort**: Standard 100
- **Punkte für weitere richtige Antworten**: Standard 50
- **Mehrere Gewinner**: Alle richtigen oder nur schnellster
- **Antworten mischen**: Zufällige Reihenfolge A-D
- **Fragen-Reihenfolge**: Zufällig oder chronologisch
- **Joker-Einstellungen**: Aktivierung und Limits

### Chat-Befehle

**Für alle Zuschauer:**
- `A`, `B`, `C`, `D` - Antwort wählen
- Oder vollständiger Antworttext

**Für Superfans:**
- `!joker50` - 50:50 Joker aktivieren
- `!jokerInfo` - Info Joker aktivieren
- `!jokerTime` - Zeit Joker aktivieren

## Overlay einbinden

1. In OBS/Streamlabs als Browser-Source hinzufügen
2. URL: `http://localhost:PORT/plugins/quiz_show/quiz_show_overlay.html`
3. Empfohlene Größe: 1920x1080
4. Transparenter Hintergrund aktivieren

## Technische Details

### Dateien
- `plugin.json` - Plugin-Manifest
- `main.js` - Backend-Logik (Node.js)
- `quiz_show.html` - Admin-UI
- `quiz_show.js` - UI-Client-Logik
- `quiz_show.css` - UI-Styling
- `quiz_show_overlay.html` - Overlay-HTML
- `quiz_show_overlay.js` - Overlay-Logik mit State Machine
- `quiz_show_overlay.css` - Overlay-Styling mit Animationen

### IPC Events

**Server  Client:**
- `quiz-show:state-update` - Game-State-Updates
- `quiz-show:time-update` - Timer-Updates
- `quiz-show:round-ended` - Rundenende mit Ergebnissen
- `quiz-show:joker-activated` - Joker-Aktivierung
- `quiz-show:leaderboard-updated` - Leaderboard-Änderungen
- `quiz-show:questions-updated` - Fragen-Updates

**Client  Server:**
- `quiz-show:start` - Quiz starten
- `quiz-show:next` - Nächste Frage
- `quiz-show:stop` - Quiz stoppen

### API Endpoints

- `GET /api/quiz-show/state` - Aktueller Zustand
- `POST /api/quiz-show/config` - Konfiguration speichern
- `POST /api/quiz-show/questions` - Frage hinzufügen
- `PUT /api/quiz-show/questions/:id` - Frage bearbeiten
- `DELETE /api/quiz-show/questions/:id` - Frage löschen
- `POST /api/quiz-show/questions/upload` - JSON-Upload
- `GET /api/quiz-show/questions/export` - Fragen exportieren
- `GET /api/quiz-show/leaderboard/export` - Leaderboard exportieren
- `POST /api/quiz-show/leaderboard/import` - Leaderboard importieren
- `POST /api/quiz-show/leaderboard/reset` - Leaderboard zurücksetzen

## Performance

- GPU-beschleunigte Animationen (transform3d)
- RequestAnimationFrame für flüssige Timer
- Keine Memory-Leaks durch saubere Event-Listener-Verwaltung
- Optimiert für 144 FPS

## Browser-Kompatibilität

- Chrome/Edge: OK Vollständig unterstützt
- Firefox: OK Vollständig unterstützt
- Safari: OK Vollständig unterstützt
- OBS Browser: OK Vollständig unterstützt

## Lizenz

Teil des TikTok Helper Projekts

## Support

Bei Fragen oder Problemen bitte ein Issue erstellen.
# Pup Cid's Little Quiz Show Plugin - Expansion Notes

The active plugin now includes configurable question cooldowns, show playlists, audience category voting with `!vote <category>` or numeric chat votes, duel mode, theme presets, reduced-motion and high-contrast accessibility switches, avatar performance controls, sound upload, achievements, season automation, a health panel, and setup wizard state tracking.

Uploaded sound files are stored in the plugin data directory, not inside the plugin source directory.


