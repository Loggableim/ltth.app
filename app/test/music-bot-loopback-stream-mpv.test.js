const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const runOptInIntegration = process.env.LTTH_RUN_LOOPBACK_MPV_STREAM_TEST === '1' ? test : test.skip;
const REQUEST_QUERY = 'synthetic loopback stream fixture';
const CHUNK_BYTES = 8192;

function createSilentWav(durationSeconds = 3, sampleRate = 22050) {
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMpvPosition(engine, minimumSeconds = 0.1, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await engine._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs: 300
      });
      const position = Number(response?.data);
      if (Number.isFinite(position) && position >= minimumSeconds) return position;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  throw lastError || new Error(`MPV did not advance to ${minimumSeconds}s`);
}

runOptInIntegration('streams a Music Bot request from owned loopback HTTP into real null-AO MPV', async () => {
  if (!fs.existsSync(MPV_PATH)) throw new Error(`Opt-in MPV executable not found: ${MPV_PATH}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-loopback-stream-'));
  const wavPath = path.join(tempDir, 'synthetic-stream.wav');
  const wav = createSilentWav();
  fs.writeFileSync(wavPath, wav);

  const requests = [];
  const sockets = new Set();
  let bytesSent = 0;
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    if (req.method !== 'GET' || req.url !== '/synthetic-stream.wav') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store',
      Connection: 'close'
    });
    void (async () => {
      for (let offset = 0; offset < wav.length && !res.destroyed; offset += CHUNK_BYTES) {
        const chunk = wav.subarray(offset, Math.min(offset + CHUNK_BYTES, wav.length));
        bytesSent += chunk.length;
        res.write(chunk);
        await delay(15);
      }
      if (!res.destroyed) res.end();
    })();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

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
      maxSongDurationSeconds: 30,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  }, api);
  let streamUrl = null;
  let engine = null;
  let child = null;
  let serverListening = false;

  plugin.musicResolver = {
    resolve: jest.fn(async (query) => {
      if (query !== REQUEST_QUERY) throw new Error('Unexpected fixture request');
      return {
        success: true,
        song: {
          id: 'loopback-stream-1',
          title: 'Synthetic Loopback Stream',
          artist: 'Fixture Artist',
          duration: 3,
          url: 'https://fixture.invalid/track/loopback-stream-1',
          streamUrl,
          source: 'fixture',
          provider: 'fixture',
          providerId: 'loopback-stream-1',
          trackKey: 'fixture:loopback-stream-1'
        }
      };
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

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        serverListening = true;
        const address = server.address();
        streamUrl = `http://127.0.0.1:${address.port}/synthetic-stream.wav`;
        resolve();
      });
    });

    const request = await plugin._handleDashboardRequest(REQUEST_QUERY, 'loopback-viewer');
    expect(request).toMatchObject({ success: true, position: 1 });
    expect(plugin.musicResolver.resolve).toHaveBeenCalledTimes(1);
    expect(queue.getQueue()).toHaveLength(1);
    expect(queue.getQueue()[0]).toEqual(expect.objectContaining({
      id: 'loopback-stream-1',
      title: 'Synthetic Loopback Stream',
      requestedBy: 'loopback-viewer',
      streamUrl,
      localPath: null,
      provider: 'fixture',
      trackKey: 'fixture:loopback-stream-1'
    }));
    expect(controller.getState()).toBe('idle');

    const played = await plugin._playNextFromQueueInternal({ isCurrent: () => true });
    expect(played).toMatchObject({
      success: true,
      song: expect.objectContaining({ id: 'loopback-stream-1', trackKey: 'fixture:loopback-stream-1' })
    });
    engine = controller._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(registry.register).toHaveBeenCalledWith(child.pid);

    const position = await waitForMpvPosition(engine);
    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    expect(position).toBeGreaterThanOrEqual(0.1);
    expect(heartbeat).toEqual(expect.objectContaining({ ok: true, action: 'healthy', position: expect.any(Number) }));
    const loadedPath = await engine._sendCommand(['get_property', 'path'], {
      waitForResponse: true,
      timeoutMs: 1000
    });
    expect(loadedPath.data).toBe(streamUrl);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
      id: 'loopback-stream-1',
      title: 'Synthetic Loopback Stream',
      artist: 'Fixture Artist',
      requestedBy: 'loopback-viewer',
      provider: 'fixture',
      trackKey: 'fixture:loopback-stream-1',
      streamUrl,
      localPath: null
    }));
    expect(queue.getQueue()).toEqual([]);
    expect(queue.getCurrent()).toEqual(expect.objectContaining({
      id: 'loopback-stream-1',
      requestedBy: 'loopback-viewer',
      trackKey: 'fixture:loopback-stream-1'
    }));
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((entry) => entry.method === 'GET' && entry.url === '/synthetic-stream.wav')).toBe(true);
    expect(bytesSent).toBeGreaterThan(44);
    expect(bytesSent).toBeLessThanOrEqual(wav.length);
  } finally {
    await controller.shutdown();
    if (child) {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
      expect(registry.unregister).toHaveBeenCalledWith(child.pid);
    }
    for (const socket of sockets) socket.destroy();
    if (serverListening) {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(server.listening).toBe(false);
    db.close();
    expect(db.open).toBe(false);
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
  }
}, 20000);
