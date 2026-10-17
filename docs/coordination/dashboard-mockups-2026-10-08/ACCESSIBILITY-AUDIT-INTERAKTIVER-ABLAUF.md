# Accessibility-Audit: interaktiver Offline→Verbunden→Live-Ablauf

**Prüfumfang:** 01-overview.html, 02-live-console.html, 03-workspaces.html, lokale Edge-/Playwright-Läufe am 8. Oktober 2026. Geprüft wurden Tastaturfokus und Aktivierung, DOM-/ARIA-Rollen und Namen, Statusaktualisierung, Fokusindikator sowie Textkontrast der neuen Demo-Steuerung in Tag und Nacht. Es wurde kein Screenreader automatisiert oder manuell abgehört; Aussagen zum Screenreader beziehen sich auf den DOM/ARIA-Baum, nicht auf reale Sprachausgabe. Keine Produktdateien wurden geändert.

## Ergebnis nach Prüfkriterium

| Prüfkriterium | 01 – Creator-Überblick | 02 – Live-Konsole | 03 – Arbeitsbereiche |
|---|---|---|---|
| Native Tastaturbedienung | Drei Statusbuttons sowie Theme-/Einstellungsbuttons sind per Tab erreichbar; Enter/Space wechseln den Status. | Statusbuttons und Theme-Schalter sind native Buttons und per Tab/Enter/Space bedienbar; Navigation liegt davor. | Statusbuttons und Theme-Schalter sind native Buttons; Seitenleisten-Navigation liegt im DOM vor ihnen. |
| Fokusreihenfolge | Header → Theme → Einstellungen → Offline → Verbunden → Live → Seiteninhalt. Logisch, aber der Demo-Abschnitt liegt außerhalb des Main-Landmarks. | Navigation → Theme/Einstellungen → Offline → Verbunden → Live → Seiteninhalt. Reihenfolge folgt DOM-Aufbau. | Seitenleisten-Navigation → Theme/Einstellungen → Offline → Verbunden → Live → Seiteninhalt. Reihenfolge folgt DOM-Aufbau. |
| Sichtbarer Fokus | :focus-visible zeigt an Theme- und Statusbuttons eine durchgezogene 3-px-Kontur. | Gleiches Ergebnis. | Gleiches Ergebnis. |
| Statusgruppe | role="group" mit zugänglichem Namen; drei Buttons tragen aria-pressed und sichtbare, eindeutige Namen. | Gleiches Ergebnis. | Gleiches Ergebnis. |
| Statusmeldung | role="status" plus aria-live="polite"; Statuswortlaut ändert sich bei Auswahl. KPI-Liste ändert sich außerhalb der Live-Region. | Gleiches Ergebnis. | Gleiches Ergebnis. |
| Theme-Schalter | aria-label="Darstellung umschalten" plus aria-pressed; Umschalten ist aus DOM-Zustand erkennbar. | Gleiches Ergebnis. | Gleiches Ergebnis. |
| Tag-/Nacht-Kontrast | Alle geprüften normalen Textpaare in der Demo-Steuerung liegen über 4,5:1. | Alle geprüften normalen Textpaare über 4,5:1. | Alle geprüften normalen Textpaare über 4,5:1. |

## Reproduzierbare Prüfungen und Zahlen

Lokal mit Playwright/Edge geöffnet. Für jede Datei wurde per Tab die Fokusfolge geprüft. Statusbuttons ließen sich mit Tastaturfokus per **Space** (Offline) und **Enter** (Verbunden) aktivieren; die aria-pressed-Werte aktualisierten sich entsprechend. Eine getrennte Zustandsprüfung bestätigte alle drei Optionen. Es traten keine JavaScript-Fehler auf.

Textkontraste wurden aus den berechneten CSS-Farben der Bedienelemente und Texte gegen ihren nächsten deckenden Hintergrund nach WCAG-Formel berechnet. Geprüfte Selektoren: Demo-Titel und Hilfstext, unselektierter/selektierter Statusbutton, Statusmeldung, gemeinsame Kennzahlenliste und Theme-Schalter. Niedrigster gemessener Wert im Tagmodus lag bei **5,42:1** (01), **5,54:1** (02) und **6,07:1** (03). Niedrigster Wert im Nachtmodus lag bei **7,75:1** (01), **7,42:1** (02) und **7,30:1** (03). Selektierte grüne Statusbuttons lagen bei mindestens **6,69:1** in Tag und **9,58:1** in Nacht. Sichtbare Fokusrahmen: **3 px solid**. Diese Werte betreffen die Demo-Steuerung, nicht automatisch jedes bestehende Element der drei Seiten.

### DOM-/ARIA-Stichprobe

Für alle drei Seiten bestätigt:

- Genau ein <main>-Landmark.
- Demo-Auswahl ist eine benannte Gruppe mit drei nativen Buttons.
- Jeder Zustandsbutton besitzt im Ruhezustand aria-pressed; nach Interaktion ist genau ein Status als gedrückt markiert.
- Statuszeile hat role="status" und aria-live="polite".
- Theme-Button hat aria-label und aria-pressed.
- Live-Region und Kennzahlenwerte werden beim Statuswechsel im DOM aktualisiert.

Abweichung: In Richtung 01 liegt .demo-flow **außerhalb** des einzigen <main>-Elements. Somit wird der zentrale Demo-Ablauf nicht Teil des Main-Landmarks. In allen drei Dateien folgt der Titel der Demo-Steuerung als <h2> **vor** dem ersten Seiten-<h1>. Der Screenreader-/Überschriftenbaum beginnt dadurch mit einer untergeordneten Ebene und springt danach zurück zu <h1>.

