# ⚡ HybridShock Integration Plugin

Bidirektionale Bridge zwischen TikTok Live Events und der HybridShock API. Ermöglicht das Triggern von HybridShock Actions durch TikTok Live Events mit flexiblem Mapping-System, Action-Queue, Rate-Limiting und erweiterten Debugging-Tools.

## 📋 Features

### ✅ Phase 1 (Kritisch) - Vollständig implementiert

- **WebSocket-Client** - Stabile WebSocket-Verbindung zu HybridShock (Port 8833)
  - Native Node.js `ws` Package
  - Auto-Reconnect mit exponential backoff
  - Connection-Health-Monitoring mit Heartbeat/Ping-Pong
  - Event-basierte Architektur mit EventEmitter-Pattern
  - Comprehensive Error-Handling für alle WebSocket-States

- **HTTP-Client** - REST-API Integration (Port 8832)
  - `GET /api/app/info` - Verbindungsprüfung und Version-Check
  - `GET /api/features/categories` - Verfügbare Kategorien laden
  - `GET /api/features/actions` - Verfügbare Actions laden
  - `GET /api/features/events` - Verfügbare Events laden
  - `POST /api/send/{category}/{action}` - Actions triggern mit Context-Objekt
  - CORS-Handling und Error-Response-Verarbeitung
  - Retry-Logic mit Axios Interceptors

- **Event-Mapping-System** - Flexibles Mapping zwischen TikTok Events und HybridShock Actions
  - Unterstützte TikTok Events: `gift`, `chat`, `follow`, `share`, `like`, `subscribe`
  - 1:N Mapping (ein Event kann mehrere Actions triggern)
  - Conditional Triggers mit erweiterten Bedingungen:
    - Gift-Filter (Gift-Name, Min/Max-Coins)
    - User-Filter (Username-Whitelist/Blacklist)
    - Chat-Filter (Message-Contains, Regex-Matching)
    - Custom JavaScript-Expressions
  - Delay-Support (verzögertes Triggern)
  - Cooldown-System (verhindert Spam)
  - Priority-basierte Verarbeitung

- **Action-Queue-System** - Priority-Queue mit Rate-Limiting
  - Konfigurierbare Rate-Limits (max X Actions pro Sekunde)
  - Priority-Queue (wichtige Actions bevorzugen)
  - Retry-Logic mit exponential backoff (max 3 Retries)
  - Dead-Letter-Queue für dauerhaft fehlgeschlagene Actions
  - Queue-Statistiken (Durchschnittliche Verarbeitungszeit, Success-Rate, etc.)
  - Manuelles Queue-Management (Clear, Remove, Requeue)

- **Context-Builder** - Template-System für Context-Objects
  - Platzhalter-System: `{username}`, `{giftName}`, `{coins}`, `{message}`, etc.
  - JavaScript-Expressions: `${ coins * 2 }`, `${ Math.random() }`, etc.
  - Nested Objects und Arrays
  - Type-Conversion (String → Number/Boolean)
  - Default-Values für fehlende Daten
  - Template-Validierung

- **Settings-UI** - Vollständiges Admin-Panel
  - Connection-Settings (HTTP/WebSocket Hosts & Ports)
  - Queue-Settings (Rate-Limits, Max-Retries, Queue-Size)
  - Advanced-Settings (Auto-Connect, Auto-Reconnect, Debug-Mode)
  - Connection-Status-Indicator (Connected, Disconnected, Connecting)
  - Test-Connection Button mit Feedback

### ✅ Phase 2 (Wichtig) - Vollständig implementiert

- **Mapping-UI** - Visual Mapping-Editor
  - Create, Edit, Delete, Enable/Disable Mappings
  - Mapping-Cards mit Übersicht (Event-Type, Action, Delay, Cooldown, Priority)
  - Modal-basierter Editor
  - Export/Import Mappings als JSON

