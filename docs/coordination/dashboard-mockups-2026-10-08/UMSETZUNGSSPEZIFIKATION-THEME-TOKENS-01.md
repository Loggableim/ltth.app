# Umsetzungsspezifikation: Brand-Tokens für Richtung 01

Stand: 2026-10-08 · Design-/Implementierungsbrief, kein Code und keine Produktänderung

## Ziel

Richtung 01 („Creator-Überblick“) erhält ein semantisches LTTH-Theme aus Grün, Weiß und Violett. Grün führt primäre Aktionen und positive Live-Zustände; Weiß und neutrale Grünflächen tragen Lesbarkeit und Ruhe; Violett kennzeichnet Fokus, Fortschritt und sekundäre Aktionen. Der Tagmodus nutzt helle Flächen und dunklere Akzente, der Nachtmodus dunkle Flächen und hellere Akzente. Warnung, Fehler und Notstopp behalten ihre eigenen semantischen Farben.

Die Spezifikation zielt auf die vorhandenen CSS-Rollen in [`app/public/css/themes.css`](../../../app/public/css/themes.css) und den bestehenden Theme-Wechsel/-Speichervertrag in [`app/public/js/theme-manager.js`](../../../app/public/js/theme-manager.js). Sie verlangt keine Umbenennung gespeicherter Theme-IDs oder Änderung der Theme-Auswahl.

## Logo-Messung und vorgeschlagene Tokenwerte

Die Referenz ist `app/public/ltthlogo_daymode.png` (1916 × 821 px). Ich habe repräsentative, opake Pixelregionen der grünen H-Fläche, der violetten Maskenfläche und der weißen LTTH-Buchstaben gesampelt und innerhalb jeder Region die häufigsten Vollton-Pixel ermittelt. Das sind Rastermessungen aus diesem PNG, keine bestätigten Vektor-/Brand-Guidelines; Antialiasing und Farbverlauf erzeugen benachbarte Varianten.

| Token / Rolle | Startwert | Herkunft | Verwendung / Hinweis |
|---|---:|---|---|
| `--ltth-logo-green` | `#21683D` | **Gemessen:** häufigste solide Grünvariante im H-Bereich der Daymode-Logo-PNG. | Markenanker; nicht ungeprüft als Text- oder Füllfarbe für jede Fläche verwenden. Gegen Weiß gemessen: 6,75:1. |
| `--ltth-logo-violet` | `#552F84` | **Gemessen:** häufigste solide Violettvariante im Maskenbereich derselben PNG. | Markenanker für Links/sekundäre Akzente. Gegen Weiß gemessen: 9,88:1. |
| `--ltth-logo-white` | `#FDFDFD` | **Gemessen:** häufigste solide weiße Variante in den LTTH-Buchstaben. | Logo-weiß; neutrale UI-Flächen dürfen `#FFFFFF` verwenden, das ist ein **Vorschlag**, nicht dieselbe Pixelmessung. |
| `--ltth-ink` | `#090E18` | **Gemessen:** häufigster dunkler Rand-/Konturton des Logos. | Referenz für dunkle Kontur, nicht als verpflichtender Nachtflächenwert. |
| Tag-Hintergrund / Oberfläche | `#F4F8F5` / `#FFFFFF` / `#EDF5F0` | **Vorschlag:** aus Richtung 01; „Weiß“ dominiert, Mint ist eine leise Sekundärfläche. | Seitenhintergrund, Karten, leicht erhöhte Flächen. |
| Nacht-Hintergrund / Oberfläche | `#07130F` / `#0E211A` / `#142C22` | **Vorschlag:** aus Richtung 01; dunkle Grün-/Neutralstufen. | Seitenhintergrund, Karten und erhöhte Flächen. |
| Primäraktion Tag / Text darauf | `#10B981` / `#042116` | **Vorschlag:** Richtung 01, kontrastgeprüft 6,71:1. | Connect-/Start-CTA und aktive Auswahl. Für kleine grüne Textlabels stattdessen dunkleres Grün verwenden. |
| Primäraktion Nacht / Text darauf | `#33DC9B` / `#042116` | **Vorschlag:** Richtung 01, kontrastgeprüft 9,60:1. | Dieselbe Aktionsrolle in der Nacht, mit dunklem Text auf hellerem Grün. |
| Primärtext Tag / Nacht | `#17251D` / `#EFFAF3` | **Vorschlag:** Richtung 01, kontrastgeprüft 14,86:1 bzw. 17,71:1 auf den Seitenflächen. | Überschriften und Kerninhalte. |
| Sekundärtext Tag / Nacht | `#596F61` / `#9DB6A8` | **Vorschlag:** Richtung 01, kontrastgeprüft 5,06:1 bzw. 8,74:1 auf den Seitenflächen. | Beschreibungen und Hilfstexte; nicht weiter abdunkeln/aufhellen ohne erneute Messung. |
| Violett Tag / Nacht | `#6948BF` / `#B9A1FF` | **Vorschlag:** Richtung 01, kontrastgeprüft 6,40:1 auf Weiß bzw. 8,66:1 auf Nachtgrund. | Fokus, Links, Fortschritt und sekundäre Auswahl. Kein Fehler-/Erfolgsstatus. |

