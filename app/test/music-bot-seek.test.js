const EventEmitter = require('events');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const MusicBotPlugin = require('../plugins/music-bot/main');

class SeekEngine extends EventEmitter {
  constructor({ duration = 120, seekable = true } = {}) {
    super();
    this.nowPlaying = { id: 'track-1', title: 'Track', duration };
    this.state = 'playing';
    this.seekable = seekable;
    this.position = 0;
    this.seek = jest.fn(async (positionSeconds) => {
      if (!this.seekable) {
        const error = new Error('Track is not seekable');
        error.code = 'PLAYBACK_UNSEEKABLE';
        throw error;
      }
      this.position = positionSeconds;
      return { position: positionSeconds, duration, seekable: this.seekable, state: this.state };
    });
  }

  getNowPlaying() { return this.nowPlaying; }
  getState() { return this.state; }
  isPlaying() { return this.state === 'playing'; }
}

function createController(engine = new SeekEngine()) {
  return new PlaybackController({ defaultVolume: 50 }, { log: jest.fn() }, {
    engineFactory: () => engine
  });
}

function activate(controller, engine, playbackId = 'playback-1') {
  const slot = {
    name: 'A',
    engine,
    playbackId,
    state: engine.state,
    retired: false,
    crashed: false,
    lastError: null
  };
  controller._slots.A = slot;
  controller.activeSlot = 'A';
  controller.activePlaybackId = playbackId;
  controller.transportState = engine.state;
  return slot;
}

