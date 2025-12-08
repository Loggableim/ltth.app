# Quiz Show Plugin

Ein vollständig funktionierendes interaktives Quiz-Show-Plugin im Stil von "Wer wird Millionär" für TikTok Livestreams.

## Features

### 1. Fragen-Datenbank
- ✅ JSON-Upload für Massenfragen-Import
- ✅ Manueller Editor für einzelne Fragen
- ✅ Bearbeiten und Löschen von Fragen
- ✅ Export-Funktion für Backup
- ✅ Persistente Speicherung

### 2. Spielsystem
- ✅ Konfigurierbarer Countdown-Timer
- ✅ Flexible Punktevergabe (erste/weitere richtige Antworten)
- ✅ Zufällige oder sequenzielle Fragenreihenfolge
- ✅ Optional: Antworten mischen
- ✅ Mehrere Gewinner oder nur schnellster
- ✅ Anti-Spam: Eine Antwort pro User pro Frage

### 3. Chat-Integration
- ✅ Erkennung von A/B/C/D Antworten
- ✅ Vollständige Antworttexte möglich
- ✅ Case-insensitive Matching
- ✅ Superfan-Joker Support

### 4. Joker-System
- ✅ **!joker25**: 25% Joker (entfernt 1 falsche Antwort) - NEU!
- ✅ **!joker50**: 50:50 Joker (entfernt 2 falsche Antworten)
- ✅ **!jokerInfo**: Info Joker (zeigt eine falsche Antwort)
- ✅ **!jokerTime**: Zeit Joker (verlängert Countdown)
- ✅ Konfigurierbare Joker-Limits pro Runde
- ✅ Visuelle Joker-Aktivierungs-Animationen
- ✅ **Gift-Joker Integration**: TikTok-Geschenke können Jokern zugeordnet werden - NEU!
- ✅ **Joker HUD**: Aktive Joker werden im Overlay angezeigt - NEU!

### 5. Leaderboard
- ✅ Persistente Punkteverfolgung pro User
- ✅ Season-basiertes Leaderboard System - NEU!
- ✅ Sortierung nach Punkten
- ✅ Export/Import Funktionalität
- ✅ Reset-Option
- ✅ Live-Updates
- ✅ **Automatische Anzeige**: Leaderboard wird nach jeder Runde automatisch angezeigt - NEU!
- ✅ **Konfigurierbar**: Runden-Leaderboard, Season-Leaderboard oder beides - NEU!
- ✅ **Animationen**: Einblenden, Gleiten, Zoomen - NEU!

### 6. Modern UI
- ✅ Tab-basiertes Interface (Dashboard, Fragen, Einstellungen, Leaderboard)
- ✅ Dark Theme mit Neon-Akzenten
- ✅ Live-Statistiken
- ✅ Responsive Design
- ✅ Echtzeit-Updates via Socket.IO

### 7. High-End Overlay
- ✅ Glassmorphism Design
- ✅ Neon-Glow-Effekte
- ✅ Circular Progress Timer mit Farbverlauf
- ✅ Smooth Animationen (GPU-beschleunigt)
- ✅ State Machine für flüssige Übergänge
- ✅ Joker-Animationen
- ✅ Richtige-Antwort-Reveal-Effekt
- ✅ **Responsive Design**: Funktioniert in horizontaler und vertikaler Ausrichtung - NEU!
- ✅ **Custom Layouts**: Drag-and-Drop Editor für benutzerdefinierte Layouts - NEU!
- ✅ **Orientation Support**: Automatische Anpassung an Portrait/Landscape - NEU!

### 8. TTS Integration - NEU!
- ✅ **Lautstärkeregelung**: Globale und Session-spezifische TTS-Lautstärke (0-100%)
- ✅ **Konfigurierbar**: Ein-/Ausschaltbar per Einstellung
- ✅ **Ansagen**: Automatische Ansage der richtigen Antwort und Zusatzinfos

### 9. Layout Editor - NEU!
- ✅ **Drag & Drop**: Visuelle Positionierung aller Overlay-Elemente
- ✅ **Auflösungsauswahl**: Unterstützt beliebige Auflösungen (Standard: 1920x1080, 1080x1920)
- ✅ **Vorschau**: Live-Vorschau des Layouts während der Bearbeitung
- ✅ **Speichern & Laden**: Mehrere Layouts pro Ausrichtung speicherbar
- ✅ **Standard-Layouts**: Vorkonfigurierte Layouts für horizontal und vertikal

### 10. Gift Catalogue Integration - NEU!
- ✅ **Joker-Zuordnung**: TikTok-Geschenke können Jokern zugeordnet werden
- ✅ **Automatische Aktivierung**: Geschenk senden = Joker aktivieren
- ✅ **Verwaltung**: Einfaches Zuordnungs-Interface im Admin-Panel
- ✅ **Anzeige**: Gift-Grafiken werden im Joker-HUD angezeigt
- ✅ Neon-Glow-Effekte
- ✅ Circular Progress Timer mit Farbverlauf
- ✅ Smooth Animationen (GPU-beschleunigt)
- ✅ State Machine für flüssige Übergänge
- ✅ Joker-Animationen
- ✅ Richtige-Antwort-Reveal-Effekt
- ✅ Responsive für Mobile/Desktop

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

**Server → Client:**
- `quiz-show:state-update` - Game-State-Updates
- `quiz-show:time-update` - Timer-Updates
- `quiz-show:round-ended` - Rundenende mit Ergebnissen
- `quiz-show:joker-activated` - Joker-Aktivierung
- `quiz-show:leaderboard-updated` - Leaderboard-Änderungen
- `quiz-show:questions-updated` - Fragen-Updates

**Client → Server:**
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

- Chrome/Edge: ✅ Vollständig unterstützt
- Firefox: ✅ Vollständig unterstützt
- Safari: ✅ Vollständig unterstützt
- OBS Browser: ✅ Vollständig unterstützt

## Lizenz

Teil des TikTok Helper Projekts

## Support

Bei Fragen oder Problemen bitte ein Issue erstellen.
