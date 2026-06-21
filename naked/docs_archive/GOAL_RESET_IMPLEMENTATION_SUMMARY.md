# Goal Reset Fix - Implementation Summary

## Problem Statement (German)
> die goals sollten nach jedem stream resettet werden. aktuell zb: likegoal ist 1000, bei erreichen +1000. am ende vom stream bspw 8000 ziel. bei nächsten stream ist es wieder 8000 obwohl es wieder bei 1000 starten sollte.

**Translation:**
Goals should be reset after each stream. Currently, for example: like goal is 1000, when reached +1000. At end of stream, for example, 8000 target. On next stream it's still 8000 although it should start at 1000 again.

## Root Cause
The `resetGoalsOnStreamEnd()` function in `app/plugins/goals/backend/event-handlers.js` was only resetting the `current_value` to 0, but not resetting the `target_value` back to the initial target. This caused goals with increment/double behavior to retain their increased target values across streams.

## Solution Implemented

### 1. Store Initial Target Values
When goals are created or updated with increment/double behavior, store the initial target value in the settings database:
- Key: `goal_{goalId}_initial_target`
- Value: Initial target value (e.g., "1000")

**Files Modified:**
- `app/plugins/goals/backend/api.js` (lines 113-119, 149-159)

### 2. Reset Target on Stream End
When TikTok disconnects, reset both `current_value` and `target_value` to their initial values for goals with increment/double behavior:
- Reset `current_value` to `start_value` (usually 0)
- Reset `target_value` to stored `initial_target`
- Update state machine to reflect new values
- Broadcast reset to all clients

**Files Modified:**
- `app/plugins/goals/backend/event-handlers.js` (lines 261-310)

### 3. Legacy Goal Support
For goals created before this fix, use the current `target_value` as the initial target and store it for future use. This ensures backward compatibility.

### 4. Selective Reset
Only reset goals with `on_reach_action` of 'increment' or 'double'. Goals with 'hide' behavior are not affected.

## Code Changes

### event-handlers.js - resetGoalsOnStreamEnd()
```javascript
// Before: Only reset current_value
const updatedGoal = this.db.updateGoal(goal.id, {
    current_value: 0
});

// After: Reset both current_value AND target_value
const updatedGoal = this.db.updateGoal(goal.id, {
    current_value: goal.start_value,
    target_value: initialTarget  // Restored from stored initial value
});
```

### api.js - Goal Creation
```javascript
// Store initial target for goals with increment/double behavior
if (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment') {
    const settingsDb = this.api.getDatabase();
    settingsDb.setSetting(`goal_${goal.id}_initial_target`, goal.target_value.toString());
}
```

### api.js - Goal Update
```javascript
// Update initial target when target_value is manually changed
if (req.body.target_value !== undefined &&
    (goal.on_reach_action === 'double' || goal.on_reach_action === 'increment')) {
    settingsDb.setSetting(`goal_${goal.id}_initial_target`, goal.target_value.toString());
}
```

## Testing

### Automated Tests Created
**File:** `app/test/goals-stream-reset.test.js`

Tests cover:
1. ✅ Reset increment goal to initial target
2. ✅ Reset double goal to initial target
3. ✅ Handle legacy goals without stored initial target
4. ✅ Do not reset goals with hide behavior
5. ✅ Handle multiple goals with mixed behaviors

**Results:** All 5 tests pass

### Existing Tests
**File:** `app/test/goals-state-machine.test.js`

**Results:** All 6 existing tests still pass

### Manual Testing
See `GOAL_RESET_MANUAL_TEST.md` for detailed manual testing steps.

## Security
- ✅ CodeQL scan: 0 alerts
- ✅ No security vulnerabilities introduced
- ✅ Input validation with `parseInt(value, 10)`
- ✅ Null safety checks

## Database Impact

### New Settings Entries
For each goal with increment/double behavior:
```
goal_{goalId}_initial_target = "{initialTargetValue}"
```

Example:
```
goal_goal_123_initial_target = "1000"
```

### Migration Strategy
- **New goals:** Initial target is stored on creation
- **Existing goals:** Initial target is stored on first stream disconnect
- **No schema changes required**

## Edge Cases Handled

1. **Legacy Goals:** Goals created before fix use current target as initial
2. **Target Value = 0:** Properly handles goals with initial target of 0
3. **Hide Behavior:** Goals with hide behavior are not reset
4. **Multiple Goals:** All goals are processed correctly in batch
5. **State Machine Sync:** State machine is updated to match database values

## Impact

### User Experience
- ✅ Goals now reset to their initial target after each stream
- ✅ Consistent goal tracking across multiple streams
- ✅ No manual intervention required

### System
- ✅ Minimal performance impact (simple key-value lookups)
- ✅ No breaking changes to existing functionality
- ✅ Backward compatible with legacy goals

## Example Scenario

**Before Fix:**
1. Stream 1: Like goal starts at 1000
2. Goal reached 8 times → Target becomes 8000
3. Stream 2: Goal starts at 8000 ❌

**After Fix:**
1. Stream 1: Like goal starts at 1000
2. Goal reached 8 times → Target becomes 8000
3. Stream ends → Reset to 1000
4. Stream 2: Goal starts at 1000 ✅

## Files Modified
- `app/plugins/goals/backend/event-handlers.js` (37 lines changed)
- `app/plugins/goals/backend/api.js` (20 lines changed)

## Files Added
- `app/test/goals-stream-reset.test.js` (364 lines)
- `GOAL_RESET_MANUAL_TEST.md` (Documentation)

## Total Changes
- 3 files modified
- 2 files added
- 421 lines added
- 11 lines removed
- 11 tests (all passing)
