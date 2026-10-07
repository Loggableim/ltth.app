const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = process.env.LTTH_RUN_MUSIC_BOT_NULL_MPV === '1'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;

function createSilentWav(durationSeconds = 12, sampleRate = 8000) {
  const channelCount = 1;
  const bytesPerSample = 2;
  const dataLength = durationSeconds * sampleRate * channelCount * bytesPerSample;
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
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

async function waitForMpvMediaReady(engine, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await engine._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs: 250
      });
      if (Number.isFinite(Number(response?.data))) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError || new Error('Real MPV did not expose a playback position in time');
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

async function invokeRoute(handler, req = {}) {
  const response = createResponse();
  await handler(req, response);
  return response;
}

integrationTest('drives real null-audio MPV through direct Music Bot control routes and cleans up owned resources', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-routes-mpv-'));
  const db = new Database(':memory:');
  const storedConfig = new Map();
  const routes = new Map();
  const api = {
    getDatabase: () => db,
    getSocketIO: () => ({ emit: jest.fn() }),
    registerRoute: (method, route, handler) => routes.set(`${method}:${route}`, handler),
    setConfig: async (key, value) => { storedConfig.set(key, structuredClone(value)); return true; },
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config.playback = {
    ...plugin.config.playback,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    crossfadeDuration: 0,
    defaultVolume: 20,
    normalization: { enabled: false }
  };
  plugin.config.audio = { masterVolume: 100, sourceVolume: 20 };
  plugin.config.preCache = { ...plugin.config.preCache, enabled: false };
  plugin.config.safety = { locked: false, lockedAt: null, reason: null };
  plugin._mpvAvailable = true;

  const queueManager = new QueueManager(plugin.config, api);
  const controller = new PlaybackController(plugin.config.playback, api);
  const wavPath = path.join(tempDir, 'route-control-silence.wav');
  fs.writeFileSync(wavPath, createSilentWav());
  const resolver = { resolve: jest.fn(() => { throw new Error('Resolver must not run in this local-fixture test'); }) };
  plugin.queueManager = queueManager;
  plugin.playbackEngine = controller;
  plugin.musicResolver = resolver;
  plugin.autoDJ = { reset: jest.fn() };
  plugin._registerRoutes();
  let engine = null;
  let child = null;

  try {
    expect(controller.config.audioOutputDriver).toBe('null');
    expect(queueManager.addSong({
      id: 'route-fixture-silence',
      title: 'Route control silence',
      artist: 'Local fixture',
      url: 'https://fixture.invalid/route-control-silence',
      localPath: wavPath,
      source: 'local-test',
      duration: 12,
      requestedBy: 'isolated-test'
    }).success).toBe(true);

    const playResponse = await invokeRoute(
      routes.get('post:/api/plugins/music-bot/queue/:index/play'),
      { params: { index: '0' }, body: {} }
    );
    expect(playResponse.statusCode).toBe(200);
    expect(playResponse.payload).toEqual(expect.objectContaining({ success: true }));
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'route-fixture-silence' }));
    expect(resolver.resolve).not.toHaveBeenCalled();

    engine = controller._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(child.spawnargs).toContain('--ao=null');
    await waitForMpvMediaReady(engine);

    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(heartbeat).toEqual(expect.objectContaining({ ok: true, action: 'healthy', position: expect.any(Number) }));
    expect(Number.isFinite(await controller.getPosition({ timeoutMs: 1000 }))).toBe(true);

    const pauseResponse = await invokeRoute(routes.get('post:/api/plugins/music-bot/pause'));
    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.payload).toEqual({ success: true });
    expect(controller.getState()).toBe('paused');

    const playbackId = controller.getSnapshot().activePlaybackId;
    const seekResponse = await invokeRoute(routes.get('post:/api/plugins/music-bot/seek'), {
      body: { playbackId, positionSeconds: 3 }
    });
    expect(seekResponse.statusCode).toBe(200);
    expect(seekResponse.payload).toEqual(expect.objectContaining({
      success: true, playbackId, position: expect.any(Number), state: 'paused'
    }));
    expect(seekResponse.payload.position).toBeGreaterThanOrEqual(2.5);
    expect(controller.getState()).toBe('paused');

    const volumeResponse = await invokeRoute(routes.get('post:/api/plugins/music-bot/volume'), {
      body: { sourceVolume: 35 }
    });
    expect(volumeResponse.statusCode).toBe(200);
    expect(volumeResponse.payload).toEqual(expect.objectContaining({
      success: true, volume: 35, masterVolume: 100, sourceVolume: 35
    }));
    expect(storedConfig.get('config').audio.sourceVolume).toBe(35);
    expect((await engine._sendCommand(['get_property', 'volume'], { waitForResponse: true })).data).toBe(35);

    const resumeResponse = await invokeRoute(routes.get('post:/api/plugins/music-bot/resume'));
    expect(resumeResponse.statusCode).toBe(200);
    expect(resumeResponse.payload).toEqual(expect.objectContaining({ success: true, resumed: true }));
    expect(controller.getState()).toBe('playing');
    const resumedHeartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(resumedHeartbeat).toEqual(expect.objectContaining({ ok: true, action: 'healthy' }));
    expect(resumedHeartbeat.position).toBeGreaterThanOrEqual(3);

    const stopResponse = await invokeRoute(routes.get('post:/api/plugins/music-bot/clear'));
    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.payload).toEqual({ success: true });
    expect(controller.getNowPlaying()).toBeNull();
    expect(controller.getState()).toBe('idle');
    expect(queueManager.getQueue()).toEqual([]);
    expect(plugin.autoDJ.reset).toHaveBeenCalledTimes(1);
  } finally {
    engine = engine || controller._slots.A?.engine || null;
    child = child || engine?.process || null;
    if (child && child.exitCode === null && child.signalCode === null) {
      await controller.stop().catch(() => {});
    }
    if (child) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    }
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(db.open).toBe(false);
    expect(fs.existsSync(tempDir)).toBe(false);
    if (child) {
      console.info(
        `[music-bot route MPV] ownedPid=${child.pid} exitCode=${child.exitCode} ` +
        `signal=${child.signalCode} ownedPidReleased=${engine._ownedPids.size === 0} ` +
        `dbClosed=${!db.open} tempRemoved=${!fs.existsSync(tempDir)}`
      );
    }
  }
}, 20000);
