# Goals & Progress Bars Module

## Overview

The Goals module provides customizable progress tracking with browser source overlays for OBS. Track likes, followers, subscriptions, coins, and custom goals with real-time updates and visual progress bars.

## Features

- **4 Separate Goals** - Track multiple objectives simultaneously
- **Goal Types** - Likes, Followers, Subscriptions, Coins, Custom
- **Browser Source Overlay** - Display goals in OBS
- **Real-time Updates** - Progress updates instantly
- **Custom Styling** - Colors, gradients, fonts, animations
- **Multiple Modes** - Add, Set, Increment
- **Milestone Notifications** - Alerts at progress milestones
- **Reset Functionality** - Reset goals between streams

## Configuration

Navigate to **Dashboard** → **Goals** to configure progress tracking.

## Goal Types

### 1. Likes Goal

Track total likes received:

**Configuration:**
- **Target**: Number of likes to reach
- **Current**: Auto-tracked from TikTok LIVE
- **Mode**: Add, Set, or Increment

**Example:**
```
Goal: 10,000 Likes
Current: 7,543
Progress: 75.43%
```

### 2. Followers Goal

Track follower count:

**Configuration:**
- **Target**: Follower goal
- **Current**: Auto-incremented on follow events
- **Reset**: Optional daily/stream reset

**Example:**
```
Goal: 1,000 New Followers
Current: 847
Progress: 84.7%
```

### 3. Subscriptions Goal

Track subscriber count:

**Configuration:**
- **Target**: Subscription goal
- **Current**: Auto-incremented on subscribe events
- **Tiers**: Count all tiers or specific tier

**Example:**
```
Goal: 100 Subscribers
Current: 73
Progress: 73%
```

### 4. Coins Goal

Track total coins from gifts:

**Configuration:**
- **Target**: Coin goal
- **Current**: Auto-tracked from gift events
- **Display**: Show as coins or dollar value

**Example:**
```
Goal: 50,000 Coins ($500)
Current: 32,150 Coins ($321.50)
Progress: 64.3%
```

### 5. Custom Goal

Track anything with manual updates:

**Configuration:**
- **Name**: Custom goal name
- **Target**: Target value
- **Current**: Manual or flow-based updates

**Examples:**
```
- Hours Streamed: 0/10
- Push-ups Done: 0/100
- Songs Sung: 0/20
- Challenges Completed: 0/5
```

## Goal Modes

### Add Mode

Adds value to current progress:

```
Current: 100
Add: +50
New Current: 150
```

**Use Cases:**
- Manual coin donations
- Bonus likes from raids
- Extra followers from shares

### Set Mode

Sets current value directly:

```
Current: 100
Set: 200
New Current: 200
```

**Use Cases:**
- Correcting tracking errors
- Syncing with external count
- Resetting mid-stream

### Increment Mode

Increases by 1:

```
Current: 100
Increment: +1
New Current: 101
```

**Use Cases:**
- Challenge completions
- Song counter
- Task tracking

## Progress Bar Styles

Customize progress bar appearance:

### Basic Styling

- **Width**: 100px - 1000px
- **Height**: 20px - 100px
- **Border Radius**: 0px - 50px (rounded corners)
- **Background Color**: Any hex color
- **Progress Color**: Any hex color
- **Text Color**: Any hex color

### Gradient Styles

Create gradient progress bars:

```css
Linear Gradient:
- Start Color: #12a116 (green)
- End Color: #42ff73 (neon green)
- Direction: Left to right
```

**Preset Gradients:**
- Green → Neon Green (default)
- Purple → Pink
- Blue → Cyan
- Orange → Red
- Custom gradient

### Animations

Animated progress bars:

- **Fill Animation**: Smooth progress increase
- **Pulse**: Pulsing glow effect
- **Shimmer**: Shimmering shine effect
- **Rainbow**: Cycling rainbow colors

### Text Display

Customize goal text:

**Template Variables:**
- `{current}` - Current value
- `{target}` - Target value
- `{percentage}` - Progress percentage
- `{remaining}` - Remaining to goal

**Example Templates:**
```
"{current} / {target} Likes ({percentage}%)"
"Goal: {target} | Progress: {current}"
"{percentage}% Complete - {remaining} to go!"
```

## Position & Layout

Position goals on overlay:

### Positioning Options

- **Preset Positions**: Top-left, top-center, top-right, bottom-left, etc.
- **Custom Position**: X/Y pixel coordinates
- **Anchor**: Corner or center anchoring

### Layout Modes

1. **Horizontal Stack** - Goals stacked horizontally
2. **Vertical Stack** - Goals stacked vertically
3. **Grid** - 2x2 grid layout
4. **Custom** - Manual positioning

**Example Layouts:**
```
Horizontal Stack:
[Goal 1] [Goal 2] [Goal 3] [Goal 4]

Vertical Stack:
[Goal 1]
[Goal 2]
[Goal 3]
[Goal 4]

Grid (2x2):
[Goal 1] [Goal 2]
[Goal 3] [Goal 4]
```

## Milestone Notifications

Alert when milestones are reached:

### Milestone Configuration

1. Go to **Goals** → **Milestones**
2. Select goal
3. Add milestone percentages (e.g., 25%, 50%, 75%, 100%)
4. Configure notification:
   - TTS message
   - Alert visual
   - Sound effect
   - Flow trigger

### Example Milestones

```
Likes Goal: 10,000
- 25% (2,500): "Quarter way there!"
- 50% (5,000): "Halfway to 10k likes!"
- 75% (7,500): "Almost at 10k!"
- 100% (10,000): "🎉 WE DID IT! 10,000 LIKES! 🎉"
```

