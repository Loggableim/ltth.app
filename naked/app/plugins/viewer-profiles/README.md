# Viewer Profiles Plugin

Umfassendes Viewer-Tracking- und Analysesystem für TikTok LIVE Streams mit VIP-Verwaltung, Geburtstags-Tracking, Aktivitäts-Heatmaps und detaillierter Profilverwaltung.

## 🎯 Features

### Automatische Datenerfassung
- **Vollständiges Event-Tracking**: Erfasst alle TikTok-Events (Chat, Gifts, Likes, Shares, Follows)
- **Session-Tracking**: Automatische Watchtime-Erfassung mit Heartbeat-System
- **Geschenkverlauf**: Detaillierte Historie aller erhaltenen Geschenke
- **Interaktions-Logging**: Vollständiges Log aller Viewer-Interaktionen
- **Auto-Update**: Automatische Aktualisierung von Profildaten (Avatar, Display Name, etc.)

### VIP-System
- **Automatische Beförderung**: Basierend auf Coins, Watchtime und Besuchen
- **4 VIP-Stufen**: Bronze, Silver, Gold, Platinum
- **Konfigurierbare Anforderungen**: Anpassbare Schwellenwerte für jede Stufe
- **Manuelle Zuweisung**: Möglichkeit zur manuellen VIP-Vergabe
- **VIP-Badges**: Farbcodierte Badges im Dashboard
- **Real-time Notifications**: Socket.IO-Events bei VIP-Beförderungen

### Geburtstags-System
- **Birthday-Storage**: Speicherung von Geburtstagen (YYYY-MM-DD)
- **Automatische Prüfung**: Täglicher Check um Mitternacht
- **Live-Detection**: Benachrichtigung wenn Birthday-Viewer joined
- **Upcoming Birthdays Widget**: Zeigt kommende Geburtstage an (7 Tage voraus)
- **Altersberechnung**: Automatische Berechnung des Alters

### Aktivitäts-Heatmap
- **7x24 Grid**: Wochentage × Stunden Aktivitätsmatrix
- **Coin-Tracking**: Coins pro Stunde/Tag
- **Globale Peak-Times**: Analyse der aktivsten Zeiten
- **Per-Viewer Heatmaps**: Individuelle Aktivitätsmuster

### Analytics & Statistiken
- **Dashboard-Übersicht**: Total Viewers, Revenue, Avg Watchtime, VIP Count
- **Leaderboards**: Top Spender, Most Active, Most Visits, etc.
- **Detaillierte Profile**: Vollständige Viewer-Historie mit allen Statistiken
- **Export-Funktionen**: CSV/JSON Export mit Filtern

### Dashboard UI
- **Responsive Design**: Mobile-friendly, moderne UI
- **Echtzeit-Updates**: Live-Aktualisierung via Socket.IO
- **Erweiterte Filter**: All/VIP/Active/Favorites
- **Sortierung**: Nach Coins, Watchtime, Visits, Last Seen
- **Suche**: Schnellsuche nach Username/Display Name
- **Detail-Modal**: Umfassende Viewer-Details mit Bearbeitungsmöglichkeiten

## 📊 Datenbank-Schema

### viewer_profiles (Haupttabelle)
```sql
- id, tiktok_username, tiktok_user_id, display_name
- profile_picture_url, bio, age, gender, country, language
- verified, follower_count, following_count
- first_seen_at, last_seen_at, total_visits
- total_watchtime_seconds, total_coins_spent, total_gifts_sent
- total_comments, total_likes, total_shares
- tts_voice, discord_username, birthday, notes, tags
- is_vip, vip_since, vip_tier, loyalty_points
- is_blocked, is_favorite, is_moderator
- created_at, updated_at
```

### viewer_gift_history
```sql
- id, viewer_id, gift_id, gift_name
- gift_coins, gift_diamond_count, quantity, streak_count
- timestamp
```

### viewer_sessions
```sql
- id, viewer_id, joined_at, left_at
- duration_seconds, stream_id
```

### viewer_interactions
```sql
- id, viewer_id, interaction_type, content, timestamp
```

### viewer_activity_heatmap
```sql
- id, viewer_id, hour_of_day, day_of_week
- activity_count, total_coins_in_hour
```

### vip_tier_config
```sql
- id, tier_name, min_coins_spent, min_watchtime_hours
- min_visits, benefits (JSON), badge_color, sort_order
```

## 🚀 Installation

1. Plugin ist bereits im `plugins/viewer-profiles` Verzeichnis
2. Plugin im LTTH Admin-Panel aktivieren
3. Dashboard aufrufen: `http://localhost:3000/viewer-profiles/ui`

## 📡 API Endpoints

### Viewer-Verwaltung
```
GET    /api/viewer-profiles                    # Liste mit Pagination & Filter
GET    /api/viewer-profiles/:username          # Einzelnes Profil
PATCH  /api/viewer-profiles/:username          # Profil aktualisieren
```

### VIP-System
```
POST   /api/viewer-profiles/:username/vip      # VIP setzen/entfernen
GET    /api/viewer-profiles/vip/list           # VIP-Liste
GET    /api/viewer-profiles/vip/tiers          # VIP-Stufen-Config
```

