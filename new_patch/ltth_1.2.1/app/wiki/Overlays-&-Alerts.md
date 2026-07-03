# Overlays & Alerts

[← Advanced Features](Advanced-Features) | [→ FAQ & Troubleshooting](FAQ-&-Troubleshooting)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [OBS Browser Source Setup](#obs-browser-source-setup)
3. [Verfügbare Overlays](#verfügbare-overlays)
4. [Alert-System](#alert-system)
5. [Goal Overlays](#goal-overlays)
6. [Leaderboard Overlays](#leaderboard-overlays)
7. [WebGPU Effekte](#webgpu-effekte)
8. [HUD Overlays](#hud-overlays)
9. [Custom Styling](#custom-styling)
10. [Troubleshooting](#troubleshooting)

---

## 🔍 Übersicht

Little TikTool Helper v1.2.1 bietet eine umfangreiche Sammlung von **Browser-Source-Overlays** für OBS Studio. Alle Overlays sind transparent, responsiv und in Echtzeit mit TikTok-Events synchronisiert.

### Overlay-Kategorien

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| **Alert Overlays** | 6 | Gift, Follow, Subscribe, Share, Like, Chat Alerts |
| **Goal Overlays** | 4 | Likes, Coins, Followers, Custom Goals |
| **Leaderboard Overlays** | 5 | Top Gifters mit 5 Themes |
| **WebGPU Effekte** | 3 | Emoji Rain, Fireworks, Weather |
| **HUD Overlays** | 4 | ClarityHUD, GCCE HUD, LastEvent Spotlight |
| **Special Effects** | 3 | Flame Border, Gift Milestones, Quiz Show |

**Gesamt:** 25+ verfügbare Overlays

---

## 🎬 OBS Browser Source Setup

### OBS Studio installieren

1. **Download:** [obsproject.com](https://obsproject.com/)
2. **Version:** 29.0 oder höher empfohlen
3. **Installation:** Standard-Einstellungen

### Browser Source hinzufügen

**Schritt 1: Source erstellen**
```
OBS → Sources → + → Browser
```

**Schritt 2: Einstellungen**
```
Name: [Overlay-Name]
URL: http://localhost:3000/[overlay-path]
Width: [Breite in Pixel]
Height: [Höhe in Pixel]
FPS: 60
```

**Schritt 3: Erweiterte Einstellungen**
```
✓ Shutdown source when not visible  (Empfohlen für Performance)
✓ Refresh browser when scene becomes active  (Bei Problemen)
Custom CSS: (Optional, siehe Custom Styling)
```

**Schritt 4: Positionierung**
- Source in OBS-Preview verschieben/skalieren
- Transform → Edit Transform für präzise Anpassung

### Empfohlene OBS-Einstellungen

**Performance:**
```
Settings → Advanced → Video
  Color Format: NV12
  Color Space: 709
  Color Range: Partial

Settings → Output → Streaming
  Encoder: NVENC H.264 (GPU) oder x264 (CPU)
  Rate Control: CBR
  Bitrate: 6000 Kbps (für 1080p)
```

**Browser Source:**
```
Settings → Advanced → Sources
  Browser Source Hardware Acceleration: ✓ Enabled
```

---

## 📺 Verfügbare Overlays

### 1. Main Overlay (All-in-One)

**URL:**
```
http://localhost:3000/overlay
```

**Auflösung:** 1920x1080 (Full HD)

**Enthält:**
- ✅ Alert-System (alle Event-Typen)
- ✅ Chat-Feed
- ✅ Event-Log
- ✅ TTS-Visualisierung
- ✅ Activity-Notifications

**OBS-Setup:**
```
Width: 1920
Height: 1080
FPS: 60
```

**Empfehlung:** Basis-Overlay für einfache Setups

---

### 2. Alert Overlays

#### Gift Alerts
**URL:**
```
http://localhost:3000/alerts/gift
```

**Features:**
- 🎁 Gift-Name und Icon
- 👤 Username mit Profilbild
- 🪙 Coin-Anzahl
- 🔊 Sound-Effekt
- 🎬 Animation (Slide-in, Fade, Bounce)

**Konfiguration:**
```
Dashboard → Alerts → Gift Alerts
- Alert-Sound auswählen
- Alert-Dauer einstellen
- Min. Coins-Filter
- Template anpassen
```

#### Follow Alerts
**URL:**
```
http://localhost:3000/alerts/follow
```

**Features:**
- 👥 Follower-Username
- 🎉 Celebration-Animation
- 🔊 Follow-Sound

#### Subscribe Alerts
**URL:**
```
http://localhost:3000/alerts/subscribe
```

**Features:**
- ⭐ Subscriber-Name
- 💎 Tier-Level (falls verfügbar)
- 🎊 Special Animation

#### Share Alerts
**URL:**
```
http://localhost:3000/alerts/share
```

#### Like Alerts
**URL:**
```
http://localhost:3000/alerts/like
```

**Features:**
- ❤️ Like-Count
- 🎯 Threshold-basiert (z.B. alle 100 Likes)

#### Chat Highlight
**URL:**
```
http://localhost:3000/alerts/chat
```

**Features:**
- 💬 Highlighted Chat-Nachrichten
- 👤 Username
- 🎨 Custom Styling

---

### 3. Goal Overlays

**URLs:**
```
Goal 1: http://localhost:3000/goals/goal1
Goal 2: http://localhost:3000/goals/goal2
Goal 3: http://localhost:3000/goals/goal3
Goal 4: http://localhost:3000/goals/goal4
```

**Auflösung:** 600x100 (anpassbar)

**Goal-Typen:**
- 🪙 **Coins** - Gesammelte Coins
- ❤️ **Likes** - Like-Zähler
- 👥 **Followers** - Follower-Count
- 🎯 **Custom** - Manuell inkrementiert

**Konfiguration:**
```
Dashboard → Goals → Goal [1-4]

Einstellungen:
- Typ: Likes/Coins/Followers/Custom
- Ziel: [Anzahl]
- Label: [Text]
- Farben: Hintergrund/Fortschritt
- Modus: Add/Set/Increment
```

**OBS-Setup:**
```
Width: 600
Height: 100
FPS: 30 (ausreichend für Progress-Bars)
```

**Styling-Optionen:**
- Gradient-Farben
- Animierte Progress-Bar
- Prozent-Anzeige
- Icon-Support

---

### 4. Leaderboard Overlays

**URL:**
```
http://localhost:3000/leaderboard/overlay
```

**Auflösung:** 400x600 (anpassbar)

**Themes:**
1. **Classic Gold** - Klassisches Gold-Design
2. **Neon Cyberpunk** - Cyberpunk-Ästhetik
3. **Minimal Modern** - Minimalistisch
4. **Royal Purple** - Lila Royal-Theme
5. **Fire Red** - Feuer-Rot-Design

**Features:**
- 🏆 Top 10 Gifters
- 🪙 Total Coins pro User
- 📊 Session/All-Time-Tracking
- 🎬 Überholungs-Animationen
- 👁️ Preview-Modus

**Konfiguration:**
```
Dashboard → Plugins → Leaderboard → Configure

- Theme auswählen
- Session/All-Time wählen
- Preview-Modus für Testing
- Auto-Refresh-Interval
```

**OBS-Setup:**
```
Width: 400
Height: 600
FPS: 30
Position: Rechts oder Links im Stream
```

---

### 5. WebGPU Effekte

#### WebGPU Emoji Rain
**URLs:**
```
Standard: http://localhost:3000/webgpu-emoji-rain/overlay
OBS HUD: http://localhost:3000/webgpu-emoji-rain/obs-hud
```

**Auflösung:**
- Standard: Responsiv
- OBS HUD: 1920x1080 (Fixed)

**Features:**
- 🚀 GPU-beschleunigt (60 FPS konstant)
- 🎨 Custom Emoji-Sets
- 👤 User-spezifische Emojis
- 🖼️ Custom Image-Upload
- ⭐ SuperFan-Burst-Effekte

**Konfiguration:**
```
Dashboard → Plugins → WebGPU Emoji Rain → Configure

- Emoji-Set auswählen
- User-Mappings konfigurieren
- Custom Images hochladen
- Density & Speed einstellen
```

**Performance:**
- **WebGPU:** 60 FPS bei 2000+ Emojis
- **Fallback:** Canvas-Version bei fehlendem WebGPU-Support

**OBS-Setup:**
```
Width: 1920
Height: 1080
FPS: 60
```

#### Fireworks Superplugin
**URLs:**
```
WebGPU: http://localhost:3000/fireworks-webgpu/overlay
WebGL: http://localhost:3000/fireworks/overlay
```

**Features:**
- 🎆 Multi-Stage Feuerwerk-System
- 🎁 Gift-spezifische Designs
- 🔥 Combo-Streak-System
- 📈 Eskalations-Mechanik
- 🔊 Audio-Effekte

**Konfiguration:**
```
Dashboard → Plugins → Fireworks → Configure

- Gift-Mappings konfigurieren
- Firework-Shapes auswählen
- Farben anpassen
- Combo-Thresholds einstellen
```

#### Weather Control
**URL:**
```
http://localhost:3000/weather-control/overlay
```

**Effekte:**
- 🌧️ Regen (WebGL)
- ❄️ Schnee
- ⛈️ Sturm mit Blitzen
- 🌫️ Nebel
- ⚡ Donner
- ☀️ Sonnenstrahl
- 👾 Glitch-Cloud

**Trigger:**
- Gift-basiert
- Chat-Commands
- Manual-Trigger via Dashboard

---

### 6. HUD Overlays

#### ClarityHUD
**URL:**
```
http://localhost:3000/clarityhud/overlay
```

**Auflösung:** Responsiv

**Features:**
- 📺 Minimalistisches Design
- 🥽 VR-optimiert
- ♿ Accessibility-Features
- 💬 Chat-Feed
- 📊 Activity-Feed

**Best für:** VR-Streaming, minimalistische Setups

#### GCCE HUD Overlay
**URL:**
```
http://localhost:3000/gcce-hud/overlay
```

**Features:**
- 📺 Dynamische HUD-Elemente
- 🎨 Text- und Bild-Overlays
- 💬 Chat-Command-gesteuert
- ⏱️ Auto-Hide-Timer

**Commands:**
```
!hud show <text>     → Text anzeigen
!hud image <url>     → Bild anzeigen
!hud hide            → HUD ausblenden
!hud clear           → HUD leeren
```

#### LastEvent Spotlight
**URLs:**
```
Alle Events: http://localhost:3000/lastevent-spotlight/overlay
Follower: http://localhost:3000/lastevent-spotlight/follower
Gifter: http://localhost:3000/lastevent-spotlight/gifter
Chatter: http://localhost:3000/lastevent-spotlight/chatter
Sharer: http://localhost:3000/lastevent-spotlight/sharer
Liker: http://localhost:3000/lastevent-spotlight/liker
Subscriber: http://localhost:3000/lastevent-spotlight/subscriber
```

**Auflösung:** 400x200 pro Event-Typ

**Features:**
- 👥 Letzter aktiver User pro Event-Typ
- 🖼️ Profilbild-Anzeige
- 🎨 Customizable Styling
- 📊 Real-time Updates

**OBS-Setup:**
```
Width: 400
Height: 200
FPS: 30

Tipp: Mehrere Overlays für verschiedene Event-Typen
```

---

### 7. Special Effects

#### Flame Overlay
**URL:**
```
http://localhost:3000/flame-overlay/overlay
```

**Features:**
- 🔥 WebGL-Flammen-Effekt
- 🎨 Anpassbare Farben
- ⚡ Intensität & Geschwindigkeit
- 📐 Frame-Dicke konfigurierbar

**Best für:** Border-Effekt um Stream

#### Gift Milestone Celebration
**URL:**
```
http://localhost:3000/gift-milestone/overlay
```

**Features:**
- 🎉 Meilenstein-Celebrations
- 🎬 GIF/MP4-Animationen
- 🔊 Audio-Support
- 📊 Kumulative Coin-Tracking

**Milestones:**
```
Dashboard → Plugins → Gift Milestone → Configure

- 100 Coins → Celebration 1
- 500 Coins → Celebration 2
- 1000 Coins → Celebration 3
(anpassbar)
```

#### Quiz Show Overlay
**URL:**
```
http://localhost:3000/quiz-show/overlay
```

**Features:**
- ❓ Multiple-Choice-Fragen
- 💬 Chat-basierte Antworten
- 🏆 Leaderboard
- ⏱️ Timer

---

## 🎨 Custom Styling

### CSS-Overrides

**In OBS Browser Source:**
```
Custom CSS:
body {
  background: transparent !important;
}

.alert-container {
  transform: scale(1.2);
  font-family: 'Arial', sans-serif;
}

.goal-progress {
  background: linear-gradient(90deg, #ff0080, #ff8c00);
}
```

### URL-Parameter

Einige Overlays unterstützen URL-Parameter für Customization:

**Beispiel - Leaderboard:**
```
http://localhost:3000/leaderboard/overlay?theme=cyberpunk&size=large
```

**Parameter:**
- `theme` - Theme-Name (gold, cyberpunk, minimal, purple, fire)
- `size` - Größe (small, medium, large)
- `refresh` - Auto-Refresh-Interval in ms

**Beispiel - Goal:**
```
http://localhost:3000/goals/goal1?color=ff0080&textcolor=ffffff
```

**Parameter:**
- `color` - Progress-Bar-Farbe (Hex ohne #)
- `textcolor` - Text-Farbe (Hex ohne #)
- `hidePercent` - Prozent ausblenden (true/false)

### Overlay-Styling anpassen

**Im Dashboard:**
```
Dashboard → Plugins → [Plugin] → Configure → Styling

- Farben auswählen (Color-Picker)
- Schriftart wählen
- Größe anpassen
- Animationen aktivieren/deaktivieren
```

---

## 🐛 Troubleshooting

### Overlay lädt nicht

**Symptom:** Browser Source zeigt nichts an

**Lösungen:**
1. **Server läuft?** - Check `http://localhost:3000` im Browser
2. **URL korrekt?** - Tippfehler in URL prüfen
3. **Plugin aktiviert?** - Dashboard → Plugins → Enable
4. **Firewall?** - Port 3000 freigeben
5. **OBS Browser-Cache?** - Source löschen und neu hinzufügen

### Overlay flackert

**Symptom:** Overlay blinkt oder flackert

**Lösungen:**
1. **FPS anpassen** - In OBS: Browser Source → FPS: 60
2. **VSync** - OBS Settings → Advanced → Video → VSync aktivieren
3. **Hardware-Acceleration** - OBS Settings → Advanced → Browser Source Hardware Acceleration aktivieren
4. **"Shutdown source when not visible"** aktivieren

### Niedrige Performance

**Symptom:** Overlay läuft mit niedriger FPS

**Lösungen:**
1. **WebGPU nutzen** - Für Emoji Rain & Fireworks
2. **Overlay-FPS reduzieren** - Von 60 auf 30 FPS (für statische Overlays)
3. **Nicht benötigte Overlays deaktivieren**
4. **OBS Hardware-Encoding** - NVENC statt x264
5. **Partikel-Anzahl reduzieren** - In Plugin-Settings

### Transparenz funktioniert nicht

**Symptom:** Overlay hat schwarzen/weißen Hintergrund

**Lösungen:**
1. **Custom CSS:**
   ```css
   body { background: transparent !important; }
   ```
2. **OBS Settings:**
   - Browser Source → "Shutdown source when not visible" ✓
   - Refresh browser source

### Overlay ist verzögert

**Symptom:** Events erscheinen im Overlay mit Verzögerung

**Lösungen:**
1. **Network-Latency prüfen** - Localhost sollte instant sein
2. **Server-Load prüfen** - Zu viele Plugins aktiv?
3. **Socket.io-Verbindung prüfen** - Browser Console für Errors
4. **TikTok-Connection stabil?** - Dashboard → Connection-Status

---

## 🔗 Weiterführende Ressourcen

### Plugin-Dokumentation
- **[[Plugin-Liste]]** - Alle Plugins mit Overlay-URLs
- **[[Features/WebGPU-Engine]]** - GPU-Effekte im Detail
- **[[Features/GCCE]]** - Chat-Commands für HUD

### Guides
- **[[Getting-Started]]** - OBS-Setup für Anfänger
- **[[Advanced-Features]]** - Performance-Optimierungen
- **[[FAQ-&-Troubleshooting]]** - Weitere Lösungen

---

[← Advanced Features](Advanced-Features) | [→ FAQ & Troubleshooting](FAQ-&-Troubleshooting)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*
