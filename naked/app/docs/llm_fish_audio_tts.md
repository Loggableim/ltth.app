# Fish.audio TTS Engine - Complete Implementation Guide for LLMs

## OVERVIEW
Fish.audio S1 TTS engine integration for LTTH (Little TikTool Helper). Replace SiliconFlow proxy with official Fish.audio API. Required for story plugin.

## CORE REQUIREMENTS
- **API**: `https://api.fish.audio/v1/tts` (POST, JSON)
- **Model**: `s1` (Fish Audio S1, latest generation)
- **Auth**: `Authorization: Bearer {apiKey}` header, `model: s1` header
- **Response**: Binary audio (arraybuffer) → base64 encoding

## FILE STRUCTURE
```
app/plugins/tts/engines/fishspeech-engine.js  # Main engine (390 lines)
app/plugins/tts/main.js                        # Integration point
FISH_AUDIO_INTEGRATION.md                     # User docs (German)
app/docs/llm_fish_audio_tts.md                # This file (LLM docs)
```

## ENGINE CLASS STRUCTURE

### Constants
```javascript
class FishSpeechEngine {
  static DEFAULT_REFERENCE_ID = '933563129e564b19a115bedd57b7406a'; // Sarah voice
  static OPUS_AUTO_BITRATE = -1000;
}
```

### Constructor Requirements
```javascript
constructor(apiKey, logger, config = {})
- Validate apiKey (non-empty string)
- Set: apiBaseUrl, apiSynthesisUrl, model='s1'
- Performance mode: fast(8s/1retry), balanced(15s/2retry), quality(30s/3retry)
- Initialize emotion arrays: supportedEmotions(49), supportedTones(5), supportedEffects(14)
```

### Voice Map (getVoices)
Return object with keys: fish-egirl, fish-energetic-male, fish-sarah, fish-adrian, fish-selene, fish-ethan
Each contains: name, lang, gender, model='s1', reference_id, description, supportedEmotions=true

### Synthesize Method Signature
```javascript
async synthesize(text, voiceId='fish-sarah', speed=1.0, options={})
Options: {
  format: 'mp3'|'wav'|'opus'|'pcm',
  emotion: string,           // Auto-inject into text if not present
  normalize: true,           // Text normalization
  latency: 'normal'|'balanced',
  chunk_length: 100-300,     // Default: 200
  mp3_bitrate: 64|128|192,   // Default: 128
  opus_bitrate: number,      // Auto: -1000
  pitch: -1.0 to 1.0,        // Prosody
  volume: 0.0 to 2.0         // Prosody
}
```

### Request Body Structure
```javascript
{
  text: processedText,              // With emotion markers
  reference_id: voiceReferenceId,   // From voice config
  format: 'mp3',
  mp3_bitrate: 128,
  normalize: true,
  latency: 'balanced',
  chunk_length: 200,
  opus_bitrate: -1000              // Only if format='opus'
}
```

### Retry Logic
- Max retries from performanceMode
- Exponential backoff: 2^(attempt-1) * 1000ms
- Retryable: ECONNABORTED, ETIMEDOUT, status>=500
- Non-retryable: 4xx errors
- Log each attempt with detail

## EMOTION SYSTEM (64+ MARKERS)

### Basic Emotions (24)
neutral, happy, sad, angry, excited, calm, nervous, confident, surprised, satisfied, delighted, scared, worried, upset, frustrated, depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed, grateful, curious, sarcastic

### Advanced Emotions (25)
disdainful, unhappy, anxious, hysterical, indifferent, uncertain, doubtful, confused, disappointed, regretful, guilty, ashamed, jealous, envious, hopeful, optimistic, pessimistic, nostalgic, lonely, bored, contemptuous, sympathetic, compassionate, determined, resigned

### Tone Markers (5)
in a hurry tone, shouting, screaming, whispering, soft tone

### Audio Effects (14)
laughing, chuckling, sobbing, crying loudly, sighing, groaning, panting, gasping, yawning, snoring, break, long-break, breath, laugh, cough, lip-smacking, sigh, audience laughing, background laughter, crowd laughing