- **Debugging-Tools**
  - Event-Log (TikTok Events mit Timestamp und Daten)
  - Action-Log (HybridShock Actions mit Status, Processing-Time, Errors)
  - Manual Action-Trigger (Test-Funktion ohne TikTok Event)
  - HybridShock Features-Inspector (Categories, Actions, Events anzeigen)

- **Statistics-Dashboard**
  - TikTok Events Received
  - Actions Triggered
  - Success Rate (Success vs. Failed)
  - Plugin Uptime
  - Event Breakdown (nach Event-Type)
  - Action Breakdown (nach Category/Action/Status)

- **Queue-Monitor**
  - Live Queue-Size
  - Current Rate (Actions/Second)
  - Processing-Status
  - Average Processing-Time
  - Dead-Letter-Queue Anzeige

### 🚀 Phase 3 (Nice-to-Have) - Teilweise implementiert

- **Import/Export** - ✅ Mappings Export/Import als JSON
- **Template-System** - ✅ Context-Builder mit Platzhaltern
- **Advanced UI** - ✅ Tab-basiertes Interface mit Real-time Updates

## 🏗️ Architektur

```
HybridShock Plugin
├── main.js                      # Plugin-Hauptklasse
├── utils/
│   ├── hybridshock-client.js    # WebSocket + HTTP Client
│   ├── mapping-manager.js       # Event-Mapping-Verwaltung
│   ├── action-queue.js          # Priority-Queue mit Rate-Limiting
│   └── context-builder.js       # Template-basierte Context-Erstellung
├── ui.html                      # Admin-Panel UI
├── plugin.json                  # Plugin-Manifest
└── README.md                    # Diese Datei
```

### Datenbank-Schema

**hybridshock_mappings** - Event-Mapping-Konfigurationen
```sql
- id (INTEGER PRIMARY KEY)
- enabled (INTEGER)
- name (TEXT) - z.B. "Rose Gift to Hello Message"
- description (TEXT)
- tiktok_event_type (TEXT) - gift, chat, follow, etc.
- hybridshock_category (TEXT) - z.B. "shock", "message"
- hybridshock_action (TEXT) - z.B. "pulse", "hello"
- context_template (TEXT JSON) - Template für Context-Object
- conditions (TEXT JSON) - IF-Bedingungen
- delay (INTEGER) - Millisekunden
- cooldown (INTEGER) - Millisekunden
- priority (INTEGER)
- created_at, updated_at (DATETIME)
```

**hybridshock_event_log** - Event-Historie
```sql
- id (INTEGER PRIMARY KEY)
- event_type (TEXT)
- event_source (TEXT) - "tiktok" oder "hybridshock"
- event_data (TEXT JSON)
- triggered_actions (INTEGER)
- timestamp (DATETIME)
```

**hybridshock_action_log** - Action-Historie
```sql
- id (INTEGER PRIMARY KEY)
- mapping_id (INTEGER)
- category (TEXT)
- action (TEXT)
- context (TEXT JSON)
- status (TEXT) - "success", "failed", "retrying"
- error_message (TEXT)
- processing_time (INTEGER)
- timestamp (DATETIME)
```

## 📦 Installation

1. Plugin ist bereits im Verzeichnis `/plugins/hybridshock/` installiert
2. Plugin wird automatisch beim Server-Start geladen
3. Admin-UI verfügbar unter: `http://localhost:3000/hybridshock/ui`

## ⚙️ Konfiguration

### Connection-Settings

```javascript
{
  "httpHost": "127.0.0.1",      // HybridShock HTTP-Server Host
  "httpPort": 8832,              // HybridShock HTTP-Server Port
  "wsHost": "127.0.0.1",         // HybridShock WebSocket Host
  "wsPort": 8833,                // HybridShock WebSocket Port
  "autoConnect": false,          // Automatisch verbinden beim Plugin-Start
  "autoReconnect": true,         // Automatisch reconnecten bei Verbindungsabbruch
  "reconnectInterval": 5000,     // Initial Reconnect-Delay (ms)
  "heartbeatInterval": 30000     // Heartbeat-Intervall (ms)
}
```

