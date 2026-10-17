# Quiz Show: Profil-Scope und expliziter Legacy-Import

**Status:** Proposal statt Produktänderung. Der sichere Austausch einer offenen SQLite-Datei hat im vorhandenen Plugin-/Loader-Vertrag keinen bestätigten atomaren Importpfad. Keine Quiz-Show-Dateien, Profile oder Datenbanken geändert/geöffnet; kein Commit/Push.

## Git-/Ownership-Prüfung

- HEAD bei Prüfung: `d65a54891f6ba1d055e95fda70d0df696d5299f0`.
- `app/plugins/quiz-show/main.js` und dessen Tests sind im gemeinsamen Checkout sauber; es gab dort keine fremden Quiz-Show-Hunks zu erhalten. `app/modules/plugin-loader.js`, `app/modules/backup/*` und zahlreiche globale Profile-Fixtures sind hingegen parallel dirty/untracked. Keine Änderungen an diesen Pfaden vorgenommen.
- HEAD-Befund: `main.js:270-307` konstruiert selbst einen `ConfigPathManager`, ruft `getPluginDataDir('quiz_show')` ohne Profiloption auf und öffnet `quiz_show.db`. Die Funktion initialisiert Tabellen, legt ggf. Default-Saison an und entfernt alte Fragehistorie. Der Code nennt diese DB bei Zeile 306 ausdrücklich „not scoped“.

## Konkreter Scope-Zielvertrag

- Runtime-Datenbankpfad aus der PluginAPI ableiten: `api.getPluginDataDir({ profileScoped: true })/quiz_show.db`. Keinen neuen `ConfigPathManager` konstruieren: damit ginge der injizierte Config-Root des Servers bzw. des isolierten Tests verloren.
- Profilidentität aus `api.getActiveProfile()` lesen und beim Import exakt gegen das aktuell geladene Pluginprofil binden. Das Server-PluginLoader hält das Profil beim Erzeugen der PluginAPI fest; `/api/profiles/switch` setzt das nächste Profil und verlangt Server-Neustart. Profilwechsel heißt daher unload/reload unter neuem Loader/Profil, nicht mutierbare API zur Laufzeit.
- Quiz-DB enthält Fragen, Pakete, Saisons und Historie. `quiz_leaderboard_entries` wird laut `main.js:310,512-514` in der aktiven Profil-Hauptdatenbank angelegt. Ein Legacyimport der Plugin-DB überträgt diese Haupt-DB-Werte nicht automatisch; historische Saison-IDs und Scorezeilen benötigen getrennte Schema-/Produktentscheidung. Nicht still über beide Speicher hinweg zusammenführen.
- Die alte Quelle bis zur ausdrücklichen Importaktion nicht kopieren, verschieben, löschen oder verändern. Profilstarts sollen die globale Quelle nicht mehr automatisch übernehmen.

## Vorschlag für Importvertrag

