# OBS-Prüfplan: 104 Overlay-Fälle

Stand: 2026-10-08T05:31:21.139Z. Quellplan, keine OBS-Ausführung; 104 historische IDs, 100 aktive Rendererfälle und 4 Retirement-Kontrollen aus 26 Profilen × 4 Locales.

## Abnahmegrenzen

- Fixture-/In-Process-Vertragstests bestätigen nur Matrix, URLs und synthetische Payload-Verträge.
- Browser-Renderer-, Plugin-Integrations- und Sichtprüfung sind getrennte Nachweise. Kein Fixturepass zählt als OBS-Pass.
- Jeder Fall benötigt isolierten Startzustand, initiales Bild, deterministischen Trigger, Updatebild, Fehlerfall, Console/Network-Protokoll und Cleanupbeleg.
- Ungeklärte Routen, Payloads, Seeds, Audio/GPU oder externe Anforderungen bleiben als Blocker sichtbar; öffentliches Overlay-Register wird hier nicht geändert.
- Jeder Case bleibt `NOT_TESTED` für OBS. Die vier Chatango-Retirement-Kontrollen sind keine Browser-Source-Fälle und keine OBS-Pässe.
- Keine echten Konten, Viewer, Coins, Hardware, Provider, TTS/STT oder Liveaktionen. Stream/Record bleibt aus.

## Kleinste Pilotbatch-Reihenfolge

1. **stt-ticker (de/en/es/fr):** nur synthetischer `stt-ticker:transcript`-Text und `clear`; kein STT-Backend/Mikrofon/Provider.
2. **spotlight (de/en/es/fr):** nur isolierte last-event-API-Fixture und `lastevent.update.chatter` mit Fake-Session.
3. **goals (de/en/es/fr):** Guide belegt `id=non-empty`; `fixture-goal-{locale}` ausschließlich in fake Socket.IO ohne Goals-Datenbank.
4. **music-bot (de/en/es/fr):** Socket-only Track-Payload; kein Pluginbackend, Resolver, Queue oder MPV.
**advanced-timer (de/en/es/fr):** Guide belegt `timer=non-empty`; `fixture-timer-{locale}` ausschließlich in fake HTTP/Socket ohne Timer-Datensatz.

Die Pilotfolge priorisiert kleine, renderernahe Contracts. Sie ändert nicht den Umfang: alle 104 Fälle bleiben im Gate.

## Fallverträge nach Plugin

### advanced-timer — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/advanced-timer/overlay/index.html?lang={de|en|es|fr}&timer=fixture-timer-de`, 1280×720; Einstieg: `app/plugins/advanced-timer/overlay/index.html → overlay/overlay.js`.
- Initial: The guide requires ?timer=non-empty; fixture URL uses a reserved synthetic timer id and a fake same-origin response, with no timer record or backend.
- Trigger/Update: advanced-timer:tick mit `{"id":"fixture-timer-de","currentValue":89,"state":"running"}` → Only matching data.id updates the timer value/state; the visible countdown must move to 01:29 after a seeded 90-second timer.
- Negativ/Cleanup: Missing timer query produces the source-defined missing-timer diagnostic; nonexistent id must show timer-not-found, not a fabricated active timer. Cleanup: Close the fixture-owned socket and JSDOM window; verify no rotator interval started and no persistent timer state was touched. Product overlay exposes no explicit pagehide cleanup hook.
- GPU: none; Audio: none; externe Abhängigkeiten: none in entrypoint; local i18n and Socket.IO scripts.
- Seed-/Isolationrisiko: Guide postcondition requires a timer query id; use fixture-timer-{locale} against fake HTTP/socket endpoints only. No database/API seed.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/test/obs-timer-goals-renderer-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Evidenz: HTTP/console, missing-id frame, seeded 01:30→01:29 frames, matching and nonmatching timer IDs, unload cleanup; runtime integration and image review.
- Sourcebelege: `app/plugins/advanced-timer/overlay/index.html`, `app/plugins/advanced-timer/overlay/overlay.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### chatango — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/chatango/ui.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `Retirement control for /plugins/chatango/ui.html; no current dedicated renderer exists.`.
- Initial: The historical target is absent from the current plugin tree; it was a settings/integration page, not a verified OBS renderer.
- Trigger/Update: kein bestätigter Overlay-Event → No rendered update is expected. The control records that this historical target remains absent.
- Negativ/Cleanup: The target must remain absent/404; do not load an external Chatango embed or create a replacement renderer in this task. Cleanup: No OBS source or product route is started for a retirement control.
- GPU: none; Audio: none; externe Abhängigkeiten: External Chatango embed is intentionally not loaded.
- Seed-/Isolationrisiko: This row preserves the historical 104-case denominator but is not a renderer or a practical OBS pass.
- In-process Fixture: retired-control-not-obs (Testpfad nicht angegeben); OBS: NOT_TESTED; unabhängiger Bildreview: not-applicable-no-renderer.
- Retirement-Beleg: `app/test/chatango-backend-removal.test.js`; kein Renderer/keine OBS-Ausführung.
- Evidenz: Current source absence and route/registry denial only; no Browser Source evidence.
- **Offener Blocker:** No current plugin manifest, main.js, ui.html or dedicated overlay renderer exists; owner decision required before any replacement scope.
- Sourcebelege: `app/server.js`, `app/modules/public-overlay-registry.js`, `app/test/chatango-backend-removal.test.js`; Einstufung: retired-control-not-obs.

### clarityhud — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/overlay/clarity/full?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/clarityhud/overlays/full.html → overlays/full.js`.
- Initial: Full feed starts with empty event arrays; settings and initial state are loaded from /api/clarityhud/settings/full and /api/clarityhud/state/full before render.
- Trigger/Update: clarityhud.update.chat mit `{"username":"Pilot Viewer","comment":"Synthetic HUD fixture","message":"Synthetic HUD fixture"}` → With showChat enabled, one synthetic chat enters the feed and is rendered by the full-layout event card.
- Negativ/Cleanup: Return 503 for the initial settings request; source retries up to three times and shows its explicit initialization failure state. Cleanup: Close source; remove socket listeners and verify retry timers stop. Do not persist fixture settings or events.
- GPU: DOM/CSS; no WebGL.; Audio: none; externe Abhängigkeiten: OpenDyslexic CSS is referenced from jsDelivr; block or replace with local fallback for isolated run.
- Seed-/Isolationrisiko: Initial-state API plus large settings object; synthetic user/avatar data only. External font request must be denied/recorded.
- Evidenz: Empty baseline, one chat card, 503/recovery, socket disconnect, request log proving CDN blocked, console and image review.
- **Offener Blocker:** Need seed of full settings/state response and a verified offline font fallback before isolated image evidence.
- Sourcebelege: `app/plugins/clarityhud/overlays/full.html`, `app/plugins/clarityhud/overlays/full.js`, `app/plugins/clarityhud/main.js`; Einstufung: blocked-before-practical-capture.

