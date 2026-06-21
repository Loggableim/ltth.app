# GPU-Optimierung und Performance-Monitoring - Benutzerhandbuch

**Version:** 1.0  
**Letzte Aktualisierung:** 2025-12-17  
**Für:** PupCid's Little TikTool Helper v1.2.2+

---

## 📋 Überblick

Dieses Handbuch erklärt die neuen GPU-Optimierungs- und Performance-Monitoring-Features in LTTH, die speziell für WebGL/Canvas-basierte Overlays entwickelt wurden.

### Was ist neu?

1. **Automatische GPU-Erkennung** - Erkennt deine Grafikkarte und passt die Qualität automatisch an
2. **Performance-Overlay** - Zeigt FPS, Memory und andere Metriken in Echtzeit
3. **Intelligente Quality-Anpassung** - Reduziert automatisch die Qualität bei schwacher Hardware

---

## 🎮 GPU-Erkennung

### Was macht sie?

Die GPU-Erkennung läuft automatisch beim Laden eines Overlays und:
- Identifiziert deine Grafikkarte (NVIDIA, AMD, Intel)
- Prüft, ob Hardware-Beschleunigung aktiv ist
- Warnt, wenn Software-Rendering verwendet wird
- Passt die Qualität automatisch an deine Hardware an

### Wie sehe ich die Ergebnisse?

Öffne die **Browser-Konsole** (`F12` → Console-Tab):

**Beispiel bei guter Hardware:**
```
🎮 GPU Detector - Capabilities
GPU: NVIDIA GeForce RTX 3060
Vendor: NVIDIA Corporation
Performance Tier: high
Preferred API: webgl2
WebGPU: ✅
WebGL 2: ✅
WebGL: ✅
Hardware Accelerated: ✅
Recommended Quality: ultra

✅ High-end GPU detected. Maximum quality recommended.
```

**Beispiel bei Software-Rendering:**
```
⚠️ Software rendering detected!
⚠️ Software rendering detected (SwiftShader). 
   Performance may be limited. Consider enabling 
   hardware acceleration in browser settings.
⚙️ Quality automatically reduced for software rendering
```

### Performance-Tiers

| Tier | GPU-Typen | Empfohlene Qualität |
|------|-----------|---------------------|
| **High** | NVIDIA RTX, AMD RX 6000/7000, Titan | Ultra |
| **Medium** | NVIDIA GTX, AMD RX 5000, Radeon | High |
| **Low** | Intel HD Graphics, Intel UHD | Medium |
| **Software** | SwiftShader, LLVMpipe | Low |

---

## 📊 Performance-Overlay

### Was ist das?

Ein Echtzeit-Performance-Monitor, der während des Streamens wichtige Metriken anzeigt:

- **FPS** (Frames per Second) - Wie flüssig läuft das Overlay?
- **Frame Time** - Zeit pro Frame in Millisekunden
- **Memory** - RAM-Nutzung des Overlays
- **Particles** - Anzahl aktiver Partikel (z.B. bei Fireworks)
- **Draw Calls** - Anzahl der Render-Operationen
- **GPU** - Deine Grafikkarte
- **API** - Verwendete Rendering-API (WebGL, Canvas 2D, etc.)

### Wie aktiviere ich es?

**Einfach:** Drücke **`Ctrl + Shift + P`** in jedem Overlay

Das Overlay erscheint oben rechts im Fenster.

### Wie lese ich die Werte?

#### FPS (Frames per Second)

- **Grün (>55 FPS)** = ✅ Perfekt! Overlay läuft flüssig
- **Gelb (30-55 FPS)** = 🟡 OK, aber könnte besser sein
- **Rot (<30 FPS)** = 🔴 Problematisch! Overlay laggt

**Ziel:** 60 FPS für maximale Flüssigkeit

#### Frame Time

- **<16.7ms** = 60 FPS (ideal)
- **16.7-33ms** = 30-60 FPS (akzeptabel)
- **>33ms** = <30 FPS (laggy)

#### Memory

Zeigt RAM-Nutzung des Browser-Tabs in MB.

- **<200 MB** = Normal
- **200-500 MB** = Erhöht (viele Partikel/Effekte aktiv)
- **>500 MB** = Hoch (möglicher Memory-Leak?)

