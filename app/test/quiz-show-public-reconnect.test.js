'use strict';

const QuizShowPlugin = require('../plugins/quiz-show/main');
const { isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { protectPublicSocket } = require('../modules/public-overlay-access');

function createPlugin() {
  const handlers = new Map();
  const plugin = Object.create(QuizShowPlugin.prototype);
  plugin.api = {
    emit: jest.fn(),
    log: jest.fn(),
    registerSocket: jest.fn((event, callback) => handlers.set(event, callback))
  };
  plugin.config = {
    roundDuration: 30,
    totalRounds: 5,
    showRoundNumber: true,
    voterIconsEnabled: true,
    voterIconSize: 'medium',
    voterIconMaxVisible: 10,
    voterIconCompactMode: true,
    voterIconAnimation: 'fade',
    voterIconPosition: 'above',
    avatarPerformanceMode: 'balanced',
    avatarCacheEnabled: true,
    hudThemePreset: 'neon',
    reducedMotion: false,
    highContrast: false,
    ultraKompaktModus: false,
    ultraKompaktAnswerDelay: 3,
    giftJokerMappings: { privateGift: '50' }
  };
  plugin.gameState = {
    isRunning: true,
    roundState: 'running',
    currentRound: 2,
    currentQuestion: { id: 42, question: 'Fixture question?', answers: ['A', 'B', 'C', 'D'], correct: 2 },
    timeRemaining: 19,
    answers: new Map([['fixture-user-id', { answer: 'C', username: 'Fixture Viewer' }]]),
    jokersUsed: { '25': 1 },
    jokerEvents: [{ type: '50', userId: 'fixture-user-id', username: 'Fixture Viewer', timestamp: 1, isGiftActivated: false }],
    hiddenAnswers: [1, 3],
    revealedWrongAnswer: null,
    votersPerAnswer: {
      0: [{ userId: 'fixture-user-id', username: 'Fixture Viewer', profilePictureUrl: 'https://example.test/avatar.png' }],
      1: [], 2: [], 3: []
    },
    duel: {
      active: true,
      left: { label: 'Left', users: ['fixture-user-id'], score: 1, streak: 1 },
      right: { label: 'Right', users: ['another-fixture-user-id'], score: 0, streak: 0 },
      winner: null
    }
  };
  plugin.db = { prepare: jest.fn() };
  plugin.mainDb = { prepare: jest.fn() };
  plugin.checkSeasonAutomation = jest.fn();
  plugin.registerSocketEvents();
  return { plugin, handlers };
}

function createSocket(host) {
  const rawEmit = jest.fn(() => true);
  return {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: jest.fn(),
    emit: rawEmit,
    rawEmit
  };
}

function stateSnapshot(plugin) {
  return JSON.stringify({
    isRunning: plugin.gameState.isRunning,
    roundState: plugin.gameState.roundState,
    currentRound: plugin.gameState.currentRound,
    currentQuestion: plugin.gameState.currentQuestion,
    timeRemaining: plugin.gameState.timeRemaining,
    answers: [...plugin.gameState.answers.entries()],
    hiddenAnswers: plugin.gameState.hiddenAnswers,
    votersPerAnswer: plugin.gameState.votersPerAnswer,
    duel: plugin.gameState.duel
  });
}

describe('Quiz Show requester-only public reconnect', () => {
  test('registers exactly the approved read request and reuses the existing projected response event', () => {
    expect(isIncomingSocketEventAllowed('quiz-show:get-public-state')).toBe(true);
    expect(isIncomingSocketEventAllowed('quiz-show:get-state')).toBe(false);
    expect(isIncomingSocketEventAllowed('quiz-show:state-update')).toBe(false);
    expect(isOutgoingSocketEventAllowed('quiz-show:get-public-state')).toBe(false);
    expect(isOutgoingSocketEventAllowed('quiz-show:state-update')).toBe(true);

    const { handlers } = createPlugin();
    expect(handlers.has('quiz-show:get-public-state')).toBe(true);
  });

  test('replies only to the requester with centrally projected state and performs no DB, season, provider, or broadcast work', () => {
    const { plugin, handlers } = createPlugin();
    const requester = createSocket('quiz-fixture.trycloudflare.com');
    const otherSocket = createSocket('quiz-fixture.trycloudflare.com');
    protectPublicSocket({ socket: requester, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: otherSocket, logger: { warn: jest.fn() } });
    const stateBefore = stateSnapshot(plugin);
    const configBefore = JSON.stringify(plugin.config);

    handlers.get('quiz-show:get-public-state')(requester);

    expect(requester.rawEmit).toHaveBeenCalledTimes(1);
    expect(requester.rawEmit.mock.calls[0][0]).toBe('quiz-show:state-update');
    const publicState = requester.rawEmit.mock.calls[0][1];
    expect(publicState).toMatchObject({
      isRunning: true,
      currentQuestion: { question: 'Fixture question?', answers: ['A', 'B', 'C', 'D'] },
      votersPerAnswer: { 0: [{ username: 'Fixture Viewer', profilePictureUrl: 'https://example.test/avatar.png' }] }
    });
    expect(JSON.stringify(publicState)).not.toMatch(/fixture-user-id|another-fixture-user-id|privateGift|"correct"|"answers":\[\[/);
    expect(otherSocket.rawEmit).not.toHaveBeenCalled();
    expect(plugin.api.emit).not.toHaveBeenCalled();
    expect(plugin.checkSeasonAutomation).not.toHaveBeenCalled();
    expect(plugin.db.prepare).not.toHaveBeenCalled();
    expect(plugin.mainDb.prepare).not.toHaveBeenCalled();
    expect(stateSnapshot(plugin)).toBe(stateBefore);
    expect(JSON.stringify(plugin.config)).toBe(configBefore);
  });

  test('keeps the complete existing payload for local sockets', () => {
    const { plugin, handlers } = createPlugin();
    const requester = createSocket('127.0.0.1:3000');
    const expected = plugin.buildGameStatePayload();
    protectPublicSocket({ socket: requester, logger: { warn: jest.fn() } });

    handlers.get('quiz-show:get-public-state')(requester);

    expect(requester.rawEmit).toHaveBeenCalledWith('quiz-show:state-update', expected);
    expect(requester.rawEmit.mock.calls[0][1].currentQuestion).toEqual({
      question: 'Fixture question?', answers: ['A', 'B', 'C', 'D']
    });
    expect(requester.rawEmit.mock.calls[0][1].votersPerAnswer[0][0].userId).toBe('fixture-user-id');
    expect(plugin.api.emit).not.toHaveBeenCalled();
  });

  test('ignores requests with payloads and leaves broadcast state generation read-only', () => {
    const { plugin, handlers } = createPlugin();
    const requester = createSocket('quiz-fixture.trycloudflare.com');
    protectPublicSocket({ socket: requester, logger: { warn: jest.fn() } });
    const before = JSON.stringify({
      isRunning: plugin.gameState.isRunning,
      currentRound: plugin.gameState.currentRound,
      answerCount: plugin.gameState.answers.size,
      hiddenAnswers: plugin.gameState.hiddenAnswers
    });

    handlers.get('quiz-show:get-public-state')(requester, { admin: true });

    expect(requester.rawEmit).not.toHaveBeenCalled();
    expect(plugin.api.emit).not.toHaveBeenCalled();
    expect(plugin.checkSeasonAutomation).not.toHaveBeenCalled();
    expect(plugin.db.prepare).not.toHaveBeenCalled();
    expect(plugin.mainDb.prepare).not.toHaveBeenCalled();
    expect(JSON.stringify({
      isRunning: plugin.gameState.isRunning,
      currentRound: plugin.gameState.currentRound,
      answerCount: plugin.gameState.answers.size,
      hiddenAnswers: plugin.gameState.hiddenAnswers
    })).toBe(before);
  });
});