### Emotion Injection Logic
```javascript
if (options.emotion && !text.trim().startsWith('(')) {
  processedText = `(${options.emotion}) ${text}`;
}
```

### Placement Rules
- **Emotions**: MUST be at sentence start: `(happy) Text` ✓ vs `Text (happy)` ✗
- **Tones/Effects**: Anywhere: `Text (whispering) more`
- **Combinations**: Stack: `(sad)(whispering) Text`

## FINE-GRAINED CONTROL

### Phoneme Control
```javascript
// English (CMU Arpabet)
"<|phoneme_start|>EH N JH AH N IH R<|phoneme_end|>"

// Chinese (Pinyin)
"<|phoneme_start|>gong1<|phoneme_end|>"
```

### Paralanguage Markers
- `(break)` - Short pause
- `(long-break)` - Extended pause
- `(breath)` - Breathing sound
- `(laugh)` - Laughter (may need repetition)
- `(cough)` - Cough (may need repetition)
- `(lip-smacking)` - Lip smack (may need repetition)
- `(sigh)` - Sigh (may need repetition)

## MAIN.JS INTEGRATION

### Config Parameters (defaultConfig)
```javascript
{
  fishaudioApiKey: null,                    // Official API key
  fishspeechApiKey: null,                   // Legacy SiliconFlow key
  defaultFishaudioEmotion: 'neutral',       // Default emotion
  defaultFishaudioPitch: 0,                 // -1.0 to 1.0
  defaultFishaudioVolume: 1.0,              // 0.0 to 2.0
  enableFishSpeechFallback: false           // Enable as fallback
}
```

### API Key Loading Priority
1. `tts_fishaudio_api_key` (DB setting)
2. `fishaudio_api_key` (DB setting)
3. `siliconflow_api_key` (DB setting, legacy)
4. `tts_fishspeech_api_key` (DB setting, legacy)
5. config.fishaudioApiKey (saved config)

### Synthesis Options Building (in speak method)
```javascript
if (selectedEngine === 'fishspeech') {
  synthesisOptions.emotion = userSettings?.voice_emotion || config.defaultFishaudioEmotion;
  synthesisOptions.normalize = true;
  synthesisOptions.latency = 'balanced';
  synthesisOptions.chunk_length = 200;
  synthesisOptions.mp3_bitrate = 128;
  
  if (config.defaultFishaudioPitch !== undefined && config.defaultFishaudioPitch !== 0) {
    synthesisOptions.pitch = config.defaultFishaudioPitch;
  }
  
  if (config.defaultFishaudioVolume !== undefined && config.defaultFishaudioVolume !== 1.0) {
    synthesisOptions.volume = config.defaultFishaudioVolume;
  }
}
```

### Config Route Updates
- GET `/api/tts/config`: Mask `fishaudioApiKey` as `***REDACTED***`
- POST `/api/tts/config`: Handle both `fishaudioApiKey` and `fishspeechApiKey` updates
- Skip both keys in Object.keys filter when updating config

### Engine Initialization Check
```javascript
if (config.fishaudioApiKey && shouldLoadEngine('fishspeech')) {
  this.engines.fishspeech = new FishSpeechEngine(
    config.fishaudioApiKey,
    logger,
    { performanceMode: config.performanceMode }
  );
}
```

## COMPLETE IMPLEMENTATION CHECKLIST

### Engine File (fishspeech-engine.js)
- [ ] Constants: DEFAULT_REFERENCE_ID, OPUS_AUTO_BITRATE
- [ ] Constructor: apiKey validation, API config, performance mode, emotion arrays
- [ ] getVoices(): 6 example voices with reference_ids
- [ ] getDefaultVoiceForLanguage(): Return 'fish-sarah'
- [ ] synthesize(): Full method with emotion injection, retry logic, request building
- [ ] Error handling: Network, API, timeout errors with proper messages
- [ ] Helper methods: setApiKey(), getVoices(), getSupportedEmotions/Tones/Effects(), isValidEmotion()
- [ ] Static helpers: addEmotionMarker(), addParalanguageEffect()

