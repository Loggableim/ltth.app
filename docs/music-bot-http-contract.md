# Music-Bot HTTP-Contract (`!song` gegen den echten Music Bot)

Modul: `app/modules/music-bot-http-contract.js` · Bead: `lt-dja` (Epic `lt-x16` T1)
Implementierung: `app/plugins/music-bot/` (HTTP-Routen) + Chat-Anbindung (T2)
Tests: `app/test/music-bot-http-contract.test.js`

Dieses Dokument und das Contract-Modul sind die verbindliche Schnittstelle
zwischen dem Chat-Befehl `!song <url|query>` und dem Music Bot. Das Modul ist
abhaengigkeitsfrei: es enthaelt keine Aufloesungs-, Queue- oder Wiedergabe-Logik,
sondern nur Konstanten, die dokumentierte Ein-/Ausgabeform, Validatoren, einen
HTTP-Client mit injizierbarem Transport sowie einen In-Memory-Server fuer Tests.

Kein Merge (HOLD lt-8z6). Basis-Branch: `main`.

## Geltungsbereich

- Der Contract definiert das HTTP-Protokoll und die Client-Interface-Form.
- Die eigentliche Song-Aufloesung (`music-resolver`), Queue-Politik
  (`queue-manager`) und Wiedergabe (`playback-engine`) bleiben im Music-Bot.
- Rechte, Cooldown und Chat-Antworten im Host bleiben Aufgabe der
  Chat-Anbindung (T2). Der Contract liefert dafuer stabile Fehlercodes und
  `messageKey`s.

## Ablauf

1. Der Chat-Parser erkennt `!song <url|query>` und uebergibt den rohen Text.
2. `assertSongRequest({ query, requestedBy })` validiert und normalisiert.
3. `client.enqueue(request)` ruft `POST /api/plugins/music-bot/request` auf.
4. Erfolg: `{ ok: true, position, title }`. Fehler: `{ ok: false, code, message, messageKey, params }`.
5. `client.queue()`, `client.play()`, `client.skip()` und `client.status()`
   bilden die uebrigen Player-Befehle auf dieselben Routen ab.
6. Die Chat-Schicht lokalisiert ueber `MESSAGE_KEYS[code]` und meldet die
   Meldung im Chat. Timeouts und Netzwerkfehler werden vom Client selbst
   behandelt.

## Endpunkte

Alle Pfade liegen unter `BASE_PATH = '/api/plugins/music-bot'` und liefern JSON.

| Name | Methode | Pfad | Body | Erfolg |
|---|---|---|---|---|
| `queue` | GET | `/api/plugins/music-bot/queue` | – | `{ success: true, queue: Song[] }` |
| `request` | POST | `/api/plugins/music-bot/request` | `{ query, username, requesterAvatar }` | `{ success: true, song, position }` |
| `play` | POST | `/api/plugins/music-bot/queue/:index/play` | `{ songId }` | `{ success: true, track, alreadyPlaying? }` |
| `skip` | POST | `/api/plugins/music-bot/skip` | `{ reason }` | `{ success: true, next }` |
| `status` | GET | `/api/plugins/music-bot/status` | – | siehe Status-Payload |

`ENDPOINTS` enthaelt `method`, `path` (nur bei statischen Routen) und
`pathTemplate`. `resolveEndpoint(name, params)` ersetzt `:index` und
URL-kodiert den Wert.

### Request-Body (`enqueue`)

```js
{ query: 'never gonna give you up', username: 'viewer-1', requesterAvatar: null }
```

- `query`: getrimmt, Whitespace kollabiert, keine Steuerzeichen, 1..200 Zeichen.
- `username`: `requestedBy`, sonst `dashboard` (`DEFAULT_REQUEST_USERNAME`).
- `requesterAvatar`: optional.

### Request-Antworten

```js
// Erfolg (HTTP 200)
{ success: true, song: { id, title, url, ... }, position: 3 }

// Ablehnung (HTTP 400/409/423)
{ success: false, error: 'Die Warteschlange ist voll.', messageKey: 'queueFull',
  params: { maxLength: 20 } }
```

Der Contract liest `messageKey` und uebersetzt ihn ueber
`MESSAGE_KEY_TO_ERROR_CODE` in einen stabilen Fehlercode. `423` wird immer zu
`locked`, `409` mit `staleQueue: true` zu `stale`.

### Play

`index` ist 0-basiert und muss eine nicht-negative Ganzzahl sein. `songId` ist
optional; die Route bevorzugt `songId` und antwortet bei einem nicht mehr
vorhandenen Titel mit HTTP 409 und `staleQueue: true`. Bei einem bereits
laufenden Titel liefert die Route `alreadyPlaying: true`.

### Skip

`reason` ist `host` (Default) oder ein host-seitiger Grund. Die Route liefert
`next` mit dem naechsten Track (`null`, wenn die Queue leer ist).

### Status

```js
{ success: true,
  nowPlaying: { title, ... } | null,
  queueLength: 4,
  playbackState: 'playing' | 'paused' | 'idle',
  locked: false,
  ... }
```

Der Client reduziert das auf
`{ ok: true, nowPlayingTitle, queueLength, playbackState, locked }`.

## Fehlercodes

