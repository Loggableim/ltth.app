# Soundboard Module

## Overview

The Soundboard module provides access to 100,000+ sounds via MyInstants integration, allows custom sound uploads, and supports gift-to-sound mapping. Sounds can be triggered manually, via gifts, or through automation flows.

## Features

- **100,000+ Sounds** - MyInstants library integration
- **Custom Upload** - Add your own MP3/WAV files
- **Gift Mapping** - Specific gifts trigger specific sounds
- **Event Sounds** - Sounds for Follow, Subscribe, Share
- **Like Threshold** - Play sound at like milestones
- **Favorites** - Organize frequently used sounds
- **Search & Filter** - Find sounds quickly
- **Volume Control** - Adjust playback volume

## Configuration

Navigate to **Dashboard** → **Soundboard** to manage sounds.

## MyInstants Integration

Access the massive MyInstants sound library:

### Searching MyInstants

1. Go to **Soundboard** → **MyInstants**
2. Enter search term (e.g., "applause", "laugh", "meme")
3. Browse results
4. Click **Play** to preview
5. Click **Add to Soundboard** to import

### Popular Sound Categories

- **Reactions**: Applause, laugh, gasp, wow
- **Memes**: Vine boom, bruh, FBI open up
- **Music**: Song clips, jingles, themes
- **Effects**: Explosions, transitions, ambience
- **Notifications**: Ding, beep, chime
- **Gaming**: Victory, defeat, level up

### Sound Management

- **Import Sound** - Add MyInstants sound to library
- **Favorite** - Mark sound for quick access
- **Rename** - Give sound custom name
- **Delete** - Remove sound from library

## Custom Sound Upload

Upload your own sound files:

### Supported Formats

- **MP3** - Most common format
- **WAV** - Uncompressed audio
- **OGG** - Compressed format

### Upload Process

1. Go to **Soundboard** → **Upload**
2. Click **Choose File**
3. Select MP3/WAV file
4. Enter sound name
5. Click **Upload**

### File Requirements

- **Max Size**: 10 MB per file
- **Duration**: 1-30 seconds recommended
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Bitrate**: 128-320 kbps (MP3)

## Gift-to-Sound Mapping

Automatically play sounds when specific gifts are received:

### Creating Gift Mapping

1. Go to **Soundboard** → **Gift Mapping**
2. Click **Add Mapping**
3. Select gift from dropdown
4. Select sound to play
5. Set volume (optional)
6. Save

### Example Mappings

```
Rose → romantic-music.mp3
Lion → lion-roar.mp3
Galaxy → space-sound.mp3
TikTok → tiktok-notification.mp3
```

### Advanced Mapping Options

- **Coin Threshold**: Only play if gift value ≥ X coins
- **Combo Count**: Play different sound at combo milestones
- **Random Selection**: Pick random sound from category
- **Volume Override**: Custom volume for this mapping

## Event Sounds

Play sounds for non-gift events:

### Available Events

1. **Follow Sound**
   - Plays when someone follows
   - Example: welcome-chime.mp3

2. **Subscribe Sound**
   - Plays when someone subscribes
   - Example: subscriber-bell.mp3

3. **Share Sound**
   - Plays when stream is shared
   - Example: share-whoosh.mp3

4. **Like Milestone Sound**
   - Plays at like thresholds
   - Example: Every 100 likes → applause.mp3

### Configuring Event Sounds

1. Go to **Soundboard** → **Event Sounds**
2. Select event type
3. Choose sound file
4. Set threshold (for likes)
5. Enable/disable toggle
6. Save

## Like Threshold System

Play sounds at like milestones:

### Configuration

1. Go to **Soundboard** → **Like Thresholds**
2. Click **Add Threshold**
3. Set like count (e.g., 100, 500, 1000)
4. Select sound
5. Save

### Example Thresholds

```
100 Likes → small-applause.mp3
500 Likes → medium-applause.mp3
1000 Likes → big-applause.mp3
5000 Likes → epic-celebration.mp3
```

### Threshold Options

- **Repeating**: Trigger every X likes (e.g., every 100)
- **One-time**: Only trigger once at exact count
- **Volume Scaling**: Increase volume with higher milestones

## Sound Categories

Organize sounds into categories:

### Default Categories

- **Alerts** - Notification sounds
- **Reactions** - Emotional responses
- **Memes** - Funny/viral sounds
- **Music** - Song clips
- **Effects** - Sound effects
- **Custom** - User uploads

### Creating Categories

1. Go to **Soundboard** → **Categories**
2. Click **New Category**
3. Enter name and color
4. Assign sounds to category
5. Save

## Favorites System

Quick access to frequently used sounds:

1. Click **Star** icon on sound
2. Sound added to **Favorites** tab
3. Access favorites quickly during stream
4. Reorder favorites by drag-and-drop

## Manual Sound Playback

Play sounds manually during stream:

### Dashboard Control

1. Go to **Dashboard** → **Soundboard**
2. Browse or search sounds
3. Click sound to play instantly
4. Volume slider adjusts playback

