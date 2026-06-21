# TikTok TTS Integration Guide

## Overview

TikTok TTS is now the **default TTS engine** for LTTH (PupCid's Little TikTool Helper). It provides high-quality, free text-to-speech without requiring an API key.

## Why TikTok TTS?

- ✅ **Free**: No API costs or credits needed
- ✅ **Fast**: Low latency, quick response times
- ✅ **High Quality**: Professional-grade voices
- ✅ **Multi-Language**: 60+ voices across 15+ languages
- ✅ **No Setup**: Uses existing TikTok LIVE session (Eulerstream)

## How It Works

TikTok TTS integrates with the **Eulerstream session-extractor** system that's already used for TikTok LIVE connections. The SessionID required for TTS API authentication is automatically retrieved from the centralized session storage.

### Architecture

```
TikTok LIVE Connection (Eulerstream)
    ↓
Session Extractor Module
    ↓
Database (tiktok_session_id)
    ↓
TikTok TTS Engine ← Uses session for API calls
```

## Configuration

### Default Settings

TikTok TTS is enabled by default with these settings:

- **Default Engine**: `tiktok`
- **Default Voice**: `de_002` (German female)
- **Fallback**: Google TTS (for reliability)
- **Auto-Fallback**: Enabled

### Changing Settings

You can customize TTS settings via the Admin Panel:

1. Open TTS Admin Panel in your browser
2. Navigate to Configuration tab
3. Choose your preferred:
   - Default Engine
   - Default Voice
   - Fallback Engines
4. Save changes

## Available Voices

TikTok TTS supports 60+ voices including:

### German
- `de_001` - Deutsch Männlich (Male)
- `de_002` - Deutsch Weiblich (Female) ⭐ Default

### English
- `en_us_001` - US Female 1
- `en_us_002` - US Female 2 (Jessie)
- `en_us_006` - US Male 1 (Joey)
- `en_us_007` - US Male 2 (Professor)
- `en_male_narration` - Male Narrator
- `en_female_emotional` - Female Emotional
- And many more...

### Character Voices (English)
- `en_us_ghostface` - Ghostface (Scream)
- `en_us_c3po` - C3PO
- `en_us_stitch` - Stitch
- `en_us_stormtrooper` - Stormtrooper
- `en_us_rocket` - Rocket

### Other Languages
- Spanish: `es_002`, `es_mx_002`
- French: `fr_001`, `fr_002`
- Portuguese: `br_003`, `br_004`, `br_005`
- Italian: `it_male_m18`
- Japanese: `jp_001`, `jp_003`, `jp_005`, `jp_006`
- Korean: `kr_002`, `kr_003`, `kr_004`
- And more...

Full voice list available in the TTS Admin Panel.

## Session Management

### Automatic (Recommended)

If you're using TikTok LIVE features, the session is automatically managed:

1. Connect to TikTok LIVE
2. Session is extracted and stored
3. TikTok TTS uses the same session
4. No manual configuration needed ✅

### Manual (Advanced)

If you need to manually set a session:

1. Open browser DevTools (F12)
2. Go to Application → Cookies → https://www.tiktok.com
3. Copy the `sessionid` value
4. Store it: `db.setSetting('tiktok_session_id', '<your_session_id>')`

## Technical Limits

- **Max Text Length**: 300 characters per request
- **Chunking**: Automatic for longer texts (MP3 concatenation)
- **Endpoints**: Multiple redundant API endpoints for reliability

## Fallback System

TikTok TTS is configured with smart fallbacks:

**Primary**: TikTok TTS (free, fast)
↓ (if fails)
**Fallback 1**: Google TTS (requires API key)
↓ (if fails)
**Fallback 2**: OpenAI TTS (requires API key)
↓ (if fails)
**Fallback 3**: Fish Speech (requires API key)
↓ (if fails)
**Fallback 4**: ElevenLabs/Speechify (premium)

## Troubleshooting

### TTS Not Working?

1. **Check SessionID**
   ```
   Session status: Check TikTok LIVE connection status
   Database: Verify tiktok_session_id is set
   ```

2. **Session Expired?**
   - Reconnect to TikTok LIVE
   - Or manually update session (see Manual section)

3. **API Endpoints Changed?**
   - TikTok occasionally rotates endpoints
   - Engine automatically tries multiple endpoints
   - Check logs for specific error messages

### No Audio Output?

1. Enable fallback engines (Google TTS recommended)
2. Check volume settings
3. Verify TikTok SessionID is valid
4. Review logs for error messages

## Switching to Other Engines

Don't want to use TikTok TTS? You can easily switch:

### Option 1: Change Default Engine
1. Open TTS Admin Panel
2. Set Default Engine to:
   - `google` - Google Cloud TTS
   - `elevenlabs` - ElevenLabs (premium)
   - `openai` - OpenAI TTS
   - `fishspeech` - Fish Speech
   - `speechify` - Speechify

### Option 2: Disable TikTok Fallback
1. Open TTS Admin Panel
2. Disable "Enable TikTok Fallback"
3. TikTok engine will not load

## API Reference

Based on research from [Steve0929/tiktok-tts](https://github.com/Steve0929/tiktok-tts) repository:

- **Endpoint**: Multiple variants (api16, api19, api22, normal/core)
- **Method**: POST
- **Format**: application/x-www-form-urlencoded
- **Auth**: Cookie (sessionid)
- **Response**: Base64-encoded MP3

## Support

For issues or questions:
1. Check logs in Admin Panel → Debug Logs
2. Review TTS configuration
3. Verify TikTok LIVE connection
4. Report issues on GitHub

---

**Note**: TikTok TTS is free but requires a valid TikTok session. For production use or guaranteed uptime, consider using paid services like Google Cloud TTS or ElevenLabs with API keys.
