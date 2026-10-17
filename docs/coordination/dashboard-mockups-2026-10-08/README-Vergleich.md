# LTTH Dashboard – drei UI-Richtungen

Die drei HTML-Mockups und die lokale Hilfsdatei `mockup-locales.js` benötigen weder Server noch externe Ressourcen. Alle Werte sind synthetisch. Farbmodus und Sprachumschalter sind in jeder Seite bedienbar. Community-Chat und Chatango sind nicht Teil der Mockup-Oberflächen.

## Ausgangslage

Die aktuelle `app/public/dashboard.html` enthält 42 View-Container und sieben Navigationsgruppen. Die Startansicht bündelt Verbindung, Schnellaktionen, Live-Statistiken, Updates und Werkzeug-/Plugin-Einstiege; Detailansichten decken unter anderem Ereignisse, Flows, Ziele, Audio, Effekte, Integrationen und Verwaltung ab. Der bereitgestellte Referenz-Screenshot zeigt einen älteren UI-Zustand mit dichter Seitenleiste und Chatango-Fläche. Chatango ist in der aktuellen Dashboard-Datei, Navigation und dem Dashboard-JavaScript nicht vorhanden; der koordinierte Status ist in `docs/coordination/chatango-removal.md` festgehalten. Die Mockups greifen die gewünschte geringere visuelle Konkurrenz auf. Closed-Beta-Badges in den 42er-Verzeichnissen spiegeln die Policy-IDs zum Erstellungsdatum; sie belegen keine Produktintegration oder öffentliche Downloadbarkeit.

Gestalterischer gemeinsamer Nenner: Grün trägt Status und primäre Aktionen, Weiß bzw. helle Flächen geben Text und Karten Ruhe, Violett markiert sekundäre Kennzahlen und Fortschritt. Im Tagmodus werden Flächen hell und Schrift dunkel; Akzentfarben werden auf besser lesbare dunklere Varianten umgestellt.

## Distribution-Policy im Mockup

Community-Chat und Chatango fehlen vollständig. In den Verzeichnissen mit allen 42 Produktansichten sind die elf IDs aus `app/config/plugin-release-policy.json` sichtbar als **Closed Beta · Coming Soon** markiert; sie bleiben als lokale Navigationskonzepte auffindbar und werden nicht als öffentliche Downloadoption angeboten. Die synthetischen Werkzeugkataloge erklären ausdrücklich, dass sie weder Installationen noch Downloads ausführen. Diese Kennzeichnung bildet nur die Policy zum Erstellungszeitpunkt ab und ersetzt keine Produkt- oder Storeprüfung.

## 01 – Creator-Überblick (`01-overview.html`)

**Informationsarchitektur:** Begrüßung und Offline-Status → Verbindung → vier kompakte Live-KPIs → ein hervorgehobenes Ziel → vier häufige Aktionen → drei letzte Ereignisse. Tiefergehende Einstellungen, Plugins und vollständige Protokolle liegen hinter klaren Weiterlinks.

**Responsiveness:** Ein Zwölf-Spalten-Raster wird unter 850 px zu einer Spalte. KPI-Karten bleiben paarweise, während Ereignisse auf kleinen Telefonen untereinander laufen. Der Verbindungsblock stapelt seine Aktion unter 540 px.

**Vorteile:** Niedrige Einstiegslast, gutes Offline-Dashboard, vertrauter Kartenaufbau und schnelle Orientierung. **Nachteile:** Viele Karten bleiben sichtbar; Arbeitsbereiche und Plugin-Breite werden nur über „Mehr“ erschlossen. Am passendsten für gelegentliche Nutzung und gemischte Desktop-/Mobil-Nutzung.

## 02 – Live-Konsole (`02-live-console.html`)

**Informationsarchitektur:** Schmale Icon-Rail → klarer Betriebsstatus und primäre Verbindungsaktion → vier KPIs → links Publikumskurve und Ereignisstrom mit Schnellaktionen → rechts Ziele und Systemstatus. Der Stream wird als zeitlicher Arbeitsfluss verstanden.

