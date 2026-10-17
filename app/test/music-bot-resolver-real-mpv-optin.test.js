'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MediaCache = require('../plugins/music-bot/lib/media-cache');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = process.env.LTTH_RUN_MUSIC_BOT_NULL_MPV === '1'
  && process.platform === 'win32'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;
const FIXTURE_QUERY = '  Synthetic   Fixture Song  ';
const NORMALIZED_QUERY = 'synthetic fixture song';
const FIXTURE_VIDEO_ID = 'fixture0001';
const execFileAsync = promisify(execFile);

function createSilentWav(durationSeconds = 18, sampleRate = 8000) {
  const channelCount = 1;
  const bitsPerSample = 16;
  const dataLength = durationSeconds * sampleRate * channelCount * (bitsPerSample / 8);
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * (bitsPerSample / 8), 28);
  wav.writeUInt16LE(channelCount * (bitsPerSample / 8), 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

async function waitForMpvPosition(engine, timeoutMs = 5000) {
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
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError || new Error('MPV did not expose the local resolver fixture position');
}

function createControlledRunner(sourceWavPath) {
  const result = {
    id: FIXTURE_VIDEO_ID,
    title: 'Synthetic Fixture Song',
    uploader: 'Fixture Artist',
    duration: 18,
    extractor_key: 'youtube',
    webpage_url: `https://www.youtube.com/watch?v=${FIXTURE_VIDEO_ID}`
  };

  return {
    maxConcurrent: 1,
    maxQueue: 4,
    run: jest.fn(async (_executable, args) => {
      const target = args.at(-1);
      if (typeof target === 'string' && target.startsWith('ytsearch5:')) {
        return JSON.stringify({ entries: [result] });
      }

      const outputIndex = args.indexOf('--output');
      if (outputIndex !== -1) {
        const outputPath = args[outputIndex + 1].replace('%(ext)s', 'wav');
        fs.copyFileSync(sourceWavPath, outputPath);
        return `${outputPath}\n`;
      }

      throw new Error(`Unexpected controlled yt-dlp args: ${args.join(' ')}`);
    }),
    destroy: jest.fn(async () => {}),
    getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
  };
}

integrationTest('discovers the product MPV path and resolves a controlled result through queue and null-AO MPV', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-real-resolver-mpv-'));
  const wavPath = path.join(tempDir, 'synthetic-source.wav');
  const cacheDir = path.join(tempDir, 'cache');
  fs.writeFileSync(wavPath, createSilentWav());

  const db = new Database(':memory:');
  const api = {
    getDatabase: () => db,
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
    log: jest.fn(),
    setConfig: jest.fn(async () => {})
  };
  const registry = {
    register: jest.fn(),
    unregister: jest.fn(),
    findMarkedProcesses: jest.fn(async () => []),
    cleanupMarked: jest.fn(async () => ({ found: [], killed: [], remaining: [] }))
  };
  const runner = createControlledRunner(wavPath);
  const plugin = new MusicBotPlugin(api);
  const originalChocolateyInstall = process.env.ChocolateyInstall;
  const resolver = new MusicResolver({
    ytdlpPath: 'controlled-yt-dlp',
    searchTimeout: 10000,
    maxConcurrentProcesses: 1,
    maxDurationSeconds: 60,
    moderation: { rejectExplicit: false, rejectAgeRestricted: false, blockedKeywords: [] }
  }, api, { runner });
  const mediaCache = new MediaCache({
    cacheDir,
    ytdlpPath: 'controlled-yt-dlp',
    cacheTTLDays: 1,
    maxCacheSizeMB: 1,
    maxConcurrentDownloads: 1
  }, api, { runner });
  const queueManager = new QueueManager({
    queue: {
      maxLength: 5,
      maxPerUser: 5,
      maxSongDurationSeconds: 60,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  }, api);
  plugin.musicResolver = resolver;
  plugin.mediaCache = mediaCache;
  plugin.queueManager = queueManager;
  plugin.config.safety = { locked: false, lockedAt: null, reason: null };
  plugin.config.playback.autoPlay = false;
  plugin.config.preCache = { ...plugin.config.preCache, enabled: true, lookahead: 1 };
  plugin._getBanRejection = jest.fn(() => null);
  plugin._emitToast = jest.fn();
  plugin._emitSongAdded = jest.fn();
  plugin._invalidateRadioPrefetch = jest.fn();
  plugin._cancelNextSongVote = jest.fn();

  let engine = null;
  let child = null;
  let controller = null;
  let selectedMpvPath = null;
  let mpvVersion = '';
  try {
    process.env.ChocolateyInstall = 'C:\\ProgramData\\chocolatey';
    // Keep discovery on the real local Chocolatey tree, while suppressing the optional PATH lookup.
    plugin._resolveExecutable = jest.fn(async () => null);
    await plugin._ensureMpv();
    expect(plugin._mpvAvailable).toBe(true);
    expect(plugin.config.playback.mpvPath.toLowerCase()).toBe(MPV_PATH.toLowerCase());
    expect(api.setConfig).toHaveBeenCalledWith('config', plugin.config);
    selectedMpvPath = plugin.config.playback.mpvPath;

    const versionResult = await execFileAsync(selectedMpvPath, ['--version'], {
      timeout: 5000,
      windowsHide: true
    });
    expect(versionResult.stdout).toMatch(/mpv v?0\.41\.0/i);
    mpvVersion = versionResult.stdout.split(/\r?\n/, 1)[0].trim();

    controller = new PlaybackController({
      defaultVolume: 0,
      crossfadeDuration: 0,
      mpvPath: plugin.config.playback.mpvPath,
      audioOutputDriver: 'null',
      normalization: { enabled: false }
    }, api, { processRegistry: registry });
    plugin.playbackEngine = controller;

    const request = await plugin._handleDashboardRequest(FIXTURE_QUERY, 'fixture-viewer');
    expect(request).toMatchObject({ success: true, position: 1 });
    expect(queueManager.getQueue()).toHaveLength(1);

    expect(runner.run).toHaveBeenCalledTimes(2);
    const [searchCall, downloadCall] = runner.run.mock.calls;
    expect(searchCall[1]).toContain('--ignore-config');
    expect(searchCall[1]).toContain('--dump-single-json');
    expect(searchCall[1].at(-1)).toBe(`ytsearch5:${NORMALIZED_QUERY}`);
    expect(downloadCall[1]).toContain('--ignore-config');
    expect(downloadCall[1]).toContain(`https://www.youtube.com/watch?v=${FIXTURE_VIDEO_ID}`);

    const trackKey = `youtube:${FIXTURE_VIDEO_ID}`;
    const precacheTask = plugin._precacheTasks.get(trackKey)?.promise;
    expect(precacheTask).toBeDefined();
    const cachedPath = await precacheTask;
    expect(cachedPath).toBeTruthy();
    expect(path.extname(cachedPath)).toBe('.wav');
    expect(fs.readFileSync(cachedPath).equals(fs.readFileSync(wavPath))).toBe(true);
    expect(queueManager.getQueue()[0]).toEqual(expect.objectContaining({
      title: 'Synthetic Fixture Song',
      artist: 'Fixture Artist',
      provider: 'youtube',
      providerId: FIXTURE_VIDEO_ID,
      trackKey,
      requestedBy: 'fixture-viewer',
      localPath: cachedPath,
      streamUrl: null
    }));

    const played = await plugin._playNextFromQueueInternal({ isCurrent: () => true });
    expect(played).toMatchObject({ success: true, song: expect.objectContaining({ trackKey }) });
    engine = controller._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(child.spawnfile.toLowerCase()).toBe(plugin.config.playback.mpvPath.toLowerCase());
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(registry.register).toHaveBeenCalledWith(child.pid);
    expect(child.spawnargs).toContain('--ao=null');

    const position = await waitForMpvPosition(engine);
    expect(Number.isFinite(position)).toBe(true);
    const loadedPath = await engine._sendCommand(['get_property', 'path'], {
      waitForResponse: true,
      timeoutMs: 1000
    });
    expect(loadedPath.data).toBe(cachedPath);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
      title: 'Synthetic Fixture Song',
      provider: 'youtube',
      providerId: FIXTURE_VIDEO_ID,
      trackKey,
      requestedBy: 'fixture-viewer',
      localPath: cachedPath,
      streamUrl: null
    }));
    expect(queueManager.getQueue()).toEqual([]);
    expect(queueManager.getCurrent()).toEqual(expect.objectContaining({ trackKey }));
    expect(registry.findMarkedProcesses).not.toHaveBeenCalled();
    expect(registry.cleanupMarked).not.toHaveBeenCalled();
  } finally {
    if (controller) await controller.shutdown({ reconcileOrphans: false }).catch(() => {});
    await resolver.destroy().catch(() => {});
    await mediaCache.destroy().catch(() => {});
    if (child) {
      expect(child.exitCode).toBe(0);
      expect(engine._ownedPids.size).toBe(0);
      expect(registry.unregister).toHaveBeenCalledWith(child.pid);
    }
    if (db.open) db.close();
    expect(db.open).toBe(false);
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    console.info(
      `[music-bot discovery null-MPV] selected=${selectedMpvPath} version=${mpvVersion} ` +
      `spawnfile=${child?.spawnfile || ''} pid=${child?.pid || ''} exitCode=${child?.exitCode ?? ''} ` +
      `ownedPidReleased=${Boolean(engine && child && engine._ownedPids.size === 0)} ` +
      `tempRemoved=${!fs.existsSync(tempDir)}`
    );
    if (originalChocolateyInstall === undefined) delete process.env.ChocolateyInstall;
    else process.env.ChocolateyInstall = originalChocolateyInstall;
  }
}, 20000);
