# XP System Live Preview Fixes

## Problem Summary
The XP System's live preview functionality in the admin panel was partially broken. Test buttons were emitting incomplete data that didn't match what the overlays expected, causing previews to fail or display incorrectly.

## Issues Fixed

### 1. **Missing XP Progress Fields in `testXPGain()`**
**Problem**: The test function only sent basic XP data (`xp`, `total_xp_earned`) but the XP bar overlay requires progress fields to display the progress bar correctly.

**Solution**: Added calculated fields:
- `xp_progress` - Current XP within the level
- `xp_for_next_level` - Total XP needed for next level
- `xp_progress_percent` - Percentage progress (0-100)
- `name_color` - Visual styling
- `title` - User title display

### 2. **Wrong Event Name in `refreshLeaderboardPreview()`**
**Problem**: The function emitted `viewer-xp:show-leaderboard` but the leaderboard overlay listens for `viewer-xp:leaderboard`.

**Solution**: Changed to emit `viewer-xp:get-leaderboard` which triggers the backend to fetch actual leaderboard data and emit the correct event.

### 3. **Incomplete Test Data in `testUserProfile()`**
**Problem**: Missing fields that the user profile overlay needs to display complete information.

**Solution**: Added all required fields:
- XP progress fields (same as testXPGain)
- `badges` - Array of badge emojis
- `streak_days` - Daily login streak
- `watch_time_minutes` - Total watch time
- `last_seen` - Timestamp of last activity

### 4. **Preview Scaling Issues**
**Problem**: When scaling the preview iframe, the container didn't adjust properly, causing layout issues.

**Solution**: Enhanced `updatePreviewScale()` to:
- Parse scale value properly
- Adjust container and parent heights based on scale
- Prevent visual overflow

### 5. **Lack of Debugging Information**
**Problem**: No way to see if overlays were receiving events or if socket connections were failing.

**Solution**: Added comprehensive logging:
- Socket connection/disconnect/error handlers in all overlays
- Event logging when data is received
- Console output showing test data being sent
- Toast notifications when test buttons are clicked

## Files Modified

1. **app/plugins/viewer-xp/ui/admin.html**
   - Fixed all test button functions
   - Improved preview scaling
   - Added user feedback via console logs and toasts

2. **app/plugins/viewer-xp/overlays/xp-bar.html**
   - Added socket connection status logging
   - Added event receive logging

3. **app/plugins/viewer-xp/overlays/level-up.html**
   - Added socket connection status logging
   - Added event receive logging

4. **app/plugins/viewer-xp/overlays/leaderboard.html**
   - Added socket connection status logging
   - Added event receive logging

5. **app/plugins/viewer-xp/overlays/user-profile.html**
   - Added socket connection status logging
   - Added event receive logging

## Testing Instructions

### 1. Start the Application
```bash
cd app
npm start
```

### 2. Access the Admin Panel
Navigate to: `http://localhost:3000/viewer-xp/admin`

### 3. Go to Live Preview Tab
Click on "Live Preview" in the sidebar navigation

### 4. Test Each Overlay

#### XP Bar Preview
1. Select "XP Bar" from the dropdown
2. Set preview scale (50%, 75%, or 100%)
3. Enter a test username (optional)
4. Click "Test XP Gain" button
5. **Expected**: XP bar should appear with animated progress bar showing 250/500 XP (50%)

#### Level Up Preview
1. Select "Level Up" from the dropdown
2. Click "Test Level Up" button
3. **Expected**: Animated level up celebration appears with confetti and rewards

#### Leaderboard Preview
1. Select "Leaderboard" from the dropdown
2. Click "Refresh Leaderboard" button
3. **Expected**: Leaderboard displays with actual viewer data from database

#### User Profile Preview
1. Select "User Profile" from the dropdown
2. Enter a test username (optional)
3. Click "Test User Profile" button
4. **Expected**: Profile card appears with stats, level, XP progress, badges, and streak info

### 5. Check Browser Console
Open browser DevTools (F12) and check the Console tab:
- Should see "✅ [Overlay Name]: Socket.io connected" for each overlay
- Should see "🧪 Testing..." messages when clicking test buttons
- Should see "📊/⬆️/👤 [Overlay Name]: Received..." when events are received
- Should see toast notifications in the UI

### 6. Test OBS Integration
1. Copy the OBS Browser Source URL from the preview
2. Add as Browser Source in OBS
3. Test that overlays work independently outside the admin panel

## Debugging Tips

### If Preview Doesn't Show
1. Check browser console for socket connection errors
2. Verify the iframe loaded: Look for "✅ Socket.io connected" log
3. Check if test event was sent: Look for "🧪 Testing..." log
4. Check if overlay received event: Look for "📊/⬆️/👤 Received..." log

### If Socket Fails to Connect
- Ensure server is running on port 3000
- Check for CORS or CSP issues in console
- Verify `/socket.io/socket.io.js` is accessible

### Common Issues
- **XP bar not showing progress**: Check that `xp_progress_percent` is being calculated
- **Leaderboard empty**: Database might not have viewer data yet
- **Profile not displaying**: Verify all required fields are present in test data
- **Scaling looks wrong**: Try different scale values or refresh the preview

## Technical Details

### Socket Events Used
- `viewer-xp:update` - XP gain updates
- `viewer-xp:level-up` - Level up celebrations
- `viewer-xp:get-leaderboard` - Request leaderboard data
- `viewer-xp:leaderboard` - Receive leaderboard data
- `viewer-xp:show-user-profile` - Show user profile card
- `viewer-xp:profile` - Receive profile data
- `viewer-xp:get-profile` - Request profile data

### Data Structure Examples

**XP Update Event:**
```javascript
{
  username: 'TestUser',
  amount: 50,
  actionType: 'chat_message',
  profile: {
    username: 'TestUser',
    level: 5,
    xp: 1250,
    total_xp_earned: 2500,
    xp_progress: 250,           // Current XP in level
    xp_for_next_level: 500,     // XP needed for next level
    xp_progress_percent: 50,    // Progress percentage
    name_color: '#FFD700',
    title: 'Rising Star'
  }
}
```

**User Profile Event:**
```javascript
{
  username: 'TestUser',
  level: 5,
  xp: 1250,
  total_xp_earned: 2500,
  xp_progress: 250,
  xp_for_next_level: 500,
  xp_progress_percent: 50,
  rank: 42,
  title: 'Rising Star',
  name_color: '#FFD700',
  badges: ['🎮', '⭐', '🏆'],
  streak_days: 7,
  watch_time_minutes: 180,
  last_seen: '2024-12-12T03:22:00.000Z'
}
```

## Future Improvements
- [ ] Add real-time preview updates when database changes
- [ ] Add ability to test with specific viewer usernames from database
- [ ] Add preview for different overlay states (empty, loading, error)
- [ ] Add custom test data input form
- [ ] Add screenshot/video recording of overlay previews
