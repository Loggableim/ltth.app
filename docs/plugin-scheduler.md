# Plugin-Scheduler (zeitgesteuerter Plugin-Wechsel nach Showplan)

Modul: `app/modules/plugin-scheduler.js` · Bead: `lt-5df` (T2) · Bezug: `lt-9y3` (T1 Contract), `lt-4wn` (T3 Tests)

Der Plugin-Scheduler schaltet LTTH-Plugins nach einem Showplan (Zeit -> Plugin)
automatisch ein oder aus. Er ist bewusst ohne eigenen Timer gebaut: der Aufrufer
ruft `tick()` (z. B. im Sekundentakt), die Zeit kommt aus einer injizierten Uhr.
Damit ist die Zeitlogik deterministisch und ohne `setTimeout` testbar.

## Showplan

Ein Eintrag beschreibt genau einen Schaltpunkt:

```js
{ pluginId: 'soundboard', action: 'enable', time: '20:00' }   // lokale Tageszeit
{ pluginId: 'quiz-show',  action: 'disable', at: 1760000000000 } // absolute Epoch-ms
```

- `action`: `enable` (Default) oder `disable`.
- Genau eines von `at` oder `time` ist erlaubt. `time` wird gegen `startOfDay`
  (Epoch-ms des lokalen Tagesbeginns) aufgeloest.
- `normalizeShowplan(plan, { startOfDay })` validiert, sortiert und friert den Plan ein.
  Zwei Schaltpunkte zur selben Zeit sind ein mehrdeutiger Doppelwechsel und werden abgelehnt.

## Toleranz

Der Scheduler laeuft event-getrieben; `tick()` verarbeitet alle faelligen Schaltpunkte
sequentiell. `toleranceMs` (Default **60000 ms = 1 Minute**) legt fest, wie spaet ein
Schaltpunkt noch ausgefuehrt werden darf:

| Zustand | Verhalten |
|---|---|
| `now - at <= toleranceMs` | Schaltpunkt wird ausgefuehrt (leicht verspaetet, normal) |
| `now - at >  toleranceMs` | als `late` uebersprungen und geloggt |
| `at < startedAt` (bei `start()`) | als `before-start` uebersprungen, damit ein spaeter Start nicht den halben Tag nachspielt |

`toleranceMs: 0` schaltet nur exakt zur geplanten Zeit.

## Fehlerfaelle

- Unbekanntes Plugin (`controller.isKnown === false`) -> `unknown-plugin`, geloggt, uebersprungen.
- Fehler beim Schalten -> `error`, geloggt, uebersprungen; spaetere Schaltpunkte laufen weiter.
- Plugin bereits im Zielzustand -> `already-enabled` / `already-disabled`, kein Doppelwechsel.

Kein Overlap: Schaltpunkte werden strikt sequentiell und hoechstens einmal ausgefuehrt;
gleichzeitige `tick()`-Aufrufe teilen sich denselben Lauf (single-flight).

## Anbindung an den PluginLoader

```js
const { createPluginScheduler, createPluginLoaderController } = require('./modules/plugin-scheduler');

const scheduler = createPluginScheduler({
  name: 'showplan',
  plan: normalizeShowplan(showplanFromConfig),
  controller: createPluginLoaderController(pluginLoader),
  clock: () => Date.now(),
  toleranceMs: 60000
});

scheduler.start();
setInterval(() => scheduler.tick(), 5000); // Aufrufer treibt den Scheduler
```

`createPluginLoaderController(pluginLoader)` nutzt `resolvePluginInstallation`,
`isPluginEnabledFromDisk`, `enablePlugin` und `disablePlugin` des bestehenden
`app/modules/plugin-loader.js`.

## Status & Events

- `getStatus()`: `{ started, toleranceMs, count, applied, skipped, failed, pending, nextAt, activePluginId, entries }`
- Events: `switch` (angewendet), `skip` (uebersprungen), `error` (fehlgeschlagen).
