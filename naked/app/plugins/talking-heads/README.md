# Talking Heads Plugin

**AI-generierte 2D-Avatare mit synchronisierten Animationen für TikTok-User, die per TTS sprechen**

## 📋 Übersicht

Das Talking Heads Plugin ist ein vollständiges System, das dynamisch erzeugte 2D-Avatare für TikTok-Nutzer im Live-Chat-Stream zeigt, wenn diese per interner TTS-Engine sprechen. Das System kombiniert KI-Bildgenerierung, Sprite-Animation und OBS-Integration für ein professionelles Streaming-Erlebnis.

## ✨ Hauptfunktionen

- **KI-Avatar-Generierung**: Erstellt einzigartige 2D-Avatare basierend auf TikTok-Nutzerdaten und Profilbildern
- **🆕 User-Zuweisung & LLM-Analyse**: Dedizierte UI zur manuellen Avatar-Generierung für Stream-User mit intelligenter Profilbild-Analyse durch GPT-4o-mini Vision
- **5-Frame-Sprite-System**: Generiert essentielle Animationsframes (idle, blink, speak_closed, speak_mid, speak_open)
- **TTS-Audio-Synchronisation**: Synchronisiert Sprite-Animationen perfekt mit TTS-Audio-Wiedergabe
- **OBS WebSocket Integration**: Nahtlose Integration mit OBS für professionelle Stream-Overlays
- **Rollenbasierte Aktivierung**: Admin-konfigurierbare Berechtigungen (alle, Team, Abonnenten, Custom Voice, etc.)
- **Mehrere Stil-Vorlagen**: 7 verschiedene visuelle Stile (Furry, Tech, Medieval, Noble, Cartoon, Whimsical, Realistic)
- **Intelligentes Caching**: Speichert Avatare und Sprites mit konsistenter Nutzer-Identität
- **Performance-optimiert**: Wiederverwendung von Avataren vermeidet unnötige API-Calls

## 🎨 Stil-Vorlagen

| Stil | Beschreibung |
|------|-------------|
| **Furry** | Animierter tierischer Charakter, weich, lebendig |
| **Tech** | Futuristischer High-Tech-Look, Neon/Metallic |
| **Medieval** | Fantasy/Mittelalter, Stoff/Leder/Armor |
| **Noble** | Edler aristokratischer Stil |
| **Cartoon** | Cartoon-Look, kräftige Farben |
| **Whimsical** | Märchenhafte, verspielte Gestaltung |
| **Realistic** | Realistischer Portrait-Look |

## 🔧 Installation & Konfiguration

### Voraussetzungen

1. **API-Zugang**: Sie benötigen einen API-Schlüssel für die Bildgenerierung
   - **OpenAI (DALL-E 3)** – globaler OpenAI API Key (Dashboard → Einstellungen → OpenAI API Configuration)
   - **SiliconFlow FLUX.1** – `siliconflow_api_key` in den TTS API Keys
   - Der gewünschte Provider kann im Talking Heads Panel ausgewählt werden (Auto nutzt OpenAI, wenn verfügbar).

2. **TTS-Plugin**: Das TTS-Plugin muss aktiviert und konfiguriert sein

3. **OBS (optional)**: OBS Studio mit WebSocket-Plugin für Overlay-Integration

### Einrichtung

1. **Plugin aktivieren**:
   - Navigieren Sie zu den Plugin-Einstellungen
   - Aktivieren Sie das "Talking Heads" Plugin

2. **API konfigurieren**:
   - Öffnen Sie die Talking Heads Admin-UI
   - Wählen Sie im Feld **Bild-Engine** den gewünschten Provider (OpenAI oder SiliconFlow)
   - Hinterlegen Sie den passenden API-Key in den globalen Settings
   - Klicken Sie auf "API testen" zur Verifizierung

3. **Stil wählen**:
   - Wählen Sie einen Standard-Stil aus den 7 verfügbaren Vorlagen
   - Die Stil-Beschreibung wird automatisch angezeigt

