# 🎨 TikTok Visual Effects Overlay Plugin

WebGL-basiertes Multi-Effekt-Overlay für TikTok Livestreams mit 4 beeindruckenden visuellen Modi, Echtzeit-Vorschau und vollständig konfigurierbarer Oberfläche.

## ✨ Neue Features in v2.1

- 👁️ **Echtzeit-Vorschau** - Direkte Vorschau der Effekte im Settings-Panel
- 📍 **Rahmen-Positionierung** - Präzise Positionierung des Effekt-Rahmens (X, Y, Breite, Höhe)
- 📐 **Erweiterte Auflösungen** - Unterstützung für 2K (1440×2560) und 4K (2160×3840) in Portrait & Landscape
- 🔄 **Live-Synchronisation** - Alle Änderungen werden in Echtzeit im OBS-Overlay aktualisiert
- ⛶ **Vollbild-Modus** - Preview kann im Vollbildmodus angezeigt werden

## Features

- ✨ **Moderne WebGL Shader** - Hardware-beschleunigte, hochperformante Effekte
- 🎭 **4 Visual Effect Modes** - Wähle zwischen Flames, Particles, Energy, Lightning
- 🎨 **Anpassbare Farben** - Frei wählbare Farbe via Color Picker für alle Effekte
- 📐 **TikTok Format Presets** - Vordefinierte Auflösungen bis 4K
  - TikTok Portrait/Landscape (720×1280 / 1280×720)
  - HD Portrait/Landscape (1080×1920 / 1920×1080)
  - 2K Portrait/Landscape (1440×2560 / 2560×1440)
  - 4K Portrait/Landscape (2160×3840 / 3840×2160)
  - Custom (eigene Auflösung)
- 🖼️ **Flexible Rahmenposition** - Unten, Oben, Seiten oder rundherum
- 📍 **Präzise Positionierung** - Prozentuale Angabe von Position und Größe
- 👁️ **Echtzeit-Vorschau** - Integrierte Preview mit Live-Updates
- ⚡ **Dynamische Animation** - Einstellbare Geschwindigkeit und Intensität für jeden Effekt
- 🎯 **OBS-optimiert** - Transparenter Hintergrund, keine Artefakte
- 🔧 **Live-Konfiguration** - Alle Einstellungen in Echtzeit änderbar
- 🔄 **Echtzeit-Umschaltung** - Wechsel zwischen Effekten ohne Neustart
- 🚀 **Performant** - WebGL 1.0 kompatibel, läuft auf jedem System

## Installation

1. Das Plugin ist bereits im `/app/plugins/flame-overlay/` Verzeichnis installiert
2. LTTH starten und zum Plugin-Manager navigieren
3. "TikTok Visual Effects Overlay" aktivieren
4. Einstellungen öffnen über das Plugin-Menü

## Konfiguration

### Effekt-Typ

- **🔥 Flammen (Klassisch)**: Verbesserte realistische Flammen mit Multi-Octave-Turbulenz
- **✨ Partikel-Burst**: Animiertes Partikelsystem mit Größen- und Farbvariation
- **⚡ Energie-Wellen**: Fließende Wellen-Effekte mit Sinuswellen-Mustern
- **⚡ Elektrische Blitze**: Realistische Blitz-Arcs mit Flimmern und Glühen

### Auflösung & Format

- **Resolution Preset**: Wähle zwischen vordefinierten Formaten
  - TikTok Portrait (720×1280) - Standard TikTok Format
  - TikTok Landscape (1280×720)
  - HD Portrait (1080×1920) - Höhere Qualität
  - HD Landscape (1920×1080)
  - 2K Portrait (1440×2560) - QHD Qualität
  - 2K Landscape (2560×1440)
  - 4K Portrait (2160×3840) - Ultra HD Qualität
  - 4K Landscape (3840×2160)
  - Custom - Eigene Auflösung definieren

### Echtzeit-Vorschau

- **Vorschau starten/stoppen** - Integrierte Live-Vorschau der Effekte
- **Neu laden** - Vorschau aktualisieren
- **Vollbild** - Vorschau im Vollbildmodus anzeigen
- **Rahmen-Positionierung** - Präzise Steuerung der Effekt-Position:
  - **X-Position (%)**: Horizontale Position des Effekt-Rahmens
  - **Y-Position (%)**: Vertikale Position des Effekt-Rahmens
  - **Breite (%)**: Breite des Effekt-Rahmens
  - **Höhe (%)**: Höhe des Effekt-Rahmens
- Alle Änderungen werden in Echtzeit sowohl in der Vorschau als auch im OBS-Overlay angezeigt

### Rahmen Einstellungen

- **Rahmen Position**:
  - `Unten` - Effekte nur am unteren Rand (klassisch für TikTok)
  - `Oben` - Effekte nur am oberen Rand
  - `Seiten` - Effekte links und rechts
  - `Rundherum` - Effekte an allen Kanten (volle Immersion)

- **Rahmenbreite**: 50-500 Pixel (Standard: 150px)
- **Nur Kanten maskieren**: Weicherer Übergang zu transparenten Bereichen

### Effekt Aussehen

