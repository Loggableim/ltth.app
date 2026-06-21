# AnimazingPal Standalone Mode & Persona System

## Overview

This implementation adds a standalone mode to AnimazingPal with fully customizable AI personas. The system allows complete control over TikTok chat/event processing, AI response generation, and Animaze animation triggering, with each persona having unique personality traits, voice styles, and behavioral settings.

## Features

### 1. Standalone Mode
- **Full Independence**: AnimazingPal handles all TikTok events without relying on Animaze ChatPal
- **Echo Mode Integration**: Uses Animaze Echo mode for TTS-only operation
- **Event Processing**: Processes chat, gifts, follows, likes, shares, and subscriptions independently
- **Dynamic Animations**: Triggers persona-specific emotes based on context and energy level

### 2. Customizable AI Personas
Each persona includes:
- **Voice Style**: Descriptive voice characteristics (e.g., "warm,friendly,enthusiastic")
- **Tone Settings**: GPT parameters (temperature, presence penalty, frequency penalty)
- **Emote Configuration**: Context-aware emotes (default, high-energy, low-energy)
- **Memory Behavior**: Memory importance thresholds and context limits
- **Catchphrases**: Unique phrases that characterize the persona
- **System Prompt**: Complete personality description for GPT

### 3. GPT Integration with Personas
- **Dynamic System Prompts**: Uses persona-specific prompts for all responses
- **Tone Adjustment**: Applies temperature and penalties from persona settings
- **Memory Management**: Uses persona-specific memory behavior settings
- **Context-Aware Responses**: Considers persona characteristics in all interactions

### 4. TikTok Event Handling
- **Gift Events**: Thank users with persona-specific responses + appropriate emotes
- **Chat Events**: Respond with personality-consistent messages + low-energy emotes
- **Follow Events**: Welcome followers with persona-appropriate greetings + high-energy emotes
- **Context Sensitivity**: Different emotes for high vs. low energy situations

## Database Schema

### Persona Table Structure
```sql
CREATE TABLE animazingpal_personalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  voice_style TEXT,
  emotion_tendencies TEXT,
  catchphrases TEXT,
  topics_of_interest TEXT,
  response_style TEXT,
  language TEXT DEFAULT 'de',
  is_active INTEGER DEFAULT 0,
  is_custom INTEGER DEFAULT 0,
  tone_settings TEXT,          -- NEW
  emote_config TEXT,           -- NEW
  memory_behavior TEXT,        -- NEW
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Persona JSON Data Structure

#### Complete Persona Object
```json
{
  "name": "chill_vibes",
  "displayName": "Chill Streamer",
  "description": "Entspannter Streamer mit ruhigem Ton und lockerer Sprache.",
  "systemPrompt": "Du bist ein entspannter, ruhiger Streamer...",
  "voiceStyle": "calm,thoughtful,soothing",
  "catchphrases": [
    "Alles easy",
    "Nimm dir Zeit",
    "Das ist okay",
    "Vibe with me"
  ],
  "emotionTendencies": {
    "neutral": 0.5,
    "content": 0.3,
    "thoughtful": 0.2
  },
  "toneSettings": {
    "temperature": 0.7,
    "presencePenalty": 0.3,
    "frequencyPenalty": 0.2
  },
  "emoteConfig": {
    "defaultEmote": "calm",
    "highEnergyEmote": "smile",
    "lowEnergyEmote": "think"
  },
  "memoryBehavior": {
    "importanceThreshold": 0.4,
    "maxContextMemories": 5
  }
}
```

## API Endpoints

### Brain Configuration
- `POST /api/animazingpal/brain/config` - Update brain settings
  ```json
  {
    "enabled": true,
    "standaloneMode": true,
    "openaiApiKey": "sk-...",
    "model": "gpt-4o-mini"
  }
  ```

### Persona Management (CRUD)

#### Get All Personas
```
GET /api/animazingpal/brain/personalities
```

#### Get Single Persona
```
GET /api/animazingpal/brain/personality/:name
```

#### Create Persona
```
POST /api/animazingpal/brain/personality/create
Content-Type: application/json

{
  "name": "my_custom_persona",
  "display_name": "My Custom Persona",
  "system_prompt": "Du bist...",
  "tone_settings": {
    "temperature": 0.8,
    "presencePenalty": 0.4,
    "frequencyPenalty": 0.3
  },
  "emote_config": {
    "defaultEmote": "smile",
    "highEnergyEmote": "excited",
    "lowEnergyEmote": "calm"
  },
  "memory_behavior": {
    "importanceThreshold": 0.5,
    "maxContextMemories": 10
  }
}
```

#### Update Persona
```
PUT /api/animazingpal/brain/personality/:name
Content-Type: application/json

{
  "display_name": "Updated Name",
  "tone_settings": { ... }
}
```

#### Delete Persona
```
DELETE /api/animazingpal/brain/personality/:name
```
Note: Only custom personas (is_custom=1) can be deleted.

#### Set Active Persona
```
POST /api/animazingpal/brain/personality/set
Content-Type: application/json

{
  "name": "chill_vibes"
}
```

## Implementation Details

### Event Flow

#### Gift Event Processing
```javascript
1. TikTok gift event received
2. Brain Engine processes gift with current persona
3. GPT generates response using persona's:
   - System prompt
   - Tone settings (temperature, penalties)
   - User context & memories
4. Response sent to Animaze via Echo Mode (if standalone)
5. Appropriate emote triggered:
   - High value gift → highEnergyEmote
   - Normal gift → defaultEmote
