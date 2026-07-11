# Per-User TTS Gain Control Implementation

**Date:** 2026-01-22  
**Feature:** Per-user TTS output gain control (0-300%)  
**Status:** ✅ Complete

## Overview

This document describes the implementation of per-user TTS output gain control, allowing individual volume adjustment for each user in the range of 0-300% (0.0-3.0 gain multiplier).

## Architecture

### Backend Components

#### 1. Database Schema
- **Table:** `tts_user_permissions`
- **Column:** `volume_gain REAL DEFAULT 1.0`
- **Range:** 0.0 - 3.0 (server-side clamped)
- **Default:** 1.0 (100%)

#### 2. API Endpoints

**Update User Gain:**
```
POST /api/tts/users/:userId/gain
Body: { gain: number }
Response: { success: boolean, gain: number }
```

**Assign Voice with Gain:**
```
POST /api/tts/users/:userId/voice
Body: { 
  username: string, 
  voiceId: string, 
  engine: string, 
  emotion?: string,
  gain?: number 
}
Response: { success: boolean }
```

**List Users (includes gain):**
```
GET /api/tts/users?filter={filter}
Response: { 
  success: boolean, 
  users: Array<{ 
    user_id, 
    username, 
    volume_gain, 
    ... 
  }> 
}
```

#### 3. Constants

**TTSPlugin Class:**
```javascript
static MIN_GAIN = 0.0;    // Minimum gain multiplier (0%)
static MAX_GAIN = 3.0;    // Maximum gain multiplier (300%)
static DEFAULT_GAIN = 1.0; // Default gain multiplier (100%)
```

**PermissionManager Class:**
```javascript
static MIN_GAIN = 0.0;    // Must match TTSPlugin
static MAX_GAIN = 3.0;    // Must match TTSPlugin
static DEFAULT_GAIN = 1.0; // Must match TTSPlugin
```

#### 4. Audio Pipeline Integration

Gain is applied in the `speak()` method:
```javascript
volume: this.config.volume * (userSettings?.volume_gain ?? 1.0)
```

The per-user gain is multiplied with the global volume setting before being sent to clients via Socket.IO.

#### 5. Socket.IO Events

**Gain Update Event:**
```javascript
socket.emit('tts:user:gain_updated', {
  userId: string,
  gain: number
});
```

Emitted whenever a user's gain is updated, allowing for live updates.

### Frontend Components

#### 1. Constants

```javascript
const MIN_GAIN = 0.0;           // Backend: 0.0
const MAX_GAIN = 3.0;           // Backend: 3.0
const DEFAULT_GAIN = 1.0;       // Backend: 1.0
const MIN_GAIN_PERCENT = 0;     // UI: 0%
const MAX_GAIN_PERCENT = 300;   // UI: 300%
const DEFAULT_GAIN_PERCENT = 100; // UI: 100%
```

#### 2. Voice Assignment Modal

**Location:** `admin-panel.html` (lines 715-730)

**Controls:**
- Range slider: 0-300%, step 5%
- Number input: 0-300%, step 1%
- Reset button: Returns to 100%

**Behavior:**
- Loads current user gain when opening modal
- Updates on slider drag (`oninput`)
- Updates on input change
- Persists on voice assignment

#### 3. User Management List

**Location:** `tts-admin-production.js` (renderUsers function)

**Controls per user:**
- Inline range slider: 0-300%, step 5%
- Inline number input: 0-300%, step 1%
- Inline reset button: Returns to 100%
- Live percentage display

**Visibility:**
- Controls only shown for users with assigned voices
- Positioned below user info in a bordered section

**Behavior:**
- Live updates via `oninput` event
- Immediate API calls on change
- Updates local state after successful save

#### 4. Event Handlers

```javascript
handleUserGainChange(event)      // Slider input
handleUserGainInputChange(event) // Number input
handleUserGainReset(event)       // Reset button
updateUserGain(userId, gain)     // API call wrapper
```

## Testing

### Automated Tests

**File:** `app/test/tts-user-gain-control.test.js`

