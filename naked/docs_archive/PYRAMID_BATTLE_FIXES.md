# Pyramid Battle Fixes - Testing Guide

## Issues Fixed

### 1. Post-Match Leaderboard Display
**Problem**: After a Pyramid Battle round ends, only the title was shown in the post-match leaderboard, with no entries displayed.

**Solution**: 
- Added post-match configuration support to Pyramid Mode
- Pyramid round-ended event now includes `postMatchConfig` data
- Overlay transforms pyramid leaderboard data (points → coins) for display compatibility
- Post-match leaderboard displays after 10-second winner reveal

**Files Changed**:
- `app/plugins/coinbattle/engine/pyramid-mode.js` - Added postMatchConfig storage and emission
- `app/plugins/coinbattle/main.js` - Set postMatchConfig on pyramid mode initialization
- `app/plugins/coinbattle/overlay/overlay.js` - Handle post-match display for pyramid rounds

### 2. Profile Pictures Not Loading
**Problem**: Profile pictures were not displayed correctly in pyramid battle. Instead, only the first letter of the username was shown as a generated avatar.

**Solution**:
- Fixed avatar rendering in `renderPyramidSlot()` function
- Changed from appending the avatar container div to extracting and appending the img element directly
- This matches the pattern used in regular leaderboard rendering

**File Changed**:
- `app/plugins/coinbattle/overlay/overlay.js` - Extract img from avatar container

## Testing Instructions

### Prerequisites
1. Ensure CoinBattle plugin is enabled
2. Have Pyramid Mode configured (check plugin settings)
3. Have an OBS browser source pointing to the pyramid overlay URL

### Test Case 1: Profile Pictures During Round
1. Start a pyramid battle round (via plugin UI or API)
2. Have multiple test users send TikTok gifts
3. **Expected**: User profile pictures should display correctly in pyramid slots
4. **Verify**: No fallback initials should appear unless the profile picture fails to load

### Test Case 2: Post-Match Leaderboard Display
1. Let a pyramid battle round complete naturally (or manually end it)
2. **Expected Sequence**:
   - Winner reveal animation shows for 10 seconds
   - Post-match leaderboard appears automatically
   - Leaderboard shows top 10 players with:
     - Rank badges (🥇 🥈 🥉 or #4-10)
     - Profile pictures (or fallback avatars)
     - Player nicknames
     - Points scored (displayed as "coins")
3. **Verify**: All leaderboard entries are visible and properly formatted

### Test Case 3: Configuration Toggle
1. Go to CoinBattle plugin settings
2. Find "Post-Match Display" section
3. Toggle "Show Leaderboard" OFF
4. Start and complete a pyramid round
5. **Expected**: Winner reveal shows, but NO post-match leaderboard
6. Re-enable "Show Leaderboard"
7. Start and complete another round
8. **Expected**: Post-match leaderboard displays again

### Test Case 4: Empty/Single Player Round
1. Start a pyramid round with only one participant
2. Complete the round
3. **Expected**: 
   - Winner reveal shows correctly
   - Post-match leaderboard shows 1 entry
   - No errors in browser console

## Technical Details

### Data Flow
```
PyramidMode.endRound()
  ↓
Emits: pyramid:round-ended {
  winner, leaderboard, pyramid,
  xpRewards, postMatchConfig
}
  ↓
overlay.js: handlePyramidEnd(data)
  ↓
Shows winner for 10s
  ↓
Transforms leaderboard data:
  - points → coins
  - profilePictureUrl → profile_picture_url
  ↓
handlePostMatchDisplay(transformedData)
  ↓
Shows leaderboard(s) based on config
```

### Profile Picture Fix
**Before**:
```javascript
const avatarContainer = createAvatar(...);
slotEl.appendChild(avatarContainer); // Appends div wrapper
```

**After**:
```javascript
const avatarContainer = createAvatar(...);
const avatarImg = avatarContainer.querySelector('img');
if (avatarImg) {
  slotEl.appendChild(avatarImg); // Appends img directly
}
```

## Debugging

### Browser Console
Open browser developer tools on the overlay page and check for:
- Error messages related to avatar loading
- Socket.io events: `pyramid:round-ended`, `coinbattle:post-match`
- Log messages about post-match display

### Backend Logs
Check application logs for:
```
[PyramidMode] Round ended
[PyramidMode] Emitting pyramid:round-ended event
```

### Common Issues

**Issue**: Post-match leaderboard still not showing
- **Check**: Is `postMatch.showLeaderboard` enabled in config?
- **Check**: Are there actually players in the leaderboard?
- **Check**: Browser console for JavaScript errors

**Issue**: Profile pictures still showing initials
- **Check**: Do the TikTok user objects have `profilePictureUrl` field?
- **Check**: Are the profile picture URLs accessible (not blocked by CSP)?
- **Check**: Network tab in browser DevTools for failed image requests

## Rollback Plan

If issues occur, revert commits:
```bash
git revert ecafa3f 40db6b9
```

This will restore the previous behavior where:
- Profile pictures may not display correctly (but initials will show)
- Post-match leaderboard won't appear for pyramid rounds
