# Audit: Dashboard-Themevertrag Grün/Weiß/Violett und Tag/Nacht

**Stand:** 2026-10-08  
**Scope:** read-only Analyse des aktuellen Produkt-Dashboards und der lokalen Theme-/UI-Verträge. Keine Produktentscheidung und keine Änderung an Dashboard, CSS, Navigation oder Shared UI.

## Ergebnis

| Anforderung | Status | Evidenz / Einordnung |
|---|---|---|
| Grün, Weiß und Violett als erkennbare Markenpalette | **Teilweise** | Der Theme-Manager startet neue Installationen mit `cid`; dessen Auswahl zeigt Grün/Weiß/Violett als Swatches (`app/public/js/theme-manager.js:19-25`) und benennt das Theme als grün-violette Brand-Variante. Spätere gemeinsame Dashboard-Regeln führen Grün als Primärfarbe und `#7c3aed` als aktive Navigation/Tab-Farbe ein (`app/public/css/themes.css:1862-1877`, `1981-1992`). Weiß ist in Tag vor allem Kartenfläche und in Nacht Textfarbe; die Flächen bleiben absichtlich überwiegend neutral. Gleichzeitig enthalten frühere Day/Night-/Legacy-Token blaue Primärfarben, während der Endzustand sie in den unterstützten Dashboard-Themes teilweise überschreibt. Damit ist die Palette erkennbar, aber nicht durchgängig aus einem einzigen stabilen Tokenvertrag abgeleitet. |
| Sinnvolle Tag-/Nacht-Inversion | **Implementiert, mit begrenzten Legacy-Ausnahmen** | `day` setzt `color-scheme: light`, helle Flächen und dunkle Textwerte; `night` und `cid` nutzen dunkle Flächen mit hellem Text (`themes.css:158-182`, `239-278`, `307-355`, spätere Endregeln `1879-1945`). Die Theme-Auswahl speichert `dashboard-theme`, stellt vorhandene Wahl wieder her und synchronisiert `data-theme` auf Dokument/iframes (`theme-manager.js:50-65`, `376-441`). Einzelne ältere, hart codierte Farben bleiben Sonderfälle und müssen bei einer umfassenden visuellen Abnahme mitgesucht werden. |
| Tag-Kontrast zentral abgesichert | **Teilweise** | Lesbare Tagesfarben für Brand-Erfolgstext, Karten, Warnhinweis und Fokuszustände sind durch CSS und fokussierte Tests abgedeckt (`themes.css:2066-2119`; `dashboard-theme-palette.test.js`, `dashboard-theme-accessibility.test.js`). Die Tests prüfen hauptsächlich Selektoren/Token-Verwendung und keinen vollständigen gerenderten Kontrastkatalog aller 42 Dashboard-Views. |
| Theme-Bedienung per Tastatur und lokalisiert | **Implementiert und fokussiert getestet** | Der Manager erzeugt einen beschrifteten Button und eine `radiogroup` mit fünf Radio-Buttons, `aria-checked` und roving tabindex (`theme-manager.js:299-326`). Pfeiltasten, Enter/Leertaste, Escape, Fokus-Rückgabe und Schließen beim Verlassen sind implementiert (`theme-manager.js:134-200`). DE/EN/ES/FR-Labels werden geprüft. |

## Relevante Farbmessung

WCAG-2.x-Kontrastverhältnisse aus den aktuell gesetzten Tokenwerten (relative Luminanz; repräsentative Text-/Flächenpaare, keine Browser-Pixelmessung):

| Paar | Verhältnis | Bedeutung |
|---|---:|---|
| Tag: Haupttext `#17181c` auf Weiß `#ffffff` | 17,74:1 | klar über 4,5:1 |
| Tag: gedämpfter Text `#595c65` auf Weiß | 6,68:1 | klar über 4,5:1 |
| Tag: weißer Buttontext auf Brand-Grün `#166534` | 7,13:1 | klar über 4,5:1 |
| Nacht: Haupttext `#f5f6f8` auf `#111318` | 17,18:1 | klar über 4,5:1 |
| Nacht: gedämpfter Text `#aeb4bf` auf `#1b1e24` | 8,01:1 | klar über 4,5:1 |
| Violetter aktiver Nav-Hintergrund `#7c3aed` mit weißer Schrift | 5,70:1 | klar über 4,5:1 |
| Nacht: Brand-Grün `#4ade80` auf `#101114` | 10,83:1 | klar über 4,5:1 |

