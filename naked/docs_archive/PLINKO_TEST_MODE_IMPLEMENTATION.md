# Plinko Offline-Testmodus - Implementierungsübersicht

## 📋 Übersicht

Der Plinko Offline-Testmodus ermöglicht es Administratoren, Plinko-Bälle direkt über das Backend zu spawnen, ohne dass eine TikTok-Verbindung, XP-Validierung oder Gift-Trigger erforderlich sind. Dies ist ideal für:

- 🧪 Offline-Testing von Plinko-Boards
- 📊 Statistik-Validierung vor Live-Deployment
- 🎨 Overlay-Design-Testing
- 🔧 Board-Konfiguration testen ohne XP-Verlust

## 🎯 Implementierte Features

### 1. Backend API-Endpunkte

#### **POST `/api/game-engine/plinko/test/spawn`**
Spawnt Test-Bälle direkt, ohne XP-System zu berühren.

**Request Body:**
```json
{
  "betAmount": 100,
  "playerName": "TestUser123",
  "count": 1,
  "boardId": 1
}
```

**Response:**
```json
{
  "success": true,
  "ballIds": ["test-ball-1234567890_0"],
  "message": "Test balls spawned for TestUser123",
  "testMode": true,
  "count": 1
}
```

**Validierung:**
- `betAmount`: 1-10000 XP
- `count`: 1-10 Bälle
- `boardId`: Optional (Standard: erstes Board)

#### **GET `/api/game-engine/plinko/test/stats`**
Liefert Test-Session-Statistiken.

**Response:**
```json
{
  "totalGames": 42,
  "totalBet": 5000,
  "totalPayout": 6200,
  "rtp": 124.0,
  "avgMultiplier": 1.24,
  "maxWin": 500,
  "maxLoss": -100
}
```

#### **GET `/api/game-engine/plinko/test/history?limit=50`**
Liefert letzte Test-Transaktionen.

**Response:**
```json
[
  {
    "id": 1,
    "user": "test_TestUser_1234567890",
    "bet": 100,
    "multiplier": 2.0,
    "profit": 100,
    "slot_index": 5,
    "timestamp": "2024-01-31T17:30:00.000Z"
  }
]
```

#### **DELETE `/api/game-engine/plinko/test/history`**
Löscht alle Test-Transaktionen.

**Response:**
```json
{
  "success": true,
  "deletedCount": 123
}
```

---

### 2. Datenbank-Schema

**Tabelle: `game_plinko_test_transactions`**
```sql
CREATE TABLE IF NOT EXISTS game_plinko_test_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  bet INTEGER NOT NULL,
  multiplier REAL NOT NULL,
  profit INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Neue DB-Methoden:**
- `recordPlinkoTestTransaction(user, bet, multiplier, profit, slotIndex)`
- `getPlinkoTestStats()` → Aggregat-Statistiken
- `getPlinkoTestHistory(limit)` → Letzte N Transaktionen
- `clearPlinkoTestHistory()` → Alle Test-Daten löschen

---

### 3. Game Logic Änderungen

**`plinko.js`:**

#### Neue Methode: `spawnTestBall(playerName, betAmount, boardId)`
```javascript
async spawnTestBall(playerName, betAmount, boardId = null) {
  // 1. Mock-User erstellen
  const username = `test_${playerName}_${Date.now()}`;
  
  // 2. Ball spawnen (KEIN XP-Check)
  const ballId = `test-ball-${Date.now()}_${this.ballIdCounter++}`;
  
  // 3. Ball mit isTest-Flag speichern
  this.activeBalls.set(ballId, {
    username,
    nickname: playerName,
    bet: betAmount,
    isTest: true  // <-- Wichtig!
  });
  
  // 4. Socket-Event emittieren (identisch zu echten Bällen)
  this.io.emit('plinko:spawn-ball', { ... });
  
  return { success: true, ballId, testMode: true };
}
```

#### Modifizierte Methode: `handleBallLanded(ballId, slotIndex)`
```javascript
async handleBallLanded(ballId, slotIndex) {
  const ballData = this.activeBalls.get(ballId);
  const isTestBall = ballData.isTest || false;
  
  // XP-Award ÜBERSPRINGEN für Test-Bälle
  if (profit > 0 && !isTestBall) {
    await this.awardXP(...);
  }
  
  // OpenShock ÜBERSPRINGEN für Test-Bälle
  if (!isTestBall && slot.openshockReward) {
    await this.triggerOpenshockReward(...);
  }
  
  // Separate Transaktion-Speicherung
  if (isTestBall) {
    this.db.recordPlinkoTestTransaction(...);
  } else {
    this.db.recordPlinkoTransaction(...);
  }
}
```

---

### 4. Admin-UI: "🧪 Plinko Test" Tab

**Location:** `app/plugins/game-engine/ui.html`

#### UI-Komponenten:

1. **Test-Steuerung Card**
   - Board-Selector (lädt alle verfügbaren Boards)
   - Spieler-Name Input
   - Einsatz Input (10-10000 XP) + Slider
   - Anzahl Bälle (1-10)
   - Buttons:
     - "🎰 Ball spawnen" → Spawnt mit aktuellen Werten
     - "🎰🎰 Batch spawnen" → Spawnt mehrere mit Random-Daten
     - "🗑️ Test-History löschen" → Löscht alle Test-Daten

2. **Schnell-Presets Card**
   - 50 XP Single
   - 100 XP x3
   - 500 XP x5
   - 1000 XP x10

3. **Test-Statistiken Card**
   - Total Balls spawned
   - Total Bet
   - Avg Multiplier
   - RTP (Return to Player)

4. **Test-History Card**
   - Tabelle mit letzten 50 Drops
   - Spalten: Zeit, Spieler, Bet, Multiplier, Gewinn/Verlust
   - Auto-Update nach jedem Drop

#### JavaScript Event-Handler:

```javascript
// Slider/Input Sync
testBetAmount.addEventListener('input', (e) => {
  testBetSlider.value = e.target.value;
});

