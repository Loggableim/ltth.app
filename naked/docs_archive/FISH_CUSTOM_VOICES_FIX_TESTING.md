# Fish.audio Custom Voices Persistence - Testing Guide

## Problem Description
Fish.audio Custom Voices wurden nicht gespeichert. Sie wurden beim Speichern angezeigt, aber nach einem Refresh waren sie nicht mehr da und im System wurden sie nicht angeboten.

**Translation:** Fish.audio Custom Voices were not being saved. They were displayed when saving, but after refresh they were no longer there and in the system they were not offered.

## Solution Overview
Added comprehensive debug logging, error handling, defensive checks, and UI synchronization to ensure Fish.audio custom voices persist correctly and are immediately available in voice selection dropdowns.

## Changes Made

### 1. Enhanced Debug Logging (`app/plugins/tts/main.js`)
- **In `_loadConfig()`**: Logs saved config state and customFishVoices content
- **In POST `/api/tts/config`**: Logs received updates and validates customFishVoices data
- **In config update loop**: Shows detailed before/after state with key tracking
- **Before `_saveConfig()`**: Confirms what's being persisted to database

**Log Examples:**
```
[TTS Plugin] TTS Config Load: saved config has 25 keys
[TTS Plugin] TTS Config Load: customFishVoices in saved = true
[TTS Plugin] TTS Config Load: saved customFishVoices count = 2
[TTS Plugin] TTS Config Load: saved customFishVoices keys = ["my-voice", "test-voice"]
[TTS Plugin] TTS Config Save: customFishVoices count = 2
[TTS Plugin] TTS Config Save: Configuration successfully saved to database
```

### 2. Robust Error Handling
- `_saveConfig()` now has try-catch wrapper
- Checks return value from `setConfig()`
- Logs success/failure explicitly
- Proper error propagation

### 3. Defensive Programming
- Ensures `customFishVoices` exists in `_loadConfig()`
- Initializes to empty object if undefined/null
- Prevents downstream undefined errors

### 4. UI Synchronization (`app/plugins/tts/ui/tts-admin-production.js`)
- Re-renders custom voices list after save
- **Reloads ALL voices after save** to update dropdowns
- Custom voices immediately available in voice selection
- Makes any issues immediately visible

## Testing Instructions

### Test 1: Add and Save Custom Voice
1. Start the application and open the TTS plugin admin panel
2. Navigate to "Fish.audio Custom Voices" section
3. Add a custom voice:
   - **Name:** `test-voice`
   - **Reference ID:** `2d4039641d67419fa132ca59fa2f61ad` (example ID)
   - **Language:** `de`
4. Click **"Add Custom Voice"**
5. Verify the voice appears in the list below
6. Click **"Save Configuration"** at the top or bottom of the page
7. **Expected:** Success notification appears

### Test 2: Verify Voice in Dropdown
1. In the same session (before refresh)
2. Change **Default Engine** to `fishaudio`
3. Open the **Default Voice** dropdown
4. **Expected:** `test-voice` should appear in the dropdown list

### Test 3: Verify Persistence After Refresh
1. Refresh the page (F5 or Ctrl+R)
2. Wait for the page to load completely
3. Navigate to "Fish.audio Custom Voices" section
4. **Expected:** `test-voice` should still be in the list
5. Change **Default Engine** to `fishaudio`
6. Open the **Default Voice** dropdown
7. **Expected:** `test-voice` should still appear in the dropdown

### Test 4: Verify Voice Works in System
1. Set **Default Engine** to `fishaudio`
2. Set **Default Voice** to `test-voice`
3. Click **"Save Configuration"**
4. Go to the TTS test section
5. Enter some text and click "Test TTS"
6. **Expected:** TTS should work with the custom voice

