# 🎮 CoinBattle Plugin

**Live battle game module for TikTool** where viewers compete by sending TikTok gifts to collect coins and climb the leaderboard.

## 📋 Features

### Core Gameplay
- ✅ **Solo & Team Modes** - Individual competition or Red vs Blue team battles
- ✅ **Real-time Leaderboard** - Live rankings with animated position changes
- ✅ **Match Timer** - Configurable countdown with visual indicators
- ✅ **Auto-Start** - Automatically begin matches when first gift is received
- ✅ **Auto-Reset** - Restart matches automatically after completion
- ✅ **Auto-Extension** - Extend matches automatically when score is close

### Advanced Features
- ✨ **Multiplier Events** - Activate 2x, 3x, or custom coin multipliers for limited time
- 👥 **Team Battle System** - Red vs Blue teams with automatic or manual assignment
- 📊 **Historical Rankings** - Track all matches and player performance over time
- 🌍 **Lifetime Leaderboard** - Cross-stream player statistics and achievements
- 🏅 **Badges & Titles** - Award system for achievements (Top Donator, Legend, Champion, etc.)
- 🎪 **Offline Simulation** - Test layouts and animations without TikTok connection

### Themes & Customization
- 🎨 **4 Themes** - Dark, Light, Neon, Minimal
- 🎭 **3 Skins** - Gold, Futuristic, Retro
- 📐 **2 Layouts** - Fullscreen and Compact
- 🖼️ **Profile Pictures** - Display user avatars with caching
- 🏷️ **Badge Display** - Show earned achievements in overlay
- 🎬 **Smooth Animations** - Position changes, gift effects, winner reveals
- 🔧 **Performance Mode** - Toaster mode for low-end systems
- 🌐 **Multilingual** - German and English support

### Overlay Features
- 📺 **OBS Browser Source** - Transparent overlay for streaming
- ⏱️ **Animated Timer** - Circular progress indicator
- 🎯 **Dynamic Leaderboard** - Top 10 players with real-time updates
- 👑 **Winner Reveal** - Celebration animation with confetti
- 💫 **Gift Particles** - Visual effects when gifts are sent
- 🎉 **Achievement Popups** - Badge unlock notifications

## 📦 Installation

The plugin is already included in TikTool. Simply enable it in the plugin manager:

1. Open TikTool admin panel
2. Navigate to Plugins
3. Find "CoinBattle" and enable it
4. Configure settings in the CoinBattle admin panel

## 🎯 Quick Start

### 1. Basic Setup

1. **Open Admin Panel**: Navigate to `/plugins/coinbattle/ui.html`
2. **Configure Match Settings**:
   - Match Duration: Set how long matches should last (default: 5 minutes)
   - Mode: Choose Solo or Team battle
   - Enable auto-start to begin matches automatically

3. **Add Overlay to OBS**:
   - Copy the overlay URL from settings tab
   - Add as Browser Source in OBS (1920x1080)
   - Make sure to check "Shutdown source when not visible" and "Refresh browser when scene becomes active"

### 2. Starting a Match

**Manual Start:**
```
Click "Start Match" button in admin panel
```

**Auto-Start:**
```
Enable "Auto-start on first gift" in settings
Match begins automatically when viewer sends first gift
```

### 3. Team Mode Setup

1. Set mode to "Team"
2. Choose team assignment method:
   - **Random**: Players randomly assigned to red or blue
   - **Alternate**: Balanced assignment based on join order
   - **Manual**: Manually assign players to teams

## ⚙️ Configuration

### Match Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Match Duration | Match length in seconds | 300 (5 min) |
| Auto-Start | Start match on first gift | Disabled |
| Auto-Reset | Reset after match ends | Enabled |
| Auto-Extension | Extend close matches | Enabled |
| Extension Threshold | Coin difference to trigger extension | 15 |
| Extension Duration | How long to extend | 60s |

### Team Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Team Assignment | How to assign teams | Random |

### Display Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Theme | Visual theme | Dark |
| Skin | Leaderboard style | Gold |
| Layout | Fullscreen or Compact | Fullscreen |
| Font Size | Text size | 16px |
| Show Avatars | Display profile pictures | Enabled |
| Show Badges | Display achievements | Enabled |
| Toaster Mode | Performance mode | Disabled |

## 🎮 Usage Guide

### Admin Controls

**Control Tab:**
- View current match status
- Start/End matches manually
- Pause/Resume active matches
- Extend match duration
- Activate multiplier events
- Start/Stop offline simulation

**Settings Tab:**
- Configure gameplay rules
- Customize visual appearance
- Set team mode preferences
- Copy overlay URL

**Leaderboard Tab:**
- View lifetime rankings
- See top players across all streams

**History Tab:**
- Browse past matches
- Export match data (JSON)

### Multiplier Events

Activate bonus coin periods to create excitement:

1. Click "Activate 2x Multiplier (30s)" during active match
2. All coins received are doubled for 30 seconds
3. Visual indicator shows in overlay
4. Configurable multiplier value and duration via API

### Badge System

Players automatically earn badges based on achievements:

- **Top Donator** 👑 - Win a match
- **Legend** ⭐ - Win 10 matches
- **Supporter** 💎 - Play 5 matches
- **Team Player** 🤝 - Win 5 team matches
- **Coin Master** 🪙 - Collect 10,000 lifetime coins
- **Generous** 🎁 - Send 100 gifts
- **Champion** 🏆 - Win 3 matches in a row
- **Veteran** 🎖️ - Play 20 matches

