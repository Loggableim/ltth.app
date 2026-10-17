# Shared i18n Socket.IO lifecycle

## Scope and source contract

`app/public/js/i18n-client.js` may observe an existing app-owned `window.socket` when the Socket.IO factory `io` already exists at script evaluation. It listens only to `locale-changed` and `language-changed`. It does not create or connect a socket; `io` is used only as an availability gate.

Previously, when `io` existed before the client but `window.socket` was not ready, a `setTimeout(..., 100)` recursively retried forever. The timer id was not retained, and the client had no pagehide cleanup. This path is reproduced with the actual client source and a fake clock by `app/test/i18n-client-socket-sync.test.js`.

## Implemented lifecycle

- The client checks `window.socket` immediately, then retries every 100 ms for at most 20 retries (a two-second window).
- A late existing socket within that window receives one handler each for the two supported event names. No socket is created by the client.
- The outstanding retry timer id is retained. `pagehide` cancels it and blocks future binding.
- On pagehide, only the client-owned handlers are removed with their exact callbacks, using `off` or `removeListener`. Other socket handlers and the socket connection remain owned by the host application.
- `pagehide` with `persisted === true` means the browser is entering the back-forward cache: the shared client remains intact while the page is frozen. The existing retry or listeners resume with the same page state; `pageshow` does not bind duplicate handlers. A non-persisted `pagehide` performs permanent cleanup.
- The pagehide cleanup is idempotent. No client socket events are emitted.
- Disposal resolves a pending `i18n.ready` promise. Pending translation responses after disposal cannot update locale state, local storage, document language, or translated DOM. The optional DOM-ready initializer and same-origin message listener are also removed.
- Existing pages where `io` is absent when the shared client evaluates do not start a retry. STT Ticker preserves this behavior: its HTML loads `i18n-client.js` before `/socket.io/socket.io.js`.

## Focused checks

`app/test/i18n-client-socket-sync.test.js` covers the 20-attempt stop, a late socket binding once, exact listener cleanup preserving a foreign listener, non-persisted pagehide cancellation and duplicate cleanup, persisted pagehide/pageshow cycles preserving bound listeners and a pending retry, no socket creation/emits/disconnect, and a pending-ready lifecycle with deferred translations and no unhandled rejection.

Related `app/test/obs-stt-renderer-fixtures.test.js` confirms the actual STT page script order has no i18n retry timer and still blocks late renderer writes after pagehide.

## Existing renderer consumer boundary

The post-fix targeted run includes the existing `streammonsters-ui-i18n-runtime.test.js` and `obs-timer-goals-renderer-fixtures.test.js` suites; both pass. A read-only in-process persisted pagehide/pageshow probe against the Stream Monsters creator harness retained locale changes (`fr`, translated integrity `72/72 vérifiés`), while its two page-owned refresh intervals went from 2 to 0 and were not restarted. The creator UI has no Socket.IO listener or MutationObserver in the inspected template; its own pagehide hook stops those intervals and aborts in-flight reads. This is a separate renderer lifecycle boundary from the shared i18n fix.

The Timer/Goals source-backed harness was also exercised with synthetic persisted pagehide/pageshow events. Advanced Timer stayed at `01:30` after a synthetic tick; its renderer had disconnected its socket and left zero handlers. Goals stayed at `25 / 100` after a synthetic value update; its renderer had emitted one existing `goals:unsubscribe`, disconnected its socket, and left zero handlers. That harness deliberately maps `window.socket` and `io()` to the same mock object, so its cleared handler map is renderer/fake-socket behavior and does not prove that every deployed page shares those socket objects. The owning Advanced Timer/Goals renderers already clean up unconditionally on pagehide; no owner files or tests were edited. Any BFCache support for their intervals/sockets needs a separate renderer-owner change.

The persisted lifecycle probes are synthetic JSDOM events and source-backed doubles. They do not simulate browser freeze scheduling, a real Socket.IO reconnect, OBS, or an actual BFCache navigation. The shared client source SHA-256 recorded in the locale expectation manifest is `aab1d9f00f2b1a8fef6d4fa31eeb65a55e071d72269de24b871fdf925387942c`.

These are source/JSDOM checks with local synthetic translation responses. They do not establish full UI, browser, OBS, or live acceptance.
