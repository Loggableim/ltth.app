# Pyramid Mode XP Rewards Integration Guide

## Overview

The Pyramid Mode XP Rewards system automatically awards experience points (XP) to top-performing players at the end of each pyramid round. This feature seamlessly integrates with the **Viewer XP System** plugin to gamify viewer engagement and reward competitive participation.

## Features

### 🎮 Automatic XP Distribution
- Converts pyramid battle points to XP based on configurable multiplier
- Distributes XP to top N players according to chosen strategy
- Integrates seamlessly with Viewer XP System plugin

### 📊 Multiple Distribution Strategies

#### 1. Winner Takes All (100%)
- **Distribution**: 100% to 1st place
- **Best for**: High-stakes competition, clear winner focus
- **Example**: 1000 total points → Winner gets 1000 XP

#### 2. Top 3 Split
- **Distribution**: 50% / 30% / 20%
- **Best for**: Rewarding podium finishers
- **Example**: 
  - 1st place: 500 XP (50%)
  - 2nd place: 300 XP (30%)
  - 3rd place: 200 XP (20%)

#### 3. Top 5 Split
- **Distribution**: 40% / 25% / 18% / 10% / 7%
- **Best for**: Encouraging broader participation
- **Example**:
  - 1st: 400 XP (40%)
  - 2nd: 250 XP (25%)
  - 3rd: 180 XP (18%)
  - 4th: 100 XP (10%)
  - 5th: 70 XP (7%)

#### 4. Top 10 Split
- **Distribution**: 30% / 20% / 15% / 10% / 8% / 6% / 5% / 3% / 2% / 1%
- **Best for**: Large pyramid rounds with many participants
- **Example**: Rewards the top 10 players with decreasing percentages

### ⚙️ Configuration Options

#### Enable/Disable XP Rewards
- **Setting**: `xpRewardsEnabled`
- **Default**: `false`
- **Description**: Master toggle for XP rewards system
- **Requires**: Viewer XP System plugin must be enabled

#### Distribution Mode
- **Setting**: `xpDistributionMode`
- **Options**: 
  - `winner-takes-all`
  - `top3`
  - `top5`
  - `top10`
- **Default**: `winner-takes-all`
- **Description**: How XP is split among winners

#### XP Conversion Rate
- **Setting**: `xpConversionRate`
- **Range**: 0.1 - 10.0
- **Default**: `1.0`
- **Description**: Multiplier for converting points to XP
- **Formula**: `Total XP = Sum(All Player Points) × Conversion Rate`
- **Example**: 
  - Conversion rate 1.0: 1000 points = 1000 XP
  - Conversion rate 2.0: 1000 points = 2000 XP
  - Conversion rate 0.5: 1000 points = 500 XP

#### Number of Rewarded Places
- **Setting**: `xpRewardedPlaces`
- **Options**: 1, 3, 5, or 10
- **Default**: `1`
- **Description**: How many top players receive XP
- **Note**: Must not exceed available players or distribution mode maximum

## Setup Instructions

### Prerequisites
1. **Viewer XP System plugin** must be installed and enabled
2. **Pyramid Mode** must be enabled in CoinBattle settings

### Configuration Steps

1. **Navigate to CoinBattle Admin Panel**
   - Open: `http://localhost:3000/plugins/coinbattle`
   - Go to "Settings" tab

2. **Scroll to Pyramid Mode Settings**
   - Locate "🎮 XP Rewards Integration" section

3. **Enable XP Rewards**
   - Check "Enable XP Rewards for Winners"

4. **Choose Distribution Strategy**
   - Select from dropdown:
     - Winner Takes All (100%)
     - Top 3 (50%, 30%, 20%)
     - Top 5 (40%, 25%, 18%, 10%, 7%)
     - Top 10 (30%, 20%, 15%, 10%, 8%, 6%, 5%, 3%, 2%, 1%)

