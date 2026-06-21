# Sidekick Plugin

Intelligenter Stream-Assistent für LTTH. Sidekick bewertet TikTok LIVE Events, wählt passende Antworten aus und delegiert Sprache, Fish.audio-Stimme, Audio-Routing und Avatar-Reaktionen an AnimazingPal.

## Features

- **AnimazingPal/Fish.audio Delegation**: Sidekick nutzt die gemeinsame AnimazingPal Live-Host-Pipeline für gesprochene Antworten und Avatar-Ausgabe.
- **TikTok Event-Verarbeitung**: Verarbeitet Chat, Gifts, Likes, Joins, Follows, Shares und Subscribes.
- **User Memory System**: Speichert Benutzerinteraktionen mit automatischem Decay.
- **Event Deduplication**: Verhindert doppelte Event-Verarbeitung mit TTL-basierter Dedupe.
- **Rate Limiting**: Token Bucket und Per-User Cooldowns.
- **Message Batching**: Fasst mehrere Nachrichten zu einem Output zusammen.
- **Relevanz-Scoring**: Bewertet Chat-Nachrichten für intelligente Antworten.
- **Stream Analytics**: Echtzeit-Metriken und historische Daten.
- **GCCE Integration**: Chat-Befehle über das GCCE-System.

## Installation

Das Plugin wird automatisch geladen, wenn es im `plugins/sidekick` Verzeichnis vorhanden ist.

## Admin UI

Zugriff über: `/sidekick/ui`

Features:

- Status-Übersicht für Sidekick, AnimazingPal-Verbindung, Queue und Statistiken
- Einstellungen für Assistenzname, Chat-Verarbeitung, Join Greetings und Batching
- Memory-Verwaltung mit Top Usern, Suche und Löschen
- Analytics mit Live Rates und Top Giftern
- Event Log mit Filter nach Typ

## OBS Overlay

URL: `/overlay/sidekick/hud`

Query-Parameter:

- `position`: `top-left`, `top-right`, `bottom-left`, `bottom-right` (Standard: `top-right`)
- `minimal`: `true` für kompakte Ansicht
- `events`: `false` um Events auszublenden
- `maxEvents`: Anzahl der angezeigten Events (Standard: 5)

Beispiel: `/overlay/sidekick/hud?position=bottom-left&minimal=true`

## Chat-Befehle (GCCE)

- `!sidekick status` - Zeigt aktuellen Status
- `!sidekick mute [on|off]` - Mute/Unmute
- `!sidekick joins [on|off]` - Join Greetings ein/aus
- `!sidekick threshold <0-1>` - Reply Threshold setzen
- `!sidekick memory [clear]` - Memory-Statistiken oder löschen

Kurzform: `!sk <subcommand>`

## API Endpoints

### Status & Control

- `GET /api/sidekick/status` - Aktueller Status
- `GET /api/sidekick/config` - Konfiguration abrufen
- `POST /api/sidekick/config` - Konfiguration aktualisieren
- `POST /api/sidekick/mute` - Mute togglen
- `POST /api/sidekick/reset` - Session zurücksetzen

### AnimazingPal Bridge

Diese Endpoints steuern die gemeinsame AnimazingPal-Verbindung und sprechen Testausgaben über die gemeinsame Fish.audio-Pipeline.

- `GET /api/sidekick/animaze/status` - Status der AnimazingPal-Ausgabe
- `POST /api/sidekick/animaze/connect` - AnimazingPal verbinden
- `POST /api/sidekick/animaze/disconnect` - AnimazingPal trennen
- `POST /api/sidekick/animaze/test` - Test-Nachricht über AnimazingPal/Fish.audio sprechen

### Memory

- `GET /api/sidekick/memory/stats` - Memory-Statistiken
- `GET /api/sidekick/memory/:uid` - Benutzer-Daten abrufen
- `GET /api/sidekick/memory/search?q=...` - Benutzer suchen
- `GET /api/sidekick/memory/top?limit=10` - Top User
- `POST /api/sidekick/memory/clear` - Alle Daten löschen

### Analytics

- `GET /api/sidekick/metrics` - Aktuelle Metriken
- `GET /api/sidekick/metrics/history` - Historische Daten
- `GET /api/sidekick/analytics` - Event-Analytik
- `GET /api/sidekick/events?type=...&limit=50` - Event Log

### Internal

- `GET /api/sidekick/deduper/stats` - Deduper-Statistiken
- `GET /api/sidekick/ratelimit/status` - Rate Limiter Status
- `GET /api/sidekick/outbox/status` - Outbox-Status
- `POST /api/sidekick/outbox/flush` - Outbox manuell flushen

## Konfiguration

Die Konfiguration wird in der LTTH-Datenbank gespeichert und kann über die UI oder API angepasst werden.

### Wichtige Einstellungen

- `output.eventType`: Event-Typ für Sidekick-Ausgaben an AnimazingPal
- `output.username`: Anzeigename der Assistenz
- `comment.enabled`: Chat-Verarbeitung aktivieren
- `comment.replyThreshold`: Relevanz-Schwellenwert (0-1)
- `comment.globalCooldown`: Globaler Cooldown in Sekunden
- `joinRules.enabled`: Join Greetings aktivieren
- `outbox.windowSeconds`: Batch-Fenster in Sekunden
- `muted`: Alle Ausgaben stummschalten

## Socket.io Events

- `sidekick:status` - Status-Updates

## Technische Details

### Architektur

```text
sidekick/
├── main.js              # Plugin Entry Point
├── plugin.json          # Plugin Manifest
├── ui.html              # Admin UI
├── backend/
│   ├── config.js        # Konfigurationsverwaltung
│   ├── memoryStore.js   # User Memory (SQLite)
│   ├── eventBus.js      # Event System
│   ├── deduper.js       # Event Deduplication
│   ├── rateLimit.js     # Rate Limiting
│   ├── responseEngine.js # Relevanz-Scoring
│   ├── outboxBatcher.js # Message Batching
│   └── metrics.js       # Analytics
└── overlay/
    └── sidekick-hud.html # OBS Overlay
```

Sidekick erzeugt keine eigene Avatar- oder Sprachverbindung. Ausgewählte Viewer-Events und Host-Speech werden an AnimazingPal delegiert; AnimazingPal übernimmt Brain-Verarbeitung, Fish.audio-Ausgabe und Avatar-Aktion.

### Datenbank-Tabellen

- `sidekick_memory`: User-Daten und Interaktionshistorie

## Lizenz

CC-BY-NC-4.0 (wie LTTH Hauptprojekt)
