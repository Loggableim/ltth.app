# AnimazingPal Plugin

Integration mit der Animaze Desktop API für VTuber Avatar-Steuerung über TikTok LIVE Events.

## 📋 Übersicht

Dieses Plugin verbindet PupCid's Little TikTool Helper mit der Animaze Desktop Anwendung über die WebSocket API. Damit können TikTok LIVE Events (Geschenke, Follows, Chat, etc.) automatisch Animationen, Emotes und ChatPal-Nachrichten in deinem VTuber Avatar auslösen.

## ✨ Features

- **WebSocket-Verbindung** zu Animaze (Standard: `ws://localhost:8008`)
- **TikTok Events → Animaze Aktionen**:
  - Geschenke → Emotes, Spezialaktionen, Posen, Idle-Animationen
  - Follows → Avatar-Reaktionen
  - Shares → Dankesnachrichten
  - Subscribes → Spezielle Animationen
  - Likes → Reaktionen bei vielen Likes
- **ChatPal Integration**:
  - TikTok Chat an ChatPal weiterleiten
  - KI-Antworten oder nur TTS (Echo-Modus)
- **Gift Mappings**: Verknüpfe spezifische Geschenke mit spezifischen Aktionen
- **Admin UI**: Vollständige Konfigurationsoberfläche

## 🧠 Brain Engine - KI-Intelligenz System

Die Brain Engine ist ein fortschrittliches KI-System, das deinen VTuber Avatar wie einen echten Livestreamer denken und reagieren lässt.

### Architektur-Konzept

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Datenbank     │ ←── │  Vector Memory   │ ──→ │    GPT Brain    │
│ (Nervensystem)  │     │    (Synapsen)    │     │(Großhirnrinde)  │
│                 │     │                  │     │                 │
│ • Erinnerungen  │     │ • Semantische    │     │ • Reasoning     │
│ • User-Profile  │     │   Verknüpfungen  │     │ • Generierung   │
│ • Archiv        │     │ • Ähnlichkeits-  │     │ • Persönlichkeit│
└────────┬────────┘     │   suche          │     └────────┬────────┘
         │              └──────────────────┘              │
         │                                                │
         └──────────────────┬─────────────────────────────┘
                            ▼
                    ┌───────────────┐
                    │    Animaze    │
                    │  (Körper &    │
                    │    Stimme)    │
                    └───────────────┘
```

### Features der Brain Engine

- **🧠 Langzeit-Gedächtnis**: Speichert Interaktionen mit Zuschauern dauerhaft
- **👥 User-Profile**: Merkt sich jeden Zuschauer und seine Gewohnheiten
- **🔗 Semantische Verknüpfungen**: Findet zusammenhängende Erinnerungen durch Vektoren
- **🎭 Persönlichkeiten**: Wählbare Streamer-Persönlichkeiten
- **📚 Archiv-System**: Komprimiert und speichert alte Erinnerungen
- **💬 Intelligente Antworten**: GPT-basierte kontextuelle Reaktionen
- **⚡ Effizient**: Optimiert für GPT-5 Nano / GPT-4o-mini

### Persönlichkeiten

Wähle aus vordefinierten Persönlichkeiten oder erstelle eigene:

| Persönlichkeit | Beschreibung |
|----------------|--------------|
| **Freundlicher Streamer** | Warmherzig, enthusiastisch, begrüßt jeden herzlich |
| **Gaming Pro** | Kompetitiv, analytisch, trockener Humor |
| **Entertainer** | Charismatisch, witzig, energetisch |
| **Chill Vibes** | Entspannt, ruhig, tiefgründig |
| **Anime Fan** | Enthusiastisch, verwendet japanische Ausdrücke |

### Konfiguration Brain Engine

```javascript
brain: {
  enabled: false,              // Brain aktivieren
  openaiApiKey: "sk-...",      // OpenAI API Key
  model: "gpt-4o-mini",        // Empfohlen für Effizienz
  activePersonality: null,     // Aktive Persönlichkeit
  
  // Memory-Einstellungen
  memoryImportanceThreshold: 0.3,
  maxContextMemories: 10,
  archiveAfterDays: 7,
  pruneAfterDays: 30,
  
  // Auto-Response
  autoRespond: {
    chat: false,               // Auf Chat antworten
    gifts: true,               // Für Geschenke danken
    follows: true,             // Neue Follower begrüßen
    shares: false              // Für Shares danken
  },
  
  // Rate Limiting
  maxResponsesPerMinute: 10,
  chatResponseProbability: 0.3  // 30% der Chats beantworten
}
```

### Brain API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/brain/status` | Brain-Status und Statistiken |
| POST | `/api/animazingpal/brain/config` | Brain konfigurieren |
| POST | `/api/animazingpal/brain/test` | GPT-Verbindung testen |
| GET | `/api/animazingpal/brain/personalities` | Alle Persönlichkeiten |
| POST | `/api/animazingpal/brain/personality/set` | Persönlichkeit aktivieren |
| POST | `/api/animazingpal/brain/personality/create` | Neue Persönlichkeit |
| GET | `/api/animazingpal/brain/memories/search` | Erinnerungen suchen |
| GET | `/api/animazingpal/brain/user/:username` | User-Profil abrufen |
| GET | `/api/animazingpal/brain/user/:username/history` | Interaktions-Historie abrufen |
| POST | `/api/animazingpal/brain/user/:username/update` | User-Profil aktualisieren |
| GET | `/api/animazingpal/brain/supporters` | Top-Unterstützer abrufen |
| GET | `/api/animazingpal/brain/chatters` | Häufigste Chatter abrufen |
| POST | `/api/animazingpal/brain/chat` | Manuell Chat-Antwort |
| POST | `/api/animazingpal/brain/archive` | Alte Erinnerungen archivieren |

