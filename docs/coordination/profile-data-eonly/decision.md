# E-only Entscheidungsbericht: sicherer Exportfluss

**Stand:** 2026-10-08 23:59 UTC  
**Status:** PLAN FROZEN – kein Code, keine Fixtures und keine Laufzeitdaten geändert.  
**Umfang:** isolierter Architektur- und Testplan für Exportbestätigung. Keine Integration/Commit.

## Kurzentscheidung

Die bestehenden Exportwege sind nicht bytegebunden: `/preview-export` zeigt eine Metadatenvorschau, während `GET /download` das ZIP später neu aus aktuellen Quelldaten erzeugt. Ein separater direkter POST-Export kann die Vorschau umgehen. Der belastbare Zielvertrag ist ein serverseitig vorbereiteter, unveränderlicher Archiv-Snapshot: Auswahl und Pluginfilter werden kanonisiert, alle nötigen Einwilligungen werden vor Erzeugung erteilt, das fertige Archiv wird in einem privaten Temp-Verzeichnis erzeugt und gehasht, und Download liefert genau diese Bytes einmalig aus. Auswahländerung, Fehler, Abbruch oder Ablauf verwerfen das Artefakt.

**Nutzerentscheidung übernommen:** unsignierte Backups erfordern immer explizite Bestätigung. Diese Entscheidung ist mit dem CEO als Anforderung zu führen; die hier geprüfte Oberfläche betrifft Exportzustimmungen. Ein Signaturstatus wird von den betrachteten Exportpfaden derzeit nicht als separater Consent ausgewertet. Vor Implementierung klären, ob und wo der unsigned-import-Consent bereits anderweitig existiert, und ihn nicht mit Exportconsents vermischen.

## Codebefund

- `app/plugins/config-import/main.js:367-390`: Vorschau kanonisiert Auswahl und `pluginFilter`, ruft `backupManager.previewExport(selection)` aber ohne Filter auf. Das gespeicherte Preview bindet Options-JSON und Zeit, keine Archivbytes.
- `app/plugins/config-import/main.js:405-449`: `/api/config-backup/export` kann direkt exportieren; es prüft Bestätigungen und Abhängigkeiten, verlangt aber kein Vorschautoken.
- `app/plugins/config-import/main.js:451-504`: `/export-token` bindet Auswahl/Filter an eine Preview und verbraucht das Previewtoken; das ausgegebene Downloadtoken enthält Optionen, aber keinen Archivpfad oder Hash.
- `app/plugins/config-import/main.js:506-550`: `/download` verbraucht das Einmaltoken, ruft dann `backupManager.export(entry.opts)` auf und streamt neu erzeugte Bytes.
- `app/modules/backup-manager.js:117-124`: `previewExport(selection)` erstellt nur Selektionsstatistiken und reicht keinen Pluginfilter weiter.
- `app/modules/backup/selection.js:225-281`: Statistiken lesen gewählte Kategorien und klassifizieren bekannte sensible DB-Schlüssel; unbekannte Nutzdaten bleiben opak. DB-Dateigrößen und bekannte sensible Eintragsgrößen können in der Vorschau summiert werden; Werte sind daher als Schätzung auszuweisen.
- `app/modules/backup/exporter.js:83-120`: eigentlicher Export unterstützt `pluginFilter` und prüft bekannte sensible sowie vollständige Backup-Bestätigung.
- `app/plugins/config-import/ui.html:827-909`: UI koppelt Schnorrbecher-Persistent-State an Profilscoped und Plugin-Daten, koppelt aber Profilscoped nicht an Plugin-Daten. Auswahländerungen löschen lokal Preview/Token/Consents.
- `app/plugins/config-import/ui.html:913-1015`: UI zeigt Vorschau und fordert passende Consentfelder; finale Übergabe erfolgt über `/export-token`.
- `app/test/config-import-backup-confirmation.test.js:173-340`: vorhandene Tests prüfen Bestätigungsvalidierung und Tokenbindung, aber keine Gleichheit der heruntergeladenen Archivbytes, Hashabweichung oder direkten erfolgreichen API-Bypass.

## Zielvertrag für die Implementierung

