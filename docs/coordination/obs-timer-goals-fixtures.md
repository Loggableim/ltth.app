# Advanced Timer und Goals: Renderer-Fixturevertrag

Stand: 2026-10-07. In-Process-JSDOM-Verifikation der Original-Overlay-Templates und Renderer-Skripte. Keine OBS-Ausführung, kein Listener, kein Produktserver und keine Timer-/Goals-Datenbank.

## BFCache `pagehide.persisted` Zusatzauftrag

### Reproduktion vor Änderung

Der tatsächliche Timer- und Goals-Renderer trennte seinen Socket beim `pagehide` auch dann, wenn `event.persisted === true`, und verwendete `{ once: true }`; auf BFCache-Restore blieb der Renderer daher ohne Listener, obwohl die Seite weiterlebt. Quellbeleg: beide ursprünglichen Handler ignorierten `event.persisted` und entfernten sich durch `once` bereits beim temporären Hide. Der erste Timer-Probe verwendete zunächst eine ID, die nicht zum bestehenden locale helper passte; der korrigierte Fixture nutzt jetzt exakt `fixture-timer-en`, rendert den Timer, sendet `persisted:true` hide/show und bestätigt den darauffolgenden Tick auf `01:28`. Goals nutzt `fixture-goal-bfcache` und bestätigt ein Update nach Restore. Das benachbarte `i18n-client.js` prüft bereits `persisted` und lässt seine Ressourcen für BFCache erhalten.

### Begrenzter Fixplan

In den zwei eigenen Overlay-Renderern bedeutet `pagehide.persisted === true` nur einen temporären BFCache-Eintritt und lässt Socket, Listener und vorhandene Timer unangetastet. Nur `persisted === false` löst den bestehenden idempotenten Cleanup aus. Die Listener werden beim echten Cleanup explizit entfernt; dadurch bleibt die spätere endgültige Navigation nach einer BFCache-Rückkehr weiterhin erfasst. Kein Reconnect-/Backoff-Vertrag, keine Backendänderung und keine Änderung am XP-Backend.

### Ergebnis

- `advanced-timer/overlay.js`: BFCache-hide belässt Overlayzustand/Socket und Rotator-Timer; beim endgültigen Hide wird der benannte Handler entfernt, Timer beendet und Socket getrennt.
- `goals/overlay.js`: BFCache-hide behält Subscription und Renderer; endgültiges Hide führt weiterhin genau einmal `goals:unsubscribe` und Socket-Disconnect aus.
- JSDOM sendet pro Originalrenderer `pagehide.persisted=true`, `pageshow.persisted=true` und einen passenden synthetic Tick/Value-Change. Anschließendes `persisted=false` prüft echten Cleanup. Bestehende verspätete Delivery- und Idempotenzprüfungen bleiben enthalten.
- Finale Suite: `npm test -- --runInBand --runTestsByPath test/obs-timer-goals-renderer-fixtures.test.js` — 18/18 bestanden. Nur in-process JSDOM, keine BrowserSource-/OBS-Abnahme.

## Reproduktion

Im Verzeichnis `app/` ausführen:

```powershell
..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath test/obs-timer-goals-renderer-fixtures.test.js
```

Der Test lädt die Originaldateien `app/plugins/advanced-timer/overlay/index.html`, `overlay/overlay.js`, `app/plugins/goals/overlay/index.html` und `overlay/overlay.js` unverändert. JSDOM lädt Skripte ausschließlich über eine exakte Same-Origin-Allowlist und `jsdom.requestInterceptor`; nur Socket-Client, tatsächliches i18n-Clientskript und jeweiliges Original-Overlayskript werden bedient. Eine externe Ressource oder unbekannte URL wird fail-closed abgewiesen. `window.fetch` wird separat auf genau freigegebene synthetische GET-Routen begrenzt. Nichts öffnet einen Netzwerkport.

## Advanced Timer

### Source-Vertrag

- Guide `scripts/plugin-guides/advanced-timer.js` verlangt `timer=non-empty` und dokumentiert den lokalen 90-Sekunden-Testtimer.
- Originalrenderer liest `timer` aus der URL und sendet `GET /api/advanced-timer/timers/:id`.
- Bei `{success:true,timer}` rendert er den Timer, registriert `advanced-timer:tick`, und liest zusätzlich `GET .../:id/rotator` sowie `GET .../:id/threshold-effects`.
- Ein Tick wird nur angenommen, wenn `payload.id === timerId`; die Quellfelder sind `{id,currentValue,state}`.
- Der Renderer unterscheidet nun HTTP 404 als „Timer nicht gefunden“ von anderen HTTP-Fehlern und abgewiesenen Fetches als „vorübergehend nicht verfügbar“. Erfolgreiche HTTP-Antworten mit `success:false` gelten ebenfalls als vorübergehender Fehler, weil der bekannte API-Vertrag 404 für fehlende Timer vorsieht.
- Es gibt keinen automatischen Retry. Eine neue Ladeanforderung erfolgt mit einem sauberen Overlay-Reload.

### Fixture und Ergebnis

