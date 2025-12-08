# Architektur

[← Konfiguration](Konfiguration) | [→ Entwickler-Leitfaden](Entwickler-Leitfaden)

---

## 📑 Inhaltsverzeichnis

1. [Systemübersicht](#systemübersicht)
2. [Architektur-Diagramm](#architektur-diagramm)
3. [Verzeichnisstruktur](#verzeichnisstruktur)
4. [Backend-Module](#backend-module)
5. [Frontend-Komponenten](#frontend-komponenten)
6. [Plugin-System](#plugin-system)
7. [Datenfluss](#datenfluss)
8. [Datenbank-Schema](#datenbank-schema)
9. [Externe Integrationen](#externe-integrationen)
10. [Performance & Skalierung](#performance--skalierung)

---

## 🏗️ Systemübersicht

**PupCid's Little TikTool Helper** ist eine **Event-Driven Microservice-Architektur** basierend auf Node.js, Express und Socket.io.

### Kern-Komponenten

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
│  ┌──────────────┬──────────────┐                            │
│  │  Dashboard   │ OBS Overlay  │                            │
│  │ (Bootstrap)  │ (Transparent)│                            │
│  └──────┬───────┴──────┬───────┘                            │
│         │              │                  │                 │
│         └──────────────┴──────────────────┘                 │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          REAL-TIME LAYER (Socket.io)                │   │
│  │   WebSocket Events, Pub/Sub, Broadcast              │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           EXPRESS REST API LAYER                    │   │
│  │   Routes, Middleware, Error Handling                │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              BUSINESS LOGIC LAYER                   │   │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │   │
│  │  │ Database │ TikTok   │ Alerts   │ Flows        │ │   │
│  │  │ Manager  │ Connector│ Manager  │ Engine       │ │   │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │   │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │   │
│  │  │ Goals    │ TTS      │ Soundbrd │ Leaderboard  │ │   │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           PLUGIN SYSTEM LAYER                       │   │
│  │   Plugin Loader, Plugin API, Hot-Loading            │   │
│  │   ┌───────┬────────┬─────────┬──────────────────┐  │   │
│  │   │ TTS   │ Multi- │ OSC     │ VDO.Ninja        │  │   │
│  │   │ Plugin│ Cam    │ Bridge  │ Plugin           │  │   │
│  │   └───────┴────────┴─────────┴──────────────────┘  │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            DATA PERSISTENCE LAYER                   │   │
│  │   SQLite (WAL Mode), File System, IndexedDB         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Technologie-Entscheidungen

| Komponente | Technologie | Begründung |
|------------|-------------|------------|
| **Runtime** | Node.js 18-23 | Async I/O, große Ecosystem, Cross-Platform |
| **Web Framework** | Express 4 | Lightweight, flexible, große Community |
| **Real-time** | Socket.io 4 | WebSocket + Fallbacks, Room-Support |
| **Datenbank** | SQLite (better-sqlite3) | Embedded, keine externe DB, WAL-Mode für Performance |
| **TikTok-Integration** | tiktok-live-connector | Community-Library, stabil, aktiv maintained |
| **OBS-Integration** | obs-websocket-js 5 | Offizieller Client, OBS WebSocket v5 |
| **OSC-Protokoll** | osc 2.4 | VRChat-Standard, stabil |
| **Logging** | winston 3 | Flexible, rotating files, multiple transports |

---

## 📊 Architektur-Diagramm

### High-Level-Architektur

```
┌──────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                        │
│  ┌──────────┬──────────────┬──────────────┬───────────────┐ │
│  │ TikTok   │ OBS Studio   │ VRChat       │ MyInstants    │ │
│  │ LIVE API │ WebSocket v5 │ OSC Protocol │ Sound Library │ │
│  └────┬─────┴──────┬───────┴──────┬───────┴──────┬────────┘ │
│       │            │              │              │           │
└───────┼────────────┼──────────────┼──────────────┼───────────┘
        │            │              │              │
        ▼            ▼              ▼              ▼
┌───────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                          │
│  ┌──────────┬──────────────┬──────────────┬───────────────┐  │
│  │ modules/ │ modules/     │ plugins/     │ modules/      │  │
│  │ tiktok.js│ obs-         │ osc-bridge/  │ soundboard.js │  │
│  │          │ websocket.js │ main.js      │               │  │
│  └────┬─────┴──────┬───────┴──────┬───────┴──────┬────────┘  │
│       │            │              │              │            │
└───────┼────────────┼──────────────┼──────────────┼────────────┘
        │            │              │              │
        └────────────┴──────────────┴──────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │       EVENT BUS (server.js)           │
        │  ┌─────────────────────────────────┐  │
        │  │ TikTok Event Emitter            │  │
        │  │ • gift, chat, follow, etc.      │  │
        │  └─────────────────────────────────┘  │
        │  ┌─────────────────────────────────┐  │
        │  │ Socket.io Event Broker          │  │
        │  │ • Rooms, Broadcast, Pub/Sub     │  │
        │  └─────────────────────────────────┘  │
        └───────────────────┬───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐      ┌─────────────┐     ┌──────────────┐
   │ Clients │      │ Plugins     │     │ Core Modules │
   │ (Front) │      │ (subscribe) │     │ (subscribe)  │
   └─────────┘      └─────────────┘     └──────────────┘
```

### Request-Flow-Beispiel (Gift-Event)

```
1. TikTok LIVE Stream
   │
   ▼
2. TikTok Connector (modules/tiktok.js)
   │ - Empfängt Gift-Event via tiktok-live-connector
   │ - Parst Event-Daten
   │
   ▼
3. Event Emitter (server.js)
   │ - Emit 'tiktok:gift' Event
   │
   ▼
4. Event-Listener
   ├─► Flow-Engine (modules/flows.js)
   │   │ - Prüft Trigger-Conditions
   │   │ - Führt Actions aus (TTS, Alert, OSC)
   │   │
   ├─► Alert-Manager (modules/alerts.js)
   │   │ - Erstellt Alert-Object
   │   │ - Emit 'alert:new' Socket.io-Event
   │   │
   ├─► Goal-Manager (modules/goals.js)
   │   │ - Inkrementiert Coins-Goal
   │   │ - Emit 'goal:update' Socket.io-Event
   │   │
   ├─► Soundboard (plugins/soundboard/)
   │   │ - Mapped Gift zu Sound
   │   │ - Emit 'soundboard:play' Socket.io-Event
   │   │
   ├─► Leaderboard (modules/leaderboard.js)
   │   │ - Update Top Gifters
   │   │ - Emit 'topboard:update' Socket.io-Event
   │   │
   └─► Custom Plugins (plugins/*/main.js)
       │ - Registrierte TikTok-Event-Callbacks
       │
       ▼
5. Socket.io Broadcast
   │ - Sendet Events an alle verbundenen Clients
   │
   ▼
6. Frontend (public/dashboard.html, public/overlay.html)
   │ - Empfängt Socket.io-Events
   │ - Rendert Alerts, aktualisiert Goals, etc.
```

---

## 📁 Verzeichnisstruktur

```
pupcidslittletiktokhelper/
│
├── server.js                     # Haupt-Server (1500+ Zeilen)
│                                 # Express-App, Socket.io, Event-Bus
│
├── launch.js                     # Platform-agnostischer Launcher
├── start.sh                      # Linux/macOS Launcher-Script
├── start.bat                     # Windows Launcher-Script
├── package.json                  # NPM Dependencies & Scripts
│
├── modules/                      # Backend-Module (10.000+ LOC)
│   ├── database.js              # SQLite-Manager (WAL Mode, Batching)
│   ├── tiktok.js                # TikTok LIVE Connector Integration
│   ├── tts.js                   # Text-to-Speech Engine (Legacy, jetzt Plugin)
│   ├── alerts.js                # Alert-Manager
│   ├── flows.js                 # Flow-Engine (Event-Automation)
│   ├── soundboard.js            # Soundboard-Manager (MyInstants)
│   ├── goals.js                 # Goal-Tracking System
│   ├── user-profiles.js         # Multi-User-Profile-Management
│   ├── vdoninja.js              # VDO.Ninja Integration (Legacy, jetzt Plugin)
│   ├── obs-websocket.js         # OBS WebSocket v5 Client
│   ├── subscription-tiers.js    # Subscription Tier Management
│   ├── leaderboard.js           # Leaderboard-System
│   ├── logger.js                # Winston Logger (Console + Rotating Files)
│   ├── rate-limiter.js          # Express Rate Limiting
│   ├── i18n.js                  # Internationalisierung (DE/EN)
│   ├── plugin-loader.js         # Plugin-System Loader (545 Zeilen)
│   ├── update-manager.js        # Git/ZIP Update-System (532 Zeilen)
│   ├── launcher.js              # Launcher-Logik
│   ├── tty-logger.js            # TTY-sicheres Logging
│   ├── template-engine.js       # Template-Renderer (Platzhalter)
│   ├── validators.js            # Input-Validierung (498 Zeilen)
│   ├── error-handler.js         # Zentrales Error-Handling
│   └── swagger-config.js        # Swagger API-Dokumentation
│
├── plugins/                      # Plugin-System (7 Plugins)
│   ├── topboard/                # Top Gifters, Streaks, Donors
│   │   ├── plugin.json          # Plugin-Metadata
│   │   └── main.js              # Plugin-Klasse
│   ├── tts/                     # TTS-Engine als Plugin
│   ├── vdoninja/                # VDO.Ninja Manager als Plugin
│   ├── multicam/                # Multi-Cam Switcher (OBS)
│   ├── osc-bridge/              # OSC-Bridge für VRChat
│   ├── soundboard/              # Soundboard-Plugin
│   └── emoji-rain/              # Emoji Rain Effekt
│
├── routes/                       # Express Route-Module
│   └── plugin-routes.js         # Plugin-Manager API (484 Zeilen)
│
├── public/                       # Frontend (HTML/CSS/JS)
│   ├── dashboard.html           # Haupt-Dashboard (Bootstrap 5)
│   ├── overlay.html             # OBS Browser Source Overlay
│   ├── soundboard/            # Plugin-based soundboard UI
│   ├── hud-config.html          # HUD-Konfigurator
│   ├── leaderboard-overlay.html # Leaderboard Overlay
│   ├── minigames-overlay.html   # Minigames Overlay
│   └── js/
│       ├── dashboard.js         # Dashboard-Logik
│       ├── plugin-manager.js    # Plugin-Manager Frontend (372 Zeilen)
│       ├── update-checker.js    # Update-Checker Frontend (270 Zeilen)
│       ├── vdoninja-dashboard.js# VDO.Ninja Frontend
│       ├── theme-manager.js     # Theme-Switcher (Dark/Light)
│       ├── audio-settings.js    # Audio-Konfiguration
│       ├── keyboard-nav.js      # Keyboard-Navigation
│       ├── virtual-scroller.js  # Virtual Scrolling (Performance)
│       ├── sound-worker.js      # Sound-Playback Worker
│       └── indexeddb-cache.js   # IndexedDB Caching
│
├── user_configs/                 # User-Profile Datenbanken (gitignored)
│   ├── .active_profile          # Aktives Profil (Textdatei)
│   └── <profile>/
│       └── database.db          # SQLite-Datenbank
│
├── user_data/                    # User-Daten (gitignored)
│   └── flow_logs/               # Flow-Engine Log-Dateien
│
├── locales/                      # Internationalisierung
│   ├── de.json                  # Deutsche Übersetzungen
│   └── en.json                  # Englische Übersetzungen
│
└── docs/                         # Dokumentation
    └── ...
```

### Dateigrößen (LOC = Lines of Code)

| Datei | LOC | Beschreibung |
|-------|-----|--------------|
| `server.js` | 1500+ | Haupt-Server, Express-App, Socket.io |
| `modules/database.js` | 600+ | SQLite-Manager mit WAL-Mode |
| `modules/plugin-loader.js` | 545 | Plugin-System mit Hot-Loading |
| `modules/update-manager.js` | 532 | Git/ZIP Update-System |
| `modules/validators.js` | 498 | Input-Validierung |
| `routes/plugin-routes.js` | 484 | Plugin-Manager REST-API |
| `public/js/plugin-manager.js` | 372 | Plugin-Manager Frontend |
| `public/js/update-checker.js` | 270 | Update-Checker Frontend |

**Gesamt:** ~15.000+ LOC

---

## ⚙️ Backend-Module

### 1. server.js (Haupt-Server)

**Zweck:** Express-App, Socket.io-Server, Event-Bus

**Aufgaben:**
- Express-Middleware Setup (CORS, Rate-Limiting, Body-Parser)
- Socket.io-Server initialisieren
- Plugin-Loader starten
- TikTok-Connector initialisieren
- Event-Routing (TikTok → Plugins → Clients)
- REST-API-Endpunkte registrieren
- Error-Handling

**Code-Struktur:**
```javascript
// Express-App Setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// Socket.io Setup
const io = socketIo(server, { cors: { origin: '*' } });

// Datenbank initialisieren
const db = new Database();

// Plugin-Loader starten
const pluginLoader = new PluginLoader(app, io, db, logger);
await pluginLoader.loadAllPlugins();

// TikTok-Connector Setup
const tiktok = new TikTokConnector();
tiktok.on('gift', (data) => {
    // Emit an Plugins
    pluginLoader.emitTikTokEvent('gift', data);

    // Emit an Clients
    io.emit('tiktok:gift', data);

    // Update Goals
    goalManager.handleGift(data);

    // Alert triggern
    alertManager.handleGift(data);
});

// HTTP-Server starten
server.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
});
```

### 2. modules/database.js (SQLite-Manager)

**Zweck:** SQLite-Datenbank-Management mit WAL-Mode

**Features:**
- WAL-Mode (Write-Ahead Logging) für Performance
- Prepared Statements für SQL-Injection-Schutz
- Batch-Writes für bessere Performance
- Transaction-Support
- Auto-Migration bei Schema-Änderungen

**API:**
```javascript
class Database {
    // Settings
    getSetting(key)
    setSetting(key, value)
    getAllSettings()

    // Alert-Configs
    getAlertConfig(eventType)
    setAlertConfig(eventType, config)

    // Flows
    getAllFlows()
    getFlow(id)
    createFlow(flow)
    updateFlow(id, flow)
    deleteFlow(id)

    // Gift-Sounds
    getGiftSound(giftId)
    setGiftSound(giftId, sound)

    // Leaderboard
    getTopGifters(limit)
    updateGifter(username, coins)

    // Events (History)
    logEvent(eventType, data)
    getEvents(filter, limit)
}
```

**Optimierungen:**
```javascript
// WAL-Mode aktivieren
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Prepared Statements
const stmt = db.prepare('INSERT INTO events (type, data) VALUES (?, ?)');
stmt.run(eventType, JSON.stringify(data));
```

### 3. modules/tiktok.js (TikTok-Connector)

**Zweck:** Integration mit TikTok LIVE API

**Library:** `tiktok-live-connector` (v2.1.0)

**Events:**
- `connected` - Verbindung erfolgreich
- `disconnected` - Verbindung getrennt
- `gift` - Geschenk erhalten
- `chat` - Chat-Nachricht
- `follow` - Neuer Follower
- `share` - Stream geteilt
- `like` - Likes erhalten
- `subscribe` - Neuer Subscriber
- `roomUser` - User betritt/verlässt Stream
- `streamEnd` - Stream beendet

**Code-Beispiel:**
```javascript
const { WebcastPushConnection } = require('tiktok-live-connector');

class TikTokConnector {
    async connect(username) {
        this.connection = new WebcastPushConnection(username, {
            processInitialData: true,
            enableExtendedGiftInfo: true,
            requestPollingIntervalMs: 1000
        });

        this.connection.on('gift', (data) => {
            this.emit('gift', {
                username: data.uniqueId,
                giftName: data.giftName,
                giftId: data.giftId,
                coins: data.diamondCount,
                count: data.repeatCount,
                profilePictureUrl: data.profilePictureUrl
            });
        });

        await this.connection.connect();
    }
}
```

### 4. modules/flows.js (Flow-Engine)

**Zweck:** Event-Automation ("Wenn-Dann"-Regeln)

**Ablauf:**
1. TikTok-Event empfangen
2. Alle aktivierten Flows prüfen
3. Trigger-Condition evaluieren
4. Bei Match: Actions sequenziell ausführen
5. Logging in `user_data/flow_logs/`

**Condition-Evaluierung:**
```javascript
evaluateCondition(event, condition) {
    const { operator, field, value } = condition;
    const eventValue = event[field];

    switch (operator) {
        case '==': return eventValue == value;
        case '!=': return eventValue != value;
        case '>': return eventValue > value;
        case '>=': return eventValue >= value;
        case '<': return eventValue < value;
        case '<=': return eventValue <= value;
        case 'contains': return String(eventValue).includes(value);
        case 'startsWith': return String(eventValue).startsWith(value);
        case 'endsWith': return String(eventValue).endsWith(value);
        default: return false;
    }
}
```

**Action-Ausführung:**
```javascript
async executeActions(actions, eventData) {
    for (const action of actions) {
        try {
            await this.executeAction(action, eventData);
        } catch (err) {
            logger.error(`Flow action failed: ${err.message}`);
        }
    }
}

async executeAction(action, eventData) {
    switch (action.type) {
        case 'tts':
            const text = this.replacePlaceholders(action.text, eventData);
            await ttsPlugin.speak(text, action.voice);
            break;
        case 'alert':
            const alertText = this.replacePlaceholders(action.text, eventData);
            io.emit('alert:new', { text: alertText, sound: action.sound });
            break;
        case 'obs_scene':
            await obsWebSocket.setScene(action.scene_name);
            break;
        case 'osc_vrchat_wave':
            await oscBridge.sendVRChatWave(action.duration);
            break;
        // ... weitere Actions
    }
}
```

### 5. modules/plugin-loader.js (Plugin-System)

**Zweck:** Dynamisches Laden und Verwalten von Plugins

**Ablauf:**
1. Scanne `plugins/`-Verzeichnis
2. Lade `plugin.json` für Metadata
3. Prüfe `enabled`-Status
4. Instanziiere Plugin-Klasse
5. Rufe `init()` auf
6. Registriere Routes, Socket.io-Events, TikTok-Events

**Plugin-API:**
```javascript
class PluginAPI {
    constructor(pluginId, pluginDir, app, io, db, logger, pluginLoader) {
        this.pluginId = pluginId;
        this.pluginDir = pluginDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;

        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
    }

    registerRoute(method, path, handler) {
        const fullPath = `/api/plugins/${this.pluginId}${path}`;
        this.app[method.toLowerCase()](fullPath, handler);
        this.registeredRoutes.push({ method, path: fullPath });
    }

    registerSocket(event, callback) {
        this.registeredSocketEvents.push({ event, callback });
    }

    registerTikTokEvent(event, callback) {
        this.registeredTikTokEvents.push({ event, callback });
    }

    getConfig(key) {
        return this.db.getSetting(`plugin:${this.pluginId}:${key}`);
    }

    setConfig(key, value) {
        this.db.setSetting(`plugin:${this.pluginId}:${key}`, value);
    }

    emit(event, data) {
        this.io.emit(event, data);
    }

    log(message, level = 'info') {
        this.logger[level](`[Plugin:${this.pluginId}] ${message}`);
    }
}
```

Weitere Details: [[Plugin-Dokumentation]]

---

## 🎨 Frontend-Komponenten

### 1. Dashboard (public/dashboard.html)

**Framework:** Bootstrap 5

**Aufbau:**
- Header: Logo, Connection-Status, TikTok-Username
- Sidebar: Navigation (Dashboard, Settings, Flows, Plugins, etc.)
- Main: Content-Area (dynamisch geladen)
- Footer: Version, Links

**JavaScript:** `public/js/dashboard.js`

**Socket.io-Integration:**
```javascript
const socket = io();

socket.on('tiktok:connected', (data) => {
    updateConnectionStatus('Connected', data.username);
});

socket.on('tiktok:gift', (data) => {
    addEventToLog(`🎁 ${data.username} sent ${data.giftName} x${data.count}`);
});

socket.on('alert:new', (data) => {
    showAlert(data.text, data.sound, data.duration);
});
```

### 2. OBS-Overlay (public/overlay.html)

**Zweck:** Transparentes Full-HD-Overlay für OBS Studio

**Features:**
- Alert-Anzeige (Gift, Follow, Subscribe)
- Goal Progress Bars
- HUD-Elemente (Viewer-Count, Like-Count)
- Leaderboard
- Transparenter Hintergrund

**CSS:**
```css
body {
    background-color: transparent;
    margin: 0;
    overflow: hidden;
}

.alert-container {
    position: fixed;
    top: 50%;
    right: 50px;
    transform: translateY(-50%);
    z-index: 1000;
}
```

**JavaScript:**
```javascript
socket.on('alert:new', (data) => {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    alertDiv.innerHTML = `
        <img src="${data.image}" alt="Alert">
        <p>${data.text}</p>
    `;

    document.querySelector('.alert-container').appendChild(alertDiv);

    if (data.sound) {
        const audio = new Audio(data.sound);
        audio.play();
    }

    setTimeout(() => {
        alertDiv.remove();
    }, data.duration);
});
```

### 3. Plugin-Manager (public/js/plugin-manager.js)

**Zweck:** Plugin-Verwaltung via Web-UI

**Features:**
- Plugin-Liste mit Status (enabled/disabled)
- Plugin aktivieren/deaktivieren
- Plugin hochladen (ZIP)
- Plugin löschen
- Plugin-Konfiguration bearbeiten

**UI-Komponenten:**
```html
<div class="plugin-card">
    <h3>{{ plugin.name }}</h3>
    <p>{{ plugin.description }}</p>
    <p>Version: {{ plugin.version }}</p>
    <button onclick="togglePlugin('{{ plugin.id }}')">
        {{ plugin.enabled ? 'Disable' : 'Enable' }}
    </button>
    <button onclick="deletePlugin('{{ plugin.id }}')">Delete</button>
</div>
```

---

## 🔌 Plugin-System

Siehe [[Plugin-Dokumentation]] für vollständige Details.

**Kurz-Übersicht:**

```
plugins/<plugin-id>/
├── plugin.json       # Metadata (id, name, version, entry, enabled)
├── main.js           # Plugin-Klasse mit init() und destroy()
├── ui.html           # Optional: Admin-UI
└── assets/           # Optional: CSS, JS, Images
```

**Plugin-Lifecycle:**
1. `constructor(api)` - Instanziierung
2. `init()` - Initialisierung (Routes, Events registrieren)
3. `destroy()` - Cleanup (beim Deaktivieren/Neuladen)

---

## 🔄 Datenfluss

### TikTok-Event-Flow

```
TikTok LIVE
    │
    ▼
tiktok-live-connector (NPM-Library)
    │
    ▼
modules/tiktok.js (Event-Parsing)
    │
    ▼
server.js (Event-Bus)
    │
    ├─► modules/flows.js (Flow-Engine)
    ├─► modules/alerts.js (Alert-Manager)
    ├─► modules/goals.js (Goal-Manager)
    ├─► modules/leaderboard.js (Leaderboard)
    ├─► plugins/*/main.js (Plugin-Callbacks)
    │
    ▼
Socket.io Broadcast
    │
    ▼
Frontend-Clients (Dashboard, Overlay)
```

### REST-API-Request-Flow

```
HTTP Request (Client)
    │
    ▼
Express Middleware (CORS, Rate-Limiting, Body-Parser)
    │
    ▼
Route-Handler (app.get/post/put/delete)
    │
    ▼
Validation (modules/validators.js)
    │
    ▼
Business Logic (modules/*.js)
    │
    ▼
Database (modules/database.js)
    │
    ▼
Response (JSON)
```

---

## 🗄️ Datenbank-Schema

### SQLite-Datenbank

**Datei:** `user_configs/<profile>/database.db`

**WAL-Mode:** Aktiviert für bessere Performance

**Tabellen:**

#### settings
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

#### alert_configs
```sql
CREATE TABLE alert_configs (
    event_type TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    text_template TEXT,
    sound_file TEXT,
    duration INTEGER DEFAULT 5000,
    image_url TEXT,
    animation_type TEXT
);
```

#### flows
```sql
CREATE TABLE flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    trigger_condition TEXT,
    actions TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);
```

#### gift_sounds
```sql
CREATE TABLE gift_sounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id INTEGER UNIQUE,
    label TEXT,
    mp3_url TEXT,
    volume REAL DEFAULT 1.0,
    animation_url TEXT,
    animation_type TEXT
);
```

#### user_voices
```sql
CREATE TABLE user_voices (
    username TEXT PRIMARY KEY,
    voice_id TEXT NOT NULL
);
```

#### top_gifters
```sql
CREATE TABLE top_gifters (
    username TEXT PRIMARY KEY,
    total_coins INTEGER DEFAULT 0,
    gift_count INTEGER DEFAULT 0,
    last_gift_at INTEGER,
    profile_picture_url TEXT
);
```

#### events (History)
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    username TEXT,
    data TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);
```

---

## 🌐 Externe Integrationen

### 1. TikTok LIVE API

**Library:** `tiktok-live-connector` (v2.1.0)

**Protokoll:** WebSocket (via TikTok WebCast)

**Authentication:** Keine (öffentliche LIVE-Streams)

**Endpoint:** `wss://webcast.tiktok.com/webcast/im/fetch/`

**Rate-Limits:** Polling-Interval 1000ms

### 2. OBS Studio (WebSocket v5)

**Library:** `obs-websocket-js` (v5.0.6)

**Protokoll:** WebSocket

**Port:** 4455 (Standard)

**Authentication:** Optional (Password)

**Capabilities:**
- Szenen wechseln
- Sources ein/ausblenden
- Filter togglen
- Szenen/Sources abrufen
- Streaming starten/stoppen

**Code-Beispiel:**
```javascript
const OBSWebSocket = require('obs-websocket-js').default;
const obs = new OBSWebSocket();

await obs.connect('ws://localhost:4455', 'password');
await obs.call('SetCurrentProgramScene', { sceneName: 'Cam2' });
```

### 3. VRChat (OSC-Protokoll)

**Library:** `osc` (v2.4.5)

**Protokoll:** UDP OSC (Open Sound Control)

**Ports:**
- Send: 9000
- Receive: 9001

**Standard-Parameter:**
- `/avatar/parameters/Wave`
- `/avatar/parameters/Celebrate`
- `/avatar/parameters/DanceTrigger`
- `/avatar/parameters/Hearts`
- `/avatar/parameters/Confetti`

**Code-Beispiel:**
```javascript
const osc = require('osc');

const udpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: 9001,
    remoteAddress: '127.0.0.1',
    remotePort: 9000
});

udpPort.send({
    address: '/avatar/parameters/Wave',
    args: [{ type: 'i', value: 1 }]
});
```

### 4. MyInstants (Sound-Library)

**API:** Scraping (cheerio)

**Endpoint:** `https://www.myinstants.com/`

**Features:**
- 100.000+ Sounds
- Search-API
- Trending/Popular
- Direct MP3-URLs

---

## ⚡ Performance & Skalierung

### Optimierungen

**1. SQLite WAL-Mode:**
```javascript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```
- Concurrent Reads während Writes
- Bessere Performance

**2. Batch-Writes:**
```javascript
const transaction = db.transaction((events) => {
    const stmt = db.prepare('INSERT INTO events (type, data) VALUES (?, ?)');
    events.forEach(event => stmt.run(event.type, event.data));
});
transaction(events);
```

**3. Socket.io-Rooms:**
```javascript
socket.join('goal:likes');
io.to('goal:likes').emit('goal:update', data);
```
- Broadcast nur an interessierte Clients

**4. Virtual Scrolling (Frontend):**
```javascript
// public/js/virtual-scroller.js
// Rendert nur sichtbare Elemente
```

**5. IndexedDB-Caching (Frontend):**
```javascript
// public/js/indexeddb-cache.js
// Cache für Gift-Katalog, Sounds
```

### Skalierungs-Limits

| Komponente | Limit | Grund |
|------------|-------|-------|
| Concurrent Users | ~100 | Socket.io (Single-Thread) |
| Events/Second | ~500 | TikTok API Polling-Interval |
| Database Size | ~1 GB | SQLite (empfohlen) |
| Plugin Count | ~20 | Overhead pro Plugin |

---

## 🔗 Weitere Informationen

- **[[Plugin-Dokumentation]]** - Plugin-System im Detail
- **[[API-Reference]]** - REST-API und WebSocket-Events
- **[[Entwickler-Leitfaden]]** - Code-Standards und Contribution

---

[← Konfiguration](Konfiguration) | [→ Entwickler-Leitfaden](Entwickler-Leitfaden)

---

*Letzte Aktualisierung: 2025-11-11*
