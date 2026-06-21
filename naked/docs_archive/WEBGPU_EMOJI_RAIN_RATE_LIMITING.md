# WebGPU Emoji Rain: Rate Limiting Queue Feature

## Übersicht / Overview

**Deutsch:**
Diese Funktion fügt ein optionales Rate-Limiting-System für den WebGPU Emoji Rain hinzu. Es limitiert die Anzahl der Emojis, die pro Sekunde gespawnt werden können, und packt überschüssige Emojis in eine Warteschlange zur späteren Verarbeitung.

**English:**
This feature adds an optional rate limiting system for the WebGPU Emoji Rain. It limits the number of emojis that can be spawned per second and queues excess emojis for later processing.

## Problem / Problem Statement

Bei vielen gleichzeitigen Events (z.B. Like-Wellen mit hunderten Likes) können zu viele Emojis auf einmal gespawnt werden, was zu Performance-Problemen führen kann.

When many simultaneous events occur (e.g. like waves with hundreds of likes), too many emojis can spawn at once, leading to performance issues.

## Lösung / Solution

### Funktionsweise / How It Works

1. **Rate Limit aktivieren**: In den Plugin-Einstellungen kann das Rate-Limiting optional aktiviert werden
2. **Limit festlegen**: Konfiguriere die maximale Anzahl Emojis pro Sekunde (Standard: 30)
3. **Automatische Warteschlange**: Emojis die das Limit überschreiten werden automatisch in eine Queue eingereiht
4. **Schrittweise Verarbeitung**: Die Queue wird kontinuierlich abgearbeitet unter Einhaltung des Limits

### Konfigurationsoptionen / Configuration Options

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `rate_limit_enabled` | Boolean | `false` | Aktiviert/deaktiviert das Rate Limiting |
| `rate_limit_emojis_per_second` | Number | `30` | Maximale Anzahl Emojis pro Sekunde (5-200) |

## Implementierungsdetails / Implementation Details

### Geänderte Dateien / Modified Files

1. **app/modules/database.js**
   - Neue Config-Felder hinzugefügt: `rate_limit_enabled`, `rate_limit_emojis_per_second`

2. **app/public/js/webgpu-emoji-rain-engine.js**
   - Rate-Limiting-Queue-Variablen hinzugefügt
   - `processSpawn()` Funktion erweitert für Queue-Unterstützung
   - `processRateLimitQueue()` Funktion implementiert
   - Update-Loop ruft `processRateLimitQueue()` auf
   - Debug-Info zeigt Queue-Status

3. **app/public/js/webgpu-emoji-rain-obs-hud.js**
   - Gleiche Rate-Limiting-Logik für OBS HUD Overlay
   - Unabhängige Queue-Verwaltung

4. **app/public/js/webgpu-emoji-rain-ui.js**
   - UI-Felder für Rate-Limiting laden und speichern

5. **app/plugins/webgpu-emoji-rain/ui.html**
   - Neuer Config-Abschnitt "Rate Limiting (Optional)"
   - Checkbox zum Aktivieren
   - Number-Input für Emojis pro Sekunde

6. **app/plugins/webgpu-emoji-rain/locales/de.json & en.json**
   - Deutsche und englische Übersetzungen hinzugefügt

### Technische Details / Technical Details

#### Queue-Algorithmus / Queue Algorithm

```javascript
// Variablen
let rateLimitQueue = [];           // Queue für wartende Emojis
let emojisSpawnedThisSecond = 0;   // Counter für aktuelle Sekunde
let secondStartTime = performance.now();  // Start der aktuellen Sekunde

// Spawn mit Rate Limiting
function processSpawn(emoji, x, y, count) {
    if (config.rate_limit_enabled && config.rate_limit_emojis_per_second > 0) {
        // In Queue einfügen statt direkt spawnen
        for (let i = 0; i < count; i++) {
            rateLimitQueue.push({
                emoji, x, y, size, username, profilePictureUrl, color
            });
        }
    } else {
        // Ohne Rate Limiting: direkt spawnen
        for (let i = 0; i < count; i++) {
            spawnEmoji(...);
        }
    }
}

// Queue-Verarbeitung (wird jeden Frame aufgerufen)
function processRateLimitQueue() {
    if (!config.rate_limit_enabled) return;
    if (rateLimitQueue.length === 0) return;
    
    const now = performance.now();
    const timeSinceSecondStart = now - secondStartTime;
    
    // Counter alle 1000ms zurücksetzen
    if (timeSinceSecondStart >= 1000) {
        emojisSpawnedThisSecond = 0;
        secondStartTime = now;
    }
    
    // Berechne verfügbare Emojis in dieser Sekunde
    const maxEmojisPerSecond = config.rate_limit_emojis_per_second;
    const emojisAvailable = maxEmojisPerSecond - emojisSpawnedThisSecond;
    
    if (emojisAvailable <= 0) return;  // Limit erreicht
    
    // Spawne so viele Emojis wie möglich
    const emojisToSpawn = Math.min(emojisAvailable, rateLimitQueue.length);
    
    for (let i = 0; i < emojisToSpawn; i++) {
        const emojiData = rateLimitQueue.shift();
        spawnEmoji(emojiData.emoji, emojiData.x, emojiData.y, ...);
        emojisSpawnedThisSecond++;
    }
}
```

