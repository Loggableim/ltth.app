# Store-, Katalog- und Guide-Capture-Triage

Stand: 2026-10-06

## Befund

- **TikTok-Studio-Overlayinventar:** Der Eintrag für Stream Monsters zeigte auf den nicht mehr vorhandenen Quellpfad `app/plugins/streamalchemy/streammonsters-ui.html`. Die aktive UI liegt unter `app/plugins/stream-monsters/streammonsters-ui.html`. Das Plugin hält `/streamalchemy/ui` weiterhin als Kompatibilitätsalias neben `/stream-monsters/ui`; der Test muss trotzdem den aktiven Quellbaum prüfen.
- **Store-/Releaseprüfung:** Die Vollbaseline meldet für `plugin-store-registry` Git-Subprozessfehler `spawnSync git EPERM` bei den Source-Tree-/Bundlevergleichen. Daneben verwendeten drei generische Katalogassertions noch den Alias `streamalchemy` als aktuelle Store-ID; die Registry und `plugin-identities.js` verwenden `stream-monsters` kanonisch. Im gemeinsam bearbeiteten Arbeitsbaum sind diese drei generischen Assertionen inzwischen auf `stream-monsters` gestellt; sie wurden in dieser Runde nicht von mir geändert oder frisch ausgeführt. Der Versionsfachagent hat bestätigt, dass die historische 1.11.1-Assertion am Alias `streamalchemy` unverändert korrekt ist: sie prüft ausdrücklich das alte Manifest, den Git-Source-Tree und die archivierten Paketnamen. Die Bundleverträge LTTH 1.4.1 → Stream Monsters 1.11.1 und 1.4.2 → Stream Monsters 1.12.0 sind versionsgebunden und keine aktuelle Versionsbehauptung. Die übrigen historischen Paket-, Release- und Versionsassertions bleiben daher bestehen.
- **Guide-Capture-Inventar:** Die aktuelle Spezifikation enthält 215 Schritte (860 Locale-Captures). Das Manifest hat 856 Ausgaben, aber die Differenz ist nicht bloß vier fehlende Dateien: Es enthält 28 alte `streamalchemy__{step}`-Receipts (sieben Schritte in vier Sprachen), während die aktuelle Spezifikation `stream-monsters__{step}` erwartet. Zusätzlich fehlen die vier Sidekick-Statusvarianten. Die aktuellen Stream-Monsters-Dateipfade im Manifest zeigen noch auf `screenshots/{locale}/docs/plugins/streamalchemy/...`; vorhandene Dateien unter `.../stream-monsters/...` ersetzen keine aktuellen CaptureReceipts.
- Der offizielle Guide-Capturer benötigt Puppeteer, das in der vorhandenen App-Installation nicht vorhanden ist. Das vorhandene Playwright/Chromium startet hier mit `spawn EPERM`. Die betroffenen Screenshots können damit in dieser Umgebung nicht authentisch neu aufgenommen werden.

## Umsetzung

- `app/test/tiktok-studio-overlay-inventory.test.js` prüft jetzt den aktiven kanonischen Dateipfad. Die bestehende Aliasroute bleibt unberührt.
- `app/test/plugin-guide-capture-contract.test.js` meldet jetzt nicht mehr einen Folge-`TypeError`, wenn ein Manifest-Receipt eine inzwischen entfernte Guide-ID hat. Der Vertrag prüft die aktuelle Inventarzugehörigkeit ausdrücklich und überspringt danach nur den unmöglichen Lookup für diesen bereits als veraltet gemeldeten Eintrag. Damit bleibt die Suite bis zur echten Neuaufnahme rot und nennt die konkreten veralteten IDs.
- Keine Store-Metadaten, Paketdateien, Checksums oder CaptureReceipts wurden umgeschrieben. Keine Pakete/Archive wurden gebaut oder veröffentlicht.

## Geänderte Dateien

- `app/test/tiktok-studio-overlay-inventory.test.js`
- `app/test/plugin-guide-capture-contract.test.js`
- `docs/coordination/store-inventory-triage.md`

Die parallel veränderte `app/test/plugin-store-registry.test.js` enthält kanonische ID-Assertionen anderer Arbeit; ihre Änderungen wurden hier nicht editiert.

## Prüfungen

**Bestanden:**

- `tiktok-studio-overlay-inventory.test.js`: 1 Suite, 29 Tests.
- Guide-/Katalog-/Capture-Verträge gezielt: 8 Suites, 47 Tests bestanden (Guide-Definition, Workflow, veröffentlichter Katalog, Locale-Bundles, Guide-Module/Ownership, Live-Verifier und Viewport). Der Vertragstest für stale Capture IDs ist nach der präziseren Diagnoseabsicherung separat erneut gelaufen und scheitert erwartungsgemäß mit genau 28 nicht mehr registrierten `streamalchemy__...`-Receipts statt `TypeError`.
- `scripts/build-plugin-docs.js --audit-contracts`: 39 Guides, 0 Fehler (frischer Lauf aus der vorigen Guide-Runde).

**Fehlgeschlagen/Blockiert:**

- `plugin-docs-gallery.test.js`: 856 Ausgaben statt erwarteter 860.
- `plugin-docs-e2e.test.js`: vier fehlende Sidekick-Screenshots (`de/en/es/fr/status-view`).
- `plugin-guide-capture-contract.test.js`: 28 alte `streamalchemy__...`-IDs sind nicht mehr in der aktuellen Guide-Spezifikation.
- Frische Release-Source-Tree-/Bundleverifikation kann wegen `spawnSync git EPERM` nicht in dieser Laufzeit bewertet werden. Der Versionsfachagent hat die versionierten Verträge statisch geprüft und den Metadatenmodus für LTTH 1.4.3 bestätigt; der Store-Test selbst wurde auch in seiner Runde nicht frisch ausgeführt.

## Erlaubte Oberflächen und Grenzen

Die TikTok-Studio-Korrektur ändert ausschließlich eine Testreferenz auf eine aktive HTML-Datei. Sie ergänzt keine Overlayroute, Admin-/Schreibschnittstelle oder öffentliche API. Die historische `/streamalchemy/ui`-Route bleibt ein expliziter Alias. Store-/Paketdateien und Checksums bleiben unverändert.

## Verbleibende Risiken

- 32 Capturevarianten (28 aktuelle Stream-Monsters-Schritte und vier Sidekick-Statusseiten) benötigen echte lokale Browseraufnahmen und neue, passende Receipts. Keine bestehende Bilddatei darf umbenannt oder mit neuer Receipt-Metadaten versehen werden, um den Vollständigkeitstest grün zu bekommen.
- Der fehlende Browserstart ist ein Umgebungsblocker (`spawn EPERM`); es wurde keine Abhängigkeit installiert. Es gab keine OBS-/Liveabnahme.
- Historische Stream-Monsters-Versionen, Releasequellen und Bundlevergleiche bleiben beim zuständigen Backend-/Versionsfachbereich.
