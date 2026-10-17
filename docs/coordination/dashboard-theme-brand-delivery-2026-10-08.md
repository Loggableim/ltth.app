# Dashboard-Themevertrag: Grün/Weiß/Violett

**Abschlussnotiz · 2026-10-08 · kein Commit/Push/Release**

## Änderung

- `app/public/css/themes.css`: die Day-/Night-/Cid-Akzent-, Fokus-, Chart- und Aktivfarben folgen jetzt dem Marken-Grün/Violett statt blauen Primärfarben. Primäraktionen verwenden das kontrastreiche dunkle Grün `--color-action-primary`, während helleres Grün für Akzent-/Erfolgsdarstellung erhalten bleibt. Aktive Navigation und Tabs verwenden den violetten Akzent. Der Theme-Umschalter nutzt Flächen-, Linien- und Akzenttokens statt fest eingebauter Navy-/Cyanfarben.
- Statusfarben bleiben semantisch: Verbindungserfolg ist dunkelgrün mit weißer Beschriftung; Fehler/Notstopp bleibt rot mit weißer Beschriftung; Warnung bleibt gelb. Gelb für Hochkontrast- und Sehfreundlichkeitsmodi bleibt erhalten.
- `app/public/js/theme-manager.js` sowie `app/locales/{de,en,es,fr}.json`: Day-/Night-Swatches und -Beschreibungen zeigen nun die grün-weiß-violette Brand-Richtung.
- `app/test/dashboard-theme-palette.test.js`: ergänzt kontrastberechnende Regressionen für Text/Fläche, Primary Action, aktive violette Fläche, Erfolgsgrün und Fehlerrot für `day`, `night` und `cid`. Zusätzlich prüft der Test die Theme-Swatches und die semantischen CSS-Tokens.

## Kontraststichprobe

Berechnet mit WCAG-2.x relativer Luminanz direkt aus den wirksamen CSS-Tokens. Alle sechs repräsentativen Paare je Theme liegen über 4,5:1:

| Theme | Haupttext/Fläche | Sekundärtext/Fläche | Weiß/Primäraktion | Weiß/Violett aktiv | Weiß/Fehlerrot | Marken-Grün/Grundfläche |
|---|---:|---:|---:|---:|---:|---:|
| Tag | 17,74:1 | 6,68:1 | 7,13:1 | 5,70:1 | 6,47:1 | 6,66:1 |
| Nacht | 15,44:1 | 8,01:1 | 7,13:1 | 5,70:1 | 6,47:1 | 10,66:1 |
| Cid | 15,78:1 | 7,95:1 | 7,13:1 | 5,70:1 | 6,47:1 | 10,83:1 |

Das ist eine Token-Stichprobe, kein Screenshot-Audit sämtlicher Inhalte/Plugins/Zustände. Die alternativen `vision-impaired`, `contrast` und `aurora-2` Themes behalten ihre eigenen Barrierefreiheits- bzw. Legacy-Paletten.

## Tests und Grenzen

- `npm test -- --runInBand test/dashboard-theme-palette.test.js test/dashboard-theme-accessibility.test.js test/theme-manager-default.test.js test/theme-selector-keyboard.test.js test/theme-selector-i18n.test.js` — **5 Suites, 39 Tests bestanden**. Die Tests laden auch alle vier Locale-Dateien und parsen `themes.css` mit PostCSS.
- `git diff --check` — keine Whitespace-Fehler in den geänderten Zielpfaden.
- `npm run i18n:check` blieb mehr als 60 Sekunden ohne Ausgabe aktiv und wurde abgebrochen; daher ist dieser separate Validator **nicht abgeschlossen**. Die geänderten Theme-Beschreibungen sind durch den fokussierten Locale-Test abgedeckt.
- `app/public/dashboard.html` und `app/public/css/navigation.css` blieben unberührt. Die zuvor vorhandenen Profil-/Event-Status-Hunks in `dashboard.html`, der Cockpit-Grid-Hunk in `navigation.css` sowie der bereits lokale Theme-Persistenz-Test-Hunk wurden erhalten.
- Ein vorhandener Inline-Farbwert `#60a5fa` im Profilstatus-Markup bleibt in dem unveränderten Dashboard-Hunk bestehen; er betrifft nicht die zentralen Dashboard-Theme-Tokens. Eine mögliche CSS-Übersteuerung dieses einzelnen Profilstatus-Felds wäre ein separater, scoped Folgeschritt.
