# Leaderboard Plugin

A real-time leaderboard plugin for "Pup Cid's Little TikTool Helper" that tracks top gifters for both the current session and all-time.

## Features

- **Dual Tracking**: 
  - **Session Leaderboard**: In-memory tracking of top gifters for the current streaming session
  - **All-Time Leaderboard**: Persistent database storage for historical top contributors
  
- **Multiple Overlay Layouts**: 
  - **Original Overlay**: Tabbed view with session and all-time tabs
  - **Bar Layout**: Horizontal bar for top/bottom of stream (80px height)
  - **Sidebar Layout**: Vertical sidebar for right side of stream (400x1080)
  - **Popup Layout**: Temporary popup for highlights and special events
  
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
  - Hype mode visual effects
  
- **Real-Time Updates**: WebSocket-based live updates to all overlays
- **Performance Optimized**: Debounced database writes (5-second delay) to minimize disk I/O during gift spam
- **Robust Data Handling**: Protection against undefined values in gift payloads
- **Dynamic User Updates**: Automatically updates nicknames and profile pictures when users change them
- **Session Management**: Admin command to reset the current session
- **OBS Compatible**: Transparent background perfect for OBS Browser Source
- **Configurable**: Query parameters for extensive customization

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

#### Original Overlay (Tabbed View)

1. Open OBS Studio
2. Add a new **Browser Source**
3. Set the URL to: `http://localhost:3000/leaderboard/overlay`
4. Set dimensions to: **450x800** (or adjust to your preference)
5. Check "Shutdown source when not visible" for better performance
6. Click OK

#### Bar Overlay (Horizontal)

Perfect for top or bottom of stream.

1. Add a new **Browser Source** in OBS
2. Set the URL to: `http://localhost:3000/leaderboard/overlays/bar?theme=neon&maxEntries=5`
3. Set dimensions to: **1920x80** (full width, 80px height)
4. Position at top or bottom of your scene
5. Customize with query parameters:
   - `theme`: neon, elegant, gaming, royal, gradient
   - `maxEntries`: Number of entries to show (default: 5)
   - `showAvatars`: true/false (default: true)
   - `animationIntensity`: off, low, high (default: high)

Example URL:
```
http://localhost:3000/leaderboard/overlays/bar?theme=gaming&maxEntries=3&showAvatars=true
```

#### Sidebar Overlay (Vertical)

Perfect for right side of stream.

1. Add a new **Browser Source** in OBS
2. Set the URL to: `http://localhost:3000/leaderboard/overlays/sidebar?theme=neon&maxEntries=10`
3. Set dimensions to: **400x1080** (standard sidebar size)
4. Position on right side of your scene
5. Customize with query parameters:
   - `theme`: neon, elegant, gaming, royal, gradient
   - `maxEntries`: Number of entries to show (default: 10)
   - `showAvatars`: true/false (default: true)
   - `showProgress`: true/false - show progress bars (default: true)
   - `animationIntensity`: off, low, high (default: high)

Example URL:
```
http://localhost:3000/leaderboard/overlays/sidebar?theme=royal&maxEntries=8&showProgress=true
```

#### Popup Overlay (Temporary Highlights)

Shows temporarily during special events or rank changes.

1. Add a new **Browser Source** in OBS
2. Set the URL to: `http://localhost:3000/leaderboard/overlays/popup?theme=neon&maxEntries=5&autoHide=true`
3. Set dimensions to: **600x700** (or adjust to preference)
4. Center on your scene
5. Customize with query parameters:
   - `theme`: neon, elegant, gaming, royal, gradient
   - `maxEntries`: Number of entries to show (default: 5)
   - `showAvatars`: true/false (default: true)
   - `autoHide`: true/false - auto-hide after delay (default: true)
   - `hideDelay`: Milliseconds before hiding (default: 10000)
   - `showOnHype`: true/false - show during hype events (default: true)

Example URL:
```
http://localhost:3000/leaderboard/overlays/popup?theme=gradient&maxEntries=5&autoHide=true&hideDelay=15000
```

The popup automatically shows when:
- Rank changes occur (someone overtakes another)
- Hype mode is triggered
- After hiding, it will reappear on new significant changes

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

#### Trigger Hype Mode (NEW)
```
POST /api/plugins/leaderboard/hype-start
```
Manually trigger hype mode. This emits a `leaderboard:hypeStart` event to all overlays, which can trigger special visual effects.

```
POST /api/plugins/leaderboard/hype-end
```
Manually end hype mode. This emits a `leaderboard:hypeEnd` event to all overlays.

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

### Emitted Events (Server → Client)

#### `leaderboard:update`
Sent when leaderboard data changes (new gifts, rank changes).
```javascript
{
  session: {
    data: [/* LeaderboardEntry[] */],
    startTime: "2025-12-03T22:00:00.000Z"
  },
  alltime: {
    data: [/* LeaderboardEntry[] */]
  }
}
```

#### `leaderboard:session-reset` (NEW)
Sent when session is reset.
```javascript
{
  timestamp: "2025-12-03T23:00:00.000Z"
}
```

#### `leaderboard:hypeStart` (NEW)
Signals start of hype phase. Overlays can respond with special visual effects.
```javascript
{
  timestamp: "2025-12-03T23:00:00.000Z"
}
```

#### `leaderboard:hypeEnd` (NEW)
Signals end of hype phase.
```javascript
{
  timestamp: "2025-12-03T23:05:00.000Z"
}
```

### Client Events (Client → Server)

#### `leaderboard:request-update`
Request current leaderboard data. Server responds with `leaderboard:update` event.

#### `leaderboard:reset-session`
Request session reset (admin only). Server responds with `leaderboard:session-reset` event.

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

- **v1.2.0** (2025-12-03)
  - **NEW: Multiple Overlay Layouts**
    - Bar layout: Horizontal bar for top/bottom of stream
    - Sidebar layout: Vertical sidebar (400x1080) for right side
    - Popup layout: Temporary popup for highlights and events
  - **NEW: Hype Mode System**
    - `leaderboard:hypeStart` and `leaderboard:hypeEnd` WebSocket events
    - API endpoints to manually trigger hype mode
    - Visual effects during hype phase
  - **NEW: Extensive Query Parameter Support**
    - Configure overlays via URL parameters
    - Theme selection, max entries, show/hide options
    - Animation intensity control
  - **NEW: Auto-Hide Popup**
    - Popup automatically shows on rank changes
    - Configurable auto-hide delay
    - Manual trigger via hype events
  - **NEW: Progress Bars** (sidebar layout)
    - Visual progress relative to #1 gifter
    - Percentage display
  - **Enhanced Documentation**
    - Type definitions (types.js)
    - Comprehensive API documentation
    - Query parameter reference
  
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

Created for "Pup Cid's Little TikTool Helper"
Author: Pup Cid