**Responsiveness:** Die linke Navigation schrumpft zu einer schmalen Symbolleiste. Unter 900 px wandert der rechte Statusbereich unter Diagramm und Ereignisstrom; Kennzahlen wechseln zu zwei Spalten. Auf Telefonen verschwinden optionale Zeitmarken.

**Vorteile:** Sehr gute Live-Triage, hoher Informationswert pro Bildschirm und stets präsente Verbindung. **Nachteile:** Diagramm und mehrere Betriebsblöcke machen die Ansicht anspruchsvoller; vor einem Stream ist ein Teil der Fläche leer. Am passendsten für Creator, die LTTH während einer Sitzung dauerhaft offen halten.

## 03 – Arbeitsbereiche (`03-workspaces.html`)

**Informationsarchitektur:** Workspace-Auswahl → wenige Start-/Aktivitätslinks → aufgabenorientierte Bereiche „Stream & Ziele“, „Audio & Sprache“, „Visuals“ und „Automationen“ → begrenzte direkte Werkzeug-Pins. Die bestehende große Plugin-Navigation wird zu verständlichen Aufgabenpaketen zusammengefasst.

**Responsiveness:** Desktop zeigt eine permanente Workspace-Leiste und ein asymmetrisches Raster. Unter 950 px wird die Streamzeile breit und Karten werden paarig. Unter 620 px verschwindet die Seitenleiste zugunsten eines vereinfachten Inhaltsstroms; Funktionskarten werden gestapelt.

**Vorteile:** Skaliert mit vielen Plugins, reduziert die lange unstrukturierte Modulliste und gibt Nutzerinnen und Nutzern ein mentales Modell nach Aufgaben. **Nachteile:** Eine zusätzliche Gruppierungsebene kann bekannte Plugin-Namen verbergen; die Gruppen müssen sorgfältig benannt und durchsuchbar sein. Am passendsten, wenn das Produkt weiter wächst.

## Kurzvergleich

| Richtung | Schwerpunkt | Sichtbare Dichte | Beste Nutzung | Hauptrisiko |
|---|---|---:|---|---|
| 01 Überblick | Orientierung und Start | Niedrig | Einstieg, täglicher Check, Mobilgerät | Karten nehmen mit Wachstum zu |
| 02 Live-Konsole | Streambetrieb | Hoch, aber priorisiert | Dauerbetrieb während LIVE | Offline-Zustand wirkt teilweise leer |
| 03 Arbeitsbereiche | Auffinden und Skalieren | Mittel | Viele Plugins und unterschiedliche Aufgaben | Gruppierung kann Wege verlängern |

## Auswahlkriterien ohne Vorentscheidung

Richtung 01 eignet sich zum Prüfen eines ruhigeren Einstiegs, Richtung 02 zum Prüfen eines Live-Betriebsarbeitsplatzes und Richtung 03 zum Prüfen der Auffindbarkeit vieler Funktionen. Welche Nutzungspriorität überwiegt, ist eine Produktentscheidung und bleibt offen. Der separate Hybrid-Brief zeigt eine mögliche Kombination von 01 und 03 als Diskussionsgrundlage, nicht als Auswahl.

## Validierung

- CSS und Interaktionslogik liegen lokal; `mockup-locales.js` muss neben den HTML-Dateien verbleiben. Es werden keine externen Ressourcen geladen; jede Seite ist über `file://` lokal zu öffnen.
- Jede Datei hat Viewport-Metadaten und eigene Breakpoints für schmale Ansichten.
- Der lokale Darstellungs-Schalter wechselt zwischen Tag- und Nachtpalette.
- Die Oberflächen unterscheiden sich strukturell: KPI-Kartenübersicht, Live-Konsole mit Diagramm/Statusspalte, Workspace-Seitenleiste mit Aufgabenbereichen.
- Inhalte und Kennzahlen sind ausschließlich synthetische Beispieldaten.

