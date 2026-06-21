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
      hostSpeechEventType: 'host-speaking'
    });

    expect(coordinator.buildHostSpeechEvent('  Hallo Chat  ', {
      confidence: 0.94,
      language: 'de',
      provider: 'future-asr',
      unsafe: '<script>'
    })).toEqual({
      eventType: 'host-speaking',
      username: 'Streamer',
      userId: 'sidekick-host',
      message: 'Hallo Chat',
      source: 'host-mic',
      confidence: 0.94,
      language: 'de',
      provider: 'future-asr'
    });
  });

  test('builds viewer events while preserving useful viewer and gift fields', () => {
    const coordinator = new ConversationCoordinator();
    const decision = { type: 'gift', priority: 7 };

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
      decision
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
