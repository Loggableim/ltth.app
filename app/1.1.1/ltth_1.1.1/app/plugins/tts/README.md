# TTS Plugin System v2.0

Enterprise-grade Text-to-Speech plugin for Pup Cids Little TikTok Helper with multi-engine support, advanced permission system, language detection, caching, and professional queue management.

## 🎯 Features

### Core Features
- **Multi-Engine Support**
  - TikTok TTS (Free, 75+ voices, multiple languages)
  - Google Cloud TTS (Optional, premium quality, 100+ voices)
  - Automatic fallback between engines
  - Engine-specific voice selection

- **Permission System**
  - Team-level gating (minimum level requirement)
  - Manual whitelist/blacklist per user
  - Voice assignment auto-grants permission
  - Flexible permission overrides

- **Language Detection & Routing**
  - Automatic language detection from text
  - Auto-routing to appropriate voice
  - Support for 15+ languages
  - Per-user language preferences

- **Audio Caching**
  - Hash-based caching system
  - Configurable TTL (default 24 hours)
  - Automatic cleanup
  - Cache statistics and management

- **Priority Queue System**
  - FIFO with priority overrides
  - Team-level priority boost
  - Gift/manual trigger priority
  - Rate limiting per user

- **Profanity Filter**
  - Three modes: Off, Moderate, Strict
  - Multi-language support (EN, DE, ES, FR)
  - Customizable word lists
  - Replace or drop policies

### Additional Features
- Per-user volume gain control
- Audio ducking support
- Queue size limits with backpressure
- Comprehensive statistics
- Real-time queue monitoring
- Manual TTS triggering
- Voice preview/testing

## 📁 Structure

```
plugins/tts/
├── main.js                      # Main plugin class
├── plugin.json                  # Plugin manifest
├── README.md                    # This file
├── engines/
│   ├── tiktok-engine.js        # TikTok TTS implementation
│   └── google-engine.js        # Google Cloud TTS implementation
├── utils/
│   ├── cache-manager.js        # Audio caching system
│   ├── language-detector.js   # Language detection
│   ├── profanity-filter.js    # Content filtering
│   ├── permission-manager.js  # Permission system
│   └── queue-manager.js       # Queue & rate limiting
├── ui/
│   ├── admin-panel.html       # Admin control panel
│   └── tts-admin.js           # Admin panel logic
└── cache/                      # Cached audio files (auto-generated)
```

## 🚀 Installation

The plugin is automatically loaded by the plugin system. No manual installation required.

## ⚙️ Configuration

### Quick Start

1. **Access Admin Panel**
   - Navigate to: `http://localhost:3000/plugins/tts/ui/admin-panel.html`
   - Or integrate into main dashboard

2. **Basic Setup**
   - Select default engine (TikTok is free, no setup needed)
   - Choose default voice
   - Set team level requirement (0 = everyone)
   - Enable/disable chat TTS
   - Save configuration

3. **Google Cloud TTS (Optional)**
   - Get API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Enable "Cloud Text-to-Speech API"
   - Enter API key in admin panel
   - Select Google as default engine

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultEngine` | TTS engine to use | `tiktok` |
| `defaultVoice` | Fallback voice ID | `en_us_ghostface` |
| `volume` | Global volume (0-100) | `80` |
| `speed` | Speech rate (0.5-2.0) | `1.0` |
| `teamMinLevel` | Minimum team level for TTS | `0` |
| `rateLimit` | Messages per user per window | `3` |
| `rateLimitWindow` | Time window in seconds | `60` |
| `maxQueueSize` | Maximum queue capacity | `100` |
| `maxTextLength` | Max characters per message | `300` |
| `cacheTTL` | Cache lifetime in seconds | `86400` (24h) |
| `profanityFilter` | Filter mode (off/moderate/strict) | `moderate` |
| `duckOtherAudio` | Lower other audio during TTS | `false` |
| `enabledForChat` | Enable auto-TTS for chat | `true` |
| `autoLanguageDetection` | Detect language automatically | `true` |

## 🎤 Usage

### Automatic Chat TTS

When `enabledForChat` is enabled, all chat messages are automatically processed:
1. Permission check (team level + whitelist/blacklist)
2. Profanity filtering
3. Language detection (if no voice assigned)
4. Cache lookup or synthesis
5. Queue for playback

### Manual TTS Trigger

**Via HTTP API:**
```bash
curl -X POST http://localhost:3000/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "username": "TestUser",
    "source": "manual"
  }'