Die Kontrastwerte oben sind rechnerische Verhältnisse dieser konkreten Farbpaare. Sie ersetzen nicht den Test realer gerenderter Zustände einschließlich Hover, Disabled, Fokus, Inline-Status, Badge und unterschiedlicher Kartenoberflächen.

## Semantische Rollen

- **Markengrün:** primäre Handlung, aktiver Stream und positive Live-Aktivität. Für gefüllte Buttons und kleine Textlabels getrennte, kontrastgeprüfte Rollen verwenden; Text auf hellgrüner Buttonfläche ist dunkel.
- **Weiß und neutrale Flächen:** Tagmodus-Hauptfläche und Karten. Nachtmodus verwendet dunkle Grün-/Neutraltöne statt große weiße Flächen.
- **Violett:** sekundärer Markenakzent für Fokusindikator, Fortschrittsbalken, Links und ausgewählte Sekundärnavigation. Violett bleibt von primären Erfolgs-/Verbindungszuständen unterscheidbar.
- **Rot, Amber und weitere Statusfarben:** Fehler/Notstopp bleibt rot, Warnung bleibt Amber. Farbe nie als einziges Statussignal nutzen; Text/Icon/Statuslabel beibehalten.

Vorgeschlagene Aliasrollen, ohne Implementierungsdetails vorzuschreiben: `--brand-primary`, `--brand-primary-hover`, `--color-action-primary`, `--color-accent-primary`, `--color-accent-secondary`, `--color-bg-primary/secondary/tertiary/card/hover`, `--color-text-primary/secondary/muted`, `--color-border`, `--color-input-focus`, `--color-active-bg/border`, `--color-chart-primary/secondary`, `--color-accent-success/warning/danger`, `--color-focus-ring`. Bestehende Komponenten sollen diese semantischen Variablen verwenden statt neue harte Farbcodes zu erhalten.

## Tag-/Nacht-Regeln

1. Themewechsel invertiert Fläche und Text: Tag = helle/weiße Flächen + dunkle Schrift und Akzente; Nacht = dunkle Flächen + helle Schrift und hellere Akzente.
2. Die Rolle bleibt über den Modus stabil. Ein Connect-Button bleibt primär grün, ein Progress-/Linkakzent bleibt violett, ein Notstopp bleibt rot.
3. Helle Logo-Grün-/Violettwerte sind keine automatisch lesbaren Textfarben im Tagmodus. Dunklere Tag-Gegenstücke sind erforderlich. Die Umschaltung ist somit eine semantische Rollenabbildung, keine einfache Helligkeitsumkehr derselben RGB-Werte.
4. Fokus darf in keinem Theme durch Karten, Modals oder Sticky-Leisten verdeckt werden. Windows Forced Colors erhält sichtbaren Systemfarben-Fallback; Brand-Flächen dürfen dort nicht die Systemauswahl übermalen.
5. High-Contrast-/Vision-Impaired-Modi bleiben eigene, priorisierte Themes und werden nicht in die Brand-Tags/Nachtwerte gezwungen.

## Mapping auf Richtung 01

| Element in Konzept 01 | Tokenrolle |
|---|---|
| Kopfzeile und Status „Getrennt / bereit“ | Neutrale Fläche; Status mit Icon/Text und semantischem Verbindungszustand. Grün erst bei positivem/Live-Status. |
| Verbindungs-Hauptkarte und „Verbinden“ | Tag: weiß/mint Fläche, dunkles Grün als Rahmen/Label, grüner Button mit dunkler Schrift. Nacht: dunkle Grünfläche, hellgrüner Button mit dunkler Schrift. |
| sechs KPI-Werte | Karten neutral halten; Zahlen/Label primärtextlich. Violett sparsam auf Sekundärmetrik/Trend, Grün für Live-Daten/positive Änderung. Alle sechs Werte behalten ihre eigene Beschriftung. |
| Ziel-/Fortschrittsblock | Violetter Fortschritt, grüne erreichte/positive Werte; Zahl plus beschreibendes Label, kein alleiniger Farbcode. |
| Schnellzugriffe | Häufigste Primäraktion grün; übrige Aktionen neutral. Violett kennzeichnet sekundären Fokus/ausgewählte Aktion. |
| Nav-Verzeichnis und aktiver Bereich | Grün für aktive/priorisierte Position; Violetter Fokus-Ring; Closed-Beta-Badges bleiben Statuskennzeichen und keine Installations-CTAs. |
| Fehler/Notstopp | Bestehende Rotrolle, klare Textbestätigung und semantische Gefahrkennzeichnung; nicht auf Marken-Violett oder Grün umstellen. |