- Edge/Playwright öffnete alle drei Dateien lokal bei 390 × 844 px; gemessene Seitenbreite jeweils 390 px, kein horizontaler Überlauf und keine JavaScript-Fehler.
- Die Browser-Screenshots (01-overview.png, 02-live-console.png, 03-workspaces.png) zeigen klar unterscheidbare Desktop-Kompositionen.

## Accessibility-Folgeiteration

Die drei Entwürfe wurden nach dem Accessibility-Audit aktualisiert. Bei 320, 390 und 720 CSS-Pixeln laufen sie jetzt ohne horizontalen Überlauf. Tagmodus-Kontraste der geprüften normalen Texte liegen mindestens bei 4,5:1; Bedienelemente zeigen einen 3-px-violetten :focus-visible-Ring. Theme-Schalter melden Name und aria-pressed-Zustand. In Richtung 03 sind Arbeitsbereich-Navigation und Bereichslinks benannt und ihre Sprungziele vorhanden. Neue Browser-Screenshots stehen neben den HTML-Dateien.

Die überarbeiteten Mockups wurden erneut mit Edge/Playwright geprüft: alle drei Seiten bei 320, 390 und 720 CSS-Pixeln ohne horizontalen Überlauf; für die geprüften normalen Textfarben in Tag- und Nachtmodus lag kein Kontrastpaar unter 4,5:1. Tastaturfokus zeigt eine 3-px-Kontur; Theme-Schalter aktualisieren ihren aria-pressed-Zustand. Alle vier Links in Richtung 03 haben unterschiedliche Namen und existierende Ziele.

Galerie zum lokalen Start: index.html im selben Ordner. Sie verlinkt die Vorschauen, drei Mockups und Begleitunterlagen.

## Interaktiver Demo-Ablauf

Alle drei Mockups besitzen dieselben anklickbaren Zustände **Offline → Verbunden → Live**. Die Statusbeschriftung, sechs synthetische Kennzahlen (Zuschauer, Likes, Münzen, Follower, Geschenke, Laufzeit) und die vorhandenen Kennzahlenkarten aktualisieren sich beim Wechsel. Der Ablauf ist vollständig lokal, simuliert keine TikTok-Verbindung und sendet keine Daten. Tag-/Nachtumschaltung bleibt parallel verfügbar.

Die PNG-Vorschaubilder in der Galerie wurden nicht neu aufgenommen. Sie zeigen weiterhin die frühere statische Mockup-Fassung ohne die Zustandssteuerung; für den aktuellen interaktiven Stand bitte die jeweilige HTML-Datei öffnen. Die Galerie weist darauf ausdrücklich hin.


Der interaktive Ablauf erhielt eine weitere Accessibility-Folgeiteration: H1 steht vor dem Demo-H2, die Demo liegt in allen Varianten im Main-Landmark, und eine einzelne atomare Live-Ansage fasst Status und sechs Kennzahlen zusammen. Die erneute Playwright-Prüfung deckte alle drei Zustände, Tag/Nacht und 320/390/720 CSS-Pixel ab. Details und Kontrastmessungen stehen in ACCESSIBILITY-AUDIT-INTERAKTIVER-ABLAUF.md. Die vorhandenen PNGs bleiben statische synthetische Mockup-Vorschauen vor diesem Ablauf; Galeriehinweis und Bildalternativtexte kennzeichnen das.


## Durchklickbare synthetische Aufgaben-Flows

Die HTML-Mockups enthalten jetzt drei lokale Testaufgaben. Die Informationsarchitekturen bleiben sichtbar verschieden: 01 öffnet Soundboard direkt und bündelt Diagnose/Plugin-Suche unter „Mehr“; 02 öffnet Soundboard aus den Live-Schnellaktionen, Diagnose aus dem Systemstatus und seltene Plugins aus der Werkzeug-Rail; 03 führt Soundboard über Audio & Sprache, Diagnose über Stream & Ziele und seltene Plugins über Plugins & Integrationen samt mobiler Arbeitsbereich-Navigation. Jede Ansicht bietet eine Rückkehr zur vorherigen Stelle und setzt den Fokus auf Überschrift bzw. ursprünglichen Einstieg zurück.

