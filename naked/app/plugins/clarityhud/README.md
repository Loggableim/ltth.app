# ClarityHUD Plugin

Ultra-minimalistic, VR-optimized and accessible HUD overlays for TikTok live streams.

## Features

### Three Fixed Overlay URLs

1. **Chat-Only HUD** (`/overlay/clarity/chat`)
   - Ultra-readable chat panel with very large font
   - High contrast design optimized for VR
   - Shows: Username + Message + Optional Timestamps
   - Minimal design without logos or decorations

2. **Full Activity HUD** (`/overlay/clarity/full`)
   - Displays all TikTok events: Chat, Follows, Shares, Likes, Gifts, Subs, Treasure Chests, Joins
   - Each event type individually toggleable
   - Three layout modes: Single Stream, Structured, Adaptive
   - Event deduplication to prevent double display

3. **Multi-Stream HUD** (`/overlay/clarity/multi`) ✨ NEW
   - Display up to 3 additional TikTok livestream chats alongside your primary stream
   - Optimized for compact VRChat usage with ~360px card width
   - Multiple layout modes: Mixed feed or split columns (1-3)
   - Customizable color schemes per stream (text/background/accent)
   - Message styles: Stripe (left border), Badge (source label), or Background (colored card)
   - Density modes: Ultra compact, Compact (default), or Comfortable
   - Optional avatars and timestamps
   - Highlight primary stream with opacity boost
   - Auto-contrast for better readability on colored backgrounds
   - Pulse animation on new messages (optional)
   - Virtual scrolling for high performance with 250-500 messages

### Layout Modes (Full HUD)

- **singleStream**: Unified event feed with all events in one list
- **structured**: Events grouped in separate blocks with headings
- **adaptive**: Automatic grouping with dynamic 1-3 column layout

### Multi-Stream HUD Layouts

- **Mixed Feed**: All streams combined in a single scrollable feed with source identification
- **Split Columns**: Separate columns for each stream (1-3 columns, auto-adjusts based on active streams)
  - Optional: Primary stream can span 2 columns for emphasis

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

#### Multi-Stream HUD Settings
- **Streams Configuration**: Configure up to 3 additional TikTok streams
  - Username input for each stream
  - Enable/disable individual streams
  - Custom display name (optional)
  - Color triplet per stream (text, background, accent)
- **Layout Options**:
  - Mixed feed or split columns (1-3)
  - Primary stream can span 2 columns
  - Message style: Stripe, Badge, or Background
  - Density: Ultra compact, Compact (default), or Comfortable
- **Display Features**:
  - Show/hide avatars
  - Show/hide timestamps
  - Highlight primary stream (opacity boost)
  - Auto-contrast for readability
  - Pulse animation on new messages
  - Max messages (250-500, default 300)

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
   - Multi-Stream: `http://localhost:PORT/overlay/clarity/multi`
3. Recommended resolution: 1920x1080 or higher for VR
4. Enable browser source hardware acceleration

### Multi-Stream HUD for VRChat

The Multi-Stream HUD is specifically optimized for VRChat overlays:
1. Compact card width (~360px) fits well in VR field of view
2. Large, readable fonts designed for VR headset clarity
3. High contrast colors with auto-contrast adjustment
4. Minimal animations to reduce motion sickness
5. Virtual scrolling ensures smooth performance with hundreds of messages

**Recommended setup for VRChat:**
- Layout: Mixed feed (single column)
- Density: Compact (default)
- Message Style: Stripe (subtle visual separation)
- Enable: Auto-contrast
- Disable: Pulse animation, Avatars (for performance)
- Max Messages: 300

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
- `GET /api/clarityhud/settings/:dock` - Get settings for specific dock (chat/full/multi)
- `POST /api/clarityhud/settings/:dock` - Update settings for specific dock
- `GET /api/clarityhud/state/:dock` - Get current event state
- `POST /api/clarityhud/settings/:dock/reset` - Reset to default settings

## WebSocket Events

### Outgoing (from plugin)
- `clarityhud.update.chat` - Chat message event
- `clarityhud.update.follow` - Follow event
- `clarityhud.update.share` - Share event
- `clarityhud.update.like` - Like event
- `clarityhud.update.gift` - Gift event
- `clarityhud.update.subscribe` - Subscribe/Superfan event
- `clarityhud.update.treasure` - Treasure chest event
- `clarityhud.update.join` - Join event
- `clarityhud.settings.chat` - Chat settings update
- `clarityhud.settings.full` - Full settings update
- `clarityhud.settings.multi` - Multi-stream settings update
- `clarityhud:multi:chat` - Multi-stream chat event (with sourceId, sourceLabel, colors)

## Technical Details

### Architecture

```
clarityhud/
├── plugin.json          # Plugin manifest
├── main.js              # Plugin entry point
├── backend/
│   └── api.js           # Backend API, event handlers, and multi-stream connectors
├── overlays/
│   ├── chat.html        # Chat-only overlay
│   ├── full.html        # Full activity overlay
│   └── multi.html       # Multi-stream overlay (NEW)
├── ui/
│   └── main.html        # Dashboard settings UI
└── lib/
    ├── animations.js     # Animation system
    ├── accessibility.js  # Accessibility manager
    ├── layout-engine.js  # Layout rendering engine
    ├── virtual-scroller.js # Virtual scrolling for performance
    ├── emoji-parser.js   # Emoji rendering
    ├── badge-renderer.js # Badge system
    └── message-parser.js # Message parsing
```

### Performance Optimizations

- RequestAnimationFrame for smooth animations
- Efficient DOM manipulation
- Event queue management with auto-trimming
- GPU-accelerated CSS transforms
- Dynamic font loading
- Minimal reflows and repaints
- Virtual scrolling for multi-stream (handles 250-500 messages efficiently)

### VR Optimization

- Large default font sizes (48px for chat/full, 28px for multi-stream compact mode)
- High line height (1.6 for chat, 1.4 for multi-stream) for readability
- Clear letter spacing (0.5px for chat, 0.3px for multi-stream)
- Text outlines for contrast
- High contrast color schemes
- Large click targets for UI controls

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (may require font adjustments)
- OBS Browser Source: Full support

## License

Part of Pup Cid's Little TikTok Helper
