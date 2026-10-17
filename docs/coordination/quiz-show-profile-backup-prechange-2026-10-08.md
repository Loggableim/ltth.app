# Quiz Show Profilbackup – Vorheraufnahme

Stand: 2026-10-08. Diese Bestandsaufnahme wurde vor Produkt-/Teständerungen angelegt. Der Shared Tree ist parallel stark verändert. Die Hashes sind der konkrete Checkoutstand vor der Umsetzung; sie gelten nicht automatisch für HEAD.

## Aktuelle Hashes

| Datei | SHA-256 vor Änderung | Vorhandener Zustand |
|---|---|---|
| `app/modules/backup/profile-scoped-data.js` | `E0FD8DF8F8AC77FEACF301F7EC4A4B71F2BDAB78CE53EBE6FFF27DCEF1DC883C` | sauber / getrackt |
| `app/modules/backup/selection.js` | `7D4C173B76BF58836A7EBB6C594D6ECB4A67F442149C8B6ACC8D1165A7778DA4` | untracked; fremde Preview-/Privacy-Arbeit vermutet; Hunk-Owner-Bestätigung angefragt |
| `app/modules/backup/exporter.js` | `7584638B879FF0383828E3781B8747A6DA5797062A7E01BB09E92D43FDDC3EDA` | dirty; große parallele Backup-/Privacy-Änderungen |
| `app/modules/backup/importer.js` | `C8B80A1D2AAE3F0D46B03214EE858ECDEA126B7BD3A09B584896D63DF0987DB4` | dirty; große parallele Import-/Rollback-Änderungen |
| `app/modules/backup/manifest.js` | `BE02438CDD3412782ABEF4DFDD6F9B1C4BA3EC3E7F12544A8C06F7957635BB39` | dirty; Manifest-/Checksum-Schemaarbeit |
| `app/plugins/config-import/main.js` | `E769A183B121690AC7DC17BB1236B03E431CE35BE88D82291C17FF59FDE44A9A` | dirty; aktuelle Preview-/Bestätigungsabläufe |
| `app/plugins/config-import/ui.html` | `A2C88DBD98889746E0D2CB9955805A8C82CB88B6E5FD8497DFCE3A0B3BACD774` | dirty; aktuelle Import-/Export-Sicherheitsabläufe |
| `app/plugins/config-import/locales/de.json` | `C597FD7D01A467D9FCC0A0A150BB780C8AEB697E479DE08153DCEC0DBDBA7173` | locale keys vorhanden |
| `app/plugins/config-import/locales/en.json` | `44798BBF2C3A583549D9B506B4C8B1F02CFFB79AEB0DAC81A210ABDFC21743CE` | locale keys vorhanden |
| `app/plugins/config-import/locales/es.json` | `3ED8FB2CB2FF8FE1B6793A537F4E7D1856C544EC49E7FCC3A951ED558D34D730` | locale keys vorhanden |
| `app/plugins/config-import/locales/fr.json` | `980CDEC713E4D995E409F6E0CF8985822FF3F2D2D31863B400896EECB425B507` | locale keys vorhanden |
| `app/plugins/quiz-show/main.js` | `B731BED5B184CE1BE09ADDDA605C6B1F378AFBC8501E561DB38A7B965488EBA8` | dirty; Quiz-DB bereits auf aktives Profil umgestellt |
| `app/test/profile-scoped-plugin-backup.test.js` | `D4CD1D6EE5C37098D323D1B94E8EAB0F0224E2EC0039111234546164F49DBB5E` | untracked; parallele Backup-Tests |
| `app/test/config-import-profile-backup-route.test.js` | `4114C3318FBBA2A48DDCEE30ADE012F52AD4B083B4AD2F04399B30E4C331197F` | untracked; aktueller Test erwartet noch den älteren Routenkontrakt |
| `app/plugins/quiz-show/test/profile-scope.test.js` | `0A3810DDA71BC0FB9191458C76596F8EF7FD07E8AE0EAE1BEFB53AC3FB0FD99A` | untracked; synthetischer Quiz-A→B→A-Pfadtest |

## Relevante Vorher-Blöcke

- `profile-scoped-data.js`: `PROFILE_SCOPED_PLUGIN_DATA` ist `['advanced-timer', 'schnorrbecher']`; `normalizeScopedPluginIds()` verwirft jede andere ID.
- `selection.js`: `collectProfileScopedStats()` iteriert explizit über Advanced Timer und Schnorrbecher. Die Datei ist untracked und enthält einen umfassenden neuen Auswahl-/Privacy-Vertrag; genau dieser Preview-Hunk wurde dem CEO als fremd wirkend gemeldet und vor Bearbeitung zur Freigabe vorgelegt.
- `exporter.js`: `readProfileScopedFile()` erstellt nur für `advanced-timer/timers.db` einen Online-Backup-Snapshot. Plugin-Discovery filtert IDs aus der Scoped-Liste heraus, scoped exportiert nur IDs aus der Liste; für Quiz würde aktuell der unscoped Speicherpfad gewählt.
- `manifest.js`: `createManifest()` enthält bereits `sourceProfile` und akzeptiert `profileScopedDataPlugins`; Validator erlaubt ausschließlich IDs aus der Scoped-Liste. Eine Schemaänderung wirkt daher nicht erforderlich, wenn die Registry erweitert wird.
- `importer.js`: Der Preview liest `sourceProfile` und die scoped ID-Liste aus dem Manifest. `performImport()` verlangt im scoped Flow `includeProfileScopedPluginData`, Merge-Modus, gültiges vorhandenes `targetProfile`, prüft Konflikte und schreibt nach dem profilbezogenen Pluginpfad. Unmarkierte Daten eines Scoped-Plugins werden derzeit standardmäßig übersprungen und gewarnt; ein gesonderter Quiz-Legacy-Opt-in existiert noch nicht.
- `config-import/main.js`: Exportoptionen leiten `profileScopedDataPlugins` direkt aus der zentralen Scoped-Liste ab. Importoptionen binden Preview-/Bestätigungstoken an ausgewählte Formfelder; neue Legacy-Auswahl muss in diesem Bindungsvertrag enthalten sein.
- `ui.html` und Locale-Dateien: Export-/Import-Beschreibung nennt aktuell nur Advanced Timer und Schnorrbecher. Import UI zeigt scoped Auswahl anhand `preview.profileScopedPluginData.plugins` und verwendet den explizit gewählten Zielprofilselektor.
- `quiz-show/main.js`: `initDatabase()` verwendet bereits `ensurePluginDataDir({ profileScoped: true })` und öffnet `quiz_show.db`; vorbestehende globale DB wird dort nicht automatisch übernommen.
- `profile-scoped-plugin-backup.test.js`: bestehende Export/Import-Fixtures führen nur Timer/Schnorrbecher in der Scoped-Auswahl.

## Hunk-Scope

Die Änderungen bleiben additiv auf die scoped Registry, ihren Nutzerfluss/Preview, Quiz-SQLite-Snapshot und gezielte synthetische Import-/Export-Tests beschränkt. Bestehende uncommitted Security-/Rollback-/Confirmation-Änderungen werden nicht ersetzt. Die neue `selection.js`-Previewliste bleibt bis zur Eigentümerbestätigung unberührt; bis dahin wird ein minimaler Patchvorschlag bereitgehalten.

