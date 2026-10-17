# Sidekick OBS-Pilot: Semantik der fünf Phasen

Stand: 2026-10-07. Quelle-only-Prüfung und listenerfreier In-Process-Test. Kein Server, keine VM und kein OBS gestartet; keine OBS-/Liveabnahme.

## Befund

`scripts/obs-pilot/run-pilot.js` erzeugt für jede Phase eine neue Browser-Source-Instanz, wartet in `beforeScreenshot` auf kumulative Fixture-Zähler und danach pauschal 450 ms. Danach nimmt es Source- und Szenenbild auf, entfernt Input und Szeneneintrag und wartet auf ausgeglichene Socket-Verbindungen. Das Cleanup ist sinnvoll gestuft.

Die 503-Phase ist gegen einen Socket-Überschreibungsfehler geschützt: `socketStatusEnabled` bleibt bis Phase 2 aus. Der HUD sendet zwar den Statusrequest, aber das Fixture antwortet in der ersten Phase nicht über Socket.IO. Der HTTP-503-Handler setzt den Dot auf `status-dot disconnected` und blendet „Sidekick status unavailable“ ein. Damit kann der Fehlerzustand im HUD sichtbar werden, bevor Phase 2 den Socket-Status aktiviert.

Der Screenshot-Zeitpunkt ist dennoch nicht deterministisch an den gerenderten Zustand gebunden. `waitForActivity()` prüft serverseitige Zähler, die vor vollständigem Empfang und DOM-Update steigen können. Anschließend kompensiert ein fixer 450-ms-Delay diese Race nur zeitlich. Der Runner liest vor der Aufnahme weder DOM-Klassen noch Text aus dem BrowserSource. Ein erfüllter Aktivitätszähler belegt also die Anfrage, nicht deren sichtbare Darstellung. Die unabhängige Bildprüfung bleibt für diese Darstellung nötig.

Die Zähler sind kumulativ und die Wartebedingung ist `>=`. Ein zusätzlicher Request oder eine unerwartete Wiederholung wird daher nicht als Abweichung markiert. Der HUD pollt Status alle zwei Sekunden und Events alle fünf Sekunden. Im üblichen kurzen Ablauf sollte pro neuer Source je ein erster HTTP-Request und ein Socket-Request anfallen; die aktuelle Runner-Prüfung erzwingt diese exakten Stage-Deltas jedoch nicht.

## Erwartete Stage-Semantik

| Phase | HTTP-Status | Dot-Klasse / Farbe | Statushinweis | Chat/Min, Gifts, Follows, Viewer | Eventkarten |
| --- | --- | --- | --- | --- | --- |
| `status-unavailable` | Status 503; Events 200 | `status-dot disconnected`, rot `#f44336` | „Sidekick status unavailable“ sichtbar | 0, 0, 0, 0 (frische HUD-Instanz) | Pilot Viewer: Synthetic Rose und „Synthetic OBS pilot chat“ |
| `status-recovered` | Status 200; Events 200 | `status-dot`, grün `#4CAF50` mit Puls | verborgen | 12, 3, 2, 5 | dieselben zwei Karten |
| `muted` | Status 200; Events 200 | `status-dot muted`, orange `#ff9800` | verborgen | 12, 3, 2, 5 | dieselben zwei Karten |
| `disconnected` | Status 200; Events 200 | `status-dot disconnected`, rot `#f44336` | verborgen; kein HTTP-Fehler | 0, 3, 2, 0 | dieselben zwei Karten |
| `reconnected` | Status 200; Events 200 | `status-dot`, grün `#4CAF50` mit Puls | verborgen | 8, 4, 3, 6 | dieselben zwei Karten |

