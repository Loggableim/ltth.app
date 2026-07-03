# API Bridge Plugin

Ermöglicht externen Anwendungen die Steuerung des TikTok Helper Tools via HTTP REST API und WebSocket.

## Features

- **HTTP REST API** - Standardisierte Endpoints für Action-Ausführung
- **WebSocket Unterstützung** - Echtzeit-Kommunikation und Events
- **TikTok Event Broadcasting** - Alle TikTok Events werden nach extern gebroadcastet
- **Multi-Plugin Integration** - Steuerung von TTS, Soundboard, Goals, OSC und mehr
- **Event History** - Speichert die letzten 100 TikTok Events
- **Auto-Discovery** - Listet alle verfügbaren Actions auf

## Installation

Das Plugin ist bereits installiert und aktiviert. Es nutzt die bestehende Express- und Socket.IO-Infrastruktur des Tools.

## API Dokumentation

### HTTP Endpoints

#### `GET /api/bridge/info`

Gibt Informationen über die Anwendung zurück.

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "PupCids Little TikTok Helper",
    "author": "Python.72",
    "version": "1.0.0",
    "plugin": "api-bridge",
    "pluginVersion": "1.0.0"
  }
}
```

#### `GET /api/bridge/actions`

Listet alle verfügbaren Actions auf.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tts.speak",
      "description": "Spricht einen Text über TTS aus",
      "parameters": {
        "text": { "type": "string", "required": true, "description": "Der auszusprechende Text" },
        "voice": { "type": "string", "required": false, "description": "Die zu verwendende Stimme (optional)" }
      }
    }
  ]
}
```

#### `POST /api/bridge/actions/exec`

Führt eine Action aus.

**Request Body:**
```json
{
  "actionId": "tts.speak",
  "context": {
    "text": "Hallo Welt!",
    "voice": "de-DE-Neural2-C"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "TTS ausgelöst",
    "text": "Hallo Welt!",
    "voice": "de-DE-Neural2-C"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Parameter \"text\" ist erforderlich"
}
```

#### `GET /api/bridge/events`

Gibt die Event-History zurück.

**Query Parameters:**
- `limit` (optional) - Anzahl der Events (Standard: 50, Max: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "type": "tiktok:gift",
        "timestamp": 1699876543210,
        "data": {
          "username": "user123",
          "nickname": "User Name",
          "gift": "Rose",
          "amount": 5,
          "diamondCost": 1,
          "totalDiamonds": 5
        }
      }
    ],
    "total": 42
  }
}
```

---

### WebSocket Events

Verbinde dich mit dem Socket.IO Server des Tools (Standard Port: siehe Tool-Konfiguration).

#### Client → Server Events

##### `bridge:action`

Führt eine Action aus (analog zu POST /api/bridge/actions/exec).

**Emit:**
```javascript
socket.emit('bridge:action', {
  actionId: 'tts.speak',
  context: {
    text: 'Hallo via WebSocket!'
  }
});
```

**Response Event:** `bridge:action:result`
```javascript
socket.on('bridge:action:result', (data) => {
  console.log(data);
  // { actionId: 'tts.speak', context: {...}, result: {...}, timestamp: 1699876543210 }
});
```

**Error Event:** `bridge:action:error`
```javascript
socket.on('bridge:action:error', (data) => {
  console.error(data.error);
});
```

#### Server → Client Events

##### `bridge:tiktok-event`

Wird bei jedem TikTok Event gebroadcastet.

**Event Types:**
- `tiktok:gift` - Geschenk erhalten
- `tiktok:follow` - Neuer Follower
- `tiktok:share` - Stream geteilt
- `tiktok:like` - Like erhalten
- `tiktok:chat` - Chat-Nachricht
- `tiktok:subscribe` - Neuer Subscriber

**Beispiel:**
```javascript
socket.on('bridge:tiktok-event', (event) => {
  console.log(event);
  // {
  //   type: 'tiktok:gift',
  //   timestamp: 1699876543210,
  //   data: {
  //     username: 'user123',
  //     nickname: 'User Name',
  //     gift: 'Rose',
  //     amount: 5,
  //     diamondCost: 1,
  //     totalDiamonds: 5,
  //     profilePictureUrl: 'https://...'
  //   }
  // }
});
```

##### `bridge:action-executed`

Wird gebroadcastet, wenn eine Action ausgeführt wurde.

```javascript
socket.on('bridge:action-executed', (data) => {
  console.log(data);
  // { actionId: 'tts.speak', context: {...}, result: {...}, timestamp: 1699876543210 }
});
```

---

## Verfügbare Actions

### TTS Actions

#### `tts.speak`
Spricht einen Text über TTS aus.

**Parameter:**
- `text` (string, required) - Der auszusprechende Text
- `voice` (string, optional) - Die zu verwendende Stimme
- `username` (string, optional) - Username für benutzerspezifische Stimme

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/bridge/actions/exec \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "tts.speak",
    "context": {
      "text": "Hallo von der API!",
      "voice": "de-DE-Neural2-C"
    }
  }'
```

#### `tts.skip`
Überspringt den aktuellen TTS-Eintrag.

#### `tts.clear`
Leert die TTS-Warteschlange.

---

### Soundboard Actions

#### `sound.play`
Spielt einen Sound ab.

**Parameter:**
- `soundId` (string, required) - Die ID des Sounds
- `volume` (number, optional) - Lautstärke (0-100)

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/bridge/actions/exec \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "sound.play",
    "context": {
      "soundId": "my-sound",
      "volume": 80
    }
  }'
