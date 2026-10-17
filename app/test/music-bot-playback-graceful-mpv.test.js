'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');

const MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const integrationTest = process.env.LTTH_RUN_MUSIC_BOT_NULL_MPV === '1'
  && process.platform === 'win32'
  && fs.existsSync(MPV_PATH)
  ? test
  : test.skip;

function createSilentWav(durationSeconds = 10, sampleRate = 8000) {
  const sampleCount = durationSeconds * sampleRate;
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
  return wav;
}

async function waitForMediaReady(engine, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await engine._sendCommand(['get_property', 'idle-active'], {
        waitForResponse: true,
        timeoutMs: 500
      });
      if (result?.data === false) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`MPV did not load local silent fixture${lastError ? `: ${lastError.message}` : ''}`);
}

function createController(processRegistry) {
  return new PlaybackController({
    defaultVolume: 0,
    crossfadeDuration: 0,
    mpvPath: MPV_PATH,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, { log: jest.fn() }, { processRegistry });
}

function createNonScanningProcessRegistry() {
  return {
    register: jest.fn(),
    unregister: jest.fn(),
    findMarkedProcesses: jest.fn(async () => []),
    cleanupMarked: jest.fn(async () => ({ found: [], killed: [], remaining: [] }))
  };
}

async function playFixture(controller, localPath, id) {
  await controller.play({ id, title: `Silent local fixture ${id}`, localPath, source: 'local-test' });
  const slot = controller._slots.A;
  const engine = slot.engine;
  const child = engine.process;
  expect(Number.isInteger(child?.pid)).toBe(true);
  expect(engine._ownedPids.has(child.pid)).toBe(true);
  await waitForMediaReady(engine);
  return { engine, child };
}

function expectGracefulClose(engine, child) {
  expect(child.exitCode).toBe(0);
  expect(child.signalCode).toBeNull();
  expect(engine._ownedPids.has(child.pid)).toBe(false);
  expect(engine.process).toBeNull();
}

integrationTest('controller stop exits its owned MPV through IPC quit with code zero', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-mpv-graceful-stop-'));
  const wavPath = path.join(tempDir, 'silent.wav');
  fs.writeFileSync(wavPath, createSilentWav());
  const processRegistry = createNonScanningProcessRegistry();
  const controller = createController(processRegistry);
  let owned = null;

  try {
    owned = await playFixture(controller, wavPath, 'normal-stop');
    const ipcPath = owned.engine.ipcPath;

    await controller.stop();

    expectGracefulClose(owned.engine, owned.child);
    expect(controller.getSnapshot().transportState).toBe('idle');
    expect(fs.existsSync(ipcPath)).toBe(false);
    expect(processRegistry.findMarkedProcesses).not.toHaveBeenCalled();
    console.info(`[isolated mpv stop] pid=${owned.child.pid} exit=${owned.child.exitCode} owned=0 ipcRemoved=${!fs.existsSync(ipcPath)}`);
  } finally {
    await controller.shutdown({ reconcileOrphans: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  expect(processRegistry.findMarkedProcesses).not.toHaveBeenCalled();
  expect(processRegistry.cleanupMarked).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(tempDir)).toBe(false);
});

integrationTest('track replacement and controller shutdown close each owned MPV gracefully', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-mpv-graceful-replace-'));
  const firstPath = path.join(tempDir, 'first.wav');
  const secondPath = path.join(tempDir, 'second.wav');
  fs.writeFileSync(firstPath, createSilentWav());
  fs.writeFileSync(secondPath, createSilentWav());
  const processRegistry = createNonScanningProcessRegistry();
  const controller = createController(processRegistry);
  let first = null;
  let second = null;

  try {
    first = await playFixture(controller, firstPath, 'replace-first');
    await controller.play({ id: 'replace-second', title: 'Silent local fixture second', localPath: secondPath, source: 'local-test' });
    expectGracefulClose(first.engine, first.child);

    const secondSlot = controller._slots.A;
    second = { engine: secondSlot.engine, child: secondSlot.engine.process };
    expect(Number.isInteger(second.child?.pid)).toBe(true);
    expect(second.engine._ownedPids.has(second.child.pid)).toBe(true);
    await waitForMediaReady(second.engine);

    await controller.shutdown({ reconcileOrphans: true });

    expectGracefulClose(second.engine, second.child);
    expect(processRegistry.findMarkedProcesses).not.toHaveBeenCalled();
    expect(processRegistry.cleanupMarked).toHaveBeenCalledTimes(1);
    console.info(`[isolated mpv replace/shutdown] pids=${first.child.pid}:${first.child.exitCode},${second.child.pid}:${second.child.exitCode} owned=0`);
  } finally {
    await controller.shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  expect(fs.existsSync(tempDir)).toBe(false);
});
