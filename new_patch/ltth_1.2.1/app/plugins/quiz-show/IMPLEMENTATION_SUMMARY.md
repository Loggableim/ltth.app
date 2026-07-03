# Quiz Show Major Rework - Implementation Summary

## Overview

Dieses Dokument beschreibt die umfangreiche Überarbeitung des Quiz Show Plugins mit neuen Features für ein professionelleres Streaming-Erlebnis.

## Implementierte Features

### 1. Responsive Overlay-System

**Problematik:** Das bisherige Overlay funktionierte nur in einer festen Auflösung.

**Lösung:** 
- CSS Media Queries für `orientation: portrait` und `orientation: landscape`
- Automatische Anpassung von Schriftgrößen, Layouts und Elementpositionen
- Unterstützt sowohl 1920x1080 (horizontal) als auch 1080x1920 (vertikal)

**Technische Umsetzung:**
```css
@media (orientation: portrait) {
    /* Vertikales Layout */
    .answers-grid {
        display: flex;
        flex-direction: column;
    }
}

@media (orientation: landscape) {
    /* Horizontales Layout */
    .answers-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
    }
}
```

### 2. OBS-HUD Leaderboard System

**Funktionen:**
- Automatische Anzeige nach jeder Runde
- Konfigurierbare Anzeigetypen: Nur Runde, Nur Season, oder Beides
- Spielende-Auswahl: Season oder Runde
- Auto-Hide mit konfigurierbarer Verzögerung (0-60 Sekunden)
- Animationen: Fade, Slide, Zoom

**API Endpoints:**
```
GET  /api/quiz-show/leaderboard-config
POST /api/quiz-show/leaderboard-config
```

**Socket Events:**
```javascript
socket.on('quiz-show:show-leaderboard', (data) => {
    // { leaderboard, displayType, animationStyle }
});

socket.on('quiz-show:hide-leaderboard');
```

**Datenbank:**
```sql
CREATE TABLE leaderboard_display_config (
    id INTEGER PRIMARY KEY,
    show_after_round BOOLEAN DEFAULT TRUE,
    round_display_type TEXT DEFAULT 'both',
    end_game_display_type TEXT DEFAULT 'season',
    auto_hide_delay INTEGER DEFAULT 10,
    animation_style TEXT DEFAULT 'fade'
);
```

### 3. Gift Catalogue Integration für Joker

**Funktionen:**
- TikTok-Geschenke können Jokern zugeordnet werden
- 4 Joker-Typen: 25%, 50%, Info, Zeit
- Automatische Aktivierung beim Geschenk-Erhalt
- Verwaltungs-UI im Gift-Joker Tab

**API Endpoints:**
```
GET    /api/quiz-show/gift-jokers
POST   /api/quiz-show/gift-jokers
DELETE /api/quiz-show/gift-jokers/:giftId
```

**Datenbank:**
```sql
CREATE TABLE gift_joker_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id INTEGER NOT NULL UNIQUE,
    gift_name TEXT NOT NULL,
    joker_type TEXT NOT NULL CHECK(joker_type IN ('25', '50', 'time', 'info')),
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Joker-Logik:**
```javascript
// 25% Joker - entfernt 1 falsche Antwort
activate25Joker() {
    const wrongIndices = this.getAvailableWrongAnswers();
    // Wählt zufällig 1 falsche Antwort zum Verstecken
}

// 50:50 Joker - entfernt 2 falsche Antworten
activate5050Joker() {
    const wrongIndices = this.getAvailableWrongAnswers();
    // Wählt zufällig 2 falsche Antworten zum Verstecken
}

// Helper-Methode zur Vermeidung von Code-Duplizierung
getAvailableWrongAnswers() {
    const correctIndex = this.gameState.currentQuestion.correct;
    return [0, 1, 2, 3].filter(i => 
        i !== correctIndex && !this.gameState.hiddenAnswers.includes(i)
    );
}
```

### 4. Custom Layout Editor

**Funktionen:**
- Drag & Drop Editor für Overlay-Elemente
- Auflösungsauswahl (800x600 bis 3840x2160)
- Speichern mehrerer Layouts
- Standard-Layout pro Ausrichtung
- Visuelle Vorschau

**UI-Elemente:**
- Frage-Bereich
- Antworten-Bereich
- Timer
- Leaderboard
- Joker-Info

**API Endpoints:**
```
GET    /api/quiz-show/layouts
GET    /api/quiz-show/layouts/:id
POST   /api/quiz-show/layouts
PUT    /api/quiz-show/layouts/:id
DELETE /api/quiz-show/layouts/:id
```

**Datenbank:**
```sql
CREATE TABLE overlay_layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    resolution_width INTEGER NOT NULL,
    resolution_height INTEGER NOT NULL,
    orientation TEXT NOT NULL CHECK(orientation IN ('horizontal', 'vertical')),
    is_default BOOLEAN DEFAULT FALSE,
    layout_config TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Layout Config Format:**
