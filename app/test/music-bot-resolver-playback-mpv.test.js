const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = process.env.LTTH_RUN_MUSIC_BOT_NULL_MPV === '1'
  && process.platform === 'win32'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;
const FIXTURE_QUERY = 'synthetic local resolver fixture';

function createSilentWav(durationSeconds = 12, sampleRate = 8000) {
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataLength = sampleCount * channelCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataLength);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  wav.writeUInt16LE(channelCount * bytesPerSample, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

async function waitForMpvMediaReady(engine, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await engine._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs: 300
      });
      if (Number.isFinite(Number(response?.data))) return Number(response.data);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw lastError || new Error('MPV did not expose the local fixture position');
}

integrationTest('carries a mocked resolver search result through plugin queue and real null-AO MPV', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-resolver-mpv-'));
  const wavPath = path.join(tempDir, 'resolver-fixture.wav');
  fs.writeFileSync(wavPath, createSilentWav());

  const db = new Database(':memory:');
  const api = {
    getDatabase: () => db,
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
    log: jest.fn()
  };
  const registry = {
    register: jest.fn(),
    unregister: jest.fn(),
    cleanupMarked: jest.fn(async () => ({ found: [], killed: [], remaining: [] }))
  };
  const controller = new PlaybackController({
    defaultVolume: 0,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, api, { processRegistry: registry });
  const plugin = new MusicBotPlugin(api);
  const queue = new QueueManager({
    queue: {
      maxLength: 5,
      maxPerUser: 5,
      maxSongDurationSeconds: 120,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  }, api);
  const resolverSong = {
    id: 'resolver-fixture-1',
    title: 'Synthetic resolver fixture',
    artist: 'Fixture Artist',
    duration: 12,
    url: 'https://resolver-fixture.invalid/watch/fixture-1',
    localPath: wavPath,
    source: 'fixture',
    provider: 'fixture',
    providerId: 'fixture-1',
    trackKey: 'fixture:fixture-1',
    streamUrl: null
  };

  plugin.musicResolver = {
    resolve: jest.fn(async (query) => {
      if (query !== FIXTURE_QUERY) throw new Error('Unexpected resolver query');
      return { success: true, song: { ...resolverSong } };
    })
  };
  plugin.queueManager = queue;
  plugin.playbackEngine = controller;
  plugin._mpvAvailable = true;
  plugin.config.playback.autoPlay = false;
  plugin._emitToast = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cancelNextSongVote = jest.fn();
  plugin._schedulePreCache = jest.fn();
  let engine = null;
  let child = null;

  try {
    const request = await plugin._handleDashboardRequest(FIXTURE_QUERY, 'fixture-viewer');
    expect(plugin.musicResolver.resolve).toHaveBeenCalledTimes(1);
    expect(plugin.musicResolver.resolve).toHaveBeenCalledWith(FIXTURE_QUERY, { signal: undefined });
    expect(request).toMatchObject({ success: true, position: 1 });
    expect(queue.getQueue()).toHaveLength(1);
    expect(queue.getQueue()[0]).toEqual(expect.objectContaining({
      id: resolverSong.id,
      title: resolverSong.title,
      provider: resolverSong.provider,
      providerId: resolverSong.providerId,
      trackKey: resolverSong.trackKey,
      requestedBy: 'fixture-viewer',
      localPath: wavPath,
      streamUrl: null
    }));
    expect(controller.getState()).toBe('idle');

    const played = await plugin._playNextFromQueueInternal({ isCurrent: () => true });
    expect(played).toMatchObject({
      success: true,
      song: expect.objectContaining({ id: resolverSong.id, trackKey: resolverSong.trackKey })
    });
    engine = controller._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(registry.register).toHaveBeenCalledWith(child.pid);

    const position = await waitForMpvMediaReady(engine);
    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(heartbeat).toEqual(expect.objectContaining({ ok: true, action: 'healthy', position: expect.any(Number) }));
    expect(position).toBeGreaterThanOrEqual(0);
    const playbackId = controller.getSnapshot().activePlaybackId;
    const baselineDataListeners = engine.socket.listenerCount('data');
    await controller.pause();
    expect(controller.getState()).toBe('paused');
    expect((await engine._sendCommand(['get_property', 'pause'], { waitForResponse: true, timeoutMs: 1000 })).data).toBe(true);

    await controller.setVolume(37);
    expect(engine.getVolume()).toBe(37);
    expect(Number((await engine._sendCommand(['get_property', 'volume'], { waitForResponse: true, timeoutMs: 1000 })).data)).toBeCloseTo(37, 0);

    const seek = await controller.seek(4, { playbackId });
    expect(seek.position).toBeGreaterThanOrEqual(3.5);
    expect(seek.position).toBeLessThanOrEqual(4.5);
    expect(engine.socket.listenerCount('data')).toBe(baselineDataListeners);
    await controller.resume();
    expect(controller.getState()).toBe('playing');
    expect((await engine._sendCommand(['get_property', 'pause'], { waitForResponse: true, timeoutMs: 1000 })).data).toBe(false);
    const resumedPosition = await controller.getPosition({ timeoutMs: 1000 });
    expect(resumedPosition).toBeGreaterThanOrEqual(seek.position);
    const resumedHeartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(resumedHeartbeat).toEqual(expect.objectContaining({ ok: true, action: 'healthy', position: expect.any(Number) }));
    expect(engine.socket.listenerCount('data')).toBe(baselineDataListeners);
    const loadedPath = await engine._sendCommand(['get_property', 'path'], {
      waitForResponse: true,
      timeoutMs: 1000
    });
    expect(loadedPath.data).toBe(wavPath);
    expect(engine.getDiagnostics()).toEqual(expect.objectContaining({
      state: 'playing',
      media: expect.objectContaining({ title: resolverSong.title }),
      ipc: expect.objectContaining({ connected: true })
    }));
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
      id: resolverSong.id,
      title: resolverSong.title,
      artist: resolverSong.artist,
      provider: resolverSong.provider,
      providerId: resolverSong.providerId,
      trackKey: resolverSong.trackKey,
      requestedBy: 'fixture-viewer',
      localPath: wavPath,
      streamUrl: null
    }));
    expect(queue.getQueue()).toEqual([]);
    expect(queue.getCurrent()).toEqual(expect.objectContaining({
      id: resolverSong.id,
      trackKey: resolverSong.trackKey,
      requestedBy: 'fixture-viewer'
    }));
    expect(plugin.musicResolver.resolve).toHaveBeenCalledTimes(1);
  } finally {
    await controller.shutdown();
    if (child) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
      expect(registry.unregister).toHaveBeenCalledWith(child.pid);
      expect(engine.process).toBeNull();
      expect(engine.socket).toBeNull();
      expect(engine._pendingCommands.size).toBe(0);
      expect(engine._duckReleaseTimer).toBeNull();
      expect(engine._fadeTimer).toBeNull();
    }
    db.close();
    expect(db.open).toBe(false);
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
  }
}, 20000);
