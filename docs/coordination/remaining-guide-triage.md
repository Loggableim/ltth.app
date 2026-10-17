# Verbleibende Guide- und Capture-Triage

Stand: 2026-10-06

## Befund und behobene Ursachen

- Der Guide ist von der alten ID `streamalchemy` auf die kanonische ID `stream-monsters` gewechselt. Die OBS-Auflösungstabelle und die `REVIEW_ONLY_STEPS`-Tabelle verwendeten noch den Alias als Inventarschlüssel. Dadurch scheiterten OBS-Batch und OBS-Vertrag mit `Missing: stream-monsters; stale: streamalchemy`.
- Mehrere Workflow-Tests suchten weiter nach `streamalchemy` oder erwarteten `/streammonsters/ui`. Der aktive Guide verwendet `/stream-monsters/ui`; Pluginroutes behalten separate alte Aliase, aber die Guides und Inventartests folgen dem aktuellen kanonischen Einstieg.
- Die Interactive-Story-Preview-Suite erwartete, dass `loadDebugLogs()` direkt auf `loadThemes()` folgt. Die aktuelle Liveinitialisierung lädt dieselben Daten, ordnet dazwischen aber noch UI-Container an und aktualisiert den Story-Modus. Die Assertion erfasst jetzt alle vier Liveinitialisierungsaufrufe in ihrem Preview-Guard.
- `guide-definition-validation` und `plugin-guide-definition-rendering` starteten den lokalen Dokumentationsgenerator als Node-Kindprozess und erhielten in dieser Umgebung `spawnSync ... EPERM`. Der Builder exportiert jetzt die normale Buildfunktion und den Guide-Audit; die Tests rufen denselben Implementierungspfad in-process auf. Der CLI-Auditpfad und die Generatorlogik bleiben erhalten.
- Der aktuelle Guide-Capture-Datenbestand ist weiterhin unvollständig und teilweise veraltet. Die aktuelle Spezifikation erwartet 860 Receipts. Das Manifest hat 856; 28 davon sind alte `streamalchemy__...`-Receipts, und 32 aktuelle Varianten fehlen (28 Stream Monsters und vier Sidekick). Kein vorhandener Capture wurde umbenannt, kopiert oder mit neuer Metadaten versehen.

## Umsetzung

- OBS-Capture-Inventar und Review-only-Step-Zuordnung verwenden `stream-monsters` kanonisch.
- Stream-Monsters-Workflowtests verweisen auf die aktuelle Guide-ID und `/stream-monsters/ui`.
- Guide-Audit und Guide-Rendering testen Audit-/Buildcode ohne Prozess-Spawn. Die Sichtprüfung des Renderers nutzt weiterhin echte generierte Dokumentationsseiten und Locale-Bundles.
- Der Builder wurde in-process über den Test aufgerufen und hat aktuelle Guide-Seiten, Index, Locale-Bundles und Sitemap erzeugt. Das sind normale Generatorausgaben, keine Capture-Receipts.

## Geänderte Dateien

- `scripts/lib/obs-docs-capture-inventory.js`
- `scripts/plugin-guides/safe-workflow-contracts.js`
- `scripts/build-plugin-docs.js`
- `app/test/docs-capture-real-workflows.test.js`
- `app/test/guide-definition-validation.test.js`
- `app/test/plugin-guide-definition-rendering.test.js`
- `app/test/plugin-tutorial-source-workflow.test.js`
- Generierte Guide-Seiten in `docs/plugins/`, `locales/{de,en,es,fr}.json`, `locales/guides/{de,en,es,fr}.json` und `sitemap.xml`.

## Frische fokussierte Prüfungen

**Bestanden:** gebündelter Node 22.14.0, App-Jest-Konfiguration, `--runInBand --silent`; zusammen **9 Suites / 148 Tests, Exit 0**:

