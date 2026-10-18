# Music-Bot Player-Command-Contract (lt-j9s T1)

Verbindlicher Contract fuer die Chat-Befehle `!play`, `!skip` und `!status`.
Die Implementierung (Anbindung an den Music-Bot) liegt in T2
(`app/plugins/music-bot/main.js`, Draft-PR #175). Dieses Dokument und das Modul
`app/plugins/music-bot/lib/player-command-contract.js` sind die Referenz für
beide Teile.

Kein Merge (HOLD lt-8z6).

## Geltungsbereich

- Das Contract-Modul ist abhaengigkeitsfrei: kein Zugriff auf Playback, Queue,
  Datenbank oder Netzwerk.
- Es definiert nur Erkennung, Argument-Regeln, Payload-Form und Status-Format.
- Berechtigungspruefung, Cooldown und die eigentliche Player-Steuerung bleiben
  Aufgabe der Implementierung (T2).

## Befehle

| Befehl | Default-Name | Aliase | Default-Recht | Argumente |
|---|---|---|---|---|
| `play` | `play` | `resumeplay` | `mod` | optional Queue-Position (1-basiert) |
| `skip` | `skip` | – | `viewer` | keine |
| `status` | `status` | `state` | `viewer` | keine |

- Prefix ist konfigurierbar (`DEFAULT_COMMAND_PREFIX = '!'`).
- Erkennung ist case-insensitiv und toleriert umgebende Whitespaces.
- Namensauflösung: zuerst die Default-Namen, dann die konfigurierten Namen
  (ueberschreiben den jeweiligen Default-Namen), zuletzt die Aliase.

## Payload-Form

```js
{ type: 'play',   index: number|null }  // index 0-basiert, null = starten/fortsetzen
{ type: 'skip',   force: boolean }      // force = effektives Recht oberhalb von viewer
{ type: 'status' }                      // keine Argumente
```

- `!play` ohne Argument: `index = null` (Pause -> Resume, sonst naechsten
  Queue-Track starten).
- `!play <n>`: `n >= 1` wird zu `index = floor(n) - 1`; ungueltige, `0` oder
  negative Werte fallen auf `null` zurueck.
- `!status` ignoriert zusaetzliche Argumente.
- Unbekannte Befehle oder fehlender Prefix ergeben `null`.

## Status-Ausgabe

`formatPlayerStatusMessage(state)` spiegelt den internen Player-Zustand:

- Safety-Lock aktiv: `Status: gesperrt (Safety-Lock) | Queue: <n>`
- laufender Track: `Status: <state> | Jetzt läuft: <titel> | Queue: <n>`
- sonst: `Status: <state> | Nichts läuft | Queue: <n>`

Eingabe: `{ safetyLocked, state, nowPlaying: { title }|null, queueLength }`.
`state` faellt auf `idle` zurueck, `queueLength` wird auf eine nicht-negative
Ganzzahl normalisiert.

## Cooldown

- Spam-Schutz fuer Player-Steuerbefehle: `DEFAULT_CHAT_PLAYER_COMMAND_COOLDOWN_MS = 5000`.
- Schluessel pro Nutzer und Befehl: `createCooldownKey(type, username)` ->
  `<type>:<username-kleingeschrieben>`.

## Exporte (Kurzuebersicht)

- Konstanten: `PLAYER_COMMAND_TYPES`, `PLAYER_COMMAND_NAMES`,
  `PLAYER_COMMAND_ALIASES`, `PLAYER_COMMAND_PERMISSIONS`,
  `DEFAULT_CHAT_PLAYER_COMMAND_COOLDOWN_MS`, `DEFAULT_COMMAND_PREFIX`
- Funktionen: `normalizeCommandKey`, `resolvePlayerCommandType`,
  `buildPlayerCommandPayload`, `parsePlayerCommand`,
  `isValidPlayerCommandPayload`, `createCooldownKey`,
  `buildPlayerStatusSnapshot`, `formatPlayerStatusMessage`

## Tests

`app/test/music-bot-player-command-contract.test.js` prueft Erkennung, Aliase,
Argument-Regeln, Payload-Validierung, Cooldown-Schluessel und das Status-Format.
