# Release- und Bundle-Triage

Stand: 2026-10-06

## Befund

- Die Vollbaseline vom 2026-10-06 meldet `webgpu-fireworks-3d-release` und `webgpu-fireworks-release-alignment` wegen Erwartungen an LTTH 1.4.1. Kanonisches Checkout-/Runtimeziel ist 1.4.3: `version.json`, Root- und App-`package.json`, `app/package-lock.json`, Root-`CHANGELOG.md` und der aktuelle Eintrag in `version.json.changelog` stimmen überein. `app/CHANGELOG.md` endet dagegen bei 1.4.2 und ist eine getrennte, nicht automatisch angeglichene Kopie.
- Die Pluginversion WebGPU Fireworks 3.1.1 und ihre aktiven Asset-Cachekeys sind unabhängig von der LTTH-Hostversion. Der Changelog ordnet sie den früheren LTTH-Versionen 1.3.37/1.4.0 zu. Die alte Testannahme, WebGPU Fireworks 3.1.1 sei Bestandteil des Releases LTTH 1.4.1, war falsch.
- Veröffentlichungs-/Websiteprojektionen zeigen 1.4.2: `app/CURRENT_VERSION.txt`, `app/CURRENT_RELEASE.json`, statische Header-/Footer- und Downloadlabel sowie zugehörige vier Localewerte; `app/CHANGELOG.md` hat als neueste datierte Hostsektion ebenfalls 1.4.2. Root-`CHANGELOG.md` führt dagegen 1.4.3. Das ist eine gemischte Quellprojektion, aber allein kein Beweis, dass 1.4.3 bereits öffentlich ausgeliefert wurde. Der Zuständigkeitsunterschied ist im Quellcode sichtbar: `scripts/release_from_new_patch.py` schreibt die `CURRENT_*`-Dateien als Teil des vollständigen Patch-Deployablaufs; `.github/workflows/release.yml` validiert bei `validate_release` Tag, `version.json` und Package-Manifeste über `build_release_bundle.py --validate-release-metadata`, danach erstellt ein separater Job Releaseartefakte. Der GitHub-Workflow schreibt keine `CURRENT_*`-Dateien oder Websiteoberflächen. Keine Version oder Deploy-Projektion wurde geändert.
- `release-bundle-script.test.js` enthält isolierte Fixtureverträge für LTTH 1.3.24 und den historischen Stream-Monsters-Storevertrag bei LTTH 1.4.1. `release-bundle-v142.test.js` prüft ausdrücklich den historischen LTTH-1.4.2-Vertrag. Diese Versionen sind keine Assertions der aktuellen Produktversion und wurden nicht angepasst.
- `pages-release-bundle.test.js` prüft mit einem synthetischen 1.3.24-Fixture nur das Kopieren der Releaseartefakte. Die Bundletests melden im eingeschränkten Jest-Prozessumfeld fehlendes Python, obwohl Python 3.14.0 auf dem Host vorhanden ist; Jest kann die Python-Subprozesse in dieser Sandbox nicht erfolgreich starten.

## Umsetzung

- Die 3D-Releaseprüfung leitet die LTTH-Version nun aus `version.json` ab und prüft dagegen die Root-/App-Pakete, den Lockfile-Root und `downloadVersion`. Die unabhängige Pluginversion 3.1.1 bleibt explizit.
- Die Release-Suite prüft kanonische Package-/`version.json`-Ausrichtung dynamisch und hält historische 1.4.1/1.4.0-Changelogdetails getrennt davon fest. Der aktive Website-/Deploy-Abgleich ist als `test.todo` mit Driftbegründung markiert, bis die Zuständigkeit und der Sollzustand geklärt sind; es wird kein grüner Alignmentstatus für die 1.4.2-Oberflächen ausgegeben.
- `scripts/build_release_bundle.py --validate-release-metadata` lief direkt mit Python 3.14.0 und bestätigte: `Release metadata valid for LTTH 1.4.3.` Der Modus beendet sich vor jedem Archivbau.

## Geänderte Dateien

- `app/test/webgpu-fireworks-3d-release.test.js`
- `app/test/webgpu-fireworks-release-alignment.test.js`
- `docs/coordination/release-version-triage.md`

## Tests und Status

### Behoben und geprüft

