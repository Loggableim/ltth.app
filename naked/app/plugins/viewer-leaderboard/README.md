# Viewer XP & Leaderboard Plugin

Das **umfassende Viewer XP System** mit integrierter **Echtzeit-Gifter-Bestenliste** - alles in einem konsolidierten Plugin.

## 🎯 Überblick

Dieses Plugin vereint die komplette Viewer-Engagement-Funktionalität in einem einzigen, selbständigen Plugin. Die vorherige Aufteilung in separate Plugins (`viewer-xp` standalone) wurde aufgehoben für eine einfachere Verwaltung.

### **Viewer XP System** (mit integrierter Gifter-Bestenliste)
- Umfassendes Gamification-System mit XP, Levels und Badges
- Persistente Zuschauerdaten über Sessions hinweg
- Daily Bonuses, Streak-System und Watch-Time-Tracking
- Umfangreiche GCCE-Chat-Befehle (`/xp`, `/rank`, `/profile`, `/stats`)
- IFTTT-Integration für automatisierte Events
- Multiple Overlays: XP Bar, Leaderboard, Level-Up-Animationen, User Profile
- **Integrierte Gifter-Bestenliste**: Session und All-Time Tracking von Top-Giftern mit 5 Theme-Designs

## ✨ Vorteile

- **Konsolidierte Architektur**: Alle Funktionen in einem Plugin
- **Einheitliche Verwaltung**: Ein Plugin für alle Systeme
- **Optimierte Performance**: Shared Database-Zugriffe und Event-Handling
- **Nahtlose Integration**: Alle Systeme arbeiten zusammen
- **Einfachere Wartung**: Updates und Konfigurationen an einer Stelle
- **Keine Konflikte**: Kein Risiko mehr von Duplikaten oder Route-Konflikten

## 📦 Installation

1. Das Plugin wird automatisch erkannt, wenn es im `plugins/viewer-leaderboard/` Verzeichnis liegt
2. Aktivierung über das Dashboard oder durch Setzen von `"enabled": true` in `plugin.json`
3. **Wichtig**: Das Standalone-Plugin `viewer-xp` ist veraltet und sollte deaktiviert bleiben
4. **Hinweis**: Das Standalone-Plugin `leaderboard` ist ebenfalls obsolet

## 🚀 Verwendung

### Aktivierung

Im Admin-Dashboard:
1. Navigiere zu "Plugins"
2. Stelle sicher, dass `viewer-xp` deaktiviert ist (veraltet)
3. **Das Standalone-Plugin `leaderboard` ist ebenfalls veraltet**
4. Aktiviere `viewer-leaderboard`
5. Das Plugin ist sofort einsatzbereit mit allen Features

### Zugriff auf Features

**Viewer XP System:**
- Admin Panel: `http://localhost:3000/viewer-xp/admin`
- XP Bar Overlay: `http://localhost:3000/overlay/viewer-xp/xp-bar`
- Leaderboard Overlay: `http://localhost:3000/overlay/viewer-xp/leaderboard`
- Level-Up Overlay: `http://localhost:3000/overlay/viewer-xp/level-up`
- User Profile Overlay: `http://localhost:3000/overlay/viewer-xp/user-profile`

**Gifter Leaderboard (integriert in Viewer XP):**
- Config Panel: `http://localhost:3000/leaderboard/ui`
- Overlay: `http://localhost:3000/leaderboard/overlay`

### Chat Commands (GCCE Integration)

Das Viewer XP System registriert folgende Chat-Befehle:

**XP & Level-Befehle:**
- `/xp [username]` - Zeige XP, Level und Fortschritt
- `/rank [username]` - Zeige Rang im Leaderboard
- `/profile [username]` - Zeige detailliertes Profil im Overlay
- `/stats [username]` - Zeige umfassende Statistiken
- `/top [limit]` - Zeige Top-Viewer im HUD
- `/leaderboard [limit]` - Zeige Leaderboard-Overlay
- `/spin <betrag>` - **NEU!** Drehe das Glücksrad und gewinne/verliere XP

**Currency-Befehle:**
- `/coins [username]` - Zeige Coin-Balance
- `/currency [username]` - Zeige Currency-Statistiken
- `/richest [limit]` - Zeige Top-Spender nach Coins

### 🎰 Spin Wheel (NEU!)

