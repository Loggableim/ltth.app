# Schnorrbecher Coin Jar – Design

## Ziel

`schnorrbecher` wird ein eigenständiges LTTH-Plugin für TikTok-LIVE-Geschenke. Es stellt eine transparente, OBS-taugliche Browser-Quelle bereit, in der Geschenk-Icons mit Matter.js in einen offenen Glasbecher fallen. Der Server hält den wertmäßigen Zustand autoritativ; jedes geöffnete Overlay rendert denselben Zustand lokal.

Das Plugin übernimmt ausschließlich das allgemeine Prinzip eines livestreamgesteuerten Coin Jars. Es nutzt weder TikFinity-Code noch Logos, Sounds oder Gestaltungselemente.

## Plugin-Grenzen

Das Plugin liegt unter `app/plugins/schnorrbecher/` und bleibt von `coinbattle`, `emoji-rain` und `webgpu-emoji-rain` unabhängig. Es darf deren öffentliche LTTH-Muster nutzen (Plugin-API, Socket.IO, Geschenkekatalog, Konfiguration, Teststruktur), aber keinen fremden Spiel- oder Overlay-Zustand teilen.

Die Komponenten haben eindeutige Verantwortlichkeiten:

| Komponente | Verantwortung |
| --- | --- |
| Backend-Engine | Geschenkvalidierung, Combo-Abschluss, Deduplizierung, Gesamtwert, Reset, Persistenz und Socket-Events |
| Zustandsspeicher | Atomare Speicherung von Konfiguration, Gesamtwert, visueller Coin-Anzahl und begrenztem Event-Cache im Plugin-Datenverzeichnis |
| Admin-Oberfläche | Konfiguration, Status, Testaktionen, Reset und Browser-Source-URL |
| OBS-Overlay | transparenter Renderer, Matter.js-Physik, Spawn-Queue, Rekonstruktion, Sound und Reconnect |

## Öffentliche Oberfläche

Die kanonische OBS-URL ist `http://localhost:3000/overlay/coincup`. Sie akzeptiert ausschließlich nicht geheime Darstellungsparameter: `channel`, `showCounter`, `maxCoins`, `scale`, `transparent` und `debug`.

Das Backend stellt mindestens diese Routen bereit:

| Route | Zweck |
| --- | --- |
| `GET /overlay/coincup` | transparente Browser-Source |
| `GET /api/coin-jar/state` | vollständiger synchronisierbarer Zustand |
| `POST /api/coin-jar/config` | validierte Konfiguration speichern |
| `POST /api/coin-jar/add` | lokaler Test-/Admin-Zugang für Wert und Icon |
| `POST /api/coin-jar/test-gift` | kontrolliertes Testgeschenk |
| `POST /api/coin-jar/reset` | vollständiger Reset |
| `POST /api/coin-jar/event-cache/clear` | Event-Deduplizierung leeren |

Der Server emittiert `coinJar.add`, `coinJar.reset`, `coinJar.sync` und `coinJar.config`. Ein Overlay fordert nach jeder Socket-Verbindung `coinJar.sync.request` an. Für lokale Automationen wird außerdem ein Socket-Reset-Befehl mit dem Typ `coinJar.reset` in dieselbe Reset-Methode geroutet.

## Geschenk- und Combo-Verarbeitung

Der Backend-Kern normalisiert eingehende Geschenkfelder auf `eventId`, Sender, Geschenk-ID/-Name, Bild, `diamondValue`, `repeatCount`, `repeatEnd` und Zeitstempel. Das Geschenkbild kommt bevorzugt aus dem vorhandenen Geschenkekatalog; das Bild aus dem Event ist der Fallback.

Ein Ereignis wird verworfen und geloggt, wenn sein effektiver Wert nicht endlich oder kleiner/gleich null ist. Für gültige Ereignisse gilt `totalValue = diamondValue * repeatCount`.

Normale Geschenke werden genau einmal pro `eventId` gezählt. Für eine Streak/Combo merkt ein nach Sender und Geschenk gruppierter Tracker ausschließlich den höchsten Zwischenstand. Erst beim Endereignis wird der höchste Wert in den Gesamtwert übernommen. Fehlt das Endereignis, finalisiert ein kurzer Inaktivitäts-Timer den letzten bekannten Stand genau einmal. Abgeschlossene `eventId`s liegen in einem begrenzten, persistierten LRU-Cache, sodass weder Reconnects noch zwei offene Browser-Quellen doppelt zählen können.

Ein bestätigter neuer Stream setzt im Session-Modus den Becher zurück. `streamSessionStarted` ist der primäre Auslöser; ein über `streamIdentity` deduplizierter Verbindungs-Fallback schließt Start-/Reload-Rennen aus.

## Wert, Darstellung und Objektlimit

Der echte Gesamtwert ist stets unabhängig von der Darstellung. Pro abgeschlossenem Geschenk errechnet der Server die visuelle Menge mit:

```js
Math.max(1, Math.min(100, Math.ceil(Math.sqrt(totalValue))))
```

Die Größe jedes Gift-Icons wächst mit seinem Coin-Wert und wird von `iconScale` begrenzt. Der Renderer staffelt Spawns mit `round(spawnDelayMs × (0.5 + random()) × spawnMultiplier)`; beim Default ergibt das 40–120 ms, mit zufälliger Rotation und horizontalem Impuls.