### 🔄 Langzeit-Gedächtnis System

Das Langzeit-Gedächtnis ermöglicht es AnimazingPal, sich über mehrere Streams hinweg an Zuschauer zu erinnern und personalisierte Interaktionen aufzubauen.

#### Features

- **🔢 Stream-Zähler**: Verfolgt, wie oft ein Zuschauer bei deinen Streams war
- **📜 Interaktions-Historie**: Speichert die letzten 50 Interaktionen pro Zuschauer
- **💭 Letzte Themen**: Merkt sich, worüber du mit jedem Zuschauer gesprochen hast
- **📊 Statistiken**: Geschenk-Zähler, Diamanten-Summen, Chat-Häufigkeit
- **🎯 Personalisierung**: Verwendet vergangene Interaktionen für kontextbezogene Antworten

#### Konfiguration

```javascript
brain: {
  enabled: true,
  longTermMemory: true,        // Langzeit-Gedächtnis aktivieren
  memoryImportanceThreshold: 0.3,
  maxContextMemories: 10,      // Max. Erinnerungen im Kontext
  archiveAfterDays: 7,         // Alte Erinnerungen archivieren
  pruneAfterDays: 30,          // Unwichtige Erinnerungen löschen
  // ...
}
```

#### User-Profil Struktur

Jedes User-Profil enthält:
- `username` - TikTok Username
- `nickname` - TikTok Display Name
- `first_seen` - Erste Interaktion
- `last_seen` - Letzte Aktivität
- `last_interaction` - Letzte Interaktion (detailliert)
- `interaction_count` - Anzahl der Interaktionen
- `stream_count` - Anzahl der besuchten Streams
- `gift_count` - Anzahl der Geschenke
- `total_diamonds` - Summe der geschenkten Diamanten
- `last_topic` - Letztes Gesprächsthema
- `interaction_history` - Detaillierte Historie (letzte 50)
- `relationship_level` - Beziehungsstufe (stranger, regular, vip)
- `personality_notes` - Notizen über den Zuschauer
- `favorite_topics` - Bevorzugte Themen

#### Beispiel: Personalisierte Antwort

```javascript
// Zuschauer kehrt nach 3 Streams zurück
const profile = await getUser('max_gaming');
// profile.stream_count = 4
// profile.last_topic = 'minecraft'
// profile.interaction_history zeigt vergangene Geschenke

// Brain generiert:
"Hey Max! Schön dich wiederzusehen! 
 Hast du in Minecraft das Projekt von letztem Mal fertiggestellt?"
```

#### API-Beispiele

**Interaktions-Historie abrufen:**
```javascript
GET /api/animazingpal/brain/user/max_gaming/history?limit=10

Response:
{
  "success": true,
  "username": "max_gaming",
  "history": [
    {
      "type": "chat",
      "content": "Wie geht's?",
      "timestamp": "2026-01-16T18:00:00Z",
      "sessionId": "session_123"
    },
    {
      "type": "gift",
      "content": "Rose",
      "timestamp": "2026-01-16T18:05:00Z",
      "diamonds": 1
    }
  ]
}
```