## OBS Browser Source Setup

Display goals in OBS:

### Individual Goal Overlay

1. Add **Browser Source** in OBS
2. URL: `http://localhost:3000/overlay/goal/1`
   - Replace `1` with goal ID (1-4)
3. Width: 600, Height: 100
4. FPS: 30
5. Custom CSS (optional)

### All Goals Overlay

Display all goals together:

1. Add **Browser Source** in OBS
2. URL: `http://localhost:3000/overlay/goals`
3. Width: 1920, Height: 200
4. FPS: 30
5. Check "Shutdown source when not visible"

### Overlay Customization

Add custom CSS in browser source:

```css
/* Transparent background */
body {
    background: transparent;
}

/* Custom font */
.goal-text {
    font-family: 'Arial Black', sans-serif;
    font-size: 24px;
}

/* Custom colors */
.goal-bar {
    background: #1a1a1a;
    border: 2px solid #12a116;
}
```

## Integration with Flows

Update goals via automation:

### Auto-Update Example

```
Trigger: Follow
Actions:
  1. Goal Increment: Followers Goal +1
  2. TTS: "Welcome {username}! We're at {current} followers!"
```

### Conditional Goal Updates

```
Trigger: Gift
Condition: coins >= 1000
Actions:
  1. Goal Add: Coins Goal +{coins}
  2. Alert: "Big gift from {username}!"
  3. Check Milestone: If 75% → Play celebration
```

See [[flows]] for more examples.

## Manual Goal Updates

Update goals manually during stream:

1. Go to **Dashboard** → **Goals**
2. Select goal
3. Enter value
4. Choose mode (Add, Set, Increment)
5. Click **Update**

**Quick Actions:**
- **+1 Button**: Quick increment
- **+10 Button**: Add 10 to progress
- **Reset**: Set current to 0

## Goal Reset Options

### Manual Reset

Reset goals manually:
- Reset single goal
- Reset all goals
- Reset to specific value

### Auto-Reset

Automatic reset schedules:

1. **Daily Reset**: Reset at midnight
2. **Stream Start**: Reset when going live
3. **Stream End**: Reset when stream ends
4. **Never**: Manual reset only

**Use Cases:**
- Daily follower goals
- Per-stream like goals
- Long-term subscriber goals (never reset)

## Progress Tracking

View goal history and statistics:

### Statistics Dashboard

- Total progress over time
- Average daily progress
- Fastest goal completion
- Slowest goal completion
- Goal completion rate

### History Log

View goal update history:
- Timestamp
- Value change
- Source (manual, flow, event)
- User who triggered (if applicable)

## Advanced Features

### Goal Dependencies

Chain goals together:

```
Goal 1: 5,000 Likes
→ Unlocks Goal 2: 10,000 Likes
  → Unlocks Goal 3: 20,000 Likes
```

### Dynamic Targets

Auto-adjust targets based on progress:

```
If progress > 90% before 50% stream time:
  Increase target by 25%
```

### Goal Rewards

Trigger rewards at completion:

```
100% Complete:
- OBS Scene: Switch to "Celebration"
- Sound: Epic victory music
- TTS: "Goal reached! Thank you all!"
- Confetti overlay
```

## Performance Optimization

- Update frequency: 1-2 seconds (configurable)
- Batch updates for rapid events
- Client-side interpolation for smooth animation
- Cache goal data to reduce database queries

## Troubleshooting

**Goal not updating:**
- Check if goal is enabled
- Verify event connection (TikTok LIVE)
- Check browser source in OBS
- Refresh overlay URL

**Progress bar not displaying:**
- Verify OBS browser source URL
- Check width/height settings
- Refresh browser source
- Check browser console for errors

**Milestones not triggering:**
- Verify milestone percentages
- Check notification settings
- Test with manual update
- Check flow configuration

**Incorrect progress:**
- Reset goal to correct value
- Check auto-increment settings
- Verify event tracking
- Review history log

## API Access

Goals can be managed via REST API:

```javascript
// Get all goals
GET /api/goals

// Get specific goal
GET /api/goals/:id

// Update goal
PUT /api/goals/:id
{
  "current": 5000,
  "mode": "set"
}

// Increment goal
POST /api/goals/:id/increment

// Reset goal
POST /api/goals/:id/reset

// Get goal history
GET /api/goals/:id/history
```

See [[API-Reference]] for complete documentation.

## Best Practices

### Do's ✅

- Set realistic goals
- Test overlay before stream
- Use milestones for engagement
- Reset goals regularly
- Track multiple goal types
- Customize for your brand

### Don'ts ❌

- Don't set impossible goals
- Don't forget to test browser source
- Don't update too frequently (spam)
- Don't ignore milestone notifications
- Don't overload with too many goals

## Example Goal Configurations

### Beginner Streamer

```
Goal 1: 100 Followers
Goal 2: 1,000 Likes  
Goal 3: 10 Subscribers
Goal 4: Custom - 3 Hours Streamed
```

### Established Streamer

```
Goal 1: 10,000 Likes
Goal 2: 1,000 New Followers
Goal 3: 100 Subscribers
Goal 4: 100,000 Coins ($1,000)
```

### Event Stream

```
Goal 1: 5,000 Likes in 2 Hours
Goal 2: 24-Hour Stream Progress
Goal 3: Charity Donation Goal
Goal 4: Challenge Completions
```

---

*For more advanced goal tracking and API usage, see [[API-Reference]] and [[flows]].*
