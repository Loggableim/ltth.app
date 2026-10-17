# Empfehlung für den nächsten Dashboard-Prototyp

**Empfehlung zur nächsten Prototyp-Runde:** Richtung **03 – Arbeitsbereiche** als Navigationsgerüst verwenden und die ruhige Startfläche aus **01 – Creator-Überblick** übernehmen. Richtung 02 sollte als Live-Betriebsansicht beziehungsweise Vergleichsszenario erhalten bleiben. Das ist eine dokumentarische Empfehlung für den nächsten Prototyp, keine Auswahl durch den Nutzer und keine Entscheidung für die spätere Produktumsetzung.

## Warum diese Kombination

Der gezeigte Ist-Screenshot setzt Verbindung, sieben Navigationsgruppen, Schnellaktionen, Live-Kennzahlen und ein großes Chatango-Fenster gleichzeitig in Szene. Das erzeugt Konkurrenz um Aufmerksamkeit. Chatango ist im aktuellen Dashboard-Code bereits nicht vorhanden und bleibt in allen drei Entwürfen entfallen. Die nächste Iteration sollte deshalb zuerst die Informationshierarchie und den Zugriff auf die bestehenden Funktionen klären.

Die Paritätsmatrix erfasst **42 Views**. Ein ruhiger Überblick allein zeigt nicht genug davon; eine reine Live-Konsole priorisiert dagegen den laufenden Stream und ist als Einstieg außerhalb einer Sitzung dichter als gewünscht. Das Aufgabenmodell aus 03 bietet die beste Grundlage, um alle Views in benannte Gruppen zu verteilen. Die Startfläche aus 01 kann darüber hinweg Verbindung, die wichtigsten Kennzahlen und wenige häufige Aktionen priorisieren, ohne alle Views gleichzeitig als Karten darzustellen.

Die Markenanforderung passt grundsätzlich zu allen Richtungen: Grün für Status und primäre Aktionen, Weiß/helle Flächen für Lesbarkeit und Violett als sekundärer Akzent. Tag und Nacht müssen semantisch invertiert werden: helle Flächen mit dunkler Schrift am Tag, dunkle Flächen mit heller Schrift bei Nacht; Akzentfarben benötigen in beiden Modi ausreichenden Textkontrast. Das ist in den Mockups vorhanden, aber die Empfehlung ersetzt keine Prüfung im vollständigen, übersetzten UI.

## Varianten im Anforderungsvergleich

| Richtung | Stärken | Risiken / Lücken | 2–3 übernehmbare Muster |
|---|---|---|---|
| **01 – Creator-Überblick** | Ruhiger Einstieg; Status, Verbindung und häufige Aktionen sind schnell erkennbar; wirkt auch offline sinnvoll. | „Mehr“ muss für 42 Views zu einer belastbaren, durchsuchbaren Navigation ausgebaut werden. Aktuell fehlen mehrere Start-KPIs, Updates und dynamische Plugin-Shortcuts. | 1. Verbindung als klarer erster Block. 2. Wenige kuratierte Schnellaktionen. 3. Kompakte Kennzahlen und letzte Ereignisse statt eines dauerhaften Chatfensters. |
| **02 – Live-Konsole** | Beste Live-Triage; Ereignisstrom, Ziele und Systemstatus stehen in funktionalem Zusammenhang; nützlich während aktiver Sessions. | Hohe Informationsdichte widerspricht dem Wunsch nach weniger Überladung als allgemeine Startansicht. Außerhalb von LIVE wirkt die Fläche teilweise leer; 42 Views bleiben sekundär. | 1. Live-Status und Betriebszustand zusammenführen. 2. Ereignisstrom neben relevanten Kennzahlen. 3. Systemstatus in einem klar abgegrenzten Panel. |
| **03 – Arbeitsbereiche** | Beste Skalierung für 42 Views; Aufgabenbegriffe helfen beim Auffinden; reduziert eine lange, gleichrangige Plugin-Liste. | Gruppierung kann Klicks hinzufügen und bekannte Plugin-Namen verbergen. Es fehlen noch der vollständige View-Katalog, eine Suche und validierte Übersetzungen. | 1. Aufgabenbereiche mit stabilen Namen. 2. Suche über alle Views als zusätzlicher Zugang. 3. Wenige Pins für wirklich häufige Aktionen; mobile Bereichsnavigation statt versteckter Sidebar. |

