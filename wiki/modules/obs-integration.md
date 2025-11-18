# OBS Integration Module

## Overview

The OBS Integration module enables full control of OBS Studio from PupCid's Little TikTok Helper. Switch scenes, control sources, adjust filters, and automate camera switching - all triggered by TikTok LIVE events or automation flows.

## Features

- **OBS WebSocket v5** - Modern WebSocket protocol
- **Scene Control** - Switch scenes automatically
- **Source Control** - Show/hide sources
- **Filter Control** - Enable/disable filters
- **Recording Control** - Start/stop recording
- **Multi-Cam Switching** - Automatic camera switching
- **Browser Source Overlays** - Transparent Full-HD overlays
- **Real-time Stats** - Monitor OBS status

## Requirements

### OBS Studio

- **Version**: OBS Studio 28.0+ (includes WebSocket v5)
- **Download**: https://obsproject.com/download

### OBS WebSocket Plugin

**OBS 28.0+**: WebSocket plugin is built-in (no installation needed)

**OBS 27.x or older**: Install obs-websocket plugin separately
1. Download from https://github.com/obsproject/obs-websocket/releases
2. Install plugin
3. Restart OBS

## Configuration

### OBS WebSocket Setup

1. Open OBS Studio
2. Go to **Tools** → **WebSocket Server Settings**
3. Enable **WebSocket Server**
4. Set **Server Port**: 4455 (default)
5. Enable **Authentication** (recommended)
6. Set password (optional but recommended)
7. Click **OK**

### ltth.app Configuration

1. Go to **Dashboard** → **Settings** → **OBS Integration**
2. Enter **WebSocket URL**: `ws://localhost:4455`
3. Enter **Password** (if set in OBS)
4. Click **Connect**
5. Wait for green status "Connected"

### Connection Test

Test OBS connection:
1. Click **Test Connection** button
2. If successful: Green checkmark
3. If failed: Check OBS is running and WebSocket settings

## Browser Source Overlays

Display ltth.app overlays in OBS:

### Main Overlay

All-in-one overlay with alerts, goals, leaderboard:

1. Add **Browser Source** in OBS
2. **URL**: `http://localhost:3000/overlay`
3. **Width**: 1920
4. **Height**: 1080
5. **FPS**: 30 (recommended)
6. **Custom CSS**: Optional
7. Check **Shutdown source when not visible** (performance)
8. Check **Refresh browser when scene becomes active**

### Individual Overlays

Separate overlays for each feature:

**Alerts Overlay:**
```
URL: http://localhost:3000/overlay/alerts
Width: 1920, Height: 300
```

**Goals Overlay:**
```
URL: http://localhost:3000/overlay/goals
Width: 1920, Height: 200
```

**Leaderboard Overlay:**
```
URL: http://localhost:3000/overlay/leaderboard
Width: 400, Height: 600
```

**Chat Overlay:**
```
URL: http://localhost:3000/overlay/chat
Width: 400, Height: 800
```

### Overlay Positioning

Position overlays in OBS:
- Drag to desired position
- Right-click → Transform → Edit Transform
- Set exact X/Y coordinates
- Lock position when satisfied

## Scene Control

Switch OBS scenes automatically:

### Manual Scene Switch

1. Go to **Dashboard** → **OBS** → **Scenes**
2. Select scene from dropdown
3. Click **Switch to Scene**
4. OBS switches immediately

### Automatic Scene Switching

Create scene triggers in Flows:

```
Trigger: Gift
Condition: coins >= 1000
Actions:
  1. OBS Scene: Switch to "Celebration"
  2. Delay: 5 seconds
  3. OBS Scene: Switch back to "Main"
```

### Scene List

View all available scenes:
- Dashboard shows all OBS scenes
- Auto-refreshes when scenes are added/removed
- Scenes can be renamed in OBS

## Source Control

Control source visibility:

### Show/Hide Sources

```
Trigger: Gift
Condition: giftName == "Rose"
Actions:
  1. OBS Source: Show "Heart Overlay"
  2. Delay: 3 seconds
  3. OBS Source: Hide "Heart Overlay"
```

### Toggle Sources

Toggle source on/off:
- Current state: Visible → Hidden
- Current state: Hidden → Visible

### Source Properties

Adjust source properties:
- Volume (audio sources)
- Opacity (visual sources)
- Position (transform)
- Scale (size)

## Filter Control

Enable/disable OBS filters:

### Filter Types

Supported filters:
- Color Correction
- Chroma Key
- Blur
- Sharpen
- LUT
- Custom filters

### Filter Control Example

```
Trigger: Subscribe
Actions:
  1. OBS Filter: Enable "Confetti Shader"
  2. Delay: 3 seconds
  3. OBS Filter: Disable "Confetti Shader"
```

## Recording Control

Start/stop OBS recording:

### Auto-Recording

```
Trigger: TikTok LIVE Connected
Action: OBS Recording: Start

Trigger: TikTok LIVE Disconnected
Action: OBS Recording: Stop
```

### Manual Control

1. Go to **Dashboard** → **OBS**
2. Click **Start Recording** / **Stop Recording**
3. Recording status shown in dashboard

## Multi-Cam Switching

Automatic camera switching based on events:

### Setup Multi-Cam

1. Create multiple camera scenes in OBS:
   - Cam1 (Main camera)
   - Cam2 (Side camera)
   - Cam3 (Top-down camera)

2. Configure switching in ltth.app:
   - Go to **Dashboard** → **Plugins** → **Multi-Cam Switcher**
   - Enable plugin
   - Map gifts to cameras