## Befunde und minimale Empfehlungen

### A11Y-1 — Überschriftenhierarchie beginnt mit H2

**Reproduktion:** In allen drei Mockups DOM vor dem Haupttitel aufrufen oder mit einem Überschriftennavigator lesen. .demo-flow h2 steht vor dem jeweiligen ersten <h1>.

**Auswirkung:** Die Demo erhält vor dem Seitentitel eine scheinbar untergeordnete Überschrift. Das erschwert das schnelle Erfassen der Seitenstruktur über Überschriftennavigation.

**Minimale Empfehlung:** Den Demo-Block hinter den jeweiligen Haupttitel verschieben oder seinen sichtbaren Titel ohne Überschriftselement (z. B. p/strong) formatieren. Pro Seite genau einen frühen Haupttitel der Ebene H1 anbieten; in 01 zugleich den Demo-Block innerhalb von <main> platzieren.

### A11Y-2 — Kennzahlen werden nicht als Live-Änderung angesagt

**Reproduktion:** In einem Screenreader Statusbutton wechseln. Der role=status-Text ändert sich, aber die danebenliegenden sechs Kennzahlen sind nicht in einer Live-Region; ihr DOM-Text wird still aktualisiert.

**Auswirkung:** Tastaturnutzer erhalten zwar die Statusansage, hören aber nicht zwingend die neuen Beispielwerte. Die sichtbaren Datenänderungen sind damit nicht gleichwertig angekündigt.

**Minimale Empfehlung:** Eine kurze zusammengefasste Ansage ergänzen, etwa „Demo Live: 184 Zuschauer, 1.240 Likes“. Alternativ Status und Kennzahlen gemeinsam in eine zurückhaltende, atomare Live-Region aufnehmen. Nicht jede einzelne Zahl separat ansagen, um Mehrfachansagen zu vermeiden.

### A11Y-3 — Main-Landmark fehlt um die Demo-Steuerung in Richtung 01

**Reproduktion:** DOM-/Landmark-Abfrage auf 01-overview.html: .demo-flow ist kein Nachfahre von <main>; in 02/03 ist sie enthalten.

**Auswirkung:** Screenreader-Nutzer können den zentralen Demo-Ablauf über den Hauptbereich-Landmark überspringen oder als außerhalb des Hauptinhalts wahrnehmen.

**Minimale Empfehlung:** In 01 .demo-flow in den bestehenden <main> verschieben. Falls die Reihenfolge aus Layoutgründen bleiben muss, trotzdem innerhalb des Hauptbereichs direkt nach dem Seitentitel anordnen.

## Gesamtbewertung

Tastaturaktivierung, logische Tabfolge und sichtbarer Fokus funktionieren im lokalen Test. Die geprüfte Demo-Typografie erfüllt in beiden Themes 4,5:1. Die ARIA-Gruppe und Statuszeile sind passend markiert. Für eine bessere Screenreader-Struktur sollten die Überschriftenreihenfolge in allen drei Mockups und die Main-Zugehörigkeit in Richtung 01 bereinigt werden; außerdem sollte die Änderung der sechs Kennzahlen angekündigt oder in eine knappe Statuszusammenfassung aufgenommen werden. Diese Empfehlungen betreffen ausschließlich die lokalen Mockups und legen keine Produktentscheidung fest.



## Nachprüfung nach Umsetzung der Empfehlungen

Die drei Befunde wurden in den lokalen HTML-Mockups behoben:

- In allen drei Seiten steht der jeweilige H1 vor dem H2 „Interaktiver Demo-Ablauf“.
- Der Demo-Abschnitt ist auf jeder Seite ein Nachfahre des einzigen Main-Landmarks; insbesondere liegt er jetzt auch in 01 innerhalb von `<main>`.
- Der sichtbare Status bleibt separat lesbar. Genau eine zusätzliche, atomare Live-Region mit `role="status"`, `aria-live="polite"` und `aria-atomic="true"` fasst Status und alle sechs Kennzahlen pro Auswahl zusammen. Die Kennzahlenliste selbst ist keine Live-Region, damit nicht jeder Einzelwert separat angesagt wird.

Erneuter lokaler Test mit Playwright/Edge: alle drei Statuszustände wurden in Tag- und Nachtmodus per Tastatur bedient (Offline per Space, Verbunden/Live per Enter); jeweils genau ein Button war `aria-pressed=true`, die zusammengefasste Ansage enthielt Status und Werte, und der 3-px-Fokusrahmen blieb sichtbar. Für jeden Zustand und beide Themes wurde bei 320, 390 und 720 CSS-Pixeln kein horizontaler Überlauf festgestellt. Keine JavaScript-Fehler.

Kontrast neu über die berechneten Vordergrund-/Hintergrundfarben der Demo-Steuerung geprüft: niedrigster Wert Tag 5,42:1 (01), 5,54:1 (02), 6,07:1 (03); Nacht 7,75:1 (01), 7,42:1 (02), 7,30:1 (03). Alle geprüften Texte bleiben über 4,5:1.

Die bisherigen PNGs wurden nicht neu aufgenommen. Die Galerie markiert sie jetzt in Hinweistext und Alternativtext als **statische synthetische Mockup-Vorschau vor dem interaktiven Ablauf**; für den aktuellen Stand sind die drei HTML-Dateien zu öffnen.

**Status der Nachprüfung:** A11Y-1, A11Y-2 und A11Y-3 aus der ersten Audit-Runde sind für diese lokalen Mockups behoben. Eine reale Screenreader-Ausgabe wurde weiterhin nicht mit einem assistiven Gerät getestet.
