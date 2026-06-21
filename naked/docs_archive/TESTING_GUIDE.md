# Talking Heads Plugin - Testing Guide

## Changes Made

This PR addresses the issues mentioned in the problem statement:

### 1. User Search Limit Fixed ✅
**Problem:** User search was thought to be limited to 200 users
**Solution:** Increased limits significantly to support larger communities
- Frontend: MAX_ACTIVE_USERS increased from 500 to 1000
- Frontend: MAX_SEARCH_RESULTS increased from 1000 to 5000
- Backend: Default limit increased from 100 to 1000
- Backend: Maximum limit increased from 2000 to 5000

### 2. Permission Testing Added ✅
**Problem:** Need to verify "Who gets Talking Heads?" functionality
**Solution:** Added comprehensive permission testing UI
- New "Berechtigungen testen" button in the admin panel
- Tests 6 different user types: Normal Viewer, Team Member, Moderator, Subscriber, Top Gifter, Custom Voice
- Shows ✅/❌ visual feedback for each user type
- Backend endpoint `/api/talkingheads/test-permissions` with full test suite

### 3. OBS HUD Animation Test Fixed ✅
**Problem:** No animation appears during preview test
**Solution:** Modified preview behavior to work even when plugin is disabled
- Preview users now bypass permission checks (marked with `isPreview` flag)
- Plugin enabled check modified to allow preview events
- Preview works for testing without enabling the plugin globally

### 4. Manual User Assignment ✅
**Problem:** Manual assignment must be possible
**Status:** Already implemented and functional - no changes needed

## Testing Instructions

### Test 1: User Search Limits
1. Navigate to Talking Heads admin panel
2. Click "User aus Stream laden"
3. Verify that up to 1000 active users are loaded
4. Change filter to "Alle User (global)"
5. Use search to find specific users
6. Verify search works with large user databases (up to 5000)

### Test 2: Permission Testing
1. Navigate to Berechtigungen (Permissions) section
2. Set different permission modes (e.g., "Nur Team-Mitglieder")
3. Click "Berechtigungen testen"
4. Verify test results show correctly:
   - ✅ for eligible user types
   - ❌ for ineligible user types
5. Try all permission modes:
   - Alle Zuschauer
   - Nur Team-Mitglieder
   - Nur Abonnenten/Superfans
   - Nur User mit TTS-Stimme
   - Nur Moderatoren
   - Nur Top Gifter

### Test 3: OBS HUD Preview Animation
1. Navigate to "Talking Head & TTS Preview" section
2. Ensure plugin is enabled in settings
3. Enter preview text (e.g., "Dies ist ein Test")
4. Click "Vorschau abspielen"
5. Open OBS HUD overlay in browser: `http://localhost:3000/talking-heads/obs-hud`
6. Verify that:
   - Test avatar is generated (if first time)
   - Avatar appears in OBS HUD
   - Animation plays with mouth movements
   - TTS audio plays
   - Avatar fades out after speech

### Test 4: Preview Works When Disabled
1. Disable the Talking Heads plugin in settings
2. Navigate to preview section
3. Click "Vorschau abspielen"
4. Verify preview still works (for testing purposes)
5. Check that normal TTS events do NOT trigger animations (plugin disabled)

### Test 5: Manual User Assignment
1. Navigate to "User-Zuweisung" section
2. Click "User aus Stream laden"
3. Search for a specific user
4. Click "Avatar generieren" next to a user
5. Verify:
   - Generation starts (shows progress)
   - Avatar is generated successfully
   - User appears in "Generierte Talking Heads" list
   - Avatar can be tested/viewed

## Expected Results

All tests should pass without errors. The plugin should:
- Load large numbers of users efficiently
- Correctly test and display permission results
- Show preview animations even when plugin is disabled
- Allow manual avatar generation for specific users

## Rollback Plan

If issues occur, revert commits in this order:
1. `d42981a` - Documentation update (safe to revert)
2. `bdddd15` - Preview animation fix
3. `fb56902` - Permission testing and limit increases

## Notes

- All changes are backwards compatible
- No database migrations required
- No breaking changes to existing functionality
- Changes only affect Talking Heads plugin, no impact on other plugins