- `webgpu-fireworks-3d-release.test.js` und `webgpu-fireworks-release-alignment.test.js`: 2 Suites, 12 Tests bestanden, 1 offenes `test.todo` für die belegte Versionsdrift.
- `scripts/build_release_bundle.py --validate-release-metadata`: bestanden für 1.4.3; kein Archiv erzeugt.
- Aktuelle kanonische Metadatenwerte wurden direkt aus den Quellen bestätigt.

### Teilweise geprüft

- Release-/Pages-Bundle-Jesttests: erneut versucht; sie brechen in `findPythonCommand()` ab, weil der Jest-Subprozess in dieser Umgebung Python nicht starten kann. Obwohl Python 3.14.0 direkt aufrufbar ist, stellt dies keinen erfolgreichen Nachweis für die kopier-/archiverzeugenden Testfälle dar.
- Website-/Deploy-Metadaten wurden als Quellstand gelesen; die Suite meldet deren Abgleich zur kanonischen 1.4.3 als offen. Das ist kein Nachweis, dass deployte Websiteartefakte identisch sind.
- CEO lieferte anschließend öffentliche HTTPS-Read-Daten für GitHub Releases und `CURRENT_RELEASE.json`; sie verifizieren getrennte Veröffentlichungskanäle, nicht die vollständige Pages-Site oder Assets eines 1.4.3-Releases. Details und Grenzen stehen im öffentlichen Inventar unten.

### Blockiert / offene Entscheidung

- Es ist offen, ob `app/CURRENT_VERSION.txt`, `CURRENT_RELEASE.json`, Websiteheader/-footer, Downloadseite, Locale-Hinweise und Root-Changelog bei LTTH 1.4.3 aktualisiert werden sollen. Das wäre eine echte Release-/Websiteänderung und lag außerhalb dieser Triage; eine Version oder Veröffentlichung wurde nicht geändert.
- Das alte Release-Skript `scripts/release_from_new_patch.py` aktualisiert die `CURRENT_*`-Dateien. Die aktuelle GitHub-Releaseworkflow-Prüfung tut dies nicht. Die Orchestrierung sollte entscheiden, welcher Releasepfad diese Projektionen besitzt und ob Workflow/Tests diese getrennte Zuständigkeit langfristig abbilden sollen.

### Nicht geprüft

- Keine Releasearchive, Installer, Pages-Bundles oder Produktbuilds erstellt.
- Kein vollständiger Pages-Site-/Deployabgleich und kein 1.4.3-Releaseasset geprüft oder heruntergeladen. Öffentliche Metadatenreads des CEO sind separat unten dokumentiert.
- Kein vollständiger Jest-Lauf erneut ausgeführt.
- Keine Produktversions-/Websiteprojektionen geändert.

## Read-only Versionsinventar

Stand: 2026-10-06. Das Inventar trennt den Checkout-/Runtimezielstand, die getrennt gepflegte Veröffentlichungshistorie und statische Websitekopien. Es belegt nur den Quellstand; ob 1.4.3 auf GitHub oder Pages tatsächlich veröffentlicht ist, wurde nicht live geprüft.

### Kanonisches Code- und Runtimeziel: 1.4.3

| Datei | Quellwert / Rolle | Erzeuger, Verbraucher und Update-/Validierungsweg |
|---|---|---|
| `version.json` | `version=1.4.3`, `downloadVersion=1.4.3`, `releaseDate=2026-09-28`; Release-/Installerzielmetadaten. | Quelle wird manuell im Release-Quellstand gepflegt. `install/install.js`, `.ps1` und `.sh` lesen `version.json` aus dem ausgewählten Branch. `.github/workflows/release.yml` verlangt einen Tag `vX.Y.Z` auf dem aktuellen `main` und validiert diesen Wert. |
| `package.json` | `1.4.3`; Rootwrapper, nicht die maßgebliche Node-Laufzeit. | Wird durch `scripts/build_release_bundle.py::validate_release_metadata()` gegen `version.json` geprüft; kein eigener automatischer Versionssync gefunden. |
| `app/package.json` | `1.4.3`; App-Paket und Runtimeversion. | `app/modules/update-manager.js::getCurrentVersion()` liest dieses Feld; `app/server.js` übergibt es dem BackupManager als `appVersion`. Es wird außerdem vom Release-Metadatenvalidator geprüft. |
| `app/package-lock.json` | Root-Paketversion und `packages[""]` stehen auf `1.4.3`. | npm-Lockdatei; der Release-Metadatenvalidator prüft beide Versionsfelder. Kein separates Syncskript identifiziert. |
| `CHANGELOG.md` (Root) | Neuester veröffentlichter Hostabschnitt `[1.4.3] - 2026-09-28`. | `app/server.js` bedient genau diese Rootdatei über `GET /CHANGELOG.md`; außerdem wird sie in Releasebundle und Pagesbundle aufgenommen. Manuell gepflegte Releasehistorie. |