- **Effektfarbe**: Frei wählbare Farbe via Color Picker (Standard: #ff6600 - Orange)
- **Hintergrund Tint**: Optional färbbare Hintergrundfarbe
- **Hintergrund Transparenz**: 0.0 (voll transparent) bis 1.0 (deckend)

### Animation

- **Flammen Geschwindigkeit**: 0.1 - 2.0 (Standard: 0.5)
  - Niedrigere Werte = ruhigere, langsamere Flammen
  - Höhere Werte = energetische, schnellere Flammen

- **Flammen Intensität**: 0.5 - 3.0 (Standard: 1.3)
  - Steuert die Turbulenz/Wildheit der Flammen
  - Höhere Werte = chaotischere Bewegung

- **Helligkeit**: 0.1 - 1.0 (Standard: 0.25)
  - Gesamthelligkeit des Effekts

### Visuelle Effekte

- **Glow-Effekt**: Aktiviert Leuchteffekt
- **Additive Blending**: Hellere, leuchtendere Flammen (empfohlen)
- **High DPI Support**: Bessere Qualität auf hochauflösenden Displays

## OBS Browser Source Setup

### Schritt-für-Schritt Anleitung

1. **In OBS**: Rechtsklick in der Szene → "Hinzufügen" → "Browser"

2. **URL eintragen**:
   ```
   http://localhost:3000/flame-overlay/overlay
   ```

3. **Breite & Höhe**: Entsprechend deiner gewählten Auflösung
   - TikTok Portrait: 720 × 1280
   - HD Portrait: 1080 × 1920

4. **Wichtige Einstellungen**:
   - ✅ "Shutdown source when not visible" **deaktivieren**
   - FPS: 60 (für flüssige Animation)
   - Transparenter Hintergrund ist automatisch aktiv

5. **Position**: Über dein TikTok-Stream-Layout legen

### Tipps für beste Qualität

- **Performance**: Bei Problemen Auflösung reduzieren oder Intensität verringern
- **Transparenz**: Funktioniert automatisch - kein Chroma Key nötig
- **Skalierung**: Nutze die OBS-Transformation zum Anpassen
- **Layering**: Lege das Overlay über dein Kamerabild

## Technische Details

### WebGL Shader

Das Plugin verwendet den WebGL Fire Shader basierend auf:
- Modified Blum Blum Shub Noise Generator
- Multi-octave Turbulence
- Volumetric Fire Sampling
- Real-time Animation

### Performance

- **GPU-beschleunigt**: Nutzt WebGL für Hardware-Rendering
- **Optimiert**: Minimale CPU-Last
- **60 FPS**: Flüssige Animation
- **WebGL 1.0**: Kompatibel mit allen modernen Browsern

### Dateien

```
flame-overlay/
├── plugin.json              # Plugin Metadata
├── main.js                  # Plugin Backend (Node.js)
├── README.md               # Diese Datei
├── ui/
│   └── settings.html       # Konfigurations-UI
├── renderer/
│   ├── index.html          # WebGL Overlay
│   └── flame.js            # WebGL Renderer
└── textures/
    ├── nzw.png            # Noise Texture
    └── firetex.png        # Fire Profile Texture
```

## API Endpoints

### GET `/flame-overlay/ui`
Öffnet die Konfigurations-Oberfläche

### GET `/flame-overlay/overlay`
Overlay-Renderer (für OBS Browser Source)

### GET `/api/flame-overlay/config`
Aktuelle Konfiguration abrufen

**Response:**
```json
{
  "success": true,
  "config": {
    "resolutionPreset": "tiktok-portrait",
    "frameMode": "bottom",
    "frameThickness": 150,
    "flameColor": "#ff6600",
    "flameSpeed": 0.5,
    "flameIntensity": 1.3,
    "flameBrightness": 0.25,
    ...
  }
}
```

### POST `/api/flame-overlay/config`
Konfiguration aktualisieren

**Body:**
```json
{
  "flameColor": "#ff0000",
  "flameSpeed": 0.8,
  "frameThickness": 200
}
```

## Troubleshooting

### Overlay wird nicht angezeigt
- Prüfe ob das Plugin aktiviert ist
- Prüfe die OBS Browser Source URL
- Aktualisiere die Browser Source in OBS

### Flammen sind zu hell/dunkel
- Passe die "Helligkeit" in den Einstellungen an
- Deaktiviere "Additive Blending" für dunklere Flammen

### Performance-Probleme
- Reduziere die Auflösung (z.B. von 1920×1080 auf 1280×720)
- Verringere "Flammen Intensität"
- Deaktiviere "High DPI Support"

### Flammen bewegen sich nicht
- Prüfe ob WebGL im Browser verfügbar ist
- Browser-Cache leeren und neu laden
- OBS Browser Source aktualisieren

## Credits

- **Flame Shader**: Basierend auf WebGL Fire Demo
- **Paper**: Fuller, Krishnan, Mahrous, Hamann - "Real-time Procedural Volumetric Fire"
- **Plugin Entwicklung**: Pup Cid

## Lizenz

CC-BY-NC-4.0 - Siehe Haupt-Repository Lizenz