## Anforderungen, die der nächste Prototyp ausdrücklich abdecken sollte

- **42 Views erreichbar:** Jede bisherige View erhält in einer Inventarliste genau einen primären Bereich und bleibt zusätzlich über eine Volltextsuche auffindbar. Fehlende Produktziele müssen als offene Zuordnung markiert werden, nicht als bereits implementierte Navigation.
- **DE/EN/ES/FR:** Alle vier Sprachen brauchen vollständige Labels, Navigationsgruppen, Statusmeldungen, Hilfetexte und leere Zustände. Die Mockups enthalten inzwischen einen lokalen Umschalter und synthetische UI-Übersetzungen für alle vier Locales; fachliche Muttersprachprüfung und Produktlokalisierung bleiben offen. Texte dürfen Layouts bei längeren Übersetzungen nicht abschneiden.
- **Grün/Weiß/Violett und Tag/Nacht:** Semantische Tokens für Hintergrund, Text, sekundären Text, Akzent, Erfolg, Warnung und Fokus in beiden Modi; normale Textkontraste mindestens 4,5:1. Nachtmodus muss tatsächlich invertieren und nicht nur dunkle Flächen hinzufügen.
- **Status und Aktionen:** Offline, verbunden und live unterscheidbar machen. Diagnose und ein kritischer OpenShock-Notstopp brauchen klare, sichere Produktwege; die in den Mockups vorhandene Bestätigung ist nur eine inerte Demo.
- **Chatango:** Vollständig abwesend. TikTok-Chatereignisse in der Eventansicht sind separat zu bewerten und nicht mit Community-Chat gleichzusetzen.
- **Closed-Beta-Apps:** Im Prototyp erkennbar als lokal vorhanden oder „demnächst verfügbar“ ausweisen. Keine Download-Aufforderung oder Behauptung, dass eine App durch Nutzer heruntergeladen werden kann.
- **Responsiveness und Bedienbarkeit:** 320/390/720 CSS-Pixel ohne horizontalen Überlauf, 200-%-Zoom ohne Funktionsverlust, vollständige Tastaturbedienung, sichtbarer Fokus, semantische Überschriften/Labels und verständliche Statusansagen.

## Vorschlag für den Umfang der nächsten Runde

Einen navigierbaren Hybrid-Prototyp als **Aufgabenbereiche mit ruhiger Startseite** erstellen: Verbindung und 3–4 priorisierte Kennzahlen zuerst, wenige Schnellaktionen darunter, Aktivität als kompakter Folgebereich. Die sieben alten Navigationsgruppen werden zunächst in Aufgabenbereiche übersetzt; die 42 Views erhalten eine überprüfbare Zuordnung und Suche. Eine eigene Live-Konsole bleibt als möglicher Arbeitsmodus aus Richtung 02 erhalten, statt die allgemeine Startansicht mit Betriebsdaten zu überladen.

Für die Review-Runde sollten pro Sprache mindestens Start, Suche, eine Bereichsseite, Offline/Live, eine seltene Integration und der Closed-Beta-Zustand überprüfbar sein. Noch nicht belegte Parität und Produktaktionen bleiben sichtbar als offene Punkte. Die statischen Screenshots sind ältere synthetische Mockup-Vorschauen; die HTML-Dateien zeigen die aktuelleren lokalen Demo-Flows.

**Nutzerentscheidung offen:** Es wurde keine Richtung ausgewählt. Diese Empfehlung priorisiert nur den nächsten Prototyp-Schritt und legt weder finale Produktnavigation noch Funktionsumfang fest.
