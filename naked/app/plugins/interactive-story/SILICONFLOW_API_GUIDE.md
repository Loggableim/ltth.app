# SiliconFlow API Integration Guide

## Overview
This document provides comprehensive information about integrating with SiliconFlow's APIs for LLM chat completions, image generation, and TTS (Text-to-Speech).

**Official Documentation:** https://docs.siliconflow.com/en/userguide/introduction

## API Key Management

### Where to Get API Key
1. Sign up at https://cloud.siliconflow.com/
2. Navigate to API Keys section
3. Create a new API key

### LTTH Integration
In LTTH, the SiliconFlow API key is stored globally in the settings database:
- **Database key:** `tts_fishspeech_api_key` 
- **UI Location:** Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)
- **Access in plugins:** Via `this.api.getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get('tts_fishspeech_api_key')`

## Authentication

### Header Format
All SiliconFlow API requests require Bearer token authentication:

```javascript
headers: {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
}
```

**Important:** The API key must be prefixed with `Bearer ` (with a space after "Bearer").

### Common Authentication Errors

**401 Unauthorized:**
- Missing or invalid API key
- Incorrect header format (missing "Bearer " prefix)
- API key not activated or expired
- API key quota exceeded

**Fix:** Ensure the Authorization header is exactly: `Authorization: Bearer YOUR_API_KEY`

## Chat Completions API

### Endpoint
```
POST https://api.siliconflow.com/v1/chat/completions
```

### Supported Models
```javascript
{
  'deepseek': 'deepseek-ai/DeepSeek-V3',
  'qwen': 'Qwen/Qwen2.5-7B-Instruct', 
  'llama': 'meta-llama/Meta-Llama-3.1-8B-Instruct'
}
```

### Request Format
```javascript
{
  "model": "deepseek-ai/DeepSeek-V3",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Tell me a story."
    }
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

### Response Format
```javascript
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek-ai/DeepSeek-V3",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Once upon a time..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 100,
    "total_tokens": 120
  }
}
```

### Parameters
- **model** (required): Model identifier
- **messages** (required): Array of message objects with `role` and `content`
- **max_tokens**: Maximum tokens in response (default: varies by model)
- **temperature**: Randomness 0.0-1.0 (default: 0.7)
- **top_p**: Nucleus sampling (default: 1.0)
- **stream**: Enable streaming responses (default: false)
- **presence_penalty**: Penalty for token presence -2.0 to 2.0
- **frequency_penalty**: Penalty for token frequency -2.0 to 2.0

## Image Generation API

### Endpoint
```
POST https://api.siliconflow.com/v1/images/generations
```

### Supported Models
```javascript
{
  'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'z-image-turbo': 'Tongyi-MAI/Z-Image-Turbo'
}
```

### Request Format
```javascript
{
  "model": "black-forest-labs/FLUX.1-schnell",
  "prompt": "A fantasy castle on a mountain",
  "image_size": "1024x1024",
  "batch_size": 1,
  "seed": null
}
```

### Response Format
```javascript
{
  "images": [
    {
      "url": "https://siliconflow-image-cdn.com/xxx.png",
      "seed": 123456
    }
  ],
  "timings": {
    "inference": 2.5
  }
}
```

### Parameters
- **model** (required): Image model identifier
- **prompt** (required): Text description of desired image
- **image_size**: Resolution (e.g., "1024x1024", "512x512")
- **batch_size**: Number of images to generate (default: 1)
- **seed**: Random seed for reproducibility (optional)
- **num_inference_steps**: Quality vs speed tradeoff (model-dependent)
- **guidance_scale**: How closely to follow prompt (default: 7.5)

## TTS (Text-to-Speech) API

### Endpoint
```
POST https://api.siliconflow.com/v1/audio/speech
```

### Supported Voices
Fish Speech 1.5 supports multiple voice options. Refer to SiliconFlow docs for current voice list.

### Request Format
```javascript
{
  "model": "fishaudio/fish-speech-1.5",
  "input": "Hello, this is a test.",
  "voice": "default",
  "response_format": "mp3",
  "speed": 1.0
}
```

### Response
Binary audio data (MP3, WAV, etc.) based on `response_format`.

### Parameters
- **model** (required): TTS model identifier
- **input** (required): Text to convert to speech
- **voice**: Voice identifier (default: "default")
- **response_format**: Audio format ("mp3", "wav", "opus", "flac")
- **speed**: Playback speed 0.25-4.0 (default: 1.0)

## Rate Limits & Quotas

### Free Tier
- Limited requests per day/month
- Lower priority during high demand
- Slower inference times

### Paid Tier
- Higher request limits
- Priority processing
- Faster inference
- Access to premium models

**Check your quota:** https://cloud.siliconflow.com/account/usage

## Error Handling

### Common Error Codes
- **400 Bad Request:** Invalid request format or parameters
- **401 Unauthorized:** Missing or invalid API key
- **403 Forbidden:** API key lacks permission for requested resource
- **429 Too Many Requests:** Rate limit exceeded
- **500 Internal Server Error:** SiliconFlow service error
- **503 Service Unavailable:** Service temporarily down

### Best Practices
1. **Always validate API key before use**
2. **Implement exponential backoff** for rate limit errors
3. **Cache responses** when possible to reduce API calls
4. **Set reasonable timeouts** (30-60 seconds recommended)
5. **Log all API errors** with full context for debugging
6. **Handle network errors** gracefully with retries
7. **Validate response structure** before using data

## Integration Checklist

### For Plugin Developers
- [ ] Retrieve API key from global settings (`tts_fishspeech_api_key`)
- [ ] Use correct Authorization header format: `Bearer ${apiKey}`
- [ ] Implement proper error handling for all API calls
- [ ] Add timeout configuration (30s recommended)
- [ ] Cache API responses when appropriate
- [ ] Log errors with context (model, prompt length, etc.)
- [ ] Validate API key exists before making requests
- [ ] Handle 401 errors with helpful user messages
- [ ] Test with valid and invalid API keys
- [ ] Document API key setup in plugin README

## Example: Retrieving API Key in Plugin

```javascript
/**
 * Get SiliconFlow API key from global settings
 */
