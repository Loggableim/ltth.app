'use strict';
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const YtDlpRunner = require('../plugins/music-bot/lib/yt-dlp-runner');

function flush() { return new Promise((resolve) => setImmediate(resolve)); }
async function until(predicate, label) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function makeChild(pid) {
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
function closeChild(child, code = 1) {
  child.exitCode = code;
  child.closed = true;
  child.emit('close', code, null);
}

describe('Music Bot destroy retry contracts', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-bot-destroy-retry-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('MediaCache retains late temp output through timeout and cleans it on retry after close', async () => {
    const cacheDir = path.join(root, 'cache');
    let child;
    let outputTemplate;
    const cache = new MediaCache({ cacheDir, downloadTimeoutMs: 5000 }, { log() {} }, {
      spawn: (_exe, args) => {
        child = makeChild(93001);
        outputTemplate = args[args.indexOf('--output') + 1];
        return child;
      },
      platform: 'linux',
      processKill: () => {}
    });
    cache.runner.childCloseTimeoutMs = 5;
    const download = cache.download('offline-owned', 'https://example.invalid/owned');
    await until(() => child, 'MediaCache child spawn');

    await expect(cache.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await expect(download).rejects.toThrow(/abort|destroyed/i);
    const tempFile = outputTemplate.replace('%(ext)s', 'webm');
    fs.writeFileSync(tempFile, 'late synthetic child write');
    expect(fs.existsSync(tempFile)).toBe(true);

    closeChild(child);
    await flush();
    expect(fs.existsSync(tempFile)).toBe(true);
    await cache.destroy();
    expect(fs.existsSync(tempFile)).toBe(false);
    await cache.destroy();
  });

  test('Resolver error-before-close keeps ownership until close and retry', async () => {
    const resolver = new MusicResolver({ searchTimeout: 5000 }, { log() {} });
    const runner = resolver.runner;
    let child;
    runner.platform = 'linux';
    runner.childCloseTimeoutMs = 5;
    runner.processKill = () => {};
    runner.spawnImpl = () => {
      child = makeChild(93002);
      return child;
    };
    resolver.cache.set('sentinel', { value: {}, timestamp: Date.now(), size: 1 });
    resolver.cacheSizeBytes = 1;
    const listener = () => {};
    resolver.on('probe', listener);
    const operation = runner.run('synthetic-ytdlp', ['offline-error-before-close']);
    await until(() => child, 'resolver child spawn');
    const childError = Object.assign(new Error('synthetic child I/O error'), { code: 'EIO' });
    child.emit('error', childError);
    await expect(operation).rejects.toBe(childError);
    expect(runner.getStatus().active).toBe(1);

    await expect(resolver.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    expect(resolver.cache.has('sentinel')).toBe(true);
    expect(resolver.listenerCount('probe')).toBe(1);

    closeChild(child);
    await flush();
    await resolver.destroy();
    expect(runner.getStatus().active).toBe(0);
    expect(resolver.cache.size).toBe(0);
    expect(resolver.cacheSizeBytes).toBe(0);
    expect(resolver.listenerCount('probe')).toBe(0);
  });

  test('injected runner without close lifecycle or status fails closed and preserves output', async () => {
    const cacheDir = path.join(root, 'unknown-runner-cache');
    let outputFile;
    const runner = {
      async run(_exe, args) {
        outputFile = args[args.indexOf('--output') + 1].replace('%(ext)s', 'webm');
        fs.writeFileSync(outputFile, 'synthetic unconfirmed output');
        return outputFile;
      },
      destroy: jest.fn(async () => {})
    };
    runner.childCloseTimeoutMs = 5;
    const cache = new MediaCache({ cacheDir }, { log() {} }, { runner });
    const download = cache.download('offline-unconfirmed', 'https://example.invalid/unconfirmed');
    await until(() => outputFile, 'unknown runner result');

    await expect(cache.destroy()).rejects.toMatchObject({ code: 'YTDLP_CLOSE_TIMEOUT' });
    await expect(download).rejects.toThrow(/abort|destroyed/i);
    expect(cache.get('offline-unconfirmed')).toBeNull();
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(runner.destroy).not.toHaveBeenCalled();
  });

  test('injected runner with idle status remains compatible and externally owned', async () => {
    const cacheDir = path.join(root, 'idle-runner-cache');
    const runner = {
      async run(_exe, args) {
        const outputFile = args[args.indexOf('--output') + 1].replace('%(ext)s', 'webm');
        fs.writeFileSync(outputFile, 'synthetic completed output');
        return outputFile;
      },
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const cache = new MediaCache({ cacheDir }, { log() {} }, { runner });
    const resultPath = await cache.download('offline-idle', 'https://example.invalid/idle');
    expect(fs.existsSync(resultPath)).toBe(true);
    await cache.destroy();
    await cache.destroy();
    expect(runner.destroy).not.toHaveBeenCalled();
  });
});
