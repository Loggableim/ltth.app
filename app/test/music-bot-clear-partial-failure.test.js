const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

function createHarness({ clear, stop, initialQueue }) {
  const handlers = new Map();
  const emitted = [];
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    registerRoute: (method, route, handler) => handlers.set(`${method}:${route}`, handler),
    emit: (event, payload) => emitted.push({ event, payload }),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const queue = initialQueue || [{ id: 'fixture-1', title: 'Synthetic track' }];
  plugin.queueManager = {
    clear,
    getQueue: jest.fn(() => queue)
  };
  plugin.playbackEngine = { stop };
  plugin.autoDJ = { reset: jest.fn() };
  plugin._registerRoutes();

  return {
    api,
    emitted,
    handler: handlers.get('post:/api/plugins/music-bot/clear'),
    plugin,
    queue
  };
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

async function invokeClear(handler) {
  const response = createResponse();
  await handler({}, response);
  return response;
}

test('clear persistence failure stops before playback, Auto-DJ reset, or queue broadcast', async () => {
  const clearError = new Error('synthetic persistence failure');
  let clearAttempt = 0;
  const clear = jest.fn(async () => {
    clearAttempt += 1;
    if (clearAttempt === 1) return { success: false, blocked: true };
    throw clearError;
  });
  const stop = jest.fn();
  const harness = createHarness({ clear, stop });

  const blockedResponse = await invokeClear(harness.handler);

  expect(blockedResponse.statusCode).toBe(503);
  expect(blockedResponse.payload).toEqual(expect.objectContaining({
    success: false,
    queueCleared: false,
    playbackStopped: false,
    code: 'QUEUE_PERSISTENCE_BLOCKED'
  }));
  const thrownResponse = await invokeClear(harness.handler);
  expect(thrownResponse.statusCode).toBe(500);
  expect(thrownResponse.payload).toEqual(expect.objectContaining({
    success: false,
    queueCleared: false,
    playbackStopped: false,
    code: 'QUEUE_CLEAR_FAILED'
  }));
  expect(stop).not.toHaveBeenCalled();
  expect(harness.plugin.autoDJ.reset).not.toHaveBeenCalled();
  expect(harness.emitted).toEqual([]);
});

test('committed clear reports stop partial failure, broadcasts it, and retry converges', async () => {
  const queue = [{ id: 'fixture-1', title: 'Synthetic track' }];
  let stops = 0;
  const clear = jest.fn(async () => {
    queue.splice(0);
    return { success: true, persisted: true };
  });
  const stop = jest.fn(async () => {
    stops += 1;
    if (stops === 1) throw new Error('synthetic stop timeout');
  });
  const harness = createHarness({ clear, stop, initialQueue: queue });

  const first = await invokeClear(harness.handler);

  expect(first.statusCode).toBe(503);
  expect(first.payload).toEqual(expect.objectContaining({
    success: false,
    queueCleared: true,
    playbackStopped: false,
    code: 'PLAYBACK_STOP_FAILED'
  }));
  expect(harness.plugin.autoDJ.reset).toHaveBeenCalledTimes(1);
  expect(harness.emitted).toEqual([
    { event: 'musicbot:queue-update', payload: { queue: [], length: 0 } },
    { event: 'musicbot:now-playing', payload: null }
  ]);

  const retry = await harness.plugin._handleCommand({ type: 'clear' }, { username: 'test-mod' });

  expect(retry).toEqual({ success: true, queueCleared: true, playbackStopped: true });
  expect(clear).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalledTimes(2);
  expect(harness.plugin.autoDJ.reset).toHaveBeenCalledTimes(2);
  expect(harness.emitted.filter((item) => item.event === 'musicbot:queue-update')).toHaveLength(2);
  expect(harness.emitted.filter((item) => item.event === 'musicbot:now-playing')).toEqual([
    { event: 'musicbot:now-playing', payload: null },
    { event: 'musicbot:now-playing', payload: null }
  ]);
  expect(harness.emitted).toContainEqual({
    event: 'musicbot:chat-response',
    payload: expect.objectContaining({ username: 'test-mod' })
  });

  const uiSource = fs.readFileSync(path.resolve(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
  expect(uiSource).toContain("post('/clear').then((result) => {");
  expect(uiSource).toContain('result?.queueCleared');
  expect(uiSource).toContain('Queue cleared, but playback could not be stopped');
  expect(uiSource).toContain("socket.on('musicbot:now-playing', (payload) => {");
  expect(uiSource).toContain('renderNowPlaying(payload);');
  const renderStart = uiSource.indexOf('function renderNowPlaying(track) {');
  const emptyBranchEnd = uiSource.indexOf("nowPlayingEl.classList.remove('empty');", renderStart);
  const emptyBranch = uiSource.slice(renderStart, emptyBranchEnd);
  expect(emptyBranch).toContain('nowPlayingEl.innerHTML =');
  expect(emptyBranch).toContain("tr('nowPlayingEmpty', 'Aktuell läuft nichts.')");
  expect(emptyBranch).toContain("updateState('idle')");
});

test('failed slot cleanup remains retryable through controller stop', async () => {
  const engine = new EventEmitter();
  engine.stop = jest.fn(async () => { throw new Error('synthetic stop IPC error'); });
  engine.shutdown = jest.fn()
    .mockRejectedValueOnce(new Error('synthetic child close timeout'))
    .mockResolvedValueOnce(undefined);
  const controller = new PlaybackController({}, {}, { engineFactory: () => engine });
  const slot = controller._createSlot('A', 1);
  slot.playbackId = 'playback-1';
  slot.state = 'playing';
  controller.activeSlot = 'A';
  controller.activePlaybackId = 'playback-1';
  controller.transportState = 'playing';

  await expect(controller.stop()).rejects.toThrow('synthetic child close timeout');
  expect(controller._cleanupPendingSlots.get('A')).toBe(slot);
  expect(controller.getNowPlaying()).toBeNull();

  await controller.stop();

  expect(engine.shutdown).toHaveBeenCalledTimes(2);
  expect(controller._cleanupPendingSlots.size).toBe(0);
  expect(controller.getSnapshot()).toEqual(expect.objectContaining({
    activeSlot: null,
    activePlaybackId: null,
    transportState: 'idle'
  }));
});

test('MPV stop timeout retains the owned child until a retry confirms close', async () => {
  jest.useFakeTimers();
  try {
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() }, { platform: 'linux' });
    const child = new EventEmitter();
    child.pid = 8181;
    child.exitCode = null;
    child.signalCode = null;
    child.kill = jest.fn(() => {
      if (child.kill.mock.calls.length === 2) {
        child.exitCode = 0;
        child.emit('close', 0, null);
      }
    });
    engine.process = child;
    engine._ownedPids.add(child.pid);
    child.once('close', () => engine._ownedPids.delete(child.pid));

    const firstStop = engine.stop();
    const firstStopFailure = expect(firstStop).rejects.toThrow('mpv IPC is not connected for stop');
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(2000);
    await firstStopFailure;
    expect(engine.process).toBe(child);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(engine._expectedProcessStops.has(child)).toBe(true);
    expect(child.exitCode).toBeNull();

    await engine.stop();

    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(child.exitCode).toBe(0);
    expect(engine.process).toBeNull();
    expect(engine._ownedPids.has(child.pid)).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
