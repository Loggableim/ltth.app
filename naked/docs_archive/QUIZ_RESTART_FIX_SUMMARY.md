# Quiz Restart Fix - Implementation Summary

## Problem Statement (German)
"Nach der ersten runde lässt sich das quiz nicht neu starten, man muss die software komplett relaunchen."

**Translation:** After the first round, the quiz cannot be restarted, you have to completely relaunch the software.

## Problem Analysis

### Root Cause
When the quiz plugin's auto-restart feature was enabled and the total rounds limit was reached, the system would attempt to automatically start a new game session. However, it was calling `startRound()` directly without first resetting the game state.

The critical issue was with the `askedQuestionIds` Set in the game state. This Set tracks which questions have been asked during the current session to prevent immediate repetition. When starting a new game session without resetting this Set, all previously asked questions remained marked as "already asked", making them unavailable for the new session.

### Affected Code Path
```
endRound() 
  → totalRoundsReached === true
  → autoMode && autoRestartRound !== false
  → setTimeout(() => startRound()) ❌ Missing resetGameState()
```

## Solution

### Implementation
Added a call to `resetGameState()` before `startRound()` in the auto-restart logic. This ensures that when a new game session begins after reaching the total rounds limit, all session-specific state is properly cleared, including the `askedQuestionIds` Set.

### Code Changes

**File:** `app/plugins/quiz-show/main.js` (lines 2791-2799)

```javascript
// BEFORE (Bug)
if (this.config.autoMode && this.config.autoRestartRound !== false) {
    const autoDelay = (this.config.autoModeDelay || 5) * 1000;
    setTimeout(() => {
        this.api.log('Auto mode: starting new round after game end', 'info');
        this.startRound().catch(err => {  // ❌ State not reset!
            this.api.log('Error auto-starting next round after game end: ' + err.message, 'error');
        });
    }, autoDelay);
}

// AFTER (Fixed)
if (this.config.autoMode && this.config.autoRestartRound !== false) {
    const autoDelay = (this.config.autoModeDelay || 5) * 1000;
    setTimeout(() => {
        this.api.log('Auto mode: starting new game session after game end', 'info');
        // Reset game state to start fresh (clears askedQuestionIds for new session)
        this.resetGameState();  // ✅ State properly reset!
        this.startRound().catch(err => {
            this.api.log('Error auto-starting next round after game end: ' + err.message, 'error');
        });
    }, autoDelay);
}
```

## What Gets Reset

When `resetGameState()` is called, it clears:

1. **askedQuestionIds**: Set of question IDs asked in current session (THE FIX)
2. **isRunning**: Game running state
3. **currentQuestion**: Active question data
4. **answers**: User answers Map
5. **correctUsers**: List of users who answered correctly
6. **roundState**: Current round state ('idle', 'running', 'ended')
7. **jokersUsed**: Joker usage counters
8. **jokerEvents**: Joker event history
9. **hiddenAnswers**: Hidden answers from 50:50 joker
10. **revealedWrongAnswer**: Wrong answer revealed by info joker
11. **votersPerAnswer**: Voter tracking for each answer option
12. **autoModeTimeout**: Clears any pending auto-advance timeout
13. **ttsCache**: Text-to-speech cache

## Testing

### Test Coverage
Added new test in `app/test/quiz-state-management.test.js`:

```javascript
test('auto-restart should reset game state before starting new session', () => {
    // Verifies that:
    // 1. resetGameState() is called in the auto-restart path
    // 2. resetGameState() comes BEFORE startRound()
    // 3. The fix includes a comment explaining the purpose
});
```

### Test Results
```
PASS  test/quiz-state-management.test.js
  Quiz Show Plugin - State Management
    ✓ quiz-show:start handler should check for ended rounds
    ✓ quiz-show:start handler should prevent starting when actively running
    ✓ endRound should reset state when auto mode ends without restart
    ✓ endRound should handle auto-restart correctly
    ✓ resetGameState should set isRunning to false
    ✓ resetGameState should clear auto mode timeout
    ✓ auto-restart should reset game state before starting new session ← NEW TEST

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

## Verification

### Code Paths Checked

1. ✅ **Manual restart via "Start Quiz" button**: Already working correctly (calls `resetGameState()` at line 2101)
2. ✅ **Manual "Next Question" after total rounds**: Already working correctly (calls `resetGameState()` at line 2147)
3. ✅ **Manual "Stop Quiz" button**: Already working correctly (calls `resetGameState()` at line 2180)
4. ✅ **Gift-triggered quiz start**: Already working correctly (inherits proper reset from manual start)
5. ✅ **Auto-restart after total rounds**: NOW FIXED (added `resetGameState()` at line 2796)

### Security Review
- ✅ CodeQL analysis: 0 alerts
- ✅ No new security vulnerabilities introduced
- ✅ No sensitive data exposure
- ✅ No input validation issues

## Impact Assessment

### Minimal Changes
- **Production code**: 3 lines modified
- **Test code**: 1 new test added (19 lines)
- **Total files changed**: 2

### No Breaking Changes
- All existing functionality preserved
- No API changes
- No configuration changes required
- Backward compatible

### User Experience Improvement
- Users can now seamlessly restart quizzes in auto-mode
- No need to manually stop and restart the application
- Consistent behavior between manual and auto-restart modes

## Related Code Context

### Quiz Lifecycle Overview
```
1. Start Quiz (quiz-show:start)
   → Check if ended but still "running" → Reset if needed
   → Call startRound()

2. During Round
   → Timer ticks
   → Answers collected
   → Jokers activated

3. End Round (time expires or manual trigger)
   → Calculate results
   → Show correct answer
   → Update leaderboard
   → Check if total rounds reached
   
4. After Total Rounds Reached
   Option A: Manual mode → Reset state, show final leaderboard, wait for user
   Option B: Auto mode without restart → Reset state, show final leaderboard, end
   Option C: Auto mode WITH restart → [BUG WAS HERE] Now properly resets before starting new session
```

### Configuration Flags
- `autoMode`: Enable automatic advancement to next question
- `autoRestartRound`: Enable automatic restart after total rounds reached
- `totalRounds`: Number of rounds before ending (0 = unlimited)

## Conclusion

This fix resolves the issue where quizzes could not be restarted after the first complete session when auto-restart was enabled. The solution is minimal, surgical, and well-tested. It brings the auto-restart code path in line with the already-working manual restart paths by ensuring proper state reset before starting a new game session.

**Status:** ✅ Complete and verified
**Risk Level:** Low (minimal changes, well-tested)
**Recommendation:** Ready for deployment