1. Eine gemeinsame Options-Kanonisierung bildet Kategorieauswahl, Pluginfilter und alle inhaltswirksamen Exportoptionen ab. Vorschau und Archivvorbereitung verwenden dieselben kanonischen Optionen.
2. `pluginFilter` wirkt auf Vorschauzahlen und Export gleichermaßen und ist Teil der Tokenbindung.
3. UI und Backend erzwingen `profileScopedPluginData → pluginData`; serverseitig ungültige Kombinationen werden abgewiesen, UI schaltet Plugin-Daten automatisch mit ein oder verhindert die ungültige Kombination.
4. Vor Erzeugung werden alle erforderlichen Bestätigungen verlangt. Für vollständige Auswahl müssen Full-Backup- und Known-Sensitive-Consent vorliegen. Die unbekannte-Inhalte-Warnung wird anhand der gewählten opaken Kategorien vorab bestimmt und ebenfalls vor Erzeugung bestätigt. Keine sensiblen Archivbytes entstehen, bevor diese Consents vorliegen.
5. Nach gültiger Bestätigung wird `backupManager.export(opts)` genau einmal ausgeführt und vollständig in ein exklusiv angelegtes privates Temp-Artefakt gestreamt. Erst nach erfolgreichem Abschluss wird SHA-256 über genau diese Datei berechnet und ein kurzlebiger, zufälliger Prepare-/Downloadbeleg ausgegeben.
6. Die UI zeigt für das fertige Artefakt dessen Hash, exakte Dateigröße, Auswahl, Filter, bekannte Warnungen und Ablaufzeit; Download bestätigt dieses Artefakt. Counts/Statistiken müssen aus dem tatsächlich erzeugten Archiv bzw. Exportereignissen stammen, nicht aus einer später möglicherweise veralteten Live-Vorschau.
7. Der Download konsumiert das Artefakt atomar vor dem Streaming, verifiziert vor Freigabe mindestens Hash und Größe und streamt ausschließlich die gespeicherte Datei. Es wird kein zweiter Exportlauf gestartet. Replay wird abgewiesen.
8. Fehler, Abbruch, Hashabweichung, Auswahl-/Filteränderung, Ablauf und Shutdown bereinigen Datei und Verzeichnis. Zusätzlich begrenzte TTL-/Quota-Bereinigung für verwaiste Artefakte. Kein Pfad darf aus Clientdaten konstruiert werden.
9. Direkter Export ohne vorbereiteten Beleg wird geschlossen (empfohlene Antwort: 410/400 mit Migrationshinweis), nicht als paralleler Bypass belassen.
10. Private Temp-Artefakte benötigen restriktive Dateirechte und dürfen nicht in Plugin- oder Backupverzeichnissen liegen. Logausgaben enthalten keine Backupinhalte, Geheimnisse oder vollständigen privaten Pfade.

## Isolierte Regressionstestmatrix

Alle späteren automatisierten Prüfungen müssen synthetische Daten, Fake-Streams und ein eigens isoliertes Temp-Verzeichnis verwenden. Kein echtes ZIP, keine echte DB, keine HTTP-/Runtime-Integration in dieser E-only Phase.

- Auswahl oder Pluginfilter nach Vorbereitung ändern: alter Beleg kann nicht laden; `export()` wird nicht erneut aufgerufen.
- Synthetische Archivbytes während Vorbereitung erstellen; vorberechneter SHA-256 stimmt exakt mit den Downloadbytes überein.
- Artefakt nach Vorbereitung ersetzen/verändern: Hashabweichung blockiert jede Byteausgabe; Einmalbeleg wird ungültig und Tempdaten werden bereinigt.
- Token-Replay und Ablauf (mit injizierter monotonic clock, deterministisch an der TTL-Grenze).
- Fehler/Abbruch beim Erzeugen: kein Ready-Beleg, keine Teilarchive/Tempverzeichnisse.
- Abbruch im Download: Bereinigung wird auch bei Clientdisconnect ausgeführt.
- Vollständiges Backup benötigt Full- und Sensitive-Consent; jedes fehlende/falsche Feld blockiert Erzeugung.
- Opake Kategorien verlangen unbekannte-Inhalte-Consent schon vor dem Erstellen der Bytes.
- Direkter Exportendpoint ohne Preview-Artefakt wird abgewiesen; gültiger Download ruft den Exporter nicht erneut auf.
- `pluginFilter` verändert Vorschau und Archiv gleichermaßen; geänderte Filterinvalidierung.
- Profilscoped ohne Plugin-Daten wird UI-seitig korrigiert und serverseitig verworfen.
- TTL-/Quota-Janitor löscht nur eigene, abgelaufene Artefakte; Aufräumen ist idempotent.

## Nicht geprüft / bewusste Grenze

- Kein Codepatch, keine neuen Regressionstests, kein ZIP, keine reale HTTP-/DB-/Pluginlaufzeit.
- Keine Prüfung, ob Signaturbestätigung beim Backupimport bereits implementiert ist. Die Nutzervorgabe „alle unsignierten Backups bestätigen“ ist als separate Importanforderung zur Klärung vorgemerkt.
- Tempverzeichnis, TTL, Größen-/Anzahlquota und Statuscodes sind noch Produkt-/Betriebsentscheidungen.
- Die bestehende tatsächliche Archivbytestruktur und `archiver`-Fehler-/Abortsemantik wurden nicht integriert ausgeführt; vor Implementierung in isolierter Fixture festlegen.
- Keine Behauptung einer behobenen Sicherheitslücke: dies ist ein bestätigter Codebefund plus Umsetzungsplan.

## Geschützte vorhandene Arbeit

Vorhandene Änderungen wurden weder bearbeitet noch zurückgesetzt. Aktuelle Hashpins zur Erkennung unbeabsichtigter Veränderung:

| Datei | SHA-256 |
|---|---|
| `app/plugins/config-import/main.js` | `8C34D12C12DC9A76FDD429CA53F27BC29CC8FFC4457A2BAC1F79A26C94BEEED7` |
| `app/test/config-import-backup-confirmation.test.js` | `96C3DB1E2F4658A4DF3D843B02E39E09ED4738C571754DF96676869A18850285` |
| `app/modules/backup/importer.js` | `D162FA478F6D74073AD404B244066191F03D706E0392981F56028B2CA900983C` |
| `app/modules/backup-manager.js` | `1052101B9CBA5CA04AA2D2C6BFF315E779F59AD6D9A6208C1B216D6E4EF495D4` |
