const QuizShowPlugin = require('../plugins/quiz-show/main');

function createPlugin(overrides = {}) {
  const api = {
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => ({
      db: {},
      getSetting: jest.fn()
    })),
    getPluginDataDir: jest.fn(() => __dirname),
    ...overrides
  };

  return new QuizShowPlugin(api);
}

describe('Quiz Show expansion helpers', () => {
  test('question cooldown window uses configured hours', () => {
    const plugin = createPlugin();

    plugin.config.questionCooldownHours = 3;

    expect(plugin.getQuestionCooldownMs()).toBe(3 * 60 * 60 * 1000);
  });

  test('category vote parser accepts command and numeric votes once per user', () => {
    const plugin = createPlugin();

    plugin.startCategoryVote(['Sport', 'Musik'], 10);

    expect(plugin.recordCategoryVote({ userId: 'u1', username: 'Ana', message: '!vote sport' })).toBe(true);
    expect(plugin.recordCategoryVote({ userId: 'u2', username: 'Ben', message: '2' })).toBe(true);
    expect(plugin.recordCategoryVote({ userId: 'u1', username: 'Ana', message: '!vote musik' })).toBe(false);
    expect(plugin.gameState.categoryVote.votesByCategory.Sport).toBe(1);
    expect(plugin.gameState.categoryVote.votesByCategory.Musik).toBe(1);
  });

  test('finishing category vote selects the highest voted category', () => {
    const plugin = createPlugin();

    plugin.startCategoryVote(['Sport', 'Musik'], 10);
    plugin.recordCategoryVote({ userId: 'u1', username: 'Ana', message: '!vote musik' });
    plugin.recordCategoryVote({ userId: 'u2', username: 'Ben', message: '!vote musik' });
    plugin.recordCategoryVote({ userId: 'u3', username: 'Cem', message: '!vote sport' });

    const result = plugin.finishCategoryVote();

    expect(result.selectedCategory).toBe('Musik');
    expect(plugin.config.categoryFilter).toEqual(['Musik']);
    expect(plugin.gameState.categoryVote.active).toBe(false);
  });

  test('duel scoring awards matching side and streak', () => {
    const plugin = createPlugin();

    plugin.startDuel({ leftLabel: 'Team A', rightLabel: 'Team B', leftUsers: ['u1'], rightUsers: ['u2'] });
    plugin.applyDuelAnswerResult('u1', true, 100);
    plugin.applyDuelAnswerResult('u2', false, 50);

    expect(plugin.gameState.duel.left.score).toBe(100);
    expect(plugin.gameState.duel.left.streak).toBe(1);
    expect(plugin.gameState.duel.right.score).toBe(0);
    expect(plugin.gameState.duel.right.streak).toBe(0);
  });

  test('achievement rules award fastest answer and streak milestones', () => {
    const plugin = createPlugin();

    const awards = plugin.evaluateAchievements({
      userId: 'u1',
      username: 'Ana',
      isFirstCorrect: true,
      streak: 5,
      categoryCorrectCount: 1,
      duelWinner: false
    });

    expect(awards.map(award => award.id)).toEqual(expect.arrayContaining(['fastest-answer', 'streak-5']));
  });

  test('season automation detects weekly rollover', () => {
    const plugin = createPlugin();

    plugin.config.seasonAutomationMode = 'weekly';
    plugin.config.seasonAutomationDay = 1;

    expect(plugin.shouldRollSeason({
      now: new Date('2026-05-04T10:00:00Z'),
      activeSeason: { start_date: '2026-04-20T10:00:00.000Z' }
    })).toBe(true);
  });

  test('sound validation allows audio files only', () => {
    const plugin = createPlugin();

    expect(plugin.isAllowedSoundFileName('win.mp3')).toBe(true);
    expect(plugin.isAllowedSoundFileName('voice.WAV')).toBe(true);
    expect(plugin.isAllowedSoundFileName('../bad.exe')).toBe(false);
    expect(plugin.isAllowedSoundFileName('script.js')).toBe(false);
  });

  test('health payload exposes setup and inventory state', () => {
    const plugin = createPlugin();

    plugin.db = {
      prepare: jest.fn((sql) => {
        if (sql.includes('COUNT(*) as count FROM questions')) {
          return { get: jest.fn(() => ({ count: 12 })) };
        }
        if (sql.includes('COUNT(*) as count FROM categories')) {
          return { get: jest.fn(() => ({ count: 3 })) };
        }
        if (sql.includes('COUNT(*) as count FROM game_sounds')) {
          return { get: jest.fn(() => ({ count: 4 })) };
        }
        if (sql.includes('leaderboard_seasons')) {
          return { get: jest.fn(() => ({ season_name: 'Season 1' })) };
        }
        return { get: jest.fn(() => ({ count: 0 })) };
      })
    };

    const health = plugin.buildHealthPayload();

    expect(health.success).toBe(true);
    expect(health.checks.database.status).toBe('ok');
    expect(health.inventory.questions).toBe(12);
    expect(health.inventory.categories).toBe(3);
    expect(health.inventory.sounds).toBe(4);
    expect(health.setup.completed).toBe(false);
  });
});
