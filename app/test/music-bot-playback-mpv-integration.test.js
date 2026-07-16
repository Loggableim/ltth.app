const fs = require('fs');
const os = require('os');
const path = require('path');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = fs.existsSync(MPV_PATH) ? test : test.skip;

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

  try {
    await controller.play({
      id: 'local-silence',
      title: 'Local silence',
      localPath: wavPath,
      source: 'local-test'
    });
    const engine = controller._slots.A.engine;
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}, 20000);
