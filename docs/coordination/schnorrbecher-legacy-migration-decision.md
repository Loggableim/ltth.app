# Schnorrbecher: Legacy-Migrationsentscheidung und Abnahmeplan

Datum: 2026-10-07  
Status: Reviewvorlage; **keine Legacy- oder Profildaten wurden migriert**.

## Reproduzierter Upgrade-Effekt

Probe: `output/profile-config-isolation/reproduce-legacy-upgrade-visibility.js`; exakte Plugin-/ConfigPathManager-Baseline HEAD `3f6bb84f96f6b7d9dbe17124c356e209061a3363`, darauf der separat geprüfte runtime-scoped Pfad. Nur temporäre synthetische Dateien.

Die gemeinsame Legacy-Config enthielt `jarLabel="Mein gemeinsamer Becher"`, `persistenceMode="persistent"`; der Legacy-Zustand `totalCoinValue=987`. Beim Start mit aktivem alpha bzw. beta las jeder Runtime-Store sein eigenes `plugins/schnorrbecher/profiles/<id>/data`. Beide zeigten die neue Default-Konfiguration (`jarLabel="Schnorr Becher"`, `persistenceMode="session"`) und `coinValue=0`. Die gemeinsame Legacy-Config (108 Bytes, SHA-256 `bdfedc42969d7633d16b048223a4156e84ae2fe4b12347a0864823c5fa021f41`) und der Zustand (165 Bytes, SHA-256 `584c237babc5a463307153799ec54a9a3a3a85d71cd570ed755b582d67516e98`) blieben bytegleich erhalten. Damit ist die sichere, aber für Nutzer überraschende Wirkung konkret: Alte Werte wirken im Profil wie verschwunden, sind tatsächlich noch in der unzugeordneten gemeinsamen Ablage vorhanden.

Der vorhandene uncommittete UI-/Route-Entwurf zeigt bei Legacyfund einen Hinweis und ein Preview. Er nimmt aber implizit das aktive Profil als Ziel und hat keine explizite Profilwahl. Er kann als Status-/Preview-Konzept dienen, ist jedoch keine sichere Grundlage für eine Datenübernahme ohne die nachfolgenden Korrekturen.

## Entscheidungsvorschlag

Legacy-Daten bleiben global und unzugeordnet, bis der Nutzer eine **Kopieraktion mit explizit ausgewähltem bestehenden Zielprofil** bestätigt. Die alte Quelle wird niemals verschoben oder gelöscht. Kein Profil wird beim Upgrade oder Import gewechselt; `.active_profile` bleibt bytegleich.

Für eine erste sichere Version:

- Konfiguration und persistenten Zustand sind getrennte Auswahlfelder.
- Sessionzustand ist grundsätzlich nicht importierbar.
- Profilziel muss explizit ausgewählt werden; aktive Profilwahl darf als Anzeige erscheinen, aber nicht als stilles Ziel dienen.
- Vor jeder Installation wird ein dauerhaftes Backup von Quelle und Ziel erzeugt und anhand SHA-256 verifiziert. Wenn Backup nicht gelingt, wird abgebrochen.
- Fehlende Zieldateien dürfen neu angelegt werden. Bereits vorhandene Konfigurationsdateien oder Zustände werden als Konflikt behandelt, außer der Zustand entspricht strukturell exakt dem Initial-Default ohne unbekannte Felder. Auch dann wird das ursprüngliche Ziel vor dem Austausch dauerhaft gesichert.
- Ungültige JSON-Daten, unbekannte/future Felder, Symlinks/Junctions und eine während des Preview veränderte Quelle oder Ziel sind Konflikte. Keine Normalisierung darf die Konfliktprüfung vorher unbekannte Felder verwerfen.
- „Abbrechen / später“ ist gleichwertige Standardoption: keine Schreiboperation, keine Profiländerung.
- Nach erfolgreicher Kopie werden Zielprofil, importierte Teile, Sicherungspfad und Quell-/Zielhashes angezeigt. Bei inaktivem Zielprofil wird klargestellt, dass die Werte erst bei dessen nächster Aktivierung gelten.

## UI-/Route-Entwurf

### UI

