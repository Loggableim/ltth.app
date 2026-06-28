const ResponseEngine = require('../plugins/sidekick/backend/responseEngine');

describe('Sidekick response engine conversation awareness', () => {
  function createEngine(config = {}) {
    return new ResponseEngine({
      log: jest.fn()
    }, {
      comment: {
        decisionMode: 'mentions',
        replyThreshold: 0,
        responseBias: 0.5,
        minLength: 1,
        mentionTerms: ['sidekick', 'pal']
      },
      ...config
    }, null);
  }

  test('keeps mention gating for isolated chat messages', () => {
    const engine = createEngine();

    expect(engine.evaluateChat('viewer-1', 'Viewer', 'ja stimmt')).toEqual(expect.objectContaining({
      respond: false,
      reason: 'mention_required',
      selection: 'none'
    }));
  });

  test('relaxes mention gating when the dialog is already active', () => {
    const engine = createEngine();

    expect(engine.evaluateChat('viewer-1', 'Viewer', 'ja stimmt', {
      conversationState: {
        active: true,
        turnCount: 3,
        lastSpeaker: 'host',
        recentTurns: [
          { speaker: 'host', text: 'Kannst du das erklären?' },
          { speaker: 'sidekick', text: 'Ja.' }
        ]
      }
    })).toEqual(expect.objectContaining({
      respond: true,
      selection: 'chat',
      type: 'relevant'
    }));

    expect(engine.evaluateChat('viewer-1', 'Viewer', 'ja', {
      conversationState: {
        active: true,
        turnCount: 3,
        lastSpeaker: 'host',
        recentTurns: [
          { speaker: 'host', text: 'Kannst du das erklären?' },
          { speaker: 'sidekick', text: 'Ja.' }
        ]
      }
    })).toEqual(expect.objectContaining({
      respond: true,
      selection: 'chat'
    }));
  });
});
