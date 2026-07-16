jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const EventEmitter = require('events');
const { spawn } = require('child_process');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

class FakeEngine extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.options = options;
    this.nowPlaying = null;
    this.state = 'idle';
    this.volume = 50;
    this.playCalls = [];
    this.volumeCalls = [];
    this.pauseCalls = 0;
    this.resumeCalls = 0;
    this.stopCalls = 0;
    this.skipCalls = 0;
    this.restartCalls = 0;
    this.shutdownCalls = 0;
    this.beginDuckingCalls = 0;
    this.endDuckingCalls = 0;
    this.triggerDuckingCalls = [];
    this.probeCalls = 0;
    this.heartbeatCalls = 0;
    this.configUpdates = [];
    this.destroyed = false;
  }

  async play(track) {
    this.playCalls.push(track);
    if (this.options.play) {
      await this.options.play(track, this);
    }
    this.nowPlaying = track;
    this.state = 'playing';
    this.emit('track-start', track);
  }

  async pause() {
    this.pauseCalls += 1;
    this.state = 'paused';
    this.emit('paused');
  }

  async resume() {
    this.resumeCalls += 1;
    this.state = 'playing';
    this.emit('resumed');
  }

  async stop() {
    this.stopCalls += 1;
    if (this.options.stop) {
      await this.options.stop(this);
    }
    this.nowPlaying = null;
    this.state = 'idle';
  }

  async skip() {
    this.skipCalls += 1;
    const track = this.nowPlaying;
    this.nowPlaying = null;
    this.state = 'idle';
    if (track) {
      this.emit('track-end', { track, reason: 'skip' });
    }
  }

  async setVolume(volume) {
    this.volume = volume;
    this.volumeCalls.push(volume);
    this.emit('volume-changed', volume);
  }

  getNowPlaying() {
    return this.nowPlaying;
  }

  getState() {
    return this.state;
  }

  isPlaying() {
    return this.state === 'playing';
  }

  async getPosition() {
    return 12;
  }

  async beginDucking() {
    this.beginDuckingCalls += 1;
  }

  async endDucking() {
    this.endDuckingCalls += 1;
  }

  async triggerDucking(durationMs) {
    this.triggerDuckingCalls.push(durationMs);
  }

  updateConfig(config) {
    this.config = config;
    this.configUpdates.push(config);
  }

  getDiagnostics() {
    return this.options.diagnostics || {
      pid: null,
      ipc: { connected: false, lastLatencyMs: null },
      media: { title: this.nowPlaying?.title || null, basename: null },
      state: this.state
    };
  }

  async probe() {
    this.probeCalls += 1;
    return this.getDiagnostics();
  }

  heartbeat(options) {
    this.heartbeatCalls += 1;
    if (this.options.heartbeat) {
      return this.options.heartbeat(options, this);
    }
    return Promise.resolve({
      ok: true,
      action: 'healthy',
      failures: 0,
      position: 12,
      diagnostics: this.getDiagnostics()
    });
  }

  async getAvailableDevices() {
    return [{ id: 'auto', name: 'Default' }];
  }

  async restart() {
    this.restartCalls += 1;
    this.state = 'idle';
    return this.nowPlaying;
  }

  clearNowPlaying() {
    this.nowPlaying = null;
    this.state = 'idle';
  }

  async shutdown() {
    this.shutdownCalls += 1;
    if (this.options.shutdown) {
      await this.options.shutdown(this);
    }
    this.destroyed = true;
    this.nowPlaying = null;
    this.state = 'idle';
  }
}

function createHarness({ crossfadeDuration = 0, config = {}, engines = [], timing } = {}) {
  const created = [];
  let nextIndex = 0;
  const controller = new PlaybackController({
    defaultVolume: 80,
    crossfadeDuration,
    ...config
  }, { log: jest.fn() }, {
    timing,
    engineFactory: (context) => {
      const engine = engines[nextIndex] || new FakeEngine(`engine-${nextIndex + 1}`);
      nextIndex += 1;
      engine.config = context.config;
      engine.context = context;
      created.push(engine);
      return engine;
    }
  });
  return { controller, created };
}

