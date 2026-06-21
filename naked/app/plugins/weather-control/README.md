# Weather Control Plugin

Professional weather effects system for TikTok Live overlays with modern GPU-accelerated animations.

## 🌦️ Features

- **7 Weather Effects**: Rain, Snow, Storm, Fog, Thunder, Sunbeam, Glitch Clouds
- **Live Preview Panel**: Test and visualize weather effects directly in the admin panel before using them on stream
- **Modern Animations**: GPU-accelerated Canvas 2D rendering with fixed timestep physics
- **Advanced Graphics**: Fractal Koch snowflakes, volumetric fog with Perlin noise, HDR sunbeams with bloom, procedural lightning
- **High Performance**: Object pooling for zero GC pressure, 60 FPS with 500+ particles, frame-rate independent physics
- **Performance Monitoring**: Real-time FPS counter, particle count, pool statistics, and performance warnings
- **Permission System**: Role-based access control (Followers, Superfans, Subscribers, Team Members, Top Gifters)
- **Rate Limiting**: Configurable spam protection (default: 10 requests/minute)
- **WebSocket Integration**: Real-time event streaming to overlays
- **Flow Actions**: IFTTT automation support
- **Gift Triggers**: Automatic weather effects based on gift value
- **Chat Commands**: Integration with Global Chat Command Engine (GCCE)
- **Configurable**: Intensity, duration, and visual parameters for each effect
- **Security**: Input validation, sanitization, and API key authentication

## ⚡ Performance Enhancements (v1.3.0+)

This plugin features a completely redesigned rendering engine with professional-grade optimizations:

### Object Pooling System
- **Zero Garbage Collection Pressure**: Particles are pre-allocated and recycled instead of created/destroyed
- **Separate pools per effect type**: Rain, Snow, Storm, Fog each have dedicated particle pools
- **Dynamic pool growth**: Pools automatically expand when needed but prefer pre-allocation
- **Pool statistics**: Monitor pool efficiency with available/active/peak usage metrics

### Fixed Timestep Physics
- **Frame-rate independent physics**: Physics updates at consistent 60Hz regardless of display refresh rate
- **Smooth interpolation**: Visual rendering interpolates between physics steps for buttery smooth motion
- **No spiral of death**: Accumulator capped at 200ms to prevent slowdown cascade
- **Works perfectly on 30 FPS, 60 FPS, 144 FPS displays**

### Advanced Visual Effects

#### Fractal Snowflakes
- 5 unique Koch snowflake variants with varying iteration levels
- Procedurally generated fractal geometry for realistic snowflake shapes
- Size-based detail levels (larger snowflakes have more intricate patterns)
- Rotational animation with sparkle effects

#### Volumetric Fog
- Multi-layer fog rendering (3 gradient layers per particle)
- Perlin/Simplex noise for organic edge displacement
- Dynamic alpha modulation based on noise values
- Subtle hue shifts between layers for depth perception

#### HDR Sunbeams with Bloom
- Multiple bloom passes (3 passes) for realistic light scattering
- Exponential HDR-like gradient falloff (not linear)
- Tapered beam shapes (cone-like, not rectangular)
- Floating dust motes in beams (15 particles per beam)

#### Realistic Rain Physics
- Global wind system affecting all rain particles
- Turbulence with sine-based randomness for natural variation
- Splash effects on ground impact (3-5 droplets with arc physics)
- Motion blur via gradient rendering along velocity vector

#### Procedural Lightning
- L-system recursive subdivision with random branching
- 6 generations of subdivision for detailed bolts
- Multiple glow passes (4 widths) for atmospheric effect
- Fade-out over 150ms for realistic flash behavior
- 30% branch probability for natural-looking forks

### Performance Metrics
- **60 FPS sustained with 500+ particles**
- **Zero GC pauses** (verified in Chrome DevTools)
- **Memory stable over 30+ minutes**
- **Works on low-end devices at 30 FPS**

