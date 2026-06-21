# Fish.audio Custom Voices - Fix Verification Guide

## Problem Description
**German:** custom stimmen lassen sich bei tts nicht speichern ( fish audio api)

**English:** Custom voices cannot be saved in TTS (Fish Audio API). They appear when clicking save but disappear on page refresh and are not offered in the system.

## Solution Summary
This fix addresses potential silent failures in the save/load flow and adds comprehensive diagnostic logging to identify any issues.

### Changes Made

1. **Enhanced Error Handling**
   - POST `/api/tts/config` now validates save result
   - Throws error if database save fails
   - Prevents silent data loss

2. **API Response Consistency**
   - POST response now masks API keys like GET endpoint
   - Ensures consistent data format
   - Preserves all configuration fields including customFishVoices

3. **Comprehensive Logging**
   - Client-side: Logs add, save, and load operations
   - Server-side: Enhanced logging at every step
   - Enables precise problem diagnosis

## Testing Instructions

### Prerequisites
- Application running
- Browser with developer console (Chrome, Firefox, Edge recommended)
- Fish.audio API key configured (if needed for actual TTS)

### Step-by-Step Test Procedure

#### Step 1: Prepare for Testing
1. Open the application
2. Open browser Developer Tools (F12)
3. Switch to the **Console** tab
4. Navigate to **TTS Settings** in the application

#### Step 2: Add Custom Voice
1. Scroll to "🐟 Fish.audio Custom Voices" section
2. Fill in the form:
   - **Voice Name:** `test-voice-1` (no spaces)
   - **Reference ID:** `2d4039641d67419fa132ca59fa2f61ad` (example ID)
   - **Language:** Select `Deutsch (German)`
3. Click **"➕ Add Voice"**

**Expected Results:**
- ✅ Voice appears in "Your Custom Voices" list
- ✅ Success notification: "Custom voice added successfully"
- ✅ Save button highlighted (pulsing)
- ✅ **Console shows:** `[TTS Config] Added custom voice "test-voice-1" (...). Total voices: 1`

#### Step 3: Save Configuration
1. Scroll to top or bottom of page
2. Click **"Save Configuration"** button

**Expected Results:**
- ✅ Success notification: "Configuration saved successfully"
- ✅ **Console shows:** `[TTS Config] Save successful - config now has 1 custom Fish voices: ["test-voice-1"]`
- ✅ **Console shows:** `[TTS Config] Voices reloaded after config save`
- ✅ No error messages

#### Step 4: Verify Voice in Dropdown
1. Change **Default Engine** to `fishaudio`
2. Click on **Default Voice** dropdown

**Expected Results:**
- ✅ `test-voice-1` appears in the voice list
- ✅ Can select the custom voice

#### Step 5: Refresh Page (CRITICAL TEST)
1. Refresh the browser page (F5 or Ctrl+R)
2. Wait for page to fully load
3. Check the Console tab again

**Expected Results:**
- ✅ **Console shows:** `[TTS Config] Loaded config with 1 custom Fish voices: ["test-voice-1"]`
- ✅ Navigate to TTS Settings
- ✅ Scroll to "Fish.audio Custom Voices" section
- ✅ `test-voice-1` **still appears** in "Your Custom Voices" list
- ✅ Can still select it in voice dropdown

#### Step 6: Test Multiple Voices (Optional)
1. Add another voice:
   - **Voice Name:** `test-voice-2`
   - **Reference ID:** `933563129e564b19a115bedd57b7406a`
   - **Language:** `English`
2. Click "Add Voice"
3. Click "Save Configuration"
4. Refresh page
5. Verify both voices persist

#### Step 7: Check Server Logs (Optional)
1. Open application log file location:
   - **Windows:** `%USERPROFILE%\ltth_desktop\logs\`
   - **Linux/Mac:** `~/.config/ltth_desktop/logs/`
2. Open the most recent log file
3. Search for "TTS Config"

**Expected Log Entries:**
```
[TTS Plugin] TTS Config Update: customFishVoices in updates = true
[TTS Plugin] TTS Config Update: updates customFishVoices count = 1
[TTS Plugin] TTS Config Save: customFishVoices count = 1
[TTS Plugin] TTS Config Save: Configuration successfully saved to database
[TTS Plugin] TTS Config Load: saved customFishVoices count = 1
```

## Troubleshooting

### Issue: Voice Disappears After Save
**Console shows:** Voice count 0 after save

**Likely Cause:** Client not sending data correctly

**Solution:**
1. Check browser console for errors
2. Verify customFishVoices is defined
3. Try clearing browser cache

### Issue: Save Successful But Voice Gone After Refresh
**Console shows:** 
- Save: "config now has 1 custom Fish voices"
- Load: "Loaded config with 0 custom Fish voices"

**Likely Cause:** Database not persisting or loading correctly

**Solution:**
1. Check server logs for save errors
2. Verify database file permissions
3. Check database file path is correct
4. Try restarting application

### Issue: Voice in Config But Not in UI List
**Console shows:** "Loaded config with 1 custom Fish voices"
**But:** List shows "No custom voices added yet"

**Likely Cause:** UI rendering issue

**Solution:**
1. Check browser console for JavaScript errors
2. Try hard refresh (Ctrl+F5)
3. Check if renderFishCustomVoices() is being called

### Issue: Error on Save
**Console shows:** Error message

**What to do:**
1. Read the exact error message
2. Check server logs for detailed error
3. Verify database file is not locked
4. Check disk space available
5. Report error with logs

## Success Criteria

### ✅ All Tests Pass If:
- [ ] Custom voice appears after adding
- [ ] Custom voice persists after clicking save
- [ ] Custom voice still visible after page refresh
- [ ] Custom voice appears in voice dropdown
- [ ] Can add multiple voices
- [ ] Console logs show expected messages at each step
- [ ] No errors in console or server logs

## Additional Notes

### Finding Fish.audio Voice IDs
1. Go to https://fish.audio/discovery
2. Find a voice you like
3. Click on the voice
4. Copy the ID from the URL: `fish.audio/model/[ID]`
5. The ID is a 32-character hexadecimal string

### Valid Reference ID Format
- Must be exactly 32 characters
- Can only contain: 0-9, a-f, A-F
- Example: `2d4039641d67419fa132ca59fa2f61ad`

### Voice Name Rules
- No spaces allowed
- Use letters, numbers, dashes, underscores
- Example: `my-german-voice`, `sarah_v2`, `test_voice_1`

## Support

If the issue persists after this fix:
1. Collect the following:
   - Browser console logs (full output)
   - Server logs (search for "TTS Config")
   - Steps you followed
   - Expected vs actual behavior
2. Open an issue with these details
3. The enhanced logging will show exactly where the problem occurs

## Technical Details

### What This Fix Does
1. **Validates database save**: Throws error if save fails instead of silently succeeding
2. **Consistent API responses**: POST and GET endpoints return same format
3. **Enhanced logging**: Every step of save/load is logged
4. **Error boundaries**: Catches and reports any failures

### What Was Not Changed
- Database layer (already working correctly)
- Core save/load logic (already correct)
- UI rendering logic (already correct)
- JSON serialization (working as expected)

### Why This Should Fix the Issue
The original code had correct logic but lacked:
- Validation of save result
- Consistent response format
- Diagnostic logging

These additions ensure:
- Any save failure is immediately visible
- All data is properly returned to client
- Exact failure point is logged if issue occurs

---

**Version:** 1.0  
**Date:** 2025-12-28  
**Status:** Ready for testing
