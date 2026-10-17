# Szenariovergleich: Wege, Rückmeldungen und Parität

**Scope:** drei identische Aufgaben in Richtung 01 Creator-Überblick, 02 Live-Konsole und 03 Arbeitsbereiche. Gegenprüfung mit [Feature-Paritätsmatrix](FEATURE-PARITY-MATRIX.md) und [Variantenvergleich](VARIANTEN-FEATURE-VERGLEICH.md). Gezählt werden Navigationsschritte vom Mockup-Start bis zur sichtbaren Zielstelle. Bei einer ausführbaren Aktion kommt der separate Aktionsklick hinzu. Scrollen, Tab-Fokus und Ladezeiten werden nicht als Klicks gezählt.

**Wichtige Grenze:** Die HTML-Dateien simulieren den gemeinsamen Offline→Verbunden→Live-Status samt sechs synthetischen Kennzahlen und enthalten jetzt lokale Demo-Routen für Soundboard, Diagnose/Notstopp-Bestätigung und WebGPU Weather Control. Keine davon ist mit der Produktfunktion verbunden. Deshalb unterscheidet die Tabelle zwischen *sichtbar/klickbar im Mockup* und *konzeptionell geschätztem Produktweg*. Geschätzte Wege sind keine gemessenen oder bereits implementierten Klickpfade.

## Szenario A: eine häufige Aktion auslösen – Soundboard

Die Paritätsmatrix führt Soundboard als Start-Schnellaktion in 01/02 und als angepinntes Werkzeug in 03.

| Variante | Weg bis zur Aktion | Klicklänge im Konzept | Sichtbarer Status / Rückmeldung | Paritätsbefund |
|---|---|---:|---|---|
| **01 – Creator-Überblick** | Start → Taste „Soundboard“ | 0 Navigationsschritte + 1 Aktionsklick | Gleichrangige, benannte Taste in der Schnellzugriffsgruppe. Der gemeinsame Demo-Status ändert sich nur beim Status-Auswahlfeld; Soundboard selbst zeigt keine Rückmeldung. | Schnellaktion direkt verfügbar; passt zum kuratierten Einstieg. Andere häufige Aktionen bleiben hinter „Mehr“ oder sind nicht dargestellt. |
| **02 – Live-Konsole** | Start → Taste „Soundboard“ im Panel mit Publikumskurve/Schnellaktionen | 0 Navigationsschritte + 1 Aktionsklick | Taste und Zwecktext sind im Live-Arbeitsbereich sichtbar. Weder die Taste noch der Ereignisstrom quittieren den Soundboard-Klick. | Schnellaktion direkt verfügbar. Aktion ist eingebettet in dichtere Betriebsansicht; für eine reine Offline-Aufgabe konkurriert sie mit Status-/Diagrammfläche. |
| **03 – Arbeitsbereiche** | Start → Audio & Sprache → Soundboard-Ansicht | 1 Navigationsschritt + 1 Öffnungsklick | Der Pin ist ein Tastaturbutton. Ein Klick öffnet erst den Arbeitsbereich Audio & Sprache, danach öffnet Soundboard eine synthetische Detailansicht; eine optionale Demo-Aktion ändert nur eine lokale Rückmeldung. | Der Pin führt in den Audio-Arbeitsbereich und von dort in die synthetische Soundboard-Ansicht; damit ist der Weg einen Navigationsschritt länger als 01/02. Nicht angepinnte Audio-Tools lägen erst in „Audio & Sprache“ bzw. „Alle anzeigen“. |

**Beobachtung:** 01/02 öffnen Soundboard direkt über die sichtbare Schnellaktion. 03 führt erst in Audio & Sprache und öffnet die Funktion dort. Alle drei Wege zeigen ausschließlich eine synthetische Detailansicht ohne Ton; „Zurück“ setzt den Fokus auf den ursprünglichen Einstieg zurück.

## Szenario B: Verbindung diagnostizieren und OpenShock-Notstopp erreichen

Die Matrix nennt in der aktuellen Verbindung SessionID, Diagnose, Verbindungsdetails, Streamzeit-Debug und Healthstatus. Der OpenShock-Notstopp liegt heute als Schnellschalter auf dem Dashboard. Dieses Szenario prüft sowohl Informationszugang (Diagnose) als auch die kritische Aktion (Stopp).

