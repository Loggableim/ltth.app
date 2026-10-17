# Music-Bot Queue-HTTP-Privacy: Vorschlag

Stand: 2026-10-08  
Arbeitsmodus: read-only Quelltextprüfung; dieses Dokument ist die einzige Änderung dieses Auftrags.

## Befund

`GET /api/plugins/music-bot/queue` gibt in `app/plugins/music-bot/main.js:2721-2725` das interne Array von `QueueManager.getQueue()` direkt zurück. Queue-Einträge enthalten unter anderem `id`, `url`, `streamUrl`, `streamHeaders`, `localPath`, `providerId`, `trackKey`, `channelId`, `requesterKey` und `requesterAvatar` (`app/plugins/music-bot/lib/queue-manager.js:121-142`). Das überschreitet die Anzeige-Allowlist und gibt interne Kennungen sowie Wiedergabe-Transportdaten an den GET-Aufrufer weiter.

Der direkte Dashboard-GET-Consumer ist `renderQueueFromServer()` in `app/plugins/music-bot/assets/ui.js:2208-2212`. Das Dashboard erhält Queuezustand zusätzlich über `musicbot:queue-update` (`assets/ui.js:1495-1497`). Dieser Socket-Pfad ist unabhängig von der HTTP-Projektion: `_emitQueue()` emittiert derzeit das rohe Queue-Array (`main.js:4527-4532`). Eine Änderung nur am GET behebt daher die HTTP-Leakstelle, beweist aber keine vollständige Queue-Privacy über Socket.IO. Socket-Verträge und öffentliche Overlay-Nutzung sind ausdrücklich ein separater Prüfpunkt.

Die erlaubte Antwortprojektion soll ausschließlich enthalten:

- Queue-Titel, Artist, Dauer und soweit für die Anzeige vorhanden Playbackstatus/-position;
- Queue-Titel und Vote-Anzahlen, sofern diese Werte aus einer bestehenden Quelle eindeutig abgeleitet werden können;
- Requester-Anzeigename und optional ein gültiges HTTPS-Profilbild.

Keine IDs, URLs oder Header, lokalen Pfade, Provider-/Track-/Requester-Keys, Rohdaten, Einstellungen oder unbekannten Felder. Das Profilbild ist nur dann auszugeben, wenn es als HTTPS-URL parsebar ist und keine Zugangsdaten im URL-Benutzerinfofeld enthält; andernfalls `null`.

Die aktuellen Queue-Einträge enthalten keine expliziten Queue-Vote-Zähler oder Playbackposition. Diese Felder dürfen nicht aus beliebigen Queue-Rohfeldern geraten werden. Playbackinformationen sollen, falls tatsächlich benötigt, aus dem getrennten Now-Playing-Status mit eigener Allowlist kommen. Die HTML-Queue zeigt derzeit Titel, Requester und Dauer; das Dashboard nutzt `youtubeId` für ein Thumbnail und `isGiftRequest` für ein Geschenk-Badge (`assets/ui.js:2181-2185`). Beides ist nicht in der freigegebenen Allowlist und muss in einer Umsetzung aus dieser Queue-Antwort entfallen. Es dürfen keine Ersatz-IDs oder -URLs in die Queue-Projektion aufgenommen werden.

## Revisions- und Aktionsvertrag

`QueueManager` besitzt derzeit keine monotone Queue-Revision (`lib/queue-manager.js:12-35`). `getQueue()` gibt das veränderbare interne Array zurück. `addSong`, `shiftNext`, `returnToFront`, `clear`, `removeSong`, `reorderSong` und `restoreQueue` verändern die Queue-Struktur. `setTrackLocalPath` mappt Queue-Einträge ebenfalls neu, ändert aber kein freigegebenes Anzeigefeld (`lib/queue-manager.js:112-208, 229-238, 541-609`). Eine Revision ist daher neu einzuführen und darf nicht nur auf einzelne HTTP-Routen reagieren.

