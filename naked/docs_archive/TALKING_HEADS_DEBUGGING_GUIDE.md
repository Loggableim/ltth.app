# Talking Heads - Debugging Guide

## Problem
Mouth animations (South Park-style lip sync) not displaying in OBS HUD when using TTS preview, despite successful avatar/sprite generation.

## Quick Diagnosis

### 1. Test Animation (Fastest Test)
1. Open Talking Heads plugin settings
2. Enable the plugin
3. Configure API keys (SiliconFlow or OpenAI)
4. Click **"Nur Animation testen"** button
5. Open OBS HUD in browser: `http://localhost:3000/talking-heads/obs-hud`
6. Press **F12** to open browser console
7. You should see:
   - Avatar appear and fade in
   - Mouth moving through closed → mid → open positions
   - Console logs showing the animation flow

### 2. Expected Console Logs

```
[TalkingHeads] OBS Overlay loaded and ready
[TalkingHeads] Waiting for socket connection...
[TalkingHeads] To enable verbose frame logging, run: window.DEBUG_TALKING_HEADS = true
[TalkingHeads] Overlay connected to server
[TalkingHeads] Socket ID: xyz123
[TalkingHeads] Starting animation for Animation Test (test_animation_user)
[TalkingHeads] Received sprites: idle_neutral,blink,speak_closed,speak_mid,speak_open
[TalkingHeads] Avatar shown for Animation Test
[TalkingHeads] Ending animation for test_animation_user
[TalkingHeads] Avatar removed for test_animation_user
```

### 3. Verbose Frame Logging

If you want to see EVERY frame update (useful for debugging sync issues):

```javascript
// In browser console:
window.DEBUG_TALKING_HEADS = true
```

Then run the animation test again. You'll see:
```
[TalkingHeads] Frame update for test_animation_user: idle_neutral
[TalkingHeads] Frame update for test_animation_user: speak_closed
[TalkingHeads] Updated Animation Test to frame: speak_closed
[TalkingHeads] Frame update for test_animation_user: speak_mid
[TalkingHeads] Updated Animation Test to frame: speak_mid
[TalkingHeads] Frame update for test_animation_user: speak_open
[TalkingHeads] Updated Animation Test to frame: speak_open
...
```

## Troubleshooting

### Scenario 1: No Console Logs at All
**Problem**: Socket connection not established

**Check**:
1. Is the server running? Check terminal
2. Is the OBS HUD URL correct? Should be: `http://localhost:3000/talking-heads/obs-hud`
3. Browser console shows errors? Look for red messages

**Fix**:
- Reload the OBS HUD page
- Check server logs for Socket.IO errors
- Try: `http://localhost:3000/api/talkingheads/test-socket` (should show client count)

### Scenario 2: Logs Appear But No Visual Animation
**Problem**: Sprites not loading or rendering

**Check Browser Network Tab** (F12 → Network):
1. Look for sprite requests like `/api/talkingheads/sprite/xxx.png`
2. Are they returning **404** (not found)? → Sprites weren't generated
3. Are they returning **200** (OK)? → Sprites exist but rendering issue

**If 404**:
- Avatar generation failed
- Check server logs for generation errors
- API keys might be invalid or missing

**If 200 but no visual**:
- Check CSS (avatar might be positioned off-screen)
- Check browser console for JavaScript errors
- Try different browser (WebGL/canvas issues)

### Scenario 3: Avatar Shows But Mouth Doesn't Move
**Problem**: Animation frames not updating

**Enable Verbose Logging**:
```javascript
window.DEBUG_TALKING_HEADS = true
```

**Then check**:
- Are `Frame update` logs appearing? 
  - **YES**: Frames are being sent, check if sprite URLs are loading
  - **NO**: Animation controller not running, check server logs

**Common Causes**:
- Plugin is disabled (enable in settings)
- Debug logging is off (turn on in settings)
- Animation duration too short (try longer)

### Scenario 4: Animation Works in Test But Not with TTS
**Problem**: TTS integration issue