### coinbattle — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/coinbattle/overlay/overlay.html → overlay/overlay.js`.
- Initial: Client state is inactive with default team labels/config; match panels are not a running battle until coinbattle:match-state arrives.
- Trigger/Update: coinbattle:match-state mit `{"active":true,"match":{"id":"fixture-match-1","status":"active"},"leaderboard":[],"teamScores":{"red":1,"blue":0}}` → handleMatchState renders the active match snapshot; verify timer/team/score regions follow the provided synthetic state.
- Negativ/Cleanup: Send malformed state without an active match and a separate disconnected-socket case; renderer must not expose stale winner/timer values. Cleanup: Emit a final inactive state, close source, clear match/multiplier/winner timers, and prove no persisted coin/balance mutation.
- GPU: DOM/CSS animations.; Audio: none in overlay entrypoint.; externe Abhängigkeiten: No external script/link refs; user avatar URLs may be data-dependent.
- Seed-/Isolationrisiko: Backend has coin/accounting and game side effects; never start it. Use synthetic Socket.IO fixture payload only; no coins or viewers.
- Evidenz: Inactive baseline, synthetic active match, malformed/disconnect state, score/timer text and image review, timer cleanup, proof backend was absent.
- **Offener Blocker:** Sample state is listener-shaped; confirm every nested match/leaderboard field against engine-produced snapshot before practical fixture run.
- Sourcebelege: `app/plugins/coinbattle/overlay/overlay.html`, `app/plugins/coinbattle/overlay/overlay.js`, `app/plugins/coinbattle/main.js`; Einstufung: blocked-before-practical-capture.

### emoji-rain — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/emoji-rain/obs-hud?lang={de|en|es|fr}`, 1280×720; Einstieg: `GET /emoji-rain/obs-hud → app/plugins/emoji-rain/obs-hud.html → app/public/js/emoji-rain-obs-hud.js`.
- Initial: Use fake GET config and user-mappings responses, with enabled and obs_hud_enabled true. The source begins with an empty transparent canvas; the #perf-hud and #resolution-indicator diagnostics are hidden by default. Keep this empty baseline distinct from pixel/effect proof.
- Trigger/Update: emoji-rain:spawn mit `{"count":1,"emoji":"💙","x":0.5,"y":0.15,"username":"Pilot Viewer","profilePictureUrl":null,"reason":"manual","source":"manual","burst":false,"intensity":1}` → With rate limiting disabled in the fake config, the actual HUD handler receives one source-produced spawn payload and schedules one emoji; emoji-rain:clear returns it to the empty state. Any pixel claim still requires a real isolated renderer capture.
- Negativ/Cleanup: Return disabled config and verify spawn is ignored. Reject invalid, non-finite, out-of-range or extra-field opacity payloads without changing container opacity. Delay the initial GET response until after a newer opacity event and verify it cannot overwrite that event; on reconnect verify a fresh GET wins over an older outstanding read. Cleanup: Send the existing emoji-rain:clear event and close the isolated source; verify the renderer loop/socket stops. No plugin backend, preset, user mapping, or config file may be created.
- GPU: Matter.js physics and DOM sprites; no WebGL in the served HUD.; Audio: none; externe Abhängigkeiten: Local i18n client, Matter.js and OBS HUD script only.
- Seed-/Isolationrisiko: Normal plugin startup can migrate/persist user state. Use fake GET responses and the actual source producer method with a no-write API double; no plugin constructor, DB, upload directory, or user data.
- Read-GET-Verträge: `GET /api/emoji-rain/config` (Rendereraufruf): {success:true,config:{enabled:true,obs_hud_enabled:true,rate_limit_enabled:false}}; `GET /api/emoji-rain/user-mappings` (Rendereraufruf): {success:true,mappings:{},stats:{totalMappings:0,uniqueEmojis:0}}; `GET /api/emoji-rain/overlay/state` (Rendereraufruf): {success:true,state:{opacity:0.35}}
- Opacity-Prüfplan: `emoji-rain:opacity` mit `{"opacity":0.35}`; aktueller Renderer-Verbrauch: ja; The existing socket handler sets #canvas-container.style.opacity to 0.35 for all contained particle layers; diagnostics outside the container remain independent. Default is 1, and 0 hides particles without stopping physics. A visible particle before/after change still requires actual renderer capture and independent image review.
- Evidenz: Source-backed route/producer/GET contract, empty transparent baseline, one synthetic spawn and clear plan, config-disabled and invalid-opacity negatives, late GET/event race and reconnect checks, exact request/event log, visible particle opacity capture and independent image review. DOM fixtures alone are not pixel or OBS proof.
- Sourcebelege: `app/plugins/emoji-rain/obs-hud.html`, `app/public/js/i18n-client.js`, `app/public/js/matter.min.js`, `app/public/js/emoji-rain-obs-hud.js`, `app/plugins/emoji-rain/main.js`, `app/modules/public-overlay-registry.js`; Einstufung: ready-for-isolated-fixture-review.