// Single Spawn
document.getElementById('test-spawn-single-btn').addEventListener('click', async () => {
  const result = await fetch('/api/game-engine/plinko/test/spawn', { ... });
  // ...
});

// Batch Spawn (Random-User)
document.getElementById('test-spawn-batch-btn').addEventListener('click', async () => {
  for (let i = 0; i < count; i++) {
    const randomBet = Math.floor(Math.random() * 4991) + 10; // 10-5000 XP
    await fetch('/api/game-engine/plinko/test/spawn', {
      body: JSON.stringify({ playerName: `TestUser${i+1}`, betAmount: randomBet })
    });
  }
});

// Clear History
document.getElementById('test-clear-history-btn').addEventListener('click', async () => {
  await fetch('/api/game-engine/plinko/test/history', { method: 'DELETE' });
});

// Auto-Load
loadTestBoards();
loadTestStats();
loadTestHistory();
```

---

## 🔐 Sicherheit & Isolation

### ✅ Test-Bälle beeinflussen NICHT:

1. **XP-System**
   - Kein XP-Abzug beim Spawnen
   - Kein XP-Award beim Gewinnen
   - Viewer-Leaderboard bleibt unberührt

2. **Reguläre Plinko-Stats**
   - Separate Tabelle (`game_plinko_test_transactions`)
   - `/api/game-engine/plinko/stats` ignoriert Test-Daten
   - Leaderboard zeigt nur echte Spieler

3. **OpenShock-Belohnungen**
   - Test-Bälle triggern keine OpenShock-Commands

4. **Unified Queue**
   - Test-Bälle umgehen Queue komplett
   - Keine Queue-Position reserviert

### ⚠️ Admin-Only

- Endpunkte sind nur über Admin-UI erreichbar
- Keine öffentliche API für Viewer
- Test-Modus hat keinen Einfluss auf Live-Streams

---

## 🧪 Testing & Validation

### Test-Suite: `plinko-test-mode.test.js`

**Getestete Szenarien:**

1. **Database Methods**
   - `recordPlinkoTestTransaction()` INSERT
   - `getPlinkoTestStats()` Aggregation
   - `getPlinkoTestHistory()` Query
   - `clearPlinkoTestHistory()` DELETE

2. **spawnTestBall()**
   - Erfolgreicher Ball-Spawn
   - Mock-Username-Generierung
   - Invalid Board-ID
   - `isTest`-Flag in activeBalls

3. **handleBallLanded() mit Test-Bällen**
   - Test-Transaktion in separater Tabelle
   - KEIN XP-Award für Test-Bälle
   - KEIN OpenShock-Trigger für Test-Bälle
   - Reguläre Bälle verwenden weiterhin reguläre Tabelle

4. **Isolation**
   - Test-Stats vs. Regular-Stats
   - Separate SQL-Queries

5. **API-Validierung**
   - Bet-Amount Validierung (1-10000)
   - Count Validierung (1-10)

---

## 📊 Nutzungsbeispiel

### Szenario: Test eines neuen Plinko-Boards

1. **Admin öffnet Tab "🧪 Plinko Test"**
2. **Wählt neues Board aus Dropdown**
3. **Stellt "TestUser" und "500 XP" ein**
4. **Klickt "Ball spawnen"**
5. **Ball erscheint sofort im OBS Overlay**
6. **Ball landet in Slot mit 2.0x Multiplier**
7. **Test-History zeigt:**
   - Zeit: 17:30:15
   - Spieler: TestUser
   - Bet: 500 XP
   - Multiplier: 2.00x
   - Gewinn: +500 XP
8. **Test-Stats aktualisieren sich:**
   - Total Spawns: 1
   - Total Bet: 500 XP
   - Avg Multiplier: 2.00x
   - RTP: 200%
9. **Reguläre Plinko-Stats bleiben bei:**
   - Total Games: 0 (unverändert)
10. **Viewer-XP bleibt unberührt**

---

## 🔧 Technische Details

### Socket-Events

Test-Bälle emittieren **identische** Events wie echte Bälle:

```javascript
io.emit('plinko:spawn-ball', {
  ballId: 'test-ball-1234567890_0',
  username: 'test_TestUser_1234567890',
  nickname: 'TestUser',
  bet: 100,
  ballType: 'standard',
  globalMultiplier: 1.0,
  isTest: true  // <-- Optional für Overlay-Tracking
});
```

### Logging

Test-Spawns werden mit Prefix `🧪 [TEST]` geloggt:

```
[INFO] 🧪 [TEST] Plinko test ball spawned: TestUser bet 100 XP (ballId: test-ball-1234567890_0)
```

### Anti-Cheat Skipping

Test-Bälle überspringen Flight-Time-Validierung:

```javascript
if (!isTestMode) {
  const flightTime = Date.now() - ballData.timestamp;
  if (flightTime < MIN_FLIGHT_TIME_MS) {
    return { success: false, error: 'Invalid drop time' };
  }
}
```

---

## 📝 Änderungsliste

### `app/plugins/game-engine/backend/database.js`
- ✅ Neue Tabelle `game_plinko_test_transactions`
- ✅ 4 neue Methoden (record, getStats, getHistory, clear)

### `app/plugins/game-engine/games/plinko.js`
- ✅ Neue Methode `spawnTestBall()`
- ✅ Modifiziert `handleBallLanded()` für Test-Detection

### `app/plugins/game-engine/main.js`
- ✅ 4 neue API-Routes (POST spawn, GET stats, GET history, DELETE history)

### `app/plugins/game-engine/ui.html`
- ✅ Neuer Tab "🧪 Plinko Test"
- ✅ 4 UI-Cards (Steuerung, Presets, Stats, History)
- ✅ ~200 Zeilen JavaScript für Event-Handler

### `app/plugins/game-engine/test/plinko-test-mode.test.js`
- ✅ Neue Test-Suite mit 15+ Tests

---

## 🎉 Success Criteria - ALLE ERFÜLLT ✅

1. ✅ Admin kann Tab "🧪 Plinko Test" öffnen
2. ✅ Formular-Controls funktionieren (Slider/Input-Sync, Board-Selector)
3. ✅ "Ball spawnen" triggert API-Call und zeigt Ball im Overlay
4. ✅ "Batch spawnen" erstellt mehrere Bälle mit Random-Daten
5. ✅ Stats + History aktualisieren sich automatisch
6. ✅ Preset-Buttons setzen Formular-Werte korrekt
7. ✅ Test-Bälle beeinflussen NICHT echte Plinko-Stats
8. ✅ XP-System wird NICHT berührt
9. ✅ Backend-API mit vollständiger Fehlerbehandlung
10. ✅ Produktionsreifer Code (keine TODOs, keine Platzhalter)

---

## 🚀 Deployment

### Installation

Die Änderungen werden automatisch beim nächsten Plugin-Start aktiviert:

1. Plugin lädt neu
2. `database.js` führt `initialize()` aus
3. Neue Tabelle `game_plinko_test_transactions` wird erstellt
4. API-Routes werden registriert
5. Admin-UI zeigt neuen Tab "🧪 Plinko Test"

### Kompatibilität

- ✅ Abwärtskompatibel mit bestehenden Plinko-Daten
- ✅ Keine Breaking Changes
- ✅ Existierende Features unverändert

---

## 📞 Support

Bei Fragen oder Problemen:
- Siehe Test-Suite: `app/plugins/game-engine/test/plinko-test-mode.test.js`
- Logs prüfen: `🧪 [TEST]` Prefix
- API-Responses prüfen: `testMode: true` Flag

---

**Implementiert am:** 2024-01-31
**Version:** 1.0.0
**Status:** ✅ Production Ready
