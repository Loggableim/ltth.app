# Weather Control Plugin - Manual Testing Guide

## Test Environment Setup

### Prerequisites
1. LTTH application running on localhost:3000
2. Weather Control Plugin enabled
3. Browser with developer console open
4. OBS Studio with Browser Source (optional but recommended)

### Setup Steps

1. Start the application:
   ```bash
   cd app
   npm start
   ```

2. Open Admin UI:
   - Navigate to `http://localhost:3000/weather-control/ui`
   - Open browser developer console (F12)

3. Open Overlay in another tab/window:
   - Navigate to `http://localhost:3000/weather-control/overlay`
   - Open browser developer console (F12)
   - Watch for log messages

## Test Scenarios

### Test 1: Default Configuration (useGlobalAuth = true)

**Expected Behavior**: Should work without any issues (this is the default and was already working)

**Steps:**
1. In Admin UI, verify "Global Auth" checkbox is **checked**
2. If unchecked, check it and click "Save Configuration"
3. In Overlay tab, verify you see:
   ```
   ✅ Connected to server
   Waiting for weather events via WebSocket...
   ```
4. In Admin UI, scroll to "Rain Effect" card
5. Click the **"▶️ Test Effect"** button
6. In Overlay tab console, you should see:
   ```
   🌦️ Received weather event #1: rain
   ```
7. **Visual Check**: Rain effect should be visible in the overlay

**Success Criteria:**
- ✅ No errors in Admin UI console
- ✅ Success status shown in Admin UI: "Effect triggered: Rain"
- ✅ Event received log appears in Overlay console
- ✅ Rain animation visible in Overlay

---

### Test 2: API Key Authentication (useGlobalAuth = false)

**Expected Behavior**: Should now work with the fix (was broken before)

**Steps:**
1. In Admin UI, **uncheck** "Global Auth" checkbox
2. Note the API key displayed in the settings (or generate a new one)
3. Click "Save Configuration"
4. Reload the Admin UI page to ensure config is fresh
5. In Overlay tab, verify connection is still active
6. In Admin UI, click **"▶️ Test Effect"** for Snow
7. In Admin UI console, check for any errors
8. In Overlay tab console, you should see:
   ```
   🌦️ Received weather event #X: snow
   ```
9. **Visual Check**: Snow effect should be visible in the overlay

**Success Criteria:**
- ✅ No errors in Admin UI console
- ✅ No authentication errors (401)
- ✅ Success status shown in Admin UI: "Effect triggered: Snow"
- ✅ Event received log appears in Overlay console
- ✅ Snow animation visible in Overlay

---

### Test 3: Missing API Key Edge Case

**Expected Behavior**: Should show warning but not crash

**Steps:**
1. In Admin UI, uncheck "Global Auth"
2. Open browser developer console
3. Run this in console to simulate missing API key:
   ```javascript
   weatherConfig.apiKey = '';
   ```
4. Click **"▶️ Test Effect"** for any effect
5. Check Admin UI console for warning:
   ```
   [Weather Control] API key required but not configured. Request may fail.
   ```
6. Check for status message: "API key not configured. Please check settings."

**Success Criteria:**
- ✅ Warning logged to console
- ✅ User-friendly error message displayed
- ✅ Application doesn't crash
- ⚠️ Request fails (expected behavior)

---

### Test 4: Multiple Effects in Sequence

**Expected Behavior**: All effects should work correctly

**Steps:**
1. Ensure "Global Auth" is checked
2. Click test buttons for all effects in order:
   - Rain → Snow → Storm → Fog → Thunder → Sunbeam → Glitch Clouds
3. For each click, verify in Overlay console:
   ```
   🌦️ Received weather event #N: [effect-name]
   ```
4. Check that event counter increments: #1, #2, #3, etc.

**Success Criteria:**
- ✅ All 7 effects received by overlay
- ✅ Event counter increments correctly
- ✅ No errors in either console
- ✅ Visual effects appear (at least briefly)