### Test 5: Check Debug Logs
1. Open the application logs (location depends on platform)
   - Windows: `%USERPROFILE%\ltth_desktop\logs\`
   - Linux/Mac: `~/.config/ltth_desktop/logs/`
2. Open the most recent log file
3. Search for `TTS Config` to find debug logs
4. **Expected Log Entries:**
   - `TTS Config Update: received updates with X keys`
   - `TTS Config Update: customFishVoices in updates = true`
   - `TTS Config Update: updates customFishVoices count = 1`
   - `TTS Config Save: customFishVoices count = 1`
   - `TTS Config Save: Configuration successfully saved to database`
   - `TTS Config Load: saved customFishVoices count = 1`

## Troubleshooting

### Issue: Custom voice disappears after save
**Check logs for:**
- `TTS Config Save: setConfig returned false` - Database save failed
- `TTS Config Update: will be updated = false` - Voice not being updated in config

**Solution:** Check database permissions and file system access

### Issue: Custom voice disappears after refresh
**Check logs for:**
- `TTS Config Load: customFishVoices in saved = false` - Not in saved config
- `TTS Config Load: saved config has X keys` - Compare key count before/after

**Solution:** Database may not be persisting changes correctly

### Issue: Custom voice not in dropdown
**Check logs for:**
- `Failed to load voices` - Voice API call failed
- Voice loading errors

**Solution:** Ensure Fish.audio API key is configured and engine is enabled

### Issue: Silent failure
**Check logs for:**
- `Failed to set config` from plugin-loader
- Any exceptions or error messages

**Solution:** Check application has write permissions to database

## Technical Details

### Persistence Flow
1. **Add Custom Voice** → Updates `currentConfig.customFishVoices` in browser memory
2. **Save Configuration** → POST request to `/api/tts/config` with `customFishVoices`
3. **Server Receives** → Updates `this.config.customFishVoices` in plugin instance
4. **Server Saves** → Calls `_saveConfig()` which persists to SQLite database
5. **Server Responds** → Returns updated `this.config` to client
6. **Client Updates** → Sets `currentConfig = response.config`
7. **Client Refreshes** → Calls `renderFishCustomVoices()` and `loadVoices()`
8. **On Page Load** → Calls `_loadConfig()` which reads from database

### Database Storage
- **Key:** `plugin:tts:config`
- **Value:** JSON string containing entire config object including `customFishVoices`
- **Table:** `settings` in main SQLite database

### Voice Availability
Custom voices are merged with built-in voices in:
1. GET `/api/tts/voices` endpoint (line 1298-1303)
2. Voice validation during config save (line 708-710)
3. Voice synthesis call (line 2421)

## Expected Results

### ✅ Success Criteria
- [ ] Custom voice appears in list after adding
- [ ] Custom voice appears in voice dropdown after save
- [ ] Custom voice persists after page refresh
- [ ] Custom voice still in list after refresh
- [ ] Custom voice still in dropdown after refresh
- [ ] Custom voice works for TTS synthesis
- [ ] Debug logs show successful save operations
- [ ] No errors in application logs

### ⚠️ If Tests Fail
1. Check application logs for errors
2. Look for debug log entries starting with `TTS Config`
3. Verify database file exists and is writable
4. Ensure Fish.audio API key is configured
5. Try with a different custom voice name/reference ID
6. Report issue with log excerpts

## Additional Notes

### Database Location
The SQLite database is typically located at:
- Windows: `%USERPROFILE%\.ltth_desktop\database.db`
- Linux/Mac: `~/.config/ltth_desktop/database.db`

### Viewing Raw Database Data (Optional)
You can inspect the saved configuration using SQLite tools:
```sql
SELECT key, value FROM settings WHERE key = 'plugin:tts:config';
```

The `customFishVoices` field should be present in the JSON value.

### Reference ID Format
Fish.audio reference IDs are 32-character hexadecimal strings, for example:
- `2d4039641d67419fa132ca59fa2f61ad`
- `933563129e564b19a115bedd57b7406a`

You can get reference IDs from:
- Fish.audio Discovery page: https://fish.audio/discovery
- Your Fish.audio account custom voices

## Contact
If the issue persists after applying this fix, please provide:
1. Log file excerpts showing the debug messages
2. Steps you followed
3. Expected vs actual behavior
4. Any error messages

---

**Version:** 1.0.0  
**Date:** 2025-12-27  
**Status:** Ready for testing
