# Dashboard theme accessibility review — 2026-10-07

## Ergebnis

**Behoben und lokal geprüft:** Day-Statistikflächen, Runtime-Zeilenumbruch, Tastaturfokus des Username-Felds sowie lesbare Security-Warning und Tunnel-Fehlermeldung. Die Prüfung verwendet das originale Dashboard-HTML/CSS im isolierten lokalen Browser.

**Teilweise geprüft:** Hover-, Disabled-, Fokus-, Warning- und Fehlerzustände wurden in Computed Styles geprüft. Day/Night/Cid wurden bei Statistik, Warning und Fehler ausgewertet; Tab-Fokus wurde in Day durchlaufen.

**Nicht geprüft:** App-Backend, tatsächliche Provider-/Tunnelmeldungen, OBS, öffentlicher Zugriff und Livebetrieb. Das ist keine öffentliche oder OBS-Abnahme.

## Befund und Umsetzung

- Day-Statistiken hatten einen dunklen Overlay-Hintergrund (`rgba(8, 17, 31, .62)`) bei gleichzeitig dunklem `--color-text-muted`. Day-`.stat-card` nutzt jetzt die bestehenden hellen Karten- und Rahmen-Tokens. Die effektive Kontrastmessung über die Elternflächen ergibt für die Labels Day **6,68:1**, Night **8,71:1**, Cid **8,47:1**.
- Bei 1400×1000 wurde der Runtime-Wert in einem 76 px breiten Inhalt auf mehrere Zeilen umbrochen. Der Wert passt sich nun auf **14 px** an und bleibt einzeilig. Für `23:59:59` wurden in allen drei Themen **15,39 px Höhe**, `clientWidth=76` und `scrollWidth=76` gemessen.
- Die Day-Security-Warning kombinierte gelbe Akzenttexte mit einer hellen, gelb getönten Fläche. Der Titel verwendet dort jetzt dunkles Warnungsbraun; die Beschreibung den vorhandenen Primärtexttoken. Nach Alpha-Komposition des Warnungshintergrunds: Titel Day **4,93:1**, Beschreibung **12,76:1**; Night **9,85:1 / 10,23:1**; Cid **10,16:1 / 10,56:1**.
- Die Tunnel-Fehlermeldung verwendete `text-red-400` auf der dunklen Fläche `#374151` und erreichte **3,73:1**. Sie verwendet jetzt in Day/Night/Cid `#fecaca`: **7,12:1**.
- Das Username-Feld verlor durch `outline: none` seine solide Tastatur-Fokusmarkierung. Für `:focus-visible` wird eine aktuelle Textfarben-Kontur gesetzt. Der echte Tab-Lauf in Edge ergab eine sichtbare solide **3-px**-Kontur; der Screenshot zeigt das fokussierte Feld.
- Die Connect-Hoverprobe war in allen Themen aktiv: weißer Text auf Brandgrün `#166534`. Der native Disconnect-Button bleibt disabled und gedimmt (`opacity: .5`); dafür war keine Änderung erforderlich.
- Dashboard-Überschrift, Sidebar und Runtime verwenden im Browser denselben System-Sans-Serif-Stack. Der vermutete Serif-Unterschied ließ sich nicht reproduzieren und erhielt daher keine Änderung.

## Geänderte Dateien

- `app/public/css/themes.css` — enge Day-Stat-/Warning-Regeln, einzeiliger Runtime-Wert und lesbare Tunnel-Fehler-/Fokuszustände.
- `app/test/dashboard-theme-accessibility.test.js` — Regressionstests für diese CSS-Verträge.
- `docs/coordination/evidence/dashboard-accessibility-d692/measure-accessibility.cjs` und `measurements.json` — isolierter Browserrunner und Computed-Style-/Kontrastbelege.
- Screenshots und Hashes stehen in `docs/coordination/evidence/dashboard-accessibility-d692/manifest.json`.

Der vorhandene fremde Grid-Hunk in `app/public/css/navigation.css` blieb unverändert. Die vorhandene Palette-Änderung AAF1 und Theme-Locale-Freeze 5AA5 blieben im Kandidaten erhalten.

## Oberfläche und Grenzen

Es wurden keine Routes, Datenfelder, HTTP-/Socket-Events, Overlay-Allowlist-Einträge, Schreibzugriffe oder Tunnel ergänzt. Geändert wurde ausschließlich die Dashboard-Darstellung und deren fokussierter CSS-Test.

Der Browserrunner servierte nur Kandidatenassets über Loopback. `/api/*` und `/socket.io/*` lieferten 404; ein inertes `io`-Stub verhinderte Backend-Verbindungsversuche. Es gab **0 externe Requests und 0 Pageerrors**. Die Runtime-, Warning- und Fehlertexte in den Sichtzuständen sind synthetische Prüfwerte; HTML, CSS, Navigation und Stat-Karten sind die Originale des Kandidaten.

Der Kandidat liegt unter:

`C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\docs\coordination\evidence\dashboard-accessibility-d692\candidate-root\app`

Er basiert auf `d6926770b71a53b7b02938a55e2b1eff4adba491` mit unverändertem Theme-Locale-Freeze 5AA5, Palette-Patch AAF1 und den hier dokumentierten Korrekturen. Die fokussierten Jest-Suites liefen dort: **4 Suites / 18 Tests PASS**. Der Kandidatenpfad eignet sich für den geforderten lokalen Root-Jest-Lauf; `app/node_modules` wird dabei per lokalem Junction bereitgestellt.

Wiederholung der fokussierten Suites:

```powershell
Set-Location 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\docs\coordination\evidence\dashboard-accessibility-d692\candidate-root\app'
npm test -- --runInBand test/dashboard-theme-accessibility.test.js test/dashboard-theme-palette.test.js test/theme-manager-default.test.js test/theme-selector-i18n.test.js
```

## Verifikation

- Kandidaten-Jest: **4/4 Suites, 18/18 Tests PASS**.
- `node --check` für den Browserrunner: **PASS**.
- Scoped `git diff --check` für CSS und Test: **PASS**; Git meldet nur die bestehende LF→CRLF-Hinweiszeile.
- Statischer Loopback-Browser bei 1400×1000: Stylesheets vollständig geladen, keine externen Requests/Pageerrors; Computed Styles und Kontraste dokumentiert in `measurements.json`.
- Screenshots: Day-Statistiken, Tastaturfokus, Security-Warning und Tunnel-Fehler. Ihre SHA-256-Werte stehen im Manifest.

Kein Produktserver, Tunnel, OBS oder Livebetrieb wurde gestartet. Es gab keine Veröffentlichung, keinen Push und keinen Nutzerprozess-Neustart.
