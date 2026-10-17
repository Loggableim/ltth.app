# E-only Implementierungskandidat: immutable Backup-Snapshots

**Status:** synthetischer Architektur-/Codekandidat mit fokussierten Jest-Regressionen. Nicht in `app/` integriert; keine Shared-Datei geändert, kein Commit.  
**Arbeitsumfang:** ausschließlich vorbereitete Export-/Import-Snapshots mit synthetischen Bytes. Kein echter ZIP-Export, keine echte DB/HTTP-/Runtime-Integration, keine Produktionsänderung.

## Vorgabe und bestätigter Quellbefund

Die Nutzerentscheidung lautet: **alle unsignierten Backups erfordern explizite Bestätigung**. Nicht verifizierbare Legacy-Metadaten gelten als unbekannt; es gibt in diesem Kandidaten keinen benignen Confirm-Bypass. Für den Export verlangen opake ausgewählte Kategorien zusätzlich unbekannt-Inhalt-Consent; bekannte Credential-/Sessionauswahl verlangt Sensitive-Consent; vollständige Auswahl verlangt Full-Backup-Consent. Späte finale Warnungen benötigen einen eigenen Consent. Jeder erforderliche Consent wird bei der finalen Einmalbestätigung erneut gegen Hash, Auswahl, Pluginfilter und Profilbindung geprüft.

Aktuelle Implementierung wurde am bestehenden, parallel geänderten Checkout gelesen:

- `POST /api/config-backup/preview-export`: kanonisiert Kategorieauswahl und `pluginFilter`, aber `previewExport` erhält den Filter nicht. Vorschau speichert keine Archivbytes.
- `POST /api/config-backup/export`: erzeugt direkt und kann Preview umgehen.
- `POST /api/config-backup/export-token`: bindet Options an ein Previewtoken, aber nicht an finalen Archivhash.
- `GET /api/config-backup/download`: verbraucht Token, ruft anschließend `backupManager.export()` erneut mit aktuellen Quelldaten auf.
- `app/plugins/config-import/ui.html`: Popup, Parent-Popup, Blob-Fallback und manueller Link verwenden dieselbe Download-URL. Nach erfolgreichem erstem Claim ist dieselbe URL verbraucht; ein zweiter Aufruf muss sauber fehlschlagen und darf keinen zweiten Export erzeugen.
- Kein weiterer Alias für Konfig-Backup-Export wurde im Quellbaum gefunden. `PluginAPI.getBackupManager()` ist eine interne, privilegierte Schnittstelle; nur vertrauenswürdige Backend-Handler dürfen sie aufrufen, und sie muss hinter denselben Preview-/Consent-Gates bleiben.
- Separate lokale DB-Kopie: `POST /api/profiles/:username/backup` in `app/server.js` liegt hinter API-Limiter und AdminAuth (Remotezugriff erfordert konfiguriertes Token; nicht weitergeleiteter Loopback-Bypass ist akzeptiert), validiert den Namen und ruft `profileManager.backupProfile(username)` auf. Sie kopiert `profile.db` roh in den User-Config-Ordner als `<username>_backup_<timestamp>.db`, hat keine Preview/Consent/Retention/Quota, kann WAL-/Concurrent-Write-Probleme haben, kann bei gleicher Timestamp überschreiben und gibt den lokalen Pfad zurück. Diese Route ist **außerhalb** des Konfig-ZIP-Kandidaten und bleibt eine separate Scope-Entscheidung; sie wurde nicht verändert. `app/server.js` ist im Arbeitsbaum parallel geändert und blieb ebenfalls unangetastet. Es wird nicht behauptet, dass dieser Snapshotflow alle Backuparten schützt.

## Kandidatenvertrag

`SnapshotCoordinator` und `FileSnapshotStore` sind eigenständige Testkandidaten. Generatoren im Kandidaten dürfen ausschließlich synthetische Inhalte erzeugen. Für Import muss der Adapter finalen Provenienz-/Sensitivitätsstatus aus genau den gehashten Archivbytes liefern; ein früher Manifest-/Metadatenbefund darf diese Klassifizierung nicht allein festlegen.

