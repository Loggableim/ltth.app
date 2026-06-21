# WebGPU Emoji Rain: Rate Limiting Queue - Quick Reference

## Was wurde implementiert? / What was implemented?

Eine optionale Warteschlangen-Funktion die die Menge an Emojis limitiert, die pro Sekunde gespawnt werden können.

An optional queue function that limits the amount of emojis that can be spawned per second.

## Problem gelöst / Problem solved

**Vorher / Before:**
- Bei vielen Events (z.B. 200 Likes) spawnen alle 200 Emojis sofort
- Führt zu Performance-Problemen und FPS-Drops

**Nachher / After:**
- Mit Rate Limit von z.B. 30/s: Nur 30 Emojis pro Sekunde
- Restliche Emojis werden in Queue gespeichert und schrittweise gespawnt
- Gleichmäßige Performance ohne Drops

## Konfiguration / Configuration

### Neue Optionen / New Options

```javascript
{
  rate_limit_enabled: false,           // Aktiviert/deaktiviert Rate Limiting
  rate_limit_emojis_per_second: 30    // Max. Emojis pro Sekunde (5-200)
}
```

### Wo zu finden? / Where to find?

**Admin Panel:**
1. WebGPU Emoji Rain Plugin öffnen
2. Scrollen zu "⏱️ Rate Limiting (Optional)"
3. Checkbox aktivieren
4. Anzahl einstellen
5. Speichern

## Code-Änderungen / Code Changes

### 1. Config erweitert / Config extended
- `app/modules/database.js`: Defaults hinzugefügt
- `app/public/js/webgpu-emoji-rain-engine.js`: Config verwendet
- `app/public/js/webgpu-emoji-rain-obs-hud.js`: Config verwendet

### 2. Queue-System / Queue System
```javascript
// Neue Variablen
let rateLimitQueue = [];
let emojisSpawnedThisSecond = 0;
let secondStartTime = performance.now();

// Spawn-Logik
function processSpawn(emoji, x, y, count) {
    if (config.rate_limit_enabled) {
        // In Queue einfügen
        for (let i = 0; i < count; i++) {
            rateLimitQueue.push({...});
        }
    } else {
        // Direkt spawnen
        spawnEmoji(...);
    }
}

// Queue-Verarbeitung (jeden Frame)
function processRateLimitQueue() {
    // Reset counter alle 1000ms
    if (timeSinceSecondStart >= 1000) {
        emojisSpawnedThisSecond = 0;
        secondStartTime = now;
    }
    
    // Spawne max. verfügbare Emojis
    const available = maxPerSecond - spawned;
    const toSpawn = Math.min(available, queue.length);
    
    for (let i = 0; i < toSpawn; i++) {
        spawnEmoji(queue.shift());
        emojisSpawnedThisSecond++;
    }
}
```

### 3. UI hinzugefügt / UI added
- `app/plugins/webgpu-emoji-rain/ui.html`: Neue Sektion
- `app/public/js/webgpu-emoji-rain-ui.js`: Load/Save Logik

### 4. Übersetzungen / Translations
- `app/plugins/webgpu-emoji-rain/locales/de.json`: Deutsch
- `app/plugins/webgpu-emoji-rain/locales/en.json`: English

## Tests / Testing

### Automatisierte Tests
```bash
# Location
app/test/webgpu-emoji-rain-rate-limiting.test.js

# Test-Szenarien
✅ Queue stores emojis when enabled
✅ Spawns respect rate limit
✅ Counter resets after 1 second
✅ Multiple events queue correctly
✅ Disabled spawns immediately
✅ Config persists in database
```

### Manuelle Tests
```bash
# Logik-Test ausführen
node /tmp/test-rate-limiting.js

# Ergebnis:
✅ All rate limiting queue tests passed!
```

## Performance / Leistung

### Empfohlene Einstellungen / Recommended Settings