```

**Via Socket.IO:**
```javascript
socket.emit('tts:speak', {
  text: 'Hello world',
  username: 'TestUser',
  source: 'manual'
});
```

**Via Admin Panel:**
- Go to Queue & Playback tab
- Enter text in "Test TTS" field
- Click "Speak" button

### User Management

**Whitelist User (Manual Permission):**
```bash
curl -X POST http://localhost:3000/api/tts/users/{userId}/allow \
  -H "Content-Type: application/json" \
  -d '{"username": "TestUser"}'
```

**Assign Voice (Auto-grants Permission):**
```bash
curl -X POST http://localhost:3000/api/tts/users/{userId}/voice \
  -H "Content-Type: application/json" \
  -d '{
    "username": "TestUser",
    "voiceId": "de_002",
    "engine": "tiktok"
  }'
```

**Blacklist User:**
```bash
curl -X POST http://localhost:3000/api/tts/users/{userId}/blacklist \
  -H "Content-Type: application/json" \
  -d '{"username": "SpamUser"}'
```

## 🔌 API Reference

### HTTP Endpoints

#### Configuration
- `GET /api/tts/config` - Get current configuration
- `POST /api/tts/config` - Update configuration

#### Voices
- `GET /api/tts/voices?engine={engine}` - Get available voices
  - `engine`: `all`, `tiktok`, or `google`

#### Speech
- `POST /api/tts/speak` - Trigger TTS manually
  - Body: `{ text, username, userId?, voiceId?, engine?, source? }`

#### Queue
- `GET /api/tts/queue` - Get queue info and statistics
- `POST /api/tts/queue/clear` - Clear entire queue
- `POST /api/tts/queue/skip` - Skip current item

#### Users
- `GET /api/tts/users?filter={filter}` - List users
  - `filter`: `whitelisted`, `blacklisted`, `voice_assigned`
- `POST /api/tts/users/:userId/allow` - Whitelist user
- `POST /api/tts/users/:userId/deny` - Revoke permission
- `POST /api/tts/users/:userId/blacklist` - Blacklist user
- `POST /api/tts/users/:userId/unblacklist` - Remove from blacklist
- `POST /api/tts/users/:userId/voice` - Assign voice
- `DELETE /api/tts/users/:userId/voice` - Remove voice assignment
- `DELETE /api/tts/users/:userId` - Delete user record

#### Cache
- `GET /api/tts/cache/stats` - Get cache statistics
- `POST /api/tts/cache/clear` - Clear cache

#### Statistics
- `GET /api/tts/permissions/stats` - Get permission statistics

### Socket.IO Events

#### Client → Server
- `tts:speak` - Request TTS
- `tts:queue:status` - Request queue status
- `tts:queue:clear` - Clear queue
- `tts:queue:skip` - Skip current

#### Server → Client
- `tts:play` - Play audio (contains base64 audioData)
- `tts:queued` - Item added to queue
- `tts:playback:started` - Playback started
- `tts:playback:ended` - Playback ended
- `tts:playback:error` - Playback error
- `tts:queue:cleared` - Queue cleared
- `tts:queue:skipped` - Item skipped
- `tts:error` - General error

## 🎨 Available Voices

### TikTok TTS
- **English**: 20+ voices (US, UK, AU accents + Disney characters)
- **German**: 2 voices (male, female)
- **Spanish**: 2 voices
- **French**: 2 voices
- **Portuguese**: 3 voices (BR)
- **Japanese**: 4 voices
- **Korean**: 3 voices
- **Chinese**: 2 voices
- **Plus**: Italian, Russian, Arabic, Turkish, Thai, Vietnamese, Indonesian, Dutch, Polish

### Google Cloud TTS (with API key)
- **German**: 10 voices (Wavenet, Neural2, Standard)
- **English US**: 20+ voices
- **English GB**: 9 voices
- **English AU**: 6 voices
- **Spanish**: 3 voices
- **French**: 5 voices
- **Italian**: 4 voices
- **Japanese**: 6 voices
- **Korean**: 4 voices
- **Portuguese BR**: 4 voices

## 🔧 Advanced Features

### Language Detection

Automatic language detection uses the `franc-min` library with confidence scoring:
- Analyzes text content
- Maps to ISO 639-1 language codes
- Routes to appropriate default voice
- Caches recent detections for performance

### Profanity Filter

Three operation modes:
- **Off**: No filtering
- **Moderate**: Replace profanity with asterisks
- **Strict**: Drop messages containing profanity

Custom word lists can be added per language via the API.

### Queue Priority System

Priority calculation:
```
priority = baseScore + teamLevel * 10 + bonuses

