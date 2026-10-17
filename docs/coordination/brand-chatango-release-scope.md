# Brand-/Chatango-Commit-Scope (read-only review, 2026-10-07)

## Ergebnis

Arbeitsbaumprüfung für einen späteren scoped Commit. Es wurde nichts gestaged, committed oder gepusht. Der Checkout enthält hunderte parallele Änderungen; Brand-/Chatango-Zugehörigkeit ist daher nicht gleichbedeutend mit kompletter Dateieigentümerschaft.

## Vollständig scoped Dateien

### Brandpalette / Theme

- `app/public/css/themes.css` — neuer Brand-Block für neutrale Oberflächen, Grün-Aktionen und Violett-Navigation.
- `app/public/js/theme-manager.js` — Cid-Beschreibung und Swatches.
- `app/test/theme-manager-default.test.js` — Cid-Palettentest und Testzugriff.

### Chatango-only Entfernen

- Runtime: `app/plugins/chatango/{README.md,main.js,plugin.json,ui.html,locales/{de,en,es,fr}.json}`; `app/public/js/chatango-theme-adapter.js`.
- Dedicated Tests: `app/test/chatango-{capture-workflow,embed,translation-contract,ui-theme-sync,widget-client}.test.js`; neuer Removal-Test `app/test/chatango-removal.test.js`.
- Dedicated Quellen: `docs/plugins/chatango.html`, `features/plugin-chatango.html`, `scripts/plugin-guides/chatango.js`, `scripts/repair-chatango-locales.js`, `plugin-store/packages/chatango-1.0.0.zip`.
- Dedicated Bilder: `screenshots/{de,es,fr}/docs/plugins/chatango/*.png`, `screenshots/{de,es,fr}/features/{chatango.png,plugin-chatango-dashboard.png}`, `screenshots/docs/plugins/chatango/*.png`, `screenshots/features/{chatango.png,plugin-chatango-dashboard.png}`.
- Reports/Evidence: `docs/coordination/chatango-removal.md`, `docs/coordination/chatango-removal-brand-acceptance.json`.

## Shared Dateien: nur passende Hunks aufnehmen

- `app/public/css/navigation.css`: Brand-Hintergrundakzente sowie Chatango-Layoutentfernung; getrennte, hunkweise Prüfung erforderlich.
- `app/public/dashboard.html`, `app/public/js/navigation.js`: aktuell Chatango-spezifische Entfernung; trotzdem HTML-/Navigationseinstiegspunkte vor Aufnahme im finalen Diff erneut prüfen.
- `app/public/js/plugin-manager.js`: Chatango aus Preinstalled-Liste entfernen ist scoped. Fremde Hunks: Closed-Beta-Filter und Screenshot-Fallback.
- `app/modules/plugin-loader.js`: Chatango-Zustandsschutz ist scoped. Fremde Hunks: Closed-Beta-Ausschluss und weitere Plugin-/Aliaslogik.
- `app/modules/plugin-store.js`: Chatango aus Preinstalled-Liste entfernen ist scoped. Fremde Hunks: Public-Distribution- und Closed-Beta-Filter.
- `app/server.js`, `app/routes/plugin-routes.js`: Chatango-CSP-/Routebereinigung liegt neben Public-Distribution-/Overlayänderungen; nur selektive Hunks prüfen.
- `plugin-store.json`: Chatango-Eintrag entfernen ist scoped; gleichzeitig wurden die elf Closed-Beta-Einträge entfernt. Keine Datei als Ganzes übernehmen.
- `app/locales/{de,en,es,fr}.json`, `locales/{de,en,es,fr}.json`, `locales/guides/{de,en,es,fr}.json`: Chatango-Keys entfernt, daneben Closed-Beta-/Übersetzungsänderungen. Nur Chatango-Hunks.
- `features/catalog-data.js`, `features/index.html`, `features-{en,es,fr}.html`, `plugins.html`: Chatango-Katalogentfernung neben Closed-Beta-Marketing, Generierung und weiteren Katalogänderungen.
- `sitemap.xml`, `docs/plugins/index.json`, `docs/plugin-docs-qa/{index.html,report.json}`, `screenshots/docs-capture-manifest.json`: Chatango-Referenzen neben Änderungen des Closed-Beta-/Guide-Inventars.
- `scripts/plugin-tutorial-catalog.js`, `scripts/lib/obs-docs-capture-inventory.js`, weitere Guide-/Screenshotgeneratoren und `app/test/*catalog*`: Chatango-Einträge neben Policy-/Inventaränderungen.
- `package.json`: sichtbarer Hunk entfernt den Chatango-Locale-Repair-Befehl; Datei trotzdem vor Aufnahme final prüfen.

## Ausdrücklich nicht aufnehmen

- Alle Talking-Heads-/TTS-Änderungen, u. a. `app/plugins/tts/main.js`, `app/public/js/tts-renderer-lifecycle.js`, `app/test/{dashboard-tts-renderer,tts-renderer-lifecycle}.test.js` sowie sämtliche sonstigen `app/plugins/talking-heads/**`-Änderungen.
- Sidekick-, Overlay-/Public-Registry-, Stream-Monsters-, Profile-, Plugin-Distribution-/Closed-Beta-, Installer-, Dokumentations-Capture- und übrige UI-/Store-Workeränderungen.
- `.gitignore`-Hunk für `distribution-mode.json` ist Distribution-Workerarbeit, nicht Brand/Chatango.

## Commitgrenze

Sichere erste Teilmenge: drei Brand-Dateien plus dedicated Chatango-only Deletions und explizite Chatango-Einzelhunks. Für alle Shared-Dateien Hunk-Staging anhand eines frisch geprüften Diffs verwenden; keine Whole-file-Aufnahme von Plugin-Store, Plugin-Manager, Loader/Store, CSP/Routen, Locale- oder generierten Katalogdateien. Vor Commit nach Änderungen im Parallelbaum erneut `git status` und Hunk-Diffs prüfen.

## Prüfung

Read-only Scope-/Diffreview. Kein Staging, Commit, Push, Build oder Testlauf in diesem Auftrag.
