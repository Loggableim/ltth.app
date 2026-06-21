# Wheel Queue Timeout Fix - Implementation Summary

## Problem Statement

The game engine's unified queue would get stuck when the wheel overlay didn't respond (OBS scene not active, connection dropped, browser tab in background). The server waited indefinitely (with a 3-minute timeout that was far too long) for `wheel:spin-complete` from the overlay before calling `completeProcessing()`, blocking all subsequent game events.

## Root Cause

The implementation had an **overlay-dependency without fallback**:
1. Server waits for overlay to send `wheel:spin-complete` before calling `completeProcessing()`
2. If overlay doesn't respond, queue remains blocked
3. Global timeout of 3 minutes was too long for a wheel spin (~15 seconds)
4. No server-side fallback or cleanup logic

## Solution Overview

Implemented a **dual-timeout safety mechanism** with game-specific timeouts:

### 1. Game-Specific Queue Timeouts
Instead of a global 3-minute timeout, realistic timeouts per game type:
- **Wheel**: 45s (calculated based on config)
- **Plinko**: 60s
- **Connect4**: 5 minutes
- **Chess**: 10 minutes

### 2. Server-Side Spin Safety Timeout
Independent timeout in wheel.js that doesn't rely on overlay response, calculated as:
```
timeout = spinDuration + winnerDisplayDuration + infoScreenDuration + 10s buffer
```

### 3. Overlay Timeout Handler
UI reset logic when timeout occurs to prevent stuck visual state.

## Implementation Details

### File: `app/plugins/game-engine/backend/unified-queue.js`

**Added Constants:**
```javascript
this.GAME_TIMEOUTS = {
  wheel: 45000,      // 45 seconds
  plinko: 60000,     // 60 seconds
  connect4: 300000,  // 5 minutes
  chess: 600000      // 10 minutes
};
```

**New Method: `getTimeoutForGame(item)`**
- Dynamically calculates timeout based on game type
- For wheel: uses actual spin configuration to calculate precise timeout
- For other games: uses predefined timeouts
- Includes comprehensive debug logging

**New Method: `forceCompleteProcessing(item)`**
- Called when queue timeout occurs
- Performs game-specific cleanup:
  - For wheel: resets `isSpinning`, clears `currentSpin`, removes from `activeSpins`
  - Emits `wheel:spin-timeout` event to overlay
- Calls `completeProcessing()` to continue queue

**Updated: `processNext()`**
```javascript
const timeoutDuration = this.getTimeoutForGame(item);
this.processingTimeout = setTimeout(() => {
  this.forceCompleteProcessing(item);
}, timeoutDuration);
```

### File: `app/plugins/game-engine/games/wheel.js`

**Added Constant:**
```javascript
const SPIN_SAFETY_TIMEOUT_BUFFER = 10000; // 10 seconds buffer
```

**Added Property:**
```javascript
this.spinSafetyTimeout = null;
```

**Updated: `startSpin()`**
Sets safety timeout after emitting spin-start event:
```javascript
const safetyTimeoutMs = spinDuration + winnerDisplayDuration + infoScreenDuration + SPIN_SAFETY_TIMEOUT_BUFFER;

this.spinSafetyTimeout = setTimeout(() => {
  if (this.isSpinning && this.currentSpin?.spinId === spinId) {
    this.logger.warn(`Spin ${spinId} safety timeout triggered - overlay did not respond`);
    this.forceCompleteSpin(spinId, spinData, config);
  }
}, safetyTimeoutMs);
```

**New Method: `forceCompleteSpin(spinId, spinData, config)`**
Handles timeout scenarios:
1. Validates data and segment index
2. Records win in database (based on server calculation)
3. Awards XP if applicable
4. Updates spin status to 'timeout'
5. Removes from active spins
6. Clears spinning state
7. Emits `wheel:spin-timeout` event
8. Calls `unifiedQueue.completeProcessing()` (immediate, no delay)

**Updated: `handleSpinComplete()`**
Clears safety timeout when overlay responds:
```javascript
async handleSpinComplete(spinId, segmentIndex, reportedSegmentIndex = null) {
  // FIRST: Clear safety timeout since overlay responded
  if (this.spinSafetyTimeout) {
    clearTimeout(this.spinSafetyTimeout);
    this.spinSafetyTimeout = null;
  }
  // ... rest of method
}
```

**Updated: `cleanupOldSpins()`**
Clears safety timeout during cleanup:
```javascript
if (this.spinSafetyTimeout) {
  clearTimeout(this.spinSafetyTimeout);
  this.spinSafetyTimeout = null;
}
```

**Updated: `destroy()`**
Clears safety timeout on destruction:
```javascript
if (this.spinSafetyTimeout) {
  clearTimeout(this.spinSafetyTimeout);
  this.spinSafetyTimeout = null;
}
```

### File: `app/plugins/game-engine/overlay/wheel.html`

**New Event Handler: `wheel:spin-timeout`**
```javascript
socket.on('wheel:spin-timeout', (data) => {
  // Only handle timeout if this spin is currently active
  if (isSpinning && currentSpinId === data.spinId) {
    // Stop spinning immediately
    isSpinning = false;
    currentSpinId = null;
    
    // Reset wheel visual state
    wheelWrapper.classList.remove('spinning');
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    void wheel.offsetHeight; // Force reflow
    wheel.style.transition = '';
    
    // Hide announcements and show idle message
    winAnnouncement.classList.remove('visible');
    infoScreen.classList.remove('visible');
    idleMessage.classList.add('visible');
    updateIdleMessage();
  }
  
  // Remove from queue display
  queue = queue.filter(item => item.spinId !== data.spinId);
  updateQueueDisplay();
});
```