1. Beim Start, wenn die unzugeordnete Legacyablage Dateien enthält, eine nicht-blockierende Meldung: „Gemeinsame Schnorrbecher-Daten gefunden. Dieses Profil verwendet derzeit Standardwerte. Die alten Dateien wurden nicht gelöscht oder zugeordnet.“
2. Button „Vorschau und Kopie planen“; daneben „Später“.
3. Vorschau zeigt Quelldateien, lesbare Konfigurationsfelder, Modus (Session/Persistent), persistenten Münzwert, Byteanzahl/Hash und Status jeder Datei. Keine Session-ID/Event-ID oder andere nicht benötigte Metadaten in der Übersicht.
4. Dropdown mit bestehenden Profilen und leerem „Zielprofil auswählen“-Wert. Nicht existierende Profile/Profil-IDs werden nicht akzeptiert. „Aktives Profil“ darf informativ markiert sein.
5. Separat auswählbar: „Konfiguration kopieren“ und „Persistenten Stand kopieren“. Die zweite Option ist bei Sessionquelle, ungültigem Schema oder unbekannten Feldern deaktiviert und mit Grund beschriftet.
6. Zielkonflikte zeigen betroffene Datei und Entscheidung: „Abbrechen“ oder „Zieldatei sichern und exakte initiale Datei ersetzen“, nur wenn Raw-JSON strukturell genau `DEFAULT_STATE` entspricht. Keine allgemeine Überschreiben-Schaltfläche in v1.
7. Vor finalem Bestätigen ein kompakter Dialog mit Quelle, konkretem Profilnamen und beiden Dateien/Optionen; ein Profilname muss sichtbar sein. Nach Erfolg Backup-Pfad und SHA-Prüfstatus.

### Route-Vertrag

- `GET /api/coin-jar/legacy-data/status`: Quelle vorhanden/fehlend/ungültig; aktive Runtime erklärt getrennt, ob sie scoped Defaults bzw. profilbezogene Werte lädt.
- `POST /api/coin-jar/legacy-data/preview` mit `{ targetProfile }`: prüft valides ID-Format, tatsächliche Profil-DB-Existenz, Profile-Root/Junctions sowie Quell- und Zieldateien. Antwort enthält Preview-ID/kurzlebigen Token, Hashes, Größen, erlaubte Aktionen und Konfliktcodes.
- `POST /api/coin-jar/legacy-data/import` mit `{ previewId, targetProfile, includeConfig, includePersistentState, confirm: true }`: verlangt nicht leere Auswahl und explizite Bestätigung. Revalidiert Profilexistenz, Pfadauflösung und exakte Quell-/Zielhashes gegen die Vorschau; bei Änderung: stale-preview conflict, keine Schreiboperation.
- Für das Ziel den expliziten `ConfigPathManager.getPluginDataDir('schnorrbecher', { profileId: targetProfile })` verwenden. Nicht über `getPluginDataDir({ profileScoped: true })` das aktive Profil herleiten und nicht `.active_profile` ändern.
- Sicherungen enthalten Originalbytes von Quelle und Ziel plus Manifest mit Ziel-ID, Dateinamen, SHA-256, Größe, Zeit, Auswahl und Schema-Version. Backup wird vor Zieländerungen dauerhaft angelegt und geprüft.
- Installation stage/rename/replace läuft mit No-clobber, ancestor-/Junction-Prüfungen und Rollback. Kann Rollback nicht verifiziert werden, bleibt Recovery-Verzeichnis bestehen und Antwort nennt es; es wird nicht rekursiv beseitigt.

## Vorhandenen Entwurf weiterverwenden?

Wiederverwendbar: Statusbanner, reine Vorschauidee, zwei getrennte Auswahlfelder, getrennte Session-/Persistenzsemantik und „Original bleibt erhalten“-Erklärung.

Vor Implementierung zu korrigieren:

- **Kein explizites Ziel:** aktueller Entwurf bindet Vorschau/Import nur an aktives Profil.
- **Future-State-Verlust:** aktuelle Preview normalisiert Target-JSON vor Defaultvergleich. Synthetischer Raw-State `{ ...DEFAULT_STATE, futureVersionMarker: "preserve-me" }` verliert dieses Feld nach `normalizeState()` und wird danach als initial leer eingestuft. Das ist ein false-empty-Risiko.
- **Legacy-Config-Normalisierung:** aktueller Entwurf serialisiert normalisierte Legacy-Config statt Originalbytes; unbekannte Felder können verworfen werden.
- **Keine dauerhafte Sicherung:** aktueller Code sichert beim Ersetzen der initialen State-Datei nur temporär im Stage-Ordner und löscht den Stage-Ordner schließlich. Es erstellt keinen dauerhaften Vorher-Backupbeleg.
- **Rollback/TOCTOU:** bei Fehlern werden Rollbackfehler ignoriert, bevor temporäre Dateien entfernt werden; Vorschau ist nicht an einen unveränderlichen Quell-/Zielhash gebunden.
- Deshalb nur das UI-/Status-Konzept wiederverwenden. Import-Routen und Schreibpfad benötigen vorheriges Review und eine Transaktions-/Backup-Implementierung.

## Akzeptanzmatrix

