# Vorschlag: verlustfreie Schnorrbecher-Legacy-Migration

**Status:** Produktvorschlag, keine Freigabe und keine Migration. Nur neue Koordinationsdatei; Produktdateien und `Bugstofix.md` bleiben unberührt.

## Ziel und Datenregeln

- Alte gemeinsame Config/State-Dateien bleiben unverändert erhalten. Es gibt keine automatische Profilzuordnung und keinen Profilwechsel.
- Der Nutzer wählt ein vorhandenes Zielprofil ausdrücklich. Session-State wird nie migriert. Config und persistenter State sind getrennte Optionen; State ist nur wählbar, wenn die unveränderte Quell-Config `persistenceMode: "persistent"` angibt.
- Pro Migrationslauf wird genau eine Quelle verwendet. Die kanonische alte Ablage ist `plugins/schnorrbecher/data/coin-jar-{config,state}.json`. Alias-/Altpfade dürfen nur als zusätzliche Quellen angezeigt werden. Bei mehreren möglichen Quellen muss der Nutzer eine auswählen; weder Zeitstempel noch aktives Profil dürfen die Auswahl bestimmen.
- Unbekannte Schemafelder, ungültige JSON, Symlinks/Junctions, fehlendes/gelöschtes Zielprofil und widersprüchliche Config-/State-Paare führen zu Konflikt ohne Schreibzugriff. Vorschau liest Raw-Bytes; Normalisierung darf nicht zur Konflikt- oder Leerzustandserkennung dienen.

## Vorschlag für sicheren Ablauf

1. **Entdecken:** unveränderlich lesen, jede eindeutige Quelle samt Datei-Hashes/Sizes und Schema-Kompatibilität auflisten. Bei genau einer Quelle darf sie vorausgewählt werden, muss aber im Preview sichtbar sein. Bei mehreren Quellen ist explizite Wahl erforderlich.
2. **Vorschau:** Nutzer wählt Quelle, bestehendes Zielprofil und Config/State-Optionen. Vorschau zeigt Zielkonflikte, lesbare Zusammenfassung und SHA-256 der exakten Quellbytes. Sie gibt einen kurzlebigen Einmal-Token aus, gebunden an Quellhashes, Zielprofil-ID, Optionen, Schema-/Migrationsversion, Zielhashes und Quellidentität.
3. **Bestätigung:** UI zeigt dieselbe Hash-/Ziel-/Optionszusammenfassung unmittelbar vor Bestätigung. Import verbraucht den Token einmalig und vergleicht alle gebundenen Werte erneut. Jede Änderung seit Vorschau verlangt eine neue Vorschau und Bestätigung.
4. **Vorher-Sicherung:** Vor Zieländerung werden alle zu ersetzenden Zielbytes in ein dauerhaftes, außerhalb des Plugin-Data-Verzeichnisses liegendes Recovery-Backup geschrieben; Manifest mit Quell-/Zielhash, Profil, Optionen, Zeit und Schema wird zurückgelesen und verifiziert. Sicherungsfehler bricht ohne Mutation ab. Das Backup wird nicht automatisch gelöscht.
5. **Atomarer Commit:** nur in das explizite Zielprofil schreiben. Ziel mit vorhandenen Nicht-Default-Daten ist Konflikt. Für mehrere Dateien wird ein vollständiger Staging-Datenordner angelegt und verifiziert; mit journalisiertem Commit wird dieser als Ganzes atomar an die Zielstelle übernommen. Auf Plattformen, wo ein atomarer Verzeichniswechsel nicht garantiert ist, muss ein Recovery-Journal jeden Zwischenschritt wiederaufnehmbar machen; Erfolg darf erst nach Commit-Verifikation gemeldet werden. Nicht zusammengehörige Plugin-Dateien bleiben erhalten.
6. **Nachprüfung und Abschluss:** Zielbytes gegen erwartete SHA-256 prüfen und erneut parsen/schema-validieren. Quelle bytegleich verifizieren. Bei Fehlern Ziel aus verifizierter Sicherung wiederherstellen; wenn Rollback nicht verifizierbar ist, Recovery-Material behalten und den Lauf als unvollständig melden. Quelle bleibt bis zu einem unabhängigen Backup-/Restore-Nachweis bestehen; danach erfordert ihre Entfernung eine separate ausdrückliche Nutzeraktion.
7. **Retry/Crash:** stabiler `operationId` plus Journalzustände `prepared`, `backup_verified`, `committing`, `committed`, `verified`. Wiederholung derselben Operation mit denselben Hashes/Optionen erkennt bereits vollständig importierte identische Bytes als idempotenten Erfolg. Abweichende Zielbytes erzeugen Konflikt, niemals Überschreiben. Nach Crash wird aus Journal und Hashes entweder sicher fortgesetzt oder zurückgerollt; ohne eindeutigen Zustand bleibt die Quelle unangetastet und Recovery bleibt erhalten.

## Read-only-Abgleich mit aktuellem Dirty `/legacy-data/*`-Entwurf

Die gemeinsame Arbeitskopie ist parallel verändert. Dieser Review hat keinen Plugin-Code editiert und keine Route ausgeführt.

