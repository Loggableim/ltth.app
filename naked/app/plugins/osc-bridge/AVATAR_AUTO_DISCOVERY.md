# Avatar Auto-Discovery Feature

## Übersicht

Das OSC-Bridge Plugin verfügt jetzt über eine Avatar Auto-Discovery Funktion, die automatisch erkennt:
- Welcher Avatar in VRChat aktiv ist
- Welche Parameter und Aktionen dieser Avatar unterstützt
- Welche Standard-VRChat-Funktionen verfügbar sind

## Funktionsweise

### Voraussetzungen

1. **OSCQuery muss aktiviert sein**:
   - Gehen Sie zu den OSC-Bridge Einstellungen
   - Aktivieren Sie "OSCQuery Auto-Discovery" in der Konfiguration
   - Starten Sie die OSC-Bridge

2. **VRChat muss laufen**:
   - VRChat muss geöffnet sein
   - Sie müssen einen Avatar tragen (in-game)
   - OSC muss in VRChat aktiviert sein

### Avatar Erkennung

1. Klicken Sie auf **"🔍 Avatar erkennen"** im Avatar Auto-Discovery Bereich
2. Das System:
   - Verbindet sich mit VRChat via OSCQuery
   - Liest die aktuelle Avatar-ID aus
   - Scannt alle verfügbaren Parameter
   - Erkennt Standard-Aktionen, Emotes, Custom Parameter und PhysBones
   - Fügt den Avatar automatisch zur Liste hinzu (wenn neu)

### Verfügbare Aktionen

Nach der Erkennung sehen Sie:

#### ✅ Standard VRChat Aktionen
- Wave 👋
- Celebrate 🎉
- Dance 💃
- Hearts ❤️
- Confetti 🎊

**Status**: 
- ✅ Grüner Rahmen = Verfügbar auf diesem Avatar
- ⚪ Ausgegraut = Nicht verfügbar

#### ✅ Emote Slots
- Emote 0-7 (je nach Avatar-Konfiguration)

#### ✅ Avatar-spezifische Parameter
- Zeigt alle Custom Parameter des Avatars
- Z.B. Ohren, Schwanz, Accessoires, etc.

#### ✅ PhysBones
- Alle PhysBones-Parameter des Avatars
- Z.B. Tail, Hair, Ears, etc.

## API Endpoints

### GET `/api/osc/avatar/current`
Gibt die aktuelle Avatar-ID zurück.

**Response:**
```json
{
  "success": true,
  "avatarId": "avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "timestamp": 1234567890
}
```

### GET `/api/osc/avatar/available-actions`
Gibt alle verfügbaren Aktionen für den aktuellen Avatar zurück.

**Response:**
```json
{
  "success": true,
  "actions": {
    "standard": {
      "Wave": true,
      "Celebrate": true,
      "Dance": false,
      "Hearts": true,
      "Confetti": false
    },
    "emotes": {
      "Emote0": true,
      "Emote1": true,
      "Emote2": false,
      ...
    },
    "custom": [
      {
        "name": "EarWiggle",
        "path": "/avatar/parameters/EarWiggle",
        "type": "bool",
        "access": "readwrite"
      }
    ],
    "physbones": [
      {
        "name": "Tail",
        "basePath": "/avatar/physbones/Tail"
      }
    ]
  }
}
```

### POST `/api/osc/avatar/auto-detect`
Führt eine vollständige Avatar-Erkennung durch und fügt den Avatar zur Liste hinzu.

**Response:**
```json
{
  "success": true,
  "avatarId": "avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "availableActions": { ... },
  "isNew": true,
  "parameterCount": 45
}
```

## Verwendung im Code

### Backend

```javascript
// Get current avatar ID
const avatarId = await oscBridgePlugin.getCurrentAvatarId();

// Get available actions
const actions = oscBridgePlugin.getAvailableActions();

// Check if a specific action is available
if (actions.standard.Wave) {
  oscBridgePlugin.wave();
}
```

### Frontend

