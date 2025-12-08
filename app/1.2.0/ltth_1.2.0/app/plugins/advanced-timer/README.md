# Advanced Timer Plugin

Professional multi-timer system for TikTok LIVE streaming with event automation, viewer interaction, and customizable overlays.

## 🎯 Features

### Multi-Timer System
- **Unlimited timers** - Create as many timers as you need
- **5 timer modes**:
  - **Countdown** - Count down from a starting time to zero
  - **Count Up** - Count up from zero to a target value
  - **Stopwatch** - Count up indefinitely
  - **Loop** - Continuously repeat countdown
  - **Interval** - Count up to target, reset, and repeat

### Event Automation
- **TikTok Events Integration**:
  - Gifts - Add/remove time based on gift type and value
  - Likes - Modify timer based on likes received
  - Follows - Reward new followers
  - Shares - Encourage stream sharing
  - Subscribes - Reward new subscribers
  - Chat Commands - Allow viewers to interact via chat

### Viewer Interaction
- **Like-based Speed Modification** - Timer speed changes based on like rate
- **Reward Mechanics** - Viewers add time through engagement
- **Configurable Ratios** - Set likes-to-seconds conversions

### Timer Chains
- **Automatic Triggers** - When Timer A completes, automatically:
  - Start Timer B
  - Stop Timer C
  - Reset Timer D
- **Complex Workflows** - Chain multiple timers for advanced automation

### Customizable Overlays
- **5 Display Templates**:
  - Default - Classic large timer display
  - Progress Bar - Timer with visual progress bar
  - Circular - Circular progress indicator
  - Minimal - Clean, simple display
  - Big Timer - Extra large for visibility

- **OBS Compatible** - Transparent background for seamless integration
- **Real-time Updates** - WebSocket-powered live updates
- **Individual URLs** - Each timer has its own overlay URL

### Advanced Features
- **IF/THEN Rules** - Create custom automation rules
- **Alert Triggers** - Show alerts when timer reaches thresholds
- **Sound Triggers** - Play sounds on timer events
- **OBS Scene Control** - Change scenes based on timer state
- **Profile Management** - Save and load timer configurations
- **Comprehensive Logging** - Track all timer events and user contributions
- **Exportable Logs** - Download activity logs as JSON

## 📖 Quick Start

### 1. Create Your First Timer

1. Navigate to **Advanced Timer** in the plugins menu
2. Click **Create Timer**
3. Enter a name (e.g., "Stream Timer")
4. Select a mode (e.g., "Countdown")
5. Set initial duration (e.g., 3600 for 1 hour)
6. Click **Create Timer**

### 2. Add to OBS

1. Open your timer settings (⚙️ Settings button)
2. Go to the **Overlay** tab
3. Copy the overlay URL
4. In OBS:
   - Add a new **Browser Source**
   - Paste the URL
   - Set width to 1920, height to 1080
   - Check "Shutdown source when not visible"
   - Click OK

### 3. Configure Events (Optional)

1. In timer settings, go to **Events** tab
2. Click **Add Event Rule**
3. Configure when and how events affect your timer
4. Examples:
   - "Rose gift adds 30 seconds"
   - "100 likes add 10 seconds"
   - "Follow adds 60 seconds"

## 🎮 Timer Controls

### Basic Controls
- **▶️ Start** - Begin timer countdown/count up
- **⏸️ Pause** - Pause the timer
- **⏹️ Stop** - Stop and reset to initial state
- **🔄 Reset** - Reset to initial value

### Quick Actions
- **+10s, +30s, +1m, +5m** - Quickly add time
- **-10s, -30s** - Quickly remove time

## ⚙️ Configuration

### Timer Modes

#### Countdown
- Starts at a specific time and counts down to zero
- Perfect for: Stream end timers, challenge timers, subathons
- Example: 1-hour stream timer

#### Count Up
- Starts at zero and counts up to a target
- Perfect for: Goal tracking, progress displays
- Example: Count up to 1000 followers

#### Stopwatch
- Counts up indefinitely
- Perfect for: Session tracking, uptime displays
- Example: How long you've been streaming

#### Loop
- Counts down, then automatically resets and repeats
- Perfect for: Recurring events, break timers
- Example: 5-minute loop for regular giveaways

#### Interval
- Counts up to target, resets, repeats
- Perfect for: Interval training, periodic alerts
- Example: Reminder every 10 minutes

### Event Configuration

#### Gift Events
```
Event Type: Gift
Action: Add Time
Value: 30 seconds
Conditions:
  - Gift Name: Rose (optional - specific gift)
  - Min Coins: 100 (optional - minimum value)
```

#### Like Events
```
Event Type: Like
Action: Add Time
Value: 0.1 seconds per like
Conditions:
  - Min Likes: 10 (optional - minimum per event)
```

#### Chat Commands
```
Event Type: Chat
Action: Add Time
Value: 5 seconds
Conditions:
  - Command: !addtime
  - Keyword: timer (optional)
```

