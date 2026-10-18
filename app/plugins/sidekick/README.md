# Sidekick Plugin

Intelligenter Stream-Assistent für LTTH mit Animaze/ChatPal Integration, Event-Analyse und automatischen Reaktionen.

## Features

- **Animaze/ChatPal WebSocket Integration**: Sendet Nachrichten an den Animaze ChatPal für TTS-Ausgabe
- **TikTok Event-Verarbeitung**: Verarbeitet Chat, Gifts, Likes, Joins, Follows, Shares, Subscribes
- **User Memory System**: Speichert Benutzerinteraktionen mit automatischem Decay
- **Event Deduplication**: Verhindert doppelte Event-Verarbeitung mit TTL-basierter Dedupe
- **Rate Limiting**: Token Bucket und Per-User Cooldowns
- **Message Batching**: Fasst mehrere Nachrichten zu einem Output zusammen
- **Relevanz-Scoring**: Bewertet Chat-Nachrichten für intelligente Antworten
- **Stream Analytics**: Echtzeit-Metriken und historische Daten
- **GCCE Integration**: Chat-Befehle über das GCCE-System

## Installation

Das Plugin wird automatisch geladen, wenn es im `plugins/sidekick` Verzeichnis vorhanden ist.

## Admin UI

Zugriff über: `/sidekick/ui`

Features:
- Status-Übersicht (Verbindungen, Queue, Statistiken)
- Einstellungen (Animaze, Chat, Join Greetings, Batching)
- Memory-Verwaltung (Top User, Suche, Löschen)
- Analytics (Live Rates, Top Gifter)
- Event Log (Filterbar nach Typ)

## OBS Overlay

URL: `/overlay/sidekick/hud`

Query-Parameter:
- `position`: `top-left`, `top-right`, `bottom-left`, `bottom-right` (Standard: `top-right`)
- `minimal`: `true` für kompakte Ansicht
- `events`: `false` um Events auszublenden
- `maxEvents`: Anzahl der angezeigten Events (Standard: 5)

Beispiel: `/overlay/sidekick/hud?position=bottom-left&minimal=true`

## Chat-Befehle (GCCE)

- `!sidekick status` - Zeigt aktuellen Status
- `!sidekick mute [on|off]` - Mute/Unmute
- `!sidekick joins [on|off]` - Join Greetings ein/aus
- `!sidekick threshold <0-1>` - Reply Threshold setzen
- `!sidekick memory [clear]` - Memory-Statistiken oder löschen

Kurzform: `!sk <subcommand>`

## API Endpoints

### Status & Control

- `GET /api/sidekick/status` - Aktueller Status
- `GET /api/sidekick/config` - Konfiguration abrufen
- `POST /api/sidekick/config` - Konfiguration aktualisieren
- `POST /api/sidekick/mute` - Mute togglen
- `POST /api/sidekick/reset` - Session zurücksetzen

### Animaze

- `GET /api/sidekick/animaze/status` - Verbindungsstatus
- `POST /api/sidekick/animaze/connect` - Verbinden
- `POST /api/sidekick/animaze/disconnect` - Trennen
- `POST /api/sidekick/animaze/test` - Test-Nachricht senden

### Memory

- `GET /api/sidekick/memory/stats` - Memory-Statistiken
- `GET /api/sidekick/memory/:uid` - Benutzer-Daten abrufen
- `GET /api/sidekick/memory/search?q=...` - Benutzer suchen
- `GET /api/sidekick/memory/top?limit=10` - Top User
- `POST /api/sidekick/memory/clear` - Alle Daten löschen

### Analytics

- `GET /api/sidekick/metrics` - Aktuelle Metriken
- `GET /api/sidekick/metrics/history` - Historische Daten
- `GET /api/sidekick/analytics` - Event-Analytik
- `GET /api/sidekick/events?type=...&limit=50` - Event Log

### Internal

- `GET /api/sidekick/deduper/stats` - Deduper-Statistiken
- `GET /api/sidekick/ratelimit/status` - Rate Limiter Status
- `GET /api/sidekick/outbox/status` - Outbox-Status
- `POST /api/sidekick/outbox/flush` - Outbox manuell flushen

## Konfiguration

Die Konfiguration wird in der LTTH-Datenbank gespeichert und kann über die UI oder API angepasst werden.

### Wichtige Einstellungen

- `animaze.enabled`: Animaze-Integration aktivieren
- `animaze.host`/`port`: WebSocket-Verbindungsdetails
- `comment.enabled`: Chat-Verarbeitung aktivieren
- `comment.replyThreshold`: Relevanz-Schwellenwert (0-1)
- `comment.globalCooldown`: Globaler Cooldown in Sekunden
- `joinRules.enabled`: Join Greetings aktivieren
- `outbox.windowSeconds`: Batch-Fenster in Sekunden
- `muted`: Alle Ausgaben stummschalten

