# Game Engine - Chat Command & Queue System Implementation

## Problem Statement

Three critical issues were identified in the LTTH Game Engine:

1. **Chat commands to start games were not selectable** - Users could not configure custom chat commands via the trigger system
2. **Chat commands were not being recognized** - Database-stored command triggers were being ignored
3. **No game queue system** - When multiple games were triggered simultaneously, only the first was processed, others were blocked

## Solution Overview

### 1. Chat Command Trigger Recognition ✅

**Problem**: The `handleChatCommand()` method only checked for hardcoded commands (`/c4`, `/c4start`) and did not check the database for user-configured command triggers.

**Solution**: Added trigger database lookup at the start of `handleChatCommand()`:

```javascript
// Check if this chat message triggers a game from database triggers
const triggers = this.db.getTriggers();
const matchingTrigger = triggers.find(t => 
  t.trigger_type === 'command' && 
  message.toLowerCase() === t.trigger_value.toLowerCase()
);

if (matchingTrigger) {
  // Chat command trigger found - start or queue game
  this.handleGameStart(matchingTrigger.game_type, uniqueId, nickname, 'command', matchingTrigger.trigger_value);
  return;
}
```

**Impact**:
- Users can now add ANY chat command as a trigger via the UI (e.g., `!play`, `!c4game`, `!challenge`)
- Commands are case-insensitive
- Works independently of GCCE plugin

### 2. Game Queue System (FIFO) ✅

**Problem**: When a game was active and another was triggered, the second request was rejected with a "game already active" message.

**Solution**: Implemented a First-In-First-Out (FIFO) queue system:

```javascript
// In constructor
this.gameQueue = []; // Array of { gameType, viewerUsername, viewerNickname, triggerType, triggerValue, timestamp }
```

**Key Methods**:

#### `handleGameStart()` - Centralized Game Start Logic
```javascript
handleGameStart(gameType, viewerUsername, viewerNickname, triggerType, triggerValue, giftPictureUrl = null)
```
- Checks if a game is active or challenge pending
- If yes: Adds request to queue
- If no: Starts game immediately
- Emits `game-engine:game-queued` socket event when queued

#### `processNextQueuedGame()` - Queue Processing
```javascript
processNextQueuedGame()
```
- Called automatically 2 seconds after a game ends
- Retrieves next game from queue (FIFO - `shift()`)
- Starts the queued game
- Emits `game-engine:queue-processing` socket event

### 3. Socket Events

New events for queue system:

**`game-engine:game-queued`**
```javascript
{
  position: 1,
  gameType: "connect4",
  viewerUsername: "testuser",
  viewerNickname: "Test User",
  message: "Spiel wurde in Warteschlange hinzugefügt. Position: 1"
}
```

**`game-engine:queue-processing`**
```javascript
{
  gameType: "connect4",
  viewerUsername: "testuser",
  viewerNickname: "Test User",
  remainingInQueue: 2
}
```

### 4. API Endpoint

**`GET /api/game-engine/queue`**

Returns current queue status:
```json
{
  "length": 2,
  "queue": [
    {
      "position": 1,
      "gameType": "connect4",
      "viewerUsername": "user1",
      "viewerNickname": "User 1",
      "triggerType": "command",
      "triggerValue": "!play",
      "timestamp": 1704502800000
    },
    {
      "position": 2,
      "gameType": "connect4",
      "viewerUsername": "user2",
      "viewerNickname": "User 2",
      "triggerType": "gift",
      "triggerValue": "Rose",
      "timestamp": 1704502805000
    }
  ]
}
```

## How It Works - Flow Diagrams

### Chat Command Flow

```
User sends "!play" in chat
         ↓
handleChatCommand() receives message
         ↓
Check database triggers
         ↓
Match found: trigger_type='command', trigger_value='!play'
         ↓
Call handleGameStart('connect4', username, nickname, 'command', '!play')
         ↓
     [Is game active?]
    /                \
  YES                NO
   ↓                  ↓
Add to queue     Start game immediately
   ↓
Emit game-engine:game-queued
```

