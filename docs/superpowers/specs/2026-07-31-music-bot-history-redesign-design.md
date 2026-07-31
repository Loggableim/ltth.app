# Soundbot-Verlauf: responsive Archivansicht und Bedienfunktionen

## Ausgangslage

Der Soundbot-Verlauf rendert aktuell jeden Eintrag als `queue-item`, obwohl ein Verlaufseintrag mehr Kinder als das Queue-Grid vorsieht. Dadurch brechen Bewertungs- und Sperrbuttons besonders auf schmalen Viewports in unbrauchbare zusätzliche Grid-Zeilen um. Die UI zeigt außerdem nur Titel, Anfragenden, Bewertung und Sperre, obwohl die Katalogdaten bereits Künstler, Zeitpunkt, Ergebnis, Dauer, abgespielte Sekunden, Provider und URL enthalten.

Die laufende Wiedergabe, der Safety-Lock und die bestehende Queue bleiben außerhalb des Scopes. Die vorhandenen Request-, Ban- und Playlist-Regeln werden wiederverwendet.

## Ziele und Nicht-Ziele

### Ziele

- Verlaufseinträge auf Desktop und Mobil als eigenständige, responsive Verlaufskarten darstellen.
- Historische Einträge serverseitig nach Suchtext, Zeitraum, Ergebnis, Bewertung und Sperrstatus filtern sowie nach Zeitpunkt sortieren.
- Einträge mit verständlichen Metadaten versehen: Titel, Künstler, Anfragender, Zeitpunkt, Dauer/Fortschritt, Ergebnis und Quelle.
- Bedienfunktionen pro Eintrag anbieten: erneut in die Queue, jetzt abspielen, Quelle öffnen/URL kopieren, Playlist wählen, bewerten und sperren.
- Filterwechsel, Pagination, leere Trefferlisten und API-Fehler sauber behandeln.
- Deutsche, englische, spanische und französische Plugin-Texte ergänzen.

### Nicht-Ziele

- Keine neue Datenbanktabelle und keine Migration der bestehenden Play-Events.
- Keine Änderung am MPV-Prozessmanagement, Safety-Lock-Verhalten oder Auto-DJ-Algorithmus.
- Keine generische Neugestaltung der anderen Soundbot-Tabs.
- Kein CSV-Export oder umfangreiche Statistikseite in diesem Schnitt.

## UI-Design

Der Verlauf erhält unter dem Kartenheader eine kompakte Toolbar:

1. Suchfeld für Titel, Künstler, Kanal und Anfragenden.
2. Zeitraum-Auswahl `Alle`, `24 Stunden`, `7 Tage`, `30 Tage`.
3. Ergebnis-Auswahl `Alle`, `Abgeschlossen`, `Übersprungen`, `Früh übersprungen`, `Fehlgeschlagen`.
4. Bewertungs-Auswahl `Alle`, `Gefällt mir`, `Nicht fürs Radio`, `Neutral`.
5. Sperrstatus-Auswahl `Alle`, `Gesperrt`, `Nicht gesperrt`.
6. Sortierung `Neueste zuerst` oder `Älteste zuerst` und eine Zurücksetzen-Schaltfläche.

Jede Karte verwendet ein eigenes `history-item`-Layout. Links stehen Thumbnail oder Musik-Platzhalter, in der Mitte Titel und Künstler sowie eine zweite Metadatenzeile. Rechts stehen Status-Badges und Aktionen. Auf Mobilgeräten wechseln Metadaten und Aktionen in klar getrennte Zeilen; kein Element darf die Kartenbreite überschreiten. Bewertungsbuttons bleiben als zugängliche Buttons mit `aria-pressed` erhalten.

Die Wiederholungsaktionen zeigen vor dem Aufruf keinen neuen Dialog: `In Queue` löst eine erneute Anfrage über die bestehende Dashboard-Request-Logik aus, `Jetzt abspielen` nutzt denselben Pfad und zieht den neuen Titel anschließend an die Queue-Spitze. Dadurch bleiben Resolver, Ban-Prüfung, Queue-Limits und Safety-Lock zentral wirksam. Bei einer Sperre oder einem Resolverfehler erscheint ein bestehender Toast statt einer partiellen UI-Änderung.

`Playlist` öffnet eine kleine Auswahl der vorhandenen Playlists und ruft danach die bestehende `POST /playlists/:id/items`-Route mit der Katalog-Song-ID auf. Geschützte Playlists werden als nicht auswählbar behandelt. `Quelle öffnen` ist ein sicherer externer Link mit `target="_blank"` und `rel="noreferrer"`; `URL kopieren` nutzt die vorhandene Clipboard-Toast-Konvention.

Die Pagination bleibt serverseitig, erhält aber `Zurück`, `Weiter` und die Anzeige des gefilterten Bereichs. Bei einer Änderung der Filter wird die Seite auf 0 gesetzt. Ein laufender Suchrequest darf eine neuere Filterauswahl nicht überschreiben.

