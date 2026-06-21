# API-Reference

[← Plugin-Dokumentation](Plugin-Dokumentation) | [→ FAQ & Troubleshooting](FAQ-&-Troubleshooting)

---

## 📑 Inhaltsverzeichnis

1. [Base URL](#base-url)
2. [REST-API-Endpunkte](#rest-api-endpunkte)
   - [TikTok-Verbindung](#tiktok-verbindung)
   - [Settings](#settings)
   - [Profile](#profile)
   - [Flows](#flows)
   - [Alerts](#alerts)
   - [Goals](#goals)
   - [OBS-Integration](#obs-integration)
   - [Gift-Katalog](#gift-katalog)
   - [Leaderboard](#leaderboard)
   - [Update-System](#update-system)
   - [Plugin-Manager](#plugin-manager)
3. [WebSocket-Events (Socket.io)](#websocket-events-socketio)
   - [Core-Events](#core-events)
   - [Plugin-Events](#plugin-events)
4. [Swagger-Dokumentation](#swagger-dokumentation)
5. [Fehler-Codes](#fehler-codes)

---

## 🌐 Base URL

**Lokal:** `http://localhost:3000`

**LAN-Zugriff:** `http://<your-ip>:3000` (z.B. `http://192.168.1.100:3000`)

---

## 🔌 REST-API-Endpunkte

### TikTok-Verbindung

#### POST /api/connect

Verbindet mit TikTok LIVE.

**Request Body:**
```json
{
  "username": "example_user"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Connecting to @example_user...",
  "username": "example_user"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "User is not live or username is invalid"
}
```

---

#### POST /api/disconnect

Trennt TikTok LIVE-Verbindung.

**Request Body:** Keiner

**Response:**
```json
{
  "success": true,
  "message": "Disconnected from TikTok LIVE"
}
```

---

#### GET /api/status

Abrufen des Verbindungsstatus.

**Response:**
```json
{
  "success": true,
  "connected": true,
  "username": "example_user",
  "roomId": "123456789",
  "viewers": 150,
  "likes": 2500,
  "totalGifts": 42
}
```

---

### Settings

#### GET /api/settings

Alle Settings abrufen.

**Query Parameters:**
- `key` (optional) - Spezifisches Setting abrufen

**Response (alle):**
```json
{
  "success": true,
  "settings": {
    "tts_enabled": "true",
    "default_tts_voice": "en_us_001",
    "soundboard_enabled": "true"
  }
}
```

**Response (spezifisch):**
```
GET /api/settings?key=tts_enabled
```
```json
{
  "success": true,
  "key": "tts_enabled",
  "value": "true"
}
```

---

#### POST /api/settings

Setting speichern.

**Request Body:**
```json
{
  "key": "tts_enabled",
  "value": true
}
```

**Response:**
```json
{
  "success": true,
  "key": "tts_enabled",
  "value": true
}
```

---

### Profile

#### GET /api/profiles

Alle Profile abrufen.

**Response:**
```json
{
  "success": true,
  "profiles": [
    "profile1",
    "profile2",
    "profile3"
  ]
}
```

---

#### GET /api/profiles/active

Aktives Profil abrufen.

**Response:**
```json
{
  "success": true,
  "activeProfile": "profile1"
}
```

---

#### POST /api/profiles

Neues Profil erstellen.

**Request Body:**
```json
{
  "username": "new_profile"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "username": "new_profile"
}
```

---

#### POST /api/profiles/switch

Profil wechseln.

**Request Body:**
```json
{
  "username": "profile2"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Switched to profile: profile2"
}
```

**Hinweis:** Server lädt Datenbank neu.

---

#### DELETE /api/profiles/:username

Profil löschen.

**Request:**
```
DELETE /api/profiles/old_profile
```

**Response:**
```json
{
  "success": true,
  "message": "Profile deleted successfully"
}
```

---

#### POST /api/profiles/:username/backup

Backup erstellen.

**Request:**
```
POST /api/profiles/profile1/backup
```

**Response:**
```json
{
  "success": true,
  "message": "Backup created",
  "backupPath": "user_configs/backups/profile1_20251111120000.db"
}
```

---

### Flows

#### GET /api/flows

Alle Flows abrufen.

**Response:**
```json
{
  "success": true,
  "flows": [
    {
      "id": 1,
      "name": "Rose Thank You",
      "description": "Danke bei Rose-Geschenken",
      "trigger_type": "gift",
      "trigger_condition": {
        "operator": "==",
        "field": "giftName",
        "value": "Rose"
      },
      "actions": [
        {
          "type": "tts",
          "text": "Danke {username} für die Rose!",
          "voice": "en_us_001"
        }
      ],
      "enabled": 1
    }
  ]
}
```

---

#### GET /api/flows/:id

Spezifischen Flow abrufen.

**Request:**
```
GET /api/flows/1
```

**Response:**
```json
{
  "success": true,
  "flow": {
    "id": 1,
    "name": "Rose Thank You",
    ...
  }
}
```

---

#### POST /api/flows

Flow erstellen.

**Request Body:**
```json
{
  "name": "Lion Alert",
  "description": "Alert bei Lion-Gift",
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": "==",
    "field": "giftName",
    "value": "Lion"
  },
  "actions": [
    {
      "type": "alert",
      "text": "{username} sent a Lion! 🦁",
      "sound": "/sounds/lion.mp3",
      "duration": 5000
    }
  ],
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "flowId": 2,
  "message": "Flow created successfully"
}
```

---

#### PUT /api/flows/:id

Flow aktualisieren.

**Request:**
```
PUT /api/flows/1
```

**Request Body:**
```json
{
  "name": "Updated Flow Name",
  "enabled": 0
}
```

**Response:**
```json
{
  "success": true,
  "message": "Flow updated successfully"
}
```

---

#### DELETE /api/flows/:id

Flow löschen.

**Request:**
```
DELETE /api/flows/1
```

**Response:**
```json
{
  "success": true,
  "message": "Flow deleted successfully"
}
```

---

#### POST /api/flows/:id/toggle

Flow aktivieren/deaktivieren.

**Request:**
```
POST /api/flows/1/toggle
```

**Response:**
```json
{
  "success": true,
  "enabled": false
}
```

---

#### POST /api/flows/:id/test

Flow testen (simuliert Event).

**Request:**
```
POST /api/flows/1/test
```

**Request Body (optional):**
```json
{
  "username": "TestUser",
  "giftName": "Rose",
  "coins": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Flow test executed",
  "actionsExecuted": 1
}
```

---

### Alerts

#### GET /api/alerts

Alert-Configs abrufen.

**Query Parameters:**
- `eventType` (optional) - Spezifischer Event-Type

**Response:**
```json
{
  "success": true,
  "alerts": {
    "gift": {
      "enabled": true,
      "text_template": "{username} sent {giftName} x{count}",
      "sound_file": "/sounds/gift.mp3",
      "duration": 5000
    },
    "follow": {
      "enabled": true,
      "text_template": "{username} followed!",
      "sound_file": "/sounds/follow.mp3",
      "duration": 3000
    }
  }
}
```

---

#### POST /api/alerts/:eventType

Alert-Config speichern.

**Request:**
```
POST /api/alerts/gift
```

**Request Body:**
```json
{
  "enabled": true,
  "text_template": "{username} sent {giftName}!",
  "sound_file": "/sounds/gift.mp3",
  "duration": 5000,
  "image_url": "/images/gift.gif"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Alert config saved"
}
```

---

#### POST /api/alerts/test

Test-Alert senden.

**Request Body:**
```json
{
  "type": "gift",
  "username": "TestUser",
  "giftName": "Rose",
  "coins": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test alert sent"
}
```

---

### Goals

#### GET /api/goals

Alle Goals abrufen.

**Response:**
```json
{
  "success": true,
  "goals": {
    "likes": {
      "total": 500,
      "goal": 1000,
      "show": true
    },
    "followers": {
      "total": 50,
      "goal": 100,
      "show": true
    },
    "subs": {
      "total": 5,
      "goal": 20,
      "show": true
    },
    "coins": {
      "total": 250,
      "goal": 1000,
      "show": true
    }
  }
}
```

---

#### GET /api/goals/:key

Spezifisches Goal abrufen.

**Request:**
```
GET /api/goals/likes
```

**Response:**
```json
{
  "success": true,
  "goal": {
    "key": "likes",
    "total": 500,
    "goal": 1000,
    "show": true,
    "config": {
      "name": "Likes",
      "mode": "add",
      "add_amount": 1000
    }
  }
}
```

---

#### POST /api/goals/:key/config

Goal-Config speichern.

**Request:**
```
POST /api/goals/likes/config
```

**Request Body:**
```json
{
  "name": "Likes",
  "goal": 1000,
  "mode": "add",
  "add_amount": 1000,
  "show_goal": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Goal config saved"
}
```

---

#### POST /api/goals/:key/style

Goal-Style speichern.

**Request:**
```
POST /api/goals/likes/style
```

**Request Body:**
```json
{
  "fill_color1": "#4ade80",
  "fill_color2": "#22c55e",
  "label_template": "Likes: {total} / {goal}"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Goal style saved"
}
```

---

#### POST /api/goals/:key/set

Goal-Wert setzen.

**Request:**
```
POST /api/goals/likes/set
```

**Request Body:**
```json
{
  "value": 500
}
```

**Response:**
```json
{
  "success": true,
  "total": 500
}
```

---

#### POST /api/goals/:key/increment

Goal inkrementieren.

**Request:**
```
POST /api/goals/likes/increment
```

**Request Body:**
```json
{
  "value": 10
}
```

**Response:**
```json
{
  "success": true,
  "total": 510
}
```

---

#### POST /api/goals/:key/reset

Goal zurücksetzen.

**Request:**
```
POST /api/goals/likes/reset
```

**Response:**
```json
{
  "success": true,
  "total": 0
}
```

---

#### POST /api/goals/reset

Alle Goals zurücksetzen.

**Response:**
```json
{
  "success": true,
  "message": "All goals reset"
}
```

---

### OBS-Integration

#### GET /api/obs/status

OBS-Verbindungsstatus abrufen.

**Response:**
```json
{
  "success": true,
  "connected": true,
  "host": "localhost",
  "port": 4455
}
```

---

#### POST /api/obs/connect

OBS WebSocket verbinden.

**Request Body:**
```json
{
  "host": "localhost",
  "port": 4455,
  "password": "optional"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connected to OBS WebSocket"
}
```

---

#### POST /api/obs/disconnect

OBS WebSocket trennen.

**Response:**
```json
{
  "success": true,
  "message": "Disconnected from OBS"
}
```

---

#### POST /api/obs/scene/:sceneName

Szene wechseln.

**Request:**
```
POST /api/obs/scene/Cam2
```

**Response:**
```json
{
  "success": true,
  "message": "Switched to scene: Cam2"
}
```

---

#### POST /api/obs/source/:sourceName/visibility

Source Sichtbarkeit ändern.

**Request:**
```
POST /api/obs/source/AlertBox/visibility
```

**Request Body:**
```json
{
  "visible": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Source visibility updated"
}
```

---

#### GET /api/obs/scenes

Alle Szenen abrufen.

**Response:**
```json
{
  "success": true,
  "scenes": [
    "Cam1",
    "Cam2",
    "Screen",
    "Starting Soon"
  ]
}
```

---

#### GET /api/obs/sources

Alle Sources abrufen.

**Response:**
```json
{
  "success": true,
  "sources": [
    "AlertBox",
    "Webcam",
    "Microphone",
    "Browser Source"
  ]
}
```

---

### Gift-Katalog

#### GET /api/gift-catalog

Gift-Katalog abrufen.

**Response:**
```json
{
  "success": true,
  "gifts": [
    {
      "id": 5655,
      "name": "Rose",
      "coins": 1,
      "image": "https://..."
    },
    {
      "id": 5827,
      "name": "Lion",
      "coins": 500,
      "image": "https://..."
    }
  ]
}
```

---

#### POST /api/gift-catalog/update

Gift-Katalog aktualisieren (Scraping).

**Response:**
```json
{
  "success": true,
  "message": "Gift catalog updated",
  "giftsCount": 150
}
```

---

### Leaderboard

#### GET /api/leaderboard/top/:category

Top N abrufen.

**Categories:** `gifters`, `donors`, `chatters`

**Query Parameters:**
- `limit` (optional, default: 10) - Anzahl der Einträge

**Request:**
```
GET /api/leaderboard/top/gifters?limit=5
```

**Response:**
```json
{
  "success": true,
  "category": "gifters",
  "data": [
    {
      "username": "user1",
      "total_coins": 5000,
      "gift_count": 42
    },
    {
      "username": "user2",
      "total_coins": 3500,
      "gift_count": 28
    }
  ]
}
```

---

### Update-System

#### GET /api/update/check

Update-Check durchführen.

**Response (Update verfügbar):**
```json
{
  "success": true,
  "updateAvailable": true,
  "currentVersion": "1.0.2",
  "latestVersion": "1.0.3",
  "changelog": "## [1.0.3]\n### Added\n- New feature..."
}
```

**Response (kein Update):**
```json
{
  "success": true,
  "updateAvailable": false,
  "currentVersion": "1.0.2"
}
```

---

#### POST /api/update/download

Update durchführen.

**Request Body:**
```json
{
  "method": "git"
}
```

**Methods:** `git` (git pull) oder `zip` (ZIP-Download)

**Response:**
```json
{
  "success": true,
  "message": "Update downloaded successfully. Please restart server."
}
```

---

#### GET /api/update/current

Aktuelle Version abrufen.

**Response:**
```json
{
  "success": true,
  "version": "1.0.2"
}
```

---

### Plugin-Manager

#### GET /api/plugins

Alle Plugins abrufen.

**Response:**
```json
{
  "success": true,
  "plugins": [
    {
      "id": "tts",
      "name": "TTS Plugin",
      "description": "Text-to-Speech Engine",
      "version": "1.0.0",
      "enabled": true,
      "type": "utility"
    }
  ]
}
```

---

#### POST /api/plugins/upload

Plugin hochladen (ZIP).

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file` (ZIP-Datei)

**Response:**
```json
{
  "success": true,
  "message": "Plugin uploaded and installed",
  "pluginId": "my-plugin"
}
```

---

#### POST /api/plugins/:id/enable

Plugin aktivieren.

**Request:**
```
POST /api/plugins/tts/enable
```

**Response:**
```json
{
  "success": true,
  "message": "Plugin enabled"
}
```

---

#### POST /api/plugins/:id/disable

Plugin deaktivieren.

**Request:**
```
POST /api/plugins/tts/disable
```

**Response:**
```json
{
  "success": true,
  "message": "Plugin disabled"
}
```

---

#### DELETE /api/plugins/:id

Plugin löschen.

**Request:**
```
DELETE /api/plugins/old-plugin
```

**Response:**
```json
{
  "success": true,
  "message": "Plugin deleted"
}
```

---

#### POST /api/plugins/:id/reload

Plugin neu laden.

**Request:**
```
POST /api/plugins/tts/reload
```

**Response:**
```json
{
  "success": true,
  "message": "Plugin reloaded"
}
```

---

## 🌐 WebSocket-Events (Socket.io)

### Core-Events

**Verbinden:**
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Socket.io connected');
});
```

#### tiktok:connected

TikTok LIVE verbunden.

**Daten:**
```javascript
{
  username: 'example_user',
  roomId: '123456789',
  roomInfo: { ... }
}
```

**Listener:**
```javascript
socket.on('tiktok:connected', (data) => {
    console.log(`Connected to @${data.username}`);
});
```

---

#### tiktok:disconnected

TikTok LIVE getrennt.

**Daten:**
```javascript
{
  reason: 'User ended stream'
}
```

---

#### tiktok:gift

Geschenk erhalten.

**Daten:**
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

---

#### tiktok:chat

Chat-Nachricht.

**Daten:**
```javascript
{
  username: 'user123',
  message: 'Hello world',
  profilePictureUrl: 'https://...'
}
```

---

#### tiktok:follow

Neuer Follower.

**Daten:**
```javascript
{
  username: 'user123',
  followRole: 0
}
```

---

#### tiktok:share

Stream geteilt.

**Daten:**
```javascript
{
  username: 'user123'
}
```

---

#### tiktok:like

Likes erhalten.

**Daten:**
```javascript
{
  username: 'user123',
  likeCount: 5
}
```

---

#### tiktok:subscribe

Neuer Subscriber.

**Daten:**
```javascript
{
  username: 'user123',
  subLevel: 1
}
```

---

#### alert:new

Neuer Alert.

**Daten:**
```javascript
{
  type: 'gift',
  text: 'user123 sent Rose x1',
  soundFile: '/sounds/gift.mp3',
  duration: 5000,
  image: '/images/gift.gif'
}
```

---

#### goal:update

Goal aktualisiert.

**Daten:**
```javascript
{
  key: 'likes',
  total: 550,
  goal: 1000,
  show: true
}
```

---

#### goal:reached

Goal erreicht.

**Daten:**
```javascript
{
  key: 'likes',
  total: 1000,
  goal: 1000
}
```

---

#### status:update

Status-Update (Viewer, Likes, etc.).

**Daten:**
```javascript
{
  connected: true,
  username: 'example_user',
  viewers: 150,
  likes: 2500,
  totalGifts: 42
}
```

---

### Plugin-Events

#### tts:queue-update

TTS-Queue aktualisiert.

**Daten:**
```javascript
{
  queue: [
    { text: 'Hello', voice: 'en_us_001' },
    { text: 'World', voice: 'en_us_002' }
  ]
}
```

---

#### topboard:update

Topboard aktualisiert.

**Daten:**
```javascript
{
  topGifters: [
    { username: 'user1', total_coins: 5000 },
    { username: 'user2', total_coins: 3500 }
  ],
  streaks: [
    { username: 'user3', streak: 10 }
  ]
}
```

---

#### multicam_state

Multi-Cam-Status.

**Daten:**
```javascript
{
  connected: true,
  currentScene: 'Cam1',
  scenes: ['Cam1', 'Cam2', 'Screen']
}
```

---

#### osc:status

OSC-Bridge-Status.

**Daten:**
```javascript
{
  isRunning: true,
  stats: {
    messagesSent: 150,
    messagesReceived: 20
  }
}
```

---

## 📚 Swagger-Dokumentation

Interaktive API-Dokumentation verfügbar unter:

```
http://localhost:3000/api-docs
```

**Features:**
- Interaktive Try-It-Out-Funktionen
- Request/Response-Schemas
- Beispiele

---

## ⚠️ Fehler-Codes

| HTTP-Code | Beschreibung |
|-----------|--------------|
| `200` | OK - Erfolgreiche Anfrage |
| `400` | Bad Request - Ungültige Parameter |
| `404` | Not Found - Ressource nicht gefunden |
| `500` | Internal Server Error - Server-Fehler |

**Fehler-Response-Format:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

[← Plugin-Dokumentation](Plugin-Dokumentation) | [→ FAQ & Troubleshooting](FAQ-&-Troubleshooting)

---

*Letzte Aktualisierung: 2025-12-11*
*Version: 1.2.1*
