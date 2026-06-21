# Fireworks Superplugin

🎆 GPU-accelerated fireworks effects for TikTok LIVE streams with gift-specific displays, combo systems, and interactive triggers.

## Features

### Core Features
- **Gift-Triggered Fireworks**: Automatic fireworks when viewers send gifts
- **Combo Streak System**: Consecutive gifts from the same user create bigger effects
- **Gift Escalation**: Small → Medium → Big → Massive tiers based on coin value
- **GPU Particle Engine**: WebGL 2.0 rendering with Canvas 2D fallback
- **Custom Explosion Shapes**: Burst, Heart, Star, Ring, Spiral

### Visual Effects
- **Gift-based Particles**: Uses gift images as particles
- **Particle Trails**: Configurable trail effects
- **Glow Effects**: Radial glow around particles
- **Color Modes**: Gift-based, Random, Theme, Rainbow

### Audio System
- **Synchronized Audio**: Launch sounds perfectly timed with rocket flight
- **Tier-Based Selection**: Different sounds for Small/Medium/Big/Massive fireworks
- **Combined Effects**: Launch + explosion in single synchronized audio files
- **Variety & Randomization**: Multiple sound variations for each tier
- **Adaptive Playback**: Audio adjusts based on combo level and firework type
- **Volume Control**: Adjustable audio levels with intensity scaling

### Goal Integration
- **Goal Finales**: Multi-burst shows when goals are reached
- **Configurable Intensity**: Adjust finale power

### API
- **Plugin API**: Exposed methods for other plugins
- **REST API**: HTTP endpoints for automation
- **Flow Actions**: Integration with IFTTT-style flows

## Installation

The plugin is installed by default. Enable it via the Plugin Manager.

## Configuration

Access settings at: `/fireworks/ui`

### Overlay URL
Add to OBS BrowserSource: `http://localhost:3000/fireworks/overlay`

Recommended settings:
- Width: 1920
- Height: 1080
- FPS: 60
- Custom CSS: (leave empty)

## API Endpoints

### Configuration
- `GET /api/fireworks/config` - Get current configuration
- `POST /api/fireworks/config` - Update configuration

### Triggers
- `POST /api/fireworks/trigger` - Trigger a single firework
- `POST /api/fireworks/finale` - Trigger a finale show
- `POST /api/fireworks/random` - Trigger a random firework

### Status
- `GET /api/fireworks/status` - Get plugin status
- `POST /api/fireworks/toggle` - Enable/disable plugin

### Gift Mappings
- `GET /api/fireworks/gift-mappings` - Get gift-specific settings
- `POST /api/fireworks/gift-mappings` - Set gift-specific settings

### File Management
- `POST /api/fireworks/upload` - Upload audio/video file
- `GET /api/fireworks/uploads` - List uploaded files
- `DELETE /api/fireworks/uploads/:filename` - Delete file

## Trigger Payload

```json
{
  "type": "gift",
  "intensity": 1.5,
  "shape": "heart",
  "colors": ["#ff0000", "#ff6600", "#ffcc00"],
  "position": { "x": 0.5, "y": 0.5 },
  "particleCount": 100,
  "giftImage": "https://...",
  "username": "example"
}
```

## Escalation Tiers

| Tier | Coins | Particles | Multiplier |
|------|-------|-----------|------------|
| Small | 0-99 | 30 | 0.5x |
| Medium | 100-499 | 60 | 1.0x |
| Big | 500-999 | 100 | 1.5x |
| Massive | 1000+ | 200 | 2.5x |

## Combo System

When the same user sends multiple gifts within the combo timeout:
- Combo multiplier increases exponentially
- Visual effects scale with combo level
- Maximum multiplier is configurable (default 5x)

## Shapes

| Shape | Icon | Description |
|-------|------|-------------|
| Burst | 💥 | Classic radial explosion |
| Heart | ❤️ | Heart-shaped pattern |
| Star | ⭐ | 5-pointed star |
| Ring | ⭕ | Circular ring |
| Spiral | 🌀 | Spiral pattern |

## Flow Actions

### fireworks_trigger
Trigger a single firework with custom parameters.

Parameters:
- `shape`: burst, heart, star, ring, spiral
- `intensity`: 0.1 - 5.0
- `colors`: Comma-separated hex colors

### fireworks_finale
Trigger a multi-burst finale show.

Parameters:
- `intensity`: 1.0 - 10.0
- `duration`: 1000 - 30000 ms

