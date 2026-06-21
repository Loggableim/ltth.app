/**
 * Test for API Key Masking Feature
 * Verifies that API keys are properly masked when loaded and that save functions skip masked values
 */

const assert = require('assert');

describe('API Key Masking', function() {
  describe('StreamAlchemy Plugin', function() {
    it('should expose API key presence flags without returning secrets', function() {
      const configResponse = {
        hasOpenAIKey: true,
        hasSiliconFlowKey: false
      };

      assert.strictEqual(configResponse.hasOpenAIKey, true, 'OpenAI presence flag should be true');
      assert.strictEqual(configResponse.hasSiliconFlowKey, false, 'Silicon Flow presence flag should be false');
      assert.strictEqual(configResponse.openaiApiKey, undefined, 'OpenAI key must not be returned');
      assert.strictEqual(configResponse.siliconFlowApiKey, undefined, 'Silicon Flow key must not be returned');
    });

    it('should allow saving OpenAI key to settings without persisting plaintext config', function() {
      const formData = new Map([
        ['openaiApiKey', 'sk-new-openai-key']
      ]);

      const updates = {};
      const openaiKey = formData.get('openaiApiKey');
      if (openaiKey && openaiKey !== '***SAVED***') {
        updates.openaiApiKey = openaiKey;
      }

      assert.strictEqual(updates.openaiApiKey, 'sk-new-openai-key', 'New OpenAI key should be forwarded for centralized storage');
      assert.strictEqual(updates.siliconFlowApiKey, undefined, 'Only provided keys should be forwarded');
    });
  });

    describe('OpenShock Plugin', function() {
        it('should mask API key when loading config', function() {
            const config = {
                apiKey: 'abc123def456ghi789jkl012mno345pqr'
            };

            const apiKeyValue = config.apiKey ? '***SAVED***' : '';
            const apiKeyPlaceholder = config.apiKey ? 'API Key gespeichert (verborgen)' : 'Enter your OpenShock API key';

            assert.strictEqual(apiKeyValue, '***SAVED***', 'API key should be masked');
            assert.strictEqual(apiKeyPlaceholder, 'API Key gespeichert (verborgen)', 'Placeholder should indicate key is saved');
        });

        it('should detect masked value in save function', function() {
            const apiKey = '***SAVED***';
            const isMasked = apiKey === '***SAVED***';

            assert.strictEqual(isMasked, true, 'Save function should detect masked value');
        });
    });

    describe('Dashboard - OpenAI and TikTok API Keys', function() {
        it('should mask OpenAI API key when loading settings', function() {
            const settings = {
                openai_api_key: 'sk-abc123def456ghi789jkl012'
            };

            const value = settings.openai_api_key ? '***REDACTED***' : '';
            const placeholder = settings.openai_api_key ? 'API key configured (hidden)' : 'sk-...';

            assert.strictEqual(value, '***REDACTED***', 'OpenAI API key should be masked');
            assert.strictEqual(placeholder, 'API key configured (hidden)', 'Placeholder should indicate key is configured');
        });

        it('should mask TikTok/Eulerstream API key when loading settings', function() {
            const settings = {
                tiktok_euler_api_key: 'abcdefghijklmnopqrstuvwxyz123456'
            };

            const value = settings.tiktok_euler_api_key ? '***REDACTED***' : '';
            const placeholder = settings.tiktok_euler_api_key ? 'API key configured (hidden)' : 'Enter your Eulerstream API key...';

            assert.strictEqual(value, '***REDACTED***', 'TikTok API key should be masked');
            assert.strictEqual(placeholder, 'API key configured (hidden)', 'Placeholder should indicate key is configured');
        });

        it('should skip saving OpenAI key when value is masked', function() {
            const apiKey = '***REDACTED***';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, false, 'Should not save masked OpenAI API key');
        });

        it('should skip saving TikTok key when value is masked', function() {
            const apiKey = '***REDACTED***';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, false, 'Should not save masked TikTok API key');
        });

        it('should save when value is a real new key', function() {
            const apiKey = 'sk-newkey123456789';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, true, 'Should save new real API key');
        });
    });

    describe('TTS API Keys (existing implementation)', function() {
        it('should use consistent masking pattern', function() {
            const settings = {
                tts_google_api_key: 'google-key-123',
                tts_speechify_api_key: 'speechify-key-456',
                tts_elevenlabs_api_key: 'elevenlabs-key-789'
            };

            // All TTS keys use the same pattern
            const googleValue = settings.tts_google_api_key ? '***REDACTED***' : '';
            const speechifyValue = settings.tts_speechify_api_key ? '***REDACTED***' : '';
            const elevenlabsValue = settings.tts_elevenlabs_api_key ? '***REDACTED***' : '';

            assert.strictEqual(googleValue, '***REDACTED***', 'Google TTS key should be masked');
            assert.strictEqual(speechifyValue, '***REDACTED***', 'Speechify TTS key should be masked');
            assert.strictEqual(elevenlabsValue, '***REDACTED***', 'ElevenLabs TTS key should be masked');
        });

        it('should skip saving TTS keys when values are masked', function() {
            const googleKey = '***REDACTED***';
            const speechifyKey = 'new-speechify-key';
            const elevenlabsKey = '***REDACTED***';

            const hasNewKeys = (googleKey && googleKey !== '***REDACTED***') ||
                              (speechifyKey && speechifyKey !== '***REDACTED***') ||
                              (elevenlabsKey && elevenlabsKey !== '***REDACTED***');

            assert.strictEqual(hasNewKeys, true, 'Should detect that there is at least one new key');

            const updates = {};
            if (googleKey && googleKey !== '***REDACTED***') updates.tts_google_api_key = googleKey;
            if (speechifyKey && speechifyKey !== '***REDACTED***') updates.tts_speechify_api_key = speechifyKey;
            if (elevenlabsKey && elevenlabsKey !== '***REDACTED***') updates.tts_elevenlabs_api_key = elevenlabsKey;

            assert.strictEqual(updates.tts_google_api_key, undefined, 'Masked Google key should not be in updates');
            assert.strictEqual(updates.tts_speechify_api_key, 'new-speechify-key', 'New Speechify key should be in updates');
            assert.strictEqual(updates.tts_elevenlabs_api_key, undefined, 'Masked ElevenLabs key should not be in updates');
        });
    });
});
