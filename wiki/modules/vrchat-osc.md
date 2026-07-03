# VRChat OSC Integration Module

## Overview

The VRChat OSC (Open Sound Control) module enables avatar control from TikTok LIVE events. Trigger avatar animations, gestures, parameters, and effects based on gifts, chat messages, and other stream interactions.

## Features

- **OSC Protocol Support** - Standard OSC 1.0/1.1
- **Avatar Parameter Control** - Set any avatar parameter
- **Animation Triggers** - Play avatar animations
- **Gesture Control** - Wave, dance, celebrate
- **Particle Effects** - Spawn hearts, confetti, fireworks
- **Expression Control** - Change facial expressions
- **Custom Parameters** - Support for custom avatar parameters
- **Two-Way Communication** - Send and receive OSC data

## Requirements

### VRChat

- **VRChat** installed and running
- **OSC enabled** in VRChat settings
- **Avatar** with OSC parameters (most avatars support basic OSC)

### Network

- VRChat and ltth.app on **same PC** (recommended)
- Or **same local network** with proper firewall rules

## OSC Setup

### VRChat OSC Configuration

1. Launch VRChat
2. Open **Action Menu** (R key)
3. Go to **Options** → **OSC**
4. Enable **OSC**
5. Note the port (default: 9000)
6. Enable **Debug OSC** (optional, for testing)

### ltth.app Configuration

1. Go to **Dashboard** → **Settings** → **VRChat OSC**
2. Enter **OSC IP Address**: `127.0.0.1` (localhost)
3. Enter **OSC Port**: `9000` (VRChat default)
4. Enable **VRChat OSC Integration**
5. Click **Connect**
6. Status shows "Connected" when ready

### Connection Test

Test OSC connection:
1. Click **Test OSC** button
2. Avatar should wave (if wave gesture is mapped)
3. Check VRChat OSC debug for messages
4. If failed: Check port and IP address

## Avatar Parameters

VRChat avatars have standard and custom parameters:

### Standard Parameters

Built-in VRChat parameters (most avatars):

**Movement:**
- `VelocityX` - Left/right movement (float -1 to 1)
- `VelocityY` - Up/down movement (float -1 to 1)
- `VelocityZ` - Forward/backward movement (float -1 to 1)
- `Grounded` - Is avatar on ground (bool)
- `InStation` - Is avatar seated (bool)

**Expressions:**
- `VRCEmote` - Emote index (int 0-8)
- `VRCFaceBlendH` - Horizontal face blend (float -1 to 1)
- `VRCFaceBlendV` - Vertical face blend (float -1 to 1)

**Tracking:**
- `TrackingType` - Tracking mode (int)
- `VRMode` - Is in VR (bool)

**Input:**
- `MuteSelf` - Is muted (bool)
- `AFK` - Is AFK (bool)

### Custom Parameters

Avatar creators can add custom parameters:

**Common Custom Parameters:**
- `Wave` - Wave gesture (bool/int)
- `Dance` - Dance animation (bool/int)
- `Celebrate` - Celebration animation (bool)
- `Hearts` - Spawn hearts (bool/trigger)
- `Confetti` - Spawn confetti (bool/trigger)
- `Emote1` - Custom emote 1 (bool)
- `Emote2` - Custom emote 2 (bool)

Check your avatar documentation for available parameters.

## Parameter Types

### Bool (Boolean)

True/false values:
```
/avatar/parameters/Wave true
/avatar/parameters/Wave false
```

### Int (Integer)

Whole numbers:
```
/avatar/parameters/Emote 1
/avatar/parameters/Emote 2
```

### Float (Floating Point)

Decimal numbers:
```
/avatar/parameters/Speed 0.5
/avatar/parameters/Volume 0.75
```

## Sending OSC Messages

### Manual OSC Send

1. Go to **Dashboard** → **VRChat OSC**
2. Enter **Parameter Path**: `/avatar/parameters/Wave`
3. Enter **Value**: `true`
4. Click **Send**
5. Avatar waves (if parameter exists)

### Via Flows

Send OSC via automation:

