# FAQ & Troubleshooting

[← API-Reference](API-Reference) | [→ Home](Home)

---

## 📑 Inhaltsverzeichnis

1. [Häufig gestellte Fragen (FAQ)](#häufig-gestellte-fragen-faq)
2. [Installation & Setup](#installation--setup)
3. [TikTok-Verbindung](#tiktok-verbindung)
4. [Alerts & TTS](#alerts--tts)
5. [OBS-Integration](#obs-integration)
6. [Plugin-Probleme](#plugin-probleme)
7. [Performance-Probleme](#performance-probleme)
8. [Datenbank-Probleme](#datenbank-probleme)
9. [Netzwerk & Firewall](#netzwerk--firewall)
10. [Debug-Tipps](#debug-tipps)
11. [Support & Community](#support--community)

---

## ❓ Häufig gestellte Fragen (FAQ)

### Muss ich mich bei TikTok anmelden?

**Nein!** Das Tool nutzt nur öffentliche TikTok LIVE-Streams. Keine Login-Daten erforderlich.

### Kostet das Tool etwas?

**Nein!** 100% kostenlos und Open Source (CC BY-NC 4.0 Lizenz).

### Welche TikTok-Events werden unterstützt?

- ✅ Gifts (Geschenke)
- ✅ Chat (Nachrichten)
- ✅ Follows (Follower)
- ✅ Shares (Stream-Shares)
- ✅ Likes
- ✅ Subscriptions

### Brauche ich einen API-Key?

**Nein!** Für Basis-Funktionen (TikTok TTS, Alerts, Goals) sind keine API-Keys erforderlich.

**Optional:** Google Cloud TTS API-Key für 30+ zusätzliche Stimmen.

### Funktioniert es mit OBS Studio?

**Ja!** Volle OBS-Integration via Browser Source und OBS WebSocket v5.

### Kann ich eigene Plugins erstellen?

**Ja!** Das Plugin-System ist vollständig dokumentiert. Siehe [[Plugin-Dokumentation]].

### Ist das Tool sicher?

**Ja!** 100% lokal, keine Cloud-Services, kein Tracking. Open Source Code auf GitHub.

### Läuft es auf Linux/macOS?

**Ja!** Cross-Platform: Windows, Linux, macOS.

---

## 🔧 Installation & Setup

### Problem: "node: command not found"

**Ursache:** Node.js nicht installiert oder nicht im PATH.

**Lösung:**
1. Node.js installieren: [nodejs.org](https://nodejs.org/)
2. Nach Installation: Terminal/PowerShell **neu starten**
3. Prüfen: `node --version`

---

### Problem: "npm install" schlägt fehl

**Symptom:**
```
gyp ERR! build error
gyp ERR! stack Error: `make` failed with exit code: 2
```

**Ursache:** Build-Tools fehlen (für `better-sqlite3`).

**Lösung (Windows):**
```bash
# Als Administrator in PowerShell:
npm install --global windows-build-tools
```

**Lösung (Linux/Ubuntu):**
```bash
sudo apt-get install -y build-essential python3
```

**Lösung (macOS):**
```bash
xcode-select --install
```

Nach Installation:
```bash
npm install
```

---

### Problem: "EADDRINUSE: address already in use"

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Ursache:** Port 3000 wird bereits verwendet.

**Lösung 1: Anderen Port nutzen**
```bash
# Windows (PowerShell)
$env:PORT=3001; npm start

# Linux/macOS
PORT=3001 npm start
```

**Lösung 2: Prozess beenden**

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
lsof -i :3000
kill -9 <PID>
```

---

### Problem: "Cannot find module 'better-sqlite3'"

**Ursache:** Dependencies fehlen oder beschädigt.

**Lösung:**
```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install

# Oder better-sqlite3 neu kompilieren
npm rebuild better-sqlite3
```

---

### Problem: Browser öffnet sich nicht automatisch

**Ursache:** Normal unter Linux (Auto-Open nicht unterstützt).

**Lösung:**
Öffne manuell:
```
http://localhost:3000
```

**Oder:** Auto-Open deaktivieren in `launch.js`:
```javascript
// Zeile kommentieren:
// open('http://localhost:3000');
```

---

## 📡 TikTok-Verbindung

### Problem: "TikTok connection failed"

**Symptom:** Verbindung schlägt fehl, Status bleibt "Connecting..."

**Mögliche Ursachen & Lösungen:**

#### 1. User ist nicht LIVE

**Lösung:** Starte **zuerst** den TikTok LIVE-Stream, **dann** verbinde das Tool.

#### 2. Username falsch

**Lösung:** Gib Username **ohne @** ein.
- ✅ Richtig: `username`
- ❌ Falsch: `@username`

#### 3. Privater Account

**Lösung:** Tool funktioniert nur mit öffentlichen LIVE-Streams.

#### 4. TikTok API-Änderung

**Lösung:** Update `tiktok-live-connector`:
```bash
npm update tiktok-live-connector
npm start
```

#### 5. Netzwerk-Firewall

**Lösung:** Stelle sicher, dass TikTok erreichbar ist:
```bash
ping webcast.tiktok.com
```

Falls blockiert: Firewall-Regeln anpassen.

---

### Problem: Verbindung bricht ab

**Symptom:** "TikTok disconnected" nach kurzer Zeit.

**Ursachen:**
1. **Stream beendet** - Normal, wenn Streamer offline geht
2. **Netzwerk-Probleme** - Verbindung instabil
3. **TikTok Rate-Limiting** - Zu viele Reconnects

**Lösungen:**
1. Auto-Reconnect aktivieren (in Settings)
2. Warte 30 Sekunden vor erneutem Connect
3. Prüfe Netzwerkstabilität

---

### Problem: Events kommen nicht an

**Symptom:** TikTok verbunden, aber keine Gifts/Chat/Follows angezeigt.

**Lösungen:**
1. **Dashboard-Logs prüfen:** Erscheinen Events im Event-Log?
2. **Browser-Console prüfen:** F12 → Console → Socket.io-Fehler?
3. **Server-Logs prüfen:** `logs/combined.log`
4. **TikTok-Stream prüfen:** Gibt es überhaupt Events (Gifts, Chat)?

**Test:** Sende selbst eine Chat-Nachricht im TikTok LIVE-Stream.

---

## 🔔 Alerts & TTS

### Problem: Alerts werden nicht angezeigt

**Symptom:** Keine Alerts im Dashboard/Overlay.

**Lösung:**

#### 1. Test-Alert funktioniert?

```
Settings → Alerts → Test Alert
```

Falls Test funktioniert → TikTok-Verbindung prüfen.

Falls Test **nicht** funktioniert:

#### 2. Browser-Console prüfen

F12 → Console → Fehler?

Häufig:
```
Socket.io disconnected
```

**Lösung:** Server-Neustart:
```bash
npm start
```

#### 3. OBS-Overlay prüfen

Falls Alerts im Dashboard, aber nicht im OBS-Overlay:

**Lösung:**
- OBS → Rechtsklick auf Browser Source → **Refresh**
- URL prüfen: `http://localhost:3000/overlay.html`
- Browser Source Properties → "Shutdown when not visible" ✅

---

### Problem: TTS spielt nicht ab

**Symptom:** TTS-Queue füllt sich, aber kein Sound.

**Lösungen:**

#### 1. TTS-Test

```
Settings → TTS → Test TTS
```

Falls Test funktioniert → Problem bei Auto-TTS.

#### 2. Volume prüfen

```
Settings → TTS → Volume = 80 (oder höher)
```

#### 3. Browser-Sound prüfen

Dashboard-Tab ist nicht stummgeschaltet?

#### 4. TTS-Plugin aktiviert?

```
Plugins → TTS Plugin → Enabled ✅
```

#### 5. Google TTS API-Key ungültig?

Falls Google TTS genutzt:
```
Settings → TTS → Google API Key prüfen
```

**Lösung:** Nutze TikTok TTS (keine API-Key erforderlich).

---

### Problem: TTS-Queue-Overflow

**Symptom:**
```
[TTS] Warning: Queue is full (100/100)
```

**Ursache:** Zu viele Chat-Nachrichten, Queue voll.

**Lösungen:**
1. **Max Queue Size erhöhen:**
   ```
   Settings → TTS → Max Queue Size = 200
   ```

2. **Min Team Level erhöhen:**
   ```
   Settings → TTS → Min Team Level = 1
   ```
   (Nur Follower/Subs bekommen TTS)

3. **Blacklist nutzen:**
   ```
   Settings → TTS → Blacklist = ["badword1", "badword2"]
   ```

4. **Auto-TTS deaktivieren:**
   ```
   Settings → TTS → Auto TTS = Off
   ```

---

## 🎥 OBS-Integration

### Problem: OBS-Overlay zeigt nichts

**Symptom:** Browser Source bleibt schwarz/leer.

**Lösungen:**

#### 1. URL prüfen

Muss sein:
```
http://localhost:3000/overlay.html
```

**Nicht:**
```
file:///C:/Users/.../overlay.html
```

#### 2. Browser Source Properties

- Width: `1920`
- Height: `1080`
- ✅ Shutdown source when not visible
- ✅ Refresh browser when scene becomes active

#### 3. Browser Source refreshen

OBS → Rechtsklick auf Source → **Refresh**

#### 4. Dashboard-Test

Öffne Overlay im normalen Browser:
```
http://localhost:3000/overlay.html
```

Funktioniert es dort? Falls ja → OBS-Cache löschen.

#### 5. OBS-Cache löschen

OBS schließen → Ordner löschen:
```
Windows: %APPDATA%/obs-studio/plugin_config/obs-browser
Linux: ~/.config/obs-studio/plugin_config/obs-browser
macOS: ~/Library/Application Support/obs-studio/plugin_config/obs-browser
```

OBS neu starten.

---

### Problem: OBS WebSocket-Verbindung fehl

**Symptom:** Multi-Cam Plugin kann nicht verbinden.

**Lösungen:**

#### 1. OBS WebSocket aktiviert?

OBS → Tools → **WebSocket Server Settings**
- ✅ Enable WebSocket server
- Port: `4455`
- Password: (optional)

#### 2. OBS-Version prüfen

Mindestens **OBS 28.0** erforderlich (WebSocket v5).

Alte OBS-Versionen (< 28) haben WebSocket v4 (nicht kompatibel).

**Lösung:** OBS updaten: [obsproject.com](https://obsproject.com/)

#### 3. Firewall-Block

Windows Firewall blockiert Port 4455?

**Lösung:**
```bash
# Windows (PowerShell als Admin)
New-NetFirewallRule -DisplayName "OBS WebSocket" -Direction Inbound -LocalPort 4455 -Protocol TCP -Action Allow
```

#### 4. Falscher Host/Port

Multi-Cam Config prüfen:
```
Plugins → Multi-Cam → Config
Host: localhost
Port: 4455
Password: (leer oder korrekt)
```

---

## 🔌 Plugin-Probleme

### Problem: Plugin lädt nicht

**Symptom:** Plugin erscheint nicht in Liste.

**Lösungen:**

#### 1. plugin.json prüfen

JSON-Syntax korrekt?

**Test:**
```bash
cat plugins/my-plugin/plugin.json | jq .
```

Falls Fehler → JSON korrigieren.

#### 2. Enabled-Status

```json
{
  "enabled": true
}
```

Falls `false` → Ändern zu `true`.

#### 3. Server-Logs prüfen

```bash
tail -f logs/combined.log
```

Fehler beim Plugin-Laden?

#### 4. Permissions

Plugin-Verzeichnis lesbar?

```bash
# Linux/macOS
chmod -R 755 plugins/my-plugin
```

---

### Problem: Plugin crasht Server

**Symptom:** Server startet nicht / crasht beim Plugin-Laden.

**Lösungen:**

#### 1. Plugin deaktivieren

Manuell in `plugin.json`:
```json
{
  "enabled": false
}
```

Server neu starten.

#### 2. Error in init()

Try-Catch in `main.js` hinzufügen:
```javascript
async init() {
    try {
        // Plugin-Code
    } catch (error) {
        this.api.log(`Init failed: ${error.message}`, 'error');
    }
}
```

#### 3. Dependencies fehlen

Plugin benötigt NPM-Package?

```bash
npm install <package-name>
```

#### 4. Syntax-Fehler

JavaScript-Syntax-Fehler in `main.js`?

**Test:**
```bash
node -c plugins/my-plugin/main.js
```

---

### Problem: Plugin-Config wird nicht gespeichert

**Symptom:** Config geht nach Neustart verloren.

**Lösungen:**

#### 1. setConfig() nutzen

```javascript
this.api.setConfig('config', this.config);
```

#### 2. In destroy() speichern

```javascript
async destroy() {
    this.api.setConfig('lastState', this.state);
}
```

#### 3. Datenbank prüfen

```bash
sqlite3 user_configs/<profile>/database.db
SELECT * FROM settings WHERE key LIKE 'plugin:my-plugin:%';
```

---

## ⚡ Performance-Probleme

### Problem: Hohe CPU-Last

**Symptom:** Server nutzt 50%+ CPU.

**Lösungen:**

#### 1. Log-Level reduzieren

```bash
LOG_LEVEL=error npm start
```

Statt `debug` → `error`.

#### 2. Event-Log limitieren

Dashboard → Settings → Event Log Limit = 100

Alte Events automatisch löschen.

#### 3. Plugin deaktivieren

Teste einzelne Plugins:
```
Plugins → Disable → Performance prüfen
```

Welches Plugin verursacht Last?

#### 4. Node.js Memory erhöhen

```bash
node --max-old-space-size=4096 server.js
```

---

### Problem: Langsames Dashboard

**Symptom:** Dashboard reagiert langsam.

**Lösungen:**

#### 1. Browser-Cache leeren

F12 → Network → **Disable cache** ✅

#### 2. Virtual Scrolling aktiviert?

Dashboard nutzt Virtual Scrolling für Event-Log (automatisch ab 100 Items).

#### 3. Browser wechseln

Chrome/Edge sind schneller als Firefox für Socket.io.

#### 4. Hardware-Acceleration

Browser-Settings → **Hardware Acceleration** ✅

---

## 💾 Datenbank-Probleme

### Problem: "Database is locked"

**Symptom:**
```
Error: database is locked
```

**Ursache:** Mehrere Prozesse greifen auf Datenbank zu.

**Lösungen:**

#### 1. Server-Prozess beenden

Nur **ein** Server-Prozess gleichzeitig!

**Windows:**
```bash
taskkill /IM node.exe /F
```

**Linux/macOS:**
```bash
pkill -9 node
```

#### 2. WAL-Dateien löschen

Server stoppen, dann:
```bash
rm user_configs/<profile>/database.db-shm
rm user_configs/<profile>/database.db-wal
```

Server starten.

---

### Problem: Datenbank korrupt

**Symptom:**
```
Error: database disk image is malformed
```

**Lösungen:**

#### 1. Backup wiederherstellen

Falls Backup vorhanden:
```bash
cp user_configs/backups/<profile>_<timestamp>.db user_configs/<profile>/database.db
```

#### 2. Datenbank reparieren

```bash
sqlite3 user_configs/<profile>/database.db
.recover
.exit
```

#### 3. Datenbank neu erstellen

**Letzter Ausweg (alle Daten verloren!):**
```bash
rm user_configs/<profile>/database.db
npm start
```

Server erstellt neue Datenbank.

---

## 🌐 Netzwerk & Firewall

### Problem: Kann nicht von anderem Gerät zugreifen

**Symptom:** Dashboard auf PC funktioniert, aber nicht auf Tablet/Handy.

**Lösungen:**

#### 1. Firewall-Regel

Port 3000 freigeben (siehe [[Installation & Setup]]).

#### 2. Korrekte IP nutzen

**Nicht:**
```
http://localhost:3000
```

**Sondern:**
```
http://192.168.1.100:3000
```

IP-Adresse finden:
```bash
# Windows
ipconfig

# Linux/macOS
ifconfig
```

#### 3. Netzwerk prüfen

Beide Geräte im gleichen WLAN/LAN?

---

### Problem: Port 3000 blockiert

**Symptom:** Server startet nicht, Port belegt.

**Lösung:** Anderen Port nutzen:
```bash
PORT=3001 npm start
```

Dann Dashboard öffnen:
```
http://localhost:3001
```

---

## 🐛 Debug-Tipps

### Server-Logs prüfen

```bash
# Live-Logs
tail -f logs/combined.log

# Nur Errors
tail -f logs/error.log

# Letzte 100 Zeilen
tail -n 100 logs/combined.log
```

### Browser-Console prüfen

Dashboard öffnen → **F12** → **Console**

Häufige Fehler:
```
Socket.io disconnected
Failed to load resource: net::ERR_CONNECTION_REFUSED
Uncaught TypeError: ...
```

### Socket.io-Verbindung prüfen

Browser-Console:
```javascript
// Sollte "connected" zeigen
socket.connected

// Sollte "true" sein
socket.io.engine.id !== undefined
```

### API-Test mit curl

```bash
# Status prüfen
curl http://localhost:3000/api/status

# Settings prüfen
curl http://localhost:3000/api/settings

# Gift-Katalog prüfen
curl http://localhost:3000/api/gift-catalog
```

### Node.js Debugger

VS Code → F5 → Debug Server

Breakpoints setzen → Step-Through-Debugging.

---

## 🆘 Support & Community

### Hilfe bekommen

**1. GitHub Issues:**
[github.com/yourusername/pupcidslittletiktokhelper/issues](https://github.com/yourusername/pupcidslittletiktokhelper/issues)

**2. E-Mail:**
[loggableim@gmail.com](mailto:loggableim@gmail.com)

**3. Dokumentation:**
Dieses Wiki durchsuchen.

### Bug-Report erstellen

**Informationen bereitstellen:**
1. **Beschreibung:** Was ist das Problem?
2. **Steps to Reproduce:** Wie reproduziert man den Bug?
3. **Expected vs Actual:** Was erwartest du vs. was passiert?
4. **Logs:** Server-Logs (`logs/combined.log`) oder Browser-Console
5. **Environment:**
   - Node.js-Version: `node --version`
   - Betriebssystem: Windows/Linux/macOS
   - Browser: Chrome/Firefox/Edge

### Feature-Request

**Informationen bereitstellen:**
1. **Beschreibung:** Was soll das Feature tun?
2. **Use-Case:** Wofür brauchst du es?
3. **Mockups/Skizzen:** Falls vorhanden

---

## 🔗 Weitere Ressourcen

- **[[Home]]** - Wiki-Startseite
- **[[Installation & Setup]]** - Setup-Anleitung
- **[[Konfiguration]]** - Einstellungen
- **[[Entwickler-Leitfaden]]** - Development

---

[← API-Reference](API-Reference) | [→ Home](Home)

---

*Letzte Aktualisierung: 2025-11-11*