1. Optionen werden kanonisiert. Das Token bindet Operation (Export/Import), alle Kategorien, `pluginFilter`, aktive/source/target Profil-IDs und explizite Plugin-IDs. Profil-DB-/Profilscoped-Auswahl ohne aufgelöste Profil-ID wird abgelehnt, statt ein Ziel zu erraten. `profileScopedPluginData → pluginFiles`; Schnorrbecher-Persistent-State → Profile-scoped.
2. Alle vorab erkennbaren Sensitivitäts-/Unknown-/Unsigned-/Full-Consents werden vor dem Generator verlangt. Erzeugung liefert abschließend Bytes plus finale Warnungen und muss `finalized: true` melden, wenn Warnungen dabei sind. Fehler oder frühes Ende liefert keinen Ready-Beleg. Finale Warnungen müssen vor Claim bestätigt werden.
3. Bytes werden begrenzt gesammelt, bevor sie als private Datei mit exklusivem Schreibmodus abgelegt werden. SHA-256 wird nach dem Schreiben zurückgelesen und geprüft. Preview zeigt denselben Hash und dieselbe Größe, die die finale Bestätigung bindet.
4. Zustände sind `preparing` (Quotareservierung), `ready`, `confirmed`, `claimed`, `disposed`. Confirm/Claim wechseln synchron, bevor weitere asynchrone I/O-Operationen beginnen; ein zweiter Claim oder Confirm-Replay wird abgewiesen. Claim liest die Datei genau einmal in einen unveränderlichen Buffer, prüft Hash und Größe und liefert genau diesen geprüften Buffer weiter, ohne Datei erneut zu öffnen. Ein Swap nach dem Read kann die bereits verifizierten Bytes nicht verändern.
5. Cancel/Expire dürfen nur noch nicht geclaimte Artefakte entfernen. Abbruchsignal/Timeout muss vom Generator anerkannt werden; der Slot bleibt reserviert, bis der Generator sein Ende/Cleanup bestätigt. Der Download/Importverbrauch entfernt das Artefakt in `finally`. Negative oder ungültige monotone Uhrdifferenz gilt als abgelaufen.
6. Konservative Defaults: 60 Sekunden TTL, höchstens 3 aktive oder vorbereitende Snapshots, 256 MiB Gesamtbytes je privatem Root, maximal 60 Sekunden Vorbereitung. Snapshots überleben einen Prozessneustart nicht. Vor Annahme neuer Requests muss der Aufrufer `cleanupOwnedArtifacts()` auf dem dedizierten privaten Root ausführen; beim Start darf nur dieser Root bereinigt werden; Kandidat-Bereinigung akzeptiert nur direkte 48-hex Unterordner mit eigener Ownership-Markierung und folgt keinen Symlinks/Reparse Points. Der produktive Root muss pro Prozess privat konfiguriert sein. Windows-Reparse-/ACL-/Restartverhalten bleibt ein Integrationsgate.
7. Direkter `/export`- und Import-Aufruf ohne vorbereitetes Token wird abgelehnt (Integrationsempfehlung: HTTP 410/400 mit Hinweis). Der Browser kann Popup, Parent, Blob und manuellen Link auf dieselbe einmalige Download-URL versuchen; nur ein Versuch kann gewinnen. Fehlerdarstellung/Retry muss neu Preview+Consent erzeugen, niemals still denselben ZIP erneut erstellen.
8. Import nutzt ebenso Preview, finalen Hash, Importoptionen und aufgelöste Source-/Target-/Active-Profil-IDs. Ohne explizit geprüfte vertrauenswürdige Provenienz verlangt jedes Importarchiv Unknown-Consent; unsignierte Archive verlangen zusätzlich immer explizite Bestätigung, entsprechend der direkten Nutzerentscheidung. Risiko wird aus denselben final gehashten Archivbytes abgeleitet und mit finalen Generatorwarnungen ergänzt. Das Zielprofil wird nie aus Namen/Position geraten.

## Isolierte Testabdeckung

`snapshot-coordinator.test.js` deckt 23 synthetische Fälle ab:

- gleicher finaler Bytehash und identische Downloadbytes; keine Regeneration nach Preview;
- Kategorie-/Filter-/Profiländerung und Hashabweichung verhindern Claim;
- Zustandswechsel und Token Replay, inklusive wiederholtem Abruf derselben UI-Fallback-URL;
- TTL, negative Uhrdifferenz, Abbruch, Generatorfehler, Timeout mit Cleanup-Anerkennung;
- Full, sensitive, unbekannte Inhalte, unsignierte Legacy-Importe und späte Warnungen erfordern separate Bestätigung;
- synthetischer Direct-Export/Direct-Import ohne oder mit falschem Beleg ruft den Generator nicht auf;
- Pluginfilter, Profilabhängigkeiten, Zielprofil und Plugin-IDs bleiben an Preview gebunden;
- Hash-TOCTOU-Swap vor Read schlägt fehl; Swap nach verifiziertem Read liefert genau den Buffer, dessen Hash geprüft wurde;
- unvollständiger Finalize-Status/Streamfehler liefert keinen Ready-Snapshot;
- aktive Anzahl, parallele Preparing-Slots, nebenläufige Bytebudgets, Abbruchtimeout und nur markierte Owned-Root-Bereinigung; `close()` verweigert Shutdown solange Generatoren nicht abgeschlossen sind.

Die Route-Inventur umfasst alle im Plugin registrierten Konfig-Backup-Routen: UI, Legacy-config-import discover/validate/import sowie Backup preview-export/capabilities/export/export-token/download/validate/preview-import/import. Die Legacy-Pfadimporte `/api/config-import/import` bearbeiten kein ZIP, umgehen derzeit aber denselben Snapshot-/Import-Token-Vertrag; sie müssen als separate Importmigration geprüft werden, falls dieser Auftrag auf Legacy-Konfigdaten erweitert wird. Der Kandidat simuliert diese Verträge; er instanziiert keine Express-Routen. Die lokale `/api/profiles/:username/backup`-Kopie wird nicht umgeleitet oder getestet, weil sie außerhalb dieses Auftrags liegt.