### fireworks — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/fireworks/overlay.html → gpu/engine.js`.
- Initial: Idle particle canvas with renderer/debug metrics; no firework until a trigger arrives.
- Trigger/Update: fireworks:trigger mit `{"id":"fixture-fireworks-de","timestamp":1,"type":"burst","shape":"burst","colors":["#ff4500","#ffd700"],"position":{"x":0.25,"y":0.4},"intensity":0.5,"particleCount":12,"requestedParticleCount":12,"tier":"small","username":"FixtureViewer","coins":10,"combo":1,"playSound":false,"giftPopupEnabled":true,"giftPopupPosition":"bottom"}` → The renderer creates one bounded firework at the source-backed position and displays the localized synthetic gift card; audio and network remain disabled.
- Negativ/Cleanup: Invalid position/intensity and simulated WebGL context loss must be rejected or fall back without an uncaught error. Cleanup: Wait for bounded effect lifetime, destroy renderer/source, release WebGL resources and verify active count/timers reach zero.
- GPU: WebGL with Canvas fallback; GPU/context-loss path required.; Audio: none; externe Abhängigkeiten: Local JS only.
- Seed-/Isolationrisiko: GPU availability/context loss and particle CPU use; use low-intensity, low-particle fixture only.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/test/obs-priority-trigger-renderer-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Fixturebeleg: Original overlay HTML and gpu/engine.js with in-memory Socket.IO; producer-shaped fireworks:trigger creates one Firework and a locale-specific textContent gift card. Fake audio is disabled; fetch is denied; test-only init skips GPU/audio startup.
- Evidenz: Eight locale-specific event-to-renderer tests across Flame/Fireworks; Fireworks assertion checks one synthetic firework, target coordinates, localized gift-card text, no network/audio, and zero renderer errors.
- **Offener Blocker:** Browser Source/OBS rendering and independent image review remain untested.
- Sourcebelege: `app/plugins/fireworks/overlay.html`, `app/plugins/fireworks/gpu/engine.js`, `app/plugins/fireworks/main.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### flame-overlay — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/flame-overlay/overlay?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/flame-overlay/renderer/index.html → effects-engine.js`.
- Initial: Canvas renderer loads default configuration; configured effect can start immediately, so initial frame must be recorded before any trigger.
- Trigger/Update: flame-overlay:trigger mit `{"id":"fixture-flame-overlay-de","type":"intensity-boost","amount":0.5,"duration":5000,"revert":true,"source":"gift:100"}` → The renderer applies the producer-shaped intensity-boost to its flame shader configuration and records the updated uniform input; clear-triggers returns to the configured baseline.
- Negativ/Cleanup: Send unsupported effect type and verify safe fallback/no throw; separately deny config update. Cleanup: Send clear-triggers, destroy renderer on unload, and verify animation loop, socket handlers, and textures/resources are released.
- GPU: Canvas-based effects; no confirmed WebGPU requirement.; Audio: none; externe Abhängigkeiten: Local config/renderer assets only.
- Seed-/Isolationrisiko: Default effect may animate before trigger; fixed seed/time control is needed for deterministic captures.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/test/obs-priority-trigger-renderer-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Fixturebeleg: Original renderer/effects-engine.js with fake config GET and in-memory socket; type/amount/duration/revert/source match flame-overlay main.js dispatchTrigger output for the gift 100 rule. Assertion checks active trigger, increased flameIntensity, and the values passed to the uniform update path.
- Evidenz: Eight locale-specific event-to-renderer tests across Flame/Fireworks; Flame asserts source-shaped event updates active trigger, flame intensity and uniform input without backend or network.
- **Offener Blocker:** WebGL pixels, Browser Source/OBS rendering, and independent image review remain untested.
- Sourcebelege: `app/plugins/flame-overlay/renderer/index.html`, `app/plugins/flame-overlay/renderer/effects-engine.js`, `app/plugins/flame-overlay/main.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### game-engine — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/game-engine/overlay/game-hud.html`.
- Initial: Queries /api/game-engine/active-session; with no active session the HUD must remain idle/hidden.
- Trigger/Update: game-engine:game-started mit `{"sessionId":"fixture-session-1","gameType":"connect4","state":{"board":[],"currentPlayer":1,"players":[]},"interactive":true}` → The HUD records sessionId/gameType and renders data.state; a matching game-ended event clears the active session.
- Negativ/Cleanup: 404/empty active-session response and a game-ended event for a different session must not render stale board data. Cleanup: Emit matching game-ended, clear the game-time interval, disconnect fixture socket, and verify no game/accounting backend ran.
- GPU: DOM/SVG game boards; no WebGL required.; Audio: none in the HUD entrypoint.; externe Abhängigkeiten: Same-origin API and Socket.IO.
- Seed-/Isolationrisiko: Engine can mutate game/coin state; use fake socket and fake active-session response only; no game engine instance.
- Evidenz: Idle, one synthetic started/move/ended sequence, unrelated-session negative, timer/listener cleanup, screenshots and console.
- **Offener Blocker:** The exact complete state object varies by game type; choose a fixture with a source-backed connect4 state before practical capture.
- Sourcebelege: `app/plugins/game-engine/overlay/game-hud.html`, `app/plugins/game-engine/main.js`; Einstufung: blocked-before-practical-capture.

