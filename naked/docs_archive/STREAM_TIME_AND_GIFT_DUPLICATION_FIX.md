# Stream Time and Gift Duplication Bug Fixes

## Problem Statement (German)
"Die Streamzeit wird bei connection nicht korrekt erkannt, es werden frühere Streamstarztzeiten statt der startzeit des aktuellen streams herangezogen. Im clarityhud werden geschenke doppelt angezeigt."

## Translation
"The stream time is not correctly recognized during connection, earlier stream start times are used instead of the start time of the current stream. Gifts are displayed twice in clarityhud."

## Issues Fixed

### Issue 1: Incorrect Stream Time on Reconnection

**Problem**: When reconnecting to a TikTok stream, the system would incorrectly use a persisted stream start time from a previous stream instead of detecting the current stream's actual start time. This caused the stream duration timer to show cumulative time across multiple streams.

**Root Cause**:
- In `app/modules/tiktok.js`, the `disconnect()` method preserved `_persistedStreamStart` when `previousUsername` existed (line 1522-1523)
- On reconnection, if connecting to the same username, the old persisted time was restored (line 263-265)
- This meant if a streamer ended one stream and started a new one, the timer would incorrectly show the total time since the OLD stream started

**Example Scenario**:
1. Streamer starts Stream A at 10:00 AM, runs for 2 hours
2. Streamer ends Stream A at 12:00 PM
3. App disconnects but preserves `_persistedStreamStart = 10:00 AM`
4. Streamer starts NEW Stream B at 2:00 PM
5. App reconnects and restores `streamStartTime = 10:00 AM` (WRONG!)
6. Timer shows 4+ hours instead of the actual duration of Stream B

**Fix**:
- Always clear `streamStartTime`, `_persistedStreamStart`, and `_earliestEventTime` on disconnect
- Force fresh stream time detection on each connection
- Stream time is detected from TikTok API roomInfo or from earliest event timestamp

### Issue 2: Duplicate Gifts in ClarityHUD

**Problem**: Gifts were being displayed twice in the ClarityHUD overlay when reconnecting to the same stream.

**Root Cause**:
- The TikTok module's event deduplication cache (`processedEvents`) was cleared on every disconnect (line 1531)
- When reconnecting to the SAME ongoing stream, any gifts that were sent during or just before the disconnection could be processed again
- The backend has a 60-second deduplication window, but clearing the cache removed all protection
- The ClarityHUD overlay has its own 2-second deduplication window, which wasn't enough for longer disconnects

**Example Scenario**:
1. User sends Rose gift at 10:00:00
2. Gift is processed and displayed in ClarityHUD
3. Connection drops at 10:00:05
4. Deduplication cache is cleared
5. Connection restored at 10:00:10
6. TikTok API might resend recent events including the Rose gift
7. Backend processes it again (cache was cleared)
8. Gift appears twice in ClarityHUD

**Fix**:
- Preserve the `processedEvents` deduplication cache when disconnecting if `previousUsername` exists
- Only clear the cache when:
  - No previous username exists (app shutdown)
  - Switching to a different streamer
- The cache naturally expires old events after 60 seconds anyway
- This prevents duplicate processing of events during temporary disconnections

## Technical Details

### Changes Made

**File: `app/modules/tiktok.js`**

1. **disconnect() method** (lines 1517-1540):
   - Always clear stream time fields on disconnect
   - Conditionally preserve deduplication cache based on `previousUsername`
   - Added detailed logging for debugging

2. **connect() method** (lines 132-144):
   - Clear deduplication cache when switching to different streamer
   - Added cache clearing to streamer switch logic

### Code Changes

**Before (disconnect method)**:
```javascript
if (previousUsername) {
    this.logger.info(`🔄 Disconnected but preserving stream start time for potential reconnection to @${previousUsername}`);
} else {
    this.streamStartTime = null;
    this._persistedStreamStart = null;
    this._earliestEventTime = null;
}

// Clear event deduplication cache on disconnect
this.processedEvents.clear();
this.logger.info('🧹 Event deduplication cache cleared');
```

**After (disconnect method)**:
```javascript
// BUGFIX: Always clear stream start time on disconnect
this.streamStartTime = null;
this._persistedStreamStart = null;
this._earliestEventTime = null;
this.logger.info('🔄 Cleared stream start time - will detect fresh on next connection');

// DON'T clear event deduplication cache on disconnect if we have a previousUsername
// This prevents duplicate gift displays when reconnecting to the same stream
if (!previousUsername) {
    this.processedEvents.clear();
    this.logger.info('🧹 Event deduplication cache cleared (no previous username)');
} else {
    this.logger.info('💾 Event deduplication cache preserved for potential reconnection to @' + previousUsername);
}
```

