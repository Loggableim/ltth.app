const QuizShowPlugin = require('../plugins/quiz-show/main');

function createApi() {
  return {
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({
        get: jest.fn(),
        all: jest.fn(() => []),
        run: jest.fn()
      }))
    })),
    getConfig: jest.fn(),
    setConfig: jest.fn(async () => true),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
}

describe('Quiz Show robustness for edge-state payloads', () => {
  test('calculateResults tolerates missing currentQuestion and malformed answers map', () => {
    const api = createApi();
    const plugin = new QuizShowPlugin(api);
    plugin.gameState.currentQuestion = null;
    plugin.gameState.answers = {};
    plugin.gameState.pointsAwardedForRound = true;

    const result = plugin.calculateResults();

    expect(result).toEqual({
      correctUsers: [],
      totalAnswers: 0,
      correctAnswer: {
        index: -1,
        text: ''
      }
    });
  });

  test('calculateResults handles malformed answer records without throwing', () => {
    const api = createApi();
    const plugin = new QuizShowPlugin(api);
    plugin.gameState.currentQuestion = {
      question: 'Where is Berlin?',
      answers: ['North', 'West', 'East', 'South'],
      correct: 1
    };
    plugin.gameState.answers = new Map([
      ['u1', null],
      ['u2', { answer: 'West', username: 'Alice', timestamp: 120 }],
      ['u3', { answer: 'west', username: 'Bob', timestamp: '20' }]
    ]);
    plugin.gameState.pointsAwardedForRound = true;

    const result = plugin.calculateResults();

    expect(result.totalAnswers).toBe(3);
    expect(result.correctUsers).toHaveLength(2);
    expect(result.correctUsers[0].userId).toBe('u3');
    expect(result.correctUsers[1].userId).toBe('u2');
    expect(result.correctAnswer).toEqual({ index: 1, text: 'West' });
  });

  test('isAnswerCorrect tolerates string indexes and normalizes text safely', () => {
    const api = createApi();
    const plugin = new QuizShowPlugin(api);

    expect(plugin.isAnswerCorrect('A', '0', 'Answer one')).toBe(true);
    expect(plugin.isAnswerCorrect('west', 1, 'west')).toBe(true);
    expect(plugin.isAnswerCorrect('Z', 0, 'answer one')).toBe(false);
    expect(plugin.isAnswerCorrect(null, 0, null)).toBe(false);
  });

  test('endRound completes gracefully with missing question data and emits normalized payload', async () => {
    const api = createApi();
    const plugin = new QuizShowPlugin(api);
    plugin.config.leaderboardShowAfterQuestion = false;
    plugin.config.leaderboardShowAfterRound = false;
    plugin.config.autoMode = false;
    plugin.gameState.currentQuestion = null;
    plugin.gameState.answers = null;
    plugin.gameState.eliminatedUsers = new Set();
    plugin.gameState.votersPerAnswer = null;
    plugin.gameState.currentRound = 4;
    plugin.gameState.pointsAwardedForRound = false;

    await plugin.endRound();

    expect(plugin.gameState.roundState).toBe('ended');
    const endedPayloadCall = api.emit.mock.calls.find((call) => call[0] === 'quiz-show:round-ended');
    expect(endedPayloadCall).toBeTruthy();
    const endedPayload = endedPayloadCall?.[1] || {};

    expect(endedPayload.question).toBeNull();
    expect(endedPayload.correctAnswer).toBe(-1);
    expect(endedPayload.correctAnswerText).toBe('');
    expect(endedPayload.results.totalAnswers).toBe(0);
    expect(endedPayload.votersPerAnswer).toEqual({
      0: [],
      1: [],
      2: [],
      3: []
    });
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
  });
});
