# Dashboard-Theme: Audit verbleibender Blau-/Cyan-Akzente

Stand: 2026-10-08

## Ergebnis

Die auswählbaren Marken-Themes Day, Night und CID haben keine hartcodierten blauen Akzent-, Fokus- oder Status-Tokens mehr. Im weiterhin auswählbaren `contrast`-Theme lagen dagegen zentrale Tokens für Akzent, Fokus, Diagramm, Glow, Verlauf und Aktivzustand noch auf Blau. Diese Tokens sind in `app/public/css/themes.css` jetzt auf Grün (`#14c91f`) und Violett (`#a78bfa`) umgestellt; der aktive Kontrasthintergrund ist violett. Die bestehenden grünen Erfolgs- und roten Fehler/Notstopp-Farben bleiben unverändert.

Eine Regression in `app/test/dashboard-theme-palette.test.js` kontrolliert die Kontrast-Theme-Tokens direkt im CSS-Block. Die Prüfung nutzt bewusst nicht den allgemeinen Token-Helper, der auch `:root`-Deklarationen auf ein einzelnes Theme projiziert.

## Verbleibende Treffer und Scope

- `themes.css`: Cyan-Akzente `#22d3ee`/`rgba(34, 211, 238, ...)` verbleiben ausschließlich in Aurora-2 sowie in dekorativen Aurora-/Fallback-Regeln. Diese alternativen, nicht dem aktuellen Day/Night/CID-Markenvertrag zugeordneten Dekorationen wurden nicht geändert.
- `themes.css`: Utility-Selektoren mit Namen wie `bg-blue-500` sind keine festgelegten blauen Farben. Die Marken-Themes überschreiben diese Klassen bereits über semantische Aktions-Tokens; Kontrast-/Vision-Impaired-Modi verwenden gelbe, kontrastreiche Aktionen.
- `dashboard.html` (geschützter, bereits dirty): blaue API-Key-Links/Infoflächen und die Inline-Profilfarbe `#60a5fa` bleiben. Keine Änderung an der Datei.
- `navigation.css` (geschützter, bereits dirty): blaue/cyan Akzente u.a. in Status-/Stats- und Navigationskomponenten bleiben. Keine Änderung an der Datei.
- `theme-manager-default.test.js` (geschützter, bereits dirty): keine Änderung an der Datei.

Die verbleibenden Dashboard-/Navigationsfarben sind daher offene, außerhalb dieses sicheren CSS-Variablenpfads liegende Befunde und wurden nicht als gelöst ausgegeben.

## Validierung

- `npm test -- --runInBand test/dashboard-theme-palette.test.js test/theme-manager-default.test.js test/theme-selector-keyboard.test.js test/theme-selector-i18n.test.js`: **4 Suites, 35 Tests bestanden**.
- `git diff --check -- public/css/themes.css test/dashboard-theme-palette.test.js`: bestanden; Git meldet lediglich die bekannte CRLF-Konvertierungswarnung für die Arbeitskopie.
- Keine Releases, Commits oder Veröffentlichungen.
