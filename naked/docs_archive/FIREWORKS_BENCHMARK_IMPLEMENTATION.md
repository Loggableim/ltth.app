# Fireworks Plugin - Benchmark und Voreinstellungen Integration

## Übersicht

Das Fireworks Plugin (Classic Firework WebGL Version) wurde um ein umfassendes Benchmarking-System und Voreinstellungen erweitert. Diese Neuerungen ermöglichen es Benutzern, die optimalen Einstellungen für ihr System automatisch zu ermitteln und vordefinierte Leistungsstufen auszuwählen.

## Neue Funktionen

### 1. Tab-basierte Benutzeroberfläche

Die Settings-Seite wurde in drei Tabs aufgeteilt:

- **⚙️ Einstellungen**: Alle bestehenden Konfigurationsoptionen (unverändert)
- **🎨 Voreinstellungen**: Vordefinierte Performance-Profile
- **📊 Benchmark**: Automatisches Performance-Testing

### 2. Voreinstellungssystem

Sechs vordefinierte Performance-Profile sind verfügbar:

#### 🚀 Ultra (4K Ready)
- **Resolution**: 4K (3840x2160)
- **Max Particles**: 3000
- **Target FPS**: 60
- **Effects**: Alle aktiviert
- **GPU**: WebGL
- **Empfohlen für**: High-End Gaming PCs

#### ⚡ High (1440p)
- **Resolution**: 1440p (2560x1440)
- **Max Particles**: 2000
- **Target FPS**: 60
- **Effects**: Alle aktiviert
- **GPU**: WebGL
- **Empfohlen für**: Gaming PCs

#### ✨ Medium (1080p) - Empfohlen
- **Resolution**: 1080p (1920x1080)
- **Max Particles**: 1500
- **Target FPS**: 60
- **Effects**: Alle aktiviert
- **GPU**: WebGL
- **Empfohlen für**: Standard PCs

#### 💫 Low (720p)
- **Resolution**: 720p (1280x720)
- **Max Particles**: 1000
- **Target FPS**: 48
- **Effects**: Reduziert
- **GPU**: WebGL
- **Empfohlen für**: Ältere PCs

#### 🍞 Toaster (540p)
- **Resolution**: 540p (960x540)
- **Max Particles**: 500
- **Target FPS**: 30
- **Effects**: Minimal
- **GPU**: Canvas 2D
- **Empfohlen für**: Schwache PCs

#### 🥔 Potato (360p)
- **Resolution**: 360p (640x360)
- **Max Particles**: 300
- **Target FPS**: 24
- **Effects**: Minimal
- **GPU**: Canvas 2D
- **Empfohlen für**: Sehr schwache PCs

### 3. Automatisches Benchmarking

Das Benchmark-System führt automatisierte Performance-Tests durch:

#### Funktionsweise

1. **Benchmark starten**: Klick auf "🚀 Benchmark Starten"
2. **Overlay-Fenster**: Ein neues Fenster mit dem OBS-Overlay wird geöffnet
3. **Automatische Tests**: Jede Voreinstellung wird für 10 Sekunden getestet
4. **FPS-Messung**: Durchschnittliche, minimale und maximale FPS werden aufgezeichnet
5. **Ergebnisse**: Vergleich aller Voreinstellungen mit visueller Darstellung
6. **Empfehlungen**: Die zwei besten Voreinstellungen werden vorgeschlagen

#### Test-Szenario

- **Dauer pro Voreinstellung**: 10 Sekunden
- **Feuerwerk-Frequenz**: Alle 500ms ein neues Feuerwerk
- **FPS-Sampling**: Jede Sekunde
- **Gesamt-Testdauer**: ~60-90 Sekunden (6 Voreinstellungen)

#### Ergebnisdarstellung