| Code | Ausloeser | `messageKey` |
|---|---|---|
| `empty-query` | leerer/nur Whitespace-Query | `requestRequired` |
| `invalid-query` | Steuerzeichen oder > 200 Zeichen | `queueInvalidSong` |
| `request-failed` | HTTP 400 ohne `messageKey` | `requestFailed` |
| `queue-full` | `queueFull` | `queueFull` |
| `duplicate` | `queueDuplicate` | `queueDuplicate` |
| `user-limit` | `queueUserLimit` | `queueUserLimit` |
| `cooldown` | `queueCooldown` | `queueCooldown` |
| `user-blocked` | `requestUserBlocked` | `requestUserBlocked` |
| `banned` | `banSong` / `banArtist` / `banKeyword` / `banChannel` | `banSong` |
| `duration` | `queueDurationUnknown` / `queueDurationTooLong` | `queueDurationTooLong` |
| `locked` | HTTP 423 oder Safety-Lock | `safetyLocked` |
| `stale` | HTTP 409 mit `staleQueue` | `requestFailed` |
| `bad-index` | ungueltiger `index` (client-seitig) | `requestFailed` |
| `busy` | `requestPending` | `requestFailed` |
| `timeout` | Transport antwortet nicht innerhalb `timeoutMs` | `requestFailed` |
| `unavailable` | Netzwerkfehler, ungueltige Antwort, HTTP 5xx | `requestFailed` |

`DEFAULT_MESSAGES` enthaelt fuer jeden Code einen deutschen Fallback. Die
Chat-Schicht soll `MESSAGE_KEYS[code]` mit `params` lokalisieren.

Client-seitige Validierungsfehler (`empty-query`, `invalid-query`,
`bad-index`) werden geworfen, bevor der Transport aufgerufen wird.

## Client-Interface

```js
const { createMusicBotHttpClient } = require('../modules/music-bot-http-contract');

const client = createMusicBotHttpClient({
  transport,                 // Pflicht: ({ method, path, body }) => Promise<{ status, body }>
  baseUrl: 'http://127.0.0.1:3000', // optional, Default DEFAULT_BASE_URL
  timeoutMs: 5000            // optional, Default DEFAULT_TIMEOUT_MS
});

await client.enqueue({ query: 'song', requestedBy: 'viewer-1' });
await client.queue();
await client.play({ index: 0, songId: 'song-3' });
await client.skip({ reason: 'host' });
await client.status();
client.getBaseUrl();         // optional
client.getTimeoutMs();       // optional
```

`assertMusicBotClient(client)` prueft die Pflichtmethode(n)
`REQUIRED_CLIENT_METHODS = ['queue', 'enqueue', 'play', 'skip', 'status']`;
`isMusicBotClient(value)` ist die boolesche Variante.

Der Transport kapselt die HTTP-Schicht des Hosts (z. B. `fetch`). Der Contract
baut selbst keine Verbindung auf, erzwingt aber `timeoutMs` per
`Promise.race` und normalisiert alle Fehler in `{ ok: false, code, ... }`.
Transport-Fehler werfen nicht nach aussen.

## In-Memory-Server fuer Tests

```js
const { createInMemoryMusicBotServer } = require('../modules/music-bot-http-contract');

const server = createInMemoryMusicBotServer({
  queue: [{ id: 'song-1', title: 'A' }],
  nowPlaying: { id: 'song-1', title: 'A' },
  playbackState: 'playing',
  locked: false,
  failures: { '/api/plugins/music-bot/request': { status: 400, body: { success: false, messageKey: 'queueFull' } } }
});
const client = createMusicBotHttpClient({ transport: server.transport });
```

Der Server spiegelt Routen, Statuscodes und `messageKey`s des echten Plugins:

- `server.calls` – aufgezeichnete Requests.
- `server.state()` – Queue, Now-Playing, Playback-State, Lock.
- `server.setQueue(list)`, `setNowPlaying(song)`, `setPlaybackState(state)`, `setLocked(bool)`.
- `server.failWith(pathOrRegexOrStar, response)` / `clearFailure(path?)` – Fehler-Injection.
- `server.reset()` – Zustand und Aufzeichnung leeren.

## Konstanten (Kurzuebersicht)

- `CONTRACT_VERSION` = `'1.0.0'`
- `COMMAND_NAME` = `'song'`
- `BASE_PATH` = `'/api/plugins/music-bot'`
- `DEFAULT_BASE_URL` = `'http://127.0.0.1:3000'`
- `DEFAULT_TIMEOUT_MS` = `5000`
- `MAX_QUERY_LENGTH` = `200`
- `DEFAULT_REQUEST_USERNAME` = `'dashboard'`
- `DEFAULT_SKIP_REASON` = `'host'`
- `HTTP_STATUS`, `ENDPOINTS`, `ERROR_CODES`, `MESSAGE_KEY_TO_ERROR_CODE`,
  `MESSAGE_KEYS`, `DEFAULT_MESSAGES`, `REQUIRED_CLIENT_METHODS`,
  `OPTIONAL_CLIENT_METHODS`

Alle Konstanten sind eingefroren.

## Exporte

- Normalisierung/Validierung: `normalizeSongQuery`, `assertSongRequest`,
  `isSongRequest`
- Payloads: `buildRequestPayload`, `buildQueuePlayPayload`, `buildSkipPayload`
- Endpunkte: `resolveEndpoint`, `buildRequestUrl`
- Ergebnisse: `createFailure`, `createSuccess`, `mapResponseToFailure`
- Client: `createMusicBotHttpClient`, `assertMusicBotClient`, `isMusicBotClient`
- Test-Server: `createInMemoryMusicBotServer`

## Tests

`app/test/music-bot-http-contract.test.js` prueft Konstanten, Query-Normalisierung,
Request-Validierung, Payloads, Endpoint-Aufloesung, Fehler-Mapping, Timeout,
Transport-Fehler und den Client gegen den In-Memory-Server (Erfolg, Locked,
Stale, Queue-Full, Empty Query, Status).
