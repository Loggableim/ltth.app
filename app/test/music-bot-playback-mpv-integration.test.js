const fs = require('fs');
const os = require('os');
const path = require('path');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const Database = require('better-sqlite3');
const MusicBotPlugin = require('../plugins/music-bot/main');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = process.env.LTTH_RUN_MUSIC_BOT_NULL_MPV === '1'
  && process.platform === 'win32'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;
const audibleIntegrationTest = process.env.LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST === '1'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;

function createSilentWav(durationSeconds = 10, sampleRate = 8000) {
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

function createLowLevelToneWav(durationSeconds = 2, sampleRate = 22050, frequency = 440) {
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

  const amplitude = Math.round(32767 * 0.1);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const value = amplitude * Math.sin((2 * Math.PI * frequency * sample) / sampleRate);
    wav.writeInt16LE(Math.round(value), 44 + sample * bytesPerSample);
  }
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
  throw lastError || new Error('Real MPV did not expose playback position in time');
}

integrationTest('plays, heartbeats, and fully cleans up real MPV with null audio output', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-'));
  const wavPath = path.join(tempDir, 'silence.wav');
  fs.writeFileSync(wavPath, createSilentWav());
  const api = { log: jest.fn() };
  const controller = new PlaybackController({
    defaultVolume: 0,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, api);
  let engine = null;
  let mpvProcess = null;

  try {
    await controller.play({
      id: 'local-silence',
      title: 'Local silence',
      localPath: wavPath,
      source: 'local-test'
    });
    engine = controller._slots.A.engine;
    mpvProcess = engine.process;
    expect(Number.isInteger(mpvProcess?.pid)).toBe(true);
    expect(engine._ownedPids.has(mpvProcess.pid)).toBe(true);
    const playingSnapshot = controller.getSnapshot();
    expect(playingSnapshot).toEqual(expect.objectContaining({
      activeSlot: 'A',
      transportState: 'playing'
    }));
    expect(playingSnapshot.slots.A).toEqual(expect.objectContaining({
      pid: expect.any(Number),
      ipc: expect.objectContaining({ connected: true })
    }));

    await waitForMpvMediaReady(engine);
    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });
    if (!heartbeat.ok) {
      throw new Error(`Real MPV heartbeat failed: ${JSON.stringify(api.log.mock.calls)}`);
    }
    expect(heartbeat).toEqual(expect.objectContaining({
      ok: true,
      action: 'healthy',
      position: expect.any(Number)
    }));

    const playbackId = controller.getSnapshot().activePlaybackId;
    const forwardSeek = await controller.seek(6, { playbackId });
    expect(forwardSeek).toEqual(expect.objectContaining({
      playbackId,
      duration: expect.any(Number),
      seekable: true,
      state: 'playing'
    }));
    expect(forwardSeek.position).toBeGreaterThanOrEqual(5.5);

    await controller.pause();
    const pausedSeek = await controller.seek(2, { playbackId });
    expect(pausedSeek).toEqual(expect.objectContaining({
      playbackId,
      state: 'paused'
    }));
    expect(pausedSeek.position).toBeGreaterThanOrEqual(1.5);
    await controller.resume();

    await controller.stop();
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: null,
      activePlaybackId: null,
      transportState: 'idle',
      slots: { A: null, B: null }
    }));
    expect(engine.process).toBeNull();
    expect(engine.getDiagnostics().pid).toBeNull();
    expect(engine._ownedPids.size).toBe(0);
  } finally {
    await controller.shutdown().catch(() => {});
    if (mpvProcess) {
      expect(mpvProcess.exitCode !== null || mpvProcess.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    if (mpvProcess) {
      console.info(
        `[music-bot isolated MPV] ownedPid=${mpvProcess.pid} ` +
        `exitCode=${mpvProcess.exitCode} signal=${mpvProcess.signalCode} ` +
        `ownedPidReleased=${engine._ownedPids.size === 0} tempRemoved=${!fs.existsSync(tempDir)}`
      );
    }
  }
}, 20000);

