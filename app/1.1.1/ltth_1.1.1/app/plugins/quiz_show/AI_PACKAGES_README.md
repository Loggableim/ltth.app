# OpenAI Quiz Question Package Generator

Diese Funktion ermöglicht die automatische Generierung von Quiz-Fragen mit OpenAI GPT-5.1 Modellen.

## Funktionen

### 1. OpenAI Konfiguration
- Sichere Speicherung des OpenAI API-Schlüssels
- Auswahl verschiedener GPT-Modelle (GPT-5.1 Nano, GPT-5.1 Mini, GPT-5.1, etc.)
- Konfigurierbare Standard-Paketgröße
- API-Schlüssel-Validierung

### 2. Fragenpakete Generieren
- Automatische Generierung von Fragen für beliebige Kategorien mit GPT-5.1
- Schwierigkeitsverteilung:
  - 50% Einfach (⭐)
  - ~17% Mittel (⭐⭐)
  - ~17% Schwer (⭐⭐⭐)
  - ~16% Expert (⭐⭐⭐⭐)
- Automatische Duplikatserkennung innerhalb der Kategorie
- Jede Frage erhält eine Erklärung zur richtigen Antwort

### 3. Paketverwaltung
- Anzeige aller generierten Pakete
- Auswahl einzelner oder mehrerer Pakete für Quiz
- Anzeige der Fragen eines Pakets
- Löschen von Paketen

## Verwendung

### Schritt 1: OpenAI API-Schlüssel konfigurieren
1. Navigiere zum Tab "🤖 AI Fragenpakete"
2. Gib deinen OpenAI API-Schlüssel ein (erhältlich unter https://platform.openai.com/api-keys)
3. Wähle optional ein anderes Modell (Standard: GPT-5.1 Nano - schnell und kostengünstig)
4. Klicke auf "💾 Konfiguration Speichern"
5. Optional: Teste den API-Schlüssel mit "🧪 API-Schlüssel Testen"

### Schritt 2: Fragenpaket generieren
1. Gib eine Kategorie ein (z.B. "Geographie", "Geschichte", "Sport")
2. Wähle die Anzahl der Fragen (5-50)
3. Optional: Gib einen benutzerdefinierten Paketnamen ein
4. Klicke auf "🤖 Fragenpaket Generieren"
5. Warte, bis die Generierung abgeschlossen ist

### Schritt 3: Pakete für Quiz auswählen
1. In der Liste der Fragenpakete, aktiviere die Checkboxen der gewünschten Pakete
2. Die ausgewählten Pakete werden grün hervorgehoben
3. Beim Start des Quiz werden nur Fragen aus den ausgewählten Paketen verwendet

### Schritt 4: Quiz starten
1. Gehe zum "📊 Dashboard" Tab
2. Starte das Quiz wie gewohnt
3. Es werden nur Fragen aus den ausgewählten Paketen verwendet
4. Falls keine Pakete ausgewählt sind, werden alle Fragen verwendet

## Technische Details

### API Endpunkte
- `GET /api/quiz-show/openai/config` - OpenAI Konfiguration abrufen
- `POST /api/quiz-show/openai/config` - OpenAI Konfiguration speichern
- `GET /api/quiz-show/packages` - Alle Pakete abrufen
- `POST /api/quiz-show/packages/generate` - Neues Paket generieren
- `POST /api/quiz-show/packages/:id/toggle` - Paket auswählen/abwählen
- `DELETE /api/quiz-show/packages/:id` - Paket löschen
- `GET /api/quiz-show/packages/:id/questions` - Fragen eines Pakets abrufen

### Datenbank Tabellen
- `openai_config` - OpenAI API-Schlüssel und Einstellungen
- `question_packages` - Metadaten der Fragenpakete
- `questions.package_id` - Verknüpfung von Fragen zu Paketen

### Generierungs-Prozess
1. System prüft OpenAI API-Schlüssel
2. Lädt vorhandene Fragen der Kategorie (zur Duplikatvermeidung)
3. Sendet Anfrage an OpenAI mit:
   - Kategorie
   - Gewünschte Anzahl und Schwierigkeitsverteilung
   - Liste existierender Fragen
4. Validiert und formatiert die generierten Fragen
5. Speichert Fragen in Datenbank mit Paket-Referenz
6. Aktualisiert UI

## Kosten

Die Verwendung dieser Funktion verursacht Kosten bei OpenAI basierend auf:
- Gewähltes Modell
- Anzahl der generierten Fragen
- Token-Verbrauch

**Geschätzte Kosten (Stand Dez 2024):**
- GPT-5.1 Nano: Sehr kostengünstig - ideal für Massengeneration
- GPT-5.1 Mini: ~$0.005-0.01 pro 10 Fragen
- GPT-5.1: ~$0.02-0.05 pro 10 Fragen
- GPT-4o: ~$0.05-0.10 pro 10 Fragen

Prüfe aktuelle Preise unter: https://openai.com/api/pricing/

## Sicherheit

- API-Schlüssel werden verschlüsselt in der Datenbank gespeichert
- API-Schlüssel werden nicht an den Client gesendet (nur maskierte Vorschau)
- Validierung aller Eingaben vor API-Aufruf
- Fehlerbehandlung für ungültige API-Antworten

## Troubleshooting

### "Ungültiger API-Schlüssel"
- Prüfe, ob der API-Schlüssel korrekt ist
- Stelle sicher, dass du Guthaben auf deinem OpenAI-Konto hast
- Prüfe, ob der Schlüssel die erforderlichen Berechtigungen hat

### "Keine Fragen generiert"
- Prüfe die Netzwerkverbindung
- Stelle sicher, dass OpenAI-Server erreichbar sind
- Versuche es mit einer kleineren Anzahl an Fragen

### "Fehler bei der Generierung"
- Prüfe die Browser-Konsole für detaillierte Fehlermeldungen
- Stelle sicher, dass die Kategorie sinnvoll ist
- Versuche ein anderes Modell

## Beispiele

### Beispiel 1: Geographie-Paket
```
Kategorie: Geographie
Anzahl: 10
Paketname: Europa Hauptstädte
```

Generiert 10 Fragen über europäische Hauptstädte mit verschiedenen Schwierigkeitsstufen.

### Beispiel 2: Sport-Paket
```
Kategorie: Fußball
Anzahl: 20
Paketname: Bundesliga Wissen
```

Generiert 20 Fragen über die Bundesliga.

### Beispiel 3: Mehrere Pakete kombinieren
1. Generiere "Geschichte - Antike" (15 Fragen)
2. Generiere "Geschichte - Mittelalter" (15 Fragen)
3. Generiere "Geschichte - Neuzeit" (15 Fragen)
4. Wähle alle drei Pakete aus
5. Quiz enthält 45 Fragen aus allen Epochen

## Support

Bei Problemen oder Fragen:
1. Prüfe die Browser-Konsole für Fehlermeldungen
2. Stelle sicher, dass alle Abhängigkeiten installiert sind
3. Öffne ein Issue im GitHub Repository