```json
{
    "question": { "x": 50, "y": 100, "width": 1820, "height": 200 },
    "answers": { "x": 50, "y": 350, "width": 1820, "height": 500 },
    "timer": { "x": 860, "y": 900, "width": 200, "height": 200 },
    "leaderboard": { "x": 1400, "y": 100, "width": 470, "height": 800 },
    "jokerInfo": { "x": 50, "y": 900, "width": 400, "height": 150 }
}
```

**CSS Variables für Custom Layouts:**
```css
.overlay-container[data-custom-layout="true"] .question-section {
    top: var(--question-top);
    left: var(--question-left);
    width: var(--question-width);
    height: var(--question-height);
    position: fixed;
}
```

### 5. TTS Lautstärkeregelung

**Funktionen:**
- Globale Lautstärke (0-100%)
- Session-spezifische Lautstärke (0-100%)
- Ein-/Ausschaltbar

**API Endpoints:**
```
GET  /api/quiz-show/tts-config
POST /api/quiz-show/tts-config
```

**Datenbank:**
```sql
CREATE TABLE tts_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    volume_global INTEGER DEFAULT 80 CHECK(volume_global >= 0 AND volume_global <= 100),
    volume_session INTEGER DEFAULT 80 CHECK(volume_session >= 0 AND volume_session <= 100),
    enabled BOOLEAN DEFAULT TRUE
);
```

## Technische Details

### Initialisierung

Die neuen Tabellen werden automatisch beim Plugin-Start erstellt:

```javascript
async initDatabase() {
    // Erstellt alle Tabellen, falls nicht vorhanden
    // Initialisiert Default-Werte
    // Migriert alte Daten, falls vorhanden
}
```

### Socket.io Events

**Neue Events:**
- `quiz-show:show-leaderboard` - Leaderboard anzeigen
- `quiz-show:hide-leaderboard` - Leaderboard verstecken
- `quiz-show:leaderboard-updated` - Leaderboard aktualisiert
- `quiz-show:layout-updated` - Layout aktualisiert

### State Management

Der Game State wurde erweitert:

```javascript
gameState: {
    // ... existing fields ...
    jokersUsed: {
        '25': 0,  // NEU
        '50': 0,
        'info': 0,
        'time': 0
    }
}
```

### Configuration

Die Plugin-Konfiguration wurde erweitert:

```javascript
config: {
    // ... existing fields ...
    joker25Enabled: true,  // NEU
    ttsVolume: 80,  // NEU
    leaderboardShowAfterRound: true,  // NEU
    leaderboardRoundDisplayType: 'both',  // NEU
    leaderboardEndGameDisplayType: 'season',  // NEU
    leaderboardAutoHideDelay: 10,  // NEU
    leaderboardAnimationStyle: 'fade',  // NEU
    giftJokersEnabled: true,  // NEU
    giftJokerMappings: {},  // NEU
    giftJokerShowInHUD: true,  // NEU
    activeLayoutId: null,  // NEU
    customLayoutEnabled: false  // NEU
}
```

## Migrations

### Datenbank-Migration

Die Migration erfolgt automatisch:

1. Prüfung, ob neue Tabellen existieren
2. Erstellung fehlender Tabellen
3. Initialisierung mit Default-Werten
4. Migration alter Daten (falls vorhanden)

### Backwards Compatibility

Alle Änderungen sind rückwärtskompatibel:
- Alte Datenbanken werden automatisch migriert
- Bestehende Konfigurationen bleiben erhalten
- Neue Features sind optional

## Performance

### Optimierungen

1. **Database Indices:** Für schnelle Abfragen
   ```sql
   CREATE INDEX idx_gift_joker_gift_id ON gift_joker_mappings(gift_id);
   CREATE INDEX idx_overlay_layouts_orientation ON overlay_layouts(orientation);
   ```