Read-only Validierung dieses Codeziels: `python scripts/build_release_bundle.py --version 1.4.3 --validate-release-metadata`. Der Modus prüft Metadaten und beendet sich vor einem Archivbau. Der GitHub-Workflow ruft den Validator nach Tag-/Main-SHA-Prüfung auf; die nachfolgenden Workflowjobs bauen bzw. veröffentlichen Assets und sind keine Quell-Syncschritte.

### Getrennte mutable Veröffentlichungshistorie: 1.4.2

| Datei | Quellwert | Erzeuger / Verbraucher und Vertrag |
|---|---|---|
| `app/CURRENT_VERSION.txt` | `1.4.2`. | `scripts/release_from_new_patch.py::get_current_version()` liest es als aktuell ausgelieferte Patchversion; `update_metadata()` schreibt es nach dem Deploy. `scripts/build_pages_bundle.py` kopiert es in das Pages-Staging. Der Wert ist getrennt vom `app/package.json`-Runtimewert. |
| `app/CURRENT_RELEASE.json` | `version=1.4.2`, `updated_at=2026-08-01T00:00:00Z`, Notizen zum 1.4.2-Release. | `scripts/release_from_new_patch.py::update_metadata()` erzeugt es aus dem Changelog der ausgewählten `new_patch/ltth_X.Y.Z/`. `downloads/index.html` lädt `/app/CURRENT_RELEASE.json` und setzt damit aktuelle Versionsnummer, Datum und Release-Notizen. Pages-Staging kopiert die Datei. `scripts/build_release_bundle.py` schließt beide `CURRENT_*`-Dateien ausdrücklich aus dem unveränderlichen Codebundle aus. |

Der dokumentierte Vollablauf lautet `python scripts/release_from_new_patch.py`. Er ist **kein Metadaten-only-Befehl**: Er scannt und validiert `new_patch/`, kann das bisherige `app/ltth_latest.zip` archivieren, kopiert ein neues ZIP in den Livepfad, aktualisiert `CURRENT_*` und verschiebt das Patchverzeichnis nach `released_patches/`. Er wurde hier nicht ausgeführt. Die `CURRENT_*`-Werte dürfen deshalb nicht pauschal auf den Runtime-/Checkoutwert gesetzt werden: Ihr Quellvertrag ist „zuletzt über diesen Veröffentlichungsweg bereitgestelltes Paket/Notiz“, während `app/package.json` die Version dieses App-Checkouts meldet. Die reale Liveveröffentlichung wurde nicht verifiziert.

### Statische Websitekopien: 1.4.2

| Dateien | Statischer Wert und Verbraucher | Erzeuger / Updateweg |
|---|---|---|
| `_partials/header.html`, `_partials/footer.html` | Header-Fallback (`betaVersion`) und Footerbadge zeigen `1.4.2`. Header-/Footerteile werden durch `js/layout.js` eingebunden und durch `js/i18n.js` lokalisiert. | Kein Versionsgenerator gefunden; manuell gepflegte Websitequellen. `python scripts/build_pages_bundle.py --output <neues-staging-verzeichnis>` kopiert sie nur in ein Pages-Staging und bereinigt bei vorhandenem Ziel dessen gesamten Inhalt. Der Builder gleicht Versionswerte nicht ab und publiziert nicht. |
| `locales/de.json`, `locales/en.json`, `locales/es.json`, `locales/fr.json` | `beta.notice.compact` enthält je Sprache `1.4.2`; `website.downloads.index.text.005` übersetzt den Launcher-Titel als `Version 1.4.2`. Diese Schlüssel werden vom Website-i18n geladen. | Die beiden Websitewerte sind nicht Teil der Plugin-Guide-Generierung; kein automatischer Versionssync gefunden. Manuelle Quellenpflege, Pages-Staging wie oben. |
| `downloads/index.html` | Versionslabel und Fallback `currentVersion` sind fest auf `1.4.2` gesetzt. Bei Erfolg überschreibt das Inline-Script `#currentVersion`, Datum und Release-Notizen aus `CURRENT_RELEASE.json`; der übersetzte Labeltext `website.downloads.index.text.005` bleibt statisch. | Kein Versionsgenerator. Der Pages-Builder kopiert die HTML-Datei unverändert. Der aktuelle Quellwert passt zum `CURRENT_RELEASE.json`-Quellwert 1.4.2; kein Nachweis über den live ausgelieferten Stand. |
| `download.html` | Generische Installationsseite; enthält keinen numerischen Hostversionswert. | Nicht als 1.4.2-Projektion zu behandeln. Sie wird vom Pages-Builder mitkopiert; Installerinformationen kommen aus den statischen Texten und Installerskripten. |

