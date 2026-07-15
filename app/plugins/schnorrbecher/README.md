# Schnorrbecher

Schnorrbecher ist ein eigenständiges LTTH-Plugin für TikTok-LIVE-Geschenke. Geschenke erhöhen serverseitig den Coin-Wert und lassen ihre Icons in ein transparentes, physikalisches Glas fallen.

## OBS Browser Source

Aktiviere das Plugin und verwende diese URL in OBS:

```text
http://localhost:3000/overlay/coincup?transparent=1
```

Die Browser Source benötigt keinen Hintergrund. Die Darstellung reagiert auf 16:9 und 9:16; die Glasposition sowie Größe werden in der Steuerung gespeichert. Optionale Parameter sind `showCounter=0|1`, `maxCoins=<20-600>`, `scale=<0.25-3>` und `debug=0|1`.

## Steuerung

Öffne [http://localhost:3000/schnorrbecher/ui](http://localhost:3000/schnorrbecher/ui) für:

- Live-Status, Gesamtwert, physische Icon-Anzahl und Spawn-Warteschlange
- Test Gift und Add 100 Coins ohne TikTok-Livestream
- Reset Coin Jar und Clear event cache
- Overlay-Vorschau und kopierbare Browser-Source-URL
- Becherlayout, Counter, Icon-Skalierung, Physik, Persistenz und Sound

## Geschenk- und Combo-Verhalten

Der Backend-Kern akzeptiert nur endliche positive Werte und berechnet `diamondValue × repeatCount`. Er dedupliziert abgeschlossene `eventId`s und merkt bei laufenden Combos nur den größten Zwischenstand. Erst das Endereignis addiert die Coins. Fehlt es, wird der letzte Stand nach einer kurzen Inaktivität genau einmal finalisiert.

Die visuelle Menge ist `ceil(sqrt(value))`, mindestens 1 und maximal 100. Sie begrenzt nur die Darstellung, nie den echten Gesamtwert. Ab dem konfigurierten Maximum von standardmäßig 300 Matter-Körpern verdichtet das Overlay kleine Repräsentationen. Ist der Becher optisch voll, fallen weitere Icons seitlich in die restliche Szene.

## Persistenz und Reset

`session` setzt den Becher beim Pluginstart und beim bestätigten neuen Livestream zurück. `persistent` speichert Gesamtwert, visuelle Zielmenge und Event-Cache unter dem LTTH-Plugin-Datenverzeichnis. Nach einem Browser-Reload stellt das Overlay den Zähler wieder her und rekonstruiert eine zufällige, begrenzte Füllung.

Ein Reset über die Oberfläche, `POST /api/coin-jar/reset` oder das Socket.IO-Ereignis `coinJar.reset` leert Zustand, Event-Cache, laufende Spawn-Queue und Matter-Körper. Neue Browser-Quellen fordern bei jeder Socket-Verbindung `coinJar.sync.request` an und erhalten einen vollständigen Zustand.

## Tests

```powershell
cd app
npx jest --runInBand plugins/schnorrbecher/test
```

Die Tests decken Werte 1/100/1000, Combo-Zwischenstände, doppelte IDs, ungültige Werte, große Geschenke, leere und gefüllte Resets, Queue-Abbruch, Reconnect/Sync, Reload-Generation, Objektlimit und zwei parallele Overlays ab.