describe('Music Bot lifecycle-safe playback controller', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('serializes concurrent plays and settles their promises in invocation order', async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const engine = new FakeEngine('A', {
      play: async (track) => {
        if (track.id === 'one') {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
      }
    });
    const secondEngine = new FakeEngine('A-next');
    const { controller } = createHarness({ engines: [engine, secondEngine] });
    const settled = [];

    const first = controller.play({ id: 'one', title: 'One', url: 'one.mp3' })
      .then(() => settled.push('one'));
    const second = controller.play({ id: 'two', title: 'Two', url: 'two.mp3' })
      .then(() => settled.push('two'));

    await firstStarted.promise;
    expect(engine.playCalls.map((track) => track.id)).toEqual(['one']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(engine.playCalls.map((track) => track.id)).toEqual(['one']);
    expect(secondEngine.playCalls.map((track) => track.id)).toEqual(['two']);
    expect(engine.shutdownCalls).toBe(1);
    expect(settled).toEqual(['one', 'two']);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'two' }));
  });

  test('emits track-start once for each playback when a source ID is reused', async () => {
    const engine = new FakeEngine('A');
    const { controller } = createHarness({ engines: [engine] });
    const trackStart = jest.fn();
    controller.on('track-start', trackStart);

    await controller.play({ id: 'repeat-id', title: 'First', url: 'first.mp3' });
    await controller.play({ id: 'repeat-id', title: 'Second', url: 'second.mp3' });

    expect(trackStart).toHaveBeenCalledTimes(2);
    expect(trackStart).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'First' }));
    expect(trackStart).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: 'Second' }));
  });

  test('assigns a new playback identity and ignores a stale end from the prior play generation', async () => {
    const firstEngine = new FakeEngine('A-1');
    const secondEngine = new FakeEngine('A-2');
    const { controller } = createHarness({ engines: [firstEngine, secondEngine] });
    const trackEnd = jest.fn();
    controller.on('track-end', trackEnd);

    await controller.play({ id: 'same-source', title: 'First', url: 'first.mp3' });
    const firstTrack = firstEngine.getNowPlaying();
    const firstPlaybackId = controller.getSnapshot().activePlaybackId;
    await controller.play({ id: 'same-source', title: 'Second', url: 'second.mp3' });
    const secondPlaybackId = controller.getSnapshot().activePlaybackId;

    firstEngine.emit('track-end', { track: firstTrack, reason: 'ended' });

    expect(firstPlaybackId).not.toBe('same-source');
    expect(secondPlaybackId).not.toBe(firstPlaybackId);
    expect(firstEngine.shutdownCalls).toBe(1);
    expect(secondEngine.playCalls).toHaveLength(1);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ title: 'Second' }));
    expect(controller.getState()).toBe('playing');
    expect(trackEnd).not.toHaveBeenCalled();
  });

  test('restores slot health after a successful replay', async () => {
    const engine = new FakeEngine('A');
    const { controller } = createHarness({ engines: [engine] });

    await controller.play({ id: 'first', title: 'First', url: 'first.mp3' });
    engine.emit('error', new Error('transient IPC failure'));
    expect(controller.getSnapshot().slots.A.healthy).toBe(false);

    await controller.play({ id: 'recovered', title: 'Recovered', url: 'recovered.mp3' });

    expect(controller.getSnapshot().slots.A.healthy).toBe(true);
  });

  test('crossfades with simultaneous A/B engines and complementary volume ramps', async () => {
    jest.useFakeTimers();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 100,
      engines: [outgoing, incoming]
    });

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();

    expect(outgoing.isPlaying()).toBe(true);
    expect(incoming.isPlaying()).toBe(true);
    expect(controller.getSnapshot().slots.A.state).toBe('playing');
    expect(controller.getSnapshot().slots.B.state).toBe('playing');

    await jest.runAllTimersAsync();
    await crossfade;

    expect(outgoing.volumeCalls.slice(-2)).toEqual([40, 0]);
    expect(incoming.volumeCalls.slice(-3)).toEqual([0, 40, 80]);
    expect(outgoing.shutdownCalls).toBe(1);
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: 'B',
      activePlaybackId: expect.any(String),
      transportState: 'playing'
    }));
    expect(controller.getSnapshot().activePlaybackId).not.toBe('incoming');
  });

  test('applies active ducking and the current master/device config to a later incoming slot', async () => {
    jest.useFakeTimers();
    const first = new FakeEngine('A');
    const second = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 100,
      config: {
        audioDevice: 'speakers-live',
        ducking: { enabled: true, targetPercent: 25 },
        normalization: { enabled: true, integratedLufs: -14 }
      },
      engines: [first, second]
    });

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    await controller.setVolume(67);
    await controller.beginDucking();

    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();

    expect(second.beginDuckingCalls).toBe(1);
    expect(second.context.config).toEqual(expect.objectContaining({
      audioDevice: 'speakers-live',
      defaultVolume: 67,
      ducking: expect.objectContaining({ enabled: true, targetPercent: 25 }),
      normalization: expect.objectContaining({ enabled: true, integratedLufs: -14 })
    }));

    await jest.advanceTimersByTimeAsync(100);
    await crossfade;
    expect(second.volumeCalls.at(-1)).toBe(67);
  });

  test('updates config atomically across both live slots and all later slots', async () => {
    jest.useFakeTimers();
    const first = new FakeEngine('A');
    const second = new FakeEngine('B');
    const third = new FakeEngine('A-next');
    const { controller } = createHarness({
      crossfadeDuration: 500,
      config: {
        audioDevice: 'old-device',
        ducking: { enabled: true, targetPercent: 35 },
        normalization: { enabled: false, integratedLufs: -16 }
      },
      engines: [first, second, third]
    });

    await controller.play({ id: 'first', title: 'First', url: 'first.mp3' });
    const crossfade = controller.play({ id: 'second', title: 'Second', url: 'second.mp3' });
    await flushPromises();
    expect(controller.getSnapshot().slots.A).not.toBeNull();
    expect(controller.getSnapshot().slots.B).not.toBeNull();

    const updated = controller.updateConfig({
      audioDevice: 'new-device',
      defaultVolume: 72,
      ducking: { targetPercent: 20, fadeOutMs: 90 },
      normalization: { enabled: true }
    });

    expect(first.config).toBe(updated);
    expect(second.config).toBe(updated);
    expect(updated).toEqual(expect.objectContaining({
      audioDevice: 'new-device',
      defaultVolume: 72,
      ducking: { enabled: true, targetPercent: 20, fadeOutMs: 90 },
      normalization: { enabled: true, integratedLufs: -16 }
    }));

    await jest.advanceTimersByTimeAsync(500);
    await crossfade;
    await controller.stop();
    await controller.play({ id: 'third', title: 'Third', url: 'third.mp3' });
    expect(third.context.config).toBe(updated);
  });

  test('exposes sanitized slot diagnostics and probes both live engines', async () => {
    jest.useFakeTimers();
    const first = new FakeEngine('A', {
      diagnostics: {
        pid: 1234,
        ipc: { connected: true, lastLatencyMs: 8 },
        media: { title: 'Outgoing', basename: 'outgoing.mp3' },
        state: 'playing',
        ipcPath: '\\\\.\\pipe\\secret-player',
        url: 'https://example.invalid/audio?token=secret'
      }
    });
    const second = new FakeEngine('B', {
      diagnostics: {
        pid: 5678,
        ipc: { connected: true, lastLatencyMs: 5 },
        media: { title: 'Incoming', basename: 'incoming.mp3' },
        state: 'playing',
        headers: { Authorization: 'secret' }
      }
    });
    const { controller } = createHarness({
      crossfadeDuration: 500,
      engines: [first, second]
    });

    await controller.play({ id: 'one', title: 'One', url: 'one.mp3' });
    const crossfade = controller.play({ id: 'two', title: 'Two', url: 'two.mp3' });
    await flushPromises();
    const diagnostics = await controller.probe();

    expect(first.probeCalls).toBe(1);
    expect(second.probeCalls).toBe(1);
    expect(controller.getDiagnostics()).toEqual(diagnostics);
    expect(diagnostics.slots.A).toEqual(expect.objectContaining({
      pid: 1234,
      ipc: { connected: true, lastLatencyMs: 8 },
      media: { title: 'Outgoing', basename: 'outgoing.mp3' },
      kind: 'playback',
      playbackId: expect.any(String),
      state: 'playing'
    }));
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('secret-player');
    expect(serialized).not.toContain('example.invalid');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('token');

    await jest.advanceTimersByTimeAsync(500);
    await crossfade;
  });

  test('keeps the outgoing slot active when the incoming crossfade load fails', async () => {
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B', {
      play: async () => {
        throw new Error('incoming load failed');
      }
    });
    const { controller } = createHarness({
      crossfadeDuration: 100,
      engines: [outgoing, incoming]
    });

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    await expect(controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' }))
      .rejects.toThrow('incoming load failed');

    expect(outgoing.shutdownCalls).toBe(0);
    expect(outgoing.volumeCalls.at(-1)).toBe(80);
    expect(incoming.shutdownCalls).toBe(1);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'outgoing' }));
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: 'A',
      transportState: 'playing'
    }));
  });

  test('ignores terminal events from a retired slot generation', async () => {
    jest.useFakeTimers();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 100,
      engines: [outgoing, incoming]
    });
    const terminalEvents = [];
    controller.on('track-end', (event) => terminalEvents.push(event));
    controller.on('crashed', (event) => terminalEvents.push(event));

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await jest.runAllTimersAsync();
    await crossfade;
    const countAfterRetirement = terminalEvents.length;

    outgoing.emit('track-end', { track: { id: 'outgoing' }, reason: 'quit' });
    outgoing.emit('crashed', { code: 1 });

    expect(terminalEvents).toHaveLength(countAfterRetirement);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'incoming' }));
    expect(controller.getState()).toBe('playing');
  });

  test('classifies outgoing EOF during crossfade as crossfade, never ended', async () => {
    jest.useFakeTimers();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 100,
      engines: [outgoing, incoming]
    });
    const trackEnd = jest.fn();
    controller.on('track-end', trackEnd);

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();
    outgoing.emit('track-end', {
      track: outgoing.getNowPlaying(),
      reason: 'ended',
      mpvReason: 'eof'
    });
    await jest.runAllTimersAsync();
    await crossfade;

    expect(trackEnd).toHaveBeenCalledTimes(1);
    expect(trackEnd).toHaveBeenCalledWith(expect.objectContaining({
      track: expect.objectContaining({ id: 'outgoing' }),
      reason: 'crossfade'
    }));
    expect(trackEnd).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'ended' }));
  });

  test.each(['end', 'crash'])('incoming %s aborts crossfade and preserves outgoing playback', async (failure) => {
    jest.useFakeTimers();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 1000,
      engines: [outgoing, incoming]
    });
    const trackEnd = jest.fn();
    controller.on('track-end', trackEnd);
    controller.on('crashed', jest.fn());

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();
    if (failure === 'end') {
      incoming.emit('track-end', {
        track: incoming.getNowPlaying(),
        reason: 'error',
        mpvReason: 'quit'
      });
    } else {
      incoming.emit('crashed', { code: 1 });
    }
    await jest.runAllTimersAsync();

    await expect(crossfade).rejects.toThrow(`incoming-${failure}`);
    expect(outgoing.shutdownCalls).toBe(0);
    expect(incoming.shutdownCalls).toBe(1);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'outgoing' }));
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: 'A',
      transportState: 'playing'
    }));
    expect(trackEnd).not.toHaveBeenCalledWith(expect.objectContaining({
      track: expect.objectContaining({ id: 'incoming' })
    }));
  });

  test.each(['skip', 'stop'])('%s during crossfade terminates both slots exactly once', async (intent) => {
    jest.useFakeTimers();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B');
    const { controller } = createHarness({
      crossfadeDuration: 1000,
      engines: [outgoing, incoming]
    });

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const crossfade = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();
    const interrupt = controller[intent]();

    await expect(crossfade).rejects.toThrow(`aborted by ${intent}`);
    await interrupt;

    expect(outgoing.shutdownCalls).toBe(1);
    expect(incoming.shutdownCalls).toBe(1);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
    expect(controller.getState()).toBe('idle');
  });

  test('clears controller playback identity even when stop IPC fails', async () => {
    const engine = new FakeEngine('A', {
      stop: async () => {
        throw new Error('stop IPC failed');
      }
    });
    const { controller } = createHarness({ engines: [engine] });
    await controller.play({ id: 'active', title: 'Active', url: 'active.mp3' });

    await expect(controller.stop()).rejects.toThrow('stop IPC failed');

    expect(controller.getNowPlaying()).toBeNull();
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activePlaybackId: null,
      activeSlot: null,
      transportState: 'idle',
      slots: { A: null, B: null }
    }));
    expect(engine.shutdownCalls).toBe(1);
  });

  test('suppresses terminal events for the exact playback stopped or cleared by the controller', async () => {
    let stoppedTrack;
    const stopping = new FakeEngine('A', {
      stop: async (target) => {
        stoppedTrack = target.nowPlaying;
        target.emit('track-end', { track: stoppedTrack, reason: 'ended' });
      }
    });
    const clearing = new FakeEngine('A-next');
    const { controller } = createHarness({ engines: [stopping, clearing] });
    const trackEnd = jest.fn();
    controller.on('track-end', trackEnd);

    await controller.play({ id: 'stopped', title: 'Stopped', url: 'stopped.mp3' });
    await controller.stop();
    expect(trackEnd).not.toHaveBeenCalled();

    await controller.play({ id: 'cleared', title: 'Cleared', url: 'cleared.mp3' });
    const clearedTrack = clearing.getNowPlaying();
    controller.clearNowPlaying();
    clearing.emit('track-end', { track: clearedTrack, reason: 'ended' });
    clearing.emit('track-end', { track: null, reason: 'ended' });
    expect(trackEnd).not.toHaveBeenCalled();
  });

  test('keeps skip terminal semantics at exactly one event', async () => {
    const engine = new FakeEngine('A');
    const { controller } = createHarness({ engines: [engine] });
    const trackEnd = jest.fn();
    controller.on('track-end', trackEnd);

    await controller.play({ id: 'skipped', title: 'Skipped', url: 'skipped.mp3' });
    await controller.skip();

    expect(trackEnd).toHaveBeenCalledTimes(1);
    expect(trackEnd).toHaveBeenCalledWith(expect.objectContaining({
      track: expect.objectContaining({ id: 'skipped' }),
      reason: 'skip'
    }));
  });

  test('safety lock during load prevents late playback until explicit release', async () => {
    const incomingLoad = deferred();
    const outgoing = new FakeEngine('A');
    const incoming = new FakeEngine('B', {
      play: async () => incomingLoad.promise
    });
    const released = new FakeEngine('C');
    const { controller, created } = createHarness({
      crossfadeDuration: 100,
      engines: [outgoing, incoming, released]
    });

    await controller.play({ id: 'outgoing', title: 'Outgoing', url: 'outgoing.mp3' });
    const loading = controller.play({ id: 'incoming', title: 'Incoming', url: 'incoming.mp3' });
    await flushPromises();
    const emergencyStop = controller.emergencyStop();

    await expect(loading).rejects.toThrow('aborted by safety-lock');
    await emergencyStop;
    incomingLoad.resolve();
    await flushPromises();

    await expect(controller.play({ id: 'blocked', title: 'Blocked', url: 'blocked.mp3' }))
      .rejects.toThrow('safety lock');
    expect(created).toHaveLength(2);
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      safetyLock: true,
      activeSlot: null,
      activePlaybackId: null
    }));

    controller.releaseSafetyLock();
    await controller.play({ id: 'released', title: 'Released', url: 'released.mp3' });
    expect(created).toHaveLength(3);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'released' }));
  });

  test('resetPlayer cleans active slots and timers while preserving an unlocked state', async () => {
    jest.useFakeTimers();
    const toneEngine = new FakeEngine('tone');
    const { controller, created } = createHarness({ engines: [toneEngine] });
    const safetyChanges = jest.fn();
    controller.on('safety-lock-changed', safetyChanges);

    const tone = controller.testTone({ durationMs: 5000 });
    await flushPromises();
    const reset = controller.resetPlayer();

    await expect(tone).rejects.toThrow('player-reset');
    await reset;
    expect(controller.isSafetyLocked()).toBe(false);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
    expect(controller.getState()).toBe('idle');
    expect(toneEngine.shutdownCalls).toBe(1);
    expect(created).toHaveLength(1);
    expect(safetyChanges).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('resetPlayer preserves an existing safety lock without transient safety events', async () => {
    const { controller, created } = createHarness();
    await controller.engageSafetyLock('operator-lock');
    const safetyChanges = jest.fn();
    controller.on('safety-lock-changed', safetyChanges);

    await controller.resetPlayer();

    expect(controller.isSafetyLocked()).toBe(true);
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      safetyLock: true,
      activeSlot: null,
      activePlaybackId: null,
      transportState: 'idle'
    }));
    expect(created).toHaveLength(0);
    expect(safetyChanges).not.toHaveBeenCalled();
  });

  test('shutdown is terminal and leaves zero live slots', async () => {
    const first = new FakeEngine('A');
    const neverCreated = new FakeEngine('B');
    const { controller, created } = createHarness({ engines: [first, neverCreated] });

    await controller.play({ id: 'one', title: 'One', url: 'one.mp3' });
    await controller.shutdown();

    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      lifecycle: 'destroyed',
      activeSlot: null,
      activePlaybackId: null,
      slots: { A: null, B: null }
    }));
    await expect(controller.play({ id: 'two', title: 'Two', url: 'two.mp3' }))
      .rejects.toThrow('destroyed');
    expect(created).toHaveLength(1);
    expect(first.shutdownCalls).toBe(1);
  });

  test('bounds a hanging slot cleanup to two seconds', async () => {
    jest.useFakeTimers();
    const never = new Promise(() => {});
    const engine = new FakeEngine('A', { shutdown: async () => never });
    const { controller } = createHarness({ engines: [engine] });
    await controller.play({ id: 'active', title: 'Active', url: 'active.mp3' });

    let settled = false;
    const stop = controller.stop().then(() => { settled = true; });
    await flushPromises();
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(2000);
    await stop;
    expect(settled).toBe(true);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
  });

  test('emits reasoned safety lock changes for emergency, heartbeat lock, and release', async () => {
    const { controller } = createHarness();
    const changes = [];
    controller.on('safety-lock-changed', (change) => changes.push(change));

    await controller.emergencyStop();
    controller.releaseSafetyLock();
    await controller.engageSafetyLock('heartbeat-lock');
    controller.releaseSafetyLock();

    expect(changes).toEqual([
      expect.objectContaining({ locked: true, reason: 'emergency-stop', lockedAt: expect.any(Number) }),
      { locked: false, reason: 'released', lockedAt: null },
      expect.objectContaining({ locked: true, reason: 'heartbeat-lock', lockedAt: expect.any(Number) }),
      { locked: false, reason: 'released', lockedAt: null }
    ]);
  });

  test('engages safety lock when an active slot reports heartbeat escalation', async () => {
    const engine = new FakeEngine('A', {
      play: async (_track, target) => {
        target.emit('heartbeat-lock', { reason: 'heartbeat-lock', failures: 3 });
      }
    });
    const { controller } = createHarness({ engines: [engine] });
    const changes = [];
    controller.on('safety-lock-changed', (change) => changes.push(change));

    await expect(controller.play({ id: 'unsafe', title: 'Unsafe', url: 'unsafe.mp3' }))
      .rejects.toThrow('safety-lock');
    await flushPromises();

    expect(controller.isSafetyLocked()).toBe(true);
    expect(engine.shutdownCalls).toBe(1);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
    expect(changes).toContainEqual(expect.objectContaining({
      locked: true,
      reason: 'heartbeat-lock'
    }));
  });

  test('delegates watchdog heartbeats once while a prior check is still in flight', async () => {
    const pending = deferred();
    const engine = new FakeEngine('A', {
      heartbeat: () => pending.promise
    });
    const { controller } = createHarness({ engines: [engine] });
    await controller.play({ id: 'active', title: 'Active', url: 'active.mp3' });

    const first = controller.heartbeat({ timeoutMs: 2000 });
    const second = controller.heartbeat({ timeoutMs: 2000 });
    expect(engine.heartbeatCalls).toBe(1);

    pending.resolve({ ok: true, action: 'healthy', failures: 0, position: 17 });
    await expect(first).resolves.toEqual(expect.objectContaining({ position: 17 }));
    await expect(second).resolves.toEqual(expect.objectContaining({ position: 17 }));
  });

  test('emits transition records whenever lastTransition changes', async () => {
    const engine = new FakeEngine('A');
    const { controller } = createHarness({ engines: [engine] });
    const transitions = [];
    controller.on('transition', (transition) => transitions.push(transition));

    await controller.play({ id: 'one', title: 'One', url: 'one.mp3' });

    expect(transitions).toEqual([
      expect.objectContaining({ name: 'play', status: 'running', generation: 1 }),
      expect.objectContaining({ name: 'play', status: 'completed', generation: 1 })
    ]);
    expect(controller.getSnapshot().lastTransition).toEqual(transitions[1]);
  });

  test('runs an isolated idle test tone without playback identity or events', async () => {
    jest.useFakeTimers();
    const toneEngine = new FakeEngine('tone');
    const { controller } = createHarness({ engines: [toneEngine] });
    const playbackEvents = jest.fn();
    controller.on('track-start', playbackEvents);
    controller.on('track-end', playbackEvents);
    controller.on('volume-changed', playbackEvents);

    const tone = controller.testTone({ durationMs: 100, frequency: 523, volume: 25 });
    await flushPromises();

    expect(toneEngine.playCalls[0]).toEqual(expect.objectContaining({
      source: 'internal-test-tone',
      url: expect.stringContaining('sine=frequency=523')
    }));
    expect(controller.getNowPlaying()).toBeNull();
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: null,
      activePlaybackId: null,
      transportState: 'testing',
      slots: expect.objectContaining({
        A: expect.objectContaining({ kind: 'test-tone' })
      })
    }));
    expect(playbackEvents).not.toHaveBeenCalled();

    await jest.runAllTimersAsync();
    await expect(tone).resolves.toEqual({ success: true });
    expect(toneEngine.shutdownCalls).toBe(1);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
    expect(controller.getState()).toBe('idle');
  });

  test('retires an idle playback process before starting an isolated test tone', async () => {
    jest.useFakeTimers();
    const playbackEngine = new FakeEngine('playback');
    const toneEngine = new FakeEngine('tone');
    const { controller } = createHarness({ engines: [playbackEngine, toneEngine] });

    await controller.play({ id: 'played', title: 'Played', url: 'played.mp3' });
    await controller.stop();
    const tone = controller.testTone({ durationMs: 50 });
    await flushPromises();

    expect(playbackEngine.shutdownCalls).toBe(1);
    expect(toneEngine.playCalls).toHaveLength(1);
    expect(controller.getSnapshot().slots.A.kind).toBe('test-tone');

    await jest.runAllTimersAsync();
    await tone;
  });

  test.each([
    ['emergencyStop', 'safety-lock'],
    ['setSafetyLock', 'safety-lock'],
    ['shutdown', 'shutdown']
  ])('%s aborts and kills an in-flight test tone', async (intent, abortReason) => {
    jest.useFakeTimers();
    const toneEngine = new FakeEngine('tone');
    const { controller } = createHarness({ engines: [toneEngine] });
    const tone = controller.testTone({ durationMs: 1000 });
    await flushPromises();

    const interrupt = controller[intent]();

    await expect(tone).rejects.toThrow(`aborted by ${abortReason}`);
    await interrupt;
    expect(toneEngine.shutdownCalls).toBe(1);
    expect(controller.getSnapshot().slots).toEqual({ A: null, B: null });
  });
});

