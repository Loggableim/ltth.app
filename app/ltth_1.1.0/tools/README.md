# LTTH Performance Tools

Dieses Verzeichnis enthält Werkzeuge zur Performance-Analyse und Diagnose.

## Verfügbare Tools

### 1. performance-diagnostics.js

Ein Browser-Console-Skript zur Echtzeit-Performance-Analyse der LTTH Electron-App.

#### Verwendung

1. **Electron App starten**
2. **DevTools öffnen** (Ctrl+Shift+I oder im Code aktivieren)
3. **Console-Tab** öffnen
4. **Skript einfügen** (Inhalt von `performance-diagnostics.js`)
5. **Enter drücken**

#### Was wird analysiert?

- **DOM-Größe**: Anzahl der Knoten und Verschachtelungstiefe
- **Speicherauslastung**: JS Heap Usage
- **CSS-Performance**: Teure Effekte (box-shadow, filter, backdrop-filter)
- **Long Tasks**: Blockierungen des Main Threads (>50ms)
- **Input-Latenz**: Verzögerung bei Klicks
- **Scroll-Performance**: FPS während des Scrollens

#### Ergebnisse

Die Ergebnisse werden in der Konsole angezeigt und als globale Variable gespeichert:

```javascript
// Ergebnisse abrufen
console.log(window.LTTH_PERF_RESULTS);

// Als JSON kopieren
copy(JSON.stringify(LTTH_PERF_RESULTS, null, 2));
```

### 2. dev-electron.bat / dev-electron.sh

Startet Electron im Entwicklungsmodus mit aktivierten DevTools.

```bash
# Windows
.\tools\dev-electron.bat

# macOS/Linux
./tools/dev-electron.sh
```

## Dokumentation

Für eine vollständige Performance-Diagnose-Anleitung siehe:

📖 **[/infos/ELECTRON_PERFORMANCE_GUIDE.md](/infos/ELECTRON_PERFORMANCE_GUIDE.md)**

## Typische Performance-Probleme

| Problem | Symptom | Diagnose-Tool |
|---------|---------|---------------|
| GPU deaktiviert | Scroll-Lag | chrome://gpu |
| Main Thread blockiert | Klick-Delay >100ms | Long Task Observer |
| Hohe DOM-Komplexität | Allgemeiner Lag | DOM-Analyse |
| CSS-Rendering | Scroll-Stottern | CSS-Performance-Analyse |
| Speicher-Leak | Wachsende Auslastung | Memory-Analyse |

## Support

Bei Performance-Problemen:

1. Führe `performance-diagnostics.js` aus
2. Kopiere die Ergebnisse
3. Erstelle ein Issue mit den Ergebnissen
