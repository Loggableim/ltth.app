const {
  ConversationCoordinator
} = require('../plugins/sidekick/backend/conversation-coordinator');

describe('Sidekick conversation coordinator', () => {
  test('rejects empty and short host speech', () => {
    const coordinator = new ConversationCoordinator({ minHostSpeechChars: 5 });

    expect(coordinator.shouldAcceptHostSpeech('   ')).toEqual(expect.objectContaining({
      accept: false,
      reason: 'empty'
    }));
    expect(coordinator.shouldAcceptHostSpeech('hey')).toEqual(expect.objectContaining({
      accept: false,
      reason: 'too_short'
    }));
  });

  test('suppresses exact normalized echo from recent Sidekick speech', () => {
    const coordinator = new ConversationCoordinator({
      echoWindowMs: 10000,
      minHostSpeechChars: 3
    });

    coordinator.recordSidekickSpeech('Hallo   Stream!', { now: 1000 });

    expect(coordinator.shouldAcceptHostSpeech('hallo stream!', { now: 2000 })).toEqual(expect.objectContaining({
      accept: false,
      reason: 'echo'
    }));
    expect(coordinator.shouldAcceptHostSpeech('hallo stream!', { now: 12001 })).toEqual(expect.objectContaining({
      accept: true,
      reason: 'accepted'
    }));
  });

  test('suppresses duplicate recent host transcripts', () => {
    const coordinator = new ConversationCoordinator({
      echoWindowMs: 10000,
      minHostSpeechChars: 3
    });

    expect(coordinator.shouldAcceptHostSpeech('Can you see chat?', { now: 1000 })).toEqual(expect.objectContaining({
      accept: true,
      normalizedText: 'can you see chat?'
    }));
    expect(coordinator.shouldAcceptHostSpeech('can   you see chat?', { now: 2000 })).toEqual(expect.objectContaining({
      accept: false,
      reason: 'duplicate'
    }));
  });

  test('builds a sanitized host speech event for AnimazingPal', () => {
    const coordinator = new ConversationCoordinator({
      hostName: 'Streamer',
      hostSpeechEventType: 'chat'
    });

    expect(coordinator.buildHostSpeechEvent('  Hallo Chat  ', {
      confidence: 0.94,
      language: 'de',
      provider: 'future-asr',
      unsafe: '<script>'
    })).toEqual(expect.objectContaining({
      eventType: 'chat',
      username: 'Streamer',
      userId: 'sidekick-host',
      message: 'Hallo Chat',
      comment: 'Hallo Chat',
      source: 'host-mic',
      isHostSpeech: true,
      confidence: 0.94,
      language: 'de',
      provider: 'future-asr'
    }));
  });

  test('normalizes unsafe conversation config to bounded supported values', () => {
    const coordinator = new ConversationCoordinator({
      enabled: 'false',
      hostName: ` ${'H'.repeat(120)} `,
      minHostSpeechChars: -50,
      echoWindowMs: 999999999,
      maxRecentUtterances: 9999,
      hostSpeechEventType: 'sidekick-host-speech',
      viewerEventTypes: ['gift', 'unknown', 'chat', 'chat']
    });

    expect(coordinator.getStatus()).toEqual(expect.objectContaining({
      enabled: false,
      hostName: 'H'.repeat(64),
      minHostSpeechChars: 1,
      echoWindowMs: 300000,
      maxRecentUtterances: 200,
      hostSpeechEventType: 'chat',
      viewerEventTypes: ['gift', 'chat']
    }));
  });

  test('bounds host speech payload strings and numeric metadata', () => {
    const coordinator = new ConversationCoordinator({
      hostName: '<b>Very Long Host Name That Should Be Trimmed To Sixty Four Characters Exactly</b>'
    });
    const event = coordinator.buildHostSpeechEvent('x'.repeat(2000), {
      userId: 'u'.repeat(200),
      source: 's'.repeat(80),
      confidence: 99,
      language: 'german-language-code-that-is-too-long',
      provider: 'provider-name-that-is-too-long'.repeat(10)
    });

    expect(event.message).toHaveLength(500);
    expect(event.comment).toHaveLength(500);
    expect(event.userId).toHaveLength(128);
    expect(event.source).toHaveLength(32);
    expect(event.confidence).toBe(1);
    expect(event.language).toHaveLength(20);
    expect(event.provider).toHaveLength(64);
  });

  test('builds viewer events while preserving useful viewer and gift fields', () => {
    const coordinator = new ConversationCoordinator();
    const decision = { type: 'gift', priority: 7, response: 'bulky text', nested: { unsafe: true } };

    expect(coordinator.buildViewerEvent('gift', {
      uniqueId: 'alice_1',
      nickname: 'Alice',
      comment: 'wow',
      giftName: 'Rose',
      giftId: 5655,
      diamondCount: 1,
      repeatCount: 3
    }, decision)).toEqual(expect.objectContaining({
      eventType: 'gift',
      username: 'alice_1',
      nickname: 'Alice',
      message: 'wow',
      giftName: 'Rose',
      giftId: 5655,
      diamondCount: 1,
      repeatCount: 3,
      source: 'sidekick-viewer',
      decision: {
        type: 'gift',
        priority: 7
      }
    }));
  });

  test('rejects viewer events that are not enabled in the coordinator whitelist', () => {
    const coordinator = new ConversationCoordinator({ viewerEventTypes: ['chat'] });

    expect(coordinator.buildViewerEvent('gift', { uniqueId: 'alice', giftName: 'Rose' }, {})).toBeNull();
    expect(coordinator.buildViewerEvent('chat', { uniqueId: 'alice', comment: 'hi' }, {})).toEqual(expect.objectContaining({
      eventType: 'chat',
      comment: 'hi'
    }));
  });

  test('caps recent utterance diagnostics at the configured maximum', () => {
    const coordinator = new ConversationCoordinator({ maxRecentUtterances: 2 });

    coordinator.recordSidekickSpeech('one', { now: 1 });
    coordinator.recordSidekickSpeech('two', { now: 2 });
    coordinator.recordSidekickSpeech('three', { now: 3 });

    expect(coordinator.getStatus()).toEqual(expect.objectContaining({
      recentUtteranceCount: 2,
      recentSidekickUtteranceCount: 2
    }));
  });
});