describe('Music Bot playback engine lifecycle hardening', () => {
  beforeEach(() => {
    spawn.mockReset();
  });

  test('counts the first heartbeat failure without restarting playback', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const staleProcess = { exitCode: null, pid: 100, kill: jest.fn() };
    const staleSocket = { destroyed: false, destroy: jest.fn() };
    engine.process = staleProcess;
    engine.socket = staleSocket;
    engine.nowPlaying = { id: 'active', title: 'Active', url: 'active.mp3' };
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async () => {
      throw new Error('dead IPC');
    });
    engine.restart = jest.fn();
    engine.play = jest.fn();

    const result = await engine.heartbeat({ timeoutMs: 2000 });

    expect(engine._sendCommand).toHaveBeenCalledWith(
      ['get_property', 'time-pos'],
      { waitForResponse: true, timeoutMs: 2000 }
    );
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'counted',
      failures: 1
    }));
    expect(engine.restart).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  test('recovers exactly once on failure two and safety-locks on failure three within 60 seconds', async () => {
    let now = 1000;
    const engine = new PlaybackEngine(
      { defaultVolume: 50 },
      { log: jest.fn() },
      { timing: { now: () => now } }
    );
    const heartbeatLock = jest.fn();
    engine.on('heartbeat-lock', heartbeatLock);
    const track = { id: 'active', title: 'Active', url: 'active.mp3' };
    engine.process = { exitCode: null, pid: 100 };
    engine.socket = { destroyed: false, destroy: jest.fn() };
    engine.nowPlaying = track;
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async () => {
      throw new Error('dead IPC');
    });
    engine.restart = jest.fn(async () => track);
    engine.play = jest.fn(async () => {});

    await expect(engine.heartbeat()).resolves.toEqual(expect.objectContaining({
      action: 'counted',
      failures: 1
    }));
    now += 1000;
    await expect(engine.heartbeat()).resolves.toEqual(expect.objectContaining({
      action: 'recovered',
      failures: 2
    }));
    now += 1000;
    await expect(engine.heartbeat()).rejects.toThrow('heartbeat safety lock');

    expect(engine.restart).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledWith(track);
    expect(heartbeatLock).toHaveBeenCalledTimes(1);
    expect(heartbeatLock).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'heartbeat-lock',
      failures: 3
    }));
  });

  test('resets the heartbeat failure window after more than 60 seconds', async () => {
    let now = 1000;
    const engine = new PlaybackEngine(
      { defaultVolume: 50 },
      { log: jest.fn() },
      { timing: { now: () => now } }
    );
    engine.process = { exitCode: null, pid: 100 };
    engine.socket = { destroyed: false };
    engine.nowPlaying = { id: 'active', title: 'Active', url: 'active.mp3' };
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async () => {
      throw new Error('dead IPC');
    });
    engine.restart = jest.fn();
    engine.play = jest.fn();

    await expect(engine.heartbeat()).resolves.toEqual(expect.objectContaining({ failures: 1 }));
    now += 60001;
    await expect(engine.heartbeat()).resolves.toEqual(expect.objectContaining({
      action: 'counted',
      failures: 1
    }));

    expect(engine.restart).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  test('coalesces parallel engine heartbeat failures into one failure count', async () => {
    const pending = deferred();
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.process = { exitCode: null, pid: 100 };
    engine.socket = { destroyed: false };
    engine.nowPlaying = { id: 'active', title: 'Active', url: 'active.mp3' };
    engine.state = 'playing';
    engine._sendCommand = jest.fn(() => pending.promise);
    engine.restart = jest.fn();

    const first = engine.heartbeat();
    const second = engine.heartbeat();
    expect(engine._sendCommand).toHaveBeenCalledTimes(1);

    pending.reject(new Error('dead IPC'));
    await expect(first).resolves.toEqual(expect.objectContaining({ failures: 1 }));
    await expect(second).resolves.toEqual(expect.objectContaining({ failures: 1 }));
    expect(engine.restart).not.toHaveBeenCalled();
  });

  test('an old child close cannot destroy a replacement process or socket', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const oldProcess = { pid: 100 };
    const replacementProcess = { pid: 101 };
    const oldSocket = { destroy: jest.fn() };
    const replacementSocket = { destroy: jest.fn() };
    engine.process = replacementProcess;
    engine.socket = replacementSocket;
    engine._processGeneration = 2;
    engine._socketGeneration = 2;

    engine._handleProcessClose(oldProcess, oldSocket, 1, 1);

    expect(engine.process).toBe(replacementProcess);
    expect(engine.socket).toBe(replacementSocket);
    expect(replacementSocket.destroy).not.toHaveBeenCalled();
  });

  test('reports MPV quit as a playback error', () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const track = { id: 'quit-track', title: 'Quit Track' };
    const trackEnd = jest.fn();
    engine.nowPlaying = track;
    engine.state = 'playing';
    engine.on('track-end', trackEnd);

    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'quit' }));

    expect(trackEnd).toHaveBeenCalledWith(expect.objectContaining({
      track,
      reason: 'error',
      mpvReason: 'quit'
    }));
    expect(engine.getNowPlaying()).toBeNull();
    expect(engine.getState()).toBe('idle');
  });

  test('stop clears playback identity and becomes idle without a process', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.nowPlaying = { id: 'stale', title: 'Stale' };
    engine.state = 'playing';

    await engine.stop();

    expect(engine.getNowPlaying()).toBeNull();
    expect(engine.getState()).toBe('idle');
  });

  test('stop terminates an owned process when IPC is unavailable', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const child = { pid: 777, exitCode: null, kill: jest.fn() };
    engine.process = child;
    engine._ownedPids.add(child.pid);
    engine.nowPlaying = { id: 'active', title: 'Active' };
    engine.state = 'playing';
    engine._terminateProcess = jest.fn(async () => true);

    await engine.stop();

    expect(engine._terminateProcess).toHaveBeenCalledWith(child, {
      waitForClose: true,
      timeoutMs: 2000
    });
    expect(engine.process).toBeNull();
    expect(engine.getNowPlaying()).toBeNull();
    expect(engine.getState()).toBe('idle');
  });

  test('shutdown is terminal and rejects later starts', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });

    await engine.shutdown();

    await expect(engine.play({ id: 'late', title: 'Late', url: 'late.mp3' }))
      .rejects.toThrow('shut down');
    expect(spawn).not.toHaveBeenCalled();
  });

  const windowsTest = process.platform === 'win32' ? test : test.skip;

  windowsTest('terminates only owned Windows process trees through taskkill', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const taskkill = new EventEmitter();
    taskkill.once = taskkill.once.bind(taskkill);
    spawn.mockReturnValue(taskkill);
    const child = { pid: 4242, exitCode: null, kill: jest.fn() };
    engine._ownedPids.add(4242);

    const termination = engine._terminateProcess(child, { waitForClose: false });
    taskkill.emit('close', 0);
    await termination;

    expect(spawn).toHaveBeenCalledWith(
      'taskkill.exe',
      ['/PID', '4242', '/T', '/F'],
      expect.objectContaining({ windowsHide: true })
    );
    expect(child.kill).not.toHaveBeenCalled();

    spawn.mockClear();
    const unowned = { pid: 5252, exitCode: null, kill: jest.fn() };
    await engine._terminateProcess(unowned, { waitForClose: false });
    expect(spawn).not.toHaveBeenCalled();
    expect(unowned.kill).not.toHaveBeenCalled();
  });

  windowsTest('times out taskkill, falls back directly, and settles within two seconds', async () => {
    jest.useFakeTimers();
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const taskkill = new EventEmitter();
    spawn.mockReturnValue(taskkill);
    const child = Object.assign(new EventEmitter(), {
      pid: 6262,
      exitCode: null,
      kill: jest.fn()
    });
    engine._ownedPids.add(child.pid);
    let settled = false;
    const termination = engine._terminateProcess(child, {
      waitForClose: true,
      timeoutMs: 2000
    }).then((result) => {
      settled = true;
      return result;
    });

    await jest.advanceTimersByTimeAsync(500);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1500);
    await expect(termination).resolves.toBe(false);
    expect(settled).toBe(true);
  });

  windowsTest('shutdown waits for the owned MPV child to actually close', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const taskkill = new EventEmitter();
    spawn.mockReturnValue(taskkill);
    const child = Object.assign(new EventEmitter(), {
      pid: 7373,
      exitCode: null,
      kill: jest.fn()
    });
    engine.process = child;
    engine._ownedPids.add(child.pid);
    let settled = false;
    const shutdown = engine.shutdown().then(() => { settled = true; });

    taskkill.emit('close', 0);
    await flushPromises();
    expect(settled).toBe(false);

    child.exitCode = 0;
    child.emit('close', 0);
    await shutdown;
    expect(settled).toBe(true);
  });

  test('probes MPV diagnostics without exposing a media URL or IPC path', async () => {
    const nowValues = [100, 112];
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() }, {
      timing: { now: () => nowValues.shift() }
    });
    engine.process = { pid: 8484, exitCode: null };
    engine._ownedPids.add(8484);
    engine.socket = { destroyed: false };
    engine.ipcPath = '\\\\.\\pipe\\secret-player';
    engine.nowPlaying = { title: 'Current fallback', url: 'https://private.invalid' };
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async ([, property]) => ({
      data: property === 'media-title'
        ? 'Actual MPV Title'
        : 'https://cdn.example/audio/safe-track.mp3?token=secret'
    }));

    const diagnostics = await engine.probe();

    expect(diagnostics).toEqual({
      pid: 8484,
      ipc: { connected: true, lastLatencyMs: 12 },
      media: { title: 'Actual MPV Title', basename: 'safe-track.mp3' },
      state: 'playing'
    });
    expect(engine.getDiagnostics()).toEqual(diagnostics);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain('secret-player');
    expect(serialized).not.toContain('cdn.example');
    expect(serialized).not.toContain('token');
  });
});
