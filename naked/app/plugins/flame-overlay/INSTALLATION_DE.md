# 🔥 TikTok Flame Overlay Plugin - Installationsanleitung

## Übersicht

Das **TikTok Flame Overlay Plugin** ist ein vollständig konfigurierbares WebGL-basiertes Flammen-Overlay für TikTok Livestreams. Es nutzt Hardware-beschleunigte Shader-Effekte für realistische, animierte Flammen mit transparentem Hintergrund - perfekt für OBS Browser Sources.

## ✨ Hauptfeatures

- 🎨 **Anpassbare Flammenfarben** - Frei wählbar via Color Picker
- 📐 **TikTok Format Presets** - Vordefiniert für Portrait/Landscape
- 🖼️ **Flexible Rahmenposition** - Unten, Oben, Seiten oder rundherum
- ⚡ **Live-Konfiguration** - Alle Einstellungen in Echtzeit änderbar
- 🚀 **Performant** - WebGL Hardware-Beschleunigung
- 🎯 **OBS-optimiert** - Transparenter Hintergrund ohne Chroma Key

## 📦 Installation

### Schritt 1: Plugin aktivieren

1. Starte **LTTH.app** (PupCid's Little TikTool Helper)
2. Navigiere zum **Plugin-Manager**
3. Finde "TikTok Flame Overlay" in der Plugin-Liste
4. Klicke auf **Aktivieren**

### Schritt 2: Plugin-Einstellungen öffnen

1. Nach der Aktivierung erscheint das Plugin im Menü
2. Klicke auf **"Einstellungen"** oder navigiere zu:
   ```
   http://localhost:3000/flame-overlay/ui
   ```

### Schritt 3: Grundkonfiguration

Die Standard-Einstellungen sind bereits für TikTok optimiert:

- **Resolution**: TikTok Portrait (720×1280)
- **Frame Position**: Unten
- **Frame Thickness**: 150px
- **Flame Color**: Orange (#ff6600)
- **Speed**: 0.5 (moderate Geschwindigkeit)
- **Intensity**: 1.3 (mittlere Turbulenz)

## 🎨 Konfigurationsoptionen

### Auflösung & Format

**Resolution Preset Optionen:**
- `TikTok Portrait (720×1280)` - Standard für TikTok Livestreams
- `TikTok Landscape (1280×720)` - Querformat
- `HD Portrait (1080×1920)` - Hohe Qualität für YouTube/Twitch
- `HD Landscape (1920×1080)` - Full HD Querformat
- `Custom` - Eigene Auflösung definieren

**Custom Resolution:**
Wenn "Custom" gewählt:
- **Breite**: 100 - 3840 Pixel
- **Höhe**: 100 - 2160 Pixel

### Rahmen Einstellungen

**Rahmen Position:**
- `Unten` - Klassisch für TikTok (Flammen am unteren Bildrand)
- `Oben` - Flammen am oberen Bildrand
- `Seiten` - Links & Rechts (für Portrait-Format)
- `Rundherum` - Alle vier Kanten (volle Immersion)

**Rahmenbreite:**
- Bereich: 50 - 500 Pixel
- Standard: 150 Pixel
- Tipp: Bei höheren Auflösungen größere Werte verwenden

**Nur Kanten maskieren:**
- ✅ Aktiviert: Weicherer Übergang, natürlicheres Aussehen
- ❌ Deaktiviert: Harte Kante, volle Intensität

### Flammen Aussehen

**Flammenfarbe:**
- Color Picker mit Hex-Eingabe
- Standard: `#ff6600` (Orange)
- Empfohlene Farben:
  - 🔥 Orange: `#ff6600` (klassisch)
  - 🔵 Blau: `#0066ff` (cool)
  - 💜 Lila: `#9900ff` (mystisch)
  - 💚 Grün: `#00ff66` (giftig)
  - ❤️ Rot: `#ff0000` (heiß)

**Hintergrund Tint:**
- Optional färbbarer Hintergrund
- Standard: `#000000` (Schwarz)
- Nur sichtbar wenn Transparenz > 0

**Hintergrund Transparenz:**
- Bereich: 0.0 (voll transparent) - 1.0 (deckend)
- Standard: 0.0 (voll transparent für OBS)
- Tipp: Für OBS immer auf 0.0 lassen

### Animation Parameter

**Flammen Geschwindigkeit:**
- Bereich: 0.1 - 2.0
- Standard: 0.5
- Niedrigere Werte: Ruhige, langsame Flammen
- Höhere Werte: Energetische, schnelle Flammen
- Empfehlung: 0.3-0.7 für natürliches Aussehen

**Flammen Intensität (Turbulenz):**
- Bereich: 0.5 - 3.0
- Standard: 1.3
- Steuert die Wildheit/Chaotik der Bewegung
- Niedrig (0.5-1.0): Sanfte Flammen
- Mittel (1.0-2.0): Realistische Flammen
- Hoch (2.0-3.0): Wilde, chaotische Flammen

**Helligkeit:**
- Bereich: 0.1 - 1.0
- Standard: 0.25
- Gesamthelligkeit des Effekts
- Tipp: Bei dunklen Streams höhere Werte verwenden

### Visuelle Effekte

**Glow-Effekt:**
- ✅ Aktiviert: Flammen leuchten/strahlen
- ❌ Deaktiviert: Flachere Flammen ohne Leuchteffekt
- Empfehlung: Aktiviert für besseres Aussehen

**Additive Blending:**
- ✅ Aktiviert: Hellere, leuchtendere Flammen (empfohlen)
- ❌ Deaktiviert: Normaleres Blending
- Technisch: ONE, ONE vs. SRC_ALPHA, ONE_MINUS_SRC_ALPHA

**High DPI Support:**
- ✅ Aktiviert: Bessere Qualität auf 4K/Retina Displays
- ❌ Deaktiviert: Normale Auflösung (bessere Performance)
- Automatische Anpassung an devicePixelRatio

## 🎥 OBS Studio Integration

### Einrichtung als Browser Source

**Schritt 1: Browser Source erstellen**
1. In OBS: Rechtsklick in der **Quellen-Liste**
2. **Hinzufügen** → **Browser**
3. Name eingeben: z.B. "TikTok Flame Border"
4. **OK** klicken

**Schritt 2: Browser Source konfigurieren**

**URL:**
```
http://localhost:3000/flame-overlay/overlay
```

**Breite & Höhe:**
Entsprechend deiner gewählten Auflösung:
- TikTok Portrait: `720` × `1280`
- HD Portrait: `1080` × `1920`
- Custom: Deine eigenen Werte

**FPS:**
- Empfohlen: `60` FPS für flüssige Animation
- Minimum: `30` FPS bei Performance-Problemen

**Wichtige Einstellungen:**
- ❌ **"Shutdown source when not visible"** deaktivieren
  - Sonst stoppt die Animation beim Ausblenden
- ✅ **"Refresh browser when scene becomes active"** optional
- ✅ **"Use custom frame rate"** → 60 FPS

**Schritt 3: Positionierung**

1. Overlay-Quelle in der Szene platzieren
2. Mit **Strg + Ziehen** skalieren (Seitenverhältnis beibehalten)
3. Über dein Kamerabild legen
4. Reihenfolge anpassen (Overlay sollte ganz oben sein)

### OBS Szenen-Setup Beispiele

**Setup 1: Klassisches TikTok Layout (Portrait)**
```
Szenenaufbau (von unten nach oben):
1. Hintergrund (Bild/Video/Color)
2. Webcam (720×1280 oder größer)
3. Chat/Overlays
4. Flame Overlay (720×1280)
```

**Setup 2: Landscape mit Side Flames**
```
Szenenaufbau:
1. Hintergrund
2. Webcam (mittig)
3. Side Panels (optional)
4. Flame Overlay (Seiten-Modus, 1920×1080)
```

### Performance-Tipps für OBS

**Bei niedrigen FPS:**
1. Auflösung reduzieren (1080p → 720p)
2. Intensität verringern (1.3 → 0.8)
3. High DPI deaktivieren
4. FPS in OBS auf 30 reduzieren

**Bei hoher GPU-Last:**
- Browser Source Hardware-Beschleunigung prüfen
- OBS Studio auf neueste Version updaten
- Andere Browser Sources minimieren

## 🎛️ Live-Anpassungen während des Streams

### Einstellungen ändern

1. Öffne die Plugin-Einstellungen im Browser:
   ```
   http://localhost:3000/flame-overlay/ui
   ```

2. Ändere beliebige Einstellungen (z.B. Farbe, Geschwindigkeit)

3. Klicke **"Einstellungen speichern"**

4. Das Overlay in OBS aktualisiert sich **automatisch in Echtzeit**!

### Keine OBS-Neustart nötig

Dank Socket.io werden alle Änderungen sofort an das Overlay übertragen:
- ✅ Farbe ändern → Sofort sichtbar
- ✅ Geschwindigkeit anpassen → Sofort wirksam
- ✅ Position wechseln → Sofort aktualisiert

## 🎨 Kreative Ideen & Vorlagen

### Voreinstellungen für verschiedene Stimmungen

**🔥 Klassisches Feuer (Orange)**
```
Flammenfarbe: #ff6600
Geschwindigkeit: 0.5
Intensität: 1.3
Helligkeit: 0.25
Additive Blending: ✅
```

**❄️ Eis/Frost (Blau)**
```
Flammenfarbe: #00ccff
Geschwindigkeit: 0.3
Intensität: 0.8
Helligkeit: 0.35
Additive Blending: ✅
```

**💚 Giftiges Feuer (Grün)**
```
Flammenfarbe: #00ff66
Geschwindigkeit: 0.7
Intensität: 2.0
Helligkeit: 0.3
Additive Blending: ✅
```

**💜 Magisches Feuer (Lila)**
```
Flammenfarbe: #9900ff
Geschwindigkeit: 0.4
Intensität: 1.5
Helligkeit: 0.28
Additive Blending: ✅
```

**🌈 Regenbogen-Rotation**
Tipp: Manuell die Farbe alle paar Minuten wechseln:
- Start: `#ff0000` (Rot)
- Nach 2 Min: `#ff6600` (Orange)
- Nach 4 Min: `#ffff00` (Gelb)
- usw.

### Event-basierte Anpassungen

**Bei Follower-Goal erreicht:**
- Intensität auf 2.5 erhöhen
- Geschwindigkeit auf 1.0 erhöhen
- Farbe auf Gold wechseln (#ffd700)

**Bei Night Stream:**
- Helligkeit auf 0.15 reduzieren
- Dunkle Flammen (lila/blau)

**Bei Gaming Stream:**
- Intensität hoch (2.0+)
- Schnelle Geschwindigkeit (0.8+)
- Aggressive Farben (rot/orange)

## 🔧 Troubleshooting

### Problem: Overlay wird nicht angezeigt

**Lösung 1: Plugin-Status prüfen**
```
1. LTTH öffnen
2. Plugin-Manager → "TikTok Flame Overlay"
3. Status: Muss "Aktiviert" sein
```

**Lösung 2: URL prüfen**
```
Korrekte URL in OBS:
http://localhost:3000/flame-overlay/overlay

NICHT:
- http://127.0.0.1:3000/...
- https://localhost:3000/... (kein HTTPS)
- http://localhost:3000/flame-overlay/ui (falsche Route)
```

**Lösung 3: Browser Source aktualisieren**
```
In OBS:
1. Rechtsklick auf Browser Source
2. "Interagieren"
3. F5 drücken (Seite neu laden)
```

### Problem: Flammen bewegen sich nicht

**Ursache:** WebGL nicht verfügbar oder Shader-Fehler

**Lösung:**
```
1. Browser Console in OBS Browser Source öffnen:
   - Rechtsklick → "Interagieren"
   - F12 drücken
   - Console-Tab öffnen
   - Nach Fehlern suchen

2. WebGL testen:
   - Im Browser: https://get.webgl.org/ öffnen
   - Muss "Your browser supports WebGL" anzeigen

3. OBS updaten:
   - Mindestens OBS Studio 28.0+
   - CEF (Chromium) aktuell halten
```

### Problem: Flammen sind zu hell/dunkel

**Lösung:**
```
Zu hell:
- Helligkeit reduzieren (0.25 → 0.15)
- Additive Blending deaktivieren

Zu dunkel:
- Helligkeit erhöhen (0.25 → 0.4)
- Additive Blending aktivieren
- Flammenfarbe aufhellen
```

### Problem: Performance-Probleme / Niedrige FPS

**Lösung 1: Auflösung reduzieren**
```
Von: HD Portrait (1080×1920)
Zu: TikTok Portrait (720×1280)
```

**Lösung 2: Einstellungen optimieren**
```
- High DPI: ❌ Deaktivieren
- Intensität: 1.3 → 0.8
- OBS FPS: 60 → 30
```

**Lösung 3: Hardware prüfen**
```
- GPU-Auslastung in Task Manager prüfen
- Andere Browser Sources deaktivieren
- OBS Hardware-Encoding aktivieren
```

### Problem: Transparenz funktioniert nicht

**Das sollte nicht passieren**, da das Plugin automatisch transparent ist.

**Wenn doch:**
```
1. Hintergrund Transparenz prüfen:
   - Muss auf 0.0 stehen
   
2. OBS Browser Source Einstellungen:
   - "Benutzerdefiniertes CSS" sollte leer sein
   - Keine Chroma Key Filter nötig

3. WebGL Context prüfen:
   - alpha: true (ist standardmäßig gesetzt)
   - premultipliedAlpha: true
```

### Problem: Overlay aktualisiert sich nicht bei Änderungen

**Ursache:** Socket.io Verbindung unterbrochen

**Lösung:**
```
1. LTTH Server neu starten

2. OBS Browser Source neu laden:
   - Rechtsklick → Eigenschaften
   - "Browser-Cache leeren und neu laden"

3. Plugin-Einstellungen UI neu laden:
   - F5 in der Settings-Seite

4. Manuelle Aktualisierung:
   - Einstellungen speichern
   - In OBS: Rechtsklick → "Interagieren" → F5
```

## 📊 Technische Informationen

### WebGL Shader Details

Das Plugin nutzt einen volumetrischen Feuer-Shader:

**Technologie:**
- WebGL 1.0 kompatibel
- Modified Blum Blum Shub Noise Generator
- Multi-octave Turbulence (4 Oktaven)
- Volumetric Fire Sampling

**Performance:**
- GPU-beschleunigt (Hardware-Rendering)
- ~1-3% CPU-Last
- ~5-10% GPU-Last (abhängig von Auflösung)
- 60 FPS auf modernen Systemen

**Texturen:**
- `nzw.png` - Noise Texture (140 KB)
- `firetex.png` - Fire Profile Texture (7 KB)

### API Endpoints

Für fortgeschrittene Nutzer / Entwickler:

**GET** `/api/flame-overlay/config`
```json
Response: {
  "success": true,
  "config": { ... }
}
```

**POST** `/api/flame-overlay/config`
```json
Body: {
  "flameColor": "#ff0000",
  "flameSpeed": 0.8
}
```

**GET** `/api/flame-overlay/status`
```json
Response: {
  "success": true,
  "config": { ... },
  "resolution": { "width": 720, "height": 1280 }
}
```

## 📚 Zusätzliche Ressourcen

### Empfohlene OBS-Einstellungen

**Für TikTok Streaming:**
```
Video:
- Basis (Canvas) Auflösung: 1080×1920 (Portrait)
- Ausgabe (Skaliert) Auflösung: 720×1280
- FPS: 30 oder 60

Output:
- Encoder: x264 oder Hardware (NVENC/QuickSync)
- Bitrate: 2500-4500 Kbps
- Keyframe Interval: 2
```

### Weiterführende Links

- **WebGL Fire Paper**: Fuller et al. - "Real-time Procedural Volumetric Fire"
- **LTTH Documentation**: Siehe Haupt-Repository README
- **OBS Studio**: https://obsproject.com/

## 💡 Tipps & Best Practices

### Do's ✅

- ✅ Additive Blending verwenden für leuchtende Flammen
- ✅ Moderate Intensität (1.0-1.5) für natürliches Aussehen
- ✅ Einstellungen während des Streams live anpassen
- ✅ Verschiedene Farben für verschiedene Stimmungen testen
- ✅ Rahmenbreite an Auflösung anpassen (höher = dicker)

### Don'ts ❌

- ❌ Hintergrund-Transparenz nicht auf > 0 setzen (außer gewollt)
- ❌ Extreme Intensitäten (> 2.5) außer für Spezialeffekte
- ❌ "Shutdown when not visible" in OBS aktivieren
- ❌ Zu viele Browser Sources gleichzeitig (Performance)
- ❌ Chroma Key auf transparente Overlays anwenden

## 🎓 Erweiterte Nutzung

### Mehrere Instanzen

Aktuell ist nur eine Instanz pro LTTH-Server möglich. Für mehrere unabhängige Flame-Overlays:

**Workaround:**
1. Mehrere OBS Browser Sources mit derselben URL
2. In OBS unterschiedlich skalieren/positionieren
3. Einstellungen gelten für alle Instanzen

### Integration in Flows/Automation

Das Plugin kann in Zukunft mit dem LTTH Flow-System integriert werden für:
- Automatische Farbwechsel bei Events
- Intensitäts-Steigerung bei Follower-Goals
- Synchronisation mit Musik/Beat

## 📞 Support & Feedback

Bei Problemen oder Fragen:

1. **README.md** im Plugin-Ordner lesen
2. **Troubleshooting-Sektion** in dieser Anleitung durchgehen
3. **LTTH Discord/Community** fragen
4. **GitHub Issues** im Haupt-Repository öffnen

## 📜 Lizenz & Credits

**Plugin:** TikTok Flame Overlay  
**Version:** 1.0.0  
**Author:** Pup Cid  
**Lizenz:** CC-BY-NC-4.0  

**Basierend auf:**
- WebGL Fire Demo
- Paper: Fuller, Krishnan, Mahrous, Hamann - "Real-time Procedural Volumetric Fire" (I3D 2007)

---

**Viel Erfolg mit deinem TikTok Stream! 🔥🎥**
