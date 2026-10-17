# Backend- und LIVE-Bugstofix-Zuordnung

Stand: 2026-10-06. `Bugstofix.md` ist Quelle der Bug-IDs und blieb unverändert. „Behoben“ bezeichnet hier die Codekorrektur mit gezieltem Regressionstest, keine allgemeine Live-Abnahme.

## Fachbereich Rollen, Ereignisse und CoinBattle

| ID | Status | Umsetzung und Testbeleg | Grenze |
|---|---|---|---|
| LIVE-034/035/043 | Behoben und geprüft | GCCE nutzt explizites Moderatorflag; Rollen sind Teil des Rechtecache-Schlüssels; Music Bot prüft Moderator-/Subscriberstatus getrennt. Rollen-Downgrade-, Moderator- und Parserfixtures; `permissions-events-regression.test.js`. | Keine reale Rollenänderung/Chataktion. |
| LIVE-029/031/033 | Behoben und geprüft | Normalisierte Seriencoins werden nicht erneut multipliziert; Viewer-XP zählt gebündelte Likes und Giftergesamtwerte einmal. Isolierte Adaptervertragsfixtures und `viewer-xp-gcce-integration.test.js`. | Kein echtes TikTok Gift-/Likeevent, keine öffentliche Rangliste. |
| LIVE-041/042 | Behoben und geprüft | Challenge-Einsätze bei Matchstartfehler vollständig erstattet; GCCE-Top-Level-Benutzerkontext genutzt. `coinbattle/test/regressions.test.js` mit In-Memory-SQLite/Fixtureevents. | Keine produktive Profildatenbank, echte Runde oder Live-Chataktion. |
| LIVE-019 | Code behoben, gezielt geprüft | GCCE-Übersicht zeigt `totalExecuted` aus Stats-API. Bestehender Quell-/UI-Test `gcce-all-commands-display.test.js`; Bugstofix dokumentiert gerenderte API/UI-Reproduktion. | UI in dieser Ergänzungsrunde nicht erneut live geöffnet. |
| LIVE-037 | Code behoben, gezielt geprüft | Filteroptionen aus registrierten Kategorien/Rechten; eigene Meldung bei null Treffern. `gcce-all-commands-display.test.js`. | UI in dieser Ergänzungsrunde nicht erneut live geöffnet. |
| LIVE-040 | Behoben und geprüft | Chess-Restore validiert lokales temporäres Brett vor Mutation der Zielinstanz. `game-engine/test/chess-game.test.js` prüft vollständige Zustandsidentität nach Ablehnung. | Route-/DB-Wiederherstellung und echtes Spiel nicht geprüft. |
| LIVE-033 Folgetest | Erwartung aktualisiert, gezielt geprüft | `test/viewer-xp-event-processing.test.js` sendet `likeCount: 5`; Erwartung korrigiert auf fünf gezählte Likes gemäß normalisiertem Vertrag. Die Suite bestand erneut. | Keine echte Live-Likegruppe. |
| GCCE alias/cooldown contract | Erwartung aktualisiert, gezielt geprüft | `streamalchemy` ist in `plugin-identities.js` Alias von `stream-monsters`; GCCE gibt kanonische `pluginId` zurück. Beide veralteten Parserresultat-Erwartungen sind aktualisiert; `gcce-plugin-cooldown-contract.test.js` besteht. |
| Chess autoplay real-worker smoke | Teilweise geprüft / umgebungsbedingt blockiert | Workerasset ist vorhanden, direkter Node-22-Spawn endet mit `EPERM`; Warmup-Fehlschlag ist in dieser Umgebung kein Produktcodebeleg. Der Autoplay-Smoke bleibt außerhalb der bestätigten Live-/Runtimeabnahme. |

## Weitere bereits zugeordnete IDs