### Main.js Integration
- [ ] Config defaults: fishaudioApiKey, defaultFishaudioEmotion, defaultFishaudioPitch, defaultFishaudioVolume
- [ ] API key loading: Multi-source with priority
- [ ] Engine initialization: Conditional based on API key and shouldLoadEngine
- [ ] Synthesis options: Emotion, pitch, volume injection for fishspeech engine
- [ ] Config routes: GET/POST with key masking and dual key support
- [ ] Engine enable/disable: Dynamic loading based on config changes
- [ ] Fallback chain: Include fishspeech in chains

### Validation Points
- [ ] Syntax check: `node -c fishspeech-engine.js`
- [ ] No hardcoded secrets in code
- [ ] Proper error messages with context
- [ ] Retry logic with exponential backoff
- [ ] Voice validation before synthesis
- [ ] Config persistence to database
- [ ] API key masking in responses
- [ ] Performance mode optimization

## USAGE EXAMPLES

### Story Plugin Integration
```javascript
const story = `
(narrator)(calm) Chapter One: The Beginning
(mysterious)(whispering) The old house stood silent.
(scared) "Is anyone there?" she called out.
(relieved)(sighing) No one answered. Phew.
(excited) Suddenly, the door burst open!
`;

await ttsEngine.synthesize(story, 'fish-sarah', 1.0, {
  normalize: true,
  latency: 'balanced',
  chunk_length: 200
});
```

### Emotion Transitions
```javascript
const dialogue = `
(happy) I got the promotion!
(uncertain) But... it means moving away.
(sad) I'll miss everyone here.
(hopeful) Though it's a great opportunity.
(determined) I'm going to make it work!
`;
```

### Background Effects
```javascript
const scene = `
The comedy show was amazing (audience laughing)
Everyone was having fun (background laughter)
The crowd loved it (crowd laughing)
`;
```

## API REFERENCE

### Request Headers
```
Authorization: Bearer {apiKey}
Content-Type: application/json
model: s1
```

### Response
- Success: Binary audio data (arraybuffer)
- Convert to base64: `Buffer.from(response.data).toString('base64')`

### Error Codes
- 401: Invalid API key
- 429: Rate limit exceeded
- 4xx: Client error (non-retryable)
- 5xx: Server error (retryable)
- ECONNABORTED: Connection timeout (retryable)
- ETIMEDOUT: Request timeout (retryable)

## PERFORMANCE OPTIMIZATION

### Mode Settings
```javascript
fast: { timeout: 8000, maxRetries: 1 }      // Low-resource PCs
balanced: { timeout: 15000, maxRetries: 2 }  // Default
quality: { timeout: 30000, maxRetries: 3 }   // High quality
```

### Best Practices
- Use chunk_length=200 for optimal balance
- Use latency='balanced' for 300ms response
- Use mp3_bitrate=128 for quality/size ratio
- Enable normalize=true for stability
- Cache voice reference_ids

## MULTILINGUAL SUPPORT
13+ languages: EN, DE, ZH, JA, ES, FR, KO, AR, RU, NL, IT, PL, PT
Fish.audio S1 handles all via same voice (multilingual model)

## EXTERNAL RESOURCES
- Official docs: https://docs.fish.audio/developer-guide/getting-started/introduction
- Models: https://docs.fish.audio/developer-guide/models-pricing/models-overview
- Emotions: https://docs.fish.audio/developer-guide/core-features/emotions
- Fine-grained: https://docs.fish.audio/developer-guide/core-features/fine-grained-control
- Voice discovery: https://fish.audio/discovery
- API keys: https://fish.audio/app/api-keys

## COMPLETION CRITERIA
Engine is "vollständig" (complete) when:
1. All 64+ emotions supported and validated
2. Prosody control (speed, pitch, volume) functional
3. Fine-grained control (phonemes, paralanguage) implemented
4. Retry logic with exponential backoff working
5. Error handling comprehensive and logged
6. Config integration with dual API key support
7. Voice references from Fish.audio Discovery
8. Performance modes optimized
9. Multi-language support tested
10. Story plugin ready (emotion injection works)

---
**Version**: 1.0.0 | **Date**: 2024-12-14 | **Status**: Production-ready | **For**: LLM agents implementing Fish.audio TTS
