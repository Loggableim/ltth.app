# 🌧️ Emoji Rain Plugin - Enhanced Edition

## Übersicht
Das verbesserte Emoji Rain Plugin bietet jetzt **zwei separate Overlays** mit unterschiedlichen Features:

1. **Standard Overlay** (`/emoji-rain/overlay`) - Responsive, passt sich dem Browser an
2. **OBS HUD** (`/emoji-rain/obs-hud`) - Fixed Resolution, Game-Quality Grafik für professionelle Streams

## 🆕 Neue Features

### 🔬 **FPS Benchmarking & Auto-Optimierung** (NEU!)
- **Automatische FPS-Messung**: Testet 5 verschiedene Qualitätsstufen
- **Intelligente Optimierung**: Findet die beste Einstellung für deine Ziel-FPS
- **Performance-Presets**: Von Maximum Quality (200 Emojis) bis Minimal (50 Emojis)
- **Ein-Klick-Optimierung**: Automatische Anwendung der optimalen Einstellungen
- **Detaillierte Ergebnisse**: Durchschnittliche, minimale und maximale FPS pro Preset
- 📖 **Siehe**: [BENCHMARK_GUIDE.md](./BENCHMARK_GUIDE.md) für ausführliche Anleitung

### 🎮 OBS HUD Integration
- **Feste Auflösung**: Wählbar zwischen 720p, 1080p, 1440p, 4K oder Custom
- **Game-Quality Grafik**:
  - Drop Shadows für Tiefe
  - Glow-Effekte bei Aufprall
  - Partikel-Effekte
  - Hardware-beschleunigte Animationen
- **Performance HUD**: Zeige FPS, Memory, Body Count (Strg+P)
- **Auflösungs-Indikator**: Zeige aktuelle Auflösung (Strg+R)
- **Test-Funktion**: Teste Spawn direkt mit Strg+T

### ⚡ Performance-Optimierungen
- **60 FPS Targeting**: Frame-Throttling für konstante Performance
- **Hardware-Beschleunigung**: CSS `transform3d` und `will-change`
- **Memory-Management**: Proper Cleanup bei Page Unload
- **Object Pooling**: Partikel-Wiederverwendung für weniger GC
- **Optimierte DOM-Updates**: Effizientere Transform-Updates
- **Freeze Protection**: Auto-reload Failsafe bei FPS-Einbruch auf 0 für 3+ Sekunden

#### Automatische Freeze-Recovery
Das Plugin enthält einen Schutzmechanismus gegen komplette Abstürze:
- **FPS-Überwachung**: Kontinuierliche Performance-Überwachung
- **Freeze-Erkennung**: Erkennt, wenn FPS auf 0 fällt (kompletter Freeze)
- **Auto-Wiederherstellung**: Nach 3 aufeinanderfolgenden Sekunden bei 0 FPS:
  1. Fehler wird in Konsole geloggt
  2. Visuelle Warnung wird angezeigt
  3. Overlay lädt sich nach 2 Sekunden automatisch neu
- **Intelligente Wiederherstellung**: Wenn FPS sich vor dem Reload erholt, wird der Failsafe zurückgesetzt und der Normalbetrieb fortgesetzt

Dies stellt sicher, dass das Overlay auch bei extremem Gift-Spam automatisch wiederhergestellt wird, ohne dass ein vollständiger System-Neustart erforderlich ist.

### 🎨 Grafische Verbesserungen
- **Glow-Effekte**: Leuchtende Emojis bei Aufprall (aktivierbar)
- **Partikel-System**: Dynamische Partikel beim Bouncing
- **Tiefeneffekte**: Schatten und 3D-Perspektive
- **Smooth Animations**: CSS Cubic-Bezier für natürliche Bewegungen
- **Enhanced Filters**: Drop-Shadow, Brightness, Blur für Premium-Look

### 🛠️ Neue Einstellungen
- `obs_hud_enabled`: OBS HUD aktivieren/deaktivieren
- `obs_hud_width`: Feste Breite für OBS (640-7680px)
- `obs_hud_height`: Feste Höhe für OBS (360-4320px)
- `enable_glow`: Glow-Effekte aktivieren
- `enable_particles`: Partikel-Effekte aktivieren
- `enable_depth`: Tiefeneffekte aktivieren
- `target_fps`: Ziel-FPS (30-120) - **Nutze das Benchmark-Tool zur Optimierung!**

## 🚀 OBS Setup

### Schritt 1: Plugin konfigurieren
1. Öffne das Emoji Rain UI: `http://localhost:3000/emoji-rain/ui`
2. Scrolle zur **OBS HUD Einstellungen** Sektion
3. Wähle die gewünschte Auflösung (z.B. 1080p)
4. Aktiviere die gewünschten Effekte (Glow, Particles, Depth)
5. Klicke **"Konfiguration speichern"**