### Timer Chains

Link timers to create workflows:
1. Open timer settings
2. Go to **Chains** tab (future feature)
3. Add chain rule:
   - When: Timer completes
   - Action: Start another timer
   - Target: Select target timer

## 🎨 Overlay Customization

### Template Selection

Add template parameter to URL:
```
?timer=TIMER_ID&template=progress
?timer=TIMER_ID&template=circular
?timer=TIMER_ID&template=minimal
?timer=TIMER_ID&template=big
```

### CSS Customization

Create custom styles by adding CSS to your browser source:
```css
.timer-display {
  font-size: 120px !important;
  color: #ff0000 !important;
}
```

## 📊 Use Cases

### Subathon Timer
- Mode: Countdown
- Events: All gifts add time based on value
- Chains: When timer hits zero, trigger end stream alert

### Stream Schedule
- Mode: Loop (30 minutes)
- Events: None
- Purpose: Reminder every 30 minutes for breaks

### Follower Goal
- Mode: Count Up to 1000
- Events: Each follow adds +1
- Alerts: Show alert at milestones (500, 750, 1000)

### Challenge Timer
- Mode: Countdown from 1 hour
- Events: Specific gifts remove time (make it harder)
- Alerts: Warning when < 5 minutes

## 🔧 API Reference

### REST API Endpoints

```javascript
// Get all timers
GET /api/advanced-timer/timers

// Get specific timer
GET /api/advanced-timer/timers/:id

// Create timer
POST /api/advanced-timer/timers
Body: { name, mode, initial_duration, target_value, config }

// Update timer
PUT /api/advanced-timer/timers/:id
Body: { name, config, ... }

// Delete timer
DELETE /api/advanced-timer/timers/:id

// Start timer
POST /api/advanced-timer/timers/:id/start

// Pause timer
POST /api/advanced-timer/timers/:id/pause

// Stop timer
POST /api/advanced-timer/timers/:id/stop

// Reset timer
POST /api/advanced-timer/timers/:id/reset

// Add time
POST /api/advanced-timer/timers/:id/add-time
Body: { seconds, source }

// Remove time
POST /api/advanced-timer/timers/:id/remove-time
Body: { seconds, source }

// Get logs
GET /api/advanced-timer/timers/:id/logs?limit=100

// Export logs
GET /api/advanced-timer/timers/:id/export-logs
```

### WebSocket Events

```javascript
// Timer updates
socket.on('advanced-timer:tick', (data) => {
  // data: { id, currentValue, state }
});

// Timer started
socket.on('advanced-timer:started', (data) => {
  // data: { id, currentValue }
});

// Timer paused
socket.on('advanced-timer:paused', (data) => {
  // data: { id, currentValue }
});

// Timer completed
socket.on('advanced-timer:completed', (data) => {
  // data: { id, currentValue }
});

// Time added
socket.on('advanced-timer:time-added', (data) => {
  // data: { id, amount, currentValue, source }
});
```

## 🛡️ Security & Performance

- **Offline Persistence** - Timers continue running even if connection drops
- **Auto-save** - Timer states saved every 5 seconds
- **Database Backup** - All configurations stored in SQLite
- **Recovery** - Timers restored to last known state on restart

## 📝 Logging

All timer activity is logged:
- Timer starts/stops/pauses/resets
- Time additions/removals with source
- Event triggers
- User contributions (who added time)

Export logs via Settings → Logs → Export button

## 🤝 Integration with Other Plugins

### Flows/Events System
Advanced Timer registers flow actions:
- Start Timer
- Pause Timer
- Stop Timer
- Reset Timer
- Add Time to Timer
- Remove Time from Timer

Use these in your automation flows!

### OBS WebSocket
Timer completion can trigger:
- Scene changes
- Source visibility toggles
- Filter enable/disable

## 💡 Tips & Tricks

1. **Multiple Timers**: Use different timers for different purposes (main timer, break timer, goal timer)
2. **Like Speed Modifier**: Set `likesToSpeedRatio` in config to make countdown slower when getting likes
3. **Threshold Alerts**: Set thresholds at 5min, 1min, 30sec for warnings
4. **Profile Backup**: Export timer profiles before making major changes
5. **Test Events**: Use manual +/- buttons to test before going live

## 🐛 Troubleshooting

### Timer not updating in overlay
- Check if timer is running (click Start)
- Verify overlay URL includes timer ID
- Refresh browser source in OBS

### Events not triggering
- Verify TikTok connection is active
- Check event configuration conditions
- Review timer logs for errors

### Timer lost after restart
- Check database integrity
- Timer states are auto-saved every 5 seconds
- Export important timers as profiles

## 📄 License

This plugin is part of Pup Cid's Little TikTok Helper
Licensed under CC-BY-NC-4.0

## 👤 Author

**Pup Cid**

## 📧 Support

For bugs or feature requests, contact: loggableim@gmail.com
