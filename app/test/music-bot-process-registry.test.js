jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const {
  SOUND_BOT_IPC_PREFIX,
  SOUND_BOT_PROCESS_MARKER,
  SoundbotProcessRegistry,
  isMarkedSoundbotMpv
} = require('../plugins/music-bot/lib/soundbot-process-registry');

function markedProcess(pid = 4101, overrides = {}) {
  return {
    pid,
    name: process.platform === 'win32' ? 'mpv.exe' : 'mpv',
    commandLine: [
      'mpv',
      '--idle=yes',
      `--title=${SOUND_BOT_PROCESS_MARKER}`,
      `--input-ipc-server=${process.platform === 'win32' ? '\\\\.\\pipe\\' : '/tmp/'}${SOUND_BOT_IPC_PREFIX}abc`
    ].join(' '),
    ...overrides
  };
}

describe('Music Bot marked MPV process registry', () => {
  afterEach(() => {
    jest.useRealTimers();
    spawn.mockReset();
  });

  test('puts both Soundbot markers on every spawned MPV and tracks its PID', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 4501,
      exitCode: null,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn()
    });
    spawn.mockReturnValue(child);
    const processRegistry = {
      register: jest.fn(),
      unregister: jest.fn()
    };
    const engine = new PlaybackEngine({
      defaultVolume: 50,
      mpvPath: 'mpv'
    }, { log: jest.fn() }, { processRegistry });
    engine._connectSocket = jest.fn(async () => ({ destroyed: false }));

    await engine._startProcess();

    const [, args] = spawn.mock.calls[0];
    expect(args).toContain(`--title=${SOUND_BOT_PROCESS_MARKER}`);
    expect(args).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`^--input-ipc-server=.*${SOUND_BOT_IPC_PREFIX}`))
    ]));
    expect(processRegistry.register).toHaveBeenCalledWith(4501);

    child.exitCode = 0;
    child.emit('close', 0);
    expect(processRegistry.unregister).toHaveBeenCalledWith(4501);
  });

  test('requires an exact MPV executable plus both Soundbot markers', () => {
    expect(isMarkedSoundbotMpv(markedProcess())).toBe(true);
    expect(isMarkedSoundbotMpv(markedProcess(4102, {
      name: 'node.exe'
    }))).toBe(false);
    expect(isMarkedSoundbotMpv(markedProcess(4103, {
      commandLine: `mpv --title=${SOUND_BOT_PROCESS_MARKER}`
    }))).toBe(false);
    expect(isMarkedSoundbotMpv(markedProcess(4104, {
      commandLine: `mpv --input-ipc-server=/tmp/${SOUND_BOT_IPC_PREFIX}abc`
    }))).toBe(false);
    expect(isMarkedSoundbotMpv(markedProcess(4105, {
      commandLine: `mpv --title=${SOUND_BOT_PROCESS_MARKER}-foreign --input-ipc-server=/tmp/${SOUND_BOT_IPC_PREFIX}abc`
    }))).toBe(false);
    expect(isMarkedSoundbotMpv(markedProcess(4106, {
      commandLine: `mpv --title=${SOUND_BOT_PROCESS_MARKER} --input-ipc-server=/tmp/not-${SOUND_BOT_IPC_PREFIX}abc`
    }))).toBe(false);
  });

  test('kills every marked orphan and never touches foreign MPV processes', async () => {
    const marked = markedProcess(4201);
    const foreign = {
      pid: 4202,
      name: process.platform === 'win32' ? 'mpv.exe' : 'mpv',
      commandLine: 'mpv --idle=yes --input-ipc-server=/tmp/private-player.sock'
    };
    let processes = [marked, foreign];
    const terminateProcess = jest.fn(async (entry) => {
      processes = processes.filter((candidate) => candidate.pid !== entry.pid);
      return true;
    });
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      listProcesses: async () => processes,
      terminateProcess
    });

    const result = await registry.cleanupMarked({ timeoutMs: 2000 });

    expect(terminateProcess).toHaveBeenCalledTimes(1);
    expect(terminateProcess).toHaveBeenCalledWith(
      expect.objectContaining({ pid: 4201 }),
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    );
    expect(result).toEqual(expect.objectContaining({
      found: [4201],
      killed: [4201],
      remaining: []
    }));
    expect(processes).toEqual([foreign]);
  });

  test('never reports a rejected process termination as a successful kill', async () => {
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      listProcesses: async () => [markedProcess(4251)],
      terminateProcess: async () => {
        throw new Error('access denied');
      }
    });

    await expect(registry.cleanupMarked()).resolves.toEqual(expect.objectContaining({
      found: [4251],
      killed: [],
      remaining: [4251]
    }));
  });

  test('caps a hung cleanup at two seconds', async () => {
    jest.useFakeTimers();
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      listProcesses: async () => [markedProcess(4301)],
      terminateProcess: () => new Promise(() => {})
    });
    let settled = false;

    const cleanup = registry.cleanupMarked({ timeoutMs: 10000 }).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1999);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(cleanup).resolves.toEqual(expect.objectContaining({
      found: [4301],
      killed: [],
      remaining: [4301]
    }));
  });

  test('tracks only positive child PIDs and exposes marked process discovery', async () => {
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      listProcesses: async () => [markedProcess(4401)]
    });

    expect(registry.register(4401)).toBe(true);
    expect(registry.register(0)).toBe(false);
    expect(registry.register(-2)).toBe(false);
    await expect(registry.findMarkedProcesses()).resolves.toEqual([
      expect.objectContaining({ pid: 4401 })
    ]);
    expect(registry.unregister(4401)).toBe(true);
  });

  test('uses a static, non-interactive Windows scanner command with valid statement separation', async () => {
    const scanner = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn()
    });
    const spawnScanner = jest.fn(() => scanner);
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      platform: 'win32',
      spawn: spawnScanner
    });
    process.nextTick(() => {
      scanner.stdout.emit('data', '[]');
      scanner.emit('close', 0);
    });

    await expect(registry.findMarkedProcesses()).resolves.toEqual([]);

    expect(spawnScanner).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive']),
      expect.objectContaining({ shell: false, windowsHide: true })
    );
    const commandArgs = spawnScanner.mock.calls[0][1];
    const script = commandArgs[commandArgs.indexOf('-Command') + 1];
    expect(script).toMatch(/^\$ErrorActionPreference='Stop'; Get-CimInstance/);
    expect(script).not.toContain("'Stop' | Get-CimInstance");
  });

  test('preserves a five-second budget for slow Windows MPV scans', async () => {
    const observedTimeouts = [];
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      platform: 'win32',
      listProcesses: async ({ timeoutMs }) => {
        observedTimeouts.push(timeoutMs);
        return [];
      }
    });

    await expect(registry.findMarkedProcesses({ timeoutMs: 5000 })).resolves.toEqual([]);

    expect(observedTimeouts).toEqual([5000]);
  });

  test('lets the Windows scanner child run for the full five-second budget', async () => {
    jest.useFakeTimers();
    const scanner = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn()
    });
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      platform: 'win32',
      spawn: jest.fn(() => scanner)
    });

    const pending = registry.findMarkedProcesses({ timeoutMs: 5000 });
    const failure = expect(pending).rejects.toThrow(/timed out/);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(2001);
    expect(scanner.kill).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2999);
    await failure;
    expect(scanner.kill).toHaveBeenCalledTimes(1);
  });

  test('reload invalidates the process registry module cache', () => {
    const mainSource = fs.readFileSync(
      path.join(__dirname, '../plugins/music-bot/main.js'),
      'utf8'
    );

    expect(mainSource).toContain("'./lib/soundbot-process-registry'");
  });

  test.each([
    ['win32', 'powershell.exe'],
    ['linux', 'ps']
  ])('fails closed when the %s process scanner exits non-zero', async (platform, executable) => {
    const scanner = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: jest.fn()
    });
    const registry = new SoundbotProcessRegistry({ log: jest.fn() }, {
      platform,
      spawn: jest.fn(() => scanner)
    });
    process.nextTick(() => {
      scanner.stderr.emit('data', 'scanner unavailable\nsecond line');
      scanner.emit('close', 7);
    });

    await expect(registry.findMarkedProcesses()).rejects.toMatchObject({
      code: 'SOUNDBOT_PROCESS_SCAN_FAILED',
      message: expect.stringContaining(`${executable} process scan failed with exit code 7`)
    });
  });
});

