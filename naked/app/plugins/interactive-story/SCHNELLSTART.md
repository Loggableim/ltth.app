# Interactive Story Generator - Schnellstart-Anleitung

## 🚀 Schnellstart in 5 Minuten

### Schritt 1: API-Key besorgen

1. Gehe zu https://cloud.siliconflow.com/
2. Registriere einen Account
3. Navigiere zu "API Keys" im Dashboard
4. Erstelle einen neuen API Key
5. Kopiere den Key (sicher aufbewahren!)

### Schritt 2: Plugin aktivieren

1. Öffne Little TikTool Helper
2. Gehe zu **Plugins**
3. Suche "Interactive Story Generator"
4. Klicke auf **Aktivieren**

### Schritt 3: API-Key in LTTH Settings eintragen

⚠️ **Wichtig:** Der SiliconFlow API Key wird jetzt zentral verwaltet!

1. Öffne **Settings** (Einstellungen) im LTTH Dashboard
2. Scrolle zu **TTS API Keys**
3. Finde **Fish Speech 1.5 API Key (SiliconFlow)**
4. **SiliconFlow API Key einfügen**
5. Klicke **Save TTS API Keys**

💡 Dieser eine API Key wird für LLM, Bildgenerierung UND TTS verwendet!

### Schritt 4: Plugin-Optionen konfigurieren

1. Gehe zu **Plugins & Tools → Interactive Story**
2. Tab "Configuration" öffnen
3. Einstellungen nach Wunsch anpassen:
   - **Default LLM Model**: DeepSeek V3 (empfohlen)
   - **Image Model**: FLUX.1 Schnell (empfohlen)
   - **Voting Duration**: 60 Sekunden (Standard)
   - **Number of Choices**: 4 (Standard)
   - **Auto-generate Images**: ✅ AN
   - **Auto-generate TTS**: ❌ AUS (optional)
4. Klicke **Save Configuration**

### Schritt 5: OBS einrichten

1. Öffne OBS Studio
2. Neue Scene erstellen (z.B. "Story Stream")
3. Quelle hinzufügen → **Browser**
4. Name: "Interactive Story Overlay"
5. URL eingeben:
   ```
   http://localhost:3000/plugins/interactive-story/overlay.html
   ```
6. Breite: **1920**
7. Höhe: **1080**
8. Optionen aktivieren:
   - ✅ "Shutdown source when not visible"
   - ✅ "Refresh browser when scene becomes active"
9. Klicke **OK**

### Schritt 6: Story starten!

1. Zurück zum Plugin UI in LTTH
2. Wähle ein **Theme** (z.B. Fantasy)
3. Optional: Eigenes Story-Outline eingeben
4. Klicke **Start Story**
5. Warte ~10-30 Sekunden
6. Story erscheint im OBS-Overlay!

### Schritt 7: Zuschauer einbinden

Erkläre deinen Zuschauern:
```
📖 Interaktive Story gestartet!
Stimmt ab mit:
!a für Option A
!b für Option B
!c für Option C
!d für Option D

Ihr bestimmt die Geschichte! 🎮
```

## 🎮 Während des Streams

### Voting beobachten
- Overlay zeigt automatisch Voting-Balken
- Timer läuft automatisch ab
- Gewinner wird automatisch angezeigt

### Nächstes Kapitel
- Wird automatisch nach Voting-Ende generiert
- Oder manuell über "Next Chapter" Button
- Neues Bild wird automatisch erstellt

### Story beenden
- Button "End Story" im Admin Panel
- Story wird in Datenbank gespeichert
- Statistiken bleiben erhalten

## 📊 Features nutzen

### Story Memory anzeigen
- Tab "Story Memory / Lore Database" öffnen
- Zeigt alle Charaktere, Orte, Items
- Super für Recap zwischendurch!

### Top Voters
- Tab "Top Voters" zeigt aktivste Teilnehmer
- Perfekt für Shoutouts
- Updates in Echtzeit

### Bild neu generieren
- Wenn Bild nicht passt: "Regenerate Image"
- Neues Bild wird mit gleichem Prompt erstellt
- Ersetzt vorheriges Bild

