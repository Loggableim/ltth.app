# Animaze/ChatPal Transport-Contract (Sidekick)

Dieses Dokument ist die **Referenz fuer das Wire-Contract** zwischen LTTH
(Sidekick) und Animaze ChatPal. Es beschreibt die Nachrichten, den Codec, die
Test-Doubles (Mock-Endpoint) und den Live-Test-Ablauf.

Bead-Kontext: `lt-k02` (Animaze-Transport), T1 = `lt-f25` (Mock-Interface/Contract),
T2 = `lt-0xt` (Implementierung gegen Mocks).

## Modul-Landkarte

| Datei | Zweck |
|-------|-------|
| `backend/animazeContract.js` | Kanonischer, abhaengigkeitsfreier Contract: Action-Namen, Endpoint, Codec (`encodeCommand`/`decodeMessage`), Validierung, Klassifizierung. (T1) |
| `backend/animazeMock.js` | In-Memory-Mock des Animaze-Endpunkts: `MockAnimazeSocket`, `MockAnimazeServer`, `createMockServer`, `createMockSocketFactory`. (T1) |
| `backend/animazeTransport.js` | WebSocket-Transport + Socket-Factory-Injektion, Graceful Degradation, Reconnect. (T2) |
| `backend/animazeClient.js` | Queue/Speech-Pacing auf dem Transport; stabile Public API. |

`animazeContract.js` und `animazeMock.js` sind **eigenstaendig** und laufen ohne
laufende Animaze-Instanz oder Netzwerk.

## Transport

- Protokoll: WebSocket.
- Default-Endpoint: `ws://127.0.0.1:9000` (Konfiguration ueber
  `animaze.host` / `animaze.port`, siehe `buildAnimazeUri`).
- Die Socket-Implementierung wird injiziert (`socketFactory`), damit Code und
  Tests ohne echtes Animaze laufen.

## Nachrichten

### Downstream (LTTH -> Animaze)

```json
{
  "action": "ChatbotSendMessage",
  "message": "Text zum Sprechen",
  "priority": 1,
  "id": "sidekick_1_1700000000000"
}
```

- `action`: Pflicht, nicht-leerer String (`ANIMAZE_ACTIONS.SEND_MESSAGE`).
- `message`: Pflicht fuer `ChatbotSendMessage`, nicht-leer.
- `priority`: optional, Zahl; hoeher = frueher.
- `id`: optional, Korrelation fuer Request/Response (`buildRequestId`).

### Upstream (Animaze -> LTTH)

```json
{ "action": "ChatbotSpeechStarted" }
{ "action": "ChatbotSpeechEnded" }
{ "id": "sidekick_1_1700000000000", "ok": true }
{ "error": "Beschreibung" }
```

`classifyMessage` ordnet eingehende Frames einer Kategorie zu:
`command`, `speech-started`, `speech-ended`, `response`, `error`, `unknown`
(oder `null`, wenn kein Objekt).

## Codec-Regeln

- `encodeCommand(command)` validiert das Envelope und wirft `TypeError` **nur**
  bei ungueltigem ausgehendem Envelope (Programmierfehler).
- `decodeMessage(raw)` wirft **nie**: akzeptiert JSON-String, `Buffer` oder
  bereits geparstes Objekt; ungueltige/Nicht-Objekt-Payloads liefern `null`
  (Graceful Degradation).
- `buildSendMessageCommand(text, {priority, requestId})` trimmt den Text und
  wirft bei leerem Text.

## Mock-Endpoint

Der Mock erlaubt End-to-End-Tests der Transport-Schicht ohne echtes Animaze:

```js
const { createMockServer } = require('./backend/animazeMock');
const { buildSendMessageCommand } = require('./backend/animazeContract');

const server = createMockServer();           // autoRespond: true
const socket = server.createSocket().open(); // Socket oeffnen

socket.send(JSON.stringify(buildSendMessageCommand('Hallo')));

server.commands; // [{ action: 'ChatbotSendMessage', message: 'Hallo' }]
// Socket empfaengt: {action:'ChatbotSpeechStarted'} dann {action:'ChatbotSpeechEnded'}
```

Fuer einen injizierbaren Transport:

```js
const { server, factory } = createMockSocketFactory({ connectBehavior: 'open' });
new AnimazeTransport(api, config, { socketFactory: factory });
```

### Fehlerinjektion

- `connectBehavior`: `'open'` | `'refuse'` | `'stall'` | `'none'` — Verhalten
  beim Erzeugen eines Sockets (Auto-Oeffnen, Ablehnen, Handshake-Timeout).
- `failMode`: `'none'` | `'error'` | `'close'` — Antwort auf eingehende Befehle.
- Driver-Helfer am Socket: `refuse()`, `stall()`, `emitMalformed()`,
  `serverClose()`, `speakStarted()`, `speakEnded()`.
- `respondOnMalformed`, `autoRespond`, `logger` konfigurierbar.

Der Mock ist selbst contract-konform: er encodiert/decodiert ueber
`animazeContract.js`, zaehlt `malformedMessages` und emittiert ausschliesslich
dokumentierte Frames.

## Live-Test (Cids Windows-PC)

Der Live-Test laeuft auf Cids Windows-PC (Animaze dort installiert); er
blockiert die Worker nicht.

1. Animaze auf dem Windows-PC starten und ChatPal/WebSocket aktivieren.
2. In LTTH/Sidekick als Avatar-Driver `animaze` waehlen, `animaze.host` =
   `127.0.0.1`, `animaze.port` = ChatPal-Port (Default `9000`).
3. `POST /api/sidekick/animaze/connect` -> `{ success: true, isConnected: true }`.
4. `POST /api/sidekick/animaze/test` mit `{ "message": "Hallo Animaze" }` ->
   Avatar spricht; `GET /api/sidekick/animaze/status` zeigt `isSpeaking`
   und steigende `stats.messagesSent`.
5. Negativtest: Animaze schliessen und erneut verbinden -> `connect()` liefert
   `false`, klare Warnung im Log, keine Exception; `stats.errors` steigt.

## Tests

| Datei | Inhalt |
|-------|--------|
| `test/animaze-contract.test.js` | Codec, Validierung, Klassifizierung, URI/Request-Id (Node 20 + 22). |
| `test/animaze-mock.test.js` | Mock-Endpoint: Befehl/Events, malformed, Fehlerinjektion, Reset. |

Alle Tests laufen auf `main` ohne Animaze-Instanz. Die T2-Implementierung
(`animazeTransport.js`) kann `animazeContract.js` importieren, statt den Codec zu
duplizieren; bis dahin ist der Contract hier die Referenz.
