# Sidekick-Host Demo

Nachtbau-Demo des KI-Hosts. Liest Chat aus einem lokalen Test-Feed, antwortet über `llm-providers.js` mit dem festen Modell `openrouter/free` und fällt bei Ausfall, Timeout oder Budget auf Textvorlagen zurück.

## Startbefehl (ohne Netz)

Aus dem Ordner `app/`:

```bash
npm run sidekick:demo
```

Ohne Schalter läuft die Demo vollständig lokal. Es wird kein Key gelesen und kein Netzwerkaufruf gemacht. Alle Antworten kommen aus Textvorlagen.

## Live-Betrieb (opt-in)

Netzwerk nur mit ausdrücklichem Schalter:

- `SIDEKICK_LIVE=1` muss gesetzt sein. Ohne diesen Schalter wird nie ein Key gelesen.
- Key aus Umgebungsvariable `OPENROUTER_API_KEY` oder lokal aus `app/sidekick-host/local-config.json` mit `{ "openrouterApiKey": "..." }`. Die Datei ist per `.gitignore` ausgeschlossen.
- Erlaubte Modelle: nur `openrouter/free` oder Modelle mit Endung `:free`. Alles andere wird vor jedem Request abgelehnt.
- Budget: höchstens 10 Live-Anfragen pro Engine. Danach nur noch Textvorlagen.

Live-Check (höchstens 10 Anfragen, nur mit Schalter):

```bash
SIDEKICK_LIVE=1 npm run sidekick:live-check
```

Das Skript gibt nur Zählwerte und die Modell-ID aus. Der Key erscheint nicht in Ausgabe, Log oder Fehlermeldungen.

## Log

Jeder Demo-Lauf schreibt ein JSON-Lines-Log nach `%TEMP%\ltth-sidekick-demo.log` (Windows) bzw. `$TMPDIR/ltth-sidekick-demo.log`. Es enthält Test-Feed-Nachrichten und Ergebnisse. Das Log wird nicht in Slack oder PRs eingefügt.

## Tests

```bash
npx jest --runInBand test/sidekick-host-demo.test.js --verbose
```

Die Tests nutzen injizierte Requests und einen Netzwerk-Guard. Sie brauchen kein Internet und keinen Key. Gate-Läufe nur mit explizit aufgerufenem Node 22 (nicht aus dem PATH).

| Testdatei (unter `app/test/`) | Deckt ab |
|---|---|
| `sidekick-host-demo.test.js` | Allowlist, Ports, Planner, Rate-Limit, Reply-Filter, LLM-Gratis-Sperre, Text-/Animaze-Adapter und den Demo-Lauf. |
| `sidekick-host-fixture.test.js` | Den synthetischen Vergleichs-Feed und die Offline-Wiedergabe von `fixture-play.js`. |
| `sidekick-host-live-read.test.js` | Die nur lesende Live-Chat-Schnittstelle und die Offline-Wiedergabe des Live-Read-Fixtures. |
| `sidekick-host-chatuser.test.js` | Dass die Chat-Identität bis in die Plugin-Adapter durchgereicht wird (pro Zuschauer). |
| `sidekick-host-wire.test.js` | Die Verdrahtung der Musik-Befehle (`!song`) über den Music-Bot-Adapter. |

## Vergleichs-Fixture (offline)

`demo/fixture-feed.jsonl` hat 200 synthetische Nachrichten (`viewer_01` bis `viewer_24`): alle vier Befehle, Spam, Beleidigungen, Prompt-Injection und Leerlauf. Keine echten Namen.

```bash
npm run sidekick:fixture
```

Das Skript liest keinen Key und öffnet kein Netz. `gapMs` schiebt nur eine virtuelle Uhr, damit Leerlauf das Rate-Limit öffnet. Die Zusammenfassung zählt Antwortquote, Plugin-Wechsel, vom Ausgabe-Filter verworfene Texte und Fallbacks auf Textvorlagen.

## Live-Chat-Adapter (nur lesend, Fixture)

Der Adapter `adapters/live-read-adapter.js` ist die Schnittstelle von einer echten Live-Chat-Quelle zum Host. Er ist ausschliesslich lesend:

