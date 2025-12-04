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

### Audio
- **Rocket Sounds**: Launch audio for anticipation
- **Explosion Sounds**: Impact audio for each burst
- **Volume Control**: Adjustable audio levels

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

## OBS BrowserSource Compatibility

- Transparent background
- 1920x1080 native resolution
- WebSocket connection for real-time updates
- CSP-compliant (no inline scripts)

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
1. Check audio toggle is enabled
2. Verify volume is not 0
3. Check browser audio permissions

## License

CC BY-NC 4.0 License - Part of PupCid's Little TikTok Helper
