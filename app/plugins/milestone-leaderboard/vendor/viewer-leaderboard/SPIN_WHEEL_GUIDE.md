# Spin Wheel Feature - Viewer XP Plugin

## Übersicht

Das Spin Wheel Feature ermöglicht es Zuschauern, mit ihren XP-Punkten ein Glücksrad zu drehen und damit XP zu gewinnen oder zu verlieren. Dieses Feature fügt ein spielerisches Element und Spannung zu Viewer XP hinzu.

## Funktionsweise

### Für Zuschauer

Zuschauer können den Chat-Befehl `/spin` oder `/spin <betrag>` verwenden, um das Glücksrad zu drehen:

```
/spin           (verwendet den Standard-Einsatz, z.B. 1000 XP)
/spin 5000      (setzt 5000 XP als Einsatz)
```

**Was passiert:**
1. Der Zuschauer setzt eine bestimmte Menge an XP als Einsatz (oder nutzt den Standard-Einsatz)
2. Das Glücksrad wird gedreht und landet auf einem zufälligen Feld
3. Je nach Feld gewinnt oder verliert der Zuschauer XP
4. Das Ergebnis wird im Overlay und im GCCE-HUD angezeigt

### Spielmechanik

**Positive Felder (Grün):**
- Zeigen einen XP-Gewinn an (z.B. +5000, +10000)
- Der Zuschauer gewinnt die angezeigte Menge an XP
- Netto-Gewinn = Gewinn - Einsatz

**Negative Felder (Rot):**
- Zeigen einen XP-Verlust an (z.B. -2000, -5000)
- Der Zuschauer verliert die angezeigte Menge PLUS seinen Einsatz
- Netto-Verlust = Verlust + Einsatz

**Beispiele:**
```
Einsatz: 5000 XP, Ergebnis: +10000 XP
→ Netto-Gewinn: +5000 XP (10000 - 5000)

Einsatz: 5000 XP, Ergebnis: +1000 XP
→ Netto-Verlust: -4000 XP (1000 - 5000)

Einsatz: 5000 XP, Ergebnis: -2000 XP
→ Netto-Verlust: -7000 XP (-2000 - 5000)

Einsatz: 5000 XP, Ergebnis: -5000 XP
→ Netto-Verlust: -10000 XP (-5000 - 5000)
```

## Konfiguration

### Admin Panel

1. Öffne das Viewer XP Admin Panel: `http://localhost:3000/viewer-xp/admin`
2. Navigiere zur "🎰 Spin Wheel" Seite im Menü
3. Konfiguriere die Einstellungen:

**Grundeinstellungen:**
- **Enable Spin Wheel**: Aktiviert/deaktiviert das Feature
- **Minimum Bet (XP)**: Kleinster erlaubter Einsatz (Standard: 100)
- **Maximum Bet (XP)**: Größter erlaubter Einsatz (Standard: 50000)
- **Default Bet (XP)**: Standard-Einsatz wenn `/spin` ohne Betrag verwendet wird (Standard: 1000)
- **Number of Fields**: Anzahl der Felder auf dem Rad (4-16)

**Feld-Werte:**
Gebe die XP-Werte für jedes Feld ein, ein Wert pro Zeile:
```
5000    (Gewinn: +5000 XP)
-2000   (Verlust: -2000 XP)
1000    (Gewinn: +1000 XP)
-5000   (Verlust: -5000 XP)
2000    (Gewinn: +2000 XP)
-1000   (Verlust: -1000 XP)
10000   (Jackpot: +10000 XP)
-3000   (Verlust: -3000 XP)
```

**Tipps für Balance:**
- Mische positive und negative Felder für Spannung
- Verwende einen großen positiven Wert als "Jackpot"
- Balanciere die Gewinnchancen so, dass das Spiel fair bleibt
- Große negative Felder erhöhen das Risiko

### Zahlenformatierung

