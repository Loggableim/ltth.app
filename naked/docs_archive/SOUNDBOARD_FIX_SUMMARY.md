# Soundboard Fix: Doppelte Audiowiedergabe & Defekte Queue
## (Soundboard Fix: Double Audio Playback & Broken Queue)

## Problem

Beim Soundboard wurden folgende Probleme gemeldet:
1. **Doppelte Audiowiedergabe**: Sounds wurden mit einer minimalen Verzögerung zweimal abgespielt
2. **Queue funktioniert nicht**: Trotz Auswahl einer Wiedergabemethode (queue-all, queue-per-gift) wurden Sounds stets überlappend abgespielt

## Ursachenanalyse

### Doppelte Wiedergabe
- Es existierten **zwei Socket-Event-Listener** für `soundboard:play`:
  1. In `dashboard.js` (Zeile 541-543)
  2. In `dashboard-soundboard.js` (Zeile 36-38)
- Beide Listener wurden aktiv, wenn ein Sound abgespielt werden sollte
- Jeder Listener erstellte ein eigenes Audio-Element und spielte den Sound ab
- Resultat: Jeder Sound wurde zweimal mit leichter Verzögerung abgespielt (Echo-Effekt)

### Queue funktioniert nicht
- Der Listener in `dashboard.js` ignorierte die Queue-Modi komplett
- Die Funktion `playDashboardSoundboard()` in dashboard.js spielte IMMER sofort ab (overlap)
- Selbst wenn die Queue-Logik in `dashboard-soundboard.js` korrekt funktionierte, wurde der Sound trotzdem zweimal abgespielt - einmal korrekt in der Queue, einmal sofort

## Lösung

### Implementierte Änderungen

1. **Entfernung des doppelten Handlers** (`app/public/js/dashboard.js`):
   - Socket-Listener für `soundboard:play` entfernt (Zeilen 540-543)
   - Funktion `playDashboardSoundboard()` entfernt (Zeilen 3443-3471)
   - Kommentare eingefügt, die auf `dashboard-soundboard.js` verweisen

2. **Zentralisierung der Soundboard-Logik** (`app/public/dashboard.html`):
   - `dashboard-soundboard.js` wird jetzt auch im Haupt-Dashboard geladen
   - Lädt nach `dashboard.js` und vor `navigation.js`
   - Dadurch nutzen sowohl das Haupt-Dashboard als auch die Soundboard-UI-Seite die gleiche Queue-Logik

### Warum diese Lösung?

- **Single Source of Truth**: Nur noch EIN Event-Listener für `soundboard:play`
- **Konsistente Queue-Verwaltung**: Alle drei Modi funktionieren überall:
  - `overlap`: Sofortige Wiedergabe (Standard)
  - `queue-all`: Globale sequentielle Warteschlange (alle Sounds nacheinander)
  - `queue-per-gift`: Pro-Gift/Event-Warteschlangen (gleiche Typen warten, verschiedene Typen parallel)
- **Keine Code-Duplizierung**: Queue-Logik existiert nur in `dashboard-soundboard.js`

## Queue-Modi Erklärung

### Overlap Mode (Standard)
```javascript
currentPlayMode = 'overlap'
```
- Sounds werden sofort abgespielt
- Mehrere Sounds können gleichzeitig laufen
- Keine Warteschlange

### Queue-All Mode (Globale Warteschlange)
```javascript
currentPlayMode = 'queue-all'
```
- ALLE Sounds werden in eine globale Warteschlange eingereiht
- Sounds werden streng sequentiell abgespielt
- Nächster Sound startet erst, wenn der vorherige beendet ist
- Gut für geordnete Wiedergabe ohne Überlappung

### Queue-Per-Gift Mode (Pro-Typ-Warteschlangen)
```javascript
currentPlayMode = 'queue-per-gift'
```
- Jeder Gift-Typ / Event-Typ hat seine eigene Warteschlange
- Sounds vom **gleichen** Typ warten aufeinander
- Sounds von **verschiedenen** Typen spielen parallel
- Beispiel:
  - Rose-Gift-Sounds spielen nacheinander
  - Gleichzeitig können Follow-Event-Sounds parallel laufen
  - Aber multiple Follow-Events warten auch aufeinander

