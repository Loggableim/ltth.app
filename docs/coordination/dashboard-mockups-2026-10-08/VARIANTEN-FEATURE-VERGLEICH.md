# Variantenvergleich gegen die Feature-Paritätsmatrix

**Zweck:** Ergänzung zur [Feature-Paritätsmatrix](FEATURE-PARITY-MATRIX.md). Verglichen wird die konzeptionelle Auffindbarkeit aktueller Dashboard-Views und Funktionsblöcke in den drei Mockup-Richtungen. Die HTML-Prototypen öffnen inzwischen klar markierte, synthetische Demo-Ansichten für die drei Testaufgaben. Sie führen keine Produktaktionen und öffnen keine echten Plugin-/Dashboard-Views. „Direkt“ beschreibt den vorgesehenen Einstieg der Informationsarchitektur; die Aufgabe selbst bleibt simuliert.

Die View-IDs sind der vollständige Katalog aus der Matrix: 42 eindeutige Views in sieben aktuellen Gruppen. Keine Richtung darf diese Views aus dem künftigen Navigationsbestand entfernen. Chatango/Community-Chat bleibt in allen Richtungen bewusst abwesend; TikTok-Chat als Eventkategorie ist davon getrennt.

## Erschließung nach Richtung

| Richtung | Direkt auf der Startfläche / sofortiger Einstieg | In Bereich oder Detail | Sekundärnavigation und zusätzliche Wege | Sichtbare Lücken gegenüber dem aktuellen Dashboard |
|---|---|---|---|---|
| **01 – Creator-Überblick** | Dashboard-Start; Verbindung/Verbinden; vier von sechs KPIs (Viewer, Likes, Münzen, Follower); ein Followerziel; TTS, Soundboard, Automationen/Flows und Events als kuratierte Schnellaktionen; letzte Ereignisse. | Verbindung: SessionID, Diagnose und Verbindungsdetails; Events: vollständiges Protokoll plus sieben Statistikdetails; Flows: Editor/Wizard, JSON-Import und Sammelaktionen; Ziele/Advanced Timer; alle sieben Plugin-Gruppen und deren Einzelviews. | Weitere Quick Actions und dynamische installierte Plugin-Shortcuts unter „Mehr“; Einstellungen, Wiki, Store und Config Import. Core Functions (ClarityHUD, Sidekick, Spotlight), Audio (Music Bot, Talking Heads, STT Ticker), sieben Visual-FX-Views, acht Games-&-Engagement-Views und zehn Integrationen sind nicht auf der Fläche. | Zwei KPIs fehlen; Release Notes/Changelog nicht sichtbar; OpenShock-Notstopp, Emoji Rain, WebGPU Emoji Rain und OSC Bridge haben keinen unmittelbaren Einzelzugriff. Sprache/Profil/Power sind im Mockup nicht vollständig abgebildet. |
| **02 – Live-Konsole** | Dashboard-Start im Betriebsmodus; Verbindung; vier von sechs KPIs (Viewer, Likes, Gifts, Laufzeit); Publikumskurve und Ereignisstrom; Ziele-/Systemstatus; TTS/Soundboard und wenige generische Live-Aktionen. | Events und Statistikdetails; Flows-Verwaltung; Ziele und Advanced Timer; Verbindungsdiagnose/SessionID; Vollansicht für System-, Overlay- und Audiozustand. Alle sieben View-Gruppen und Plugin-Details bleiben grundsätzlich unter Werkzeuge erreichbar. | Einzelplugins sämtlicher Gruppen über Werkzeuge/Rail; Store, Wiki, Einstellungen und Config Import als sekundäre Ziele. Follower/Münzen und weitere Schnellaktionen liegen außerhalb der vier KPI-Kacheln bzw. hinter Werkzeugen. | Zwei KPIs fehlen; dynamische Plugin-Shortcuts sowie Release Notes/Changelog fehlen. OpenShock-Notstopp ist nicht dargestellt. Ohne Live-Stream bleibt Diagramm-/Eventfläche teilweise leer. |
| **03 – Arbeitsbereiche** | Dashboard-Start; Verbindungsstatus/CTA; drei KPIs (Viewer, Likes, Münzen); Events-Einstieg; Automationen-/Flows-Pin, Soundboard-Pin, ClarityHUD-Pin; Stream-&-Ziele-, Audio-&-Sprache-, Visuals- und Automationen-Kacheln. | Alle Views thematisch unter sieben benannten Arbeitsbereichen: Core Functions → Plugins & Integrationen; Automations & Goals → Automationen bzw. Stream & Ziele; Audio & Voice → Audio & Sprache; Visual FX → Visuals; Games & Engagement und Integrations → Plugins & Integrationen; Management → Hilfe/Verwaltung. Details wie SessionID/Diagnose, Event-Statistiken, Flow-Editor/Import, Timer, Settings, Wiki und Store verbleiben im jeweiligen Bereich. | Einzelviews brauchen nach dem Workspace-Einstieg typischerweise noch eine Auswahl. Nicht angepinnte dynamische Plugin-Shortcuts unter „Alle anzeigen“; Wiki/Store/Import in Management/Verwaltung. Unter 620 px verschwindet die dauerhafte Workspace-Seitenleiste. | Drei KPIs fehlen; Laufzeit/Follower/Gifts fehlen. Direkter Zugriff auf einzelne Visual-FX-, Games- und Integrations-Views wird zugunsten thematischer Gruppen gebündelt. Notstopp und Diagnose sind auf der Startfläche nicht sichtbar. |

## Drei Nutzungsszenarien pro Richtung

