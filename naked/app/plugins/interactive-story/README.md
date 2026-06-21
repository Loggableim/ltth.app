# Interactive Story Generator Plugin

AI-gestütztes interaktives Story-Generierungs-Plugin für TikTok LIVE Streams mit Zuschauer-Voting, Bildgenerierung, Multi-Voice-TTS und adaptiven OBS-Overlays.

## 🎯 Features

### Story-Generierungs-Engine
- **Multi-Thema-Unterstützung**: Fantasy, Cyberpunk, Horror, Sci-Fi, Mystery, Adventure
- **Flexible LLM-Provider-Auswahl**:
  - **OpenAI** (Standard): GPT-4o, GPT-4o Mini (empfohlen - kosteneffizient), GPT-3.5 Turbo
  - **SiliconFlow**: DeepSeek-V3, Qwen 2.5-7B-Instruct, Meta-Llama 3.1-8B-Instruct
- **Story-Memory-System**: Automatisches Tracking von Charakteren, Orten, Items und Ereignissen
- **Kohärenz-Check**: Validiert neue Kapitel gegen Story-Kontext
- **Flexible Choices**: 3-6 Wahlmöglichkeiten pro Kapitel

### Bildgenerierung
- **Automatische Bild-Erstellung** für jedes Kapitel
- **Flexible Image-Provider-Auswahl**:
  - **OpenAI DALL-E** (Standard): DALL-E 2 (kosteneffizient), DALL-E 3 (hohe Qualität)
  - **SiliconFlow**: FLUX.1-schnell (schnell, hochwertig), Z-Image-Turbo (ultra-schnell)
- **Theme-basierte Styles**: Automatische Stil-Anpassung je nach Story-Genre
- **Lokales Caching**: Alle Bilder werden persistent gespeichert

### Multi-Voice TTS (optional)
- **System TTS Integration** (Standard): Nutzt das LTTH TTS-Plugin mit OpenAI TTS
  - 6 Standard-Stimmen: Alloy, Echo, Fable, Onyx, Nova, Shimmer
  - 6 HD-Stimmen für höhere Qualität
  - Vollständig konfigurierbar über TTS-Plugin
- **SiliconFlow TTS** (alternativ): 6 verschiedene Charakterstimmen
- **Pre-Caching**: TTS wird vor Wiedergabe vollständig generiert (kein Delay)
- **TTS-Engine-Koordination**: Pausiert die integrierte TTS während Plugin-Wiedergabe

### Voting-System
- **Chat-basiertes Voting**: !a, !b, !c, !d, !e, !f Kommandos
- **Echtzeit-Anzeige**: Live-Updates im Overlay
- **Flexible Einstellungen**:
  - Einstellbare Voting-Dauer (15-300 Sekunden)
  - Mindest-Votes-Schwelle
  - Optional: Vorzeitiges Ende bei klarem Vorsprung
- **Statistiken**: Top-Voter-Tracking

### OBS-Integration
- **Adaptive Overlays**:
  - Kapitel-Anzeige mit Bild und Text
  - Voting-Overlay mit Echtzeit-Balken
  - Ergebnis-Anzeige
  - Generierungs-Animation
- **Umfangreiche Anpassungsoptionen**:
  - **Orientierung**: Landscape (Querformat) oder Portrait (Hochformat)
  - **Auflösungen**: 1920x1080, 1280x720, 2560x1440, 3840x2160, Portrait-Varianten
  - **Anzeigemodus**: Vollständiges Kapitel oder Satz-für-Satz
  - **Anpassbare Schriftart, -größe und Farben**
- **Smooth Transitions**: Weiche Überblendungen zwischen States
- **Responsive Design**: Dynamisch anpassbar

### Story-Export (geplant)
- PDF-Export für vollständige Story
- Video-Zusammenfassung mit Bildern + TTS
- Automatische Clip-Generierung

## 📋 Voraussetzungen

### API Keys
Wähle deinen bevorzugten AI-Provider (oder nutze beide):

- **OpenAI** (empfohlen für beste Qualität):
  - Registrierung: https://platform.openai.com/
  - API-Dokumentation: https://platform.openai.com/docs/
  - Kosteneffiziente Modelle: GPT-4o Mini, DALL-E 2
  
- **SiliconFlow** (alternativ):
  - Registrierung: https://cloud.siliconflow.com
  - API-Dokumentation: https://docs.siliconflow.com
  - Gute Balance zwischen Kosten und Qualität

### Systemanforderungen
- Node.js 16+ (bereits durch LTTH vorhanden)
- Minimum 4GB RAM
- Stabile Internetverbindung

## 🚀 Installation