**Top-Unterstützer abrufen:**
```javascript
GET /api/animazingpal/brain/supporters?limit=5

Response:
{
  "success": true,
  "supporters": [
    {
      "username": "generous_viewer",
      "total_diamonds": 5000,
      "gift_count": 50,
      "stream_count": 10
    }
  ]
}
```

## 🚀 Setup

### Voraussetzungen

1. **Animaze Desktop** muss installiert und geöffnet sein
2. **Animaze API aktivieren**: Gehe in Animaze zu `Settings > Animaze API > Enabled`
3. Der Standard-Port ist `8008` (kann in Animaze und Plugin geändert werden)
4. **Für Brain Engine**: OpenAI API Key

### Plugin aktivieren

1. Aktiviere das AnimazingPal Plugin in den Plugin-Einstellungen
2. Öffne die Plugin-UI über die Admin-Oberfläche
3. Klicke auf "Verbinden" um die Verbindung zu Animaze herzustellen
4. Bei erfolgreicher Verbindung werden automatisch alle verfügbaren Avatare, Emotes, etc. geladen

### Brain Engine aktivieren

1. Gehe zu den Brain-Einstellungen in der Plugin-UI
2. Trage deinen OpenAI API Key ein
3. Wähle eine Persönlichkeit aus
4. Aktiviere die gewünschten Auto-Response Optionen
5. Teste die Verbindung

## ⚙️ Konfiguration

### Verbindungseinstellungen

| Einstellung | Standard | Beschreibung |
|------------|----------|--------------|
| Host | `127.0.0.1` | IP-Adresse von Animaze |
| Port | `9000` | WebSocket Port |
| Automatisch verbinden | ✅ | Verbinde automatisch beim Start |
| Automatisch neu verbinden | ✅ | Versuche bei Verbindungsabbruch neu zu verbinden |

### Event Aktionen

Für jedes TikTok Event (Follow, Share, Subscribe, Like) kannst du konfigurieren:

- **Aktionstyp**: Emote, Spezialaktion, Pose, Idle Animation
- **Aktion**: Die spezifische Animation aus Animaze
- **ChatPal Nachricht**: Optional eine Nachricht, die der Avatar spricht

**Platzhalter für Nachrichten:**
- `{username}` - TikTok Username
- `{nickname}` - TikTok Nickname
- `{giftName}` - Name des Geschenks
- `{count}` - Anzahl der Geschenke

### Gift Mappings

Erstelle Verknüpfungen zwischen TikTok Geschenken und Animaze Aktionen:

```json
{
  "giftId": 5655,
  "giftName": "Rose",
  "actionType": "emote",
  "actionValue": "Emote_Happy",
  "chatMessage": "Danke für die Rose, {username}!"
}
```

### Chat zu Avatar

Wenn aktiviert, werden TikTok Chat-Nachrichten an ChatPal weitergeleitet:

- **Nur TTS**: Avatar spricht die Nachricht ohne KI-Antwort
- **Mit KI**: ChatPal verarbeitet die Nachricht und antwortet intelligent
- **Prefix**: Optionaler Text vor jeder Nachricht (z.B. "[TikTok]")
- **Max. Länge**: Maximale Zeichenanzahl pro Nachricht

## 🔌 API Endpoints

