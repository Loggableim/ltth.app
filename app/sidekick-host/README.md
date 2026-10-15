# Sidekick-Host Demo

Nachtbau-Demo des KI-Hosts. Liest Chat aus einem lokalen Test-Feed, antwortet über `llm-providers.js` mit dem festen Modell `openrouter/free` und fällt bei Ausfall oder Timeout auf Textvorlagen zurück.

## Startbefehl

Aus dem Ordner `app/`:

```bash
npm run sidekick:demo
```

Ohne Key läuft die Demo vollständig lokal. Die LLM-Antwort wird dann durch Vorlagen ersetzt, und es gibt keine Netzwerkzugriffe.

Mit Key (optional):

- Umgebungsvariable `OPENROUTER_API_KEY`, oder
- lokal `app/sidekick-host/local-config.json` mit `{ "openrouterApiKey": "..." }`. Die Datei ist per `.gitignore` ausgeschlossen.

Der Key erscheint nicht im Log und nicht in Fehlermeldungen.

## Log

Jeder Lauf schreibt ein JSON-Lines-Log nach `%TEMP%\ltth-sidekick-demo.log` (Windows) bzw. `$TMPDIR/ltth-sidekick-demo.log`. Es enthält Test-Feed-Nachrichten und Ergebnisse. Das Log wird nicht in Slack oder PRs eingefügt.

## Tests

```bash
npx jest test/sidekick-host-demo.test.js
```

Die Tests nutzen injizierte Requests und einen Netzwerk-Guard. Sie brauchen kein Internet und keinen Key.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `command-allowlist.js` | Feste Befehlsliste: `!quiz`, `!song`, `!sound`, `!connect4`. Alles andere wird ignoriert. |
| `plugin-port.js` | Plugin-Port mit fester Befehlsliste je Plugin. Validiert gegen die Allowlist. |
| `show-planner.js` | Wechsel zwischen Plugins. Nur die Befehle des aktiven Plugins sind gültig. |
| `host-core.js` | Liest Chat. Befehle gehen an den aktiven Port. Freier Chat erzeugt nur Text. |
| `llm-reply.js` | Antwort über `llm-providers.js`, fest `openrouter/free`, Timeout, Fallback. |
| `templates.js` | Textvorlagen für den Fallback. |
| `rate-limiter.js` | Sliding-Window-Limit für Chat-Antworten. |
| `reply-filter.js` | Entfernt Links, Mentions, Steuerzeichen. Blockt definierte Inhalte. |
| `adapters/text-adapter.js` | Reine Textausgabe. |
| `adapters/animaze-adapter.js` | Animaze nur als Adapter mit injiziertem Transport. `HostCore` kennt Animaze nicht. |
| `demo.js` | Startpunkt für die Demo. |

## Lücken (Stand dieses Branches)

- Der echte Live-Chat-Anschluss fehlt. Es gibt nur den lokalen Test-Feed.
- Der Animaze-Transport ist nicht verdrahtet. Es gibt keine echte Verbindung zu Animaze.
- Das Modell `openrouter/free` ist live nicht geprüft.
- Der Live-Lesetest (09:00) braucht eine separate Freigabe und ist nicht Teil dieser Demo.