## Performance

- **GPU Acceleration**: WebGL 2.0 preferred
- **Particle Limit**: Configurable (default 1000)
- **Frame Rate**: Targets 60 FPS
- **Memory**: Particle pooling prevents allocation
- **Freeze Protection**: Auto-reload failsafe when FPS drops to 0 for 3+ seconds

### Automatic Freeze Recovery

The plugin includes an automatic failsafe mechanism to prevent complete crashes:

- **FPS Monitoring**: Continuously tracks rendering performance
- **Freeze Detection**: Detects when FPS drops to 0 (complete freeze)
- **Auto-Recovery**: After 3 consecutive seconds of 0 FPS:
  1. Logs error to console
  2. Shows visual warning overlay
  3. Automatically reloads the overlay after 2 seconds
- **Smart Recovery**: If FPS recovers before reload, the failsafe resets and normal operation continues

This ensures that even during extreme gift spam scenarios, the overlay will automatically recover without requiring a full system restart.

## OBS BrowserSource Compatibility

- Transparent background
- 1920x1080 native resolution
- WebSocket connection for real-time updates
- CSP-compliant (no inline scripts)

## Audio Synchronization

The fireworks plugin features an advanced audio system that synchronizes sound effects with visual animations.

### Audio Categories

**Combined Audio (Launch + Explosion)**
- `woosh_abheben_crackling_bang.mp3` - Used for massive/big fireworks (4.9s, explosion at 3.2s)
- `woosh_abheben_mit-pfeifen_normal-bang.mp3` - Used for medium fireworks (3.4s, explosion at 2.2s)
- `woosh_abheben_mit-pfeifen_tiny-bang*.mp3` - Used for small fireworks and combos (1.8s, explosion at 1.2s)

**Launch-Only Audio (Separate Explosion)**
- `woosh_abheben_mit-pfeifen_no-bang.mp3` - Whistle launch without explosion
- `woosh_abheben_nocrackling_no-bang*.mp3` - Smooth launch without explosion

**Basic Effects**
- `explosion.mp3` - Basic explosion sound for separate playback
- `rocket.mp3`, `abschussgeraeusch*.mp3` - Basic launch sounds (now actively used!)

### Tier-Based Audio Selection with Maximum Variety

The system automatically selects appropriate audio based on firework tier with intelligent randomization:

| Tier | Audio Strategy | Variety Details |
|------|---------------|----------------|
| **Small** (0-99 coins) | 70% combined tiny-bang, 30% basic launches | Mix of synchronized effects and separate combinations |
| **Medium** (100-499 coins) | 40% normal-bang, 30% smooth, 30% varied | Uses all launch sound types for variety |
| **Big** (500-999 coins) | 50% crackling-bang, 25% whistle, 25% varied | Emphasizes powerful crackling effects |
| **Massive** (1000+ coins) | 80% crackling-bang, 20% whistle-normal | Maximum impact with occasional variety |
| **Combo 5-7** | Random tiny-bang sounds (all 4 variants) | Fast bursts optimized for rapid fire |
| **Combo 8+** | Explosion only (no launch) | Instant explosions for extreme combos |

**All 13 audio files are now actively used** to ensure every firework has a unique sound!

### How Synchronization Works

1. **Combined Audio**: Launch and explosion are in one file, automatically synchronized
2. **Separate Audio**: Launch plays immediately, explosion triggers via callback when visual explodes
3. **Timing Calibration**: Explosion delays are calibrated based on audio file analysis
4. **Volume Scaling**: Audio volume adjusts based on firework intensity and combo level

For detailed audio documentation, see `audio/README.md`.

## Troubleshooting

### No fireworks appearing
1. Check if plugin is enabled
2. Verify overlay URL is correct
3. Check browser console for errors

### Low FPS
1. Reduce max particles
2. Disable trails/glow
3. Use Canvas fallback

### No sound
1. Check audio toggle is enabled in settings
2. Verify volume is not 0
3. Click on the overlay page to enable audio (browser requirement)
4. Check browser console for audio loading errors
5. Verify audio files exist in `/plugins/fireworks/audio/`
6. Clear browser cache if audio was recently updated

### Sounds out of sync
1. Check that audio files are not corrupted
2. Verify explosion timing values in `selectAudio()` method
3. Test with different tiers to isolate the issue
4. Check browser console for timing logs

## License

CC BY-NC 4.0 License - Part of PupCid's Little TikTok Helper