audibleIntegrationTest('plays one local test tone at the user-requested low volume through the default audio device', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-audible-'));
  const wavPath = path.join(tempDir, 'low-level-tone.wav');
  fs.writeFileSync(wavPath, createLowLevelToneWav());
  const controller = new PlaybackController({
    defaultVolume: 60,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    normalization: { enabled: false }
  }, { log: jest.fn() });
  let engine = null;
  let mpvProcess = null;

  try {
    await controller.play({
      id: 'local-low-level-tone',
      title: 'Low-level local test tone',
      localPath: wavPath,
      source: 'local-test'
    });
    engine = controller._slots.A.engine;
    mpvProcess = engine.process;
    expect(Number.isInteger(mpvProcess?.pid)).toBe(true);
    expect(engine._ownedPids.has(mpvProcess.pid)).toBe(true);

    await waitForMpvMediaReady(engine);
    const volume = await engine._sendCommand(['get_property', 'volume'], {
      waitForResponse: true,
      timeoutMs: 1000
    });
    expect(volume.data).toBe(60);
    await new Promise((resolve) => setTimeout(resolve, 2300));

    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      activeSlot: 'A',
      transportState: 'idle'
    }));
  } finally {
    await controller.shutdown().catch(() => {});
    if (mpvProcess) {
      expect(mpvProcess.exitCode !== null || mpvProcess.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    if (mpvProcess) {
      console.info(
        `[music-bot audible test] ownedPid=${mpvProcess.pid} ` +
        `exitCode=${mpvProcess.exitCode} signal=${mpvProcess.signalCode} ` +
        `ownedPidReleased=${engine._ownedPids.size === 0} tempRemoved=${!fs.existsSync(tempDir)}`
      );
    }
  }
}, 10000);

integrationTest('changes real MPV volume and replaces the controller track with null audio output', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-queue-'));
  const firstPath = path.join(tempDir, 'first.wav');
  const secondPath = path.join(tempDir, 'second.wav');
  fs.writeFileSync(firstPath, createSilentWav(30));
  fs.writeFileSync(secondPath, createSilentWav(30));
  const controller = new PlaybackController({
    defaultVolume: 20,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, { log: jest.fn() });
  let firstEngine = null;
  let firstProcess = null;
  let secondEngine = null;
  let secondProcess = null;

  try {
    await controller.play({ id: 'local-first', title: 'First local silence', localPath: firstPath, source: 'local-test' });
    firstEngine = controller._slots.A.engine;
    firstProcess = firstEngine.process;
    await waitForMpvMediaReady(firstEngine);

    const initialVolume = await firstEngine._sendCommand(['get_property', 'volume'], { waitForResponse: true });
    expect(initialVolume.data).toBe(20);
    await controller.setVolume(37);
    const changedVolume = await firstEngine._sendCommand(['get_property', 'volume'], { waitForResponse: true });
    expect(changedVolume.data).toBe(37);

    await controller.play({ id: 'local-second', title: 'Second local silence', localPath: secondPath, source: 'local-test' });
    secondEngine = controller._slots.A.engine;
    secondProcess = secondEngine.process;
    expect(secondProcess.pid).not.toBe(firstProcess.pid);
    expect(firstProcess.exitCode !== null || firstProcess.signalCode !== null).toBe(true);
    await waitForMpvMediaReady(secondEngine);
    const secondSnapshot = controller.getSnapshot();
    expect(secondSnapshot.transportState).toBe('playing');
    expect(secondSnapshot.activePlaybackId).toBe(secondSnapshot.slots.A.playbackId);
    expect(secondSnapshot.slots.A.media.title).toBe('Second local silence');
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'local-second' }));
    const inheritedVolume = await secondEngine._sendCommand(['get_property', 'volume'], { waitForResponse: true });
    expect(inheritedVolume.data).toBe(37);
  } finally {
    await controller.shutdown().catch(() => {});
    for (const [engine, mpvProcess] of [[firstEngine, firstProcess], [secondEngine, secondProcess]]) {
      if (!engine || !mpvProcess) continue;
      expect(mpvProcess.exitCode !== null || mpvProcess.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    console.info(
      `[music-bot MPV volume/replacement] processes=${[
        [firstEngine, firstProcess], [secondEngine, secondProcess]
      ].filter(([, child]) => child).map(([engine, child]) =>
        `${child.pid}:${child.exitCode ?? child.signalCode ?? 'live'}:owned=${engine._ownedPids.size}`
      ).join(',')} tempRemoved=${!fs.existsSync(tempDir)}`
    );
  }
}, 20000);