**Empfehlung:** eine monotone In-Memory-`queueRevision`, übertragen als starker HTTP-`ETag` (z. B. opaker, pro Prozess monotoner Revisionswert), und bei Queue-Mutationen verpflichtendes `If-Match`. Ein zusätzlicher Revisionswert im JSON-DTO ist nicht nötig. Das hält die erlaubte JSON-Feldliste sauber und nutzt Standard-HTTP-Konditionalität.

- GET liefert nur das DTO und `ETag` für genau denselben Queue-Snapshot.
- Play, Delete und Reorder erfordern `If-Match` aus diesem Snapshot sowie Index/Operation. Kein Client muss die Song-ID erhalten.
- Fehlt `If-Match`, antwortet der Server mit `428 Precondition Required`; stimmt die Revision nicht mehr, mit `409 Conflict` und einem stabilen Fehlercode wie `QUEUE_REVISION_CONFLICT`. Die Antwort darf keine Queue-Rohdaten oder IDs enthalten; der Client lädt GET erneut und zeigt die aktualisierte Queue an.
- Die Prüfung der erwarteten Revision, Indexauflösung und jeweilige synchrone Queue-Mutation müssen in einer einzelnen QueueManager-Operation ohne `await` zwischen Prüfung und Änderung stattfinden. Auf einem einzelnen Node-Eventloop verhindert das Interleaving während dieses synchronen Abschnitts. Die Invariante gehört in den QueueManager, nicht nur in Route-Code.
- Revision bei jeder strukturellen Mutation genau einmal erhöhen: Add, Dequeue/Shift, Rückgabe an den Anfang, Clear (nur wenn Zustand sich ändert), Remove, Reorder (nur wenn Reihenfolge sich ändert), Restore und Wiederherstellung nach einem Persistence-Fallback. Kein Inkrement bei fehlgeschlagenen/No-op-Operationen oder Änderungen ausschließlich an nicht freigegebenen Transportfeldern.
- `getQueue()` darf nach Einführung des Revisionsvertrags keine veränderbare interne Array-Referenz mehr herausgeben. Vorher alle Aufrufer auf schreibenden Zugriff prüfen; im aktuellen Suchlauf fand sich in den Music-Bot-Aufrufern kein absichtlicher Queue-Array-Schreibzugriff außerhalb des QueueManagers.

### Rennen und Grenzen von `queueRevision + index`

1. **GET → fremde Mutation → Aktion:** Revision ändert sich; `If-Match` schlägt mit 409 fehl, bevor irgendein Track angefasst wird. Das ist der Hauptnutzen gegenüber dem heutigen Index-Fallback.
2. **Gleichzeitige Aktionen:** QueueManager serialisiert Revisionscheck und synchrone Mutation. Die erste erfolgreiche Mutation erhöht die Revision; die zweite mit alter Revision erhält 409.
3. **Check getrennt von Mutation:** Wird in der Route verglichen und danach ein `await` oder Callback ausgeführt, kann eine andere Mutation dazwischenkommen. Deshalb muss der erwartete Revisionswert Teil der QueueManager-Operation sein; keine asynchrone Arbeit vor dem Commit.
4. **Play ist asynchron:** Die aktuelle Route verschiebt den gewählten Eintrag auf Index 0 und ruft dann `_skipCurrent()` oder `_playNextFromQueue()` auf (`main.js:3114-3154`). `_skipCurrent()` wartet auf Playback und der Queue-Advance kann später erst `shiftNext()` ausführen (`main.js:4060-4077, 4220-4241`). Eine Revisionsprüfung plus `reorderSong(index, 0)` schützt deshalb nur die Auswahl zum Annahmezeitpunkt; nach diesem synchronen Schritt kann eine weitere Queue-Änderung vor dem späteren `shiftNext()` den vordersten Track austauschen. `If-Match` allein schließt dieses spätere Race nicht.
5. **Play-Sicherheitsanforderung:** Der begrenzte Folgefix muss die akzeptierte Auswahl als internen Track-Handle/Reservierung binden und diesen konkreten Track durch den bestehenden Single-Flight-Playbackpfad führen. Bis dieses Playback-Routing geprüft und mit konkurrierendem Add/Reorder/Delete getestet ist, darf Play nicht still auf bloßen Index-Fallback umgestellt werden. Bei einem Playbackfehler muss die Reservierung denselben Track sicher zurückgeben oder freigeben; sie darf nicht einen neuen Index interpretieren.
6. **Sichtbarkeit parallel zum GET:** Wenn das Dashboard Queueupdates per Socket empfängt, müssen diese Updates zusammen mit der UI auf denselben Revision-/Aktionvertrag gebracht werden. Andernfalls kann der Client zwar die Anzeige aus Socketdaten aktualisieren, besitzt aber keinen dazu passenden `ETag`. Die rohe `_emitQueue()`-Übertragung ist außerdem ein separater Transport-Leak, den dieser HTTP-only Umfang nicht behebt.

