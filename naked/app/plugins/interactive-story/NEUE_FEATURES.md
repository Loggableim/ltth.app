# Interactive Story Plugin - Neue Features

## Übersicht

Das Interactive Story Plugin wurde mit zwei wichtigen neuen Features erweitert:

1. **Konfigurierbare Abstimmungs-Keywords** - Wähle, wie Zuschauer abstimmen (!a, A, 1, Antwort 1, etc.)
2. **Maximale Kapitelanzahl** - Lege fest, wie viele Kapitel die Geschichte dauern soll

---

## 🗳️ Feature 1: Konfigurierbare Abstimmungs-Keywords

### Was ist das?

Früher konnten Zuschauer nur mit `!a`, `!b`, `!c` abstimmen. Jetzt kannst du aus 5 verschiedenen Mustern wählen!

### Verfügbare Muster

| Muster | Beispiel-Kommandos | Beschreibung |
|--------|-------------------|--------------|
| **!letter** (Standard) | !a, !b, !c, !d, !e, !f | Klassisches Muster mit Ausrufezeichen |
| **letter** | A, B, C, D, E, F | Einzelne Buchstaben (Groß- oder Kleinbuchstaben) |
| **number** | 1, 2, 3, 4, 5, 6 | Zahlen für jede Option |
| **antwort** | Antwort 1, Antwort 2, ... | Deutsches Muster mit Worten |
| **answer** | Answer 1, Answer 2, ... | Englisches Muster mit Worten |

### Konfiguration

1. Öffne das Interactive Story Plugin Admin-Panel
2. Gehe zu **Voting & Generation Settings**
3. Wähle dein gewünschtes Muster unter **"Vote Keyword Pattern"**
4. Optional: Aktiviere **"Case-Sensitive Voting"** für Groß-/Kleinschreibung-sensible Abstimmungen
5. Klicke **"Save Configuration"**

### Beispiel-Szenario

**Deutschsprachiger Stream:**
- Wähle das Muster **"antwort"**
- Zuschauer können dann abstimmen mit: `Antwort 1`, `Antwort 2`, `Antwort 3`, etc.
- Auch flexible Schreibweisen funktionieren: `antwort1`, `ANTWORT 1`

**Englischsprachiger Stream:**
- Wähle das Muster **"answer"**
- Zuschauer können abstimmen mit: `Answer 1`, `Answer 2`, `Answer 3`, etc.

**Einfacher Stream:**
- Wähle das Muster **"number"**
- Zuschauer können einfach `1`, `2`, `3` schreiben

### Wichtige Hinweise

- Das Overlay zeigt automatisch die richtigen Keywords an
- Die Keywords passen sich der Anzahl der Optionen an (3-6 Optionen)
- Votes außerhalb des gültigen Bereichs werden automatisch abgelehnt
- Standardmäßig ist Groß-/Kleinschreibung **nicht** wichtig

---

## 📖 Feature 2: Maximale Kapitelanzahl

### Was ist das?

Lege fest, wie viele Kapitel (Runden) deine Geschichte dauern soll. Das Plugin generiert automatisch ein finales Kapitel, wenn das Limit erreicht wird.

### Konfiguration

1. Öffne das Interactive Story Plugin Admin-Panel
2. Gehe zu **Voting & Generation Settings**
3. Setze **"Max Chapters (Rounds)"** auf die gewünschte Anzahl (3-20)
4. Standard ist 5 Kapitel
5. Klicke **"Save Configuration"**

### Wie funktioniert es?

- **Kapitel 1-4** (bei Max = 5): Normale Kapitel mit Auswahlmöglichkeiten
- **Kapitel 5**: Automatisch als finales Kapitel generiert (ohne weitere Optionen)
- Nach dem finalen Kapitel endet die Geschichte automatisch

### Fortschrittsanzeige

Das Admin-Panel zeigt:
- **Badge**: "Chapter 3 / 5" (aktuelles Kapitel / maximale Kapitel)
- **Fortschrittsbalken**: Visueller Fortschritt durch die Geschichte

### Beispiel-Szenario

**Kurze Geschichte (3 Kapitel):**
1. Kapitel 1: Einführung + Wahl
2. Kapitel 2: Entwicklung + Wahl
3. Kapitel 3: Finale (automatisch, keine Wahl)

**Mittlere Geschichte (5 Kapitel - Standard):**
1. Kapitel 1-4: Geschichte entwickelt sich
2. Kapitel 5: Finale

