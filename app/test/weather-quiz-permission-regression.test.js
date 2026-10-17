const WeatherControl = require('../plugins/weather-control/main');
const QuizShow = require('../plugins/quiz-show/main');

describe('Weather permission identity regressions', () => {
  function createWeatherPlugin() {
    const api = {
      log: jest.fn(),
      getDatabase: () => ({ prepare: () => ({ get: () => null, all: () => [] }) })
    };
    const plugin = new WeatherControl(api);
    plugin.config = {
      permissions: {
        enabled: true,
        allowAll: false,
        allowedUsers: [],
        allowedGroups: {
          followers: false,
          teamMembers: false,
          minTeamLevel: 1,
          superfans: false,
          subscribers: false
        },
        topGifterThreshold: 0,
        minPoints: 0
      }
    };
    return plugin;
  }

  test('gift history alone does not grant superfan access; explicit SuperFan status does', async () => {
    const plugin = createWeatherPlugin();
    plugin.config.permissions.allowedGroups.superfans = true;
    const highGiftHistory = { username: 'viewer', gifts_sent: 50, team_member_level: 0, coins_sent: 0 };

    await expect(plugin.checkUserPermission('viewer', { dbUser: highGiftHistory, isSuperFan: false })).resolves.toBe(false);
    await expect(plugin.checkUserPermission('viewer', { dbUser: highGiftHistory, isSuperFan: true })).resolves.toBe(true);
  });

  test('fanclub level alone does not grant subscriber access; explicit subscriber status does', async () => {
    const plugin = createWeatherPlugin();
    plugin.config.permissions.allowedGroups.subscribers = true;
    const fanclubMember = { username: 'viewer', gifts_sent: 0, team_member_level: 1, coins_sent: 0 };

    await expect(plugin.checkUserPermission('viewer', { dbUser: fanclubMember, isSubscriber: false })).resolves.toBe(false);
    await expect(plugin.checkUserPermission('viewer', { dbUser: fanclubMember, isSubscriber: true })).resolves.toBe(true);
  });
});

describe('Quiz answer prefix regressions', () => {
  function createQuiz(mode = 'classic') {
    const plugin = new QuizShow({ emit: jest.fn(), log: jest.fn() });
    plugin.config.gameMode = mode;
    plugin.config.allowExclamation = true;
    plugin.config.allowSlash = true;
    plugin.config.allowPlainLetters = true;
    plugin.config.allowFullText = true;
    plugin.gameState.currentQuestion = {
      answers: ['Correct text', 'Wrong one', 'Wrong two', 'Wrong three'],
      correct: 0
    };
    plugin.gameState.isRunning = true;
    plugin.addPoints = jest.fn();
    plugin.applyAnswerProgress = jest.fn();
    return plugin;
  }

  test.each(['a', '!a', '/a', 'Correct text'])('scores the accepted correct response format %s', (answer) => {
    const plugin = createQuiz();
    plugin.handleAnswer('audit-user', 'Audit User', answer);
    const results = plugin.calculateResults();

    expect(results.correctUsers.map(user => user.userId)).toEqual(['audit-user']);
    expect(plugin.addPoints).toHaveBeenCalledWith('audit-user', 'Audit User', 100);
    expect(plugin.applyAnswerProgress).toHaveBeenCalledWith(expect.objectContaining({ userId: 'audit-user' }), true, 100, true);
  });

  test.each(['!b', '/b'])('does not score an incorrect prefixed response %s', (answer) => {
    const plugin = createQuiz();
    plugin.handleAnswer('audit-user', 'Audit User', answer);
    const results = plugin.calculateResults();

    expect(results.correctUsers).toEqual([]);
    expect(plugin.addPoints).not.toHaveBeenCalled();
    expect(plugin.applyAnswerProgress).toHaveBeenCalledWith(expect.objectContaining({ userId: 'audit-user' }), false, 0, false);
  });

  test('does not accept malformed answer prefixes', () => {
    const plugin = createQuiz();
    plugin.handleAnswer('audit-user', 'Audit User', '!ab');
    expect(plugin.gameState.answers.size).toBe(0);
    expect(plugin.addPoints).not.toHaveBeenCalled();
  });

  test('fastest-finger and marathon classify configured prefixed answers as correct', () => {
    const fastest = createQuiz('fastestFinger');
    fastest.endRound = jest.fn();
    jest.useFakeTimers();
    fastest.handleAnswer('fastest-user', 'Fastest User', '!a');
    expect(fastest.endRound).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fastest.endRound).toHaveBeenCalledTimes(1);
    jest.useRealTimers();

    const marathon = createQuiz('marathon');
    marathon.handleAnswer('marathon-user', 'Marathon User', '/a');
    expect(marathon.gameState.marathonPlayerId).toBe('marathon-user');
    expect(marathon.gameState.marathonProgress).toBe(1);
  });
});
