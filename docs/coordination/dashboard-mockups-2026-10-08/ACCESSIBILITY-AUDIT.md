# Accessibility- und Usability-Audit

Stand: 8. Oktober 2026. Geprüft wurden ausschließlich die drei lokalen HTML-Mockups mit Edge/Playwright und synthetischen Inhalten. Es wurden keine Repo-Dateien verändert. Das ist ein gezielter Frontend-Audit, keine vollständige WCAG-Zertifizierung oder assistive-Technologie-Nutzerprüfung.

## Kurzbefund

Alle drei Entwürfe haben eine sinnvolle Hauptüberschrift, nachvollziehbare Dokumentensprache (`de`), native Buttons und eine klare Hauptregion. Bei 390 px und im 200%-Zoom-Näherungswert von 720 CSS-Pixeln war kein horizontaler Überlauf sichtbar. Bei sehr schmalen 320 px laufen Mockup 01 und 03 jedoch horizontal über. In den Tag-Themes verfehlen mehrere kleine Akzenttexte den üblichen AA-Kontrastwert von 4,5:1. Die Standard-Tastaturfokusanzeige ist in Nachtansichten sehr dunkel und dünn.

## Befunde je Mockup

### 01 – Creator-Überblick

- **Tastatur:** Reihenfolge läuft vom Tag-/Nacht-Schalter über Verbindung, Ziele und Schnellzugriffe bis zum Ereignisprotokoll. Das ist nachvollziehbar. Der Einstellungen-Knopf wird bei schmalen Ansichten ausgeblendet; er verschwindet auch aus der Tab-Reihenfolge.
- **Fokus:** Browser-Standard ist `1px auto` in Schwarz. Auf der dunklen Oberfläche ist das schwer zu erkennen; es fehlt ein eigener `:focus-visible`-Stil.
- **Kontrast:** Nachtmodus ist in den geprüften Textpaaren deutlich ausreichend. Im Tagmodus betragen die kleinen KPI-Werte 3,86:1 und KPI-Beschriftungen 4,42:1. Beides liegt unter 4,5:1. Die grünen Eyebrow-Texte liegen bei 3,99:1.
- **Reflow:** Bei 320 px beträgt die Dokumentbreite 341 px. Die zweite Spalte der Schnellzugriffskarten reicht bis 341 px. Bei 390 px und 720 px bleibt das Layout innerhalb der Viewportbreite.
- **Semantik/Bediennamen:** H1 und Abschnittsüberschriften sind vorhanden. Theme- und Settings-Buttons haben zugängliche Namen; die übrigen Aktionen sind durch ihren sichtbaren Text benannt. KPI-Werte sind visuell gruppiert, aber nicht als Definitionliste ausgezeichnet.

### 02 – Live-Konsole

- **Tastatur:** Die Tab-Reihenfolge folgt der Icon-Navigation, den Kopfaktionen, Verbinden, Schnellaktionen und Protokoll. Die Icon-Buttons besitzen zugängliche Labels.
- **Fokus:** Wie bei den anderen Entwürfen bleibt es beim dunklen, dünnen Browser-Standardrahmen.
- **Kontrast:** Nachtmodus ist bei den geprüften Paaren ausreichend. Im Tagmodus verfehlen kleine Eyebrow-Texte 4,5:1 (3,99:1). Der Text auf dem grünen Verbinden-Button erreicht 3,88:1.
- **Reflow:** Bei 320, 390 und 720 px blieb die Seitenbreite innerhalb des Viewports. Unter 900 px wandert die Statusspalte unter den Hauptinhalt.
- **Semantik/Bediennamen:** Eine H1, thematische H2s, `main` und benannte Navigation sind vorhanden. Der Theme-Schalter hat nur das Symbol „☼ / ☾“ als Namen; ein klarer zugänglicher Name und Zustandswert fehlen. Das Beispiel-SVG des Diagramms hat einen zugänglichen Namen, sollte für zuverlässige Ausgabe aber explizit als Grafik (`role="img"`) ausgewiesen werden.

### 03 – Arbeitsbereiche