### Technical Implementation
- Simplex noise implementation (~80 lines) for fog displacement
- ParticlePool class for memory management
- Fixed timestep accumulator (16.67ms per physics step)
- Position interpolation (prevX/prevY → x/y with alpha blending)
- Set-based particle iteration (no splice in hot path)

## 🚀 Quick Start

### 1. Installation

The plugin is automatically loaded by the plugin loader. Enable it in the dashboard:

1. Navigate to the Dashboard
2. Go to Plugins section
3. Enable "Weather Control"
4. (Optional) Enable "Global Chat Command Engine" for chat commands

### 2. Configuration

Access the configuration panel at:
```
http://localhost:3000/weather-control/ui
```

### 3. OBS Setup

Add the overlay to OBS with proper transparency settings:

#### Step-by-Step Instructions:

1. **Add Browser Source**
   - In OBS, click the **+** button in the Sources panel
   - Select **Browser Source**
   - Give it a name (e.g., "Weather Effects")

2. **Configure Browser Source**
   - **URL**: `http://localhost:3000/weather-control/overlay`
   - **Width**: `1920` (or your stream resolution width)
   - **Height**: `1080` (or your stream resolution height)
   - **FPS**: `60` (or `30` for better performance)
   - ✅ **Check**: "Shutdown source when not visible"
   - ✅ **Check**: "Refresh browser when scene becomes active"
   - ⚠️ **Important**: Leave "Custom CSS" empty (don't add background colors)

3. **Verify Transparency**
   - The overlay should have a **transparent background**
   - Only weather effects (rain, snow, etc.) should be visible
   - If you see a black background, see troubleshooting below

4. **Debug Mode** (Optional)
   - Add `?debug=true` to the URL to see real-time debug information:
     ```
     http://localhost:3000/weather-control/overlay?debug=true
     ```
   - Debug panel shows: FPS, particle count, active effects, canvas transparency status

5. **Performance Tips**
   - Position the browser source in your scene hierarchy appropriately
   - Use "Shutdown source when not visible" to save CPU/GPU when not needed
   - Lower FPS to 30 if you experience performance issues

### 4. Visual Quality Settings

The weather overlay supports multiple quality levels for optimal performance on different systems.

#### **High Quality (Default)**
Professional-grade rendering with all enhancements enabled:
- Full anti-aliasing and smooth line rendering
- Multi-layer particle rendering with depth shading
- Volumetric fog with Perlin noise displacement
- HDR lightning with 4-pass atmospheric glow
- Volumetric sunbeams with bloom effects
- Enhanced particle textures and effects

Default URL:
```
http://localhost:3000/weather-control/overlay
```

**Performance**: 55-60 FPS with 500 particles (recommended for modern systems)

#### **Optional: Bloom Post-Processing**
Adds screen-space bloom/glow effect for enhanced atmosphere.

**⚠️ Warning**: Reduces FPS by ~10-15. Only recommended for high-end systems or recordings.

```
http://localhost:3000/weather-control/overlay?bloom=true
```

### Visual Enhancements

#### **Rain & Storm**
- Depth-based color variation (parallax effect)
- Atmospheric glow around droplets (outer halo + main streak)
- Enhanced splash effects with double-layer rendering (glow + core)
- Motion blur via velocity-based gradients

#### **Snow**
- Koch fractal snowflake geometry (5 variants)
- Radial gradient crystal effect (white center → ice blue edges)
- Depth shadows (2px offset, 30% opacity)
- Enhanced sparkle with outer glow + bright center (1.5x frequency)
- Definition outlines (0.5px white stroke)

#### **Fog**
- Three-layer volumetric rendering (base 1.2x → core 0.7x → highlight 0.4x)
- Perlin noise edge displacement (±30px organic shapes)
- Light scatter simulation (highlight offset -15% with reduced hue)
- Dynamic hue variation between layers (+5° shift per layer)

#### **Lightning (Thunder)**
- Multi-pass glow (4 layers: 20px, 12px, 6px, 3px with decreasing opacity)
- HDR-style brightness (alpha values up to 95% + screen blending)
- Electric blue highlights (RGB 150, 200, 255 at 60% opacity)
- Atmospheric scatter simulation (blue-shifted outer glow)

#### **Sunbeam**
- Volumetric bloom (3 passes at 2.5x, 1.8x, 1.3x scale)
- HDR-like screen blending mode
- Tapered beam gradients (cone-shaped, not rectangular)
- Enhanced dust motes with depth and radial glow (0.5-1.0 scale factor)

### Performance Impact

| Quality Setting | FPS Impact | Visual Improvement |
|----------------|------------|-------------------|
| High Quality (default) | 0 FPS | +100% vs. basic |
| Bloom Post-Processing | -12 FPS | +30% atmosphere |

### Browser Compatibility

- **Chrome/Edge**: Full support, best performance
- **Firefox**: Full support, slightly lower FPS (~5 FPS difference)
- **OBS Browser Source**: Full support (CEF-based, same as Chrome)

### Troubleshooting Visual Quality

**Effects look blurry or pixelated:**
- Ensure canvas resolution matches your stream resolution in OBS
- Check that browser zoom is 100% (not zoomed in/out)
- Verify `imageSmoothingQuality` is set to 'high' (should be automatic)
- Make sure OBS scaling filter is set to "Bicubic" or "Lanczos"

**Low FPS with quality effects:**
- Disable bloom post-processing (remove `?bloom=true` from URL)
- Reduce particle intensity in Weather Control settings (0.3-0.5 instead of 0.8-1.0)
- Lower OBS browser source FPS to 30
- Reduce concurrent effect count (max 2-3 instead of 5+)

**Effects look washed out or dim:**
- Check OBS color space settings (Rec. 709 recommended for SDR streams)
- Verify browser hardware acceleration is enabled (chrome://flags or about:config)
- Ensure no conflicting OBS filters are applied to the browser source
- Check that "Shutdown source when not visible" is enabled to prevent stale renders

## 👁️ Live Weather Preview

The Weather Control plugin now includes a **Live Preview Panel** in the admin interface, allowing you to test and visualize weather effects before using them on stream.

### Features

- **Real-time Preview Canvas**: 640x360px (16:9 aspect ratio) canvas showing exactly how effects will look
- **Performance Monitoring**: 
  - Live FPS counter
  - Average FPS tracker
  - Particle count display
  - Active effects counter
  - Performance warning when FPS drops below 30
- **Interactive Controls**:
  - **Start/Stop Preview**: Toggle preview rendering on/off
  - **Test Effect Buttons**: Each weather effect card has a test button to preview that specific effect
  - **Stop All**: Clear all active effects from the preview

### How to Use

1. Navigate to the Weather Control admin panel (`http://localhost:3000/weather-control/ui`)
2. Find the **Live Weather Preview** section near the top
3. Click **"Start Preview"** to begin rendering
4. Use any of the **"Test Effect"** buttons in the Weather Effects section to preview specific effects
5. Adjust intensity, duration, and permanent settings to see how they affect the preview
6. Monitor the performance stats to ensure your configuration will run smoothly

### Performance Tips

- The preview uses the same rendering engine as the actual overlay
- If average FPS drops below 30, you'll see a performance warning
- Consider reducing particle intensity or limiting concurrent effects if performance is poor
- The preview automatically stops when you close or navigate away from the page

## 💬 Chat Commands (GCCE Integration)

When both Weather Control and Global Chat Command Engine (GCCE) plugins are enabled, viewers can trigger weather effects via chat commands.

### Commands

#### `/weather <effect> [intensity] [duration]`
Trigger a weather effect on the stream.

**Parameters:**
- `effect` (required): Weather effect name (rain, snow, storm, fog, thunder, sunbeam, glitchclouds)
- `intensity` (optional): Effect intensity 0.0-1.0 (only if enabled in config)
- `duration` (optional): Duration in milliseconds (only if enabled in config)

**Examples:**
```
/weather rain
/weather storm 0.8
/weather snow 0.5 15000
```

#### `/weatherlist`
List all available weather effects.

**Example:**
```
/weatherlist
→ "Available weather effects: 🌧️ rain, ❄️ snow, ⛈️ storm, 🌫️ fog, ⚡ thunder, ☀️ sunbeam, ☁️ glitchclouds"
```

#### `/weatherstop`
Stop all active weather effects (requires subscriber permission or higher).

**Example:**
```
/weatherstop
→ "All weather effects stopped"
```

### Chat Command Configuration

Configure chat commands in the Weather Control settings:

```javascript
chatCommands: {
  enabled: true,                    // Enable/disable chat commands
  requirePermission: true,          // Use permission system for commands
  allowIntensityControl: false,     // Allow users to specify intensity
  allowDurationControl: false       // Allow users to specify duration
}
```

**Security:**
- Permission checks are applied based on plugin settings
- Rate limiting applies to chat commands (same as API)
- Commands are logged for moderation
- Permission denied events are emitted

## 🎨 Weather Effects

### Rain 🌧️
Realistic falling rain with advanced physics simulation.
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Particles**: ~200 (scales with intensity)
- **New Features**:
  - Global wind system affecting particle trajectories
  - Turbulence using sine-wave randomness
  - Ground splash effects (3-5 droplets per impact)
  - Motion blur along velocity vector
  - Depth-based parallax (z-coordinate)

### Snow ❄️
Realistic snowfall with fractal Koch snowflake geometry.
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Particles**: ~150 (scales with intensity)
- **New Features**:
  - 5 unique Koch snowflake variants
  - Procedurally generated fractal patterns (1-3 iterations)
  - Size-based detail levels
  - Rotational animation with wobble
  - Sparkle effects (4% chance per frame)

### Storm ⛈️
Heavy rain with strong winds and intense weather.
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Particles**: ~300 (scales with intensity)
- **Special**: Camera shake effect, diagonal rain direction
- **Inherits**: All rain physics (wind, turbulence, splash)

### Fog 🌫️
Volumetric fog with organic Perlin noise displacement.
- **Default Intensity**: 0.4
- **Default Duration**: 15 seconds
- **Particles**: ~30 (large particles, 80-280px radius)
- **New Features**:
  - Multi-layer rendering (3 gradient layers per particle)
  - Perlin/Simplex noise for organic edges
  - Dynamic alpha modulation (0.7 + noise * 0.3)
  - Subtle hue shifts between layers
  - Smooth fade in/out using sine wave

### Thunder ⚡
Procedural lightning with realistic branching and atmospheric glow.
- **Default Intensity**: 0.8
- **Default Duration**: 5 seconds
- **New Features**:
  - L-system recursive lightning generation (6 generations)
  - Random branching (30% chance, creates forks)
  - Multiple glow passes (4 widths: 15px, 8px, 3px, 1px)
  - 150ms fade-out with brightness progression
  - Screen flash overlay for atmosphere
  - Supports multiple simultaneous bolts

### Sunbeam ☀️
HDR sun rays with bloom effect and volumetric light scattering.
- **Default Intensity**: 0.6
- **Default Duration**: 12 seconds
- **Beams**: 3-10 (scales with intensity)
- **New Features**:
  - HDR bloom with 3 passes (scale: 1.0, 1.3, 1.6)
  - Exponential gradient falloff (not linear)
  - Tapered beam shape (cone geometry)
  - Floating dust motes (15 per beam)
  - Deterministic dust particle positions
  - Warm color palette (255, 250, 220 to 255, 235, 160)

### Glitch Clouds ☁️
Digital glitch effect with colorful noise.
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Special**: RGB glitch lines (20% frequency), digital noise (25% frequency)

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

### Black background in OBS overlay

If you see a black background instead of transparency in OBS:

#### Quick Fixes:
1. **Verify OBS Browser Source Settings**
   - Ensure Width and Height match your canvas resolution (e.g., 1920x1080)
   - DO NOT add any custom CSS (especially background colors)
   - Ensure "Shutdown source when not visible" is checked
   - Try refreshing the browser source (right-click → Refresh)

2. **Check OBS Version**
   - OBS Studio 27.0 or later is recommended for best browser source support
   - Older versions may have transparency issues with HTML5 Canvas
   - Update OBS if you're on an older version

3. **Verify Browser Source URL**
   - URL should be exactly: `http://localhost:3000/weather-control/overlay`
   - No trailing slashes or extra parameters (except `?debug=true` for debugging)
   - Test the URL in a regular browser first - it should show transparent background

4. **Enable Debug Mode**
   - Add `?debug=true` to the URL
   - Check the debug panel for "Canvas Alpha" status - should show "✅ Enabled"
   - Check the browser console (right-click source → Interact → F12) for error messages

5. **Test Canvas Transparency**
   - Open the overlay in Chrome/Edge with debug mode: `http://localhost:3000/weather-control/overlay?debug=true`
   - Look for the log message: "✅ Canvas background is transparent"
   - If it says "Canvas background may not be fully transparent", there's a rendering issue

6. **OBS Browser Source Cache**
   - OBS browser sources cache content aggressively
   - Right-click the browser source → Properties → click "Refresh cache of current page"
   - Or temporarily add `?v=2` to the URL to bust the cache: `http://localhost:3000/weather-control/overlay?v=2`

7. **Hardware Acceleration**
   - In OBS: Settings → Advanced → ensure "Enable Browser Source Hardware Acceleration" is checked
   - Restart OBS after changing this setting

#### Technical Details:
The overlay uses HTML5 Canvas with alpha channel and explicit CSS transparency:
- `<html>` and `<body>` elements: `background: transparent !important`
- Canvas element: `background: transparent !important`
- Canvas 2D context: initialized with `alpha: true` and `premultipliedAlpha: true`
- All rendering uses `ctx.clearRect()` to maintain transparency between frames

#### Known Issue: desynchronized Canvas Context
- The canvas context does NOT use `desynchronized: true`
- This option improves performance (~5-10 fps with 500 particles) in browsers but breaks transparency in OBS
- OBS Browser Source (CEF v103-107) cannot correctly read the alpha channel from desynchronized canvas
- If you modify the canvas context initialization, ensure transparency still works in OBS
- Trade-off: Minor performance reduction for working transparency in OBS

If transparency still doesn't work after trying all the above, there may be a system-level graphics driver issue or OBS configuration problem.

### Effects not showing in OBS
1. Check overlay URL is correct
2. Verify Browser Source settings (width, height)
3. Enable debug mode to see if events are received
4. Check browser console in OBS (right-click → Interact)

### Animations not loading correctly
1. **Check GSAP Library**
   - The overlay requires GSAP for smooth animations
   - If GSAP fails to load, you'll see a red error message on the overlay
   - Check that `/gsap/gsap.min.js` is accessible from the server
   - Verify the GSAP package is installed: `npm list gsap` in the `app` directory

2. **Verify Network Connection**
   - Ensure the server is running on `http://localhost:3000`
   - Check that Socket.IO is connected (look for "Connected" status in debug mode)
   - Test the overlay URL in a regular browser first

3. **Check Browser Console**
   - Right-click the OBS browser source → Interact → Press F12
   - Look for JavaScript errors in the Console tab
   - Common errors: GSAP not loaded, Socket.IO connection failed, context initialization failed

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

## 🧪 Testing

### Transparency Test

A standalone transparency test page is available to verify that canvas transparency works correctly:

```
/app/plugins/weather-control/transparency-test.html
```

Open this file directly in a browser (or serve it via the app) to run automated tests that verify:
- Canvas context initialization with alpha channel
- Premultiplied alpha setting
- Background transparency
- Semi-transparent rendering
- clearRect() transparency maintenance
- HTML/Body element transparency

This test uses a checkerboard background pattern to visually confirm transparency is working.

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