### goals — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/goals/overlay?lang={de|en|es|fr}&id=fixture-goal-de`, 1280×720; Einstieg: `app/plugins/goals/overlay/index.html → overlay/overlay.js`.
- Initial: The guide requires ?id=non-empty; fixture URL uses a reserved synthetic goal id and fake Socket.IO responses, without invoking GoalsWebSocket or its database.
- Trigger/Update: goals:subscribed mit `{"goalId":"fixture-goal-de","goal":{"id":"fixture-goal-de","title":"Synthetic goal","target":10},"state":{"state":"active","progress":4}}` → After a valid id subscription, matching goals:value-changed updates goal/state/progress; wrong goalId is ignored.
- Negativ/Cleanup: Missing id and goals:error/goal-not-found must leave no fabricated progress. Cleanup: Close the fixture-owned socket and JSDOM window; verify the deterministic animation timeout settles, no event arrives after teardown, and no goal row/DB write exists. Product overlay exposes no explicit unsubscribe/pagehide hook.
- GPU: SVG/DOM progress visualization.; Audio: none; externe Abhängigkeiten: Same-origin Socket.IO; no external static assets.
- Seed-/Isolationrisiko: Production subscribe handler looks up the id in persistent storage; fixture must intercept goals:subscribe and emit synthetic responses without backend/database.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/test/obs-timer-goals-renderer-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Evidenz: Missing-id diagnostic, fixture id initial state, update and wrong-id negative, unsubscribe and image review.
- Sourcebelege: `app/plugins/goals/overlay/index.html`, `app/plugins/goals/overlay/overlay.js`, `app/plugins/goals/backend/websocket.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### interactive-story — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/interactive-story/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/interactive-story/overlay.html`.
- Initial: Story layers await config/participant/position responses and chapter events; no story content is seeded by the static URL.
- Trigger/Update: story:chapter-ready mit `{"id":"fixture-chapter-1","title":"Pilot chapter","content":"Synthetic chapter text for overlay review."}` → The current chapter title/content and story image/title layer update; no vote or TTS event is sent in this visual check.
- Negativ/Cleanup: Return an empty config/participants payload and emit image-generation-failed; visible fallback must remain readable and not retain a prior chapter. Cleanup: Emit story:ended, unload, and verify DOM listeners/socket timers are removed; never invoke provider, image generation, or TTS playback.
- GPU: DOM/CSS, no GPU renderer.; Audio: TTS playback listeners exist; keep them silent and do not emit playback events.; externe Abhängigkeiten: Same-origin APIs/Socket.IO; image URLs in payload require local fixture assets.
- Seed-/Isolationrisiko: Provider/image/TTS paths are high-risk; only socket fixture with local synthetic chapter and local image is permitted.
- Evidenz: Empty baseline, synthetic chapter, failure state, no provider/network/audio, event cleanup, console and image review.
- **Offener Blocker:** Confirm required chapter fields from _prepareChapterForEmit before using the candidate payload; no generation or TTS backend.
- Sourcebelege: `app/plugins/interactive-story/overlay.html`, `app/plugins/interactive-story/main.js`; Einstufung: blocked-before-practical-capture.

### milestone-leaderboard — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html`.
- Initial: GET /overlay/viewer-xp/leaderboard serves the vendored template; on load it requests viewer-xp:public-leaderboard with bounded limit/days; empty array is a valid empty state.
- Trigger/Update: viewer-xp:public-leaderboard mit `[{"username":"Fixture Viewer","name_color":"#2468ac","title":"Fixture title","xp":120,"level":2,"rank":1}]` → The actual renderer displays only public username/color/title/level/xp/rank fields; viewer-xp:public-update schedules a refresh and public-level-up requests immediately.
- Negativ/Cleanup: Empty, malformed and recovered responses replace prior rows; markup in public username/title stays text and invalid colors fall back to white; IDs/raw profile/settings never enter DOM. Cleanup: On non-persisted pagehide all three renderer clients disconnect their socket and clear owned timers; late callbacks are ignored. Persisted BFCache pages remain active; no DB writes.
- GPU: DOM/CSS.; Audio: none; externe Abhängigkeiten: Same-origin Socket.IO and allowlisted HTML/i18n assets only; fake profile values and no profile image/network request.
- Seed-/Isolationrisiko: Viewer data is privacy-sensitive; use only synthetic public fields, no plugin initialization, database, IDs, coins or real profile data.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Fixturebeleg: Actual XP-bar/leaderboard/level-up HTML, shared i18n client and Viewer-XP i18n bridge with all four locale dictionaries; real public handler and producer doubles/projections; malformed markup, recovery, no-private-DOM, persisted pagehide/pageshow and final-hide late-callback assertions. Locale fetches are local stubs; no DB/plugin init/network/live activity.
- Evidenz: Real GET/registry/socket source contract, direct handler doubles, three actual renderer scripts, empty/update/error/recovery, hostile display text, invalid style fallback, private-field scan and pending lifecycle.
- **Offener Blocker:** No OBS Browser Source, captured image or independent visual review has been run; BFCache restore is covered only by the in-process fixture.
- Sourcebelege: `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js`, `app/modules/public-overlay-registry.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### minecraft-connect — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/minecraft-connect/overlay/minecraft_overlay.html → overlay/minecraft_overlay.js`.
- Initial: Overlay starts hidden until minecraft-connect:overlay-show arrives.
- Trigger/Update: minecraft-connect:overlay-show mit `{"username":"Pilot Viewer","message":"Synthetic connection notice","timestamp":1}` → Synthetic connection notice becomes visible; source-defined hide timer returns it to hidden state.
- Negativ/Cleanup: Missing username/invalid message must not render markup or start Minecraft/network integration. Cleanup: Wait only the shortened fixture hide timer, unload and clear it; do not start Minecraft server/client or command handler.
- GPU: DOM/CSS.; Audio: none; externe Abhängigkeiten: No static external refs; icons/images require local data.
- Seed-/Isolationrisiko: Real plugin can communicate with Minecraft; isolate at event projection and never instantiate the connector.
- Evidenz: Hidden baseline, visible synthetic notice, auto-hide, invalid payload and absence of connector process/network.
- **Offener Blocker:** Payload field contract and hide duration should be checked against overlay source before a practical fixture.
- Sourcebelege: `app/plugins/minecraft-connect/overlay/minecraft_overlay.html`, `app/plugins/minecraft-connect/overlay/minecraft_overlay.js`, `app/plugins/minecraft-connect/main.js`; Einstufung: blocked-before-practical-capture.

