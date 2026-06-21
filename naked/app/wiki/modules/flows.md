# Automation Flows – Vollständige Dokumentation

> Das Flow-System ermöglicht leistungsstarke „Wenn-Dann"-Automatisierungen ohne Programmierung – gesteuert durch TikTok-Events, Timer, Webhooks und mehr.

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Was ist ein Flow?](#was-ist-ein-flow)
3. [Trigger-Typen](#trigger-typen)
4. [Bedingungsoperatoren](#bedingungsoperatoren)
5. [Action-Typen](#action-typen)
6. [JSON-Struktur eines Flows](#json-struktur-eines-flows)
7. [Dashboard-Nutzung](#dashboard-nutzung)
8. [Beispiel-Flows](#beispiel-flows)
9. [Erweiterte Features](#erweiterte-features)

---

## Übersicht

Das **Flow-System** (auch IFTTT-System / Automation Engine) verbindet TikTok-Events mit Aktionen im Stream. Damit lassen sich komplexe Streaming-Automatisierungen erstellen:

- 🎁 Gift > 100 Coins → TTS-Ansage + Alert + Sound
- 👋 Neuer Follower → Willkommens-TTS + Follow-Alert
- 🔔 Chat-Befehl `!soundboard` → Sound abspielen
- ⏱️ Alle 5 Minuten → Reminder-Nachricht per TTS
- 🎯 Goal erreicht → Feuerwerk-Effekt auslösen

**Konfiguration:** Dashboard → **Flows** (Seitenleiste)

---

## Was ist ein Flow?

Ein Flow besteht aus drei Teilen:

```
[TRIGGER] → [BEDINGUNGEN (optional)] → [AKTIONEN]
```

| Teil | Beschreibung | Beispiel |
|------|-------------|---------|
| **Trigger** | Das auslösende Event | `tiktok:gift` |
| **Bedingungen** | Optionale Filter (wenn...) | `coins >= 100` |
| **Aktionen** | Was passieren soll (dann...) | `tts:speak` + `alert:show` |

Flows werden **sequenziell** ausgeführt – eine Aktion nach der anderen. Mit `delay:wait` können Pausen eingefügt werden.

---

## Trigger-Typen

### TikTok-Events

| Trigger-ID | Beschreibung | Verfügbare Felder |
|------------|-------------|-------------------|
| `tiktok:gift` | Viewer sendet ein Geschenk | `username`, `giftName`, `coins`, `repeatCount`, `giftId` |
| `tiktok:follow` | Jemand folgt dem Stream | `username`, `userId` |
| `tiktok:share` | Stream wird geteilt | `username`, `userId` |
| `tiktok:subscribe` | Neuer Subscriber | `username`, `userId`, `subMonth` |
| `tiktok:like` | Like-Event (Threshold) | `username`, `likeCount`, `totalLikeCount` |
| `tiktok:chat` | Chat-Nachricht | `username`, `message`, `isModerator`, `isSubscriber` |
| `tiktok:join` | Viewer betritt den Stream | `username`, `userId` |
| `tiktok:viewerChange` | Zuschauerzahl ändert sich | `viewerCount` |

### System-Events

| Trigger-ID | Beschreibung |
|------------|-------------|
| `system:connected` | Verbindung mit TikTok LIVE hergestellt |
| `system:disconnected` | Verbindung getrennt |
| `system:error` | System-Fehler aufgetreten |

### Timer-Events

| Trigger-ID | Beschreibung | Parameter |
|------------|-------------|-----------|
| `timer:interval` | Regelmäßiger Takt | `interval` (Sekunden) |
| `timer:countdown` | Einmaliger Countdown | `duration` (Sekunden) |
| `timer:schedule` | Zu bestimmter Uhrzeit | `time` (HH:MM), `days` |

### Weitere Trigger

| Trigger-ID | Beschreibung |
|------------|-------------|
| `manual:trigger` | Manuell aus Dashboard ausgelöst |
| `webhook:incoming` | Eingehender Webhook-Request |
| `plugin:event` | Ereignis von einem Plugin |
| `goal:reached` | Goal wurde erreicht |
| `goal:progress` | Goal-Fortschritt geändert |

---

## Bedingungsoperatoren

Bedingungen filtern, wann ein Flow ausgeführt wird. Es stehen 8 Operatoren zur Verfügung:

| Operator | Symbol/Alias | Beschreibung | Beispiel |
|----------|-------------|-------------|---------|
| Gleich | `==`, `equals` | Wert genau gleich | `giftName == "Rose"` |
| Ungleich | `!=`, `not_equals` | Wert nicht gleich | `username != "BannedUser"` |
| Größer als | `>`, `greater_than` | Numerisch größer | `coins > 100` |
| Kleiner als | `<`, `less_than` | Numerisch kleiner | `repeatCount < 5` |
| Größer oder gleich | `>=`, `greater_or_equal` | Numerisch ≥ | `coins >= 50` |
| Kleiner oder gleich | `<=`, `less_or_equal` | Numerisch ≤ | `subMonth <= 3` |
| Enthält | `contains` | String enthält Text | `message contains "!help"` |
| Enthält nicht | `not_contains` | String enthält nicht | `message not_contains "spam"` |

### Mehrere Bedingungen

Mehrere Bedingungen werden mit **AND** verknüpft (alle müssen erfüllt sein):

```json
"trigger_condition": [
  { "field": "coins", "operator": ">=", "value": 50 },
  { "field": "username", "operator": "!=", "value": "TestUser" }
]
```

---

## Action-Typen

### Text-to-Speech

| Action-ID | Beschreibung |
|-----------|-------------|
| `tts:speak` | Text als Stimme vorlesen |

**Parameter:**
```json
{
  "type": "tts:speak",
  "text": "{username} hat {giftName} geschickt!",
  "voice": "de-DE-Wavenet-A",
  "volume": 80,
  "priority": "normal"
}
```

| Parameter | Beschreibung | Standard |
|-----------|-------------|---------|
| `text` | Vorzulesender Text (Variablen erlaubt) | Pflichtfeld |
| `voice` | Stimmen-ID (TikTok/Google) | Dashboard-Standard |
| `volume` | Lautstärke 0–100 | `80` |
| `priority` | `low`, `normal`, `high` | `normal` |

---

### Alert anzeigen

| Action-ID | Beschreibung |
|-----------|-------------|
| `alert:show` | Alert-Overlay anzeigen |

**Parameter:**
```json
{
  "type": "alert:show",
  "text": "🎁 {username}: {giftName}!",
  "alertType": "custom",
  "duration": 5,
  "sound": "/sounds/gift.mp3",
  "volume": 80
}
```

---

### Sound abspielen

| Action-ID | Beschreibung |
|-----------|-------------|
| `sound:play` | Audio-Datei abspielen |

**Parameter:**
```json
{
  "type": "sound:play",
  "sound": "/sounds/fanfare.mp3",
  "volume": 100
}
```

---

### Webhook senden

| Action-ID | Beschreibung |
|-----------|-------------|
| `webhook:send` | HTTP-Request an externe URL senden |

**Parameter:**
```json
{
  "type": "webhook:send",
  "url": "https://webhook.site/abc123",
  "method": "POST",
  "body": {
    "user": "{username}",
    "coins": "{coins}"
  },
  "headers": {
    "Content-Type": "application/json"
  }
}
```

> **Sicherheit:** Webhooks sind vor SSRF-Angriffen geschützt. Private IPs (127.0.0.1, 192.168.x.x, etc.) sind geblockt.

---

### Datei schreiben

| Action-ID | Beschreibung |
|-----------|-------------|
| `file:write` | Text in Datei schreiben (z.B. für OBS Text-Quellen) |
| `log:write` | Eintrag in Log-Datei schreiben |

**Parameter:**
```json
{
  "type": "file:write",
  "path": "data/last-gift.txt",
  "content": "{username}: {giftName} ({coins} Coins)",
  "mode": "overwrite"
}
```

| Parameter | Beschreibung |
|-----------|-------------|
| `path` | Relativer Pfad zur Datei (Plugin-Data-Verzeichnis) |
| `content` | Inhalt (Variablen erlaubt) |
| `mode` | `overwrite` (überschreiben) oder `append` (anhängen) |

---

### Pause / Verzögerung

| Action-ID | Beschreibung |
|-----------|-------------|
| `delay:wait` | Pause zwischen Aktionen einfügen |

**Parameter:**
```json
{
  "type": "delay:wait",
  "duration": 2000
}
```

`duration` in Millisekunden (2000 = 2 Sekunden).

---

### Weitere Aktionen

| Action-ID | Beschreibung |
|-----------|-------------|
| `overlay:image` | Bild/GIF im Overlay anzeigen |
| `overlay:video` | Video im Overlay abspielen |
| `overlay:text` | Text im Overlay anzeigen |
| `overlay:clear` | Overlay leeren |
| `emojirain:trigger` | Emoji-Rain-Effekt auslösen |
| `goal:update` | Goal-Fortschritt aktualisieren |
| `spotlight:set` | LastEvent Spotlight setzen |
| `variable:set` | Flow-Variable setzen |
| `variable:increment` | Flow-Variable erhöhen |
| `plugin:trigger` | Plugin-Aktion auslösen |
| `obs:scene` | OBS-Szene wechseln |
| `osc:send` | OSC-Nachricht senden (z.B. VRChat) |
| `osc:vrchat:wave` | VRChat Wave-Emote auslösen |
| `flow:trigger` | Anderen Flow starten |
| `flow:stop` | Aktuellen Flow abbrechen |

---

## JSON-Struktur eines Flows

```json
{
  "id": "flow_123",
  "name": "Gift > 100 Coins Reaktion",
  "enabled": true,
  "trigger_type": "tiktok:gift",
  "trigger_condition": [
    {
      "field": "coins",
      "operator": ">=",
      "value": 100
    }
  ],
  "actions": [
    {
      "type": "tts:speak",
      "text": "{username} hat {giftName} geschickt! Wow!",
      "priority": "high"
    },
    {
      "type": "delay:wait",
      "duration": 500
    },
    {
      "type": "alert:show",
      "text": "🎁 {username}: {giftName}",
      "alertType": "gift",
      "duration": 6
    },
    {
      "type": "emojirain:trigger",
      "emoji": "🎁",
      "count": 20
    }
  ],
  "created_at": "2026-04-04T10:00:00.000Z"
}
```

### Datenbankfelder

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | TEXT (PRIMARY KEY) | Eindeutige Flow-ID |
| `name` | TEXT | Anzeigename des Flows |
| `trigger_type` | TEXT | Auslöser-Typ (z.B. `tiktok:gift`) |
| `trigger_condition` | TEXT (JSON) | Optionale Bedingungen als JSON-Array |
| `actions` | TEXT (JSON) | Aktionen als JSON-Array |
| `enabled` | INTEGER | Flow aktiv (1) oder inaktiv (0) |
| `created_at` | TEXT | Erstellungszeitpunkt |

---

## Dashboard-Nutzung

### Flow erstellen

1. Dashboard → **Flows** in der Seitenleiste
2. **"+ Neuer Flow"** klicken
3. **Name** eingeben (z.B. "VIP-Gift Reaktion")
4. **Trigger** auswählen (z.B. `tiktok:gift`)
5. **Bedingungen** hinzufügen (optional, z.B. `coins >= 100`)
6. **Aktionen** hinzufügen und konfigurieren
7. **Speichern** klicken
8. Flow mit dem **Toggle-Switch** aktivieren

### Flow testen

- Rechtsklick auf Flow → **Manuell ausführen**
- Oder: **Test-Button** in der Flow-Detailansicht
- Log-Ausgabe im Dashboard-Footer beobachten

### Flow importieren/exportieren

- **Exportieren:** Flow-Detailansicht → **JSON exportieren**
- **Importieren:** Flows-Seite → **Import** → JSON einfügen

---

## Beispiel-Flows

### Beispiel 1: Willkommens-TTS für neue Follower

```json
{
  "name": "Neuer Follower – Willkommen",
  "trigger_type": "tiktok:follow",
  "trigger_condition": [],
  "actions": [
    {
      "type": "tts:speak",
      "text": "Willkommen im Stream, {username}! Schön dass du dabei bist!",
      "priority": "normal"
    }
  ]
}
```

---

### Beispiel 2: Großes Gift > 100 Coins – TTS + Alert + Emoji-Rain

```json
{
  "name": "VIP Gift Reaktion",
  "trigger_type": "tiktok:gift",
  "trigger_condition": [
    { "field": "coins", "operator": ">=", "value": 100 }
  ],
  "actions": [
    {
      "type": "tts:speak",
      "text": "Oh wow! {username} hat {giftName} geschickt – {coins} Coins! Danke!",
      "priority": "high"
    },
    { "type": "delay:wait", "duration": 500 },
    {
      "type": "alert:show",
      "text": "🎁 {username}: {giftName} ({coins} Coins)",
      "duration": 8
    },
    {
      "type": "emojirain:trigger",
      "emoji": "🎁",
      "count": 30
    }
  ]
}
```

---

### Beispiel 3: Chat-Befehl `!dice` – Würfelwurf

```json
{
  "name": "Würfelbefehl",
  "trigger_type": "tiktok:chat",
  "trigger_condition": [
    { "field": "message", "operator": "contains", "value": "!dice" }
  ],
  "actions": [
    {
      "type": "tts:speak",
      "text": "{username} würfelt... eine {variable:random_1_6}!",
      "priority": "normal"
    }
  ]
}
```

---

### Beispiel 4: Subscribe – Feuerwerk + TTS + Alert

```json
{
  "name": "Subscriber Feier",
  "trigger_type": "tiktok:subscribe",
  "trigger_condition": [],
  "actions": [
    {
      "type": "tts:speak",
      "text": "{username} hat abonniert! Herzlich willkommen in der Community!",
      "priority": "high"
    },
    { "type": "delay:wait", "duration": 1000 },
    {
      "type": "alert:show",
      "text": "⭐ {username} ist jetzt Subscriber!",
      "duration": 8,
      "sound": "/sounds/fanfare.mp3"
    },
    {
      "type": "plugin:trigger",
      "pluginId": "fireworks",
      "action": "launch"
    }
  ]
}
```

---

### Beispiel 5: OBS-Szene wechseln bei hoher Zuschauerzahl

```json
{
  "name": "Hype-Modus bei 1000 Zuschauern",
  "trigger_type": "tiktok:viewerChange",
  "trigger_condition": [
    { "field": "viewerCount", "operator": ">=", "value": 1000 }
  ],
  "actions": [
    {
      "type": "obs:scene",
      "scene": "Hype Scene"
    },
    {
      "type": "tts:speak",
      "text": "Wir haben 1000 Zuschauer! Danke euch allen!"
    }
  ]
}
```

---

## Erweiterte Features

### Variablen-System

Flows können Variablen setzen und lesen:

```json
[
  { "type": "variable:set", "name": "last_gift_user", "value": "{username}" },
  { "type": "variable:increment", "name": "gift_counter", "by": 1 }
]
```

### Flow-Verkettung

Flows können andere Flows starten:

```json
{ "type": "flow:trigger", "flowId": "celebration-sequence" }
```

### Cooldown-System

Flows können einen Cooldown haben, um zu verhindern, dass sie zu oft ausgelöst werden. Konfigurierbar per Flow-Einstellungen im Dashboard.

### Legacy-Trigger-Mapping

Das System unterstützt ältere Trigger-Namen für rückwärtskompatible Flow-Importe:

| Legacy | Aktuell |
|--------|---------|
| `gift` | `tiktok:gift` |
| `follow` | `tiktok:follow` |
| `share` | `tiktok:share` |
| `subscribe` | `tiktok:subscribe` |
| `like` | `tiktok:like` |
| `chat` | `tiktok:chat` |
| `join` | `tiktok:join` |

---

*Letzte Aktualisierung: 2026-04-04*  
*Siehe Dashboard → Flows für die vollständige Konfiguration.*
