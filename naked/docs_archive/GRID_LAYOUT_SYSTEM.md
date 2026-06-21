# Grid-Based Layout System für Quiz Overlay Editor

## Übersicht

Das Quiz Plugin Overlay Editor System wurde von einem pixel-basierten Drag-and-Drop Interface auf ein grid-basiertes Koordinatensystem umgestellt.

## Problem mit dem alten System

- **Scroll-Probleme**: Editor erforderte Scrollen bei verschiedenen Auflösungen
- **Inkonsistente Darstellung**: Änderungen im Editor wurden nicht korrekt im OBS HUD Preview angezeigt
- **Falsche Positionierung**: Element-Platzierung im OBS entsprach nicht der im Editor
- **Viele Bugs**: Drag-and-Drop war fehleranfällig und unzuverlässig
- **Unintuitive Bedienung**: Schwer zu bedienen und zu verstehen

## Neues Grid-System

### Grid-Struktur

- **20x20 Grid**: Das Overlay ist in ein 20x20 Raster unterteilt
- **Spalten (X-Achse)**: A-T (20 Spalten, je 5% der Breite)
- **Zeilen (Y-Achse)**: 1-20 (20 Zeilen, je 5% der Höhe)
- **Koordinaten**: Wie "Schiffe versenken" - z.B. "C-5" = Spalte C, Zeile 5

### Element-Größen

Jedes Element hat vordefinierte Größen basierend auf 1920x1080:

#### Frage (Question)
- **Klein**: 400x100 px
- **Mittel**: 800x150 px
- **Groß**: 1200x200 px
- **Extra Groß**: 1600x250 px

#### Antworten (Answers)
- **Klein**: 400x300 px
- **Mittel**: 800x400 px
- **Groß**: 1200x500 px
- **Extra Groß**: 1600x600 px

#### Timer
- **Klein**: 150x150 px
- **Mittel**: 200x200 px
- **Groß**: 250x250 px
- **Extra Groß**: 300x300 px

#### Leaderboard
- **Klein**: 250x300 px
- **Mittel**: 300x400 px
- **Groß**: 350x500 px
- **Extra Groß**: 400x600 px

#### Joker Info
- **Klein**: 300x80 px
- **Mittel**: 400x100 px
- **Groß**: 500x120 px
- **Extra Groß**: 600x150 px

## Verwendung

### Im Admin Panel

1. **Neues Layout erstellen**: Klicke auf "➕ Neues Layout erstellen"
2. **Grid-Einstellungen**: 
   - Wähle Spalte (A-T) für horizontale Position
   - Wähle Zeile (1-20) für vertikale Position
   - Wähle Größe (Klein/Mittel/Groß/Extra Groß)
   - Aktiviere/Deaktiviere Sichtbarkeit mit Checkbox
3. **Live-Vorschau**: Die visuelle Vorschau zeigt die Position aller Elemente im Grid
4. **Speichern**: Layout speichern und aktivieren

### Koordinaten-zu-Pixel Konvertierung

Das System konvertiert automatisch Grid-Koordinaten zu Pixel-Positionen basierend auf der Stream-Auflösung:

```javascript
// Beispiel: Element bei C-5 mit Größe "Mittel"
Spalte C = Index 2 → 2 * 5% = 10% von links
Zeile 5 = Index 4 → 4 * 5% = 20% von oben

Bei 1920x1080:
X = 1920 * 0.10 = 192px
Y = 1080 * 0.20 = 216px
```

### Auflösungs-Skalierung

Das System skaliert automatisch basierend auf der definierten Auflösung:

```javascript
// Für 1280x720 (statt 1920x1080)
Skalierung X = 1280 / 1920 = 0.667
Skalierung Y = 720 / 1080 = 0.667

Element-Breite = 800 * 0.667 = 533px
Element-Höhe = 150 * 0.667 = 100px
```

## Technische Details

### Datenbankformat (Neu)

```json
{
  "question": {
    "gridColumn": "C",
    "gridRow": 2,
    "size": "medium",
    "visible": true
  },
  "answers": {
    "gridColumn": "C",
    "gridRow": 5,
    "size": "medium",
    "visible": true
  },
  "timer": {
    "gridColumn": "O",
    "gridRow": 2,
    "size": "small",
    "visible": true
  },
  "leaderboard": {
    "gridColumn": "O",
    "gridRow": 6,
    "size": "medium",
    "visible": true
  },
  "jokerInfo": {
    "gridColumn": "C",
    "gridRow": 13,
    "size": "small",
    "visible": true
  }
}
```

### Datenbankformat (Alt - Rückwärtskompatibel)

```json
{
  "question": {
    "x": 50,
    "y": 50,
    "width": 800,
    "height": 150,
    "visible": true
  }
}
```

Das System konvertiert alte Pixel-basierte Layouts automatisch beim Laden in das Grid-Format (approximiert).

## Vorteile

✅ **Einfacher zu bedienen**: Dropdown-Menüs statt Drag-and-Drop
✅ **Konsistent**: Gleiche Darstellung im Editor und OBS
✅ **Auflösungs-unabhängig**: Skaliert automatisch für verschiedene Auflösungen
✅ **Kein Scrollen**: Alles auf einen Blick sichtbar
✅ **Präzise Platzierung**: Exakte Grid-Koordinaten
✅ **Visuelles Feedback**: Live-Vorschau zeigt Grid und Elemente
✅ **Zuverlässig**: Keine Drag-and-Drop Bugs

## Migration

Bestehende Layouts bleiben funktionsfähig. Das System erkennt automatisch das alte Pixel-Format und konvertiert es beim Bearbeiten in das neue Grid-Format. Die Konvertierung ist eine Approximation basierend auf den Pixel-Positionen.

## Dateien geändert

- `app/plugins/quiz_show/quiz_show.html` - Neues Grid-basiertes UI
- `app/plugins/quiz_show/quiz_show.css` - Grid-Styling
- `app/plugins/quiz_show/quiz_show.js` - Grid-Logik und Live-Vorschau
- `app/plugins/quiz_show/quiz_show_overlay.js` - Grid-zu-Pixel Konvertierung
