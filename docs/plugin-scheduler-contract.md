# Plugin-Scheduler Contract (zeitbasierter Plugin-Wechsel)

Modul: `app/modules/plugin-scheduler-contract.js` · Bead: `lt-9y3` (Epic `lt-5df` T1)
Implementierung: `app/modules/plugin-scheduler.js` (T2) · Tests: `app/test/plugin-scheduler-contract.test.js`

Dieses Modul ist die verbindliche Schnittstelle fuer den zeitgesteuerten
Plugin-Wechsel nach Showplan. Es enthaelt keine Scheduler-Logik, sondern:
Konstanten, die dokumentierte Eingabeform, Controller-Validierung und einen
Referenz-Controller (In-Memory) fuer Tests.

## Showplan-Eintrag (`ShowplanEntry`)

```js
{ pluginId: 'soundboard', action: 'enable',  time: '20:00' }
{ pluginId: 'quiz-show',  action: 'disable', at: 1760000000000 }
```

- `pluginId`: nicht leerer String.
- `action`: `enable` (Default) oder `disable` (`ACTIONS`).
- Genau EINES von `at` (Epoch-ms) oder `time` (`HH:MM` / `HH:MM:SS`) — `assertShowplanEntry` erzwingt das.
- `time` wird von der Implementierung gegen einen `startOfDay` in absolute Zeit aufgeloest (`NormalizedSwitchpoint`).
- Sortierung und Erkennung doppelter Schaltzeiten sind Aufgabe der Implementierung, nicht des Entry-Validators.

## Controller (`SchedulerController`)

Der Scheduler schaltet nie direkt, sondern ueber einen injizierten Controller:

```js
{
  isKnown(pluginId): boolean,           // Pflicht
  isEnabled?(pluginId): boolean,        // optional
  enable(pluginId): Promise<boolean|void>,   // Pflicht
  disable(pluginId): Promise<boolean|void>   // Pflicht
}
```

`assertSchedulerController(controller)` prueft die Pflichtmethode(n) und gibt den
Controller zurueck. `isSchedulerController(value)` ist die boolesche Variante.
Die Anbindung an den echten Loader (`createPluginLoaderController`) liegt in der
Implementierung T2.

## Referenz-Controller fuer Tests

```js
const { createInMemoryController } = require('../modules/plugin-scheduler-contract');
const { controller, known, enabled, calls, failFor, setKnown, setEnabled, reset } =
  createInMemoryController({ known: ['a'], enabled: ['a'], failFor: ['b'] });
```

`createInMemoryController` haelt `known`/`enabled` in Sets, protokolliert jeden
Aufruf in `calls` (`{ action, pluginId }`) und wirft bei `failFor`-Ids einen Fehler,
ohne den Zustand zu aendern. Damit koennen T2- und T3-Tests ohne echten
PluginLoader deterministisch schalten.

## Konstanten

- `ACTIONS` = `['enable', 'disable']`
- `ENTRY_STATES` = `pending | applied | skipped | failed`
- `SKIP_REASONS` = `before-start | late | unknown-plugin | already-enabled | already-disabled`
- `SCHEDULER_EVENTS` = `['switch', 'skip', 'error']`
- `DEFAULT_TOLERANCE_MS` = `60000`

Die Konstanten sind eingefroren und spiegeln die Zustaende/Events in
`docs/plugin-scheduler.md` (T2). `CONTRACT_VERSION` beschreibt den Contract-Stand.

## Status

`SchedulerStatus` (`getStatus()` der Implementierung) umfasst
`started, startedAt, toleranceMs, count, applied, skipped, failed, pending, nextAt,
activePluginId, entries`; die Eintraege tragen `state` und `reason`.