#### Particles

Anzahl aktiver Partikel im Overlay (nur bei Particle-Effekten wie Fireworks).

- **0-500** = Wenig
- **500-2000** = Mittel
- **2000+** = Viel (kann FPS beeinflussen)

---

## ⚙️ Automatische Quality-Anpassung

### Wie funktioniert sie?

Das System erkennt automatisch:

1. **GPU-Performance-Tier** (High/Medium/Low/Software)
2. **Aktuelle FPS-Performance**
3. **Verfügbare Render-APIs** (WebGPU/WebGL/Canvas)

Basierend darauf passt es folgende Settings an:

| Setting | High Tier | Medium Tier | Low Tier | Software |
|---------|-----------|-------------|----------|----------|
| Max Particles | 5000 | 2000 | 1000 | 500 |
| Trail Length | 20 | 12 | 8 | 5 |
| Resolution | 1080p | 1080p | 720p | 540p |
| Glow Effects | ✅ | ✅ | ✅ | ❌ |
| Secondary Explosions | ✅ | ✅ | ❌ | ❌ |

### Kann ich das manuell ändern?

Ja! Die automatische Anpassung erfolgt nur beim Start. Du kannst jederzeit in den Plugin-Einstellungen die Qualität manuell anpassen.

---

## 🔧 Troubleshooting

### Problem: "Software rendering detected"

**Ursache:** Browser nutzt CPU statt GPU für Rendering.

**Lösung:**

#### Chrome/Edge:
1. Öffne `chrome://settings` (oder `edge://settings`)
2. Suche nach "Hardware-Beschleunigung"
3. Aktiviere "Hardwarebeschleunigung verwenden, falls verfügbar"
4. Browser neu starten

#### Firefox:
1. Öffne `about:preferences`
2. Scrolle zu "Performance"
3. Deaktiviere "Empfohlene Leistungseinstellungen verwenden"
4. Aktiviere "Hardwarebeschleunigung verwenden, falls verfügbar"
5. Browser neu starten

#### OBS Browser Source:
1. OBS Settings → Browser Sources
2. Launch Parameters hinzufügen:
   ```
   --enable-gpu-rasterization
   --force-gpu-rasterization
   --enable-zero-copy
   ```
3. OBS neu starten

### Problem: Performance-Overlay zeigt nicht an

**Lösung:**
- Drücke `Ctrl + Shift + P` (vielleicht war es bereits sichtbar und du hast es versteckt)
- Browser-Konsole (`F12`) auf Fehler prüfen
- Stelle sicher, dass das Overlay aktuell ist (> v1.2.2)

### Problem: FPS zu niedrig trotz guter GPU

**Mögliche Ursachen:**

1. **Zu viele Overlays aktiv**
   - Lösung: Deaktiviere ungenutzte Overlays

2. **Andere Programme nutzen GPU**
   - Lösung: Task-Manager → GPU-Auslastung prüfen

3. **Browser-Tab im Hintergrund**
   - Lösung: Browser-Tab in Vordergrund oder OBS Browser Source nutzen

4. **V-Sync aktiviert**
   - FPS limitiert auf Monitor-Refresh-Rate (oft 60 Hz)
   - Normal und gewünscht!

### Problem: Memory steigt kontinuierlich

**Möglicher Memory-Leak!**

**Lösung:**
1. Overlay-Seite neu laden (F5)
2. Wenn Problem bleibt → Bug-Report an Entwickler

---

## 📈 Performance-Tipps

### Für beste Performance:

1. **Hardware-Beschleunigung aktivieren** (siehe Troubleshooting)
2. **Nur benötigte Overlays laden**
3. **OBS Browser Source nutzen** statt externem Browser
4. **Quality-Presets verwenden** statt manueller Anpassung
5. **Performance-Overlay** nutzen um Engpässe zu finden

### OBS Browser Source - Optimale Settings:

**Launch Parameters:**
```
--enable-gpu-rasterization
--force-gpu-rasterization
--enable-zero-copy
--num-raster-threads=4
--high-dpi-support=1
```