## Socket.io Events

- `sidekick:status` - Status-Updates

## Animaze-Transport

Der Animaze-Transport kapselt die WebSocket-Verbindung zum Animaze ChatPal.
Er ist als eigenes Modul `backend/animazeTransport.js` implementiert und wird
von `backend/animazeClient.js` (Queue + Speech-Pacing) genutzt.

### Interface

- Transport: WebSocket, Default `ws://<host>:<port>` (`animaze.host`/`animaze.port`).
- Steuerbefehl (LTTH -> Animaze):
  `{ action: 'ChatbotSendMessage', message: '<Text>', priority?: number, id?: string }`
- Events (Animaze -> LTTH):
  - `{ action: 'ChatbotSpeechStarted' }` - Avatar beginnt zu sprechen
  - `{ action: 'ChatbotSpeechEnded' }` - Avatar hat aufgehoert zu sprechen
  - `{ id: '<request-id>', ... }` - Antwort auf einen Befehl mit `id`
  - `{ error: '<Beschreibung>' }` - Server-Fehler

### Graceful Degradation

Wenn Animaze nicht erreichbar ist (Verbindung abgelehnt, Handshake-Timeout,
fehlende WebSocket-Implementierung, ungueltige Payloads) wirft der Transport
**nie** eine Exception. Stattdessen:

- `connect()` loest zu `false` auf, `isConnected === false`,
- Fehler/Timeouts werden klar geloggt (`[Animaze] ...`),
- malformed Nachrichten werden verworfen und gezaehlt
  (`stats.malformedMessages`), ohne den Stream zu unterbrechen.

### Tests gegen Mocks

`AnimazeTransport` (und damit `AnimazeClient`) akzeptiert eine injizierbare
`socketFactory`, sodass die Implementierung ohne laufende Animaze-Instanz gegen
Mocks getestet werden kann:

```js
const { AnimazeTransport } = require('./backend/animazeTransport');
const transport = new AnimazeTransport(api, config, {
  socketFactory: (uri, opts) => new MockSocket(uri, opts)
});
```

Tests: `test/animaze-transport.test.js` (Encode/Decode, Verbindungsfehler,
Timeouts, Speech-Events, Reconnect) und `test/animaze-client.test.js`
(Queue, Graceful Degradation, Status).

### Live-Test (Cids Windows-PC)

Der Live-Test laeuft auf Cids Windows-PC (Animaze ist dort installiert); er
blockiert die Worker nicht.

1. Animaze auf dem Windows-PC starten und ChatPal/WebSocket aktivieren.
2. In LTTH/Sidekick als Avatar-Driver `animaze` waehlen und `animaze.host`
   auf `127.0.0.1`, `animaze.port` auf den ChatPal-Port (Default `9000`) setzen.
3. `POST /api/sidekick/animaze/connect` -> `{ success: true, isConnected: true }`.
4. `POST /api/sidekick/animaze/test` mit `{ "message": "Hallo Animaze" }` ->
   der Avatar spricht; `GET /api/sidekick/animaze/status` zeigt
   `isSpeaking: true/false` und steigende `stats.messagesSent`.
5. Negativtest: Animaze schliessen und erneut verbinden -> `connect()` liefert
   `false`, klare Warn im Log, keine Exception; `stats.errors` steigt.

## Technische Details

### Architektur

```
sidekick/
├── main.js              # Plugin Entry Point
├── plugin.json          # Plugin Manifest
├── ui.html              # Admin UI
├── backend/
│   ├── config.js        # Konfigurationsverwaltung
│   ├── memoryStore.js   # User Memory (SQLite)
│   ├── eventBus.js      # Event System
│   ├── deduper.js       # Event Deduplication
│   ├── rateLimit.js     # Rate Limiting
│   ├── animazeClient.js # Animaze ChatPal Client (Queue + Speech)
│   ├── animazeTransport.js # Animaze/ChatPal WebSocket-Transport + Codec
│   ├── responseEngine.js # Relevanz-Scoring
│   ├── outboxBatcher.js # Message Batching
│   └── metrics.js       # Analytics
└── overlay/
    └── sidekick-hud.html # OBS Overlay
```

### Datenbank-Tabellen

- `sidekick_memory`: User-Daten und Interaktionshistorie

## Lizenz

CC-BY-NC-4.0 (wie LTTH Hauptprojekt)