describe('Music Bot orphan reconciliation', () => {
  function createController(processRegistry) {
    return new PlaybackController({ defaultVolume: 50 }, { log: jest.fn() }, {
      processRegistry,
      engineFactory: () => {
        throw new Error('Reconciliation must not create a playback slot');
      }
    });
  }

  function attachOwnedSlot(controller, {
    pid,
    state = 'idle',
    nowPlaying = null,
    shutdown = async () => {},
    engine: suppliedEngine = null
  }) {
    const engine = suppliedEngine || Object.assign(new EventEmitter(), {
      getDiagnostics: () => ({
        pid,
        state,
        ipc: { connected: true, lastLatencyMs: 1 },
        media: { title: nowPlaying?.title || null, basename: null }
      }),
      getState: () => state,
      getNowPlaying: () => nowPlaying,
      shutdown
    });
    controller._slots.A = {
      name: 'A',
      engine,
      generation: 1,
      transitionGeneration: 1,
      kind: 'playback',
      playbackId: nowPlaying?.id || null,
      sourceTrackId: nowPlaying?.id || null,
      state,
      retired: false,
      retirePromise: null,
      crashed: false,
      lastError: null,
      startedPlaybackIds: new Set(),
      terminalPlaybackIds: new Set(),
      suppressedPlaybackIds: new Set(),
      suppressedPlaybackId: null
    };
    controller.activeSlot = 'A';
    return engine;
  }

  test('an idle controller kills a marked orphan and enters Safety Lock', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [markedProcess(4601)]),
      cleanupMarked: jest.fn(async () => ({ found: [4601], killed: [4601], remaining: [] }))
    };
    const controller = createController(processRegistry);
    const safetyChanged = jest.fn();
    controller.on('safety-lock-changed', safetyChanged);

    const result = await controller.reconcileProcesses();

    expect(result).toEqual(expect.objectContaining({
      detected: [4601],
      locked: true,
      remaining: []
    }));
    expect(processRegistry.findMarkedProcesses).toHaveBeenCalledWith({ timeoutMs: 5000 });
    expect(controller.isSafetyLocked()).toBe(true);
    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });
    expect(safetyChanged).toHaveBeenCalledWith(expect.objectContaining({
      locked: true,
      reason: 'orphan-player-detected'
    }));
  });

  test('a locked controller re-cleans marked players without releasing the lock', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [markedProcess(4701)]),
      cleanupMarked: jest.fn(async () => ({ found: [4701], killed: [4701], remaining: [] }))
    };
    const controller = createController(processRegistry);
    await controller.emergencyStop('manual-lock');
    processRegistry.cleanupMarked.mockClear();

    const result = await controller.reconcileProcesses();

    expect(result.locked).toBe(true);
    expect(controller.isSafetyLocked()).toBe(true);
    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });
  });

  test('clears stale remaining-process state after a later scan finds no marked MPV', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => []),
      cleanupMarked: jest.fn(async () => ({
        found: [4702],
        killed: [],
        remaining: [4702]
      }))
    };
    const controller = createController(processRegistry);
    await controller.emergencyStop('manual-lock');
    expect(controller.getLastProcessCleanup().remaining).toEqual([4702]);

    const result = await controller.reconcileProcesses();

    expect(result).toEqual(expect.objectContaining({
      detected: [],
      remaining: [],
      locked: true
    }));
    expect(controller.getLastProcessCleanup()).toEqual({
      found: [],
      killed: [],
      remaining: []
    });
  });

  test('reports a scanner failure in health diagnostics and clears it after recovery', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn()
        .mockRejectedValueOnce(new Error('powershell.exe timed out'))
        .mockResolvedValueOnce([]),
      cleanupMarked: jest.fn()
    };
    const controller = createController(processRegistry);

    await expect(controller.reconcileProcesses()).resolves.toEqual(expect.objectContaining({
      error: 'powershell.exe timed out'
    }));
    expect(controller.getSnapshot().lastError).toEqual(expect.objectContaining({
      message: 'powershell.exe timed out',
      source: 'process-reconciliation'
    }));

    await expect(controller.reconcileProcesses()).resolves.toEqual(expect.objectContaining({
      detected: [],
      remaining: []
    }));
    expect(controller.getSnapshot().lastError).toBeNull();
  });

  test('an owned MPV waiting idle without media is not treated as an orphan', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [{ ...markedProcess(4751), known: true }]),
      cleanupMarked: jest.fn()
    };
    const controller = createController(processRegistry);
    attachOwnedSlot(controller, { pid: 4751, state: 'idle', nowPlaying: null });

    const result = await controller.reconcileProcesses();

    expect(result).toEqual(expect.objectContaining({ locked: false, detected: [] }));
    expect(controller.isSafetyLocked()).toBe(false);
    expect(processRegistry.cleanupMarked).not.toHaveBeenCalled();
  });

  test('an owned MPV still playing while the controller says idle is killed and locks safety', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [{ ...markedProcess(4761), known: true }]),
      cleanupMarked: jest.fn(async () => ({ found: [4761], killed: [4761], remaining: [] }))
    };
    const controller = createController(processRegistry);
    controller.transportState = 'idle';
    attachOwnedSlot(controller, {
      pid: 4761,
      state: 'playing',
      nowPlaying: { id: 'stale-track', title: 'Stale track' }
    });

    const result = await controller.reconcileProcesses();

    expect(result).toEqual(expect.objectContaining({ locked: true, detected: [4761] }));
    expect(controller.isSafetyLocked()).toBe(true);
    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });
  });

  test('a probed media title is cleared at EOF and cannot false-lock an idle owned MPV', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [{ ...markedProcess(4765), known: true }]),
      cleanupMarked: jest.fn()
    };
    const engine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    engine.process = { pid: 4765, exitCode: null };
    engine._ownedPids.add(4765);
    engine.socket = { destroyed: false };
    engine.nowPlaying = { id: 'ended-track', title: 'Ended track' };
    engine.state = 'playing';
    engine._sendCommand = jest.fn(async ([, property]) => ({
      data: property === 'media-title' ? 'Previously probed title' : 'C:\\music\\ended.mp3'
    }));
    await engine.probe();
    expect(engine.getDiagnostics().media.title).toBe('Previously probed title');

    engine._handleMessage(JSON.stringify({ event: 'end-file', reason: 'eof' }));

    expect(engine.getDiagnostics().media).toEqual({ title: null, basename: null });
    const controller = createController(processRegistry);
    attachOwnedSlot(controller, {
      pid: 4765,
      state: 'idle',
      nowPlaying: null,
      engine
    });
    await expect(controller.reconcileProcesses()).resolves.toEqual(expect.objectContaining({
      locked: false,
      detected: []
    }));
    expect(processRegistry.cleanupMarked).not.toHaveBeenCalled();
  });

  test('one controller probe detects actual MPV media before reconciling an idle slot', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [{ ...markedProcess(4766), known: true }]),
      cleanupMarked: jest.fn(async () => ({ found: [4766], killed: [4766], remaining: [] }))
    };
    let actualTitle = null;
    const engine = Object.assign(new EventEmitter(), {
      getDiagnostics: () => ({
        pid: 4766,
        state: 'idle',
        ipc: { connected: true, lastLatencyMs: 1 },
        media: { title: actualTitle, basename: null }
      }),
      getState: () => 'idle',
      getNowPlaying: () => null,
      probe: jest.fn(async () => { actualTitle = 'Actually playing in MPV'; }),
      shutdown: jest.fn(async () => {})
    });
    const controller = createController(processRegistry);
    attachOwnedSlot(controller, {
      pid: 4766,
      state: 'idle',
      nowPlaying: null,
      engine
    });

    await controller.probe();

    expect(engine.probe).toHaveBeenCalledTimes(1);
    expect(controller.isSafetyLocked()).toBe(true);
    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });
  });

  test('starts marked cleanup concurrently with slot shutdown to keep the two-second bound', async () => {
    let releaseShutdown;
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => []),
      cleanupMarked: jest.fn(async () => ({ found: [], killed: [], remaining: [] }))
    };
    const controller = createController(processRegistry);
    attachOwnedSlot(controller, {
      pid: 4771,
      state: 'playing',
      nowPlaying: { id: 'active-track', title: 'Active track' },
      shutdown: () => new Promise((resolve) => { releaseShutdown = resolve; })
    });

    const stop = controller.emergencyStop();
    await Promise.resolve();
    await Promise.resolve();
    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });

    releaseShutdown();
    await stop;
  });

  test.each([
    ['emergency stop', (controller) => controller.emergencyStop()],
    ['player reset', (controller) => controller.resetPlayer()],
    ['shutdown', (controller) => controller.shutdown()]
  ])('%s also removes marked orphan processes', async (_label, invoke) => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => []),
      cleanupMarked: jest.fn(async () => ({ found: [4801], killed: [4801], remaining: [] }))
    };
    const controller = createController(processRegistry);

    await invoke(controller);

    expect(processRegistry.cleanupMarked).toHaveBeenCalledWith({ timeoutMs: 2000 });
  });

  test('does not scan or kill marked processes while controller playback is active', async () => {
    const processRegistry = {
      findMarkedProcesses: jest.fn(async () => [markedProcess(4901)]),
      cleanupMarked: jest.fn()
    };
    const controller = createController(processRegistry);
    controller.transportState = 'playing';

    const result = await controller.reconcileProcesses();

    expect(result).toEqual(expect.objectContaining({ locked: false, skipped: 'active-playback' }));
    expect(processRegistry.findMarkedProcesses).not.toHaveBeenCalled();
    expect(processRegistry.cleanupMarked).not.toHaveBeenCalled();
  });
});