Aktuelles Backendverhalten bestätigt, dass IDs für den jetzigen Vertrag funktional erforderlich sind: Delete verlangt `songId` zwingend (`main.js:3076-3091`); Reorder löst `sourceSongId`/`targetSongId` auf und kann dadurch aktuelle Indizes finden (`main.js:3094-3111`); Play verwendet `songId` für die stale-sichere Auswahl und liefert bei fehlender ID einen Index-Fallback (`main.js:3114-3154`). Das Dashboard sendet IDs bei Play, Delete, Reorder und Drag-and-drop (`assets/ui.js:2186-2201, 2223-2259, 2280-2312`). Deshalb ist eine reine GET-Allowlist ohne passende API-/Consumer-Änderung nicht kompatibel.

## Eng begrenzter Folgeimplementierungsauftrag

Nach expliziter Freigabe des `main.js`-Freeze nur diese Oberfläche bearbeiten:

1. `app/plugins/music-bot/lib/queue-manager.js`: monotone Revision, unveränderlicher Queue-Snapshotzugriff und synchrone konditionale Queue-Operationen; alle internen Strukturänderungen einschließen.
2. `app/plugins/music-bot/main.js`: Queue-GET-Allowlist plus ETag; Play/Delete/Reorder auf `If-Match` umstellen und fehlende/veraltete Vorbedingungen ohne Mutation mit 428/409 ablehnen. Play muss die gewählte Trackinstanz durch den Playbackpfad reservieren/binden. Rohdaten und Song-IDs dürfen in den HTTP-Queue-GET oder dessen Fehlerantworten nicht zurückkehren.
3. `app/plugins/music-bot/assets/ui.js`: Queue-GET-ETag speichern, nur die Allowlist rendern, Play/Delete/Reorder/Drag-and-drop mit ETag und Index senden; auf 409 frisch laden und keine alte Aktion wiederholen. Socketupdates nur in dieser Folgeänderung anfassen, wenn ein klarer privater Dashboard-Vertrag besteht; keine ungeprüfte Änderung der Overlay-Registrierung.
4. Bestehende Regressiondateien `app/test/music-bot-queue-manager.test.js`, `app/test/music-bot-runtime-ui-regression.test.js` und eine gezielte Route-Regression erweitern. Keine unabhängigen Module, Config-, Socket-Registry- oder Overlay-Änderungen in denselben Patch aufnehmen.

Erforderliche Canary-Regressionen:

- Synthetische Queueeinträge mit `id`, `url`, `streamUrl`, `streamHeaders`, Windows-/POSIX-`localPath`, `providerId`, `trackKey`, `channelId`, `channelName`, `requesterKey`, unbekannten Feldern und ungültigem/HTTP-Avatar serialisieren; keines dieser Werte darf in GET-JSON erscheinen.
- Erlaubte Titel-/Artist-/Dauer-/Requester-Anzeige und HTTPS-Avatar bleiben korrekt; UI escaped Anzeigeinhalte und rendert keine URL oder ID aus dem DTO.
- ETag und DTO stammen aus derselben Queue-Revision. Fehlendes If-Match ergibt 428, stale If-Match ergibt 409; in beiden Fällen bleiben Queue und Playbackaufrufe unverändert.
- Nach Add, Shift, Return-to-front, Clear, Remove, Reorder und Restore wird die Revision aktualisiert; No-op/Fehlschlag erzeugt keine Mutation.
- Zwei konkurrierende Aktionen auf derselben Revision dürfen höchstens eine ausführen. Delete/Reorder mit Zwischenmutation darf nie den Track an der alten Position treffen.
- Play mit Add/Reorder/Delete während eines verzögerten Skip-/Advance-Fixtures muss genau den ursprünglich ausgewählten Track starten oder sauber fehlschlagen; nie den Titel, der nach dem Rennen zufällig am Index steht.
- Dashboard lädt nach 409 neu und sendet keine songId/sourceSongId/targetSongId.
- Falls Socket-Queueupdates in den Implementierungsumfang aufgenommen werden: eigener Canary, der Leaks und konsistente Revision/ETag-Semantik auf diesem Transport beweist. HTTP-Tests allein schließen Socket-Leaks nicht.

