# Leaderboard Plugin

A real-time leaderboard plugin for "Pup Cid's Little TikTok Helper" that tracks top gifters for both the current session and all-time.

## Features

- **Dual Tracking**: 
  - **Session Leaderboard**: In-memory tracking of top gifters for the current streaming session
  - **All-Time Leaderboard**: Persistent database storage for historical top contributors
  
- **5 Theme Designs**: Choose from multiple visual styles for your overlay:
  - **Neon/Cyberpunk**: Cyan & magenta with glowing effects (default)
  - **Elegant/Minimalist**: Clean white/gray aesthetic
  - **Gaming/Esports**: Bold red/orange energy theme
  - **Royal/Crown**: Purple & gold regal theme with sparkles
  - **Modern Gradient**: Vibrant blue/teal gradients

- **Preview/Test Mode**: Test overlay designs with mock data before going live
- **Enhanced Animations**: 
  - Special overtake animations when someone moves up in rank
  - Crown (👑) for #1, medals for #2-3 (🥈🥉)
  - Rank-up celebration effects for big jumps
  
- **Real-Time Updates**: WebSocket-based live updates to the overlay
- **Performance Optimized**: Debounced database writes (5-second delay) to minimize disk I/O during gift spam
- **Robust Data Handling**: Protection against undefined values in gift payloads
- **Dynamic User Updates**: Automatically updates nicknames and profile pictures when users change them
- **Session Management**: Admin command to reset the current session
- **OBS Compatible**: Transparent background perfect for OBS Browser Source

## Installation

The plugin is automatically loaded when the server starts. No manual installation required.

## Usage

### Configuration Panel

Access the configuration panel at: `http://localhost:3000/leaderboard/ui`

Features:
- View current session and all-time leaderboards
- Configure display settings (limit, minimum coins)
- **Select overlay theme** from 5 different designs
- Toggle overtake animations on/off
- **Preview overlay** with test data
- Reset session data

### OBS Overlay Setup

1. Open OBS Studio
2. Add a new **Browser Source**
3. Set the URL to: `http://localhost:3000/leaderboard/overlay`
4. Set dimensions to: **450x800** (or adjust to your preference)
5. Check "Shutdown source when not visible" for better performance
6. Click OK

### Testing/Preview Mode

To preview different themes with mock data:
1. Go to `http://localhost:3000/leaderboard/ui`
2. Select a theme from the dropdown
3. Click "Preview Overlay" button
4. A new window will open showing the overlay with animated test data
5. Watch the simulated rank changes to see overtake animations

Alternatively, access preview mode directly:
```
http://localhost:3000/leaderboard/overlay?preview=true&theme=neon
```

Replace `neon` with: `elegant`, `gaming`, `royal`, or `gradient`

### Overlay Features

The overlay has two tabs that can be switched manually:
- **🔥 Current Session**: Shows top gifters for the current streaming session
- **👑 All Time Champions**: Shows the all-time top contributors

## Theme Customization

### Available Themes

1. **Neon/Cyberpunk** (`neon`)
   - Colors: Cyan & Magenta
   - Style: Dark background with glowing neon effects
   - Best for: Futuristic/tech streams

2. **Elegant/Minimalist** (`elegant`)
   - Colors: White & Gray
   - Style: Clean, professional look
   - Best for: Professional/business streams

3. **Gaming/Esports** (`gaming`)
   - Colors: Red & Orange
   - Style: Bold, energetic design
   - Best for: Gaming streams

4. **Royal/Crown** (`royal`)
   - Colors: Purple & Gold
   - Style: Regal with sparkle effects
   - Best for: Luxury/prestige themes

5. **Modern Gradient** (`gradient`)
   - Colors: Blue & Teal
   - Style: Smooth gradients and modern design
   - Best for: Contemporary/artistic streams

### Selecting a Theme

**Method 1: Configuration Panel** (Recommended)
1. Go to `http://localhost:3000/leaderboard/ui`
2. Navigate to the "Settings" tab
3. Select your preferred theme from the "Overlay Theme" dropdown
4. Click "Save Settings"

**Method 2: URL Parameter** (For testing)
```
http://localhost:3000/leaderboard/overlay?theme=royal
```

### API Endpoints

#### Get Session Leaderboard
```
GET /api/plugins/leaderboard/session?limit=10
```
Returns the top gifters for the current session.

#### Get All-Time Leaderboard
```
GET /api/plugins/leaderboard/alltime?limit=10&minCoins=0
```
Returns the all-time top gifters.

#### Get Combined Data
```
GET /api/plugins/leaderboard/combined?limit=10
```
Returns both session and all-time leaderboards in a single response.

#### Get Test/Preview Data
```
GET /api/plugins/leaderboard/test-data
```
Returns mock leaderboard data for testing and preview purposes.

#### Get User Stats
```
GET /api/plugins/leaderboard/user/:userId
```
Returns statistics for a specific user (both session and all-time).

#### Reset Session
```
POST /api/plugins/leaderboard/reset-session
```
Clears the current session data. All-time data remains intact.

#### Get Configuration
```
GET /api/plugins/leaderboard/config
```
Returns the current plugin configuration.

