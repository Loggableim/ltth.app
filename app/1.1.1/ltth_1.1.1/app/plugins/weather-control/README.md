# Weather Control Plugin

Professional weather effects system for TikTok Live overlays with modern GPU-accelerated animations.

## 🌦️ Features

- **7 Weather Effects**: Rain, Snow, Storm, Fog, Thunder, Sunbeam, Glitch Clouds
- **Modern Animations**: GPU-accelerated Canvas 2D rendering
- **Permission System**: Role-based access control (Followers, Superfans, Subscribers, Team Members, Top Gifters)
- **Rate Limiting**: Configurable spam protection (default: 10 requests/minute)
- **WebSocket Integration**: Real-time event streaming to overlays
- **Flow Actions**: IFTTT automation support
- **Gift Triggers**: Automatic weather effects based on gift value
- **Configurable**: Intensity, duration, and visual parameters for each effect
- **Security**: Input validation, sanitization, and API key authentication

## 🚀 Quick Start

### 1. Installation

The plugin is automatically loaded by the plugin loader. Enable it in the dashboard:

1. Navigate to the Dashboard
2. Go to Plugins section
3. Enable "Weather Control"

### 2. Configuration

Access the configuration panel at:
```
http://localhost:3000/weather-control/ui
```

### 3. OBS Setup

Add the overlay to OBS:

1. Add a **Browser Source** to your OBS scene
2. Set the URL to: `http://localhost:3000/weather-control/overlay`
3. Set Width: `1920`, Height: `1080` (or your stream resolution)
4. Check "Shutdown source when not visible" for performance
5. Recommended: Enable "Refresh browser when scene becomes active"

**Debug Mode:**
Add `?debug=true` to the URL to see real-time debug information:
```
http://localhost:3000/weather-control/overlay?debug=true
```

## 🎨 Weather Effects

### Rain 🌧️
Realistic falling rain with varying particle sizes and speeds.
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Particles**: ~200

### Snow ❄️
Gentle snowfall with wobbling particles and sparkles.
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Particles**: ~150

### Storm ⛈️
Heavy rain with strong winds and camera shake.
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Particles**: ~300
- **Special**: Camera shake effect

### Fog 🌫️
Mysterious fog with layered noise.
- **Default Intensity**: 0.4
- **Default Duration**: 15 seconds
- **Particles**: ~30 (large)

### Thunder ⚡
Random lightning flashes with screen brightening.
- **Default Intensity**: 0.8
- **Default Duration**: 5 seconds
- **Special**: Lightning flash overlay

### Sunbeam ☀️
Warm light rays moving across the screen.
- **Default Intensity**: 0.6
- **Default Duration**: 12 seconds
- **Special**: 5 animated light beams

### Glitch Clouds ☁️
Digital glitch effect with colorful noise.
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Special**: RGB glitch lines, digital noise

## 🔒 Permission System

Configure who can trigger weather effects:

### User Groups
- **Followers**: Users who follow your channel
- **Superfans**: Users with 50+ gifts sent
- **Subscribers**: Team members (level 1+)
- **Team Members**: Users with specific team level
- **Top Gifters**: Top X gifters of the session
- **Point Threshold**: Users with minimum coins/points

### Configuration
```javascript
permissions: {
  enabled: true,
  allowAll: false,
  allowedGroups: {
    followers: true,
    superfans: true,
    subscribers: true,
    teamMembers: true,
    minTeamLevel: 1
  },
  topGifterThreshold: 10, // Top 10 gifters
  minPoints: 0
}
```

## 📡 API Endpoints

### Trigger Weather Effect
```http
POST /api/weather/trigger
Content-Type: application/json
X-Weather-Key: <api-key> (optional, if not using global auth)

{
  "action": "rain",
  "intensity": 0.5,
  "duration": 10000,
  "username": "viewer123",
  "meta": {
    "triggeredBy": "gift",
    "giftName": "rose"
  }
}
```

**Supported Actions**: `rain`, `snow`, `storm`, `fog`, `thunder`, `sunbeam`, `glitchclouds`