- `test/emoji-rain-guide-url.test.js`
- `test/guide-definition-validation.test.js`
- `test/plugin-guide-definition-rendering.test.js`
- `test/chatango-capture-workflow.test.js`
- `test/docs-capture-real-workflows.test.js`
- `test/obs-docs-capture-batch.test.js`
- `test/obs-docs-capture-contract.test.js`
- `test/plugin-tutorial-source-workflow.test.js`
- `test/interaction-capture-guide-evidence.test.js`

Zusätzlich ist der Generator im `plugin-guide-definition-rendering`-Test gelaufen; das Guide-Audit darin bestätigt alle 39 Definitionen mit null Vertragsfehlern.

**Fehlgeschlagen wegen Capturebelegen, nicht wegen Guide-/OBS-Inventar:** separater frischer Lauf, 3 Suites, 4 fehlgeschlagene Assertions:

- `test/plugin-docs-gallery.test.js`: zweimal 856 vorhandene Receipts gegenüber 860 erwarteten.
- `test/plugin-docs-e2e.test.js`: vier fehlende Sidekick-Statusscreenshots (`de/en/es/fr`).
- `test/plugin-guide-capture-contract.test.js`: 28 veraltete `streamalchemy__...` Receipt-IDs außerhalb des aktuellen Inventars; die Suite meldet sie jetzt ausdrücklich statt mit `TypeError` abzubrechen.

Der Gallery-/E2E-Status ist damit nicht durch synthetische Metadaten oder einen abgeschwächten Vollständigkeitsvertrag kaschiert.

## Blockiert und nicht geprüft

