# Quiz Plugin - Multiple Category Selection & Leaderboard Testing Guide

## Überblick

Diese Anleitung beschreibt, wie die neuen Funktionen des Quiz-Plugins getestet werden:
1. **Mehrfache Kategorieauswahl**: Auswahl mehrerer Kategorien für Quiz-Fragen
2. **Leaderboard während Wartezeit**: Automatische Anzeige des Leaderboards nach jeder Frage

## Voraussetzungen

- TikTok Helper Desktop App ist gestartet
- Quiz-Show Plugin ist aktiviert
- Mindestens Fragen in verschiedenen Kategorien sind vorhanden

## Test 1: Mehrfache Kategorieauswahl

### Vorbereitung
1. Öffne das Quiz-Show Plugin im Admin-Panel
2. Navigiere zum Tab "Fragen"
3. Stelle sicher, dass Fragen in mindestens 3 verschiedenen Kategorien vorhanden sind (z.B. "Geographie", "Geschichte", "Sport")

### Testschritte

#### Test 1.1: Alle Kategorien auswählen (Standard)
1. Gehe zum Tab "Dashboard"
2. Überprüfe, dass im Category-Filter-Button "Alle Kategorien" angezeigt wird
3. Klicke auf den Category-Filter-Button
4. Verifiziere, dass das Dropdown sich öffnet
5. Verifiziere, dass die Checkbox "Alle Kategorien" aktiviert ist
6. Verifiziere, dass alle individuellen Kategorie-Checkboxen deaktiviert sind
7. Starte ein Quiz und verifiziere, dass Fragen aus allen Kategorien gestellt werden

**Erwartetes Ergebnis**: ✅ Fragen aus allen verfügbaren Kategorien werden zufällig ausgewählt

#### Test 1.2: Eine einzelne Kategorie auswählen
1. Klicke auf den Category-Filter-Button
2. Deaktiviere "Alle Kategorien" durch Anklicken einer spezifischen Kategorie (z.B. "Geographie")
3. Verifiziere, dass die Checkbox "Alle Kategorien" automatisch deaktiviert wird
4. Verifiziere, dass nur die gewählte Kategorie aktiviert ist
5. Verifiziere, dass im Button jetzt "Geographie" statt "Alle Kategorien" angezeigt wird
6. Starte ein Quiz und verifiziere, dass nur Fragen aus "Geographie" gestellt werden

**Erwartetes Ergebnis**: ✅ Nur Fragen aus der gewählten Kategorie ("Geographie") werden verwendet

#### Test 1.3: Mehrere Kategorien auswählen (Hauptfunktion)
1. Klicke auf den Category-Filter-Button
2. Aktiviere mehrere Kategorien durch Anklicken (z.B. "Geographie" UND "Geschichte")
3. Verifiziere, dass beide Checkboxen aktiviert sind
4. Verifiziere, dass die Checkbox "Alle Kategorien" deaktiviert bleibt
5. Verifiziere, dass im Button "2 Kategorien" angezeigt wird
6. Klicke außerhalb des Dropdowns, um es zu schließen
7. Starte ein Quiz und verifiziere, dass Fragen aus beiden Kategorien gemischt werden

**Erwartetes Ergebnis**: ✅ Fragen aus "Geographie" und "Geschichte" werden zufällig gemischt gestellt

#### Test 1.4: Kategorien hinzufügen und entfernen
1. Klicke auf den Category-Filter-Button
2. Aktiviere zusätzlich eine dritte Kategorie (z.B. "Sport")
3. Verifiziere, dass im Button jetzt "3 Kategorien" angezeigt wird
4. Deaktiviere eine der Kategorien
5. Verifiziere, dass im Button jetzt "2 Kategorien" angezeigt wird
6. Deaktiviere alle Kategorien einzeln
7. Verifiziere, dass automatisch "Alle Kategorien" wieder aktiviert wird

**Erwartetes Ergebnis**: ✅ 
- Bei 0 ausgewählten Kategorien wird automatisch "Alle Kategorien" aktiviert
- Die Anzahl der ausgewählten Kategorien wird korrekt im Button angezeigt

#### Test 1.5: Alle Kategorien über Checkbox aktivieren
1. Klicke auf den Category-Filter-Button
2. Aktiviere einige spezifische Kategorien
3. Klicke auf die Checkbox "Alle Kategorien"
4. Verifiziere, dass alle spezifischen Kategorien automatisch deaktiviert werden
5. Verifiziere, dass im Button wieder "Alle Kategorien" angezeigt wird

**Erwartetes Ergebnis**: ✅ Aktivieren von "Alle Kategorien" deaktiviert alle spezifischen Kategorien