**Test Cases (12 total):**
1. ✅ Database schema includes volume_gain column
2. ✅ API endpoint POST /api/tts/users/:userId/gain exists
3. ✅ Server-side gain clamping using constants
4. ✅ PermissionManager has setVolumeGain method
5. ✅ assignVoice method supports optional gain parameter
6. ✅ Gain is applied in audio synthesis pipeline
7. ✅ Socket event emitted for live gain updates
8. ✅ UI includes gain controls in voice assignment modal
9. ✅ UI includes gain controls in user list
10. ✅ Gain range is correctly set to 0-300%
11. ✅ TikTok engine visible in manual voice assignment
12. ✅ JavaScript includes updateUserGain function

**Run Command:**
```bash
cd app
node test/tts-user-gain-control.test.js
```

### Manual Testing Checklist

- [ ] Open admin panel at `/plugins/tts/ui/admin-panel.html`
- [ ] Assign a voice to a test user
- [ ] Verify gain controls appear in user list
- [ ] Test slider interaction (0-300%)
- [ ] Test number input (direct entry)
- [ ] Test reset button (returns to 100%)
- [ ] Open voice assignment modal for user with gain
- [ ] Verify current gain value is loaded
- [ ] Change gain in modal and save
- [ ] Verify gain persists after page reload
- [ ] Test TTS playback with different gain values
- [ ] Test embedded mode (dashboard iframe)
- [ ] Test standalone mode (direct URL)

## Files Modified

1. **app/plugins/tts/main.js**
   - Added MIN_GAIN, MAX_GAIN, DEFAULT_GAIN constants
   - Added POST /api/tts/users/:userId/gain endpoint
   - Updated POST /api/tts/users/:userId/voice to accept gain
   - Added socket event emission for gain updates

2. **app/plugins/tts/utils/permission-manager.js**
   - Added MIN_GAIN, MAX_GAIN, DEFAULT_GAIN constants
   - Updated assignVoice() to accept optional gain parameter
   - Added gain clamping logic

3. **app/plugins/tts/ui/admin-panel.html**
   - Added gain controls to voice assignment modal
   - Added TikTok engine to manual voice assignment dropdown

4. **app/plugins/tts/ui/tts-admin-production.js**
   - Added gain-related constants
   - Updated renderUsers() to include inline gain controls
   - Added gain event handlers
   - Updated assignVoiceDialog() to load/save gain
   - Updated modal state to include volumeGain

5. **app/plugins/tts/README.md**
   - Added per-user gain control documentation
   - Updated API endpoint documentation
   - Added usage examples with gain parameter

6. **app/test/tts-user-gain-control.test.js**
   - Created comprehensive test suite (12 tests)

## Usage Examples

### Setting Gain via API

```javascript
// Update gain for a specific user
fetch('/api/tts/users/12345/gain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gain: 1.5 }) // 150%
});

// Assign voice with custom gain
fetch('/api/tts/users/12345/voice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'TestUser',
    voiceId: 'de_002',
    engine: 'tiktok',
    gain: 0.8 // 80%
  })
});
```

### Listening for Gain Updates

```javascript
socket.on('tts:user:gain_updated', (data) => {
  console.log(`User ${data.userId} gain updated to ${data.gain}`);
  // Update UI or trigger actions
});
```

## Known Limitations

1. Gain values above 1.5 (150%) may cause audio distortion depending on the source
2. Client-side volume control is independent of this gain setting
3. Global volume setting is multiplied with per-user gain (combined effect)

## Future Enhancements

- [ ] Add per-engine limiter to prevent distortion at high gain values
- [ ] Add visual indicator when gain is at non-default value
- [ ] Add bulk gain adjustment for multiple users
- [ ] Add gain presets (quiet, normal, loud)
- [ ] Add gain history/logging for debugging

## Troubleshooting

### Gain controls not appearing
- Verify user has an assigned voice (controls only show for users with voices)
- Check browser console for JavaScript errors
- Verify GET /api/tts/users returns volume_gain field

### Gain not applied to audio
- Check that volume_gain value is stored in database
- Verify speak() method applies gain: `this.config.volume * (userSettings?.volume_gain ?? 1.0)`
- Check Socket.IO event emits correct volume value

### UI not updating after gain change
- Verify API endpoint returns success
- Check that updateUserGain() function updates local state
- Verify Socket.IO connection is active

## References

- [TTS Plugin README](../app/plugins/tts/README.md)
- [Test Suite](../app/test/tts-user-gain-control.test.js)
- [Permission Manager](../app/plugins/tts/utils/permission-manager.js)
