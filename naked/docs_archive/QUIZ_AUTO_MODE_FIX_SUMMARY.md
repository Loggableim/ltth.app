# Quiz Auto Mode Fix Summary

## Problem Description (German)
> beim automodus nach der ersten frage, wird das leaderboard nicht angezeigt ( in ui muss auswählbar sein welches, ob runde oder lifetime oder season ). nach der ersten runde und der anzeige des leaderboards startet die zweite runde, das ist aktuell nicht der fall es steckt, der timer bleibt auf null und die fragen mit grün markierter antwort aus frage.

**Translation:**
In auto mode after the first question, the leaderboard is not displayed (in UI it must be selectable which one, whether round or lifetime or season). After the first round and the display of the leaderboard, the second round starts, this is currently not the case, it is stuck, the timer remains at zero and the questions with green marked answer from the question.

## Issues Identified

### Issue 1: Leaderboard Configuration Not Loaded
**Root Cause:** The leaderboard display configuration was stored in the database table `leaderboard_display_config` but was not being loaded into the plugin's config object during initialization.

**Symptoms:**
- Leaderboard would not display even if configured in the UI
- Settings in the database were not being used by the running plugin

**Fix:**
1. Created `loadLeaderboardDisplayConfig()` method to load config from database
2. Called this method during plugin initialization (`init()`)
3. Now loads 7 config values:
   - `leaderboardShowAfterRound`
   - `leaderboardShowAfterQuestion`
   - `leaderboardQuestionDisplayType` (round/season/both)
   - `leaderboardRoundDisplayType` (round/season/both)
   - `leaderboardEndGameDisplayType` (round/season)
   - `leaderboardAutoHideDelay` (seconds)
   - `leaderboardAnimationStyle` (fade/slide/zoom)

### Issue 2: Auto Mode Timer Calculation
**Root Cause:** The auto mode delay calculation did not account for leaderboard display time. It only waited for answer display + auto delay, causing the next round to start while the leaderboard was still visible or before it was shown.

**Symptoms:**
- Second round would start too early
- Timer would appear stuck at zero
- Previous question's correct answer would still be highlighted
- Leaderboard would be interrupted or skipped

**Fix:**
Modified the auto mode delay calculation in `endRound()`:

**Before:**
```javascript
const totalDelay = answerDisplayDuration + autoDelay;
```

**After:**
```javascript
// Add leaderboard display duration if leaderboard is shown after question or round
let leaderboardDisplayDuration = 0;
if (this.config.leaderboardShowAfterQuestion || this.config.leaderboardShowAfterRound) {
    leaderboardDisplayDuration = (this.config.leaderboardAutoHideDelay || 10) * 1000;
}

const totalDelay = answerDisplayDuration + leaderboardDisplayDuration + autoDelay;
```

## Timeline of Auto Mode Round Flow

### Before Fix
1. Question ends
2. Show correct answer (5 seconds) ⏱️
3. [Leaderboard scheduled but interrupted]
4. **Next round starts too early** ❌
5. Timer stuck, previous answer still shown

### After Fix
1. Question ends
2. Show correct answer (5 seconds) ⏱️
3. Show leaderboard (10 seconds) 🏆
4. Wait auto delay (5 seconds) ⏳
5. **Next round starts cleanly** ✅
6. Timer counts down properly

**Total delay:** 5s + 10s + 5s = 20 seconds (configurable)

## Configuration Options (Already in UI)

Users can configure these settings in the Quiz Show plugin UI under "Leaderboard Anzeige":

### Display Toggles
- ✅ **Show leaderboard after each question** - Display leaderboard immediately after each question
- ✅ **Show leaderboard after round** - Display leaderboard at the end of a quiz round

### Display Types
- **After Question Type**: Choose what to display
  - `round` - Only round leaderboard (current question results)
  - `season` - Only season leaderboard (lifetime/overall standings)
  - `both` - Show both round and season leaderboards

- **After Round Type**: Choose what to display
  - `round` - Only round leaderboard
  - `season` - Only season leaderboard
  - `both` - Show both round and season leaderboards

- **End Game Type**: Choose what to display when quiz ends
  - `round` - Round leaderboard
  - `season` - Season leaderboard

### Timing
- **Leaderboard Auto-Hide Delay**: How long to show the leaderboard (default: 10 seconds)
- **Auto Mode Delay**: Additional delay before starting next round (default: 5 seconds)
- **Answer Display Duration**: How long to show the correct answer (default: 5 seconds)

## Technical Changes

### File Modified
- `app/plugins/quiz_show/main.js`

### Methods Added
```javascript
loadLeaderboardDisplayConfig() {
    // Loads leaderboard configuration from database table
    // Updates this.config with 7 leaderboard settings
}
```

### Methods Modified
```javascript
async init() {
    // Added call to loadLeaderboardDisplayConfig()
}

async endRound() {
    // Modified auto mode timing calculation
    // Now accounts for leaderboard display duration
}
```

### Database Schema (Unchanged)
The database table already existed and was properly created:
```sql
CREATE TABLE IF NOT EXISTS leaderboard_display_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    show_after_round BOOLEAN DEFAULT TRUE,
    show_after_question BOOLEAN DEFAULT FALSE,
    question_display_type TEXT DEFAULT 'season',
    round_display_type TEXT DEFAULT 'both',
    end_game_display_type TEXT DEFAULT 'season',
    auto_hide_delay INTEGER DEFAULT 10,
    animation_style TEXT DEFAULT 'fade'
);
```

## Testing Recommendations

### Manual Testing Steps
1. Enable auto mode in quiz settings
2. Configure leaderboard to show after questions
3. Select display type (round/season/both)
4. Start a quiz with auto mode
5. Verify:
   - ✅ Answer is displayed for configured duration
   - ✅ Leaderboard appears after answer
   - ✅ Leaderboard shows selected type (round/season/both)
   - ✅ Leaderboard hides after configured duration
   - ✅ Next round starts after auto delay
   - ✅ Timer resets and counts down properly
   - ✅ No stuck UI elements
   - ✅ No green-marked answers from previous question

### Edge Cases to Test
- Auto mode with leaderboard disabled (should work as before)
- Different display types (round/season/both)
- Different timing configurations
- Multiple rounds in succession
- Manual stop during auto mode

## Impact Assessment

### What Changed
- ✅ Leaderboard configuration now properly loaded on plugin start
- ✅ Auto mode timing now accounts for leaderboard display
- ✅ Smoother transition between rounds

### What Didn't Change
- ❌ UI (already has all necessary controls)
- ❌ Database schema
- ❌ API endpoints
- ❌ Socket events
- ❌ Any other plugin functionality

### Backward Compatibility
- ✅ Fully backward compatible
- ✅ Works with existing configurations
- ✅ Graceful fallback to defaults if config missing

## Conclusion

This fix resolves the auto mode issues by:
1. Ensuring leaderboard configuration is properly loaded from the database
2. Correctly calculating delays to account for all display phases
3. Providing smooth, predictable transitions between quiz rounds

The fix is minimal, focused, and maintains full backward compatibility with existing configurations.
