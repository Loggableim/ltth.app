# Gift-Triggered Quiz Start Feature

## Übersicht

Das Quiz-Plugin unterstützt jetzt das automatische Starten von Quizzen durch TikTok-Geschenke. Wenn ein Viewer ein konfiguriertes Geschenk sendet, wird automatisch ein Quiz mit Auto-Play gestartet.

## Funktionsweise

### Quiz-Start per Geschenk

1. **Konfiguration**
   - Navigieren Sie zum Quiz-Plugin UI
   - Öffnen Sie den Tab "Gift-Jokers"
   - Im Bereich "🎮 Quiz-Start per Geschenk":
     - Aktivieren Sie das Kontrollkästchen "Quiz-Start per Geschenk aktivieren"
     - Wählen Sie ein Geschenk aus dem Dropdown-Menü
     - Alternativ: Geben Sie manuell Gift-ID und Name ein
     - Klicken Sie auf "💾 Einstellungen Speichern"

2. **Verwendung**
   - Wenn ein Viewer das konfigurierte Geschenk sendet, startet automatisch ein Quiz
   - Das Quiz läuft im Auto-Play-Modus mit den in den Settings konfigurierten Einstellungen
   - Alle weiteren Geschenke während des laufenden Quiz werden ignoriert (um Doppelstarts zu vermeiden)

### Auto-Play Einstellungen

Das Quiz verwendet die Auto-Play Einstellungen aus dem "Settings" Tab:
- **Auto-Modus**: Wird automatisch aktiviert
- **Auto-Modus Verzögerung**: Zeit zwischen den Fragen (in Sekunden)
- **Rundenanzahl**: Anzahl der Fragen im Quiz (0 = unbegrenzt)
- **Antwort-Anzeigedauer**: Zeit zum Anzeigen der richtigen Antwort

### Gift-Catalogue Integration

Die Geschenk-Auswahl nutzt den integrierten Gift-Catalogue:
- Alle verfügbaren TikTok-Geschenke werden angezeigt
- Anzeige von Gift-Name, ID und Diamond-Anzahl
- Einfache Auswahl per Dropdown
- Manuelle Eingabe als Alternative möglich

## Technische Details

### Datenbank

Die Konfiguration wird in der Tabelle `quiz_start_gift_config` gespeichert:
- `enabled`: Aktiviert/Deaktiviert das Feature
- `gift_id`: TikTok Gift-ID
- `gift_name`: Name des Geschenks (zur Anzeige)

### API Endpoints

- `GET /api/quiz-show/quiz-start-gift`: Aktuelle Konfiguration abrufen
- `POST /api/quiz-show/quiz-start-gift`: Konfiguration speichern

### Events

- `quiz-show:started-by-gift`: Wird ausgelöst wenn Quiz per Geschenk gestartet wird
  - Parameter: `{ username, giftName }`

## Fehlerbehebung

### Quiz startet nicht

**Mögliche Ursachen:**
1. Feature ist nicht aktiviert
   - Lösung: Aktivieren Sie das Kontrollkästchen in den Einstellungen

2. Keine Fragen verfügbar
   - Lösung: Fügen Sie Fragen im "Questions" Tab hinzu

3. Quiz läuft bereits
   - Lösung: Warten Sie bis das aktuelle Quiz beendet ist

4. Falsches Geschenk konfiguriert
   - Lösung: Überprüfen Sie Gift-ID im Gift-Catalogue

### Gift-ID herausfinden

1. Öffnen Sie den Gift-Catalogue Tab in LTTH
2. Suchen Sie das gewünschte Geschenk
3. Notieren Sie sich die ID
4. Verwenden Sie diese ID in der Quiz-Start Konfiguration

## Best Practices

1. **Geschenk-Auswahl**: Wählen Sie ein Geschenk mit moderatem Wert
   - Nicht zu günstig (zu viele Quiz-Starts)
   - Nicht zu teuer (zu wenige Quiz-Starts)

2. **Auto-Play Einstellungen optimieren**:
   - Verzögerung: 5-10 Sekunden empfohlen
   - Rundenanzahl: 10-15 Fragen pro Quiz

3. **Fragen-Pool**:
   - Mindestens 50-100 Fragen für Abwechslung
   - Verschiedene Kategorien für Vielfalt

4. **Testing**:
   - Testen Sie die Konfiguration vor dem Stream
   - Prüfen Sie die Auto-Play Einstellungen

## Kombination mit anderen Features

### Mit Gift-Jokern

- Quiz-Start Gift und Joker-Gifts können unterschiedlich sein
- Joker-Gifts funktionieren nur während laufendem Quiz
- Konfigurieren Sie verschiedene Geschenke für verschiedene Aktionen

### Mit Question Packages

- Das Quiz verwendet die ausgewählten Question Packages
- Oder filtert nach Kategorie, falls konfiguriert
- Stellen Sie sicher, dass genügend Fragen verfügbar sind

### Mit Leaderboard

- Punkte werden normal im Leaderboard erfasst
- Season-System funktioniert wie gewohnt
- Leaderboard wird nach konfigurierten Einstellungen angezeigt

## Beispiel-Workflow

1. **Setup**:
   ```
   - Fügen Sie 100 Fragen im Questions Tab hinzu
   - Wählen Sie "Galaxy" als Quiz-Start Geschenk (Gift-ID: 8189)
   - Setzen Sie Auto-Modus Verzögerung auf 8 Sekunden
   - Setzen Sie Rundenanzahl auf 12
   ```

2. **Stream**:
   ```
   - Viewer sendet "Galaxy" Geschenk
   - Quiz startet automatisch
   - 12 Fragen werden automatisch nacheinander gestellt
   - Nach 12 Fragen: Quiz endet, Leaderboard wird angezeigt
   - Nächster Viewer kann wieder "Galaxy" senden für neues Quiz
   ```

3. **Während des Quiz**:
   ```
   - Viewer antworten per Chat (A, B, C, D)
   - Joker können per Geschenk aktiviert werden (falls konfiguriert)
   - Leaderboard aktualisiert sich automatisch
   ```

## Changelog

### Version 1.0 (2024-12-12)
- ✅ Quiz-Start per Geschenk implementiert
- ✅ Auto-Play Integration
- ✅ Gift-Catalogue Dropdown-Auswahl
- ✅ UI-Panel für Konfiguration
- ✅ API Endpoints für Verwaltung
- ✅ Validierung und Fehlerbehandlung

## Support

Bei Problemen oder Fragen:
1. Überprüfen Sie die Logs in LTTH
2. Testen Sie mit einem anderen Geschenk
3. Stellen Sie sicher, dass Fragen vorhanden sind
4. Prüfen Sie die Auto-Play Einstellungen

## Zukünftige Erweiterungen

Mögliche zukünftige Features:
- [ ] Verschiedene Geschenke für verschiedene Quiz-Modi
- [ ] Konfigurierbare Anzahl an Fragen pro Geschenk-Wert
- [ ] Cooldown zwischen Gift-triggered Quizzen
- [ ] Spezielle Ankündigungen bei Gift-triggered Start
