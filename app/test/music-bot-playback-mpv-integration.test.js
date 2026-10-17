const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');

const CHOCOLATEY_MPV_PATH = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
const MPV_PROBE_TIMEOUT_MS = 5000;

function probeMpv(candidate) {
  const result = spawnSync(candidate, ['--version'], {
    encoding: 'utf8',
    timeout: MPV_PROBE_TIMEOUT_MS,
    windowsHide: true
  });
  if (result.error || result.status !== 0) return null;
  const version = String(result.stdout || '') + String(result.stderr || '');
  return version.trim() || null;
}

function findOnPath(command, { pathValue = process.env.PATH || '', fileExists = fs.existsSync } = {}) {
  const extensions = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '']
    : [''];
  for (const dir of String(pathValue).split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, command + extension);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

function resolveMpv({
  configuredPath = String(process.env.LTTH_TEST_MPV_PATH || '').trim(),
  chocolateyPath = CHOCOLATEY_MPV_PATH,
  fileExists = fs.existsSync,
  resolveOnPath = (command) => findOnPath(command, { fileExists }),
  probe = probeMpv
} = {}) {
  const candidates = [];
  if (configuredPath && fileExists(configuredPath)) {
    candidates.push(configuredPath);
  }
  if (fileExists(chocolateyPath)) {
    candidates.push(chocolateyPath);
  }
  const pathCandidate = resolveOnPath('mpv');
  if (pathCandidate && !candidates.includes(pathCandidate)) {
    candidates.push(pathCandidate);
  }
  for (const candidate of candidates) {
    const version = probe(candidate);
    if (version) return { path: candidate, version };
  }
  return null;
}

function hasMpvCandidate({
  configuredPath = String(process.env.LTTH_TEST_MPV_PATH || '').trim(),
  chocolateyPath = CHOCOLATEY_MPV_PATH,
  fileExists = fs.existsSync,
  resolveOnPath = (command) => findOnPath(command, { fileExists })
} = {}) {
  if (configuredPath && fileExists(configuredPath)) return true;
  if (fileExists(chocolateyPath)) return true;
  return Boolean(resolveOnPath('mpv'));
}

// Resolve the real MPV lazily: requiring this file must never spawn a probe.
// The cheap candidate check below decides the collection-time skip, while the
// expensive `--version` spawn only happens when a test actually runs.
let mpvResolution;
function getMpv() {
  if (mpvResolution === undefined) {
    mpvResolution = hasMpvCandidate() ? resolveMpv() : null;
  }
  return mpvResolution;
}

const mpvCandidateAvailable = hasMpvCandidate();
const integrationTest = mpvCandidateAvailable ? test : test.skip;

function integrationName(name, mpvFound = mpvCandidateAvailable) {
  return mpvFound ? name : 'skipped: no mpv found - ' + name;
}

test('MPV resolution rejects failed candidates and continues in the configured order', () => {
  const probedCandidates = [];
  const resolved = resolveMpv({
    configuredPath: 'configured-mpv',
    chocolateyPath: 'chocolatey-mpv',
    fileExists: () => true,
    resolveOnPath: () => 'mpv',
    probe: (candidate) => {
      probedCandidates.push(candidate);
      return candidate === 'mpv' ? 'mpv v0.41.0' : null;
    }
  });

  expect(probedCandidates).toEqual(['configured-mpv', 'chocolatey-mpv', 'mpv']);
  expect(resolved).toEqual({ path: 'mpv', version: 'mpv v0.41.0' });
});

test('MPV resolution returns no candidate and names the skip when all version probes fail', () => {
  const resolved = resolveMpv({
    configuredPath: 'configured-mpv',
    chocolateyPath: 'chocolatey-mpv',
    fileExists: () => true,
    resolveOnPath: () => 'mpv',
    probe: () => null
  });

  expect(resolved).toBeNull();
  expect(integrationName('starts real MPV', false)).toBe('skipped: no mpv found - starts real MPV');
});

test('MPV resolution does not spawn a probe when no candidate exists', () => {
  const probedCandidates = [];
  const resolved = resolveMpv({
    configuredPath: 'configured-mpv',
    chocolateyPath: 'chocolatey-mpv',
    fileExists: () => false,
    resolveOnPath: () => null,
    probe: (candidate) => {
      probedCandidates.push(candidate);
      return null;
    }
  });

  expect(probedCandidates).toEqual([]);
  expect(resolved).toBeNull();
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH' || error.code === 'EINVAL') return false;
    throw error;
  }
}