5. **Set XP Conversion Rate**
   - Default: 1.0 (1 point = 1 XP)
   - Adjust to control XP generosity
   - Higher values = more XP awarded

6. **Set Number of Rewarded Places**
   - Choose: 1, 3, 5, or 10
   - Should match or be less than distribution mode
   - Example: "Top 3" mode with 3 rewarded places

7. **Save Settings**
   - Click "💾 Save Pyramid Settings"
   - Settings are applied immediately to next round

## How It Works

### During Pyramid Round
1. Players earn points by sending gifts/likes
2. Points accumulate throughout the round
3. Leaderboard updates in real-time

### When Round Ends
1. **Calculate Total XP Pool**
   ```
   Total Points = Sum of all player points
   Total XP = Total Points × XP Conversion Rate
   ```

2. **Distribute XP by Percentage**
   ```
   Player XP = (Total XP × Percentage) ÷ 100
   ```
   Example (Top 3, 1000 total points, 1.0 rate):
   - Total XP = 1000 × 1.0 = 1000
   - 1st place: 1000 × 50% = 500 XP
   - 2nd place: 1000 × 30% = 300 XP
   - 3rd place: 1000 × 20% = 200 XP

3. **Award XP via Viewer XP System**
   - Calls `addXP(username, amount, 'pyramid_win', details)`
   - XP is added to viewer profiles
   - May trigger level-ups and rewards

4. **Emit Events**
   - `pyramid:xp-awards` socket event
   - `pyramid:round-ended` with XP rewards data

### XP Transaction Details
Each XP award is logged with:
- **Action Type**: `pyramid_win`
- **Details**: 
  - `place`: Final ranking (1, 2, 3, etc.)
  - `percentage`: Share of XP pool
  - `points`: Pyramid points earned
  - `source`: `coinbattle-pyramid`

## Example Scenarios

### Scenario 1: Competitive Stream (Winner Takes All)
**Settings:**
- Distribution: Winner Takes All
- Conversion Rate: 1.0
- Rewarded Places: 1

**Results:**
```
Players:
- Alice: 5000 points
- Bob: 3000 points
- Carol: 2000 points

Total XP = 10,000 × 1.0 = 10,000 XP
Alice gets: 10,000 XP (100%)
```

### Scenario 2: Casual Stream (Top 5 Split)
**Settings:**
- Distribution: Top 5
- Conversion Rate: 2.0 (double XP event!)
- Rewarded Places: 5

**Results:**
```
Players:
- Alice: 1000 points
- Bob: 800 points
- Carol: 600 points
- Dave: 400 points
- Eve: 200 points

Total XP = 3,000 × 2.0 = 6,000 XP

Alice: 6000 × 40% = 2,400 XP (1st)
Bob: 6000 × 25% = 1,500 XP (2nd)
Carol: 6000 × 18% = 1,080 XP (3rd)
Dave: 6000 × 10% = 600 XP (4th)
Eve: 6000 × 7% = 420 XP (5th)
```

### Scenario 3: Big Event (Top 10)
**Settings:**
- Distribution: Top 10
- Conversion Rate: 1.5
- Rewarded Places: 10

**Result:** Top 10 players receive XP based on pyramid placement

## Integration with Viewer XP System

### Automatic Features
When viewer-xp plugin is enabled, winners receive:
- ✅ **XP Points** added to their profile
- ✅ **Level-ups** if XP threshold is reached
- ✅ **Badges & Titles** from XP system
- ✅ **Leaderboard ranking** updates
- ✅ **Streaks & Daily bonuses** (independent)

### Transaction Logging
All XP awards are logged in `xp_transactions` table:
```sql
{
  username: 'alice_123',
  amount: 2400,
  action_type: 'pyramid_win',
  details: {
    place: 1,
    percentage: 40,
    points: 1000,
    source: 'coinbattle-pyramid'
  },
  timestamp: '2024-01-15 20:30:45'
}
```

## Troubleshooting

