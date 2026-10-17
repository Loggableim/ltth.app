const { EventEmitter } = require('events');
const MusicBotChildEnv = require('../plugins/music-bot/lib/child-process-env');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');

function sentinelEnvironment() {
  return {
    Path: 'C:\\safe\\bin',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    TEMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
    USERPROFILE: 'C:\\Users\\fixture',
    HOMEDRIVE: 'C:',
    HOMEPATH: '\\Users\\fixture',
    HOME: 'C:\\Users\\fixture',
    APPDATA: 'C:\\Users\\fixture\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\fixture\\AppData\\Local',
    http_proxy: 'http://lower-proxy.invalid:8080',
    HTTP_PROXY: 'http://upper-proxy.invalid:8080',
    https_proxy: 'https://lower-secure-proxy.invalid:8443',
    HTTPS_PROXY: 'https://secure-proxy.invalid:8443',
    all_proxy: 'socks5://socks-proxy.invalid:1080',
    ALL_PROXY: 'socks5://upper-socks-proxy.invalid:1080',
    no_proxy: 'localhost,.fixture.invalid',
    NO_PROXY: '.upper-conflict.invalid',
    LTTH_ADMIN_TOKEN: 'SENTINEL_ADMIN_SECRET',
    EULER_API_KEY: 'SENTINEL_PROVIDER_SECRET',
    YTDLP_PATH: 'SENTINEL_PARENT_SETTING',
    NODE_OPTIONS: '--require SENTINEL_NODE_INJECTION',
    NODE_PATH: 'SENTINEL_NODE_PATH',
    PYTHONPATH: 'SENTINEL_PYTHON_PATH',
    PYTHONHOME: 'SENTINEL_PYTHON_HOME',
    PYTHONUSERBASE: 'SENTINEL_PYTHON_USERBASE',
    LD_PRELOAD: 'SENTINEL_NATIVE_INJECTION',
    DYLD_INSERT_LIBRARIES: 'SENTINEL_MAC_INJECTION',
    NOT_ALLOWED_SECRET: 'SENTINEL_UNKNOWN_SECRET'
  };
}

function expectedMusicBotEnvironment() {
  return {
    PATH: 'C:\\safe\\bin',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    TEMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
    TMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
    USERPROFILE: 'C:\\Users\\fixture',
    HOMEDRIVE: 'C:',
    HOMEPATH: '\\Users\\fixture',
    HOME: 'C:\\Users\\fixture',
    APPDATA: 'C:\\Users\\fixture\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\fixture\\AppData\\Local',
    HTTP_PROXY: 'http://lower-proxy.invalid:8080',
    HTTPS_PROXY: 'https://lower-secure-proxy.invalid:8443',
    ALL_PROXY: 'socks5://socks-proxy.invalid:1080',
    no_proxy: 'localhost,.fixture.invalid'
  };
}

function fakeChild(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.closed = false;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => true);
  return child;
}