- Fake-IDs: `fixture-timer-de`, `fixture-timer-en`, `fixture-timer-es`, `fixture-timer-fr`.
- Alle drei Routen sind GET-only und erfüllen nur die exakt passende ID. Rotator/Threshold sind deaktiviert, damit keine Rotationsintervalle oder Effektaktionen anlaufen.
- Jede Locale rendert `01:30`; ein passender synthetischer Tick aktualisiert auf `01:29`, ein Tick mit anderer ID bleibt wirkungslos.
- Für 404, 503 und Netzwerkfehler werden getrennte sichtbare, lokalisierte Meldungen geprüft. Ein anschließender sauberer Reload mit erfolgreicher Fixtureantwort rendert den Timer; dies ist kein automatischer Retry.
- Der Renderer trennt den eigenen Socket bei `pagehide`. Fehler- und Erfolgsfälle prüfen den Disconnect; keine Timer-/Interval-Starts oder ausgehenden Socketaktionen entstehen.
- Ein verzögertes erfolgreiches Timer-Fetch nach wiederholtem `pagehide` ändert den DOM nicht und startet weder Rotator- noch Threshold-GET. Der Renderer bricht jede asynchrone Fortsetzung ab, sobald die Seite geschlossen ist.
- Socket-Callbacks prüfen den Lifecyclestatus vor jeder Zustands-/DOMänderung; eine bereits zugestellte verspätete Callbackfortsetzung kann damit nach `pagehide` nichts mehr rendern.

## Goals

### Source-Vertrag

- Guide `scripts/plugin-guides/goals.js` verlangt `id=non-empty`.
- Der Renderer verbindet Socket.IO und sendet bei `connect` `goals:subscribe` mit genau dem Querywert. Es gibt keinen HTTP-Load für Goal-Daten.
- Das Produkt `GoalsWebSocket` sucht die ID in der persistenten Datenbank. Die DB-Auflösung selbst wird nicht gestartet. Sein vorhandener `goals:unsubscribe`-Handler verlässt ausschließlich `goal:<goalId>`; dieser konkrete Serververtrag wird separat ohne DB-Aufruf geprüft.
- Backend-`goals:subscribed` und `broadcastGoalValueChanged()` senden `{goalId,goal,state}`. Der Snapshot stammt aus `GoalStateMachine.getSnapshot()` und umfasst `goalId`, `state`, `previousState`, `data`, `progress` und `isReached`.
- Overlay akzeptiert Events nur für die passende Goal-ID. `goals:error` zeigt nun eine lokalisierte Not-found- oder temporäre Fehlermeldung, ohne rohe Backenddetails auszugeben. Eine passende spätere `goals:subscribed`-Antwort entfernt den Fehler und stellt das Goal wieder dar.
- Bei `pagehide` sendet der Renderer einmalig das bereits vorhandene `goals:unsubscribe` und trennt danach seinen eigenen Socket. Der Quelltest bestätigt, dass der Serverhandler nur den zugehörigen Raum verlässt.
- Alle Socket-Handler prüfen nach Eintritt zunächst den Cleanupstatus. Ein vor Cleanup eingereihtes `goals:subscribed`-Callback wird im Fixture erzwungen zugestellt und darf keine spätere DOMänderung bewirken.
- Update-/Reach-Animationen erhalten eine Lifecycleprüfung für verspätete Timeout-Rückrufe. Bounce- und Celebration-Cleanup schreibt nach `pagehide` nicht weiter in DOM-Styles; das verspätete Promise-Completion sendet kein `goals:animation-end`.

### Fixture und Ergebnis

- Fake-IDs: `fixture-goal-de`, `fixture-goal-en`, `fixture-goal-es`, `fixture-goal-fr`.
- Der Fake-Socket antwortet ausschließlich auf die Testanweisung und erzeugt keine DB-Zeile oder App-API-Anfrage. Eine quellenförmige Goal-Zeile und ein Snapshot initialisieren 25/100; passendes `goals:value-changed` aktualisiert auf 40/100. Ein anderes `goalId` bleibt wirkungslos.
- `goals:error` zeigt für passende Fake-IDs eine sichtbare Meldung; eine synthetische erfolgreiche `goals:subscribed`-Antwort stellt das Goal wieder her. Eine fremde ID bleibt wirkungslos. Das prüft Renderer-Recovery über bestehende Socket-Events, nicht die Produkt-DB-Auflösung.
- Die Tests verwenden die quelleneigenen `smooth-progress`- und `bounce`-Animationen. Die JSDOM-Uhr hält Timeouts kontrolliert an; Timeoutabschluss nach `pagehide` erzeugt weder DOM-Änderungen noch `goals:animation-end`.
- Der Harness kann bereits eingereihte Socketcallbacks nach Disconnect zustellen; damit wird die Produktguard-Logik statt bloßes Socket-unsubscribe getestet. Disconnect und Goal-Unsubscribe sind je exakt einmal gezählt.
- `closeDom()` blockiert noch ausstehende i18n-DOM-Updates nach dem Schließen des JSDOM-Fensters. Das ist Harness-Teardown, keine Produktsemantik.

## Grenzen und Retry-Verhalten

Die Renderer starten keinen automatischen Retry. Timer-Recovery ist nur über ein explizites Reload geprüft; Goals-Recovery setzt eine spätere gültige `goals:subscribed`-Antwort des bereits verbundenen Socket-Transports voraus. Die Fixtures belegen weder reale HTTP-/Socket.IO-Verfügbarkeit noch BrowserSource-/OBS-Darstellung.

Die finale no-cache-Fixture lief mit 18 Tests. Sie enthält Lifecycle-Nachweise für BFCache hide/restore, verspätete Timerantworten, doppelte `pagehide`-Aufrufe, verspätete Goals-Subscribe-Callbacks und Animation-Timeouts nach Teardown.

## Statusgrenzen

`app/test/obs-timer-goals-renderer-fixtures.test.js` prüft originale DOM-Renderer in JSDOM mit synthetischen Fetch-/Socket-Antworten. Der Matrixstatus `in-process-renderer-fixture-passed-not-obs` ist ausschließlich dieser Nachweis. Er ist keine Chromium-, BrowserSource-, Screenshot-, OBS-, Produktintegrations- oder Bildsichtungsabnahme. Die vier Chatango-Ziele bleiben getrennt blockiert und unverändert im 104er Nenner.