#### Test 1.6: Persistenz der Auswahl
1. Wähle eine spezifische Kombination von Kategorien (z.B. "Geographie" und "Sport")
2. Navigiere zu einem anderen Tab (z.B. "Einstellungen")
3. Navigiere zurück zum Tab "Dashboard"
4. Klicke auf den Category-Filter-Button
5. Verifiziere, dass die zuvor gewählten Kategorien noch aktiviert sind

**Erwartetes Ergebnis**: ✅ Die Kategorieauswahl bleibt beim Tab-Wechsel erhalten

#### Test 1.7: Speichern der Einstellungen
1. Wähle eine spezifische Kombination von Kategorien
2. Navigiere zum Tab "Einstellungen"
3. Klicke auf "Einstellungen Speichern"
4. Verifiziere die Erfolgsmeldung
5. Lade die Seite neu (F5)
6. Öffne das Quiz-Show Plugin erneut
7. Überprüfe, ob die Kategorieauswahl wiederhergestellt wurde

**Erwartetes Ergebnis**: ✅ Die gespeicherte Kategorieauswahl wird nach Neuladen der Seite wiederhergestellt

## Test 2: Leaderboard während Wartezeit

### Vorbereitung
1. Öffne das Quiz-Show Plugin im Admin-Panel
2. Navigiere zum Tab "Gift-Joker" (dort befinden sich die Leaderboard-Einstellungen)
3. Stelle sicher, dass mindestens 3 Fragen vorhanden sind

### Testschritte

#### Test 2.1: Leaderboard nach Frage aktiviert (Standard)
1. Scrolle zum Bereich "🏆 Leaderboard Anzeige"
2. Verifiziere, dass die Checkbox "Leaderboard nach jeder Frage anzeigen" **aktiviert** ist (Standardeinstellung)
3. Überprüfe, dass "Auto-Hide Verzögerung (Sekunden)" auf 6 Sekunden eingestellt ist
4. Navigiere zum Tab "Einstellungen"
5. Stelle "Auto Modus" ein (aktiviere die Checkbox)
6. Setze "Wartezeit vor nächster Frage" auf 5 Sekunden
7. Setze "Antworteinblendedauer" auf 6 Sekunden (Minimum)
8. Speichere die Einstellungen
9. Navigiere zum Tab "Dashboard"
10. Starte das Quiz
11. Öffne das Overlay in einem separaten Browser-Tab (`/quiz-show/overlay`)

**Erwartetes Verhalten beim Auto-Modus** (Beispiel mit 30s Rundendauer):
```
00:00 - Frage wird angezeigt
00:30 - Rundenzeit läuft ab (abhängig von der konfigurierten Rundendauer)
00:30 - Richtige Antwort wird angezeigt
00:36 - Leaderboard erscheint (nach 6s Antwortanzeige)
00:42 - Leaderboard verschwindet (nach 6s Leaderboard-Anzeige)
00:47 - Nächste Frage startet (nach 5s Wartezeit)
```
*Hinweis: Die Rundenzeit in Zeile 2 variiert je nach Einstellung "Rundendauer (Sekunden)" in den Spieleinstellungen. Die Zeiten für Antwortanzeige (6s), Leaderboard (6s) und Wartezeit (5s) bleiben konstant.*

**Erwartetes Ergebnis**: ✅ 
- Das Leaderboard erscheint automatisch nach der Antworteinblendung
- Das Leaderboard wird für 6 Sekunden angezeigt
- Nach dem Leaderboard wartet das System 5 Sekunden, bevor die nächste Frage startet
- Die Gesamtwartezeit zwischen Antwort und nächster Frage beträgt 11 Sekunden (6s Leaderboard + 5s Wartezeit)

#### Test 2.2: Leaderboard deaktivieren
1. Navigiere zum Tab "Gift-Joker"
2. Deaktiviere die Checkbox "Leaderboard nach jeder Frage anzeigen"
3. Speichere die Einstellungen
4. Starte ein neues Quiz im Auto-Modus
5. Beobachte das Overlay

**Erwartetes Verhalten**:
```
00:00 - Frage wird angezeigt
00:30 - Richtige Antwort wird angezeigt
00:36 - Wartezeit beginnt (kein Leaderboard)
00:41 - Nächste Frage startet
```

**Erwartetes Ergebnis**: ✅ 
- Kein Leaderboard wird nach der Frage angezeigt
- Die Wartezeit ist nur 5 Sekunden (ohne Leaderboard)

#### Test 2.3: Verschiedene Leaderboard-Typen
1. Navigiere zum Tab "Gift-Joker"
2. Aktiviere "Leaderboard nach jeder Frage anzeigen"
3. Teste jeden "Fragen-Anzeige Typ":
   - **"Nur Runden-Leaderboard"**: Zeigt nur die Gewinner der aktuellen Frage
   - **"Nur Season-Leaderboard"**: Zeigt die Top 10 der gesamten Season
   - **"Runde + Season"**: Zeigt beide Leaderboards nacheinander
