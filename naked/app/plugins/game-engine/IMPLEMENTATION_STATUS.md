# Connect 4 Enhancement Implementation Status

## ✅ Completed Features

### Challenge Flow (Original Requirement)
- ✅ "New Challenger" screen when gift is sent
- ✅ Shows challenger nickname and gift image
- ✅ Countdown timer display
- ✅ Configurable timeout (default 30 seconds)
- ✅ Auto-start against streamer after timeout
- ✅ Challenge acceptance/rejection flow
- ✅ Database schema for challenge info

### Rotating Leaderboards (Original Requirement)
- ✅ Daily leaderboard (today's games)
- ✅ Season leaderboard (this month)
- ✅ Lifetime leaderboard (all time)
- ✅ ELO leaderboard
- ✅ Configurable display time per board (default 3 seconds)
- ✅ Selectable leaderboard types in settings
- ✅ Auto-rotation after game end
- ✅ Database queries for all leaderboard types

### Gift Catalog (Original Requirement)
- ✅ Visual gift picker modal
- ✅ Gift images displayed
- ✅ "Refresh Catalog" button
- ✅ Click to select gift
- ✅ Integration with /api/gift-catalog endpoint
- ✅ Similar UI to soundboard system

### Auto-Hide HUD (Original Requirement)
- ✅ HUD disappears after leaderboard rotation
- ✅ Smooth fade-out animation

### ELO Rating System (New Requirement)
- ✅ Database schema with elo_rating and peak_elo fields
- ✅ ELO calculation using standard chess formula
- ✅ K-factor configurable (default 32)
- ✅ ELO changes calculated on game end
- ✅ ELO updates for both players
- ✅ Peak ELO tracking
- ✅ ELO leaderboard API endpoint
- ✅ Logs ELO changes

### Media Configuration Backend (New Requirement)
- ✅ Database table for game media (game_media)
- ✅ Support for MP3/MP4 files
- ✅ Media events: 'new_challenger', 'challenge_accepted'
- ✅ API endpoints for media CRUD operations
- ✅ Challenge events emit media file info
- ✅ Game start events emit media file info

### Round Timer Backend (New Requirement)
- ✅ Database table for timer config (game_round_timers)
- ✅ Configurable time limit (default 30 seconds)
- ✅ Configurable warning time (default 10 seconds)
- ✅ API endpoints for timer configuration

## 🚧 Remaining Work

### Frontend - Overlay Updates

#### ELO Display
- [ ] Show player ELO ratings in game overlay
- [ ] Display ELO changes after game ends
- [ ] Show "New Peak ELO!" message when achieved
- [ ] Add ELO to leaderboard rotation
- [ ] Style ELO display (color coding by tier, e.g., Bronze <1200, Silver 1200-1600, Gold >1600)

#### Media Playback
- [ ] Play audio/video when challenge is created
  - [ ] Check if media.file_path exists in challenge event
  - [ ] Create hidden audio/video element
  - [ ] Play media file
  - [ ] Handle errors gracefully
- [ ] Play audio/video when challenge is accepted
  - [ ] Same pattern as above for game-started event
- [ ] Support both MP3 (audio) and MP4 (video)
- [ ] Volume control from config

#### Game Event Sounds
- [ ] Add sound effect when piece drops
  - [ ] Play on 'game-engine:move-made' event
  - [ ] Different sound than existing move sound
- [ ] Add sound when player wins
  - [ ] Play on game end with winner
- [ ] Add sound when it's player's turn
  - [ ] Play when currentPlayer changes
- [ ] Add warning sound at 10 seconds on round timer
  - [ ] Requires round timer implementation

#### Round Timer Display
- [ ] Display countdown timer during player's turn
- [ ] Position in corner or next to player info
- [ ] Change color at warning time (10 seconds)
- [ ] Play warning sound at 10 seconds
- [ ] Flash red when timer is critical
- [ ] Show "Time's Up!" message

### Frontend - Admin UI Updates

#### ELO Configuration
- [ ] Add ELO settings section in settings tab
  - [ ] Enable/Disable ELO system checkbox
  - [ ] Starting ELO rating input (default 1000)
  - [ ] K-factor input (default 32)
  - [ ] Display ELO calculation formula explanation
- [ ] Add ELO leaderboard to stats tab
- [ ] Show player ELO in player stats view

#### Media Upload Interface
- [ ] Add "Media" tab to admin panel
- [ ] File upload for "New Challenger" event
  - [ ] Accept .mp3 and .mp4 files
  - [ ] Preview player
  - [ ] Save to plugin data directory
  - [ ] Save path to database
- [ ] File upload for "Challenge Accepted" event
  - [ ] Same as above
- [ ] Upload for other game events:
  - [ ] Piece drop sound
  - [ ] Player win sound
  - [ ] Player turn sound
  - [ ] Timer warning sound
- [ ] Delete media button
- [ ] Test playback button
- [ ] Show current media file names

#### Round Timer Configuration
- [ ] Add round timer section in settings tab
  - [ ] Enable/Disable checkbox
  - [ ] Time limit slider (5-120 seconds)
  - [ ] Warning time slider (5-30 seconds)
  - [ ] Action on timeout dropdown (forfeit, random move, extend time)
  - [ ] Preview of timer display
- [ ] Save round timer config to database via API

### Backend - Round Timer Logic

#### Game Engine Integration
- [ ] Add round timer tracking to game sessions
- [ ] Start timer when player's turn begins
- [ ] Emit timer events to overlay:
  - [ ] 'game-engine:timer-started' with duration
  - [ ] 'game-engine:timer-tick' every second
  - [ ] 'game-engine:timer-warning' at warning time
  - [ ] 'game-engine:timer-expired' when time runs out
- [ ] Handle timer expiration:
  - [ ] Option 1: Forfeit turn (opponent gets point)
  - [ ] Option 2: Random valid move
  - [ ] Option 3: Extra time (1 warning)
- [ ] Cancel timer when move is made
- [ ] Pause timer if needed (e.g., streamer pause feature)

#### Socket Events
- [ ] Add socket listeners for timer events
- [ ] Store active timers in memory (Map)
- [ ] Clear timers on game end
- [ ] Clear timers on plugin shutdown

### Testing
- [ ] Test ELO calculations with various scenarios
  - [ ] Higher rated player wins (small ELO gain)
  - [ ] Lower rated player wins (large ELO gain)
  - [ ] Draw between equal players
  - [ ] Draw between unequal players
- [ ] Test media playback in overlay
  - [ ] Challenge created with media
  - [ ] Challenge accepted with media
  - [ ] Handle missing media files
  - [ ] Handle unsupported formats
- [ ] Test round timer
  - [ ] Timer displays correctly
  - [ ] Warning triggers at correct time
  - [ ] Timeout handling works
  - [ ] Timer cancels on move
- [ ] Test leaderboard with ELO included
- [ ] Integration test full challenge flow with all features

### Documentation
- [ ] Update README.md with:
  - [ ] ELO system explanation
  - [ ] Media upload instructions
  - [ ] Round timer configuration
  - [ ] New leaderboard types
- [ ] Add ELO calculation formula documentation
- [ ] Add media file format requirements
- [ ] Add round timer behavior documentation

## 📋 File Upload Implementation Guide

Since file upload is needed, here's the recommended approach:

### Backend (Already in place)
- Use express-fileupload or multer middleware
- Save files to plugin data directory: `this.api.getPluginDataDir()`
- Generate unique filenames to prevent conflicts
- Store relative path in database

### Frontend Upload Flow
1. User selects file from file input
2. JavaScript reads file and converts to base64 or uses FormData
3. POST to `/api/game-engine/media/:gameType/:mediaEvent` with file data
4. Backend saves file and returns path
5. UI updates to show uploaded file

### Overlay Playback
1. Receive media path in socket event
2. Create audio/video element dynamically
3. Set src to media path
4. Call play() method
5. Remove element after playback

## 🎨 UI Mockup Suggestions

### Media Tab Layout
```
┌─────────────────────────────────────────┐
│ 🎬 Game Media Configuration             │
├─────────────────────────────────────────┤
│                                          │
│ Challenge Events:                        │
│ ┌────────────────────────────────────┐  │
│ │ 🎵 New Challenger                  │  │
│ │ [Choose File] [Test] [Delete]      │  │
│ │ Currently: epic-challenger.mp3      │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ 🎵 Challenge Accepted              │  │
│ │ [Choose File] [Test] [Delete]      │  │
│ │ Currently: fight.mp4                │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Game Events:                             │
│ ┌────────────────────────────────────┐  │
│ │ 🔊 Piece Drop                      │  │
│ │ [Choose File] [Test] [Delete]      │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ 🏆 Player Wins                     │  │
│ │ [Choose File] [Test] [Delete]      │  │
│ └────────────────────────────────────┘  │
│                                          │
└─────────────────────────────────────────┘
```

### ELO Settings Layout
```
┌─────────────────────────────────────────┐
│ ⭐ ELO Rating System                    │
├─────────────────────────────────────────┤
│                                          │
│ ☑ Enable ELO Rating System              │
│                                          │
│ Starting ELO:    [1000    ]             │
│ K-Factor:        [32      ]             │
│                                          │
│ ℹ Higher K-factor = bigger rating swings│
│   Recommended: 32 for new players       │
│               16 for experienced players │
│                                          │
│ Current ELO Distribution:                │
│ 🥉 Bronze (<1200):    15 players        │
│ 🥈 Silver (1200-1600): 8 players        │
│ 🥇 Gold (>1600):       3 players        │
│                                          │
└─────────────────────────────────────────┘
```

## 📊 Priority Order

1. **HIGH PRIORITY** (Core functionality)
   - Round timer logic in backend
   - Round timer display in overlay
   - ELO display in overlay

2. **MEDIUM PRIORITY** (Enhanced UX)
   - Media upload UI
   - Media playback in overlay
   - ELO configuration UI

3. **LOW PRIORITY** (Polish)
   - Game event sounds
   - ELO tier colors
   - Advanced timer options

## 🔧 Quick Implementation Notes

### For Media Playback in Overlay
```javascript
function playMedia(mediaInfo) {
  if (!mediaInfo || !mediaInfo.file_path) return;
  
  const element = mediaInfo.media_type === 'audio' 
    ? document.createElement('audio')
    : document.createElement('video');
  
  element.src = mediaInfo.file_path;
  element.volume = (gameConfig.soundVolume || 0.5);
  element.play().catch(err => console.error('Media playback failed:', err));
  
  element.onended = () => element.remove();
}

// Usage in socket handler
socket.on('game-engine:challenge-created', (data) => {
  if (data.media) {
    playMedia(data.media);
  }
  showChallengeScreen(data);
});
```

### For Round Timer
```javascript
let roundTimerInterval = null;
let roundTimeRemaining = 0;

function startRoundTimer(duration) {
  roundTimeRemaining = duration;
  updateTimerDisplay();
  
  roundTimerInterval = setInterval(() => {
    roundTimeRemaining--;
    updateTimerDisplay();
    
    if (roundTimeRemaining === 10) {
      playSound('timer-warning');
      timerDiv.classList.add('warning');
    }
    
    if (roundTimeRemaining <= 0) {
      clearInterval(roundTimerInterval);
      socket.emit('game-engine:timer-expired', { sessionId });
    }
  }, 1000);
}

function stopRoundTimer() {
  if (roundTimerInterval) {
    clearInterval(roundTimerInterval);
    roundTimerInterval = null;
  }
}
```

## 📝 Summary

The core backend infrastructure for all requested features is now complete:
- ✅ ELO system fully implemented in backend
- ✅ Media configuration database and APIs ready
- ✅ Round timer database and APIs ready
- ✅ All leaderboard types implemented
- ✅ Challenge flow complete with media support

**Next steps** focus on frontend implementation:
1. Overlay updates for display and playback
2. Admin UI for configuration
3. Round timer game logic
4. Testing and polish