Ein spannendes Glücksrad-Feature, bei dem Zuschauer XP einsetzen können:
- Zuschauer setzen XP mit `/spin <betrag>` (z.B. `/spin 5000`)
- Animiertes Wheel-Overlay mit konfigurierbaren Feldern
- Positive Felder (grün) = XP-Gewinn
- Negative Felder (rot) = XP-Verlust
- Admin-Konfiguration: Min/Max Bet, Anzahl Felder, Feld-Werte
- Vollständiger Spin-Verlauf und Statistiken
- Automatische Zahlenformatierung (1k, 10k, 100k, 1M, etc.)

**Dokumentation:** Siehe [SPIN_WHEEL_GUIDE.md](./SPIN_WHEEL_GUIDE.md)

**Overlay:** `http://localhost:3000/overlay/viewer-xp/spin-wheel`

## 🔧 Technische Details

### Plugin-Architektur

Das Plugin ist jetzt vollständig konsolidiert und selbständig:

```
viewer-leaderboard (Konsolidiertes Plugin)
├── XP System Event Handlers
├── Gifter Leaderboard Event Handlers
├── API Routes (XP + Gifter Leaderboard)
├── WebSocket Handlers (XP + Gifter Leaderboard)
├── Database Backend (SQLite)
└── UI & Overlays

Components:
├── backend/database.js - Viewer XP & Gifter Leaderboard Daten
├── ui/ - Admin Panels für beide Systeme
├── overlays/ - XP Bar, Leaderboard, Level-Up, Profile
└── locales/ - Mehrsprachige Unterstützung
```

**Hinweis:** Alle Funktionen sind direkt im Plugin integriert. Es gibt keine externe Abhängigkeit mehr zu einem separaten viewer-xp Plugin.

### Backward Compatibility

Das Plugin behält alle bisherigen URLs und APIs bei:
- Alle `/viewer-xp/*` Routes funktionieren weiterhin
- Alle `/api/viewer-xp/*` Endpoints bleiben unverändert
- Overlays unter `/overlay/viewer-xp/*` sind verfügbar
- Keine Datenbank-Migration erforderlich

### Error Handling

Bei Initialisierungs-Fehlern:
1. Fehler wird geloggt
2. Plugin-Status wird auf "Error" gesetzt
3. Detaillierte Fehlerinformationen in Server-Logs

### Performance

- **Shared Database**: Alle Systeme nutzen die gleiche SQLite-Datenbank
- **Event Deduplication**: Vermeidung von doppelten TikTok-Event-Handlern
- **Optimized Writes**: Debounced und batched Database-Operations
- **Memory Efficient**: Shared in-memory caches und cooldown-tracking

## 📊 Features im Detail

### Viewer XP System Features (Basisversion)

- **XP für Aktionen**: Chat, Likes, Shares, Follows, Gifts, Watch Time, Subscribe
- **Tier-basierte Gift-XP**: 8 Gift-Tiers mit unterschiedlichen XP-Rewards
- **Level-System**: Konfigurierbare Level-Progression (Linear, Exponentiell, Custom)
- **Daily Bonuses**: Automatische Boni beim ersten Stream-Join des Tages
- **Streak-System**: Bonus-XP für aufeinanderfolgende Tage
- **Badge-System**: Achievements für besondere Leistungen
- **Currency-Integration**: Tracking von Coins und Wealth-Statistics
- **IFTTT-Events**: 6 Trigger und 1 Action für Automation
- **Admin-Tools**: Manuelle XP-Vergabe, Import/Export, Viewer-Management

### ⭐ NEU: Erweiterte Features (v2.1.0 Upgrade)

#### Rate Limiting & Anti-Spam
- **Pro-User-Rate-Limits**: Konfigurierbare Intervalle pro Event-Typ (z.B. Chat max 1/30s)
- **Globale XP-Limits**: Max XP pro 5 Minuten / 1 Stunde zum Schutz vor Abuse
- **Event-Caps**: Hard-Caps für einzelne Events (z.B. max 10k XP pro Gift)
- **Anti-Spam-Dedupe**: Verhindert duplicate Events innerhalb 5s Fenster
- **Min-Interval**: Mindestabstand zwischen beliebigen Events (100ms)

#### XP-Multiplikatoren & Bonus-Systeme
- **Globaler Multiplikator**: 0.1x - 10.0x auf alle XP-Vergaben konfigurierbar
- **Streak-Multiplikator**: Bonus für Tages-Streaks (10% pro Tag, max 2.0x)
- **Gift-Value-basiert**: XP basierend auf Coin-Wert der Gifts (optional)
- **Quantity-basiert**: Berücksichtigung von Gift-Mengen (optional)
- **Custom-Formeln**: Flexible XP-Berechnung pro Event-Typ

