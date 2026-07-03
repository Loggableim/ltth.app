# Text-to-Speech (TTS) System

## Overview

The Text-to-Speech system converts text messages into spoken audio. It supports 75+ TikTok voices (free) and 30+ Google Cloud voices (requires API key). TTS is used for chat messages, alerts, and custom automation flows.

## Features

- **75+ TikTok Voices** - Free, no API key required
- **30+ Google Cloud Voices** - Premium quality (requires API key)
- **User Voice Mapping** - Assign specific voices to users
- **Auto-TTS for Chat** - Automatically read chat messages
- **Blacklist Filter** - Block words and users
- **Volume & Speed Control** - Adjust playback settings
- **Queue Management** - TTS messages queued and played sequentially
- **Variable Support** - Use placeholders like `{username}`

## Configuration

Navigate to **Dashboard** → **TTS** to configure Text-to-Speech.

## Voice Types

### TikTok Voices (Free)

Popular TikTok voices available without API key:

**English Voices:**
- `en_us_001` - Female US English (warm)
- `en_us_002` - Male US English (deep)
- `en_us_006` - Male US English (conversational)
- `en_us_007` - Female US English (professional)
- `en_us_009` - Male US English (narrator)
- `en_us_010` - Male US English (storyteller)
- `en_uk_001` - Female UK English (posh)
- `en_uk_003` - Male UK English (formal)
- `en_au_001` - Female Australian English
- `en_au_002` - Male Australian English

**Character Voices:**
- `en_us_ghostface` - Ghostface (horror)
- `en_us_chewbacca` - Chewbacca (Star Wars)
- `en_us_c3po` - C-3PO (Star Wars)
- `en_us_stitch` - Stitch (Disney)
- `en_us_stormtrooper` - Stormtrooper (Star Wars)
- `en_us_rocket` - Rocket Raccoon (Marvel)

**Singing Voices:**
- `en_female_f08_salut_damour` - Singing Female
- `en_male_m03_lobby` - Singing Male
- `en_male_m03_sunshine_soon` - Singing Alto

**Other Languages:**
- `de_001` / `de_002` - German
- `fr_001` / `fr_002` - French
- `es_001` / `es_002` - Spanish
- `pt_001` / `pt_002` - Portuguese
- `br_001` / `br_003` / `br_004` / `br_005` - Brazilian Portuguese
- `id_001` - Indonesian
- `jp_001` / `jp_003` / `jp_005` / `jp_006` - Japanese
- `kr_002` / `kr_003` / `kr_004` - Korean

### Google Cloud Voices (Premium)

Requires Google Cloud API key. Supports 30+ languages with multiple voice types:
- WaveNet voices (highest quality)
- Standard voices
- Neural2 voices

To use Google Cloud voices:
1. Create Google Cloud account
2. Enable Text-to-Speech API
3. Create API key
4. Add API key in TTS settings

## Auto-TTS for Chat

Automatically read chat messages aloud:

1. Go to **Dashboard** → **TTS**
2. Enable **Auto-TTS for Chat**
3. Select default voice
4. Configure filters (optional)

### Auto-TTS Settings

- **Default Voice** - Voice for all users (unless mapped)
- **Max Message Length** - Skip messages longer than X characters
- **Delay Between Messages** - Pause between TTS (milliseconds)
- **Skip Emojis** - Remove emojis before reading
- **Skip URLs** - Remove links before reading

## User Voice Mapping

Assign specific voices to users:

1. Go to **Dashboard** → **TTS** → **Voice Mapping**
2. Click **Add Mapping**
3. Enter TikTok username
4. Select voice
5. Save

**Example:**
```
UserA → en_us_ghostface (Ghostface)
UserB → de_001 (German Female)
UserC → en_female_f08_salut_damour (Singing)
```

Users without mapping use the default voice.

## Blacklist Filter

Block specific words or users from TTS:

### Word Blacklist

1. Go to **Dashboard** → **TTS** → **Blacklist**
2. Add words to block (one per line)
3. Messages containing blacklisted words are skipped

**Example:**
```
badword1
badword2
spam
```

### User Blacklist

1. Go to **Dashboard** → **TTS** → **User Blacklist**
2. Add usernames to block (one per line)
3. Messages from blacklisted users are skipped

**Example:**
```
SpamBot123
TrollUser456
```

## Volume & Speed Control

Adjust TTS playback:

