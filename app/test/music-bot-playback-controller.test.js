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

  async beginDucking() {}

  async endDucking() {}

  async triggerDucking() {}

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
    this.destroyed = true;
    this.nowPlaying = null;
    this.state = 'idle';
  }
}

function createHarness({ crossfadeDuration = 0, engines = [] } = {}) {
  const created = [];
  let nextIndex = 0;
  const controller = new PlaybackController({
    defaultVolume: 80,
    crossfadeDuration
  }, { log: jest.fn() }, {
    engineFactory: () => {
      const engine = engines[nextIndex] || new FakeEngine(`engine-${nextIndex + 1}`);
      nextIndex += 1;
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
    const { controller } = createHarness({ engines: [engine] });
    const settled = [];

    const first = controller.play({ id: 'one', title: 'One', url: 'one.mp3' })
      .then(() => settled.push('one'));
    const second = controller.play({ id: 'two', title: 'Two', url: 'two.mp3' })
      .then(() => settled.push('two'));

    await firstStarted.promise;
    expect(engine.playCalls.map((track) => track.id)).toEqual(['one']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(engine.playCalls.map((track) => track.id)).toEqual(['one', 'two']);
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
      activePlaybackId: 'incoming',
      transportState: 'playing'
    }));
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

  test('heartbeat failure replaces a live process with stale IPC', async () => {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    const staleProcess = { exitCode: null, pid: 100, kill: jest.fn() };
    const staleSocket = { destroyed: false, destroy: jest.fn() };
    const replacementProcess = { exitCode: null, pid: 101 };
    const replacementSocket = { destroyed: false };
    engine.process = staleProcess;
    engine.socket = staleSocket;
    engine._sendCommand = jest.fn(async () => {
      throw new Error('dead IPC');
    });
    engine._terminateProcess = jest.fn(async () => {});
    engine._startProcess = jest.fn(async () => {
      engine.process = replacementProcess;
      engine.socket = replacementSocket;
    });

    await engine._ensureProcess();

    expect(engine._sendCommand).toHaveBeenCalledWith(
      ['get_property', 'idle-active'],
      { waitForResponse: true }
    );
    expect(staleSocket.destroy).toHaveBeenCalledTimes(1);
    expect(engine._terminateProcess).toHaveBeenCalledWith(staleProcess, expect.any(Object));
    expect(engine._startProcess).toHaveBeenCalledTimes(1);
    expect(engine.process).toBe(replacementProcess);
    expect(engine.socket).toBe(replacementSocket);
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
});
