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

## Live-Chat-Quelle (Eulerstream, nur lesend)

`adapters/live-read-source.js` verbindet die echte Live-Chat-Quelle mit dem Adapter. Die Quelle
wird injiziert (z. B. `modules/adapters/EulerstreamAdapter.js`, der `chat`, `gift` und `social`
sendet). Dieses Modul öffnet selbst kein Netz und liest keinen Key:

- Es abonniert ausschliesslich mit `on`/`off`. Es gibt keinen `send`-, `reply`-, `post`-, `write`-
  oder Moderationsaufruf. Getestet wird das gegen eine Fake-Quelle, die jeden Aufruf mitschreibt.
- Es reduziert Roh-Events auf `{ type, text }`: `chat`, `gift` und `follow`. Eulerstream sendet
  Follows als `social`; als Follow zählt `action === 1` oder ein Anzeigetyp mit `follow`
  (Shares mit `action === 2` werden verworfen).
- Identität (username, uniqueId, userId, nickname) wird nicht kopiert.
- Reconnect: Bei `disconnected` wird `connect()` auf einer festen Delay-Leiter erneut versucht,
  höchstens `maxAttempts` mal. Der Scheduler ist injizierbar, damit Tests nicht warten.
  `EulerstreamAdapter` verbindet sich selbst neu, deshalb ist die Leiter standardmässig aus und
  für einfache injizierte Quellen gedacht.

`adapters/live-read-keys.js` liest den Eulerstream-Fallback-Key von einer Quelle **ausserhalb des
Repos** (Umgebungsvariable `EULER_FALLBACK_API_KEY` oder Datei über `EULER_FALLBACK_KEY_FILE`).
`describeKeySource` und `redactKey` liefern nur eine gekürzte Beschreibung; der Key erscheint nie
in Ausgabe, Log, Fehlermeldung oder PR. Die Datei liegt nie im Repo und wird nie committet.

```bash
npm run sidekick:live-read-eulerstream
```

Das Skript spielt `demo/live-read-fixture.jsonl` über eine In-Memory-Quelle ab. Es liest keinen
Key und öffnet kein Netz; die echten Live-Tests (`EULER_FALLBACK_API_KEY`) laufen nur auf Cids PC.

Die Tests laufen offline gegen die Fake-Quelle und eine Fake-Uhr:

```bash
npx jest --runInBand test/sidekick-host-live-read-source.test.js --verbose
```

## Aufbau

| Datei | Aufgabe |
|---|---|
| `command-allowlist.js` | Feste Befehlsliste: `!quiz`, `!song`, `!sound`, `!connect4`. Alles andere wird ignoriert. |
| `plugin-port.js` | Plugin-Port mit fester Befehlsliste je Plugin. Validiert gegen die Allowlist. |
| `show-planner.js` | Wechsel zwischen Plugins. Nur die Befehle des aktiven Plugins sind gültig. |
| `host-core.js` | Liest Chat. Befehle gehen an den aktiven Port. Freier Chat erzeugt nur Text. |
| `llm-reply.js` | Antwort über `llm-providers.js`, Gratis-Sperre, Timeout, Budget, Fallback. |
| `live-check.js` | Kurzer Live-Check, nur mit `SIDEKICK_LIVE=1`, höchstens 10 Anfragen. |
| `templates.js` | Textvorlagen für den Fallback. |
| `rate-limiter.js` | Sliding-Window-Limit für Chat-Antworten. |
| `reply-filter.js` | Entfernt Links, Mentions, Steuerzeichen. Blockt definierte Inhalte. |
| `adapters/text-adapter.js` | Reine Textausgabe. |
| `adapters/animaze-adapter.js` | Animaze nur als Adapter mit injiziertem Transport. `HostCore` kennt Animaze nicht. |
| `adapters/live-read-adapter.js` | Nur lesende Schnittstelle zur Live-Chat-Quelle: `start`/`poll`/`stop`, normalisierte Events, Identität entfernt. |
| `adapters/live-read-stream.js` | Fixture-Queue mit `connect`/`read`/`close` für Tests ohne echte Verbindung. |
| `adapters/live-read-source.js` | Nur lesende Eulerstream-Quelle: `connect`/`read`/`close`, Follow-Erkennung, bounded Reconnect. |
| `adapters/live-read-keys.js` | Liest den Fallback-Key aus externer Quelle (`EULER_FALLBACK_API_KEY`/`EULER_FALLBACK_KEY_FILE`), redigiert. |
| `testing/live-read-fixture.js` | Lädt `demo/live-read-fixture.jsonl` und baut daraus einen Fixture-Stream. |
| `testing/fake-live-source.js` | In-Memory-Fake der Live-Quelle; zeichnet alle Aufrufe auf (Read-Only-Nachweis). |
| `live-read-fixture-play.js` | Spielt das Live-Read-Fixture offline ab und zählt normalisierte Typen. |
| `live-read-eulerstream-play.js` | Spielt das Fixture über die Eulerstream-Quelle offline ab (Reconnect/Key nicht nötig). |
| `demo.js` | Startpunkt für die Demo. |
| `fixture-play.js` | Spielt `demo/fixture-feed.jsonl` offline ab und zählt. |

## Lücken (Stand dieses Branches)

- Die Eulerstream-/TikTok-Verbindung ist jetzt als nur lesende Quelle vorhanden (Bridge, Follow-Erkennung, bounded Reconnect, Key aus externer Quelle). Offen: der echte Live-Lauf mit `EULER_FALLBACK_API_KEY` auf Cids PC; hier laufen nur Fake-Quelle und Fixture.
- Der Animaze-Transport ist nicht verdrahtet. Für die Demo reicht der Text-Adapter.
- `openrouter/free` ist nur teilweise geprüft: Live-Check am 15.10. um 22:0x, 10 Anfragen, 5 Antworten, 5 Fehler der Klasse `error`. Antwortqualität und Latenz sind nicht bewertet.
- Der Lesetest (ab 09:00) ist nicht Teil dieser Demo und läuft nur im freigegebenen Rahmen.
