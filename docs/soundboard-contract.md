# Soundboard Contract (`!sound` gegen das echte Soundboard-Backend)

Modul: `app/modules/soundboard-contract.js` · Bead: `lt-0rr` (Epic `lt-mx7` T1)
Implementierung: `app/plugins/soundboard/` (T2) · Tests: `app/test/soundboard-contract.test.js`

Dieses Modul ist die verbindliche Schnittstelle zwischen dem Chat-Befehl
`!sound <name>` und dem Soundboard-Backend. Es enthaelt keine Auflaesungs- oder
Wiedergabe-Logik, sondern: Konstanten, die dokumentierte Ein-/Ausgabeform,
Validator und einen Referenz-Client (In-Memory) fuer Tests.

## Ablauf

1. GCCE parst `!sound <name>` und uebergibt den rohen Namen.
2. `assertSoundRequest({ name, requestedBy })` validiert und normalisiert.
3. `client.resolve(name)` loest den Namen zu einem `ResolvedSound` auf (`null` = unbekannt).
4. `client.play(sound, { requestedBy })` spielt ueber das Soundboard-Backend
   (Socket.io-Event `soundboard:play`, siehe `SoundboardManager.emitSound`) und
   liefert ein `PlaybackResult`.
5. `toCommandResult(result)` uebersetzt das Ergebnis in die GCCE-Antwortform.

Cooldown und Rechte prueft GCCE selbst (`COMMAND_ON_COOLDOWN` /
`PERMISSION_DENIED`). Der Contract fuehrt `SOUND_COOLDOWN_ACTIVE` und
`SOUND_PERMISSION_DENIED` nur mit, damit Fehlerpfade einheitlich benannt sind.

## Eingabe (`SoundRequest`)

```js
{ name: 'airhorn', requestedBy: 'user-42', volume: 0.8 }
```

- `name`: roher Chat-Name; `normalizeSoundName` trimmt, kollabiert Whitespace,
  lehnt Steuerzeichen, leeren Input und Namen > `MAX_NAME_LENGTH` (100) ab.
- `volume`: optional, `0..1`; Default `DEFAULT_VOLUME` (1.0).
- `source`: optional, erzwungene Quelle aus `RESOLUTION_SOURCES`.
- `requestedBy`: optional, fuer Audit/Logging.
- `timestamp`: Default `Date.now()`.

`assertSoundRequest` wirft `TypeError` mit `.code` (`SOUND_INVALID_NAME`,
`SOUND_EMPTY_NAME`, `SOUND_INVALID_VOLUME`). `isSoundRequest` ist die boolesche Variante.

## Auflaesung (`ResolvedSound`)

```js
{ name: 'airhorn', url: 'https://.../airhorn.mp3', volume: 1.0,
  label: 'Airhorn', source: 'myinstants', giftId: null }
```

Quellen (`RESOLUTION_SOURCES`, Reihenfolge in `SOURCE_ORDER`):
`gift` → `local` → `url` → `myinstants`.
`assertResolvedSound` validiert und friert das Objekt ein.

## Wiedergabe (`PlaybackResult`)

```js
// Erfolg
{ success: true, sound: {...}, errorCode: null, message: null, params: {}, audioTarget: 'both' }
// Fehler
{ success: false, sound: null, errorCode: 'SOUND_NOT_FOUND', message: 'Unknown sound "x".',
  params: { name: 'x' }, audioTarget: null }
```

- `createPlaybackSuccess(sound, { audioTarget })` und `createPlaybackError(code, params)`
  erzeugen eingefrorene Ergebnisse. Unbekannte Codes/Targets werfen `TypeError`.
- `message` ist ein englischer Fallback; die Command-Schicht lokalisiert ueber
  `MESSAGE_KEYS[errorCode]` mit `params`.
- Ziele (`AUDIO_TARGETS`): `dashboard`, `obs_overlay`, `both` (Default
  `DEFAULT_AUDIO_TARGET`); spiegelt die Setting `soundboard_audio_target`.

## GCCE-Antwort (`toCommandResult`)

`toCommandResult(result)` liefert eine eingefrorene Antwort:

```js
// Erfolg
{ success: true, message: 'Playing "Airhorn"',
  messageKey: 'soundboard.command.success.playing', params: { name: 'Airhorn' } }
// Fehler
{ success: false, error: 'Unknown sound "x".', errorCode: 'SOUND_NOT_FOUND',
  messageKey: 'soundboard.command.errors.notFound', params: { name: 'x' },
  displayOverlay: true }
```

`messageKey` ist der i18n-Key (Erfolg: `SUCCESS_MESSAGE_KEY`, Fehler:
`MESSAGE_KEYS[errorCode]`), damit die Command-Schicht die Meldung in allen vier
Sprachen ausgeben kann. `message`/`error` bleiben der englische Fallback.

## Event-Typ des Chat-Befehls

`COMMAND_EVENT_TYPE` = `'command'`. Das bestehende Backend
(`SoundboardManager.playSound`) kennt als `eventType` nur
`gift|follow|subscribe|share|like|test|preview|animation` und stuft Unbekanntes
auf `'unknown'` herunter. **T2 muss `'command'` in der Backend-Liste ergaenzen**,
sonst landen Chat-Sounds als `unknown` im Payload.

## Client-Interface

```js
{
  isEnabled(): boolean,                 // Pflicht
  resolve(name): Promise<ResolvedSound|null>,  // Pflicht, wirft bei Backend-Fehler
  play(sound, { requestedBy }): Promise<PlaybackResult>, // Pflicht, wirft bei Backend-Fehler
  getAudioTarget?(): string             // optional
}
```

`assertSoundboardClient(client)` prueft die Pflichtmethode(n) und gibt den Client
zurueck; `isSoundboardClient(value)` ist die boolesche Variante.

## Referenz-Client fuer Tests

```js
const { createInMemorySoundboardClient } = require('../modules/soundboard-contract');
const h = createInMemorySoundboardClient({
  enabled: true,
  audioTarget: 'both',
  sounds: [{ name: 'airhorn', url: 'https://x/a.mp3', source: 'myinstants' }],
  failPlayFor: ['broken']
});
await h.client.resolve('airhorn'); // ResolvedSound
await h.client.play(sound);        // PlaybackResult
h.resolveCalls; h.playCalls; h.setEnabled(false); h.addSound(...); h.reset();
```

## Konstanten

- `COMMAND_NAME` = `'sound'`
- `EVENT_TYPES` = `gift|follow|subscribe|share|like|test|preview|animation|command`
- `COMMAND_EVENT_TYPE` = `'command'` (Event-Typ des Chat-Befehls)
- `AUDIO_TARGETS` = `['dashboard', 'obs_overlay', 'both']`
- `SUCCESS_MESSAGE_KEY` = `'soundboard.command.success.playing'`
- `ERROR_CODES` und `MESSAGE_KEYS` (i18n) siehe Modul

Constants sind eingefroren; `CONTRACT_VERSION` beschreibt den Contract-Stand.