### music-bot — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/music-bot/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/music-bot/overlay.html`.
- Initial: Connects and requests current status; null now-playing and empty queue are the expected empty baseline.
- Trigger/Update: musicbot:now-playing mit `{"playbackId":"fixture-playback-1","title":"Synthetic preview track","artist":"Local Fixture","duration":90,"currentTime":12,"isPlaying":true}` → Current-track widget displays title/artist and progress; paused/resumed/queue-update events alter only overlay view.
- Negativ/Cleanup: Null now-playing and disconnected socket return to empty/disconnected status; no player or URL may be started. Cleanup: Disconnect fixture socket and cancel visual progress timers; never instantiate MusicBotPlugin, Resolver, queue, or MPV.
- GPU: DOM/CSS.; Audio: Overlay does not play audio; live Music Bot audio is expressly out of this visual fixture.; externe Abhängigkeiten: Track artwork/avatar URLs could be remote; use local placeholder only.
- Seed-/Isolationrisiko: Resolver, queue and playback can start external processes; only fake Socket.IO events and local artwork.
- Evidenz: Empty and synthetic track frames, progress/paused state, null/disconnect negative, no MPV/yt-dlp process, image review.
- **Offener Blocker:** Confirm full now-playing field projection against _buildNowPlayingPayload and overlay renderer before fixture run.
- Sourcebelege: `app/plugins/music-bot/overlay.html`, `app/plugins/music-bot/main.js`; Einstufung: blocked-before-practical-capture.

### openshock — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/openshock/overlay/openshock_overlay.html → overlay/openshock_overlay.js`.
- Initial: The real overlay template starts with an empty hidden event card; only the synthetic fixture config GET is answered.
- Trigger/Update: openshock:command-sent mit `{"command":{"type":"vibrate","intensity":35,"duration":1200},"deviceName":"Fixture Device","username":"Fixture Viewer","source":"gift"}` → The original renderer displays the synthetic command summary in text nodes; it performs no device command or mutation.
- Negativ/Cleanup: Markup-like device/user strings remain text; private IDs/API-key/pattern metadata are not projected to the display or error log; no route beyond config is fetched. Cleanup: BFCache hide/show preserves the socket; final pagehide detaches handlers, cancels owned timers, disconnects once, and ignores a captured late callback.
- GPU: DOM/CSS only.; Audio: none in overlay event renderer.; externe Abhängigkeiten: No external provider request; synthetic config GET only.
- Seed-/Isolationrisiko: Renderer handles the visual summary of a hardware command; isolated tests must never invoke the plugin/provider or emit a command.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/plugins/openshock/test/obs-primary-overlay-fixture.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Fixturebeleg: Original primary overlay HTML and JS with in-memory Socket.IO, fake config GET, disabled external scripts, locale-derived emergency text, markup-like synthetic display strings, and no plugin/backend/provider/device process.
- Evidenz: de/en/es/fr: hidden empty baseline, synthetic command summary, safe text rendering, no private data/action, localized emergency notice, BFCache preservation and final cleanup. This is JSDOM evidence only.
- Sourcebelege: `app/plugins/openshock/overlay/openshock_overlay.html`, `app/plugins/openshock/overlay/openshock_overlay.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### quiz-show — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/quiz-show/quiz_show_overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/quiz-show/quiz_show_overlay.html → quiz_show_overlay.js`.
- Initial: State machine enters IDLE and hides overlay; on load it requests local HUD config/brand-kit/state/layout.
- Trigger/Update: quiz-show:state-update → A valid RUNNING question state reveals question/answers and round/category; no answer submission or chat interaction is sent.
- Negativ/Cleanup: Malformed/idle state hides overlay; suppress quiz-show:play-sound to avoid audio playback. Cleanup: Emit quiz-show:stopped, clear state/timer animation, unload listeners; do not start quiz/game/GCCE.
- GPU: DOM/CSS.; Audio: Sound playback listener exists; block it and capture muted.; externe Abhängigkeiten: Same-origin API/Socket.IO; image assets must be local.
- Seed-/Isolationrisiko: Quiz actions can include joker/chat/game effects; mock read-only state and fake events only.
- Evidenz: Idle frame, valid question frame, invalid/idle state, no sound call, timer/listener cleanup, image review.
- **Offener Blocker:** Capture exact state-update shape from the quiz controller/test fixture; current candidate intentionally lacks a guessed payload.
- Sourcebelege: `app/plugins/quiz-show/quiz_show_overlay.html`, `app/plugins/quiz-show/quiz_show_overlay.js`; Einstufung: blocked-before-practical-capture.