## API und Datenfluss

### Verlauf lesen

`GET /api/plugins/music-bot/history` behält `limit`, `offset`, `history` und `total` bei und akzeptiert zusätzlich:

- `q`: freier Suchtext für Titel, Künstler, Kanal und Anfragenden.
- `outcome`: `completed`, `skipped`, `early_skip` oder `failed`.
- `feedback`: `up`, `down` oder `neutral`.
- `banned`: `only` oder `exclude`.
- `from` und `to`: optionale ISO-Datumsgrenzen für `finishedAt`.
- `sort`: `finished_desc` oder `finished_asc`.

Ungültige Filterwerte werden auf sichere Defaults zurückgeführt. Die SQL-Abfrage bleibt mit vorbereiteten Parametern. Such-, Ergebnis-, Bewertungs- und Zeitfilter werden direkt in `MusicCatalog.getHistory` angewendet. Der Sperrfilter verwendet dieselben Ban-Typen wie die Laufzeitprüfung (URL, Track, Künstler, Titel-/Kanal-Keyword und Kanal) und liefert dadurch konsistente `banned`-Werte.

Jeder Eintrag enthält weiterhin die vorhandenen Felder und wird um eine stabile Präsentationsgrundlage ergänzt, ohne die gespeicherten Daten zu verändern. Die Antwort kann zusätzlich `filters` mit den normalisierten Filterwerten zurückgeben, damit die UI ihre Statusanzeige nicht aus Roh-Querywerten rekonstruieren muss.

### Verlauf wiederholen

`POST /api/plugins/music-bot/history/:eventId/replay` akzeptiert `{ "mode": "queue" | "play" }`.

1. Der Katalog löst das Event über `getHistoryEvent` auf und verwirft Einträge ohne wiederverwendbare URL.
2. Die vorhandene Dashboard-Request-Logik löst die URL erneut auf, prüft Bans und Queue-Limits und fügt den Titel mit `requestedBy: "dashboard"` hinzu.
3. Bei `mode: "play"` wird der neue Queue-Eintrag an Position 0 bewegt. Ein laufender Titel wird über den vorhandenen kontrollierten Skip-/Advance-Pfad abgelöst; bei leerem Player wird der normale Startpfad genutzt.
4. Safety-Lock, Resolverfehler und Queue-Rejections werden mit bestehenden HTTP-/Toast-Semantiken zurückgegeben.

Für Playlist-Aktionen, Feedback und Bans werden ausschließlich die bereits vorhandenen Routes verwendet.

## Komponenten und Grenzen

- `lib/music-catalog.js`: History-Filter, Sortierung und Ban-kompatible Abfrage.
- `main.js`: Query-Normalisierung, History-Replay-Route und Weitergabe der bestehenden Playlist-/Feedback-/Ban-Routen.
- `ui.html`: History-Toolbar, Pagination und ein zugänglicher Aktionsbereich.
- `assets/ui.js`: Filterzustand, debounce-/Request-Schutz, Kartenrendering, Replay-/Clipboard-/Playlist-Aktionen und Socket-Refresh.
- `assets/ui-style.css`: ausschließlich History-spezifisches, responsives Layout; Queue-Styles bleiben unverändert.
- `locales/{de,en,es,fr}.json`: alle neuen sichtbaren Texte und ARIA-Labels.

## Fehler- und Sicherheitsverhalten

- Keine Aktion darf den Safety-Lock umgehen.
- Replay wird bei fehlender URL, nicht gefundenem Event, Ban, Queue-Limit oder Resolverfehler ohne lokale Optimismusänderung abgebrochen.
- Clipboard-Fehler zeigen einen Toast und lassen die Quelle weiterhin als Link erreichbar.
- Veraltete Filterantworten werden verworfen.
- Alle dynamischen Titel-, Künstler-, URL- und Nutzerwerte werden beim HTML-Rendering escaped.
- Externe Quellen erhalten nur die bereits gespeicherte URL; keine neue URL wird ungeprüft als HTML injiziert.

## Verifikation

- Katalogtests für jeden Filter, Sortierung, Pagination, Banstatus und leere Treffer.
- Route-Tests für History-Abfrage, ungültige Filter, Replay in Queue, Replay mit `play` und Safety-Lock-Rejection.
- UI-Regressions- und i18n-Tests für Toolbar, Metadaten, Aktionslabels und responsives History-Markup.
- TDD-Zyklus für jede neue Backend-Funktion: Test zuerst rot, minimale Implementierung grün, danach Refactoring.
- Fokussierte Jest-Suites, `npm run build:css`, `npm run lint` und `git diff --check`.
- Reale Browser-Prüfung der Verlaufansicht bei Desktopbreite und 390px Mobilbreite inklusive Filterwechsel, Pagination und einer nicht-livekritischen Queue-Aktion. Der laufende Player wird während der Prüfung nicht pausiert oder ersetzt.