- Nur `start`, `poll` und `stop` sind vorhanden. Es gibt keine `send`-, `reply`-, `post`- oder Moderationsmethode.
- Er konsumiert nur einen injizierten Stream (`connect`/`read`/`close`). Kein Netzwerk, kein Key, kein Config-Zugriff in diesem Modul.
- Er normalisiert Roh-Events auf `{ type, text }`: bekannt sind `chat`, `gift`, `follow`; alles andere wird `{ type: 'other', text: '' }`.
- Identität (username, uniqueId, nickname, userId) wird entfernt. Namen erscheinen nie in den Events oder im Log.

Für Tests ohne echte Verbindung liefert `adapters/live-read-stream.js` eine Fixture-Queue (`createFixtureStream`). Das Fixture `demo/live-read-fixture.jsonl` enthält ausschliesslich synthetische Viewer und deckt `chat`, `gift`, `follow` und unbekannte Typen (`like`, `share`) ab.

```bash
npm run sidekick:live-read-fixture
```

Das Skript liest keinen Key und öffnet kein Netz. Es zählt nur die normalisierten Typen. Die Vertragstests laufen offline:

```bash
npx jest --runInBand test/sidekick-host-live-read.test.js --verbose
```

## Modul-Überblick

Alle Dateien unter `app/sidekick-host/` mit ihrer Aufgabe. Die Befehle sind die
feste Allowlist aus `command-allowlist.js`; Adapter bekommen ihren Transport
injiziert und öffnen selbst kein Netz.

### Kern (Host-Lauf)

| Datei | Aufgabe |
|---|---|
| `command-allowlist.js` | Feste Befehlsliste: `!quiz`, `!song`, `!sound`, `!connect4`. `parseChatCommand` liefert `{ name, args }` oder `null`; alles andere wird ignoriert. |
| `plugin-port.js` | `createPluginPort` baut einen eingefrorenen Port mit `id`, `commands` und `handle`. Die Befehle werden gegen die Allowlist validiert, der Handler gibt nur Text zurück und sieht nie rohen Chat. |
| `show-planner.js` | `ShowPlanner` hält eine feste Rotation von Ports (`active`, `allowedCommands`, `switchTo`, `advance`). Nur der aktive Port ist gültig, mindestens zwei Ports sind Pflicht. |
| `host-core.js` | `HostCore` liest Chat und entscheidet. Befehle gehen an den aktiven Port, freier Chat erzeugt nur Text. Kennt nur Planner, Ausgabe-Adapter, Reply-Engine und Rate-Limiter, nicht Animaze. |
| `llm-reply.js` | Antwort über `llm-providers.js` mit festem Modell `openrouter/free`, Gratis-Sperre, Timeout, Budget und Fallback auf Textvorlagen. |
| `templates.js` | Textvorlagen (`fallbackReply`) für den Fallback, wenn das LLM fehlt, aus ist oder zu langsam antwortet. |
| `rate-limiter.js` | `RateLimiter`: Sliding-Window-Limit für chat-basierte Antworten (Standard 18 pro Minute). |
| `reply-filter.js` | `applyReplyFilter`: entfernt Links, Mentions und Steuerzeichen, blockt definierte Inhalte, kürzt auf 200 Zeichen. Fällt der Filter durch, wird nichts ausgegeben. |

### Adapter (Ausgabe und Quelle)

| Datei | Aufgabe |
|---|---|
| `adapters/text-adapter.js` | Reine Textausgabe (`say`/`emote`) über eine injizierte `write`-Funktion. |
| `adapters/animaze-adapter.js` | Animaze nur als Adapter mit injiziertem `transport.send` (`say`/`emote`). Öffnet selbst keine Verbindung, `HostCore` kennt Animaze nicht. |
| `adapters/live-read-adapter.js` | Nur lesende Schnittstelle zur Live-Chat-Quelle: `start`/`poll`/`stop`. Normalisiert auf `{ type, text }` (`chat`, `gift`, `follow`, sonst `other`) und entfernt Identität. Keine Sende-, Reply- oder Moderationsmethode. |
| `adapters/live-read-stream.js` | Fixture-Queue (`createFixtureStream`) mit `connect`/`read`/`close` für Tests ohne echte Verbindung. |
| `adapters/quiz-adapter.js` | Host-Port auf die Quiz-HTTP-Routen: `start({ next })` und `answer({ userId, username, message })`. Fehler bleiben in `{ ok: false, code, text }`. |
| `adapters/connect4-adapter.js` | Host-Port auf die Game-Engine-Routen: `start({ opponentType, player1Name, player2Name })` und `move({ sessionId, player, column })`. Erlaubte Spalte: `A`-`G`. |
| `adapters/music-bot-adapter.js` | Host-Port auf die Music-Bot-Routen: `queue`, `enqueue`, `play`, `skip`, `status`. Bildet `messageKey` und HTTP-Status auf feste Fehlercodes ab (z. B. `locked`, `duplicate`, `cooldown`, `stale`). |