### WebSocket Communication-Settings (NEU!)

```javascript
{
  "preferWebSocket": false,           // true = WebSocket für Features (statt HTTP)
  "useWebSocketForActions": false     // true = Actions über WebSocket senden (statt HTTP POST)
}
```

**Vorteile von WebSocket:**
- ✅ Geringere Latenz (keine HTTP-Overhead)
- ✅ Bidirektionale Kommunikation
- ✅ Server kann Features pushen (statt Pull via HTTP)
- ✅ Echtzeit-Updates für Categories/Actions/Events

### Queue-Settings

```javascript
{
  "maxActionsPerSecond": 10,     // Max Actions pro Sekunde (Rate-Limit)
  "maxQueueSize": 1000,          // Maximale Queue-Größe
  "maxRetries": 3,               // Maximale Retry-Versuche
  "retryDelay": 1000             // Initial Retry-Delay (ms)
}
```

### Feature-Flags

```javascript
{
  "enableEventLog": true,        // TikTok Events loggen
  "enableActionLog": true,       // HybridShock Actions loggen
  "enableStats": true,           // Statistiken sammeln
  "enableDebugMode": false,      // Verbose Logging aktivieren
  "maxEventLogEntries": 10000,   // Max Einträge im Event-Log
  "maxActionLogEntries": 10000,  // Max Einträge im Action-Log
  "logRetentionDays": 30         // Log-Retention (Tage)
}
```

## 🌐 WebSocket-Kommunikation (NEU!)

### WebSocket-Request/Response-Pattern

Das Plugin unterstützt **bidirektionale WebSocket-Kommunikation** mit Request/Response-Pattern:

#### **Client → Server Requests:**

```javascript
// Events abrufen
ws.send(JSON.stringify({
    type: 'getEvents',
    requestId: 'req_123'
}));

// Categories abrufen
ws.send(JSON.stringify({
    type: 'getCategories',
    requestId: 'req_124'
}));

// Actions abrufen
ws.send(JSON.stringify({
    type: 'getActions',
    requestId: 'req_125'
}));

// Action senden
ws.send(JSON.stringify({
    type: 'sendAction',
    category: 'shock',
    action: 'pulse',
    context: { intensity: 50 },
    requestId: 'req_126'
}));
```

#### **Server → Client Responses:**

```javascript
// Response mit Request-ID
{
    requestId: 'req_123',
    data: [...events...]
}

// Error-Response
{
    requestId: 'req_123',
    error: 'Failed to get events'
}
```

#### **Server → Client Push-Events:**

Der HybridShock-Server kann auch **unaufgefordert** Events pushen:

```javascript
// Categories Update (wenn sich Categories ändern)
{
    type: 'categories',
    categories: [...]
}

// Actions Update (wenn sich Actions ändern)
{
    type: 'actions',
    actions: [...]
}

// Events Update (wenn sich Events ändern)
{
    type: 'events',
    events: [...]
}

// Combined Features Update
{
    type: 'features',
    categories: [...],
    actions: [...],
    events: [...]
}

// HybridShock Event (z.B. shock:completed)
{
    type: 'event',
    data: {
        eventType: 'shock:completed',
        timestamp: 1234567890
    }
}
```

### Vorteile des WebSocket-Ansatzes

✅ **Geringere Latenz** - Keine HTTP-Request-Overhead
✅ **Push-Notifications** - Server kann Updates pushen statt Polling
✅ **Bidirektional** - Beide Richtungen gleichzeitig
✅ **Echtzeit** - Sofortige Updates bei Änderungen
✅ **Effizienter** - Weniger Netzwerk-Traffic

---

## 🔗 API-Referenz

### HTTP-Endpunkte

#### Status & Control

- `GET /api/hybridshock/status` - Plugin-Status abrufen
- `GET /api/hybridshock/config` - Konfiguration abrufen
- `POST /api/hybridshock/config` - Konfiguration aktualisieren
- `POST /api/hybridshock/start` - Plugin starten (HybridShock-Verbindung herstellen)
- `POST /api/hybridshock/stop` - Plugin stoppen
- `POST /api/hybridshock/restart` - Plugin neu starten
- `GET /api/hybridshock/test` - Connection-Test durchführen

