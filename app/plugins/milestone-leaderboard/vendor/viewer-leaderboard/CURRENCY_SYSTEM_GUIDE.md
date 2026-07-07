# Viewer XP Currency System - Complete Guide

## Übersicht

Viewer XP dient nun als **systemweites Währungssystem** und integriert sich vollständig mit:
- **GCCE (Global Chat Command Engine)** für Chat-Befehle und HUD-Anzeige
- **Shared User Statistics** (user_statistics Tabelle) für Währungsverfolgung
- **IFTTT Engine** für Automatisierungen und Events

## 🪙 Währungssystem (Currency System)

### Was sind Coins?

**Coins** sind die Hauptwährung im System und werden automatisch für folgende Aktionen vergeben:
- **Geschenke senden**: Coin-Wert = Diamanten × Wiederholungen
- Coins werden in der `user_statistics` Tabelle gespeichert
- Coins sind **plattformübergreifend** - alle Plugins können darauf zugreifen

### XP vs. Coins

| Feature | XP (Experience Points) | Coins (Currency) |
|---------|------------------------|------------------|
| **Zweck** | Level-Progression, Badges | Währung, Reichtum |
| **Quelle** | Alle Aktionen (Chat, Likes, etc.) | Hauptsächlich Geschenke |
| **Speicherung** | `viewer_profiles` Tabelle | `user_statistics` Tabelle |
| **Sichtbarkeit** | Plugin-spezifisch | Systemweit verfügbar |

## 💬 GCCE Chat-Befehle

### Kombinierte XP & Currency Befehle

#### `/xp [username]`
Zeigt Level, XP-Fortschritt **und Coin-Balance**.

**Syntax:**
```
/xp              → Eigene XP und Coins
/xp username     → XP und Coins eines anderen Users
```

**Ausgabe:**
```
username: Level 5 | 600/900 XP (66.7%) | 💰 1,500 Coins
```

#### `/stats [username]`
Zeigt detaillierte Statistiken inklusive XP **und Currency**.

**Syntax:**
```
/stats           → Eigene Stats
/stats username  → Stats eines anderen Users
```

**Ausgabe:**
```
📊 username's Stats | Level 5 | Rank #15 | ⭐ 5,420 Total XP | 
💰 1,500 Coins | 🎁 12 Gifts | 🔥 7 day streak | ⏱️ 2h 30m watch time
```

### Neue Currency-Spezifische Befehle

#### `/coins [username]`
Zeigt nur die Coin-Balance (Währung).

**Syntax:**
```
/coins           → Eigene Coins
/coins username  → Coins eines anderen Users
```

**Ausgabe:**
```
username: 💰 1,500 Coins | 🎁 12 Gifts Sent
```

**Kategorie:** Currency  
**Berechtigung:** all (jeder)

#### `/currency [username]`
Zeigt detaillierte Währungsstatistiken.

**Syntax:**
```
/currency           → Eigene Currency Stats
/currency username  → Currency Stats eines anderen Users
```

**Ausgabe:**
```
💰 username's Currency Stats | 1,500 Coins | Rank #8 | 
🎁 12 Gifts | 💬 45 Comments | ❤️ 23 Likes | 📢 5 Shares
```

**Kategorie:** Currency  
**Berechtigung:** all (jeder)

#### `/richest [anzahl]`
Zeigt die reichsten Zuschauer nach Coin-Balance.

**Syntax:**
```
/richest       → Top 5 reichste Zuschauer
/richest 10    → Top 10 reichste Zuschauer (max. 10)
```

**Ausgabe:**
```
💎 Top 5 Richest Viewers: 
#1 bigspender: 💰 50,000 Coins | #2 giftlord: 💰 25,000 Coins | 
#3 generous: 💰 15,000 Coins | #4 supporter: 💰 8,500 Coins | 
#5 donor: 💰 6,200 Coins
```

**Kategorie:** Currency  
**Berechtigung:** all (jeder)

## 🔔 IFTTT Events (Automatisierungen)

### Neue Currency-Events