### Gift-to-Camera Mapping

```
Rose → Cam2 (Close-up)
Lion → Cam3 (Top-down)
Galaxy → Cam1 (Main)
Default → Cam1
```

### Chat-Based Switching

Switch cameras based on chat commands:

```
!cam1 → Switch to Cam1
!cam2 → Switch to Cam2
!cam3 → Switch to Cam3
!main → Switch to Main scene
```

### Automatic Return

Return to main camera after X seconds:
- Default: 5 seconds
- Configurable in plugin settings

## Advanced Features

### Scene Collections

Switch between scene collections:
```
OBS Scene Collection: "Gaming Setup"
OBS Scene Collection: "IRL Setup"
```

### Profile Switching

Switch OBS profiles:
```
OBS Profile: "1080p60"
OBS Profile: "720p30"
```

### Stats Monitoring

Monitor OBS performance:
- CPU usage
- FPS (frames per second)
- Dropped frames
- Streaming bitrate
- Recording status

### Screenshot Capture

Take screenshots via ltth.app:

```
Trigger: Gift
Condition: coins >= 5000
Action: OBS Screenshot
```

## Integration with Flows

### Example Flows

**Big Gift Celebration:**
```
Trigger: Gift
Condition: coins >= 1000
Actions:
  1. OBS Scene: "Celebration"
  2. OBS Source: Show "Fireworks"
  3. Sound: celebration.mp3
  4. TTS: "Huge gift from {username}!"
  5. Delay: 5 seconds
  6. OBS Source: Hide "Fireworks"
  7. OBS Scene: "Main"
```

**Subscriber Welcome:**
```
Trigger: Subscribe
Actions:
  1. OBS Scene: "Welcome Screen"
  2. Alert: "New subscriber: {username}!"
  3. Delay: 4 seconds
  4. OBS Scene: "Main"
```

**Like Milestone:**
```
Trigger: Like
Condition: likeCount % 1000 == 0
Actions:
  1. OBS Filter: Enable "Rainbow Shader"
  2. TTS: "We hit {likeCount} likes!"
  3. Delay: 3 seconds
  4. OBS Filter: Disable "Rainbow Shader"
```

See [[flows]] for more examples.

## Troubleshooting

**Connection Failed:**
- Check OBS is running
- Verify WebSocket is enabled in OBS
- Check WebSocket port (default: 4455)
- Verify password (if set)
- Check firewall settings

**Scenes not switching:**
- Verify scene names match exactly
- Check OBS is not in Studio Mode
- Test with manual switch
- Check flow configuration

**Sources not showing/hiding:**
- Verify source names are correct
- Check source exists in current scene
- Test with manual control
- Check source is not locked

**Browser source not loading:**
- Check URL is correct (localhost:3000)
- Verify ltth.app server is running
- Refresh browser source
- Check browser source width/height

**Audio not playing in browser source:**
- Check "Control audio via OBS" is checked
- Unmute browser source in OBS Audio Mixer
- Adjust browser source volume
- Check system volume

## Performance Optimization

### Browser Source Settings

Optimize for performance:
- **Shutdown source when not visible**: Enabled
- **Refresh browser when scene becomes active**: Enabled
- **FPS**: 30 (don't use 60 unless needed)
- **Hardware Acceleration**: Enabled in OBS settings

### WebSocket Connection

- Keep WebSocket connection persistent
- Auto-reconnect on disconnect
- Batch commands when possible
- Limit scene switches (max 1 per second)

## Security Considerations

### WebSocket Password

**Always use a password** for WebSocket connection:
- Prevents unauthorized access
- Protects against malicious scripts
- Recommended: 16+ character random password

### Local Network Only

WebSocket should only accept local connections:
- Bind to 127.0.0.1 (localhost)
- Don't expose to internet
- Use firewall to block external access

## OBS Scene Examples

### Recommended Scene Structure

```
Main (Base Scene)
├── Webcam
├── Browser Source (ltth.app overlay)
├── Chat Box
└── Alerts

Celebration (Special Scene)
├── Webcam (zoomed)
├── Fireworks Overlay
├── Confetti Effect
└── Browser Source (ltth.app overlay)

BRB (Be Right Back)
├── BRB Image/Video
├── Countdown Timer
└── Music Source

Ending (Outro)
├── Outro Video
├── Social Media Info
└── Thank You Message
```

## API Access

OBS integration can be controlled via REST API:

```javascript
// Get OBS status
GET /api/obs/status

// Get scenes
GET /api/obs/scenes

// Switch scene
POST /api/obs/scene
{
  "sceneName": "Main"
}

// Get sources
GET /api/obs/sources

// Show/hide source
POST /api/obs/source
{
  "sourceName": "Heart Overlay",
  "visible": true
}

// Start recording
POST /api/obs/recording/start

// Stop recording
POST /api/obs/recording/stop

// Take screenshot
POST /api/obs/screenshot
```

See [[API-Reference]] for complete documentation.

## Best Practices

### Do's ✅

- Test scene switching before going live
- Use descriptive scene names
- Keep browser source FPS at 30
- Use "Shutdown when not visible"
- Set WebSocket password
- Create backup scene for errors

### Don'ts ❌

- Don't switch scenes too frequently (< 1 second)
- Don't use 60 FPS for browser sources (unnecessary)
- Don't forget to test overlay before stream
- Don't expose WebSocket to internet
- Don't hardcode scene names (use dropdown)

---

*For more advanced OBS integration and automation, see [[API-Reference]] and [[flows]].*