## Weitere HTTP-Befunde, nachrangig

| Rang | Route/Befund | Minimale sichere Maßnahme |
| --- | --- | --- |
| P2 | `GET /api/plugins/music-bot/status` (`main.js:2557-2559`): GET umgeht zentrale Admin-Auth; die Route führt pro Abruf `_probePlaybackRuntime()` aus und `_buildStatusPayload()` kann rohe Now-Playing-Felder enthalten. | Eigenes Status-DTO allowlisten und URL/Header/Pfad/ID-Felder abweisen; Probe-Aufrufe cachen/koaleszieren oder begrenzen. Read-Auth prüfen, Socket-Auth schützt diese HTTP-Route nicht. Test auf Leak und Probe-Frequenz. |
| P2 | `GET /api/plugins/music-bot/config` (`main.js:2889-2891`): vollständige Admin-Konfiguration wird über unauthentifiziertes GET ausgegeben, einschließlich lokaler Programmpfade und Admin-Settings. | Zentralen HTTP-Read-Auth für diese Route anwenden oder separate minimale öffentliche Statusantwort anbieten; Roundtrip-Tests nicht als Auth-Abdeckung werten. Socket-Auth hat keinen Einfluss. |
| P2 | `POST /api/plugins/music-bot/streamer-playlist/feedback` (`main.js:2421-2484`): Feedback-Toggle wird committed, dann Playlist separat verändert; Fehler/Retry kann Feedback neutralisieren oder Playlist und Feedback auseinanderlaufen lassen. | Idempotentes Setzen von up/down plus gemeinsame Transaktion oder deduplizierte Operation/kompensierender Rollback. Test mit Fehler nach erstem Commit und Retry. HTTP-AdminAuth reduziert Remotezugriff, behebt keine partielle Commit-/Retry-Semantik. |
| P2 | `POST /api/plugins/music-bot/playlist-imports` (`main.js:2317-2321`): YouTube-Hostvalidierung und einzelner aktiver Import begrenzen Ziel und Parallelität, aber `jobs`-Map/Warteschlange sind unbeschränkt und `_finish()` behält terminale Jobs (`playlist-import-service.js:17-18, 23-38, 167-178`). | Obergrenze für wartende Jobs, Duplikat-/Rate-Limit und TTL/Maxzahl terminaler Jobs; Kapazitäts- und Retentionstests. Remote-POST ist Admin-authentifiziert, Loopback bleibt möglich; Socket-Auth nicht relevant. |

## Validierung und Grenzen

- Nur Quelltext und bestehende Testdateien gelesen; keine Tests gestartet.
- Kein Server, Profil, HTTP/API, Datenbank oder Live-Dienst verwendet.
- Keine Produktdatei oder Testdatei geändert; dieses neue Vorschlagsdokument ist die einzige beabsichtigte Änderung.
- Der Shared Tree enthielt bereits zahlreiche parallele Dirty Hunks. `app/plugins/music-bot/main.js` war schon verändert; sein bei dieser Prüfung gemessener SHA-256 war `A14A2F81691B849AA1B619598B0CE25C1F2BD4CF093DA0CBBD7C60FB0891F3F1`, abweichend vom zuvor dokumentierten Freeze-Hash. Ursache ungeprüft; Datei unangetastet.
