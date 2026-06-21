# Soundboard Troubleshooting Guide

This guide helps you diagnose and fix soundboard audio playback issues in LTTH (Little TikTool Helper).

## Quick Diagnostic Checklist

### 1. Check Soundboard Status
Open the browser developer console (F12) and look for these messages:

✅ **Good signs:**
```
✅ [Soundboard Frontend] Socket.io connected, ID: <socket-id>
📡 [Soundboard Frontend] Sent identification as dashboard client
✅ [Soundboard Frontend] Identified by server: { status: 'ok', clientId: '<id>' }
```

❌ **Problem signs:**
```
❌ [Soundboard Frontend] Socket.io disconnected: <reason>
❌ [Soundboard Frontend] Socket.io connection error: <error>
```

### 2. Check if Soundboard is Enabled
**Backend (Server Logs):**
Look for event messages like:
```
🎁 [Soundboard] Gift event received. Enabled: true (setting value: true)
```

If you see:
```
🎁 [Soundboard] Gift event received. Enabled: false (setting value: false)
ℹ️ [Soundboard] Gift event skipped - soundboard is disabled
```
→ The soundboard is disabled. Enable it in the soundboard settings.

**Frontend (Dashboard UI):**
1. Navigate to `/soundboard/ui`
2. Check if the "Enable Soundboard" checkbox is checked
3. If unchecked, check it and click "Save Settings"

### 3. Check Sound Configuration
Sounds must be configured for events to play:

**For TikTok Events (Follow, Subscribe, Share):**
1. Open soundboard settings: `/soundboard/ui`
2. Scroll to "Event Sounds" section
3. Verify that:
   - Sound URL is not empty
   - Volume is set (0.0 to 1.0)
   - Click "Test" button to verify sound plays

**For Gift Sounds:**
1. Open soundboard settings: `/soundboard/ui`
2. Scroll to "Gift Sounds" section
3. Configure sounds for specific gifts OR set a default gift sound

**Backend Logs:**
If a sound is not configured, you'll see:
```
ℹ️ [Soundboard] No sound configured for follow event
ℹ️ [Soundboard] No sound configured for gift: Rose (ID: 5655)
```

### 4. Check Sound Emission
When a TikTok event occurs, the backend should emit the sound:

**Backend Logs:**
```
🎵 [Soundboard] Emitting sound to frontend: { label: 'Follow', url: '...', volume: 1.0, ... }
📡 [Soundboard] Emitting 'soundboard:play' event: {...}
📡 [Soundboard] Event emitted to 2 connected client(s)
```

❌ **Problem**: If you don't see emission logs, check:
- Is soundboard enabled? (see step 2)
- Is the sound URL configured? (see step 3)
- Are TikTok events being received?

### 5. Check Sound Reception (Frontend)
Open browser console and look for:

✅ **Good:**
```
📡 [Soundboard Frontend] Received soundboard:play event: { url: '...', volume: 1.0, label: 'Follow', ... }
🔊 [Soundboard] Playing: Follow
✅ [Soundboard] Started playing: Follow
```

❌ **Problem:** No "Received soundboard:play event" message
→ Frontend is not receiving events. Check Socket.io connection (step 1)

### 6. Check Audio Playback
**Browser Console:**
```
🔊 [Soundboard] Playing: Test Sound
✅ [Soundboard] Started playing: Test Sound
✅ [Soundboard] Finished: Test Sound
```

❌ **Common Errors:**

**Error: "Invalid sound data - missing URL"**
```
❌ [Soundboard] Invalid sound data - missing URL: { label: 'Follow', url: undefined }
```
→ Sound URL is not configured. Go to soundboard settings and set the URL.

**Error: "Playback failed: NotAllowedError"**
```
❌ [Soundboard] Playback error: NotAllowedError: play() failed because the user didn't interact with the document first
```
→ Browser autoplay policy blocking. User must interact with page first (click anywhere).

**Error: "Audio error: error"**
```
❌ [Soundboard] Error playing: Follow error
❌ [Soundboard] Audio error for Follow: error
```
→ Sound file failed to load. Check:
- Is the URL accessible?
- Is the file format supported? (MP3, WAV, OGG recommended)
- Check browser network tab for 404 or CORS errors

## Common Issues and Solutions

### Issue 1: Preview Sounds Don't Work
**Symptoms:**
- Test button in soundboard UI doesn't play sound
- Preview sounds don't reach dashboard

**Solution:**
This was a known bug that has been fixed. Ensure you have the latest version where:
1. Dashboard client identifies itself on connection
2. WebSocket transport tracks dashboard clients
3. Preview events are sent only to registered dashboard clients

**Verify Fix:**
Browser console should show:
```
✅ [Soundboard Frontend] Socket.io connected, ID: ...
📡 [Soundboard Frontend] Sent identification as dashboard client
✅ [Soundboard Frontend] Identified by server: ...
```

