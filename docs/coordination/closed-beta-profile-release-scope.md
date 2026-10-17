# Release-Scope: Profil/Katalog und Chatango

Stand: 2026-10-07. Zweck: Kandidaten für einen eng begrenzten Zwischencommit auflisten. Diese Notiz nimmt keine Änderungen in den Index auf und ersetzt keine Hunk-Prüfung durch den koordinierenden Root.

## Kandidaten aus meinem Katalog-/Dokumentationsauftrag

Diese Pfade passen funktional zu Closed-Beta-Auslistung und Chatango-Bereinigung. Bei den unten als „hunkweise prüfen“ markierten Dateien dürfen nur passende Hunks in den Commit.

### Katalog, Guides und Generatoren

- `plugin-store.json` — beide Aufträge; 11 Closed-Beta-Listings und Chatango-Listing/Downloadmetadaten entfernt.
- `plugins.html` — beide Aufträge; statische Fallbackkarten entfernt.
- `plugin-store/packages/chatango-1.0.0.zip` — Chatango-Paket aus öffentlichem Store entfernt.
- `package.json` — nur den veralteten `plugin:chatango:i18n`-Befehl aufnehmen.
- `scripts/repair-chatango-locales.js` — Chatango-spezifischen Reparaturgenerator entfernen.
- `scripts/plugin-guides/chatango.js` — Chatango-Guide-Quelle entfernen.
- `scripts/lib/published-plugin-catalog.js`
- `scripts/plugin-tutorial-source.js`
- `scripts/plugin-tutorial-catalog.js`
- `scripts/build-plugin-docs.js`
- `scripts/verify-plugin-tutorial-source.js`
- `scripts/sync-streammonsters-product.js`
- `scripts/product-screenshot-spec.js` — Chatango-Routen/Einträge entfernen.
- `scripts/plugin-guides/index.js` — **geteilt:** Chatango-Entfernung ist in Scope; die gleichzeitig hinzugefügte `sidekick`-Guide-Registrierung gehört zum Sidekick-Auftrag und darf nicht mitgestaged werden.
- `scripts/build-plugin-docs-gallery.js`, `scripts/verify-plugin-docs-gallery.js`, `scripts/lib/obs-docs-capture-inventory.js` — **geteilt mit Docs-/OBS-Arbeit:** nur nach Zuordnung der einzelnen Katalog-/Closed-Beta-Hunks aufnehmen.
- `screenshots/docs-capture-manifest.json` — **geteilt:** mein Kataloglauf reduzierte nicht mehr öffentliche Ziele; parallele Capture-/OBS-Arbeit hat weitere Änderungen. Keinen Ganzdatei-Hunk übernehmen.

### Regressionstests und Statusdokumente

- `app/test/published-plugin-catalog.test.js`
- `app/test/plugin-docs-gallery.test.js`
- `app/test/plugin-docs-live-verifier.test.js` — Chatango-/Katalogerwartungen nur aufnehmen, wenn die Hunks diesem Auftrag zugeordnet sind.
- `app/test/plugin-tutorial-source-workflow.test.js`
- `app/test/streammonsters-product-contract.test.js`
- `app/test/plugin-store-registry.test.js`
- `docs/coordination/closed-beta-public-catalog.md`
- `docs/coordination/chatango-removal.md` — der Bericht nennt auch Backend-/Frontendarbeit anderer Owner; bei einem Commit ist die Zuständigkeit des Berichtspfads mit Root abzustimmen.
- `docs/SNAPSHOT_STATUS.md`, `docs/{de,en,es,fr}/SNAPSHOT_STATUS.md` — nur Store-/Manifestzahlen und Chatango-Inventory-Hunks. Die Bestandszahlen sind durch beide Aufträge beeinflusst; Paketzahlen in den Übersetzungen sind derzeit nicht überall synchron.
- `infos/llm_start_here.md` — nur die aktuelle Store-Zahl.
- `docs/plugin-docs-qa/index.html`, `docs/plugin-docs-qa/report.json` — **geteilt:** generierte Katalog-/Gallery-Ausgabe mit parallel ergänzter Receipt-Validierung. Vor Aufnahme gegen eingefrorene Generatorquellen und den aktuellen Capture-Manifeststand prüfen.

### Chatango-Ressourcen, Locale und generierte Dokumentation