async function waitForProcessExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return;
    await delay(25);
  }
  throw new Error('Owned MPV process ' + pid + ' did not exit');
}

async function verifyExitedPids(pids, label) {
  const uniquePids = [...new Set(pids.filter(Number.isInteger))];
  await Promise.all(uniquePids.map((pid) => waitForProcessExit(pid)));
  uniquePids.forEach((pid) => expect(isProcessRunning(pid)).toBe(false));
  console.info('[music-bot MPV ' + label + '] pids=' + uniquePids.join(',') + ' exited=true');
}

function isIpcEndpointAvailable(ipcPath, timeoutMs = 500, connect = net.createConnection) {
  return new Promise((resolve) => {
    const socket = connect(ipcPath);
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(available);
    };
    // A connect that neither succeeds nor errors within the timeout means the
    // endpoint is not usable. Reporting it as "available" made the removal
    // wait retry for its full budget on Windows before failing.
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

test('IPC availability probe reports an endpoint as usable when it connects', async () => {
  const socket = new EventEmitter();
  socket.destroy = jest.fn();

  const pending = isIpcEndpointAvailable('fake-ipc', 500, () => socket);
  socket.emit('connect');

  await expect(pending).resolves.toBe(true);
  expect(socket.destroy).toHaveBeenCalled();
});

test('IPC availability probe reports an endpoint as unusable when connect times out', async () => {
  const socket = new EventEmitter();
  socket.destroy = jest.fn();

  const available = await isIpcEndpointAvailable('fake-ipc', 20, () => socket);

  expect(available).toBe(false);
  expect(socket.destroy).toHaveBeenCalled();
});

async function waitForIpcEndpointRemoval(ipcPath, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const removed = process.platform === 'win32'
      ? !await isIpcEndpointAvailable(ipcPath)
      : !fs.existsSync(ipcPath);
    if (removed) return;
    await delay(25);
  }
  throw new Error('Owned MPV IPC endpoint still exists after shutdown');
}

function createController({ crossfadeDuration = 0, defaultVolume = 0 } = {}) {
  return new PlaybackController({
    defaultVolume,
    crossfadeDuration,
    mpvPath: getMpv()?.path,
    audioOutputDriver: 'null',
    normalization: { enabled: false }
  }, { log: jest.fn() });
}

function createTrack(tempDir, id, title, index) {
  const localPath = path.join(tempDir, index + '.wav');
  fs.writeFileSync(localPath, createSilentWav(30));
  return { id, title, localPath, source: 'local-test' };
}

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

integrationTest(integrationName('plays, heartbeats, and fully cleans up real MPV with null audio output'), async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-'));
  const wavPath = path.join(tempDir, 'silence.wav');
  fs.writeFileSync(wavPath, createSilentWav());
  const api = { log: jest.fn() };
  const controller = createController();
  let mpvProcess = null;
  let ipcPath = null;

  try {
    await controller.play({
      id: 'local-silence',
      title: 'Local silence',
      localPath: wavPath,
      source: 'local-test'
    });
    const engine = controller._slots.A.engine;
    mpvProcess = engine.process;
    ipcPath = engine.ipcPath;
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
    try {
      await controller.shutdown().catch(() => {});
      if (mpvProcess?.pid) await verifyExitedPids([mpvProcess.pid], 'playback');
      if (ipcPath) await waitForIpcEndpointRemoval(ipcPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    }
  }
}, 20000);

integrationTest(integrationName('sets real MPV volume to zero and a nonzero value'), async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-volume-'));
  const controller = createController({ defaultVolume: 37 });
  let mpvPid = null;

  try {
    await controller.play(createTrack(tempDir, 'volume-track', 'Volume test', 1));
    const engine = controller._slots.A.engine;
    mpvPid = engine.process?.pid;
    await waitForMpvMediaReady(engine);

    for (const expectedVolume of [0, 37]) {
      await controller.setVolume(expectedVolume);
      const response = await engine._sendCommand(['get_property', 'volume'], {
        waitForResponse: true
      });
      expect(Math.abs(Number(response.data) - expectedVolume)).toBeLessThanOrEqual(1);
    }
  } finally {
    try {
      await controller.shutdown().catch(() => {});
      if (mpvPid) await verifyExitedPids([mpvPid], 'volume');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    }
  }
}, 10000);