1. **Quelleninventar:** nur bekannte alte Kandidaten erkennen und als getrennte Identitäten führen: kanonische gemeinsame Datei `ConfigPathManager.getPluginDataDir('quiz_show')/quiz_show.db` und das noch im HEAD vorhandene Paket-Altziel `app/plugins/quiz-show/data/quiz_show.db`. Eine Quelle automatisch nur dann vorschlagen, wenn genau eine valide Kandidatin existiert. Bei zwei Kandidaten, DB plus unklaren WAL/SHM-Seiten, ungültigem SQLite oder Schemaabweichung abbrechen und Nutzerwahl/Supportentscheidung verlangen. Niemals mehrere Dateien mergen.
2. **Explizites Ziel:** Import nur ins aktuell aktive Pluginprofil (`getActiveProfile()`), das per PluginLoader gebunden ist und dessen Profil-DB im Profilinventar existiert. Vorschau zeigt Quellalias, Profilname, Schema-Version und Konflikte. Importziel ist nicht ein beliebiges vom Request geliefertes Pfadstück.
3. **Snapshot/Bestätigung:** eine SQLite-konsistente Read-only-Online-Snapshotkopie erstellen; Quellhash über Snapshotbytes einschließlich wirksamer WAL-Inhalte bestimmen, nicht nur über `.db`-Datei. Kurzlebigen One-shot-Token binden an Hash, Quellidentität, Zielprofil, Zielpfadidentität/-hash, Schema/Importer-Version und feste Importoptionen. Bestätigungsdialog zeigt diese Zusammenfassung. Vor Commit Snapshot neu erstellen und vergleichen; Hash- oder Profiländerung macht den Token ungültig und erfordert neue Vorschau.
4. **Zielbackup und Konfliktpolitik:** vor Änderungen eine konsistente Ziel-SQLite-Online-Backupkopie an dauerhaftem Recovery-Ort anlegen, reopen/read-only prüfen und Hash protokollieren. Fehler blockiert Import. In v1 vorhandene nichtleere Zieldatenbank als Konflikt behandeln; kein Overwrite und kein automatisches Merge. Wenn initialisierte Default-Ziel-DB als ersetzbar gelten soll, braucht es exakten Schema-/Inhaltspolicy-Nachweis und eigene Produktfreigabe.
5. **Atomarer Commit:** Import-Snapshot zunächst vollständig validieren (SQLite integrity, unterstützte Tabellen/Version, Fremdschlüssel, erforderliche Indizes). Ziel ist derzeit durch `this.db` geöffnet. Daher vor Dateiersatz müssen alle Plugin-Timer/Listener sauber gestoppt, DB geschlossen, WAL/SHM berücksichtigt und Loader-Routen/Instanz-Lifecycle koordiniert sein. Erst dann kann ein journalisierter Same-volume Verzeichnis-/Dateitausch erfolgen. Nach Replace Ziel neu öffnen, Schema/Integrität/Hashes verifizieren und Plugin neu laden. Fehler muss entweder bestätigten alten Zielhash wiederherstellen oder Recovery-Artefakte erhalten und `incomplete` melden. Legacyquelle bleibt unverändert.
6. **Crash/Retry:** dauerhaften Journalbeleg mit `operationId`, Quell-/Zielhash, Zielprofil, Backup-Hash und Zuständen `previewed`, `backup_verified`, `unloaded`, `committing`, `committed`, `verified` führen. Dieselbe abgeschlossene Operation ist idempotenter Erfolg; gleicher Key mit anderen Bindungswerten ist Konflikt. Beim Start/Retry darf kein teilweise ersetztes DB-Paar als Erfolg gelten; nur eindeutig verifizierter Resume oder Rollback ist erlaubt. WAL/SHM und SQLite-Datei müssen gemeinsam bzw. über sauber geschlossene Handles behandelt werden.

## Architekturgrenze und konkrete Call-Sites

Vorhandene Bausteine helfen, lösen die kritische Transition aber nicht end-to-end:

- `PluginAPI.getPluginDataDir({ profileScoped: true })`, `getActiveProfile()` und `getConfigPathManager()` existieren in `app/modules/plugin-loader.js` (ca. Zeilen 921, 941-952). Profilpfade werden von `ConfigPathManager.getPluginDataDir(pluginId, { profileId })` in `app/modules/config-path-manager.js` berechnet; das Profilinventar/Datei ist bei `UserProfileManager.listProfiles()` / `getProfilePath()` in `app/modules/user-profiles.js` verfügbar. Loader übergibt beim Load `this.activeProfile` in den PluginAPI-Konstruktor.
- `QuizShowPlugin.initDatabase()` und neue Import-/Preview-Routen gehören in `app/plugins/quiz-show/main.js`; aktuelles `destroy()` (ca. Zeilen 5797-5840) schließt `this.db`, räumt mehrere Timer auf und ruft danach `saveConfig()`.
- `PluginLoader.unloadPlugin()` / `_unloadPluginOnce()` und `reloadPlugin()` in `app/modules/plugin-loader.js` koordinieren Destroy, Route-Entregistrierung und neue Instanz. Es gibt keinen dedizierten Loader-API-Vertrag, der während eines laufenden Importrequests ein Plugin pausiert, dessen DB atomar tauscht, Backup/Journal verifiziert und bei Rollback die alte Instanz zuverlässig wiederherstellt. Das Modul ist außerdem stark parallel dirty.
- Backup-Exporter hat im HEAD SQLite-Online-Snapshotcode (`app/modules/backup/exporter.js`, `sourceDb.backup(snapshotPath)`); das ist ein guter Snapshot-Baustein. Der allgemeine Importer und aktuelle Datei-Transaktionstests sind dirty/untracked und können hier nicht als freigegebener Plugin-Lifecycle-Transaktionsvertrag vorausgesetzt werden.