_getSiliconFlowApiKey() {
  const db = this.api.getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tts_fishspeech_api_key');
  return row ? row.value : null;
}

/**
 * Initialize services with API key from settings
 */
async init() {
  // Get API key from global settings
  const apiKey = this._getSiliconFlowApiKey();
  
  if (!apiKey) {
    this.logger.warn('⚠️ SiliconFlow API key not configured in settings');
    this.logger.warn('Please configure API key in Settings → TTS API Keys → Fish Speech 1.5');
    return;
  }
  
  // Initialize services
  this.llmService = new LLMService(apiKey, this.logger);
  this.imageService = new ImageService(apiKey, this.logger, this.cacheDir);
  this.ttsService = new TTSService(apiKey, this.logger, this.audioDir);
  
  this.logger.info('✅ SiliconFlow services initialized');
}
```

## Debugging 401 Errors

### Step-by-Step Troubleshooting
1. **Verify API key exists in settings database:**
   ```sql
   SELECT value FROM settings WHERE key = 'tts_fishspeech_api_key';
   ```

2. **Check Authorization header format:**
   ```javascript
   console.log('Header:', `Bearer ${apiKey}`);
   // Should print: Bearer sk-xxxxx (not Bearer: sk-xxxxx)
   ```

3. **Test API key with curl:**
   ```bash
   curl -X POST https://api.siliconflow.com/v1/chat/completions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-ai/DeepSeek-V3","messages":[{"role":"user","content":"test"}]}'
   ```

4. **Verify API key is active on SiliconFlow dashboard**
5. **Check for leading/trailing whitespace in stored key**
6. **Ensure API key hasn't expired or been revoked**

## Migration Notes

### Moving from Plugin-Specific to Global Settings

**Before (Plugin-specific storage):**
```javascript
const config = this.api.getConfig('story-config');
const apiKey = config.siliconFlowApiKey;
```

**After (Global settings):**
```javascript
const db = this.api.getDatabase();
const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tts_fishspeech_api_key');
const apiKey = row ? row.value : null;
```

**Benefits:**
- Single API key for all SiliconFlow features
- Centralized management in Settings UI
- Better security (masked display)
- Consistent with other TTS providers

## Resources

- **Official Docs:** https://docs.siliconflow.com
- **API Reference:** https://docs.siliconflow.com/en/api-reference
- **Model List:** https://docs.siliconflow.com/en/models
- **Dashboard:** https://cloud.siliconflow.com
- **Support:** https://discord.gg/siliconflow (check docs for current link)

---

**Last Updated:** 2025-12-12
**For:** LTTH (Little TikTok Helper) Plugin Developers