Der OpenShock-Ablauf zeigt ausdrücklich synthetische Diagnose, eine Bestätigungsstufe und lokalen Textstatus. Er sendet keinen Gerätebefehl. Soundboard spielt keinen Ton; WebGPU Weather Control wird nur als lokaler Mockup-View gezeigt. Es werden weder Netzwerk-/Socket-Aufrufe noch reale Plugin- oder Produktaktionen ausgeführt.

Reproduzierbarer Playwright-Check: `node docs/coordination/dashboard-mockups-2026-10-08/verify-mockup-flows.cjs` (nutzt das lokale Playwright-Paket aus `app/node_modules` und Edge; abweichender Browserpfad kann über `MOCKUP_EDGE_PATH` gesetzt werden). Der Check läuft alle drei Aufgaben je Variante per Tastatur, prüft Fokus/Zurück, Statuswahl und Tag/Nacht und misst Start-, Katalog- und Detailflächen bei 320/390/720 CSS-Pixeln.

**Sprachumfang:** Jede Variante hat nun einen lokalen Sprachumschalter für Deutsch, Englisch, Spanisch und Französisch. Navigation, Status, Flows, Dialoge, Hilfetexte, Warnungen sowie zugängliche Labels und dynamische Rückmeldungen werden mitübersetzt. Das ist eine synthetische Mockup-Lokalisierung, keine fachlich geprüfte Produktübersetzung.

**Ergebnis der Locale-/Flow-Prüfung:** 12/12 Kombinationen aus drei Varianten und vier Locales bestanden. Die drei Aufgaben-Flows wurden je Kombination durchlaufen (36/36), je Kombination 7 Oberflächen bei 320, 390 und 720 CSS-Pixeln geprüft (252 Overflow-Messungen insgesamt). Es gab keine JavaScript-Fehler und keine HTTP(S)-Requests. Geprüft wurden Übersetzungsabdeckung der UI-Textknoten, Statuswechsel, Tag/Nacht, Tastaturbedienung, Fokus auf Ziel-/Detailüberschrift, Rückkehrfokus sowie die synthetischen Aktionsgrenzen.

Farb- und Designabnahme mit WCAG-Kontraststichprobe: [DESIGN-ABNAHME-FARBEN.md](DESIGN-ABNAHME-FARBEN.md). Vergleich der tatsächlich gerenderten Grün/Weiß/Violett-Balance in Tag und Nacht: [FARBVERGLEICH-TAG-NACHT-2026-10-08.md](FARBVERGLEICH-TAG-NACHT-2026-10-08.md). Produktionsorientierte Token-Spezifikation für Richtung 01: [UMSETZUNGSSPEZIFIKATION-THEME-TOKENS-01.md](UMSETZUNGSSPEZIFIKATION-THEME-TOKENS-01.md).

## Responsive-/Bedienbarkeitsprüfung (lokaler Browser)

Am 08.10.2026 wurden alle drei HTML-Dateien per isolierter, headless Edge/Playwright-Vorschau über `file://` geöffnet. Es gab keinen Produktserver, keine Profil-/Kontodaten und keine externen HTTP(S)-Requests. Pro Mockup wurden 1440×900, 1280×720 und 390×844 CSS-Pixel jeweils im Nacht- und Tagmodus geprüft (9 Kombinationen, 18 Ansichts-Screenshots). Die Prüfung maß `scrollWidth` gegen `clientWidth`, prüfte sichtbare Controls auf Viewport-Grenzen und Mittelpunkt-Treffer, kontrollierte den `#mode`-Fokus mit mindestens 2px sichtbarem Outline und schaltete Tag/Nacht ausschließlich per Tastatur-Enter um. Ergebnis: **PASS für alle 9 Kombinationen**, kein horizontaler Überlauf, kein überdecktes sichtbares Control, Hauptinhalt sichtbar, kein JS-Fehler und kein externer Request.