1. **Plugin ist bereits installiert** im LTTH Plugin-System
2. Plugin aktivieren über LTTH Admin Panel
3. API-Keys konfigurieren (siehe Konfiguration)

## ⚙️ Konfiguration

### 1. API-Key einrichten

#### OpenAI (Standard)

1. Öffne **Settings** (Einstellungen) im LTTH Dashboard
2. Scrolle zu **OpenAI API Configuration**
3. Gib deinen OpenAI API Key ein
4. Wähle ein Model (GPT-4o Mini empfohlen)
5. Klicke auf **Save OpenAI Configuration**

**API Key erhalten:**
1. Registrierung: https://platform.openai.com/signup
2. API Keys Bereich: https://platform.openai.com/api-keys
3. Neuen API Key erstellen ("Create new secret key")
4. Key kopieren (sollte mit "sk-" beginnen)
5. In LTTH Settings einfügen

#### SiliconFlow (Optional)

1. Öffne **Settings** (Einstellungen) im LTTH Dashboard
2. Scrolle zu **TTS API Keys**
3. Finde **Fish Speech 1.5 API Key (SiliconFlow)**
4. Gib deinen SiliconFlow API Key ein
5. Klicke auf **Save TTS API Keys**

**API Key erhalten:**
1. Registrierung: https://cloud.siliconflow.com/
2. API Keys Bereich öffnen
3. Neuen API Key erstellen
4. Key kopieren (sollte mit "sk-" beginnen)
5. In LTTH Settings einfügen

### 1a. API Key testen

**Nach dem Einfügen des API Keys im LTTH Settings:**

1. Öffne das Interactive Story Plugin UI
2. Finde die "⚙️ Configuration" Sektion
3. Klicke auf **🔍 Test API Key** Button
4. Das System testet die Verbindung zu SiliconFlow

**Mögliche Ergebnisse:**

✅ **Erfolgreich**: API Key ist gültig und funktioniert
- Zeigt Key-Länge und Prefix
- Zeigt getestetes Model

❌ **401 Unauthorized**: API Key ungültig
- Prüfe ob der Key korrekt kopiert wurde
- Stelle sicher, dass der Key auf SiliconFlow aktiv ist
- Überprüfe ob du Credits/Quota hast
- Versuche einen neuen API Key zu generieren

❌ **429 Rate Limit**: Quota erschöpft
- Warte einige Minuten
- Prüfe dein Dashboard für Quota-Status

❌ **Network Error**: Verbindungsprobleme
- Prüfe deine Internetverbindung
- Stelle sicher dass die API erreichbar ist

### 2. Plugin-Spezifische Einstellungen

Öffne das Interactive Story Plugin UI:

```
Dashboard -> Plugins & Tools -> Interactive Story -> Configuration
```

**🤖 AI Provider Selection:**
- **LLM Provider**: OpenAI (GPT) oder SiliconFlow
- **Image Provider**: OpenAI (DALL-E) oder SiliconFlow  
- **TTS Provider**: System TTS (OpenAI) oder SiliconFlow TTS

**🎯 Model Selection:**
- **OpenAI LLM**: GPT-4o Mini (empfohlen), GPT-4o, GPT-3.5 Turbo
- **OpenAI Image**: DALL-E 2 (kosteneffizient), DALL-E 3 (hohe Qualität)
- **SiliconFlow LLM**: DeepSeek V3, Qwen 2.5-7B, Meta-Llama 3.1-8B
- **SiliconFlow Image**: FLUX.1-schnell, Z-Image-Turbo
- **OpenAI TTS Voice**: 12 verschiedene Stimmen (Standard & HD)

**🎨 Overlay Customization:**
- **Orientation**: Landscape (Querformat) oder Portrait (Hochformat)
- **Resolution**: 1920x1080, 1280x720, 2560x1440, 3840x2160, Portrait-Varianten
- **Display Mode**: Full Chapter (gesamtes Kapitel) oder Sentence-by-Sentence
- **Font Family**: Verschiedene Schriftarten
- **Font Sizes**: Anpassbare Text- und Titelgrößen (in em)
- **Colors**: Text- und Titelfarben (Farbwähler)

**⚙️ Voting & Generation Settings:**
- **Voting Duration**: 15-300 Sekunden (Standard: 60)
- **Number of Choices**: 3-6 Optionen (Standard: 4)
- **Auto-generate Images**: AN/AUS (Standard: AN)
- **Auto-generate TTS**: AN/AUS (Standard: AUS)

**🧪 Development Settings:**
- **Offline/Test Mode**: Für Testing ohne Live-Chat
- **Debug Logging**: Detailliertes Logging für Entwicklung
- **API Logging**: Zeige API-Request-Details