## Tests und Reproduzierbarkeit

Erfolgreicher fokussierter Lauf: **21/21 Tests bestanden** (Jest 29; Node 24.16; synthetische Daten, privates isoliertes Testverzeichnis). Der erste breite Repository-Aufruf wurde abgebrochen, weil Jest die gesamte Checkout-/Archivkopie nach kollidierenden Haste-Paketen scannte. Die gezielte Config beschränkt den Scan auf den Kandidaten. Ein Sandbox-spezifischer Preload fängt ausschließlich `realpathSync`-`EPERM` bei Jest-Cache-Initialisierung ab.

Vom Repository-Root (PowerShell):

```powershell
$base = (Get-Location).Path
$candidate = Join-Path $base 'docs/coordination/profile-data-eonly/implementation-candidate'
$env:TEMP = Join-Path $candidate 'test-tmp'
$env:TMP = $env:TEMP
node -r (Join-Path $candidate 'jest-sandbox-preload.cjs') `
  (Join-Path $base 'app/node_modules/jest/bin/jest.js') `
  --config (Join-Path $candidate 'jest.config.json') --runInBand `
  --cacheDirectory (Join-Path $candidate '.jest-cache')
```

### SHA-256-Pins

Baselinepins der relevanten bereits geänderten Shared-Dateien waren vor dem Kandidaten aufgenommen und stimmen nachher unverändert überein:

| Bestehende Datei (nicht editiert) | SHA-256 |
|---|---|
| `app/plugins/config-import/main.js` | `8C34D12C12DC9A76FDD429CA53F27BC29CC8FFC4457A2BAC1F79A26C94BEEED7` |
| `app/test/config-import-backup-confirmation.test.js` | `96C3DB1E2F4658A4DF3D843B02E39E09ED4738C571754DF96676869A18850285` |
| `app/modules/backup/importer.js` | `D162FA478F6D74073AD404B244066191F03D706E0392981F56028B2CA900983C` |
| `app/modules/backup-manager.js` | `1052101B9CBA5CA04AA2D2C6BFF315E779F59AD6D9A6208C1B216D6E4EF495D4` |

Kandidatenpins (Änderungen bleiben auf diese E-only Dateien begrenzt):

| Datei | SHA-256 |
|---|---|
| `snapshot-coordinator.js` | `496A210E0BDEF169832D67FF985742B3D472FEA7714D1E336C1FD0AFA093D84E` |
| `snapshot-coordinator.test.js` | `A0AF08122CA3A80FB8F97EA261F70A67EF895F1DD6804FC257CD03814A58CD6C` |
| `jest.config.json` | `036F48C120E31EC2D32D0FA9C6B816036FBB514770562D1DDC78C2609D4DB2D7` |
| `jest-sandbox-preload.cjs` | `BD83CF32FD0247F6AD31AFAEB9FEE5E7BB661623C8088AB1CE4AFEA91AFE2DBD` |

## Noch blockiert / nicht bewiesen

- E-only Kandidat ist nicht in Shared-Laufzeitcode eingebunden; keine reale Route akzeptiert oder ablehnt Tokens aufgrund dieser Klasse.
- Es wurde kein echtes ZIP erzeugt. Daher sind Archiver-Ende, late warnings, ZIP-Hash, `close`/`finalize`-Fehler, frühes Close und Bytes-zu-Manifest-/Count-Konsistenz nicht gegen die konkrete Archiver-Implementierung bewiesen.
- Kein reales Streamen über HTTP oder Browserdownload; HTTP Disconnect, Popup-Fehler und Windows-ACL-/Junction-/Reparse-Point-Verhalten brauchen eine separate Integrationstestfreigabe.
- Echter Exporter muss Profile IDs, `pluginFilter` und Pluginauswahl in seiner gesamten Snapshot-Erzeugung exakt konsumieren. Ein synthetischer Optionsvergleich beweist das nicht.
- Kein Prozessneustartstest und kein echtes OS-Diskquota; Appstart muss Ownership-Root sicher initialisieren/bereinigen und Ressourcen global begrenzen.
- Der separate rohe Profil-DB-Backup-Endpunkt benötigt eine Produktentscheidung und eigenen Audit/Plan. Diesem Kandidaten keine Deckung zurechnen.

## Nächste sichere Integrationsgates

Vor einem Patch in `app/`: Orchestrator bestätigt API-Routen, `getBackupManager`-Privileggrenze, Ziel-Profil-ID-Auflösung und Behandlung der lokalen Profil-DB-Backuproute. Danach separat fake-stream/real-archive Test mit exakt aktuellem Exporter-/Archiver-Verhalten, bevor irgendeine Runtimeintegration freigegeben wird. Shared bleibt bis dahin unberührt.