- 32 aktuelle Locale-Captures müssen mit dem offiziellen Screenshot-Capturer echt neu aufgenommen werden. Playwright-Rendererstart ist nach Sandboxeskalation möglich, aber offizielle Capturebelege bleiben blockiert, bis der Isolationsfehler behoben ist: aktueller Harness beendet die Serverkindprozesse vor Healthcheck, migriert `app/user_configs` und schreibt/archiviert im Repo-Root-Logpfad. Es wurden keine Abhängigkeiten installiert; kein neues Capture-Receipt wurde behauptet.
- Begrenzte Rendererprobe (2026-10-06): vorhandenes lokales Playwright/Chromium auf einer synthetischen Seite ohne Netzwerk, Nutzerprofil, OBS, TikTok oder Streamdaten; ein Browserprozess und temporäre Ausgabe unter `%TEMP%`. Sandbox-Aufruf scheiterte mit `spawn EPERM`; nach dokumentierter enger Eskalation startete derselbe Browser. Ergebnis: `ok: true`, erwarteter DOM-Text `Guide Capture Probe`, Viewport 960x540, ein PNG unter `%TEMP%`. Das PNG ist nur Probeoutput, kein Receipt und wurde nicht in den Screenshotbestand kopiert. Es beweist Rendererstart, noch nicht den offiziellen Produkt-/Guide-Capturevertrag.
- Für eine mögliche Folgeaufnahme ist der geplante Umfang exakt auf acht Guide-Schritte begrenzt (`stream-monsters`: alchemy-card, retention-rules, automation-rule, action-chain, rule-dry-run, alchemy-overlay, rule-reset; `sidekick`: status-view) in `de/en/es/fr`. Der offizielle `scripts/capture-product-screenshots.js`-Pfad nutzt sein eigenes synthetisches Pluginfixture, ephemeral `127.0.0.1`-App und blockierte externe Requests. Ein Teilcapture ersetzt nur vorhandene Receipts für exakt dieselbe Locale-/Asset-ID und erhält sämtliche übrigen Outputs unverändert. Kein allgemeiner Screenshotlauf.
- Assetinventar vor Ausführung frisch bestätigt: genau diese acht IDs sind vorhanden, alle verwenden die aktuellen Guide-Routen und spezifischen Anker. Das bestehende Manifest enthält 856 Outputs, darunter 28 inkompatible alte `streamalchemy__...` IDs, und bislang keine Outputs dieser beiden aktuellen Guide-IDs. Der additive Teilmerge behält diese Historie bei und hängt nur erfolgreiche neue Receipts an. Die Aufnahme für einen beauftragten Einzelcapture schreibt nur dessen PNG und Receipt.
- Captureradapter-Entscheidung: Puppeteer und puppeteer-core fehlen trotz der Manifestdeklaration. Um keine Runtimeabhängigkeit hinzuzufügen, darf ein temporärer `%TEMP%`-Preload ausschließlich die benötigten Puppeteer-Seitenmethoden an das bereits installierte Playwright binden; Screenshotworkflow, Fixture, Request-Allowlist, Workflowprüfung und Receipt-Erzeugung bleiben im offiziellen Script. Der Shim selbst wird nicht in den Repo-Tree gelegt. Vor Manifest-/PNG-Schreibzugriff prüfen, dass jedes neue Output den offiziellen Receipt-Vertrag erfüllt; wenn das nicht geht, sofort abbrechen und keine Receipts erzeugen.
- Ergebnis/Eskalationsgrenze (2026-10-06): der offizielle Capturepfad wurde mit acht IDs und vier Locales gestartet, erzeugte aber **0 Screenshots / 32 Fehlschläge**. In allen acht isolierten Appstarts endete der Kindprozess mit Exitcode 0, bevor `/api/health` bereit war. Der Prozess hat außerdem trotz `%TEMP%`-Profil eine Migration von `app/user_configs` ins temporäre Profil ausgelöst und den Root-Logpfad im Repo verwendet (sechs Altlogs archiviert; neue Logs/Auditdateien angelegt). Deshalb keine Wiederholung/weitere Appstarts. Das ursprüngliche 856-Output-Manifest wurde bytegleich aus TEMP wiederhergestellt (SHA-256 geprüft); es wurden keine PNGs des fehlgeschlagenen Laufs erzeugt. Die bereits vorhandenen Dateien unter den Guide-Screenshotpfaden haben Zeitstempel vom 20.09.2026 und blieben unangetastet. TEMP-Profile wurden durch den Capturer entfernt. Die neuen/archivierten Root-Logs bleiben erhalten und sind ungeprüft, um keine Nutzerlogs zu löschen oder wiederherzustellen.
- Exakter fehlgeschlagener Start: Runner vom Workspace-Root als `node -r <TEMP>\ltth-pw-puppeteer-bridge.cjs scripts/capture-product-screenshots.js`; `Get-Command node` ergab `C:\Program Files\nodejs\node.exe`, also globales statt gebündeltes `runtime/node/node.exe`. `process.execPath` startete den Kindprozess `app/server.js` im CWD `app`. Überschriebene Env: `LOCALAPPDATA=<TEMP>\ltth-docs-capture-{guide-locale}-*`, `LTTH_PORT=<ephemeral>`, `LTTH_DOCS_CAPTURE=true`, `LTTH_DOCS_SAFE_MODE=true`, `LTTH_DISABLE_TIKTOK_AUTO_RECONNECT=true`, `LTTH_NO_BROWSER=true`, `DISABLE_SWAGGER=true`, `LTTH_BIND_ADDRESS=127.0.0.1`, plus `LTTH_DOCS_CAPTURE_PLUGIN_DIR=<TEMP fixture>`. Global-Node als mögliche Mitursache ist nicht ausgeschlossen; der gebündelte Runtimepfad wurde in dieser Runde nicht getestet. Der genaue Auslöser für Exit 0 wurde nicht festgestellt.
- Die OBS-Batchsuite verwendet einen Mock des Single-Capture-Runners. Sie belegt den Inventarvertrag und die sichere Dispatchmatrix, keine OBS-Aufnahme oder Liveausgabe.
- Keine Nutzer-App gestartet, keine OBS-App bedient, keine Liveabnahme und keine Veröffentlichung.
- Keine vollständige Jest-Baseline wiederholt.
