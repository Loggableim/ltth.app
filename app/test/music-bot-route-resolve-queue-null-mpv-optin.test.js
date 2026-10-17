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

function createSilentWav(durationSeconds = 30, sampleRate = 8000) {
  const channels = 1;
  const bitsPerSample = 16;
  const dataLength = durationSeconds * sampleRate * channels * (bitsPerSample / 8);
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  wav.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  return wav;
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
  const handlers = Array.isArray(handler) ? handler : [handler];
  for (const routeHandler of handlers) {
    let nextCalled = false;
    await routeHandler(req, response, () => { nextCalled = true; });
    if (!nextCalled) break;
  }
  return response;
}

async function waitForMpvPosition(engine, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await engine._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs: 250
      });
      if (Number.isFinite(Number(response?.data))) return Number(response.data);
    } catch (_) {
      // MPV can take a short time to load the local fixture.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('MPV did not expose a playback position for the local WAV fixture');
}

integrationTest('resolves a local fixture through Music Bot routes, queues it, and plays through owned null-AO MPV', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-resolve-queue-'));
  const db = new Database(':memory:');
  const routes = new Map();
  const api = {
    getDatabase: () => db,
    getSocketIO: () => ({ emit: jest.fn() }),
    registerRoute: (method, route, ...handlers) => routes.set(`${method}:${route}`, handlers),
    setConfig: jest.fn(async () => true),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const noScanRegistry = {
    register: jest.fn(),
    unregister: jest.fn(),
    findMarkedProcesses: jest.fn(async () => []),
    cleanupMarked: jest.fn(async () => ({ found: [], killed: [], remaining: [] }))
  };
  plugin.config.playback = {
    ...plugin.config.playback,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    autoPlay: true,
    crossfadeDuration: 0,
    defaultVolume: 20,
    normalization: { enabled: false }
  };
  plugin.config.audio = { masterVolume: 100, sourceVolume: 20 };
  plugin.config.preCache = { ...plugin.config.preCache, enabled: false };
  plugin.config.safety = { locked: false, lockedAt: null, reason: null };
  plugin._mpvAvailable = true;

  const wavPath = path.join(tempDir, 'synthetic-search-result.wav');
  fs.writeFileSync(wavPath, createSilentWav());
  const fixtureSong = {
    id: 'local-fixture:synthetic-search-result',
    trackKey: 'local-fixture:synthetic-search-result',
    title: 'Synthetic Local Result',
    artist: 'Isolated Fixture',
    duration: 30,
    url: wavPath,
    localPath: wavPath,
    source: 'local-fixture',
    provider: 'local-fixture',
    providerId: 'synthetic-search-result'
  };
  const resolver = {
    resolve: jest.fn(async (query) => ({ success: true, song: { ...fixtureSong, query } }))
  };
  const queueManager = new QueueManager(plugin.config, api);
  const controller = new PlaybackController(plugin.config.playback, api, {
    processRegistry: noScanRegistry
  });
  plugin.queueManager = queueManager;
  plugin.playbackEngine = controller;
  plugin.musicResolver = resolver;
  plugin.autoDJ = {
    reset: jest.fn(),
    setRequestSeed: jest.fn(),
    onSongRequested: jest.fn()
  };
  plugin._schedulePreCache = jest.fn();
  plugin._registerRoutes();

  let engine = null;
  let child = null;
  try {
    const resolveResponse = await invokeRoute(
      routes.get('get:/api/plugins/music-bot/resolve'),
      { query: { q: 'synthetic local query' }, socket: { remoteAddress: '127.0.0.1' } }
    );
    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.payload).toEqual(expect.objectContaining({
      success: true,
      song: expect.objectContaining({
        id: fixtureSong.id,
        title: fixtureSong.title,
        localPath: wavPath
      })
    }));

    const requestResponse = await invokeRoute(
      routes.get('post:/api/plugins/music-bot/request'),
      {
        body: { query: 'synthetic local query', username: 'spoofed-viewer', avatar: 'spoofed-avatar' },
        socket: { remoteAddress: '127.0.0.1' }
      }
    );
    expect(requestResponse.statusCode).toBe(200);
    expect(requestResponse.payload).toEqual(expect.objectContaining({
      success: true,
      song: expect.objectContaining({
        id: fixtureSong.id,
        trackKey: fixtureSong.trackKey,
        requestedBy: 'dashboard',
        requesterAvatar: null
      })
    }));
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect(resolver.resolve).toHaveBeenNthCalledWith(
      1,
      'synthetic local query',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
      id: fixtureSong.id,
      trackKey: fixtureSong.trackKey,
      requestedBy: 'dashboard',
      requesterAvatar: null
    }));
    expect(queueManager.getQueue()).toEqual([]);

    engine = controller._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(child.spawnargs).toContain('--ao=null');
    const position = await waitForMpvPosition(engine);
    expect(Number.isFinite(position)).toBe(true);
    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(heartbeat).toEqual(expect.objectContaining({
      ok: true,
      action: 'healthy',
      position: expect.any(Number)
    }));
    expect(noScanRegistry.findMarkedProcesses).not.toHaveBeenCalled();

    await controller.shutdown({ reconcileOrphans: false });
    expect(child.exitCode).toBe(0);
    expect(child.signalCode).toBeNull();
    expect(engine._ownedPids.size).toBe(0);
    expect(noScanRegistry.findMarkedProcesses).not.toHaveBeenCalled();
    expect(noScanRegistry.cleanupMarked).not.toHaveBeenCalled();
  } finally {
    engine = engine || controller._slots.A?.engine || null;
    child = child || engine?.process || null;
    if (child && child.exitCode === null && child.signalCode === null) {
      await controller.shutdown({ reconcileOrphans: false }).catch(() => {});
    }
    if (child) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    }
    if (db.open) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(db.open).toBe(false);
    expect(fs.existsSync(tempDir)).toBe(false);
  }
}, 20000);
