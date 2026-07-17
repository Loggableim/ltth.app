# WebGPU Fireworks

This edition requires the [Loggableim OBS WebGPU build](https://github.com/Loggableim/obs-studio-webgpu). In OBS, set Browser Source WebGPU mode to `Auto`, add the current LTTH HTTP origin to the insecure-origin allowlist, restart OBS, and refresh the Browser Source cache after plugin updates.

🎆 GPU-accelerated fireworks effects for TikTok LIVE streams with gift-specific displays, combo systems, and interactive triggers.

## Features

### Core Features
- **Gift-Triggered Fireworks**: Automatic fireworks when viewers send gifts
- **Combo Streak System**: Consecutive gifts from the same user create bigger effects
- **Gift Escalation**: Small → Medium → Big → Massive tiers based on coin value
- **Native WebGPU Engine**: WGSL compute simulation, indirect rendering, SDF shapes, GPU trails and HDR bloom
- **Custom Explosion Shapes**: Burst, Heart, Star, Ring, Spiral, Paws
- **Three Visual Styles**: Premium Hybrid, Realistic, and Stylized Neon globally or per gift
- **Distributed Spawn Planner**: Automatic rockets use distinct launch origins and separated explosion zones
- **Streamer-Safe Backpressure**: Low-FPS and high-load protection prioritizes bigger gifts and finales while reducing or dropping smaller effects under pressure
- **Validated Runtime Settings**: Config, manual triggers, finales, and gift mappings are normalized before use to avoid broken settings crashing the overlay

### Visual Effects
- **Gift-based Particles**: Uses gift images as particles
- **Particle Trails**: Configurable trail effects
- **Glow Effects**: Radial glow around particles
- **Color Modes**: Gift-based, Random, Theme, Rainbow

### Audio System
- **Synchronized Audio**: Launch sounds perfectly timed with rocket flight
- **Tier-Based Selection**: Different sounds for Small/Medium/Big/Massive fireworks
- **Frame-Exact Effects**: Separate launch, bang, and crackling layers follow the visual timeline
- **Dual Audio Backend**: WebAudio with an HTMLAudio fallback for OBS autoplay compatibility
- **Variety & Randomization**: Multiple sound variations for each tier
- **Adaptive Playback**: Audio adjusts based on combo level and firework type
- **Volume Control**: Adjustable audio levels with intensity scaling

### Goal Integration
- **Goal Finales**: Multi-burst shows when goals are reached
- **Configurable Intensity**: Adjust finale power

## Superfan finales

When a viewer enters with `teamMemberLevel > 0`, or an authoritative `superfan` event arrives, WebGPU Fireworks can show `Superfan joined, this firework is for you!` and enqueue a choreographed finale. Cooldowns are stored per TikTok user ID, with normalized username fallback, in the plugin data directory and survive reloads.

The default is enabled, once per Superfan every 24 hours, at 3x intensity. Available cooldowns are 6, 12, 24, 72, and 168 hours; intensity ranges from 1x to 10x. Show style and length inherit the global finale settings. The settings test button never reads or updates real Superfan cooldown history.

### API
- **Plugin API**: Exposed methods for other plugins
- **REST API**: HTTP endpoints for automation
- **Flow Actions**: Integration with IFTTT-style flows

## Installation

The plugin is installed by default. Enable it via the Plugin Manager.

## Configuration

> **OBS requirement:** This edition is intended only for the [Loggableim OBS WebGPU build](https://github.com/Loggableim/obs-studio-webgpu). Standard OBS is not supported.

Access settings at: `/webgpu-fireworks/ui`

### Overlay URL
Add to OBS BrowserSource: `http://localhost:3000/webgpu-fireworks/overlay`

Recommended settings:
- Width: 1920
- Height: 1080
- FPS: 60
- Custom CSS: (leave empty)

## API Endpoints

### Configuration
- `GET /api/webgpu-fireworks/config` - Get current configuration
- `POST /api/webgpu-fireworks/config` - Update configuration

### Triggers
- `POST /api/webgpu-fireworks/trigger` - Trigger a single firework
- `POST /api/webgpu-fireworks/finale` - Trigger a finale show
- `POST /api/webgpu-fireworks/random` - Trigger a random firework

### Status
- `GET /api/webgpu-fireworks/status` - Get plugin status
- `POST /api/webgpu-fireworks/toggle` - Enable/disable plugin

### Gift Mappings
- `GET /api/webgpu-fireworks/gift-mappings` - Get gift-specific settings
- `POST /api/webgpu-fireworks/gift-mappings` - Set gift-specific settings
- `DELETE /api/webgpu-fireworks/gift-mappings/:giftId` - Remove gift-specific settings

### File Management
- `POST /api/webgpu-fireworks/upload` - Upload audio/video file
- `GET /api/webgpu-fireworks/uploads` - List uploaded files
- `DELETE /api/webgpu-fireworks/uploads/:filename` - Delete file

## Trigger Payload

```json
{
  "type": "gift",
  "intensity": 1.5,
  "shape": "heart",
  "visualStyle": "premium-hybrid",
  "colors": ["#ff0000", "#ff6600", "#ffcc00"],
  "positionMode": "auto",
  "origin": { "x": 0.25, "y": 1.02 },
  "seed": 12345,
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

## Visual Styles

- `premium-hybrid` (default): realistic launches and sparks with crisp symbolic shapes
- `realistic`: longer ember trails, restrained bloom, and transparent burst smoke
- `stylized-neon`: larger symbols, bold edges, and stronger neon bloom

Gift mappings may define `visualStyle`; an explicit trigger style overrides the gift mapping, which overrides the global style.

## Flow Actions

### webgpu_fireworks_trigger
Trigger a single firework with custom parameters.

Parameters:
- `shape`: burst, heart, paws, star, ring, spiral
- `intensity`: 0.1 - 5.0
- `colors`: Comma-separated hex colors

### webgpu_fireworks_finale
Trigger a multi-burst finale show.

Parameters:
- `intensity`: 1.0 - 10.0
- `duration`: 1000 - 30000 ms

## Performance

- **GPU Acceleration**: WebGPU is mandatory; no WebGL or Canvas fallback exists
- **Particle Limit**: Atomic GPU free-list storage pool (default 8192)
- **Frame Rate**: Targets 60 FPS
- **Memory**: Particle pooling prevents allocation
- **Freeze Protection**: Auto-reload failsafe when FPS drops to 0 for 3+ seconds
- **Trigger Backpressure**: Uses overlay FPS, active firework count, queue depth, and particle budgets to protect OBS during gift spam
- **Priority Handling**: Manual tests/finales bypass safety drops, large gifts are preferred over small gifts, and medium effects can be reduced instead of discarded

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

The overlay preloads and decodes all 20 valid bundled files even while its AudioContext is suspended. The launch selection now includes the complete whistle, howl, smooth-launch and crackling library from the original Fireworks plugin. Combined launch-and-bang recordings are faded and stopped before their embedded bang; the separate bang still starts in the same CPU frame as the WebGPU explosion command. Crackling is only assigned to rockets that also spawn the dedicated GPU crackle-spark pass. Sound and sparks start together and share the same short lifetime and fade-out, so crackling cannot continue after its visible effect. A compressor and voice-priority mixer keep finales audible without clipping; HTMLAudio is used only when WebAudio playback is unavailable.

The renderer status reports the active audio backend, loaded and failed files, last playback and the latest error. `LOCKED` means the browser source still requires an interaction or an OBS autoplay permission; it does not mean the files failed to load.

Finales always keep the visible rocket ascent, even at combo levels that normally use instant explosions. Crackling rockets are deliberately spaced through the finale instead of assigning crackling to every burst. Crackling uses a dedicated post-transient audio bus so it remains audible after large bangs without extending past the matching GPU sparks.

## Troubleshooting

### No fireworks appearing
1. Check if plugin is enabled
2. Verify overlay URL is correct
3. Check browser console for errors

### Low FPS
1. Reduce max particles
2. Disable trails/glow
3. Enable Toaster Mode to keep WebGPU active with reduced trails, bloom and render scale

### No sound
1. Check audio toggle is enabled in settings
2. Verify volume is not 0
3. Click on the overlay page to enable audio (browser requirement)
4. Check browser console for audio loading errors
5. Verify audio files exist in `/plugins/webgpu-fireworks/audio/`
6. Clear browser cache if audio was recently updated

### Sounds out of sync
1. Check that audio files are not corrupted
2. Verify explosion timing values in `selectAudio()` method
3. Test with different tiers to isolate the issue
4. Check browser console for timing logs

## License

CC BY-NC 4.0 License - Part of PupCid's Little TikTool Helper