```javascript
// Auto-detect avatar
async function detectAvatar() {
  const response = await fetch('/api/osc/avatar/auto-detect', {
    method: 'POST'
  });
  const data = await response.json();
  
  if (data.success) {
    console.log('Avatar detected:', data.avatarId);
    console.log('Available actions:', data.availableActions);
  }
}

// Get available actions
async function getActions() {
  const response = await fetch('/api/osc/avatar/available-actions');
  const data = await response.json();
  
  if (data.success) {
    console.log('Actions:', data.actions);
  }
}
```

## Fehlerbehebung

### "No avatar detected"
- **Automatische Wiederholung:** Das System versucht automatisch 3x mit 1 Sekunde Verzögerung, den Avatar zu erkennen
- Stellen Sie sicher, dass VRChat läuft
- Stellen Sie sicher, dass Sie einen Avatar tragen (in-game, nicht im Menü)
- Warten Sie 10-15 Sekunden nach dem Avatar-Wechsel, bevor Sie "Avatar erkennen" klicken
- Prüfen Sie, ob OSC in VRChat aktiviert ist (Action Menu → Options → OSC)
- Starten Sie VRChat neu, falls das Problem weiterhin besteht

### "OSCQuery not initialized"
- Aktivieren Sie OSCQuery in den OSC-Bridge Einstellungen
- Starten Sie die OSC-Bridge
- Prüfen Sie, ob Port 9001 nicht blockiert ist

### "No parameters found"
- Warten Sie einige Sekunden nach dem Avatar-Wechsel
- Klicken Sie auf "🔄 Aktionen aktualisieren"
- Prüfen Sie die VRChat OSC-Einstellungen

## Technische Details

### Avatar-ID Format
- VRChat Avatar IDs haben das Format: `avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Sie werden über den `/avatar/change` OSCQuery-Parameter ausgelesen

### Parameter-Erkennung
Das System scannt folgende Pfade:
- `/avatar/parameters/*` - Standard- und Custom-Parameter
- `/avatar/physbones/*` - PhysBones-Parameter
- Alle Parameter werden nach Typ (bool, float, int) kategorisiert

### Caching
- Erkannte Parameter werden gecacht
- Bei Avatar-Wechsel wird automatisch neu gescannt (wenn Avatar Watcher aktiv)
- Manuelle Aktualisierung über "🔄 Aktionen aktualisieren" Button

## Beispiel-Workflow

1. **Erstes Setup**:
   ```
   1. OSC-Bridge starten
   2. OSCQuery aktivieren
   3. VRChat starten und Avatar tragen
   4. "Avatar erkennen" klicken
   5. Avatar wird automatisch zur Liste hinzugefügt
   ```

2. **Avatar wechseln**:
   ```
   1. In VRChat Avatar wechseln
   2. "Avatar erkennen" klicken
   3. Neue verfügbare Aktionen werden angezeigt
   ```

3. **Aktionen nutzen**:
   ```
   1. Grün markierte Aktionen sind verfügbar
   2. Ausgegraute Aktionen werden vom Avatar nicht unterstützt
   3. Custom Parameter und PhysBones werden automatisch erkannt
   ```

## Vorteile

✅ **Automatische Erkennung**: Keine manuelle Konfiguration nötig
✅ **Avatar-spezifisch**: Zeigt nur verfügbare Aktionen
✅ **Übersichtlich**: Klare visuelle Trennung zwischen verfügbar/nicht verfügbar
✅ **Flexibel**: Unterstützt Standard-, Custom- und PhysBones-Parameter
✅ **Einfach**: Ein Klick zur kompletten Avatar-Analyse

## Zukünftige Erweiterungen

- [ ] Automatische Avatar-Erkennung bei Wechsel (via Avatar Watcher)
- [ ] Avatar-Profile mit gespeicherten Aktionen
- [ ] Parameter-Werte in Echtzeit anzeigen
- [ ] Custom Animations für PhysBones
- [ ] Avatar-Gruppen und Favoriten
