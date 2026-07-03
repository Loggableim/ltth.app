# Leaderboard System

## Overview

The Leaderboard System tracks and displays top contributors in your TikTok LIVE stream. Show top gifters, most active chatters, loyal followers, and more with real-time updates and customizable OBS overlays.

## Features

- **Multiple Leaderboards** - Gifts, Coins, Messages, Combos
- **Real-time Updates** - Instant leaderboard changes
- **OBS Browser Source** - Display in stream overlay
- **Customizable Display** - Colors, fonts, positions, animations
- **Time Periods** - All-time, daily, weekly, monthly, stream session
- **Auto-Reset** - Reset leaderboards on schedule
- **Export Data** - Download leaderboard as CSV/JSON

## Leaderboard Types

### Gift Leaderboard

Top gifters by total gifts sent:

**Metrics:**
- Total gifts sent
- Gift count by type
- Most recent gift
- Highest single gift value

**Example:**
```
1. UserA - 127 gifts
2. UserB - 95 gifts
3. UserC - 73 gifts
```

### Coin Leaderboard

Top contributors by total coins:

**Metrics:**
- Total coins donated
- Average gift value
- Highest single donation
- Donation frequency

**Example:**
```
1. UserA - 15,420 coins ($154.20)
2. UserB - 12,850 coins ($128.50)
3. UserC - 9,340 coins ($93.40)
```

### Chat Leaderboard

Most active chatters:

**Metrics:**
- Total messages sent
- Average message length
- Unique words used
- Last message time

**Example:**
```
1. UserA - 243 messages
2. UserB - 187 messages
3. UserC - 154 messages
```

### Combo Leaderboard

Longest gift combo streaks:

**Metrics:**
- Highest combo count
- Combo gift type
- Total combo value
- Combo timestamp

**Example:**
```
1. UserA - Rose x47 (2,350 coins)
2. UserB - TikTok x32 (160 coins)
3. UserC - Heart x28 (140 coins)
```

### Follower Loyalty

Most loyal followers:

**Metrics:**
- First follow date
- Stream attendance count
- Total interaction score
- Loyalty rank

**Example:**
```
1. UserA - Member for 120 days
2. UserB - Member for 95 days
3. UserC - Member for 67 days
```

## Configuration

### Leaderboard Settings

1. Go to **Dashboard** → **Leaderboard**
2. Select leaderboard type
3. Configure settings:
   - **Display Count:** Top 3, 5, 10, or 20
   - **Time Period:** Session, Daily, Weekly, Monthly, All-time
   - **Sort By:** Coins, Gifts, Messages, Combos
   - **Min Threshold:** Minimum value to appear

### Display Options

**Position:**
- Top-left, Top-right
- Bottom-left, Bottom-right
- Center, Custom position

**Size:**
- Compact (400x300)
- Normal (400x600)
- Large (600x900)
- Custom dimensions

**Style:**
- Modern (gradient backgrounds)
- Classic (simple list)
- Neon (glowing effects)
- Minimal (text only)

## OBS Integration

### Browser Source Setup

1. Add **Browser Source** in OBS
2. **URL:** `http://localhost:3000/overlay/leaderboard`
3. **Width:** 400, **Height:** 600
4. **FPS:** 30
5. **Custom CSS:** Optional

### Multiple Leaderboards

Display multiple leaderboards:

**Gift Leaderboard:**
```
URL: /overlay/leaderboard/gifts
Position: Top-right
```

**Coin Leaderboard:**
```
URL: /overlay/leaderboard/coins
Position: Bottom-right
```

**Chat Leaderboard:**
```
URL: /overlay/leaderboard/chat
Position: Bottom-left
```

### Auto-Hide

Hide leaderboard when empty:
- Enable "Auto-hide when empty"
- Minimum entries required: 3 (configurable)
- Fade-out animation: 1 second

## Styling

### Custom CSS

Apply custom styling:

```css
/* Leaderboard container */
.leaderboard {
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid #12a116;
    border-radius: 10px;
    padding: 20px;
}

/* Leaderboard title */
.leaderboard-title {
    font-family: 'Arial Black', sans-serif;
    font-size: 28px;
    color: #12a116;
    text-align: center;
}

/* Leaderboard entries */
.leaderboard-entry {
    display: flex;
    padding: 10px;
    margin: 5px 0;
    background: rgba(18, 161, 22, 0.1);
    border-radius: 5px;
}

/* Rank indicator */
.leaderboard-rank {
    font-weight: bold;
    color: #42ff73;
    margin-right: 10px;
}

/* Username */
.leaderboard-username {
    flex: 1;
    color: #ffffff;
}

/* Value */
.leaderboard-value {
    color: #42ff73;
    font-weight: bold;
}

/* Top 3 special colors */
.rank-1 { color: #ffd700; } /* Gold */
.rank-2 { color: #c0c0c0; } /* Silver */
.rank-3 { color: #cd7f32; } /* Bronze */
```

### Animations

Entry animations:
- **Slide In:** New entry slides from right
- **Fade In:** Gradual opacity increase
- **Scale Up:** Entry grows from small to normal
- **Bounce:** Entry bounces into position

Rank change animations:
- **Highlight:** Flash when rank changes
- **Move Up/Down:** Smooth position transition
- **Celebrate:** Confetti for #1 position

## Time Periods

### Stream Session

Reset when stream starts:
- Only current stream data
- Reset on TikTok LIVE connect
- Perfect for per-stream goals

### Daily

Reset at midnight:
- Track daily top contributors
- Auto-reset at 00:00 local time
- Useful for daily goals

### Weekly

Reset weekly:
- Monday 00:00 (configurable)
- Track weekly champions
- Perfect for weekly challenges

### Monthly

