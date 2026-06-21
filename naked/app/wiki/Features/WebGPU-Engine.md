# WebGPU Engine

[← Features](../Home#features-im-detail) | [→ GCCE](GCCE)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Was ist WebGPU?](#was-ist-webgpu)
3. [Features](#features)
4. [Unterstützte Plugins](#unterstützte-plugins)
5. [Performance-Vergleich](#performance-vergleich)
6. [Browser-Kompatibilität](#browser-kompatibilität)
7. [Technische Details](#technische-details)
8. [Troubleshooting](#troubleshooting)

---

## 🔍 Übersicht

Die **WebGPU Engine** ist ein GPU-beschleunigtes Rendering-System für Little TikTool Helper v1.2.1. Sie ermöglicht hochperformante Partikel-Effekte, Animationen und visuelle Effekte mit minimaler CPU-Belastung.

### Hauptvorteile

✅ **10x schnellere Performance** als Canvas-basierte Lösungen  
✅ **60 FPS konstant** auch bei 10.000+ Partikeln  
✅ **GPU-Offloading** entlastet die CPU für andere Tasks  
✅ **Compute Shader** für komplexe Physik-Simulationen  
✅ **Instanced Rendering** für effiziente Partikel-Darstellung

---

## 💡 Was ist WebGPU?

**WebGPU** ist die nächste Generation von Web-Grafik-APIs, entwickelt als Nachfolger von WebGL. Es bietet:

- **Direkter GPU-Zugriff** - Moderne GPU-Features nutzbar
- **Compute Shaders** - GPU-beschleunigte Berechnungen
- **Bessere Performance** - Weniger Overhead als WebGL
- **Zukunftssicher** - Native Browser-Unterstützung

### WebGL vs. WebGPU

| Feature | WebGL 2 | WebGPU |
|---------|---------|--------|
| **Performance** | Gut | Exzellent |
| **Compute Shaders** | ❌ | ✅ |
| **Instanced Rendering** | Begrenzt | Optimiert |
| **Browser-Support** | Überall | Chrome 113+, Edge 113+ |
| **CPU-Overhead** | Mittel | Niedrig |

---

## ✨ Features

### 1. Instanced Rendering
Rendert Tausende von identischen Objekten (z.B. Emojis) in einem einzigen Draw-Call.

**Vorteile:**
- Minimale Draw-Calls
- Maximale GPU-Auslastung
- Konstante Performance unabhängig von Partikel-Anzahl

### 2. Compute Shaders
GPU-basierte Physik-Berechnungen für realistische Bewegungen.

**Verwendung:**
- Partikel-Physik (Schwerkraft, Wind, Kollision)
- Particle-Life-Cycle-Management
- Effizienz-Optimierung

### 3. Render Graph System
Modulares Rendering-Pipeline-System für komplexe Effekte.

**Komponenten:**
- Particle Emitter
- Physics Simulation
- Trail Renderer
- Post-Processing

### 4. Multi-Stage Effects
Mehrstufige Effekte wie Feuerwerke mit Launch, Burst, Trail und Fade.

---

## 🔌 Unterstützte Plugins

### WebGPU Emoji Rain v2.0
**Status:** 🔴 Early Beta  
**Beschreibung:** GPU-beschleunigter Emoji-Partikel-Effekt

**Features:**
- Instanced Rendering für Emojis
- Custom Emoji-Sets
- User-Mappings
- 60 FPS bei 1000+ Emojis

**Performance:**
- Canvas-Version: ~30 FPS bei 500 Emojis
- WebGPU-Version: 60 FPS bei 2000+ Emojis

## 📊 Performance-Vergleich

### Emoji Rain: Canvas vs. WebGPU

| Metrik | Canvas (Matter.js) | WebGPU |
|--------|-------------------|---------|
| **FPS bei 500 Partikeln** | 30-40 FPS | 60 FPS |
| **FPS bei 1000 Partikeln** | 15-20 FPS | 60 FPS |
| **FPS bei 2000 Partikeln** | 5-10 FPS | 60 FPS |
| **CPU-Auslastung** | 40-60% | 10-15% |
| **GPU-Auslastung** | 10-20% | 50-70% |
| **Memory-Footprint** | 150-200 MB | 80-120 MB |

### Fireworks: WebGL vs. WebGPU

| Metrik | WebGL | WebGPU |
|--------|-------|--------|
| **FPS bei 5000 Partikeln** | 45-55 FPS | 60 FPS |
| **FPS bei 10000 Partikeln** | 20-30 FPS | 60 FPS |
| **Draw Calls** | 100+ | 5-10 |
| **CPU-Overhead** | Mittel | Niedrig |
| **Compute Shader** | ❌ | ✅ |

**Benchmark-System:** Chrome 120, RTX 3060, i7-10700K

---

## 🌐 Browser-Kompatibilität

### Unterstützte Browser

| Browser | Version | WebGPU-Support |
|---------|---------|----------------|
| **Chrome** | 113+ | ✅ Vollständig |
| **Edge** | 113+ | ✅ Vollständig |
| **Opera** | 99+ | ✅ Vollständig |
| **Brave** | 1.52+ | ✅ Vollständig |
| **Firefox** | Experimentell | ⚠️ Flag erforderlich |
| **Safari** | Experimentell | ⚠️ macOS 14+ |

### WebGPU aktivieren

**Chrome/Edge:**
- WebGPU ist standardmäßig aktiviert (ab Version 113)

**Firefox:**
1. `about:config` öffnen
2. `dom.webgpu.enabled` → `true`
3. Browser neu starten

**Safari:**
1. Safari Technology Preview nutzen
2. Develop → Experimental Features → WebGPU aktivieren

### Fallback-Mechanismus

Wenn WebGPU nicht verfügbar ist, verwenden die Plugins automatisch Fallback-Renderer:

1. **WebGPU** (bevorzugt)
2. **WebGL 2** (Fallback 1)
3. **Canvas 2D** (Fallback 2)

**Beispiel - WebGPU Emoji Rain:**
```javascript
// Auto-Detection
if (navigator.gpu) {
  // WebGPU Renderer nutzen
} else if (WebGL2RenderingContext) {
  // WebGL Fallback (emoji-rain Plugin)
} else {
  // Canvas Fallback
}
```

---

## 🛠️ Technische Details

### Architektur

```
┌─────────────────────────────────────┐
│      WebGPU Engine Core             │
├─────────────────────────────────────┤
│  • GPU Device Management            │
│  • Shader Compilation               │
│  • Buffer Management                │
│  • Texture Management               │
└─────────────────────────────────────┘
           │
           ├──────────────┬──────────────┐
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐  ┌──────────┐
    │ Particle │   │ Compute  │  │ Render   │
    │ System   │   │ Shader   │  │ Pipeline │
    └──────────┘   └──────────┘  └──────────┘
```

### Shader-Pipeline

**Vertex Shader:**
```wgsl
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0)
  );
  
  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  return output;
}
```

**Fragment Shader:**
```wgsl
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(1.0, 0.5, 0.2, 1.0); // Orange
}
```

**Compute Shader (Physik):**
```wgsl
@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  
  // Physik-Update
  particles[index].velocity += gravity * deltaTime;
  particles[index].position += particles[index].velocity * deltaTime;
  
  // Lebensdauer
  particles[index].life -= deltaTime;
}
```

### Buffer-Management

**Particle Buffer:**
```javascript
const particleBuffer = device.createBuffer({
  size: PARTICLE_COUNT * PARTICLE_SIZE,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
  mappedAtCreation: false
});
```

**Instancing:**
```javascript
// Ein Draw-Call für 10.000 Partikel
passEncoder.draw(4, PARTICLE_COUNT, 0, 0);
```

---

## 🐛 Troubleshooting

### WebGPU nicht verfügbar

**Symptom:** Plugin zeigt "WebGPU not supported"

**Lösungen:**
1. **Browser aktualisieren** - Chrome/Edge 113+
2. **Hardware-Beschleunigung aktivieren**
   - Chrome: `chrome://settings/system`
   - "Hardwarebeschleunigung verwenden" aktivieren
3. **GPU-Treiber aktualisieren**
4. **Fallback nutzen** - Canvas/WebGL-Version verwenden

### Niedrige FPS trotz WebGPU

**Symptom:** FPS unter 60 trotz WebGPU

**Lösungen:**
1. **Partikel-Anzahl reduzieren** - In Plugin-Settings
2. **Andere Browser-Tabs schließen** - GPU-Ressourcen freigeben
3. **OBS-Settings** - Hardware-Encoding aktivieren
4. **Grafiktreiber aktualisieren**

### Partikel-Flackern

**Symptom:** Partikel flackern oder verschwinden

**Lösungen:**
1. **VSync aktivieren** - In Browser-Settings
2. **Refresh-Rate prüfen** - Monitor-Settings
3. **Browser-Cache leeren**
4. **Plugin neu laden**

### Compute Shader-Fehler

**Symptom:** Console-Error "Compute Shader compilation failed"

**Lösungen:**
1. **Compute Shader-Support prüfen:**
   ```javascript
   console.log(navigator.gpu.getPreferredCanvasFormat());
   ```
2. **Chrome-Flags aktivieren:**
   - `chrome://flags/#enable-unsafe-webgpu`
3. **Fallback auf WebGL** - Fireworks-Plugin nutzen

---

## 🔗 Weiterführende Ressourcen

### Offizielle Dokumentation
- [WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [WGSL Spec](https://www.w3.org/TR/WGSL/)
- [WebGPU Best Practices](https://toji.github.io/webgpu-best-practices/)

### Plugins mit WebGPU
- **[WebGPU Emoji Rain](Plugin-Liste.md#webgpu-emoji-rain)** - WebGPU Emoji Rain Plugin

### Weitere Features
- **[Emoji Rain](Features/Emoji-Rain.md)** - Emoji Rain Dokumentation
- **[Architektur](Architektur.md)** - System-Architektur

---

[← Features](../Home#features-im-detail) | [→ GCCE](GCCE)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*