| Fall | Erwartung |
|---|---|
| Legacy-Konfig+persistenter Zustand, neue Profile alpha/beta leer | Beide zeigen Profil-Defaults/0; Status nennt unzugeordnete Legacydaten; keine Bytes ändern sich. |
| Alpha und Beta besitzen bereits unterschiedliche scoped Daten | Preview kopiert ausschließlich in das explizit gewählte Profil; anderes Profil und `.active_profile` bleiben bytegleich. |
| Kein Ziel, ungültige ID, Profil gelöscht/nicht vorhanden | Fail closed vor Backup-/Ziel-/Profilmutation. |
| Nur Konfiguration ausgewählt | Nur Config wird kopiert; State-Dateien bleiben bytegleich. |
| Quelle ist Session-Modus | Persistent-State-Import immer abgelehnt; Config kann separat kopiert werden. |
| Persistenter State, Beta hat keine State-Datei | Vorher-Backup erstellt/verifiziert, dann Ziel kopiert; Quelle bleibt bytegleich. |
| Beta enthält exakt strukturellen `DEFAULT_STATE` | Preview kennzeichnet initiale Datei; Zielbackup wird persistent verifiziert, dann exakter Austausch nach Bestätigung. |
| Beta enthält Unknown/Future-Feld, fehlerhafte JSON oder nicht-default Werte | Konflikt; kein Normalisieren zur Leer-Erkennung; Quelle/Ziel/aktives Profil bytegleich. |
| Ziel oder Ancestor ist Symlink/Junction / Traversal-ID | Ablehnung; kein Pfad außerhalb Konfigurationsroot berührt. |
| Quelle oder Ziel ändert sich nach Vorschau | Preview-Token/Hash wird ungültig; keine Datenänderung, neue Vorschau erforderlich. |
| Dialog abgebrochen / später | Quelle, Ziel, Profil-DB und `.active_profile` bytegleich. |
| Backup kann nicht geschrieben/verifiziert werden | Keine Zieländerung; Fehler benennt Backupfehler. |
| Fehler während Copy/Replace | Rollback stellt vorherige Bytes her; bei Rollbackfehler Recoverystage bleibt erhalten und wird benannt. |
| Import in inaktives Beta bei aktivem Alpha | Beta-Dateien geändert und bestätigt; Alpha-In-Memory-Zustand und `.active_profile` unverändert; UI erklärt, dass Beta-Werte bei nächster Aktivierung gelesen werden. |
| Wiederholter Import desselben Archivs | Vorhandene Zielwerte als Konflikt/identisch melden; niemals überschreiben oder duplizieren. |
| Nach erfolgreichem Import | Backupmanifest/Hashes vorhanden; Quelle unverändert; nur Zielprofil geändert. |
| Zielprofil hat bereits eine Konfigurationsdatei (auch Default) | Konflikt in v1; kein Überschreiben, Dateien bleiben bytegleich. |
| Legacy-Konfig enthält unbekannte/Future-Felder oder ungültige JSON | Preview meldet Konflikt; keine Normalisierung/Kopie und keine Änderung an Quelle/Ziel. |

## Blockierende Gates vor Implementierung/Integration

1. CEO bestätigt v1-Policy: manuelle Kopie, Quelle bleibt immer bestehen; Session-State wird nie importiert; nur explizites bestehendes Zielprofil.
2. Owner der vorhandenen uncommitteten `main.js`/UI-/Locale-/Test-Hunks bestätigt, ob Status-/Preview-UI übernommen oder verworfen wird. Keine Whole-file-Übernahme.
3. Raw-State- und Raw-Config-Schemavertrag festlegen: unbekannte Felder führen zunächst zu Konflikt; keine `normalize*()`-basierte Leerprüfung.
4. Dauerhaften Backup-Ort und Backupformat festlegen; Backupfehler muss vor Mutation abbrechen.
5. Profile-Manager-/ConfigPathManager-Kontrakt für explizite inaktive Zielprofile und Symlink/Junction-Abwehr nachweisen.
6. Fault-Injection für Quell-/Zieländerung nach Vorschau, Backupfehler, Partial Copy, Rollbackfehler und Recovery-Staging hinzufügen.
7. Reale Userdaten, Profile, aktive App und HTTP-Port bleiben außerhalb der Abnahme; Integration erst nach grünen isolierten Tests und CEO-Review.

## Unverändert gelassen

Keine Migration ausgeführt, keine gemeinsamen Legacydateien verändert, kein Produktcode geändert. GuideCapture-Freeze-Patches blieben unverändert: B201 `B2015155DAC1234E27757DE09FD837D65C3E9F664FCD7C412F2CF66F1968F188`; VisualFX follow-up `9591F0F7F201809AEDA9075754C01B26F5AD20CDD756208ACF05AA3D530FE6B3`; letzter Report-Stand weiterhin 5 Suiten/21 Tests PASS.