### 2a. Offline/Test-Modus

**Für Testing ohne TikTok LIVE Chat:**

1. Aktiviere "Offline/Test Mode" in der Konfiguration
2. Aktiviere optional "Debug Logging" für detaillierte Logs
3. Nach dem Start einer Story erscheinen **Admin-Choice-Buttons**
4. Wähle selbst die Story-Pfade aus, ohne auf Chat-Voting zu warten

**Vorteile:**
- ✅ Testen ohne Live-Stream
- ✅ Schnelles Durchspielen verschiedener Story-Pfade
- ✅ Debug-Logging zeigt detaillierte Informationen
- ✅ Keine Wartezeit für Voting

**Debug-Log-Panel:**
- Zeigt alle Plugin-Operationen in Echtzeit
- Farbcodierte Log-Levels (Error, Warning, Info, Debug)
- Timestamps für jedes Event
- "Clear" Button zum Leeren der Logs

### 3. OBS-Overlay einrichten

1. Öffne OBS Studio
2. Füge eine neue **Browser Source** hinzu
3. URL eingeben:
   ```
   http://localhost:3000/plugins/interactive-story/overlay.html
   ```
4. Breite: 1920
5. Höhe: 1080
6. ✅ "Shutdown source when not visible" aktivieren
7. ✅ "Refresh browser when scene becomes active" aktivieren

### 3. Story starten

1. Öffne das Plugin UI
2. Wähle ein **Theme** (Fantasy, Cyberpunk, etc.)
3. Optional: Gib ein Custom Outline ein
4. Klicke **Start Story**

Das Plugin generiert automatisch:
- Erstes Kapitel mit Kontext
- Thematisch passendes Bild
- Wahlmöglichkeiten für Zuschauer

### 4. Voting aktivieren

Voting startet **automatisch** nach Kapitel-Generierung.

Zuschauer können abstimmen via Chat:
```
!a - Erste Option
!b - Zweite Option
!c - Dritte Option
!d - Vierte Option (falls aktiviert)
```

Nach Voting-Ende wird automatisch das nächste Kapitel generiert.

## 🎮 Verwendung

### Workflow

```
1. Story starten (Theme wählen)
   ↓
2. Kapitel wird generiert + Bild erstellt
   ↓
3. Kapitel erscheint im OBS-Overlay
   ↓
4. Voting startet automatisch
   ↓
5. Zuschauer voten via Chat (!a, !b, !c...)
   ↓
6. Gewinner-Option bestimmt nächstes Kapitel
   ↓
7. Nächstes Kapitel generieren
   ↓
8. Zurück zu Schritt 2 (oder Story beenden)
```

### Admin-Befehle

**Force Vote End**: Voting vorzeitig beenden
**Regenerate Image**: Neues Bild für aktuelles Kapitel generieren
**End Story**: Story-Session beenden

## 🧠 Story Memory / Lore Database

Das Plugin trackt automatisch:

- **Charaktere**: Namen, Eigenschaften, Status
- **Orte**: Beschreibungen, Bedeutung
- **Items**: Gegenstände, Besitzer, Eigenschaften
- **Ereignisse**: Wichtige Story-Momente
- **Choices**: Historie der getroffenen Entscheidungen

Diese Informationen werden für:
- Kohärenz-Checks
- LLM-Kontext in folgenden Kapiteln
- Lore-Viewer im UI

## 📊 Statistiken & Analytics

### Top Voters
Zeigt die aktivsten Teilnehmer basierend auf:
- Anzahl abgegebener Votes
- Zeitpunkt der letzten Teilnahme

### Session History
Vollständige Historie aller Stories:
- Theme
- Anzahl Kapitel
- Voting-Ergebnisse
- Zeitstempel

## 🔧 Technische Details

### Architektur

```
interactive-story/
├── main.js                 # Haupt-Plugin-Klasse
├── plugin.json             # Plugin-Manifest
├── ui.html                 # Admin-Panel
├── overlay.html            # OBS-Overlay
├── engines/
│   ├── llm-service.js      # SiliconFlow Chat API
│   ├── image-service.js    # SiliconFlow Image API
│   ├── tts-service.js      # SiliconFlow TTS API
│   └── story-engine.js     # Story-Generierungs-Engine
├── utils/
│   ├── story-memory.js     # Memory-System
│   └── voting-system.js    # Voting-Mechanik
└── backend/
    └── database.js         # Datenbankschicht
```

### Datenspeicherung

