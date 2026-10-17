# Dashboard responsive source review — 2026-10-07

## Befund und Umsetzung

Der Dashboard-Quellstand wurde bei 1280×720, 1024×768 und 390×844 in DE/EN/ES/FR sowie Day/Night/Cid geprüft (36 Kombinationen). Der Messlauf fand zwei reproduzierbare Responsive-Probleme:

- Bei Tablet und Mobile waren Sidebar-Links nach dem visuellen Wegschieben noch 17 Tab-Stopps lang erreichbar. Die geschlossene Sidebar ist jetzt während der Transform-Animation `visibility: hidden`; beim Öffnen wird sie sichtbar. Der echte mobile Menüknopf bleibt der Öffnungspfad.
- Bei 390 px begann das Theme-Menü bei x=-13 px und war links abgeschnitten. Bis 480 px ist die Dropdown-Breite jetzt auf 230 px beziehungsweise die verfügbare Viewportbreite minus 1 rem begrenzt. Das Menü bleibt rechts am Theme-Schalter ausgerichtet und vollständig im Viewport.

Die Nachmessung ergab 36/36 Fälle ohne horizontalen Dokumentüberlauf, mit einzeiligem Runtimewert, vollständig im Viewport liegendem Theme-Menü und ohne abgeschnittene Beschreibungen. Die geschlossene Sidebar hatte bei 1024 px und 390 px jeweils null Offscreen-Tabstopps.

Die dynamisch erzeugten `.theme-option`-Elemente sind weiterhin `div`-Elemente mit `role=null` und `tabIndex=-1`; sie werden nicht über die Tastatur erreicht. Das erfordert semantisches HTML und Tastaturereignisse in `theme-manager.js`. Da dieser Auftrag CSS/token-only-Fixes freigab, bleibt diese Lücke offen und wird nicht durch einen CSS-Trick kaschiert.

## Geänderte Dateien

- `app/public/css/navigation.css` — Sichtbarkeit der mobilen Sidebar an ihren offenen Zustand gekoppelt; der bestehende fremde Grid-Hunk blieb unangetastet.
- `app/public/css/themes.css` — Theme-Dropdown für Viewports bis 480 px begrenzt.
- `app/test/dashboard-responsive-accessibility.test.js` — CSS-Vertragstests für beide Responsive-Korrekturen.
- `docs/coordination/evidence/dashboard-responsive-20261007/responsive-review.cjs` — reproduzierbarer lokaler Browser-Matrixlauf.
- `docs/coordination/evidence/dashboard-responsive-20261007/responsive-measurements.json` und `screenshots/` — Messungen und 36 Screenshots samt SHA-256.
- `docs/coordination/evidence/dashboard-responsive-20261007/patches/` und `chain.json` — vierstufige Patchkette mit Bases, Hashes und Apply-Beleg.

## Erlaubte öffentliche Oberflächen

Keine öffentliche Oberfläche wurde ergänzt oder verändert. Der isolierte Browserlauf erlaubte nur GET/HEAD auf Kandidatenassets und exakt `/api/i18n/translations/{de|en|es|fr}` aus den lokalen Locale-JSON-Dateien. Alle anderen `/api/*`- und `/socket.io/*`-Pfade sowie alle weiteren Methoden wurden mit 404 beantwortet. Ein `io`-Stub verhinderte Backend-Verbindungen.

Das Browser-Subprocess-Netzwerk durfte in dieser Umgebung keine Loopback-Sockets öffnen (`ERR_NETWORK_ACCESS_DENIED`). Deshalb erfüllte Playwright jede lokale URL vor dem Socket direkt aus dem statischen Kandidatenverzeichnis; der gestartete Loopback-Fallback erhielt keine Browserrequests. Es gab null externe Requests und null Pageerrors. Das ist reproduzierbare lokale Asset-/Source-Prüfung, keine Serverintegration.

## Prüfungen

- Fokussierte Jest-Suites: **5 Suites / 20 Tests PASS** (`dashboard-responsive-accessibility`, `dashboard-theme-accessibility`, `dashboard-theme-palette`, `theme-manager-default`, `theme-selector-i18n`). Jest benötigte einmalige Ausführung außerhalb des restriktiven Sandbox-Temp-Zugriffs, da `fs.realpath` für alle Sandboxpfade mit `EPERM` endete.
- Browsermatrix: **36/36 Kombinationen**, 36 Screenshots, null horizontale Überläufe, null Theme-Textüberläufe, einzeiliger Runtimewert in allen Fällen, Theme-Menü in allen Fällen innerhalb der Viewportgrenzen, null Offscreen-Tabstopps in der geschlossenen Tablet-/Mobile-Sidebar.
- Browserumgebung: null externe Requests, null Pageerrors; Inhalte über lokale Dateien und Playwright-Requestinterception geladen.
- Patchserie rückwärts entfernt und anschließend vorwärts geprüft und angewendet: **PASS**. Details und SHA-256 stehen in `evidence/dashboard-responsive-20261007/chain.json`.

## Grenzen und Risiken

- Die Theme-Optionen bleiben mit der Tastatur unerreichbar; für die Behebung ist eine freigegebene semantische/JavaScript-Änderung an `theme-manager.js` nötig.
- Der Browser konnte keinen echten Loopback-HTTP-Socket öffnen; geprüft wurde der originale HTML/CSS/JS-Quellstand über lokale Playwright-Fixtures.
- Keine Prüfung des Produktbackends, eines öffentlichen Tunnels, OBS oder TikTok-LIVE. Dies ist keine öffentliche oder OBS-Liveabnahme.
- Keine Veröffentlichung, kein Push und kein Neustart von Nutzerprozessen.