- **Volume**: 0% - 200% (default: 100%)
- **Speed**: 0.5x - 2.0x (default: 1.0x)
- **Pitch**: -20 to +20 semitones (Google Cloud only)

Settings apply to all TTS messages.

## TTS Queue

Messages are queued and played sequentially:

- **Queue Size**: Maximum 50 messages (configurable)
- **Overflow**: Oldest messages dropped when queue full
- **Priority**: Manual TTS > Auto-TTS
- **Skip**: Click "Skip Current" to jump to next message

### Queue Controls

- **Pause TTS** - Pause current message
- **Resume TTS** - Continue playback
- **Skip Current** - Jump to next message
- **Clear Queue** - Remove all queued messages

## Custom TTS Messages

Trigger TTS manually or via Flows:

### Manual Trigger

1. Go to **Dashboard** → **TTS**
2. Enter message text
3. Select voice (optional)
4. Click **Speak**

### Via Flows

```
Trigger: Gift
Condition: giftName == "Rose"
Action: TTS "Thanks {username} for the rose!"
```

See [[flows]] for more automation examples.

## Variable Support

Use variables in TTS text:

- `{username}` - User who triggered event
- `{giftName}` - Gift name
- `{coins}` - Coin value
- `{message}` - Chat message text
- `{followerCount}` - Total followers
- `{likeCount}` - Total likes

**Example:**
```
"Thank you {username} for the {giftName} worth {coins} coins!"
```

## TTS in Alerts

Combine TTS with visual alerts:

1. Create alert in **Dashboard** → **Alerts**
2. Add TTS action
3. Set text with variables

**Example Gift Alert:**
```
Visual: "{username} sent {giftName}!"
TTS: "Thanks {username} for the {giftName}!"
Sound: celebration.mp3
```

## Advanced Features

### TTS Language Detection

Auto-detect language for Google Cloud voices:
- Detects message language
- Selects appropriate voice
- Falls back to default if unsure

### Pronunciation Dictionary

Add custom pronunciations (Google Cloud only):

```json
{
  "LOL": "laugh out loud",
  "TikTok": "Tick Tock",
  "GG": "good game"
}
```

### SSML Support (Google Cloud)

Use Speech Synthesis Markup Language for advanced control:

```xml
<speak>
  Hello <break time="500ms"/> world!
  <prosody rate="slow">This is slow.</prosody>
  <emphasis level="strong">Important!</emphasis>
</speak>
```

## Performance Optimization

- **Cache TTS Audio** - Reuse generated audio for repeated messages
- **Preload Voices** - Load voices at startup for faster generation
- **Limit Queue Size** - Prevent memory issues with large queues

## OBS Integration

TTS audio plays through the OBS browser source:

1. Add **Browser Source** in OBS
2. URL: `http://localhost:3000/overlay`
3. TTS audio automatically plays
4. Volume controlled by OBS mixer

**Audio Routing:**
- TTS → Browser Source Audio
- Adjust in OBS Audio Mixer
- Monitor via headphones

## Troubleshooting

**TTS not playing:**
- Check if TTS is enabled
- Verify voice selection
- Check OBS browser source audio
- Test with manual TTS

**Voice not found:**
- TikTok voices may be temporarily unavailable
- Try different voice ID
- Check internet connection

**Google Cloud errors:**
- Verify API key is valid
- Check API quota limits
- Enable Text-to-Speech API in console
- Check billing account

**TTS queue stuck:**
- Click "Clear Queue"
- Restart server
- Check browser console for errors

**Poor audio quality:**
- Use Google Cloud for higher quality
- Increase volume if too quiet
- Adjust speed for clarity

## API Access

TTS can be triggered via REST API:

```javascript
// Speak text
POST /api/tts/speak
{
  "text": "Hello world!",
  "voice": "en_us_001"
}

// Get voices
GET /api/tts/voices

// Get queue
GET /api/tts/queue

// Skip current
POST /api/tts/skip

// Clear queue
POST /api/tts/clear
```

See [[API-Reference]] for complete documentation.

## Best Practices

### Do's ✅

- Test voices before stream
- Use voice mapping for regulars
- Keep messages under 200 characters
- Use blacklist for spam prevention
- Adjust volume for your setup
- Preview TTS with test button

### Don'ts ❌

- Don't use extreme speed/pitch
- Don't queue too many messages
- Don't forget to test Google API key
- Don't ignore audio levels in OBS
- Don't disable TTS mid-stream without warning

---

*For more advanced TTS features and integrations, see [[API-Reference]] and [[flows]].*