**Persistent (überlebt Updates):**
- `user_data/plugins/interactive-story/images/` - Generierte Bilder
- `user_data/plugins/interactive-story/audio/` - TTS-Cache
- `user_data/plugins/interactive-story/exports/` - Story-Exports
- Database: Sessions, Chapters, Votes, Viewer Stats

**Konfiguration:**
- In Plugin-Settings (Database)

### API-Endpunkte

```
GET  /api/interactive-story/status       # Plugin-Status
GET  /api/interactive-story/config       # Konfiguration laden
POST /api/interactive-story/config       # Konfiguration speichern
POST /api/interactive-story/start        # Story starten
POST /api/interactive-story/next-chapter # Nächstes Kapitel
POST /api/interactive-story/end          # Story beenden
GET  /api/interactive-story/themes       # Verfügbare Themes
GET  /api/interactive-story/memory       # Story-Memory
GET  /api/interactive-story/sessions     # Session-Historie
GET  /api/interactive-story/session/:id  # Session-Details
GET  /api/interactive-story/top-voters   # Top Voters
GET  /api/interactive-story/image/:file  # Bild abrufen
```

### Socket.io Events

**Client → Server:**
- `story:force-vote-end` - Voting beenden
- `story:regenerate-image` - Bild neu generieren

**Server → Client:**
- `story:chapter-ready` - Neues Kapitel verfügbar
- `story:voting-started` - Voting gestartet
- `story:vote-update` - Vote-Count aktualisiert
- `story:voting-ended` - Voting beendet
- `story:generation-started` - Generierung begonnen
- `story:image-updated` - Bild aktualisiert
- `story:ended` - Story beendet

## 🐛 Troubleshooting

### "Services not configured"
- Stelle sicher, dass ein gültiger SiliconFlow API Key eingegeben ist
- Speichere die Konfiguration und lade die Seite neu

### Bilder werden nicht angezeigt
- Prüfe Browser-Konsole auf Fehler
- Stelle sicher, dass `autoGenerateImages` aktiviert ist
- Prüfe Netzwerkverbindung

### Voting funktioniert nicht
- Stelle sicher, dass TikTok LIVE verbunden ist
- Prüfe, ob Chat-Events empfangen werden
- Voting-Befehle müssen exakt `!a`, `!b`, etc. sein (Kleinbuchstaben)

### LLM-Generierung schlägt fehl
- Prüfe API-Key-Gültigkeit
- Prüfe API-Rate-Limits
- Warte zwischen Kapiteln (API-Cooling)

### Cache-Probleme
- Alte Bilder: Werden automatisch nach 7 Tagen gelöscht
- Alte Audio: Werden automatisch nach 3 Tagen gelöscht
- Manuell löschen: `user_data/plugins/interactive-story/`

## 📝 Best Practices

### Story-Qualität
1. **Wähle passendes Theme** für deine Community
2. **Custom Outline** für mehr Kontrolle über Story-Richtung
3. **Voting Duration** anpassen je nach Zuschauerzahl (mehr Zuschauer = längere Zeit)

### Performance
1. **DeepSeek-V3** für beste Qualität (langsamer)
2. **Qwen 2.5** für Balance zwischen Qualität und Geschwindigkeit
3. **FLUX.1-schnell** für schnelle Bild-Generierung
4. **TTS deaktiviert lassen** außer für spezielle Sessions (spart API-Calls)

### Engagement
1. **Erkläre Voting-System** zu Beginn des Streams
2. **Zeige Top Voters** regelmäßig
3. **Teile Story Memory** zwischendurch
4. **Easter Eggs** in Custom Outlines verstecken

## 🔮 Geplante Features (Roadmap)

- [ ] PDF-Export (Story als E-Book)
- [ ] Video-Zusammenfassung mit TTS + Bildern
- [ ] Automatische Clip-Generierung
- [ ] Multi-Language Support
- [ ] Custom Voice-Mapping
- [ ] Easter-Egg-System
- [ ] Meta-Events (Community-Entscheidungen beeinflussen Story-Richtung)
- [ ] Advanced NLP für besseres Memory-Extraction
- [ ] Story-Templates
- [ ] Branching-Path-Visualisierung

## 📄 Lizenz

CC-BY-NC-4.0 - Siehe LICENSE im Hauptverzeichnis

## 🤝 Support

Bei Problemen oder Fragen:
1. Prüfe dieses README
2. Prüfe Plugin-Logs in LTTH
3. Erstelle ein Issue auf GitHub

## 🎉 Credits

Entwickelt für **PupCid's Little TikTool Helper** (LTTH)

**APIs:**
- SiliconFlow (LLM, Images, TTS)
- TikTok LIVE Connector
- OBS WebSocket

---

**Viel Spaß beim interaktiven Storytelling! 📖✨**