#### `viewer-xp:currency-milestone`
Wird ausgelöst, wenn ein Zuschauer einen Währungs-Meilenstein erreicht.

**Meilensteine:**
- 100 Coins
- 1,000 Coins
- 10,000 Coins
- 100,000 Coins

**Event-Felder:**
- `username` (string): Benutzername
- `coins` (number): Gesamte Coins
- `milestone` (number): Erreichter Meilenstein
- `rank` (number): Rang auf der Reichtums-Bestenliste

**Beispiel-Verwendung:**
- Sende Benachrichtigung bei 1,000 Coins
- Zeige spezielle Animation bei 10,000 Coins
- Verleihe Badge bei Meilenstein-Erreichen

#### `viewer-xp:top-spender`
Wird ausgelöst, wenn ein Zuschauer in die Top 3 der reichsten Zuschauer aufsteigt.

**Event-Felder:**
- `username` (string): Benutzername
- `coins` (number): Gesamte Coins
- `rank` (number): Aktueller Rang (1-3)
- `previousRank` (number): Vorheriger Rang

**Beispiel-Verwendung:**
- Spiele Sound-Effekt bei Top-3-Eintritt
- Zeige Feuerwerk-Animation
- Sende Chat-Nachricht "X ist jetzt Top 3!"

### Bestehende XP-Events

Diese Events wurden beibehalten und funktionieren weiterhin:
- `viewer-xp:xp-gained` - XP gewonnen
- `viewer-xp:level-up` - Level aufgestiegen
- `viewer-xp:daily-bonus` - Täglicher Bonus beansprucht
- `viewer-xp:streak-milestone` - Streak-Meilenstein erreicht

## 🎯 Technische Integration

### Datenbank-Struktur

#### XP-Daten (viewer_profiles)
```sql
CREATE TABLE viewer_profiles (
  username TEXT PRIMARY KEY,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  total_xp_earned INTEGER DEFAULT 0,
  -- ... weitere Felder
);
```

#### Currency-Daten (user_statistics)
```sql
CREATE TABLE user_statistics (
  user_id TEXT NOT NULL,
  streamer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  total_coins_sent INTEGER DEFAULT 0,
  total_gifts_sent INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  total_follows INTEGER DEFAULT 0,
  -- ... weitere Felder
  PRIMARY KEY (user_id, streamer_id)
);
```

### Event-Flow

```
TikTok Event (Gift) 
  ↓
handleGift() in viewer-xp
  ↓
├─→ Update XP (viewer_profiles)
│   └─→ Award gift_tier1/2/3 XP
│
└─→ Update Currency (user_statistics)
    ├─→ Add coins to total_coins_sent
    ├─→ Increment total_gifts_sent
    ├─→ Check for currency milestones
    │   └─→ Emit IFTTT event if milestone reached
    └─→ Check for top spender status
        └─→ Emit IFTTT event if entered top 3
```

### Plugin-Integration

Andere Plugins können auf die Currency-Daten zugreifen:

```javascript
// In einem anderen Plugin
const mainDb = this.api.getDatabase();

// Hole User Statistics
const userStats = mainDb.getUserStatistics(userId, streamerId);
console.log(`User has ${userStats.total_coins_sent} coins`);

// Hole Top Spender
const topSpenders = mainDb.getAllUserStatistics(10, 0);
topSpenders.forEach((user, idx) => {
  console.log(`#${idx + 1}: ${user.username} - ${user.total_coins_sent} coins`);
});