„Gut“ und „schlecht“ bezeichnen die Passung der dargestellten Informationsarchitektur, nicht gemessene Usability oder fertige Abläufe. Alle Prototypaktionen sind statisch bzw. nur lokal demonstrativ.

### 01 – Creator-Überblick

1. **Gut: LTTH öffnen und vor dem Stream Verbindung und Kennzahlen prüfen.** Der Offline-/Verbindungsblock und die vier kompakten KPIs stehen im ersten Blickfeld; das Followerziel setzt einen einzelnen Fortschrittsanker.
2. **Gut: während eines Streams eine häufige Aktion starten und jüngste Ereignisse überblicken.** Kuratierte Quick Actions plus die kurze Ereignisliste halten häufige Schritte nah an der Startfläche.
3. **Schlecht: OpenShock-Notstopp auslösen oder SessionID/Diagnose öffnen.** Der Notstopp fehlt und Diagnose ist nur als künftiger tieferer Verbindungsbereich vorgesehen; die Matrix zeigt hier einen unaufgelösten Sicherheits-/Klickpfad. Auch ein seltenes Plugin verlangt wahrscheinlich „Mehr“ und dann eine Auswahl.

### 02 – Live-Konsole

1. **Gut: laufende Sitzung beobachten und neue Events erkennen.** Verlauf, Eventstrom und Betriebsstatus teilen den Bildschirm entlang eines Live-Zeitflusses und eignen sich für längeres Offenhalten.
2. **Gut: während LIVE Audio-/Overlay-/Systemzustand triagieren.** Die Statusspalte macht Prüfpunkte schneller sichtbar als in 01 oder 03; ein Klick zur Detailansicht für Diagnose bleibt dennoch offen.
3. **Schlecht: offline ein bestimmtes Plugin, einen Wiki-Eintrag oder Config Import finden.** Werkzeug-Rail und fehlende Inhalte im Offline-Zustand bieten wenig beschreibende Orientierung; der Weg zu Einzelviews ist im Prototyp nicht spezifiziert. Notstopp fehlt auch hier.

### 03 – Arbeitsbereiche

1. **Gut: eine Funktion ohne bekannten Plugin-Namen nach Aufgabe finden.** „Audio & Sprache“, „Visuals“ oder „Stream & Ziele“ geben ein Aufgabenmodell und fassen die sieben Gruppen verständlicher zusammen.
2. **Gut: eine Sammlung von Audio-, Visual- oder Integrationswerkzeugen erkunden.** Die Themenbereiche geben Platz, die aktuell langen Pluginlisten konsistent zu ordnen; Suche und vollständiger Bestand müssen dafür in der Umsetzung erhalten bleiben.
3. **Schlecht: eine bekannte Einzelansicht mit möglichst wenigen Schritten aufrufen.** Workspace → Bereich → View kann einen zusätzlichen Auswahlklick bedeuten; unter schmaler Breite fehlt die permanente Leiste, und aktuelle Schnellschalter wie der OpenShock-Notstopp sind nicht als Einzel-Pins vorhanden.

## Bewertungsfolgen und offene Prüfpunkte

- **Direktzugriff ist ungleich verteilt:** 01 gewichtet Einstieg und wenige häufige Aktionen, 02 Live-Beobachtung, 03 Themenfindung. Die heute direkte Sidebar-Erreichbarkeit vieler Einzelviews würde in 01/02 hinter „Mehr“/Werkzeuge und in 03 hinter Arbeitsbereichen liegen.
- **Die sechs Start-KPIs sind nicht paritätisch:** 01 verliert Laufzeit/Gifts, 02 Münzen/Follower und 03 Laufzeit/Follower/Gifts. Eine Entscheidung über Pflichtkennzahlen ist offen.
- **Kritische Aktionen brauchen eigene Prüfung:** Der OpenShock-Notstopp ist aktuell ein Schnellschalter, fehlt aber in allen drei Darstellungen. Vor einer Umsetzung muss sein sicherer, dauerhaft auffindbarer Pfad separat festgelegt werden.
- **Status-/Hilfeflächen fehlen:** Release Notes/Changelog tauchen in keiner Richtung auf; Sprache, Profilwechsel und Power sind verkürzt. Ihre Zielorte und Priorität sind nicht durch diese Designs entschieden.
- **Closed Beta:** Der separate Hybrid-Designbrief fordert klare Zustände „Lokal · Closed Beta“ bzw. „Coming soon · Closed Beta“ und keinerlei User-Download. Die drei Varianten illustrieren keine konkreten Verfügbarkeiten; jede Einzel-App-Statuszuordnung bleibt offen.
- **Chatango bleibt entfernt:** Kein Mockup bietet ein Community-Chat-Fenster oder einen Chatango-Navigationspunkt. TikTok-Chatereignisse im Events-View bleiben davon als separate Funktion zu bewerten.

## Mögliche nächste Review-Fragen

1. Welche Views oder Einzelaktionen müssen aus Sicherheits- oder Häufigkeitsgründen ohne Gruppenklick erreichbar bleiben?
2. Welche der sechs KPIs gehören zwingend auf die Startfläche, und welche dürfen kontextuell erscheinen?
3. Wie soll die Navigation unter 620 px den Vollbestand auffindbar halten, wenn Richtung 03 die Workspace-Leiste einklappt?
4. Wo müssen Release Notes, Sprache, Profil/Power, Diagnose, dynamische Plugin-Shortcuts und der Notstopp explizit verankert werden?

Diese Ergänzung benennt Paritätskosten und Szenariopassung; sie empfiehlt keine Gewinner-Richtung und nimmt keine Produktentscheidung vorweg.

