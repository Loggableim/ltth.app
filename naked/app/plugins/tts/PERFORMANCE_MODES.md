# TTS Performance Modes

## Overview

The TTS system supports three performance modes to optimize text-to-speech generation for different hardware capabilities and use cases. Additionally, Fish.audio engine supports **streaming mode** for ultra-low latency audio delivery.

## Performance Modes

### 🚀 Fast Mode (Low-Resource / "Toaster PCs")

**Best for:** Low-end PCs, laptops with limited resources, or when you need the fastest possible response times.

**Settings:**
- Timeout: 5 seconds per attempt
- Retries: 1 (2 total attempts)
- Total max wait time: ~10 seconds per engine
- **Fish.audio: Streaming enabled (low-latency mode)**

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
- **Fish.audio: Streaming enabled (low-latency mode)**

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
- **Fish.audio: Streaming disabled (quality mode)**

**Use cases:**
- High-quality production streams
- Poor/unstable network connections
- When TTS reliability is critical
- Systems with plenty of resources

**Trade-off:** Slower, but maximum reliability.

## 🌊 Fish.audio Streaming Mode (Low-Latency)

### What is Streaming Mode?

In **Fast** and **Balanced** modes, Fish.audio uses **streaming synthesis** to minimize Time-to-First-Audio (TTFA). Instead of waiting for the complete audio file to be generated, audio chunks are sent to the client immediately as they're generated, significantly reducing perceived latency.

### How It Works

1. **Lazy Queuing:** When a TTS request is made, the message is queued immediately without waiting for synthesis
2. **Async Synthesis:** Audio synthesis happens in the background as the queue processes
3. **Chunk Streaming:** Audio data is sent to clients in real-time chunks via `tts:stream:chunk` socket events
4. **Immediate Playback:** Clients can start playing audio as soon as the first chunk arrives

### Benefits

- **Reduced Latency:** Up to 70-90% faster time-to-first-audio
- **Better User Experience:** Live chat messages are spoken almost immediately
- **Resource Efficient:** Doesn't block the queue while generating audio
- **Automatic Fallback:** If streaming fails, automatically falls back to regular synthesis

### When Streaming is Used

- **Enabled:** Fish.audio in Fast or Balanced mode
- **Disabled:** Fish.audio in Quality mode (uses traditional buffered synthesis)
- **Not Applicable:** Other engines (Google, Speechify, ElevenLabs, OpenAI, SiliconFlow) always use buffered synthesis

### Socket Events

**Client-Side Integration:**
```javascript
// Listen for streaming chunks
socket.on('tts:stream:chunk', (data) => {
    // data.id: Queue item ID
    // data.chunk: Base64-encoded audio chunk
    // data.isFirst: true for first chunk
    // data.volume: Volume setting
    // data.speed: Speed setting
    // data.duckOther: Duck other audio
    // data.duckVolume: Ducking volume
});
```

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

### For Ultra-Low Latency (Live Chat Interactions)
```json
{
  "performanceMode": "fast",
  "defaultEngine": "fishaudio",
  "enableAutoFallback": true
}
```
**Note:** Fish.audio streaming provides the lowest Time-to-First-Audio for immediate live interaction feedback.

### For Streaming on Low-End PCs ("Toaster PCs")
```json
{
  "performanceMode": "fast",
  "defaultEngine": "google",
  "enableAutoFallback": true
}
```

### For Professional Streams with Fish.audio
```json
{
  "performanceMode": "balanced",
  "defaultEngine": "fishaudio",
  "enableAutoFallback": true
}
```
**Note:** Balanced mode with Fish.audio provides streaming benefits while maintaining good reliability.

### For Maximum Quality (Premium Streams)
```json
{
  "performanceMode": "quality",
  "defaultEngine": "elevenlabs",
  "enableAutoFallback": true
}
```
**Note:** Quality mode disables streaming for Fish.audio to ensure maximum audio quality and reliability.

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