4. **Berechtigungen einstellen**:
   - Wählen Sie, wer Talking Heads erhalten soll:
     - **Alle Zuschauer**: Jeder erhält einen Avatar
     - **Nur Team-Mitglieder**: Ab konfiguriertem Team-Level
     - **Nur Abonnenten/Superfans**: Nur zahlende Unterstützer
     - **Nur User mit TTS-Stimme**: Nur User mit dedizierter Custom Voice
     - **Nur Moderatoren**: Nur Stream-Moderatoren
     - **Nur Top Gifter**: Nur Top 3 Geschenk-Geber
   - **🆕 Berechtigungen testen**: Klicken Sie auf "Berechtigungen testen", um zu sehen, welche User-Typen mit den aktuellen Einstellungen berechtigt sind

5. **Animation anpassen**:
   - Fade-In Dauer (Standard: 300ms)
   - Fade-Out Dauer (Standard: 300ms)
   - Blinzel-Intervall (Standard: 3000ms)
   - OBS Integration aktivieren/deaktivieren

6. **Cache-Einstellungen**:
   - Avatar-Caching aktivieren (empfohlen)
   - Cache-Dauer einstellen (Standard: 30 Tage)

## 🎭 Verwendung

### Manuelle User-Zuweisung (NEU!)

Das Plugin bietet jetzt eine dedizierte User-Zuweisung-Funktion im Admin-Dashboard:

1. **User-Liste laden**:
   - Öffnen Sie das Talking Heads Admin-Panel
   - Klicken Sie auf "User aus Stream laden"
   - Das System lädt aktive User (bis zu 1.000) oder alle User bei globaler Suche (bis zu 5.000)

2. **User auswählen**:
   - Durchsuchen Sie die Liste oder nutzen Sie die Suchfunktion
   - Jeder User wird mit Profilbild, Username und Statistiken angezeigt
   - User mit bereits generierten Avataren sind gekennzeichnet

3. **Avatar generieren**:
   - Klicken Sie auf "Avatar generieren" neben dem gewünschten User
   - Das System startet den intelligenten Workflow:
     
     **Mit OpenAI API Key (empfohlen)**:
     - Profilbild wird mit GPT-4o-mini Vision analysiert
     - LLM erstellt eine detaillierte Charakterbeschreibung passend zum Genre
     - Avatar wird basierend auf dieser Beschreibung generiert
     - Höhere Qualität und bessere Genre-Anpassung
     
     **Ohne OpenAI API Key**:
     - Standard-Prompt basiert auf Username und Stil-Vorlage
     - Schnellere Generierung, aber weniger personalisiert

4. **Workflow-Ablauf**:
   - ⏱️ **30-60 Sekunden**: Avatar-Generierung (1 API-Call)
   - ⏱️ **90-150 Sekunden**: 5 Sprite-Frames (5 API-Calls)
   - ✅ **Fertig**: Avatar ist bereit für TTS-Animationen

### Automatischer Workflow

1. **TikTok-User sendet Chat-Nachricht** → TTS-Event wird ausgelöst
2. **Rollencheck**: System prüft Berechtigungen
3. **Avatar-Generierung**:
   - Falls neu: Avatar + Sprites werden per KI generiert
   - Falls gecacht: Vorhandene Avatare werden wiederverwendet
4. **TTS-Audio-Abfangen**: Audio wird queued und kontrolliert abgespielt
5. **Animation-Start**: Avatar erscheint mit Fade-In im OBS-Overlay
6. **Sprite-Synchronisation**:
   - Idle-Animation mit periodischem Blinzeln
   - Speaking-Animation synchron zum TTS-Audio
7. **Animation-Ende**: Avatar verschwindet mit Fade-Out

### OBS Browser Source Einrichtung

1. **Browser Source hinzufügen**:
   - Quelle → Browser hinzufügen
   - URL: `http://localhost:3000/overlay/talking-heads` (Alias: `/plugins/talking-heads/overlay.html`)
   - Breite: 1920px
   - Höhe: 1080px
   - Transparent: ✓

2. **Position anpassen**:
   - Standardposition: Unten rechts
   - Größe nach Bedarf anpassen

- **OBS HUD (WebGL Spawn Animation)**:
  - URL: `http://localhost:3000/overlay/talking-heads/obs-hud` (Alias: `/plugins/talking-heads/obs-hud.html`)
  - Feste 1920x1080 Fläche, ideal als eigene Browser Source
  - Spielt beim ersten Avatar eine WebGL-Spawn-Animation ab; optional kann eine eigene MP4/GIF-Animation mit Audio hinterlegt werden

## 📊 API-Endpunkte