---

### Test 5: OBS Browser Source Integration

**Expected Behavior**: Effects should work in OBS just like in browser

**Steps:**
1. Open OBS Studio
2. Add a Browser Source:
   - URL: `http://localhost:3000/weather-control/overlay`
   - Width: 1920, Height: 1080
   - Check "Shutdown source when not visible"
3. Make the source visible in a scene
4. In Admin UI (in web browser), click test buttons
5. Watch OBS preview for effects

**Success Criteria:**
- ✅ Overlay loads in OBS (may take a few seconds)
- ✅ Effects appear in OBS when test buttons clicked
- ✅ Effects are smooth and performant
- ✅ Transparency works correctly (no background)

---

### Test 6: Configuration Switching

**Expected Behavior**: Changes should take effect immediately after save

**Steps:**
1. Set "Global Auth" to **checked**, save
2. Test an effect → Should work ✅
3. Set "Global Auth" to **unchecked**, save
4. Reload Admin UI page
5. Test an effect → Should work ✅
6. Set "Global Auth" to **checked** again, save
7. Reload Admin UI page
8. Test an effect → Should work ✅

**Success Criteria:**
- ✅ All tests pass regardless of auth mode
- ✅ Config persists across reloads
- ✅ No manual intervention needed

---

### Test 7: Error Handling

**Expected Behavior**: Errors should be displayed clearly

**Steps:**
1. In Admin UI, click test button for a **disabled** effect
2. Expected error: "Effect 'xxx' is disabled"
3. With "Global Auth" unchecked, modify API key to wrong value:
   ```javascript
   weatherConfig.apiKey = 'wrong-key-12345';
   ```
4. Click test button
5. Expected error: "Invalid API key"

**Success Criteria:**
- ✅ Clear error messages displayed
- ✅ No silent failures
- ✅ Errors logged to console for debugging

---

## Troubleshooting

### Issue: No events received in overlay

**Check:**
1. Is the overlay actually connected? Look for "✅ Connected to server" in console
2. Is the Admin UI showing success? Check for green status message
3. Are there any 401 errors in the Network tab?
4. Is the effect enabled? Check the checkbox for the effect
5. Try refreshing both the Admin UI and Overlay

### Issue: 401 Unauthorized errors

**Check:**
1. Is "Global Auth" unchecked? If yes, API key is required
2. Is the API key correctly stored? Check `weatherConfig.apiKey` in console
3. Has the page been reloaded after changing auth settings?
4. Try checking "Global Auth" to bypass API key requirement

### Issue: Effects don't appear visually

**Check:**
1. Is the event being received? Check overlay console for log messages
2. Is GSAP library loaded? Check console for GSAP version log
3. Is the canvas initialized? Check for canvas context initialization log
4. Try opening overlay in a new tab/window
5. Check browser console for JavaScript errors

## Expected Log Output

### Admin UI Console (Normal Operation)
```
[No errors, clean console]
```

### Overlay Console (Normal Operation)
```
[Weather] ✅ GSAP library loaded successfully
[Weather] GSAP version: 3.13.0
[Weather] ✅ Canvas context initialized with alpha: true
[Weather] ✅ Connected to server
[Weather] Waiting for weather events via WebSocket...
🌦️ Received weather event #1: rain
🌦️ Received weather event #2: snow
🌦️ Received weather event #3: storm
...
```

### Admin UI Console (API Key Missing Warning)
```
[Weather Control] API key required but not configured. Request may fail.
```

## Success Confirmation

✅ **Fix is working correctly if:**
- Test 1 passes (useGlobalAuth = true)
- Test 2 passes (useGlobalAuth = false) ← **This was broken before!**
- Test 3 shows appropriate warning
- Test 4 shows all effects work
- Test 5 works in OBS (if available)

📝 **Report any failures with:**
- Which test failed
- Browser and version
- Console error messages
- Network tab showing the request/response
- Screenshots of error messages
