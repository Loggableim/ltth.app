# Viewer Profiles Plugin - Quick Start Guide

## 🚀 Getting Started

### 1. Enable the Plugin

1. Open LTTH Admin Panel
2. Navigate to **Plugins** section
3. Find **Viewer Profiles** plugin
4. Click **Enable**
5. Wait for initialization message

### 2. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000/viewer-profiles/ui
```

### 3. Start Collecting Data

Once enabled, the plugin will automatically:
- ✅ Track all viewer interactions
- ✅ Record gifts and coins
- ✅ Monitor watchtime
- ✅ Log comments, likes, and shares
- ✅ Build activity heatmaps

No configuration needed - it works out of the box!

## 📊 Dashboard Features

### Main View
- **Stats Cards**: Quick overview of total viewers, revenue, watchtime, VIPs
- **Search & Filter**: Find viewers by username or filter by VIP/Active/Favorites
- **Sort Options**: Sort by coins, watchtime, visits, or last seen
- **Birthday Widget**: See upcoming birthdays at a glance

### Viewer Details
Click any viewer row to open detailed profile:
- Complete statistics (visits, watchtime, coins, gifts, comments)
- Top 5 gifts sent
- Activity heatmap (when they're most active)
- Custom settings (TTS voice, Discord, birthday, notes)
- Favorite toggle
- VIP badge (if applicable)

## 🏆 VIP System

### Automatic Promotion

VIP tiers are assigned automatically based on:

| Tier | Coins Required | Watchtime | Visits |
|------|---------------|-----------|--------|
| 🥉 Bronze | 1,000 | 5 hours | 10 |
| 🥈 Silver | 5,000 | 20 hours | 25 |
| 🥇 Gold | 20,000 | 50 hours | 50 |
| 💎 Platinum | 100,000 | 200 hours | 100 |

### Manual VIP Assignment

1. Open viewer detail modal
2. Click viewer username
3. Use API endpoint or modify directly in database

## 🎂 Birthday System

### Setting Birthdays

1. Open viewer detail modal
2. Enter birthday in format: `YYYY-MM-DD`
3. Click **Save Changes**

### Birthday Notifications

- **Dashboard Widget**: Shows upcoming birthdays (7 days ahead)
- **Live Alerts**: When birthday viewer joins stream
- **Daily Check**: Runs automatically at midnight

## 📈 Analytics

### Leaderboards

Access via API:
```
GET /api/viewer-profiles/leaderboard?type=coins&limit=10
```

Types: `coins`, `watchtime`, `visits`, `gifts`, `comments`

### Heatmaps

- **Per Viewer**: Shows when specific viewer is most active
- **Global**: Shows peak stream times across all viewers
- **7x24 Grid**: Days of week × Hours of day

### Export Data

Click **Export CSV** button to download:
- All viewers (or filtered by VIP/Active)
- Complete profile data
- GDPR-compliant format

## 🔌 API Integration

### Get Viewer Profile
```javascript
GET /api/viewer-profiles/username123
```

### Update Viewer
```javascript
PATCH /api/viewer-profiles/username123
Body: {
  "tts_voice": "german-female",
  "birthday": "1995-06-15",
  "notes": "Regular supporter",
  "is_favorite": true
}
```

### Set VIP
```javascript
POST /api/viewer-profiles/username123/vip
Body: { "tier": "Gold" }
```

### Get Statistics
```javascript
GET /api/viewer-profiles/stats/summary
```

### Export Data
```javascript
GET /api/viewer-profiles/export?format=csv&filter=vip
```

## 🎯 Use Cases

### 1. Reward Top Supporters
- Check leaderboard for top coin spenders
- Manually promote to VIP
- Thank them publicly during stream

### 2. Birthday Celebrations
- Set birthdays for regulars
- Get notified when they join on their birthday
- Celebrate with special shoutout or gift

### 3. Community Management
- Track viewer engagement patterns
- Identify most active times
- Plan stream schedule accordingly

### 4. Personalization
- Set custom TTS voices for VIPs
- Add personal notes about viewers
- Mark favorites for quick access

### 5. Data Analysis
- Export data for external analysis
- Track growth over time
- Identify trends and patterns

## ⚙️ Configuration

### Default VIP Tiers

Edit in database or modify `backend/database.js`:
```javascript
{
  tier_name: 'Bronze',
  min_coins_spent: 1000,
  min_watchtime_hours: 5,
  min_visits: 10,
  badge_color: '#CD7F32'
}
```

### Session Timeout

Default: 5 minutes (300 seconds)

Sessions auto-end when:
- Stream ends
- No activity for timeout period
- Manual session end

### Birthday Notifications

Default: Enabled, 7 days ahead

Modify in `main.js`:
```javascript
this.config = {
  birthdayReminder: true,
  autoVipPromotion: true,
  // ...
}
```

## 🐛 Troubleshooting

### No Data Appearing
- ✅ Check plugin is enabled
- ✅ Verify TikTok LIVE Connector is connected
- ✅ Check browser console for errors
- ✅ Check server logs in `app/logs/`

### VIP Not Auto-Promoting
- ✅ Verify viewer meets ALL requirements (coins + watchtime + visits)
- ✅ Check `autoVipPromotion` config is enabled
- ✅ Review VIP tier thresholds

### Sessions Not Tracking
- ✅ Sessions start on first interaction (chat, gift, etc.)
- ✅ Heartbeat runs every 60 seconds
- ✅ Sessions end on stream end or timeout

### Export Not Working
- ✅ Check file download permissions
- ✅ Try different browser
- ✅ Check server logs for errors

## 📚 Additional Resources

- **Full Documentation**: See `README.md`
- **API Reference**: All endpoints documented in README
- **Test Suite**: Run `node test.js` to verify functionality
- **Support**: Check plugin logs and server console

## 🎉 Tips & Tricks

1. **Use Favorites**: Mark your regulars as favorites for quick filtering
2. **Set Birthdays Early**: Add birthdays as you get to know viewers
3. **Export Regularly**: Back up your viewer data periodically
4. **Check Heatmaps**: Optimize stream schedule based on peak times
5. **Review Leaderboards**: Recognize and reward top supporters
6. **Custom Notes**: Add personal touches (favorite games, preferences, etc.)

## 🔐 Privacy & Security

- All data stored locally in SQLite
- No external data transmission
- GDPR-compliant export functionality
- Viewers can request data deletion
- No sensitive data collection without consent

---

**Ready to start tracking your amazing community? Enable the plugin and watch the insights roll in! 🎭✨**
