# TTS Performance Modes

## Overview

The TTS system now supports three performance modes to optimize text-to-speech generation for different hardware capabilities and use cases.

## Performance Modes

### 🚀 Fast Mode (Low-Resource / "Toaster PCs")

**Best for:** Low-end PCs, laptops with limited resources, or when you need the fastest possible response times.

**Settings:**
- Timeout: 5 seconds per attempt
- Retries: 1 (2 total attempts)
- Total max wait time: ~10 seconds per engine

**Use cases:**
- Streaming on low-end hardware
- When you need immediate TTS responses
- Systems with limited CPU/RAM
- High-volume TTS requests

**Trade-off:** May occasionally fail on slow network connections or during API rate limiting.

### ⚖️ Balanced Mode (Default)

**Best for:** Most users and average hardware setups.

**Settings:**
- Timeout: 10 seconds per attempt
- Retries: 2 (3 total attempts)
- Total max wait time: ~30 seconds per engine

**Use cases:**
- Standard streaming setups
- Average PC hardware
- Balanced reliability and speed

**Trade-off:** Good balance between speed and reliability.

### 🎯 Quality Mode (High-Resource)

**Best for:** High-end PCs, when reliability is more important than speed, or poor network conditions.

**Settings:**
- Timeout: 20 seconds per attempt
- Retries: 3 (4 total attempts)
- Total max wait time: ~80 seconds per engine

**Use cases:**
- High-quality production streams
- Poor/unstable network connections
- When TTS reliability is critical
- Systems with plenty of resources

**Trade-off:** Slower, but maximum reliability.

## Configuration

### Via TTS Admin Panel

1. Open the TTS Admin Panel in your browser
2. Navigate to the "Configuration" tab
3. Find "Performance Mode" setting
4. Select one of: `fast`, `balanced`, or `quality`
5. Click "Save Configuration"
6. Engines will automatically reinitialize with new settings

### Via Configuration File

Edit your configuration and set:

```json
{
  "performanceMode": "fast"  // or "balanced" or "quality"
}
```

### Via API

```javascript
POST /api/tts/config
{
  "performanceMode": "fast"
}
```

## Performance Comparison

| Mode     | Timeout | Retries | Max Wait (Single) | Max Wait (with Fallback) |
|----------|---------|---------|-------------------|---------------------------|
| Fast     | 5s      | 1       | ~10s              | ~40s (4 engines)          |
| Balanced | 10s     | 2       | ~30s              | ~120s (4 engines)         |
| Quality  | 20s     | 3       | ~80s              | ~320s (4 engines)         |

## Supported Engines

All four engines support performance modes:
- Google Cloud TTS
- Speechify TTS
- ElevenLabs TTS
- OpenAI TTS

## Automatic Fallback

The system supports automatic fallback between engines when one fails. The fallback chain depends on which engine you're using as primary:

- **Google** → OpenAI → ElevenLabs → Speechify
- **Speechify** → OpenAI → ElevenLabs → Google
- **ElevenLabs** → OpenAI → Speechify → Google
- **OpenAI** → ElevenLabs → Google → Speechify

With fast mode, the entire fallback chain completes much faster (~40s vs ~120s in balanced mode).

## Recommendations

### For Streaming on Low-End PCs ("Toaster PCs")
```json
{
  "performanceMode": "fast",
  "defaultEngine": "google",
  "enableAutoFallback": true
}
```

### For Professional Streams
```json
{
  "performanceMode": "balanced",
  "defaultEngine": "elevenlabs",
  "enableAutoFallback": true
}
```

### For Unreliable Networks
```json
{
  "performanceMode": "quality",
  "defaultEngine": "google",
  "enableAutoFallback": true
}
```

## Troubleshooting

### TTS is too slow
- Switch to `fast` mode
- Ensure `enableAutoFallback` is enabled
- Check your network connection
- Verify API keys are valid

### TTS fails frequently
- Switch to `quality` mode
- Enable auto-fallback
- Check API quotas/limits
- Verify API keys are not expired

### TTS quality is poor
- Use `quality` mode with ElevenLabs or Speechify
- Ensure good network connection
- Check if API is throttling requests

## Migration from TikTok Engine

The TikTok engine has been completely removed. If you were using TikTok TTS:

1. Configure at least one of the premium engines (Google, Speechify, ElevenLabs, OpenAI)
2. The default engine is now Google Cloud TTS
3. Update your configuration accordingly
4. All existing features remain available with the new engines

## Technical Details

Performance mode affects these engine parameters:
- `timeout`: Maximum time to wait for API response
- `maxRetries`: Number of retry attempts on failure

Engines are automatically reinitialized when performance mode changes, so changes take effect immediately without restart.