- `app/locales/{de,en,es,fr}.json` — aktuelle Diffs entfernen ausschließlich Chatango-Navigations-/Loading-Einträge; diese Hunks gehören zur Entfernung.
- `docs/plugins/chatango.html`, `scripts/plugin-guides/chatango.js` und `plugin-store/packages/chatango-1.0.0.zip` — Chatango-spezifische aktive Guide-/Store-Artefakte.
- `screenshots/**/docs/plugins/chatango/**` — Chatango-Bilder der öffentlichen Plugin-Dokumentation. Vor Aufnahme prüfen, ob es historische/archivierte Belege sind; `screenshots/archive/**` bleibt ausgeschlossen.

## Dateien anderer Owner: nicht in diesen Commit aufnehmen

- Releasepolicy und Backend-Gate: `app/config/plugin-release-policy.json`, `app/modules/plugin-release-policy.js`, deren Tests sowie Änderungen an `app/modules/plugin-loader.js`, `app/modules/plugin-store.js`, `app/routes/plugin-routes.js`, `app/server.js` und `app/test/backup-restore.test.js` gehören zur Runtime-/Rechtearbeit.
- Dashboard und gemeinsames Theme: `app/public/dashboard.html`, `app/public/css/**`, `app/public/js/**` (einschließlich gelöschtem `chatango-theme-adapter.js`) und die Chatango-UI-Tests gehören zum Frontend-Owner.
- Runtime-Pluginlöschung und CSP: `app/plugins/chatango/**` sowie `app/server.js` gehören zum Backend-Owner.
- Homepage/Feature-Hub-Marketing und Feature-Screenshots: `features/**`, `screenshots/**/features/**chatango*`, `screenshots/**/plugin-chatango-dashboard*`, `index.html`, Root-Locale-Marketingtexte und zugehörige Websitegeneratoren gehören zum Website-Owner, außer Root gibt einzelne Hunks frei. `features/plugin-chatango.html` gehört ebenfalls hierher.
- Fremde Plugin-/TTS-/Talking-Heads-Änderungen, deren Tests, lokale Policy-/Releasebündel-Änderungen und unzugeordnete Belege bleiben ausgeschlossen.

## Hunk-/Commit-Hinweise

- Der Checkout enthält umfangreiche, parallele Änderungen. Dateibesitz allein genügt nicht als Freigabe für eine ganze Datei.
- `scripts/plugin-guides/index.js` hat mindestens einen fremden Sidekick-Hunk. Andere Überschneidungen müssen vor dem Staging mit `git diff -- <pfad>` beziehungsweise `git diff --cached -- <pfad>` einzeln geprüft werden.
- Direkte Diff-Prüfung zeigt in `scripts/build-plugin-docs-gallery.js` und `scripts/verify-plugin-docs-gallery.js` umfangreiche Receipt-/Hash-/Stale-Capture-Validierung aus paralleler Docs-QA-Arbeit. Sie gehört nicht pauschal zum Closed-Beta-Commit.
- `scripts/lib/obs-docs-capture-inventory.js` ist ebenfalls geteilt und enthält Inventaränderungen jenseits der gefilterten Closed-Beta-IDs. Nur vom jeweiligen Owner bestätigte Hunks dürfen aufgenommen werden.
- `plugin-store.json` und `plugins.html` enthalten sowohl Chatango- als auch Closed-Beta-Entfernung. `plugins.html` hat zusätzlich Whitespace-/Leerzeilen-Hunks; diese vor dem Stage nicht unbesehen als Inhaltsänderungen behandeln.
- `docs/SNAPSHOT_STATUS.md` und seine Übersetzungen enthalten parallele Zähländerungen; die öffentliche Registryzahl und lokale Manifestzahl stammen aus mehreren abgestimmten Änderungen.
- Die alten öffentlichen Screenshot-Manifeste/Artefakte wurden teilweise regeneriert. Nicht pauschal alle Capture- oder OBS-Dateien aufnehmen; nur nachweislich aktive Katalogausgaben dieses Auftrags.
- Ich habe in diesem Arbeitsschritt nichts gestaged oder committet und keine Tests erneut ausgeführt. Die vorhandenen Abnahmen stehen in `docs/coordination/closed-beta-public-catalog.md` und `docs/coordination/chatango-removal.md`.

## Abhängigkeitsreihenfolge für minimale kohärente Commits

Vorbedingung für jede Staging-Operation: Root friert die gemeinsamen Diffs ein und entscheidet die Hunks. Die Source-Datei `app/config/plugin-release-policy.json` liegt derzeit in der Paralleländerung; der neue Kataloghelper lädt sie verpflichtend. Deshalb muss die Policy vom zuständigen Owner gemeinsam mit dem ersten Katalogcommit aufgenommen werden.