Bonuses:
- Subscriber: +5
- Gift trigger: +20
- Manual trigger: +50
```

Higher priority items play first. Same priority = FIFO.

### Rate Limiting

Prevents spam by limiting messages per user:
- Configurable limit (default: 3 messages per 60 seconds)
- Per-user tracking with sliding window
- Automatic cleanup of old timestamps
- Clear rate limit via API for specific users

### Audio Caching

Hash-based caching:
- Hash: `SHA256(text + voice + engine + speed)`
- Stored as MP3 files
- SQLite metadata: use count, last used, file size
- Automatic cleanup based on TTL
- Manual cache clear available

Cache hit rate improves performance significantly for repeated phrases.

## 📊 Monitoring & Statistics

The admin panel provides real-time statistics:

**Queue Statistics:**
- Total queued
- Total played
- Total dropped (queue full)
- Total rate limited
- Current queue size

**Permission Statistics:**
- Total users
- Whitelisted users
- Blacklisted users
- Users with assigned voices

**Cache Statistics:**
- Total entries
- Total uses
- Average uses per entry
- Cache size (MB)
- TTL configuration

## 🐛 Troubleshooting

### TTS Not Working
1. Check plugin is enabled: Plugin should appear in `/api/plugins` list
2. Check configuration: Visit admin panel, verify settings
3. Check permissions: Ensure user meets team level or is whitelisted
4. Check logs: Server console shows TTS events

### Google TTS Not Working
1. Verify API key is correct
2. Check Google Cloud Console: API must be enabled
3. Check billing: Google TTS requires active billing
4. Check quota: May hit daily limits

### Queue Filling Up
1. Increase `maxQueueSize` if needed
2. Enable stricter `profanityFilter`
3. Increase `teamMinLevel` to reduce volume
4. Adjust `rateLimit` for flood control

### Cache Growing Large
1. Reduce `cacheTTL` for more frequent cleanup
2. Use "Clear Cache" button in admin panel
3. Check cache statistics to monitor growth
4. Automatic cleanup runs every 6 hours

## 📝 Development

### Plugin API Integration

The TTS plugin uses the official PluginAPI:

```javascript
class TTSPlugin {
    constructor(api) {
        this.api = api;

        // Available methods:
        this.api.registerRoute(method, path, handler);
        this.api.registerSocket(event, callback);
        this.api.registerTikTokEvent(event, callback);
        this.api.emit(event, data);
        this.api.getConfig(key);
        this.api.setConfig(key, value);
        this.api.log(message, level);
        this.api.getDatabase();
        this.api.getSocketIO();
        this.api.getApp();
    }

    async init() {
        // Initialization logic
    }

    async destroy() {
        // Cleanup logic
    }
}
```

### Extending the Plugin

**Add Custom Voice:**
1. Edit `engines/tiktok-engine.js` or `engines/google-engine.js`
2. Add voice ID to `getVoices()` method
3. Restart plugin

**Add Custom Profanity Words:**
```javascript
// Via API
profanityFilter.addWords('en', ['word1', 'word2']);
```

**Custom Priority Logic:**
Modify `_calculatePriority()` in `utils/queue-manager.js`

## 🔒 Security Notes

- Google API keys are stored in database, not in logs
- Rate limiting prevents abuse
- Profanity filter protects against inappropriate content
- Blacklist system for problematic users
- Max text length prevents oversized requests
- Cache files are local, no external data sharing

## 📜 License

CC BY-NC 4.0 License - Part of Pup Cids Little TikTok Helper

## 🆘 Support

For issues, feature requests, or questions:
- GitHub Issues: [Your Repo]
- Email: loggableim@gmail.com

## 🙏 Credits

- TikTok TTS API: Community endpoints
- Google Cloud TTS: Google Cloud Platform
- Language Detection: franc-min library
- Built with: Node.js, Express, Socket.IO, Better-SQLite3

---

**Version**: 2.0.0
**Last Updated**: 2025-01-12
**Author**: Pup Cid
