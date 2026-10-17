# Farb- und Designabnahme der Dashboard-Mockups

**Stand: 8. Oktober 2026 · synthetische, lokale Prototypen · keine Produktentscheidung**

## Ergebnis

Alle drei Entwürfe erfüllen die Vorgabe „Grün, Weiß und Violett aus dem Logo dominant“ im Grundcharakter und bieten eine bewusste Tag-/Nacht-Inversion: Nacht nutzt dunkle Grün-/Neutralflächen mit hellem Text; Tag nutzt helle, überwiegend weiße Flächen mit dunklem Text. Grün markiert primäre Aktionen und positive/aktive Zustände, Violett sekundäre Hervorhebungen, Links und Fortschritt. Offline wird durch Text plus Warnmarkierung vermittelt. Der synthetische OpenShock-Notstopp ist zusätzlich als Gefahr-Aktion rot markiert und bleibt ausdrücklich als Simulation gekennzeichnet.

Der lokale Kontrastcheck misst repräsentative berechnete Text-/Bedienpaarungen in beiden Modi. **88 Paarungen bestanden mit mindestens 4,5:1.** Die kleinsten gemessenen Werte waren 4,89:1 (Richtung 01, sekundärer Text, Tag), 4,90:1 (Richtung 02, Offline-Warnung, Tag) und 5,51:1 (Richtung 03, Fließtext, Tag). Die Notstopp-Schaltfläche erreicht 6,83:1 bei Nacht und 6,51:1 bei Tag. Das ist eine gezielte Stichprobe wichtiger UI-Paare, kein vollständiger pixelweiser Audit aller Verläufe, Icons oder zukünftiger Inhalte.

## Vergleich

| Richtung | Farbwirkung und semantische Zuordnung | Stärke | Risiko / Nachteil |
|---|---|---|---|
| **01 · Creator-Überblick** | Grün trägt Verbindung, Aktionen und Kennzahlen; Violett setzt Ziel-/Fortschrittsakzente. Die Tagvariante wirkt hell und grün, die Nachtvariante dunkelgrün. | Am deutlichsten ruhige, grün geerdete Markenwirkung; Status und häufige Aktion sind in der Startfläche schnell erfassbar. | Mehrere farbige Karten und Kennzahlen konkurrieren miteinander; sekundäre Kennzahlenbeschriftung ist mit 4,89:1 der knappste Messwert. |
| **02 · Live-Konsole** | Grün signalisiert Live-/Erfolgszustand und Primäraktion; Violett markiert Akzentdaten. Tag/Nacht wechseln konsistent zwischen heller und dunkler Oberfläche. | Zustände, Live-Aktivität und Diagnose sind farblich gut von neutralen Betriebsflächen getrennt. | Die dunkle, blau/charcoal geprägte Nachtoberfläche lässt Grün/Weiß/Violett weniger dominant erscheinen als in 01; Offline-Warntext ist mit 4,90:1 knappster Messwert. |
| **03 · Arbeitsbereiche** | Violett rahmt Navigation und Bereiche, Grün kennzeichnet Aktionen/positive Zustände, weiße bzw. dunkle Flächen tragen Inhalte. | Semantische Gruppierung nach Arbeitsbereichen ist klar; Akzentfarben helfen, aktive Aufgabe und primäre Aktion zu unterscheiden. | Gesamtwirkung tendiert stärker zu Violett und neutralen Flächen; die grüne Markenfarbe ist weniger präsent als in 01. |

Keiner der Entwürfe ist ausgewählt. Die Matrix ist eine visuelle Designabnahme für die vorliegenden synthetischen Screens; sie sagt nichts über Laufzeitverhalten des Produkt-Dashboards aus.

## Prüfumfang

- Tag und Nacht in allen drei lokalen HTML-Prototypen.
- Überschriften, Fließ- und Sekundärtext, Status, Links, Fortschritt, ausgewählte Demo-Schritte, Theme-/Locale-Steuerung, primäre Demo-Aktion, Offline-Hinweis und synthetische Notstopp-Aktion.
- WCAG 2.x-Kontrastverhältnis aus den berechneten Vorder- und Hintergrundfarben; normale Texte/Bedienbeschriftungen gegen 4,5:1 geprüft.
- Gefahrfarbe ist sparsam auf die Notstopp-Simulation beschränkt; Bedeutung steht zusätzlich im sichtbaren Text. Farbe ist damit nicht die einzige Statusinformation.

Prüfskript: `verify-design-colors.cjs`. Die Werte beziehen sich auf die eingebetteten CSS-Paletten und die im Skript aufgeführten repräsentativen Elemente.