## Testing

### Unit Tests
Alle 47 Soundboard-Tests bestanden:
```bash
npm test test/soundboard-*.test.js
```
- ✅ soundboard-export-import.test.js (16 Tests)
- ✅ soundboard-queue.test.js (16 Tests)
- ✅ soundboard-volume-controls.test.js (15 Tests)

### Manuelle Tests (Empfohlen)

1. **Dashboard öffnen** und zur Soundboard-Ansicht wechseln
2. **Verbindung zu TikTok LIVE** herstellen

3. **Test: Overlap Mode**
   - Wiedergabemodus: "Overlap (Standard)"
   - Mehrere Gifts schnell hintereinander senden
   - ✅ Erwartung: Sounds spielen sofort und können überlappen
   - ✅ KEINE doppelte Wiedergabe

4. **Test: Queue-All Mode**
   - Wiedergabemodus: "Queue All (Sequential)"
   - Mehrere Gifts schnell hintereinander senden
   - ✅ Erwartung: Sounds spielen nacheinander in der Reihenfolge
   - ✅ Kein Überlappen
   - ✅ KEINE doppelte Wiedergabe

5. **Test: Queue-Per-Gift Mode**
   - Wiedergabemodus: "Queue Per Gift"
   - Mehrere Gifts vom **gleichen Typ** schnell hintereinander
   - ✅ Erwartung: Diese Sounds spielen nacheinander
   - Dann Gifts von **verschiedenen Typen** senden
   - ✅ Erwartung: Diese können parallel laufen
   - ✅ KEINE doppelte Wiedergabe

6. **Test: Mode-Wechsel**
   - Zwischen den Modi wechseln
   - ✅ Erwartung: Warteschlangen werden geleert
   - ✅ Neuer Modus greift sofort

## Technische Details

### Audio-Element-Verwaltung
```javascript
// dashboard-soundboard.js
let audioPool = [];

function playSound(data, onComplete) {
    const audio = document.createElement('audio');
    audio.src = data.url;
    audio.volume = data.volume || 1.0;
    
    audioPool.push(audio);
    
    audio.play().then(/* ... */);
    
    audio.onended = () => {
        // Aus Pool entfernen
        const index = audioPool.indexOf(audio);
        if (index > -1) audioPool.splice(index, 1);
        
        // Callback für Queue-Verarbeitung
        if (onComplete) onComplete();
    };
}
```

### Queue-Verarbeitung
```javascript
function processGlobalQueue() {
    if (globalSoundQueue.length === 0) {
        isProcessingGlobalQueue = false;
        return;
    }
    
    isProcessingGlobalQueue = true;
    const data = globalSoundQueue.shift();
    
    // Callback wird aufgerufen wenn Sound beendet ist
    playSound(data, () => {
        setTimeout(() => processGlobalQueue(), 100);
    });
}
```

## Dateien geändert

1. `/app/public/js/dashboard.js`
   - Entfernt: `socket.on('soundboard:play', ...)` Listener
   - Entfernt: `function playDashboardSoundboard(data)` Funktion
   - Hinzugefügt: Kommentare zur Erklärung

2. `/app/public/dashboard.html`
   - Hinzugefügt: `<script src="/js/dashboard-soundboard.js"></script>`
   - Position: Nach dashboard.js, vor navigation.js

## Weitere Verbesserungen

Die Queue-Logik in `dashboard-soundboard.js` wurde bereits implementiert und enthält:
- ✅ Robuste Error-Behandlung
- ✅ Logging für Debugging
- ✅ Cleanup von Audio-Elementen nach Wiedergabe
- ✅ Verzögerung zwischen Sounds in Queue-Modi (100ms)
- ✅ Rückwärtskompatibilität (alter 'sequential' Modus → 'queue-all')

## Fazit

- ✅ Doppelte Audiowiedergabe behoben
- ✅ Queue-Modi funktionieren jetzt korrekt
- ✅ Alle Tests bestanden
- ✅ Code-Duplizierung entfernt
- ✅ Konsistentes Verhalten in allen Ansichten