### Weitere 1.4.2-/1.4.1-Texte mit eigenem Vertrag

- `app/CHANGELOG.md` hat als neueste datierte Hostsektion 1.4.2. Kein automatischer Erzeuger oder direkter In-Repo-Leser wurde gefunden; `GET /CHANGELOG.md` bedient stattdessen `CHANGELOG.md` im Root. Ob `app/CHANGELOG.md` eine getrennte, absichtlich zurückliegende Historie oder eine veraltete Kopie ist, bleibt zu entscheiden.
- `locales/guides/de.json`, `en.json`, `es.json`, `fr.json` sagen „LTTH 1.4.2 with Stream Monsters 1.12“. Quelle ist `scripts/plugin-guides/stream-monsters.js`; `npm run docs:plugins:build` generiert Guide-HTML und Guide-Localeprojektionen. Der Wortlaut beschreibt die dokumentierte Mindest-/Kompatibilitätsversion für Stream Monsters 1.12, nicht die aktuelle LTTH-Hostversion. Nicht auf 1.4.3 ändern, bevor der Plugin-Supportvertrag eine andere Mindestversion belegt.
- `CHANGELOG.md` (Root) enthält in `[Unreleased]` zusätzlich den zeitgebundenen Satz „LTTH stays at 1.4.1“ im Kontext der separat versionierten Stream-Monsters-1.11.1-Paketierung, obwohl der Root-Changelog weiter unten 1.4.3 führt. Der Satz ist kein kanonisches Runtimeversionsfeld; ob er historisch verschoben oder als Unreleased-Text entfernt werden soll, braucht eine Changelog-Ownerentscheidung.

### Minimaler Vorschlag für CEO-Entscheidung

1. Zuerst für den gewünschten öffentlichen Kanal belegen, ob LTTH 1.4.3 tatsächlich freigegeben wurde: exakter Tag/Main-SHA, Releaseasset, veröffentlichtes `CURRENT_RELEASE` und Pages-Projektion. Dieser lokale Audit hat keinen dieser externen Zustände geprüft.
2. Falls die Veröffentlichung weiterhin 1.4.2 ist, `CURRENT_VERSION`, `CURRENT_RELEASE` und darauf abgestimmte Websiteanzeigen bei 1.4.2 lassen; Runtimeziel 1.4.3 und veröffentlichte Historie bleiben getrennt.
3. Falls 1.4.3 für den betreffenden Kanal bestätigt ist, `CURRENT_*` nur über den genehmigten Releaseablauf bzw. dessen ausdrücklich gewählten Nachfolger aktualisieren. Websiteheader/-footer und vier Sprachwerte danach gezielt angleichen; zusätzlich das statische Versionlabel in `downloads/index.html` und seinen vier Übersetzungen dynamisch an dieselbe `CURRENT_RELEASE.version` binden oder als versionsneutrale Beschriftung ausführen. So bleibt nur eine Versionsquelle für diese Karte.
4. Separat entscheiden, ob `app/CHANGELOG.md` dieselbe Hosthistorie wie Root `CHANGELOG.md` abbilden soll. Die bereits über `/CHANGELOG.md` ausgelieferte Rootdatei nicht durch automatisches Kopieren ersetzen, bevor die Rollen geklärt sind. Den Stream-Monsters-Mindestversionssatz 1.4.2 unverändert lassen, solange keine neue Kompatibilitätsanforderung belegt ist.

Keine Versions-/Website-/Releaseänderung, kein Build, keine Veröffentlichung und keine Liveprüfung wurde in diesem Inventarlauf vorgenommen.

## Öffentliches Veröffentlichungsinventar