```
Trigger: Gift
Condition: giftName == "Rose"
Actions:
  1. VRChat OSC: /avatar/parameters/Hearts = true
  2. Delay: 2 seconds
  3. VRChat OSC: /avatar/parameters/Hearts = false
```

### Via API

Send OSC via REST API:

```javascript
POST /api/vrchat/osc/send
{
  "address": "/avatar/parameters/Wave",
  "value": true
}
```

## Common Use Cases

### Gift-to-Gesture Mapping

Map gifts to avatar actions:

**Rose → Heart Particles:**
```
Trigger: Gift
Condition: giftName == "Rose"
Action: VRChat OSC
  - Parameter: /avatar/parameters/Hearts
  - Value: true
```

**Lion → Dance Animation:**
```
Trigger: Gift
Condition: giftName == "Lion"
Action: VRChat OSC
  - Parameter: /avatar/parameters/Dance
  - Value: 1
```

**Galaxy → Celebrate:**
```
Trigger: Gift
Condition: giftName == "Galaxy"
Action: VRChat OSC
  - Parameter: /avatar/parameters/Celebrate
  - Value: true
```

### Chat Command Gestures

Trigger gestures with chat commands:

**!wave → Wave Gesture:**
```
Trigger: Chat
Condition: message == "!wave"
Actions:
  1. VRChat OSC: /avatar/parameters/Wave = true
  2. Delay: 1 second
  3. VRChat OSC: /avatar/parameters/Wave = false
```

**!dance → Dance Animation:**
```
Trigger: Chat
Condition: message == "!dance"
Action: VRChat OSC: /avatar/parameters/Dance = 1
```

### Follower Welcome

Welcome new followers with gesture:

```
Trigger: Follow
Actions:
  1. VRChat OSC: /avatar/parameters/Wave = true
  2. TTS: "Welcome {username}!"
  3. Delay: 2 seconds
  4. VRChat OSC: /avatar/parameters/Wave = false
```

### Subscriber Celebration

Special animation for subscribers:

```
Trigger: Subscribe
Actions:
  1. VRChat OSC: /avatar/parameters/Celebrate = true
  2. VRChat OSC: /avatar/parameters/Confetti = true
  3. TTS: "Thank you {username} for subscribing!"
  4. Delay: 3 seconds
  5. VRChat OSC: /avatar/parameters/Celebrate = false
```

## Advanced Features

### Paramater Smoothing

Smooth parameter transitions:

```javascript
// Gradual increase
for (let i = 0; i <= 1; i += 0.1) {
  sendOSC("/avatar/parameters/Speed", i);
  await delay(100);
}
```

### Chained Animations

Chain multiple animations:

```
Trigger: Big Gift (coins >= 1000)
Actions:
  1. OSC: Wave = true
  2. Delay: 2s
  3. OSC: Wave = false
  4. OSC: Dance = 1
  5. Delay: 3s
  6. OSC: Dance = 0
  7. OSC: Celebrate = true
  8. Delay: 2s
  9. OSC: Celebrate = false
```

### Random Gestures

Randomize gestures for variety:

```
Trigger: Like
Condition: likeCount % 100 == 0
Action: VRChat OSC
  - Parameter: /avatar/parameters/Emote
  - Value: random(1, 8)
```

## OSC Debugging

### VRChat OSC Debug

Enable in VRChat:
1. Action Menu → Options → OSC
2. Enable **Debug OSC**
3. Console shows received OSC messages

### ltth.app OSC Monitor

Monitor sent OSC messages:
1. Go to **Dashboard** → **VRChat OSC** → **Monitor**
2. Shows all sent OSC messages
3. Real-time message log
4. Filter by parameter

### Common Issues

**Avatar not responding:**
- Check OSC is enabled in VRChat
- Verify parameter name is correct
- Check avatar has the parameter
- Test with VRChat OSC debug

**Wrong gesture triggered:**
- Check parameter value (int vs bool)
- Verify parameter mapping
- Test with manual send

**Delay/lag:**
- Check network connection
- Reduce OSC send frequency
- Use localhost (127.0.0.1)

## Avatar Parameter Discovery

### Finding Avatar Parameters