4. Speichere und teste jede Einstellung

**Erwartetes Ergebnis**: ✅ 
- Jeder Leaderboard-Typ zeigt die entsprechenden Daten korrekt an
- Die Anzeige dauert immer 6 Sekunden
- Der Übergang zur nächsten Frage erfolgt wie konfiguriert

#### Test 2.4: Leaderboard-Animation
1. Navigiere zum Tab "Gift-Joker"
2. Teste verschiedene Animationsstile:
   - **Fade**: Sanftes Ein- und Ausblenden
   - **Slide**: Gleitet von der Seite herein
   - **Zoom**: Zoomt aus der Mitte heraus
3. Speichere und teste jede Animation

**Erwartetes Ergebnis**: ✅ Jede Animation funktioniert flüssig und sieht professionell aus

#### Test 2.5: Manuelle Quiz-Steuerung (ohne Auto-Modus)
1. Deaktiviere den "Auto Modus" in den Einstellungen
2. Aktiviere "Leaderboard nach jeder Frage anzeigen"
3. Starte ein Quiz
4. Warte bis die Rundenzeit abläuft
5. Beobachte die Antworteinblendung
6. Beobachte das Leaderboard
7. Klicke manuell auf "Nächste Frage"

**Erwartetes Ergebnis**: ✅ 
- Das Leaderboard erscheint nach der Antwortanzeige
- Das Leaderboard bleibt sichtbar bis du manuell "Nächste Frage" klickst
- Bei Klick auf "Nächste Frage" startet sofort die nächste Frage (Leaderboard verschwindet)

## Test 3: Kombinationstest

### Test 3.1: Multiple Kategorien + Leaderboard
1. Wähle 2-3 spezifische Kategorien aus (z.B. "Geographie", "Geschichte")
2. Aktiviere "Leaderboard nach jeder Frage anzeigen"
3. Aktiviere "Auto Modus"
4. Starte ein Quiz mit mindestens 5 Fragen
5. Beobachte, dass:
   - Nur Fragen aus den gewählten Kategorien gestellt werden
   - Nach jeder Frage das Leaderboard erscheint
   - Die nächste Frage automatisch nach der Wartezeit startet

**Erwartetes Ergebnis**: ✅ Beide Funktionen arbeiten korrekt zusammen

### Test 3.2: Edge Case - Keine Fragen in gewählten Kategorien
1. Wähle eine Kategorie aus, die keine Fragen enthält
2. Versuche ein Quiz zu starten

**Erwartetes Ergebnis**: ✅ Das System zeigt eine Fehlermeldung oder wählt automatisch "Alle Kategorien"

## Fehlerbehebung

### Problem: Kategorieauswahl wird nicht gespeichert
- **Lösung**: Stelle sicher, dass du auf "Einstellungen Speichern" klickst, nachdem du die Kategorien ausgewählt hast

### Problem: Leaderboard erscheint nicht
- **Lösung**: 
  1. Überprüfe, dass "Leaderboard nach jeder Frage anzeigen" aktiviert ist
  2. Stelle sicher, dass es Leaderboard-Daten gibt (mindestens ein Spieler hat eine Frage richtig beantwortet)

### Problem: Leaderboard wird zu kurz angezeigt
- **Lösung**: Die Anzeigedauer ist fest auf 6 Sekunden eingestellt und kann nicht geändert werden

### Problem: Falsche Fragen werden trotz Kategorieauswahl gestellt
- **Lösung**: 
  1. Überprüfe, dass die Einstellungen gespeichert wurden
  2. Lade die Seite neu und überprüfe die Kategorieauswahl
  3. Stelle sicher, dass die Fragen korrekt kategorisiert sind

## Erfolgskriterien

- ✅ Mehrfache Kategorien können ausgewählt werden
- ✅ Die Kategorieauswahl wird korrekt im Button angezeigt
- ✅ Nur Fragen aus gewählten Kategorien werden gestellt
- ✅ Die Kategorieauswahl wird persistent gespeichert
- ✅ Das Leaderboard erscheint nach jeder Frage (wenn aktiviert)
- ✅ Die Timing-Sequenz (Antwort → Leaderboard → Wartezeit → Nächste Frage) funktioniert korrekt
- ✅ Beide Funktionen arbeiten zusammen ohne Konflikte

## Abschluss

Wenn alle Tests erfolgreich durchgeführt wurden, sind die neuen Funktionen einsatzbereit:
- **Mehrfache Kategorieauswahl** ermöglicht gezielte Quiz-Sessions mit ausgewählten Themenbereichen
- **Leaderboard während Wartezeit** hält die Zuschauer engagiert und zeigt aktuelle Punktestände

Bei Problemen oder Fragen, bitte im Issue-Tracker melden.