### Schritt 2: OBS Browser Source hinzufügen
1. In OBS: Rechtsklick auf Sources → "Add" → "Browser"
2. Name: "Emoji Rain HUD"
3. **URL**: `http://localhost:3000/emoji-rain/obs-hud`
4. **Width**: Entsprechend gewählter Auflösung (z.B. 1920)
5. **Height**: Entsprechend gewählter Auflösung (z.B. 1080)
6. ✅ Aktiviere: "Shutdown source when not visible"
7. ✅ Aktiviere: "Refresh browser when scene becomes active"
8. Klicke "OK"

### Schritt 3: Position anpassen
- Die Browser Source ist jetzt transparent
- Positioniere sie über deinem Stream
- Passe Größe/Position nach Bedarf an

## 🎯 Performance-Tipps

### Für beste Performance:
1. **Target FPS**: Standard 60 FPS (kann auf 30 reduziert werden bei schwacher Hardware)
2. **Max Emojis**: Reduziere `max_emojis_on_screen` wenn FPS drops auftreten
3. **Effekte deaktivieren**: Deaktiviere Particles bei Performance-Problemen
4. **OBS Settings**: Aktiviere "Shutdown source when not visible"

### Keyboard Shortcuts (OBS HUD):
- `Strg+P`: Performance HUD anzeigen/verstecken
- `Strg+R`: Auflösungs-Indikator anzeigen/verstecken
- `Strg+T`: Test Spawn (10 Emojis)

## 📊 Technical Details

### Architecture
```
┌─────────────────────────────────────┐
│         Main Plugin (main.js)        │
│  - Route Registration                │
│  - TikTok Event Handlers             │
│  - Config Management                 │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────────┐
│ Standard    │  │ OBS HUD        │
│ Overlay     │  │ (obs-hud.html) │
│ (overlay.   │  │ - Fixed Res    │
│  html)      │  │ - Game Quality │
│ - Responsive│  │ - Perf Monitor │
└─────────────┘  └────────────────┘
```

### Memory Management
- **Auto-Cleanup**: Emojis werden automatisch nach `emoji_lifetime_ms` entfernt
- **Limit Enforcement**: Maximale Anzahl wird strikt eingehalten
- **Page Unload**: Alle Ressourcen werden beim Verlassen der Seite freigegeben
- **Object Pooling**: Partikel werden wiederverwendet statt neu erstellt

### Performance Features
- **60 FPS Frame Limiting**: Verhindert übermäßige CPU-Nutzung
- **Hardware Acceleration**: GPU-beschleunigte Transforms
- **Efficient DOM Updates**: Minimale Reflows/Repaints
- **Optimized Physics**: Matter.js mit custom update loop

## 🐛 Troubleshooting

### Problem: Emojis erscheinen nicht
**Lösung**:
1. Prüfe ob Plugin enabled ist (Toggle oben)
2. Prüfe ob `obs_hud_enabled` aktiviert ist (für OBS HUD)
3. Öffne Browser Console (F12) und prüfe auf Fehler

### Problem: Niedrige FPS
**Lösung**:
1. Reduziere `max_emojis_on_screen`
2. Deaktiviere `enable_particles`
3. Reduziere `target_fps` auf 30
4. Erhöhe `emoji_lifetime_ms` (schnelleres Cleanup)

### Problem: Memory Leak
**Lösung**:
1. Stelle sicher dass OBS "Shutdown source when not visible" aktiviert hat
2. Reduziere `emoji_lifetime_ms`
3. Prüfe dass keine alte Version im Cache ist (Hard Refresh mit Strg+F5)

### Problem: Auflösung passt nicht
**Lösung**:
1. OBS Browser Source Größe muss exakt mit `obs_hud_width/height` übereinstimmen
2. Prüfe die Resolution im Settings Panel
3. Nutze den Resolution Indicator (Strg+R) im OBS HUD

## 📝 Changelog

### Version 2.0.0 (Enhanced Edition)
- ✨ Neues OBS HUD mit fester Auflösung
- ✨ Game-Quality Grafik (Glow, Particles, Depth)
- ✨ Performance HUD mit FPS/Memory Monitoring
- ⚡ 60 FPS Frame-Limiting
- ⚡ Hardware-beschleunigte Animationen
- ⚡ Optimiertes Memory Management
- ⚡ Object Pooling für Partikel
- 🐛 Fixed Memory Leaks
- 🐛 Fixed Performance Issues
- 🎨 Enhanced Visual Effects

## 🔧 Development

### Files
- `main.js` - Plugin Backend (Express Routes, Event Handlers)
- `ui.html` - Configuration UI
- `overlay.html` - Standard Responsive Overlay
- `obs-hud.html` - OBS HUD (Fixed Resolution, Enhanced Graphics)
- `plugin.json` - Plugin Metadata

### Testing
```bash
# Test Spawn (im Browser Console):
fetch('/api/emoji-rain/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 10 })
})
```

## 📄 License
Part of Pup Cid's TikTok Helper Suite

## 🙏 Credits
- Matter.js for Physics Engine
- Socket.IO for Real-time Communication
- TikTok Live Connector for Event Integration

---

**Made with 💜 by Pup Cid**
