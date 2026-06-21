# Emoji Rain – Feature-Dokumentation

> **Beschreibung:** Physikbasierter Emoji-Regen-Effekt für TikTok-LIVE-Streams – entweder als GPU-beschleunigte WebGPU-Version oder als Canvas/Matter.js-Fallback-Version.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Versionen](#versionen)
3. [Setup & Einrichtung](#setup--einrichtung)
4. [OBS Overlay-URLs](#obs-overlay-urls)
5. [Konfigurationsoptionen](#konfigurationsoptionen)
6. [WebGPU vs. Canvas Fallback](#webgpu-vs-canvas-fallback)
7. [Performance-Hinweise](#performance-hinweise)
8. [Weiterführende Links](#weiterführende-links)

---

## Übersicht

Der **Emoji Rain** Effekt lässt Emojis, Custom-Bilder oder Gift-Icons vom oberen Bildschirmrand herunterrieseln – gesteuert durch TikTok-Events (Gifts, Follows, Likes, Subscribes, Shares). Der Effekt wird als transparente OBS Browser Source eingebunden und ist vollständig anpassbar.

Es gibt zwei Varianten:

| Variante | Plugin | Technologie | Status |
|----------|--------|-------------|--------|
| **WebGPU Emoji Rain** | `webgpu-emoji-rain` | WebGPU (GPU-beschleunigt) | 🔴 Early Beta |
| **Emoji Rain v2.0** | `emoji-rain` | Canvas + Matter.js (CPU) | 🟢 Alpha |

Beide Varianten sind unabhängig voneinander und können gleichzeitig installiert sein. Für beste Performance wird die WebGPU-Version empfohlen, sofern ein kompatibler Browser/GPU vorhanden ist.

---

## Versionen

### WebGPU Emoji Rain (Empfohlen)

**Plugin-ID:** `webgpu-emoji-rain`  
**Version:** 2.0.0  
**Status:** 🔴 Early Beta

GPU-beschleunigtes Rendering mit WebGPU Instanced Drawing. Ideal für leistungsstarke Setups mit modernem Browser.

**Features:**
- 🚀 WebGPU-beschleunigtes Rendering (10× schneller als Canvas)
- 🎨 Konfigurierbare Emoji-Sets und Custom-Image-Uploads (PNG/JPG/GIF/WebP/SVG)
- 👤 Benutzer-spezifische Emoji-Mappings
- 🎁 TikTok-Event-Integration (Gift, Like, Follow, Share, Subscribe)
- ⭐ SuperFan-Burst-Effekte
- 🔗 Flow-System-Kompatibilität
- 📺 OBS-HUD-Overlay (1920×1080 Fixed)
- 💾 Persistenter Speicher (Update-sicher)

### Emoji Rain v2.0 (Canvas-Version)

**Plugin-ID:** `emoji-rain`  
**Version:** 2.0.0  
**Status:** 🟢 Alpha

Physikbasierte Canvas-Version mit Matter.js-Engine. Funktioniert in allen modernen Browsern ohne WebGPU-Unterstützung.

**Features:**
- 🎨 Physik-Engine (Matter.js) für realistische Fallbewegungen
- 🎁 Gift-spezifische Emojis
- 👤 User-Emoji-Mappings
- 📺 OBS HUD-Overlay
- 🎯 60 FPS Ziel-Framerate
- 💾 Persistente Konfiguration

---

## Setup & Einrichtung

### Schritt 1: Plugin aktivieren

1. Dashboard öffnen: `http://localhost:3000`
2. **Plugins** → gewünschtes Emoji-Rain-Plugin suchen
3. Plugin **aktivieren** (Toggle-Switch)
4. Seite neu laden, falls notwendig

### Schritt 2: OBS Browser Source hinzufügen

1. OBS Studio öffnen
2. **Szene** auswählen → **Quellen** → **+** → **Browser**
3. URL eingeben (siehe [OBS Overlay-URLs](#obs-overlay-urls))
4. Auflösung: **1920 × 1080** (oder deine Stream-Auflösung)
5. **"Szene ist aktiv" aktualisieren** aktivieren
6. Häkchen bei **"CSS-Stile überschreiben"** setzen und leer lassen (für Transparenz)

### Schritt 3: Events konfigurieren

1. Im Dashboard → **Plugin-Einstellungen** des Emoji Rain Plugins
2. **Trigger-Events** konfigurieren (welche TikTok-Events den Regen auslösen)
3. **Emoji-Sets** und Custom-Images hochladen (optional)
4. **Mindest-Schwellenwerte** setzen (z.B. nur bei Gifts mit ≥ 5 Coins)

---

## OBS Overlay-URLs

### WebGPU Emoji Rain

| Verwendung | URL |
|------------|-----|
| Standard (Responsiv) | `http://localhost:3000/webgpu-emoji-rain/overlay` |
| OBS HUD (1920×1080) | `http://localhost:3000/webgpu-emoji-rain/obs-hud` |

### Emoji Rain v2.0 (Canvas)

| Verwendung | URL |
|------------|-----|
| Standard | `http://localhost:3000/emoji-rain/overlay` |
| OBS HUD | `http://localhost:3000/emoji-rain/obs-hud` |

> **Hinweis:** Alle Overlay-URLs sind für OBS Browser Source gedacht. Sie zeigen auf einen transparenten Hintergrund und eignen sich direkt als Overlay über dem Stream.

---

## Konfigurationsoptionen

### Gemeinsame Einstellungen (beide Versionen)

| Option | Beschreibung | Standard |
|--------|--------------|---------|
| **Enabled** | Plugin aktivieren/deaktivieren | `true` |
| **Emoji Size** | Größe der Emojis in Pixel | `64` |
| **Fall Speed** | Fallgeschwindigkeit (1–10) | `5` |
| **Spawn Rate** | Emojis pro Sekunde | `10` |
| **Max Particles** | Maximale gleichzeitige Emojis | `100` |
| **Trigger Events** | Welche TikTok-Events auslösen | Gift, Follow |
| **Gift Threshold** | Mindest-Coins für Gift-Trigger | `0` |
| **Custom Emojis** | Custom Emoji-Set hochladen | – |

### WebGPU-spezifische Einstellungen

| Option | Beschreibung |
|--------|--------------|
| **WebGPU Fallback** | Automatisch auf Canvas wechseln wenn kein WebGPU | `true` |
| **Instanced Rendering** | GPU-Instancing für große Partikelmengen | `true` |
| **SuperFan Burst** | Burst-Effekt für SuperFan-Events | `true` |
| **User Emoji Map** | Pro-User verschiedene Emojis zuweisen | – |

### Canvas-spezifische Einstellungen (v2.0)

| Option | Beschreibung |
|--------|--------------|
| **Physics Engine** | Matter.js-Physik aktivieren | `true` |
| **Gravity** | Gravitations-Stärke | `1.0` |
| **Bounce** | Restitution beim Aufprall | `0.3` |
| **Rotation** | Emojis rotieren lassen | `true` |

---

## WebGPU vs. Canvas Fallback

### Wann WebGPU verwenden?

✅ **Empfohlen wenn:**
- Chrome 113+ oder Edge 113+ als OBS Browser
- Moderne GPU (NVIDIA/AMD, DirectX 12 / Vulkan)
- Viele gleichzeitige Partikel gewünscht (>100)
- Minimale CPU-Last gewünscht

❌ **Nicht möglich wenn:**
- Safari oder Firefox als OBS Browser (kein WebGPU-Support)
- Ältere GPU ohne WebGPU-Unterstützung
- Dedizierter Streaming-PC mit schwacher GPU

### Automatischer Fallback

Die **WebGPU Emoji Rain**-Version erkennt automatisch, ob WebGPU verfügbar ist. Falls nicht, wechselt sie auf die Canvas-Version als Fallback – sofern die Option **"WebGPU Fallback"** aktiviert ist.

```
Browser-Check:
  navigator.gpu vorhanden? → WebGPU Rendering
  navigator.gpu fehlt?     → Canvas Fallback (oder Fehlermeldung)
```

> **Tipp:** Überprüfe in OBS unter **Browser** → **Interact** die Developer Console auf `[WebGPU] Initialized successfully` oder `[Canvas Fallback] Using 2D context`.

---

## Performance-Hinweise

### WebGPU Version

| Metrik | Wert |
|--------|------|
| Target FPS | 60 FPS konstant |
| Performance-Vorteil | 10× schneller als Canvas |
| CPU-Last | Minimal (GPU übernimmt) |
| Memory-Footprint | Niedrig |
| Max. Partikel (empfohlen) | 500+ |

### Canvas Version (Matter.js)

| Metrik | Wert |
|--------|------|
| Target FPS | 60 FPS |
| CPU-Last | Mittel (abhängig von Partikelzahl) |
| Max. Partikel (empfohlen) | 100–200 |

### Optimierungstipps

1. **OBS Browser Cache leeren:** Wenn das Overlay laggt, Browser Source neu laden (Rechtsklick → Aktualisieren)
2. **Partikelanzahl reduzieren** bei Performance-Problemen (`Max Particles` senken)
3. **Hardware-Beschleunigung** in OBS aktivieren: Einstellungen → Erweitert → Browser-Quellen → Hardware-Beschleunigung
4. **Separate Scene** für Overlays: Alle Browser Sources in einer eigenen Szene gruppieren
5. **Spawn Rate drosseln** bei schwacher Hardware (`Spawn Rate` auf 3–5 reduzieren)

---

## Weiterführende Links

- [Plugin-Liste](../Plugin-Liste.md) – Vollständige Plugin-Details (WebGPU Emoji Rain & Emoji Rain v2.0)
- [Features/WebGPU-Engine](WebGPU-Engine.md) – WebGPU Rendering Engine Dokumentation
- [Overlays & Alerts](../Overlays-&-Alerts.md) – Alle OBS Overlay-URLs im Überblick
- [modules/flows](../modules/flows.md) – Flow-Automation für Emoji-Rain-Trigger

---

*Letzte Aktualisierung: 2026-04-04*  
*Version: 1.3.3*