**Entscheidung:** keine halbe Implementierung in `main.js`. Zuerst separaten PluginLoader-DB-Replacement-Vertrag entwerfen/abnehmen oder Import als Offline-/Restart-Operation außerhalb des laufenden Plugin-Handlers festlegen. Danach kann die Implementierung mit Fault-Injection sicher abgeschlossen werden.

## Synthetische Regressionen nach Vertrag

Alle Fixture-Roots und Profile A/B ausschließlich unter `os.tmpdir()`, kein Serverport und keine vorhandenen DBs:

| Fall | Erwartung |
|---|---|
| A startet, Marker A in Saison/History; B startet, Marker B | verschiedene scoped Dateipfade und DB-Inhalte; keine Markerüberschneidung. |
| B unload/reload, danach A unload/reload | B behält nur B, A behält nur A; `destroy()` schließt genau die zugehörige DB. |
| Kein aktives Profil oder unbekannte Profil-ID | scoped Pfad/Import fail closed; kein Rückfall auf globale Ablage. |
| Genau eine synthetische Legacy-DB, leeres Zielprofil | Preview nennt Source-/Snapshot-Hash und Zielprofil; ohne Bestätigung bleibt Ziel/Quelle bytegleich. |
| Globale Datei und Paket-Altdatei beide vorhanden | Mehrdeutigkeit; keine Quelle vorausgewählt und kein Ziel geschrieben. |
| Quelle ändert sich (DB oder WAL) nach Preview | Token abgelehnt, frische Preview nötig; Quelle und Ziel unverändert. |
| falsche/unsupported Schema-Version, korrupte SQLite, fremde Tabellen/Version | Import abgelehnt vor Zieländerung; globale Quelle unverändert. |
| Ziel hat bereits Userdaten | Konflikt; kein Overwrite/Merge. Verifiziertes Zielbackup bleibt erhalten. |
| Backup schlägt fehl oder Backup kann nicht wieder geöffnet/hashgeprüft werden | Kein Unload/Commit. |
| Crash nach Backup, nach Unload, zwischen Rename-Schritten, nach Commit vor Verify | Journal-Recovery setzt sicher fort oder stellt altes Ziel wieder her; nie Erfolg bei unklarem Zustand. |
| Gleiches `operationId` nach verifiziertem Erfolg | idempotenter Erfolg ohne weitere Bytes zu ändern. |
| Gleiche ID mit anderem Hash/Profil/Optionen | Konflikt und keine Mutation. |
| Nach Erfolg | Zielprofil enthält genau importierte unterstützte Plugin-DB; andere Profile bytegleich; globale Legacydatei und ggf. Sidecars bytegleich erhalten. |

## Offene Entscheidungen

1. Sind `quiz_show/data/quiz_show.db` (Paket-Altdatei) und die gemeinsame Config-Path-Datei beide echte Legacyquellen, die auswählbar sein sollen? Bis zur Antwort: bei beiden vorhanden abbrechen.
2. Werden nur Plugin-eigene Fragen/Pakete/Saison/Verlauf importiert oder auch Profil-Hauptdatenbank-`quiz_leaderboard_entries`? Letzteres liegt nicht in `quiz_show.db` und hat ggf. Saison-FK-IDs; es darf nicht implizit ergänzt werden.
3. Gilt eine vom Pluginstart frisch initialisierte, aber nichtleere Ziel-DB als Konflikt (empfohlen für v1), oder soll ein exakt leeres Default-Schema kontrolliert ersetzt werden?
4. Wer owns den neuen PluginLoader-DB-Replace-/Recovery-Vertrag und wo liegen dauerhafte Recovery-Backups/Journale?