integrationTest('exits real MPV normally after an IPC quit command with null audio output', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-quit-'));
  const wavPath = path.join(tempDir, 'silence.wav');
  fs.writeFileSync(wavPath, createSilentWav(30));
  const controller = new PlaybackController({
    defaultVolume: 0,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, { log: jest.fn() });
  let engine = null;
  let mpvProcess = null;

  try {
    await controller.play({ id: 'local-quit', title: 'Local silence for IPC quit', localPath: wavPath, source: 'local-test' });
    engine = controller._slots.A.engine;
    mpvProcess = engine.process;
    await waitForMpvMediaReady(engine);

    const closed = new Promise((resolve) => mpvProcess.once('close', (code, signal) => resolve({ code, signal })));
    const response = await engine._sendCommand(['quit'], { waitForResponse: true, timeoutMs: 2000 });
    expect(response.error).toBe('success');
    let closeTimeout = null;
    let result;
    try {
      result = await Promise.race([
        closed,
        new Promise((_, reject) => {
          closeTimeout = setTimeout(() => reject(new Error('MPV did not close after IPC quit')), 3000);
        })
      ]);
    } finally {
      if (closeTimeout) clearTimeout(closeTimeout);
    }
    expect(result).toEqual(expect.objectContaining({ code: 0, signal: null }));
    expect(engine._ownedPids.size).toBe(0);
  } finally {
    await controller.shutdown().catch(() => {});
    if (mpvProcess && (mpvProcess.exitCode !== null || mpvProcess.signalCode !== null)) {
      expect(engine._ownedPids.size).toBe(0);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    if (mpvProcess) {
      console.info(
        `[music-bot MPV IPC quit] ownedPid=${mpvProcess.pid} ` +
        `exitCode=${mpvProcess.exitCode} signal=${mpvProcess.signalCode} ` +
        `ownedPidReleased=${engine._ownedPids.size === 0} tempRemoved=${!fs.existsSync(tempDir)}`
      );
    }
  }
}, 10000);

integrationTest('plays queued local tracks in order through QueueManager, PlaybackController, and real MPV', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-queue-manager-'));
  const tracks = [
    { id: 'queued-first', title: 'Queued first silence' },
    { id: 'queued-second', title: 'Queued second silence' }
  ].map((track, index) => {
    const localPath = path.join(tempDir, `${index + 1}.wav`);
    fs.writeFileSync(localPath, createSilentWav(30));
    return { ...track, localPath, url: `https://fixture.invalid/${track.id}`, source: 'local-test', duration: 30 };
  });
  const db = new Database(':memory:');
  const api = { getDatabase: () => db, log: jest.fn() };
  const queue = new QueueManager({
    queue: {
      maxLength: 10,
      maxPerUser: 10,
      maxSongDurationSeconds: 600,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  }, api);
  const controller = new PlaybackController({
    defaultVolume: 37,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, api);
  const engines = [];

  try {
    tracks.forEach((track) => expect(queue.addSong(track).success).toBe(true));
    expect(queue.getQueue().map((track) => track.id)).toEqual(['queued-first', 'queued-second']);

    for (const expectedTrack of tracks) {
      const next = queue.shiftNext();
      expect(next.id).toBe(expectedTrack.id);
      await controller.play(next);
      const engine = controller._slots.A.engine;
      const child = engine.process;
      engines.push({ engine, child });
      expect(Number.isInteger(child?.pid)).toBe(true);
      expect(engine._ownedPids.has(child.pid)).toBe(true);
      await waitForMpvMediaReady(engine);
      expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
        id: expectedTrack.id,
        title: expectedTrack.title
      }));
      const volume = await engine._sendCommand(['get_property', 'volume'], { waitForResponse: true });
      expect(volume.data).toBe(37);
    }

    expect(queue.getQueue()).toEqual([]);
    expect(queue.getCurrent().id).toBe('queued-second');
    expect(controller.getNowPlaying().id).toBe('queued-second');
    expect(engines).toHaveLength(2);
    expect(engines[1].child.pid).not.toBe(engines[0].child.pid);
    expect(engines[0].child.exitCode !== null || engines[0].child.signalCode !== null).toBe(true);
  } finally {
    await controller.shutdown().catch(() => {});
    engines.forEach(({ engine, child }) => {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    });
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    console.info(
      `[music-bot QueueManager/MPV] processes=${engines.map(({ engine, child }) =>
        `${child.pid}:${child.exitCode ?? child.signalCode ?? 'live'}:owned=${engine._ownedPids.size}`
      ).join(',')} dbClosed=${!db.open} tempRemoved=${!fs.existsSync(tempDir)}`
    );
  }
}, 30000);