### Demo-Ports und Test-Fakes

| Datei | Aufgabe |
|---|---|
| `demo-plugins.js` | `createDemoPorts`: drei Ports (`quiz-show`, `music-sound`, `connect4`) für die Demo. `!song` geht durch den Music-Bot-Adapter, `!sound` reiht nichts ein, `!quiz` und `!connect4` halten ihren Sitzungszustand. |
| `testing/fake-quiz.js` | In-Memory-Ersatz für die Quiz-Routen mit festen Fragen. Kein Socket, kein Key. |
| `testing/fake-game-engine.js` | In-Memory-Ersatz für die Game-Engine-Routen; nutzt die echte `Connect4Game`-Logik. Kein Socket, kein Key. |
| `testing/fake-music-bot.js` | In-Memory-Ersatz für die Music-Bot-Routen (Katalog, Limits, Sperren). Startet kein mpv, kein Socket, kein Key. |
| `testing/live-read-fixture.js` | Lädt `demo/live-read-fixture.jsonl` und baut daraus einen Fixture-Stream. |

### Runner und Skripte

| Datei | Aufgabe |
|---|---|
| `demo.js` | Startpunkt für `npm run sidekick:demo`: liest nur `demo/test-feed.jsonl`, kein Live-Anschluss, schreibt das JSON-Lines-Log. |
| `fixture-play.js` | `npm run sidekick:fixture`: spielt `demo/fixture-feed.jsonl` offline ab und zählt Antwortquote, Plugin-Wechsel, gefilterte Texte und Fallbacks. |
| `live-read-fixture-play.js` | `npm run sidekick:live-read-fixture`: spielt das Live-Read-Fixture offline ab und zählt nur die normalisierten Typen. |
| `live-check.js` | `npm run sidekick:live-check`: kurzer Live-Check von `openrouter/free`, nur mit `SIDEKICK_LIVE=1`, höchstens 10 Anfragen; gibt nur Zählwerte und die Modell-ID aus. |

### Fixtures und Doku

| Datei | Aufgabe |
|---|---|
| `demo/test-feed.jsonl` | Lokaler Test-Feed für `demo.js`. |
| `demo/fixture-feed.jsonl` | 200 synthetische Nachrichten (`viewer_01` bis `viewer_24`) inkl. Spam, Beleidigungen, Prompt-Injection und Leerlauf. Keine echten Namen. |
| `demo/live-read-fixture.jsonl` | Nur synthetische Viewer für den Live-Read-Adapter; deckt `chat`, `gift`, `follow` und unbekannte Typen ab. |
| `GAP.md` | Offene Plugin-Schnittstellen mit exakter Oberfläche und Begründung (kein Wunschzettel). |
| `.gitignore` | Schließt nur `local-config.json` (Key) aus. |

## Lücken (Stand dieses Branches)

- Der echte Live-Chat-Anschluss fehlt weiterhin. Vorhanden sind die nur lesende Schnittstelle und ein Fixture-Stream; die reale Eulerstream-/TikTok-Verbindung (Reconnect, Key aus externer Quelle) folgt in `lt-4r0`.
- Der Animaze-Transport ist nicht verdrahtet. Für die Demo reicht der Text-Adapter.
- `openrouter/free` ist nur teilweise geprüft: Live-Check am 15.10. um 22:0x, 10 Anfragen, 5 Antworten, 5 Fehler der Klasse `error`. Antwortqualität und Latenz sind nicht bewertet.
- Der Lesetest (ab 09:00) ist nicht Teil dieser Demo und läuft nur im freigegebenen Rahmen.
