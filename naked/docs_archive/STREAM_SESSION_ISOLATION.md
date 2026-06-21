# Stream Session Isolation Implementation

## Overview

This implementation addresses the issue where goals and leaderboard data were carrying over when connecting to different TikTok streams. Now, each stream session is isolated while maintaining profile settings and all-time statistics.

## What Changed

### Before
```
User connects to @alice's stream
  → Goals: 1000 likes, 500 coins
  → Leaderboard: Fan1 has 200 coins (session), 200 coins (total)

User disconnects and connects to @bob's stream
  → Goals: STILL 1000 likes, 500 coins ❌ (carried over)
  → Leaderboard: Fan1 STILL shows 200 session coins ❌ (carried over)
```

### After
```
User connects to @alice's stream
  → Goals: 1000 likes, 500 coins
  → Leaderboard: Fan1 has 200 coins (session), 200 coins (total)

User disconnects and connects to @bob's stream
  → Goals: 0 likes, 0 coins ✅ (reset for new stream)
  → Leaderboard: Fan1 has 0 session coins ✅ (reset)
  → Leaderboard: Fan1 has 200 total coins ✅ (all-time preserved)
```

## Technical Implementation

### 1. TikTok Module (`app/modules/tiktok.js`)

Added detection and emission of `streamChanged` event when connecting to a different TikTok username:

```javascript
// In connect() method
if (previousUsername && previousUsername !== username) {
    this.emit('streamChanged', {
        previousUsername,
        newUsername: username,
        timestamp: new Date().toISOString()
    });
}
```

### 2. Server Event Handler (`app/server.js`)

Added event handler that listens for stream changes and resets session data:

```javascript
tiktok.on('streamChanged', async (data) => {
    // Reset all goals to 0
    await goals.resetAllGoals();
    
    // Reset leaderboard session stats (preserves all-time stats)
    leaderboard.resetSessionStats();
    
    // Broadcast to clients
    io.emit('stream:changed', {
        previousUsername: data.previousUsername,
        newUsername: data.newUsername,
        timestamp: data.timestamp
    });
});
```

### 3. Test Suite (`app/test/stream-session-isolation.test.js`)

Comprehensive test coverage with 8 passing tests:
1. Goals reset when switching streams
2. Goals preserved when reconnecting to same stream
3. Leaderboard session stats reset when switching streams
4. Leaderboard all-time stats preserved across switches
5. streamChanged event emitted correctly for different streams
6. streamChanged event NOT emitted when reconnecting to same stream
7. streamChanged event emitted after disconnect
8. Full integration test with multiple stream switches

## Data Preservation

### What Gets Reset
- ✅ Goals (likes, coins, followers, subs) → reset to 0
- ✅ Leaderboard session stats (session_coins, session_messages) → reset to 0

### What Gets Preserved
- ✅ Profile settings and configurations
- ✅ Leaderboard all-time stats (total_coins, message_count, etc.)
- ✅ User preferences and customizations
- ✅ Plugin configurations

## Behavior Examples

### Example 1: Switching Between Streams
```
1. Connect to @alice → Goals start at 0
2. Accumulate 500 likes → Goals show 500
3. Disconnect from @alice
4. Connect to @bob → Goals automatically reset to 0
5. Accumulate 300 likes → Goals show 300
6. Disconnect from @bob
7. Connect back to @alice → Goals automatically reset to 0 again
```

### Example 2: Reconnecting to Same Stream
```
1. Connect to @alice → Goals start at 0
2. Accumulate 500 likes → Goals show 500
3. Disconnect from @alice
4. Connect to @alice again → Goals still show 500 (NOT reset)
```

### Example 3: Leaderboard Stats
```
Session 1: @alice
  - Fan1 sends 200 coins
  - Stats: session_coins=200, total_coins=200

Switch to @bob
  - Stats automatically update: session_coins=0, total_coins=200
  - Fan1 sends 100 more coins
  - Stats: session_coins=100, total_coins=300

Switch back to @alice
  - Stats automatically update: session_coins=0, total_coins=300
```

## Testing

All tests pass successfully:
```
Stream Session Isolation
  Goals - Stream Session Isolation
    ✓ should reset goals when connecting to a different stream
    ✓ should keep goals when reconnecting to same stream
  Leaderboard - Session Stats Isolation
    ✓ should reset session stats when connecting to different stream
    ✓ should maintain separate all-time stats across stream sessions
  TikTok Connector - streamChanged Event
    ✓ should emit streamChanged event when switching streams
    ✓ should NOT emit streamChanged when reconnecting to same stream
    ✓ should emit streamChanged on first connection after disconnect
  Integration - Full Stream Switching Flow
    ✓ should properly isolate session data across multiple stream switches

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Security

✅ No security vulnerabilities detected by CodeQL
✅ All input validation remains in place
✅ No changes to authentication or authorization
✅ Database operations use prepared statements (injection-safe)

## Backward Compatibility

✅ Fully backward compatible
✅ Existing single-stream usage works exactly as before
✅ No breaking changes to APIs
✅ Profile system remains unchanged
✅ All existing tests still pass

## Impact on Plugins

Plugins that listen to TikTok events are not affected. The implementation adds a new event (`streamChanged`) but does not modify existing events.

Plugins can optionally listen to `stream:changed` socket event if they need to react to stream switches:

```javascript
io.on('stream:changed', (data) => {
    console.log(`Stream changed from ${data.previousUsername} to ${data.newUsername}`);
    // Plugin-specific cleanup or reset logic
});
```

## Future Enhancements

Potential improvements for future versions:
1. **Per-Stream Goal Persistence**: Option to save and restore goals per stream
2. **Stream Session History**: Track and display history of past stream sessions
3. **Configurable Reset Behavior**: Allow users to choose what gets reset on stream change
4. **Stream Switch Notifications**: UI notifications when automatic resets occur
5. **Session Analytics**: Compare metrics across different stream sessions

## Summary

This implementation successfully isolates stream sessions while preserving all-time statistics and profile settings. Users can now switch between different TikTok streams without carrying over session-specific data, providing a clean slate for each new stream while maintaining historical records.

The solution is:
- ✅ Fully tested (8/8 tests passing)
- ✅ Security validated (0 vulnerabilities)
- ✅ Backward compatible
- ✅ Production ready