Read-only Versuch am 2026-10-06 über die öffentlichen GitHub-API- und `ltth.app`-URLs. Ein gebündelter Abruf meldete für alle folgenden URLs `not accessible via this tool`, bevor Seiteninhalte oder HTTP-/API-Antwortkörper geliefert wurden. Es erfolgten kein zweiter Netzwerkweg und keine Eskalation.

| Öffentliche URL | Gesuchter Beleg | Ergebnis dieses Versuchs |
|---|---|---|
| `https://api.github.com/repos/Loggableim/ltth.app/git/ref/tags/v1.4.3` | Existenz des exakten Tags und Zielobjekt. | Mein gebündelter Abruf war nicht zugänglich. Separater CEO-HTTPS-Read meldete HTTP 200: annotated-tag-Objekt SHA `ac6c348d1c8c6285f35c8b8f0aaddaeb40bcfa10`, `type=tag`. Das ist noch keine Commit-SHA und wurde nicht bis zum Zielcommit aufgelöst. |
| `https://api.github.com/repos/Loggableim/ltth.app/releases/tags/v1.4.3` | Releaseobjekt, Veröffentlichungsstatus und Assets des exakten Tags. | Separater CEO-HTTPS-Read meldete HTTP 404. Zum Beobachtungszeitpunkt kein öffentliches Releaseobjekt zu `v1.4.3`; daher keine Assets dieses Tags belegt. |
| `https://api.github.com/repos/Loggableim/ltth.app/releases/latest` | Aktuell als latest ausgeliefertes GitHub-Release und angezeigte Assetmetadaten. | Separater CEO-HTTPS-Read meldete HTTP 200: Stable-Release `v1.4.1`, `published_at=2026-07-26T09:57:36Z`. Im verfügbaren Antwortauszug bestätigte Assetnamen: `launcher-release.json` und `ltth_latest.zip`. Für `ltth_latest.zip`: 177,999,236 Bytes, SHA-256 `ed22f55a02cbc4f5e81a7bc40973d0fde050039a465251db7a95d404796c2b9b`. Assetliste war abgeschnitten; weitere Assetnamen oder Asset-URLs werden nicht behauptet. |
| `https://ltth.app/app/CURRENT_RELEASE.json` | Tatsächlich ausgelieferte Pages-Releaseversion und Datum. | Mein Abruf war nicht zugänglich. Separater CEO-HTTPS-Read meldete HTTP 200: `version=1.4.2`, `updated_at=2026-08-01T00:00:00Z`. Ein Antwort-Hash wurde nicht berichtet. |
| `https://ltth.app/app/CURRENT_VERSION.txt` | Tatsächlich ausgelieferte aktuelle Patchversionsnummer. | Nicht abrufbar; kein öffentlicher Wert/Hash beobachtet. |
| `https://ltth.app/version.json` | Tatsächlich ausgelieferte Installer-Zielversion und Downloadziel. | Nicht abrufbar; keine öffentliche Version beobachtet. |
| `https://ltth.app/_partials/header.html` und `https://ltth.app/_partials/footer.html` | Tatsächliche Websiteversionstexte in Header und Footer. | Beide nicht abrufbar; keine ausgelieferte Websiteversion beobachtet. |

**Abgrenzung der Kanäle:** (1) Der Tag `v1.4.3` existiert laut CEO-Read als annotated tag, aber der Zielcommit ist nicht aufgelöst; Übereinstimmung mit Workflowbedingung `GITHUB_SHA == origin/main` ist nicht belegt. (2) Der zugehörige `releases/tags/v1.4.3`-Endpunkt lieferte 404, also ist dafür kein GitHub-Releaseobjekt oder Asset belegt. (3) `releases/latest` zeigt separat `v1.4.1` mit mindestens den zwei bestätigten Assetnamen; die Pages-Releasedatei zeigt separat `1.4.2`. Damit stimmen GitHub-Latest-Release und Pages-`CURRENT_RELEASE` nicht überein. Das ist kein Anlass, `CURRENT_RELEASE` auf den Checkoutwert 1.4.3 zu setzen. Pages-`CURRENT_VERSION.txt`, Pages-`version.json`, Header/Footer und das tatsächliche Assetverzeichnis bleiben öffentlich ungeprüft. Mein Tool-Abruf war blockiert; die CEO-Werte sind als getrennte Handoff-Belege gekennzeichnet. Kein Paketdownload, Login, Token, Publishing oder Quellenupdate erfolgte.