### Analytics
```
GET    /api/viewer-profiles/stats/summary      # Statistik-Übersicht
GET    /api/viewer-profiles/leaderboard        # Leaderboard (type=coins/watchtime/visits)
GET    /api/viewer-profiles/:username/heatmap  # Viewer Heatmap
GET    /api/viewer-profiles/heatmap/global     # Globale Peak-Times
```

### Geburtstage
```
GET    /api/viewer-profiles/birthdays/upcoming # Kommende Geburtstage (days=7)
```

### Export
```
GET    /api/viewer-profiles/export             # CSV/JSON Export (format=csv, filter=all/vip/active)
```

### Sessions
```
GET    /api/viewer-profiles/sessions/active    # Aktive Sessions
```

## 🔌 Socket.IO Events

### Server → Client
```javascript
'viewer:new'             // Neuer Viewer erstellt
'viewer:updated'         // Viewer aktualisiert
'viewer:vip-promoted'    // VIP-Beförderung
'viewer:vip-removed'     // VIP entfernt
'viewer:vip-set'         // VIP manuell gesetzt
'viewer:birthday'        // Geburtstag heute
'viewer:birthday-live'   // Birthday-Viewer joined
'viewer:online'          // Viewer joined stream
'viewer:offline'         // Viewer left stream
```

### Client → Server
```javascript
'viewer-profiles:get'     // Profil abrufen
'viewer-profiles:update'  // Profil aktualisieren
```

## ⚙️ Konfiguration

```javascript
{
  autoVipPromotion: true,       // Automatische VIP-Beförderung
  birthdayReminder: true,       // Geburtstags-Benachrichtigungen
  autoFetchTikTokData: true,    // Auto-Update von TikTok-Daten
  sessionTimeout: 300,          // Session-Timeout in Sekunden
  heatmapEnabled: true          // Heatmap-Tracking aktivieren
}
```

## 📝 Verwendung

### VIP-System
VIP-Beförderung erfolgt automatisch basierend auf:
- **Bronze**: 1.000 Coins, 5h Watchtime, 10 Besuche
- **Silver**: 5.000 Coins, 20h Watchtime, 25 Besuche
- **Gold**: 20.000 Coins, 50h Watchtime, 50 Besuche
- **Platinum**: 100.000 Coins, 200h Watchtime, 100 Besuche

Manuelle VIP-Zuweisung:
```javascript
POST /api/viewer-profiles/username123/vip
Body: { "tier": "Gold" }

// VIP entfernen
POST /api/viewer-profiles/username123/vip
Body: { "remove": true }
```

### Geburtstage
Geburtstag im Format YYYY-MM-DD im Viewer-Detail-Modal eintragen.
System prüft täglich um Mitternacht und benachrichtigt bei Live-Join.

### Export
CSV-Export mit Filter:
```
/api/viewer-profiles/export?format=csv&filter=vip
```

## 🔒 Datenschutz

- Alle Daten werden lokal in SQLite gespeichert
- Keine Daten werden an Dritte übermittelt
- Export-Funktion ermöglicht DSGVO-konforme Datenauskunft
- Viewer können auf Wunsch aus der Datenbank gelöscht werden

## 🐛 Troubleshooting

### Plugin lädt nicht
- Prüfe Server-Logs: `app/logs/`
- Stelle sicher, dass SQLite-Datenbank beschreibbar ist
- Prüfe Plugin-Permissions in `plugin.json`

### Keine Daten werden erfasst
- Prüfe ob TikTok LIVE Connector verbunden ist
- Prüfe Console für JavaScript-Fehler
- Stelle sicher, dass Plugin aktiviert ist

### Session-Tracking funktioniert nicht
- Sessions werden bei TikTok-Events gestartet (Chat, Gift, etc.)
- `streamEnd` Event beendet alle Sessions automatisch
- Heartbeat läuft jede Minute

### API Endpoints geben falsche Antworten
- **Fix (v1.0.1)**: Route-Registrierung wurde korrigiert
- Spezifische Routes (z.B. `/stats/summary`) müssen vor parametrisierten Routes (`:username`) registriert werden
- Express matcht Routes in der Reihenfolge ihrer Registrierung
- Dies verhindert, dass `/stats/summary` als `/:username` mit `username="stats"` interpretiert wird

## 📦 Dependencies

- `better-sqlite3` - SQLite-Datenbank
- `socket.io` - WebSocket-Kommunikation
- `express` - HTTP-Server

## 🔄 Version History

### v1.0.1 (2026-02-01)
- **Fix**: Corrected API route registration order
  - Specific routes now registered before parameterized routes
  - Prevents Express routing conflicts
  - Fixes plugin activation issues

### v1.0.0 (2024)
- Initial Release
- Vollständiges Viewer-Tracking
- VIP-System mit 4 Stufen
- Geburtstags-System
- Aktivitäts-Heatmaps
- Export-Funktionen
- Umfassendes Dashboard

## 👨‍💻 Autor

**Pup Cid**

## 📄 Lizenz

CC-BY-NC-4.0 - Nicht-kommerzielle Nutzung