### XP Not Being Awarded

**Issue**: Players don't receive XP after pyramid round

**Solutions:**
1. ✅ Check if Viewer XP System plugin is enabled
2. ✅ Verify `xpRewardsEnabled` is checked
3. ✅ Ensure at least 1 player participated
4. ✅ Check server logs for errors
5. ✅ Verify viewer-xp database is accessible

### Incorrect XP Amounts

**Issue**: XP amounts don't match expected values

**Solutions:**
1. ✅ Verify XP conversion rate setting
2. ✅ Check distribution mode matches rewarded places
3. ✅ Confirm all player points were counted
4. ✅ Check for rounding in calculations

### Distribution Doesn't Match Mode

**Issue**: Wrong number of players rewarded

**Solutions:**
1. ✅ Ensure `xpRewardedPlaces` ≤ distribution mode maximum
2. ✅ Verify enough players participated
3. ✅ Check if players had 0 points (not rewarded)

## API Reference

### Socket Events

#### Emitted: `pyramid:xp-awards`
```javascript
{
  rewards: [
    {
      userId: 'user123',
      username: 'alice_123',
      nickname: 'Alice',
      xp: 2400,
      place: 1,
      percentage: 40,
      points: 1000
    }
  ],
  source: 'pyramid-mode',
  timestamp: 1705352445000
}
```

#### Emitted: `pyramid:round-ended`
```javascript
{
  matchId: 42,
  winner: { userId: '123', ... },
  leaderboard: [...],
  totalPlayers: 15,
  totalDuration: 180,
  xpRewards: [...]  // Array of XP awards
}
```

### Configuration API

#### GET `/api/plugins/coinbattle/pyramid/config`
Returns current pyramid configuration including XP settings.

#### POST `/api/plugins/coinbattle/pyramid/config`
Updates pyramid configuration.

**Payload:**
```json
{
  "enabled": true,
  "xpRewardsEnabled": true,
  "xpDistributionMode": "top3",
  "xpConversionRate": 1.5,
  "xpRewardedPlaces": 3
}
```

## Best Practices

### 🎯 Choosing Distribution Mode

**Winner Takes All:**
- ✅ Short, intense rounds
- ✅ High-stakes tournaments
- ✅ Clear single winner focus

**Top 3:**
- ✅ Standard competition format
- ✅ Medium-sized viewer base
- ✅ Balanced rewards

**Top 5:**
- ✅ Larger viewer participation
- ✅ Encouraging broader engagement
- ✅ Multiple tiers of rewards

**Top 10:**
- ✅ Very large pyramid rounds
- ✅ Maximum participation rewards
- ✅ Community-focused events

### 💰 Setting Conversion Rates

**Low (0.1 - 0.5):**
- Slower XP progression
- Long-term engagement focus
- High-value XP points

**Normal (1.0):**
- Balanced progression
- 1:1 point-to-XP ratio
- Standard for most streams

**High (1.5 - 3.0):**
- Faster progression
- Special events/promotions
- Generous rewards

**Very High (3.0+):**
- Double/Triple XP events
- Limited-time promotions
- Viewer growth campaigns

### 📊 Monitoring Performance

Track these metrics:
- Average XP awarded per round
- XP distribution across places
- Player retention after XP implementation
- Level-up frequency changes

## Future Enhancements

Planned features:
- 🔮 Custom distribution percentages
- 🔮 Minimum points threshold for rewards
- 🔮 XP multipliers for specific conditions
- 🔮 Integration with other reward systems
- 🔮 Historical XP awards analytics

## Support

For issues or questions:
1. Check server logs for error messages
2. Verify viewer-xp plugin is running
3. Test with simple configuration first
4. Report bugs with reproduction steps

---

**Version:** 1.0.0  
**Last Updated:** 2024-01-15  
**Plugin:** CoinBattle Pyramid Mode  
**Requires:** Viewer XP System v1.0+
