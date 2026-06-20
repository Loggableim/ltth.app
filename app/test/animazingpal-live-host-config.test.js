const {
  buildLiveHostDefaults,
  normalizeLiveHostConfig,
  sanitizeLiveHostConfig,
  applyLiveHostPreset,
  mergeLiveHostSecrets
} = require('../plugins/animazingpal/brain/live-host-config');

describe('AnimazingPal live host configuration', () => {
  test('safe-live preset supplies editable defaults for every live subsystem', () => {
    const configured = applyLiveHostPreset(buildLiveHostDefaults(), 'safe-live');

    expect(configured.response.maxResponsesPerMinute).toBe(4);
    expect(configured.response.decisionMode).toBe('auto');
    expect(configured.response.chatProbability).toBe(0.1);
    expect(configured.response.maxSentences).toBe(2);
    expect(configured.events.gift.brainEnabled).toBe(true);
    expect(configured.events.like.brainEnabled).toBe(false);
    expect(configured.providers.ollama.timeoutMs).toBe(30000);
    expect(configured.providers.ollama.maxRetries).toBe(2);
    expect(Object.isFrozen(configured)).toBe(false);
  });

  test('normalizes automatic host decision settings', () => {
    const configured = normalizeLiveHostConfig({
      response: { decisionMode: 'bad-mode', minDecisionScore: 99, silenceWarnAfterEvents: 9999 }
    });

    expect(configured.response.decisionMode).toBe('auto');
    expect(configured.response.minDecisionScore).toBe(1);
    expect(configured.response.silenceWarnAfterEvents).toBe(1000);
  });

  test('normalizes numeric fine settings to documented safety bounds', () => {
    const configured = normalizeLiveHostConfig({
      response: { maxResponsesPerMinute: 999, chatProbability: -2, maxSentences: 0 },
      providers: { ollama: { timeoutMs: 1, maxRetries: 99, temperature: 8 } },
      tts: { volume: 999, speed: 0, pitch: -99 }
    });

    expect(configured.response.maxResponsesPerMinute).toBe(120);
    expect(configured.response.chatProbability).toBe(0);
    expect(configured.response.maxSentences).toBe(1);
    expect(configured.providers.ollama.timeoutMs).toBe(1000);
    expect(configured.providers.ollama.maxRetries).toBe(10);
    expect(configured.providers.ollama.temperature).toBe(2);
    expect(configured.tts.volume).toBe(100);
    expect(configured.tts.speed).toBe(0.5);
    expect(configured.tts.pitch).toBe(-12);
  });

  test('migrates the legacy OpenAI brain fields', () => {
    const configured = normalizeLiveHostConfig({}, {
      openaiApiKey: 'legacy-secret', model: 'gpt-4o-mini', maxResponsesPerMinute: 7, chatResponseProbability: 0.25
    });

    expect(configured.provider).toBe('openai');
    expect(configured.providers.openai.apiKey).toBe('legacy-secret');
    expect(configured.providers.openai.model).toBe('gpt-4o-mini');
    expect(configured.response.maxResponsesPerMinute).toBe(7);
    expect(configured.response.chatProbability).toBe(0.25);
  });

  test('redacts all provider keys while preserving configured flags', () => {
    const safe = sanitizeLiveHostConfig(normalizeLiveHostConfig({
      providers: {
        openai: { apiKey: 'one' }, gemini: { apiKey: 'two' },
        openrouter: { apiKey: 'three' }, ollama: { apiKey: 'four' }
      }
    }));

    for (const provider of ['openai', 'gemini', 'openrouter', 'ollama']) {
      expect(safe.providers[provider].apiKey).toBeUndefined();
      expect(safe.providers[provider].apiKeyConfigured).toBe(true);
    }
  });

  test('preserves blank provider keys and only clears them explicitly', () => {
    const current = normalizeLiveHostConfig({ providers: { ollama: { apiKey: 'kept-secret' } } });
    const preserved = mergeLiveHostSecrets(current, { providers: { ollama: { apiKey: '' } } });
    const cleared = mergeLiveHostSecrets(current, { providers: { ollama: { clearApiKey: true } } });

    expect(preserved.providers.ollama.apiKey).toBe('kept-secret');
    expect(cleared.providers.ollama.apiKey).toBe('');
  });

  test('normalizes avatar bundle fine settings and removes malformed entries', () => {
    const configured = normalizeLiveHostConfig({ avatarBundles: [
      { id: ' rose host ', avatarName: 'Rose', personalityId: 'sarcastic_host', giftIds: [5655, '5655'], pitch: 99, volume: -1, speed: 9 },
      { avatarName: 'Missing id' }
    ] });

    expect(configured.avatarBundles).toEqual([expect.objectContaining({
      id: 'rose-host', giftIds: ['5655'], pitch: 12, volume: 0, speed: 2
    })]);
  });

  test('keeps foreign TikTok sources read-only', () => {
    const configured = normalizeLiveHostConfig({ source: { username: '@wardalq4', readOnly: false, autoConnect: true } });
    expect(configured.source).toEqual(expect.objectContaining({ username: 'wardalq4', readOnly: true, autoConnect: true }));
  });

  test('normalizes live source event-staleness watchdog settings', () => {
    const configured = normalizeLiveHostConfig({
      source: { eventStaleMs: 1, reconnectOnEventStale: true }
    });

    expect(configured.source.eventStaleMs).toBe(30000);
    expect(configured.source.reconnectOnEventStale).toBe(true);
  });
});
