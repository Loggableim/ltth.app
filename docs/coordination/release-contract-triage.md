# Stream Monsters Release Contract Triage

Stand: 2026-10-06. `Bugstofix.md` blieb unverändert. Keine Releases/Archive erzeugt oder überschrieben; keine Versionsmetadaten, Liveaktionen oder realen Nutzerdaten verändert.

## Befund

- Das Jest-Baseline-Log meldete `spawnSync git EPERM` in `plugin-store-registry`, `streammonsters-assets-v15` und den Release-Suites 1.8 bis 1.12. Das sind fehlgeschlagene Prozessstarts in der Testumgebung; sie belegen weder falsche Git-Historie noch Paket-/Asset-Drift. WebP-Inspektion v1.5 hängt ebenfalls an einem externen Prozess und bleibt ungeprüft.
- `streammonsters-product-contract.test.js` erhielt `status: null` aus `spawnSync` bei seinen Synchronisierer-Aufrufen. Der direkte, schreibgeschützte `node scripts/sync-streammonsters-product.js --check` lief dagegen erfolgreich: „Stream Monsters product projections are synchronized.“ Damit ist kein Produktprojektionsfehler belegt.
- Drei statische Erwartungen in `app/test/plugin-store-registry.test.js` verwendeten `streamalchemy` als aktuelle Store-ID: stable-Eintrag, Ausnahme von open-beta und Subscriber-IDs. Der aktuelle Storevertrag und das Manifest führen `stream-monsters`; `streamalchemy` ist Alias und historische Release-/Rollback-ID. Die Testannahmen waren veraltet.

## Umsetzung

- Nur die drei aktuellen Store-ID-Erwartungen im Registrytest auf `stream-monsters` aktualisiert. Historische Paketnamen, Manifest-IDs, Prüfsummen und Rollbackangaben bleiben unverändert.
- Keine Änderung an `plugin-store.json`, Release Map, Manifest, Paketen, Produktvertrag oder Versionsständen.

## Geänderte Dateien

- `app/test/plugin-store-registry.test.js`
- `docs/coordination/release-contract-triage.md` (dieser Bericht)

## Tests

- Bestanden: `node scripts/sync-streammonsters-product.js --check`.
- Bestanden: gezielte Jest-Ausführung von `plugin-store-registry.test.js` mit den drei betroffenen Vertragsfällen, 1 Suite / 3 Tests.
- Eskaliert und bestanden, exakt ausgeführt aus Repository-Root: `node app/node_modules/jest/bin/jest.js --runInBand --runTestsByPath app/test/streammonsters-release-v18.test.js app/test/streammonsters-release-v19.test.js app/test/streammonsters-release-v110.test.js app/test/streammonsters-release-v111.test.js app/test/streammonsters-release-v112.test.js --testNamePattern="preserves every published|maps every release|keeps historical mappings|keeps 1.8.0 registered|records Rules-v7|binds every tree-backed|keeps the published 1.8|records Jackpot Arena|retains 1.10|keeps the published 1.9|keeps the verified 1.11.1|ships a path-safe|publishes one canonical|binds the canonical archive"`. Ergebnis: **5 Suites / 15 bestanden**, 30 übersprungen. Die CEO meldete anschließend unabhängige Bestätigung der Read-only-Release- und Produktauswahl zusammen: **6 Suites / 18 bestanden, 36 übersprungen, regulärer Exit 0**. Die ausgewählten Fälle lesen Release-Metadaten, historische SHA-256-Werte, bestehende ZIP-Inhalte und lokale Git-Quellbaum-/Commitbindungen; keine Rebuilds.
- Eskaliert und bestanden, exakt ausgeführt aus Repository-Root: `node app/node_modules/jest/bin/jest.js --runInBand --runTestsByPath app/test/streammonsters-product-contract.test.js --testNamePattern="owns the stable identity|uses contract defaults|keeps every checked product projection"`. Ergebnis: **1 Suite / 3 bestanden**, 6 übersprungen.
- Asset-Suite v1.5 nicht gewertet: erster Versuch lief fälschlich aus dem Repository-Root und endete nach zwei erwartbaren `ENOENT`-Manifestfehlern. Danach wurden zwei Ausführungen mit `app/` als CWD gestartet; der Toolwrapper lieferte jeweils `Script running` und später eine leere Abschlussmeldung ohne Exitcode, Jest-Ausgabe oder Prozessidentität. Ob diese Aufrufe regulär endeten bzw. ihre Prozesse bereinigt wurden, ist hier nicht feststellbar. Keine weiteren Starts; keine Pixel-/WebP-Prüfung als bestanden gewertet.
- Kein Paket/Archiv wurde geschrieben oder verändert; Rebuildprüfungen bleiben separat offen.

## Verbleibende Risiken und offene Entscheidungen

- Die fokussierten Git-Quellidentitäts- und historischen Paket-/Hashprüfungen bestanden unter genehmigter Sandboxeskalation. Nicht abgedeckte Releasefälle und Rebuildtests bleiben offen.
- WebP-Inspektion des Assetpakets ist weiterhin ungeprüft. Zwei korrekte-CWD-Aufrufe haben keinen erfassbaren Exit-/Cleanupnachweis; Lesende Inventur: `Get-CimInstance Win32_Process` wurde mit „Zugriff verweigert“ abgewiesen. `Get-Process` zeigte mehrere Node-Prozesse aus dem Codex-CUA-Runtimepfad und einen Python-Prozess aus einer anderen Projektlaufzeit; ohne lesbare Kommandozeilen sind sie keinem der beiden Assetstarts sicher zuzuordnen. Keine Prozesse gestoppt. Prozessidentität und Cleanupstatus bleiben offen; es wurde nicht erneut gestartet.
- Der Testfix ändert keine Storeinhalte. Overlay-/Storeinventar bleibt im Zuständigkeitsbereich des Overlayowners.