2. **CSS Performance:**
   - GPU-beschleunigte Animationen (`transform3d`)
   - Effiziente Media Queries
   - CSS Custom Properties für dynamische Anpassungen

3. **JavaScript Performance:**
   - Reduzierte Code-Duplizierung
   - Helper-Methoden für häufige Operationen
   - Objekt-basierte Joker-Zählung (`Object.values().reduce()`)

## Sicherheit

### Input Validation

Alle API-Endpunkte validieren Eingaben:

```javascript
if (!['25', '50', 'time', 'info'].includes(jokerType)) {
    return res.status(400).json({ error: 'Invalid joker type' });
}

if (volumeGlobal !== undefined && (volumeGlobal < 0 || volumeGlobal > 100)) {
    return res.status(400).json({ error: 'Volume must be between 0 and 100' });
}
```

### SQL Injection Prevention

Verwendung von Prepared Statements:

```javascript
this.db.prepare('INSERT INTO gift_joker_mappings (gift_id, gift_name, joker_type) VALUES (?, ?, ?)')
    .run(giftId, giftName, jokerType);
```

### CodeQL Scan

- ✅ Keine Sicherheitswarnungen
- ✅ Alle Eingaben validiert
- ✅ Prepared Statements verwendet

## Testing

### Manuelle Tests

Empfohlene Test-Szenarien:

1. **Responsive Overlays:**
   - Testen in 1920x1080
   - Testen in 1080x1920
   - Browser-Rotation testen

2. **Leaderboard:**
   - Anzeige nach Runde
   - Verschiedene Display-Typen
   - Auto-Hide Funktionalität
   - Animationen

3. **Gift-Joker:**
   - Mapping erstellen
   - Geschenk senden (simuliert)
   - Joker-Aktivierung prüfen
   - HUD-Anzeige prüfen

4. **Layout Editor:**
   - Layout erstellen
   - Elemente positionieren
   - Speichern & Laden
   - Auf Overlay anwenden

5. **TTS:**
   - Lautstärke anpassen
   - Ansage nach Runde
   - Ein-/Ausschalten

### Automatische Tests

Die bestehenden Tests laufen weiterhin:
```bash
cd app
npm test
```

## Bekannte Limitationen

1. **Layout Editor JavaScript:** Die Drag-and-Drop Logik muss noch in `quiz_show.js` implementiert werden
2. **Gift Catalogue:** Abhängig vom TikTok-Modul für Gift-Daten
3. **Browser Compatibility:** Optimiert für moderne Browser (Chrome, Firefox, Safari)

## Deployment

### Installation

1. Keine zusätzlichen Dependencies erforderlich
2. Automatische Datenbank-Migration beim Start
3. UI ist sofort verfügbar nach Update

### Rollback

Falls Probleme auftreten:
```bash
git checkout <previous-version>
```

Die Datenbank bleibt erhalten, neue Features werden einfach ignoriert.

## Support & Dokumentation

- **README.md:** Aktualisiert mit allen neuen Features
- **Inline Kommentare:** Alle wichtigen Funktionen dokumentiert
- **API Dokumentation:** In diesem Dokument enthalten

## Changelog

### Version 2.0.0 (Major Rework)

**Neue Features:**
- ✅ Responsive Overlay-System
- ✅ OBS-HUD Leaderboard mit Auto-Anzeige
- ✅ Gift-Joker Integration
- ✅ 25% Joker
- ✅ Custom Layout Editor
- ✅ TTS Lautstärkeregelung

**Verbesserungen:**
- ✅ Code-Refactoring (weniger Duplizierung)
- ✅ Bessere Performance
- ✅ Erweiterte Konfiguration

**Bugfixes:**
- ✅ Joker-Zählung jetzt dynamisch
- ✅ Hidden Answers korrekt verwaltet

## Zukunft

### Geplante Erweiterungen

1. **Drag-and-Drop JavaScript:** Vollständige Implementierung des Layout Editors
2. **Mehr Joker-Typen:** Community-Vorschläge
3. **Statistiken:** Erweiterte Analytics
4. **Themes:** Zusätzliche Overlay-Themes

### Community Feedback

Feature-Requests bitte als GitHub Issue einreichen.

---

**Entwickelt mit ❤️ für die TikTok Community**
