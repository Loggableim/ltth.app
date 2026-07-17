const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaCache = require('../plugins/music-bot/lib/media-cache');

function createApi(dataDir) {
  return {
    getPluginDataDir: () => dataDir,
    log: jest.fn()
  };
}

function createSuccessfulSpawn(bytes = Buffer.from('audio')) {
  const spawn = jest.fn((_command, args) => {
    const child = new EventEmitter();
    child.pid = 1234;
    child.exitCode = null;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn(() => true);
    process.nextTick(() => {
      const outputTemplate = args[args.indexOf('--output') + 1];
      const outputPath = outputTemplate.replace('%(ext)s', 'webm');
      fs.writeFileSync(outputPath, bytes);
      child.stdout.emit('data', Buffer.from(`${outputPath}\n`));
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  });
  return spawn;
}

function createSequencedSpawn(outputs) {
  let invocation = 0;
  return jest.fn((_command, args) => {
    const output = outputs[Math.min(invocation, outputs.length - 1)];
    invocation += 1;
    const child = new EventEmitter();
    child.pid = 4000 + invocation;
    child.exitCode = null;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn(() => true);
    process.nextTick(() => {
      const outputTemplate = args[args.indexOf('--output') + 1];
      const outputPath = outputTemplate.replace('%(ext)s', output.extension);
      fs.writeFileSync(outputPath, Buffer.alloc(output.bytes, invocation));
      child.stdout.emit('data', Buffer.from(`${outputPath}\n`));
      child.exitCode = 0;
      child.emit('close', 0);
    });
    return child;
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('music-bot media cache', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-bot-cache-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('downloads a track key once and finds it from a new cache instance', async () => {
    const spawn = createSuccessfulSpawn();
    const cache = new MediaCache({}, createApi(dataDir), { spawn });

    const [first, second] = await Promise.all([
      cache.getOrDownload({ trackKey: 'youtube:abc', url: 'https://youtu.be/abc' }),
      cache.getOrDownload({ trackKey: 'youtube:abc', url: 'https://youtube.com/watch?v=abc' })
    ]);

    expect(first).toBe(second);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(first, 'utf8')).toBe('audio');

    const restarted = new MediaCache({}, createApi(dataDir), { spawn: jest.fn() });
    expect(restarted.get('youtube:abc')).toBe(first);
    await restarted.destroy();
    await cache.destroy();
  });

  it('uses an injected yt-dlp runner without taking ownership of it', async () => {
    const runner = {
      run: jest.fn(async (_executable, args) => {
        const outputTemplate = args[args.indexOf('--output') + 1];
        const outputPath = outputTemplate.replace('%(ext)s', 'opus');
        fs.writeFileSync(outputPath, 'runner-audio');
        return outputPath;
      }),
      destroy: jest.fn(async () => {}),
      getStatus: jest.fn(() => ({ active: 0, queued: 0 }))
    };
    const cache = new MediaCache({}, createApi(dataDir), { runner });

    const cachedPath = await cache.getOrDownload({
      trackKey: 'youtube:runner',
      url: 'https://youtu.be/runner'
    });

    expect(fs.readFileSync(cachedPath, 'utf8')).toBe('runner-audio');
    expect(runner.run).toHaveBeenCalledTimes(1);
    await cache.destroy();
    expect(runner.destroy).not.toHaveBeenCalled();
  });

  it('prunes expired files before least-recently-used files by actual bytes and preserves pins', async () => {
    let now = 1_000_000;
    const cache = new MediaCache({ cacheTTLDays: 1, maxCacheSizeMB: 0.00001 }, createApi(dataDir), {
      now: () => now,
      spawn: createSuccessfulSpawn(Buffer.alloc(6))
    });
    const expired = await cache.getOrDownload({ trackKey: 'youtube:expired', url: 'https://youtu.be/expired' });
    now += 2 * 24 * 60 * 60 * 1000;
    const pinned = await cache.getOrDownload({ trackKey: 'youtube:pinned', url: 'https://youtu.be/pinned' });
    cache.pin('youtube:pinned');
    now += 1;
    const recent = await cache.getOrDownload({ trackKey: 'youtube:recent', url: 'https://youtu.be/recent' });

    const result = await cache.prune();

    expect(fs.existsSync(expired)).toBe(false);
    expect(fs.existsSync(pinned)).toBe(true);
    expect(fs.existsSync(recent)).toBe(false);
    expect(result.bytes).toBe(6);
    await cache.destroy();
  });

  it('does not publish failed or aborted work', async () => {
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 2222;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      process.nextTick(() => {
        child.stderr.emit('data', Buffer.from('failed'));
        child.exitCode = 1;
        child.emit('close', 1);
      });
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), { spawn });

    await expect(cache.getOrDownload({
      trackKey: 'youtube:failed',
      url: 'https://youtu.be/failed'
    })).rejects.toThrow(/failed/i);
    expect(cache.get('youtube:failed')).toBeNull();
    await cache.destroy();
  });

  it('aborts an in-flight download without publishing a cache hit', async () => {
    const processKill = jest.fn();
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 2223;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), {
      spawn,
      platform: 'linux',
      processKill
    });
    const controller = new AbortController();
    const pending = cache.getOrDownload({
      trackKey: 'youtube:aborted',
      url: 'https://youtu.be/aborted'
    }, { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/i);
    expect(cache.get('youtube:aborted')).toBeNull();
    expect(processKill).toHaveBeenCalledWith(-2223, 'SIGKILL');
    expect(spawn.mock.results[0].value.kill).not.toHaveBeenCalled();
    await cache.destroy();
  });

  it('destroy settles even when a child process never closes', async () => {
    const spawn = jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 3333;
      child.exitCode = null;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = jest.fn(() => true);
      return child;
    });
    const cache = new MediaCache({}, createApi(dataDir), { spawn });
    const pending = cache.getOrDownload({
      trackKey: 'youtube:hung',
      url: 'https://youtu.be/hung'
    });

    await expect(Promise.race([
      cache.destroy().then(() => 'destroyed'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 250))
    ])).resolves.toBe('destroyed');
    await expect(pending).rejects.toThrow(/destroyed|aborted/i);
    expect(cache.get('youtube:hung')).toBeNull();
  });

  it('rejects instead of returning a path pruned by the configured byte limit', async () => {
    const cache = new MediaCache({ maxCacheSizeMB: 0.000001 }, createApi(dataDir), {
      spawn: createSuccessfulSpawn(Buffer.alloc(4))
    });
    const result = await Promise.race([
      cache.getOrDownload({
        trackKey: 'youtube:too-large',
        url: 'https://youtu.be/too-large'
      }).then(() => 'resolved', () => 'rejected'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 250))
    ]);

    expect(result).toBe('rejected');
    expect(cache.get('youtube:too-large')).toBeNull();
    await cache.destroy();
  });

  it('rejects an oversized download before pruning valid existing cache files', async () => {
    const spawn = createSequencedSpawn([
      { extension: 'webm', bytes: 4 },
      { extension: 'opus', bytes: 8 }
    ]);
    const cache = new MediaCache({ maxCacheSizeMB: 0.001 }, createApi(dataDir), { spawn });
    const existing = await cache.getOrDownload({
      trackKey: 'youtube:existing',
      url: 'https://youtu.be/existing'
    });
    cache.maxSizeMB = 5 / (1024 * 1024);

    await expect(cache.getOrDownload({
      trackKey: 'youtube:oversized',
      url: 'https://youtu.be/oversized'
    })).rejects.toThrow(/exceeds/i);

    expect(fs.existsSync(existing)).toBe(true);
    expect(cache.get('youtube:existing')).toBe(existing);
    expect(cache.get('youtube:oversized')).toBeNull();
    await cache.destroy();
  });

  it('keeps failed deletions in the real prune byte and file accounting', async () => {
    const cache = new MediaCache({ maxCacheSizeMB: 0.001 }, createApi(dataDir), {
      spawn: createSuccessfulSpawn(Buffer.alloc(6))
    });
    const victim = await cache.getOrDownload({
      trackKey: 'youtube:undeletable',
      url: 'https://youtu.be/undeletable'
    });
    cache.maxSizeMB = 1 / (1024 * 1024);
    const originalRmSync = fs.rmSync;
    const remove = jest.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (path.resolve(target) === path.resolve(victim)) {
        const error = new Error('locked');
        error.code = 'EACCES';
        throw error;
      }
      return originalRmSync(target, options);
    });

    let result;
    try {
      result = await cache.prune();
    } finally {
      remove.mockRestore();
    }

    expect(result).toEqual({ bytes: 6, files: 1 });
    expect(fs.existsSync(victim)).toBe(true);
    await cache.destroy();
  });

  it('removes a published file when the caller aborts while final prune is pending', async () => {
    const cache = new MediaCache({}, createApi(dataDir), { spawn: createSuccessfulSpawn() });
    const enteredPrune = deferred();
    const releasePrune = deferred();
    const realPrune = cache.prune.bind(cache);
    cache.prune = jest.fn(async (options) => {
      enteredPrune.resolve();
      await releasePrune.promise;
      return realPrune(options);
    });
    const controller = new AbortController();
    const pending = cache.getOrDownload({
      trackKey: 'youtube:late-abort',
      url: 'https://youtu.be/late-abort'
    }, { signal: controller.signal });
    await enteredPrune.promise;

    controller.abort();
    releasePrune.resolve();

    await expect(pending).rejects.toThrow(/aborted/i);
    expect(cache.get('youtube:late-abort')).toBeNull();
    await cache.destroy();
  });

  it('removes a published file when destroy races the final prune', async () => {
    const cache = new MediaCache({}, createApi(dataDir), { spawn: createSuccessfulSpawn() });
    const enteredPrune = deferred();
    const releasePrune = deferred();
    const realPrune = cache.prune.bind(cache);
    cache.prune = jest.fn(async (options) => {
      enteredPrune.resolve();
      await releasePrune.promise;
      return realPrune(options);
    });
    const pending = cache.getOrDownload({
      trackKey: 'youtube:late-destroy',
      url: 'https://youtu.be/late-destroy'
    });
    await enteredPrune.promise;

    const destroying = cache.destroy();
    releasePrune.resolve();

    await expect(pending).rejects.toThrow(/aborted|destroyed/i);
    await destroying;
    expect(cache.get('youtube:late-destroy')).toBeNull();
  });

  it('publishes one canonical file across concurrent cache instances and extensions', async () => {
    const spawn = createSequencedSpawn([
      { extension: 'webm', bytes: 4 },
      { extension: 'opus', bytes: 5 }
    ]);
    const firstCache = new MediaCache({}, createApi(dataDir), { spawn });
    const secondCache = new MediaCache({}, createApi(dataDir), { spawn });

    const [first, second] = await Promise.all([
      firstCache.getOrDownload({
        trackKey: 'youtube:shared-across-instances',
        url: 'https://youtu.be/shared-across-instances'
      }),
      secondCache.getOrDownload({
        trackKey: 'youtube:shared-across-instances',
        url: 'https://youtube.com/watch?v=shared-across-instances'
      })
    ]);

    expect(second).toBe(first);
    const hash = path.basename(first).slice(0, 64);
    const published = fs.readdirSync(path.dirname(first)).filter(
      (name) => name.startsWith(`${hash}.`) && !name.includes('.download-') && !name.endsWith('.lock')
    );
    expect(published).toHaveLength(1);
    await Promise.all([firstCache.destroy(), secondCache.destroy()]);
  });
});
