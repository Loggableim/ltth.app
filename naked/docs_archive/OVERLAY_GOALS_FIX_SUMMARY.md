# Fix: Overlay Goals Coin Over-Counting Bug

## Problem
**German:** "coins werden bei den overlayzielen nicht korrekt gezählt, es zeigt viel mehr an als eigentlich geschenkt wurde"

**English:** Coins in overlay goals are not counted correctly - the display shows much more coins than were actually gifted.

## Root Cause Analysis

### The Bug
Goals were not properly resetting between stream sessions, causing coin values to accumulate across multiple streams.

**Example of the bug:**
```
Stream 1: User receives 5000 coins
  → Goal shows: 5000 / 10000 ✓

Stream 1 ends, Stream 2 starts
  → Goal should show: 0 / 10000
  → Goal actually showed: 5000 / 10000 ❌ (BUG!)

Stream 2: User receives 3000 coins
  → Goal should show: 3000 / 10000
  → Goal actually showed: 8000 / 10000 ❌ (BUG!)
```

This made it appear that users were receiving "much more coins than actually gifted" because the display included coins from previous stream sessions.

### Technical Details

The issue was in `/app/plugins/goals/backend/event-handlers.js`, specifically in the `resetGoalsOnStreamEnd()` function.

**Before the fix:**
```javascript
resetGoalsOnStreamEnd() {
    const goals = this.db.getAllGoals();
    
    for (const goal of goals) {
        // Only reset goals that have 'double' or 'increment' behavior
        if (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment') {
            // Reset these goals...
        }
        // ❌ Goals with 'hide' or 'reset' actions were NOT reset!
    }
}
```

**After the fix:**
```javascript
resetGoalsOnStreamEnd() {
    const goals = this.db.getAllGoals();
    
    for (const goal of goals) {
        if (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment') {
            // Reset current_value AND target_value
        } else {
            // ✅ NOW also resets 'hide' and 'reset' action goals!
            // Reset current_value to start_value
        }
    }
}
```

## The Fix

### Changed Files
1. **`/app/plugins/goals/backend/event-handlers.js`**
   - Modified `resetGoalsOnStreamEnd()` to reset ALL goal types
   - Added handling for 'hide' and 'reset' action types
   - All goals now properly reset their `current_value` when a stream ends

2. **`/app/test/goals-stream-session-reset.test.js`** (NEW)
   - Comprehensive test suite with 7 test cases
   - Verifies correct reset behavior for all goal types
   - All tests pass ✅

### Goal Reset Behavior

| Goal Type | on_reach_action | Reset Behavior |
|-----------|----------------|----------------|
| Any | **hide** | `current_value` → `start_value` ✅ FIXED |
| Any | **reset** | `current_value` → `start_value` ✅ FIXED |
| Any | **double** | `current_value` → `start_value`<br>`target_value` → initial target |
| Any | **increment** | `current_value` → `start_value`<br>`target_value` → initial target |

## Test Results

```bash
$ node app/test/goals-stream-session-reset.test.js

🧪 Testing Goals Stream Session Reset...

✅ Goals with "hide" action should reset current_value when stream ends
✅ Goals with "reset" action should reset current_value when stream ends
✅ Goals with "double" action should reset current_value and target_value when stream ends
✅ Goals with "increment" action should reset current_value and target_value when stream ends
✅ Multiple goals of different types should all reset correctly
✅ Goals with non-zero start_value should reset to that value
✅ State machine should be updated to match reset goal values

==================================================
Tests completed: 7
✅ Passed: 7
❌ Failed: 0
==================================================
```

## Expected Behavior After Fix

### Before Fix ❌
```
Stream 1:
  Start: Coin Goal = 0 / 10000
  +5000 coins gifted
  End:   Coin Goal = 5000 / 10000

Stream 2:
  Start: Coin Goal = 5000 / 10000 ❌ (carried over!)
  +3000 coins gifted
  End:   Coin Goal = 8000 / 10000 ❌ (shows wrong total!)
```

### After Fix ✅
```
Stream 1:
  Start: Coin Goal = 0 / 10000
  +5000 coins gifted
  End:   Coin Goal = 5000 / 10000

Stream 2:
  Start: Coin Goal = 0 / 10000 ✅ (properly reset!)
  +3000 coins gifted
  End:   Coin Goal = 3000 / 10000 ✅ (shows correct total!)
```

## Trigger for Reset

The reset happens automatically when:
- TikTok connection is disconnected
- Stream ends (natural or manual disconnect)

This is handled by the `disconnected` event listener:
```javascript
this.api.registerTikTokEvent('disconnected', () => {
    this.resetGoalsOnStreamEnd();
});
```

## Impact

- ✅ Overlay goals now show accurate coin counts for the current stream only
- ✅ No more accumulated values from previous streams
- ✅ Fixes the perception that coins are being "over-counted"
- ✅ All goal types (hide, reset, double, increment) work correctly
- ✅ State machines stay synchronized with database values

## Security Analysis

- ✅ No security vulnerabilities detected (CodeQL scan: 0 alerts)
- ✅ No SQL injection risks (using prepared statements)
- ✅ No data loss (properly persisted to database)
- ✅ No race conditions (single-threaded event processing)

## Backwards Compatibility

- ✅ Fully backwards compatible
- ✅ Existing goals continue to work
- ✅ No database migration required
- ✅ No configuration changes needed

## Related Files

- `/app/plugins/goals/backend/event-handlers.js` - Event handling and reset logic
- `/app/plugins/goals/backend/database.js` - Goal database operations
- `/app/plugins/goals/engine/state-machine.js` - Goal state management
- `/app/plugins/goals/main.js` - Goals plugin entry point

## Verification Steps

To verify the fix works:

1. Start a TikTok stream
2. Create a coin goal with target 1000
3. Receive some gifts (e.g., 500 coins)
4. Verify goal shows: 500 / 1000
5. Stop the stream (disconnect TikTok)
6. Start a new stream (reconnect TikTok)
7. **Verify goal now shows: 0 / 1000** ✅ (was 500 / 1000 before fix ❌)
8. Receive more gifts (e.g., 300 coins)
9. **Verify goal shows: 300 / 1000** ✅ (was 800 / 1000 before fix ❌)

---

**Fix Date:** 2024-12-26  
**Fix Author:** GitHub Copilot  
**Status:** ✅ Complete and Tested
