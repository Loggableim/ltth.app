# Offline-Gesamt-Demo ueber die Drafts der Woche (lt-luo T1)

Diese Demo faehrt die Zuarbeiten der 4-Tage-Woche **komplett offline** durch:
kein Live-TikTok, kein Animaze, kein mpv, kein Netz, kein Key. Jede Quelle ist
ein Fixture oder ein Mock. Danach gibt der Lauf eine Abdeckungsmatrix aus, die
jeden Draft dem Nachweis dieses Laufs oder einer offenen Luecke zuordnet.

Der Harness baut auf der Sidekick-Kette auf (`#164 -> #167 -> #168 ->
feat/sidekick-live-chat-adapter-fixture`). Er benutzt den vorhandenen
`sidekick-host`-Stand, ergaenzt aber keine Live-Pfade.

## Startbefehl

Aus dem Ordner `app/`:

```bash
npm run sidekick:gesamt-demo
```

Ohne Schalter laeuft alles lokal. Es wird kein Key gelesen und kein Netz
geoeffnet. Ein injizierter Transport, der wirft, macht einen versehentlichen
Netzaufruf sofort sichtbar.

## Ablauf des Laufs

| Phase | Was passiert | Draft |
|---|---|---|
| Host-Szenen | `HostCore` faehrt drei Szenen (Quiz, Musik/Sound, Vier gewinnt) mit geplantem Plugin-Wechsel ueber `ShowPlanner`. | Sidekick-Host, lt-5df |
| Live-Read | Das nur lesende Fixture (`demo/live-read-fixture.jsonl`) laeuft durch den Adapter; gezaehlt werden nur normalisierte Typen. | lt-6qo |
| Animaze | Der Animaze-Adapter sendet `say` und `emote` an einen aufzeichnenden Mock-Transport. | lt-k02 |
| Music-Bot-Adapter | `enqueue`, `status`, `play`, `skip` laufen gegen den In-Memory-Fake. | lt-x16, lt-j9s |
| Rate-Limit | Ein kleines Fenster zeigt Sperre und Wieder-Oeffnen. | lt-luo |

Der Lauf schreibt ein JSON-Lines-Log nach
`$TMPDIR/ltth-sidekick-gesamt-demo.jsonl` (bzw. `%TEMP%` unter Windows). Es
enthaelt nur Zaehlwerte, keine Namen und keine Schluessel.

## Abdeckungsmatrix (Stand dieses PRs)

| Draft | Kette | Status | Nachweis / Grund |
|---|---|---|---|
| Sidekick-Host (HostCore, Ports, Showplan) | #154/#164 | covered-offline | Befehle + freie Chat-Antworten laufen durch HostCore |
| Zeitgesteuerter Plugin-Wechsel | lt-5df | covered-offline | Szenenwechsel ueber `ShowPlanner.switchTo`/`advance` |
| Live-Chat-Adapter, nur lesend | lt-6qo | covered-offline | Fixture normalisiert, keine Identitaet im Event |
| !song an den Music-Bot | lt-x16 | covered-offline | Adapter `enqueue` + Chat `!song` greifen |
| !sound an echtes Soundboard | lt-mx7 | **gap** | Demo-Port liefert nur festen Text, kein Soundboard-Adapter |
| play/skip/status | lt-j9s | **partial-offline** | Adapter deckt play/skip/status ab; `!play` ist kein erlaubter Host-Chat-Befehl |
| Animaze-Transport | lt-k02 | covered-offline | `say`/`emote` am Mock-Transport, kein echter Animaze |
| Gesamt-Demo offline | lt-luo | covered-offline | Rate-Limit-Sperre und Oeffnen belegt |

## Offene Luecken

1. `!sound` hat im Sidekick-Host nur einen Demo-Port mit festem Text; ein echter
   Soundboard-Adapter fehlt.
2. `!play`/`!status` sind kein erlaubter Host-Chat-Befehl; nur der
   Music-Bot-Adapter deckt `play`/`skip`/`status` ab.
3. Der Animaze-Adapter ist nur mit Mock-Transport belegt, kein echter Animaze-Lauf.
4. Kein echter Live-TikTok-/Eulerstream-Lauf; nur Fixture und nur lesender Pfad.

Die Luecken 1-2 liegen in Zuarbeiten anderer Beads (lt-mx7, lt-j9s). Sobald
deren Adapter im Host verfuegbar sind, kann die Matrix sie auf `covered-offline`
hochziehen; der Harness ist dafuer bereits in Szenen und Phasen getrennt.

## Testliste fuer Cids PC (Live-Tests)

Diese Punkte sind auf dem Linux-Server nicht ausfuehrbar und blockieren nichts:

1. Live-TikTok/Eulerstream: echter Connect mit externem Key (`SIDEKICK_LIVE=1`),
   Reconnect und Namensmaskierung pruefen.
2. Animaze: echter Transport zum laufenden Animaze (`say` + `emote`).
3. `!sound`: echtes Soundboard-Geraet abspielen, inkl. Fehlerpfad ohne Geraet.
4. `!song`/`play`/`skip`/`status`: echter Music-Bot mit mpv, inkl. Safety-Lock.
5. Live-Chat: `!play`/`!skip`/`!status` im echten Chat, sobald die Befehle erlaubt sind.

## Tests

```bash
cd app
npx jest test/sidekick-host-gesamt-demo.test.js --runInBand --forceExit
```

Die Tests laufen offline, sperren `fetch`/`WebSocket` hart und brauchen keinen Key.