describe('Music Bot Windows child environment', () => {
  test('builds exact yt-dlp, MPV, and taskkill allowlists and rejects unknown child roles', () => {
    const source = sentinelEnvironment();
    const expected = expectedMusicBotEnvironment();

    const ytDlpEnv = MusicBotChildEnv.buildMusicBotChildEnv('yt-dlp', source, 'win32');
    const mpvEnv = MusicBotChildEnv.buildMusicBotChildEnv('mpv', source, 'win32');
    const taskkillEnv = MusicBotChildEnv.buildMusicBotChildEnv('taskkill', source, 'win32');
    const processProbeEnv = MusicBotChildEnv.buildMusicBotChildEnv('process-probe', source, 'win32');
    expect(ytDlpEnv).toEqual(expected);
    expect(mpvEnv).toEqual(expected);
    for (const childEnv of [ytDlpEnv, mpvEnv, taskkillEnv]) {
      for (const key of [
        'LTTH_ADMIN_TOKEN', 'EULER_API_KEY', 'YTDLP_PATH', 'NODE_OPTIONS', 'PYTHONPATH',
        'PYTHONHOME', 'PYTHONUSERBASE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'NOT_ALLOWED_SECRET'
      ]) {
        expect(childEnv).not.toHaveProperty(key);
      }
    }
    expect(taskkillEnv).toEqual({
      PATH: expected.PATH,
      PATHEXT: expected.PATHEXT,
      SystemRoot: expected.SystemRoot,
      WINDIR: expected.WINDIR,
      TEMP: expected.TEMP,
      TMP: expected.TMP
    });
    expect(taskkillEnv).not.toHaveProperty('no_proxy');
    expect(taskkillEnv).not.toHaveProperty('NO_PROXY');
    expect(processProbeEnv).toEqual({
      PATH: expected.PATH,
      PATHEXT: expected.PATHEXT,
      SystemRoot: expected.SystemRoot,
      WINDIR: expected.WINDIR,
      TEMP: expected.TEMP,
      TMP: expected.TMP
    });
    for (const key of ['USERPROFILE', 'APPDATA', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']) {
      expect(processProbeEnv).not.toHaveProperty(key);
    }
    expect(() => MusicBotChildEnv.buildMusicBotChildEnv('other', source, 'win32')).toThrow(/Unknown Music Bot child kind/);
  });

  test('accepts uppercase-only NO_PROXY and emits one canonical lowercase value for media children', () => {
    const source = { NO_PROXY: 'localhost,.private.fixture.invalid' };
    const expected = { no_proxy: 'localhost,.private.fixture.invalid' };

    expect(MusicBotChildEnv.buildMusicBotChildEnv('yt-dlp', source, 'win32')).toEqual(expected);
    expect(MusicBotChildEnv.buildMusicBotChildEnv('mpv', source, 'win32')).toEqual(expected);
  });

  test('retains current non-Windows child inheritance pending an OS audio environment audit', () => {
    expect(MusicBotChildEnv.buildMusicBotChildEnv('mpv', sentinelEnvironment(), 'linux')).toBeUndefined();
    expect(MusicBotChildEnv.buildMusicBotChildEnv('yt-dlp', sentinelEnvironment(), 'darwin')).toBeUndefined();
  });

  test('passes only allowlisted yt-dlp and taskkill environments to child-process stubs', async () => {
    const downloader = fakeChild(8111);
    const taskkill = new EventEmitter();
    const environment = sentinelEnvironment();
    const spawnImpl = jest.fn(() => downloader);
    const taskkillImpl = jest.fn(() => taskkill);
    const runner = new YtDlpRunner({
      platform: 'win32',
      environment,
      spawnImpl,
      taskkillImpl
    });
    const pending = runner.run('yt-dlp.exe', ['--ignore-config', 'https://fixture.invalid/track'], {
      deadline: Date.now() + 10000
    });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(spawnImpl).toHaveBeenCalledWith('yt-dlp.exe', expect.any(Array), expect.objectContaining({
      env: expectedMusicBotEnvironment()
    }));
    const destroying = runner.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    expect(taskkillImpl).toHaveBeenCalledWith('taskkill.exe', ['/PID', '8111', '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      env: {
        PATH: 'C:\\safe\\bin',
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        TEMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
        TMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp'
      }
    });
    taskkill.emit('close', 0);
    downloader.signalCode = 'SIGKILL';
    downloader.closed = true;
    downloader.emit('close', null, 'SIGKILL');
    await Promise.all([destroying, rejected]);
  });

  test('passes the exact allowlisted environment to the MPV child and its taskkill helper', async () => {
    const mpv = fakeChild(9222);
    const taskkill = new EventEmitter();
    const spawnImpl = jest.fn((executable) => {
      if (executable === 'taskkill.exe') {
        process.nextTick(() => taskkill.emit('close', 0));
        return taskkill;
      }
      return mpv;
    });
    const engine = new PlaybackEngine({ defaultVolume: 50, mpvPath: 'C:\\safe\\mpv.exe' }, { log: jest.fn() }, {
      platform: 'win32',
      environment: sentinelEnvironment(),
      spawnImpl
    });
    engine._connectSocket = jest.fn(async () => null);

    await engine._startProcess();
    expect(spawnImpl).toHaveBeenCalledWith('C:\\safe\\mpv.exe', expect.any(Array), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expectedMusicBotEnvironment()
    });

    await expect(engine._terminateProcess(mpv)).resolves.toBe(true);
    expect(spawnImpl).toHaveBeenLastCalledWith('taskkill.exe', ['/PID', '9222', '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      env: {
        PATH: 'C:\\safe\\bin',
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        TEMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp',
        TMP: 'C:\\Users\\fixture\\AppData\\Local\\Temp'
      }
    });
    engine._destroyed = true;
  });

  test('uses the allowlisted environment for the MPV audio-device probe', async () => {
    const probe = fakeChild(9333);
    const spawnImpl = jest.fn(() => {
      process.nextTick(() => probe.emit('close', 0));
      return probe;
    });
    const engine = new PlaybackEngine({ defaultVolume: 50, mpvPath: 'C:\\safe\\mpv.exe' }, { log: jest.fn() }, {
      platform: 'win32',
      environment: sentinelEnvironment(),
      spawnImpl
    });

    await expect(engine.getAvailableDevices()).resolves.toEqual([]);
    expect(spawnImpl).toHaveBeenCalledWith('C:\\safe\\mpv.exe', ['--audio-device=help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expectedMusicBotEnvironment()
    });
  });
});