| Hardware | Emojis/Sekunde | Verwendung |
|----------|----------------|------------|
| Schwach  | 15-20          | Maximale Stabilität |
| Mittel   | 25-35          | Standard (empfohlen) |
| Stark    | 50-80          | Mehr Action |
| Sehr Stark | 100+         | Alle Emojis sofort |

### Beispiel-Szenario / Example Scenario

**Like-Welle: 120 Likes**
- **Ohne Limit**: Alle 120 Emojis sofort → FPS-Drop
- **Mit 30/s**: 30+30+30+30 über 4 Sekunden → Stabil

## Debug-Informationen / Debug Information

Im Debug-Modus (Browser-Konsole):
```
Rate Limit: 28/30/s (Queue: 45)
          ↑   ↑         ↑
     Spawned Max    Wartend
```

Logs:
```
⏱️ [RATE LIMIT] Queued 50 emojis (queue size: 50)
⏱️ [RATE LIMIT] Spawned 30 emojis (30/30 this second, 20 queued)
⏱️ [RATE LIMIT] Spawned 20 emojis (20/30 this second, 0 queued)
```

## Kompatibilität / Compatibility

✅ **Funktioniert mit:**
- Standard Overlay (`/webgpu-emoji-rain/overlay`)
- OBS HUD Overlay (`/webgpu-emoji-rain/obs-hud`)
- Toaster Mode (schwache PCs)
- SuperFan Bursts
- Alle existierenden Features

❌ **Keine Breaking Changes:**
- Standardmäßig deaktiviert (Opt-In)
- Bestehende Configs unverändert
- Backward compatible

## Migration / Upgrade

**Automatisch beim App-Start:**
1. Datenbank erkennt fehlende Felder
2. Fügt Defaults hinzu:
   - `rate_limit_enabled: false`
   - `rate_limit_emojis_per_second: 30`
3. Bestehende Config bleibt erhalten

**Keine Aktion erforderlich!**

## Dateien / Files Changed

```
Modified (7 files):
✏️ app/modules/database.js
✏️ app/public/js/webgpu-emoji-rain-engine.js
✏️ app/public/js/webgpu-emoji-rain-obs-hud.js
✏️ app/public/js/webgpu-emoji-rain-ui.js
✏️ app/plugins/webgpu-emoji-rain/ui.html
✏️ app/plugins/webgpu-emoji-rain/locales/de.json
✏️ app/plugins/webgpu-emoji-rain/locales/en.json

Added (3 files):
➕ WEBGPU_EMOJI_RAIN_RATE_LIMITING.md (Dokumentation)
➕ app/test/webgpu-emoji-rain-rate-limiting.test.js (Tests)
➕ /tmp/ui-preview.html (UI Preview)
```

## Checkliste / Checklist

- [x] Code implementiert und getestet
- [x] UI Controls hinzugefügt
- [x] Deutsche Übersetzungen
- [x] Englische Übersetzungen
- [x] Datenbank-Migration
- [x] Automatisierte Tests
- [x] Dokumentation (DE/EN)
- [x] Syntax-Validierung
- [x] Queue-Logik verifiziert
- [x] Debug-Modus unterstützt
- [x] OBS HUD kompatibel
- [x] Backward compatible

## Nächste Schritte / Next Steps

1. ✅ Code Review durch Maintainer
2. ⏳ Merge in main branch
3. ⏳ Release Notes aktualisieren
4. ⏳ User Testing im Live-Stream

## Support

**Bei Problemen / Issues:**
1. Browser-Konsole öffnen (F12)
2. Nach Fehlern suchen
3. Mit deaktiviertem Rate Limiting testen
4. Debug-Logs sammeln
5. Issue auf GitHub erstellen

## Danke / Credits

**Entwickelt von:** GitHub Copilot  
**Datum:** 2025-12-28  
**PR:** `copilot/add-emoji-rain-queue-function`

---

**Status:** ✅ Bereit für Review / Ready for Review