// Update Currency (nach Gift-Event)
mainDb.addCoinsToUserStats(userId, username, uniqueId, profileUrl, coinAmount);
```

## 📊 Performance-Optimierungen

### Database Query Caching
Die `handleGift()` Funktion wurde optimiert:
- **Vorher:** 3 separate `getAllUserStatistics()` Aufrufe pro Gift
- **Nachher:** 2 Aufrufe total (einmal vor Update, einmal nach Update)
- **Ersparnis:** ~33% weniger DB-Queries

### Rank Calculation
Rankings werden nur berechnet wenn:
- Meilenstein erreicht wurde
- Zuschauer in Top 3 aufsteigt
- `/currency` oder `/richest` Befehl ausgeführt wird

## 🎨 GCCE-HUD Integration

Alle Currency-Befehle nutzen die GCCE-HUD für Anzeige:

**Standard-Styling:**
```javascript
{
  fontSize: 32-36,
  fontFamily: 'Arial, sans-serif',
  textColor: '#FFD700' (Gold für Currency) / User-Farbe (für XP),
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  position: 'top-center',
  maxWidth: 800-1200,
  duration: 8000-12000ms
}
```

## 🔧 Konfiguration

### XP-Aktionen für Gifts
```javascript
gift_tier1: 50 XP   (< 100 Coins)
gift_tier2: 200 XP  (100-999 Coins)
gift_tier3: 1000 XP (≥ 1000 Coins)
```

### Currency-Meilensteine
```javascript
[100, 1000, 10000, 100000] // Coins
```

### Top-Spender-Schwelle
```javascript
Top 3 (Rang 1-3)
```

## 🚀 Verwendungsbeispiele

### Beispiel 1: Gift-Event
```
User sendet "Galaxy" Gift (1000 Diamonds × 2 = 2000 Coins)
  ↓
1. XP Update: +1000 XP (gift_tier3)
2. Currency Update: +2000 Coins
3. Total: 2150 Coins → Meilenstein 1000 erreicht!
   → IFTTT Event: viewer-xp:currency-milestone
4. Rank Check: Jetzt Rank #2 (war vorher #5)
   → IFTTT Event: viewer-xp:top-spender
```

### Beispiel 2: GCCE Befehle
```
User: /xp
→ "user123: Level 8 | 1500/2000 XP (75%) | 💰 2,150 Coins"

User: /currency
→ "💰 user123's Currency Stats | 2,150 Coins | Rank #2 | 
    🎁 15 Gifts | 💬 120 Comments | ❤️ 45 Likes | 📢 8 Shares"

User: /richest 3
→ "💎 Top 3 Richest Viewers: 
    #1 bigspender: 💰 50,000 Coins | 
    #2 user123: 💰 2,150 Coins | 
    #3 supporter: 💰 1,800 Coins"
```

### Beispiel 3: IFTTT Automation
```
IFTTT Flow:
  Trigger: viewer-xp:currency-milestone (milestone = 1000)
    ↓
  Condition: username != 'ignored_user'
    ↓
  Actions:
    1. Show Alert: "🎉 {username} hat 1,000 Coins erreicht!"
    2. Play Sound: "celebration.mp3"
    3. OBS: Switch to "Celebration" scene for 5s
    4. Award Badge: "coin_collector_1000"
```

## ✅ Checkliste für Streamer

- [ ] Viewer XP Plugin aktiviert
- [ ] GCCE Plugin aktiviert  
- [ ] GCCE-HUD Overlay in OBS eingebunden
- [ ] Currency-Befehle getestet (/coins, /currency, /richest)
- [ ] IFTTT Flows für Meilensteine erstellt (optional)
- [ ] Top-Spender-Benachrichtigungen konfiguriert (optional)

## 🐛 Troubleshooting

### Problem: Befehle zeigen keine Coins
**Lösung:** Prüfe ob `user_statistics` Tabelle Daten enthält. Erst nach ersten Gifts werden Coins erfasst.

### Problem: IFTTT Events feuern nicht
**Lösung:** Prüfe ob IFTTT Engine aktiviert ist und Flows existieren.

### Problem: Ranks sind falsch
**Lösung:** Rankings werden nur bei Top 1000 berechnet. Bei mehr Usern eventuell Limit erhöhen.

## 📞 Support

Bei Problemen oder Fragen:
1. Prüfe Server-Logs (`app/logs/`)
2. Checke Browser-Console (F12) im Admin-Panel
3. Öffne Issue im Repository

---

**Version:** 1.0.0  
**Letzte Aktualisierung:** 2024-12-14  
**Status:** ✅ Produktionsbereit