```

#### Chat Event Processing
```javascript
1. TikTok chat message received
2. Brain Engine evaluates relevance
3. If relevant, generate response with persona settings
4. Send response to Animaze via Echo Mode
5. Trigger lowEnergyEmote or defaultEmote
```

### Persona-Driven GPT Calls

```javascript
// In brain-engine.js
const gptOptions = {
  memories: contextMemories,
  userInfo: userProfile,
  conversationHistory: history,
  // Persona tone settings applied here
  ...this.currentPersona.tone_settings
};

const result = await this.gptBrain.generateChatResponse(
  username,
  message,
  this.currentPersona.system_prompt,
  gptOptions
);

// Returns with emote config
return {
  text: result.content,
  emotion: emotion,
  emoteConfig: this.currentPersona.emote_config
};
```

### Standalone Mode Operation

When `standaloneMode` is enabled:
1. All TikTok events bypass legacy ChatPal forwarding
2. AI responses sent with Echo prefix (`-echo`)
3. Animaze performs TTS without AI processing
4. AnimazingPal maintains complete control over responses

```javascript
// In main.js event handlers
const useEcho = this.config.brain?.standaloneMode || false;
this.sendChatMessage(response.text, useEcho);
```

## Default Personas

### 1. Friendly Streamer (friendly_streamer)
- **Style**: Warm, enthusiastic, welcoming
- **Temperature**: 0.8 (creative)
- **Emotes**: smile → excited → wave
- **Memory**: 8 contexts, threshold 0.4

### 2. Gaming Pro (gaming_pro)
- **Style**: Confident, analytical, witty
- **Temperature**: 0.6 (focused)
- **Emotes**: think → victory → neutral
- **Memory**: 6 contexts, threshold 0.5

### 3. Entertainer (entertainer)
- **Style**: Energetic, funny, dramatic
- **Temperature**: 0.9 (highly creative)
- **Emotes**: laugh → dance → smile
- **Memory**: 10 contexts, threshold 0.3

### 4. Chill Vibes (chill_vibes)
- **Style**: Calm, thoughtful, soothing
- **Temperature**: 0.7 (balanced)
- **Emotes**: calm → smile → think
- **Memory**: 5 contexts, threshold 0.4

### 5. Anime Fan (anime_fan)
- **Style**: Kawaii, enthusiastic, expressive
- **Temperature**: 0.85 (creative with flair)
- **Emotes**: kawaii → excited → shy
- **Memory**: 9 contexts, threshold 0.35

## UI Components

### Brain Settings Section
- Enable/disable KI Brain
- Toggle Standalone Mode
- Configure OpenAI API key
- Select GPT model

### Persona Management Dashboard
- List all personas (default + custom)
- Highlight active persona
- Create/Edit/Delete personas
- Switch active persona instantly

### Persona Editor Form
- Basic info (name, display name, description)
- System prompt (personality definition)
- Voice style
- Catchphrases (JSON array)
- Tone settings (temperature, penalties)
- Emote configuration (default, high, low)
- Memory behavior settings

## Testing

### Running Tests
```bash
cd app
node test/verify-persona-system.js
```

### Test Coverage
1. ✅ Database schema validation
2. ✅ Default persona initialization
3. ✅ CRUD operations (Create, Read, Update, Delete)
4. ✅ Active persona switching
5. ✅ BrainEngine integration
6. ✅ Field parsing (JSON → objects)
7. ✅ Custom vs. default persona protection

## Configuration Example

### Complete Config Object
```javascript
{
  enabled: true,
  autoConnect: true,
  host: '127.0.0.1',
  port: 8008,
  brain: {
    enabled: true,
    standaloneMode: true,  // NEW
    openaiApiKey: 'sk-...',
    model: 'gpt-4o-mini',
    activePersonality: 'chill_vibes',
    autoRespond: {
      chat: true,
      gifts: true,
      follows: true,
      shares: false
    },
    maxResponsesPerMinute: 10,
    chatResponseProbability: 0.3
  }
}
```

## Migration Notes

### For Existing Installations
1. Database migrations are automatic (ALTER TABLE)
2. Existing personas receive default tone/emote/memory settings
3. No breaking changes to existing APIs
4. Legacy ChatPal mode still works (when standalone=false)

### Backwards Compatibility
- All existing features remain functional
- New fields have sensible defaults
- Optional: enable standalone mode when ready
- Can switch between standalone and legacy modes

## Future Enhancements

### Potential Features
- [ ] Persona presets/templates for quick creation
- [ ] A/B testing between personas
- [ ] Analytics per persona (engagement metrics)
- [ ] Voice cloning integration per persona
- [ ] Scheduled persona switching
- [ ] Community persona sharing

## Troubleshooting

### Common Issues

**Personas not appearing:**
- Check Brain Engine initialization
- Verify database connection
- Check browser console for errors

**GPT responses not using persona settings:**
- Ensure persona is set as active
- Verify OpenAI API key is configured
- Check that standalone mode is enabled

**Emotes not triggering:**
- Verify Animaze connection is active
- Check emote names match available emotes
- Ensure event handlers are registered

**Standalone mode not working:**
- Confirm `standaloneMode: true` in config
- Check that Animaze Echo mode is enabled
- Verify TikTok events are being received

## Support

For issues or questions:
1. Check the test suite: `node test/verify-persona-system.js`
2. Review the implementation in `animazingpal/brain/`
3. Examine logs for error messages
4. Verify database schema with `PRAGMA table_info`

## Credits

Implemented as part of AnimazingPal enhancement for LTTH Desktop v2.