#### Vollständige Transparenz & Logging
- **XP Event Log**: Jedes XP-Event wird detailliert geloggt (wann/wo/wieviel)
- **Meta-Daten**: Gift-Wert, Menge, Source, Reason für jedes Event gespeichert
- **Filter & Pagination**: Event-Log-Abfrage mit username, event_type, Zeitraum
- **Export-Funktion**: JSON-Export aller Events mit Filtern
- **Live-Streaming**: Socket.io-basierte Echtzeit-Updates für Overlays
- **Event-Ticker-Overlay**: Neues Live-Event-Overlay zeigt letzte XP-Ereignisse

#### Privacy & Opt-Out
- **User Opt-Out**: Zuschauer können XP-Tracking komplett deaktivieren
- **Privacy-Respekt**: Opt-out User werden nicht in Leaderboards angezeigt
- **Opt-Out-Tracking**: Nachvollziehbar wann/warum User opted-out
- **Granular Control**: Per-User-Basis Opt-Out-Management

#### Erweiterte Konfiguration
- **Zentrale Config-API**: Alle Settings über `/api/viewer-xp/config`
- **Safe Defaults**: Automatische Initialisierung mit sicheren Werten
- **Validierung**: Frontend & Backend-Validierung aller Einstellungen
- **XP-Decay**: Optional - XP verlieren über Zeit (konfigurierbar, default disabled)
- **Badge-Customization**: Icons, Farben, Schwellwerte konfigurierbar
- **Level-Kurven**: Wählbar zwischen linear/exponentiell/custom Tabelle

### Neue API-Endpoints (v2.1.0)

- `GET/POST /api/viewer-xp/config` - Erweiterte Konfiguration verwalten
- `GET /api/viewer-xp/logs` - XP-Event-Logs mit Filtern & Pagination abrufen
- `POST /api/viewer-xp/logs/export` - JSON-Export von Events mit Filtern
- `GET /api/viewer-xp/event-types` - Liste verfügbarer Event-Typen
- `GET /api/viewer-xp/user/:username/summary` - Vollständige User-Info inkl. XP-Progress
- `GET /api/viewer-xp/user/:username/opt-out` - Opt-Out-Status abfragen
- `POST /api/viewer-xp/user/:username/opt-out` - Opt-Out-Status setzen

### Neue Socket-Events (v2.1.0)

- `viewerxp:event` - Live XP-Event-Stream (alle XP-Vergaben)
- `viewerxp:leaderboard-update` - Throttled Leaderboard-Updates (2s Intervall)
- `viewerxp:subscribe-events` - Subscribe zu Event-Stream für Overlays
- `viewerxp:get-recent-events` - Abruf letzter N Events
- `viewerxp:get-leaderboard` - Leaderboard mit Period-Filter (days parameter)

### Integrierte Gifter Leaderboard Features

- **Dual-Tracking**: Session und All-Time Bestenlisten
- **5 Themes**: Neon, Elegant, Gaming, Royal, Gradient
- **Animationen**: Overtake, Rank-Up, New-Entry Effekte
- **Preview-Modus**: Test mit Mock-Daten
- **Performance**: Debounced Writes (5s delay)
- **Real-Time**: WebSocket-basierte Live-Updates
- **Konfigurierbar**: Top Count, Min Coins, Theme-Auswahl

## 🛠️ API Endpoints

### Viewer XP APIs

```
GET  /api/viewer-xp/profile/:username
GET  /api/viewer-xp/stats/:username
GET  /api/viewer-xp/leaderboard?limit=10&days=7
GET  /api/viewer-xp/stats
POST /api/viewer-xp/award
GET  /api/viewer-xp/actions
POST /api/viewer-xp/actions/:actionType
GET  /api/viewer-xp/settings
POST /api/viewer-xp/settings
GET  /api/viewer-xp/level-config
POST /api/viewer-xp/level-config
GET  /api/viewer-xp/level-rewards
POST /api/viewer-xp/level-rewards
POST /api/viewer-xp/import
GET  /api/viewer-xp/export
```

### Gifter Leaderboard APIs (integriert in Viewer XP)

