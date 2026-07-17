const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_FIREWORKS_CONFIG,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const {
  SuperfanFinaleHistory,
  normalizeSuperfanIdentity
} = require('../plugins/webgpu-fireworks/lib/superfan-finale-history');
const FireworksPlugin = require('../plugins/webgpu-fireworks/main');

describe('WebGPU Superfan finale foundation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-superfan-finale-'));
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('normalizes supported cooldowns and intensity', () => {
    expect(SUPERFAN_FINALE_COOLDOWN_HOURS).toEqual([6, 12, 24, 72, 168]);
    expect(normalizeConfig({ superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 99 }))
      .toMatchObject({ superfanFinaleEnabled: true, superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 10 });
    expect(normalizeConfig({ superfanFinaleCooldownHours: 13, superfanFinaleIntensity: 0 }))
      .toMatchObject({
        superfanFinaleCooldownHours: DEFAULT_FIREWORKS_CONFIG.superfanFinaleCooldownHours,
        superfanFinaleIntensity: 1
      });
  });

  test('prefers stable user id and normalizes handle fallbacks', () => {
    expect(normalizeSuperfanIdentity({ userId: 42, uniqueId: 'Ignored' })).toBe('id:42');
    expect(normalizeSuperfanIdentity({ uniqueId: '  Fan.Name  ' })).toBe('user:fan.name');
    expect(normalizeSuperfanIdentity({})).toBeNull();
  });

  test('falls back from a blank top-level user id to the nested user id', () => {
    expect(normalizeSuperfanIdentity({ userId: '  ', user: { id: 42 } })).toBe('id:42');
  });

  test('falls back from a blank unique id to the username', () => {
    expect(normalizeSuperfanIdentity({ uniqueId: '  ', username: 'Valid.Name' })).toBe('user:valid.name');
  });

  test('persists independent timestamps and safely ignores corrupt JSON', () => {
    const filePath = path.join(tempDir, 'superfan-finales.json');
    let now = 1_000_000;
    const first = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(first.load()).toBe(0);
    first.markAccepted('id:a');
    expect(first.isEligible('id:a', 6, now + 6 * 60 * 60 * 1000 - 1)).toBe(false);
    expect(first.isEligible('id:a', 24, now + 12 * 60 * 60 * 1000)).toBe(false);
    expect(first.isEligible('id:a', 12, now + 12 * 60 * 60 * 1000)).toBe(true);
    expect(first.isEligible('id:b', 6, now)).toBe(true);

    const second = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(second.load()).toBe(1);
    expect(second.getLastAcceptedAt('id:a')).toBe(now);

    fs.writeFileSync(filePath, '{broken', 'utf8');
    const warnings = [];
    const corrupt = new SuperfanFinaleHistory({ filePath, log: message => warnings.push(message) });
    expect(corrupt.load()).toBe(0);
    expect(corrupt.snapshot()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  test('keeps the in-memory cooldown when persistence fails', () => {
    const warnings = [];
    const history = new SuperfanFinaleHistory({
      filePath: path.join(tempDir, 'unwritable.json'),
      log: message => warnings.push(message),
      now: () => 1234
    });
    jest.spyOn(history, 'save').mockImplementation(() => { throw new Error('disk full'); });
    history.markAccepted('id:a');
    expect(history.getLastAcceptedAt('id:a')).toBe(1234);
    expect(warnings).toEqual([expect.stringContaining('disk full')]);
  });

  test('discards future history entries while loading a current entry', () => {
    const filePath = path.join(tempDir, 'superfan-finales.json');
    const now = 1_000_000;
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      entries: {
        'id:current': now,
        'id:future': now + 1
      }
    }), 'utf8');
    const history = new SuperfanFinaleHistory({ filePath, now: () => now });

    expect(history.load()).toBe(1);
    expect(history.snapshot()).toEqual({ 'id:current': now });
  });

  function createApi() {
    const routes = new Map();
    const events = new Map();
    return {
      routes,
      events,
      getPluginDataDir: () => tempDir,
      ensurePluginDataDir: jest.fn(),
      getConfig: jest.fn(() => null),
      setConfig: jest.fn(),
      getDatabase: jest.fn(() => null),
      emit: jest.fn(),
      log: jest.fn(),
      registerMiddleware: jest.fn(),
      registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
      registerTikTokEvent: jest.fn((event, handler) => events.set(event, handler))
    };
  }

  function createPlugin(config = {}, now = 1_000_000) {
    const api = createApi();
    const plugin = new FireworksPlugin(api);
    plugin.config = normalizeConfig(config);
    plugin.upload = { single: jest.fn(() => (req, res, next) => next()) };
    const history = new SuperfanFinaleHistory({
      filePath: path.join(tempDir, `history-${Math.random()}.json`),
      now: () => now
    });
    plugin.superfanFinaleHistory = history;
    plugin.getRendererStatus = jest.fn(() => ({ state: 'ready' }));
    return { api, plugin, history };
  }

  test('loads persisted Superfan history before registering TikTok handlers', async () => {
    const api = createApi();
    const plugin = new FireworksPlugin(api);
    const lifecycle = [];
    api.ensurePluginDataDir.mockImplementation(() => lifecycle.push('ensure-data-dir'));
    const loadHistory = jest.spyOn(plugin.superfanFinaleHistory, 'load')
      .mockImplementation(() => lifecycle.push('load-history'));
    plugin.migrateOldData = jest.fn();
    plugin.loadConfig = jest.fn(() => { plugin.config = normalizeConfig(); });
    plugin.migrateFireworksSettings = jest.fn();
    plugin.registerRoutes = jest.fn();
    plugin.registerTikTokEventHandlers = jest.fn(() => lifecycle.push('register-events'));
    plugin.registerFlowActions = jest.fn();
    plugin.cacheGiftCatalog = jest.fn();
    plugin.registerSocketHandlers = jest.fn();
    plugin.logRoutes = jest.fn();

    await plugin.init();

    expect(plugin.pluginDataDir).toBe(tempDir);
    expect(loadHistory).toHaveBeenCalledTimes(1);
    expect(lifecycle).toEqual(['ensure-data-dir', 'load-history', 'register-events']);
  });

  test('routes eligible joins and authoritative events through one per-user cooldown', () => {
    const { api, plugin, history } = createPlugin({
      superfanFinaleEnabled: true,
      superfanFinaleCooldownHours: 24,
      superfanFinaleIntensity: 4,
      goalFinaleStyle: 'sky-ballet',
      goalFinaleLength: 'short'
    });
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, ...request }));
    plugin.registerTikTokEventHandlers();

    api.events.get('join')({ userId: 'a', uniqueId: 'Alpha', teamMemberLevel: 0 });
    expect(plugin.triggerFinale).not.toHaveBeenCalled();

    api.events.get('join')({ userId: 'a', uniqueId: 'Alpha', teamMemberLevel: 2, profilePictureUrl: '/a.png' });
    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      style: 'sky-ballet', length: 'short', intensity: 4
    }));
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.objectContaining({
      username: 'Alpha',
      profilePictureUrl: '/a.png',
      thankYouText: 'Superfan joined, this firework is for you!'
    }));
    expect(history.getLastAcceptedAt('id:a')).not.toBeNull();

    api.events.get('superfan')({ userId: 'a', uniqueId: 'Alpha' });
    expect(plugin.triggerFinale).toHaveBeenCalledTimes(1);
    api.events.get('superfan')({ userId: 'b', uniqueId: 'Beta' });
    expect(plugin.triggerFinale).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['missing', undefined],
    ['non-numeric', 'vip'],
    ['infinite', Infinity],
    ['negative', -1]
  ])('rejects a tentative join with a %s team member level', (label, teamMemberLevel) => {
    const { plugin, history } = createPlugin();
    plugin.triggerFinale = jest.fn(() => ({ accepted: true }));

    expect(plugin.handleSuperfanEntry({
      userId: `invalid-${label}`,
      uniqueId: 'InvalidJoin',
      teamMemberLevel
    }, { authoritative: false })).toEqual({ accepted: false, reason: 'not-superfan' });
    expect(plugin.triggerFinale).not.toHaveBeenCalled();
    expect(history.snapshot()).toEqual({});
  });

  test('does not consume cooldown when the finale is rejected', () => {
    const { plugin, history } = createPlugin();
    plugin.triggerFinale = jest.fn(() => ({ accepted: false, reason: 'disabled' }));
    expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
      .toMatchObject({ accepted: false, reason: 'disabled' });
    expect(history.getLastAcceptedAt('id:a')).toBeNull();
  });

  test('does not consume cooldown when the real finale submission is rejected', () => {
    const { api, plugin, history } = createPlugin();
    api.emit.mockImplementation(event => event === 'webgpu-fireworks:finale' ? false : true);

    expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
      .toMatchObject({
        accepted: false,
        reason: 'submission-rejected',
        identity: 'id:a',
        finale: { accepted: false, reason: 'submission-rejected' }
      });
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', expect.objectContaining({
      accepted: true,
      eventId: expect.stringContaining('superfan:id:a:')
    }));
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.anything());
    expect(history.getLastAcceptedAt('id:a')).toBeNull();
  });

  test('does not consume cooldown while the renderer is offline', () => {
    const { plugin, history } = createPlugin();
    plugin.getRendererStatus.mockReturnValue({ state: 'offline' });
    plugin.triggerFinale = jest.fn();
    expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
      .toMatchObject({ accepted: false, reason: 'renderer-not-ready' });
    expect(plugin.triggerFinale).not.toHaveBeenCalled();
    expect(history.getLastAcceptedAt('id:a')).toBeNull();
  });

  test('test route bypasses cooldown without mutating history', () => {
    const { api, plugin, history } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    api.routes.get('post:/api/webgpu-fireworks/test-superfan')({ body: { username: 'TestSuperfan' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, accepted: true }));
    expect(history.snapshot()).toEqual({});
  });

  test('settings API round-trips normalized Superfan values', () => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    api.routes.get('post:/api/webgpu-fireworks/config')({
      body: { superfanFinaleEnabled: false, superfanFinaleCooldownHours: 168, superfanFinaleIntensity: 7.5 }
    }, res);
    expect(plugin.config).toMatchObject({
      superfanFinaleEnabled: false,
      superfanFinaleCooldownHours: 168,
      superfanFinaleIntensity: 7.5
    });
    expect(api.setConfig).toHaveBeenCalledWith('settings', expect.objectContaining({
      superfanFinaleCooldownHours: 168
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('destroy cancels delayed follower notifications', async () => {
    jest.useFakeTimers();
    try {
      const { api, plugin } = createPlugin();
      plugin.scheduleFollowerAnimation({ username: 'Later' }, 1000);
      expect(plugin.notificationTimers.size).toBe(1);
      await plugin.destroy();
      jest.runAllTimers();
      expect(plugin.notificationTimers.size).toBe(0);
      expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });
});