```

---

### Goals Actions

#### `goal.increment`
Erhöht ein Ziel um einen bestimmten Betrag.

**Parameter:**
- `goalType` (string, required) - Typ des Ziels (follower, subscriber, etc.)
- `amount` (number, optional) - Betrag zum Erhöhen (Standard: 1)

#### `goal.set`
Setzt den Wert eines Ziels.

**Parameter:**
- `goalType` (string, required) - Typ des Ziels
- `value` (number, required) - Neuer Wert

#### `goal.reset`
Setzt ein Ziel zurück.

**Parameter:**
- `goalType` (string, required) - Typ des Ziels

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/bridge/actions/exec \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "goal.increment",
    "context": {
      "goalType": "follower",
      "amount": 5
    }
  }'
```

---

### OSC Actions

#### `osc.send`
Sendet eine OSC-Nachricht (z.B. an VRChat).

**Parameter:**
- `address` (string, required) - OSC Adresse (z.B. /avatar/parameters/Wave)
- `value` (any, required) - Wert zum Senden

#### `osc.vrchat.emote`
Löst eine VRChat Emote aus.

**Parameter:**
- `emote` (string, required) - Name der Emote (wave, clap, point, etc.)

**Beispiel:**
```bash
curl -X POST http://localhost:3000/api/bridge/actions/exec \
  -H "Content-Type: application/json" \
  -d '{
    "actionId": "osc.vrchat.emote",
    "context": {
      "emote": "wave"
    }
  }'
```

---

### System Actions

#### `system.notification`
Zeigt eine Notification im Tool an.

**Parameter:**
- `message` (string, required) - Nachricht
- `type` (string, optional) - Typ (info, success, warning, error)

#### `system.event`
Sendet ein Custom Event an alle Clients.

**Parameter:**
- `event` (string, required) - Event Name
- `data` (object, optional) - Event Daten

---

## Beispiel-Anwendungen

### JavaScript/Node.js (HTTP)

```javascript
const axios = require('axios');

async function triggerTTS(text) {
  const response = await axios.post('http://localhost:3000/api/bridge/actions/exec', {
    actionId: 'tts.speak',
    context: { text }
  });

  console.log(response.data);
}

triggerTTS('Hallo von Node.js!');
```

### JavaScript/Browser (WebSocket)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <script>
    const socket = io();

    // TikTok Events empfangen
    socket.on('bridge:tiktok-event', (event) => {
      console.log('TikTok Event:', event);

      if (event.type === 'tiktok:gift') {
        alert(`${event.data.nickname} hat ${event.data.amount}x ${event.data.gift} gesendet!`);
      }
    });

    // Action ausführen
    function playSound(soundId) {
      socket.emit('bridge:action', {
        actionId: 'sound.play',
        context: { soundId }
      });
    }

    // Auf Ergebnis warten
    socket.on('bridge:action:result', (data) => {
      console.log('Action Result:', data);
    });
  </script>
</body>
</html>
```

### Python

```python
import requests

def trigger_tts(text):
    response = requests.post(
        'http://localhost:3000/api/bridge/actions/exec',
        json={
            'actionId': 'tts.speak',
            'context': {
                'text': text,
                'voice': 'de-DE-Neural2-C'
            }
        }
    )
    print(response.json())

trigger_tts('Hallo von Python!')
```

### OBS Script (Lua)

```lua
obslua = require("obslua")

function trigger_action(action_id, context)
    local url = "http://localhost:3000/api/bridge/actions/exec"
    local json = require("dkjson")

    local body = json.encode({
        actionId = action_id,
        context = context
    })

    -- HTTP Request mit curl (Beispiel)
    os.execute('curl -X POST ' .. url .. ' -H "Content-Type: application/json" -d \'' .. body .. '\'')
end

function on_hotkey_pressed()
    trigger_action("tts.speak", { text = "OBS Hotkey gedrückt!" })
end
```

---

## CORS

Die API unterstützt CORS und kann von jedem Origin aus aufgerufen werden. Die CORS-Header werden vom Hauptserver gesetzt.

---

## Sicherheit

**Wichtig:** Diese API hat keine Authentifizierung! Sie sollte nur in vertrauenswürdigen Netzwerken verwendet werden.

Für Produktiv-Umgebungen empfohlen:
- Firewall-Regeln einrichten
- Reverse Proxy mit Authentifizierung (z.B. nginx mit Basic Auth)
- API-Key-System implementieren

---

## Troubleshooting

### Actions funktionieren nicht

- Stelle sicher, dass die entsprechenden Plugins (TTS, Soundboard, Goals, OSC) aktiviert sind
- Überprüfe die Plugin-Logs: `GET /api/plugins/api-bridge/log`

### WebSocket verbindet nicht

- Stelle sicher, dass der Socket.IO Client mit dem richtigen Port verbunden ist
- Überprüfe die Browser-Konsole auf Fehler

### TikTok Events werden nicht empfangen

- Stelle sicher, dass eine TikTok-Verbindung aktiv ist
- Events werden nur gebroadcastet, wenn TikTok verbunden ist

---

## Entwicklung

### Neue Action hinzufügen

```javascript
// In main.js, Methode registerActionHandlers()
this.actionHandlers.set('my-plugin.my-action', {
    description: 'Beschreibung der Action',
    parameters: {
        param1: { type: 'string', required: true, description: 'Parameter 1' }
    },
    handler: async (context) => {
        const { param1 } = context;

        // Deine Logik hier

        return { message: 'Erfolg', param1 };
    }
});
```

---

## Changelog

### Version 1.0.0
- Initiales Release
- HTTP REST API
- WebSocket Unterstützung
- TikTok Event Broadcasting
- TTS, Soundboard, Goals, OSC Actions
- Event History

---

## Lizenz

Siehe Hauptprojekt-Lizenz.

## Autor

Python.72