Zahlen werden automatisch formatiert:
- **1.000 - 999.999**: 1k, 10k, 100k
- **1.000.000+**: 1M, 1.1M, 10M, 100M

Beispiele:
- 1000 → 1k
- 5000 → 5k
- 50000 → 50k
- 1000000 → 1M
- 1500000 → 1.5M

## Overlay Setup

### Spin Wheel Overlay

1. Füge eine neue **Browser-Quelle** in OBS hinzu
2. URL: `http://localhost:3000/overlay/viewer-xp/spin-wheel`
3. Breite: 1920px, Höhe: 1080px
4. Aktiviere "Quelle beim Ausblenden herunterfahren"

**Was wird angezeigt:**
- Animiertes Glücksrad mit konfigurierbaren Feldern
- Benutzername und Einsatz
- Spin-Animation (3-5 volle Umdrehungen)
- Ergebnis-Bildschirm mit Gewinn/Verlust

**Anzeigedauer:**
- Wheel Spin: ~4.5 Sekunden
- Result Display: ~5 Sekunden
- Total: ~10 Sekunden

### GCCE-HUD Integration

Das Spin-Ergebnis wird auch im GCCE-HUD angezeigt:
```
🎉 username WON! Bet: 5k | Field: +10k | Net: +5k XP | Total: 15k XP
😢 username Lost! Bet: 5k | Field: -2k | Net: -7k XP | Total: 8k XP
```

## API-Endpunkte

### GET `/api/viewer-xp/spin/config`
Hole aktuelle Spin-Konfiguration

**Response:**
```json
{
  "success": true,
  "config": {
    "enabled": 1,
    "min_bet": 100,
    "max_bet": 50000,
    "default_bet": 1000,
    "num_fields": 8,
    "field_values": [5000, -2000, 1000, -5000, 2000, -1000, 10000, -3000]
  }
}
```

### POST `/api/viewer-xp/spin/config`
Aktualisiere Spin-Konfiguration

**Request Body:**
```json
{
  "enabled": 1,
  "min_bet": 100,
  "max_bet": 50000,
  "default_bet": 1000,
  "num_fields": 8,
  "field_values": [5000, -2000, 1000, -5000, 2000, -1000, 10000, -3000]
}
```

### GET `/api/viewer-xp/spin/history?limit=50`
Hole Spin-Verlauf

**Query Parameters:**
- `username` (optional): Filtere nach Benutzername
- `limit` (optional): Anzahl der Einträge (Standard: 50)

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "username": "viewer123",
      "bet_amount": 5000,
      "field_index": 0,
      "field_value": 10000,
      "xp_change": 5000,
      "xp_before": 10000,
      "xp_after": 15000,
      "timestamp": "2024-12-18T12:00:00.000Z"
    }
  ]
}
```

### GET `/api/viewer-xp/spin/stats`
Hole Spin-Statistiken

**Query Parameters:**
- `username` (optional): Statistiken für spezifischen Benutzer

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_spins": 100,
    "wins": 45,
    "losses": 55,
    "total_bet": 500000,
    "net_xp_change": -50000,
    "biggest_win": 5000,
    "biggest_loss": -10000
  }
}
```

## Socket.IO Events

### `viewer-xp:spin-result`

Wird ausgelöst, wenn ein Zuschauer das Rad dreht.

**Event Data:**
```javascript
{
  username: "viewer123",
  betAmount: 5000,
  fieldIndex: 0,
  fieldValue: 10000,
  xpChange: 5000,
  netChange: 5000,
  xpBefore: 10000,
  xpAfter: 15000,
  isWin: true,
  timestamp: 1702901234567,
  spinConfig: {
    num_fields: 8,
    field_values: [5000, -2000, 1000, -5000, 2000, -1000, 10000, -3000]
  }
}
```

## Datenbank-Schema

### Tabelle: `spin_config`