#### HybridShock Features

- `GET /api/hybridshock/features` - Categories, Actions, Events von HybridShock laden

#### Mappings

- `GET /api/hybridshock/mappings` - Alle Mappings abrufen
- `POST /api/hybridshock/mappings` - Mapping erstellen
- `PUT /api/hybridshock/mappings/:id` - Mapping aktualisieren
- `DELETE /api/hybridshock/mappings/:id` - Mapping löschen
- `GET /api/hybridshock/mappings/export` - Mappings exportieren (JSON)
- `POST /api/hybridshock/mappings/import` - Mappings importieren

#### Actions & Logs

- `POST /api/hybridshock/action/trigger` - Action manuell triggern (Test)
- `GET /api/hybridshock/logs/events?limit=100` - Event-Log abrufen
- `GET /api/hybridshock/logs/actions?limit=100` - Action-Log abrufen
- `GET /api/hybridshock/statistics` - Statistiken abrufen

### Socket.IO Events

#### Client → Server

- `hybridshock:get-status` - Status abrufen
- `hybridshock:start` - Plugin starten
- `hybridshock:stop` - Plugin stoppen

#### Server → Client

- `hybridshock:status` - Status-Update (alle 2 Sekunden)
- `hybridshock:queue-status` - Queue-Status-Update
- `hybridshock:tiktok-event` - TikTok Event empfangen
- `hybridshock:event` - HybridShock Event empfangen
- `hybridshock:started` - Plugin gestartet
- `hybridshock:stopped` - Plugin gestoppt
- `hybridshock:error` - Fehler aufgetreten

## 📚 Beispiele

### Beispiel 1: Rose-Gift → HybridShock "hello" Message

**Mapping-Konfiguration:**
```json
{
  "name": "Rose Gift to Hello Message",
  "description": "Trigger 'hello' message when user sends Rose gift",
  "tiktokEventType": "gift",
  "hybridshockCategory": "message",
  "hybridshockAction": "hello",
  "contextTemplate": {
    "username": "{username}",
    "giftName": "{giftName}",
    "count": "{repeatCount}"
  },
  "conditions": {
    "giftNames": ["Rose"]
  },
  "delay": 0,
  "cooldown": 5000,
  "priority": 1,
  "enabled": true
}
```

**Ergebnis:**
- User sendet Rose-Gift → HybridShock Action `message/hello` wird getriggert
- Context: `{"username": "user123", "giftName": "Rose", "count": 10}`
- Cooldown: 5 Sekunden (keine weiteren Roses in dieser Zeit)

### Beispiel 2: High-Value Gift → HybridShock Shock mit Intensität

**Mapping-Konfiguration:**
```json
{
  "name": "High Value Gift to Shock",
  "description": "Trigger shock based on gift value",
  "tiktokEventType": "gift",
  "hybridshockCategory": "shock",
  "hybridshockAction": "pulse",
  "contextTemplate": {
    "intensity": "${Math.min(coins / 100, 100)}",
    "duration": 500,
    "username": "{username}"
  },
  "conditions": {
    "minCoins": 1000
  },
  "delay": 0,
  "cooldown": 10000,
  "priority": 5,
  "enabled": true
}
```

**Ergebnis:**
- Gift mit >= 1000 Coins → Shock Action mit berechneter Intensität
- Intensität = `min(coins / 100, 100)` (z.B. 5000 Coins = 50% Intensität)
- Cooldown: 10 Sekunden
- Höhere Priority (5) = wird vor niedrigeren Priorities verarbeitet

### Beispiel 3: Chat-Command → Custom HybridShock Action

