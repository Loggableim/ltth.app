const MusicBotPlugin = require('../plugins/music-bot/main');

function makeSocket({ role = 'viewer', address = '203.0.113.8', auth = {}, headers = {} } = {}) {
  const emitted = [];
  return {
    handshake: { headers, address, auth: { role, ...auth } },
    emitted,
    emit: (event, payload) => emitted.push({ event, payload })
  };
}

function makePlugin() {
  const handlers = new Map();
  const plugin = Object.create(MusicBotPlugin.prototype);
  plugin.api = {
    registerSocket: (event, handler) => handlers.set(event, async (socket, ...args) => {
      try {
        await handler(socket, ...args);
      } catch (error) {
        socket.emit('plugin:error', { plugin: 'music-bot', event, error: error.message });
      }
    }),
    log: jest.fn()
  };
  plugin._isSafetyLocked = jest.fn(() => false);
  plugin._lockedResult = jest.fn(() => ({ error: 'Fixture safety lock active' }));
  plugin._skipCurrent = jest.fn().mockResolvedValue(true);
  plugin._applySerializedConfigPatch = jest.fn().mockResolvedValue(undefined);
  plugin.playbackEngine = {
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined)
  };
  plugin._emitPaused = jest.fn();
  plugin._emitResumed = jest.fn();
  plugin._registerSocketEvents();
  return { plugin, handlers };
}