### Issue 2: Regular TikTok Event Sounds Don't Play
**Symptoms:**
- No sound when someone follows, subscribes, or sends gifts
- Backend logs show "soundboard is disabled"

**Root Causes:**
1. **Soundboard is disabled**
   - **Check:** Backend logs show `Enabled: false`
   - **Fix:** Enable in soundboard settings UI

2. **Sound URLs not configured**
   - **Check:** Backend logs show "No sound configured for..."
   - **Fix:** Configure sound URLs in soundboard settings

3. **Invalid sound URLs**
   - **Check:** Frontend logs show "Invalid sound data - missing URL"
   - **Fix:** Verify sound URLs are correct and accessible

### Issue 3: Sounds Play Twice
**Symptoms:**
- Each sound plays with a slight delay/echo

**This was a previous bug (already fixed):**
- Duplicate socket listeners in dashboard.js and dashboard-soundboard.js
- Only dashboard-soundboard.js should handle soundboard:play events

### Issue 4: Queue Not Working
**Symptoms:**
- Sounds overlap when they should play sequentially
- Queue mode doesn't seem to affect playback

**Check:**
1. Open soundboard settings: `/soundboard/ui`
2. Check "Playback Mode" setting:
   - **Overlap (Default)**: All sounds play immediately, can overlap
   - **Queue All (Sequential)**: All sounds queue, play one at a time
   - **Queue Per Gift**: Sounds of same type queue, different types play simultaneously

3. Verify mode is saved:
   - Browser console should show: `🎵 [Soundboard] Play mode set to: <mode>`

## Debug Mode: Detailed Logging

All soundboard operations are now logged in detail. To view:

1. **Backend Logs:**
   - Check terminal/console where LTTH server is running
   - Look for lines starting with `[Soundboard]`

2. **Frontend Logs:**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Filter for "Soundboard"

### Key Log Patterns

**Successful Sound Playback:**
```
Backend:
  🎁 [Soundboard] Gift event received. Enabled: true (setting value: true)
  🎵 [Soundboard] Playing gift-specific sound: Rose
  🎵 [Soundboard] Emitting sound to frontend: { label: 'Rose', url: '...', ... }
  📡 [Soundboard] Event emitted to 2 connected client(s)

Frontend:
  📡 [Soundboard Frontend] Received soundboard:play event: { url: '...', ... }
  🔊 [Soundboard] Playing: Rose
  ✅ [Soundboard] Started playing: Rose
  ✅ [Soundboard] Finished: Rose
```

## Browser Compatibility

### Autoplay Policy
Modern browsers block autoplay of audio without user interaction.

**Solution:**
1. User must interact with the page first (click anywhere)
2. Or enable autoplay for your localhost/domain in browser settings

### CORS Issues
If loading sounds from external URLs:

**Symptoms:**
- Network tab shows CORS error
- Sound fails to load

**Solution:**
1. Use the audio proxy endpoint: `/api/myinstants/proxy-audio?url=<encoded-url>`
2. Or ensure external server sends proper CORS headers

## Configuration Validation

### Check Database Settings
If you have direct database access:

```sql
SELECT key, value FROM settings WHERE key LIKE 'soundboard_%';
```

**Expected values:**
- `soundboard_enabled`: `'true'` or `'false'` (string)
- `soundboard_play_mode`: `'overlap'`, `'queue-all'`, or `'queue-per-gift'`
- `soundboard_follow_sound`: URL or empty
- `soundboard_subscribe_sound`: URL or empty
- `soundboard_share_sound`: URL or empty
- `soundboard_follow_volume`: Number 0.0-1.0
- `soundboard_subscribe_volume`: Number 0.0-1.0
- `soundboard_share_volume`: Number 0.0-1.0

### Reset to Defaults
If soundboard is completely broken:

1. Delete soundboard settings from database:
```sql
DELETE FROM settings WHERE key LIKE 'soundboard_%';
```

2. Restart LTTH server
3. Reconfigure soundboard from scratch

## Support

If you've followed this guide and sounds still don't play:

1. **Collect logs:**
   - Copy backend console logs
   - Copy browser console logs (F12)
   - Take screenshots of soundboard settings

2. **Report issue with:**
   - LTTH version
   - Browser name and version
   - Operating system
   - Collected logs

3. **Include:**
   - What were you trying to do?
   - What happened instead?
   - When did it start happening?

## Recent Fixes

### Latest Release
- **Fixed**: Preview sounds not working due to missing client identification
- **Fixed**: Dashboard clients now properly register with WebSocket transport
- **Enhanced**: Comprehensive debugging logs for all sound operations
- **Enhanced**: URL validation to prevent undefined/empty sound URLs
- **Enhanced**: Event handler logging shows enabled status and setting values