**Lange Geschichte (10 Kapitel):**
- Mehr Zeit für komplexe Geschichten
- Mehr Entscheidungen für die Zuschauer

### Wichtige Hinweise

- Das Plugin wechselt automatisch zum finalen Kapitel
- Du musst nichts manuell machen
- Die Geschichte endet nach 5 Sekunden nach dem finalen Kapitel
- Im Offline-Modus funktioniert es genauso

---

## 🎮 Verwendung im Stream

### Typischer Ablauf

1. **Vor dem Stream:**
   - Konfiguriere das Vote-Muster für dein Publikum
   - Setze die maximale Kapitelanzahl
   
2. **Während des Streams:**
   - Starte die Geschichte im Admin-Panel
   - Die Keywords werden automatisch im Overlay angezeigt
   - Zuschauer sehen, wie sie abstimmen können
   - Der Fortschritt wird angezeigt
   
3. **Nach dem letzten Kapitel:**
   - Die Geschichte endet automatisch
   - Du kannst eine neue Geschichte starten

### Best Practices

**Vote Keywords:**
- Wähle ein einfaches Muster für neue Zuschauer (`number` oder `letter`)
- Verwende `antwort`/`answer` für immersivere Erlebnisse
- Erkläre das Muster zu Beginn deines Streams

**Max Chapters:**
- Kurze Streams: 3-5 Kapitel
- Normale Streams: 5-7 Kapitel
- Lange Streams: 8-10 Kapitel
- Teste erst mit 3-5 Kapiteln, um die Dauer zu fühlen

---

## 🔧 Technische Details

### Performance-Optimierungen

- Nicht-Vote-Nachrichten werden schnell herausgefiltert
- Regex-Matching ist optimiert für jedes Muster
- Bereichsvalidierung verhindert ungültige Votes

### Kompatibilität

- Funktioniert mit allen bestehenden Features
- Offline-Modus vollständig unterstützt
- TTS liest die Keywords vor (bei aktiviertem TTS)

### Fehlerbehandlung

- Ungültige Votes werden automatisch abgelehnt
- Out-of-range Votes werden ignoriert
- Debug-Logging zeigt detaillierte Informationen

---

## ❓ Häufig gestellte Fragen (FAQ)

**Q: Kann ich das Muster während einer laufenden Geschichte ändern?**
A: Nein, das Muster wird zu Beginn der Geschichte festgelegt. Starte eine neue Geschichte, um das Muster zu ändern.

**Q: Was passiert, wenn ein Zuschauer das falsche Format verwendet?**
A: Der Vote wird einfach ignoriert. Es gibt keine Fehlermeldung im Chat.

**Q: Können Zuschauer mehrfach abstimmen?**
A: Ja, aber nur der letzte Vote zählt. Zuschauer können ihre Meinung ändern.

**Q: Was ist der Unterschied zwischen "letter" und "!letter"?**
A: "!letter" benötigt ein Ausrufezeichen (`!a`), "letter" ist nur der Buchstabe (`A` oder `a`).

**Q: Funktioniert "antwort" auch mit Leerzeichen?**
A: Ja! "Antwort 1", "antwort 1" und sogar "antwort1" funktionieren alle.

**Q: Kann ich mehr als 20 Kapitel einstellen?**
A: Nein, das Maximum ist 20 Kapitel. Dies sorgt für bessere Geschichtenqualität und verhindert zu lange Streams.

**Q: Was passiert, wenn ich auf "End Story" klicke, bevor das Maximum erreicht ist?**
A: Die Geschichte endet sofort, unabhängig von der Max-Kapitel-Einstellung.

---

## 📝 Changelog

**Version 1.3.0** (Dezember 2024)
- ✅ 5 konfigurierbare Vote-Keyword-Muster hinzugefügt
- ✅ Maximale Kapitelanzahl konfigurierbar (3-20)
- ✅ Automatische Final-Kapitel-Generierung
- ✅ Fortschrittsbalken im Admin-Panel
- ✅ Performance-Optimierungen für Chat-Voting
- ✅ Bereichsvalidierung für Votes

---

## 🆘 Support

Bei Problemen oder Fragen:
1. Überprüfe das Debug-Logging im Admin-Panel
2. Schaue in die Konsole für detaillierte Fehler
3. Erstelle ein Issue auf GitHub mit Screenshots und Logs

---

**Viel Spaß mit deinen interaktiven Geschichten! 🎉**
