# Interactive Story Overlay - Positionierungs-Guide

## 🎨 Overlay-Elemente frei positionieren

Die Overlay-Elemente (Titel, Inhalt, Abstimmung) können jetzt frei positioniert werden, ähnlich wie beim Quiz-Plugin.

### 📍 Draggable Elemente

Folgende Elemente sind verschiebbar:
- **Titel-Overlay** - Der Kapiteltitel, der über dem Bild angezeigt wird
- **Inhalt** - Der Kapiteltext (Star Wars Scroll oder vollständiger Text)
- **Abstimmung** - Die Abstimmungsoptionen und der Timer

### 🖱️ Bedienung

#### Elemente verschieben
1. Halte `Strg` (Windows/Linux) oder `Cmd` (Mac) gedrückt
2. Klicke und ziehe das Element an die gewünschte Position
3. Lasse die Maustaste los, um die Position zu speichern

#### Raster-Ausrichtung
- Drücke die Taste `G` zum Ein-/Ausschalten der Raster-Ausrichtung (20px Raster)
- Im Raster-Modus rasten Elemente an 20-Pixel-Punkten ein für präzise Ausrichtung

#### Positionen zurücksetzen
- Drücke `Strg+R` (Windows/Linux) oder `Cmd+R` (Mac), um alle Positionen auf Standard zurückzusetzen

### 💡 Tipps

- **Visu Feedback:** Während des Ziehens leuchten die Elemente auf und zeigen einen farbigen Rahmen
- **Persistenz:** Positionen werden automatisch gespeichert und bleiben nach Neuladen der Seite erhalten
- **Unfallschutz:** Verschieben ist nur mit gedrückter Strg/Cmd-Taste möglich, um versehentliches Bewegen zu verhindern

### 🔧 Technische Details

**Position-Speicherung:**
- Positionen werden in der Plugin-Konfiguration gespeichert
- API-Endpunkte:
  - `GET /api/interactive-story/overlay-positions` - Lädt gespeicherte Positionen
  - `POST /api/interactive-story/overlay-positions` - Speichert Positionen

**CSS-Klassen:**
- `.draggable` - Markiert verschiebbare Elemente
- `.dragging` - Wird während des Ziehens angewendet
- `data-element` - Identifiziert den Elementtyp (title, content, voting)

### 🎯 Anwendungsbeispiele

1. **Titel links oben positionieren:**
   - Strg+Drag auf den Titel-Overlay
   - In die obere linke Ecke ziehen

2. **Inhalt zentriert unten:**
   - Strg+Drag auf den Inhalt
   - In die untere Mitte ziehen

3. **Abstimmung rechts:**
   - Strg+Drag auf die Abstimmungs-Box
   - Rechts positionieren

### 🐛 Fehlerbehebung

**Element lässt sich nicht verschieben:**
- Stelle sicher, dass du Strg/Cmd gedrückt hältst
- Überprüfe die Browser-Konsole auf Fehler (F12)
- Versuche Strg+R zum Zurücksetzen der Positionen

**Position wird nicht gespeichert:**
- Überprüfe die Netzwerk-Verbindung zum Server
- Prüfe die Browser-Konsole auf API-Fehler
- Server muss laufen und Plugin muss aktiviert sein

**Position sieht falsch aus:**
- Drücke Strg+R zum Zurücksetzen
- Überprüfe Overlay-Auflösung in den Einstellungen
- Stelle sicher, dass die richtige Orientierung (Landscape/Portrait) eingestellt ist

---

## English Version

# Interactive Story Overlay - Positioning Guide

## 🎨 Free Positioning of Overlay Elements

Overlay elements (title, content, voting) can now be freely positioned, similar to the quiz plugin.

### 📍 Draggable Elements

The following elements are draggable:
- **Title Overlay** - The chapter title displayed over the image
- **Content** - The chapter text (Star Wars scroll or full text)
- **Voting** - The voting options and timer

### 🖱️ Controls

#### Moving Elements
1. Hold `Ctrl` (Windows/Linux) or `Cmd` (Mac)
2. Click and drag the element to the desired position
3. Release the mouse button to save the position

#### Grid Snapping
- Press the `G` key to toggle grid snapping (20px grid)
- In grid mode, elements snap to 20-pixel points for precise alignment

#### Reset Positions
- Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac) to reset all positions to defaults

### 💡 Tips

- **Visual Feedback:** Elements glow and show a colored border while dragging
- **Persistence:** Positions are automatically saved and persist across page reloads
- **Accident Prevention:** Moving requires holding Ctrl/Cmd to prevent accidental moves

### 🔧 Technical Details

**Position Storage:**
- Positions are stored in plugin configuration
- API Endpoints:
  - `GET /api/interactive-story/overlay-positions` - Loads saved positions
  - `POST /api/interactive-story/overlay-positions` - Saves positions

**CSS Classes:**
- `.draggable` - Marks draggable elements
- `.dragging` - Applied during dragging
- `data-element` - Identifies element type (title, content, voting)

### 🎯 Usage Examples

1. **Position title in top-left:**
   - Ctrl+Drag the title overlay
   - Move to upper-left corner

2. **Center content at bottom:**
   - Ctrl+Drag the content
   - Position in lower middle

3. **Position voting on right:**
   - Ctrl+Drag the voting box
   - Position on the right side

### 🐛 Troubleshooting

**Element won't move:**
- Make sure you're holding Ctrl/Cmd
- Check browser console for errors (F12)
- Try Ctrl+R to reset positions

**Position not saving:**
- Check network connection to server
- Check browser console for API errors
- Server must be running and plugin must be enabled

**Position looks wrong:**
- Press Ctrl+R to reset
- Check overlay resolution in settings
- Ensure correct orientation (Landscape/Portrait) is set
