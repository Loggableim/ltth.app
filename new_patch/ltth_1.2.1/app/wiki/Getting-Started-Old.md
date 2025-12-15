# Getting Started - Schnelleinstieg

[← Home](Home) | [→ Installation & Setup](Installation-&-Setup)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Schnellstart (5 Minuten)](#schnellstart-5-minuten)
3. [Erster Stream](#erster-stream)
4. [Plugins aktivieren](#plugins-aktivieren)
5. [OBS einrichten](#obs-einrichten)
6. [Häufige erste Schritte](#häufige-erste-schritte)
7. [Nächste Schritte](#nächste-schritte)

---

## 🎯 Übersicht

Dieser Guide führt dich in **5-10 Minuten** durch die wichtigsten Schritte, um mit **Little TikTool Helper v1.2.1** zu starten.

### Was du erreichen wirst:

✅ Tool installiert und gestartet  
✅ Mit TikTok LIVE verbunden  
✅ Erste Overlays in OBS eingerichtet  
✅ Grundlegende Plugins aktiviert  
✅ Bereit für deinen ersten Stream

---

## ⚡ Schnellstart (5 Minuten)

### Schritt 1: Installation (2 Minuten)

**Voraussetzungen:**
- Node.js 18.0.0+ installiert ([Download](https://nodejs.org/))
- Git installiert (optional, [Download](https://git-scm.com/))

**Installation:**

**Option A - Desktop App (Empfohlen):**
```bash
# Repository klonen
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop

# Dependencies installieren
npm install

# Desktop-App starten
npm run start:electron
```

**Option B - Standalone Server:**
```bash
# In den app-Ordner wechseln
cd app

# Dependencies installieren
npm install

# Server starten
npm start
```

### Schritt 2: Dashboard öffnen (30 Sekunden)

**Desktop App:** Öffnet sich automatisch

**Standalone:** Browser öffnen auf `http://localhost:3000`

### Schritt 3: TikTok verbinden (1 Minute)

1. **Eulerstream API-Key** holen:
   - Gehe zu [Eulerstream](https://eulerstream.com/)
   - Registriere dich (kostenlos)
   - Kopiere deinen API-Key

2. **Im Dashboard:**
   - Klicke auf **"Connect to TikTok LIVE"**
   - Gib deinen **TikTok-Username** ein
   - Gib deinen **Eulerstream API-Key** ein
   - Klicke **"Connect"**

3. **Warte auf Verbindung:**
   - Status sollte auf **"Connected" (grün)** wechseln
   - Live-Events erscheinen im Event-Log

### Schritt 4: Test (30 Sekunden)

**Test-Gift senden:**
1. Öffne TikTok auf deinem Handy
2. Gehe zu deinem LIVE-Stream
3. Sende ein Test-Gift (z.B. Rose)
4. Dashboard sollte das Gift anzeigen

**✅ Fertig!** Du bist jetzt mit TikTok LIVE verbunden.

---

## 🎬 Erster Stream

### 1. Grundlegende Einstellungen

**TTS aktivieren:**
1. Dashboard → **TTS** (Sidebar)
2. **"Auto-TTS für Chat"** aktivieren
3. Stimme auswählen (z.B. "en_us_001 - Female")
4. **Test** klicken

**Alerts aktivieren:**
1. Dashboard → **Alerts** (Sidebar)
2. **Gift-Alert** aktivieren
3. Sound auswählen (optional)
4. **Test Alert** klicken

**Goals einrichten:**
1. Dashboard → **Goals** (Sidebar)
2. **Goal 1** konfigurieren (z.B. "1000 Likes")
3. Typ: **Likes**
4. Ziel: **1000**
5. **Speichern**

### 2. OBS-Overlays hinzufügen

**Main Overlay:**
```
Browser Source → URL: http://localhost:3000/overlay
Breite: 1920
Höhe: 1080
```

**Goal Overlay:**
```
Browser Source → URL: http://localhost:3000/goals/goal1
Breite: 600
Höhe: 100
```

**Leaderboard Overlay:**
```
Browser Source → URL: http://localhost:3000/leaderboard/overlay
Breite: 400
Höhe: 600
```

### 3. Stream starten

1. **OBS starten** - Overlays sollten sichtbar sein
2. **TikTok LIVE starten** - Auf deinem Handy
3. **LTTH verbinden** - Dashboard → Connect
4. **Stream starten!** 🎉

---

## 🔌 Plugins aktivieren

### Empfohlene Plugins für Anfänger

**1. TTS v2.0** (Auto-aktiviert)
- Text-to-Speech für Chat-Nachrichten
- 75+ kostenlose Stimmen

**2. Live Goals** (Auto-aktiviert)
- Progress-Bars für Likes, Coins, Follower
- OBS-Overlays verfügbar

**3. Leaderboard** (Empfohlen)
```
Dashboard → Plugins → Leaderboard → Enable
```
- Zeigt Top-Gifter an
- Real-time Updates

**4. LastEvent Spotlight** (Empfohlen)
```
Dashboard → Plugins → LastEvent Spotlight → Enable
```
- Zeigt letzten Follower, Gifter, etc.
- Overlay für jeden Event-Typ

**5. Soundboard** (Optional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Gift-spezifische Sounds
- MyInstants-Integration

### Plugin aktivieren

1. Dashboard → **Plugins** (Sidebar)
2. Plugin in Liste finden
3. **Enable**-Button klicken
4. Plugin konfigurieren (falls UI vorhanden)

Siehe **[[Plugin-Liste]]** für alle 31 verfügbaren Plugins.

---

## 🎨 OBS einrichten

### OBS Studio installieren

1. Download: [obsproject.com](https://obsproject.com/)
2. Version **29.0 oder höher** empfohlen
3. Standard-Installation durchführen

### OBS WebSocket aktivieren (für Multi-Cam Plugin)

1. OBS → **Tools** → **WebSocket Server Settings**
2. **"Enable WebSocket server"** aktivieren
3. Port: **4455** (Standard)
4. Passwort setzen (optional)
5. **OK** klicken

**Im LTTH:**
```
Dashboard → Plugins → Multi-Cam Switcher → Configure
OBS WebSocket:
  Host: localhost
  Port: 4455
  Password: (dein Passwort)
→ Connect
```

### Standard-Overlays hinzufügen

**1. Main Overlay (Alerts + Chat)**
```
OBS → Sources → + → Browser
Name: LTTH Main Overlay
URL: http://localhost:3000/overlay
Width: 1920
Height: 1080
✓ Shutdown source when not visible
```

**2. Goal Progress Bar**
```
OBS → Sources → + → Browser
Name: Goal 1
URL: http://localhost:3000/goals/goal1
Width: 600
Height: 100
```

**3. Leaderboard**
```
OBS → Sources → + → Browser
Name: Leaderboard
URL: http://localhost:3000/leaderboard/overlay
Width: 400
Height: 600
```

**4. LastEvent Spotlight - Letzter Follower**
```
OBS → Sources → + → Browser
Name: Last Follower
URL: http://localhost:3000/lastevent-spotlight/follower
Width: 400
Height: 200
```

**5. WebGPU Emoji Rain** (Falls aktiviert)
```
OBS → Sources → + → Browser
Name: Emoji Rain
URL: http://localhost:3000/webgpu-emoji-rain/obs-hud
Width: 1920
Height: 1080
```

### Overlay-Position anpassen

1. In OBS: Source auswählen
2. **Edit Transform** → **Position/Size**
3. Oder: Mit Maus im Preview verschieben/skalieren

---

## 💡 Häufige erste Schritte

### Chat-Nachrichten vorlesen lassen

**Automatisch:**
```
Dashboard → TTS → Auto-TTS für Chat aktivieren
```

**Blacklist (bestimmte Wörter nicht vorlesen):**
```
Dashboard → TTS → Blacklist
→ Wörter hinzufügen (z.B. "spam", "bad word")
```

### Gifts mit Sounds verbinden

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift-Mappings
→ Rose → Sound auswählen
→ Speichern
```

### Kamera per Chat wechseln

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ OBS verbinden
→ Chat-Commands aktivieren

Im Chat: !cam 1 (oder !cam 2, !cam 3, etc.)
```

### VRChat-Avatar mit Gifts steuern

```
Dashboard → Plugins → OSC-Bridge (VRChat) → Enable
→ Configure
→ VRChat OSC aktivieren (in VRChat)
→ Gift-Mappings konfigurieren
   z.B. Rose → Wave-Geste
```

### Quiz-Show starten

```
Dashboard → Plugins → Quiz Show → Enable
→ Configure
→ Quiz erstellen/importieren
→ Quiz starten

Im Chat: !quiz join (Teilnehmer beitreten)
         !quiz answer A (Antworten)
```

---

## 🎓 Nächste Schritte

### Erweiterte Features erkunden

**1. Flow-System (Event-Automation):**
```
Dashboard → Flows → Neuen Flow erstellen
Beispiel:
  Trigger: Gift = "Rose"
  Actions:
    1. TTS: "Danke {username} für die Rose!"
    2. OBS: Szene wechseln zu "Cam2"
    3. OSC: Wave-Geste in VRChat
```

**2. WebGPU-Plugins aktivieren:**
- **WebGPU Emoji Rain** - GPU-beschleunigter Emoji-Effekt
- **Vulkan Rockets (WebGPU)** - Feuerwerk-Effekte

**3. Viewer XP-System:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ XP-Rewards konfigurieren
→ Leaderboard-Overlay hinzufügen
```

**4. Global Chat Command Engine (GCCE):**
- Aktiviert automatisch mit anderen Plugins
- Ermöglicht Chat-Commands wie `!timer`, `!hud`, `!cam`
- Siehe **[[Features/GCCE]]** für Details

### Dokumentation lesen

- **[[Plugin-Liste]]** - Alle 31 Plugins im Detail
- **[[Features/WebGPU-Engine]]** - GPU-beschleunigte Effekte
- **[[Features/GCCE]]** - Chat-Command-System
- **[[Konfiguration]]** - Erweiterte Einstellungen
- **[[FAQ-&-Troubleshooting]]** - Häufige Probleme lösen

### Community

- **GitHub Issues:** [Bug-Reports & Feature-Requests](https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop/issues)
- **E-Mail Support:** loggableim@gmail.com

---

## 🎉 Viel Erfolg mit deinem Stream!

Du bist jetzt bereit für deinen ersten professionellen TikTok LIVE-Stream mit Little TikTool Helper!

**Tipps für den Start:**
- Teste alles **vor** dem ersten Live-Stream
- Verwende **Test-Alerts** und **Test-TTS**
- Starte mit wenigen Plugins und erweitere nach und nach
- Lies die **[[FAQ-&-Troubleshooting]]** bei Problemen

---

[← Home](Home) | [→ Installation & Setup](Installation-&-Setup)

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*