### schnorrbecher — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/overlay/coincup?transparent=1&lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/schnorrbecher/overlay/coincup.html → overlay/coincup.js`.
- Initial: Client requests coinJar.sync on connect; initial counter/config comes from server projection.
- Trigger/Update: coinJar.add → One synthetic coin animation increments visual jar count; reset event returns count to zero.
- Negativ/Cleanup: Empty sync and invalid add payload must not add coins or trigger external effect. Cleanup: Mute Browser Source audio, send coinJar.reset, stop Matter.js runner and unload listeners; no persistence/account balance.
- GPU: Matter.js physics and DOM/CSS; no WebGL.; Audio: Local impact audio element exists; must stay muted for acceptance.; externe Abhängigkeiten: Local Matter.js and local asset paths only.
- Seed-/Isolationrisiko: Real plugin credits coins and may launch connected actions; fixture must be socket-only with in-memory display state.
- Evidenz: Zero baseline, one synthetic coin, reset, muted audio, malformed payload, process/listener cleanup and image review.
- **Offener Blocker:** Confirm coinJar.add exact producer payload and sync count shape; never use real gift/coin event.
- Sourcebelege: `app/plugins/schnorrbecher/overlay/coincup.html`, `app/plugins/schnorrbecher/overlay/coincup.js`, `app/plugins/schnorrbecher/main.js`; Einstufung: blocked-before-practical-capture.

### spotlight — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/spotlight/overlays/chatter.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/spotlight/overlays/chatter.html → overlays/single-overlay.js`.
- Initial: On connect loads /api/lastevent/settings/chatter and /api/lastevent/last/chatter; null user renders empty state.
- Trigger/Update: lastevent.update.chatter mit `{"sessionId":"fixture-session","nickname":"Pilot Viewer","username":"pilot-viewer"}` → A current-session user replaces empty display with the chatter template; stale session updates are ignored.
- Negativ/Cleanup: 404/503/null user and stale session id leave safe empty display; no external avatar URL. Cleanup: Disconnect stops refresh timer; unload cancels animations and refresh loop.
- GPU: DOM/CSS animation.; Audio: none; externe Abhängigkeiten: Local fonts/assets; dynamic avatar URL must be local placeholder.
- Seed-/Isolationrisiko: Real last-event data may expose viewers; use synthetic response and session only.
- Evidenz: Empty→synthetic chatter→stale-session negative, API error, no private identifiers, disconnect/timer cleanup.
- **Offener Blocker:** Confirm renderer-required public user keys/template fields before practical fixture and ensure no sensitive handle leaks.
- Sourcebelege: `app/plugins/spotlight/overlays/chatter.html`, `app/plugins/spotlight/overlays/single-overlay.js`; Einstufung: blocked-before-practical-capture.

### stream-monsters — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/stream-monsters/overlay?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/stream-monsters/streammonsters-overlay.html → overlay runtime/view modules`.
- Initial: Fetches locales/audio manifest and /api/stream-monsters/state; exact visible baseline depends on isolated creator/season/encounter seed.
- Trigger/Update: streammonsters:config_updated → Configuration refresh is followed by state refetch; a synthetic idle/egg or encounter state should update corresponding arena panel.
- Negativ/Cleanup: Unavailable state/locale/audio manifest must yield explicit fallback, not create a season or mutate progression. Cleanup: pagehide/beforeunload sends overlay heartbeat cleanup and destroys render/audio/arena timers; audio disabled.
- GPU: Canvas/effects renderer; verify GPU path and fallback.; Audio: Local audio engine/manifest exists; keep playback disabled.; externe Abhängigkeiten: Same-origin state/API, locale and audio manifest; synthetic local assets only.
- Seed-/Isolationrisiko: High: progression, eggs, seasons and game state are persistent; use Docs-Capture seed-only DB and no normal runtime.
- Evidenz: Seedless and seeded-state frames, season rows unchanged, no audio, API/asset failures, full timer/heartbeat cleanup, image review.
- **Offener Blocker:** Need complete current state/seed contract; route may call season/progression code outside Docs-Capture. Do not use a generic state fixture.
- Sourcebelege: `app/plugins/stream-monsters/streammonsters-overlay.html`, `app/plugins/stream-monsters/streammonsters-overlay-runtime.js`, `app/plugins/stream-monsters/backend/streammonsters/routes.js`; Einstufung: blocked-before-practical-capture.

### stt-ticker — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/stt-ticker/overlay/ticker.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/stt-ticker/overlay/ticker.html`.
- Initial: Three classic line slots start empty; no microphone/provider is opened by the overlay itself.
- Trigger/Update: stt-ticker:transcript mit `{"text":"Synthetic caption fixture."}` → Classic ticker displays the synthetic text; stt-ticker:clear removes it. Multi/dual branches are separate follow-up cases.
- Negativ/Cleanup: Empty text, missing data, and disconnect preserve a safe empty ticker. Cleanup: Emit clear, unload mutation observer/listeners, disconnect; do not start STT backend, microphone, Deepgram, or TTS.
- GPU: CSS/DOM only.; Audio: none; externe Abhängigkeiten: Same-origin Socket.IO and local i18n.
- Seed-/Isolationrisiko: STT/TTS credentials and audio capture are out of scope; renderer fixture supplies synthetic text only.
- Evidenz: Empty baseline, one synthetic caption, clear and invalid/empty payload, proof no mic/provider, socket cleanup and image review.
- Sourcebelege: `app/plugins/stt-ticker/overlay/ticker.html`, `app/plugins/stt-ticker/main.js`; Einstufung: ready-for-isolated-fixture-review.

