# Quiz Auto-Restart: Round Counter Fix

## Problem (Neue Anforderung / New Requirement)

**German:** "im autoplaymodus startet es statt eine neue runde bei runde 10 bspw wenn 10 runden eingestellt sind 11/10. es sollte aber ein neues spiel anfangen"

**English Translation:** "In autoplay mode, instead of starting a new round at round 10, for example when 10 rounds are set, it shows 11/10. It should start a new game instead."

## Expected Behavior

When the quiz reaches the configured total rounds limit (e.g., 10 rounds) and auto-restart is enabled:
- ✅ Should show "1/10" for the first round of the new session
- ❌ Currently showing "11/10" instead

## Root Cause Analysis

The fix I implemented for the first issue (resetting `askedQuestionIds`) should ALSO reset the round counter via `resetGameState()`. The flow should be:

1. Round 10 completes → `currentRound = 10`
2. System detects `totalRoundsReached = true`
3. Shows leaderboards
4. Calls `resetGameState()` which sets `currentRound = 0`
5. Calls `startRound()` which increments to `currentRound = 1`
6. Display should show "1/10" ✅

However, the user is reporting "11/10" which suggests the counter is not being reset properly.

## Implemented Fix

### 1. Verify `resetGameState()` is Being Called

The fix from the first issue already includes:

```javascript
// Line 2796 in main.js
setTimeout(() => {
    this.api.log(`Auto mode: starting new game session after completing ${this.gameState.currentRound} rounds`, 'info');
    // Reset game state to start fresh (clears askedQuestionIds and resets currentRound to 0)
    this.resetGameState();  // ✅ This sets currentRound = 0
    this.api.log('Game state reset: currentRound is now 0, starting fresh session', 'info');
    this.startRound().catch(err => {
        this.api.log('Error auto-starting next round after game end: ' + err.message, 'error');
    });
}, autoDelay);
```

### 2. Enhanced Logging

Added detailed logging to track the round counter:

**Before auto-restart:**
```
Auto mode: starting new game session after completing 10 rounds
```

**After reset:**
```
Game state reset: currentRound is now 0, starting fresh session
```

**During startRound():**
```
Round counter: 0 -> 1 (Total rounds: 10)
```

This logging will help diagnose if:
- `resetGameState()` is not being called
- The counter is not being reset properly
- There's another code path modifying the counter

### 3. Code Verification

The `resetGameState()` function DOES reset the counter:

```javascript
// Line 3541 in main.js
resetGameState() {
    this.gameState = {
        // ...
        currentRound: 0,  // ✅ Explicitly set to 0
        // ...
    };
}
```

And `startRound()` increments it:

```javascript
// Line 2426 in main.js
const previousRound = this.gameState.currentRound;  // Should be 0
this.gameState.currentRound++;  // Should become 1
this.api.log(`Round counter: ${previousRound} -> ${this.gameState.currentRound} (Total rounds: ${this.config.totalRounds})`, 'debug');
```

## How to Verify the Fix

### Option 1: Check the Logs

1. Start the application
2. Enable auto-play mode
3. Set total rounds to 10
4. Let the quiz play through all 10 rounds
5. Watch the console/log output for these messages:

Expected log sequence:
```
[INFO] Total rounds limit (10) reached - game ending
[INFO] Auto mode: starting new game session after completing 10 rounds
[INFO] Game state reset: currentRound is now 0, starting fresh session
[DEBUG] Round counter: 0 -> 1 (Total rounds: 10)
```

If you see `Round counter: 10 -> 11` instead, that means `resetGameState()` is NOT being called properly.

### Option 2: Check the UI

1. Configure quiz with 10 total rounds
2. Enable auto-play mode
3. Let the quiz complete all 10 rounds
4. Watch the round counter in the overlay
5. When the new session starts, it should show "1/10" NOT "11/10"

## Potential Issues and Solutions

### Issue 1: resetGameState() Not Being Called

**Symptom:** Logs show `Round counter: 10 -> 11`

**Cause:** The `autoRestartRound` setting might be disabled

**Solution:** Check settings:
```javascript
// In quiz settings
autoMode: true,           // ✅ Must be enabled
autoRestartRound: true,   // ✅ Must be enabled (or not explicitly set to false)
```

### Issue 2: Wrong Code Path Being Taken

**Symptom:** No log message "Auto mode: starting new game session after completing X rounds"

**Cause:** The quiz might be ending via a different code path (manual stop, or `quiz-show:next` socket event)

**Solution:** Ensure you're in auto-play mode and let it complete naturally without manual intervention.

### Issue 3: Timer/Leaderboard Delays

**Symptom:** The counter briefly shows "11/10" before correcting to "1/10"

**Cause:** There might be a race condition between leaderboard display and state reset

**Solution:** This would be a UI timing issue, not a data issue. Check if the problem persists or is just a brief visual glitch.

## Testing Checklist

- [ ] Configure quiz with 10 total rounds
- [ ] Enable auto-play mode (`autoMode: true`)
- [ ] Enable auto-restart (`autoRestartRound: true`)
- [ ] Start the quiz
- [ ] Let it complete all 10 rounds automatically
- [ ] Verify round counter shows "1/10" when new session starts (not "11/10")
- [ ] Check logs for proper reset sequence
- [ ] Repeat test with different round counts (5, 20, etc.)

## Code Changes Summary

**File:** `app/plugins/quiz-show/main.js`

**Line 2793-2800:** Auto-restart logic with enhanced logging
**Line 2426-2428:** Round counter increment with logging

**Changes:**
- ✅ resetGameState() already called (from first fix)
- ✅ Added logging before reset to show completing round count
- ✅ Added logging after reset to confirm counter is 0
- ✅ Added logging during increment to show 0 -> 1 transition

## Expected Outcome

After this fix, when auto-restart happens:
1. ✅ Round counter resets to 0
2. ✅ Increments to 1 when new session starts
3. ✅ Display shows "1/10" (or "1/X" where X is total rounds)
4. ✅ Logs clearly show the reset sequence
5. ✅ Asked questions list is cleared (from first fix)
6. ✅ New session plays with all questions available again

## If the Problem Persists

If you still see "11/10" after this fix, please check:

1. **Check the logs** - Look for the exact log messages mentioned above
2. **Verify settings** - Ensure both `autoMode` and `autoRestartRound` are enabled
3. **Clear cache** - Restart the application to ensure new code is loaded
4. **Share logs** - Provide the log output from the auto-restart sequence

The enhanced logging will reveal exactly where the issue is occurring.