Diese Werte stützen nur die gelisteten Paare. Sie ersetzen keinen dynamischen DOM-/Screenshot-Kontrastlauf über alle Views, Zustände, Inline-Farben, Diagramme und Plugin-Ansichten.

## Theme-Steuerung und aktuelle lokale Hunks

- `app/public/dashboard.html:2674-2696` enthält die Topbar-Einfügestelle `.topbar-right`, Sprachwahl, Profil-, Settings- und Statussteuerungen. Der Theme-Manager fügt den Theme-Button vor Settings ein; sein dynamisches Markup ist nicht statisch in der HTML-Datei.
- Die Theme-Schaltfläche ist als Button mit `aria-label`, `aria-controls` und `aria-expanded` implementiert. Theme-Optionen sind benannte Radio-Elemente in einer Radio-Gruppe. `theme-selector-keyboard.test.js` und `theme-selector-i18n.test.js` prüfen Fokus-/Tastenverhalten und vier Locales.
- Im aktuellen Working Tree ist `app/public/css/navigation.css` geändert: ausschließlich das Grid-Verhältnis von `.dashboard-cockpit-grid` von `1.3fr / minmax(400px, .95fr)` zu `1.7fr / minmax(280px, .8fr)` (Zeile 1238). Das ist responsive Layout, keine Palette-Änderung.
- `app/public/dashboard.html` enthält bestehende lokale Hunks für das Profil-Lade-Label sowie Status-/Retry-Elemente im Event-Log und Profilbereich. Sie ändern den Theme-Vertrag nicht.
- `app/test/theme-manager-default.test.js` hat einen Working-Tree-Hunk, der Wiederherstellung gespeicherter `day`-/`night`-Auswahlen abdeckt. Er wurde mitgetestet und nicht verändert.
- `themes.css` und `theme-manager.js` selbst sind im gezielten `git status` sauber. Keine lokale Änderung wurde überschrieben oder zurückgesetzt.

## Minimaler Änderungspfad (Vorschlag, nicht ausgeführt)

1. Den aktiven Dashboard-Vertrag in `themes.css` als semantische Tokens für Marken-Grün, Violett-Akzent, neutrale Tag-/Nacht-Flächen, Text, Linien und interaktive Zustände festlegen. Für `day`, `night` und `cid` müssen die semantischen Rollen explizit und konsistent sein; Warnung/Fehler bleiben eigene Statusfarben.
2. Die vorhandenen späteren Overrides gezielt gegen frühere Legacy-Variablen und die sichtbaren Dashboard-Regeln abgleichen. Nur konkurrierende Farbwerte ersetzen; keinen Karten-/Layoutumbau und keine Änderung an bestehenden dirty hunks aufnehmen.
3. Tests von Regex-Vertragschecks um berechnete Kontrasttests repräsentativer Dashboard-Elemente in `day`, `night` und `cid` erweitern; mindestens Text/Fläche, Primäraktion, aktiver Nav-/Tab-Zustand, Fokus, deaktivierter Zustand und Erfolg/Warnung prüfen.
4. Theme-Manager- und Theme-Auswahlverhalten unverändert halten, außer wenn Tokenlabels/-Swatches absichtlich angepasst werden. Anschließend bestehende Keyboard-/I18n-/Persistenztests, Palette-/Accessibility-Tests, Dashboard-Screenshots bei 320/390/720 CSS-Pixeln und `npm run build:css` als Regressionen ausführen.

## Verifikation in diesem Audit

- `npm test -- --runInBand test/theme-manager-default.test.js test/theme-selector-keyboard.test.js` — **2 Suites, 17 Tests bestanden**.
- `npm test -- --runInBand test/dashboard-theme-palette.test.js test/dashboard-theme-accessibility.test.js test/theme-selector-i18n.test.js` — **3 Suites, 14 Tests bestanden**.
- Zusammen **5 fokussierte Suites / 31 Tests bestanden**. Keine komplette App-Suite, kein Browser-/Screenshot-Lauf und keine Laufzeitabnahme ausgeführt.
- `git status`/`git diff` der relevanten Pfade geprüft. Produktquellen und Produkt-Tests blieben unangetastet.