### Queue Processing Flow

```
Game ends
   ↓
endGame() called
   ↓
Remove from activeSessions
   ↓
Wait 2 seconds (allow UI updates)
   ↓
processNextQueuedGame()
   ↓
[Queue empty?]
   /        \
 YES        NO
  ↓          ↓
Exit    Get next from queue (FIFO)
          ↓
    Emit game-engine:queue-processing
          ↓
    Call handleGameStart() for queued game
```

## Configuration

### Adding Chat Command Triggers

Via Admin UI (`/game-engine/ui`):

1. Navigate to "Trigger" tab
2. Select game type (e.g., "Connect4")
3. Select trigger type: "Befehl" (Command)
4. Enter command value (e.g., `!play`, `!c4game`, `!challenge`)
5. Click "Trigger hinzufügen"

The trigger is immediately active and will be recognized in chat.

### Multiple Triggers

You can add multiple command triggers for the same game:
- `!play` → Connect4
- `!c4game` → Connect4
- `!challenge` → Connect4

All will trigger the same game type.

## Testing

### Manual Verification Test

A comprehensive test was created (`/tmp/test-game-engine-queue.js`) that verifies:

1. ✅ Triggers are loaded from database
2. ✅ Chat commands are recognized
3. ✅ Games are queued when active
4. ✅ Multiple games can be queued
5. ✅ Socket events are emitted
6. ✅ Queue is cleared on shutdown

### Test Results

```
✅ Chat command triggers are recognized from database
✅ Games are queued when another game is active  
✅ Multiple games can be queued (FIFO order)
✅ Socket events are emitted correctly
✅ Queue is cleared on plugin shutdown
```

## Code Changes Summary

### Files Modified
- `app/plugins/game-engine/main.js` (272 lines changed)

### Files Created
- `app/plugins/game-engine/test/queue-system.test.js` (new test file)

### Key Changes in main.js

1. **Constructor** - Added `this.gameQueue = []`
2. **destroy()** - Added `this.gameQueue = []` to clear queue
3. **handleChatCommand()** - Added database trigger checking
4. **handleGiftTrigger()** - Refactored to use `handleGameStart()`
5. **handleGameStart()** - New method (71 lines) - centralized start/queue logic
6. **processNextQueuedGame()** - New method (33 lines) - queue processing
7. **endGame()** - Added queue processing call with 2-second delay
8. **handleConnect4StartCommand()** - Updated to use queue system
9. **registerRoutes()** - Added `/api/game-engine/queue` endpoint

## Benefits

### For Streamers
- ✅ Fully customizable chat commands
- ✅ No more "game already active" rejections
- ✅ Viewers can queue for games automatically
- ✅ Fair FIFO processing order

### For Viewers
- ✅ Can trigger games with custom commands
- ✅ Get feedback when queued (position in queue)
- ✅ No need to spam commands - just queue once
- ✅ Clear communication via overlays

### Technical
- ✅ Clean separation of concerns
- ✅ Backwards compatible
- ✅ Socket events for UI updates
- ✅ Automatic queue management
- ✅ Memory-efficient (in-memory queue)

## Future Enhancements

Possible improvements:
- Queue timeout (remove stale entries after X minutes)
- Max queue length limit
- Priority queue (VIPs, subscribers first)
- Queue position updates via chat bot
- Queue visualization in overlay
- Per-player queue limits (one game per person)

## Conclusion

All three issues from the problem statement have been successfully resolved:

1. ✅ Chat commands are now fully selectable via the trigger system
2. ✅ Chat command triggers are recognized and processed correctly
3. ✅ Game queue system ensures all triggered games are processed in order

The implementation is production-ready, tested, and maintains backward compatibility with existing functionality.