**Parameters**:
- `action` (required): Weather effect to trigger
- `intensity` (optional): 0.0 - 1.0 (default: effect's default)
- `duration` (optional): 1000 - 60000 ms (default: effect's default)
- `username` (optional): Username for permission check
- `meta` (optional): Additional metadata

**Response**:
```json
{
  "success": true,
  "event": {
    "type": "weather",
    "action": "rain",
    "intensity": 0.5,
    "duration": 10000,
    "username": "viewer123",
    "meta": {},
    "timestamp": 1234567890
  }
}
```

### Get Configuration
```http
GET /api/weather/config
```

### Update Configuration
```http
POST /api/weather/config
Content-Type: application/json

{
  "enabled": true,
  "rateLimitPerMinute": 10,
  "permissions": { ... },
  "effects": { ... }
}
```

### Get Supported Effects
```http
GET /api/weather/effects
```

### Reset API Key
```http
POST /api/weather/reset-key
```

## ⚡ Flow Actions

Use weather effects in IFTTT flows:

### Action: `weather.trigger`

**Example Flow**: Trigger rain on expensive gift
```json
{
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": ">=",
    "field": "coins",
    "value": 5000
  },
  "actions": [
    {
      "type": "weather.trigger",
      "action": "storm",
      "intensity": 0.8,
      "duration": 10000
    }
  ]
}
```

**Example Flow**: Trigger snow on follow
```json
{
  "trigger_type": "follow",
  "actions": [
    {
      "type": "weather.trigger",
      "action": "snow",
      "intensity": 0.6,
      "duration": 8000
    }
  ]
}
```

## 🎁 Gift Triggers

Weather effects are automatically triggered based on gift value:

| Coins | Effect |
|-------|--------|
| 5000+ | Storm ⛈️ |
| 1000-4999 | Thunder ⚡ |
| 500-999 | Rain 🌧️ |
| 100-499 | Snow ❄️ |

These can be customized in the plugin code.

## 🔐 Security Features

- **Rate Limiting**: Configurable per-user limits (default: 10/minute)
- **Input Validation**: All parameters are validated and sanitized
- **Permission Checks**: Role-based access control
- **API Key Authentication**: Optional separate API key for external access
- **XSS Protection**: Meta data is sanitized to prevent injection
- **Logging**: All weather events are logged

## 🎯 Performance

- **GPU Acceleration**: Canvas 2D with hardware acceleration
- **FPS Cap**: 60 FPS maximum
- **Particle Limits**: Configurable max particles (default: 500)
- **Memory Management**: Automatic cleanup of expired effects
- **No Memory Leaks**: Clean start/stop routines

## 🐛 Debugging

Enable debug mode by adding `?debug=true` to the overlay URL.

Debug panel shows:
- Current FPS
- Active particle count
- Active effects list
- Effect intensities

Console logs show:
- Weather events received
- Effect start/stop
- Connection status

## 📊 Technical Details

### Canvas Rendering
- Resolution: Matches window size (responsive)
- Alpha: Enabled for transparency
- Composite operations: Normal + Lighter (for sunbeams)

### Particle System
- Class-based particle management
- Per-frame delta time calculation
- Physics simulation (gravity, wind, wobble)
- Depth-based parallax (z-coordinate)

### WebSocket Events
- Event: `weather:trigger`
- Format: `{ type, action, intensity, duration, username, meta, timestamp }`
- Auto-reconnect on disconnect

## 🔧 Customization

### Adding New Effects

1. Add effect name to `supportedEffects` in `main.js`
2. Add default config in `defaultConfig.effects`
3. Add effect implementation in `overlay.html` effects object
4. Add UI controls in `ui.html`

### Custom Gift Mapping

Edit the `registerTikTokEventHandlers()` function in `main.js`:

```javascript
if (coins >= 10000) {
    weatherAction = 'glitchclouds';
} else if (coins >= 5000) {
    weatherAction = 'storm';
}
// ... add more mappings
```

## 📝 Configuration File

Plugin configuration is stored in the database under key `weather_config`.

Example structure:
```json
{
  "enabled": true,
  "apiKey": "weather_abc123...",
  "useGlobalAuth": true,
  "rateLimitPerMinute": 10,
  "permissions": {
    "enabled": true,
    "allowAll": false,
    "allowedGroups": {
      "followers": true,
      "superfans": true,
      "subscribers": true,
      "teamMembers": true,
      "minTeamLevel": 1
    },
    "topGifterThreshold": 10,
    "minPoints": 0
  },
  "effects": {
    "rain": {
      "enabled": true,
      "defaultIntensity": 0.5,
      "defaultDuration": 10000
    }
    // ... other effects
  }
}
```

## 🆘 Troubleshooting

### Effects not showing in OBS
1. Check overlay URL is correct
2. Verify Browser Source settings (width, height)
3. Enable debug mode to see if events are received
4. Check browser console in OBS (right-click > Interact)

### Permission denied errors
1. Verify user is in allowed groups
2. Check permission settings in UI
3. Review server logs for details
4. Ensure user exists in database

### Rate limit errors
1. Adjust rate limit in configuration
2. Wait for rate limit window to reset (1 minute)
3. Check server logs for details

### Effects lagging/stuttering
1. Reduce particle count via intensity
2. Limit number of simultaneous effects
3. Close unnecessary OBS sources
4. Check CPU/GPU usage

## 📄 License

Part of Pup Cid's Little TikTok Helper.
Licensed under CC BY-NC 4.0 License.

## 🤝 Contributing

Contributions are welcome! Please follow the existing code style and add tests for new features.

## 📞 Support

For issues and feature requests, please create an issue on GitHub.

---

**Version**: 1.0.0
**Author**: Pup Cid
**Last Updated**: 2025-11-19