**Before (connect method - streamer switch)**:
```javascript
if (previousUsername && previousUsername !== username) {
    // ... reset stats ...
    this.logger.info(`🔄 Switching from @${previousUsername} to @${username} - clearing old stream start time and stats`);
}
```

**After (connect method - streamer switch)**:
```javascript
if (previousUsername && previousUsername !== username) {
    // ... reset stats ...
    // Clear deduplication cache when switching to a different streamer
    this.processedEvents.clear();
    this.logger.info(`🔄 Switching from @${previousUsername} to @${username} - clearing old stream start time, stats, and event cache`);
}
```

## Testing

### New Test File
Created `app/test/stream-reconnect-fixes.test.js` with 7 comprehensive tests:

1. ✓ Stream start time is cleared on disconnect
2. ✓ Stream start time cleared even for same streamer reconnect
3. ✓ Deduplication cache preserved for same streamer reconnect
4. ✓ Deduplication cache cleared on initial disconnect (no previous username)
5. ✓ Deduplication cache cleared when switching streamers
6. ✓ Multiple disconnect/reconnect cycles preserve cache
7. ✓ Stream time clearing is independent of cache preservation

### Test Results
- **New tests**: 7/7 passed ✅
- **Existing clarityhud tests**: 9/9 passed ✅
- **No regressions detected** ✅

## Behavior Changes

### Stream Time Display

**Before**:
- Reconnecting to same streamer showed cumulative time across all streams
- Timer could show hours of runtime when stream just started
- No way to reset timer without app restart

**After**:
- Each connection detects actual current stream start time
- Timer shows accurate duration of current stream
- Stream time is detected from TikTok API or earliest event
- Fresh detection on every connection

### Gift Display in ClarityHUD

**Before**:
- Gifts could appear twice when reconnecting to ongoing stream
- Deduplication cache cleared on every disconnect
- Temporary connection issues caused duplicate displays

**After**:
- Gifts appear only once even when reconnecting
- Deduplication cache preserved for same-streamer reconnects
- Cache expires naturally after 60 seconds for old events
- Cache cleared only when switching streamers or on app shutdown

## Verification Steps

### For Stream Time Fix
1. Start streaming on TikTok
2. Connect app to stream
3. Note the displayed stream duration
4. Disconnect from stream
5. End stream on TikTok
6. Start a NEW stream on TikTok (different stream session)
7. Reconnect app to the new stream
8. **Expected**: Timer should start from near-zero, showing actual new stream duration
9. **Previous behavior**: Timer would show cumulative time from both streams

### For Gift Duplication Fix
1. Start streaming on TikTok with ClarityHUD overlay active
2. Have someone send a gift (e.g., Rose)
3. Verify gift appears once in overlay
4. Disconnect from stream (close connection)
5. Quickly reconnect (within 60 seconds)
6. Have same person send same gift again
7. **Expected**: Second gift appears once (first gift not duplicated on reconnect)
8. **Previous behavior**: First gift might appear again after reconnect

## Impact Analysis

### Affected Components
- **TikTok Module** (`app/modules/tiktok.js`): Core connection logic
- **ClarityHUD Plugin**: Relies on TikTok event deduplication
- **All Plugins**: Benefit from improved event deduplication
- **Stream Timer Display**: Now shows accurate current stream duration

### Breaking Changes
**None** - This is a bug fix that restores expected behavior

### Performance Impact
**Negligible** - Memory usage of deduplication cache unchanged:
- Cache still limited to 1000 events maximum
- Cache still expires events after 60 seconds
- Only difference is cache is preserved across reconnects to same streamer

### Backward Compatibility
**Fully Compatible** - No changes to:
- Event data structures
- API interfaces
- Plugin interfaces
- Database schemas

## Security Analysis
- No security vulnerabilities introduced
- No new external dependencies
- No changes to authentication or authorization
- Uses existing deduplication logic with improved timing

## Related Files
- `app/modules/tiktok.js` - Main fix implementation
- `app/test/stream-reconnect-fixes.test.js` - Test suite
- `app/test/clarityhud-deduplication.test.js` - Existing tests (still pass)
- `app/plugins/clarityhud/overlays/full.js` - Overlay with client-side deduplication
- `app/plugins/clarityhud/backend/api.js` - Backend event handling

## Rollback Plan
If issues arise, revert commit `93d9bdd`:
```bash
git revert 93d9bdd
```

This will restore:
- Stream start time preservation on disconnect
- Deduplication cache clearing on every disconnect

No data migration needed for rollback.

## Future Improvements
1. Consider persisting deduplication cache to database for app restarts
2. Add admin UI to view/clear deduplication cache
3. Make deduplication window configurable per event type
4. Add metrics tracking for cache hits/misses

## Credits
- Implementation: GitHub Copilot
- Testing: Automated test suite
- Review: Code syntax validation