| Mockup | Controls im Desktop / Kompakt / Mobil | 1440×900 | 1280×720 | 390×844 |
|---|---:|---|---|---|
| 01 Creator-Überblick | 14 / 14 / 13 | [Nacht](responsive-check/01-overview-desktop-1440x900-night.png) · [Tag](responsive-check/01-overview-desktop-1440x900-day.png) | [Nacht](responsive-check/01-overview-compact-1280x720-night.png) · [Tag](responsive-check/01-overview-compact-1280x720-day.png) | [Nacht](responsive-check/01-overview-mobile-390x844-night.png) · [Tag](responsive-check/01-overview-mobile-390x844-day.png) |
| 02 Live-Konsole | 18 / 18 / 18 | [Nacht](responsive-check/02-live-console-desktop-1440x900-night.png) · [Tag](responsive-check/02-live-console-desktop-1440x900-day.png) | [Nacht](responsive-check/02-live-console-compact-1280x720-night.png) · [Tag](responsive-check/02-live-console-compact-1280x720-day.png) | [Nacht](responsive-check/02-live-console-mobile-390x844-night.png) · [Tag](responsive-check/02-live-console-mobile-390x844-day.png) |
| 03 Arbeitsbereiche | 23 / 23 / 17 | [Nacht](responsive-check/03-workspaces-desktop-1440x900-night.png) · [Tag](responsive-check/03-workspaces-desktop-1440x900-day.png) | [Nacht](responsive-check/03-workspaces-compact-1280x720-night.png) · [Tag](responsive-check/03-workspaces-compact-1280x720-day.png) | [Nacht](responsive-check/03-workspaces-mobile-390x844-night.png) · [Tag](responsive-check/03-workspaces-mobile-390x844-day.png) |

Die automatisierte lokale Prüfung lässt sich mit `node verify-responsive.cjs` aus diesem Ordner wiederholen; sie schreibt die 18 Viewport-Screenshots nach `responsive-check/`. Die Mockup-HTMLs mussten für die geprüften Viewports nicht geändert werden.

## Implementierungsvorbereitung (statische Analyse)

Die vollständige Gegenüberstellung von realen Produktkomponenten, Änderungsumfang, grober relativer Aufwand-/Risikoabschätzung, Backend-/i18n-Abhängigkeiten und Anforderungsabdeckung steht in [IMPLEMENTIERUNGSMATRIX.md](IMPLEMENTIERUNGSMATRIX.md). Sie ist ausschließlich aus Quellcode und Mockup-Dateien abgeleitet und trifft keine Designauswahl.

| Richtung | Relativer UI-Eingriff unter Erhalt der bestehenden Daten-/Viewlogik | Hauptlücke der statischen Mockupfassung |
|---|---|---|
| 01 Creator-Überblick | Niedrig bis mittel, wenn die vorhandene Sidebar und Dashboard-Handler erhalten bleiben | Vollständiger 42-View-Katalog liegt unter der Startfläche; Updates und Tools brauchen klare Sekundärwege |
| 02 Live-Konsole | Mittel bis hoch; Event-/Diagnose-/Stats-Anker sind vorhanden, Zeitreihe/Healthintegration muss geprüft werden | Vollständiger 42-View-Katalog liegt im Navigationsdialog; die Rail selbst bleibt kompakt |
| 03 Arbeitsbereiche | Hoch wegen Umgruppierung, Suche und vollständigem Erhalt der Plugin-Ziele | Alle 42 Views sind gruppiert und durchsuchbar; Produktintegration muss IDs/Gating erhalten |