### GET `/api/talkingheads/config`
Lädt aktuelle Konfiguration

**Response:**
```json
{
  "success": true,
  "config": { ... },
  "styleTemplates": { ... },
  "apiConfigured": true
}
```

### POST `/api/talkingheads/config`
Speichert neue Konfiguration

**Body:**
```json
{
  "enabled": true,
  "imageApiKey": "your-api-key",
  "defaultStyle": "cartoon",
  "rolePermission": "all",
  ...
}
```

### GET `/api/talkingheads/cache/stats`
Ruft Cache-Statistiken ab

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalAvatars": 42,
    "cacheEnabled": true,
    "cacheDuration": 2592000000
  }
}
```

### POST `/api/talkingheads/cache/clear`
Löscht gesamten Avatar-Cache

### POST `/api/talkingheads/test-api`
Testet API-Verbindung

### GET `/api/talkingheads/users`
Lädt User aus Stream-Datenbank für Zuweisung (NEU!)

**Query Parameters:**
- `limit` (optional): Maximale Anzahl User (Standard: 100)

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "userId": "12345",
      "username": "testuser",
      "uniqueId": "test_id",
      "profilePictureUrl": "https://...",
      "totalCoins": 1000,
      "totalGifts": 50,
      "totalComments": 200,
      "lastSeenAt": "2024-01-01 12:00:00",
      "hasAvatar": true,
      "avatarCreatedAt": 1704110400000,
      "avatarStyleKey": "cartoon"
    }
  ]
}
```

### POST `/api/talkingheads/assign`
Weist einem User einen Talking Head zu mit LLM-basierter Profilanalyse (NEU!)

**Body:**
```json
{
  "userId": "12345",
  "username": "testuser",
  "profileImageUrl": "https://...",
  "styleKey": "cartoon"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "userId": "12345",
    "username": "testuser",
    "styleKey": "cartoon",
    "avatarPath": "/path/to/avatar.png",
    "sprites": { ... }
  },
  "llmAnalysisUsed": true
}
```

**Workflow:**
1. Falls OpenAI API Key verfügbar: Profilbild wird mit GPT-4o-mini Vision analysiert
2. LLM erstellt detaillierte Charakterbeschreibung passend zum Genre
3. Avatar wird mit dieser Beschreibung generiert
4. Sprites werden auf Basis des Avatars erstellt
5. Alles wird im Cache gespeichert

### POST `/api/talkingheads/generate`
Manuelle Avatar-Generierung für User (Legacy)

**Body:**
```json
{
  "userId": "12345",
  "username": "testuser",
  "styleKey": "furry",
  "profileImageUrl": "https://..."
}
```

### GET `/api/talkingheads/animations`
Listet aktive Animationen

### GET `/api/talkingheads/sprite/:filename`
Serviert Sprite-Bilder

## 🔌 Socket.io Events

### Server → Client

- `talkingheads:animation:start` - Animation startet
- `talkingheads:animation:frame` - Frame-Update
- `talkingheads:animation:end` - Animation endet
- `talkingheads:animation:stop` - Animation sofort stoppen

### Client → Server

- `talkingheads:test` - Test-Animation auslösen

## 🗂️ Datenspeicherung

### Plugin Data Directory

Alle generierten Avatare und Sprites werden im Plugin-Datenverzeichnis gespeichert:

```
user_data/plugin_data/talking-heads/
└── avatars/
    ├── 12345_cartoon_avatar.png
    ├── 12345_cartoon_idle_neutral.png
    ├── 12345_cartoon_blink.png
    ├── 12345_cartoon_speak_closed.png
    ├── 12345_cartoon_speak_mid.png
    └── 12345_cartoon_speak_open.png
```

⚠️ **Wichtig**: Diese Daten bleiben bei Plugin-Updates erhalten!

### Datenbank

Cache-Metadaten werden in der SQLite-Datenbank gespeichert:

**Tabelle**: `talking_heads_cache`

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| user_id | TEXT | TikTok User ID (Primary Key) |
| username | TEXT | TikTok Username |
| style_key | TEXT | Verwendeter Stil |
| avatar_path | TEXT | Pfad zum Avatar-Bild |
| sprite_* | TEXT | Pfade zu Sprite-Frames |
| created_at | INTEGER | Erstellungszeitpunkt |
| last_used | INTEGER | Letzte Verwendung |
| profile_image_url | TEXT | Original-Profilbild-URL |