### Voting vorzeitig beenden
- Button "Force Vote End"
- Nützlich wenn eindeutige Mehrheit
- Spart Zeit

## ⚙️ Optimale Einstellungen

### Für kleine Communities (<50 Zuschauer)
- Voting Duration: **30-45 Sekunden**
- Number of Choices: **3-4**
- Use Min Swing: ✅ AN
- Swing Threshold: **5 votes**

### Für mittlere Communities (50-200 Zuschauer)
- Voting Duration: **60-90 Sekunden**
- Number of Choices: **4-5**
- Use Min Swing: ✅ AN
- Swing Threshold: **15 votes**

### Für große Communities (200+ Zuschauer)
- Voting Duration: **90-120 Sekunden**
- Number of Choices: **4-6**
- Use Min Swing: ❌ AUS
- Min Votes: **50**

## 🎨 Theme-Empfehlungen

### Fantasy
- Beste Bildqualität
- Viele kreative Möglichkeiten
- Gut für längere Stories

### Cyberpunk
- Sehr visuell ansprechend
- Moderne Tech-Community
- Action-lastig

### Horror
- Spannend für Zuschauer
- Kürzere, intensivere Kapitel
- Abend-Streams

### Sci-Fi
- Komplexe Plots
- Tech-affine Zuschauer
- Weltraum-Abenteuer

## 💡 Pro-Tipps

### Story-Qualität verbessern
1. **Custom Outline verwenden** für bessere Kontrolle
2. **DeepSeek V3 Model** für beste Qualität (langsamer)
3. **Memory Viewer** zwischendurch zeigen

### Engagement steigern
1. **Voting-System erklären** zu Beginn
2. **Top Voters regelmäßig erwähnen**
3. **Story zusammenfassen** alle 3-4 Kapitel
4. **Zuschauer-Vorschläge einbauen** in Custom Outline

### Performance optimieren
1. **Bilder deaktivieren** wenn API-Limit erreicht
2. **Qwen Model** für schnellere Generation
3. **Cache regelmäßig leeren** (> 7 Tage alte Dateien)

## 🐛 Häufige Probleme

### "Services not configured"
**Lösung**: API Key eingeben und Seite neu laden

### Bilder laden nicht
**Lösung**: 
- Netzwerkverbindung prüfen
- "Auto-generate Images" aktivieren
- API-Key gültig?

### Voting funktioniert nicht
**Lösung**:
- TikTok LIVE verbunden?
- Chat-Events werden empfangen?
- Commands müssen exakt !a, !b, !c sein

### Generation dauert zu lange
**Lösung**:
- Zu Qwen oder Llama Model wechseln
- Weniger Choices (3 statt 6)
- Kürzere Voting Duration

## 📈 Nach dem Stream

### Session anschauen
1. Tab "Sessions" öffnen
2. Letzte Session anklicken
3. Alle Kapitel durchsehen
4. Voting-Ergebnisse analysieren

### Export (bald verfügbar)
- PDF-Export der kompletten Story
- Video-Zusammenfassung
- Social Media Clips

## 🎯 Best Practices

### DO ✅
- Story-System vor Stream testen
- API-Limits im Blick behalten
- Zuschauer einbinden und erklären
- Pausen zwischen Kapiteln lassen
- Memory/Lore regelmäßig zeigen

### DON'T ❌
- Nicht zu viele Choices (max 6)
- Nicht zu kurze Voting-Time (<30s)
- Nicht mitten im Voting abbrechen
- Nicht ohne Erklärung starten
- Nicht API-Key teilen!

## 📞 Support

### Hilfe benötigt?
1. README.md lesen (detaillierte Infos)
2. Plugin-Logs prüfen
3. GitHub Issue erstellen
4. Discord Community fragen

### Logs finden
```
Little TikTool Helper/logs/
```

Suche nach Einträgen mit "Interactive Story" oder "story".

---

## 🎉 Viel Erfolg!

Deine Community wird die interaktiven Stories lieben! 📖✨

Bei Fragen: Siehe vollständige Dokumentation in `README.md`