Reset monthly:
- First of month at 00:00
- Track monthly MVPs
- Long-term engagement tracking

### All-Time

Never reset:
- Historical leaderboard
- Lifetime contributions
- Hall of fame

## Auto-Reset

Configure automatic resets:

**Reset Schedule:**
```json
{
  "gifts": "daily",
  "coins": "weekly",
  "chat": "session",
  "combos": "stream"
}
```

**Manual Reset:**
1. Dashboard → Leaderboard
2. Select leaderboard
3. Click **Reset Leaderboard**
4. Confirm reset

## Notifications

Alert when leaderboard changes:

### Rank Change Alerts

```
Trigger: User moves up in leaderboard
Alert: "{username} is now #{rank} on the leaderboard!"
```

### New Leader Alerts

```
Trigger: New #1 position
Alert: "🏆 {username} takes the lead with {value}!"
Sound: crown.mp3
```

### Milestone Alerts

```
Trigger: User reaches top 3
Alert: "🎉 {username} enters top 3!"
```

## Integration with Flows

### Example Flows

**New #1 Gifter:**
```
Trigger: Gift
Condition: User becomes #1 on coin leaderboard
Actions:
  1. Alert: "👑 {username} is now #1 gifter!"
  2. Sound: crown.mp3
  3. TTS: "Congratulations {username}!"
  4. VRChat OSC: Celebrate animation
```

**Top 3 Entry:**
```
Trigger: Gift
Condition: User enters top 3
Actions:
  1. Alert: "🎊 {username} is in top 3!"
  2. Sound: celebration.mp3
```

**Combo Record:**
```
Trigger: Gift
Condition: New highest combo
Actions:
  1. Alert: "🔥 {username} set new combo record: x{count}!"
  2. Sound: record-break.mp3
```

## Statistics

View leaderboard statistics:

**Overall Stats:**
- Total unique contributors: 1,247
- Total coins donated: 450,320
- Average donation: 361 coins
- Most active hour: 20:00-21:00

**Top Contributor:**
- Username: UserA
- Total coins: 15,420
- Total gifts: 127
- Favorite gift: Rose (x34)
- Member since: 2024-10-15

## Export Data

Export leaderboard data:

**CSV Export:**
```csv
Rank,Username,Coins,Gifts,Messages,Last Seen
1,UserA,15420,127,243,2025-01-18 06:00:00
2,UserB,12850,95,187,2025-01-18 05:55:00
3,UserC,9340,73,154,2025-01-18 05:50:00
```

**JSON Export:**
```json
{
  "leaderboard": "coins",
  "period": "all-time",
  "updated_at": "2025-01-18T06:00:00Z",
  "entries": [
    {
      "rank": 1,
      "username": "UserA",
      "coins": 15420,
      "gifts": 127,
      "first_seen": "2024-10-15T10:00:00Z",
      "last_seen": "2025-01-18T06:00:00Z"
    }
  ]
}
```

## Achievements

Award achievements for leaderboard positions:

### Badges

- 🥇 **Gold Badge:** #1 position
- 🥈 **Silver Badge:** #2 position
- 🥉 **Bronze Badge:** #3 position
- ⭐ **Star Contributor:** Top 10
- 💎 **Diamond Supporter:** 10,000+ coins
- 🔥 **Combo Master:** Highest combo

### Achievement Display

Show badges next to usernames:
```
1. UserA 🥇💎 - 15,420 coins
2. UserB 🥈⭐ - 12,850 coins
3. UserC 🥉 - 9,340 coins
```

## Rewards

Auto-reward top contributors:

**Example Rewards:**
```
#1 Position:
- Special role in chat
- Exclusive emote access
- Monthly giveaway entry

Top 3:
- Shoutout in stream
- Name in credits
- Discord VIP role

Top 10:
- Follower appreciation
- Thank you message
```

## Privacy

Leaderboard privacy settings:

**Anonymous Mode:**
- Hide usernames
- Show as "User 1", "User 2", etc.
- Protect user identity

**Opt-Out:**
- Allow users to opt-out via command
- `!optout` - Remove from leaderboard
- Data still tracked but hidden

**GDPR Compliance:**
- User data deletion on request
- Export user's own data
- Clear privacy policy

## Performance

### Optimization

- Update frequency: 5 seconds (configurable)
- Cache leaderboard data
- Lazy load historical data
- Index database for fast queries

### Database Size

Monitor leaderboard database:
- Current entries: 1,247 users
- Database size: 2.5 MB
- Archive old data: > 90 days

## Troubleshooting

**Leaderboard not updating:**
- Check if TikTok LIVE connected
- Verify database is not locked
- Refresh browser source
- Check update interval

**Wrong rankings:**
- Verify calculation settings
- Check time period filter
- Review excluded users
- Recalculate leaderboard

**OBS overlay not showing:**
- Check URL is correct
- Verify server is running
- Refresh browser source
- Check browser source size

## API Access

Leaderboard can be accessed via REST API:

```javascript
// Get leaderboard
GET /api/leaderboard/:type?period=all-time&limit=10

// Get specific user rank
GET /api/leaderboard/:type/user/:username

// Reset leaderboard
POST /api/leaderboard/:type/reset

// Export leaderboard
GET /api/leaderboard/:type/export?format=csv
```

## Best Practices

### Do's ✅

- Update leaderboard regularly (every 5-10 seconds)
- Use appropriate time periods for your goals
- Celebrate top contributors
- Export data for records
- Monitor for spam/abuse

### Don'ts ❌

- Don't update too frequently (< 1 second)
- Don't show too many entries (> 20)
- Don't forget to reset when needed
- Don't ignore privacy concerns
- Don't display without permission

---

*For more leaderboard features and API usage, see [[API-Reference]] and [[goals]].*