| IDs | Zuständige Statusdatei / Bereich | Aussage |
|---|---|---|
| LIVE-005/030/048 | `docs/coordination/permissions-events.md`, Abschnitt Runtimeprobe; Public-Overlay-Facharbeit zusätzlich `docs/coordination/public-overlays.md` | Renderer-/CSS-Korrekturen gezielt geprüft; LIVE-048 lokaler Renderer plus Registryvertrag, keine öffentliche Tunnel-/OBS-Abnahme. |
| LIVE-010/011/044/047 | `docs/coordination/permissions-events.md`, Folgeauftrag LIVE-010/011/044/047/048 | Codekorrekturen und fokussierte Suite; kein echter Ollama-Cloudcall oder OS-Prozessscan. |
| LIVE-016/017/018/022/032/038/039/045 | `docs/coordination/permissions-events.md`, jeweilige Runden | Codekorrekturen und isolierte Regressionen; keine allgemeine Live-/OBS-Abnahme. LIVE-022 SuperFan-Positivbeleg bleibt Vertragsgrenze. |
| LIVE-023/024/025/026/036 | `docs/coordination/clarityhud.md` | ClarityHUD Renderer/Connector-Korrekturen mit den dort genannten Tests. LIVE-025 ändert zentralen Adapterkontext und bleibt entsprechend dem bestehenden Orchestratorbeleg abgestimmt. |
| LIVE-002/006/012/027/028 | `docs/coordination/profile-data.md` | Profilpfad-, Backuptransaktions-, Schnorrbecherzustands- und ClarityHUD-Importkorrekturen mit Test-/Runtimegrenzen im Fachbericht. |
| LIVE-003/016/017/018/038/039 | `docs/coordination/permissions-events.md` | CoinBattle-Restzeit, Game-Engine-UI/API und Weather-Questkorrekturen; isolierte/regressiongeprüfte Umfänge und Grenzen im Fachbericht. |
| LIVE-003/005/010/011/016/017/018/022/023/024/025/026/027/028/029/030/031/032/033/034/035/036/037/038/039/040/041/042/043/044/045/047/048 | siehe Fachberichte oben | Die Einträge sind nicht als unbelegte Produktionsabnahme zu verstehen; Grenzen stehen im jeweils zuständigen Bericht. |

## Abgrenzung weiterer IDs

Die ID-Suche in `Bugstofix.md` findet LIVE-001 bis LIVE-054, ohne LIVE-040 auszulassen; LIVE-040 ist oben bearbeitet. Die ID-Zuordnung des vollständigen Aufgabenbestands führt der Orchestrierungschat. Dieser Bericht markiert weitere IDs nur dann als zugeordnet, wenn ein Fachstatusbericht sie explizit nennt.

- **LIVE-020/021:** Weather-Control UI-/Preset-/Übersetzungsbefunde. Keine Rollen-/Ereignisbackendkorrektur in diesem Fachauftrag.
- **LIVE-046/049/050/051/052/053/054:** WebGPU-/Store-/UI-Befunde. Keine Rollen-/Ereignisbackendkorrektur in diesem Fachauftrag.
- **Nicht in den hier geprüften Backend-Fachbericht übernommen:** LIVE-001/004/007/008/009/013/014/015/020/021. Die darin berichteten HUD-/Overlay-/UI-/Storebereiche liegen außerhalb der Rollen-/Ereignis-/CoinBattle-Korrekturen; die aktuelle Suche ergab darin keinen zusätzlichen eigenständig reproduzierbaren Backendfehler für diesen Fachbereich.
- **Orchestratorzuordnung zu verifizieren:** übrige IDs, die nicht oben und nicht in `clarityhud.md`/`profile-data.md` aufgeführt sind. Insbesondere sind einzelne UI-/Public-Overlay- und Spielregelfälle nicht automatisch Backendfehler.

## Verifikation in dieser Ergänzung

- Gebündelter Node 22.14.0: 5 Suites / 45 Tests bestanden (`gcce-all-commands-display`, Rollen-/Ereignisregression, Viewer-XP/GCCE-Integration, CoinBattle-Regressionen, ChessGame).
- `git diff --check` für die von dieser Ergänzung geänderten Chess-Dateien bestanden.
- Nicht geprüft: vollständige App-Jest-Suite, tatsächliche GCCE-UI-/Overlay- und TikTok-Liveabnahme, reale Zuschauerrollen/-events, reale CoinBattlekonten oder Spiele.
- Keine Veröffentlichung, kein Push, keine echten Liveaktionen und keine Änderungen an realen Daten.
- Die einmalige vollständige App-Jest-Baseline sowie die gezielte Sidekick-/ClarityHUD-Nachprüfung sind in `docs/coordination/full-regression.md` dokumentiert.
- Nachfolgeprüfung mit `--detectOpenHandles` auf den eigenen GCCE-/ViewerXP-/CoinBattle-/Schachregressionssuites: kein offener Handle dieser ausgewählten Suites berichtet. Der volle Jestlauf ist nach Gesamtabschluss zwar mit Open-Handle-Warnung stehengeblieben; deren Ursprung bleibt außerhalb der fokussiert geprüften Backend-Suites offen.
- Separater Overlayowner-Hinweis: AnimazingPal-Integration hatte einen reproduzierbaren Fixture-Timer-Leak; isolierter Speech-Playback-Teardown wurde mit Zustimmung des Owners ergänzt und die Suite mit `--detectOpenHandles` regulär erfolgreich beendet. Diagnose und Grenze stehen im Folgeabschnitt von `full-regression.md`.
