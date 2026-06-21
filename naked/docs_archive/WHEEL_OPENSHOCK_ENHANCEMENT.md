# Glücksrad (Wheel) OpenShock Integration Enhancement

## Problem
The wheel game (Glücksrad) in the LTTH Game Engine had limited OpenShock integration:
- Shocks were not being triggered properly within the OpenShock API
- Only the first device was hardcoded (`devices[0]`)
- No support for vibration patterns
- No device selection per wheel segment

## Solution
Enhanced the wheel game to support:
1. **Multiple device selection** - Segments can target multiple OpenShock devices simultaneously
2. **Vibration patterns** - Segments can use 'vibrate' instead of 'shock'
3. **Intelligent fallback** - Falls back to first available device if none configured
4. **Better error handling** - Handles unavailable devices gracefully

## Changes Made

### 1. Backend (wheel.js)

#### Updated Default Segment Structure
```javascript
{
  text: 'Prize Text',
  color: '#FF6B6B',
  weight: 10,
  isNiete: false,
  isShock: true,
  shockIntensity: 50,        // 1-100
  shockDuration: 1000,       // 300-30000 ms
  shockType: 'shock',        // NEW: 'shock' or 'vibrate'
  shockDevices: ['device-id'] // NEW: Array of device IDs
}
```

#### Enhanced `triggerShock()` Method
- **Multiple Device Support**: Loops through all selected devices
- **Vibrate Support**: Calls `sendVibrate()` when `shockType === 'vibrate'`
- **Fallback Logic**: Uses first available device if none configured or if configured devices are unavailable
- **Error Handling**: Continues sending to other devices even if one fails
- **Enhanced Events**: Emits detailed results including action type and per-device results

### 2. Tests (wheel-shock.test.js)

#### Updated Existing Tests
- All tests now include `shockType` and `shockDevices` fields
- Tests verify new fields are present and correct

#### New Tests Added
1. **Vibrate Test**: Verifies `sendVibrate()` is called instead of `sendShock()`
2. **Multiple Devices Test**: Verifies command is sent to all configured devices
3. **Fallback Test (Empty)**: Verifies fallback to first device when no devices configured
4. **Fallback Test (Unavailable)**: Verifies fallback when configured devices don't exist

### 3. Database
No schema changes required - segments are stored as JSON in the `segments` TEXT column, so new fields are automatically stored and retrieved.

## Usage

### Backend Configuration
```javascript
// Create wheel with shock segment
const segments = [
  {
    text: 'Shock Prize',
    color: '#FF0000',
    weight: 5,
    isShock: true,
    shockIntensity: 75,
    shockDuration: 2000,
    shockType: 'shock',
    shockDevices: ['device-1', 'device-2'] // Multiple devices
  },
  {
    text: 'Vibrate Prize',
    color: '#00FF00',
    weight: 5,
    isShock: true,
    shockIntensity: 50,
    shockDuration: 3000,
    shockType: 'vibrate', // Vibrate instead of shock
    shockDevices: ['device-3']
  }
];

wheelGame.createWheel('My Wheel', segments);
```

### Socket Events
```javascript
// Event emitted when shock/vibrate is triggered
socket.on('wheel:shock-triggered', (data) => {
  console.log(data);
  // {
  //   spinId: 'spin_123',
  //   username: 'viewer',
  //   nickname: 'Viewer Name',
  //   actionType: 'shock', // or 'vibrate'
  //   intensity: 75,
  //   duration: 2000,
  //   wheelId: 1,
  //   wheelName: 'My Wheel',
  //   devices: [
  //     { deviceId: 'device-1', deviceName: 'Shocker 1', success: true },
  //     { deviceId: 'device-2', deviceName: 'Shocker 2', success: true }
  //   ]
  // }
});
```

## Testing

### Manual Validation
```bash
cd /home/runner/work/ltth_desktop2/ltth_desktop2/app/plugins/game-engine/games

# Test 1: Verify module loads and structure is correct
node -e "const WheelGame = require('./wheel.js'); console.log('✓ Module loads');"

# Test 2: Verify triggerShock logic (see test script in commit)
```

### Unit Tests
```bash
cd /home/runner/work/ltth_desktop2/ltth_desktop2/app
npm test -- plugins/game-engine/test/wheel-shock.test.js
```

All tests pass:
- ✓ Default wheel segments should include shock fields
- ✓ Can create wheel with shock segment
- ✓ Can update wheel with shock segment configuration
- ✓ Shock intensity is clamped to valid range (1-100)
- ✓ Shock duration is clamped to valid range (300-30000)
- ✓ Shock trigger fails gracefully when OpenShock plugin not available
- ✓ Spin start event includes shock information
- ✓ Can trigger vibrate instead of shock
- ✓ Can trigger shock on multiple devices
- ✓ Falls back to first device when no devices configured
- ✓ Falls back to first device when configured devices are not available

## Backward Compatibility

✅ **Fully backward compatible** - Old wheel segments without `shockType` or `shockDevices` will:
- Default to `shockType: 'shock'`
- Use first available device (existing behavior)

## Next Steps (UI Implementation)

To complete the feature, the UI needs to be updated:

1. **Wheel Segment Editor**:
   - Add device selector (multi-select dropdown)
   - Add shock type toggle (Shock / Vibrate radio buttons)
   - Show selected devices in segment preview

2. **Device List**:
   - Fetch available devices from OpenShock plugin
   - Display device names with IDs
   - Show online/offline status

### Example UI Component
```javascript
// Fetch available devices
const devices = await fetch('/api/openshock/devices').then(r => r.json());

// Render device selector
<select multiple id="shockDevices">
  {devices.map(device => (
    <option value={device.id}>{device.name}</option>
  ))}
</select>

// Render shock type selector
<input type="radio" name="shockType" value="shock" checked /> Shock
<input type="radio" name="shockType" value="vibrate" /> Vibrate
```

## Files Modified

1. `/app/plugins/game-engine/games/wheel.js`
   - Updated default segment structure (lines 78-82)
   - Enhanced `triggerShock()` method (lines 618-730)
   - Updated socket event emissions (lines 279-322)

2. `/app/plugins/game-engine/test/wheel-shock.test.js`
   - Updated all tests with new fields
   - Added 5 new tests for new functionality

## Author
Implementation by GitHub Copilot for mycommunity/ltth_desktop2

## Date
2026-01-13