Die Benchmark-Ergebnisse zeigen:
- ✅ Grün: Exzellente Performance (≥55 FPS)
- ✔️ Blau: Gute Performance (40-54 FPS)
- ⚠️ Gelb: Akzeptable Performance (30-39 FPS)
- ❌ Rot: Schlechte Performance (<30 FPS)

### 4. Intelligente Warnungen

Wenn ein Benutzer eine Voreinstellung wählt, die laut Benchmark schlecht performt (< 30 FPS durchschnittlich):

```
⚠️ Warnung: Diese Voreinstellung könnte auf Ihrem System laggen!

Der Benchmark hat eine durchschnittliche FPS von XX.X gemessen.

Möchten Sie diese Einstellung trotzdem verwenden?
```

Der Benutzer muss explizit bestätigen, dass er trotz der schlechten Performance fortfahren möchte.

## Technische Implementation

### Frontend (settings.html / settings.js)

#### Tab-System
```javascript
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}
```

#### Voreinstellungen
```javascript
const PRESETS = {
    ultra: { resolutionPreset: '4k', maxParticles: 3000, ... },
    high: { resolutionPreset: '1440p', maxParticles: 2000, ... },
    // ... weitere Presets
};
```

#### Benchmark-Logik
```javascript
async function runBenchmarkTest(presetName) {
    // Voreinstellung temporär anwenden
    await fetch('/api/fireworks/benchmark/set-preset', {
        method: 'POST',
        body: JSON.stringify({ preset: PRESETS[presetName] })
    });
    
    // FPS messen
    const fpsData = await measureFPS();
    
    return { preset: presetName, avgFps, minFps, maxFps };
}
```

### Backend (main.js)

#### Neue API-Endpunkte

**POST /api/fireworks/benchmark/set-preset**
- Wendet temporär eine Voreinstellung an (ohne zu speichern)
- Benachrichtigt das Overlay über Konfigurationsänderung

**GET /api/fireworks/benchmark/fps**
- Gibt die aktuelle FPS zurück
- FPS wird vom Overlay via Socket.io übermittelt

**POST /api/fireworks/benchmark/restore**
- Stellt die ursprüngliche Konfiguration wieder her

#### Socket.io Integration
```javascript
registerSocketHandlers() {
    const io = this.api.getSocketIO();
    io.on('connection', (socket) => {
        socket.on('fireworks:fps-update', (data) => {
            this.currentFps = data.fps;
        });
    });
}
```

### GPU Engine (engine.js)

FPS-Tracking wurde erweitert um Socket.io Emits:

```javascript
// In der render() Methode, nach FPS-Update
if (this.socket && this.socket.connected) {
    this.socket.emit('fireworks:fps-update', { 
        fps: this.fps, 
        timestamp: now 
    });
}
```

## Lokalisierung

Vollständige Übersetzungen für Deutsch und Englisch wurden hinzugefügt:

### Neue Übersetzungsschlüssel

- `fireworks.tab_settings` - "Einstellungen" / "Settings"
- `fireworks.tab_presets` - "Voreinstellungen" / "Presets"
- `fireworks.tab_benchmark` - "Benchmark" / "Benchmark"
- `fireworks.presets.*` - Alle Preset-bezogenen Texte
- `fireworks.benchmark.*` - Alle Benchmark-bezogenen Texte

## Benutzerfluss

### Empfohlener Workflow

1. **Erste Nutzung**:
   - Zum Tab "📊 Benchmark" wechseln
   - "🚀 Benchmark Starten" klicken
   - 1-2 Minuten warten
   - Empfohlene Voreinstellung aus den Top 2 wählen

2. **Manuelle Auswahl**:
   - Zum Tab "🎨 Voreinstellungen" wechseln
   - Gewünschte Voreinstellung wählen
   - "Anwenden" klicken
   - Bei Warnung: Entscheidung treffen

3. **Feinabstimmung**:
   - Zum Tab "⚙️ Einstellungen" wechseln
   - Einzelne Parameter nach Bedarf anpassen
   - "💾 Save Settings" klicken