**Check**:
1. Is TTS plugin enabled and working?
2. Try playing TTS without Talking Heads - does it work?
3. Check if preview TTS shows in server logs:
   ```
   TalkingHeads: Preview TTS request received for TalkingHeads Preview
   ```

**If preview log doesn't appear**:
- TTS playback event not reaching Talking Heads
- Check that both plugins are enabled
- Restart server

## Advanced Diagnostics

### Test Socket Connection
```bash
curl http://localhost:3000/api/talkingheads/test-socket
```

**Expected Response**:
```json
{
  "success": true,
  "clientCount": 1,
  "message": "Test ping sent..."
}
```

**In OBS HUD Console**:
```
[TalkingHeads] ✅ Socket test ping received!
[TalkingHeads] Connection is working correctly.
```

### Check Server Logs
Look for these key messages:

**Good Signs** ✅:
```
TalkingHeads: ✅ Plugin initialized successfully
TalkingHeads: ✅ Avatar and sprite generators initialized (siliconflow)
TalkingHeads: TTS playback bridge registered
TalkingHeads: Starting animation for Animation Test (5000ms)
TalkingHeads: Emitting animation:start for Animation Test
TalkingHeads: Starting speaking animation for Animation Test (duration: 5000ms)
TalkingHeads: Emitting mouth animation frames every 150ms
```

**Bad Signs** ❌:
```
TalkingHeads: ⚠️ No API key configured - avatar generation disabled
TalkingHeads: Failed to generate avatar: API key missing
TalkingHeads: Cannot start speaking animation - no animation found
```

### Validate Avatar Cache
```bash
curl http://localhost:3000/api/talkingheads/cache/list
```

Should return list of cached avatars with sprites. If empty, avatars aren't being generated.

## Configuration Checklist

- [ ] Talking Heads plugin **enabled**
- [ ] API key configured (SiliconFlow or OpenAI)
- [ ] TTS plugin **enabled** (for TTS preview)
- [ ] Debug logging **enabled** (for detailed logs)
- [ ] OBS HUD opened in browser with F12 console visible
- [ ] Socket.IO connected (check console logs)
- [ ] Test avatar generated successfully

## Common Issues & Solutions

### Issue: "Avatar generators not available"
**Solution**: Configure API key in Dashboard > Settings > TTS API Keys (SiliconFlow) or OpenAI API Configuration

### Issue: "TTS plugin is not available"
**Solution**: Enable TTS plugin in plugin settings

### Issue: Animation stops after 2 seconds
**Check**: Animation duration setting (default: 5000ms)

### Issue: Sprites show but are all the same
**Problem**: Sprite generation failed, only base avatar exists
**Solution**: Check API credits, regenerate avatar

### Issue: Multiple avatars overlapping
**Problem**: Animations not cleaning up properly
**Solution**: Reload OBS HUD page, restart server

## Performance Notes

- Frame updates happen every **150ms** (South Park style)
- Default animation duration: **5000ms** (5 seconds)
- Verbose logging disabled by default for performance
- Enable verbose only when debugging specific issues

## Getting Help

If none of the above helps:

1. **Collect Logs**:
   - Server console output
   - Browser console output from OBS HUD
   - Network tab showing sprite requests

2. **Test with verbose logging**:
   ```javascript
   window.DEBUG_TALKING_HEADS = true
   ```

3. **Run all diagnostics**:
   - Test animation button
   - Socket connection test
   - Cache list check

4. **Create GitHub Issue** with:
   - All logs collected
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/screen recording if possible

## Success Indicators

You know it's working when:
- ✅ Avatar fades in when animation starts
- ✅ Mouth cycles through: closed → mid → open → mid (repeating)
- ✅ Animation synchronized with TTS audio
- ✅ Avatar fades out when animation ends
- ✅ Console shows all expected logs
- ✅ No errors in browser or server console

## Next Steps

Once basic animation works:
1. Test with real TikTok users and TTS
2. Configure role permissions
3. Customize style templates
4. Adjust animation timing
5. Set up OBS WebSocket integration (future feature)