## Testing

### New Test File: `app/plugins/game-engine/test/wheel-timeout.test.js`

**Test Coverage (14 tests, all passing):**

1. **Game-specific Timeouts** (5 tests)
   - Correct timeout calculation for wheel (with config)
   - Predefined timeouts for plinko, connect4, chess
   - Fallback timeout for unknown game types

2. **Wheel Spin Safety Timeout** (4 tests)
   - Safety timeout set on spin start
   - Safety timeout cleared when overlay responds
   - Force complete triggered on timeout
   - No timeout if spin completes normally

3. **Queue Timeout Integration** (3 tests)
   - Force complete processing on queue timeout
   - Timeout event emission
   - Next item processing after timeout

4. **Cleanup on Destroy** (2 tests)
   - Safety timeout cleared on wheel destroy
   - Queue timeout cleared on queue destroy

### Existing Tests
- ✅ `unified-queue.test.js` - 20/20 passing
- ✅ `wheel-landing-calculation.test.js` - 10/10 passing

## Behavior Comparison

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Overlay responds normally | ✅ Works | ✅ Works (unchanged) |
| Overlay not connected | ❌ Queue blocked for 3 min | ✅ Server timeout after ~20s, queue continues |
| Overlay crashes mid-spin | ❌ Queue blocked | ✅ Timeout triggers, cleanup, queue continues |
| OBS scene inactive | ❌ Queue blocked | ✅ Timeout triggers, result recorded, queue continues |
| Rapid gift events | ❌ Can be lost | ✅ All queued, sequential processing |

## Technical Details

### Timeout Calculation Logic

**For Wheel:**
```
timeout = spinDuration + winnerDisplayDuration + infoScreenDuration + 10s buffer

Example:
- spinDuration: 5000ms (5 seconds)
- winnerDisplayDuration: 5000ms (5 seconds)
- infoScreenEnabled: false (0ms)
- buffer: 10000ms (10 seconds)
Total: 20000ms (20 seconds)
```

**For Other Games:**
- Fixed predefined timeouts based on expected game duration
- Fallback to 3 minutes for unknown game types

### State Management

**Before Timeout:**
```javascript
wheelGame.isSpinning = true
wheelGame.currentSpin = { spinId, ... }
wheelGame.activeSpins.has(spinId) = true
queueManager.isProcessing = true
```

**After Timeout (Force Complete):**
```javascript
wheelGame.isSpinning = false
wheelGame.currentSpin = null
wheelGame.activeSpins.has(spinId) = false
queueManager.isProcessing = false
// Result recorded in database
// Queue processes next item
```

### Event Flow

**Normal Flow (Overlay Responds):**
1. Server: `startSpin()` → sets safety timeout
2. Server: Emits `wheel:spin-start`
3. Overlay: Receives event, animates wheel
4. Overlay: Emits `wheel:spin-complete`
5. Server: `handleSpinComplete()` → clears safety timeout ✅
6. Server: Records result, emits `wheel:spin-result`
7. Server: After delay, calls `completeProcessing()`

**Timeout Flow (Overlay Doesn't Respond):**
1. Server: `startSpin()` → sets safety timeout
2. Server: Emits `wheel:spin-start`
3. Overlay: ❌ Doesn't receive or doesn't respond
4. Server: Safety timeout triggers → `forceCompleteSpin()` ⏰
5. Server: Records result, emits `wheel:spin-timeout`
6. Overlay: Receives timeout, resets UI
7. Server: Immediately calls `completeProcessing()` (no delay)

## Logging

Added comprehensive logging for debugging:

```javascript
// Debug: Timeout calculation
this.logger.debug(`Calculated wheel timeout: ${timeout}ms (spin: ${spinDuration}ms, winner: ${winnerDisplayDuration}ms, info: ${infoScreenDuration}ms, buffer: ${buffer}ms)`);

// Debug: Safety timeout set
this.logger.debug(`Spin safety timeout set: ${safetyTimeoutMs}ms`);

// Debug: Safety timeout cleared
this.logger.debug(`Spin safety timeout cleared (overlay responded)`);

// Warning: Timeout triggered
this.logger.warn(`Spin ${spinId} safety timeout triggered - overlay did not respond`);
this.logger.warn(`Force completing ${item.type} (timeout)`);

// Info: Timeout handled
this.logger.info(`Wheel spin timeout handled: ${nickname} -> "${prize}" (spinId: ${spinId})`);
```

## Benefits

1. **Reliability**: Queue never gets permanently stuck
2. **Performance**: Timeouts are game-appropriate (20-45s for wheel vs 5-10min for chess)
3. **User Experience**: Rapid events are queued and processed sequentially
4. **Backward Compatibility**: Normal operation unchanged
5. **Maintainability**: Comprehensive logging and test coverage
6. **Robustness**: Multiple safety layers (queue timeout + spin timeout)

## Security Considerations

- ✅ No security vulnerabilities introduced (CodeQL scan clean)
- ✅ Input validation maintained
- ✅ Database operations use existing safe patterns
- ✅ No new dependencies added
- ✅ Timeout values prevent resource exhaustion

## Future Improvements

Potential enhancements (not required for this fix):
1. Make timeout buffer configurable per wheel
2. Add metrics/monitoring for timeout frequency
3. Persistent queue across server restarts
4. Timeout notification to streamer (TTS or visual alert)
5. Configurable timeout strategy (immediate vs delayed retry)

## Conclusion

This implementation provides a robust, maintainable solution to the queue blocking issue. The dual-timeout approach ensures reliability without breaking existing functionality, and comprehensive test coverage prevents regressions.