- **Tastatur:** Die sichtbare Navigation ist in der Desktop-DOM-Reihenfolge vor den Hauptinhalt gesetzt; auf Mobilgeräten ist die ausgeblendete Seitenleiste nicht tab-fokussierbar. Die Hauptaktionen folgen danach. Diese Reihenfolge ist verständlich.
- **Fokus:** Browser-Standard `1px auto` in Schwarz; auf dunklen Flächen nicht zuverlässig sichtbar.
- **Kontrast:** Nachtmodus ist bei den geprüften Paaren ausreichend. Im Tagmodus liegen Eyebrow-Texte bei 4,07:1. Links und sekundäre Texte erreichen die AA-Schwelle.
- **Reflow:** Bei 320 px beträgt die Dokumentbreite 341 px; die rechte KPI-Spalte „Münzen“ läuft bis 341 px. Bei 390 px und 720 px gab es keinen Überlauf.
- **Semantik/Bediennamen:** H1 und Abschnittsüberschriften sind vorhanden. Das Seitenmenü nutzt `<nav>`, aber ohne Namen, obwohl es als Arbeitsbereichsnavigation dient. Die drei Links „Bereich öffnen“ haben identische zugängliche Namen und `href="#"`; Screenreader können das Ziel nicht unterscheiden und die Links springen nur an den Seitenanfang. Der Theme-Schalter hat keinen aussagekräftigen zugänglichen Namen.

## Gemeinsame minimale Empfehlungen

1. **Sichtbaren Fokus ergänzen:** für Buttons und Links ein klares `:focus-visible` mit mindestens 2–3 px Außenkontur und Abstand definieren. Ein kontrastreiches Violett oder eine zweifarbige Kontur funktioniert in beiden Themes besser als der schwarze UA-Rahmen.
2. **Tagfarben für kleinen Text abdunkeln:** Grün als Flächenakzent beibehalten, aber für kleine Beschriftungen/Statuswerte einen dunkleren Textton wählen, der mindestens 4,5:1 auf der jeweiligen hellen Fläche erreicht. In Mockup 02 zusätzlich Button-Hintergrund oder Button-Text so anpassen, dass der Text mindestens 4,5:1 erreicht.
3. **320-px-Reflow korrigieren:** In Mockup 01 das Zweier-Aktionsraster unter etwa 360 px auf eine Spalte stellen oder Spalten mit `minmax(0, 1fr)` und Umbruch absichern. In Mockup 03 KPI-Raster/Metricbar unter derselben Breite umbrechen oder gleichmäßig schrumpfen lassen.
4. **Navigation und Links benennen:** Mockup 03 erhält einen Namen für die Seiten-`nav`; „Bereich öffnen“ sollte etwa „Stream & Ziele öffnen“, „Audio & Sprache öffnen“ und „Visuals öffnen“ heißen und auf echte Ziele zeigen. Für alle Theme-Schalter einen sprechenden zugänglichen Namen und den aktuellen Zustand (`aria-pressed` oder einen aktualisierten Namen) angeben.
5. **Daten und Grafik semantisch kennzeichnen:** KPI-Labels/-Werte als `<dl><dt><dd>` strukturieren; das SVG-Diagramm mit `role="img"` und passender zugänglicher Beschreibung auszeichnen.

## Geprüfte Größen und Interaktionen

- Viewports: 320 × 800, 390 × 844, 720 × 900 und 1440 × 1000 CSS-Pixel.
- 720 CSS-Pixel wurden als Näherung für 200 % Zoom auf einem 1440 CSS-Pixel breiten Desktop verwendet; dieser Reflow war bei allen drei Dateien ohne Überlauf. Browser-Zoomverhalten wurde nicht über die native Browseroberfläche umgestellt.
- Tab-Navigation wurde durchlaufen; Theme-Schalter sind native Buttons. Im vorherigen Rendering-Check wurde der Modus bei allen drei Mockups erfolgreich von Nacht auf Tag umgeschaltet.
- Kontrastwerte sind rechnerisch aus den gerenderten CSS-Farben und den jeweils nächsten deckenden Hintergrundflächen bestimmt; Grenzfälle sollten nach einer Farbkorrektur nochmals geprüft werden.

## Status nach der Folgeiteration

Die obigen Mängel dokumentieren den Erststand. Danach wurden die Mockups im Tempordner überarbeitet: 320-px-Überläufe behoben, Tagtextfarben einschließlich Primärbuttons auf mindestens 4,5:1 angepasst, sichtbare 3-px-Fokusringe ergänzt und Theme-Schalter mit zugänglichem Namen plus aria-pressed versehen. Richtung 03 hat nun ein benanntes Hauptmenü und eindeutige Sprunglinks. Erneute Edge/Playwright-Prüfungen bei 320, 390 und 720 CSS-Pixeln ergaben für alle Dateien keine horizontalen Überläufe oder JavaScript-Fehler; alle gemessenen Tagtextpaare lagen über 4,5:1. Der Fokusrahmen war nach Tastaturbedienung sichtbar. Die drei Bereichslinks und der Ereignislink zeigen jeweils auf existierende Ziele.
