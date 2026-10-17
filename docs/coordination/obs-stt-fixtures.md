# STT Ticker OBS renderer fixture

## Scope and actual entry

The canonical source is `GET /plugins/stt-ticker/overlay/ticker.html?lang={de|en|es|fr}`. The plugin also maps `GET /overlay/stt-ticker` and `GET /stt-ticker` to the same file (`app/plugins/stt-ticker/main.js`). It loads the shared `/js/i18n-client.js` and Socket.IO client. This work changes only renderer lifecycle/input handling and its local JSDOM fixture; no provider, backend, route, or public registry code was changed.

The renderer contract is:

- Incoming `stt-ticker:interim`: object with string `text`; optional `isFinal` boolean controls interim clearing.
- Incoming `stt-ticker:transcript`: string `text`, string-text `segments` array, or supported `multi.lines` / dual-language presentation data.
- Incoming `stt-ticker:clear`: clears visible output.
- No `stt-ticker:error` renderer listener exists. Provider status belongs to the master/admin UI.

Malformed `multi.lines` shapes and non-string interim/final/segment text are ignored. Valid transcript text is inserted unchanged, including Unicode. Socket events never cause client emits.

## Implementation

`app/plugins/stt-ticker/overlay/ticker.html` now has idempotent pagehide cleanup for the renderer and bootstrap theme-sync closure. The renderer marks itself disposed before cleanup, removes its exact socket callbacks, disconnects its socket, disconnects its own and parent-theme MutationObservers, and detaches its owned DOM listeners. Event callbacks and observer callbacks are guarded after disposal. The pagehide test dispatches twice and verifies one disconnect and no late DOM writes.

The tests are backed by `app/test/helpers/obs-stt-renderer-fixture.js` and `app/test/obs-stt-renderer-fixtures.test.js`. The fixture loads the actual shared `app/public/js/i18n-client.js` source and waits for its exported `i18n.ready` promise before checking locale state or closing JSDOM. This is confirmed with Node v22.14.0, JSDOM 29.0.2, and Jest 29.7.0. There is no evidence for a general JSDOM 29 incompatibility; the earlier issue was the harness's external-script/i18n lifecycle, now handled by awaiting the actual client initialization.

The fixture follows the actual script order: `i18n-client.js` runs before `/socket.io/socket.io.js`. At i18n evaluation, `io` is undefined and the shared client skips its optional socket-sync retry. The later Socket.IO script installs only its `io()` factory for the renderer; it does not invent a global `window.socket`. A separate shared-client suite tests the alternate ordering where `io` already exists and `window.socket` arrives later; the retry now has a 20-attempt budget, an owned timeout, `pagehide` cancellation, and BFCache-preserving `persisted` lifecycle behavior. The broader client lifecycle contract is recorded in `docs/coordination/i18n-socket-lifecycle.md`.

A deferred-translation case starts `en` and `fr` changes while the initial `i18n.ready` is still pending, dispatches pagehide, then resolves all local responses and delivers late renderer events. The ticker lines remain unchanged. Translation requests are local synthetic GET responses only. A simulated 503 response includes `statusText` and confirms the client falls back to German without provider requests.

## Verification

Final focused command (run from `app/`):

```powershell
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/obs-stt-renderer-fixtures.test.js --detectOpenHandles --no-cache
```

Result: **1 suite, 9/9 tests passed**. Coverage includes canonical HTML/script order, empty baseline, Unicode partial/final transcripts, clear, blocked object/array/number/null payloads and malformed segments/multilingual lines, pagehide idempotency, listener/observer/socket cleanup, multiple locale changes before `ready`, late-event blocking, actual page zero-timer behavior, unknown route/event denial, and de/en/es/fr startup through the actual shared i18n client.

`node --check` passed for both fixture JavaScript files; scoped `git diff --check` passed. These are source/JSDOM checks only.

## Status and remaining gaps

- **Behoben und geprüft:** Renderer pagehide lifecycle, owned socket callback removal and disconnect, MutationObserver cleanup, guards against late callbacks/DOM writes, strict text types for interim/final/segments, malformed multilingual shape rejection, and UTF-8 transcript preservation. Focused suite passed as above.
- **Teilweise geprüft:** Shared i18n client and locale selection/fallback run from the real checked-in client source; translations are stubbed local responses. The actual STT HTML order skips the retry branch; the bounded alternate-ordering behavior has focused tests in `app/test/i18n-client-socket-sync.test.js`.
- **Blockiert:** Keine bekannten Codeblocker im lokalen Source-/JSDOM-Scope. Browser- und OBS-Abnahme bleiben ungeprüft.
- **Nicht geprüft:** Live HTTP route behavior, plugin startup, actual Socket.IO server/client transport, browser/OBS capture, STT providers, microphone/device, packaged runtime, or public/live acceptance. No server, provider, microphone, listener, VM, OBS, or user process was started.
