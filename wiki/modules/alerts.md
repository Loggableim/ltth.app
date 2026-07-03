# Alert System

## Overview

The Alert System displays visual and audio notifications on your OBS overlay when TikTok LIVE events occur. Each event type (Gifts, Follows, Shares, Subscriptions, Likes) can have custom alerts with sound, text, images/GIFs, and animations.

## Features

- **Visual Alerts**: Custom text with template variables
- **Audio Alerts**: MP3/WAV sound effects
- **Images & GIFs**: Custom alert graphics
- **Customizable Animations**: Slide, fade, bounce, and more
- **Duration Control**: Set how long alerts display
- **Test Mode**: Preview alerts before going live
- **Priority Queue**: Important alerts shown first

## Configuration

Navigate to **Dashboard** → **Alerts** to configure your alerts.

### Available Event Types

1. **Gift Alerts** - Triggered when viewers send gifts
2. **Follow Alerts** - Triggered when someone follows
3. **Share Alerts** - Triggered when someone shares the stream
4. **Subscription Alerts** - Triggered when someone subscribes
5. **Like Alerts** - Triggered at like thresholds (e.g., every 100 likes)

## Alert Template Variables

Use these placeholders in your alert text:

- `{username}` - The user who triggered the event
- `{giftName}` - Name of the gift (Gift alerts only)
- `{coins}` - Coin value of the gift (Gift alerts only)
- `{count}` - Gift combo count (Gift alerts only)
- `{total}` - Total coins from this user (Gift alerts only)
- `{likeCount}` - Current total likes (Like alerts only)

### Example Alert Configurations

**Gift Alert Example:**
```
Text: "Thanks {username} for the {giftName}! ({coins} coins)"
Sound: celebration.mp3
Duration: 5 seconds
Animation: Slide from bottom
```

**Follow Alert Example:**
```
Text: "Welcome {username} to the community! 🎉"
Sound: welcome.mp3
Duration: 4 seconds
Animation: Fade in
```

## Sound Files

Alerts can use:
- Built-in sounds from the soundboard
- Custom uploaded MP3/WAV files
- MyInstants integrated sounds

Upload custom sounds via **Dashboard** → **Soundboard** → **Upload**.

## Advanced Settings

### Alert Queue

Multiple alerts are queued and shown sequentially:
- Default queue size: 50 alerts
- Overflow: Older alerts are dropped
- Priority: Subscriptions > Gifts > Follows > Shares > Likes

### Alert Filters

Filter which alerts are shown:
- Minimum coin value (for gifts)
- Minimum like threshold
- Blacklist specific users
- Enable/disable per event type

### Display Settings

- **Position**: Top, center, bottom
- **Alignment**: Left, center, right
- **Font Size**: 12px - 72px
- **Colors**: Background, text, border
- **Opacity**: 0% - 100%

## Testing Alerts

Use the **Test Alert** button to preview:
1. Go to **Dashboard** → **Alerts**
2. Select an event type
3. Click **Test Alert**
4. Alert appears in OBS overlay

## Integration with Flows

Alerts can be triggered by Flows (Event Automation):
```
Trigger: Gift received
Condition: giftName == "Rose"
Action: Show custom alert
```

See [[flows]] for more information on automation.

## OBS Setup

To display alerts in OBS:
1. Add **Browser Source** in OBS
2. URL: `http://localhost:3000/overlay`
3. Width: 1920, Height: 1080
4. Enable "Shutdown source when not visible"
5. Alerts will appear automatically

## Troubleshooting

**Alerts not showing:**
- Check if OBS browser source is added correctly
- Verify server is running (localhost:3000)
- Check if alerts are enabled in settings
- Test with the "Test Alert" button

**Sound not playing:**
- Check sound file exists and is valid MP3/WAV
- Verify browser source audio is not muted in OBS
- Check system volume settings

**Alerts delayed:**
- Large alert queue - reduce queue size
- Heavy animations - use simpler animations
- Browser source performance - refresh browser source

---

*For more information, see the [[API-Reference]] for programmatic alert triggering.*
