# Dashboard theme palette review (2026-10-07)

## Befund

Der angegebene Stand `d6926770b71a53b7b02938a55e2b1eff4adba491` enthält bereits die passende Grundpalette: Day nutzt dunkles Brandgrün `#166534` auf hellen, neutralen Flächen; Night/Cid nutzen helle Akzente auf dunklen Flächen; die Navigation ist violett mit weißer Schrift. Das Logo bleibt in allen drei Zuständen sichtbar.

Die hellen Day-Flächen hatten jedoch einige nicht angepasste Erfolgsfarben. Das tatsächlich zuerst geladene Tailwind-Utility `.text-green-400` blieb `#4ade80` und erreichte nur 1,74:1 auf Weiß. Feste Styles in Profilstatus und abgeschlossenen Wizard-Schritten verwendeten ebenfalls `#22c55e` bzw. `#4ade80`. Dynamische Dashboard-Badges setzen `#22c55e` inline.

## Umsetzung

`themes.css` ordnet diese Erfolgsfarben nur im Day-Theme dem vorhandenen `--brand-primary` zu. Das umfasst `.text-green-400`, Profil-/Migrations-Erfolgstext, Erfolgsicons und den abgeschlossenen Wizard-Schritt. Ein enges Attributziel passt außerdem Inline-Text an, dessen Style den vorhandenen Wert `color: #22c55e` enthält. Der Wizard-Indikator erhält das Brandgrün auch als Hintergrund und Rahmen. Night und Cid behalten ihre bisherigen Farbtokens und Regeln.

Der fremde Grid-Hunk in `app/public/css/navigation.css` blieb unangetastet. Es gab keine Änderungen an HTTP-/Socket-APIs, Public-Overlay-Registry, Tunneln oder Pluginzugängen.

## Geänderte Produktdateien

- `app/public/css/themes.css`
- `app/test/dashboard-theme-palette.test.js`

Der isolierte Patch gegen die angegebene Basis ist `docs/coordination/evidence/theme-palette-d692/dashboard-theme-palette-d692.patch`, SHA-256 `AAF1CF2705F3A0B63A0BE89D11BEBF18F3C439EACF08D56D4AE2C52FFD4448AA`. Der unveränderte ThemeLocaleFreeze wurde im Browserkandidaten zusätzlich angewendet; dessen SHA-256 ist `5AA5D005BC87DD2E275D3A5F467E1E52938130F97FA179C37A40C7DBEB75758B`.

## Erlaubte Oberflächen

Nur die bestehende Dashboard-Darstellung. Es wurden keine neuen öffentlichen Routen, Datenfelder, Socket-Ereignisse, Tunnel oder Schreibpfade eingeführt. Die lokale statische Review-Fixture beantwortet API- und Socket-Pfade mit 404 und blockiert externe Browseranfragen.

## Prüfungen

- Drei fokussierte Jest-Suites: **13/13 Tests PASS** (`dashboard-theme-palette`, `theme-manager-default`, `theme-selector-i18n`).
- `node --check` für den Browserrunner: **PASS**.
- Patch-Anwendbarkeit gegen saubere Dashboard-CSS des Basis-HEAD: **PASS**.
- Echter Edge-Browser auf einem isolierten lokalen statischen Assetserver; Kandidatenquellen: Basis-HEAD plus unveränderter Locale-Freeze plus Farbpatch. Die Dashboard-HTML, die geladenen Stylesheets und der ThemeManager stammen aus diesem Kandidaten. API-Backend und dynamische Produktionsdaten waren nicht angeschlossen; die Status-/Erfolgsbeispiele sind ausdrücklich synthetische Fixture-Elemente.
- Computed Style und Kontrast der Erfolgstext-Utility auf der Fixture-Karte: Day `#166534`, **7,13:1** auf Weiß; Night `#4ade80`, **9,58:1** auf dunkler Fläche; Cid `#4ade80`, **9,87:1** auf dunkler Fläche. Cid-Akzent bleibt Violett `#7c3aed`.
- Day-, Night- und Logo-Theme-Screenshots samt SHA-256 liegen unter `docs/coordination/evidence/theme-palette-d692/screenshots/`; Messwerte, Hashes und Servergrenze stehen in `manifest.json` und `browser-evidence.json`.

## Verbleibende Risiken und Grenzen

- Dies ist eine statische Dashboard-Asset-Fixture, keine vollständige Backend-, Installations-, OBS- oder Live-Abnahme. Es wurden keine API- oder Socket-Verträge geprüft.
- Der Inline-Style-Override zielt absichtlich auf die vorhandene Schreibweise `color: #22c55e`. Abweichende spätere Schreibweisen/Farbtöne brauchen eine eigene Prüfung.
- Der vorhandene Day-Theme-Quickcheck deckt damit keine anderen Dashboards oder Plugin-eigenen Dokumente ab.
- Keine Nutzer-App wurde neu gestartet; keine Veröffentlichung oder Push-Aktion.