### Status & Verbindung

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/status` | Plugin-Status abrufen |
| POST | `/api/animazingpal/connect` | Zu Animaze verbinden |
| POST | `/api/animazingpal/disconnect` | Verbindung trennen |
| POST | `/api/animazingpal/refresh` | Animaze-Daten aktualisieren |
| POST | `/api/animazingpal/test` | Verbindung testen |

### Animaze Aktionen

| Methode | Endpoint | Body | Beschreibung |
|---------|----------|------|--------------|
| GET | `/api/animazingpal/avatars` | - | Verfügbare Avatare |
| POST | `/api/animazingpal/avatar/load` | `{name}` | Avatar laden |
| GET | `/api/animazingpal/emotes` | - | Verfügbare Emotes |
| POST | `/api/animazingpal/emote` | `{itemName}` | Emote auslösen |
| GET | `/api/animazingpal/special-actions` | - | Spezialaktionen |
| POST | `/api/animazingpal/special-action` | `{index}` | Spezialaktion auslösen |
| GET | `/api/animazingpal/poses` | - | Verfügbare Posen |
| POST | `/api/animazingpal/pose` | `{index}` | Pose auslösen |
| GET | `/api/animazingpal/idles` | - | Idle Animationen |
| POST | `/api/animazingpal/idle` | `{index}` | Idle Animation auslösen |
| POST | `/api/animazingpal/chatpal` | `{message, useEcho}` | ChatPal Nachricht |
| POST | `/api/animazingpal/calibrate` | - | Tracker kalibrieren |
| POST | `/api/animazingpal/broadcast` | `{toggle}` | Virtual Camera ein/aus |

### Konfiguration

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/config` | Konfiguration abrufen |
| POST | `/api/animazingpal/config` | Konfiguration aktualisieren |
| GET | `/api/animazingpal/gift-mappings` | Gift Mappings abrufen |
| POST | `/api/animazingpal/gift-mappings` | Gift Mappings aktualisieren |

## 🔊 Socket.IO Events

### Empfangen

| Event | Beschreibung |
|-------|--------------|
| `animazingpal:status` | Status-Update |
| `animazingpal:data-refreshed` | Neue Animaze-Daten |
| `animazingpal:speech-start` | ChatPal beginnt zu sprechen |
| `animazingpal:speech-end` | ChatPal hat fertig gesprochen |
| `animazingpal:avatar-changed` | Avatar wurde gewechselt |
| `animazingpal:chatpal-response` | ChatPal KI-Antwort |
| `animazingpal:emote-triggered` | Emote wurde ausgelöst |
| `animazingpal:gift-handled` | Gift wurde verarbeitet |
| `animazingpal:brain-response` | Brain Engine Antwort |

### Senden

| Event | Daten | Beschreibung |
|-------|-------|--------------|
| `animazingpal:get-status` | - | Status anfordern |
| `animazingpal:connect` | - | Verbinden |
| `animazingpal:disconnect` | - | Trennen |
| `animazingpal:refresh` | - | Daten aktualisieren |
| `animazingpal:emote` | `{itemName}` | Emote auslösen |
| `animazingpal:chatpal` | `{message, useEcho}` | ChatPal Nachricht |

## 📚 Animaze API Referenz

Dieses Plugin nutzt die offizielle Animaze WebSocket API. Die vollständige Dokumentation findest du in `docs/HD-Animaze API-191225-203810.pdf`.

### Wichtige Animaze Aktionen

| Aktion | Beschreibung |
|--------|--------------|
| `LoadAvatar` | Avatar laden |
| `LoadScene` | Szene laden |
| `TriggerEmote` | Emote auslösen |
| `TriggerSpecialAction` | Spezialaktion auslösen |
| `TriggerPose` | Pose einnehmen |
| `TriggerIdle` | Idle Animation starten |
| `ChatbotSendMessage` | ChatPal Nachricht |
| `CalibrateTracker` | Tracker kalibrieren |
| `Broadcast` | Virtual Camera ein/aus |

## 🐛 Troubleshooting

### Verbindung schlägt fehl

1. Stelle sicher, dass Animaze geöffnet ist
2. Prüfe ob die API aktiviert ist: `Settings > Animaze API > Enabled`
3. Prüfe den Port in Animaze und im Plugin
4. Firewall-Einstellungen prüfen

### Emotes werden nicht ausgelöst

1. Stelle sicher, dass ein Avatar geladen ist
2. Aktualisiere die Animaze-Daten (🔄 Button)
3. Prüfe ob das Emote zum aktuellen Avatar gehört

### ChatPal antwortet nicht

1. Stelle sicher, dass ChatPal in Animaze konfiguriert ist
2. Prüfe die OpenAI API-Einstellungen in Animaze
3. Nutze den Echo-Modus für reines TTS ohne KI

### Brain Engine funktioniert nicht

1. Prüfe ob der OpenAI API Key gültig ist
2. Teste die Verbindung mit dem Test-Button
3. Prüfe ob eine Persönlichkeit ausgewählt ist
4. Überprüfe die Rate-Limits

## 🤖 Standalone Mode - Autonomer Host ohne GPT