## Verwendung / Usage

### Admin-Panel

1. Navigiere zu den WebGPU Emoji Rain Einstellungen
2. Scrolle zum Abschnitt "⏱️ Rate Limiting (Optional)"
3. Aktiviere "Rate Limiting aktivieren"
4. Stelle die gewünschte Anzahl Emojis pro Sekunde ein (5-200)
5. Klicke auf "💾 Konfiguration speichern"

### Debug-Modus

Im Debug-Modus (aktiviert über Browser-Konsole) zeigt das Overlay:
```
Rate Limit: 15/30/s (Queue: 45)
```
- `15/30/s`: 15 von maximal 30 Emojis in dieser Sekunde gespawnt
- `Queue: 45`: 45 Emojis warten in der Queue

## Performance-Verbesserungen / Performance Improvements

### Vorher / Before
- Bei großen Events (z.B. 100 Likes) werden alle 100 Emojis sofort gespawnt
- Kann zu FPS-Drops und Stottern führen
- Überlastet die Physics-Engine

### Nachher / After
- Mit Rate Limit (z.B. 30/s): Max. 30 Emojis pro Sekunde
- Restliche 70 werden über ~2.3 Sekunden verteilt gespawnt
- Gleichmäßige Performance
- Keine FPS-Drops

## Empfohlene Einstellungen / Recommended Settings

| Szenario | Emojis/Sekunde | Begründung |
|----------|----------------|------------|
| **Schwache PCs** | 15-20 | Maximale Performance |
| **Standard** | 30 | Gute Balance |
| **Starke PCs** | 50-80 | Mehr visuelle Action |
| **Deaktiviert** | - | Für Tests oder sehr starke Hardware |

## Kompatibilität / Compatibility

- ✅ Funktioniert mit allen bestehenden Features
- ✅ Kompatibel mit Toaster Mode
- ✅ Funktioniert mit SuperFan Bursts
- ✅ Unterstützt OBS HUD und Standard Overlay
- ✅ Beeinträchtigt keine anderen Config-Optionen

## Tests

Die Implementierung wurde mit automatisierten Tests validiert:

### Test-Szenarien
1. ✅ Queue speichert Emojis wenn Rate Limiting aktiviert
2. ✅ Queue respektiert das Sekunden-Limit
3. ✅ Counter wird nach 1 Sekunde zurückgesetzt
4. ✅ Mehrere Events werden korrekt gequeued
5. ✅ Deaktiviertes Rate Limiting spawnt sofort
6. ✅ Config-Werte bleiben nach DB-Reload erhalten

Siehe: `/app/test/webgpu-emoji-rain-rate-limiting.test.js`

## Migration / Upgrade

Beim Update wird automatisch:
- Die Config um die neuen Felder erweitert
- Rate Limiting ist standardmäßig **deaktiviert** (Opt-In)
- Bestehende Config-Werte bleiben unverändert
- Keine Breaking Changes

## Bekannte Einschränkungen / Known Limitations

1. **Queue-Größe**: Unbegrenzt (könnte bei extremen Fällen Speicher beanspruchen)
2. **Präzision**: ±1 Frame-Zeit (~16ms bei 60 FPS)
3. **Burst-Mode**: SuperFan Bursts werden auch gequeued wenn aktiviert

## Future Improvements

Mögliche zukünftige Erweiterungen:
- [ ] Maximale Queue-Größe konfigurierbar
- [ ] Priorität für bestimmte Event-Typen
- [ ] Dynamisches Rate-Limiting basierend auf FPS
- [ ] Queue-Visualisierung im Admin-Panel

## Changelog

### Version 1.0.0 (2025-12-28)
- ✨ Initiales Release
- ✅ Rate Limiting Queue implementiert
- ✅ UI-Controls hinzugefügt
- ✅ Deutsche und englische Übersetzungen
- ✅ Tests erstellt
- ✅ Dokumentation vollständig

## Support

Bei Fragen oder Problemen:
1. Prüfe die Debug-Konsole auf Fehlermeldungen
2. Teste mit deaktiviertem Rate Limiting
3. Prüfe die Config in der Datenbank
4. Erstelle ein Issue mit Debug-Logs

---

**Erstellt von**: GitHub Copilot  
**Datum**: 2025-12-28  
**Version**: 1.0.0