**Eigenschaften:**
- FPS: 60
- Shutdown source when not visible: ✅ Aktiviert
- Refresh browser when scene becomes active: ❌ Deaktiviert

---

## 🎯 Best Practices

### Streaming Setup

1. **Pre-Stream Check:**
   - Öffne Performance-Overlay (`Ctrl+Shift+P`)
   - Prüfe FPS: Sollte 60 sein
   - Prüfe GPU-Info: Sollte deine echte GPU zeigen
   - Wenn "Software" → Hardware-Beschleunigung aktivieren!

2. **Während des Streams:**
   - Performance-Overlay verstecken (`Ctrl+Shift+P`)
   - Nur bei Performance-Problemen wieder einblenden
   - Memory im Auge behalten (sollte nicht steigen)

3. **Nach dem Stream:**
   - Browser-Cache leeren
   - OBS neu starten (verhindert Memory-Leaks)

### Multi-Overlay Setup

Wenn mehrere Overlays gleichzeitig laufen:

1. **Priorisierung:**
   - Wichtigste Overlays: High Quality
   - Hintergrund-Overlays: Medium/Low Quality

2. **Staggered Loading:**
   - Lade Overlays nacheinander, nicht alle auf einmal
   - 2-3 Sekunden Pause zwischen Overlays

3. **Quality-Balance:**
   - Beispiel bei 3 Overlays:
     - Fireworks: High (Hauptattraktion)
     - Flame Border: Medium (Hintergrund)
     - Emoji Rain: Low (selten aktiv)

---

## 🔍 Für Entwickler

### GPU Detector API

```javascript
// Detect GPU capabilities
const caps = await window.gpuDetector.detect();

// Check hardware acceleration
if (!window.gpuDetector.isHardwareAccelerated()) {
  console.warn('Software rendering!');
  // Reduce quality
}

// Get recommended quality
const quality = window.gpuDetector.getRecommendedQuality();
// Returns: 'ultra', 'high', 'medium', or 'low'

// Access raw data
console.log(caps.gpu.vendor); // "NVIDIA Corporation"
console.log(caps.gpu.renderer); // "GeForce RTX 3060"
console.log(caps.tier); // "high"
console.log(caps.preferredAPI); // "webgl2"
```

### Performance Overlay API

```javascript
// Update metrics
window.perfOverlay.update({
  fps: 60,
  frameTime: 16.7,
  particleCount: 1234,
  drawCalls: 45,
  renderAPI: 'webgl2'
});

// Show/Hide
window.perfOverlay.show();
window.perfOverlay.hide();
window.perfOverlay.toggle();
```

### Integration in eigene Plugins

**Schritt 1:** Scripts einbinden
```html
<script src="/js/gpu-detector.js"></script>
<script src="/js/performance-overlay.js"></script>
```

**Schritt 2:** GPU-Detection beim Start
```javascript
async function init() {
  const caps = await window.gpuDetector.detect();
  
  if (!caps.isHardwareAccelerated()) {
    // Reduce quality
    CONFIG.maxParticles = 500;
    CONFIG.resolution = 0.5;
  }
}
```

**Schritt 3:** Performance-Metriken im Render-Loop
```javascript
function render() {
  // Your rendering code...
  
  // Update performance overlay
  if (window.perfOverlay) {
    window.perfOverlay.update({
      fps: currentFPS,
      frameTime: deltaTime,
      particleCount: particles.length
    });
  }
  
  requestAnimationFrame(render);
}
```

---

## 📚 Weitere Ressourcen

- **Technische Analyse:** `MULTIKERN_WEBGL_OPTIMIERUNG_ANALYSE.md`
- **Source Code:**
  - GPU Detector: `app/public/js/gpu-detector.js`
  - Performance Overlay: `app/public/js/performance-overlay.js`
- **Beispiel-Integration:** `app/plugins/fireworks/overlay.html`

---

## 🐛 Feedback & Bug-Reports

Probleme oder Verbesserungsvorschläge?

- **GitHub Issues:** https://github.com/Loggableim/ltth_dev/issues
- **E-Mail:** loggableim@gmail.com

---

**Version:** 1.0  
**Autor:** LTTH Development Team  
**Lizenz:** CC-BY-NC-4.0