Der Standalone-Modus ermöglicht es AnimazingPal, vollständig autonom als Host zu agieren, ohne OpenAI GPT-Aufrufe. Perfekt für TTS-only Streams oder wenn du GPT-Kosten sparen möchtest.

### Features

- **🔇 TTS-Only Modus**: Nutzt ChatPal nur für Text-to-Speech ohne KI-Antworten
- **📝 Template-basierte Antworten**: Verwendet Persona-Catchphrases für Responses
- **🎯 Logic Matrix**: Event-gesteuerte Aktionen mit intelligenten Regeln
- **💾 Memory Logging**: Speichert weiterhin Erinnerungen für spätere GPT-Nutzung
- **🔄 Umschaltbar**: Einfaches Wechseln zwischen Standalone und GPT-Modus

### Konfiguration

```javascript
brain: {
  enabled: true,
  standaloneMode: true,              // Aktiviert Standalone-Modus
  forceTtsOnlyOnActions: true,       // Erzwingt -echo für alle Event-Aktionen
  // ...
}

eventActions: {
  follow: {
    enabled: true,
    actionType: 'emote',
    actionValue: 'Happy',
    chatMessage: 'Welcome {username}!',
    useEcho: true                    // Per-Event Echo-Override
  }
}
```

### Echo-Override Priorität

Die Echo-Einstellung wird in folgender Priorität angewendet:
1. **Per-Event Override** (`eventActions.follow.useEcho`)
2. **Force TTS-Only** (`brain.forceTtsOnlyOnActions`)
3. **Global Setting** (`chatToAvatar.useEcho`)

### Standalone Response Flow

```
TikTok Event → Logic Matrix → Template Response → TTS
             ↓
        Memory Logging (für spätere GPT-Nutzung)
```

## 🎯 Logic Matrix - Event-Driven Actions

Die Logic Matrix ermöglicht es dir, intelligente Regeln zu erstellen, die automatisch passende Aktionen basierend auf Event-Eigenschaften auslösen.

### Rule Structure

```javascript
logicMatrix: {
  enabled: true,
  rules: [
    {
      id: 'high-value-gift',
      name: 'Teure Geschenke',
      priority: 10,                  // Höhere Priorität = zuerst geprüft
      stopOnMatch: true,             // Stoppe nach dieser Regel
      conditions: {
        eventType: 'gift',
        giftValueTier: 'high',       // low/medium/high
        userIsNew: false
      },
      actions: {
        emote: 'Excited',
        specialAction: 0,
        chatMessage: 'WOW! Vielen Dank {username} für {giftName}!'
      }
    }
  ]
}
```

### Match Conditions

| Condition | Beschreibung | Werte |
|-----------|--------------|-------|
| `eventType` | Event-Typ | gift, follow, share, subscribe, like, chat |
| `giftValueTier` | Geschenk-Wert-Stufe | low (<10), medium (10-99), high (100+) |
| `userIsNew` | Ist neuer Zuschauer | true/false |
| `mentions` | Keywords im Chat | Array von Strings |
| `energyLevel` | Stream-Energie-Level | low/medium/high (Platzhalter) |
| `personaTag` | Persona-Tag Matching | String-Tag |

### Actions

- `emote` - Emote-Name auslösen
- `specialAction` - Special Action Index
- `pose` - Pose Index
- `idle` - Idle Animation Index
- `chatMessage` - ChatPal-Nachricht mit Platzhaltern

### Testing

```bash
POST /api/animazingpal/logic-matrix/test
{
  "eventType": "gift",
  "eventData": {
    "giftValue": 150,
    "username": "testuser"
  }
}
```

## 🧠 Enhanced Memory System

Das erweiterte Memory-System nutzt kombinierte Scoring-Metriken für optimale Erinnerungs-Auswahl.

### Memory Scoring

Jede Erinnerung wird mit einem kombinierten Score bewertet:

```
Score = (semantic × 0.3) + (importance × 0.3) + (recency × 0.2) + (usage × 0.1) + (decay × 0.1)
```

#### Scoring-Faktoren

1. **Semantic** (30%): Semantische Ähnlichkeit zum Query (Vektor-basiert)
2. **Importance** (30%): Manuelle Wichtigkeits-Bewertung (0.0-1.0)
3. **Recency** (20%): Wie neu ist die Erinnerung
4. **Usage** (10%): Wie oft wurde auf sie zugegriffen
5. **Decay** (10%): Zeit-basierter Verfall

