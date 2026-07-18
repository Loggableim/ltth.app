const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_FIREWORKS_CONFIG,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  normalizeCompletionNotification,
  normalizeConfig,
  normalizeFinaleRequest
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const {
  SuperfanFinaleHistory,
  normalizeSuperfanIdentity,
  normalizeSuperfanIdentityAliases
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

  test('normalizes Superfan end card defaults, bounds, positions, and sizes', () => {
    expect(DEFAULT_FIREWORKS_CONFIG).toMatchObject({
      superfanEndCardDuration: 3000,
      superfanEndCardPosition: 'center',
      superfanEndCardSize: 'medium',
      superfanEndCardScale: 1
    });
    expect(normalizeConfig({
      superfanEndCardDuration: 250,
      superfanEndCardPosition: 'invalid',
      superfanEndCardSize: 'giant',
      superfanEndCardScale: 9
    })).toMatchObject({
      superfanEndCardDuration: 1000,
      superfanEndCardPosition: 'center',
      superfanEndCardSize: 'medium',
      superfanEndCardScale: 2
    });
    expect(normalizeConfig({
      superfanEndCardDuration: 20000,
      superfanEndCardPosition: 'bottom-right',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 0.1
    })).toMatchObject({
      superfanEndCardDuration: 10000,
      superfanEndCardPosition: 'bottom-right',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 0.5
    });

    for (const position of ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right']) {
      expect(normalizeConfig({ superfanEndCardPosition: position }).superfanEndCardPosition).toBe(position);
    }
    for (const size of ['small', 'medium', 'large', 'custom']) {
      expect(normalizeConfig({ superfanEndCardSize: size }).superfanEndCardSize).toBe(size);
    }
  });

  test('normalizes and bounds completion notification payloads', () => {
    const normalized = normalizeCompletionNotification({
      username: `  ${'A'.repeat(100)}  `,
      usernameText: '  Custom closing username line  ',
      thankYouText: '  This firework was for you!  ',
      profilePictureUrl: 'https://example.test/avatar.png',
      duration: 25000,
      position: 'bottom-right',
      size: 'custom',
      scale: 0.1,
      style: 'gradient-gold',
      entrance: 'bounce'
    });

    expect(normalized).toMatchObject({
      username: 'A'.repeat(80),
      usernameText: 'Custom closing username line',
      thankYouText: 'This firework was for you!',
      profilePictureUrl: 'https://example.test/avatar.png',
      duration: 10000,
      position: 'bottom-right',
      size: 'custom',
      scale: 0.5,
      style: 'gradient-gold',
      entrance: 'bounce'
    });
    expect(normalizeCompletionNotification({
      username: ' ',
      profilePictureUrl: 'javascript:alert(1)',
      duration: 1,
      position: 'invalid',
      size: 'invalid',
      scale: 99,
      style: 'invalid',
      entrance: 'invalid'
    })).toEqual({
      username: 'Superfan',
      usernameText: 'Thank you for being a Superfan, Superfan!',
      thankYouText: 'This firework was for you!',
      profilePictureUrl: null,
      duration: 1000,
      position: 'center',
      size: 'medium',
      scale: 2,
      style: 'gradient-purple',
      entrance: 'scale'
    });
    expect(normalizeCompletionNotification(null)).toBeNull();
    expect(normalizeFinaleRequest({})).not.toHaveProperty('completionNotification');
    expect(normalizeFinaleRequest({ completionNotification: normalized })).toHaveProperty(
      'completionNotification',
      normalized
    );
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

  test('extracts only the highest-priority stable ID and handle alias', () => {
    expect(normalizeSuperfanIdentityAliases({
      userId: ' 42 ',
      user: { id: 42 },
      uniqueId: '  Fan.Name  ',
      username: 'fan.name',
      nickname: ' Display Name '
    })).toEqual(['id:42', 'user:fan.name']);
  });

  test('keeps different stable IDs separate when only their nickname matches', () => {
    const filePath = path.join(tempDir, 'shared-nickname-history.json');
    const history = new SuperfanFinaleHistory({ filePath, now: () => 1_000_000 });

    history.markAccepted(normalizeSuperfanIdentityAliases({
      userId: 'a', uniqueId: 'Alpha.Live', nickname: 'Shared Display'
    }), 900_000);
    history.markAccepted(normalizeSuperfanIdentityAliases({
      userId: 'b', uniqueId: 'Beta.Live', nickname: 'Shared Display'
    }), 1_000_000);

    expect(history.snapshot()).toEqual({ 'id:a': 900_000, 'id:b': 1_000_000 });
    expect(history.aliasSnapshot()).toEqual({
      'user:alpha.live': 'id:a',
      'user:beta.live': 'id:b'
    });
  });

  test('does not steal history when one handle is already bound to another stable ID', () => {
    const filePath = path.join(tempDir, 'conflicting-handle-history.json');
    const warnings = [];
    const history = new SuperfanFinaleHistory({
      filePath,
      log: message => warnings.push(message),
      now: () => 1_000_000
    });
    const firstIdentity = normalizeSuperfanIdentityAliases({ userId: 'a', uniqueId: 'Shared.Handle' });
    const conflictingIdentity = normalizeSuperfanIdentityAliases({ userId: 'b', uniqueId: ' shared.handle ' });

    history.markAccepted(firstIdentity, 900_000);
    expect(history.isEligible(conflictingIdentity, 24, 1_000_000)).toBe(true);
    expect(history.snapshot()).toEqual({ 'id:a': 900_000 });

    history.markAccepted(conflictingIdentity, 1_000_000);
    expect(history.snapshot()).toEqual({ 'id:a': 900_000, 'id:b': 1_000_000 });
    expect(history.aliasSnapshot()).toEqual({ 'user:shared.handle': 'id:a' });
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Superfan identity alias conflict')
    ]));

    const reloaded = new SuperfanFinaleHistory({ filePath, now: () => 1_000_000 });
    expect(reloaded.load()).toBe(2);
    expect(reloaded.snapshot()).toEqual({ 'id:a': 900_000, 'id:b': 1_000_000 });
  });

  test('persists one cooldown when an id-plus-handle event is followed by a handle-only event', () => {
    const filePath = path.join(tempDir, 'id-first-history.json');
    const now = 1_000_000;
    const first = new SuperfanFinaleHistory({ filePath, now: () => now });
    const mixedAliases = normalizeSuperfanIdentityAliases({ userId: '42', uniqueId: '  Fan.Name ' });

    first.markAccepted(mixedAliases);
    expect(first.snapshot()).toEqual({ 'id:42': now });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toMatchObject({
      version: 2,
      entries: { 'id:42': now },
      aliases: { 'user:fan.name': 'id:42' }
    });

    const reloaded = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(reloaded.load()).toBe(1);
    expect(reloaded.isEligible(
      normalizeSuperfanIdentityAliases({ uniqueId: ' FAN.NAME ' }),
      24,
      now
    )).toBe(false);
    expect(reloaded.snapshot()).toEqual({ 'id:42': now });
  });

  test('migrates handle-first history to a stable id and keeps it collapsed after reload', () => {
    const filePath = path.join(tempDir, 'handle-first-history.json');
    const now = 1_000_000;
    const handleOnly = new SuperfanFinaleHistory({ filePath, now: () => now });
    handleOnly.markAccepted(normalizeSuperfanIdentityAliases({ username: ' Fan.Name ' }));

    const mixed = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(mixed.load()).toBe(1);
    expect(mixed.isEligible(
      normalizeSuperfanIdentityAliases({ userId: '42', uniqueId: 'fan.name' }),
      24,
      now
    )).toBe(false);
    expect(mixed.snapshot()).toEqual({ 'id:42': now });

    const idOnly = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(idOnly.load()).toBe(1);
    expect(idOnly.isEligible(normalizeSuperfanIdentityAliases({ userId: '42' }), 24, now)).toBe(false);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).aliases)
      .toMatchObject({ 'user:fan.name': 'id:42' });
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

  test('restores the original history when the replacement rename fails and cleans temporary files', () => {
    const filePath = path.join(tempDir, 'replace-safe-history.json');
    let now = 1_000_000;
    const history = new SuperfanFinaleHistory({ filePath, now: () => now });
    history.markAccepted('id:a');
    now = 2_000_000;
    history.entries.set('id:a', now);

    const realRename = fs.renameSync;
    let tempToTargetAttempts = 0;
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(source).endsWith('.tmp') && destination === filePath) {
        tempToTargetAttempts++;
        if (tempToTargetAttempts <= 2) {
          const error = new Error(`rename attempt ${tempToTargetAttempts} failed`);
          error.code = tempToTargetAttempts === 1 ? 'EEXIST' : 'EIO';
          throw error;
        }
      }
      return realRename(source, destination);
    });
    try {
      expect(() => history.save()).toThrow('rename attempt 2 failed');
    } finally {
      rename.mockRestore();
    }

    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).entries).toEqual({ 'id:a': 1_000_000 });
    expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
    expect(fs.existsSync(`${filePath}.${process.pid}.tmp`)).toBe(false);
  });

  test('recovers a valid orphaned backup during load', () => {
    const filePath = path.join(tempDir, 'recover-history.json');
    const now = 1_000_000;
    fs.writeFileSync(`${filePath}.bak`, JSON.stringify({
      version: 2,
      entries: { 'id:recovered': now },
      aliases: { 'user:recovered': 'id:recovered' }
    }), 'utf8');

    const history = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(history.load()).toBe(1);
    expect(history.getLastAcceptedAt('user:recovered')).toBe(now);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  function createApi() {
    const routes = new Map();
    const events = new Map();
    const socketConnections = [];
    return {
      routes,
      events,
      socketConnections,
      getPluginDataDir: () => tempDir,
      ensurePluginDataDir: jest.fn(),
      getConfig: jest.fn(() => null),
      setConfig: jest.fn(),
      getDatabase: jest.fn(() => null),
      emit: jest.fn(),
      log: jest.fn(),
      registerMiddleware: jest.fn(),
      registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
      registerTikTokEvent: jest.fn((event, handler) => events.set(event, handler)),
      registerSocketConnection: jest.fn(handler => socketConnections.push(handler))
    };
  }

  function connectSocket(plugin, api, id = 'overlay-1') {
    const handlers = new Map();
    const socket = {
      id,
      handlers,
      emit: jest.fn(),
      on: jest.fn((event, handler) => handlers.set(event, handler)),
      removeAllListeners: jest.fn(event => handlers.delete(event))
    };
    plugin.registerSocketHandlers();
    api.socketConnections[0](socket);
    handlers.get('webgpu-fireworks:renderer-status')({ state: 'ready' });
    return socket;
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

  test('routes only paid subscriber joins and authoritative subscription events through one per-user cooldown', () => {
    const { api, plugin, history } = createPlugin({
      superfanFinaleEnabled: true,
      superfanFinaleCooldownHours: 24,
      superfanFinaleIntensity: 4,
      goalFinaleStyle: 'sky-ballet',
      goalFinaleLength: 'short'
    });
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, ...request }));
    plugin.registerTikTokEventHandlers();

    api.events.get('join')({ userId: 'a', uniqueId: 'Alpha', teamMemberLevel: 50, isSubscriber: false });
    expect(plugin.triggerFinale).not.toHaveBeenCalled();

    api.events.get('join')({
      userId: 'a',
      uniqueId: 'Alpha',
      teamMemberLevel: 0,
      isSubscriber: true,
      profilePictureUrl: '/a.png'
    });
    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      style: 'sky-ballet', length: 'short', intensity: 4
    }));
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.objectContaining({
      username: 'Alpha',
      profilePictureUrl: '/a.png',
      thankYouText: 'Superfan joined, this firework is for you!'
    }));
    expect(history.getLastAcceptedAt('id:a')).toBeNull();
    plugin.handleSuperfanFinaleAck({
      eventId: [...plugin.pendingSuperfanFinales.keys()][0],
      accepted: true
    });
    expect(history.getLastAcceptedAt('id:a')).not.toBeNull();

    api.events.get('subscribe')({ userId: 'a', uniqueId: 'Alpha', isSubscriber: true });
    expect(plugin.triggerFinale).toHaveBeenCalledTimes(1);
    api.events.get('subscribe')({ userId: 'b', uniqueId: 'Beta', isSubscriber: true });
    expect(plugin.triggerFinale).toHaveBeenCalledTimes(2);
  });

  test('attaches the personalized completion card only to a Superfan finale request', () => {
    const { plugin } = createPlugin({
      superfanEndCardDuration: 4500,
      superfanEndCardPosition: 'top-right',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 1.4,
      followerAnimationStyle: 'neon',
      followerAnimationEntrance: 'slide-up'
    });
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));

    expect(plugin.handleSuperfanEntry({
      userId: 'paid-1',
      uniqueId: 'Alpha',
      profilePictureUrl: 'https://example.test/alpha.png'
    }, { authoritative: true })).toMatchObject({ accepted: true });

    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      completionNotification: {
        username: 'Alpha',
        usernameText: 'Thank you for being a Superfan, Alpha!',
        thankYouText: 'This firework was for you!',
        profilePictureUrl: 'https://example.test/alpha.png',
        duration: 4500,
        position: 'top-right',
        size: 'custom',
        scale: 1.4,
        style: 'neon',
        entrance: 'slide-up'
      }
    }));
  });

  test('falls back to Superfan in the personalized completion copy', () => {
    const { plugin } = createPlugin();
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));

    plugin.handleSuperfanEntry({ userId: 'paid-2' }, { authoritative: true });

    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      completionNotification: expect.objectContaining({
        username: 'Superfan',
        usernameText: 'Thank you for being a Superfan, Superfan!'
      })
    }));
  });

  test('emits a normalized completion descriptor while generic finales omit it', () => {
    const { api, plugin } = createPlugin();

    const generic = plugin.triggerFinale({ style: 'classic-crescendo', length: 'short' });
    expect(generic).not.toHaveProperty('completionNotification');
    expect(api.emit).toHaveBeenLastCalledWith(
      'webgpu-fireworks:finale',
      expect.not.objectContaining({ completionNotification: expect.anything() })
    );

    const withCard = plugin.triggerFinale({
      style: 'classic-crescendo',
      length: 'short',
      completionNotification: {
        username: 'Alpha',
        duration: 90000,
        position: 'top-left',
        size: 'large',
        scale: 1.5,
        style: 'minimal',
        entrance: 'fade'
      }
    });
    expect(withCard.completionNotification).toMatchObject({
      username: 'Alpha',
      duration: 10000,
      position: 'top-left',
      size: 'large',
      scale: 1.5,
      style: 'minimal',
      entrance: 'fade'
    });
    expect(api.emit).toHaveBeenLastCalledWith(
      'webgpu-fireworks:finale',
      expect.objectContaining({ completionNotification: withCard.completionNotification })
    );
  });

  test('manual finale route strips completion notification input', () => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerFinale = jest.fn(() => ({ accepted: true }));
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    api.routes.get('post:/api/webgpu-fireworks/finale')({
      body: {
        style: 'classic-crescendo',
        length: 'short',
        completionNotification: { username: 'Injected' }
      }
    }, res);

    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.not.objectContaining({
      completionNotification: expect.anything()
    }));
  });

  test.each([1, 2, 10, 50])(
    'does not treat fan-team level %s as a paid Superfan subscription',
    teamMemberLevel => {
      const { plugin, history } = createPlugin();
      plugin.triggerFinale = jest.fn(() => ({ accepted: true }));

      expect(plugin.handleSuperfanEntry({
        userId: `team-${teamMemberLevel}`,
        uniqueId: `TeamMember${teamMemberLevel}`,
        teamMemberLevel,
        isSubscriber: false
      }, { authoritative: false })).toEqual({ accepted: false, reason: 'not-superfan' });
      expect(plugin.triggerFinale).not.toHaveBeenCalled();
      expect(history.snapshot()).toEqual({});
    }
  );

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

  test('commits cooldown exactly once only after the correlated browser queue ACK', () => {
    const { api, plugin, history } = createPlugin();
    connectSocket(plugin, api);
    const markAccepted = jest.spyOn(history, 'markAccepted');

    const result = plugin.handleSuperfanEntry({
      userId: 'a', uniqueId: 'Alpha', eventId: 'join-upstream-7'
    }, { authoritative: true });

    expect(result).toMatchObject({ accepted: true, pending: true, eventId: 'superfan-event:join-upstream-7' });
    expect(history.snapshot()).toEqual({});
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', expect.objectContaining({
      id: 'superfan-event:join-upstream-7',
      ackRequested: true,
      requiresRendererReady: true
    }));

    expect(plugin.handleSuperfanFinaleAck({ eventId: result.eventId, accepted: true })).toBe(true);
    expect(history.snapshot()).toEqual({ 'id:a': expect.any(Number) });
    expect(markAccepted).toHaveBeenCalledTimes(1);
    expect(plugin.handleSuperfanFinaleAck({ eventId: result.eventId, accepted: true })).toBe(false);
    expect(markAccepted).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      { userId: 'a', uniqueId: ' Alpha ' },
      { username: ' ALPHA ' }
    ],
    [
      { username: ' Alpha ' },
      { userId: 'a', uniqueId: ' ALPHA ' }
    ]
  ])('deduplicates mixed-shape aliases while the same Superfan finale is pending', (first, second) => {
    const { plugin } = createPlugin();
    const triggerFinale = jest.spyOn(plugin, 'triggerFinale');
    const initial = plugin.handleSuperfanEntry(first, { authoritative: true });
    const duplicate = plugin.handleSuperfanEntry(second, { authoritative: true });

    expect(initial).toMatchObject({ accepted: true, pending: true });
    expect(duplicate).toMatchObject({ accepted: false, reason: 'pending', eventId: initial.eventId });
    expect(triggerFinale).toHaveBeenCalledTimes(1);
    expect(plugin.pendingSuperfanFinales.size).toBe(1);
  });

  test('clears a negative ACK and generates monotone retry IDs without consuming cooldown', () => {
    const { plugin, history } = createPlugin();
    const first = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });

    expect(plugin.handleSuperfanFinaleAck({ eventId: first.eventId, accepted: false, reason: 'duplicate' })).toBe(false);
    expect(history.snapshot()).toEqual({});
    expect(plugin.pendingSuperfanFinales.size).toBe(0);

    const retry = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });
    expect(first.eventId).toBe('superfan:id:a:1');
    expect(retry.eventId).toBe('superfan:id:a:2');
  });

  test('expires an unacknowledged attempt and ignores its late ACK', () => {
    jest.useFakeTimers();
    try {
      const { plugin, history } = createPlugin();
      plugin.superfanFinaleAckTimeoutMs = 50;
      const result = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });

      jest.advanceTimersByTime(50);
      expect(plugin.pendingSuperfanFinales.size).toBe(0);
      expect(plugin.handleSuperfanFinaleAck({ eventId: result.eventId, accepted: true })).toBe(false);
      expect(history.snapshot()).toEqual({});
    } finally {
      jest.useRealTimers();
    }
  });

  test.each(['disconnect', 'renderer-error', 'destroy'])('clears pending work on %s and ignores a late ACK', async failure => {
    const { api, plugin, history } = createPlugin();
    const socket = connectSocket(plugin, api);
    const result = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });

    if (failure === 'disconnect') socket.handlers.get('disconnect')();
    else if (failure === 'renderer-error') {
      socket.handlers.get('webgpu-fireworks:renderer-status')({ state: 'error', reason: 'render pass failed' });
    } else await plugin.destroy();

    expect(plugin.pendingSuperfanFinales.size).toBe(0);
    expect(plugin.handleSuperfanFinaleAck({ eventId: result.eventId, accepted: true }, socket)).toBe(false);
    expect(history.snapshot()).toEqual({});
  });

  test('keeps a pending attempt alive while another ready overlay can still ACK it', () => {
    const { api, plugin, history } = createPlugin();
    const firstSocket = connectSocket(plugin, api, 'overlay-1');
    const secondSocket = connectSocket(plugin, api, 'overlay-2');
    const result = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });

    firstSocket.handlers.get('disconnect')();
    expect(plugin.pendingSuperfanFinales.size).toBe(1);
    expect(plugin.handleSuperfanFinaleAck({ eventId: result.eventId, accepted: true }, secondSocket)).toBe(true);
    expect(history.snapshot()).toEqual({ 'id:a': expect.any(Number) });
  });

  test('does not overwrite pending state when different users reuse an upstream event ID', () => {
    const { plugin } = createPlugin();
    const first = plugin.handleSuperfanEntry({
      userId: 'a', uniqueId: 'Alpha', eventId: 'shared-upstream-id'
    }, { authoritative: true });
    const collision = plugin.handleSuperfanEntry({
      userId: 'b', uniqueId: 'Beta', eventId: 'shared-upstream-id'
    }, { authoritative: true });

    expect(collision).toEqual({
      accepted: false,
      reason: 'event-id-pending',
      eventId: first.eventId
    });
    expect(plugin.pendingSuperfanFinales.get(first.eventId)).toMatchObject({ identity: 'id:a' });
    expect(plugin.pendingSuperfanAliases.get('id:b')).toBeUndefined();
  });

  test.each(['false', 'throw'])('does not consume cooldown when the immediate notification emit returns %s', mode => {
    const { api, plugin, history } = createPlugin();
    api.emit.mockImplementation(event => {
      if (event !== 'webgpu-fireworks:follower-animation') return true;
      if (mode === 'throw') throw new Error('notification transport failed');
      return false;
    });

    const result = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });
    expect(result).toMatchObject({ accepted: false, reason: 'notification-rejected' });
    expect(plugin.pendingSuperfanFinales.size).toBe(0);
    expect(history.snapshot()).toEqual({});
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.objectContaining({
      thankYouText: 'Superfan joined, this firework is for you!'
    }));
  });

  test('waits for notification acceptance when a queue ACK arrives synchronously', () => {
    const { api, plugin, history } = createPlugin();
    api.emit.mockImplementation((event, payload) => {
      if (event === 'webgpu-fireworks:finale') {
        plugin.handleSuperfanFinaleAck({ eventId: payload.eventId, accepted: true });
      }
      return true;
    });

    const result = plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true });
    expect(result).toMatchObject({ accepted: true, pending: false });
    expect(history.snapshot()).toEqual({ 'id:a': expect.any(Number) });
    expect([...api.emit.mock.calls].map(call => call[0])).toEqual([
      'webgpu-fireworks:finale',
      'webgpu-fireworks:follower-animation'
    ]);
  });

  test('clears pending state when the finale emit throws', () => {
    const { api, plugin, history } = createPlugin();
    api.emit.mockImplementation(event => {
      if (event === 'webgpu-fireworks:finale') throw new Error('socket transport failed');
      return true;
    });

    expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
      .toMatchObject({ accepted: false, reason: 'submission-error' });
    expect(plugin.pendingSuperfanFinales.size).toBe(0);
    expect(history.snapshot()).toEqual({});
  });

  test('test route uses normalized visible overrides without mutating config or cooldown history', () => {
    const { api, plugin, history } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));
    const handleSuperfanEntry = jest.spyOn(plugin, 'handleSuperfanEntry');
    const persistedConfig = { ...plugin.config };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    api.routes.get('post:/api/webgpu-fireworks/test-superfan')({
      body: {
        username: 'TestSuperfan',
        settings: {
          superfanFinaleEnabled: false,
          superfanFinaleCooldownHours: 168,
          superfanFinaleIntensity: 7.5,
          superfanEndCardDuration: 4500,
          superfanEndCardPosition: 'bottom-left',
          superfanEndCardSize: 'custom',
          superfanEndCardScale: 1.6,
          goalFinaleStyle: 'sky-ballet',
          goalFinaleLength: 'short',
          enabled: false,
          followerAnimationDuration: 9000,
          unknownKey: 'must-not-pass'
        }
      }
    }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, accepted: true }));
    const [entry, options] = handleSuperfanEntry.mock.calls[0];
    expect(entry).toEqual(expect.objectContaining({ uniqueId: 'TestSuperfan' }));
    expect(options).toEqual(expect.objectContaining({
      authoritative: true,
      bypassCooldown: true,
      bypassEnabled: true
    }));
    expect(options.configOverride).toEqual({
      superfanFinaleEnabled: false,
      superfanFinaleCooldownHours: 168,
      superfanFinaleIntensity: 7.5,
      superfanEndCardDuration: 4500,
      superfanEndCardPosition: 'bottom-left',
      superfanEndCardSize: 'custom',
      superfanEndCardScale: 1.6,
      goalFinaleStyle: 'sky-ballet',
      goalFinaleLength: 'short'
    });
    expect(options.configOverride).not.toHaveProperty('enabled');
    expect(options.configOverride).not.toHaveProperty('followerAnimationDuration');
    expect(options.configOverride).not.toHaveProperty('unknownKey');
    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      intensity: 7.5,
      style: 'sky-ballet',
      length: 'short',
      bypassEnabled: true,
      completionNotification: expect.objectContaining({
        duration: 4500,
        position: 'bottom-left',
        size: 'custom',
        scale: 1.6
      })
    }));
    expect(plugin.config).toEqual(persistedConfig);
    expect(api.setConfig).not.toHaveBeenCalled();
    expect(history.snapshot()).toEqual({});
  });

  test('test route normalizes invalid overrides before planning the finale', () => {
    const { api, plugin, history } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));
    const handleSuperfanEntry = jest.spyOn(plugin, 'handleSuperfanEntry');
    const persistedConfig = { ...plugin.config };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    api.routes.get('post:/api/webgpu-fireworks/test-superfan')({
      body: {
        settings: {
          superfanFinaleEnabled: 'false',
          superfanFinaleCooldownHours: 13,
          superfanFinaleIntensity: 99,
          goalFinaleStyle: 'not-a-style',
          goalFinaleLength: 'huge'
        }
      }
    }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, accepted: true }));
    expect(handleSuperfanEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      configOverride: expect.objectContaining({
        superfanFinaleEnabled: true,
        superfanFinaleCooldownHours: 24,
        superfanFinaleIntensity: 10,
        goalFinaleStyle: 'auto',
        goalFinaleLength: 'medium'
      })
    }));
    expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      intensity: 10,
      style: 'auto',
      length: 'medium'
    }));
    expect(plugin.config).toEqual(persistedConfig);
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
