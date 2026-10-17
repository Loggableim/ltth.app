# Renderervergleich: Advanced Timer und OpenShock

Stand: 2026-10-07. Quellenbasis exakt `fde29a99d95222e8f441ffedc78df43e15ba0f06`; siehe maschinenlesbare [Vergleichstabelle](renderer-url-semantics-20261007.json) mit HEAD-Blobpins.

## Advanced Timer

- Der Guide nutzt `/plugins/advanced-timer/overlay/index.html?lang=…&timer=…` über globales `/plugins`-Static-Serving. Die UI kopiert bereits `/advanced-timer/overlay?timer={id}`; der GET-Handler sendet `overlay.html`. Beide laden dieselbe `overlay/overlay.js`.
- Der Kernvertrag ist gleich: derselbe Timer-ID-Queryparameter, dieselbe Timer-API und dieselben Start/Tick/Pause/Stop-Ereignisse. Die Guide-Fixture 90 s → 01:30 → Tick bleibt gültig.
- Die Shells sind visuell nicht identisch. `overlay.html` stellt zusätzlich Timer-Template-Host, Rotator-Layer und Threshold-Effects-Layer bereit. `overlay/index.html` enthält nur den Timercontainer. Der JS-Renderer fällt auf `#timer-container` zurück; Kernanzeige funktioniert, optionale Rotator-/Threshold-Darstellung hat im Matrixrenderer jedoch keine Zielcontainer.
- **Vorschlag:** `/advanced-timer/overlay?lang={locale}&timer={fixtureId}` für Guide und lokale Fixture verwenden, passend zur UI-Kopie und Public-Overlay-Registry. Die Nachweiserwartung auf den Timerkern begrenzen oder die neuen optionalen Layer ausdrücklich in visueller Abnahme aufnehmen. Keine Änderung ausgeführt.

## OpenShock

- Der Guide ist ausdrücklich die generische **Shock Overlay**-Fläche: `/plugins/openshock/overlay/openshock_overlay.html`. Sie zeigt lokale `openshock:command-sent`-Ereignisse mit Typ, Intensität, Dauer, Gerät, Nutzer und Quelle; ohne lokales Testereignis bleibt sie leer. Der Server hat den dateigleichen Alias `/openshock/overlay`.
- `/openshock/zappiehell/overlay` ist im Public Overlay Registry eingetragen, aber ein anderer Renderer. Er fordert aktive Goals an und verarbeitet `zappiehell:goals:*`, Animationen und optionale Sprachausgabe. Er zeigt Coin-Goal-Fortschritt und Abschluss; er hört nicht auf `openshock:command-sent`. Ein Shock-Test würde dort nicht denselben sichtbaren Zustand erzeugen.
- **Vorschlag für lokale OBS-Abnahme:** generischen Renderer behalten; `/openshock/overlay` ist eine dateigleiche Serverroute, der bestehende direkte Pfad bleibt ebenfalls lokal routbar. Nicht auf ZappieHell umbiegen. **Öffentlicher Tunnel:** generischer `/openshock/overlay` fehlt in der Allowlist; ein öffentlich erreichbarer Shock-Eventrenderer braucht eine separate Policy-/Registryentscheidung. ZappieHell deckt diesen Bedarf nicht ab.

## Status und Grenzen

- **Quellbestätigt:** Handler-Ziel, UI-/Guide-URL, Runtime-Dateien, DOM-Zielcontainer und Socket-/Eventverträge aus dem gepinnten Commit.
- **Nicht geprüft:** HTTP-Dispatch, Browser/OBS-Darstellung, Tunnelverhalten oder neue DOM-Regressionstests. Keine Produktdatei, Registry, Guide-URL, OBS-/VM-/App-Prozess oder Hardware-/Liveaktion geändert/gestartet.
- **Offene Entscheidung:** Soll der Public-Tunnel künftig den generischen OpenShock-Shock-Renderer erlauben? Falls ja, ist das ein separater Scope- und Sicherheitsentscheid; die ZappieHell-Allowlist ist kein Ersatz.
