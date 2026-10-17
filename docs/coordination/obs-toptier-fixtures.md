# TopTier Offline Overlay Fixtures

## Verified source contract and pre-edit plan

- Canonical entry is `app/plugins/toptier/overlay.html` → `/plugins/toptier/assets/overlay.js`; the template includes shared `i18n-client.js` and the Socket.IO client. `?lang=de|en|es|fr` selects the supported document-title translation from `app/plugins/toptier/locales/*.json`. Overlay-generated board labels remain hardcoded English (`Likes`, `Gifts`) and the empty message is hardcoded German (`Keine Einträge`); do not call these translated.
- The overlay requests board snapshots on Socket.IO `connect` through `toptier:get-board` with `{board:"likes"}` and/or `{board:"gifts"}`. The plugin accepts only those two values. The active response is `toptier:update` with `{board,entries,sessionId,active:true}`; inactive returns `{board,entries:[],sessionId:null,active:false}`. `ScoreEngine._emitUpdate()` emits `{board,entries,sessionId}` without `active`. Entries use DB projection fields such as `username`, `nickname`, `profile_picture_url`, `score`, and `rank`.
- The real HTTP GET route is `/api/plugins/toptier/board/:boardType`: invalid board gets 400; inactive session returns `{success:true,board:[],sessionId:null,active:false}`; active response uses current session ID and DB projection; thrown route work returns 500. The renderer itself uses Socket.IO, not this HTTP route.
- Offline fixtures will call the route/socket registration methods against in-memory function doubles only, instantiate no plugin backend, and feed synthetic `ScoreEngine._emitUpdate()` output into the actual renderer. JSDOM loads the actual template/renderer and actual shared i18n client against the four local plugin locale JSON files. Viewer names are synthetic, `profile_picture_url` stays empty, and no image/network resources are enabled.
- Product fix candidates are conditional on failing behavioral reproduction: reject malformed `toptier:update` (`entries` not an array or malformed rows) without throwing or changing DOM; add idempotent `pagehide`/`beforeunload` cleanup for the owned Socket.IO connection, spotlight interval, and score-tick timeout callbacks. The renderer does not currently establish a client-side session-ID binding; test current source behavior and producer session scoping, but do not invent a stale-session filter absent a documented reconnect/initial-session contract. No score engine/DB semantics, overlay registration, live data, listener, provider, or OBS start.

## Results

### Implementation and findings

- The offline fixture reproduced two renderer defects before the scoped source fix: a valid-board update with `entries` as an object threw at `.slice()`, and pagehide left the owned Socket.IO connection plus spotlight/score-tick timers active. A queued callback could still call the renderer.
- The owned `overlay.js` now validates update envelopes and DB-shaped rows (`username`, optional string `nickname`/`profile_picture_url`, finite nonnegative score, positive integer rank). Invalid envelopes and all-invalid nonempty row arrays are ignored without replacing the current visible board; mixed arrays retain only valid fixture rows. Legitimate empty arrays still render the expected empty state.
- Cleanup on `pagehide`/`beforeunload` is idempotent, disconnects the renderer-owned socket, cancels spotlight and score-tick timers, and guards already-copied socket callbacks. The pre-existing combined-board selection remains intact.
- HTTP GET and socket snapshot contracts were called directly through registered handlers with in-memory DB/session doubles. Active reads stayed scoped to the synthetic current session; inactive reads returned the source-declared empty payload; invalid board route returned 400; a thrown read returned 500. No TopTier `init()`, SQLite handle, score mutation, or real data was used.
- The renderer itself does not bind incoming updates against a client-remembered session ID. Server snapshots and score-engine updates carry sessionId, and session-start code emits empty boards, but no documented reconnect/current-session filtering contract was inferred. No stale-session filter was added; server/client session-race behavior remains an open decision.
- The actual template and shared i18n client were exercised for `de`, `en`, `es`, `fr`, loading the local plugin locale JSON. Only the document title is localized; renderer labels stay as current source defines. Avatar URLs were empty, avatars disabled, and JSDOM did not load external resources.

### Tests

