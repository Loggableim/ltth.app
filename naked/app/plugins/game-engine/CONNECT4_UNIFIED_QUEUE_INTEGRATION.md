# Connect4 and Chess Unified Queue Integration

## Overview

Connect4 and Chess games now use the UnifiedQueueManager instead of the legacy gameQueue system. This ensures that all games (Plinko, Wheel, Connect4, and Chess) share a single FIFO queue, preventing conflicts and ensuring fair processing order.

## Changes Made

### 1. UnifiedQueueManager Enhancements

**File:** `app/plugins/game-engine/backend/unified-queue.js`

- Added support for Connect4 and Chess game types
- Added `setGameEnginePlugin()` method to reference main plugin
- Added `queueConnect4()` method for queuing Connect4 games
- Added `queueChess()` method for queuing Chess games
- Added `processConnect4Item()` method for processing Connect4 from queue
- Added `processChessItem()` method for processing Chess from queue
- Updated `getStatus()` to handle all game types
- Updated `getDisplayName()` to support both Plinko/Wheel and Connect4/Chess data structures

**Key Features:**
- FIFO (First-In-First-Out) processing
- Automatic processing when queue has items
- Safety timeout (3 minutes max per item)
- Socket.IO events for queue updates:
  - `unified-queue:connect4-queued`
  - `unified-queue:chess-queued`
  - `unified-queue:status`

### 2. Game Engine Integration

**File:** `app/plugins/game-engine/main.js`

#### Initialization
- Set game engine reference in unified queue during init:
  ```javascript
  this.unifiedQueue.setGameEnginePlugin(this);
  ```

#### Game Start Handling
- Modified `handleGameStart()` to use unified queue for Connect4 and Chess:
  ```javascript
  const useUnifiedQueue = this.unifiedQueue && (gameType === 'connect4' || gameType === 'chess');
  
  if (useUnifiedQueue) {
    const shouldQueue = this.unifiedQueue.shouldQueue() || 
                        this.activeSessions.size > 0 || 
                        this.pendingChallenges.size > 0;
    
    if (shouldQueue) {
      if (gameType === 'connect4') {
        this.unifiedQueue.queueConnect4(gameData);
      } else if (gameType === 'chess') {
        this.unifiedQueue.queueChess(gameData);
      }
      return;
    }
  }
  ```

#### Queue Processing
- Added `startGameFromQueue()` method called by unified queue:
  ```javascript
  async startGameFromQueue(gameType, viewerUsername, viewerNickname, triggerType, triggerValue, giftPictureUrl = null) {
    // Start game without queuing (already dequeued)
    // Handle errors and call completeProcessing() if needed
  }
  ```

#### Game Completion
- Modified `endGame()` to call `completeProcessing()` for Connect4 and Chess:
  ```javascript
  const useUnifiedQueue = this.unifiedQueue && (session.game_type === 'connect4' || session.game_type === 'chess');
  
  if (useUnifiedQueue) {
    this.unifiedQueue.completeProcessing();
  } else {
    // Use old queue system for other games
    setTimeout(() => this.processNextQueuedGame(), 2000);
  }
  ```

## Benefits

### For Streamers
- ✅ All games use the same queue system
- ✅ Fair FIFO processing order across all game types
- ✅ No more conflicts between different game types
- ✅ Consistent queue behavior

### For Viewers
- ✅ Clear queue position across all games
- ✅ Fair processing - first to trigger, first to play
- ✅ Works seamlessly with Plinko and Wheel
- ✅ Real-time queue status updates via Socket.IO

### Technical
- ✅ Unified queue management for all games
- ✅ Simplified codebase - single queue system
- ✅ Better separation of concerns
- ✅ Automatic queue processing
- ✅ Safety timeouts prevent stuck games
- ✅ Backward compatible with legacy gameQueue for other games

## Socket.IO Events

### New Events

**`unified-queue:connect4-queued`**
```javascript
{
  position: 1,
  gameType: "connect4",
  username: "testuser",
  nickname: "Test User",
  queueLength: 1
}
```

**`unified-queue:chess-queued`**
```javascript
{
  position: 2,
  gameType: "chess",
  username: "testuser2",
  nickname: "Test User 2",
  queueLength: 2
}
```

**`unified-queue:status`** (emitted after processing completes)
```javascript
{
  isProcessing: false,
  queueLength: 1,
  currentItem: null,
  queue: [
    {
      position: 1,
      type: "connect4",
      username: "user3",
      nickname: "User Three",
      timestamp: 1704502800000,
      gameType: "connect4"
    }
  ]
}
```

## Testing

### Unit Tests

Created comprehensive test suite: `app/plugins/game-engine/test/connect4-unified-queue.test.js`

Tests cover:
- ✅ UnifiedQueueManager initialization
- ✅ Game engine reference set in unified queue
- ✅ Connect4 queuing when game is active
- ✅ Chess queuing when game is active
- ✅ Multiple games queued in FIFO order
- ✅ Socket.IO event emissions
- ✅ `completeProcessing()` called when game ends
- ✅ `startGameFromQueue()` bypasses queue checking
- ✅ Backward compatibility with legacy gameQueue

### Manual Testing

To manually test:

1. Start the application
2. Trigger multiple Connect4 games in quick succession via chat commands (`/c4start`)
3. Observe that games are queued and processed in order
4. Check Socket.IO events in browser console or overlay
5. Verify that Plinko, Wheel, Connect4, and Chess all queue together

## Backward Compatibility

- Legacy `gameQueue` system is still used for other game types
- Existing Plinko and Wheel functionality unchanged
- No breaking changes to API or database

## Future Enhancements

Potential improvements:
- Migrate all game types to unified queue
- Add priority queue support (VIP, subscribers first)
- Add max queue length limit
- Add queue timeout (remove stale entries)
- Add per-player queue limits
- Add queue visualization in admin UI

## Conclusion

Connect4 and Chess now properly integrate with the UnifiedQueueManager, ensuring consistent queue behavior across all games. This resolves the issue where Connect4 games were not queuing like Plinko or Wheel.

## Related Files

- `/app/plugins/game-engine/backend/unified-queue.js` - Queue manager
- `/app/plugins/game-engine/main.js` - Game engine plugin
- `/app/plugins/game-engine/test/connect4-unified-queue.test.js` - Test suite
- `/app/plugins/game-engine/QUEUE_SYSTEM_IMPLEMENTATION.md` - Legacy queue docs
- `/app/plugins/game-engine/UNIFIED_QUEUE_IMPLEMENTATION.md` - Unified queue docs