1. **Öffentlicher Katalogzustand** — gemeinsam aufnehmen: Policy + `scripts/lib/published-plugin-catalog.js`, die zugehörigen Policy-/Katalogtests, `plugin-store.json`, statischer Fallback in `plugins.html`, und nur den relevanten Closed-Beta-Guard samt Regression in `scripts/sync-streammonsters-product.js` / `app/test/streammonsters-product-contract.test.js`. So bleibt Quelle, Store, Fallback und Re-Projektionsschutz konsistent; Chatango-Listing wird in denselben beiden öffentlichen Oberflächen mit entfernt. Der Stream-Monsters-Generator enthält weitere Hunks, daher nur nach Owner-Hunkfreigabe.

   Vorgeschlagene Quellchecks nach Freeze: `runtime/node/node.exe scripts/verify-plugin-catalog.js`; `runtime/node/node.exe scripts/sync-streammonsters-product.js --check`; fokussierte Jest-Suites `published-plugin-catalog.test.js`, `plugin-store-registry.test.js` und `streammonsters-product-contract.test.js`. Zusätzlich JSON-Parse der Policy und Registry sowie Karten-/Registry-Gleichheit (im Catalog-Verifier enthalten). Diese Checks belegen die statische öffentliche Liste, keine veröffentlichte Website.

2. **Öffentliche Guide-/Dokumentationsquellen** — danach Kataloggefilterte Änderungen in `scripts/plugin-tutorial-source.js`, `scripts/plugin-tutorial-catalog.js`, `scripts/build-plugin-docs.js`, den freigegebenen Guide-/Capture-Inventarquellen und deren gezielten Tests aufnehmen. Chatango-Guidequellen und veraltete Chatango-i18n-Builddatei können dazugehören. Generierte aktuelle Guide-Seiten/Indizes erst nach den Quelländerungen regenerieren; veraltete öffentliche Detailseiten und öffentliche Store-URLs müssen aus dem aktiven Satz verschwinden. Fremde hunks, insbesondere Sidekick-Registrierung, bleiben draußen.

   Vorgeschlagene Quellchecks: `runtime/node/node.exe scripts/verify-plugin-tutorial-source.js`, `npm run docs:plugins:source:check`, `npm run docs:plugins:build`, `npm run docs:plugins:check` sowie fokussierte Tutorial-Workflow-/Docs-Tests. Nach dem Build prüfen, dass nur der aktuelle öffentliche Guide-Satz (27 IDs nach dem dokumentierten Stand) veröffentlicht wird und lokale Pluginquellen erhalten bleiben.

3. **Aktuelle Gallery-Berichte als eigener, geteilter Output-Schritt** — nur nach Freeze der Docs-/OBS-Owner. Der Screenshotmanifest- und Gallery-Generator-Diff enthält Änderungen zur Receipt-Prüfung, Hashes, stale Outputs und aktueller Coverage, die über die Closed-Beta-Filterung hinausgehen. Generator und manifest source müssen als zusammengehörige Einheit geprüft werden; erst dann Bericht/HTML generieren. Gallery-Quellchecks dürfen Screenshot-Evidenzvollständigkeit darstellen, nicht visuelle Abnahme.

   `npm run docs:gallery:check` ist aktuell kein Source-Pass: der generierte Bericht steht auf `reviewStatus: pending`, hat 0 OBS-Belege bei 68 erwarteten Zielen, und der Verifier verlangt eine menschlich genehmigte Gallery sowie OBS-Coverage. Ohne echte Reviews/Captures bleibt das ein offener Gate. Keine neuen Screenshots/OBS-Aktionen aus diesem Commitplan heraus auslösen.

## OBS-Evidenzgrenze

- Der aktive Guide-/Overlay-Inventarfilter beschreibt, welche Dokumentationsziele aktuell vorgesehen sind. Die derzeit notierten 68 Ziele und 0 OBS-Records sind Plan-/Coverage-Metadaten, keine erfolgreich ausgeführten OBS-Prüfungen.
- Der `git diff --name-status`-Abgleich für `docs/coordination/obs-104-acceptance-matrix.json`, die aktuell benannten `obs-104-*` Referenzdateien, `docs/coordination/obs-abnahme.md` und `docs_archive/` zeigte keine tracked Änderungen. Neue untracked `obs-104-*` Arbeitsartefakte anderer Owner bleiben vollständig außerhalb meines Scopes.
- Historische 102-/104er-Reports, Receipts und Auditpläne nicht löschen, um aktuelle Sollzahlen zu verkleinern. Aktuelle Quellen-/Galerieinventare und historische Abnahmen sind getrennte Artefakte; Änderungen am aktiven Inventar übertragen oder widerrufen keine historischen Nachweise.