### Memory Decay

Memories verlieren mit der Zeit an Wichtigkeit basierend auf der `memoryDecayHalfLife` Einstellung:

```javascript
brain: {
  memoryDecayHalfLife: 7  // Tage bis zur Halbierung der Importance
}
```

**Decay-Formel:**
```
decay = 0.5 ^ (age_in_days / half_life)
```

### Access Tracking

Jeder Speicher-Zugriff wird getrackt:
- `access_count` - Anzahl der Zugriffe
- `last_accessed` - Letzter Zugriffszeitpunkt

Dies hilft, häufig genutzte Erinnerungen höher zu priorisieren.

### Memory Types

- `interaction` - Normale Interaktionen
- `chat` - Chat-Nachrichten
- `gift` - Geschenke
- `follow` - Follows
- `share` - Shares
- `subscribe` - Subscriptions
- `important` - Manuell markierte wichtige Events

## 📝 Changelog

### Version 1.2.0 (2026-02-03) 🎉

**🔧 Kritische Fixes:**
- ❌ Entfernt: Dupliziertes Plugin-Verzeichnis auf Root-Ebene
- 🔌 Port-Änderung: Standard-Port von 9000 auf 8008 geändert (konsistent mit Animaze)
- 🐛 Memory Leak Fix: `pendingRequests` werden jetzt beim Disconnect korrekt geleert
- ⏱️ Per-User Cooldowns: Cooldowns sind jetzt pro Benutzer statt global
- 🔄 Auto-Connect Verbesserung: Bessere Fehlerbehandlung und Status-Emittierung
- 🛡️ Data Validation: Validierung für Gift Mappings hinzugefügt
- 🧠 Brain Engine: Robustes Error-Handling mit Graceful Fallback

**🎨 UI Verbesserungen:**
- 🎁 NEU: Gift Event UI-Section in Event Aktionen Tab
- 💬 NEU: Chat Event UI-Section in Event Aktionen Tab
- 🎛️ NEU: Override Behaviors UI mit Toggle-Switches in Settings Tab
- 📬 NEU: Toast Queue System für sequentielle Benachrichtigungen
- 🎭 NEU: Vollständige Personality CRUD UI mit Create/Edit/Delete Funktionen

**🔗 Backend-Erweiterungen:**
- ➕ Logic Matrix Routes: `GET /api/animazingpal/logic-matrix/rules`
- 🗑️ Logic Matrix Routes: `DELETE /api/animazingpal/logic-matrix/rules/:id`
- ✅ Gift Mappings Validation in POST Route

**⚙️ Konfiguration:**
- Gift Event: Standard-Aktion auf `emote` gesetzt mit Beispiel-Nachricht
- Default Port: 8008 (vorher 9000)

### Version 1.1.0
- **NEU**: Brain Engine - KI-Intelligenz System
  - Langzeit-Gedächtnis mit Vektoren-basierter semantischer Suche
  - User-Profile und Beziehungs-Tracking
  - Wählbare Streamer-Persönlichkeiten
  - GPT-basierte intelligente Antworten
  - Archiv-System für alte Erinnerungen
- **NEU**: Standalone Mode - TTS-only Betrieb ohne GPT
  - Template-basierte Antworten mit Persona-Catchphrases
  - Per-Event Echo-Override Einstellungen
  - Force TTS-Only auf Actions
- **NEU**: Logic Matrix System
  - Event-gesteuerte intelligente Aktionen
  - Priorisierte Regel-Evaluation
  - Test-Endpoint für Regeln
- **NEU**: Enhanced Memory System
  - Kombiniertes Scoring (semantic, importance, recency, usage, decay)
  - Memory Decay mit konfigurierbarer Half-Life
  - Access Tracking für häufig genutzte Memories
- **NEU**: Persona Management
  - CRUD API Endpoints für Personas
  - Hot-Reload aktiver Personas
- Verbesserte UI mit neuen Einstellungen und Logic Matrix Tab

### Version 1.0.0
- Initiale Veröffentlichung
- WebSocket-Verbindung zu Animaze
- TikTok Event Integration
- ChatPal Integration
- Admin UI
- Gift Mappings

## 📜 Lizenz

Dieses Plugin ist Teil von PupCid's Little TikTool Helper und unterliegt der CC-BY-NC-4.0 Lizenz.
