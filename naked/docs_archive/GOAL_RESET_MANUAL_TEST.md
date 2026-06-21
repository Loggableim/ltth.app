# Manual Test: Goal Reset After Stream Ends

## Issue
Goals with increment/double behavior do not reset to their initial target value after a stream ends. 

**Example:**
- Like goal starts at target = 1000, increment = 1000
- During stream, goal is reached multiple times
- At end of stream, target is 8000
- On next stream, goal still shows target = 8000 instead of resetting to 1000

## Expected Behavior
When a stream ends (TikTok disconnects), goals with increment/double behavior should:
1. Reset `current_value` to `start_value` (usually 0)
2. Reset `target_value` to the **initial target** (e.g., 1000)

## Manual Test Steps

### Prerequisites
1. Start the application
2. Navigate to Goals plugin UI (`/goals/ui`)

### Test Case 1: Increment Goal Reset

1. **Create a Like Goal**
   - Type: Likes
   - Target: 1000
   - On Reach: Increment by 1000
   
2. **Simulate Stream Activity**
   - Connect to TikTok (or use API to increment)
   - Increment the goal past 1000 several times
   - Verify target increases to 2000, 3000, 4000, etc.
   - Note the final target (e.g., 5000)

3. **End Stream**
   - Disconnect from TikTok
   - Wait a moment for the disconnect event to fire

4. **Verify Reset**
   - Check the goal in the UI
   - `current_value` should be 0
   - `target_value` should be back to 1000 (initial target)
   - NOT the incremented value (5000)

### Test Case 2: Double Goal Reset

1. **Create a Follower Goal**
   - Type: Follower
   - Target: 10
   - On Reach: Double

2. **Simulate Stream Activity**
   - Increment the goal to trigger doubling
   - Target should increase: 10 → 20 → 40 → 80, etc.
   - Note the final target (e.g., 160)

3. **End Stream**
   - Disconnect from TikTok

4. **Verify Reset**
   - `current_value` should be 0
   - `target_value` should be back to 10 (initial target)

### Test Case 3: Hide Behavior (Should NOT Reset Target)

1. **Create a Custom Goal**
   - Type: Custom
   - Target: 100
   - On Reach: Hide

2. **Manually set current value to 100**
   - Goal reaches target and hides

3. **End Stream**
   - Disconnect from TikTok

4. **Verify NO Reset**
   - Goal with "hide" behavior should NOT have its target reset
   - Target should remain at 100

## API Testing

You can also test via API:

```bash
# Check goal state
curl http://localhost:3000/api/goals

# Simulate disconnect event (if you have access to socket.io)
# The plugin listens for 'disconnected' event from TikTok
```

## Database Verification

Check that initial targets are being stored:

```bash
# In the app directory
sqlite3 ltth.db "SELECT key, value FROM settings WHERE key LIKE 'goal_%_initial_target';"
```

Expected output:
```
goal_<goal_id>_initial_target|1000
goal_<goal_id>_initial_target|10
...
```

## Success Criteria

✅ Goals with increment behavior reset to initial target after stream ends
✅ Goals with double behavior reset to initial target after stream ends  
✅ Goals with hide behavior do NOT reset their target
✅ Initial target values are stored in database
✅ Legacy goals (created before fix) work correctly by using current target as initial
✅ State machine is updated correctly
✅ OBS overlay shows correct reset values

## Logs to Look For

In the console/logs, you should see:
```
Stored initial target for goal "Like Goal": 1000
Reset goal "Like Goal" to initial state (current: 0, target: 1000)
```