Der Produktcode hat sieben Navigationsgruppen, 42 View-Links und 42 View-Container. Die drei Mockups enthalten ebenfalls alle 42 Ziele, jeweils einmal, mit unterschiedlichen Gruppierungs- und Einstiegsmustern (siehe „42-View-Navigation“ unten). Die elf IDs aus `app/config/plugin-release-policy.json` sind als **Closed Beta · Coming Soon** markiert und erhalten keine Download-/Installationsaktion in der Demo. Das ist ein lokaler Policy-Snapshot, kein Laufzeitnachweis für Verfügbarkeit, Account-Zugang oder Installation. Siehe [IMPLEMENTIERUNGS-HANDOFF.md](IMPLEMENTIERUNGS-HANDOFF.md) für die Kurznotiz zur Übergabe. **Keine Variante wurde ausgewählt.**


## 42-View-Navigation (Folgeiteration, 08.10.2026)

Die drei Mockups enthalten jetzt **alle 42 echten `data-view`-IDs** aus `app/public/dashboard.html`, jeweils genau einmal pro Variante. Die Zählung wird beim Lauf des statischen Prüfers direkt gegen die aktuelle Produktdatei verglichen. Es gibt keine erfundenen oder doppelten Ziele; die Navigation markiert nur ein lokales Mockup-Ziel und führt keine Produktansicht aus.

Die Informationsarchitekturen bleiben verschieden:

- **01 Creator-Überblick:** Katalog in den sieben vorhandenen Produktgruppen, unter der ruhigen Startfläche. Gruppen sind auf-/zuklappbar; Suche filtert Beschriftung und ID und öffnet passende Gruppen.
- **02 Live-Konsole:** gleiche vollständige Produktgruppierung in einem über die Icon-Rail erreichbaren Dialog. Öffnen setzt den Fokus in die Suche; Schließen per Escape/Schließen-Schaltfläche stellt ihn auf den Auslöser zurück.
- **03 Arbeitsbereiche:** die 42 Ziele sind in sechs aufgabenorientierte Gruppen sortiert (Streamstart, Automationen, Audio, Visuals, Integrationen, Bibliothek/Verwaltung), unabhängig von den sieben Produktgruppen. Gruppen lassen sich auf-/zuklappen und durchsuchen.

Suche, Gruppenzustand und Auswahl sind lokal und synthetisch. Die Auswahl ist als Mockup-Vorschau gekennzeichnet, ändert keine Produktdaten und startet keine Funktion. Die Standardeinstellung zeigt den jeweils ersten Bereich; bei einem Suchtreffer werden passende Gruppen geöffnet. Tastaturbedienung und sichtbarer Fokus bleiben aktiv.

**Validierung:** `node verify-view-parity.cjs` meldet statisch 42/42 eindeutige IDs in jeder Richtung (01: 7 Gruppen, 02: 7, 03: 6), alle elf Closed-Beta-IDs mit Badge je Variante und keine Chatango- oder Downloadlinks. Browserprüfung: 12 Locale-Läufe, fünf Breiten (320/390/720/1280/1440 CSS px), Tag und Nacht; 120 Überlauf- und 120 Such-/Auswahlprüfungen, 72 Screenshots, null externe Requests und null JS-Fehler. `node verify-responsive.cjs`: 15 Variante/Breite-Kombinationen, Tag/Nacht, 30 Screenshots, ohne horizontalen Überlauf, mit sichtbarem Tastaturfokus. `node verify-design-colors.cjs`: 124 Kontrastmessungen, alle geprüften Text-/Bedienelemente mindestens 4,5:1. `node verify-gallery.cjs`: Galerie, lokale Vorschauen, Navigation und 24 Tag/Nacht-Überlaufmessungen bestanden.

Screenshots des neuen Verzeichniszustands liegen in `view-directory-check/`; die neueren Responsive-Aufnahmen liegen in `responsive-check/`. Ältere Galerie-PNGs zeigen weiterhin nur die statische Mockup-Vorschau und werden nicht als Screenshot der neuen Navigationszustände ausgegeben.

Die Mockups bleiben reine Review-Artefakte. Keine Produktdatei wurde für diese Navigationserweiterung geändert und es wurde keine Variante ausgewählt.

