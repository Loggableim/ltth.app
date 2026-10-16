# Music-Bot AP1: Host-Schnittstelle

Stand gelesen auf `edc33360420291e5b1262362932cd76bf00dfecb` (Head von #154).
Nur Beschreibung. Kein Code, keine Implementierung.

Der Host-Kern kennt den Music Bot nicht. Die Demo antwortet auf `!song` und `!sound` mit festem Text (`app/sidekick-host/demo-plugins.js:12-17`). Der Music Bot hat eine eigene Chat-Sprache (`!sr`, Alias `!song`) und HTTP-Routen. AP1 verbindet beides über einen Port, der nur Text zurückgibt.

## 1. Schnittstelle heute

### Queue

- Anlegen und Grenzen: `QueueManager.addSong` (`app/plugins/music-bot/lib/queue-manager.js:112-157`). Ablehnung in `_validateSong` (`:316-401`): fehlende Daten, volle Queue, Dauer, Duplikat, Limit pro Nutzer, Cooldown.
- Lesen: `getQueue` (`:33-35`), HTTP `GET /api/plugins/music-bot/queue` (`app/plugins/music-bot/main.js:2530-2535`).
- Nächster Titel: `shiftNext` (`queue-manager.js:159-163`). Zurück nach vorn bei Player-Ausfall: `returnToFront` (`:165-174`).
- Entfernen und Umsortieren: `removeSong` (`:185-195`), `reorderSong` (`:197-208`). HTTP `DELETE /api/plugins/music-bot/queue/:index` (`main.js:2860-2876`), `POST /api/plugins/music-bot/queue/reorder` (`:2878-2896`).
- Chat `!queue` nennt nur die Länge (`main.js:3260-3262`). Defaults: max. 50, 3 pro Nutzer, 360 s, Cooldown 30 s (`main.js:120-128`).

### Play

- Player: `PlaybackController.play` (`app/plugins/music-bot/lib/playback-controller.js:78-105`). Track braucht `url`, `localPath` oder `streamUrl` (`:81-83`). Darunter `PlaybackEngine.play` (`app/plugins/music-bot/lib/playback-engine.js:116-128`).
- Nächsten Queue-Titel starten: `_playNextFromQueue` (`main.js:3780-3806`), eigentlicher Schritt `_advancePlayback` (`:3815`).
- Titel aus der Queue sofort: `POST /api/plugins/music-bot/queue/:index/play` (`main.js:2898-2939`). Zieht den Titel nach vorn und überspringt den aktuellen, oder startet die Queue, wenn nichts läuft.
- Chat-Request: Alias `song`/`play`/`request` für `!sr` (`main.js:91-106`), Dispatch `case 'request'` (`:3247-3248`).
- Dashboard: `POST /api/plugins/music-bot/request` (`:2537-2552`).

### Skip

- Player: `PlaybackController.skip` (`playback-controller.js:164-187`), Engine `PlaybackEngine.skip` (`playback-engine.js:339-350`).
- Plugin: `_skipCurrent` (`main.js:3732-3749`). Ohne laufenden Titel `{ success: false, error: 'Nothing is playing' }` (`:3734-3736`).
- HTTP: `POST /api/plugins/music-bot/skip` (`:2554-2570`). Socket `musicbot:dashboard-skip` (`:3112-3118`).
- Chat `!skip` ist eine Abstimmung, außer `command.force` (`:3249-3253`). Vote-Stand: `addVoteSkip` (`queue-manager.js:71-102`).

### Status-Events

- HTTP-Snapshot: `GET /api/plugins/music-bot/status` (`main.js:2374-2377`), Felder in `_buildStatusPayload` (`:4814-4836`): `nowPlaying`, `queueLength`, `playbackState`, Lautstärke, `autoDJ`, `mpvAvailable`, `runtime`, `health`.
- Socket-Startbild: `musicbot:request-status` (`:3094-3110`) sendet `now-playing`, `queue-update`, `volume-changed`, `runtime`, `resolver`, `health`, `next-song-vote`.
- Laufende Ereignisse: `musicbot:queue-update` (`:4197-4202`), `musicbot:song-added` (`:4205-4212`), `musicbot:now-playing` (`:4247-4248`), `musicbot:song-skipped` (`:4215-4220`), `musicbot:playback-advancing` (`:4256-4261`), `musicbot:paused` (`:4231-4232`), `musicbot:resumed` (`:4235-4236`), `musicbot:playback-stopped` (`:4239-4240`), `musicbot:error` (`:4243-4244`), `musicbot:vote-skip-update` (`:4264-4272`).
- Player-intern, nicht die HTTP-API: `track-start` (`playback-controller.js:805`), `track-end` (`:949`), `error` (`:863`), `crashed` (`:874`), `heartbeat-failure-confirmed` (`:885`), `transition` (`:1099`).

### Fehler

- Queue: `Invalid song data` (`queue-manager.js:318`), `Queue is full` (`:322`), Dauer unbekannt (`:336-341`), zu lang (`:344-349`), Duplikat (`:357-363`), Nutzerlimit (`:374-379`), Cooldown (`:391-396`), falsche Position (`:187`), `QUEUE_ITEM_CHANGED` (`:190`).
- Play/Skip gesperrt: Safety-Lock, HTTP 423, Text in `_lockedResult` (`main.js:1401-1406`). Dieselbe Sperre auf Skip (`:2555-2558`), Queue-Play (`:2899-2902`) und Advance (`:3819-3820`).
- Nichts läuft: `_skipCurrent` (`:3734-3736`). Queue-Play veraltet: HTTP 409 (`:2920-2925`).
- Resolve: fehlende Query HTTP 400 (`:2539-2541`), Resolver-Text an den Chat (`:3475-3478`). Zweiter Request derselben Person (`:3441-3443`).
- Bans: Nutzer (`main.js:3565-3566`, Chattext `:3590`), Track/URL (`:3568-3570`), Künstler (`:3572-3573`), Keyword (`:3575-3579`), Kanal (`:3581-3582`). Texte `:3587-3594`.
- Player startet nicht: ungültiger Track (`playback-controller.js:81-83`), Controller nicht aktiv oder Safety-Lock (`:1164-1170`). mpv fehlt: `ENOENT` (`main.js:3758-3764`), Titel zurück an den Queue-Anfang und `musicbot:error` (`:3767-3774`).
- Seek liegt daneben und ist nicht der AP1-Mindestpfad: `PLAYBACK_SEEK_INVALID_POSITION`, `PLAYBACK_SAFETY_LOCKED`, `PLAYBACK_SEEK_STATE`, `PLAYBACK_STALE_ID` (`playback-controller.js:897-928`), HTTP 400/409/422/423/503 (`main.js:2596-2606`).

## 2. Host-Kern, minimal

`HostCore` bleibt unverändert. Er kennt nur Planner, Textausgabe, Reply-Engine und Rate-Limit (`app/sidekick-host/host-core.js:8-15`). Ein Befehl läuft nur, wenn er auf der festen Liste steht und das Plugin aktiv ist (`:36-42`). Die Antwort ist Text und geht durch Rate-Limit und Filter (`:18-26`, `plugin-port.js:25-31`).

Minimal für AP1:

- Ein Port `music-sound` bleibt bei `!song` und `!sound` (`demo-plugins.js:12-17`). `!song` ruft den Adapter. `!sound` bleibt der bisherige Text. Der Music Bot hat kein `!sound` (`main.js:90-118`).
- Der Port bekommt den Adapter injiziert. `HostCore` importiert weder den Music Bot noch mpv noch HTTP.
- Rückgabe nur `{ text }`. Keine Stream-URL, kein Playback-Handle, kein Socket in den Chat-Text.
- Fehler werden vor `emitChatText` zu einem kurzen Satz. Der Host spricht nicht die rohe Exception.
- Kein zweiter Chat-Parser. `!song` im Host ist der Allowlist-Befehl. Im Music Bot ist `song` nur ein Alias von `!sr` (`main.js:106`). AP1 darf nicht beide Parser auf dieselbe Zeile ansetzen.
- Keine neuen Zugangsdaten. Die bestehenden Control-Routen laufen lokal. `SIDEKICK_LIVE` bleibt der LLM-Schalter und schaltet den Music Bot nicht ein.
- Nichts in einen fremden Stream senden. Status-Events liest der Adapter, er schreibt sie nicht in TikTok.

Nicht minimal und damit außerhalb: Auto-DJ, Radio, Seek, Lautstärke, Pause, Bans verwalten, History, Playlists.

## 3. Tests, die fehlen

Im Sidekick-Host gibt es keinen Music-Bot-Test. Die Plugin-Suites (`app/test/music-bot-queue-manager.test.js`, `music-bot-playback-controller.test.js`, `music-bot-ban-list.test.js`, `music-bot-safety-runtime.test.js`) ersetzen die Port-Grenze nicht. Je Fehlerfall eine Zeile, alle mit injiziertem Request und ohne mpv:

- Volle Queue: `addSong` liefert `queueFull`, der Port spricht einen Satz, `play` wird nicht gerufen.
- Song ohne Titel oder URL: `queueInvalidSong`, kein Eintrag in der Queue.
- Dauer nicht endlich oder nicht positiv: `queueDurationUnknown`, kein Play.
- Dauer über `maxSongDurationSeconds`: `queueDurationTooLong`, kein Play.
- Duplikat bei eingeschalteter Erkennung: `queueDuplicate`, die Queue-Länge bleibt gleich.
- Nutzerlimit `maxPerUser`: `queueUserLimit`, kein weiterer Eintrag.
- Cooldown `cooldownPerUserSeconds`: `queueCooldown`, kein zweiter Request im Fenster.
- Nutzer-Ban: Chattext aus `requestUserBlocked`, kein Resolve.
- Track- oder URL-Ban: `banSong`, der Titel wird nicht angehängt.
- Künstler-Ban: `banArtist`, kein Anhängen.
- Keyword-Ban: `banKeyword`, kein Anhängen.
- Kanal-Ban: `banChannel`, kein Anhängen.
- Safety-Lock: Skip und Queue-Play liefern den Lock-Text, HTTP-Status 423, der Player wird nicht gerufen.
- Skip ohne laufenden Titel: Text `Nothing is playing`, die Queue bleibt stehen.
- Queue-Play mit veraltetem `songId`: HTTP 409, kein `reorderSong`.
- Queue-Index keine ganze Zahl oder negativ: HTTP 400, Queue unverändert.
- mpv `ENOENT`: Fehlertext, `returnToFront`, der Host wirft nicht.
- Resolver ohne Erfolg: der Port spricht die Resolver-Meldung und hängt nichts an.
- Zweiter Request, während der erste noch läuft: Text zum laufenden Request, kein zweiter Resolve.
- `!sound` im aktiven Music-Port: nur der bisherige Text, kein Queue- und kein Play-Aufruf.
- `!song`, während ein anderes Plugin aktiv ist: ignoriert, der Adapter wird nicht gerufen.

## 4. Adapter, Vorschlag

Kein Code. Der Port hält diese Funktionen. `transport` ist injiziert (HTTP gegen die bestehenden Routen oder ein Fake in Tests).

- `queue()` liest `GET /api/plugins/music-bot/queue`. Eingabe keine. Ausgabe `{ ok: true, length: number }` oder `{ ok: false, text: string }`.
- `enqueue({ query, requestedBy })` entspricht `POST /api/plugins/music-bot/request`. `query` ist der Rest von `!song` nach dem Allowlist-Filter (maximal 3 Argumente, `^[a-z0-9_-]{1,20}$`, `command-allowlist.js:6-7`). Ausgabe `{ ok: true, position: number, title: string }` oder `{ ok: false, code: string, text: string }`.
- `play({ index, songId })` entspricht `POST /api/plugins/music-bot/queue/:index/play`. Ausgabe `{ ok: true, title: string }` oder `{ ok: false, code: string, text: string }`.
- `skip({ reason })` entspricht `POST /api/plugins/music-bot/skip`. `reason` ist ein festes Wort des Hosts (`host`), kein Chat-Rohtext. Ausgabe `{ ok: true, nextTitle: string | null }` oder `{ ok: false, code: string, text: string }`.
- `status()` liest `GET /api/plugins/music-bot/status`. Ausgabe `{ nowPlayingTitle: string | null, queueLength: number, playbackState: string, locked: boolean }`. URLs und Playback-IDs bleiben intern.

`code` ist einer von `queue-full`, `invalid-song`, `duration`, `duplicate`, `user-limit`, `cooldown`, `banned`, `locked`, `idle`, `stale`, `bad-index`, `player`, `resolve`, `busy`. `text` ist der Satz, den der Port an `HostCore` gibt. Der Adapter wirft nicht in den Chat-Pfad. Ein Transportfehler wird `{ ok: false, code: 'player', text }` und zählt als kein Play.

## 5. Vertragstests

Fake und Referenz-Adapter, kein Produktivcode:

- `app/sidekick-host/testing/fake-music-bot.js`
- `app/sidekick-host/testing/contract-music-adapter.js`
- `app/sidekick-host/testing/music-adapter-contract.js`
- `app/test/sidekick-host-music-adapter-contract.test.js` gegen den Fake
- `app/test/sidekick-host-music-adapter-prod.test.js` gegen `app/sidekick-host/adapters/music-bot-adapter.js`

Die Prod-Datei ist rot, solange dieses Modul fehlt. Takt macht sie grün, indem `createMusicBotAdapter({ transport })` dieselben Fälle besteht. `HostCore` wird dafür nicht geändert.

Tests, die den Host-Kern von #154 (`edc33360420291e5b1262362932cd76bf00dfecb`) aufrufen, ohne ihn zu ändern:

- `!song` bei aktivem Quiz wird ignoriert (`sidekick-host-music-adapter-contract.test.js`, Host-Grenze).
- `!sound` spricht nur Text und ruft die Queue nicht (`sidekick-host-music-adapter-contract.test.js`, Host-Grenze).
- Text bei voller Queue läuft durch `HostCore.emitChatText` (`sidekick-host-music-adapter-contract.test.js`, Host-Grenze).
- Bestehend und weiter grün: `app/test/sidekick-host-demo.test.js` (Allowlist, inaktives Plugin, Rate-Limit, Filter, freier Chat, Animaze) und `app/test/sidekick-host-fixture.test.js`.

Die Fälle in `sidekick-host-music-adapter-prod.test.js` importieren `HostCore` nicht.