integrationTest(integrationName('plays two real MPV tracks in order with one active process'), async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-order-'));
  const controller = createController({ crossfadeDuration: 0 });
  const startedTracks = [];
  const observedPids = [];
  controller.on('track-start', (track) => startedTracks.push(track.id));

  try {
    await controller.play(createTrack(tempDir, 'track-a', 'Track A', 1));
    const firstEngine = controller._slots.A.engine;
    const firstPid = firstEngine.process.pid;
    observedPids.push(firstPid);
    const firstPlaybackId = controller.getSnapshot().activePlaybackId;
    await waitForMpvMediaReady(firstEngine);

    await controller.play(createTrack(tempDir, 'track-b', 'Track B', 2));
    const secondEngine = controller._slots.A.engine;
    const secondPid = secondEngine.process.pid;
    observedPids.push(secondPid);
    const secondPlaybackId = controller.getSnapshot().activePlaybackId;
    await waitForMpvMediaReady(secondEngine);

    expect(startedTracks).toEqual(['track-a', 'track-b']);
    expect(secondPlaybackId).not.toBe(firstPlaybackId);
    expect(secondPid).not.toBe(firstPid);
    expect(isProcessRunning(firstPid)).toBe(false);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({
      id: 'track-b',
      title: 'Track B'
    }));
    expect(Object.values(controller._slots).filter((slot) => slot?.engine?.process)).toHaveLength(1);
  } finally {
    try {
      await controller.shutdown().catch(() => {});
      await verifyExitedPids(observedPids, 'track order');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    }
  }
}, 10000);

integrationTest(integrationName('crossfades between two real MPV processes and retires the outgoing PID'), async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-crossfade-'));
  const controller = createController({ crossfadeDuration: 300 });
  const startedTracks = [];
  const observedPids = [];
  controller.on('track-start', (track) => startedTracks.push(track.id));

  try {
    await controller.play(createTrack(tempDir, 'crossfade-a', 'Crossfade A', 1));
    const outgoingEngine = controller._slots.A.engine;
    const outgoingChild = outgoingEngine.process;
    observedPids.push(outgoingChild.pid);
    await waitForMpvMediaReady(outgoingEngine);

    await controller.play(createTrack(tempDir, 'crossfade-b', 'Crossfade B', 2));
    const incomingSlot = Object.values(controller._slots).find((slot) => slot?.playbackId);
    const incomingEngine = incomingSlot.engine;
    const incomingChild = incomingEngine.process;
    observedPids.push(incomingChild.pid);

    await waitForProcessExit(outgoingChild.pid);
    await waitForMpvMediaReady(incomingEngine);
    expect(startedTracks).toEqual(['crossfade-a', 'crossfade-b']);
    expect(new Set(observedPids).size).toBe(2);
    expect(controller.getNowPlaying()).toEqual(expect.objectContaining({ id: 'crossfade-b' }));
    expect(Object.values(controller._slots).filter((slot) => slot?.engine?.process)).toHaveLength(1);
    expect(outgoingEngine._ownedPids.size).toBe(0);
    expect(isProcessRunning(outgoingChild.pid)).toBe(false);
  } finally {
    try {
      await controller.shutdown().catch(() => {});
      await verifyExitedPids(observedPids, 'crossfade');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    }
  }
}, 15000);

integrationTest(integrationName('shutdown destroys its real MPV process and IPC endpoint'), async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-mpv-destroy-'));
  const controller = createController();
  let engine = null;
  let child = null;
  let ipcPath = null;

  try {
    await controller.play(createTrack(tempDir, 'destroy-track', 'Destroy test', 1));
    engine = controller._slots.A.engine;
    child = engine.process;
    ipcPath = engine.ipcPath;
    expect(Number.isInteger(child?.pid)).toBe(true);
    expect(engine._ownedPids.has(child.pid)).toBe(true);
    await waitForMpvMediaReady(engine);

    await controller.shutdown();
    await waitForProcessExit(child.pid);
    await waitForIpcEndpointRemoval(ipcPath);

    expect(engine.process).toBeNull();
    expect(engine.getDiagnostics().pid).toBeNull();
    expect(engine._ownedPids.size).toBe(0);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(isProcessRunning(child.pid)).toBe(false);
  } finally {
    try {
      await controller.shutdown().catch(() => {});
      if (child?.pid) await verifyExitedPids([child.pid], 'destroy');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    }
  }
}, 10000);

afterAll(() => {
  const resolved = getMpv();
  if (resolved?.version) {
    console.info('[music-bot MPV integration] ' + resolved.version.split(/\r?\n/)[0] + ' on ' + process.platform + ' ' + os.release());
  }
});
