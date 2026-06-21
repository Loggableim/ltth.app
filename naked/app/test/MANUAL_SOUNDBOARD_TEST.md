# Manual Soundboard Testing Guide

## Purpose
Verify the fixes for soundboard audio playback issues:
1. Audio plays correctly in the main dashboard (not just `/soundboard/ui`)
2. Audio plays correctly in OBS overlay
3. No double audio playback for events (except "teamherz" which should work)

## Prerequisites
- Node.js installed
- TikTok account for testing
- Browser with console open for debugging
- Optional: OBS Studio with browser source for overlay testing

## Test Setup

### 1. Start the Application
```bash
cd app
npm start
```

### 2. Open Dashboard
- Navigate to `http://localhost:3000/`
- Open browser DevTools (F12)
- Check Console for connection messages

### 3. Configure Soundboard
- Enable Soundboard plugin (if not already enabled)
- Go to Soundboard section in dashboard
- Check the "Enable Soundboard" checkbox
- Configure at least one sound for testing:
  - **Follow Sound**: Add a test MP3 URL (e.g., from MyInstants)
  - **Gift Sound**: Configure a sound for a specific gift ID
  - **Subscribe Sound**: Add a test MP3 URL

## Test Cases

### Test 1: Socket Connection in Main Dashboard ✅
**Expected Behavior:** Soundboard should reuse the existing socket from dashboard.js

**Steps:**
1. Open dashboard at `http://localhost:3000/`
2. Open browser console (F12)
3. Look for connection messages

**Expected Console Output:**
```
✅ Socket.io connection established (from dashboard.js)
✅ [Soundboard Frontend] Socket.io connected, ID: <socket-id>
📡 [Soundboard Frontend] Sent identification as dashboard client
✅ [Soundboard Frontend] Identified by server: { ... }
```

**Success Criteria:**
- Only ONE "Socket.io connected" message appears
- Socket IDs should match (soundboard reuses dashboard socket)
- No "duplicate socket" warnings

---

### Test 2: Socket Connection in Standalone UI ✅
**Expected Behavior:** Standalone page should create its own socket

**Steps:**
1. Open standalone soundboard UI at `http://localhost:3000/soundboard/ui`
2. Open browser console (F12)
3. Look for connection messages

**Expected Console Output:**
```
✅ [Soundboard Frontend] Socket.io connected, ID: <socket-id>
📡 [Soundboard Frontend] Sent identification as dashboard client
```

**Success Criteria:**
- Socket connection established successfully
- Soundboard UI functions independently

---

### Test 3: Audio Playback in Main Dashboard ✅
**Expected Behavior:** Audio should play when triggered from main dashboard

**Steps:**
1. In main dashboard, go to Soundboard section
2. Click "Test Sound" button on a configured sound
3. Watch browser console and listen for audio

**Expected Console Output:**
```
📡 [Soundboard Frontend] Received soundboard:play event: { ... }
🔊 [Soundboard] Playing: Test Sound
✅ [Soundboard] Started playing: Test Sound
✅ [Soundboard] Finished: Test Sound
```

**Success Criteria:**
- Sound plays audibly
- Console shows playback events
- No errors in console

---

### Test 4: Audio Playback in OBS Overlay ✅
**Expected Behavior:** Audio should play in OBS browser source

**Steps:**
1. Add Browser Source in OBS
2. Set URL to `http://localhost:3000/animation-overlay.html`
3. In dashboard, configure soundboard audio target:
   - Set to "OBS Overlay" or "Both"
4. Trigger a test sound from dashboard

**Expected in OBS Browser Source Log:**
```
Soundboard audio received: { ... }
✅ Soundboard audio started: Test Sound
✅ Soundboard audio finished: Test Sound
```

**Success Criteria:**
- Audio plays in OBS overlay
- Audio is audible if OBS monitoring is enabled
- No JavaScript errors

---

### Test 5: No Double Audio on Gift Event ✅
**Expected Behavior:** Only ONE audio should play per gift event

**Steps:**
1. Configure a gift sound in soundboard
2. Make sure soundboard is ENABLED
3. Connect to TikTok LIVE
4. Receive a gift that has a configured sound
5. Listen carefully and check console

**Expected Console Output (Backend):**
```
🎁 [Soundboard] Gift event received. Enabled: true
🎵 [Soundboard] Playing gift-specific sound: <gift-name>
```

