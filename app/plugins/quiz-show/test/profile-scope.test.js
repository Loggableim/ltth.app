'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const ConfigPathManager = require('../../../modules/config-path-manager');
const { PluginAPI } = require('../../../modules/plugin-loader');
const QuizShowPlugin = require('../main');

describe('Quiz Show profile-scoped database initialization', () => {
  let root;
  const openedPlugins = [];

  function createPlugin(profileId) {
    const configPathManager = new ConfigPathManager({
      appDir: path.join(root, 'app'),
      env: {
        LOCALAPPDATA: path.join(root, 'local'),
        USERPROFILE: path.join(root, 'user')
      }
    });
    const mainDb = { exec: jest.fn() };
    const api = new PluginAPI(
      'quiz-show',
      path.join(root, 'app', 'plugins', 'quiz-show'),
      {},
      { emit: jest.fn() },
      { db: mainDb },
      { info() {}, warn() {}, error() {}, debug() {} },
      { plugins: new Map() },
      configPathManager,
      null,
      null,
      profileId
    );
    jest.spyOn(api, 'ensurePluginDataDir');
    const pluginDataDir = api.getPluginDataDir({ profileScoped: true });
    const plugin = new QuizShowPlugin(api);
    plugin.cleanupQuestionHistory = jest.fn();
    plugin.migrateSchema = jest.fn(async () => {});
    plugin.migrateOldData = jest.fn(async () => {});
    plugin.seedGeneralKnowledgePackage = jest.fn(async () => {});
    openedPlugins.push(plugin);
    return { plugin, api, mainDb, pluginDataDir };
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-quiz-profile-scope-'));
    openedPlugins.length = 0;
  });

  afterEach(() => {
    for (const plugin of openedPlugins) {
      if (plugin.db?.open) plugin.db.close();
    }
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  test('A to B to A reopens isolated season and history databases', async () => {
    const profileA = createPlugin('profile_a');
    await profileA.plugin.initDatabase();
    const pathA = profileA.plugin.db.name;
    profileA.plugin.db.prepare(
      'INSERT INTO leaderboard_seasons (season_name, start_date, is_active) VALUES (?, ?, 1)'
    ).run('Fixture A', '2026-01-01T00:00:00.000Z');
    profileA.plugin.db.prepare('INSERT INTO questions (question, answers, correct) VALUES (?, ?, ?)')
      .run('Fixture A question', '["A","B"]', 0);
    profileA.plugin.db.prepare('INSERT INTO question_history (question_id) VALUES (1)').run();
    profileA.plugin.db.close();
    profileA.plugin.db = null;

    const profileB = createPlugin('profile_b');
    await profileB.plugin.initDatabase();
    const pathB = profileB.plugin.db.name;
    profileB.plugin.db.prepare(
      'INSERT INTO leaderboard_seasons (season_name, start_date, is_active) VALUES (?, ?, 1)'
    ).run('Fixture B', '2026-02-01T00:00:00.000Z');
    profileB.plugin.db.close();
    profileB.plugin.db = null;

    const profileAReloaded = createPlugin('profile_a');
    await profileAReloaded.plugin.initDatabase();

    expect(pathA).toBe(path.join(profileA.pluginDataDir, 'quiz_show.db'));
    expect(pathB).toBe(path.join(profileB.pluginDataDir, 'quiz_show.db'));
    expect(pathA).not.toBe(pathB);
    expect(profileAReloaded.plugin.db.prepare(
      "SELECT season_name FROM leaderboard_seasons WHERE season_name LIKE 'Fixture %' ORDER BY season_name"
    ).all()).toEqual([{ season_name: 'Fixture A' }]);
    expect(profileAReloaded.plugin.db.prepare(
      'SELECT question FROM questions WHERE question LIKE \'Fixture %\''
    ).all()).toEqual([{ question: 'Fixture A question' }]);
    expect(profileAReloaded.plugin.db.prepare('SELECT COUNT(*) AS count FROM question_history').get().count).toBe(1);
    expect(profileB.pluginDataDir).not.toBe(profileAReloaded.pluginDataDir);
  });

  test('does not inspect or copy package legacy DB/WAL/SHM when a profile DB is missing', async () => {
    const legacyDir = path.join(__dirname, '..', 'data');
    const readdirSpy = jest.spyOn(fs, 'readdirSync');
    const copySpy = jest.spyOn(fs, 'copyFileSync');
    const existsSpy = jest.spyOn(fs, 'existsSync');
    try {
      const profile = createPlugin('legacy_fixture');
      await profile.plugin.initDatabase();

      expect(profile.api.ensurePluginDataDir).toHaveBeenCalledWith({ profileScoped: true });
      expect(profile.plugin.db.name).toBe(path.join(profile.pluginDataDir, 'quiz_show.db'));
      expect(existsSpy.mock.calls.some(([candidate]) => path.resolve(candidate) === path.resolve(legacyDir))).toBe(false);
      expect(readdirSpy.mock.calls.some(([candidate]) => path.resolve(candidate) === path.resolve(legacyDir))).toBe(false);
      expect(copySpy.mock.calls.some(([source]) => path.resolve(path.dirname(source)) === path.resolve(legacyDir))).toBe(false);
    } finally {
      existsSpy.mockRestore();
      readdirSpy.mockRestore();
      copySpy.mockRestore();
    }
  });
});