Erwarteter erster Ladebeleg je Source: ein Statusrequest, ein Eventrequest mit erfolgreicher Antwort, eine Socket-Verbindung und ein `sidekick:public-status:request`. Für die erste Phase gilt Statusfehler 1/Erfolge 0 und keine Statusantwort über Socket.IO; in den vier folgenden Phasen gilt Statusfehler 0/Erfolge 1 und eine projizierte Socket-Statusantwort. Nach Entfernen jeder Source muss die Socket-Verbindung geschlossen sein, bevor die nächste Phase beginnt. Diese exakten Sollwerte sind im neuen In-Process-Test abgedeckt. Im OBS-Runner selbst sind die Aktivitätswerte zurzeit kumulativ.

Die fünf deklarierten HUD-Semantiken unterscheiden sich in Dot, Fehlermeldung und/oder Zahlen. Ob Source-PNGs verschiedene Hashes haben, lässt sich erst nach einem echten Capture beurteilen. Das neue Stage-Contract-Modul macht keine Hashannahme. Der bestehende `finalizePilotResult()` enthält aktuell trotzdem einen Hash-Unterschieds-Gate; der Runner-Owner muss diesen anhand der echten Bilder und Sichtprüfung abgleichen, bevor das Ergebnis als bestanden gilt. Szenen-PNGs dürfen wegen der leeren Tutorial-Szene gleich sein.

## Visuelle Prüfung der fünf Source-PNGs

- Für `status-unavailable.source.png` roten Dot, sichtbaren Text „Sidekick status unavailable“, vier Nullwerte und beide Eventkarten prüfen.
- Für `status-recovered.source.png` grünen pulsierenden Dot, keinen Verfügbarkeitshinweis sowie `12 / 3 / 2 / 5` prüfen.
- Für `muted.source.png` orangen Dot, keinen Hinweis und dieselben Werte wie bei status-recovered prüfen.
- Für `disconnected.source.png` roten Dot ohne HTTP-Fehlerhinweis sowie `0 / 3 / 2 / 0` prüfen. Dieser Unterschied trennt den echten Statusfehler der ersten Phase vom gültigen Offline-Status.
- Für `reconnected.source.png` grünen Dot, keinen Hinweis und `8 / 4 / 3 / 6` prüfen. Der sichtbare Zahlenunterschied gegenüber status-recovered erklärt den unterschiedlichen Source-Hash.
- In allen fünf Bildern kontrollieren, dass beide Karten mit Pilot Viewer, Synthetic Rose und „Synthetic OBS pilot chat“ lesbar und nicht abgeschnitten sind und keine privaten Canary-Werte erscheinen.
- Für jedes Bild 1280×720, vollständige HUD-Sichtbarkeit und plausiblen Kontrast notieren. Die fünf Source-Dateinamen samt SHA-256 und Prüfergebnis im Review erfassen. Gleiche Source-Hashes werden erst anhand der tatsächlichen Bilder bewertet; gleiche Szenen-PNGs sind kein Fehler, wenn die Tutorial-Szene leer und wiederhergestellt ist.

## Stage-Contract-Modul und Prüfung

`scripts/obs-pilot/stage-contract.js` deklariert die fünf HUD-Semantiken und exportiert:

- `STAGES`, `STAGE_ORDER` und `FIXTURE_COUNTERS` für die Sollwerte.
- `createStageContractSequence()`, dessen `verifyStage({ stageName, baseline, activity, cleanup, socketStatusEvents })` Stage-Reihenfolge, Baseline, Aktivitätsstichprobe, Cleanup und Socket-Statusantworten prüft.
- `finish()`, das die vollständige Stage-Sequenz bestätigt und `sourceImageReview: pending-independent-source-png-review` zurückgibt.
- `StageContractError` mit maschinenlesbarem Fehlercode sowie `getStage(stageName)`.

HTTP-/Event-Polls bleiben in den Deltas sichtbar und werden im Receipt gezählt. Die erste Statusphase muss in der Aktivitätsstichprobe genau eine 503 ohne Erfolg zeigen; spätere Statusantworten werden separat als nachgelagerte Polls protokolliert und belegen den Bildzustand nicht. Folgestages müssen in der Aktivitätsstichprobe Erfolg zeigen und während der Source-Laufzeit frei von 503 sein. Pro Stage gelten genau eine neue Socket-Verbindung und Statusanfrage, genau eine passende projizierte Statusantwort (keine in der ersten Phase) und vor der nächsten Stage genau eine Trennung. Die Baseline muss dem vorherigen Cleanup entsprechen und frei von aktiven Socket-Clients sein. Alte Phasenpayloads, doppelte Socket-Requests/-Antworten und nicht gepaarte HTTP-Zähler führen zu einem Contract-Fehler.