describe('Music Bot dashboard socket authorization', () => {
  const originalLtthToken = process.env.LTTH_ADMIN_TOKEN;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  afterEach(() => {
    if (originalLtthToken === undefined) delete process.env.LTTH_ADMIN_TOKEN;
    else process.env.LTTH_ADMIN_TOKEN = originalLtthToken;
    if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalAdminToken;
  });

  test.each([
    ['musicbot:dashboard-skip', undefined],
    ['musicbot:dashboard-volume', { masterVolume: 32 }],
    ['musicbot:dashboard-pause', undefined],
    ['musicbot:dashboard-resume', undefined]
  ])('rejects unauthorized %s without running its action', async (event, payload) => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { plugin, handlers } = makePlugin();
    const socket = makeSocket({ role: 'overlay' });

    await handlers.get(event)(socket, payload);

    expect(socket.emitted).toContainEqual({
      event: 'musicbot:error',
      payload: { error: 'Unauthorized socket action', event }
    });
    expect(plugin._skipCurrent).not.toHaveBeenCalled();
    expect(plugin._applySerializedConfigPatch).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.resume).not.toHaveBeenCalled();
  });

  test.each([
    ['musicbot:dashboard-skip', undefined],
    ['musicbot:dashboard-volume', { masterVolume: 32 }],
    ['musicbot:dashboard-pause', undefined],
    ['musicbot:dashboard-resume', undefined]
  ])('allows a direct loopback admin to use %s', async (event, payload) => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { plugin, handlers } = makePlugin();
    const socket = makeSocket({ role: 'admin', address: '::ffff:127.0.0.1' });

    await handlers.get(event)(socket, payload);

    expect(socket.emitted.filter((entry) => entry.event === 'musicbot:error')).toHaveLength(0);
    if (event.endsWith('skip')) expect(plugin._skipCurrent).toHaveBeenCalledWith('dashboard-socket');
    if (event.endsWith('volume')) expect(plugin._applySerializedConfigPatch).toHaveBeenCalledTimes(1);
    if (event.endsWith('pause')) expect(plugin.playbackEngine.pause).toHaveBeenCalledTimes(1);
    if (event.endsWith('resume')) expect(plugin.playbackEngine.resume).toHaveBeenCalledTimes(1);
  });

  test.each([0, 100])('applies a valid dashboard volume boundary of %i', async (volume) => {
    const { plugin, handlers } = makePlugin();
    const socket = makeSocket({ role: 'admin', address: '127.0.0.1' });

    await handlers.get('musicbot:dashboard-volume')(socket, { masterVolume: volume });

    expect(plugin._applySerializedConfigPatch).toHaveBeenCalledWith(
      { audio: { masterVolume: volume } },
      'dashboard volume update',
      { applyAudio: true }
    );
    expect(socket.emitted).toHaveLength(0);
  });

  test.each([
    ['negative', -1],
    ['above 100', 101],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY]
  ])('rejects %s dashboard volume without mutating configuration', async (_label, volume) => {
    const { plugin, handlers } = makePlugin();
    const socket = makeSocket({ role: 'admin', address: '127.0.0.1' });

    await handlers.get('musicbot:dashboard-volume')(socket, { masterVolume: volume });

    expect(plugin._applySerializedConfigPatch).not.toHaveBeenCalled();
    expect(socket.emitted).toEqual([{
      event: 'musicbot:error',
      payload: { message: 'Volume must be between 0 and 100' }
    }]);
    expect(socket.emitted.some((entry) => entry.event === 'plugin:error')).toBe(false);
  });

  test.each([
    ['musicbot:dashboard-skip', (plugin) => plugin._skipCurrent],
    ['musicbot:dashboard-pause', (plugin) => plugin.playbackEngine.pause],
    ['musicbot:dashboard-resume', (plugin) => plugin.playbackEngine.resume]
  ])('emits one safe error and performs no action for safety-locked %s', async (event, getAction) => {
    const canary = 'resolver=private-provider token=fixture-secret';
    const { plugin, handlers } = makePlugin();
    const action = getAction(plugin);
    action.mockRejectedValue(new Error(canary));
    plugin._isSafetyLocked.mockReturnValue(true);
    const socket = makeSocket({ role: 'admin', address: '127.0.0.1' });

    await handlers.get(event)(socket);

    expect(action).not.toHaveBeenCalled();
    expect(socket.emitted).toEqual([{
      event: 'musicbot:error',
      payload: { message: 'Fixture safety lock active', locked: true }
    }]);
    expect(socket.emitted.some((entry) => entry.event === 'plugin:error')).toBe(false);
    expect(JSON.stringify(socket.emitted)).not.toContain(canary);
  });

  test.each([
    ['Forwarded', { forwarded: 'for=127.0.0.1;proto=http' }],
    ['X-Forwarded-For', { 'x-forwarded-for': '127.0.0.1' }],
    ['X-Forwarded-Proto', { 'x-forwarded-proto': 'http' }]
  ])('requires a token for loopback with %s and accepts a valid remote admin token', async (_label, headers) => {
    process.env.LTTH_ADMIN_TOKEN = 'fixture-admin-token';
    delete process.env.ADMIN_TOKEN;
    const { plugin, handlers } = makePlugin();
    const forwardedLoopback = makeSocket({
      role: 'admin',
      address: '127.0.0.1',
      headers
    });

    await handlers.get('musicbot:dashboard-pause')(forwardedLoopback);
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();

    const remoteAdmin = makeSocket({
      role: 'admin',
      auth: { adminToken: 'fixture-admin-token' }
    });
    await handlers.get('musicbot:dashboard-pause')(remoteAdmin);
    expect(plugin.playbackEngine.pause).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['missing token', {}],
    ['incorrect token', { adminToken: 'wrong-fixture-token' }]
  ])('rejects a remote admin with a %s', async (_label, auth) => {
    process.env.LTTH_ADMIN_TOKEN = 'fixture-admin-token';
    delete process.env.ADMIN_TOKEN;
    const { plugin, handlers } = makePlugin();
    const remoteAdmin = makeSocket({ role: 'admin', auth });

    await handlers.get('musicbot:dashboard-pause')(remoteAdmin);

    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
    expect(remoteAdmin.emitted).toContainEqual({
      event: 'musicbot:error',
      payload: { error: 'Unauthorized socket action', event: 'musicbot:dashboard-pause' }
    });
  });

  test.each([
    ['musicbot:dashboard-skip', (plugin, error) => plugin._skipCurrent.mockRejectedValue(error)],
    ['musicbot:dashboard-volume', (plugin, error) => plugin._applySerializedConfigPatch.mockRejectedValue(error)],
    ['musicbot:dashboard-pause', (plugin, error) => plugin.playbackEngine.pause.mockRejectedValue(error)],
    ['musicbot:dashboard-resume', (plugin, error) => plugin.playbackEngine.resume.mockRejectedValue(error)]
  ])('does not leak sensitive action errors from %s', async (event, rejectAction) => {
    const canary = 'provider=yt-dlp apiKey=fixture-secret resolver-detail=private';
    const { plugin, handlers } = makePlugin();
    rejectAction(plugin, new Error(canary));
    const socket = makeSocket({ role: 'admin', address: '127.0.0.1' });
    const payload = event.endsWith('volume') ? { masterVolume: 32 } : undefined;

    await handlers.get(event)(socket, payload);

    expect(socket.emitted).toContainEqual({
      event: 'musicbot:error',
      payload: {
        message: 'Music Bot action failed',
        code: 'MUSIC_BOT_ACTION_FAILED',
        event
      }
    });
    expect(socket.emitted.some((entry) => entry.event === 'plugin:error')).toBe(false);
    expect(JSON.stringify(socket.emitted)).not.toContain(canary);
    expect(JSON.stringify(plugin.api.log.mock.calls)).not.toContain(canary);
  });

  test('rejects an invalid volume payload without leaking coercion errors', async () => {
    const canary = 'resolver=private-provider token=fixture-secret';
    const { plugin, handlers } = makePlugin();
    const socket = makeSocket({ role: 'admin', address: '127.0.0.1' });
    const payload = {
      volume: {
        valueOf() {
          throw new Error(canary);
        }
      }
    };

    await handlers.get('musicbot:dashboard-volume')(socket, payload);

    expect(plugin._applySerializedConfigPatch).not.toHaveBeenCalled();
    expect(socket.emitted).toContainEqual({
      event: 'musicbot:error',
      payload: {
        message: 'Music Bot action failed',
        code: 'MUSIC_BOT_ACTION_FAILED',
        event: 'musicbot:dashboard-volume'
      }
    });
    expect(socket.emitted.some((entry) => entry.event === 'plugin:error')).toBe(false);
    expect(JSON.stringify(socket.emitted)).not.toContain(canary);
    expect(JSON.stringify(plugin.api.log.mock.calls)).not.toContain(canary);
  });

  test('keeps the read-only status request available without an admin role', async () => {
    const { plugin, handlers } = makePlugin();
    plugin.config = { audio: { masterVolume: 75, sourceVolume: 40 } };
    plugin.queueManager = { getQueue: () => [] };
    plugin._computeEffectiveVolume = () => 30;
    plugin._buildNowPlayingPayload = () => null;
    plugin._buildRuntimeSnapshot = () => ({ state: 'idle' });
    plugin._buildResolverSnapshot = () => ({ active: 0 });
    plugin._buildHealthPayload = () => ({ healthy: true });
    plugin._nextSongVote = { getStatus: () => null };
    const socket = makeSocket({ role: 'overlay' });

    await handlers.get('musicbot:request-status')(socket);

    expect(socket.emitted.map((entry) => entry.event)).toEqual([
      'musicbot:now-playing',
      'musicbot:queue-update',
      'musicbot:volume-changed',
      'musicbot:runtime',
      'musicbot:resolver',
      'musicbot:health',
      'musicbot:next-song-vote'
    ]);
    expect(socket.emitted.some((entry) => entry.event === 'musicbot:error')).toBe(false);
    expect(plugin._skipCurrent).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.pause).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.resume).not.toHaveBeenCalled();
  });
});