#### Update Configuration
```
POST /api/plugins/leaderboard/config
Content-Type: application/json

{
  "top_count": 10,
  "min_coins_to_show": 0,
  "theme": "neon",
  "show_animations": 1
}
```

**New Configuration Options:**
- `theme`: Choose from `neon`, `elegant`, `gaming`, `royal`, or `gradient`
- `show_animations`: Enable (1) or disable (0) overtake animations

## Configuration

The plugin stores configuration in the database:
- `top_count`: Maximum number of entries to display (default: 10)
- `min_coins_to_show`: Minimum coins required to appear on leaderboard (default: 0)
- `theme`: Visual theme for the overlay (default: 'neon')
- `show_animations`: Enable/disable overtake animations (default: 1/enabled)

## Database Schema

### leaderboard_alltime
Stores all-time gifter data:
- `user_id` (PRIMARY KEY): Unique user identifier
- `nickname`: User's display name
- `unique_id`: User's unique handle
- `profile_picture_url`: URL to profile picture
- `total_coins`: Total coins gifted all-time
- `last_gift_at`: Timestamp of last gift
- `created_at`: First appearance timestamp
- `updated_at`: Last update timestamp

### leaderboard_config
Stores plugin configuration:
- `session_start_time`: When the current session started
- `top_count`: Max entries to display
- `min_coins_to_show`: Minimum coins filter

## WebSocket Events

### Emitted Events
- `leaderboard:update`: Sent when leaderboard data changes
  ```javascript
  {
    session: { data: [...], startTime: "..." },
    alltime: { data: [...] }
  }
  ```
- `leaderboard:session-reset`: Sent when session is reset

### Client Events
- `leaderboard:request-update`: Request current leaderboard data
- `leaderboard:reset-session`: Request session reset (admin only)

## Technical Details

### Performance
- **Debounced Writes**: Database writes are batched and delayed by 5 seconds to prevent excessive I/O during gift spam
- **Prepared Statements**: Reusable prepared statements for optimal database performance
- **Indexed Queries**: Database indexes on `total_coins` for fast sorting

### Security
- **XSS Protection**: All user inputs are HTML-escaped before rendering
- **URL Validation**: Profile picture URLs are validated before display
- **Input Sanitization**: Null/undefined values are handled gracefully
- **SQL Injection Protection**: All queries use parameterized statements

### Data Flow
1. TikTok sends gift event
2. Plugin receives gift data via TikTok event handler
3. Session data is updated in-memory immediately
4. All-time data is queued for database write (debounced)
5. WebSocket update is emitted to all connected clients
6. Overlay receives update and re-renders with animations

## Customization

### Styling Themes

The plugin now includes 5 pre-built themes located in `/plugins/leaderboard/public/themes/`:
- `neon.css` - Cyberpunk cyan/magenta theme
- `elegant.css` - Minimalist white/gray theme
- `gaming.css` - Esports red/orange theme
- `royal.css` - Regal purple/gold theme
- `gradient.css` - Modern blue/teal gradient theme

To create a custom theme:
1. Copy one of the existing theme files
2. Modify colors, backgrounds, and effects
3. Save with a new name (e.g., `mytheme.css`)
4. Add the theme to the theme selector in `ui.html`

### Animations

**Overtake Animations** (can be toggled via config):
- `rank-up`: Smooth shake animation when moving up
- `rank-up-big`: Enhanced celebration for jumping 2+ ranks
- `rank-down`: Fade effect when moving down
- `new-entry`: Slide-in animation for new entries

**Special Effects**:
- Crown (👑) automatically displayed for rank #1
- Medal icons (🥈🥉) for ranks #2 and #3
- Sparkle effects on royal theme for top 3

### Auto-Rotation
Enable automatic tab rotation in `script.js`:
```javascript
this.enableAutoRotate = true; // Set to true in constructor
```
Tabs will rotate every 30 seconds.

## Troubleshooting

### Overlay not showing data
1. Check if server is running: `http://localhost:3000`
2. Verify plugin is loaded in server logs
3. Check browser console for WebSocket connection errors
4. Ensure database is writable

### Data not persisting
1. Check database file permissions
2. Verify debounce timeout completed (wait 5 seconds after last gift)
3. Check server logs for database errors

### Performance issues
1. Reduce `top_count` to show fewer entries
2. Increase `debounceDelay` in db.js for less frequent writes
3. Set `min_coins_to_show` to filter out small contributors
4. Disable animations via `show_animations: 0` in config

### Theme not loading
1. Check browser console for CSS loading errors
2. Verify theme name matches available themes
3. Clear browser cache and refresh
4. Ensure theme file exists in `/plugins/leaderboard/public/themes/`

## Version History

- **v1.1.0** (2025-11-24)
  - Added 5 theme designs (neon, elegant, gaming, royal, gradient)
  - Implemented preview/test mode with mock data
  - Enhanced overtake animations (rank-up, rank-up-big)
  - Added crown and medal icons for top 3
  - Theme selection in configuration UI
  - Animation toggle option
  
- **v1.0.0** (2025-11-23)
  - Initial release
  - Session and all-time tracking
  - Real-time WebSocket updates
  - Debounced database writes
  - Modern neon/dark theme overlay
  - Security hardening (XSS protection, input validation)

## Credits

Created for "Pup Cid's Little TikTok Helper"
Author: Pup Cid