## Abnahmekriterien

- Normaler Text: mindestens 4,5:1; großer Text: mindestens 3:1. UI-Grenzen, wichtige Icons und Zustandsindikatoren: mindestens 3:1 zu angrenzenden Farben. Das entspricht den Schwellen der WCAG-2.2-Kriterien 1.4.3 und 1.4.11 ([W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- Alle interaktiven Elemente besitzen einen durchgängigen, sichtbaren Fokus-Ring von mindestens 3 CSS-Pixeln; vorgeschlagene Fokusfarbe: Violett (Tag `#6948BF`, Nacht `#B9A1FF`) mit mindestens 3:1 Kontrast zur unmittelbar angrenzenden Fläche. Das ist ein Produkt-Abnahmewert; es ist kein Anspruch, damit allein jedes WCAG-Fokus-Kriterium zu erfüllen. Fokus bleibt auch bei 200-%-Zoom und 320 CSS-Pixeln sichtbar.
- Tag/Nacht-Checks decken normale/aktive/hover/focus/disabled/error/success/empty states und die angrenzenden Karten-/Dialogflächen ab. Kontrast wird aus den tatsächlich gerenderten Farben automatisiert berechnet und durch Sichtprüfung ergänzt.
- Forced Colors: Tastaturfokus, aktive Navigation, Fehler und Status bleiben durch Systemfarben/Formen/Labels erkennbar; kein Status hängt ausschließlich von Grün/Violett ab.
- Tests laufen auf 320, 390, 720 und 1440 CSS-Pixeln, mindestens DE/EN/ES/FR, mit Bildschirmzoom 200 %. Themeauswahl bleibt nach Reload erhalten; keine neue Speicherung oder Änderung des bestehenden Theme-ID-Vertrags.

## Schrittweiser, rückbaubarer Plan

1. **Baseline sichern:** aktuelle Themeauswahl, Screenshots, Kontrasttest und Tokens erfassen. Bereits vorhandene Änderungen in `themes.css`, Theme-Manager und betroffenen Styles vor Eingriff separat prüfen und erhalten.
2. **Nur Tokenebene ergänzen:** Brandanker und Tag-/Nachtrollen an einer klar begrenzten Standard-Theme-Regel definieren; bestehende CSS-Variablennamen zunächst als Alias beibehalten. High-Contrast-Themes und Theme-IDs unberührt lassen.
3. **Konzept 01 als Pilot:** zuerst Header, Verbindungskarte und Connect-Aktion auf Tokenrollen umstellen. Tag/Nacht, Fokus, Hover, Disabled und Kontrast prüfen; Screenshotvergleich dokumentieren.
4. **In kleinen Gruppen migrieren:** danach KPI-/Zielkarten, Schnellzugriffe und Navzustände jeweils separat umstellen. Pro Gruppe Kontrast- und Screenshotregression ausführen; keine Navigation-/Backendlogik mitändern.
5. **Abnahme:** alle in „Abnahmekriterien“ genannten Modi, Zustände, Viewports und Locales prüfen. Erst danach weitere Dashboards/Plugins für dieselben Tokenrollen einplanen.
6. **Rückbau:** bei Problemen die neuen Aliaswerte bzw. ihre Themezuordnung entfernen und auf den gesicherten Tokenstand zurücksetzen. Komponenten-/Datenlogik bleibt dabei unangetastet.

**Offene Entscheidung:** Die aus dem PNG gemessenen Anker sind belastbare Stichproben, aber nicht von einem bereitgestellten Vektor-Brandguide bestätigt. Vor produktiver Farbfreigabe sollte die Marke die finalen Ankerwerte bestätigen. Die Tag-/Nachtwerte und semantische Rollen oben sind ein kontrastgeprüfter Startvorschlag aus Mockup 01.