Eigene Tests: `scripts/obs-pilot/test/stage-contract.test.js` (Node `node:test`, ohne Netzwerk). Acht Tests prüfen Sollsemantik, vollständige Reihenfolge, Polls vor und nach der Aktivitätsstichprobe, wiederholte 503s, doppelte Socket-Anfragen/-Antworten, veraltete Phasenpayloads, Zwischenphasenaktivität, Cleanup, Reihenfolgefehler und Counter-Resets. Befehl: `runtime\node\node.exe scripts\obs-pilot\test\stage-contract.test.js` (Projektroot). Lauf mit gebündeltem Node 22.14.0 bestanden: 8/8; beide Dateien bestehen `node --check`.

## Integrationsvertrag für den Runner-Owner

Die Owner-Integration bleibt separat und ändert weder dieses Modul noch den öffentlichen HUD-/Socket-Vertrag:

1. `run-pilot.js` importiert `createStageContractSequence()`, nimmt `getStats()` als Baseline, `waitForActivity()` als Aktivitätsstichprobe und den Rückgabewert von `waitForNoSocketClients()` als Cleanup-Snapshot.
2. `fixture-host.js` führt eine interne, pro Fixture begrenzte Liste tatsächlich an verbundene Testclients gesendeter `sidekick:public-status`-Payloads und stellt Cursor-/Slice-Zugriff bereit. Das erweitert weder Registry noch öffentlichen Socket-Vertrag. Der Runner übergibt nur die Antworten der jeweiligen Source-Instanz als `socketStatusEvents`.
3. Nach Source-Capture und Socket-Cleanup ruft der Runner `verifyStage()` auf und speichert den Transportbeleg getrennt von den Bilddaten. `finish()` schließt die Sequenz; der Bildstatus bleibt `pending-independent-source-png-review`.
4. OBS-WebSocket stellt hier keinen DOM-Lesezugriff bereit. 450 ms und HTTP-/Socket-Zähler sind kein Rendernachweis. `pilot-result.json` behält den offenen Reviewstatus, bis alle fünf Source-PNGs unabhängig nach der Checkliste geprüft sind.
5. Der vorhandene Source-PNG-Hash-Gate in `finalizePilotResult()` ist separat anhand echter Aufnahmen und Review zu beurteilen. Das Stage-Modul entscheidet nicht vorab, dass Source-Hashes verschieden sein müssen. Für leere Tutorial-Szenenbilder ist keine Hash-Unterscheidung nötig.

`run-pilot.js` und `fixture-host.js` wurden nicht verändert. Das Fixture-Transfermanifest wurde ebenfalls nicht editiert; seine Source-Hashes koordiniert der Owner nach Übernahme des neuen Moduls und Tests.

## Statuskategorien

- **Behoben und geprüft:** neues Stage-Contract-Modul mit fünf Sollzuständen, Baseline-/Delta-/Cleanup-Prüfung und acht In-Process-Tests.
- **Teilweise geprüft:** der Contract prüft Transport und deklarierte HUD-Semantik, nicht das gerenderte OBS-BrowserSource-Bild.
- **Owner-Integration offen:** Runner-/Fixture-Wiring, interne Statusreply-Historie und Entscheidung zum vorhandenen Source-Hash-Gate liegen beim Runner-Owner und wurden hier nicht geändert.
- **Nicht geprüft:** OBS-PNGs, Chromium-/OBS-Runtime-Rendering, visuelle Prüfung der fünf Source-PNGs, öffentliche oder Live-/OBS-Abnahme.
