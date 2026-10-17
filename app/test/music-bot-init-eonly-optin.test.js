'use strict';

jest.mock('../plugins/music-bot/lib/music-resolver', () => {
  const runner = {
    run: jest.fn(() => { throw new Error('Blocked resolver runner call in init-only test'); }),
    updateLimits: jest.fn(),
    getStatus: jest.fn(() => ({ active: 0, queued: 0 })),
    destroy: jest.fn(async () => {})
  };

  return jest.fn().mockImplementation(function StubMusicResolver(_config, _api, options = {}) {
    this.runner = runner;
    this.resolve = jest.fn(() => { throw new Error('Blocked provider request in init-only test'); });
    this.cancelAll = jest.fn(async () => true);
    this.destroy = jest.fn(async () => {});
    this.onProgress = options.onProgress || null;
  });
});

const enabled = process.env.LTTH_RUN_MUSIC_BOT_INIT_EONLY === '1';
const optInTest = enabled ? test : test.skip;
const mpvInitEnabled = process.env.LTTH_RUN_MUSIC_BOT_INIT_MPV_EONLY === '1'
  && process.platform === 'win32';
const mpvInitTest = mpvInitEnabled ? test : test.skip;

function isInside(root, target) {
  const relative = require('path').relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${require('path').sep}`) && !require('path').isAbsolute(relative));
}

function isOnE(target) {
  return /^E:[\\/]/i.test(require('path').resolve(target));
}

function pathArgument(value) {
  if (typeof value === 'string' || Buffer.isBuffer(value)) return require('path').resolve(String(value));
  if (value instanceof URL && value.protocol === 'file:') return require('path').resolve(require('url').fileURLToPath(value));
  return null;
}

function installWriteFence(root, writes) {
  const fs = require('fs');
  const fsp = require('fs/promises');
  const originals = [];
  const patch = (target, name, getPaths) => {
    const original = target[name];
    if (typeof original !== 'function') return;
    originals.push(() => { target[name] = original; });
    target[name] = function fencedWrite(...args) {
      const targetPaths = getPaths(args).filter((value) => value !== null && value !== undefined);
      targetPaths.forEach((targetPath) => {
        const absolute = pathArgument(targetPath);
        writes.push(absolute);
        if (!isInside(root, absolute)) {
          throw new Error(`Mutation outside isolated E: fixture denied: ${absolute}`);
        }
      });
      return original.apply(this, args);
    };
  };
  const firstPath = (args) => [args[0]];
  const bothPaths = (args) => [args[0], args[1]];
  [
    'mkdirSync', 'writeFileSync', 'appendFileSync', 'unlinkSync', 'rmSync', 'rmdirSync',
    'truncateSync', 'createWriteStream', 'mkdtempSync', 'chmodSync', 'chownSync', 'utimesSync'
  ].forEach((name) => patch(fs, name, firstPath));
  [
    'mkdir', 'writeFile', 'appendFile', 'unlink', 'rm', 'rmdir', 'truncate', 'mkdtemp',
    'chmod', 'chown', 'utimes'
  ].forEach((name) => patch(fsp, name, firstPath));
  ['renameSync', 'copyFileSync', 'linkSync', 'symlinkSync', 'cpSync'].forEach((name) => patch(fs, name, bothPaths));
  ['rename', 'copyFile', 'link', 'symlink', 'cp'].forEach((name) => patch(fsp, name, bothPaths));
  const writeFlags = (flags) => typeof flags === 'string'
    ? /[wax+]/i.test(flags)
    : Number.isInteger(flags) && Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND));
  patch(fs, 'openSync', (args) => writeFlags(args[1]) ? [args[0]] : []);
  patch(fsp, 'open', (args) => writeFlags(args[1]) ? [args[0]] : []);
  return () => originals.reverse().forEach((restore) => restore());
}

function installExternalSideEffectFence(calls, {
  allowIpcPath = null,
  allowKillPid = null
} = {}) {
  const childProcess = require('child_process');
  const networkModules = ['http', 'https', 'net', 'tls', 'dgram', 'dns'].map((name) => require(name));
  let validatedNetConnectPath = null;
  const targets = [
    [childProcess, 'spawn'], [childProcess, 'spawnSync'], [childProcess, 'exec'],
    [childProcess, 'execSync'], [childProcess, 'execFile'], [childProcess, 'execFileSync'],
    [childProcess, 'fork'],
    [networkModules[0], 'request'], [networkModules[0], 'get'],
    [networkModules[1], 'request'], [networkModules[1], 'get'],
    [networkModules[2], 'connect'], [networkModules[2], 'createConnection'],
    [networkModules[3], 'connect'], [networkModules[4], 'createSocket'],
    ...['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse'].map((name) => [networkModules[5], name])
  ];
  const originals = targets.filter(([target, name]) => typeof target[name] === 'function').map(([target, name]) => {
    const original = target[name];
    target[name] = function fencedExternalCall(...args) {
      if (target === networkModules[2] && ['connect', 'createConnection'].includes(name)) {
        const first = args[0];
        const ipcPath = typeof first === 'string'
          ? first
          : (first && typeof first === 'object' ? first.path || first.socketPath : null);
        if (typeof allowIpcPath === 'function' && allowIpcPath(ipcPath)) {
          calls.push(`allowed-local-ipc:${name}`);
          const previousPath = validatedNetConnectPath;
          validatedNetConnectPath = ipcPath;
          try {
            return original.apply(this, args);
          } finally {
            validatedNetConnectPath = previousPath;
          }
        }
      }
      calls.push(name);
      throw new Error(`External side effect denied in init-only test: ${name}`);
    };
    return () => { target[name] = original; };
  });
  const socketPrototype = networkModules[2].Socket?.prototype;
  if (typeof socketPrototype?.connect === 'function') {
    const originalConnect = socketPrototype.connect;
    socketPrototype.connect = function fencedSocketConnect(...args) {
      const first = args[0];
      const ipcPath = typeof first === 'string'
        ? first
        : (first && typeof first === 'object' ? first.path || first.socketPath : null);
      const nestedValidatedPath = validatedNetConnectPath;
      const ipcPathAllowed = Boolean(
        nestedValidatedPath
        && typeof allowIpcPath === 'function'
        && allowIpcPath(nestedValidatedPath)
      );
      if (nestedValidatedPath && ipcPathAllowed) {
        calls.push('allowed-local-ipc:Socket.connect');
        return originalConnect.apply(this, args);
      }
      calls.push('Socket.connect');
      const diagnostic = {
        name: 'Socket.connect',
        firstType: typeof first,
        firstValue: typeof first === 'string' ? first : null,
        firstPath: first && typeof first === 'object' ? (first.path || first.socketPath || null) : null,
        firstKeys: first && typeof first === 'object' ? Object.keys(first) : [],
        ipcPath,
        validatedNetConnectPath,
        isAllowedIpcPath: ipcPathAllowed
      };
      throw new Error(`External side effect denied in init-only test: ${JSON.stringify(diagnostic)}`);
    };
    originals.push(() => { socketPrototype.connect = originalConnect; });
  }
  const originalFetch = global.fetch;
  if (typeof originalFetch === 'function') {
    global.fetch = (..._args) => {
      calls.push('fetch');
      throw new Error('External side effect denied in init-only test: fetch');
    };
    originals.push(() => { global.fetch = originalFetch; });
  }
  const originalKill = process.kill;
  process.kill = (...args) => {
    if (typeof allowKillPid === 'function' && allowKillPid(args[0])) {
      calls.push(`allowed-owned-pid-kill:${args[0]}`);
      return originalKill.apply(process, args);
    }
    calls.push('process.kill');
    throw new Error('External side effect denied in init-only test: process.kill');
  };
  originals.push(() => { process.kill = originalKill; });
  return () => originals.reverse().forEach((restore) => restore());
}

describe('Music Bot init in an E-only fenced harness (opt-in)', () => {
  optInTest('uses real PluginAPI and in-memory DB while fencing runtime side effects', async () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const absoluteRoot = path.resolve(String(process.env.LTTH_RUN_MUSIC_BOT_INIT_EONLY_ROOT || ''));
    const tempRoot = path.resolve(os.tmpdir());
    if (!/^E:[\\/]/i.test(absoluteRoot)
      || !/^ltth-music-bot-init-eonly-/i.test(path.basename(absoluteRoot))
      || tempRoot.toLowerCase() !== absoluteRoot.toLowerCase()) {
      throw new Error(`Opt-in runner TEMP and unique fixture root must match on E:, got ${tempRoot} and ${absoluteRoot}`);
    }
    const root = path.join(absoluteRoot, 'fixture');

    const writes = [];
    const externalCalls = [];
    let restoreWrites = () => {};
    let restoreExternal = () => {};
    let database = null;
    let plugin = null;
    let configPathManager = null;
    let api = null;
    let initHooks = null;
    let findMarkedProcessesCalls = 0;
    let engineFactoryCalls = 0;
    const emitted = [];

    try {
      restoreExternal = installExternalSideEffectFence(externalCalls);
      restoreWrites = installWriteFence(absoluteRoot, writes);
      fs.mkdirSync(root, { recursive: true });

      const ConfigPathManager = require('../modules/config-path-manager');
      const DatabaseManager = require('../modules/database');
      const { PluginAPI } = require('../modules/plugin-loader');
      const MusicBotPlugin = require('../plugins/music-bot/main');
      const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
      const EventEmitter = require('events');

      configPathManager = new ConfigPathManager({
        appDir: path.join(absoluteRoot, 'app'),
        env: {
          LOCALAPPDATA: path.join(absoluteRoot, 'localappdata'),
          USERPROFILE: path.join(absoluteRoot, 'profile')
        }
      });
      database = new DatabaseManager(':memory:', null, { registerShutdownHandlers: false });
      const pluginLoader = new EventEmitter();
      const io = { emit: (event, payload) => emitted.push({ event, payload }) };
      const inertRegistry = {
        findMarkedProcesses: async () => {
          // Replaces the OS inventory. This never invokes the host process scanner.
          findMarkedProcessesCalls += 1;
          return [];
        },
        cleanupMarked: async () => ({ found: [], killed: [], remaining: [] })
      };
      api = new PluginAPI(
        'music-bot',
        path.join(absoluteRoot, 'plugin-source'),
        {},
        io,
        database,
        { debug() {}, info() {}, warn() {}, error() {} },
        pluginLoader,
        configPathManager,
        null,
        null,
        'eonly_init_fixture'
      );
      api.processRegistry = inertRegistry;
      api.engineFactory = () => {
        engineFactoryCalls += 1;
        throw new Error('Playback engine construction is forbidden in init-only test');
      };

      plugin = new MusicBotPlugin(api);
      initHooks = {
        routes: jest.fn(),
        sockets: jest.fn(),
        tiktok: jest.fn(),
        ytDlpProbe: jest.fn(async () => {}),
        mpvProbe: jest.fn(async () => {})
      };
      plugin._registerRoutes = initHooks.routes;
      plugin._registerSocketEvents = initHooks.sockets;
      plugin._registerTikTokEvents = initHooks.tiktok;
      plugin._ensureYtDlp = initHooks.ytDlpProbe;
      plugin._ensureMpv = initHooks.mpvProbe;

      await plugin.init();

      const expectedPluginDataDir = api.getPluginDataDir();
      expect(api).toBeInstanceOf(PluginAPI);
      expect(api.getDatabase()).toBe(database);
      expect(database.db.prepare('PRAGMA database_list').all()[0].file).toBe('');
      expect(plugin.pluginDataDir).toBe(expectedPluginDataDir);
      expect(plugin.cacheDir).toBe(path.join(expectedPluginDataDir, 'cache'));
      expect(isInside(absoluteRoot, plugin.pluginDataDir)).toBe(true);
      expect(isInside(absoluteRoot, plugin.cacheDir)).toBe(true);
      expect(plugin.pluginDataDir.split(path.sep)).not.toContain('profiles');
      // Current Music Bot data/cache storage is intentionally global across profiles.
      expect(expectedPluginDataDir).toBe(path.join(configPathManager.getPluginsDir(), 'music-bot', 'data'));
      expect(plugin.musicCatalog).toBeTruthy();
      expect(plugin.queueManager).toBeTruthy();
      expect(plugin.playlistStore).toBeTruthy();
      expect(plugin.mediaCache.cacheDir).toBe(plugin.cacheDir);
      expect(plugin.musicResolver).toBeInstanceOf(MusicResolver);
      expect(plugin.musicResolver.resolve).not.toHaveBeenCalled();
      expect(plugin.musicResolver.runner.run).not.toHaveBeenCalled();
      expect(initHooks.routes).toHaveBeenCalledTimes(1);
      expect(initHooks.sockets).toHaveBeenCalledTimes(1);
      expect(initHooks.tiktok).toHaveBeenCalledTimes(1);
      expect(initHooks.ytDlpProbe).toHaveBeenCalledTimes(1);
      expect(initHooks.mpvProbe).toHaveBeenCalledTimes(1);
      expect(api.registeredRoutes).toHaveLength(0);
      expect(api.registeredSocketEvents).toHaveLength(0);
      expect(api.registeredTikTokEvents).toHaveLength(0);
      expect(findMarkedProcessesCalls).toBe(1);
      expect(engineFactoryCalls).toBe(0);
      expect(externalCalls).toEqual([]);
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((writePath) => isInside(absoluteRoot, writePath))).toBe(true);
    } finally {
      try {
        if (plugin && !plugin._destroyed) await plugin.destroy();
      } finally {
        if (database && !database.isClosed) database.close();
        restoreExternal();
        restoreWrites();
        if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe('Music Bot init plus real Null-AO MPV in an E-only harness (opt-in)', () => {
  mpvInitTest('plays two local WAVs through plugin queue auto-advance with sequential owned MPV children', async () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const crypto = require('crypto');
    const childProcess = require('child_process');
    const nativeSpawn = childProcess.spawn;
    const absoluteRoot = path.resolve(String(process.env.LTTH_RUN_MUSIC_BOT_INIT_MPV_EONLY_ROOT || ''));
    const tempRoot = path.resolve(os.tmpdir());
    const expectedMainSha = '065A02BDB7F4775A62913DDF5A28FF49340C55989646B2472C6F23EDBDB9DCA8';
    const expectedQueueSha = 'DF5AB3BD0B4E21EE7DB494829C5422C723644028254C6CE4780B535601B0318E';
    const mpvPath = 'C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe';
    const expectedMpvSha = '7C87582006C31CF42C81747B7FEC598A88430D46A45FBFB24161EC6BC213B591';
    const sourceFiles = [
      path.join(__dirname, '../plugins/music-bot/main.js'),
      path.join(__dirname, '../plugins/music-bot/lib/queue-manager.js')
    ];
    const sourceHashes = () => sourceFiles.map((file) => crypto.createHash('sha256')
      .update(fs.readFileSync(file)).digest('hex').toUpperCase());
    const binaryHash = () => crypto.createHash('sha256')
      .update(fs.readFileSync(mpvPath)).digest('hex').toUpperCase();

    expect(absoluteRoot).toMatch(/^E:[\\/]+ltth-music-bot-init-mpv-eonly-[0-9a-f-]+$/i);
    expect(tempRoot.toLowerCase()).toBe(absoluteRoot.toLowerCase());
    expect(sourceHashes()).toEqual([expectedMainSha, expectedQueueSha]);
    expect(binaryHash()).toBe(expectedMpvSha);

    const fixtureRoot = path.join(absoluteRoot, 'fixture');
    const mpvConfigDir = path.join(absoluteRoot, 'mpv-config');
    const watchLaterDir = path.join(absoluteRoot, 'mpv-watch-later');
    const isolatedEnvironment = {
      PATH: process.env.PATH || '',
      PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
      SystemRoot: process.env.SystemRoot || process.env.WINDIR || '',
      WINDIR: process.env.WINDIR || process.env.SystemRoot || '',
      TEMP: path.join(absoluteRoot, 'temp'),
      TMP: path.join(absoluteRoot, 'temp'),
      USERPROFILE: path.join(absoluteRoot, 'user-profile'),
      HOMEDRIVE: 'E:',
      HOMEPATH: path.relative('E:\\', path.join(absoluteRoot, 'user-profile')),
      HOME: path.join(absoluteRoot, 'home'),
      APPDATA: path.join(absoluteRoot, 'appdata'),
      LOCALAPPDATA: path.join(absoluteRoot, 'localappdata')
    };
    const writePaths = [];
    const externalCalls = [];
    const processState = {
      child: null,
      pid: null,
      ipcPath: null,
      spawnedAt: null,
      closedAt: null,
      watchdog: null,
      spawnCalls: [],
      children: [],
      currentChildState: null,
      engineInstances: [],
      firstSpawnedAt: null,
      deadlineAt: null,
      ownedPids: new Set(),
      ipcCalls: 0
    };
    const isAllowedIpcPath = (ipcPath) => {
      const expectedPrefix = '\\\\.\\pipe\\ltth-soundbot-mpv-v1-';
      const allowed = typeof ipcPath === 'string'
        && ipcPath === processState.ipcPath
        && ipcPath.startsWith(expectedPrefix)
        && /^[0-9]+-[0-9a-f-]{36}$/i.test(ipcPath.slice(expectedPrefix.length))
        && processState.children.length >= 1
        && processState.children.length <= 2
        && processState.spawnCalls.length === processState.children.length
        && processState.currentChildState
        && processState.currentChildState.ipcPath === processState.ipcPath
        && processState.currentChildState.child === processState.child
        && processState.currentChildState.pid === processState.pid
        && Number.isInteger(processState.pid)
        && processState.ownedPids.has(processState.pid)
        && processState.child
        && processState.child.exitCode === null
        && processState.child.signalCode === null;
      if (allowed) processState.ipcCalls += 1;
      return allowed;
    };
    let restoreWrites = () => {};
    let restoreExternal = () => {};
    let database = null;
    let plugin = null;
    let engine = null;
    let child = null;
    let api = null;
    let configPathManager = null;
    let processRegistry = null;
    let findMarkedProcessesCalls = 0;
    let cleanupMarkedCalls = 0;
    let engineFactoryCalls = 0;
    let initHooks = null;
    let fixtureWavA = null;
    let fixtureWavB = null;
    const emitted = [];
    const playbackEvents = [];
    const pluginLogs = [];
    const wavBytes = (durationSeconds = 4.25, sampleRate = 8000) => {
      const bytesPerSample = 2;
      const sampleCount = Math.floor(durationSeconds * sampleRate);
      const dataLength = sampleCount * bytesPerSample;
      const wav = Buffer.alloc(44 + dataLength);
      wav.write('RIFF', 0, 'ascii');
      wav.writeUInt32LE(36 + dataLength, 4);
      wav.write('WAVE', 8, 'ascii');
      wav.write('fmt ', 12, 'ascii');
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(sampleRate, 24);
      wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
      wav.writeUInt16LE(bytesPerSample, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36, 'ascii');
      wav.writeUInt32LE(dataLength, 40);
      return wav;
    };
    const waitFor = async (predicate, timeoutMs, label) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      restoreExternal = installExternalSideEffectFence(externalCalls, {
        allowIpcPath: isAllowedIpcPath,
        allowKillPid: (pid) => processState.ownedPids.has(Number(pid))
      });
      restoreWrites = installWriteFence(absoluteRoot, writePaths);
      fs.mkdirSync(fixtureRoot, { recursive: true });
      fs.mkdirSync(isolatedEnvironment.TEMP, { recursive: true });
      fs.mkdirSync(mpvConfigDir, { recursive: true });
      fs.mkdirSync(watchLaterDir, { recursive: true });
      fixtureWavA = path.join(fixtureRoot, 'synthetic-a.wav');
      fixtureWavB = path.join(fixtureRoot, 'synthetic-b.wav');
      fs.writeFileSync(fixtureWavA, wavBytes());
      fs.writeFileSync(fixtureWavB, wavBytes());

      const ConfigPathManager = require('../modules/config-path-manager');
      const DatabaseManager = require('../modules/database');
      const { PluginAPI } = require('../modules/plugin-loader');
      const MusicBotPlugin = require('../plugins/music-bot/main');
      const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
      const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
      const EventEmitter = require('events');
      jest.clearAllMocks();

      configPathManager = new ConfigPathManager({
        appDir: path.join(absoluteRoot, 'app'),
        env: {
          LOCALAPPDATA: isolatedEnvironment.LOCALAPPDATA,
          USERPROFILE: isolatedEnvironment.USERPROFILE
        }
      });
      database = new DatabaseManager(':memory:', null, { registerShutdownHandlers: false });
      const pluginLoader = new EventEmitter();
      const io = { emit: (event, payload) => emitted.push({ event, payload }) };
      processRegistry = {
        register(pid) {
          if (!Number.isInteger(Number(pid))) throw new Error(`Unexpected MPV pid: ${pid}`);
          processState.ownedPids.add(Number(pid));
        },
        unregister(pid) { processState.ownedPids.delete(Number(pid)); },
        findMarkedProcesses: async () => {
          findMarkedProcessesCalls += 1;
          return [];
        },
        cleanupMarked: async () => {
          cleanupMarkedCalls += 1;
          return { found: [], killed: [], remaining: [] };
        }
      };
      api = new PluginAPI(
        'music-bot',
        path.join(absoluteRoot, 'plugin-source'),
        {},
        io,
        database,
        {
          debug: (message) => pluginLogs.push({ level: 'debug', message: String(message ?? '') }),
          info: (message) => pluginLogs.push({ level: 'info', message: String(message ?? '') }),
          warn: (message) => pluginLogs.push({ level: 'warn', message: String(message ?? '') }),
          error: (message) => pluginLogs.push({ level: 'error', message: String(message ?? '') })
        },
        pluginLoader,
        configPathManager,
        null,
        null,
        'eonly_init_mpv_fixture'
      );
      api.processRegistry = processRegistry;
      api.engineFactory = (context) => {
        engineFactoryCalls += 1;
        if (engineFactoryCalls > 2) throw new Error('At most two sequential PlaybackEngines may be constructed');
        const engineInstance = new PlaybackEngine(context.config, context.api, {
          processRegistry: context.processRegistry,
          environment: isolatedEnvironment,
          platform: 'win32',
          spawnImpl: (command, args, spawnOptions = {}) => {
            if (processState.spawnCalls.length >= 2 || processState.children.length >= 2) {
              throw new Error('At most two total MPV child processes are allowed');
            }
            if (processState.deadlineAt && Date.now() >= processState.deadlineAt - 1000) {
              throw new Error('Global MPV integration deadline leaves insufficient shutdown time');
            }
            const liveChildren = processState.children.filter(({ child: existingChild }) => (
              existingChild.exitCode === null && existingChild.signalCode === null
            ));
            if (liveChildren.length !== 0) throw new Error('Only one live MPV child is allowed at a time');
            const previousChildState = processState.children[processState.children.length - 1] || null;
            if (previousChildState && (
              !previousChildState.closedAt
              || previousChildState.child.exitCode !== 0
              || previousChildState.child.signalCode !== null
              || processState.ownedPids.has(previousChildState.pid)
            )) {
              throw new Error('Previous MPV child must close cleanly and release ownership before the next spawn');
            }
            if (processState.ownedPids.size !== 0) throw new Error('A prior MPV child is still owned');
            if (path.resolve(command).toLowerCase() !== path.resolve(mpvPath).toLowerCase()) {
              throw new Error(`Unexpected child executable: ${command}`);
            }
            const ipcArg = args.find((arg) => String(arg).startsWith('--input-ipc-server='));
            const ipcPath = ipcArg?.slice('--input-ipc-server='.length) || null;
            const ipcPrefix = '\\\\.\\pipe\\ltth-soundbot-mpv-v1-';
            if (!ipcPath?.startsWith(ipcPrefix)
              || !/^[0-9]+-[0-9a-f-]{36}$/i.test(ipcPath.slice(ipcPrefix.length))) {
              throw new Error('PlaybackEngine supplied an unexpected IPC endpoint');
            }
            if (!args.includes('--ao=null')) throw new Error('MPV Null-AO is required');
            if (args.some((arg) => /^https?:/i.test(String(arg)))) {
              throw new Error('Network media arguments are forbidden');
            }
            const env = spawnOptions.env || {};
            for (const key of ['TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA']) {
              if (!env[key] || !isInside(absoluteRoot, path.resolve(env[key]))) {
                throw new Error(`MPV ${key} is not rooted in the unique E: fixture`);
              }
            }
            if (Object.keys(env).some((key) => /^(http|https|all|no)_proxy$/i.test(key))) {
              throw new Error('Proxy variables must be absent from the MPV environment');
            }
            const safeArgs = [
              ...args,
              '--no-config',
              `--config-dir=${mpvConfigDir}`,
              `--watch-later-dir=${watchLaterDir}`,
              '--resume-playback=no',
              '--save-position-on-quit=no',
              '--load-scripts=no',
              '--autoload-files=no',
              '--cover-art-auto=no',
              '--volume=0'
            ];
            if (!safeArgs.includes('--no-config') || !safeArgs.includes('--volume=0')) {
              throw new Error('Required no-config/zero-volume MPV options are absent');
            }
            const safeOptions = {
              ...spawnOptions,
              shell: false,
              windowsHide: true,
              env
            };
            const childProcessHandle = nativeSpawn(mpvPath, safeArgs, safeOptions);
            processState.child = childProcessHandle;
            child = childProcessHandle;
            processState.ipcPath = ipcPath;
            processState.spawnCalls.push({ command, args: safeArgs, options: safeOptions });
            if (!Number.isInteger(childProcessHandle.pid)) {
              throw new Error('MPV child has no PID before IPC initialization');
            }
            const childState = {
              child: childProcessHandle,
              pid: childProcessHandle.pid,
              ipcPath,
              spawnedAt: null,
              closedAt: null,
              watchdog: null
            };
            processState.children.push(childState);
            processState.currentChildState = childState;
            processState.pid = childProcessHandle.pid;
            processState.ownedPids.add(childProcessHandle.pid);
            childProcessHandle.once('spawn', () => {
              processState.pid = childProcessHandle.pid;
              childState.spawnedAt = Date.now();
              processState.spawnedAt = childState.spawnedAt;
              if (processState.firstSpawnedAt === null) {
                processState.firstSpawnedAt = childState.spawnedAt;
                processState.deadlineAt = childState.spawnedAt + 15000;
              }
              if (Number.isInteger(processState.pid)) processState.ownedPids.add(processState.pid);
              const watchdogDelay = Math.max(1, processState.deadlineAt - Date.now() - 1000);
              childState.watchdog = setTimeout(() => {
                if (childProcessHandle.exitCode === null && childProcessHandle.signalCode === null) {
                  childProcessHandle.kill();
                }
              }, watchdogDelay);
              childState.watchdog.unref?.();
              processState.watchdog = childState.watchdog;
            });
            childProcessHandle.once('close', () => {
              childState.closedAt = Date.now();
              if (Number.isInteger(childState.pid)) processState.ownedPids.delete(childState.pid);
              processState.closedAt = childState.closedAt;
              if (childState.watchdog) clearTimeout(childState.watchdog);
              if (processState.watchdog === childState.watchdog) processState.watchdog = null;
              childState.watchdog = null;
            });
            return childProcessHandle;
          }
        });
        processState.engineInstances.push(engineInstance);
        return engineInstance;
      };

      plugin = new MusicBotPlugin(api);
      const loadConfig = plugin._loadConfig.bind(plugin);
      plugin._loadConfig = () => {
        loadConfig();
        plugin.config.playback = {
          ...plugin.config.playback,
          mpvPath,
          audioOutputDriver: 'null',
          defaultVolume: 0,
          crossfadeDuration: 0,
          normalization: { enabled: false }
        };
        plugin.config.audio = { ...plugin.config.audio, masterVolume: 0, sourceVolume: 0 };
        plugin.config.preCache = { ...plugin.config.preCache, enabled: false, lookahead: 0 };
        plugin.config.autoDJ = { ...plugin.config.autoDJ, enabled: false };
        plugin.config.safety = { locked: false, lockedAt: null, reason: null };
      };
      initHooks = {
        routes: jest.fn(),
        sockets: jest.fn(),
        tiktok: jest.fn(),
        ytDlpProbe: jest.fn(async () => { plugin._ytdlpAvailable = false; }),
        mpvProbe: jest.fn(async () => { plugin._mpvAvailable = true; })
      };
      plugin._registerRoutes = initHooks.routes;
      plugin._registerSocketEvents = initHooks.sockets;
      plugin._registerTikTokEvents = initHooks.tiktok;
      plugin._ensureYtDlp = initHooks.ytDlpProbe;
      plugin._ensureMpv = initHooks.mpvProbe;

      await plugin.init();
      expect(api).toBeInstanceOf(PluginAPI);
      expect(api.getDatabase()).toBe(database);
      expect(database.db.prepare('PRAGMA database_list').all()[0].file).toBe('');
      expect(isInside(absoluteRoot, api.getPluginDataDir())).toBe(true);
      expect(isInside(absoluteRoot, plugin.cacheDir)).toBe(true);
      expect(plugin.pluginDataDir.split(path.sep)).not.toContain('profiles');
      expect(plugin.config.preCache.enabled).toBe(false);
      expect(plugin.config.playback.defaultVolume).toBe(0);
      expect(plugin._mpvAvailable).toBe(true);
      expect(initHooks.ytDlpProbe).toHaveBeenCalledTimes(1);
      expect(initHooks.mpvProbe).toHaveBeenCalledTimes(1);
      expect(initHooks.routes).toHaveBeenCalledTimes(1);
      expect(initHooks.sockets).toHaveBeenCalledTimes(1);
      expect(initHooks.tiktok).toHaveBeenCalledTimes(1);
      expect(api.registeredRoutes).toHaveLength(0);
      expect(api.registeredSocketEvents).toHaveLength(0);
      expect(api.registeredTikTokEvents).toHaveLength(0);
      expect(findMarkedProcessesCalls).toBe(1);
      expect(cleanupMarkedCalls).toBe(0);
      expect(engineFactoryCalls).toBe(0);

      const firstAdded = plugin.queueManager.addSong({
        id: 'synthetic-track-a',
        title: 'Synthetic A',
        artist: 'Local Fixture',
        duration: 4.25,
        url: fixtureWavA,
        localPath: fixtureWavA,
        requestedBy: 'offline-test',
        source: 'local-test'
      });
      const secondAdded = plugin.queueManager.addSong({
        id: 'synthetic-track-b',
        title: 'Synthetic B',
        artist: 'Local Fixture',
        duration: 4.25,
        url: fixtureWavB,
        localPath: fixtureWavB,
        requestedBy: 'offline-test-b',
        source: 'local-test'
      });
      expect(firstAdded.success).toBe(true);
      expect(secondAdded.success).toBe(true);
      expect(plugin.queueManager.getQueue().map((track) => track.id)).toEqual([
        'synthetic-track-a', 'synthetic-track-b'
      ]);
      expect(isInside(absoluteRoot, firstAdded.song.localPath)).toBe(true);
      expect(isInside(absoluteRoot, secondAdded.song.localPath)).toBe(true);
      expect(plugin.musicResolver.resolve).not.toHaveBeenCalled();
      expect(plugin.musicResolver.runner.run).not.toHaveBeenCalled();

      plugin.playbackEngine.on('track-start', (track) => {
        playbackEvents.push({ type: 'start', id: track?.id, at: Date.now() });
      });
      plugin.playbackEngine.on('track-end', (info) => {
        playbackEvents.push({ type: 'end', id: info?.track?.id, reason: info?.reason, at: Date.now() });
      });
      const banPreflight = plugin.queueManager.getQueue().map((track) => ({
        id: track.id,
        requestedBy: track.requestedBy,
        trackKey: track.trackKey,
        rejection: plugin._checkBans(track, track.requestedBy)
      }));
      if (
        banPreflight.length !== 2
        || banPreflight.some((entry) => entry.rejection !== null)
        || banPreflight[0]?.id !== 'synthetic-track-a'
        || banPreflight[1]?.id !== 'synthetic-track-b'
      ) {
        throw new Error(`Queue ban preflight failed: ${JSON.stringify(banPreflight)}`);
      }
      const firstResult = await plugin._playNextFromQueue('offline-init-test');
      if (!firstResult?.success || firstResult.song?.id !== 'synthetic-track-a') {
        const failureState = {
          firstResult,
          queueIds: plugin.queueManager.getQueue().map((track) => track.id),
          currentId: plugin.queueManager.getCurrent()?.id || null,
          radioSupervisor: plugin.radioSupervisor?.getSnapshot?.() || null,
          playbackEvents,
          spawnCalls: processState.spawnCalls,
          queuePersistence: plugin.queueManager.getPersistenceStatus?.() || null,
          playbackDiagnostics: plugin.playbackEngine?.getDiagnostics?.() || null,
          playbackLastError: plugin.playbackEngine?.lastError || null,
          pluginLogs
        };
        throw new Error(`Initial queue playback failed: ${JSON.stringify(failureState)}`);
      }
      expect(firstResult).toEqual(expect.objectContaining({ success: true, song: expect.objectContaining({ id: 'synthetic-track-a' }) }));
      engine = plugin.playbackEngine._slots.A.engine;
      child = engine.process;
      expect(Number.isInteger(child?.pid)).toBe(true);
      expect(engine._ownedPids.has(child.pid)).toBe(true);
      expect(processState.spawnCalls).toHaveLength(1);
      expect(processState.spawnCalls[0].command).toBe(mpvPath);
      expect(processState.spawnCalls[0].args).toEqual(expect.arrayContaining([
        '--no-config', '--ao=null', '--volume=0', '--load-scripts=no', '--autoload-files=no'
      ]));
      expect(engine.ipcPath).toBe(processState.ipcPath);
      expect(engine.ipcPath).toMatch(/^\\\\\.\\pipe\\ltth-soundbot-mpv-v1-/i);
      expect(engine.config.audioOutputDriver).toBe('null');
      expect(engine.volume).toBe(0);

      const startedAt = Date.now();
      await waitFor(() => playbackEvents.some((event) => (
        event.type === 'end' && event.id === 'synthetic-track-a' && event.reason === 'ended'
      )), 6500, 'natural end of synthetic track A');
      try {
        await waitFor(() => playbackEvents.some((event) => (
          event.type === 'start' && event.id === 'synthetic-track-b'
        )), 2500, 'automatic start of synthetic track B');
      } catch (error) {
        const failureState = {
          waitError: { name: error?.name || null, message: error?.message || String(error) },
          playbackEvents,
          queueIds: plugin.queueManager.getQueue().map((track) => track.id),
          currentId: plugin.queueManager.getCurrent()?.id || null,
          radioSupervisor: plugin.radioSupervisor?.getSnapshot?.() || null,
          queuePersistence: plugin.queueManager.getPersistenceStatus?.() || null,
          engineDiagnostics: plugin.playbackEngine?.getDiagnostics?.() || null,
          pluginLogs
        };
        throw new Error(`Automatic track B start failed: ${JSON.stringify(failureState)}`);
      }
      expect(plugin.playbackEngine.getNowPlaying()).toEqual(expect.objectContaining({ id: 'synthetic-track-b' }));
      expect(playbackEvents.filter((event) => event.type === 'start').map((event) => event.id)).toEqual([
        'synthetic-track-a', 'synthetic-track-b'
      ]);
      expect(processState.children).toHaveLength(2);
      const [childAState, childBState] = processState.children;
      expect(childAState.closedAt).not.toBeNull();
      expect(childAState.child.exitCode).toBe(0);
      expect(childAState.child.signalCode).toBeNull();
      expect(childAState.pid).not.toBe(childBState.pid);
      expect(childAState.ipcPath).not.toBe(childBState.ipcPath);
      expect(childBState.spawnedAt).toBeGreaterThanOrEqual(childAState.closedAt);
      expect(processState.ownedPids.has(childAState.pid)).toBe(false);
      expect(processState.ownedPids.has(childBState.pid)).toBe(true);
      engine = plugin.playbackEngine._slots.A.engine;
      child = engine.process;
      expect(child).toBe(childBState.child);
      expect(engine._ownedPids.has(childBState.pid)).toBe(true);
      expect(processState.spawnCalls).toHaveLength(2);
      expect(processState.spawnCalls[1].command).toBe(mpvPath);
      expect(processState.spawnCalls[1].args).toEqual(expect.arrayContaining([
        '--no-config', '--ao=null', '--volume=0', '--load-scripts=no', '--autoload-files=no'
      ]));
      expect(engine.ipcPath).toBe(childBState.ipcPath);
      expect(engine.config.audioOutputDriver).toBe('null');
      expect(engine.volume).toBe(0);
      expect(Date.now()).toBeLessThan(processState.deadlineAt);
      expect(Date.now() - processState.firstSpawnedAt).toBeLessThan(15000);
      expect(Date.now() - startedAt).toBeLessThan(9000);
      expect(plugin._precacheTasks.size).toBe(0);
      expect(plugin.musicResolver.resolve).not.toHaveBeenCalled();
      expect(plugin.musicResolver.runner.run).not.toHaveBeenCalled();

      await plugin.destroy();
      expect(plugin._destroyed).toBe(true);
      expect(processState.children.map(({ child: ownedChild }) => ownedChild.exitCode)).toEqual([0, 0]);
      expect(processState.children.map(({ child: ownedChild }) => ownedChild.signalCode)).toEqual([null, null]);
      expect(processState.engineInstances).toHaveLength(2);
      expect(processState.engineInstances.every((engineInstance) => engineInstance.process === null)).toBe(true);
      expect(processState.engineInstances.every((engineInstance) => engineInstance._ownedPids.size === 0)).toBe(true);
      expect(processState.children[1].child).toBe(child);
      expect(processState.children[1].child.exitCode).toBe(0);
      expect(engine.process).toBeNull();
      expect(engine._ownedPids.size).toBe(0);
      expect(processState.ownedPids.size).toBe(0);
      expect(processState.children[1].closedAt).toBeLessThanOrEqual(processState.deadlineAt);
      expect(processState.children[1].closedAt - processState.firstSpawnedAt).toBeLessThan(15000);
      expect(findMarkedProcessesCalls).toBe(1);
      expect(cleanupMarkedCalls).toBe(0);
      expect(processState.spawnCalls).toHaveLength(2);
      expect(processState.ipcCalls).toBeGreaterThan(0);
      expect(externalCalls.length).toBeGreaterThan(0);
      expect(externalCalls.every((entry) => entry.startsWith('allowed-local-ipc:'))).toBe(true);
      expect(writePaths.length).toBeGreaterThan(0);
      expect(writePaths.every((writePath) => isInside(absoluteRoot, writePath))).toBe(true);
      expect(sourceHashes()).toEqual([expectedMainSha, expectedQueueSha]);
      expect(binaryHash()).toBe(expectedMpvSha);
      console.info(JSON.stringify({
        kind: 'music-bot-init-real-mpv-eonly',
        sourceHashes: sourceHashes(),
        mpvSha256: binaryHash(),
        executable: mpvPath,
        commands: processState.spawnCalls.map(({ command, args }) => ({ command, args })),
        children: processState.children.map((childState) => ({
          pid: childState.pid,
          ipcPath: childState.ipcPath,
          exitCode: childState.child.exitCode,
          signalCode: childState.child.signalCode,
          lifetimeMs: childState.closedAt - childState.spawnedAt
        })),
        totalLifetimeMs: processState.children[1].closedAt - processState.firstSpawnedAt,
        playbackEvents,
        ipcCallCount: processState.ipcCalls,
        allowedIpcCalls: externalCalls,
        hostInventoryCalls: findMarkedProcessesCalls,
        cleanupMarkedCalls,
        resolverCalls: plugin.musicResolver.resolve.mock.calls.length,
        resolverRunnerCalls: plugin.musicResolver.runner.run.mock.calls.length,
        writesInsideRoot: writePaths.length,
        preCacheTasks: plugin._precacheTasks.size
      }));
    } finally {
      try {
        if (plugin && !plugin._destroyed) await plugin.destroy().catch(() => {});
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) {
          child.kill();
          await new Promise((resolve) => child.once('close', resolve));
        }
        if (database && !database.isClosed) database.close();
        restoreExternal();
        restoreWrites();
        if (fs.existsSync(fixtureRoot)) fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    }
  }, 22000);
});