| Variante | Sichtbarer Weg im Mockup | Klicklänge / Erreichbarkeit | Status-/Aktionsfeedback | Paritätsbefund |
|---|---|---|---|---|
| **01 – Creator-Überblick** | Start → Mehr → Diagnose & Sicherheit → Notstopp simulieren → Bestätigung simulieren. | 4 Aktions-/Navigationsklicks bis zur synthetischen Bestätigung. | Lokale Diagnosekarte mit DEMO-SessionID; Abschluss meldet „Kein Gerät wurde angesprochen“. | Mehr bündelt seltenere Funktionen; Notstopp ist weiterhin kein Produktzugriff. |
| **02 – Live-Konsole** | Systemstatus → Diagnose & Sicherheit → Notstopp simulieren → Bestätigung simulieren. | 3 Klicks bis zur synthetischen Bestätigung; Diagnose-Einstieg direkt im Systemstatus. | Diagnosekarte zeigt synthetische Verbindung/Healthstatus; Abschluss meldet, dass kein Gerät angesprochen wurde. | Kürzester gezeigter Weg, weil die Betriebsansicht Diagnose neben dem Systemstatus platziert; keine echte Sicherheitsaktion. |
| **03 – Arbeitsbereiche** | Stream & Ziele (Desktop-Seitenleiste oder Mobile-Arbeitsbereichsnav) → Diagnose & Sicherheit → Notstopp simulieren → Bestätigung simulieren. | 4 Klicks bis zur synthetischen Bestätigung. | Diagnosekarte und anschließende Bestätigung verwenden lokale Beispielwerte; kein Gerät wird angesprochen. | Aufgabenmodell macht den Diagnoseort thematisch vorhersagbar, fügt aber einen Bereichsschritt hinzu. |

**Befund für die Parität:** Alle drei Mockups zeigen jetzt einen lokalen Diagnose-/Bestätigungsweg mit unterschiedlich vielen Schritten (01: 4, 02: 3, 03: 4). Die Bestätigung hat keinerlei Gerätewirkung. Die echte Diagnose-/Fehlerdetail-Parität und der sichere Produkt-Notstopp bleiben offen; die Mockups beweisen nur die Auffindbarkeit ihrer eigenen Demoansicht.

## Szenario C: seltenes Plugin finden – WebGPU Weather Control

Die View **WebGPU Weather Control** ist eine von 42 Views in der Gruppe Integrations. Sie ist nicht als häufige Startaktion markiert und eignet sich daher als Test für Vollständigkeit/Auffindbarkeit.

| Variante | Konzeptioneller Weg | Geschätzte Klicklänge | Status-/Rückmeldung | Paritätsbefund |
|---|---|---:|---|---|
| **01 – Creator-Überblick** | Start → Mehr → Suchfeld „WebGPU Weather Control“ → Treffer öffnen | 2 Klicks plus Suchtext; Rückweg über zwei Zurück-Schritte | Lokale Plugin-Demo ohne Installation/Download/Netz; Rückweg führt zuerst in den Katalog, dann zum Mehr-Einstieg. | Kuratierter Start hält Plugins zurück; die Demo ergänzt eine Suche als Vollkatalog-Einstieg. Verfügbarkeitsstatus wird nicht behauptet. |
| **02 – Live-Konsole** | Start → Werkzeuge-Rail → Suchfeld → Treffer öffnen | 2 Klicks plus Suchtext; ein Zurück zum Katalog und ein Zurück zur Rail | Lokale Plugin-Demo ohne Installation/Download/Netz; Suchtreffer ist benannt und keyboard-öffnbar. | Werkzeug-Rail führt zum vollständigen synthetischen Katalog; Zwischenansicht bleibt für den realen Produktbestand noch konzeptionell. |
| **03 – Arbeitsbereiche** | Start → „Plugins & Integrationen“ (Desktop-Seitenleiste oder mobile Arbeitsbereich-Navigation) → lokaler Suchkatalog → WebGPU Weather Control öffnen | 3 Navigations-/Öffnungsklicks plus Suchtext | Lokale Plugin-Demo ohne Installation/Download/Netz; Rückweg über Detail → Katalog → ursprünglichen Navigationseinstieg. | Aufgabenbereich ist semantisch vorhersagbar; Suche dient als synthetischer Vollkatalog-Einstieg. Unter 620 px übernimmt eine benannte mobile Navigation. |