1. **Avatar Documentation** - Check avatar creator's docs
2. **VRChat OSC Debug** - Watch debug console for parameters
3. **VRChat Creator Companion** - Check avatar in Unity
4. **Community Resources** - Avatar Discord/forums

### Testing Parameters

1. Send test OSC message
2. Watch avatar for changes
3. If nothing happens: parameter doesn't exist
4. If something happens: note the effect

### Parameter Naming

Common parameter name formats:
- PascalCase: `WaveGesture`
- camelCase: `waveGesture`
- lowercase: `wave`
- With prefix: `custom_wave`

Try variations if parameter doesn't work.

## Performance Considerations

### OSC Message Rate

Limit OSC messages per second:
- Recommended: Max 20 messages/second
- VRChat processes ~60 messages/second
- Too many = lag and dropped messages

### Batch Messages

Send multiple parameters together:
```javascript
POST /api/vrchat/osc/batch
{
  "messages": [
    { "address": "/avatar/parameters/Wave", "value": true },
    { "address": "/avatar/parameters/Hearts", "value": true }
  ]
}
```

### Debounce Rapid Events

Prevent spam from rapid events:
- Use delay between OSC sends
- Limit to one gesture at a time
- Queue gestures instead of overlapping

## Security & Privacy

### Local Network Only

OSC should only work locally:
- Use 127.0.0.1 (localhost)
- Don't expose to internet
- Firewall blocks external OSC

### Parameter Validation

Validate OSC values:
- Check parameter exists
- Verify value type (bool/int/float)
- Clamp numeric values to valid range

## Integration Examples

### Full Gift-to-OSC System

```
Low Value Gifts (<100 coins):
  - Rose: Hearts particle
  - TikTok: Wave gesture

Medium Value Gifts (100-500 coins):
  - Finger Heart: Heart explosion
  - Doughnut: Dance animation

High Value Gifts (>500 coins):
  - Galaxy: Fireworks + Celebrate
  - Lion: Epic dance + Confetti
```

### Chat-Interactive Avatar

```
!wave → Wave gesture
!dance → Random dance
!heart → Heart particles
!confetti → Confetti explosion
!celebrate → Celebration animation
!emote1 → Custom emote 1
!emote2 → Custom emote 2
```

### Automated Reactions

```
Every 1000 likes → Celebrate
New follower → Wave
Subscriber → Special dance + confetti
Share → Thank you gesture
```

## API Reference

### Send OSC

```javascript
POST /api/vrchat/osc/send
{
  "address": "/avatar/parameters/Wave",
  "value": true,
  "type": "bool"
}
```

### Batch Send

```javascript
POST /api/vrchat/osc/batch
{
  "messages": [
    { "address": "/avatar/parameters/Wave", "value": true },
    { "address": "/avatar/parameters/Dance", "value": 1 }
  ]
}
```

### Get Status

```javascript
GET /api/vrchat/osc/status
```

### Get Recent Messages

```javascript
GET /api/vrchat/osc/messages?limit=50
```

See [[API-Reference]] for complete documentation.

## Best Practices

### Do's ✅

- Test gestures before going live
- Use descriptive parameter names
- Limit OSC send rate
- Use delays between gestures
- Check avatar has parameters
- Monitor OSC debug during setup

### Don'ts ❌

- Don't spam OSC messages (> 20/second)
- Don't hardcode IP addresses (use localhost)
- Don't forget to test with avatar
- Don't overlap gestures (wait for completion)
- Don't use extreme parameter values

## Avatar Requirements

### Minimum Requirements

For basic OSC support:
- VRChat SDK3 avatar
- At least one custom parameter
- Playable layers or animator controllers

### Recommended Setup

For full functionality:
- Multiple gesture parameters (wave, dance, etc.)
- Particle systems for effects (hearts, confetti)
- Expression controls
- Custom animations

### Creating OSC-Ready Avatars

1. Add parameters in Unity
2. Set up animator controllers
3. Create particle systems
4. Test in VRChat
5. Document parameters for users

---

*For more VRChat OSC examples and advanced usage, see [[API-Reference]] and [[flows]].*