function createPlugin() {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config = {
    playback: { crossfadeDuration: 3000 },
    audio: { masterVolume: 100, sourceVolume: 50 },
    autoDJ: { enabled: false },
    safety: { locked: false }
  };
  plugin.queueManager = { getQueue: jest.fn(() => []) };
  return { plugin, api, routes };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

describe('Music Bot backend seek', () => {
  test('PlaybackEngine sends an absolute exact IPC seek and confirms position and duration without unpausing', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.socket = { destroyed: false };
    engine.state = 'paused';
    engine.nowPlaying = { id: 'track', duration: 120, startedAt: Date.now() };
    engine._sendCommand = jest.fn(async (command) => {
      if (command[1] === 'time-pos') return { data: 42 };
      if (command[1] === 'duration') return { data: 120 };
      if (command[1] === 'seekable') return { data: true };
      return { data: null };
    });

    await expect(engine.seek(42)).resolves.toEqual(expect.objectContaining({
      position: 42,
      duration: 120,
      seekable: true,
      state: 'paused'
    }));
    expect(engine._sendCommand).toHaveBeenCalledWith(['seek', 42, 'absolute+exact'], expect.any(Object));
    expect(engine._sendCommand).toHaveBeenCalledWith(['get_property', 'time-pos'], expect.any(Object));
    expect(engine._sendCommand).toHaveBeenCalledWith(['get_property', 'duration'], expect.any(Object));
    expect(engine.state).toBe('paused');
  });

  test('PlaybackEngine rejects an unknown duration before moving the active track', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.socket = { destroyed: false };
    engine.state = 'playing';
    engine.nowPlaying = { id: 'track', duration: null };
    engine._sendCommand = jest.fn(async (command) => {
      if (command[1] === 'seekable') return { data: true };
      if (command[1] === 'duration') return { data: null };
      return { data: 0 };
    });

    await expect(engine.seek(42)).rejects.toMatchObject({ code: 'PLAYBACK_UNKNOWN_DURATION' });
    expect(engine._sendCommand).not.toHaveBeenCalledWith(['seek', 42, 'absolute+exact'], expect.any(Object));
  });

  test('PlaybackController seeks only the active matching playback and serializes stale IDs', async () => {
    const engine = new SeekEngine();
    const controller = createController(engine);
    activate(controller, engine, 'live-id');

    await expect(controller.seek(50, { playbackId: 'stale-id' })).rejects.toMatchObject({
      code: 'PLAYBACK_STALE_ID'
    });
    await expect(controller.seek(50, { playbackId: 'live-id' })).resolves.toEqual(expect.objectContaining({
      playbackId: 'live-id', position: 50
    }));
    expect(engine.seek).toHaveBeenCalledTimes(1);
  });

  test('PlaybackController rejects a seek when a safety lock is engaged during MPV confirmation', async () => {
    let releaseSeek;
    const engine = new SeekEngine();
    engine.seek.mockImplementation(() => new Promise((resolve) => { releaseSeek = resolve; }));
    const controller = createController(engine);
    activate(controller, engine, 'live-id');

    const pending = controller.seek(50, { playbackId: 'live-id' });
    await Promise.resolve();
    controller.safetyLock = true;
    releaseSeek({ position: 50, duration: 120, seekable: true, state: 'playing', track: engine.nowPlaying });

    await expect(pending).rejects.toMatchObject({ code: 'PLAYBACK_SAFETY_LOCKED' });
  });

  test('PlaybackController rejects a seek when shutdown starts during MPV confirmation', async () => {
    let releaseSeek;
    const engine = new SeekEngine();
    engine.seek.mockImplementation(() => new Promise((resolve) => { releaseSeek = resolve; }));
    const controller = createController(engine);
    activate(controller, engine, 'live-id');

    const pending = controller.seek(50, { playbackId: 'live-id' });
    await Promise.resolve();
    controller.lifecycle = 'destroying';
    releaseSeek({ position: 50, duration: 120, seekable: true, state: 'playing', track: engine.nowPlaying });

    await expect(pending).rejects.toMatchObject({ code: 'PLAYBACK_SEEK_STATE' });
  });

  test.each(['idle', 'loading', 'crossfading', 'recovering', 'stopping', 'error'])(
    'PlaybackController rejects seek while transport is %s',
    async (state) => {
      const engine = new SeekEngine();
      const controller = createController(engine);
      activate(controller, engine);
      controller.transportState = state;

      await expect(controller.seek(10, { playbackId: 'playback-1' })).rejects.toMatchObject({
        code: 'PLAYBACK_SEEK_STATE'
      });
      expect(engine.seek).not.toHaveBeenCalled();
    }
  );

  test('PlaybackController rejects safety-locked and unseekable playback', async () => {
    const lockedEngine = new SeekEngine();
    const lockedController = createController(lockedEngine);
    activate(lockedController, lockedEngine);
    lockedController.safetyLock = true;
    await expect(lockedController.seek(10, { playbackId: 'playback-1' })).rejects.toMatchObject({
      code: 'PLAYBACK_SAFETY_LOCKED'
    });

    const unseekableEngine = new SeekEngine({ seekable: false });
    const controller = createController(unseekableEngine);
    activate(controller, unseekableEngine);
    await expect(controller.seek(10, { playbackId: 'playback-1' })).rejects.toMatchObject({
      code: 'PLAYBACK_UNSEEKABLE'
    });
  });

  test('seek route maps stale, lock, unseekable, disconnected, and validation failures', async () => {
    const { plugin, routes } = createPlugin();
    plugin.playbackEngine = { seek: jest.fn() };
    plugin._registerRoutes();
    const handler = routes.get('post:/api/plugins/music-bot/seek');

    const cases = [
      [{ playbackId: '', positionSeconds: 2 }, null, 400],
      [{ playbackId: 'old', positionSeconds: 2 }, 'PLAYBACK_STALE_ID', 409],
      [{ playbackId: 'current', positionSeconds: 2 }, 'PLAYBACK_SAFETY_LOCKED', 423],
      [{ playbackId: 'current', positionSeconds: 2 }, 'PLAYBACK_UNSEEKABLE', 422],
      [{ playbackId: 'current', positionSeconds: 2 }, 'MPV_IPC_DISCONNECTED', 503]
    ];
    for (const [body, code, status] of cases) {
      plugin.playbackEngine.seek.mockImplementation(async () => {
        if (!code) return null;
        const error = new Error(code);
        error.code = code;
        throw error;
      });
      const res = createResponse();
      await handler({ body }, res);
      expect(res.statusCode).toBe(status);
    }
  });

  test('seek route emits an immediate authoritative sync and reschedules from the confirmed position', async () => {
    const { plugin, api, routes } = createPlugin();
    const track = { id: 'track', title: 'Track', duration: 120, startedAt: Date.now() };
    plugin.playbackEngine = {
      seek: jest.fn(async () => ({ playbackId: 'playback-1', position: 117, duration: 120, seekable: true, state: 'playing', track })),
      getNowPlaying: jest.fn(() => track),
      getSnapshot: jest.fn(() => ({ activePlaybackId: 'playback-1' })),
      getState: jest.fn(() => 'playing')
    };
    plugin._rescheduleCrossfadeTransition = jest.fn();
    plugin._registerRoutes();

    const res = createResponse();
    await routes.get('post:/api/plugins/music-bot/seek')({ body: { playbackId: 'playback-1', positionSeconds: 117 } }, res);

    expect(res.statusCode).toBe(200);
    expect(api.emit).toHaveBeenCalledWith('musicbot:playback-sync', expect.objectContaining({
      playbackId: 'playback-1', position: 117, duration: 120, seekable: true
    }));
    expect(plugin._rescheduleCrossfadeTransition).toHaveBeenCalledWith(track, 117, expect.any(Object));
  });

  test('seek route emits neither sync nor transition scheduling when the controller rejects after confirmation', async () => {
    const { plugin, api, routes } = createPlugin();
    const error = new Error('Playback safety lock is engaged');
    error.code = 'PLAYBACK_SAFETY_LOCKED';
    plugin.playbackEngine = { seek: jest.fn(async () => { throw error; }) };
    plugin._rescheduleCrossfadeTransition = jest.fn();
    plugin._registerRoutes();

    const res = createResponse();
    await routes.get('post:/api/plugins/music-bot/seek')({ body: { playbackId: 'playback-1', positionSeconds: 42 } }, res);

    expect(res.statusCode).toBe(423);
    expect(api.emit).not.toHaveBeenCalledWith('musicbot:playback-sync', expect.anything());
    expect(plugin._rescheduleCrossfadeTransition).not.toHaveBeenCalled();
  });

  test.each(['ended', 'switched'])('PlaybackEngine rejects a %s track while confirming a seek', async (change) => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const original = { id: 'track-1', duration: 120, startedAt: Date.now() };
    const replacement = { id: 'track-2', duration: 240, startedAt: Date.now() };
    engine.socket = { destroyed: false };
    engine.state = 'playing';
    engine.nowPlaying = original;
    engine._sendCommand = jest.fn(async (command) => {
      if (command[1] === 'seekable') return { data: true };
      if (command[1] === 'duration') return { data: 120 };
      if (command[1] === 'time-pos') {
        engine.nowPlaying = change === 'ended' ? null : replacement;
        engine.state = change === 'ended' ? 'idle' : 'playing';
        return { data: 42 };
      }
      return { data: null };
    });

    await expect(engine.seek(42)).rejects.toMatchObject({ code: 'PLAYBACK_STALE_ID' });
    expect(replacement.startedAt).not.toBeLessThan(Date.now() - 1000);
    expect(original.duration).toBe(120);
  });

  test('reschedules exactly one crossfade supervisor advance from a seek position and cancels it while paused', () => {
    jest.useFakeTimers();
    const { plugin } = createPlugin();
    const track = { id: 'track', duration: 120 };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => track),
      getSnapshot: jest.fn(() => ({ activePlaybackId: 'playback-1' })),
      isPlaying: jest.fn(() => true)
    };
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));

    plugin._rescheduleCrossfadeTransition(track, 20, { playbackId: 'playback-1' });
    jest.advanceTimersByTime(96999);
    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);

    plugin._rescheduleCrossfadeTransition(track, 117, { playbackId: 'playback-1' });
    jest.advanceTimersByTime(0);
    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(2);
    plugin._rescheduleCrossfadeTransition(track, 60, { paused: true, playbackId: 'playback-1' });
    jest.advanceTimersByTime(60000);
    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
