# ClarityHUD Plugin

Ultra-minimalistic, VR-optimized and accessible HUD overlays for TikTok live streams.

## Features

### Two Fixed Overlay URLs

1. **Chat-Only HUD** (`/overlay/clarity/chat`)
   - Ultra-readable chat panel with very large font
   - High contrast design optimized for VR
   - Shows: Username + Message + Optional Timestamps
   - Minimal design without logos or decorations

2. **Full Activity HUD** (`/overlay/clarity/full`)
   - Displays all TikTok events: Chat, Follows, Shares, Gifts, Subs, Treasure Chests, Joins
   - Each event type individually toggleable
   - Three layout modes: Single Stream, Structured, Adaptive

### Layout Modes (Full HUD)

- **singleStream**: Unified event feed with all events in one list
- **structured**: Events grouped in separate blocks with headings
- **adaptive**: Automatic grouping with dynamic 1-3 column layout

### Accessibility Features

- **Day/Night Mode**: Toggle between light and dark themes
- **High Contrast Mode**: Increased contrast ratios for better visibility
- **Colorblind Safe Mode**: Adjusted color schemes (protanopia/deuteranopia friendly)
- **Vision Impaired Mode**: Enhanced text rendering, larger fonts
- **Reduce Motion**: Minimal animations for motion sensitivity
- **Dyslexia Font**: OpenDyslexic font toggle
- **Accessibility Presets**: One-click application of common configurations

### Customization Options

#### Chat HUD Settings
- Font: size, family, color, line height, letter spacing
- Background color and transparency
- Text outline thickness and color
- Alignment (left/center)
- Timestamps toggle
- Max lines limit
- Word wrapping
- Accessibility options

#### Full HUD Settings
- All Chat HUD settings
- Event type toggles (show/hide each event type)
- Layout mode selection
- Feed direction (newest top/bottom)
- Animation types (fade, slide, pop, zoom, none)
- Animation speed (slow, medium, fast)

## Installation

1. The plugin is located in `plugins/clarityhud/`
2. Enable the plugin through the dashboard
3. Access the settings UI at `/clarityhud/ui`

## Usage

### Adding to OBS

1. Add Browser Source in OBS
2. Use one of the URLs:
   - Chat: `http://localhost:PORT/overlay/clarity/chat`
   - Full: `http://localhost:PORT/overlay/clarity/full`
3. Recommended resolution: 1920x1080 or higher for VR
4. Enable browser source hardware acceleration

### Configuring Settings

1. Navigate to `/clarityhud/ui` in your browser
2. Select the HUD you want to configure
3. Click "Settings" to open the configuration dialog
4. Adjust settings in the tabbed interface
5. Use "Test Event" to preview changes
6. Click "Save" to apply settings

### Quick Accessibility Presets

Use the preset buttons for instant configuration:
- **High Contrast**: Maximum readability with white on black
- **Vision Impaired**: Larger text with enhanced clarity
- **Dyslexia Friendly**: OpenDyslexic font with optimized spacing
- **Motion Sensitive**: Reduced animations, gentle transitions

## API Endpoints

- `GET /api/clarityhud/settings` - Get all settings
- `GET /api/clarityhud/settings/:dock` - Get settings for specific dock (chat/full)
- `POST /api/clarityhud/settings/:dock` - Update settings for specific dock
- `GET /api/clarityhud/state/:dock` - Get current event state
- `POST /api/clarityhud/settings/:dock/reset` - Reset to default settings

## WebSocket Events

### Outgoing (from plugin)
- `clarityhud.update.chat` - Chat message event
- `clarityhud.update.follow` - Follow event
- `clarityhud.update.share` - Share event
- `clarityhud.update.gift` - Gift event
- `clarityhud.update.subscribe` - Subscribe/Superfan event
- `clarityhud.update.join` - Join event
- `clarityhud.settings.chat` - Chat settings update
- `clarityhud.settings.full` - Full settings update

## Technical Details

### Architecture

```
clarityhud/
├── plugin.json          # Plugin manifest
├── main.js              # Plugin entry point
├── backend/
│   └── api.js           # Backend API and event handlers
├── overlays/
│   ├── chat.html        # Chat-only overlay
│   └── full.html        # Full activity overlay
├── ui/
│   └── main.html        # Dashboard settings UI
└── lib/
    ├── animations.js     # Animation system
    ├── accessibility.js  # Accessibility manager
    └── layout-engine.js  # Layout rendering engine
```

### Performance Optimizations

- RequestAnimationFrame for smooth animations
- Efficient DOM manipulation
- Event queue management with auto-trimming
- GPU-accelerated CSS transforms
- Dynamic font loading
- Minimal reflows and repaints

### VR Optimization

- Large default font sizes (48px)
- High line height (1.6) for readability
- Clear letter spacing (0.5px)
- Text outlines for contrast
- High contrast color schemes
- Large click targets for UI controls

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (may require font adjustments)
- OBS Browser Source: Full support

## License

Part of Pup Cid's Little TikTool Helper
