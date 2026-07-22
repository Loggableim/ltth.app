# 🇩🇪 Deutsch

### 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht-deutsch)
2. [Schnellstart (5 Minuten)](#schnellstart-5-minuten-deutsch)
3. [Erster Stream](#erster-stream-deutsch)
4. [Plugins aktivieren](#plugins-aktivieren-deutsch)
5. [OBS einrichten](#obs-einrichten-deutsch)
6. [Häufige erste Schritte](#häufige-erste-schritte-deutsch)
7. [Nächste Schritte](#nächste-schritte-deutsch)

---

### 🎯 Übersicht {#übersicht-deutsch}

Dieser Guide führt dich in **5-10 Minuten** durch die wichtigsten Schritte, um mit **Little TikTool Helper v1.2.1** zu starten.

**Was du erreichen wirst:**

✅ Tool installiert und gestartet
✅ Mit TikTok LIVE verbunden
✅ Erste Overlays in OBS eingerichtet
✅ Grundlegende Plugins aktiviert
✅ Bereit für deinen ersten Stream

---

### ⚡ Schnellstart (5 Minuten) {#schnellstart-5-minuten-deutsch}

#### Schritt 1: Installation (2 Minuten)

**Voraussetzungen:**
- Node.js 18.0.0+ installiert ([Download](https://nodejs.org/))
- Git installiert (optional, [Download](https://git-scm.com/))

**Installation:**

**Option A - Desktop App (Empfohlen):**
```bash
# Repository klonen
git clone https://github.com/Loggableim/ltth.app.git
cd ltth.app

# Dependencies installieren
npm install

# Desktop-App starten
npm start
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

#### Schritt 2: Dashboard öffnen (30 Sekunden)

**Desktop App:** Öffnet sich automatisch

**Standalone:** Browser öffnen auf `http://localhost:3000`

#### Schritt 3: TikTok verbinden (1 Minute)

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

#### Schritt 4: Test (30 Sekunden)

**Test-Gift senden:**
1. Öffne TikTok auf deinem Handy
2. Gehe zu deinem LIVE-Stream
3. Sende ein Test-Gift (z.B. Rose)
4. Dashboard sollte das Gift anzeigen

**✅ Fertig!** Du bist jetzt mit TikTok LIVE verbunden.

---

### 🎬 Erster Stream {#erster-stream-deutsch}

#### 1. Grundlegende Einstellungen

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

#### 2. OBS-Overlays hinzufügen

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

#### 3. Stream starten

1. **OBS starten** - Overlays sollten sichtbar sein
2. **TikTok LIVE starten** - Auf deinem Handy
3. **LTTH verbinden** - Dashboard → Connect
4. **Stream starten!** 🎉

---

### 🔌 Plugins aktivieren {#plugins-aktivieren-deutsch}

#### Empfohlene Plugins für Anfänger

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

**4. Spotlight** (Empfohlen)
```
Dashboard → Plugins → Spotlight → Enable
```
- Zeigt letzten Follower, Gifter, etc.
- Overlay für jeden Event-Typ

**5. Soundboard** (Optional)
```
Dashboard → Plugins → Soundboard → Enable
```
- Gift-spezifische Sounds
- MyInstants-Integration

#### Plugin aktivieren

1. Dashboard → **Plugins** (Sidebar)
2. Plugin in Liste finden
3. **Enable**-Button klicken
4. Plugin konfigurieren (falls UI vorhanden)

Siehe **[Plugin-Liste](./Plugin-Liste.md#deutsch)** für alle 31 verfügbaren Plugins.

---

### 🎨 OBS einrichten {#obs-einrichten-deutsch}

#### OBS Studio installieren

1. Download: [obsproject.com](https://obsproject.com/)
2. Version **29.0 oder höher** empfohlen
3. Standard-Installation durchführen

#### OBS WebSocket aktivieren (für Multi-Cam Plugin)

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

---

### 💡 Häufige erste Schritte {#häufige-erste-schritte-deutsch}

#### Chat-Nachrichten vorlesen lassen

**Automatisch:**
```
Dashboard → TTS → Auto-TTS für Chat aktivieren
```

**Blacklist (bestimmte Wörter nicht vorlesen):**
```
Dashboard → TTS → Blacklist
→ Wörter hinzufügen (z.B. "spam", "bad word")
```

#### Gifts mit Sounds verbinden

```
Dashboard → Plugins → Soundboard → Enable
→ Configure
→ Gift-Mappings
→ Rose → Sound auswählen
→ Speichern
```

#### Kamera per Chat wechseln

```
Dashboard → Plugins → Multi-Cam Switcher → Enable
→ Configure
→ OBS verbinden
→ Chat-Commands aktivieren

Im Chat: !cam 1 (oder !cam 2, !cam 3, etc.)
```

---

### 🎓 Nächste Schritte {#nächste-schritte-deutsch}

#### Erweiterte Features erkunden

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

**3. Viewer XP-System:**
```
Dashboard → Plugins → Viewer XP System → Enable
→ XP-Rewards konfigurieren
→ Leaderboard-Overlay hinzufügen
```

#### Dokumentation lesen

- **[Plugin-Liste](./Plugin-Liste.md#deutsch)** - Alle 35 Plugins im Detail
- **[Konfiguration](./Konfiguration.md#deutsch)** - Erweiterte Einstellungen
- **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#deutsch)** - Häufige Probleme lösen

---

### 🎉 Viel Erfolg mit deinem Stream!

Du bist jetzt bereit für deinen ersten professionellen TikTok LIVE-Stream mit Little TikTool Helper!

**Tipps für den Start:**
- Teste alles **vor** dem ersten Live-Stream
- Verwende **Test-Alerts** und **Test-TTS**
- Starte mit wenigen Plugins und erweitere nach und nach
- Lies die **[FAQ & Troubleshooting](./FAQ-&-Troubleshooting.md#deutsch)** bei Problemen

---

[← Home](Home#deutsch) | [→ Installation & Setup](Installation-&-Setup#deutsch)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*

---