### Keyboard Shortcuts (Optional)

Configure hotkeys for sounds:
- F1-F12 keys for top 12 favorites
- Ctrl+1-9 for sound categories
- Space to stop current sound

## Sound Queue

Sounds are queued and played sequentially:

- **Queue Mode**: Sequential (default) or Overlap
- **Max Queue**: 10 sounds (configurable)
- **Priority**: Manual > Gift > Event
- **Skip**: Stop current and play next

### Queue Settings

1. **Sequential Mode**: Sounds play one after another
2. **Overlap Mode**: Sounds can overlap
3. **Interrupt Mode**: New sound stops current

## Volume Control

Adjust sound volumes:

### Global Volume
- Master volume for all sounds
- Range: 0% - 200%
- Default: 100%

### Per-Sound Volume
- Individual volume for each sound
- Overrides global volume
- Useful for loud/quiet sounds

### Volume Ducking
- Reduce sound volume during TTS
- Configurable ducking level (0-100%)
- Auto-restore after TTS

## Integration with Flows

Trigger sounds via automation:

```
Trigger: Gift
Condition: giftName == "Rose"
Actions:
  1. Play Sound: romantic-music.mp3
  2. Delay: 5 seconds
  3. TTS: "Thanks {username}!"
```

See [[flows]] for more examples.

## OBS Integration

Sounds play through OBS browser source:

1. Add **Browser Source** in OBS
2. URL: `http://localhost:3000/overlay`
3. Sounds play automatically
4. Control volume in OBS Audio Mixer

### Audio Routing

```
Soundboard → Browser Source → OBS Mixer → Stream
```

- Separate audio track for soundboard (optional)
- Monitor via headphones
- Mix with other audio sources

## Advanced Features

### Sound Randomizer

Play random sound from category:

1. Create category (e.g., "Laughs")
2. Add multiple laugh sounds
3. Create gift mapping → Random from "Laughs"
4. Different laugh plays each time

### Sound Combos

Chain multiple sounds together:

```
Gift: Lion (worth 500 coins)
Sound 1: lion-roar.mp3 (0s)
Sound 2: applause.mp3 (2s delay)
Sound 3: thank-you.mp3 (4s delay)
```

### Soundboard Overlay

Display currently playing sound on stream:

1. Enable **Soundboard Overlay** in settings
2. Shows sound name and waveform
3. Customizable position and style
4. Auto-hide after playback

## Performance Optimization

- **Preload Sounds**: Load frequently used sounds at startup
- **Compress Audio**: Use MP3 instead of WAV for smaller files
- **Limit Queue**: Prevent memory issues
- **Clean Library**: Remove unused sounds regularly

## Troubleshooting

**Sound not playing:**
- Check if sound file exists
- Verify OBS browser source audio
- Check sound volume settings
- Test with manual playback

**MyInstants search not working:**
- Check internet connection
- Verify MyInstants website is up
- Try different search terms
- Clear browser cache

**Sound quality poor:**
- Use higher bitrate MP3 (320 kbps)
- Check original file quality
- Adjust OBS browser source audio settings

**Sounds overlapping:**
- Change queue mode to Sequential
- Reduce sound duration
- Adjust queue settings

**Gift mapping not triggering:**
- Verify gift name matches exactly
- Check if mapping is enabled
- Test with "Test Gift" button
- Check event logs

## API Access

Soundboard can be controlled via REST API:

```javascript
// Get all sounds
GET /api/soundboard/sounds

// Play sound
POST /api/soundboard/play
{
  "soundId": "123",
  "volume": 100
}

// Upload sound
POST /api/soundboard/upload
FormData with 'file' field

// Create gift mapping
POST /api/soundboard/gift-mapping
{
  "giftName": "Rose",
  "soundId": "123"
}

// Get MyInstants sounds
GET /api/soundboard/myinstants/search?q=applause
```

See [[API-Reference]] for complete documentation.

## Best Practices

### Do's ✅

- Test sounds before stream
- Use appropriate volumes
- Organize sounds in categories
- Use gift mapping for automation
- Keep sound library organized
- Preview sounds with test button

### Don'ts ❌

- Don't upload copyrighted music
- Don't use extremely loud sounds
- Don't overuse sounds (spam)
- Don't forget to test gift mappings
- Don't ignore audio levels in OBS

## Sound Library Organization

Recommended folder structure:

```
Soundboard
├── Alerts
│   ├── notification.mp3
│   ├── ding.mp3
│   └── chime.mp3
├── Reactions
│   ├── applause.mp3
│   ├── laugh.mp3
│   └── wow.mp3
├── Memes
│   ├── vine-boom.mp3
│   ├── bruh.mp3
│   └── nope.mp3
├── Music
│   ├── intro.mp3
│   ├── outro.mp3
│   └── victory.mp3
└── Custom
    ├── my-sound-1.mp3
    └── my-sound-2.mp3
```

---

*For more advanced soundboard features and API usage, see [[API-Reference]] and [[flows]].*