**Expected Console Output (Frontend):**
```
📡 [Soundboard Frontend] Received soundboard:play event
🔊 [Soundboard] Playing: <gift-name>
```

**Success Criteria:**
- **Only ONE audio plays** (not two)
- Alert module should skip playing alert sound (because soundboard handles it)
- Console should show soundboard handling the sound

---

### Test 6: No Double Audio on Follow Event ✅
**Expected Behavior:** Only ONE audio should play per follow event

**Steps:**
1. Configure a follow sound in soundboard
2. Make sure soundboard is ENABLED
3. Connect to TikTok LIVE
4. Receive a follow event
5. Listen carefully and check console

**Expected Console Output:**
```
⭐ [Soundboard] Follow event received. Enabled: true
📡 [Soundboard Frontend] Received soundboard:play event
🔊 [Soundboard] Playing: Follow
```

**Success Criteria:**
- **Only ONE audio plays**
- No duplicate playback
- Visual alert may still show (without sound)

---

### Test 7: No Double Audio on Subscribe Event ✅
**Expected Behavior:** Only ONE audio should play per subscribe event

**Steps:**
1. Configure a subscribe sound in soundboard
2. Make sure soundboard is ENABLED
3. Connect to TikTok LIVE
4. Receive a subscribe event
5. Listen carefully and check console

**Success Criteria:**
- **Only ONE audio plays**
- No duplicate playback

---

### Test 8: No Double Audio on Share Event ✅
**Expected Behavior:** Only ONE audio should play per share event

**Steps:**
1. Configure a share sound in soundboard
2. Make sure soundboard is ENABLED
3. Connect to TikTok LIVE
4. Receive a share event
5. Listen carefully and check console

**Success Criteria:**
- **Only ONE audio plays**
- No duplicate playback

---

### Test 9: Alerts Still Work When Soundboard is Disabled ✅
**Expected Behavior:** Alert sounds should play when soundboard is disabled

**Steps:**
1. **Disable** soundboard (uncheck "Enable Soundboard")
2. Configure alert sounds in Alerts section
3. Receive a gift/follow event
4. Listen for audio

**Success Criteria:**
- Alert system plays sound (since soundboard is disabled)
- Visual alert shows with sound
- No JavaScript errors

---

### Test 10: "Teamherz" Exception ✅
**Note:** The issue mentions "teamherz" works correctly (no double audio).
This should continue to work after the fix.

**Steps:**
1. Configure "teamherz" gift sound
2. Receive a "teamherz" gift
3. Verify only one audio plays

**Success Criteria:**
- Single audio playback (no regression)

---

## Known Issues & Expected Behavior

### soundboard_enabled Setting
The fix aligns the check logic:
- **Old behavior (alerts.js)**: `soundboard_enabled === 'true'` (strict)
- **New behavior (alerts.js)**: `soundboard_enabled !== 'false'` (permissive)

This means:
- `'true'` → soundboard enabled ✅
- `undefined` or `null` → soundboard enabled ✅ (default)
- `'false'` → soundboard disabled ✅

### Audio Target Setting
Soundboard supports three audio targets:
- `'dashboard'` - Play only in main dashboard
- `'obs_overlay'` - Play only in OBS overlay
- `'both'` - Play in both (default)

Test with different targets to ensure routing works correctly.

---

## Debugging Tips

### Check Socket Connection
In browser console, run:
```javascript
// Should show the socket ID
console.log('Socket ID:', socket.id);
console.log('Socket connected:', socket.connected);
```

### Test Sound Manually
In browser console, run:
```javascript
// Emit a test sound event
socket.emit('soundboard:play', {
    url: 'https://example.com/test.mp3',
    volume: 1.0,
    label: 'Manual Test',
    eventType: 'test'
});
```

### Check soundboard_enabled Value
In Node.js backend console or browser console (if exposed):
```javascript
// Check database value
db.getSetting('soundboard_enabled')
// Should return 'true', 'false', or null/undefined
```

---

## Reporting Issues

If tests fail, please provide:
1. **Test case number** that failed
2. **Console logs** (both browser and Node.js)
3. **Expected vs Actual behavior**
4. **Screenshots** if applicable
5. **Browser** and version used

---

## Success Criteria Summary

All tests should pass with:
- ✅ Audio plays in main dashboard
- ✅ Audio plays in OBS overlay
- ✅ No double audio on any event type
- ✅ Soundboard and alerts system work harmoniously
- ✅ No JavaScript errors in console
- ✅ Socket connection reused properly in main dashboard
