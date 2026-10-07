'use strict';

const QuizShowPlugin = require('../main');

function createPlugin({ pointsAwardedForRound = false } = {}) {
  const api = {
    emit: jest.fn(),
    log: jest.fn(),
    getDatabase: jest.fn(),
    tiktok: { isActive: jest.fn(), isConnected: jest.fn() }
  };
  const plugin = new QuizShowPlugin(api);
  plugin.db = { prepare: jest.fn() };
  plugin.mainDb = { prepare: jest.fn() };
  plugin.addPoints = jest.fn();
  plugin.applyAnswerProgress = jest.fn();
  plugin.checkSeasonAutomation = jest.fn();
  plugin.calculateResults = jest.fn(() => { throw new Error('mutating results path must not run'); });
  plugin.hasLeaderboardData = jest.fn(() => { throw new Error('mutating availability path must not run'); });
  plugin.gameState = {
    currentRound: 4,
    currentQuestion: { id: 91, question: 'Fixture?', answers: ['A', 'B', 'Correct answer', 'D'], correct: 2 },
    answers: new Map([
      ['user-first', { answer: '!C', username: 'First correct', timestamp: 10 }],
      ['user-tie', { answer: 'Correct answer', username: 'Tied second', timestamp: 10 }],
      ['user-slash', { answer: '/C', username: 'Slash answer', timestamp: 15 }],
      ['user-later', { answer: 'C', username: 'Later', timestamp: 20 }],
      ['user-wrong', { answer: 'A', username: 'Wrong', timestamp: 1 }]
    ]),
    pointsAwardedForRound,
    userStreaks: { 'user-first': 2 },
    categoryCorrectCounts: { Science: 3 }
  };
  plugin.config.allowExclamation = true;
  plugin.config.allowSlash = true;
  return plugin;
}

function snapshot(plugin) {
  return {
    gameState: structuredClone(plugin.gameState),
    config: structuredClone(plugin.config)
  };
}

function expectNoExternalEffects(plugin) {
  expect(plugin.addPoints).not.toHaveBeenCalled();
  expect(plugin.applyAnswerProgress).not.toHaveBeenCalled();
  expect(plugin.db.prepare).not.toHaveBeenCalled();
  expect(plugin.mainDb.prepare).not.toHaveBeenCalled();
  expect(plugin.api.getDatabase).not.toHaveBeenCalled();
  expect(plugin.api.emit).not.toHaveBeenCalled();
  expect(plugin.api.tiktok.isActive).not.toHaveBeenCalled();
  expect(plugin.api.tiktok.isConnected).not.toHaveBeenCalled();
  expect(plugin.checkSeasonAutomation).not.toHaveBeenCalled();
  expect(plugin.calculateResults).not.toHaveBeenCalled();
  expect(plugin.hasLeaderboardData).not.toHaveBeenCalled();
}

describe('Quiz Show current round leaderboard read-only builder', () => {
  test('derives minimal rows with current answer matching, stable timestamp ties, and first/other points', () => {
    const plugin = createPlugin();
    const before = snapshot(plugin);

    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([
      { username: 'First correct', points: 100 },
      { username: 'Tied second', points: 50 },
      { username: 'Slash answer', points: 50 },
      { username: 'Later', points: 50 }
    ]);

    expect(snapshot(plugin)).toEqual(before);
    expectNoExternalEffects(plugin);
  });

  test.each([false, true])('repeated reads leave round-award state unchanged when pointsAwardedForRound=%s', alreadyAwarded => {
    const plugin = createPlugin({ pointsAwardedForRound: alreadyAwarded });
    const before = snapshot(plugin);
    const firstRead = plugin.buildCurrentRoundLeaderboard();
    const secondRead = plugin.buildCurrentRoundLeaderboard();

    expect(firstRead).toEqual(secondRead);
    expect(snapshot(plugin)).toEqual(before);
    expect(plugin.gameState.pointsAwardedForRound).toBe(alreadyAwarded);
    expectNoExternalEffects(plugin);
  });

  test('returns an empty list for an empty round and malformed question, answer, or score data', () => {
    const plugin = createPlugin();
    const validQuestion = plugin.gameState.currentQuestion;
    const validAnswers = plugin.gameState.answers;
    const validPoints = [plugin.config.pointsFirstCorrect, plugin.config.pointsOtherCorrect];

    plugin.gameState.answers = new Map();
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);

    plugin.gameState.currentQuestion = { answers: ['A', 'B'], correct: 5 };
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);
    plugin.gameState.currentQuestion = { answers: ['A', 'B', 'C'], correct: Symbol('bad-index') };
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);
    plugin.gameState.currentQuestion = { answers: ['A', 'B', { toString: jest.fn(() => 'C') }], correct: 2 };
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);

    plugin.gameState.currentQuestion = validQuestion;
    plugin.gameState.answers = { entries: () => validAnswers.entries() };
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);
    plugin.gameState.answers = new Map([['user', { answer: 'C', username: 'x'.repeat(121), timestamp: 1 }]]);
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);

    plugin.gameState.answers = validAnswers;
    plugin.config.pointsFirstCorrect = Number.MAX_SAFE_INTEGER + 1;
    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);
    plugin.config.pointsFirstCorrect = validPoints[0];

    expectNoExternalEffects(plugin);
  });

  test('withholds rather than truncating a leaderboard larger than the public projection bound', () => {
    const plugin = createPlugin();
    plugin.gameState.answers = new Map(Array.from({ length: 101 }, (_, index) => [
      `user-${index}`,
      { answer: 'C', username: `Viewer ${index}`, timestamp: index }
    ]));

    expect(plugin.buildCurrentRoundLeaderboard()).toEqual([]);
    expectNoExternalEffects(plugin);
  });
});