### talking-heads — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/talking-heads/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/talking-heads/overlay.html → assets/overlay.js`.
- Initial: Stage is idle until avatar/animation socket event and config fetch complete.
- Trigger/Update: talkingheads:animation:start → A source-valid animation start/frame changes stage/avatar position; end restores idle stage.
- Negativ/Cleanup: Unknown avatar/asset or malformed frame displays idle fallback without retaining prior animation. Cleanup: Emit animation:stop/end and pagehide; stop animation frame loops and disconnect.
- GPU: DOM/CSS sprite animation.; Audio: none in overlay asset.; externe Abhängigkeiten: Same-origin config/socket; avatar asset may be profile-backed.
- Seed-/Isolationrisiko: Avatar/profile migration and asset assignment are excluded; use existing isolated fixture asset only.
- Evidenz: Idle, synthetic animation and stop frames, no profile changes, asset fallback, animation cleanup and image review.
- **Offener Blocker:** Keep product untouched; confirm a non-profile synthetic avatar fixture and exact event payload before practical run.
- Sourcebelege: `app/plugins/talking-heads/overlay.html`, `app/plugins/talking-heads/assets/overlay.js`; Einstufung: blocked-before-practical-capture.

### toptier — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/toptier/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/toptier/overlay.html → assets/overlay.js`.
- Initial: Query parameter selects board; client emits toptier:get-board for likes/gifts and renders empty entries for inactive board.
- Trigger/Update: toptier:update mit `{"board":"likes","entries":[{"username":"fixture-liker","nickname":"Fixture Liker","profile_picture_url":"","score":42,"rank":1}],"sessionId":"fixture-session-a"}` → Matching board entries replace its data and render rank/score; other board payloads are ignored.
- Negativ/Cleanup: Inactive empty boards render the default empty state; invalid board IDs and malformed board/entry payloads are ignored. Cleanup: pagehide disconnects the owned socket and cancels spotlight/score-tick timers; queued events are inert. No TopTier session/database writes.
- GPU: DOM/CSS.; Audio: none; externe Abhängigkeiten: No external refs; fixture profile_picture_url is empty and avatars are disabled.
- Seed-/Isolationrisiko: Real ranking data is user data; all records synthetic and session scoped.
- In-process Fixture: in-process-renderer-fixture-passed-not-obs (app/plugins/toptier/test/obs-toptier-fixtures.test.js); OBS: NOT_TESTED; unabhängiger Bildreview: pending.
- Fixturebeleg: Actual overlay template + renderer + i18n client; four local locale dictionaries; direct GET/socket handler doubles; ScoreEngine._emitUpdate synthetic likes/gifts; malformed payload and pagehide cleanup assertions. No DB/plugin init/network/profile assets.
- Evidenz: Four locale title states, empty/inactive board, actual synthetic score updates, wrong-board/malformed negatives, GET errors and idempotent timer/socket cleanup.
- **Offener Blocker:** No Browser Source/OBS capture or independent visual review has been run.
- Sourcebelege: `app/plugins/toptier/overlay.html`, `app/plugins/toptier/assets/overlay.js`, `app/plugins/toptier/backend/score-engine.js`; Einstufung: in-process-renderer-fixture-passed-not-obs.

### visual-fx-frame-webgpu — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/visual-fx-frame-webgpu/overlay?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/visual-fx-frame-webgpu/renderer/index.html → overlay-controller.js`.
- Initial: Boot fetches /api/visual-fx-frame-webgpu/config then initializes WebGPU engine; config failure falls back to VISUAL_FX_DEFAULT_CONFIG.
- Trigger/Update: visual-fx-frame-webgpu:trigger → Valid trigger creates configured frame effect; clear-triggers restores idle canvas.
- Negativ/Cleanup: WebGPU unavailable or config 503 reports renderer error/fallback in debug state without throwing uncaught. Cleanup: pagehide calls engine.destroy; verify adapter/device/resources released and socket disconnected.
- GPU: WebGPU mandatory in primary engine; document fallback if unsupported.; Audio: none; externe Abhängigkeiten: Same-origin config/socket and local GPU scripts.
- Seed-/Isolationrisiko: GPU adapter/device availability and variable frame timing; use fixed low-complexity config.
- Evidenz: Default and trigger frames, config failure, unsupported GPU, renderer status, resource destruction and image review.
- **Offener Blocker:** Exact trigger schema and browser fallback behavior require source contract/test confirmation; candidate payload withheld.
- Sourcebelege: `app/plugins/visual-fx-frame-webgpu/renderer/index.html`, `app/plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js`, `app/plugins/visual-fx-frame-webgpu/main.js`; Einstufung: blocked-before-practical-capture.

### weather-control — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/weather-control/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/weather-control/overlay.html → weather-engine.js`.
- Initial: Loads local weather config and gamification state; canvas is idle until weather:trigger.
- Trigger/Update: weather:trigger → A valid bounded effect event changes canvas/weather scene; weather:stop returns baseline.
- Negativ/Cleanup: Empty/invalid config and disconnected socket leave transparent/idle scene; never call weather provider. Cleanup: Send weather:stop, unload and verify animation/audio timers and socket reconnect loop stop.
- GPU: Canvas 2D effects.; Audio: Sound effects supported by overlay; mute audio output.; externe Abhängigkeiten: Same-origin config/gamification API; no external static assets.
- Seed-/Isolationrisiko: Config may enable live event gamification; no backend or persisted state, synthetic renderer event only.
- Evidenz: Idle, synthetic weather, stop, denied config API, muted audio, no provider and cleanup.
- **Offener Blocker:** Exact weather:trigger payload and engine stop semantics must be sourced before fixture injection.
- Sourcebelege: `app/plugins/weather-control/overlay.html`, `app/plugins/weather-control/main.js`; Einstufung: blocked-before-practical-capture.