- Passed, bundled Node v22.14.0, no-cache: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath plugins/toptier/test/obs-toptier-fixtures.test.js` — 8/8.
- Re-run after the parallel shared `i18n-client.js` lifecycle change: same TopTier fixture command, 8/8. This confirms the actual consumer still selects the four local title translations with the updated client source.
- Passed: `combined-board-variant.test.js` — 1/1, preserving the existing `board=combined` likes/gifts selection and confirming pagehide disconnect.
- Passed: direct bundled Node `scripts/obs-pilot/test/obs-104-matrix.test.js` — 8/8; generator wrote 104 cases / 26 profiles. TopTier gets `status`/`fixtureStatus: in-process-renderer-fixture-passed-not-obs`, `obsStatus: not-run`, `visualReview: pending`, and its fixture test/evidence. The 104 denominator is unchanged and no OBS pass was added.
- The suite covers four localized titles, exact socket board requests, inactive/default-empty states, actual `ScoreEngine._emitUpdate()` synthetic likes/gifts payloads, active/inactive GET and socket snapshots, invalid board route/socket input, GET error response, malformed envelopes/rows, and pagehide timer/socket/callback cleanup.
- The two pre-fix failing cases were observed before implementation; the targeted suite passed after the renderer fix. JSDOM fixture captures VirtualConsole output with bounded/redacted records.

### Changed files

- `app/plugins/toptier/assets/overlay.js`
- `app/plugins/toptier/test/helpers/obs-toptier-renderer-fixture.js`
- `app/plugins/toptier/test/obs-toptier-fixtures.test.js`
- `app/plugins/toptier/test/combined-board-variant.test.js`
- `scripts/obs-pilot/build-obs-104-matrix.js`
- `scripts/obs-pilot/test/obs-104-matrix.test.js`
- `docs/coordination/obs-104-acceptance-matrix.json`
- `docs/coordination/obs-pruefplan.md`
- `docs/coordination/obs-toptier-fixtures.md`

The shared `app/public/js/i18n-client.js` change belongs to parallel work and was not edited here. The candidate offline/transfer manifests do not contain a path/hash record for that source file, so no transfer-manifest digest was rewritten.

### Status / remaining risk

- Status: **fixture passed; not OBS-104 / BrowserSource / OBS acceptance**. The four toptier rows remain in the existing practical-capture-blocked state; denominator remains 104.
- JSDOM validates DOM/event/timer contracts only. It does not prove CSS composition, avatar fetch behavior, Spotlight visual output, or OBS rendering.
- No listener, OBS, VM, provider, database initialization, public event, real score, profile image, or viewer identity was used. No `score-engine.js`, overlay registry, or TopTier locale files changed.
- Session-ID mismatch policy is open because the renderer has no established client-side session baseline. Do not infer stale-stream rejection from these fixtures.

## Laufzeit-Lokalisierung und Actual-Backend-Probe (2026-10-07)

- Ergänzung nach dem oben protokollierten CPU-/Planstand: Rendererlabels Likes/Gifts/Keine Einträge nutzen jetzt die vorhandenen i18n-Schlüssel; keine Locale-Assets geändert. Originalrenderer DE/EN/ES/FR für zwei leere und zwei gefüllte Boards plus stabilen Sessionzustand: 2 Suites/11 Tests bestanden.
- Actual isolierter Chromium-Receipt: `docs/coordination/evidence/actual-toptier-a1c5a303-2fdc-4535-9ee5-623478ddfe94.json`, Ergebnis PASS_LIMITED. Locale-Boardtitel/Leertext und Score 25 geprüft, synthetische Session-ID bleibt durch Localewechsel gleich, Fehler 0, geordneter App-Shutdown/Portabschluss. PNG `output/playwright/actual-toptier/fr-9b664dc6-6be7-4f49-a8f4-1d81d445c72a.png`, SHA-256 `542a56ab834684f30541c6647dda0f683e236ebb74fb0d633cc70edb35a81174`.
- Der PNG-Hintergrund ist weiß, weil die Seite transparent rendert; weiße Textzeilen sind deshalb nicht sichtbar. Keine visuelle Layoutabnahme. CEO meldete danach eine neue `app/server.js`-Version; der alte Receipt bleibt historisch und wird nicht überschrieben. Für eine spätere begründete Probe sollen beide anfänglichen Leertexte assertiert und ein kontrastreicher Hintergrund nur im Capture gesetzt werden.
- Nächste tatsächliche Goals-Probe ist vorbereitet, aber nicht gestartet. Sie muss neue temp SQLite/Profile, enges Goals-plugin allowlist, clean child env, loopback only, kein TikTok-autoreconnect/provider, vor/nach source hashes und vollständige geordnete shutdown/port evidence verwenden.