**Mapping-Konfiguration:**
```json
{
  "name": "Chat Command !shock",
  "description": "Trigger shock when user writes !shock in chat",
  "tiktokEventType": "chat",
  "hybridshockCategory": "shock",
  "hybridshockAction": "continuous",
  "contextTemplate": {
    "duration": 3000,
    "intensity": 50,
    "triggeredBy": "{username}"
  },
  "conditions": {
    "messageContains": "!shock"
  },
  "delay": 500,
  "cooldown": 30000,
  "priority": 3,
  "enabled": true
}
```

**Ergebnis:**
- Chat-Message "!shock" → HybridShock continuous shock (3 Sekunden, 50% Intensität)
- 500ms Delay vor Execution
- Cooldown: 30 Sekunden

### Beispiel 4: Follow → Achievement-Message

**Mapping-Konfiguration:**
```json
{
  "name": "New Follower Achievement",
  "description": "Show achievement message on new follower",
  "tiktokEventType": "follow",
  "hybridshockCategory": "notification",
  "hybridshockAction": "show",
  "contextTemplate": {
    "title": "New Follower!",
    "message": "{nickname} (@{username}) just followed!",
    "icon": "🎉",
    "duration": 5000
  },
  "conditions": null,
  "delay": 0,
  "cooldown": 0,
  "priority": 0,
  "enabled": true
}
```

## 🔧 Template-System (Context-Builder)

### Verfügbare Platzhalter

#### User-Daten
- `{username}` - TikTok username (unique ID)
- `{nickname}` - Display name
- `{userId}` - User ID
- `{profilePicture}` - Profile picture URL

#### Gift-Daten
- `{giftName}` - Gift name (z.B. "Rose", "Lion")
- `{giftId}` - Gift ID
- `{giftPicture}` - Gift image URL
- `{repeatCount}` - Anzahl Gifts in Streak
- `{diamondCount}` - Diamonds pro Gift
- `{coins}` - Total coins value (diamondCount * 2 * repeatCount)
- `{totalCoins}` - Total coins in dieser Session

#### Chat-Daten
- `{message}` - Chat message text
- `{isModerator}` - Is user a moderator (boolean)
- `{isSubscriber}` - Is user a subscriber (boolean)

#### Like/Share/Follow-Daten
- `{likeCount}` - Anzahl Likes in diesem Event
- `{totalLikes}` - Total likes im Stream
- `{followCount}` - Follow count
- `{shareCount}` - Share count

#### System-Daten
- `{timestamp}` - Current timestamp (milliseconds)
- `{timestampISO}` - Current timestamp (ISO string)
- `{random}` - Random number (0-1)
- `{randomInt}` - Random integer (0-99)

### JavaScript-Expressions

Format: `${ expression }`

**Verfügbare Variablen:**
- Alle Event-Daten (username, coins, message, etc.)
- `Math` - Math-Funktionen
- `Date` - Date-Objekt
- `JSON` - JSON-Funktionen
- `String`, `Number`, `Boolean` - Type-Conversions

**Beispiele:**
```javascript
// Coins verdoppeln
"intensity": "${ coins * 2 }"

// Random zwischen 1 und 100
"value": "${ Math.floor(Math.random() * 100) + 1 }"

// Konditionaler Wert
"duration": "${ coins > 1000 ? 5000 : 2000 }"

// String-Manipulation
"message": "${ username.toUpperCase() } sent a gift!"

// Mathematische Berechnungen
"intensity": "${ Math.min(Math.max(coins / 100, 10), 100) }"
```

## 🎯 Use-Cases

1. **Interactive Streaming**
   - Gifts triggern physische Effekte (Shock, Vibration, etc.)
   - Chat-Commands steuern Hardware
   - Viewer-Engagement durch direkte Interaktion

2. **Gamification**
   - Achievement-System (X Gifts → Special Action)
   - Milestone-Rewards (100 Follower → Special Effect)
   - Leaderboard-Triggering

3. **Content-Creation**
   - Automatische OBS Scene-Switches bei Events
   - Sound-Effects bei Gifts
   - Visual-Effects synchronisiert mit TikTok Events