| Geforderter Vertrag | Beobachteter Mismatch im Entwurf |
|---|---|
| Quelle und Ziel explizit | `getLegacyData()` liest genau einen globalen Legacy-Pfad, aber `targetDir` kommt aus `getPluginDataDir({ profileScoped: true })`; Zielprofil implizit aktives Profil, UI hat keine Profilwahl. |
| Eindeutige Quellwahl / Mehrdeutigkeit | Es wird nur die feste Quelle geprüft; keine Inventarisierung konkurrierender Legacy-/Aliasquellen und kein Mehrdeutigkeitsdialog. |
| Preview vor Bestätigung unveränderlich | Preview enthält keinen Raw-Byte-Hash und keinen Einmal-Token. Import liest Quelle/Ziel erneut, aber bindet Bestätigung nicht an zuvor bestätigte Bytes, Profil oder Optionen. |
| Keine Verlust-Normalisierung | Preview normalisiert Config und State und serialisiert beim Import normalisierte Config; unbekannte/Future-Felder können verloren gehen. Normalisierter Target-State kann unbekannte Felder verwerfen und fälschlich als leer erscheinen. |
| Vorherige Daten dauerhaft sichern | Ersetzen des vermeintlich leeren State verschiebt Ziel nur in temporäres Stage und löscht dieses im `finally`; es gibt kein dauerhaftes, verifiziertes Vorher-Backup. |
| Atomare Mehrdatei-Transaktion und verifizierter Commit | Dateien werden einzeln kopiert; Config/State bilden keinen atomaren Commit. Erfolg wird nicht durch Hashes verifiziert. Rollbackfehler werden ignoriert, danach wird Stage rekursiv entfernt. |
| Idempotenter Retry/Crash | Kein stabiler Operationsbeleg/Journaling; vorhandene Config ist pauschal Konflikt, während leere State-Datei ersetzt werden darf. Crash zwischen den Kopien kann einen Teilzustand hinterlassen. |
| Quelle bleibt bis unabhängiger Sicherung | Der normale Pfad belässt Quellbytes zwar, doch es gibt keinen unabhängigen Backup-/Restore-Beleg; UI bezeichnet den Import ohne diesen Nachweis als abgeschlossen. |

Wiederverwendbar sind höchstens Status-/Vorschaukonzept und getrennte Config-/State-Auswahl. Dieser Entwurf ist kein freigabefähiger Schreibpfad.

## Synthetische Testmatrix

Alle Fälle mit isoliertem temporärem Root, synthetischen JSON-Bytes und Fake-Profilinventar; keine Nutzerdateien, echten Profile, App-Ports oder OBS.

| Fall | Erwartung |
|---|---|
| Eine Legacy-Quelle, Zielprofil alpha vorhanden | Preview nennt exakte Quelle, Raw-Hashes und alpha; nur nach gebundener Bestätigung wird alpha beschrieben. |
| Zwei mögliche Legacy-/Aliasquellen | Keine automatische Auswahl/Schreiboperation; Nutzer muss Quelle auswählen. |
| Config persistent + State, Ziel beta leer | Optionen getrennt; Zielbackup verifiziert; Commit/Hashes geprüft; Quelle bleibt bytegleich. |
| Config session + State | Config separat migrierbar; State-Auswahl gesperrt und Import serverseitig abgelehnt. |
| Nutzer wählt Config allein | Ausschließlich Config im Ziel, kein State und keine Änderung an anderem Profil. |
| Ziel fehlt, Profil-ID ungültig/Profil gelöscht | Abbruch vor Backup und Schreibzugriff. |
| Ziel enthält nicht-leere Config/State oder unbekannte Felder | Konflikt; keine Normalisierung zum Überschreiben oder Leerzustand. |
| Ungültige JSON, unbekannte Quellfelder, Symlink/Junction | Fail closed; Quell-/Zielhashes unverändert. |
| Quelle, Ziel, Profilinventar oder Optionen ändern sich nach Preview | Token abgelehnt; erneute Preview und Bestätigung erforderlich. |
| Backup schreiben/lesen/verifizieren schlägt fehl | Kein Commit; Ziel bytegleich. |
| Fehler nach erster gestagter Datei / während Commit | Journalbasierter Resume/Rollback; keine Erfolgsmeldung ohne Zielhash-Verifikation. |
| Crash in jedem Journalzustand | Restart setzt denselben Lauf höchstens einmal fort oder stellt vorherige Zielbytes wieder her; Quelle unverändert. |
| Gleiches `operationId` erneut nach Commit | Idempotenter Erfolg ohne weitere Änderung. |
| Gleiches `operationId`, aber andere Hashes/Optionen/Zielbytes | Konflikt; kein Überschreiben. |
| Quelle nach Commit prüfen | Identische Raw-Hashes; bleibt bestehen bis unabhängiger Backup-/Restore-Beleg. |

## Offene Produktentscheidung

Bei mehr als einer möglichen Legacyquelle muss Produkt/Owner entscheiden, ob die Oberfläche alle Kandidaten einzeln mit Pfadalias, Größe, Änderungszeit und Hash zur Nutzerauswahl anzeigt oder die Migration bis zu einer manuellen Support-/Dateiauswahl sperrt. Sicherheitserfordernis steht fest: keine heuristische Auswahl. Ebenfalls vor Implementierung zu entscheiden: Recovery-Backup-Ort und -Aufbewahrung sowie wie ein unabhängiger Backup-/Restore-Nachweis im Produkt festgestellt wird. Bis dahin keine automatische Löschung und kein stilles Zusammenführen.
