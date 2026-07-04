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
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      echoWindowMs: 10000,
      minHostSpeechChars: 3
    });

    coordinator.recordSidekickSpeech('Hallo   Stream!', { now: 1000 });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('hallo stream!', { now: 2000 })).toEqual(expect.objectContaining({
        accept: false,
        reason: 'echo'
      }));
      expect(coordinator.shouldAcceptHostSpeech('hallo stream!', { now: 12001 })).toEqual(expect.objectContaining({
        accept: true,
        reason: 'accepted'
      }));
    } finally {
      Math.random = originalRandom;
    }
  });

  test('suppresses duplicate recent host transcripts', () => {
    const coordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      hostMinConfidence: 0,
      echoWindowMs: 10000,
      minHostSpeechChars: 3
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('Can you see chat?', { now: 1000 })).toEqual(expect.objectContaining({
        accept: true,
        normalizedText: 'can you see chat?'
      }));
      coordinator.recordHostSpeech('Can you see chat?', { now: 1000 });
      expect(coordinator.shouldAcceptHostSpeech('can   you see chat?', { now: 2000 })).toEqual(expect.objectContaining({
        accept: false,
        reason: 'duplicate'
      }));
    } finally {
      Math.random = originalRandom;
    }
  });

  test('accepted host speech is not treated as duplicate until committed', () => {
    const coordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostReplyProbability: 1,
      hostMinConfidence: 0,
      echoWindowMs: 10000,
      minHostSpeechChars: 3
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('Retry me', { now: 1000 })).toEqual(expect.objectContaining({
        accept: true
      }));
      expect(coordinator.shouldAcceptHostSpeech('retry me', { now: 2000 })).toEqual(expect.objectContaining({
        accept: true
      }));
    } finally {
      Math.random = originalRandom;
    }

    coordinator.recordHostSpeech('Retry me', { now: 2000 });

    const originalRandom2 = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('retry me', { now: 3000 })).toEqual(expect.objectContaining({
        accept: false,
        reason: 'duplicate'
      }));
    } finally {
      Math.random = originalRandom2;
    }
  });

  test('enforces active context cooldown for host speech decisions', () => {
    const coordinator = new ConversationCoordinator({
      hostContextCooldownMs: 6000
    });

    coordinator.shouldAcceptHostSpeech('Kannst du mich hören?', { now: 1000 });
    expect(coordinator.shouldAcceptHostSpeech('Kannst du mich hören?', { now: 5000 })).toEqual(expect.objectContaining({
      accept: false,
      reason: 'active_pause'
    }));
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('Kannst du mich hören?', { now: 12000 })).toEqual(expect.objectContaining({
        accept: true,
        reason: 'accepted'
      }));
    } finally {
      Math.random = originalRandom;
    }
  });

  test('enforces anti-overtalk cooldown against recent host and sidekick speech', () => {
    const coordinator = new ConversationCoordinator({
      hostContextCooldownMs: 0,
      hostReplyProbability: 1,
      hostOvertalkCooldownMs: 1800
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    coordinator.recordSidekickSpeech('Kurzer Satz', { now: 1000 });
    try {
      expect(coordinator.shouldAcceptHostSpeech('Wie geht es dir?', { now: 2000 })).toEqual(expect.objectContaining({
        accept: false,
        reason: 'overtalk'
      }));
      expect(coordinator.shouldAcceptHostSpeech('Wie geht es dir?', { now: 3000 })).toEqual(expect.objectContaining({
        accept: true,
        reason: 'accepted'
      }));
    } finally {
      Math.random = originalRandom;
    }
  });

  test('rejects long-form host utterances as unclear context', () => {
    const coordinator = new ConversationCoordinator({
      hostLongFormWordLimit: 3,
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0
    });

    const decision = coordinator.shouldAcceptHostSpeech('Das ist eine sehr lange Aussage mit mehr als drei Worten', { now: 1000 });
    expect(decision).toEqual(expect.objectContaining({
      accept: false,
      reason: 'context_unclear'
    }));
    expect(decision.features?.isLongForm).toBe(true);
  });

  test('rejects low-confidence transcriptions', () => {
    const coordinator = new ConversationCoordinator({
      hostMinConfidence: 0.8,
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0
    });
    const decision = coordinator.shouldAcceptHostSpeech('Kurzer Satz', {
      now: 1000,
      confidence: 0.2
    });
    expect(decision).toEqual(expect.objectContaining({
      accept: false,
      reason: 'low_confidence',
      score: expect.any(Number),
      features: expect.objectContaining({
        wordCount: 2
      })
    }));
    expect(decision.confidence).toBe(0.2);
  });

  test('blocks host replies probabilistically when reply probability is low', () => {
    const coordinator = new ConversationCoordinator({
      hostReplyProbability: 0,
      hostContextCooldownMs: 0,
      hostOvertalkCooldownMs: 0,
      hostMinConfidence: 0
    });

    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      expect(coordinator.shouldAcceptHostSpeech('Kannst du mir helfen?', { now: 1000 })).toEqual(expect.objectContaining({
        accept: false,
        reason: 'low_score'
      }));
    } finally {
      Math.random = originalRandom;
    }
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
      conversationState: expect.objectContaining({
        turnCount: expect.any(Number)
      }),
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

  test('exposes a compact conversation state snapshot for active dialogs', () => {
    const coordinator = new ConversationCoordinator({
      conversationWindowMs: 60000,
      conversationActiveWindowMs: 15000,
      conversationTurnLimit: 4
    });

    coordinator.recordHostSpeech('Wie geht es dem Chat?', { now: 1000, source: 'host-mic' });
    coordinator.recordSidekickSpeech('Ich bin bereit.', { now: 2000, source: 'sidekick-output' });

    const state = coordinator.getConversationState({ now: 3000 });

    expect(state).toEqual(expect.objectContaining({
      active: true,
      turnCount: 2,
      lastSpeaker: 'sidekick',
      summary: expect.stringContaining('Dialog aktiv')
    }));
    expect(state.recentTurns).toEqual([
      expect.objectContaining({ speaker: 'host', text: 'Wie geht es dem Chat?' }),
      expect.objectContaining({ speaker: 'sidekick', text: 'Ich bin bereit.' })
    ]);

    expect(coordinator.buildHostSpeechEvent('Weiter gehts', { now: 3000 })).toEqual(expect.objectContaining({
      conversationState: expect.objectContaining({
        active: true,
        turnCount: 2
      })
    }));
  });

  test('relaxes host speech gating while the dialog is active', () => {
    const coordinator = new ConversationCoordinator({
      hostContextCooldownMs: 6000,
      hostOvertalkCooldownMs: 1800,
      hostReplyProbability: 1,
      hostMinConfidence: 0
    });

    coordinator.recordHostSpeech('Sag kurz was dazu.', { now: 1000 });
    coordinator.recordSidekickSpeech('Klar.', { now: 2000 });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(coordinator.shouldAcceptHostSpeech('Noch eine kurze Frage?', { now: 3000 })).toEqual(expect.objectContaining({
        accept: true,
        respond: true,
        reason: 'accepted'
      }));
    } finally {
      Math.random = originalRandom;
    }
  });
});