`maxPhysicalIcons` ist standardmäßig 300. Bei Erreichen des Limits erhöht der Server weiterhin Gesamtwert und visuelle Zielmenge, der Renderer verdichtet aber kleine zu mittleren und mittlere zu großen Repräsentationen. Ist der Becher sichtbar voll, nutzt er weitere dynamische Körper außerhalb der Seitenwände, damit neue Geschenke seitlich herausfallen und den Rest der Szene füllen. Aus dem sichtbaren Bereich geratene Körper werden entfernt; sie verändern den Gesamtwert nicht.

## Physik und Darstellung

Das Overlay ist vollständig transparent, scrollbarfrei und responsiv für 16:9 sowie 9:16. Es zeichnet den Becher mit HTML/CSS/SVG: transparente Innenfläche, deutlich sichtbarer Rand, offene Oberseite und geschlossener Boden. `jarWidth`, `jarHeight`, `jarX`, `jarY`, `jarLabel`, Randfarbe und Transparenz sind live konfigurierbar.

Matter.js führt die Simulation mit folgenden Defaults aus:

```js
gravityY: 1.0
restitution: 0.15
friction: 0.35
frictionAir: 0.01
density: 0.002
```

Unsichtbare statische Körper bilden Boden und Seitenwände der sichtbaren Innenform. Geschenk-Icons sind DOM-Sprites, kollidieren miteinander und mit den Wänden, rotieren und haben eine begrenzte Geschwindigkeit. Bei Größenänderungen werden Renderfläche und statische Wände synchron neu aufgebaut.

Der Counter kann ein- und ausgeblendet werden, animiert Wertänderungen, nutzt die lokale Tausendertrennung und ist über Label, Schrift, Größe und Farbe einstellbar. Geschenk-Popup, Absendername, Geschenkbild, Partikel-/Glanzeffekte und ein gedrosselter Sound (höchstens ungefähr alle 80–150 ms) sind optionale, voneinander unabhängige Funktionen. Wird das Geschenkbild ausgeblendet oder kann es nicht geladen werden, rendert der bestehende Matter-Körper stattdessen einen neutralen CSS-Coin. Deaktivierter Sound fordert keine Medieninteraktion an.

## Zustand und Persistenz

Der gespeicherte Zustand enthält mindestens:

```js
{
  sessionId,
  totalCoinValue,
  visualCoinCount,
  lastProcessedEventIds,
  updatedAt
}
```

Im Session-Modus beginnt ein neuer Server-/Livestream-Zustand bei null. Im persistenten Modus werden Gesamtwert und visuelle Zielmenge wiederhergestellt. Nach einer Browser-Neuladung erzeugt das Overlay die gespeicherte Zielmenge mit zufälligen, ruhenden Positionen im Becher; exakte alte Körperpositionen werden bewusst nicht persistiert.

Ein Reset bricht alle asynchronen Spawn-Jobs über eine neue Generation ab, leert die Queue, setzt Counter und Matter-Welt zurück und überschreibt den persistierten Zustand. Eine optionale kurze Leerungsanimation wird rein visuell ausgeführt und darf keinen neuen Wert eintragen.

## Konfiguration und Administration

Die persistierte Konfiguration enthält mindestens `enabled`, Bechermaße/-position, `iconScale`, `maxPhysicalIcons`, Spawn-Multiplikator/-Delay, Counter- und Popup-Optionen, Labels, Persistenzmodus, `resetOnNewStream` und Soundoptionen. Matter.js-Physik ist immer aktiv; alte gespeicherte `physicsEnabled: false`-Werte werden kompatibel als aktiv behandelt. Grenzwerte werden serverseitig validiert, damit URL-Parameter und Formulare keine unkontrollierte Objektmenge erzeugen.

Die Admin-Seite zeigt Verbindungs- und Livestream-Status, Gesamtwert, Zahl physischer Icons und wartende Spawns. Sie bietet **Test Gift**, **Add 100 Coins**, **Reset Coin Jar**, **Clear event cache**, Konfigurationsformular, Overlay-Vorschau und kopierbare URL. Ein konfigurierbarer Bestätigungsdialog schützt den Reset.

## Fehler- und Leistungsregeln

Ungültige Werte, fehlende Bilddateien, unbekannte Geschenkfelder, doppelte Ereignisse, getrennte Sockets, Reset während Spawns und mehrere Overlays werden ohne Absturz behandelt. Das Backend protokolliert verwertbare Warnungen über `this.api.log()`; der Renderer zeigt bei Bildfehlern einen neutralen Coin-Fallback. Der Socket-Reconnect verwendet exponentielles Backoff von einer bis höchstens 30 Sekunden und synchronisiert danach vollständig.

## Tests und Abnahme

Gezielte Jest-Tests decken mindestens Geschenkwerte 1/100/1000, Combo-Zwischenstände, doppelte IDs, leere und gefüllte Resets, Reset während Queue, Reconnect/Sync, Browser-Reload, Objektlimit und zwei gleichzeitige Overlays ab. Frontend-Tests prüfen URL-Parameter, transparente Struktur, Matter-Wandberechnung, Queue-Abbruch und Verdichtungsentscheidung.

Die manuelle Abnahme startet den lokalen LTTH-Server, öffnet `/overlay/coincup` als Browser-Source-ähnliche Seite, löst Testgeschenke aus und prüft transparenten Hintergrund, Kollisionsverhalten, Zähler, Reset, Reload-Sync und Konfigurationsänderungen. Die Änderung gilt erst als fertig, wenn die neuen gezielten Tests, CSS-Build und Lint fehlerfrei laufen und die Live-Seite diese Kernpfade sichtbar ausführt.