## Datenpersistenz

- **Benchmark-Ergebnisse**: Im localStorage gespeichert (`fireworks-benchmark-results`)
- **Aktuelle Konfiguration**: In der Datenbank (via Plugin API)
- **Temporäre Benchmark-Config**: Nur im Memory während des Tests

## Sicherheit & Best Practices

1. **Keine Daten gehen verloren**: Originale Konfiguration wird vor Benchmark gesichert
2. **Pop-up Blocker**: Benutzer wird informiert, falls Benchmark-Fenster blockiert wird
3. **Validierung**: Alle Presets sind vordefiniert und validiert
4. **Benutzer-Bestätigung**: Warnungen bei schlechter Performance
5. **Abbruch möglich**: Benchmark kann jederzeit gestoppt werden

## Kompatibilität

- **Bestehende Einstellungen**: Vollständig kompatibel, keine Breaking Changes
- **Alte Konfigurationen**: Werden automatisch mit neuen Defaults ergänzt
- **WebGL/Canvas**: Beide Rendering-Modi werden unterstützt
- **Browser**: Alle modernen Browser (Chrome, Firefox, Edge)

## Zukünftige Erweiterungen

Mögliche Verbesserungen:

- [ ] Benutzerdefinierte Presets erstellen und speichern
- [ ] Export/Import von Benchmark-Ergebnissen
- [ ] Detaillierte Performance-Grafiken (FPS über Zeit)
- [ ] Automatische Anpassung während des Streamings
- [ ] Vergleich mit Community-Benchmarks

## Testing-Checkliste

- [x] Tab-Wechsel funktioniert reibungslos
- [x] Alle Voreinstellungen sind korrekt definiert
- [x] Benchmark startet und öffnet Overlay-Fenster
- [ ] FPS-Messung ist akkurat
- [ ] Warnungen werden korrekt angezeigt
- [ ] Voreinstellungen werden korrekt angewendet
- [ ] Originale Einstellungen bleiben erhalten
- [ ] Lokalisierung funktioniert (DE/EN)
- [ ] Socket.io Kommunikation ist stabil
- [ ] Keine Speicherlecks während langer Benchmarks

## Bekannte Einschränkungen

1. **Pop-up Blocker**: Benutzer muss Pop-ups für localhost erlauben
2. **System-Ressourcen**: Benchmark benötigt freie GPU-Ressourcen
3. **Hintergrund-Apps**: Andere GPU-intensive Apps können Ergebnisse verfälschen
4. **OBS Rendering**: FPS kann niedriger sein als in isoliertem Browser-Fenster

## Support & Debugging

Bei Problemen:

1. **Console-Logs prüfen**: `[Fireworks]` Prefix in Browser Console
2. **FPS-Anzeige**: Debug-Panel im Overlay aktivieren
3. **Network-Tab**: API-Calls zu `/api/fireworks/benchmark/*` prüfen
4. **Socket.io**: Verbindungsstatus in Console prüfen

## Changelog

### Version 1.0.0
- ✨ Neu: Tab-basierte UI mit 3 Tabs
- ✨ Neu: 6 vordefinierte Voreinstellungen (Ultra bis Potato)
- ✨ Neu: Automatisches Benchmark-System
- ✨ Neu: FPS-Messung und Reporting
- ✨ Neu: Intelligente Empfehlungen basierend auf Benchmark
- ✨ Neu: Warnungen bei schlechter Performance
- ✨ Neu: Vollständige DE/EN Lokalisierung
- 🔧 Verbessert: Socket.io Integration für Echtzeit-FPS
- 🔧 Verbessert: API-Endpunkte für Benchmark-Steuerung

---

**Implementiert**: Dezember 2025  
**Plugin**: Fireworks Superplugin (Classic WebGL)  
**Version**: 1.0.0  
**Kompatibilität**: PupCid's Little TikTool Helper Desktop