**Befund für die 42-View-Parität:** Alle drei Konzepte benötigen einen vollständigen, durchsuchbaren Bestand, damit Gruppierung oder „Mehr“ keine View aus dem Zugriff verschwinden lassen. Die Mockups zeigen weder die vollständige Liste noch die konkreten Zwischenschritte. Für Closed-Beta-Apps gelten zusätzlich die Anforderungen aus dem Hybrid-Designbrief: lokal vorhanden vs. coming soon klar unterscheiden und keinen User-Download anbieten. Für WebGPU Weather Control wird hier kein Verfügbarkeitsstatus angenommen.

## Gegenüberstellung der Weglängen

| Aufgabe | 01 | 02 | 03 | Stand der Evidenz |
|---|---:|---:|---:|---|
| Soundboard öffnen | 0 Navigation + 1 Demo-Öffnungsklick | 0 Navigation + 1 Demo-Öffnungsklick | Audio & Sprache + Soundboard öffnen (2 Klicks) | Alle führen zu einer lokalen Detailansicht; 03 hat eine zusätzliche Gruppierungsebene. Keine Variante spielt Audio ab. |
| System-/Verbindungsstatus ablesen | 0 | 0 | 0 | Sichtbar auf der Startfläche; 02 zeigt die meisten Systemdetails, aber keine Diagnose-Interaktion. |
| Diagnose öffnen | Mehr → Diagnose & Sicherheit | Systemstatus → Diagnose & Sicherheit | Stream & Ziele → Diagnose & Sicherheit | Alle drei Demo-Einstiege sind bedienbar; 02 platziert Diagnose im Systemstatuspanel. |
| OpenShock-Notstopp simulieren | Diagnose → „Notstopp simulieren“ → Bestätigung | Diagnose → „Notstopp simulieren“ → Bestätigung | Diagnose → „Notstopp simulieren“ → Bestätigung | Rein lokale Bestätigung; keine Gerätewirkung. |
| WebGPU Weather Control öffnen | Mehr → Suchkatalog → Treffer | Werkzeug-Rail → Suchkatalog → Treffer | Plugins & Integrationen → Suchkatalog → Treffer | In allen drei Mockups durchsuchbar und lokal; 03 ergänzt einen Gruppierungsschritt. |

## Status-/Rückmeldungsabgleich des interaktiven Demos

Der gleiche Demo-Ablauf ist in den drei HTMLs tatsächlich bedienbar: Statusauswahl **Offline**, **Verbunden**, **Live**; identische Werte **0/0/0/0/0/00:00** in Offline/Verbunden und **184/1.240/380/7/12/00:18** in Live. Eine Live-Region kündigt den Status an. Jede Variante spiegelt die passend vorhandenen KPI-Karten und Verbindungstexte mit. Tag/Nacht ist separat umschaltbar.

Das belegt nur lokalen Präsentationszustand. Es gibt keine TikTok-Verbindung, echte Daten, Pluginaktionen, erfolgreiche Diagnose, OpenShock-Notfallaktion oder Navigation zu den 42 Views. Die Systemstatuskarte in 02 bleibt beim Wechsel statisch; das ist im Prototyp ein bewusster Geltungsbereich, aber beim Review nicht als dynamische Diagnose missverstehen.

## Offene Fragen ohne Vorentscheidung

1. Welche Einzelaktionen – insbesondere Notstopp – brauchen einen dauerhaft sichtbaren, eindeutig bestätigten Pfad?
2. Muss Diagnose aus dem Verbindungsstatus direkt (ein Klick) erreichbar sein, und welche Informationen gehören in den ersten Blick?
3. Soll ein seltener Plugin-View wie WebGPU Weather Control per Navigation, Suche, Favorit oder Kombination erreichbar sein?
4. Wie bleiben alle 42 Views nach Gruppierung auch mobil, tastaturbedienbar und ohne Kenntnis des Plugin-Namens auffindbar?
5. Welche Systemstatuswerte in 02 müssen auf Offline/Verbunden/Live reagieren, und welche bleiben allgemeiner technischer Status?

Diese Gegenüberstellung beschreibt Klickkosten der lokalen Demo und offene Produktparität. Sie wählt keine Richtung aus und ändert keine Produktfunktion.

