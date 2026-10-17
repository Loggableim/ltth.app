'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const AUDIBLE_TEST_NAME = 'plays a queued two-second synthetic tone through the real Music Bot handler and default MPV audio';
const audibleIntegrationTest = process.env.LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST === '1'
  && process.platform === 'win32'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;

function createToneWav(durationSeconds = 2, sampleRate = 22050, frequency = 440) {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);

  const amplitude = Math.round(32767 * 0.1);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const value = amplitude * Math.sin((2 * Math.PI * frequency * sample) / sampleRate);
    wav.writeInt16LE(Math.round(value), 44 + sample * 2);
  }
  return wav;
}

async function waitForPlaybackPosition(engine, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await engine._sendCommand(['get_property', 'time-pos'], {
        waitForResponse: true,
        timeoutMs: 300
      });
      const position = Number(result?.data);
      if (Number.isFinite(position) && position > 0.15) return position;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw lastError || new Error('MPV did not advance through the queued tone fixture');
}

audibleIntegrationTest(AUDIBLE_TEST_NAME, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-queue-audible-'));
  const wavPath = path.join(tempDir, 'synthetic-440hz-two-seconds.wav');
  const db = new Database(':memory:');
  const api = {
    getDatabase: () => db,
    getSocketIO: () => ({ emit: jest.fn() }),
    emit: jest.fn(),
    log: jest.fn()
  };
  const processRegistry = {
    register: jest.fn(),
    unregister: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin._mpvAvailable = true;
  plugin._emitQueue = jest.fn();
  plugin._schedulePreCache = jest.fn();

  const queueManager = new QueueManager(plugin.config, api);
  const playbackController = new PlaybackController({
    ...plugin.config.playback,
    mpvPath: MPV_PATH,
    audioDevice: 'auto',
    audioOutputDriver: undefined,
    defaultVolume: 60,
    crossfadeDuration: 0,
    normalization: { enabled: false }
  }, api, { processRegistry });
  plugin.queueManager = queueManager;
  plugin.playbackEngine = playbackController;

  let engine = null;
  let child = null;
  try {
    fs.writeFileSync(wavPath, createToneWav());
    const addResult = queueManager.addSong({
      id: 'synthetic-audible-queue-fixture',
      title: 'Synthetic two-second 440 Hz test tone',
      artist: 'Local fixture',
      url: `https://fixture.invalid/${path.basename(wavPath)}`,
      localPath: wavPath,
      source: 'local-test',
      duration: 2,
      requestedBy: 'isolated-test'
    });
    expect(addResult.success).toBe(true);
    expect(queueManager.getQueue()).toHaveLength(1);

    expect(processRegistry).toEqual(expect.objectContaining({
      register: expect.any(Function),
      unregister: expect.any(Function)
    }));
    expect(processRegistry).not.toHaveProperty('findMarkedProcesses');
    expect(processRegistry).not.toHaveProperty('cleanupMarked');
    expect(playbackController._processRegistry).toBe(processRegistry);
    expect(playbackController.config.audioOutputDriver).toBeUndefined();

    const result = await plugin._playNextFromQueueInternal({ isCurrent: () => true });
    expect(result).toEqual(expect.objectContaining({
      success: true,
      song: expect.objectContaining({ id: 'synthetic-audible-queue-fixture' })
    }));
    expect(queueManager.getQueue()).toEqual([]);
    expect(queueManager.getCurrent()).toEqual(expect.objectContaining({ id: 'synthetic-audible-queue-fixture' }));

    engine = playbackController._slots.A.engine;
    child = engine.process;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    expect(child.spawnargs).toContain('--audio-device=auto');
    expect(child.spawnargs.some((arg) => arg.startsWith('--ao='))).toBe(false);
    expect(engine.config.audioOutputDriver).toBeUndefined();

    const position = await waitForPlaybackPosition(engine);
    expect(position).toBeGreaterThan(0.15);
    expect(engine.getNowPlaying()).toEqual(expect.objectContaining({ id: 'synthetic-audible-queue-fixture' }));
  } finally {
    await playbackController.shutdown({ reconcileOrphans: false }).catch(() => {});
    if (child) {
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeNull();
      expect(engine._ownedPids.has(child.pid)).toBe(false);
      expect(processRegistry.register).toHaveBeenCalledWith(child.pid);
      expect(processRegistry.unregister).toHaveBeenCalledWith(child.pid);
    }
    expect(processRegistry).not.toHaveProperty('findMarkedProcesses');
    expect(processRegistry).not.toHaveProperty('cleanupMarked');
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    if (child) {
      console.info(
        `[music-bot queue-handler audible opt-in] pid=${child.pid} exit=${child.exitCode} ` +
        `owned=0 defaultAudio=true tempRemoved=${!fs.existsSync(tempDir)}`
      );
    }
  }
}, 12000);
