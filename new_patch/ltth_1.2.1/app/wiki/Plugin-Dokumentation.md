# Plugin-Dokumentation

[← Entwickler-Leitfaden](Entwickler-Leitfaden) | [→ API-Reference](API-Reference)

---

## 📑 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Plugin-Struktur](#plugin-struktur)
3. [Plugin-API](#plugin-api)
4. [Lifecycle-Hooks](#lifecycle-hooks)
5. [Beispiel-Plugin erstellen](#beispiel-plugin-erstellen)
6. [Verfügbare Plugins](#verfügbare-plugins)
7. [Plugin hochladen](#plugin-hochladen)
8. [Plugin deaktivieren/löschen](#plugin-deaktivierenlöschen)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## 🔍 Übersicht

Das Plugin-System ermöglicht es, die Funktionalität des TikTok Helpers zu erweitern, ohne den Core-Code zu modifizieren. Plugins können:

- **Express-Routes** registrieren (REST-API-Endpunkte)
- **Socket.io-Events** abonnieren und emittieren
- **TikTok-Events** abonnieren (gifts, chat, follow, etc.)
- **Datenbank** nutzen (Settings, Tabellen)
- **Externe APIs** integrieren (OBS, OSC, HTTP-Requests)
- **Admin-UI** bereitstellen (HTML-Interface)

### Features

✅ **Hot-Loading** - Plugins ohne Server-Neustart laden/deaktivieren
✅ **ZIP-Upload** - Plugins via Web-UI hochladen
✅ **Plugin-API** - Einfache Integration mit Core-System
✅ **Isolation** - Plugins können sich nicht gegenseitig stören
✅ **Config-Management** - Plugin-spezifische Einstellungen

---

## 📁 Plugin-Struktur

### Minimales Plugin

```
plugins/my-plugin/
├── plugin.json       # Metadata (Pflicht)
└── main.js           # Plugin-Klasse (Pflicht)
```

### Vollständiges Plugin

```
plugins/my-plugin/
├── plugin.json       # Metadata
├── main.js           # Plugin-Klasse
├── ui.html           # Optional: Admin-UI
├── assets/           # Optional: Statische Assets
│   ├── style.css
│   ├── script.js
│   └── icon.png
└── README.md         # Optional: Dokumentation
```

### plugin.json

**Pflichtfelder:**

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Beschreibung des Plugins",
  "version": "1.0.0",
  "author": "Dein Name",
  "entry": "main.js",
  "enabled": true,
  "type": "utility",
  "dependencies": ["express", "socket.io"],
  "permissions": ["tiktok-events", "database"]
}
```

**Felder-Beschreibung:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | String | Eindeutige Plugin-ID (kebab-case) |
| `name` | String | Display-Name |
| `description` | String | Kurzbeschreibung |
| `version` | String | Semantic Versioning (1.0.0) |
| `author` | String | Autor-Name |
| `entry` | String | Einstiegspunkt (meist "main.js") |
| `enabled` | Boolean | Initial aktiviert? |
| `type` | String | Plugin-Typ ("utility", "overlay", "integration") |
| `dependencies` | Array | NPM-Dependencies (informativ) |
| `permissions` | Array | Benötigte Permissions |

**Plugin-Types:**
- `utility` - Utility-Plugins (Allgemein)
- `overlay` - Overlay-bezogen (HUD, Alerts)
- `integration` - Externe Integrationen (OBS, OSC, VRChat)

**Permissions:**
- `tiktok-events` - TikTok-Events abonnieren
- `database` - Datenbank-Zugriff
- `filesystem` - Datei-Zugriff
- `network` - HTTP-Requests

### main.js

**Minimal-Beispiel:**

```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;
    }

    async init() {
        this.api.log('My Plugin started');
    }

    async destroy() {
        this.api.log('My Plugin stopped');
    }
}

module.exports = MyPlugin;
```

---

## 🔌 Plugin-API

Die `PluginAPI`-Klasse wird beim Plugin-Constructor übergeben und bietet Zugriff auf das Core-System.

### API-Methoden

#### 1. registerRoute(method, path, handler)

Registriert einen Express-Route-Handler.

**Parameter:**
- `method` (String) - HTTP-Methode: `'GET'`, `'POST'`, `'PUT'`, `'DELETE'`
- `path` (String) - Route-Path (relativ zu `/api/plugins/<plugin-id>`)
- `handler` (Function) - Express-Handler: `(req, res) => {}`

**Beispiel:**
```javascript
this.api.registerRoute('GET', '/status', (req, res) => {
    res.json({
        success: true,
        status: 'ok'
    });
});
```

**Zugriff:**
```
GET http://localhost:3000/api/plugins/my-plugin/status
```

#### 2. registerSocket(event, callback)

Registriert einen Socket.io-Event-Listener.

**Parameter:**
- `event` (String) - Event-Name
- `callback` (Function) - Handler: `(socket, ...args) => {}`

**Beispiel:**
```javascript
this.api.registerSocket('myplugin:action', async (socket, data) => {
    this.api.log(`Received action: ${data.action}`);
    this.api.emit('myplugin:response', { result: 'success' });
});
```

**Frontend-Usage:**
```javascript
socket.emit('myplugin:action', { action: 'doSomething' });
socket.on('myplugin:response', (data) => {
    console.log(data.result);
});
```

#### 3. registerTikTokEvent(event, callback)

Registriert einen TikTok-Event-Listener.

**Parameter:**
- `event` (String) - TikTok-Event: `'gift'`, `'chat'`, `'follow'`, `'subscribe'`, `'share'`, `'like'`
- `callback` (Function) - Handler: `async (data) => {}`

**Beispiel:**
```javascript
this.api.registerTikTokEvent('gift', async (data) => {
    this.api.log(`Gift received: ${data.giftName} from ${data.username}`);

    if (data.giftName === 'Rose') {
        this.api.emit('myplugin:rose-received', {
            username: data.username,
            coins: data.coins
        });
    }
});
```

**Event-Daten:**

**Gift-Event:**
```javascript
{
  username: 'user123',
  giftName: 'Rose',
  giftId: 5655,
  coins: 1,
  count: 1,
  profilePictureUrl: 'https://...'
}
```

**Chat-Event:**
```javascript
{
  username: 'user123',
  message: 'Hello world',
  profilePictureUrl: 'https://...'
}
```

#### 4. getConfig(key)

Lädt Plugin-Config aus Datenbank.

**Parameter:**
- `key` (String) - Config-Key

**Returns:** Config-Value (Object/String/Number/Boolean/null)

**Beispiel:**
```javascript
const config = this.api.getConfig('config');
if (!config) {
    // Default-Config setzen
    this.api.setConfig('config', { enabled: true });
}
```

**Datenbank-Speicherort:**
```
settings-Tabelle:
key: "plugin:my-plugin:config"
value: "{\"enabled\":true}"
```

#### 5. setConfig(key, value)

Speichert Plugin-Config in Datenbank.

**Parameter:**
- `key` (String) - Config-Key
- `value` (Any) - Config-Value (wird als JSON gespeichert)

**Beispiel:**
```javascript
this.api.setConfig('config', {
    enabled: true,
    maxItems: 100,
    thresholds: [10, 50, 100]
});
```

#### 6. emit(event, data)

Sendet Socket.io-Event an alle verbundenen Clients.

**Parameter:**
- `event` (String) - Event-Name
- `data` (Object) - Event-Daten

**Beispiel:**
```javascript
this.api.emit('myplugin:update', {
    status: 'processing',
    progress: 50
});
```

#### 7. log(message, level)

Logging via Winston-Logger.

**Parameter:**
- `message` (String) - Log-Message
- `level` (String) - Log-Level: `'info'`, `'warn'`, `'error'`, `'debug'` (Default: `'info'`)

**Beispiel:**
```javascript
this.api.log('Plugin started');
this.api.log('Warning: Config missing', 'warn');
this.api.log('Error occurred', 'error');
this.api.log('Debug info', 'debug');
```

**Log-Output:**
```
[2025-11-11 12:00:00] [Plugin:my-plugin] info: Plugin started
```

#### 8. getSocketIO()

Gibt Socket.io-Instanz zurück (für erweiterte Nutzung).

**Returns:** `Socket.io`-Server-Instanz

**Beispiel:**
```javascript
const io = this.api.getSocketIO();
io.to('room123').emit('event', data); // Room-spezifischer Broadcast
```

#### 9. getDatabase()

Gibt Datenbank-Instanz zurück (für direkten Zugriff).

**Returns:** `Database`-Instanz

**Beispiel:**
```javascript
const db = this.api.getDatabase();
const result = db.prepare('SELECT * FROM events WHERE type = ?').all('gift');
```

---

## 🔄 Lifecycle-Hooks

### 1. constructor(api)

**Wann:** Plugin wird instanziiert (beim Laden)

**Zweck:** API-Instanz speichern, Member-Variablen initialisieren

**Beispiel:**
```javascript
constructor(api) {
    this.api = api;
    this.counter = 0;
    this.timers = [];
}
```

### 2. init()

**Wann:** Plugin wird aktiviert (initial oder nach Enable)

**Zweck:**
- Routes registrieren
- Socket.io-Events registrieren
- TikTok-Events registrieren
- Config laden
- Externe Verbindungen aufbauen
- Timers starten

**Beispiel:**
```javascript
async init() {
    this.api.log('Initializing...');

    // Config laden
    this.config = this.api.getConfig('config') || this.getDefaultConfig();

    // Routes registrieren
    this.api.registerRoute('GET', '/stats', (req, res) => {
        res.json({ counter: this.counter });
    });

    // TikTok-Events abonnieren
    this.api.registerTikTokEvent('gift', async (data) => {
        this.counter++;
    });

    // Timer starten
    this.timer = setInterval(() => {
        this.api.emit('myplugin:counter', { count: this.counter });
    }, 5000);

    this.api.log('Initialized successfully');
}
```

### 3. destroy()

**Wann:** Plugin wird deaktiviert (Disable, Reload, Server-Shutdown)

**Zweck:**
- Cleanup (Timers, Connections, etc.)
- Ressourcen freigeben
- Letzte Daten speichern

**Beispiel:**
```javascript
async destroy() {
    this.api.log('Stopping...');

    // Timers stoppen
    if (this.timer) {
        clearInterval(this.timer);
    }

    // Externe Verbindungen schließen
    if (this.connection) {
        await this.connection.disconnect();
    }

    // Letzte Daten speichern
    this.api.setConfig('lastCounter', this.counter);

    this.api.log('Stopped successfully');
}
```

---

## 🛠️ Beispiel-Plugin erstellen

### Schritt 1: Verzeichnis erstellen

```bash
cd plugins/
mkdir gift-counter
cd gift-counter
```

### Schritt 2: plugin.json erstellen

```json
{
  "id": "gift-counter",
  "name": "Gift Counter",
  "description": "Zählt empfangene Gifts und zeigt Top-Gift an",
  "version": "1.0.0",
  "author": "Dein Name",
  "entry": "main.js",
  "enabled": true,
  "type": "utility",
  "dependencies": ["express", "socket.io"],
  "permissions": ["tiktok-events", "database"]
}
```

### Schritt 3: main.js erstellen

```javascript
/**
 * Gift Counter Plugin
 * Zählt alle empfangenen Gifts und zeigt das häufigste Gift an
 */
class GiftCounterPlugin {
    constructor(api) {
        this.api = api;
        this.giftCounts = {}; // { giftName: count }
        this.totalGifts = 0;
    }

    async init() {
        this.api.log('Gift Counter Plugin initializing...');

        // Config laden
        let config = this.api.getConfig('config');
        if (!config) {
            config = {
                enabled: true,
                showTopGift: true
            };
            this.api.setConfig('config', config);
        }
        this.config = config;

        // Gespeicherte Counts laden
        const savedCounts = this.api.getConfig('giftCounts');
        if (savedCounts) {
            this.giftCounts = savedCounts;
            this.totalGifts = Object.values(savedCounts).reduce((a, b) => a + b, 0);
        }

        // API-Endpunkte registrieren
        this.registerRoutes();

        // Socket.io-Events registrieren
        this.registerSocketEvents();

        // TikTok-Events registrieren
        this.registerTikTokEvents();

        this.api.log('Gift Counter Plugin initialized successfully');
    }

    registerRoutes() {
        // GET /api/plugins/gift-counter/stats
        this.api.registerRoute('GET', '/stats', (req, res) => {
            res.json({
                success: true,
                totalGifts: this.totalGifts,
                giftCounts: this.giftCounts,
                topGift: this.getTopGift()
            });
        });

        // POST /api/plugins/gift-counter/reset
        this.api.registerRoute('POST', '/reset', (req, res) => {
            this.giftCounts = {};
            this.totalGifts = 0;
            this.api.setConfig('giftCounts', {});

            this.api.emit('giftcounter:reset', {});

            res.json({ success: true });
        });

        // GET /api/plugins/gift-counter/config
        this.api.registerRoute('GET', '/config', (req, res) => {
            res.json({
                success: true,
                config: this.config
            });
        });

        // POST /api/plugins/gift-counter/config
        this.api.registerRoute('POST', '/config', (req, res) => {
            this.config = { ...this.config, ...req.body };
            this.api.setConfig('config', this.config);

            res.json({
                success: true,
                config: this.config
            });
        });
    }

    registerSocketEvents() {
        // Client kann Stats anfordern
        this.api.registerSocket('giftcounter:request-stats', async (socket, data) => {
            socket.emit('giftcounter:stats', {
                totalGifts: this.totalGifts,
                giftCounts: this.giftCounts,
                topGift: this.getTopGift()
            });
        });
    }

    registerTikTokEvents() {
        // Gift-Events abonnieren
        this.api.registerTikTokEvent('gift', async (data) => {
            if (!this.config.enabled) return;

            const giftName = data.giftName;
            const count = data.count || 1;

            // Count erhöhen
            this.giftCounts[giftName] = (this.giftCounts[giftName] || 0) + count;
            this.totalGifts += count;

            // In Datenbank speichern (alle 10 Gifts)
            if (this.totalGifts % 10 === 0) {
                this.api.setConfig('giftCounts', this.giftCounts);
            }

            // Update an Clients senden
            this.api.emit('giftcounter:update', {
                totalGifts: this.totalGifts,
                giftCounts: this.giftCounts,
                topGift: this.getTopGift()
            });

            this.api.log(`Gift received: ${giftName} x${count} (Total: ${this.totalGifts})`, 'debug');
        });
    }

    getTopGift() {
        let topGift = null;
        let maxCount = 0;

        for (const [giftName, count] of Object.entries(this.giftCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topGift = { name: giftName, count };
            }
        }

        return topGift;
    }

    async destroy() {
        this.api.log('Gift Counter Plugin stopping...');

        // Letzte Counts speichern
        this.api.setConfig('giftCounts', this.giftCounts);

        this.api.log('Gift Counter Plugin stopped');
    }
}

module.exports = GiftCounterPlugin;
```

### Schritt 4: Optional - ui.html erstellen

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Gift Counter</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
        }
        .stat {
            margin: 10px 0;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 5px;
        }
        .top-gift {
            font-size: 24px;
            font-weight: bold;
            color: #4ade80;
        }
    </style>
</head>
<body>
    <h1>Gift Counter</h1>

    <div class="stat">
        <strong>Total Gifts:</strong> <span id="totalGifts">0</span>
    </div>

    <div class="stat">
        <strong>Top Gift:</strong> <span id="topGift" class="top-gift">-</span>
    </div>

    <button onclick="resetCounter()">Reset</button>

    <h2>Gift Breakdown</h2>
    <div id="giftList"></div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();

        socket.on('giftcounter:update', (data) => {
            updateUI(data);
        });

        fetch('/api/plugins/gift-counter/stats')
            .then(res => res.json())
            .then(data => updateUI(data));

        function updateUI(data) {
            document.getElementById('totalGifts').textContent = data.totalGifts;
            document.getElementById('topGift').textContent =
                data.topGift ? `${data.topGift.name} (${data.topGift.count})` : '-';

            const giftListHtml = Object.entries(data.giftCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => `<div>${name}: ${count}</div>`)
                .join('');
            document.getElementById('giftList').innerHTML = giftListHtml;
        }

        function resetCounter() {
            if (confirm('Really reset counter?')) {
                fetch('/api/plugins/gift-counter/reset', { method: 'POST' })
                    .then(res => res.json())
                    .then(() => {
                        updateUI({ totalGifts: 0, giftCounts: {}, topGift: null });
                    });
            }
        }
    </script>
</body>
</html>
```

### Schritt 5: Plugin laden

**Automatisch (beim Server-Start):**
```bash
npm start
```

**Manuell (via Dashboard):**
1. Dashboard öffnen
2. Plugins → "Reload Plugins"
3. Plugin sollte erscheinen

**Über API:**
```bash
POST http://localhost:3000/api/plugins/gift-counter/reload
```

### Schritt 6: Plugin testen

**API-Test:**
```bash
curl http://localhost:3000/api/plugins/gift-counter/stats
```

**UI-Test:**
```
http://localhost:3000/plugins/gift-counter/ui.html
```

**Live-Test:**
- TikTok LIVE verbinden
- Gifts senden lassen
- Stats sollten sich aktualisieren

---

## 📦 Verfügbare Plugins

**Little TikTool Helper v1.2.1** enthält **31 integrierte Plugins**. 

### Vollständige Plugin-Liste

Für eine detaillierte Übersicht aller Plugins mit Features, Status, Endpoints und Konfigurationsoptionen siehe:

➡️ **[[Plugin-Liste]]** - Komplette Liste aller 31 Plugins

### Plugin-Kategorien

| Status | Anzahl | Plugins |
|--------|--------|---------|
| 🔴 **Early Beta** | 6 | Advanced Timer, Chatango, GCCE HUD, Stream Alchemy, WebGPU Emoji Rain, Vulkan Rockets |
| 🟡 **Beta** | 10 | Minecraft Connect, Thermal Printer, Quiz Show, Viewer XP, Leaderboard, OpenShock, Multi-Cam, Gift Milestone, VDO.Ninja, GCCE |
| 🟢 **Alpha** | 8 | Weather Control, Emoji Rain v2.0, Soundboard, ClarityHUD, LastEvent Spotlight, TTS v2.0, Live Goals |
| 🔵 **Final** | 7 | OSC-Bridge, Config Import, Fireworks, API Bridge, CoinBattle, Flame Overlay, HybridShock |

### Wichtige Plugins (Highlights)

**TTS v2.0** (`plugins/tts/`)
- Enterprise-Grade TTS mit 75+ TikTok-Stimmen
- Multi-Engine-Support, Language-Detection
- Status: 🟢 Alpha

**WebGPU Emoji Rain** (`plugins/webgpu-emoji-rain/`)
- GPU-beschleunigter Emoji-Effekt
- 10x schneller als Canvas-Version
- Status: 🔴 Early Beta

**Global Chat Command Engine** (`plugins/gcce/`)
- Universaler Command-Interpreter
- Permission-System, Rate-Limiting
- Status: 🟡 Beta

**Viewer XP System** (`plugins/viewer-xp/`)
- Gamification mit Levels, Badges, Streaks
- Persistent Storage über Streams hinweg
- Status: 🟡 Beta

**OSC-Bridge** (`plugins/osc-bridge/`)
- VRChat-Integration
- Bidirektionale OSC-Kommunikation
- Status: 🔵 Final

Siehe **[[Plugin-Liste]]** für alle Details zu jedem Plugin.

---

## 📤 Plugin hochladen

### Via Web-UI

1. **Plugin als ZIP packen:**
   ```bash
   cd plugins/
   zip -r gift-counter.zip gift-counter/
   ```

2. **Dashboard öffnen:**
   ```
   http://localhost:3000
   ```

3. **Plugin-Manager:**
   - Plugins → "Upload Plugin"
   - ZIP-Datei auswählen
   - Upload

4. **Plugin aktivieren:**
   - Plugin erscheint in Liste
   - "Enable" klicken

### Via API

```bash
curl -X POST http://localhost:3000/api/plugins/upload \
  -F "file=@gift-counter.zip"
```

---

## ❌ Plugin deaktivieren/löschen

### Deaktivieren

**Via Dashboard:**
- Plugins → Plugin auswählen → "Disable"

**Via API:**
```bash
POST http://localhost:3000/api/plugins/gift-counter/disable
```

**Effekt:**
- `destroy()` wird aufgerufen
- Plugin bleibt auf Festplatte
- `plugin.json` → `enabled: false`

### Löschen

**Via Dashboard:**
- Plugins → Plugin auswählen → "Delete"

**Via API:**
```bash
DELETE http://localhost:3000/api/plugins/gift-counter
```

**Effekt:**
- Plugin-Verzeichnis wird gelöscht
- Config bleibt in Datenbank (kann manuell entfernt werden)

---

## ✅ Best Practices

### 1. Error-Handling

**Alle async-Funktionen mit Try-Catch:**
```javascript
this.api.registerRoute('GET', '/data', async (req, res) => {
    try {
        const data = await this.fetchData();
        res.json({ success: true, data });
    } catch (error) {
        this.api.log(`Error fetching data: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
    }
});
```

### 2. Config-Validierung

**Immer Defaults setzen:**
```javascript
let config = this.api.getConfig('config');
if (!config) {
    config = this.getDefaultConfig();
    this.api.setConfig('config', config);
}
```

### 3. Cleanup in destroy()

**Alle Ressourcen freigeben:**
```javascript
async destroy() {
    // Timers stoppen
    if (this.timer) clearInterval(this.timer);

    // Verbindungen schließen
    if (this.connection) await this.connection.close();

    // Daten speichern
    this.api.setConfig('lastState', this.state);
}
```

### 4. Logging verwenden

**Immer Logger statt console.log:**
```javascript
this.api.log('Plugin started');  // Info
this.api.log('Warning', 'warn');  // Warning
this.api.log('Error', 'error');  // Error
this.api.log('Debug info', 'debug');  // Debug (nur im Dev-Mode)
```

### 5. Rate-Limiting

**Bei häufigen Events:**
```javascript
registerTikTokEvents() {
    let lastUpdate = 0;

    this.api.registerTikTokEvent('like', async (data) => {
        const now = Date.now();
        if (now - lastUpdate < 1000) return; // Max 1x pro Sekunde

        lastUpdate = now;
        // Process event
    });
}
```

---

## 🐛 Troubleshooting

### Plugin lädt nicht

**Symptome:** Plugin erscheint nicht in Liste

**Lösungen:**
1. **plugin.json prüfen:** Syntax-Fehler?
2. **Enabled-Status:** `"enabled": true`?
3. **Server-Logs prüfen:** `logs/combined.log`
4. **Permissions:** Verzeichnis lesbar?

### Plugin crasht Server

**Symptome:** Server startet nicht / crasht beim Plugin-Laden

**Lösungen:**
1. **Plugin deaktivieren:** Manuell in `plugin.json` → `"enabled": false`
2. **Error in init():** Try-Catch hinzufügen
3. **Dependencies fehlen:** `npm install` prüfen

### Config wird nicht gespeichert

**Symptome:** Config geht nach Neustart verloren

**Lösungen:**
1. **setConfig() nutzen:** `this.api.setConfig('key', value)`
2. **In destroy() speichern:** Letzte Daten sichern
3. **Datenbank prüfen:** `SELECT * FROM settings WHERE key LIKE 'plugin:my-plugin:%'`

### Events werden nicht empfangen

**Symptome:** TikTok-Events kommen nicht an

**Lösungen:**
1. **registerTikTokEvent() vor init()-Ende aufrufen**
2. **Callback async:** `async (data) => {}`
3. **TikTok verbunden:** Status prüfen

---

## 🔗 Weitere Ressourcen

- **[[API-Reference]]** - Vollständige API-Dokumentation
- **[[Entwickler-Leitfaden]]** - Code-Standards
- **[[Architektur]]** - System-Architektur verstehen

---

[← Entwickler-Leitfaden](Entwickler-Leitfaden) | [→ API-Reference](API-Reference)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