```
GET  /api/plugins/leaderboard/session?limit=10
GET  /api/plugins/leaderboard/alltime?limit=10&minCoins=0
GET  /api/plugins/leaderboard/combined?limit=10
GET  /api/plugins/leaderboard/user/:userId
POST /api/plugins/leaderboard/reset-session
GET  /api/plugins/leaderboard/config
POST /api/plugins/leaderboard/config
GET  /api/plugins/leaderboard/test-data
```

## 🎨 Overlays

### Viewer XP Overlays

1. **XP Bar** (`/overlay/viewer-xp/xp-bar`)
   - Live XP-Fortschritt
   - Level-Anzeige
   - Animierte Updates

2. **XP Leaderboard** (`/overlay/viewer-xp/leaderboard`)
   - Top-Viewer nach XP
   - Zeitraum-Filter (7d, 30d, All-Time)
   - Moderne Animationen

3. **Level-Up** (`/overlay/viewer-xp/level-up`)
   - Celebratory Animationen
   - Konfetti-Effekte
   - Sound-Support

4. **User Profile** (`/overlay/viewer-xp/user-profile`)
   - Detaillierte Stats
   - Badges & Titel
   - Rang-Anzeige

5. **⭐ NEU: Event Ticker** (`/overlay/viewer-xp/event-ticker`)
   - Live XP-Event-Stream
   - Letzte 10-50 Events anzeigen
   - Konfigurierbare Ansicht (Anzahl, Animation, Auto-Scroll)
   - Event-Icons und Farben nach Typ
   - Zeitstempel (relative Zeit)
   - Doppelklick auf Header für Settings

### Gifter Leaderboard Overlays (integriert)

1. **Gifter Leaderboard** (`/leaderboard/overlay`)
   - Session & All-Time Tabs
   - 5 Theme-Designs
   - Overtake-Animationen
   - Crown & Medal Icons

## 🔒 Sicherheit

- **XSS-Schutz**: Alle User-Inputs werden escaped
- **SQL-Injection-Schutz**: Parameterisierte Queries
- **Rate-Limiting**: API-Endpoints sind rate-limited
- **Input-Validation**: Strikte Validierung aller Eingaben
- **Cooldown-System**: Verhindert XP-Spam

## 🐛 Troubleshooting

### Plugin lädt nicht

1. Prüfe, ob `viewer-xp` standalone deaktiviert ist
2. Checke Server-Logs für Fehler-Meldungen
3. Verifiziere, dass alle Dateien vorhanden sind
4. Starte den Server neu

### Doppelte Events

- Deaktiviere das Standalone-Plugin `viewer-xp` vollständig
- Starte den Server neu, um alle Event-Handler zu clearen

### Datenbank-Fehler

1. Prüfe Schreibrechte für SQLite-Datenbank
2. Verifiziere, dass keine anderen Prozesse die DB sperren
3. Checke Logs für spezifische Fehlermeldungen

### Overlays zeigen keine Daten

1. Verifiziere WebSocket-Verbindung in Browser-Console
2. Checke, ob TikTok-Events empfangen werden
3. Prüfe Plugin-Status im Dashboard
4. Teste mit Preview/Test-Modus

## 📝 Entwicklung & Beitrag

### Lokales Testen

```bash
cd app
npm test # Alle Tests ausführen
npm test -- viewer-xp # Viewer XP Tests
npm test -- viewer-leaderboard-master # Master Plugin Tests
```

### Neue Features hinzufügen

1. Feature im Viewer XP Plugin implementieren
2. Teste Standalone-Version zuerst
3. Verifiziere Kompatibilität im Master-Plugin
4. Update README und Dokumentation

## 📄 Lizenz

CC-BY-NC-4.0 - Siehe Haupt-Repository für Details

## 👤 Autor

**Pup Cid** - Creator of "Pup Cid's Little TikTok Helper"

## 🙏 Credits

Dieses Master-Plugin nutzt:
- **Viewer XP System** (v1.0.0) mit integrierter Gifter-Bestenliste

Das Standalone **Gifter Leaderboard** Plugin (v1.1.0) wurde in das Viewer XP System integriert und ist als eigenständiges Plugin veraltet.

---

**Version**: 2.1.0  
**Status**: Development Beta  
**Last Updated**: 2026-01-06  
**Major Upgrade**: v2.1.0 adds rate limiting, anti-spam, full event logging, opt-out system, and live event ticker overlay  
**Breaking Change**: Standalone `leaderboard` plugin ist veraltet - Funktionalität wurde in `viewer-xp` integriert