```sql
CREATE TABLE spin_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER DEFAULT 1,
  min_bet INTEGER DEFAULT 100,
  max_bet INTEGER DEFAULT 50000,
  default_bet INTEGER DEFAULT 1000,
  num_fields INTEGER DEFAULT 8,
  field_values TEXT NOT NULL, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabelle: `spin_history`

```sql
CREATE TABLE spin_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  bet_amount INTEGER NOT NULL,
  field_index INTEGER NOT NULL,
  field_value INTEGER NOT NULL,
  xp_change INTEGER NOT NULL,
  xp_before INTEGER NOT NULL,
  xp_after INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES viewer_profiles(username)
);
```

**Indizes:**
- `idx_spin_history_username` - Schneller Zugriff nach Username
- `idx_spin_history_timestamp` - Sortierung nach Zeit

## Statistiken & Monitoring

Das Admin Panel zeigt folgende Statistiken:

1. **Total Spins**: Gesamtanzahl aller Spins
2. **Total Wins**: Anzahl der Gewinne
3. **Total Losses**: Anzahl der Verluste
4. **Net XP Change**: Netto-XP-Änderung über alle Spins
5. **Biggest Win**: Größter einzelner Gewinn
6. **Biggest Loss**: Größter einzelner Verlust

**Spin History Table** zeigt:
- Username
- Einsatz
- Feld-Wert
- Ergebnis (WIN/LOSS)
- XP-Änderung
- Zeitstempel

## Sicherheit & Validierung

**Backend-Validierung:**
- ✅ Spin muss aktiviert sein
- ✅ Einsatz muss numerisch und > 0 sein
- ✅ Einsatz muss zwischen min_bet und max_bet liegen
- ✅ Benutzer muss existieren (XP-Profil haben)
- ✅ Benutzer muss genug XP für Einsatz haben
- ✅ Alle XP-Änderungen werden in Datenbank protokolliert

**Fehlerbehandlung:**
- Ungültige Einsätze werden abgelehnt
- Fehlende XP werden gemeldet
- Deaktivierte Spins werden blockiert
- Alle Fehler werden geloggt

## Troubleshooting

### Spin-Befehl funktioniert nicht

**Lösung:**
1. Prüfe ob Spin Wheel im Admin Panel aktiviert ist
2. Prüfe ob GCCE-Plugin aktiviert ist
3. Prüfe ob Viewer XP Plugin aktiviert ist
4. Checke Server-Logs auf Fehler

### Overlay zeigt nichts an

**Lösung:**
1. Prüfe ob Browser-Source URL korrekt ist
2. Öffne F12 in OBS Browser-Source für Debug-Logs
3. Prüfe ob Socket.io-Verbindung besteht
4. Teste mit `/spin` Befehl im Chat

### Wheel Preview lädt nicht

**Lösung:**
1. Hard-Refresh im Browser (Ctrl+F5)
2. Prüfe Browser-Console auf JavaScript-Fehler
3. Stelle sicher, dass Feld-Werte valide Zahlen sind

## Best Practices

1. **Balance**: Halte das Verhältnis von Gewinnen zu Verlusten fair
2. **Jackpot**: Füge mindestens ein großes positives Feld als Jackpot hinzu
3. **Risiko**: Große negative Felder erhöhen Spannung, aber nicht zu viele
4. **Limits**: Setze Min/Max Bets basierend auf durchschnittlichen XP-Werten
5. **Monitoring**: Überwache Statistiken regelmäßig und passe Werte an

## Changelog

**Version 1.0.0** (2024-12-18)
- Initial Release
- Spin Wheel mit konfigurierbaren Feldern
- Admin UI mit Canvas-Preview
- Spin History & Statistics
- GCCE Integration
- Overlay mit Animationen
- Vollständige API-Dokumentation

## Support

Bei Fragen oder Problemen:
1. Prüfe diese Dokumentation
2. Checke Server-Logs in `app/logs/`
3. Öffne ein Issue im Repository
4. Kontaktiere Support-Team

---

**License:** CC-BY-NC-4.0  
**Author:** PupCid's Little TikTool Helper Team