4. **Community-Engagement**
   - VIP-Actions für bestimmte User
   - Custom-Actions für Subscribers/Moderators
   - Chat-driven Interactive Experiences

## 🐛 Troubleshooting

### Plugin verbindet nicht zu HybridShock

**Lösung:**
1. Prüfe ob HybridShock läuft (`http://localhost:8832/api/app/info`)
2. Prüfe Firewall-Einstellungen (Ports 8832, 8833)
3. Prüfe Connection-Settings im Admin-Panel
4. Klicke "Test Connection" für detailliertes Feedback
5. Aktiviere Debug-Mode für verbose Logging

### Actions werden nicht getriggert

**Lösung:**
1. Prüfe ob Mapping enabled ist
2. Prüfe Mapping-Conditions (Gift-Name, Min-Coins, etc.)
3. Prüfe Cooldown-Status (eventuell noch aktiv)
4. Checke Event-Log ob TikTok Events empfangen werden
5. Checke Action-Log für Error-Messages

### Queue läuft voll

**Lösung:**
1. Erhöhe `maxActionsPerSecond` in Settings
2. Erhöhe `maxQueueSize` (Achtung: Memory!)
3. Reduziere Anzahl Mappings
4. Füge Cooldowns zu Mappings hinzu
5. Prüfe Dead-Letter-Queue für dauerhaft fehlgeschlagene Actions

### WebSocket disconnected häufig

**Lösung:**
1. Prüfe Netzwerkstabilität
2. Erhöhe `heartbeatInterval`
3. Prüfe HybridShock-Server Logs
4. Auto-Reconnect sollte automatisch reconnecten (exponential backoff)

## 📊 Performance-Tipps

1. **Rate-Limiting richtig einstellen**
   - Start: 10 Actions/Sekunde
   - Bei Performance-Problemen: reduzieren auf 5
   - Bei starker Hardware: erhöhen auf 20-50

2. **Cooldowns nutzen**
   - Verhindert Spam bei populären Gifts
   - Empfohlen: 5-10 Sekunden für häufige Events

3. **Priority-System nutzen**
   - Wichtige Actions (z.B. High-Value Gifts): Priority 5-10
   - Standard-Actions: Priority 0-3
   - Low-Priority (z.B. Likes): Priority -5

4. **Conditions optimal setzen**
   - Filtern statt alle Events verarbeiten
   - `minCoins` für Gift-Filter nutzen
   - User-Whitelists für VIP-Actions

5. **Log-Retention**
   - Bei wenig Speicher: `maxEventLogEntries: 1000`
   - Standard: `maxEventLogEntries: 10000`
   - Logs werden automatisch rotiert

## 🔐 Security

- **Input-Validation**: Alle User-Inputs werden validiert
- **SQL-Injection-Schutz**: Prepared Statements in allen DB-Queries
- **XSS-Schutz**: Context-Data wird sanitized vor dem Senden
- **Rate-Limiting**: Verhindert API-Overload
- **Error-Handling**: Sensitive Daten werden nicht in Logs/Errors angezeigt

## 📝 Changelog

### Version 1.0.0 (2025-01-14)
- ✅ Initial Release
- ✅ WebSocket + HTTP Client Implementation
- ✅ Event-Mapping-System mit Conditions
- ✅ Action-Queue mit Rate-Limiting & Retry-Logic
- ✅ Context-Builder mit Template-System
- ✅ Vollständiges Admin-UI
- ✅ Event & Action Logging
- ✅ Statistics-Dashboard
- ✅ Debug-Tools
- ✅ Import/Export Mappings

## 🤝 Support

Bei Fragen oder Problemen:
1. Checke diese README
2. Aktiviere Debug-Mode für detaillierte Logs
3. Checke Event/Action-Logs im Admin-Panel
4. Erstelle Issue im GitHub-Repository

## 📜 License

CC BY-NC 4.0 License - siehe LICENSE-Datei

---

**Entwickelt für pupcidslittletiktokhelper**
**HybridShock Integration Plugin v1.0.0**