integrationTest('plays queued local tracks through the real Music Bot queue handler and MPV', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-plugin-queue-'));
  const tracks = [
    { id: 'plugin-queued-first', title: 'Plugin queued first silence' },
    { id: 'plugin-queued-second', title: 'Plugin queued second silence' }
  ].map((track, index) => {
    const localPath = path.join(tempDir, `${index + 1}.wav`);
    fs.writeFileSync(localPath, createSilentWav(30));
    return { ...track, localPath, url: `https://fixture.invalid/${track.id}`, source: 'local-test', duration: 30 };
  });
  const db = new Database(':memory:');
  const api = {
    getDatabase: () => db,
    getSocketIO: () => ({ emit: jest.fn() }),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const queue = new QueueManager({
    queue: {
      maxLength: 10,
      maxPerUser: 10,
      maxSongDurationSeconds: 600,
      duplicateDetection: 'off',
      allowDuplicates: true,
      cooldownPerUserSeconds: 0
    }
  }, api);
  const controller = new PlaybackController({
    defaultVolume: 37,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, api);
  plugin.queueManager = queue;
  plugin.playbackEngine = controller;
  plugin._emitQueue = jest.fn();
  plugin._schedulePreCache = jest.fn();
  const engines = [];

  try {
    tracks.forEach((track) => expect(queue.addSong(track).success).toBe(true));

    for (const expectedTrack of tracks) {
      const result = await plugin._playNextFromQueueInternal({ isCurrent: () => true });
      expect(result).toEqual(expect.objectContaining({ success: true, song: expect.objectContaining({ id: expectedTrack.id }) }));
      const engine = controller._slots.A.engine;
      const child = engine.process;
      engines.push({ engine, child });
      expect(Number.isInteger(child?.pid)).toBe(true);
      expect(engine._ownedPids.has(child.pid)).toBe(true);
      await waitForMpvMediaReady(engine);
      expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
        id: expectedTrack.id,
        title: expectedTrack.title
      }));
    }

    expect(queue.getQueue()).toEqual([]);
    expect(queue.getCurrent().id).toBe('plugin-queued-second');
    expect(controller.getNowPlaying().id).toBe('plugin-queued-second');
    expect(engines).toHaveLength(2);
    expect(engines[1].child.pid).not.toBe(engines[0].child.pid);
    expect(engines[0].child.exitCode !== null || engines[0].child.signalCode !== null).toBe(true);
  } finally {
    await controller.shutdown().catch(() => {});
    engines.forEach(({ engine, child }) => {
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(engine._ownedPids.size).toBe(0);
    });
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    expect(fs.existsSync(tempDir)).toBe(false);
    console.info(
      `[music-bot plugin queue/MPV] processes=${engines.map(({ engine, child }) =>
        `${child.pid}:${child.exitCode ?? child.signalCode ?? 'live'}:owned=${engine._ownedPids.size}`
      ).join(',')} dbClosed=${!db.open} tempRemoved=${!fs.existsSync(tempDir)}`
    );
  }
}, 30000);