### webgpu-emoji-rain — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/plugins/webgpu-emoji-rain/overlay.html?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/webgpu-emoji-rain/overlay.html → gpu/engine.js`.
- Initial: WebGPU engine starts enabled with empty queues; debug state distinguishes ready/fallback.
- Trigger/Update: webgpu-emoji-rain:spawn mit `{"type":"like","username":"Pilot Viewer","count":1,"x":0.5,"y":0.15,"duration":1200}` → One GPU sprite appears; clear event empties effects; WebGPU unavailable follows explicit fallback hint.
- Negativ/Cleanup: Invalid normalized coordinates or unavailable GPU must be bounded and reported, not crash renderer. Cleanup: Clear events, pagehide/destroy engine, stop rate timer and release GPU resources.
- GPU: WebGPU primary with renderer fallback handling.; Audio: none; externe Abhängigkeiten: Local GPU scripts and Socket.IO.
- Seed-/Isolationrisiko: GPU and animation nondeterminism; low-rate single synthetic spawn only.
- Evidenz: Ready/idle, one spawn, clear, unsupported GPU/error state, bounds, timers/resources and image review.
- **Offener Blocker:** Confirm spawn schema and fallback contract from current GPU test fixtures before screenshot run.
- Sourcebelege: `app/plugins/webgpu-emoji-rain/overlay.html`, `app/plugins/webgpu-emoji-rain/gpu/engine.js`, `app/plugins/webgpu-emoji-rain/main.js`; Einstufung: blocked-before-practical-capture.

### webgpu-fireworks — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/webgpu-fireworks/overlay?lang={de|en|es|fr}`, 1280×720; Einstieg: `app/plugins/webgpu-fireworks/overlay.html → gpu/engine.js`.
- Initial: WebGPU canvas initializes in idle state; socket registers an overlay instance and trigger admission is scope-gated.
- Trigger/Update: webgpu-fireworks:trigger → Only a correctly scoped trigger is admitted and acknowledged; renderer produces one bounded burst.
- Negativ/Cleanup: Missing/mismatched scope or expired benchmark admission must be rejected with reason and no effect. Cleanup: Destroy engine on pagehide, clear active/finale queue, release GPU resources and socket; no preview/audio invocation.
- GPU: WebGPU; explicit admission/renderer status path.; Audio: Audio engine exists; keep audio disabled/muted.; externe Abhängigkeiten: Local JS only.
- Seed-/Isolationrisiko: GPU, audio and benchmark/session scoping; only synthetic fixture scope with short admission may be used.
- Evidenz: Idle, accepted scoped trigger, rejected scope/expiry, renderer status, audio muted and GPU cleanup.
- **Offener Blocker:** Scoped event schema and overlay registration response must be established from renderer tests; no guessed payload.
- Sourcebelege: `app/plugins/webgpu-fireworks/overlay.html`, `app/plugins/webgpu-fireworks/gpu/engine.js`, `app/plugins/webgpu-fireworks/main.js`; Einstufung: blocked-before-practical-capture.

### webgpu-weather-control — de/en/es/fr

- URL/Größe: `http://127.0.0.1:3000/webgpu-weather-control/overlay?lang={de|en|es|fr}`, 1920×1080; Einstieg: `app/plugins/webgpu-weather-control/overlay.html`.
- Initial: Initializes WebGPU engine then requests overlay config; config failure leaves transparent canvas. On connect emits client-ready and permanent-effects request.
- Trigger/Update: webgpu-weather:trigger → Valid effect is rendered; stop/stop-effect clears it. Gamification HUD remains hidden unless config.overlay.enabled is true.
- Negativ/Cleanup: Config 503 and unsupported WebGPU preserve transparent/error-safe state; no external provider call. Cleanup: Stop effects, cancel requestAnimationFrame and destroy GPU resources/socket on pagehide.
- GPU: WebGPU framegraph/cinematic engine.; Audio: none confirmed in overlay entrypoint.; externe Abhängigkeiten: Same-origin config and Socket.IO; local renderer scripts.
- Seed-/Isolationrisiko: WebGPU availability, config seed, and ongoing animation telemetry; synthetic only.
- Evidenz: Transparent baseline, bounded effect, stop, API failure, HUD hidden/enabled state, telemetry stop and GPU release.
- **Offener Blocker:** Trigger schema and engine destroy lifecycle need a source-backed fixture before practical run.
- Sourcebelege: `app/plugins/webgpu-weather-control/overlay.html`, `app/plugins/webgpu-weather-control/main.js`; Einstufung: blocked-before-practical-capture.

## Ablauf pro Locale-Fall

1. Exakte lokale URL, Query, Auflösung und tatsächliche Asset-/Routeauflösung gegen Matrix prüfen; alle externen Requests protokolliert blockieren.
2. Frische isolierte Szene mit leerer Baseline und sämtlichen Integrationen/Backends aus starten; initiale Sichtbarkeit/Fehler dokumentieren.
3. Nur den Fall-spezifischen synthetischen Fixturetrigger einmal senden; Eventname, Payloadhash und erwartete sichtbare Änderung sichern.
4. Negativfall separat ausführen, Fehlerzustand und Console protokollieren; Effekte, Socket, Intervalle, Audio und GPU-Ressourcen stoppen.
5. Szene-/Quellenbaseline, Prozess/Port/Cleanup, Stream/Record-off und Bildsemantik unabhängig prüfen. Status bleibt bis unabhängiger Bildreview „review-pending“.

## Matrixdatei

`docs/coordination/obs-104-acceptance-matrix.json` enthält 104 eindeutige `plugin:locale`-IDs: 100 aktive Rendererfälle plus vier Chatango-Retirement-Kontrollen. Alle 104 bleiben bis zur praktischen Prüfung `NOT_TESTED`.