## 🎯 Sprite-Frame-System

### Frame-Typen

1. **idle_neutral**: Neutraler Ausdruck, Grundpose
2. **blink**: Geschlossene Augen, Blinzeln
3. **speak_closed**: Mund geschlossen, bereit zu sprechen
4. **speak_mid**: Mund halb geöffnet
5. **speak_open**: Mund vollständig geöffnet

### Animations-Zyklus

```
Idle-Phase:
  idle_neutral (3s) → blink (150ms) → idle_neutral (3s) → ...

Speaking-Phase:
  speak_closed → speak_mid → speak_open → speak_mid → repeat
  (150ms pro Frame)
```

## 🚀 Performance & Optimierung

### Caching-Strategie

- **Erster Besuch**: Avatar + Sprites werden generiert (~15-30 Sekunden)
- **Wiederholte Besuche**: Sofortiges Laden aus Cache (<100ms)
- **Cache-Aufräumung**: Automatisch alle 24 Stunden basierend auf Cache-Dauer

### API-Nutzung

- **Neue User**: 6 API-Calls (1 Avatar + 5 Sprites)
- **Gecachte User**: 0 API-Calls
- **Empfehlung**: Cache aktiviert lassen für beste Performance

## 🔒 Sicherheit

- API-Schlüssel werden verschlüsselt in der Datenbank gespeichert
- Sprite-Dateien werden nur über autorisierte Endpunkte serviert
- Rate Limiting auf API-Calls
- Input-Validierung auf allen Endpunkten

## 🐛 Troubleshooting

### Problem: Avatare werden nicht generiert

**Lösung**:
1. Prüfen Sie die API-Konfiguration (API-Schlüssel, URL)
2. Testen Sie die API-Verbindung über "API testen" Button
3. Überprüfen Sie die Logs auf Fehlermeldungen
4. Stellen Sie sicher, dass genügend API-Credits vorhanden sind

### Problem: Animation ruckelt

**Lösung**:
1. Reduzieren Sie die Anzahl gleichzeitiger Animationen
2. Überprüfen Sie die OBS-Leistung
3. Erhöhen Sie die Frame-Dauern in der Konfiguration

### Problem: Cache wird zu groß

**Lösung**:
1. Reduzieren Sie die Cache-Dauer
2. Führen Sie manuelles Cache-Clearing durch
3. Aktivieren Sie automatische Cache-Aufräumung

## 📚 Technische Details

### Verwendete Technologien

- **Node.js**: Server-seitige Logik
- **Socket.io**: Echtzeit-Kommunikation
- **SQLite (better-sqlite3)**: Persistente Datenspeicherung
- **Axios**: HTTP-Requests für API-Calls
- **Sharp** (optional): Bildverarbeitung

### KI-Modell

- **Empfohlen**: FLUX.1-schnell (SiliconFlow)
- **Geschwindigkeit**: ~2-5 Sekunden pro Bild
- **Qualität**: Hochwertige 2D-Avatare mit konsistenter Identität
- **Kosten**: Abhängig vom API-Anbieter

## 🎓 Best Practices

1. **API-Schlüssel schützen**: Niemals in öffentlichen Repositories commiten
2. **Cache aktiviert lassen**: Spart API-Calls und verbessert Performance
3. **Berechtigungen sinnvoll setzen**: Vermeiden Sie zu viele gleichzeitige Animationen
4. **Style konsistent wählen**: Ein Stil pro Stream für visuelles Branding
5. **OBS-Performance beachten**: Maximal 2-3 gleichzeitige Avatare empfohlen

## 📄 Lizenz

Dieses Plugin ist Teil von Pup Cid's Little TikTool Helper und unterliegt der CC-BY-NC-4.0 Lizenz.

## 🆘 Support

Bei Fragen oder Problemen:
1. Überprüfen Sie die Logs in `app/logs/`
2. Konsultieren Sie die Dokumentation
3. Öffnen Sie ein Issue im GitHub-Repository

## 🙏 Credits

- **Entwickelt von**: Pup Cid
- **KI-Modell**: FLUX.1 von Black Forest Labs
- **Inspiration**: Professional TikTok streaming tools

---

**Version**: 1.0.0  
**Letzte Aktualisierung**: 2024
