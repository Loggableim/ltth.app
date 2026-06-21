# GoGo Loco Support

## Übersicht

GoGo Loco ist ein beliebtes Locomotion-System für VRChat-Avatare. Das OSC-Bridge Plugin unterstützt jetzt die wichtigsten GoGo Loco Parameter für die Steuerung von Bewegung und Zuständen.

## Unterstützte Parameter

### GGLVelocity
**Pfad:** `/avatar/parameters/GGLVelocity`  
**Typ:** Float (0.0 - 1.0)  
**Beschreibung:** Bewegungsgeschwindigkeit des Avatars

### GGLTurn
**Pfad:** `/avatar/parameters/GGLTurn`  
**Typ:** Float (-1.0 - 1.0)  
**Beschreibung:** Drehwinkel des Avatars (-1 = links, 0 = geradeaus, 1 = rechts)

### GGLGrounded
**Pfad:** `/avatar/parameters/GGLGrounded`  
**Typ:** Boolean  
**Beschreibung:** Avatar ist auf dem Boden

### GGLFly
**Pfad:** `/avatar/parameters/GGLFly`  
**Typ:** Boolean  
**Beschreibung:** Avatar fliegt

### GGLSwim
**Pfad:** `/avatar/parameters/GGLSwim`  
**Typ:** Boolean  
**Beschreibung:** Avatar schwimmt

### IKTPoseWeight
**Pfad:** `/avatar/parameters/IKTPoseWeight`  
**Typ:** Float (0.0 - 1.0)  
**Beschreibung:** IKT Pose Weight für Locomotion

### SpeedMultiplier
**Pfad:** `/avatar/parameters/SpeedMultiplier`  
**Typ:** Float  
**Beschreibung:** Geschwindigkeitsmultiplikator

## API Endpoints

### POST `/api/osc/vrchat/gogoloco/velocity`
Setzt die Bewegungsgeschwindigkeit.

**Request Body:**
```json
{
  "velocity": 0.5
}
```

**Response:**
```json
{
  "success": true,
  "action": "gogoloco_velocity",
  "velocity": 0.5
}
```

### POST `/api/osc/vrchat/gogoloco/turn`
Setzt den Drehwinkel.

**Request Body:**
```json
{
  "angle": -0.3
}
```

**Response:**
```json
{
  "success": true,
  "action": "gogoloco_turn",
  "angle": -0.3
}
```

### POST `/api/osc/vrchat/gogoloco/grounded`
Setzt den Grounded-Status.

**Request Body:**
```json
{
  "grounded": true
}
```

**Response:**
```json
{
  "success": true,
  "action": "gogoloco_grounded",
  "grounded": true
}
```

### POST `/api/osc/vrchat/gogoloco/fly`
Setzt den Flying-Status.

**Request Body:**
```json
{
  "flying": false
}
```

**Response:**
```json
{
  "success": true,
  "action": "gogoloco_fly",
  "flying": false
}
```

### POST `/api/osc/vrchat/gogoloco/swim`
Setzt den Swimming-Status.

**Request Body:**
```json
{
  "swimming": true
}
```

**Response:**
```json
{
  "success": true,
  "action": "gogoloco_swim",
  "swimming": true
}
```

## Verwendung im Code

### JavaScript

```javascript
// Set velocity
await fetch('/api/osc/vrchat/gogoloco/velocity', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ velocity: 0.8 })
});

// Set turn angle
await fetch('/api/osc/vrchat/gogoloco/turn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ angle: 0.5 })
});

// Set flying
await fetch('/api/osc/vrchat/gogoloco/fly', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flying: true })
});
```

### Backend Plugin

```javascript
const oscBridge = api.pluginLoader.loadedPlugins.get('osc-bridge').instance;

// Set velocity
oscBridge.setGoGoLocoVelocity(0.5);

// Set turn angle
oscBridge.setGoGoLocoTurn(-0.3);

// Set grounded
oscBridge.setGoGoLocoGrounded(true);

// Set flying
oscBridge.setGoGoLocoFly(false);

// Set swimming
oscBridge.setGoGoLocoSwim(true);
```

## Auto-Discovery

GoGo Loco Parameter werden automatisch bei der Avatar-Erkennung erkannt:

```javascript
// Auto-detect avatar
const response = await fetch('/api/osc/avatar/auto-detect', { method: 'POST' });
const data = await response.json();

if (data.success) {
  console.log('GoGo Loco parameters:', data.availableActions.gogoloco);
  // Output: { Velocity: true, Turn: true, Grounded: true, Fly: false, ... }
}
```

## Integration in Gift-Mappings

GoGo Loco Parameter können mit TikTok-Gifts verknüpft werden:

```json
{
  "giftId": 5655,
  "giftName": "Rose",
  "action": "custom_parameter",
  "params": {
    "parameterName": "GGLVelocity",
    "value": 0.8,
    "duration": 3000
  }
}
```

## Beispiel-Anwendungen

### Geschwindigkeits-Boost bei Gifts
```javascript
api.registerTikTokEvent('gift', (giftData) => {
  if (giftData.giftName === 'Rose') {
    oscBridge.setGoGoLocoVelocity(1.0); // Max speed
    setTimeout(() => {
      oscBridge.setGoGoLocoVelocity(0.5); // Normal speed
    }, 5000);
  }
});
```

### Flug-Modus aktivieren
```javascript
// Enable flying for 10 seconds
oscBridge.setGoGoLocoFly(true);
setTimeout(() => {
  oscBridge.setGoGoLocoFly(false);
}, 10000);
```

### Automatische Bewegung
```javascript
// Walk forward slowly
oscBridge.setGoGoLocoVelocity(0.3);
oscBridge.setGoGoLocoTurn(0); // Straight ahead

// Turn right
setTimeout(() => {
  oscBridge.setGoGoLocoTurn(0.5);
}, 3000);

// Stop
setTimeout(() => {
  oscBridge.setGoGoLocoVelocity(0);
}, 6000);
```

## Kompatibilität

✅ **GoGo Loco v1.x** - Vollständig unterstützt  
✅ **GoGo Loco v2.x** - Vollständig unterstützt  
⚠️ **Custom GoGo Loco Setups** - Teilweise unterstützt (abhängig von Parameter-Namen)

## Troubleshooting

### GoGo Loco Parameter werden nicht erkannt
1. Stelle sicher, dass OSCQuery aktiviert ist
2. Starte die OSC-Bridge
3. Warte bis VRChat verbunden ist
4. Klicke auf "🔍 Avatar erkennen"

### Parameter funktionieren nicht
1. Prüfe ob der Avatar GoGo Loco nutzt
2. Prüfe die OSC-Verbindung (Status: Running)
3. Prüfe die VRChat OSC-Einstellungen
4. Prüfe die Logs: `oscBridge.log`

### Parameter haben keine Wirkung
- Einige GoGo Loco Parameter funktionieren nur, wenn bestimmte Bedingungen erfüllt sind
- Z.B. funktioniert `GGLFly` nur wenn der Avatar auch Fly-Animationen hat
- Prüfe die Avatar-Konfiguration in Unity

## Weitere Informationen

- [GoGo Loco GitHub](https://github.com/franada/gogoloco)
- [VRChat OSC Documentation](https://docs.vrchat.com/docs/osc-overview)
- [OSC-Bridge Plugin Documentation](./ADVANCED_FEATURES.md)
