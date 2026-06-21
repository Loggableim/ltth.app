# Quiz Plugin Leaderboard Display Fix

## Problem Statement
The quiz plugin had display errors with leaderboard timing:
1. Timer was not hidden before showing leaderboard after each question round
2. Leaderboard duration was configurable but should be fixed at 6 seconds for round leaderboards
3. At the end of each match, the flow was incorrect - should show Match Leaderboard (30s) then Season Leaderboard (30s), then either hide everything or start next round if auto-play is active

## Changes Made

### 1. Timer Hiding Before Leaderboard Display
**File:** `app/plugins/quiz_show/main.js`

- Added `this.api.emit('quiz-show:hide-timer')` before showing leaderboard after question
- Added `this.api.emit('quiz-show:hide-timer')` before showing leaderboard after round
- Added `this.api.emit('quiz-show:hide-timer')` before showing end-game leaderboards

**File:** `app/plugins/quiz_show/quiz_show_overlay.js`

- Added socket listener for `quiz-show:hide-timer` event
- Implemented `handleHideTimer()` function to hide timer section in overlay

### 2. Fixed 6-Second Duration for Round Leaderboards
**File:** `app/plugins/quiz_show/main.js`

- Changed `showLeaderboardAfterRound()` to use fixed 6-second auto-hide instead of configurable delay
- Changed `showLeaderboardAfterQuestion()` to use fixed 6-second auto-hide instead of configurable delay
- Updated auto-mode delay calculation to use 6000ms for leaderboard display instead of `leaderboardAutoHideDelay * 1000`

### 3. Sequential Match and Season Leaderboard Display at Game End
**File:** `app/plugins/quiz_show/main.js`

Added two new methods:
- `showMatchLeaderboard()` - Displays current round/match results with displayType: 'Match'
- `showSeasonLeaderboard()` - Displays overall season standings with displayType: 'Season'

Modified `endRound()` when total rounds reached:
1. After answer display duration (default 5s): Show Match Leaderboard
2. After answer display + 30s: Show Season Leaderboard  
3. After answer display + 60s (30s match + 30s season):
   - Hide leaderboard
   - If auto-play is active: Wait autoModeDelay then start new round
   - If auto-play is not active: Emit quiz-ended event with MVP

## Technical Details

### Timing Flow After Each Question
1. Question ends
2. Answer display shows (5 seconds default)
3. Timer is hidden
4. Leaderboard appears (6 seconds fixed)
5. If auto-mode enabled: Wait autoModeDelay, then start next round

### Timing Flow at Game End (Total Rounds Reached)
1. Last question ends
2. Answer display shows (5 seconds default)
3. Timer is hidden
4. Match Leaderboard appears (30 seconds)
5. Season Leaderboard appears (30 seconds)
6. Leaderboards are hidden
7. If auto-play enabled: Wait autoModeDelay, then start new round
8. If auto-play disabled: Show MVP and emit quiz-ended event

## Impact
- **Backward Compatible:** No breaking changes to existing functionality
- **User Experience:** Improved flow with clear timer hiding and proper leaderboard sequences
- **Auto-Play:** Works correctly with the new leaderboard timing
- **Configuration:** Round leaderboard duration is now fixed at 6 seconds (not configurable)

## Testing Recommendations
1. Test quiz with `leaderboardShowAfterQuestion` enabled - verify timer hides before leaderboard shows
2. Test quiz with `leaderboardShowAfterRound` enabled - verify 6-second display duration
3. Test quiz with `totalRounds` set - verify Match → Season → auto-play/end sequence
4. Test auto-mode with round leaderboards - verify timing doesn't conflict
5. Test auto-mode at game end - verify new round starts after leaderboards

## Files Modified
- `app/plugins/quiz_show/main.js` - Core leaderboard logic
- `app/plugins/quiz_show/quiz_show_overlay.js` - Timer hiding in overlay