## 🔌 API Endpoints

### Match Control

```javascript
// Start match
POST /api/plugins/coinbattle/match/start
Body: { mode: 'solo'|'team', duration: 300 }

// End match
POST /api/plugins/coinbattle/match/end

// Pause match
POST /api/plugins/coinbattle/match/pause

// Resume match
POST /api/plugins/coinbattle/match/resume

// Extend match
POST /api/plugins/coinbattle/match/extend
Body: { seconds: 60 }
```

### Multiplier

```javascript
// Activate multiplier
POST /api/plugins/coinbattle/multiplier/activate
Body: { multiplier: 2.0, duration: 30, activatedBy: 'admin' }
```

### Data Retrieval

```javascript
// Get current state
GET /api/plugins/coinbattle/state

// Get lifetime leaderboard
GET /api/plugins/coinbattle/leaderboard/lifetime?limit=20

// Get match history
GET /api/plugins/coinbattle/history?limit=20&offset=0

// Get player stats
GET /api/plugins/coinbattle/player/:userId

// Export match data
GET /api/plugins/coinbattle/export/:matchId
```

### Configuration

```javascript
// Get config
GET /api/plugins/coinbattle/config

// Update config
POST /api/plugins/coinbattle/config
Body: { /* config object */ }
```

### Simulation

```javascript
// Start offline simulation
POST /api/plugins/coinbattle/simulation/start

// Stop simulation
POST /api/plugins/coinbattle/simulation/stop
```

## 📡 Socket Events

### Server → Client

```javascript
// Match state update
socket.on('coinbattle:match-state', (state) => { ... });

// Timer update (every second)
socket.on('coinbattle:timer-update', (data) => { ... });

// Leaderboard update
socket.on('coinbattle:leaderboard-update', (data) => { ... });

// Match ended
socket.on('coinbattle:match-ended', (data) => { ... });

// Multiplier activated
socket.on('coinbattle:multiplier-activated', (data) => { ... });

// Gift received
socket.on('coinbattle:gift-received', (data) => { ... });

// Badges awarded
socket.on('coinbattle:badges-awarded', (data) => { ... });
```

### Client → Server

```javascript
// Request current state
socket.emit('coinbattle:get-state');

// Request leaderboard update
socket.emit('coinbattle:get-leaderboard');

// Assign team manually
socket.emit('coinbattle:assign-team', { userId, team });
```

## 🎨 Customization

### URL Parameters for Overlay

Customize overlay appearance via URL parameters:

```
/plugins/coinbattle/overlay?theme=dark&skin=gold&layout=fullscreen
```

Parameters:
- `theme` - dark, light, neon, minimal
- `skin` - gold, futuristic, retro
- `layout` - fullscreen, compact
- `showAvatars` - true, false
- `showBadges` - true, false
- `toasterMode` - true, false

### Custom CSS

Advanced users can inject custom CSS through the settings panel for complete visual control.

## 🔧 Troubleshooting

### Overlay not showing in OBS
- Verify Browser Source URL is correct
- Check browser source dimensions (1920x1080)
- Enable "Shutdown source when not visible"
- Click "Refresh cache of current page" in OBS

### Match not starting automatically
- Verify "Auto-start on first gift" is enabled
- Check that TikTok connection is active
- Ensure gifts are being received (check TikTok events)

### Performance issues
- Enable "Toaster Mode" in settings
- Disable avatars and badges
- Use Compact layout
- Choose Minimal theme

### Leaderboard not updating
- Check Socket.io connection in browser console
- Verify TikTok events are being received
- Refresh overlay browser source

## 📊 Database Schema

The plugin creates several database tables:

- `coinbattle_matches` - Match data
- `coinbattle_players` - Player lifetime stats
- `coinbattle_match_participants` - Match participants
- `coinbattle_gift_events` - Gift event log
- `coinbattle_badges` - Badge definitions
- `coinbattle_player_badges` - Earned badges
- `coinbattle_multiplier_events` - Multiplier event log

## 🔐 Security

- All database operations use prepared statements
- Input validation on all API endpoints
- Rate limiting applied to prevent abuse
- No sensitive data exposed in overlay

## 📝 License

This plugin is part of TikTool and follows the same license: **CC-BY-NC-4.0**

## 👨‍💻 Development

### File Structure

```
coinbattle/
├── plugin.json           # Plugin metadata
├── main.js              # Main plugin class
├── ui.html              # Admin panel UI
├── ui.js                # Admin panel JavaScript
├── backend/
│   └── database.js      # Database operations
├── engine/
│   └── game-engine.js   # Game logic and state
├── overlay/
│   ├── overlay.html     # OBS overlay
│   ├── overlay.js       # Overlay JavaScript
│   └── styles.css       # Overlay styles
├── locales/
│   ├── de.json          # German translations
│   └── en.json          # English translations
└── README.md            # This file
```

### Adding New Features

1. Update database schema in `backend/database.js`
2. Add game logic to `engine/game-engine.js`
3. Expose API endpoints in `main.js`
4. Update admin UI in `ui.html` and `ui.js`
5. Update overlay in `overlay/` files
6. Add translations to locale files

## 🤝 Support

For issues, feature requests, or contributions:
- Check TikTool documentation
- Review plugin code and comments
- Test with offline simulation mode

## 🎉 Credits

Developed by **Pup Cid** for TikTool

---

**Enjoy your CoinBattle matches! 🎮🏆**
