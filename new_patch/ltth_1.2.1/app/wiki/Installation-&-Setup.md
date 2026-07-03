# Installation & Setup

[← Home](Home) | [→ Konfiguration](Konfiguration)

---

## 📑 Inhaltsverzeichnis

1. [Systemvoraussetzungen](#systemvoraussetzungen)
2. [Installation unter Windows](#installation-unter-windows)
3. [Installation unter Linux](#installation-unter-linux)
4. [Installation unter macOS](#installation-unter-macos)
5. [Erste Schritte](#erste-schritte)
6. [OBS Studio Integration](#obs-studio-integration)
7. [Firewall & Netzwerk](#firewall--netzwerk)
8. [Troubleshooting Installation](#troubleshooting-installation)

---

## 🖥️ Systemvoraussetzungen

### Minimale Anforderungen

| Komponente | Anforderung |
|------------|-------------|
| **Betriebssystem** | Windows 10/11, Linux (Ubuntu 20.04+, Debian 11+), macOS 10.15+ |
| **Node.js** | Version 18.0.0 bis <25.0.0 (LTS 20.x empfohlen) |
| **npm** | Version 9.0.0 oder höher |
| **RAM** | Mindestens 1 GB verfügbar |
| **Speicherplatz** | Mindestens 500 MB frei |
| **Browser** | Chrome 113+, Firefox 115+, Edge 113+ (WebGPU-Support empfohlen) |
| **Netzwerk** | Internetverbindung für TikTok LIVE |

### Empfohlene Anforderungen

| Komponente | Empfehlung |
|------------|------------|
| **RAM** | 2 GB verfügbar |
| **CPU** | Quad-Core 2.5 GHz oder besser |
| **GPU** | WebGPU-kompatibel (für beste Performance) |
| **Speicherplatz** | 1 GB frei |
| **OBS Studio** | Version 29.0 oder höher (für Overlays) |
| **Electron** | Version 33.0+ (für Desktop App) |

### Optionale Software

- **OBS Studio** (Version 29+) - Für Browser Source Overlays
- **VRChat** - Für OSC-Integration (Avatar-Steuerung)
- **Eulerstream Account** - Für TikTok LIVE-Verbindung (erforderlich)
- **Google Cloud Account** - Für Google TTS-Stimmen (optional)
- **OpenShock API** - Für OpenShock-Integration (optional)

---

## 🪟 Installation unter Windows

### Schritt 1: Node.js installieren

**Download:**
1. Gehe zu [nodejs.org](https://nodejs.org/)
2. Lade die **LTS-Version** (z.B. 20.x.x LTS) herunter
3. Führe den Installer aus
4. Folge dem Installationsassistenten (Standard-Einstellungen OK)

**Verification:**
```bash
# PowerShell oder CMD öffnen
node --version
# Sollte ausgeben: v20.x.x (oder ähnlich)

npm --version
# Sollte ausgeben: 10.x.x (oder ähnlich)
```

### Schritt 2: Git installieren (optional, für Updates)

**Download:**
1. Gehe zu [git-scm.com](https://git-scm.com/)
2. Lade Git für Windows herunter
3. Installiere mit Standard-Einstellungen

### Schritt 3: Repository klonen oder ZIP herunterladen

**Option A: Mit Git (empfohlen)**
```bash
# PowerShell oder CMD öffnen
cd C:\Users\DeinName\Documents
git clone https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop.git
cd pupcidslittletiktoolhelper_desktop
```

**Option B: ZIP-Download**
1. Gehe zu [GitHub-Repository](https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop)
2. Klicke "Code" → "Download ZIP"
3. Entpacke die ZIP-Datei nach `C:\Users\DeinName\Documents\pupcidslittletiktoolhelper_desktop`
4. Öffne PowerShell/CMD in diesem Ordner

### Schritt 4: Dependencies installieren

```bash
npm install
```

**Erwartete Ausgabe:**
```
added 150 packages, and audited 151 packages in 45s

23 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

### Schritt 5: Server starten

**Option A: Mit Launcher-Script (empfohlen)**
```bash
start.bat
```

**Option B: Mit Node direkt**
```bash
node launch.js
```

**Option C: Mit npm**
```bash
npm start
```

**Erwartete Ausgabe:**
```
[Launcher] Node.js Version: v20.10.0 ✓
[Launcher] npm Version: 10.2.3 ✓
[Launcher] Dependencies sind installiert ✓
[Launcher] Starte Server...
[Server] Server listening on http://localhost:3000
[Server] Dashboard: http://localhost:3000
[Browser] Opening dashboard...
```

### Schritt 6: Dashboard öffnen

Der Browser sollte sich automatisch öffnen auf:
```
http://localhost:3000
```

Falls nicht, öffne manuell einen Browser und gehe zu dieser URL.

**✅ Fertig!** Du solltest jetzt das Dashboard sehen.

---

## 🐧 Installation unter Linux

### Schritt 1: Node.js installieren

**Ubuntu/Debian:**
```bash
# Node.js 20.x installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verification
node --version
npm --version
```

**Fedora/CentOS/RHEL:**
```bash
# Node.js 20.x installieren
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Verification
node --version
npm --version
```

**Arch Linux:**
```bash
# Node.js installieren
sudo pacman -S nodejs npm

# Verification
node --version
npm --version
```

### Schritt 2: Build-Tools installieren (für better-sqlite3)

**Ubuntu/Debian:**
```bash
sudo apt-get install -y build-essential python3
```

**Fedora/CentOS/RHEL:**
```bash
sudo yum install -y gcc-c++ make python3
```

**Arch Linux:**
```bash
sudo pacman -S base-devel python
```

### Schritt 3: Repository klonen

```bash
cd ~
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper
```

### Schritt 4: Dependencies installieren

```bash
npm install
```

### Schritt 5: Server starten

```bash
# Start-Script ausführbar machen
chmod +x start.sh

# Server starten
./start.sh
```

**Oder:**
```bash
node launch.js
```

### Schritt 6: Dashboard öffnen

Öffne einen Browser und gehe zu:
```
http://localhost:3000
```

**Hinweis:** Unter Linux öffnet sich der Browser nicht automatisch. Du musst manuell die URL aufrufen.

---

## 🍎 Installation unter macOS

### Schritt 1: Homebrew installieren (falls nicht vorhanden)

```bash
# Terminal öffnen
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Schritt 2: Node.js installieren

```bash
# Node.js via Homebrew installieren
brew install node@20

# Verification
node --version
npm --version
```

### Schritt 3: Xcode Command Line Tools installieren (für better-sqlite3)

```bash
xcode-select --install
```

### Schritt 4: Repository klonen

```bash
cd ~/Documents
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper
```

### Schritt 5: Dependencies installieren

```bash
npm install
```

### Schritt 6: Server starten

```bash
# Start-Script ausführbar machen
chmod +x start.sh

# Server starten
./start.sh
```

**Oder:**
```bash
node launch.js
```

### Schritt 7: Dashboard öffnen

Der Browser sollte sich automatisch öffnen auf:
```
http://localhost:3000
```

Falls nicht, öffne manuell Safari/Chrome/Firefox und gehe zu dieser URL.

---

## 🚀 Erste Schritte

### 1. TikTok LIVE verbinden

Nach dem Start des Dashboards:

1. **Username eingeben**
   - Klicke auf das "Connect to TikTok LIVE"-Feld
   - Gib deinen **TikTok-Username** ein (nicht die @-Version)
   - Beispiel: `username` statt `@username`

2. **Connect klicken**
   - Klicke auf "Connect"
   - Warte auf grünen Status "Connected"

3. **Verbindung verifizieren**
   - Status sollte "Connected" anzeigen
   - Live-Viewer-Count sollte erscheinen
   - Event-Log zeigt "Connected to @username"

**Wichtig:**
- Du musst **LIVE sein** auf TikTok, bevor du verbindest
- Keine Login-Daten erforderlich (Tool nutzt öffentliche API)
- Bei "User offline" → Starte erst den TikTok LIVE-Stream

### 2. Test-Alert senden

Um zu prüfen, ob Alerts funktionieren:

1. Gehe zu **Settings** → **Alerts**
2. Klicke **"Test Alert"**
3. Alert sollte im Dashboard erscheinen
4. Sound sollte abspielen (falls aktiviert)

### 3. TTS testen

Um Text-to-Speech zu testen:

1. Gehe zu **Settings** → **TTS**
2. Wähle eine Stimme (z.B. "en_us_001")
3. Gib Text ein: "Hello, this is a test"
4. Klicke **"Test TTS"**
5. Stimme sollte abgespielt werden

### 4. Goal einrichten

Um ein Goal (z.B. Likes-Ziel) einzurichten:

1. Gehe zu **Settings** → **Goals**
2. Wähle **"Likes"**
3. Setze Goal: `1000`
4. Wähle Mode: `Add` (Goal erhöht sich bei jedem Stream)
5. Aktiviere **"Show Goal"**
6. Speichere

### 5. Flow erstellen

Um einen einfachen Flow zu erstellen:

1. Gehe zu **Flows**
2. Klicke **"+ Neuer Flow"**
3. Name: "Rose Thank You"
4. Trigger: `Gift`
5. Condition: `giftName == Rose`
6. Action: `TTS` → Text: `Danke {username} für die Rose!`
7. Speichere
8. Aktiviere Flow

**Test:** Wenn jemand eine Rose schickt, wird der TTS abgespielt.

---

## 🎬 OBS Studio Integration

### Browser Source Overlay einrichten

1. **OBS Studio öffnen**

2. **Neue Browser Source erstellen**
   - Rechtsklick in Sources → Add → Browser
   - Name: "TikTok Helper Overlay"

3. **URL eingeben**
   ```
   http://localhost:3000/overlay.html
   ```

4. **Properties einstellen**
   - Width: `1920`
   - Height: `1080`
   - FPS: `60`
   - ✅ Shutdown source when not visible
   - ✅ Refresh browser when scene becomes active

5. **CSS einfügen (optional, für Transparenz)**
   ```css
   body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }
   ```

6. **OK klicken**

**Fertig!** Alerts und HUD-Elemente erscheinen jetzt im Overlay.

### Goal-Overlay einrichten

Für separate Goal-Overlays:

1. **Neue Browser Source**
   - Name: "Likes Goal"
   - URL: `http://localhost:3000/goal/likes`
   - Width: `400`
   - Height: `100`

2. **Weitere Goals**
   - Followers: `/goal/followers`
   - Subs: `/goal/subs`
   - Coins: `/goal/coins`

### OBS WebSocket aktivieren (für Multi-Cam Plugin)

1. **OBS öffnen**
2. **Tools** → **WebSocket Server Settings**
3. ✅ **Enable WebSocket server**
4. **Server Port:** `4455` (Standard)
5. **Server Password:** (optional, leer lassen oder Passwort setzen)
6. **Apply** → **OK**

Dann im TikTok Helper:
1. Gehe zu **Plugins** → **Multi-Cam Switcher**
2. OBS WebSocket konfigurieren:
   - Host: `localhost`
   - Port: `4455`
   - Password: (falls gesetzt)
3. **Connect**

---

## 🔥 Firewall & Netzwerk

### Port 3000 freigeben

Das Tool nutzt **Port 3000** für das Web-Dashboard.

**Windows Firewall:**
1. Windows Defender Firewall öffnen
2. **Erweiterte Einstellungen**
3. **Eingehende Regeln** → **Neue Regel**
4. Typ: **Port**
5. Port: `3000`
6. Aktion: **Verbindung zulassen**
7. Name: `TikTok Helper`
8. Fertigstellen

**Linux (ufw):**
```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

**Linux (firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

**macOS:**
macOS erlaubt localhost-Verbindungen standardmäßig. Keine Konfiguration nötig.

### Externer Zugriff (optional)

Falls du von anderen Geräten im Netzwerk zugreifen willst:

1. **Finde deine lokale IP**
   - Windows: `ipconfig`
   - Linux/macOS: `ifconfig` oder `ip addr`
   - Beispiel: `192.168.1.100`

2. **Zugriff von anderem Gerät**
   ```
   http://192.168.1.100:3000
   ```

**Sicherheitshinweis:** Nicht öffentlich im Internet verfügbar machen ohne Authentifizierung!

### Port ändern (optional)

Falls Port 3000 bereits belegt ist:

```bash
# Unter Windows (PowerShell)
$env:PORT=3001; npm start

# Unter Linux/macOS
PORT=3001 npm start
```

Dann Dashboard auf:
```
http://localhost:3001
```

---

## 🔧 Troubleshooting Installation

### Problem: "node: command not found"

**Lösung:**
- Node.js ist nicht installiert oder nicht im PATH
- Installiere Node.js neu: [nodejs.org](https://nodejs.org/)
- Starte Terminal/PowerShell neu nach Installation

### Problem: "npm install" schlägt fehl

**Symptom:**
```
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
```

**Lösung (Linux/macOS):**
```bash
# Build-Tools installieren
# Ubuntu/Debian:
sudo apt-get install -y build-essential python3

# macOS:
xcode-select --install
```

**Lösung (Windows):**
```bash
# Als Administrator in PowerShell:
npm install --global windows-build-tools
```

### Problem: "EADDRINUSE: address already in use"

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Lösung:**
Port 3000 wird bereits verwendet.

**Windows:**
```bash
# Prozess finden, der Port 3000 nutzt
netstat -ano | findstr :3000

# Prozess beenden (PID aus vorherigem Befehl)
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
# Prozess finden
lsof -i :3000

# Prozess beenden (PID aus vorherigem Befehl)
kill -9 <PID>
```

**Oder:** Nutze anderen Port (siehe oben).

### Problem: "Cannot find module 'better-sqlite3'"

**Lösung:**
```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install
```

**Falls weiterhin Fehler:**
```bash
# better-sqlite3 manuell kompilieren
npm rebuild better-sqlite3
```

### Problem: Browser öffnet sich nicht automatisch

**Lösung:**
- Normal unter Linux (öffnet sich nicht automatisch)
- Öffne manuell: `http://localhost:3000`

**Oder in launch.js anpassen:**
```javascript
// Zeile finden:
open('http://localhost:3000');

// Ersetzen mit:
// Kein Auto-Open
```

### Problem: "TikTok connection failed"

**Mögliche Ursachen:**
1. **User ist nicht LIVE**
   - Lösung: Starte TikTok LIVE-Stream erst
2. **Username falsch**
   - Lösung: Prüfe Username (ohne @)
3. **TikTok API Änderung**
   - Lösung: Update `tiktok-live-connector`: `npm update`

### Problem: "Alerts werden nicht angezeigt"

**Lösung:**
1. **Test-Alert prüfen**
   - Settings → Alerts → "Test Alert"
   - Falls Test funktioniert → TikTok-Verbindung prüfen
2. **Browser-Console prüfen**
   - F12 → Console → Fehler prüfen
3. **Socket.io-Verbindung prüfen**
   - Console sollte zeigen: `Socket.io connected`

### Problem: "OBS Overlay zeigt nichts"

**Lösung:**
1. **URL prüfen**
   - Muss sein: `http://localhost:3000/overlay.html`
   - Nicht: `file:///...`
2. **Browser Source Properties**
   - Width/Height korrekt (1920x1080)
   - "Shutdown when not visible" aktiviert
3. **Refresh Browser Source**
   - Rechtsklick auf Source → Refresh

### Problem: Performance-Probleme

**Symptome:**
- Hohe CPU-Last
- Langsames Dashboard
- Verzögerte Alerts

**Lösungen:**
1. **Node.js Memory erhöhen**
   ```bash
   node --max-old-space-size=4096 server.js
   ```
2. **Browser-Cache leeren**
   - F12 → Network → "Disable cache"
3. **Logs deaktivieren**
   - Setze Log-Level auf "error" statt "debug"
4. **Alte Events löschen**
   - Database → "Clear old events"

### Problem: Update-Check schlägt fehl

**Lösung:**
- Normal, falls GitHub nicht erreichbar
- Update-Checker hat Graceful 404-Handling
- Ignorieren oder manuell updaten

### Support

Falls Probleme weiterhin bestehen:
- **E-Mail:** [loggableim@gmail.com](mailto:loggableim@gmail.com)
- **GitHub Issues:** [Issues-Seite](https://github.com/yourusername/pupcidslittletiktokhelper/issues)
- **Wiki:** [[FAQ & Troubleshooting]]

---

## 🎯 Nächste Schritte

Nach erfolgreicher Installation:

- **[[Konfiguration]]** - Einstellungen anpassen
- **[[Plugin-Dokumentation]]** - Plugins aktivieren/konfigurieren
- **[[API-Reference]]** - API-Integration nutzen

---

[← Home](Home) | [→ Konfiguration](Konfiguration)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
