# Browser-Konsolenwarnungen – technische Hinweise

## Geltungsbereich

Dieser Leitfaden hilft dabei, Warnungen in der Browserkonsole der aktuellen LTTH-Version einzuordnen. Meldungen unterscheiden sich je nach Browser, Version und geladenen Assets. Beispiele belegen nicht, dass eine bestimmte Integration aktuell geladen wird.

## Medien- und Audiofehler

Meldungen wie „Media resource could not be decoded“ können die Wiedergabe beeinträchtigen. Prüfe zuerst die genaue URL und Quelldatei der Meldung. Das Dashboard verwendet in diesem Stand eine kurze, gültige WAV-Datenquelle zum Freischalten der Audiowiedergabe. Tritt der Fehler erneut auf, reproduziere ihn mit der aktuellen Version und prüfe die tatsächlich geladene Audioquelle.

## CSS-Präfixe

Browser können Hinweise zu Eigenschaften wie -webkit- oder -moz- anzeigen. Solche Präfixe können als Kompatibilitäts-Fallback beabsichtigt sein. Prüfe Datei und Zeile der Meldung und entferne ein Präfix nur, wenn die unterstützten Browser dadurch nicht beeinträchtigt werden.

## Unbekannte Selektoren und Regeln

Bei unbekannten Pseudoklassen oder At-Regeln zeigt die Konsole üblicherweise die betroffene CSS-Datei. Ordne die Meldung anhand dieser Quelle LTTH, einem Plugin oder einer gebündelten Abhängigkeit zu. Veraltete Regeln sollten bereinigt werden, wenn sie aus aktivem Projektcode stammen.

## Vorgehen bei der Fehlersuche

1. Browser und Version, genaue Meldung sowie Datei und Zeile notieren.
2. Mit einem frischen Dashboard-Aufruf prüfen, ob die Meldung reproduzierbar ist.
3. Die gemeldete Ressource im Netzwerk-Tab der aktuellen Sitzung zuordnen.
4. Fehler oder fehlgeschlagene Anfragen aus LTTH-Code untersuchen; Warnungen nur nach Prüfung ihrer konkreten Quelle filtern.

Filtere nicht pauschal nach alten Dateinamen oder früheren Integrationen. Nutze die Quelle, die die aktuelle Konsole tatsächlich anzeigt.
